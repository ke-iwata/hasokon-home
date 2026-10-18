import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIMIT_BEFORE,
  LIMIT_FROM_2026_04,
  YASHOKU_BEFORE,
  YASHOKU_FROM_2026_04,
  judgeCash,
  judgeShokuji,
  judgeYashoku,
  parseCount,
  passesAfterProportionalReduction,
  taxExclusiveFloor10,
  type MealRow,
  type YashokuInput,
} from '@/lib/shokuji-hojo-hikazei';
import { EXAMPLE_2594, EXAMPLE_2594_1 } from '@/app/shokuji-hojo-hikazei/tables';

/**
 * 仕様: docs/features/shokuji-hojo-hikazei.md
 * 一次資料: 国税庁 タックスアンサー No.2594・No.2594-1〔令和8年4月1日現在法令等〕、
 * 個別通達（昭和59年7月26日直法6-5 ほか、令和8年3月31日改正）
 */

const one = (kind: MealRow['kind'], price: number, selfPay: number, count = 1): MealRow => ({
  kind,
  price,
  selfPay,
  count,
});

describe('限度額', () => {
  it('令和8年4月から 7,500 円・夜食代 650 円、それより前は 3,500 円・300 円', () => {
    expect(LIMIT_FROM_2026_04).toBe(7500);
    expect(LIMIT_BEFORE).toBe(3500);
    expect(YASHOKU_FROM_2026_04).toBe(650);
    expect(YASHOKU_BEFORE).toBe(300);
  });
});

describe('国税庁の例', () => {
  it('No.2594：価額 13,000 円・本人 6,000 円 → 半分未満なので課税、7,000 円が給与', () => {
    const r = judgeShokuji([one('reduced', 13000, 6000)], 'from-2026-04');
    expect(r.cond1).toBe(false);
    expect(r.cond2).toBe(true);
    expect(r.hikazei).toBe(false);
    expect(r.taxableAmount).toBe(7000);
    expect(EXAMPLE_2594.result.taxableAmount).toBe(7000);
  });

  it('No.2594-1：配達 8% と店内 10% の混在 → 税抜き 8,290 円で課税、給与は税込み 9,000 円', () => {
    const r = judgeShokuji(
      [one('reduced', 900, 450, 15), one('standard', 900, 450, 5)],
      'from-2026-04',
    );
    expect(r.companyByKind.reduced).toBe(6750);
    expect(r.companyByKind.standard).toBe(2250);
    expect(r.companyTaxExcl).toBe(8290);
    expect(r.cond1).toBe(true);
    expect(r.cond2).toBe(false);
    expect(r.taxableAmount).toBe(9000);
    expect(r.mixedRates).toBe(true);
    expect(EXAMPLE_2594_1.result.companyTaxExcl).toBe(8290);
  });
});

describe('境目', () => {
  it('本人負担がちょうど半分 → 条件 1 を満たす', () => {
    expect(judgeShokuji([one('standard', 500, 250, 10)], 'from-2026-04').cond1).toBe(true);
    expect(judgeShokuji([one('standard', 501, 250, 10)], 'from-2026-04').cond1).toBe(false);
  });

  it('税抜き会社負担がちょうど 7,500 円 → 非課税、7,510 円 → 課税', () => {
    const at = judgeShokuji([one('exempt', 15000, 7500)], 'from-2026-04');
    expect(at.companyTaxExcl).toBe(7500);
    expect(at.hikazei).toBe(true);
    const over = judgeShokuji([one('exempt', 15020, 7510)], 'from-2026-04');
    expect(over.companyTaxExcl).toBe(7510);
    expect(over.hikazei).toBe(false);
    expect(over.taxableAmount).toBe(7510);
  });

  it('本人が全額払っていれば給与になる額は無い', () => {
    const r = judgeShokuji([one('standard', 500, 500, 20)], 'from-2026-04');
    expect(r.noCompanyBurden).toBe(true);
    expect(r.hikazei).toBe(true);
    expect(r.taxableAmount).toBe(0);
  });
});

