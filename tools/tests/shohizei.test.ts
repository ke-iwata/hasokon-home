import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BILL_STATUS_LABEL,
  DEFAULT_TAX_ROUNDING,
  FOOD_RATE_2027,
  FOOD_RELIEF_MONTHS,
  FOOD_RELIEF_RATIO,
  KAKEI_CHOSA,
  KAKEI_TWO_OR_MORE_AT_HOME,
  LOOKUP_TABLE,
  TAX_RATE_FOOD_2027,
  TAX_RATE_REDUCED,
  TAX_RATE_STANDARD,
  compareRates,
  foodRateBadge,
  foodRelief,
  formatPercent,
  isFoodRatePending,
  isFoodRateShown,
  lookupTable,
  taxBreakdown,
  taxRate,
  taxRates,
  type BillStatus,
} from '@/lib/shohizei';
import {
  ITEMS,
  ITEM_CATEGORIES,
  ITEM_COUNT,
  QA_REVISION,
  findItem,
  itemGroups,
  rate2027For,
  searchItems,
} from '@/lib/shohizei-items';
import {
  DEFAULT_ROUNDING,
  TAX_RATE_REDUCED as WARIBIKI_REDUCED,
  TAX_RATE_STANDARD as WARIBIKI_STANDARD,
} from '@/lib/waribiki-percent';

/**
 * 消費税計算機・軽減税率チェッカーのテスト。
 *
 * 仕様: docs/features/shohizei-keisan-shokuryohin-1percent.md
 *
 * 見張っているのは5つ。
 *
 * 1. **税込⇔税抜の往復と、3つの数の整合**（税込 − 税抜 = 税額）
 * 2. **既定の丸めが切り捨てで、割引計算機（四捨五入）と共有されていないこと**
 * 3. **1%の軽減額が約6.48%**（1 − 1.01/1.08）で、月・年・通算が食い違わないこと
 * 4. **`status` ごとに表示が切り替わること**。とくに法案未成立のあいだ
 *    `title` / `description` に「予定」が入っていること（検索結果のスニペットに
 *    画面の印は見えないので、文字列として入っていないと成立済みの事実として読まれる）
 * 5. **判定データに国税庁Q&Aの設問番号が全件あること**（出典のない判定を置かない）
 */

describe('税率の定数', () => {
  it('10% / 8% / 1%', () => {
    expect(TAX_RATE_STANDARD).toBe(0.1);
    expect(TAX_RATE_REDUCED).toBe(0.08);
    expect(TAX_RATE_FOOD_2027).toBe(0.01);
  });

  /**
   * **税率を2か所に置かないこと。** 割引計算機はこのファイルから import して
   * いるので、同じ値が返る。片方だけ直したときにここで落ちる。
   */
  it('割引計算機の税率はここから import されている（数字が2か所にない）', () => {
    expect(WARIBIKI_STANDARD).toBe(TAX_RATE_STANDARD);
    expect(WARIBIKI_REDUCED).toBe(TAX_RATE_REDUCED);
  });

  it('消費税の既定の丸めは切り捨てで、割引計算機の既定（四捨五入）とは別', () => {
    expect(DEFAULT_TAX_ROUNDING).toBe('floor');
    expect(DEFAULT_ROUNDING).toBe('round');
    expect(DEFAULT_TAX_ROUNDING).not.toBe(DEFAULT_ROUNDING);
  });
});

describe('taxRates（税率の選択肢）', () => {
  it('法案未成立のあいだは1%のラベルに「予定」が入る', () => {
    const food = taxRates('cabinet-decision').find((r) => r.id === 'food-2027');
    expect(food?.pending).toBe(true);
    expect(food?.label).toContain('予定');
  });

  it('成立したら1%のラベルから「予定」が外れる', () => {
    for (const status of ['enacted', 'in-force'] as BillStatus[]) {
      const food = taxRates(status).find((r) => r.id === 'food-2027');
      expect(food?.pending).toBe(false);
      expect(food?.label).not.toContain('予定');
    }
  });

  /** 法案が通らなかった場合は 8%/10% の2税率に戻る（ツール自体は消さない） */
  it('撤回されたら1%が並びから消える', () => {
    const rates = taxRates('withdrawn');
    expect(rates.map((r) => r.id)).toEqual(['standard', 'reduced']);
    expect(isFoodRateShown('withdrawn')).toBe(false);
  });

  it('いま使えない税率IDを引くと投げる', () => {
    expect(() => taxRate('food-2027', 'withdrawn')).toThrow(/税率ID/);
  });

  it('状態ごとに印が変わり、施行後は印を出さない', () => {
    expect(isFoodRatePending('cabinet-decision')).toBe(true);
    expect(isFoodRatePending('enacted')).toBe(false);
    expect(foodRateBadge('cabinet-decision')).toContain('成立前');
    expect(foodRateBadge('cabinet-decision')).toContain('2026年8月5日');
    expect(foodRateBadge('in-force')).toBeNull();
    expect(foodRateBadge('withdrawn')).toContain('成立しません');
  });

  it('状態のラベルに「決定」「確定」と書かない（閣議決定は条文ではない）', () => {
    expect(BILL_STATUS_LABEL['cabinet-decision']).toBe('閣議決定済み・法案未成立');
  });
});

