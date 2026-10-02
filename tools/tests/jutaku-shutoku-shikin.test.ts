import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FILING_NOTE,
  FIRST_SETTLEMENT_NOTE,
  INCOME_LIMITS,
  LATE_MOVE_IN_NOTE,
  LIMITS,
  MEASURE,
  NEW_BUILD_NOTE,
  SETTLEMENT_AGE_NOTE,
  SETTLEMENT_IRREVOCABLE_NOTE,
  adultBirthCutoff,
  deadlines,
  eligibility,
  failureMessage,
  incomeLimitFor,
  isAdultOnJan1,
  periodMessage,
  periodStatus,
  rekinenAfterExclusion,
  settlementAfterExclusion,
  taxAfterExclusion,
  type EligibilityInput,
} from '@/lib/jutaku-shutoku-shikin';

/**
 * 住宅取得等資金の贈与税 非課税 判定・計算機のテスト。
 *
 * 仕様: docs/features/jutaku-shutoku-shikin-hikazei.md（「テスト」の節の期待値をそのまま置いている）
 */

const base: EligibilityInput = {
  giftYear: 2026,
  amount: 15_000_000,
  houseKind: 'new',
  energy: 'yes',
  floorArea: 100,
  adultOnJan1: true,
  income: 6_000_000,
  lineal: true,
  acquireAndMoveInByMar15: true,
  mostlyResidential: true,
  quakeOk: true,
  notUsedBefore: true,
  notFromRelated: true,
  domicileInJapan: true,
};
const judge = (patch: Partial<EligibilityInput>) => eligibility({ ...base, ...patch }, 'undecided');

describe('制度データ（No.4508）', () => {
  it('限度額と適用期間', () => {
    expect(LIMITS.energySaving).toBe(10_000_000);
    expect(LIMITS.other).toBe(5_000_000);
    expect(MEASURE.from).toBe('2024-01-01');
    expect(MEASURE.to).toBe('2026-12-31');
    expect(MEASURE.extension).toBe('undecided');
  });
});

describe('eligibility：限度額', () => {
  it('省エネ等住宅は 1,000 万円、それ以外は 500 万円', () => {
    expect(judge({}).limit).toBe(10_000_000);
    expect(judge({ energy: 'no' }).limit).toBe(5_000_000);
  });

  it('「わからない」は 500 万円で計算し、性能証明書があれば +500 万円を添える', () => {
    const r = judge({ energy: 'unknown' });
    expect(r.limit).toBe(5_000_000);
    expect(r.certificateBonus).toBe(5_000_000);
    expect(judge({ energy: 'yes' }).certificateBonus).toBe(0);
  });

  it('要件を満たさないときは限度額 0', () => {
    expect(judge({ lineal: false }).limit).toBe(0);
  });
});

describe('eligibility：床面積の境界（40㎡・50㎡・240㎡）', () => {
  it('40㎡は可、39.99㎡は不可', () => {
    expect(judge({ floorArea: 40 }).ok).toBe(true);
    expect(judge({ floorArea: 39.99 }).failures).toEqual(['area-small']);
  });

  it('240㎡は可、240.01㎡は不可', () => {
    expect(judge({ floorArea: 240 }).ok).toBe(true);
    expect(judge({ floorArea: 240.01 }).failures).toEqual(['area-large']);
  });

  it('40 以上 50 未満は所得の閾値が 1,000 万円、50㎡からは 2,000 万円', () => {
    expect(incomeLimitFor(40)).toBe(INCOME_LIMITS.small);
    expect(incomeLimitFor(49.99)).toBe(10_000_000);
    expect(incomeLimitFor(50)).toBe(20_000_000);
    expect(incomeLimitFor(240)).toBe(20_000_000);
  });
});

