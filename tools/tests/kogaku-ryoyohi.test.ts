import { describe, expect, it } from 'vitest';
import {
  LIMIT_TABLES,
  MULTI_THRESHOLD_COUNT,
  annualPeriodOf,
  bracketsFor,
  calcKogakuRyoyohi,
  tableFor,
  toYm,
  type KogakuInput,
} from '@/lib/kogaku-ryoyohi';

/**
 * 高額療養費 自己負担限度額 計算機のテスト。
 *
 * 仕様: docs/features/kogaku-ryoyohi.md
 * 数値の出どころ: 厚生労働省「高額療養費制度の見直しについて（令和8年8月診療分から）」
 * https://www.mhlw.go.jp/content/001726232.pdf
 * （「患者負担割合及び高額療養費自己負担限度額（令和８年８月～令和９年７月）」の表）
 *
 * 見張っているのは4つ。
 * 1. 一次資料の金額どおりに計算されること（区分ごとの定額・1%加算の基準額）
 * 2. **診療月で改正前後が切り替わること**（2026年7月と8月で額が変わる）
 * 3. 多数回該当が「直近12か月に3回以上」で4回目から効くこと
 * 4. 年間上限（令和8年8月新設・8月〜翌年7月）が累計に効くこと
 */

/** 70歳未満・区分ウ・改正後の基本形 */
const base: KogakuInput = {
  ageGroup: 'under70',
  bracketId: 'u70-c',
  medicalCost: 1_000_000,
  pastCount: 0,
  treatmentMonth: '2026-08',
};

describe('限度額表の選択（診療月で決まる）', () => {
  it('2026年8月診療分から改正後の表が適用される', () => {
    expect(tableFor('2026-08').effectiveFrom).toBe('2026-08');
    expect(tableFor('2026-09').effectiveFrom).toBe('2026-08');
    expect(tableFor('2030-01').effectiveFrom).toBe('2026-08');
  });

  it('2026年7月以前の診療分は改正前の表が適用される（境界）', () => {
    expect(tableFor('2026-07').effectiveFrom).toBe('2018-08');
    expect(tableFor('2018-08').effectiveFrom).toBe('2018-08');
  });

  it('どの表よりも古い診療月でも落ちずに最も古い表を返す', () => {
    expect(tableFor('2000-01').effectiveFrom).toBe('2018-08');
  });

  it('LIMIT_TABLES は施行月の新しい順に並んでいる（検索がこの順序に依存する）', () => {
    const froms = LIMIT_TABLES.map((t) => t.effectiveFrom);
    expect([...froms].sort().reverse()).toEqual(froms);
  });

  it('区分の一覧は年齢区分で分かれる（70歳未満5区分・70歳以上6区分）', () => {
    expect(bracketsFor('under70', '2026-08').map((b) => b.id)).toEqual([
      'u70-a',
      'u70-b',
      'u70-c',
      'u70-d',
      'u70-e',
    ]);
    expect(bracketsFor('over70', '2026-08')).toHaveLength(6);
  });

  it('同じIDの区分が改正前後の両方の表にある（比較できること）', () => {
    const [after, before] = LIMIT_TABLES;
    for (const b of after.brackets) {
      expect(before.brackets.some((o) => o.id === b.id), `${b.id} が改正前の表に無い`).toBe(true);
    }
  });

  it('toYm はローカル暦月を返す（UTC解釈で前月にずれない）', () => {
    expect(toYm(new Date(2026, 7, 1))).toBe('2026-08');
    expect(toYm(new Date(2026, 6, 31))).toBe('2026-07');
    expect(toYm(new Date(2026, 11, 31))).toBe('2026-12');
  });
});