describe('taxBreakdown（税込 ⇔ 税抜）', () => {
  it('税抜1,000円の10%は税込1,100円・税額100円', () => {
    expect(taxBreakdown({ amount: 1000, mode: 'exclusive', rateId: 'standard' })).toMatchObject({
      excluding: 1000,
      tax: 100,
      including: 1100,
    });
  });

  it('税抜1,000円の8%は税込1,080円・税額80円', () => {
    expect(taxBreakdown({ amount: 1000, mode: 'exclusive', rateId: 'reduced' })).toMatchObject({
      excluding: 1000,
      tax: 80,
      including: 1080,
    });
  });

  it('税抜1,000円の1%は税込1,010円・税額10円', () => {
    expect(taxBreakdown({ amount: 1000, mode: 'exclusive', rateId: 'food-2027' })).toMatchObject({
      excluding: 1000,
      tax: 10,
      including: 1010,
    });
  });

  it('税込1,100円の10%は税抜1,000円（逆向き）', () => {
    expect(taxBreakdown({ amount: 1100, mode: 'inclusive', rateId: 'standard' })).toMatchObject({
      excluding: 1000,
      tax: 100,
      including: 1100,
    });
  });

  /**
   * **3つの数が必ず整合すること。** 税額を「本体×税率」で別に丸めると、
   * 画面に並べた税抜・税額・税込が1円合わないことがある。
   */
  it('どの金額・税率・丸めでも 税込 − 税抜 = 税額 が成り立つ', () => {
    for (const amount of [0, 1, 7, 99, 100, 333, 1080, 9999, 123456]) {
      for (const rateId of ['standard', 'reduced', 'food-2027'] as const) {
        for (const rounding of ['floor', 'round', 'ceil'] as const) {
          for (const mode of ['inclusive', 'exclusive'] as const) {
            const r = taxBreakdown({ amount, mode, rateId, rounding });
            expect(r).not.toBeNull();
            expect(r!.including - r!.excluding).toBe(r!.tax);
          }
        }
      }
    }
  });

  it('税抜入力なら入力額がそのまま税抜になり、税込入力なら入力額がそのまま税込になる', () => {
    expect(
      taxBreakdown({ amount: 1234, mode: 'exclusive', rateId: 'standard' })!.excluding,
    ).toBe(1234);
    expect(
      taxBreakdown({ amount: 1234, mode: 'inclusive', rateId: 'standard' })!.including,
    ).toBe(1234);
  });

  it('丸め3方式で答えが変わる（税抜103円の8%＝111.24円）', () => {
    const at = (rounding: 'floor' | 'round' | 'ceil') =>
      taxBreakdown({ amount: 103, mode: 'exclusive', rateId: 'reduced', rounding })!.including;
    expect(at('floor')).toBe(111);
    expect(at('round')).toBe(111);
    expect(at('ceil')).toBe(112);
  });

  it('既定の丸めは切り捨て（引数を省いたとき）', () => {
    // 税抜 105円 × 1.08 = 113.4円 → 切り捨てなら113円
    const r = taxBreakdown({ amount: 105, mode: 'exclusive', rateId: 'reduced' })!;
    expect(r.rounding).toBe('floor');
    expect(r.including).toBe(113);
  });

  it('0円は計算できる（税額0）', () => {
    expect(taxBreakdown({ amount: 0, mode: 'exclusive', rateId: 'standard' })).toMatchObject({
      excluding: 0,
      tax: 0,
      including: 0,
    });
  });

  it('負の金額・NaN・未知の税率IDは null', () => {
    expect(taxBreakdown({ amount: -1, mode: 'exclusive', rateId: 'standard' })).toBeNull();
    expect(taxBreakdown({ amount: Number.NaN, mode: 'exclusive', rateId: 'standard' })).toBeNull();
    expect(
      taxBreakdown({ amount: 100, mode: 'exclusive', rateId: 'unknown' as 'standard' }),
    ).toBeNull();
  });
});

