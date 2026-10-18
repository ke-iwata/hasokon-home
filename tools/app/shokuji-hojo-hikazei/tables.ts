/**
 * 本文の例の数字。額を本文に手で書かず、lib の判定から作る
 * （docs/features/thin-tool-content.md）。
 */
import { LIMIT_FROM_2026_04, judgeShokuji, type MealRow } from '@/lib/shokuji-hojo-hikazei';

/** タックスアンサー No.2594 の例：価額 13,000 円・本人 6,000 円 */
export const EXAMPLE_2594 = (() => {
  const rows: MealRow[] = [{ kind: 'reduced', price: 13000, selfPay: 6000, count: 1 }];
  return { rows, result: judgeShokuji(rows, 'from-2026-04') };
})();

/** タックスアンサー No.2594-1 の例：配達（8%）900 円・本人 450 円 × 15 回、店内（10%）同 × 5 回 */
export const EXAMPLE_2594_1 = (() => {
  const reduced: MealRow = { kind: 'reduced', price: 900, selfPay: 450, count: 15 };
  const standard: MealRow = { kind: 'standard', price: 900, selfPay: 450, count: 5 };
  const result = judgeShokuji([reduced, standard], 'from-2026-04');
  return {
    reduced,
    standard,
    result,
    /** 8% 分の税抜き（小数のまま） */
    reducedExcl: (result.companyByKind.reduced * 100) / 108,
    /** 10% 分の税抜き（小数のまま） */
    standardExcl: (result.companyByKind.standard * 100) / 110,
  };
})();

/** 1 日あたりの目安（7,500 円 ÷ 勤務日数）の行 */
export const PER_DAY_ROWS = [18, 20, 22].map((days) => ({
  days,
  /** 税抜きの会社負担の 1 日あたり（円未満切り捨て） */
  perDay: Math.floor(LIMIT_FROM_2026_04 / days),
  /** 税込みに直した目安：8%（弁当） */
  perDay8: Math.floor((LIMIT_FROM_2026_04 * 108) / 100 / days),
  /** 税込みに直した目安：10%（社員食堂） */
  perDay10: Math.floor((LIMIT_FROM_2026_04 * 110) / 100 / days),
}));