describe('月単位の限度額（改正後・70歳未満）', () => {
  it('区分ウ・医療費100万円 → 92,940円（厚労省の「約9.3万円」）', () => {
    // 85,800 + (1,000,000 − 286,000) × 1% = 85,800 + 7,140
    const r = calcKogakuRyoyohi(base);
    expect(r.monthlyLimit).toBe(92_940);
    expect(r.tableEffectiveFrom).toBe('2026-08');
  });

  it('区分ア・医療費100万円 → 定額270,300円（1%の基準額901,000円を超えた分だけ加算）', () => {
    const r = calcKogakuRyoyohi({ ...base, bracketId: 'u70-a' });
    expect(r.monthlyLimit).toBe(270_300 + Math.floor((1_000_000 - 901_000) / 100));
    expect(r.monthlyLimit).toBe(271_290);
  });

  it('区分イ・医療費100万円 → 179,100 + 4,030 = 183,130円', () => {
    const r = calcKogakuRyoyohi({ ...base, bracketId: 'u70-b' });
    expect(r.monthlyLimit).toBe(183_130);
  });

  it('区分エ・区分オは定額のみで、医療費が増えても限度額が変わらない', () => {
    for (const [bracketId, expected] of [
      ['u70-d', 61_500],
      ['u70-e', 36_900],
    ] as const) {
      expect(calcKogakuRyoyohi({ ...base, bracketId }).monthlyLimit).toBe(expected);
      expect(
        calcKogakuRyoyohi({ ...base, bracketId, medicalCost: 10_000_000 }).monthlyLimit,
      ).toBe(expected);
    }
  });

  it('1%加算は基準額ちょうどでは付かず、超えた分にだけ付く（境界値）', () => {
    const at = calcKogakuRyoyohi({ ...base, medicalCost: 286_000 });
    expect(at.monthlyLimit).toBe(85_800);

    const over = calcKogakuRyoyohi({ ...base, medicalCost: 286_100 });
    expect(over.monthlyLimit).toBe(85_801);

    const under = calcKogakuRyoyohi({ ...base, medicalCost: 285_900 });
    expect(under.monthlyLimit).toBe(85_800);
  });

  it('1%加算の円未満は切り捨てる（浮動小数で1円ずれない）', () => {
    // (286_050 − 286_000) × 1% = 0.5円 → 切り捨てて0円
    expect(calcKogakuRyoyohi({ ...base, medicalCost: 286_050 }).monthlyLimit).toBe(85_800);
    // 医療費3,530,000 は 0.01 を掛けると誤差が出やすい組み合わせ
    const r = calcKogakuRyoyohi({ ...base, medicalCost: 3_530_000 });
    expect(r.monthlyLimit).toBe(85_800 + 32_440);
  });
});

describe('改正前（〜令和8年7月診療分）の限度額', () => {
  it('区分ウ・医療費100万円 → 87,430円（80,100 + 1%）', () => {
    const r = calcKogakuRyoyohi({ ...base, treatmentMonth: '2026-07' });
    expect(r.monthlyLimit).toBe(87_430);
    expect(r.tableLabel).toContain('改正前');
  });

  it('同じ入力でも診療月が7月か8月かで限度額が変わる（譲らない要件）', () => {
    const july = calcKogakuRyoyohi({ ...base, treatmentMonth: '2026-07' });
    const august = calcKogakuRyoyohi({ ...base, treatmentMonth: '2026-08' });
    expect(august.monthlyLimit - july.monthlyLimit).toBe(5_510);
  });

  it('改正前の各区分の定額が一次資料どおり', () => {
    const july = { ...base, treatmentMonth: '2026-07', medicalCost: 100_000 };
    expect(calcKogakuRyoyohi({ ...july, bracketId: 'u70-d' }).monthlyLimit).toBe(57_600);
    expect(calcKogakuRyoyohi({ ...july, bracketId: 'u70-e' }).monthlyLimit).toBe(35_400);
  });

  it('改正前には年間上限の制度が無い（null で、月額だけが効く）', () => {
    const r = calcKogakuRyoyohi({ ...base, treatmentMonth: '2026-07' });
    expect(r.annualLimit).toBeNull();
    expect(r.annualRemaining).toBeNull();
    expect(r.annualReduction).toBe(0);
    expect(r.annualCapReached).toBe(false);
  });
});