describe('compareRates（3税率の横並び）', () => {
  /** 仕様書の例：「この税込1,080円の品は1%なら1,010円」 */
  it('税抜1,000円を3税率で並べると 1,100 / 1,080 / 1,010', () => {
    expect(compareRates(1000, 'exclusive').map((r) => r.including)).toEqual([1100, 1080, 1010]);
  });

  it('並びは taxRates と同じ順（10% → 8% → 1%）', () => {
    expect(compareRates(1000, 'exclusive').map((r) => r.rateId)).toEqual([
      'standard',
      'reduced',
      'food-2027',
    ]);
  });
});

describe('早見表', () => {
  it('税抜100〜10,000円の全行に、税率ごとの税込額が入る', () => {
    expect(LOOKUP_TABLE.length).toBeGreaterThan(5);
    for (const row of LOOKUP_TABLE) {
      expect(row.including).toHaveLength(taxRates().length);
      for (const cell of row.including) {
        expect(cell.including).toBeGreaterThanOrEqual(row.excluding);
      }
    }
  });

  it('表は計算機と同じ関数から作られている（手書きの表を持たない）', () => {
    const row = LOOKUP_TABLE.find((r) => r.excluding === 1000)!;
    for (const cell of row.including) {
      const direct = taxBreakdown({ amount: 1000, mode: 'exclusive', rateId: cell.rateId })!;
      expect(cell.including).toBe(direct.including);
    }
  });

  it('早見表に使えない金額を渡すと投げる（黙って0を並べない）', () => {
    expect(() => lookupTable([-1])).toThrow(/早見表/);
  });
});

describe('foodRelief（食料品1%の軽減額）', () => {
  it('軽減の割合は約6.48%（1 − 1.01 / 1.08）', () => {
    expect(FOOD_RELIEF_RATIO).toBeCloseTo(0.064815, 6);
    expect(formatPercent(FOOD_RELIEF_RATIO)).toBe('6.48%');
  });

  /** 仕様書の例：月70,000円なら月4,537円・年54,444円・2年で約10.9万円 */
  it('月7万円なら 月4,537円・年54,444円・2年で108,888円', () => {
    const r = foodRelief(70000)!;
    expect(r.monthly).toBe(4537);
    expect(r.yearly).toBe(54444);
    expect(r.total).toBe(108888);
    expect(r.months).toBe(24);
  });

  it('期間は2027-04 〜 2029-03 の24か月', () => {
    expect(FOOD_RATE_2027.from).toBe('2027-04-01');
    expect(FOOD_RATE_2027.to).toBe('2029-03-31');
    expect(FOOD_RELIEF_MONTHS).toBe(24);
  });

  /**
   * 年・通算は「丸めた月額 × 月数」で出す。生の値を別に丸めると、
   * 画面の月額と年額が12倍になっていないように見える。
   */
  it('年額は月額の12倍・通算は24倍に必ずなる', () => {
    for (const amount of [0, 1234, 30000, 74548, 150000]) {
      const r = foodRelief(amount)!;
      expect(r.yearly).toBe(r.monthly * 12);
      expect(r.total).toBe(r.monthly * 24);
    }
  });

  it('0円なら軽減額も0', () => {
    expect(foodRelief(0)).toMatchObject({ monthly: 0, yearly: 0, total: 0 });
  });

  it('負の額・NaN は null', () => {
    expect(foodRelief(-1)).toBeNull();
    expect(foodRelief(Number.NaN)).toBeNull();
  });

  /**
   * 軽減額は「税込8%の価格がそのまま税込1%に置き換わる」前提の上限の目安。
   * 税抜に直して1%を乗せた額と一致することで、割合の導き方を裏から確かめる。
   */
  it('税抜に直して1%を乗せ直した差と一致する（割合の導出の裏取り）', () => {
    const including8 = 108000;
    const excluding = including8 / 1.08;
    const including1 = excluding * 1.01;
    expect(foodRelief(including8)!.monthly).toBe(Math.round(including8 - including1));
  });
});