describe('eligibility：所得の境界（2,000 万・1,000 万）', () => {
  it('50㎡以上は 2,000 万円以下で可', () => {
    expect(judge({ income: 20_000_000 }).ok).toBe(true);
    expect(judge({ income: 20_000_001 }).failures).toEqual(['income']);
  });

  it('40 以上 50 未満は 1,000 万円以下で可', () => {
    expect(judge({ floorArea: 45, income: 10_000_000 }).ok).toBe(true);
    expect(judge({ floorArea: 45, income: 10_000_001 }).failures).toEqual(['income']);
    expect(judge({ floorArea: 50, income: 10_000_001 }).ok).toBe(true);
  });
});

describe('受贈者の年齢（贈与の年の 1 月 1 日に 18 歳以上）', () => {
  it('2026 年の贈与は 2008-01-02 以前生まれまで（1 月 2 日生まれは前日の 1 月 1 日に 18 歳）', () => {
    expect(adultBirthCutoff(2026)).toEqual({ year: 2008, month: 1, day: 2 });
    expect(isAdultOnJan1('2008-01-01', 2026)).toBe(true);
    expect(isAdultOnJan1('2008-01-02', 2026)).toBe(true);
    expect(isAdultOnJan1('2008-01-03', 2026)).toBe(false);
  });

  it('18 歳未満は名指しで落とす', () => {
    const r = judge({ adultOnJan1: false });
    expect(r.failures).toEqual(['age']);
    expect(failureMessage('age', { giftYear: 2026, incomeLimit: r.incomeLimit })).toBe('受贈者が2026年1月1日に18歳未満です');
  });
});

describe('eligibility：その他の要件を名指しで返す', () => {
  it('満たさない要件をすべて並べる', () => {
    const r = judge({ lineal: false, floorArea: 300, acquireAndMoveInByMar15: false });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(['lineal', 'area-large', 'move-in']);
  });

  it('翌年 3 月 15 日までの取得・居住は、取得（引渡し）も含めて書く', () => {
    expect(failureMessage('move-in', { giftYear: 2026, incomeLimit: 0 })).toBe(
      '2027年3月15日までに取得・増改築を済ませ（建売・分譲・中古は引渡し、注文住宅の新築は上棟まで）、住むことができません',
    );
  });

  it('床面積 240㎡超の文言', () => {
    expect(failureMessage('area-large', { giftYear: 2026, incomeLimit: 0 })).toBe('床面積が240㎡を超えています');
  });

  it('耐震の要件は既存住宅だけに効く', () => {
    expect(judge({ houseKind: 'new', quakeOk: false }).ok).toBe(true);
    expect(judge({ houseKind: 'existing', quakeOk: false }).failures).toEqual(['quake']);
  });

  it('過去（2009〜2023年分）に適用を受けた・親族などから取得・国内に住所が無い は名指しで落とす（#311 レビュー）', () => {
    expect(judge({ notUsedBefore: false }).failures).toEqual(['used-before']);
    expect(judge({ notFromRelated: false }).failures).toEqual(['related-party']);
    expect(judge({ domicileInJapan: false }).failures).toEqual(['domicile']);
    const r = judge({ notUsedBefore: false, notFromRelated: false, domicileInJapan: false });
    expect(r.ok).toBe(false);
    expect(r.limit).toBe(0);
    const ctx = { giftYear: 2026, incomeLimit: r.incomeLimit };
    expect(failureMessage('used-before', ctx)).toContain('2009〜2023年分');
    expect(failureMessage('related-party', ctx)).toContain('親族など特別の関係がある人');
    expect(failureMessage('domicile', ctx)).toContain('日本国内に住所がありません');
  });

  it('居住用が 2 分の 1 未満', () => {
    expect(judge({ mostlyResidential: false }).failures).toEqual(['residential']);
  });
});

