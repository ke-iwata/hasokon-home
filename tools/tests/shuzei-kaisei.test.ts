import { describe, expect, it } from 'vitest';
import {
  ADVICE_LABEL,
  AFTER_STAGE_ID,
  BEFORE_STAGE_ID,
  CATEGORIES,
  CONSUMPTION_TAX_RATE,
  DATA_CHECKED_AT,
  LIQUEUR_RATE_PER_KL,
  MINOR_DRINKING_NOTE,
  OTHER_SPARKLING_ABV_LIMIT_AFTER,
  OTHER_SPARKLING_ABV_LIMIT_BEFORE,
  REVISION_DATE,
  SIZES,
  STAGES,
  WEEKS_PER_YEAR,
  adviceFor,
  adviceOf,
  compare,
  comparisons,
  daysUntilRevision,
  directionOf,
  estimateBurden,
  formatDate,
  formatDiff,
  formatYen,
  formatYenDecimal,
  history,
  isRevised,
  sortByAdvice,
  stageAt,
  stageById,
  taxFor,
  taxOf,
  toYmd,
  withConsumptionTax,
  type CategoryId,
  type StageId,
} from '@/lib/shuzei-kaisei';

/**
 * 酒税改正 早見表・負担額計算のテスト。
 *
 * 仕様: docs/features/shuzei-kaisei-hayamihyo.md
 *
 * このツールでこわいのは3つ。
 *
 * 1. **税率表の写し間違い** — 国税庁・財務省が公表している350ml換算の値
 *    （63.35円・54.25円・46.99円・28.00円・35.00円など）と突き合わせて固定する。
 *    二次情報を見て書き換えられるのを防ぐため
 * 2. **減税と増税の向きを取り違えること** — ビールは下がり、発泡酒・第三のビール・
 *    チューハイは上がる。合計は**マイナスにもなる**ので、絶対値に丸めてはいけない
 * 3. **施行日の判定** — 2026年10月1日の境界がずれると、買いだめの案内が逆になる
 */

const ymd = /^\d{4}-\d{2}-\d{2}$/;

/** id から区分を引く（テストの読みやすさのため） */
function cat(id: CategoryId) {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`未登録の区分: ${id}`);
  return found;
}

