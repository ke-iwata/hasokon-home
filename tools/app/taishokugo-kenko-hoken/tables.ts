/**
 * 退職後の健康保険 比較ページの本文の例（行データ）。
 *
 * 仕様: docs/features/taishokugo-kenko-hoken-hikaku.md（「例」）
 *
 * 本文に額を手で書くと料率を更新したときに本文だけ古くなるので、必ず calc() から作る
 * （docs/features/thin-tool-content.md）。
 *
 * 例：45歳・東京（協会けんぽ）・単身・月給50万円（前年も同じ）で 2026-12-31 に退職
 */

import {
  calc,
  defaultApplyDate,
  NO_FAMILY,
  type CalcInput,
  type LeaveKind,
} from '@/lib/taishokugo-kenko-hoken';

const LEAVE = { year: 2026, month: 12, day: 31 };

function exampleInput(leaveKind: LeaveKind): CalcInput {
  return {
    leaveDate: LEAVE,
    birthDate: { year: 1981, month: 6, day: 15 },
    monthlySalary: 500_000,
    health: { kind: 'kyokai', prefecture: '東京都' },
    ninkeiEligible: true,
    salaryPrevYear: 6_000_000,
    salaryLeaveYear: 6_000_000,
    salaryAfter: 0,
    otherIncome: 0,
    leaveKind,
    family: NO_FAMILY,
    fuyo: {
      available: false,
      supporter: 'spouse',
      benefitDaily: 0,
      applyDate: defaultApplyDate(LEAVE),
      restrictionMonths: 1,
      prescribedDays: 90,
    },
  };
}

export const EXAMPLE_SELF = calc(exampleInput('self'));
export const EXAMPLE_COMPANY = calc(exampleInput('company'));

export interface ExampleRow {
  period: string;
  ninkei: number;
  kokuhoSelf: number;
  kokuhoCompany: number;
}

const at = (r: typeof EXAMPLE_SELF, ym: string) => r.months.find((m) => m.ym === ym)!;

/** 年度ごとの代表の月（1〜3月・翌年度・翌々年度） */
export const EXAMPLE_ROWS: ExampleRow[] = [
  ['2027年1〜3月', '2027-01'],
  ['2027年4月〜2028年3月', '2027-04'],
  ['2028年4月〜12月', '2028-04'],
].map(([period, ym]) => ({
  period,
  ninkei: at(EXAMPLE_SELF, ym).ninkei ?? 0,
  kokuhoSelf: at(EXAMPLE_SELF, ym).kokuho,
  kokuhoCompany: at(EXAMPLE_COMPANY, ym).kokuho,
}));