describe('計算例（仕様書「テスト」）', () => {
  it('1,500 万円・省エネ等住宅・暦年 → 課税対象 390 万円・特例税率 15%−10 万円で 48.5 万円', () => {
    const r = rekinenAfterExclusion(15_000_000, judge({}).limit);
    expect(r.exclusion).toBe(10_000_000);
    expect(r.afterExclusion).toBe(5_000_000);
    expect(r.basicDeduction).toBe(1_100_000);
    expect(r.taxable).toBe(3_900_000);
    expect(r.bracket).toEqual({ upTo: 4_000_000, rate: 0.15, deduction: 100_000 });
    expect(r.tax).toBe(485_000);
    expect(taxAfterExclusion(15_000_000, 10_000_000, 'rekinen')).toBe(485_000);
  });

  it('同じ 1,500 万円を相続時精算課税・初めて → 税額 0・残りの特別控除 2,110 万円', () => {
    const r = settlementAfterExclusion(15_000_000, 10_000_000);
    expect(r.settlement.afterBasic).toBe(3_900_000);
    expect(r.tax).toBe(0);
    expect(r.settlement.specialDeductionLeft).toBe(21_100_000);
  });

  it('前年までに特別控除を 2,400 万円使っていれば、残り 100 万円で (390 − 100) × 20% = 58 万円', () => {
    const r = settlementAfterExclusion(15_000_000, 10_000_000, 24_000_000);
    expect(r.settlement.specialDeductionUsed).toBe(1_000_000);
    expect(r.settlement.taxable).toBe(2_900_000);
    expect(r.tax).toBe(580_000);
    expect(taxAfterExclusion(15_000_000, 10_000_000, 'seisan', 24_000_000)).toBe(580_000);
  });

  it('贈与額が限度額以下なら非課税分は贈与額まで、税額 0', () => {
    const r = rekinenAfterExclusion(8_000_000, 10_000_000);
    expect(r.exclusion).toBe(8_000_000);
    expect(r.tax).toBe(0);
  });

  it('要件を満たさない（限度額 0）・一般税率のときは非課税分なしで一般税率', () => {
    // 500 万円 − 110 万円 = 390 万円 → 一般税率 20%−25 万円 = 53 万円（No.4408）
    expect(rekinenAfterExclusion(5_000_000, 0, { special: false }).tax).toBe(530_000);
    // 特例税率なら 15%−10 万円 = 48.5 万円
    expect(rekinenAfterExclusion(5_000_000, 0).tax).toBe(485_000);
  });
});

describe('適用期間と extension（2027 年の贈与日 × 3 状態）', () => {
  it('2024〜2026 年は期間内、2023 年以前は対象外', () => {
    expect(periodStatus(2024, 'undecided')).toBe('in');
    expect(periodStatus(2026, 'undecided')).toBe('in');
    expect(periodStatus(2023, 'undecided')).toBe('before');
    expect(periodMessage('in')).toBeNull();
  });

  it('undecided：大綱で決まる見込み、と出す。判定は使えない', () => {
    expect(periodStatus(2027, 'undecided')).toBe('after-undecided');
    expect(periodMessage('after-undecided')).toContain('延長は2026年12月の税制改正大綱で決まる見込みです。決まったら更新します。');
    expect(eligibility({ ...base, giftYear: 2027 }, 'undecided').failures).toEqual(['period']);
  });

  it('extended：2027 年の贈与も対象として計算する', () => {
    expect(periodStatus(2027, 'extended')).toBe('after-extended');
    expect(periodMessage('after-extended')).toContain('延長された特例の対象');
    expect(eligibility({ ...base, giftYear: 2027 }, 'extended').ok).toBe(true);
  });

  it('ended：2026 年中の贈与で終了したと出す', () => {
    expect(periodStatus(2027, 'ended')).toBe('after-ended');
    expect(periodMessage('after-ended')).toContain('2026年12月31日までの贈与で終了しました');
    expect(eligibility({ ...base, giftYear: 2027 }, 'ended').ok).toBe(false);
  });

  it('延長の予測を書かない', () => {
    for (const s of ['after-undecided', 'after-extended', 'after-ended'] as const) {
      expect(periodMessage(s)).not.toMatch(/延長される見通し|延長されるでしょう|終了する見通し/);
    }
  });
});

