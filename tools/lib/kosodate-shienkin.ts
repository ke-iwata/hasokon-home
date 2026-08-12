/**
 * 子ども・子育て支援金 計算ロジック
 *
 * 一次情報:
 * - こども家庭庁「子ども・子育て支援金制度について」
 *   https://www.cfa.go.jp/policies/kodomokosodateshienkinseido
 * - 2026年度（令和8年度）の支援金率は全国一律 0.23%（被用者保険）・労使折半
 * - 2027年度は総額8,000億円計画にもとづく見込み値、2028年度は政府試算 0.4%
 *
 * 標準報酬月額の等級表は lib/shaho-grades.ts に移した（支援金・傷病手当金・働き損の
 * 3つのツールが同じ表を使うため）。ここからの再エクスポートは残してあるので、
 * `@/lib/kosodate-shienkin` から GRADES / standardMonthly を import しても従来どおり動く。
 *
 * 【データ更新箇所】料率が確定・変更されたら FISCAL_YEARS を更新する。
 * 等級表は lib/shaho-grades.ts の GRADES
 */

import { GRADES, roundPremium, standardMonthly } from '@/lib/shaho-grades';

export { GRADES, roundPremium, standardMonthly };

export interface FiscalYearRate {
  fiscalYear: number;
  era: string;
  /** 支援金率（労使折半前）例: 0.0023 = 0.23% */
  rate: number;
  status: '確定' | '見込み' | '政府試算';
  note: string;
}

export const FISCAL_YEARS: FiscalYearRate[] = [
  {
    fiscalYear: 2026,
    era: '令和8年度',
    rate: 0.0023,
    status: '確定',
    note: '全国一律0.23%（被用者保険）。労使折半のため本人負担は0.115%。',
  },
  {
    fiscalYear: 2027,
    era: '令和9年度',
    rate: 0.003,
    status: '見込み',
    note: '支援金総額8,000億円（政府計画）にもとづく推計値。料率は未確定。',
  },
  {
    fiscalYear: 2028,
    era: '令和10年度',
    rate: 0.004,
    status: '政府試算',
    note: 'こども家庭庁の試算資料にもとづく想定値（0.4%・本人負担0.2%）。',
  },
];

/** 標準賞与額の年度上限（健康保険と同じ573万円） */
export const BONUS_CAP_YEARLY = 5_730_000;

export interface ShienkinResult {
  fiscalYear: number;
  era: string;
  status: FiscalYearRate['status'];
  note: string;
  /** 支援金率（%表記の数値 例: 0.23） */
  ratePercent: number;
  /** 算定に使った標準報酬月額 */
  standardMonthly: number;
  /** 毎月の本人負担額（円） */
  monthly: number;
  /** 年間賞与からの本人負担額（円） */
  bonus: number;
  /** 年間合計（円） */
  yearly: number;
}

/**
 * 本人負担額を年度ごとに計算する
 * @param monthlyIncome 月収（額面・円）
 * @param bonusYearly   年間賞与（額面・円）
 */
export function calcShienkin(monthlyIncome: number, bonusYearly = 0): ShienkinResult[] {
  const std = standardMonthly(Math.max(0, monthlyIncome));
  // 標準賞与額: 1,000円未満切り捨て・年度累計573万円上限
  const stdBonus = Math.min(
    Math.floor(Math.max(0, bonusYearly) / 1000) * 1000,
    BONUS_CAP_YEARLY
  );
  return FISCAL_YEARS.map((y) => {
    const monthly = roundPremium((std * y.rate) / 2);
    const bonus = roundPremium((stdBonus * y.rate) / 2);
    return {
      fiscalYear: y.fiscalYear,
      era: y.era,
      status: y.status,
      note: y.note,
      ratePercent: y.rate * 100,
      standardMonthly: std,
      monthly,
      bonus,
      yearly: monthly * 12 + bonus,
    };
  });
}
