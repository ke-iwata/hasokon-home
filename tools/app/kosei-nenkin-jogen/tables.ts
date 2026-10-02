/**
 * 厚生年金 上限引き上げ 計算機ページの早見表の行データ。
 *
 * 仕様: docs/features/kosei-nenkin-hyojun-hoshu-jogen.md（表示「早見表」）
 *
 * 本文に額を手で書かないため、必ず premiumDiff() から作る。一致は tests/kosei-nenkin-jogen.test.ts が見張る。
 */

import { premiumDiff, type StagePoint } from '@/lib/kosei-nenkin-jogen';

export interface HayamihyoRow {
  /** 報酬月額 */
  salary: number;
  /** 現行・2027-09・2028-09・2029-09 */
  points: StagePoint[];
}

const SALARIES = [650_000, 670_000, 700_000, 730_000, 800_000, 1_000_000];

export const HAYAMIHYO_ROWS: HayamihyoRow[] = SALARIES.map((salary) => ({
  salary,
  points: premiumDiff(salary),
}));