describe('STAGES（段階的見直しの区切り）', () => {
  it('見直し前 + 3段階の計4件ある', () => {
    expect(STAGES).toHaveLength(4);
  });

  it('先頭だけが施行日を持たず、以降は昇順に並んでいる（stageAt の前提）', () => {
    expect(STAGES[0].effectiveFrom).toBeUndefined();
    const dates = STAGES.slice(1).map((s) => s.effectiveFrom as string);
    for (const d of dates) expect(d).toMatch(ymd);
    expect([...dates].sort()).toEqual(dates);
  });

  it('施行日は2020年10月1日・2023年10月1日・2026年10月1日', () => {
    expect(STAGES.map((s) => s.effectiveFrom)).toEqual([
      undefined,
      '2020-10-01',
      '2023-10-01',
      '2026-10-01',
    ]);
  });

  it('id が重複していない', () => {
    const ids = STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('見出しに「現行」と書かない（静的書き出しなので、いつ開いても正しい表記にする）', () => {
    for (const stage of STAGES) {
      expect(stage.label, `${stage.id}: 期間そのものを見出しにすること`).not.toContain('現行');
    }
  });

  it('比較の基準は改正前後の2つで、施行日の前後で切り替わらない', () => {
    expect(BEFORE_STAGE_ID).toBe('2023-10');
    expect(AFTER_STAGE_ID).toBe('2026-10');
    expect(stageById(BEFORE_STAGE_ID)?.effectiveFrom).toBe('2023-10-01');
    expect(stageById(AFTER_STAGE_ID)?.effectiveFrom).toBe(REVISION_DATE);
  });

  it('stageById は未登録なら undefined', () => {
    expect(stageById('2099-10' as StageId)).toBeUndefined();
  });
});

describe('CATEGORIES（税率表）', () => {
  it('発泡性酒類の5区分がある', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      'beer',
      'happoshu-mid',
      'happoshu-low',
      'shin-genre',
      'other-sparkling',
    ]);
  });

  it('全区分が全段階の税率を持つ（段階を足したときの書き漏れを防ぐ）', () => {
    for (const category of CATEGORIES) {
      for (const stage of STAGES) {
        const rate = category.ratesPerKl[stage.id];
        expect(rate, `${category.id} / ${stage.id}`).toBeTypeOf('number');
        expect(rate, `${category.id} / ${stage.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('全区分に一次情報の出典がある（仕様: 出典を明記する）', () => {
    for (const category of CATEGORIES) {
      expect(category.source.url, `${category.id}: 一次情報でない出典`).toMatch(
        /^https:\/\/www\.(mof|nta)\.go\.jp\//,
      );
      expect(category.source.label, `${category.id}: 出典名が空`).not.toBe('');
      expect(category.source.checkedAt, `${category.id}: 確認日の形式`).toMatch(ymd);
    }
  });

  /**
   * 国税庁「発泡性酒類の段階的な税率変更に係る…手引き」3ページの表そのもの。
   * ここが崩れたら、このツールの出す数字はすべて間違いになる。
   */
  it('1klあたりの税率が国税庁の資料と一致する', () => {
    expect(cat('beer').ratesPerKl).toEqual({
      'before-2020': 220000,
      '2020-10': 200000,
      '2023-10': 181000,
      '2026-10': 155000,
    });
    expect(cat('happoshu-mid').ratesPerKl).toEqual({
      'before-2020': 178125,
      '2020-10': 167125,
      '2023-10': 155000,
      '2026-10': 155000,
    });
    expect(cat('happoshu-low').ratesPerKl).toEqual({
      'before-2020': 134250,
      '2020-10': 134250,
      '2023-10': 134250,
      '2026-10': 155000,
    });
    expect(cat('shin-genre').ratesPerKl).toEqual({
      'before-2020': 80000,
      '2020-10': 108000,
      '2023-10': 134250,
      '2026-10': 155000,
    });
    expect(cat('other-sparkling').ratesPerKl).toEqual({
      'before-2020': 80000,
      '2020-10': 80000,
      '2023-10': 80000,
      '2026-10': 100000,
    });
  });

  it('ビール系飲料は2026年10月に155,000円へ一本化される', () => {
    const beerLike = ['beer', 'happoshu-mid', 'happoshu-low', 'shin-genre'] as const;
    for (const id of beerLike) {
      expect(cat(id).ratesPerKl['2026-10'], `${id}`).toBe(155000);
    }
  });

  it('計算機に出すのは税率の違う4区分だけ（新ジャンルは発泡酒に統合済み）', () => {
    expect(CATEGORIES.filter((c) => c.inCalculator).map((c) => c.id)).toEqual([
      'beer',
      'happoshu-mid',
      'happoshu-low',
      'other-sparkling',
    ]);
    // 統合済みなので、現行以降の税率は発泡酒（麦芽比率25%未満）と一致する
    expect(cat('shin-genre').ratesPerKl['2023-10']).toBe(cat('happoshu-low').ratesPerKl['2023-10']);
    expect(cat('shin-genre').ratesPerKl['2026-10']).toBe(cat('happoshu-low').ratesPerKl['2026-10']);
  });

  it('その他の発泡性酒類のアルコール分の上限が10度未満→11度未満に広がる', () => {
    expect(OTHER_SPARKLING_ABV_LIMIT_BEFORE).toBe(10);
    expect(OTHER_SPARKLING_ABV_LIMIT_AFTER).toBe(11);
    // 10度以上のチューハイはいまリキュール課税（350mlで42円）で、改正後のほうが安くなる
    expect(taxFor(LIQUEUR_RATE_PER_KL, 350)).toBe(42);
    expect(taxFor(LIQUEUR_RATE_PER_KL, 350)).toBeGreaterThan(
      taxOf(cat('other-sparkling'), '2026-10', 350),
    );
  });

  it('データ最終確認日が YYYY-MM-DD 形式', () => {
    expect(DATA_CHECKED_AT).toMatch(ymd);
  });
});

describe('taxFor / taxOf（容量あたりの酒税）', () => {
  /** 財務省・国税庁が公表している350ml換算の値と1円単位まで一致させる */
  it('350mlの税額が公表値と一致する', () => {
    expect(taxOf(cat('beer'), 'before-2020', 350)).toBe(77);
    expect(taxOf(cat('beer'), '2020-10', 350)).toBe(70);
    expect(taxOf(cat('beer'), '2023-10', 350)).toBe(63.35);
    expect(taxOf(cat('beer'), '2026-10', 350)).toBe(54.25);

    expect(taxOf(cat('happoshu-mid'), 'before-2020', 350)).toBeCloseTo(62.34, 2);
    expect(taxOf(cat('happoshu-mid'), '2020-10', 350)).toBeCloseTo(58.49, 2);

    expect(taxOf(cat('happoshu-low'), '2023-10', 350)).toBeCloseTo(46.99, 2);

    expect(taxOf(cat('shin-genre'), 'before-2020', 350)).toBe(28);
    expect(taxOf(cat('shin-genre'), '2020-10', 350)).toBe(37.8);
    expect(taxOf(cat('shin-genre'), '2023-10', 350)).toBeCloseTo(46.99, 2);

    expect(taxOf(cat('other-sparkling'), '2023-10', 350)).toBe(28);
    expect(taxOf(cat('other-sparkling'), '2026-10', 350)).toBe(35);
  });

  it('500mlは350mlの10/7倍になる（容量あたりの従量税なので比例する）', () => {
    for (const category of CATEGORIES) {
      for (const stage of STAGES) {
        const small = taxOf(category, stage.id, 350);
        const large = taxOf(category, stage.id, 500);
        expect(large, `${category.id} / ${stage.id}`).toBeCloseTo((small * 500) / 350, 3);
      }
    }
  });

  it('500mlの代表的な税額', () => {
    expect(taxOf(cat('beer'), '2023-10', 500)).toBe(90.5);
    expect(taxOf(cat('beer'), '2026-10', 500)).toBe(77.5);
    expect(taxOf(cat('other-sparkling'), '2023-10', 500)).toBe(40);
    expect(taxOf(cat('other-sparkling'), '2026-10', 500)).toBe(50);
  });

  it('容量0なら0円、比例する', () => {
    expect(taxFor(155000, 0)).toBe(0);
    expect(taxFor(155000, 1000)).toBe(155);
  });

  it('扱う容量は350mlと500ml', () => {
    expect(SIZES).toEqual([350, 500]);
  });
});

describe('compare（改正前後の比較）', () => {
  it('350mlの増減が提案の表と一致する', () => {
    expect(compare(cat('beer'), 350).diff).toBe(-9.1);
    expect(compare(cat('happoshu-low'), 350).diff).toBeCloseTo(7.26, 2);
    expect(compare(cat('other-sparkling'), 350).diff).toBe(7);
    expect(compare(cat('happoshu-mid'), 350).diff).toBe(0);
  });

  it('ビールだけが減税、麦芽比率25%以上50%未満の発泡酒だけが据え置き', () => {
    const byId = Object.fromEntries(comparisons(350).map((c) => [c.category.id, c.direction]));
    expect(byId).toEqual({
      beer: 'down',
      'happoshu-mid': 'flat',
      'happoshu-low': 'up',
      'shin-genre': 'up',
      'other-sparkling': 'up',
    });
  });

  it('500mlのビールは13円の減税、チューハイは10円の増税', () => {
    expect(compare(cat('beer'), 500).diff).toBe(-13);
    expect(compare(cat('other-sparkling'), 500).diff).toBe(10);
  });

  it('comparisons は calculatorOnly で統合済みの区分を外す', () => {
    expect(comparisons(350).length).toBe(5);
    expect(comparisons(350, { calculatorOnly: true }).map((c) => c.category.id)).toEqual([
      'beer',
      'happoshu-mid',
      'happoshu-low',
      'other-sparkling',
    ]);
  });

  it('directionOf は丸めたあとの値で判定する', () => {
    expect(directionOf(0.01)).toBe('up');
    expect(directionOf(-0.01)).toBe('down');
    expect(directionOf(0)).toBe('flat');
  });
});

describe('history（段階的見直しの推移）', () => {
  it('全区分が4段階ぶんの税額を持つ', () => {
    for (const row of history(350)) {
      expect(row.taxes.map((t) => t.stage.id)).toEqual(STAGES.map((s) => s.id));
    }
  });

  it('第三のビールは見直し全体でいちばん上がり、ビールはいちばん下がる', () => {
    const byId = Object.fromEntries(history(350).map((r) => [r.category.id, r.totalDiff]));
    expect(byId.beer).toBe(-22.75); // 77.00円 → 54.25円
    expect(byId['shin-genre']).toBe(26.25); // 28.00円 → 54.25円
    expect(byId['other-sparkling']).toBe(7); // 28.00円 → 35.00円
    expect(Math.min(...Object.values(byId))).toBe(byId.beer);
    expect(Math.max(...Object.values(byId))).toBe(byId['shin-genre']);
  });

  it('ビールと第三のビールの差は最終段階でゼロになる（一本化）', () => {
    const rows = history(350);
    const beer = rows.find((r) => r.category.id === 'beer')!;
    const shin = rows.find((r) => r.category.id === 'shin-genre')!;
    expect(beer.taxes[0].tax - shin.taxes[0].tax).toBe(49); // 77.00 - 28.00
    expect(beer.taxes[3].tax - shin.taxes[3].tax).toBe(0);
  });
});

describe('施行日の判定', () => {
  it('stageAt は基準日に適用されている段階を返す', () => {
    expect(stageAt('2019-01-01').id).toBe('before-2020');
    expect(stageAt('2020-09-30').id).toBe('before-2020');
    expect(stageAt('2020-10-01').id).toBe('2020-10');
    expect(stageAt('2023-09-30').id).toBe('2020-10');
    expect(stageAt('2023-10-01').id).toBe('2023-10');
    expect(stageAt('2026-09-30').id).toBe('2023-10');
    expect(stageAt('2026-10-01').id).toBe('2026-10');
    expect(stageAt('2030-01-01').id).toBe('2026-10');
  });

  it('stageAt は Date でも受け取れる', () => {
    expect(stageAt(new Date(2026, 8, 30)).id).toBe('2023-10'); // 2026-09-30
    expect(stageAt(new Date(2026, 9, 1)).id).toBe('2026-10'); // 2026-10-01
  });

  it('isRevised は施行日ちょうどで true になる', () => {
    expect(isRevised('2026-09-30')).toBe(false);
    expect(isRevised(REVISION_DATE)).toBe(true);
    expect(isRevised('2026-10-02')).toBe(true);
  });

  it('daysUntilRevision は残り日数を返し、施行後は0', () => {
    expect(daysUntilRevision('2026-09-30')).toBe(1);
    expect(daysUntilRevision('2026-09-01')).toBe(30);
    expect(daysUntilRevision('2026-08-19')).toBe(43);
    expect(daysUntilRevision(REVISION_DATE)).toBe(0);
    expect(daysUntilRevision('2027-01-01')).toBe(0);
  });

  it('toYmd はローカル日付を YYYY-MM-DD にする', () => {
    expect(toYmd(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(toYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('買いだめの仕分け', () => {
  it('増税なら9月中、減税なら10月以降', () => {
    expect(adviceOf('up')).toBe('buy-before');
    expect(adviceOf('down')).toBe('wait');
    expect(adviceOf('flat')).toBe('same');
  });

  it('ビールは待つほうが得、第三のビール・チューハイは9月中が得', () => {
    expect(adviceFor(cat('beer'))).toBe('wait');
    expect(adviceFor(cat('happoshu-low'))).toBe('buy-before');
    expect(adviceFor(cat('other-sparkling'))).toBe('buy-before');
    expect(adviceFor(cat('happoshu-mid'))).toBe('same');
  });

  it('言い方が3種類そろっている', () => {
    expect(Object.keys(ADVICE_LABEL).sort()).toEqual(['buy-before', 'same', 'wait']);
  });
});

describe('estimateBurden（負担額）', () => {
  it('1年は約52.14週として年換算する', () => {
    expect(WEEKS_PER_YEAR).toBeCloseTo(52.142857, 5);
    // 週7本 = 1日1本 = 年365本
    const burden = estimateBurden([{ categoryId: 'other-sparkling', ml: 350, perWeek: 7 }]);
    expect(burden.lines[0].perYear).toBe(365);
    expect(burden.lines[0].annualDiff).toBe(365 * 7); // 1本+7円 × 365本
  });

  it('ビールだけを飲む人は負担が減る（合計がマイナスになる）', () => {
    const burden = estimateBurden([{ categoryId: 'beer', ml: 350, perWeek: 7 }]);
    expect(burden.annualDiff).toBe(-3321); // ▲9.10円 × 365本 = ▲3,321.5円
    expect(burden.monthlyDiff).toBe(-277);
    expect(burden.annualDecrease).toBe(3321);
    expect(burden.annualIncrease).toBe(0);
    expect(burden.annualAfter).toBeLessThan(burden.annualBefore);
  });

  it('第三のビールとチューハイの人は負担が増える', () => {
    const burden = estimateBurden([
      { categoryId: 'happoshu-low', ml: 350, perWeek: 7 },
      { categoryId: 'other-sparkling', ml: 350, perWeek: 7 },
    ]);
    expect(burden.lines).toHaveLength(2);
    expect(burden.annualIncrease).toBe(burden.annualDiff);
    expect(burden.annualDiff).toBe(Math.round(7.2625 * 365) + 7 * 365);
  });

  /** このツールの肝。増税と減税は相殺して見せる */
  it('ビールと第三のビールを半々に飲むと、増減が打ち消し合う', () => {
    const burden = estimateBurden([
      { categoryId: 'beer', ml: 350, perWeek: 7 },
      { categoryId: 'happoshu-low', ml: 350, perWeek: 7 },
    ]);
    expect(burden.annualIncrease).toBe(Math.round(7.2625 * 365));
    expect(burden.annualDecrease).toBe(3321);
    expect(burden.annualDiff).toBe(burden.annualIncrease - burden.annualDecrease);
    // ビールの減税幅のほうが大きいので、合計では負担が減る
    expect(burden.annualDiff).toBeLessThan(0);
  });

  it('据え置きの区分は年間の増減が0になる（丸め誤差で1円が出ない）', () => {
    const burden = estimateBurden([{ categoryId: 'happoshu-mid', ml: 500, perWeek: 13 }]);
    expect(burden.annualDiff).toBe(0);
    expect(burden.monthlyDiff).toBe(0);
    expect(burden.annualBefore).toBe(burden.annualAfter);
    expect(burden.lines[0].direction).toBe('flat');
  });

  it('350mlと500mlを別々の行として数える', () => {
    const burden = estimateBurden([
      { categoryId: 'other-sparkling', ml: 350, perWeek: 7 },
      { categoryId: 'other-sparkling', ml: 500, perWeek: 7 },
    ]);
    expect(burden.lines.map((l) => l.ml)).toEqual([350, 500]);
    expect(burden.annualDiff).toBe(7 * 365 + 10 * 365);
  });

  it('本数0・負の本数・未知の区分・容量0は無視する', () => {
    const burden = estimateBurden([
      { categoryId: 'beer', ml: 350, perWeek: 0 },
      { categoryId: 'beer', ml: 350, perWeek: -5 },
      { categoryId: 'beer', ml: 0, perWeek: 5 },
      { categoryId: 'nihonshu' as CategoryId, ml: 350, perWeek: 5 },
      { categoryId: 'beer', ml: Number.NaN, perWeek: 5 },
      { categoryId: 'beer', ml: 350, perWeek: Number.NaN },
    ]);
    expect(burden.lines).toEqual([]);
    expect(burden.empty).toBe(true);
    expect(burden.annualDiff).toBe(0);
  });

  it('入力が空なら empty', () => {
    expect(estimateBurden([]).empty).toBe(true);
  });

  it('小数の本数も受け取れる（週2.5本など）', () => {
    const burden = estimateBurden([{ categoryId: 'other-sparkling', ml: 350, perWeek: 2.5 }]);
    expect(burden.lines[0].perYear).toBeCloseTo(130.4, 1);
    expect(burden.annualDiff).toBe(Math.round(7 * 2.5 * WEEKS_PER_YEAR));
  });

  it('sortByAdvice が買いだめの仕分けを返す', () => {
    const burden = estimateBurden([
      { categoryId: 'beer', ml: 350, perWeek: 7 },
      { categoryId: 'happoshu-low', ml: 350, perWeek: 7 },
      { categoryId: 'happoshu-mid', ml: 350, perWeek: 7 },
    ]);
    const sorted = sortByAdvice(burden);
    expect(sorted.wait.map((l) => l.category.id)).toEqual(['beer']);
    expect(sorted.buyBefore.map((l) => l.category.id)).toEqual(['happoshu-low']);
    expect(sorted.same.map((l) => l.category.id)).toEqual(['happoshu-mid']);
  });
});

describe('消費税の上乗せ', () => {
  it('酒税は消費税の課税対象なので、店頭価格の目安は1.1倍', () => {
    expect(CONSUMPTION_TAX_RATE).toBe(0.1);
    expect(withConsumptionTax(7)).toBe(7.7);
    expect(withConsumptionTax(-9.1)).toBeCloseTo(-10.01, 4);
    expect(withConsumptionTax(0)).toBe(0);
  });
});

describe('表示の整形', () => {
  it('formatDate', () => {
    expect(formatDate(REVISION_DATE)).toBe('2026年10月1日');
    expect(formatDate('2020-10-01')).toBe('2020年10月1日');
  });

  it('formatYen は3桁区切りにして丸める', () => {
    expect(formatYen(1234)).toBe('1,234円');
    expect(formatYen(1234.6)).toBe('1,235円');
    expect(formatYen(0)).toBe('0円');
  });

  it('formatYenDecimal は末尾の0を落とす', () => {
    expect(formatYenDecimal(63.35)).toBe('63.35円');
    expect(formatYenDecimal(54.25)).toBe('54.25円');
    expect(formatYenDecimal(46.9875)).toBe('46.99円');
    expect(formatYenDecimal(35)).toBe('35円');
    expect(formatYenDecimal(54.2)).toBe('54.2円');
    expect(formatYenDecimal(1234.5)).toBe('1,234.5円');
  });

  it('formatDiff は減税を▲、増税を+で見せる', () => {
    expect(formatDiff(7.2625)).toBe('+7.26円');
    expect(formatDiff(-9.1)).toBe('▲9.1円');
    expect(formatDiff(0)).toBe('±0円');
    expect(formatDiff(-3652, 0)).toBe('▲3,652円');
    expect(formatDiff(3652, 0)).toBe('+3,652円');
  });
});

describe('飲酒に関する注記', () => {
  it('20歳未満の飲酒防止の注記を持っている（飲酒を勧めるページにしない）', () => {
    expect(MINOR_DRINKING_NOTE).toContain('20歳未満');
  });
});