describe('改正前後の比較', () => {
  it('改正後の月には「改正前はいくらだったか」が並ぶ', () => {
    const r = calcKogakuRyoyohi(base);
    expect(r.comparison?.direction).toBe('before');
    expect(r.comparison?.monthlyLimit).toBe(87_430);
    expect(r.comparison?.diff).toBe(5_510);
    expect(r.comparison?.annualLimit).toBeNull();
  });

  it('改正前の月には「改正後はいくらになるか」が並ぶ', () => {
    const r = calcKogakuRyoyohi({ ...base, treatmentMonth: '2026-07' });
    expect(r.comparison?.direction).toBe('after');
    expect(r.comparison?.monthlyLimit).toBe(92_940);
    expect(r.comparison?.diff).toBe(-5_510);
    expect(r.comparison?.annualLimit).toBe(530_000);
  });

  it('多数回該当のときは比較相手も多数回該当の額で並べる', () => {
    const r = calcKogakuRyoyohi({ ...base, pastCount: 3 });
    // 多数回該当の金額は据え置きなので、改正前後で同額になる
    expect(r.monthlyLimit).toBe(44_400);
    expect(r.comparison?.monthlyLimit).toBe(44_400);
    expect(r.comparison?.diff).toBe(0);
  });
});

describe('多数回該当（直近12か月に3回以上で4回目から）', () => {
  it('該当2回までは適用されない（境界）', () => {
    for (const pastCount of [0, 1, 2]) {
      const r = calcKogakuRyoyohi({ ...base, pastCount });
      expect(r.multiApplied).toBe(false);
      expect(r.monthlyLimit).toBe(92_940);
    }
  });

  it('該当3回で4回目から適用され、限度額が44,400円に下がる', () => {
    const r = calcKogakuRyoyohi({ ...base, pastCount: MULTI_THRESHOLD_COUNT });
    expect(r.multiApplied).toBe(true);
    expect(r.monthlyLimit).toBe(44_400);
  });

  it('4回以上でも同じ額（表の上限）', () => {
    expect(calcKogakuRyoyohi({ ...base, pastCount: 9 }).monthlyLimit).toBe(44_400);
  });

  it('多数回該当の金額は改正後も据え置き（各区分）', () => {
    const cases = [
      ['u70-a', 140_100],
      ['u70-b', 93_000],
      ['u70-c', 44_400],
      ['u70-d', 44_400],
      ['u70-e', 24_600],
    ] as const;
    for (const [bracketId, expected] of cases) {
      const after = calcKogakuRyoyohi({ ...base, bracketId, pastCount: 3 });
      const before = calcKogakuRyoyohi({
        ...base,
        bracketId,
        pastCount: 3,
        treatmentMonth: '2026-07',
      });
      expect(after.monthlyLimit, bracketId).toBe(expected);
      expect(before.monthlyLimit, bracketId).toBe(expected);
    }
  });

  it('多数回該当の無い区分（70歳以上・低所得I）では通常の限度額のまま', () => {
    const r = calcKogakuRyoyohi({
      ...base,
      ageGroup: 'over70',
      bracketId: 'o70-hikazei1',
      pastCount: 5,
    });
    expect(r.multiApplied).toBe(false);
    expect(r.multiLimit).toBeNull();
    expect(r.monthlyLimit).toBe(15_700);
  });
});

describe('窓口負担と払い戻し', () => {
  it('医療費100万円の3割は30万円。限度額との差が戻る', () => {
    const r = calcKogakuRyoyohi(base);
    expect(r.copay).toBe(300_000);
    expect(r.payment).toBe(92_940);
    expect(r.refund).toBe(300_000 - 92_940);
  });

  it('窓口負担が限度額に届かない月は払い戻しが無く、限度額まで払うわけでもない', () => {
    // 医療費10万円 → 3割で30,000円。限度額85,800円には届かない
    const r = calcKogakuRyoyohi({ ...base, medicalCost: 100_000 });
    expect(r.copay).toBe(30_000);
    expect(r.payment).toBe(30_000);
    expect(r.refund).toBe(0);
  });

  it('医療費0円なら払う額も戻る額も0円', () => {
    const r = calcKogakuRyoyohi({ ...base, medicalCost: 0 });
    expect(r.copay).toBe(0);
    expect(r.payment).toBe(0);
    expect(r.refund).toBe(0);
  });

  it('負の医療費・負の該当回数は0として扱う（壊れた入力で落とさない）', () => {
    const r = calcKogakuRyoyohi({ ...base, medicalCost: -500, pastCount: -3 });
    expect(r.copay).toBe(0);
    expect(r.multiApplied).toBe(false);
  });

  it('窓口負担割合は区分の既定値を使い、明示すれば上書きできる', () => {
    expect(calcKogakuRyoyohi(base).copayPercent).toBe(30);
    const over70 = calcKogakuRyoyohi({ ...base, ageGroup: 'over70', bracketId: 'o70-ippan' });
    expect(over70.copayPercent).toBe(20);
    const oneTenth = calcKogakuRyoyohi({
      ...base,
      ageGroup: 'over70',
      bracketId: 'o70-ippan',
      copayPercent: 10,
    });
    expect(oneTenth.copay).toBe(100_000);
  });
});

