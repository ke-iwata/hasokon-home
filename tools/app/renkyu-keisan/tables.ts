/**
 * 連休計算機ページの「2026〜2027 年の具体例」の行データ。
 *
 * 仕様: docs/features/renkyu-keisan.md（解説の表は計算結果から生成し、手書きしない）
 *
 * 本文に日付を手で書くと、祝日の表を直したときに本文だけ古くなるので、
 * 必ず findPlans() から作る。一致は tests/renkyu-keisan.test.ts が見張る。
 * 条件は画面の既定（土日休み・年末年始休暇 12/29〜1/3・夏季休暇なし）。
 */

import { DEFAULT_RULE, findPlans, type Plan, type Season } from '@/lib/renkyu-keisan';

export interface ExampleSpec {
  /** 「年 N」（年末年始は N 年 12 月〜N+1 年 1 月） */
  year: number;
  season: Season;
  /** 使う有給の日数 */
  leave: number;
}

export interface ExampleRow extends ExampleSpec {
  /** 有給をこの日数だけ使ったときの最長の案（同じ長さなら開始日の早い順にすべて） */
  plans: Plan[];
}

export const EXAMPLE_SPECS: ExampleSpec[] = [
  { year: 2026, season: '年末年始', leave: 1 },
  { year: 2026, season: '年末年始', leave: 2 },
  { year: 2027, season: 'GW', leave: 1 },
  { year: 2027, season: 'GW', leave: 2 },
  { year: 2027, season: 'GW', leave: 3 },
  { year: 2027, season: 'シルバーウィーク', leave: 1 },
  { year: 2027, season: '年末年始', leave: 2 },
];

export const EXAMPLE_ROWS: ExampleRow[] = EXAMPLE_SPECS.map((spec) => ({
  ...spec,
  plans: findPlans(spec.year, spec.leave, DEFAULT_RULE).filter(
    (p) => p.season === spec.season && p.leaveDays.length === spec.leave,
  ),
}));

/** 表の「時期」の列（'2026-27 年末年始' '2027 GW' など） */
export function seasonCaption(row: ExampleSpec): string {
  if (row.season === '年末年始') return `${row.year}-${String(row.year + 1).slice(2)} 年末年始`;
  return `${row.year} ${row.season}`;
}