describe('端数（10 円未満切り捨て）', () => {
  it('10% だけで会社負担 税込み 8,250 円 → 7,500 円（非課税）', () => {
    const r = judgeShokuji([one('standard', 16500, 8250)], 'from-2026-04');
    expect(r.companyTaxExcl).toBe(7500);
    expect(r.hikazei).toBe(true);
  });

  it('10% だけで会社負担 税込み 8,261 円 → 7,510 円（課税）', () => {
    const r = judgeShokuji([one('standard', 16522, 8261)], 'from-2026-04');
    expect(r.companyTaxIncl).toBe(8261);
    expect(r.companyTaxExcl).toBe(7510);
    expect(r.hikazei).toBe(false);
  });

  it('8,260 円は 7,509.09… → 7,500 円で非課税（小数の誤差で落とさない）', () => {
    expect(taxExclusiveFloor10({ reduced: 0, standard: 8260, exempt: 0 })).toBe(7500);
    expect(taxExclusiveFloor10({ reduced: 8100, standard: 0, exempt: 0 })).toBe(7500);
  });
});

describe('税率ごとに合計してから換算する', () => {
  it('行ごとに換算・切り捨てすると非課税に見える組み合わせでも、合計してから換算して課税', () => {
    // 1 行 4,135 円（10%）→ 3,759.09… → 行ごとに切り捨てると 3,750 円 × 2 = 7,500 円
    const perRow = taxExclusiveFloor10({ reduced: 0, standard: 4135, exempt: 0 }) * 2;
    expect(perRow).toBe(7500);
    const r = judgeShokuji(
      [one('standard', 8270, 4135), one('standard', 8270, 4135)],
      'from-2026-04',
    );
    // 合計 8,270 円 → 7,518.18… → 7,510 円
    expect(r.companyTaxExcl).toBe(7510);
    expect(r.hikazei).toBe(false);
  });
});

describe('基準日（この食事を出した期間）', () => {
  it('同じ会社負担でも 3 月 31 日以前は 3,500 円、4 月 1 日以後は 7,500 円で判定が変わる', () => {
    const rows = [one('standard', 500, 250, 20)]; // 会社負担 5,000 円 → 税抜き 4,540 円
    const after = judgeShokuji(rows, 'from-2026-04');
    const before = judgeShokuji(rows, 'before-2026-04');
    expect(after.companyTaxExcl).toBe(4540);
    expect(after.hikazei).toBe(true);
    expect(after.hikazeiBeforeReform).toBe(false);
    expect(before.limit).toBe(3500);
    expect(before.hikazei).toBe(false);
    expect(before.taxableAmount).toBe(5000);
    expect(before.hikazeiBeforeReform).toBeUndefined();
  });
});

describe('夜食代（お金で渡す）', () => {
  const base: YashokuInput = {
    amountPerShift: 650,
    period: 'from-2026-04',
    lateNightWorker: true,
    fixedPerShift: true,
    hardToProvide: true,
  };
  const v = (amount: number, extra: Partial<YashokuInput> = {}) =>
    judgeYashoku({ ...base, amountPerShift: amount, ...extra }).verdict;

  it('650 円 → 非課税／651 円・715 円 → 保留／716 円 → 課税', () => {
    expect(v(650)).toBe('hikazei');
    expect(v(651)).toBe('pending');
    expect(v(702)).toBe('pending');
    expect(v(715)).toBe('pending');
    expect(v(716)).toBe('kazei');
  });

  it('保留の帯の端は 8% で 702 円・10% で 715 円', () => {
    const r = judgeYashoku(base);
    expect(r.maxWith8).toBe(702);
    expect(r.maxWith10).toBe(715);
  });

  it('深夜勤務者でない・定額でない・現物で出せる → 課税', () => {
    expect(v(500, { lateNightWorker: false })).toBe('kazei');
    expect(v(500, { fixedPerShift: false })).toBe('kazei');
    expect(v(500, { hardToProvide: false })).toBe('kazei');
  });

  it('3 月 31 日以前の支給は 300 円で同じ 3 段（300・301〜330・331）', () => {
    const p = { period: 'before-2026-04' as const };
    expect(v(300, p)).toBe('hikazei');
    expect(v(301, p)).toBe('pending');
    expect(v(330, p)).toBe('pending');
    expect(v(331, p)).toBe('kazei');
    expect(judgeYashoku({ ...base, ...p }).maxWith8).toBe(324);
  });

  it('夜食代でないお金の食事代は常に課税', () => {
    expect(judgeCash({ yashoku: false })).toBe('kazei');
    expect(judgeCash({ yashoku: true, ...base, amountPerShift: 600 })).toBe('hikazei');
  });
});

