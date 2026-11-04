/**
 * 本文の早見表と例の数字。額を本文に手で書かず、lib の関数から作る
 * （docs/features/thin-tool-content.md）。
 */
import { assess, schedule, type AssetRow } from '@/lib/shokyaku-shisanzei';

/** 早見表の取得価額と耐用年数 */
export const HAYAMI_COSTS = [500_000, 1_000_000, 2_000_000];
export const HAYAMI_LIVES = [4, 5, 10];
export const HAYAMI_YEARS = 5;

/** 取得価額 × 耐用年数の「1年目〜5年目の評価額」（取得年は評価額に効かないので仮に2025年） */
export const HAYAMI_ROWS = HAYAMI_COSTS.flatMap((cost) =>
  HAYAMI_LIVES.map((life) => ({
    cost,
    life,
    values: schedule(cost, { year: 2025, month: 6 }, life, HAYAMI_YEARS).map((r) => r.value),
  })),
);

/** 東京都主税局の例（令和8年度）：舗装路面・応接セット・看板 */
export const TOKYO_EXAMPLE = (() => {
  const rows: AssetRow[] = [
    { name: '舗装路面', cost: 2_700_000, acquired: { year: 2025, month: 9 }, life: 15, treatment: 'normal' },
    { name: '応接セット', cost: 500_000, acquired: { year: 2024, month: 11 }, life: 8, treatment: 'normal' },
    { name: '看板', cost: 1_655_300, acquired: { year: 2024, month: 2 }, life: 3, treatment: 'normal' },
  ];
  return { rows, result: assess(rows, 2026) };
})();
