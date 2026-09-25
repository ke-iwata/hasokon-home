/**
 * 子ども・子育て支援金ページの早見表の行データ。
 *
 * 仕様: docs/features/thin-tool-content.md
 *
 * 料率は年度ごとに変わる（2027年度以降は未確定）。本文に額を手で書くと、
 * FISCAL_YEARS を更新したときに本文だけ古くなるので、必ず calcShienkin() から描画する。
 * 一致は tests/kosodate-shienkin.test.ts が見張る
 *
 * 「年収 × 年度 × 月額・年額」を1枚の表に組むと7列になってスマホで横スクロールが出るため、
 * 表を2枚に分けている（仕様の共通の約束8）:
 * - 表A（CONFIRMED_ROWS）: 確定year の年収別。4列
 * - 表B（TREND_ROWS）: 年度ごとの推移。年収を1つに絞って3列
 */

import { calcShienkin, FISCAL_YEARS, GRADES, standardMonthly } from '@/lib/kosodate-shienkin';

/**
 * 健康保険の標準報酬月額の最高等級（円）。
 * 早見表は代表的な等級だけに絞っているので、「表の最後の行が上限ではない」ことを
 * 本文に出すために使う（厚生年金の上限65万円と混同しないように）。
 */
export const TOP_STANDARD_MONTHLY = GRADES[GRADES.length - 1][1];

/** 早見表に出す月収（額面・円）。月収20万〜65万円を固定で選ぶ */
export const TABLE_MONTHLY_INCOMES = [
  200_000, 250_000, 300_000, 350_000, 400_000, 500_000, 600_000, 650_000,
] as const;

/** 年度ごとの推移（表B）で使う月収。標準報酬月額30万円の等級に入る額 */
export const TREND_MONTHLY_INCOME = 300_000;

/**
 * 表Aに使う年度（status が「確定」のうち最も新しいもの）。
 * 2027年度が確定したら自動でそちらに切り替わる。
 */
export const CONFIRMED_YEAR =
  FISCAL_YEARS.filter((y) => y.status === '確定').at(-1) ?? FISCAL_YEARS[0];

export interface ConfirmedRow {
  /** 年収の目安（円・月収×12。賞与は含めない） */
  yearlyIncome: number;
  /** 標準報酬月額（円） */
  standardMonthly: number;
  /** 毎月の本人負担額（円） */
  monthly: number;
  /** 年間の本人負担額（円・月額×12） */
  yearly: number;
}

/** 表A: 年収別の本人負担額（確定年度・4列） */
export const CONFIRMED_ROWS: ConfirmedRow[] = TABLE_MONTHLY_INCOMES.map((monthlyIncome) => {
  const row = calcShienkin(monthlyIncome).find((r) => r.fiscalYear === CONFIRMED_YEAR.fiscalYear);
  if (!row) throw new Error(`calcShienkin に ${CONFIRMED_YEAR.fiscalYear} 年度の行がない`);
  return {
    yearlyIncome: monthlyIncome * 12,
    standardMonthly: standardMonthly(monthlyIncome),
    monthly: row.monthly,
    yearly: row.yearly,
  };
});

export interface TrendRow {
  fiscalYear: number;
  era: string;
  /** 支援金率（%表記の数値 例: 0.23） */
  ratePercent: number;
  status: '確定' | '見込み' | '政府試算';
  /** TREND_MONTHLY_INCOME のときの毎月の本人負担額（円） */
  monthly: number;
}

/** 表B: 年度ごとの推移（月収を1つに絞った3列） */
export const TREND_ROWS: TrendRow[] = calcShienkin(TREND_MONTHLY_INCOME).map((r) => ({
  fiscalYear: r.fiscalYear,
  era: r.era,
  ratePercent: r.ratePercent,
  status: r.status,
  monthly: r.monthly,
}));

/** 表Bに未確定の年度（見込み・政府試算）が含まれるか。注記を出すかの判定に使う */
export const HAS_UNCONFIRMED_TREND = TREND_ROWS.some((r) => r.status !== '確定');