describe('deadlines', () => {
  it('2026 年の贈与：取得・居住は 2027-03-15、申告は 2027-02-01〜03-15（月曜なので繰り下げなし）', () => {
    const d = deadlines(2026);
    expect(d.moveIn).toBe('2027-03-15');
    expect(d.filingFrom).toBe('2027-02-01');
    expect(d.filingTo.due).toBe('2027-03-15');
    expect(d.filingTo.shiftedBecause).toBeNull();
  });

  it('2025 年の贈与：申告期限の 2026-03-15 は日曜なので 03-16 に繰り下がる（国税通則法 10 条 2 項）', () => {
    const d = deadlines(2025);
    expect(d.moveIn).toBe('2026-03-15');
    expect(d.filingTo.due).toBe('2026-03-16');
  });
});

describe('画面の文言', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const page = read('../app/jutaku-shutoku-shikin/page.tsx');
  const calc = read('../app/jutaku-shutoku-shikin/Calculator.tsx');

  it('70 条の 3：贈与者が 60 歳未満でも相続時精算課税の列を出す旨を脚注に書く（年齢は入力に無い）', () => {
    expect(SETTLEMENT_AGE_NOTE).toContain('60歳未満でも相続時精算課税を選べます');
    expect(SETTLEMENT_AGE_NOTE).toContain('70条の3');
    expect(calc).toContain('SETTLEMENT_AGE_NOTE');
    expect(calc).not.toMatch(/贈与者の年齢/);
  });

  it('相続時精算課税の 20%・撤回不可の注記を出す', () => {
    expect(SETTLEMENT_IRREVOCABLE_NOTE).toContain('一律20%');
    expect(SETTLEMENT_IRREVOCABLE_NOTE).toContain('暦年課税に戻せません');
    expect(calc).toContain('SETTLEMENT_IRREVOCABLE_NOTE');
  });

  it('注文住宅は上棟まで・翌年12月31日までに住まないと修正申告、の注記を出す', () => {
    expect(NEW_BUILD_NOTE).toContain('上棟');
    expect(LATE_MOVE_IN_NOTE).toContain('翌年12月31日');
    expect(LATE_MOVE_IN_NOTE).toContain('修正申告');
    expect(calc).toContain('NEW_BUILD_NOTE');
    expect(calc).toContain('LATE_MOVE_IN_NOTE');
  });

  it('要件の表に、使えない 3 つ（過去の適用・親族などからの取得・国内の住所）を書く', () => {
    expect(page).toContain('2009〜2023年分');
    expect(page).toMatch(/親族など特別の関係がある人/);
    expect(page).toContain('日本国内に住所');
  });

  it('特別控除を初めて使う前提のときの 1 行と、税額 0 でも申告が要る 1 行を出す', () => {
    expect(FIRST_SETTLEMENT_NOTE).toContain('初めて相続時精算課税を使う前提');
    expect(FILING_NOTE).toContain('税額が0円でも');
    expect(calc).toContain('FIRST_SETTLEMENT_NOTE');
    expect(calc).toContain('FILING_NOTE');
  });

  it('どちらの方式が有利かを断定しない・延長を予測しない', () => {
    for (const src of [page, calc]) {
      expect(src).not.toMatch(/が有利です|がお得です|必ず|確実に|すべき|延長される見通し/);
    }
  });

  it('出典に No.4508・No.4408・No.4103・措法 70 条の 2 がある', () => {
    expect(page).toContain('taxanswer/sozoku/4508.htm');
    expect(page).toContain('taxanswer/zoyo/4408.htm');
    expect(page).toContain('taxanswer/sozoku/4103.htm');
    expect(page).toContain('70条の2');
  });

  it('税率表を二重に持たない（zoyozei-keisan から import する）', () => {
    const lib = read('../lib/jutaku-shutoku-shikin.ts');
    expect(lib).toContain("from '@/lib/zoyozei-keisan'");
    expect(lib).not.toMatch(/rate:\s*0\.\d+,\s*deduction/);
  });
});