describe('あと何円で非課税か', () => {
  it('10% だけ：返した額だけ減らすと非課税、1 円少ないと課税のまま', () => {
    const rows = [one('standard', 1000, 500, 22)]; // 会社負担 11,000 円
    const r = judgeShokuji(rows, 'from-2026-04');
    expect(r.hikazei).toBe(false);
    const d = r.reduceToPass!;
    const at = judgeShokuji([one('exempt', r.companyTaxIncl - d, 0)], 'from-2026-04');
    expect(taxExclusiveFloor10({ reduced: 0, standard: r.companyTaxIncl - d, exempt: 0 })).toBeLessThanOrEqual(7500);
    expect(taxExclusiveFloor10({ reduced: 0, standard: r.companyTaxIncl - d + 1, exempt: 0 })).toBeGreaterThan(7500);
    expect(at.companyTaxIncl).toBe(8260);
    expect(d).toBe(2740);
  });

  it('8,261 円（10%）ならあと 1 円', () => {
    expect(judgeShokuji([one('standard', 16522, 8261)], 'from-2026-04').reduceToPass).toBe(1);
  });

  it('8% と 10% の混在：割合を変えずに減らした場合の境目', () => {
    const r = judgeShokuji(
      [one('reduced', 900, 450, 15), one('standard', 900, 450, 5)],
      'from-2026-04',
    );
    const d = r.reduceToPass!;
    expect(passesAfterProportionalReduction(r.companyByKind, d, 7500)).toBe(true);
    expect(passesAfterProportionalReduction(r.companyByKind, d - 1, 7500)).toBe(false);
    // 独立に検算：9,000 円を (9,000 − d) / 9,000 倍したときの税抜き額
    const excl = (c8: number, c10: number) => (c8 * 100) / 108 + (c10 * 100) / 110;
    const scale = (x: number) => ((9000 - x) / 9000);
    expect(excl(6750 * scale(d), 2250 * scale(d))).toBeLessThan(7510);
    expect(excl(6750 * scale(d - 1), 2250 * scale(d - 1))).toBeGreaterThanOrEqual(7510);
  });

  it('1 食あたりの会社負担の上限（税率が 1 種類のとき）', () => {
    const r = judgeShokuji([one('standard', 1000, 500, 22)], 'from-2026-04');
    // p × 22 × 100/110 < 7,510 → p ≤ 375
    expect(r.perMealCompanyMax).toBe(375);
    expect(taxExclusiveFloor10({ reduced: 0, standard: 375 * 22, exempt: 0 })).toBeLessThanOrEqual(7500);
    expect(taxExclusiveFloor10({ reduced: 0, standard: 376 * 22, exempt: 0 })).toBeGreaterThan(7500);
    const mixed = judgeShokuji(
      [one('reduced', 900, 450, 15), one('standard', 900, 450, 5)],
      'from-2026-04',
    );
    expect(mixed.perMealCompanyMax).toBeUndefined();
  });

  it('条件 1 を外しているときは本人負担の不足を返す', () => {
    const r = judgeShokuji([one('reduced', 13000, 6000)], 'from-2026-04');
    expect(r.selfShortfall).toBe(500);
    expect(r.selfPayPerMealNeeded).toBe(6500);
  });
});

describe('入力の読み取り', () => {
  it('全角数字・カンマを半角の整数に直す', () => {
    expect(parseCount('１２，０００')).toBe(12000);
    expect(parseCount('450')).toBe(450);
    expect(parseCount('')).toBe(0);
    expect(parseCount('abc')).toBe(0);
  });
});

describe('ページ', () => {
  const page = readFileSync(new URL('../app/shokuji-hojo-hikazei/page.tsx', import.meta.url), 'utf8');
  const calc = readFileSync(
    new URL('../app/shokuji-hojo-hikazei/Calculator.tsx', import.meta.url),
    'utf8',
  );

  it('民間の食事補助サービスの名前を出さない', () => {
    for (const name of ['チケットレストラン', 'エデンレッド', 'menu', 'ごちめし', 'びずめし', 'snaq.me', 'OFFICE DE YASAI']) {
      expect(page).not.toContain(name);
      expect(calc).not.toContain(name);
    }
  });

  it('出典に在宅勤務FAQの問12・問13と質疑応答事例 03/44 を示す', () => {
    expect(page).toContain('0020012-080.pdf');
    expect(page).toContain('問12');
    expect(page).toContain('問13');
    expect(page).toContain('shitsugi/gensen/03/44.htm');
  });

  it('金額・食数の欄は数字のキーボードを出す', () => {
    expect(calc).toContain('inputMode="numeric"');
    expect(calc).toContain('pattern="[0-9]*"');
  });
});
