/**
 * 給与と年金の控除 280万円上限 計算機ページの早見表の行データ。
 *
 * 仕様: docs/features/kyuyo-nenkin-kojo-280man.md（ページ構成「帯ごとの早見表」）
 *
 * 本文に額を手で書かないため、必ず lib の関数から作る。一致は tests/kyuyo-nenkin-kojo.test.ts が見張る。
 */

import { calc, thresholdSalary } from '@/lib/kyuyo-nenkin-kojo';

export interface ThresholdRow {
  /** 公的年金等の収入（年額） */
  pension: number;
  /** 65歳以上：上限にかかり始める給与（万円に切り上げ。かからなければ null） */
  over65: number | null;
  /** 65歳未満：同じ */
  under65: number | null;
}

const PENSIONS = [1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000, 5_000_000];

export const THRESHOLD_ROWS: ThresholdRow[] = PENSIONS.map((pension) => ({
  pension,
  over65: thresholdSalary({ pension, age65: true, otherIncome: 0 }),
  under65: thresholdSalary({ pension, age65: false, otherIncome: 0 }),
}));

/** 本文の計算例（財務省の例：給与900万円・年金200万円・65歳以上） */
export const MOF_EXAMPLE = calc({ salary: 9_000_000, pension: 2_000_000, age65: true, otherIncome: 0 });