describe('年間上限（令和8年8月新設・8月〜翌年7月）', () => {
  it('対象期間は8月始まり。7月以前の診療月は前年8月始まりの期間に入る', () => {
    expect(annualPeriodOf('2026-08')).toEqual({
      from: '2026-08',
      to: '2027-07',
      label: '2026年8月〜2027年7月',
    });
    expect(annualPeriodOf('2027-07').from).toBe('2026-08');
    expect(annualPeriodOf('2027-08').from).toBe('2027-08');
  });

  it('区分ごとの年間上限が一次資料どおり', () => {
    const cases = [
      ['u70-a', 1_680_000],
      ['u70-b', 1_110_000],
      ['u70-c', 530_000],
      ['u70-d', 530_000],
      ['u70-e', 290_000],
    ] as const;
    for (const [bracketId, expected] of cases) {
      expect(calcKogakuRyoyohi({ ...base, bracketId }).annualLimit, bracketId).toBe(expected);
    }
  });

  it('累計が上限に届かないうちは月額上限どおりに払う', () => {
    const r = calcKogakuRyoyohi({ ...base, annualPaidBefore: 100_000 });
    expect(r.payment).toBe(92_940);
    expect(r.annualPaidTotal).toBe(192_940);
    expect(r.annualRemaining).toBe(530_000 - 192_940);
    expect(r.annualReduction).toBe(0);
    expect(r.annualCapReached).toBe(false);
  });

  it('年間上限をまたぐ月は、上限までの残りしか払わない', () => {
    // 残り 530,000 − 500,000 = 30,000円。月額上限92,940円より少ない
    const r = calcKogakuRyoyohi({ ...base, annualPaidBefore: 500_000 });
    expect(r.payment).toBe(30_000);
    expect(r.annualReduction).toBe(92_940 - 30_000);
    expect(r.annualPaidTotal).toBe(530_000);
    expect(r.annualRemaining).toBe(0);
    expect(r.annualCapReached).toBe(true);
    expect(r.refund).toBe(300_000 - 30_000);
  });

  it('年間上限に達したあとは、その年はもう払わない', () => {
    const r = calcKogakuRyoyohi({ ...base, annualPaidBefore: 530_000 });
    expect(r.payment).toBe(0);
    expect(r.refund).toBe(r.copay);
    expect(r.annualRemaining).toBe(0);
    expect(r.annualCapReached).toBe(true);
  });

  it('年収約200万円以下と確認できた場合は年間上限が41万円に下がる（※5・※6）', () => {
    const normal = calcKogakuRyoyohi({ ...base, bracketId: 'u70-d' });
    const low = calcKogakuRyoyohi({ ...base, bracketId: 'u70-d', lowIncomeConfirmed: true });
    expect(normal.annualLimit).toBe(530_000);
    expect(low.annualLimit).toBe(410_000);
  });

  it('軽減後の年間上限を持たない区分では lowIncomeConfirmed が効かない', () => {
    const r = calcKogakuRyoyohi({ ...base, bracketId: 'u70-c', lowIncomeConfirmed: true });
    expect(r.annualLimit).toBe(530_000);
  });
});