describe('家計調査のプリセット', () => {
  it('食料から外食・酒類を引いた額をプリセットにする', () => {
    expect(KAKEI_TWO_OR_MORE_AT_HOME).toBe(94895 - 16563 - 3784);
    expect(KAKEI_TWO_OR_MORE_AT_HOME).toBe(74548);
  });

  it('年と表番号を添えている（どの年のどの表か分かる）', () => {
    expect(KAKEI_CHOSA.year).toBe(2025);
    expect(KAKEI_CHOSA.table).toContain('表');
    expect(KAKEI_CHOSA.label).toContain('家計調査');
  });
});

describe('軽減税率の判定データ', () => {
  it('40〜50項目ある', () => {
    expect(ITEM_COUNT).toBeGreaterThanOrEqual(40);
    expect(ITEM_COUNT).toBeLessThanOrEqual(50);
  });

  /**
   * **出典のない判定を置かない。** 1件でも `qa` が欠けたらここで落ちる
   * （仕様書「軽減税率の判定を断言しない。個別事例は国税庁Q&Aの範囲に限る」）。
   */
  it('全件に国税庁Q&A（個別事例編）の設問番号がある', () => {
    const missing = ITEMS.filter(
      (item) => !Number.isInteger(item.qa) || item.qa < 1 || item.qa > 121,
    ).map((item) => item.id);
    expect(missing).toEqual([]);
  });

  it('突き合わせたQ&Aの改訂版を記録している', () => {
    expect(QA_REVISION).toBe('令和8年4月改訂');
  });

  it('id が重複していない', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEM_COUNT);
  });

  it('全件に理由とキーワードがある', () => {
    for (const item of ITEMS) {
      expect(item.reason.length).toBeGreaterThan(5);
      expect(item.keywords.length).toBeGreaterThan(0);
      expect(ITEM_CATEGORIES).toContain(item.category);
    }
  });

  /** 仕様書の表にある代表例を、一次資料で確認した結論どおりに持っているか */
  it.each([
    ['supermarket-food', 'reduced'],
    ['sake', 'standard'],
    ['non-alcohol', 'reduced'],
    ['hon-mirin', 'standard'],
    ['mirin-fu', 'reduced'],
    ['restaurant', 'standard'],
    ['takeout', 'reduced'],
    ['combini-eatin', 'standard'],
    ['combini-takeout', 'reduced'],
    ['demae', 'reduced'],
    ['catering', 'standard'],
    ['school-lunch', 'reduced'],
    ['student-cafeteria', 'standard'],
    ['roujin-home', 'reduced'],
    ['eiyo-drink', 'standard'],
    ['seiryo-inryo', 'reduced'],
    ['mineral-water', 'reduced'],
    ['tap-water', 'standard'],
    ['food-ice', 'reduced'],
    ['dry-ice', 'standard'],
    ['pet-food', 'standard'],
    ['shokugan', 'reduced'],
    ['newspaper-teiki', 'reduced'],
    ['newspaper-combini', 'standard'],
    ['newspaper-digital', 'standard'],
    ['souryou', 'standard'],
    ['tsuhan', 'reduced'],
  ])('%s の税率は %s', (id, rate) => {
    expect(findItem(id)?.rate).toBe(rate);
  });

  /** 病院食は非課税で、10%とは別物。まとめて10%に丸めない */
  it('入院時食事療養費の病院食は非課税（10%ではない）', () => {
    expect(findItem('hospital-food')?.rate).toBe('non-taxable');
  });

  it('意思確認・飲食設備の有無で分かれるものは「場合による」にしてある', () => {
    for (const id of ['yatai', 'fukubukuro', 'food-sake-set', 'eatin-ishikakunin']) {
      expect(findItem(id)?.rate).toBe('depends');
    }
  });

  it('無い id は undefined', () => {
    expect(findItem('nai-slug')).toBeUndefined();
  });
});

describe('searchItems / itemGroups', () => {
  it('空の検索は全件返す（初期表示で全項目が並ぶ）', () => {
    expect(searchItems('')).toHaveLength(ITEM_COUNT);
    expect(searchItems('   ')).toHaveLength(ITEM_COUNT);
  });

  it('ラベルとキーワードの両方で引ける', () => {
    expect(searchItems('みりん').map((i) => i.id)).toContain('hon-mirin');
    expect(searchItems('ぺっとふーど').map((i) => i.id)).toContain('pet-food');
    expect(searchItems('テイクアウト').map((i) => i.id)).toContain('takeout');
  });

  it('入力が長くてもキーワードが引っかかる（双方向の部分一致）', () => {
    expect(searchItems('コンビニのイートインで食べたとき').map((i) => i.id)).toContain(
      'combini-eatin',
    );
  });

  it('ヒットしない語は空配列（Q&Aへ誘導するのは画面側）', () => {
    expect(searchItems('存在しない品目xyz')).toEqual([]);
  });

  it('種類別のまとまりは空のものを返さない', () => {
    for (const group of itemGroups()) {
      expect(group.items.length).toBeGreaterThan(0);
    }
    expect(itemGroups().flatMap((g) => g.items)).toHaveLength(ITEM_COUNT);
  });

  it('しぼり込み結果もまとまりに通せる', () => {
    const groups = itemGroups(searchItems('新聞'));
    expect(groups.flatMap((g) => g.items).length).toBeGreaterThan(0);
  });
});