describe('70歳以上', () => {
  const over70: KogakuInput = {
    ageGroup: 'over70',
    bracketId: 'o70-ippan',
    medicalCost: 300_000,
    pastCount: 0,
    treatmentMonth: '2026-08',
  };

  it('入院を含む月は世帯単位の限度額（一般 61,500円）', () => {
    const r = calcKogakuRyoyohi(over70);
    expect(r.outpatientApplied).toBe(false);
    expect(r.monthlyLimit).toBe(61_500);
  });

  it('外来のみの月は外来特例（個人ごと 22,000円）が効く', () => {
    const r = calcKogakuRyoyohi({ ...over70, outpatientOnly: true });
    expect(r.outpatientApplied).toBe(true);
    expect(r.monthlyLimit).toBe(22_000);
    // 外来特例の年間上限は216,000円（世帯単位の530,000円ではない）
    expect(r.annualLimit).toBe(216_000);
  });

  it('外来特例は改正で18,000円→22,000円、年14.4万円→21.6万円', () => {
    const before = calcKogakuRyoyohi({
      ...over70,
      outpatientOnly: true,
      treatmentMonth: '2026-07',
    });
    expect(before.monthlyLimit).toBe(18_000);
    expect(before.annualLimit).toBe(144_000);
  });

  it('外来特例のある区分では、多数回該当より外来の額が優先される', () => {
    const r = calcKogakuRyoyohi({ ...over70, outpatientOnly: true, pastCount: 5 });
    expect(r.monthlyLimit).toBe(22_000);
    expect(r.multiLimit).toBe(44_400);
  });

  it('現役並みは70歳未満と同じ計算式（医療費100万円で92,940円）', () => {
    const r = calcKogakuRyoyohi({
      ...over70,
      bracketId: 'o70-geneki1',
      medicalCost: 1_000_000,
    });
    expect(r.monthlyLimit).toBe(92_940);
    expect(r.copayPercent).toBe(30);
  });

  it('現役並みには外来特例が無いので、外来のみでも世帯単位の限度額になる', () => {
    const r = calcKogakuRyoyohi({
      ...over70,
      bracketId: 'o70-geneki1',
      medicalCost: 1_000_000,
      outpatientOnly: true,
    });
    expect(r.outpatientApplied).toBe(false);
    expect(r.monthlyLimit).toBe(92_940);
  });

  it('住民税非課税（低所得II）は25,700円・多数回24,600円・年間29万円に改定された', () => {
    const r = calcKogakuRyoyohi({ ...over70, bracketId: 'o70-hikazei2' });
    expect(r.monthlyLimit).toBe(25_700);
    expect(r.multiLimit).toBe(24_600);
    expect(r.annualLimit).toBe(290_000);

    // 改正前は24,600円で、多数回該当の設定が無かった
    const before = calcKogakuRyoyohi({
      ...over70,
      bracketId: 'o70-hikazei2',
      treatmentMonth: '2026-07',
    });
    expect(before.monthlyLimit).toBe(24_600);
    expect(before.multiLimit).toBeNull();
  });

  it('所得が一定以下（低所得I）は15,700円・年間18万円・外来8,000円', () => {
    const r = calcKogakuRyoyohi({ ...over70, bracketId: 'o70-hikazei1' });
    expect(r.monthlyLimit).toBe(15_700);
    expect(r.annualLimit).toBe(180_000);
    expect(
      calcKogakuRyoyohi({ ...over70, bracketId: 'o70-hikazei1', outpatientOnly: true })
        .monthlyLimit,
    ).toBe(8_000);
  });
});

describe('入力の検証', () => {
  it('年齢区分と噛み合わない所得区分は投げる（選択肢と表の食い違いを黙らせない）', () => {
    expect(() => calcKogakuRyoyohi({ ...base, ageGroup: 'over70' })).toThrow(/所得区分/);
    expect(() => calcKogakuRyoyohi({ ...base, bracketId: 'u70-x' })).toThrow(/所得区分/);
  });

  it('診療月を省略すると当月で判定する', () => {
    const r = calcKogakuRyoyohi({ ...base, treatmentMonth: undefined });
    expect(r.treatmentMonth).toBe(toYm(new Date()));
  });
});