describe('rate2027For（2027年4月以降）', () => {
  it('8%の飲食料品は1%になる', () => {
    expect(rate2027For(findItem('supermarket-food')!)).toBe('food-1percent');
    expect(rate2027For(findItem('takeout')!)).toBe('food-1percent');
  });

  /**
   * **新聞は税率を書かない。** 報道では8%のままとされているが、
   * 法案の条文で確認するまで表に出さない（仕様書の指示）。
   */
  it('8%の新聞は「未確認」（条文で確認するまで税率を書かない）', () => {
    expect(rate2027For(findItem('newspaper-teiki')!)).toBe('newspaper-unconfirmed');
    expect(rate2027For(findItem('newspaper-sports')!)).toBe('newspaper-unconfirmed');
  });

  it('10%・非課税は変わらない', () => {
    expect(rate2027For(findItem('sake')!)).toBe('same');
    expect(rate2027For(findItem('restaurant')!)).toBe('same');
    expect(rate2027For(findItem('hospital-food')!)).toBe('same');
  });

  it('「場合による」はそのまま', () => {
    expect(rate2027For(findItem('yatai')!)).toBe('depends');
  });

  it('法案が成立しなかった場合は列そのものを出さない', () => {
    for (const item of ITEMS) {
      expect(rate2027For(item, false)).toBeNull();
    }
  });
});

/* ===================================================================
   ページ側（page.tsx）の表示
   =================================================================== */

const pageSource = readFileSync(
  fileURLToPath(new URL('../app/shohizei-keisan/page.tsx', import.meta.url)),
  'utf8',
);

describe('page.tsx の title / description', () => {
  /**
   * **法案未成立のあいだ、`title` / `description` に「予定」を含めること。**
   *
   * 画面には「成立前です」の印を出しているが、**検索結果のスニペットには
   * 印が見えない**。「2027年4月〜 食料品1%」とだけ出ると、成立済みの事実として
   * 読まれる。`FOOD_RATE_2027.status` が `'cabinet-decision'` のあいだは
   * 文字列として入っていないとここで落ちる。
   */
  it('status が cabinet-decision のとき、title と description に「予定」が入る', () => {
    if (!isFoodRatePending()) return;

    const title = pageSource.match(/^const title =\s*([\s\S]*?);$/m)?.[1] ?? '';
    const description = pageSource.match(/^const description =\s*([\s\S]*?);$/m)?.[1] ?? '';

    expect(title).not.toBe('');
    expect(description).not.toBe('');
    expect(title).toContain('予定');
    expect(description).toContain('予定');
  });

  /**
   * **「予定」が前半30字に入っていること。**
   *
   * 日本語の検索結果で表示されるのは全角30字前後なので、`title` の後ろに
   * 「（予定）」を置くと**スニペットでは切れて見えない**。文字列として
   * 含まれているかだけを見ていると、まさに仕様書が避けたかった
   * 「成立済みの事実として読まれる」形を通してしまう（レビューで指摘された）。
   */
  it('title の「予定」が前半30字に入る（スニペットで切れない位置）', () => {
    if (!isFoodRatePending()) return;
    const raw = pageSource.match(/^const title = PENDING\s*\?\s*'([^']*)'/m)?.[1] ?? '';
    expect(raw).not.toBe('');
    expect(raw).toContain('予定');
    expect(raw.indexOf('予定')).toBeLessThan(30);
  });

  it('「決定」「確定」と断定していない', () => {
    if (!isFoodRatePending()) return;
    const title = pageSource.match(/^const title =\s*([\s\S]*?);$/m)?.[1] ?? '';
    expect(title).not.toContain('決定');
    expect(title).not.toContain('確定');
  });

  it('noindex の判定を registry に通している（stage が効く）', () => {
    expect(pageSource).toContain("robotsFor('shohizei-keisan')");
  });
});
