/**
 * 傷病手当金ページの「月収別の支給額の早見表」の行データ。
 *
 * 仕様: docs/features/thin-tool-content.md
 *
 * 本文に出す数字を手で書くと、等級表や上限額が改定されたときに
 * 計算機の結果と本文が食い違う（#244 で社保の料率で実際に起きた）。
 * 行に出す額は必ず lib/kenpo-daily-amount.ts の kenpoDailyAmount() から描画する。
 *
 * 標準報酬月額は50等級あるが、全部出すとスマホで長大になるので
 * 月収15万〜65万円の代表的な8等級を固定で選んでいる。
 * 一致は tests/shobyo-teate.test.ts が見張る
 */

import { kenpoDailyAmount, SHORT_TENURE_CAP } from '@/lib/kenpo-daily-amount';

/**
 * 早見表に出す標準報酬月額（円）。等級表にある額をそのまま選んでいるので、
 * 「標準報酬月額」の列にそのまま出せる（丸めが起きない）。
 */
export const TABLE_STANDARD_MONTHLY = [
  150_000, 200_000, 260_000, 300_000, 360_000, 410_000, 500_000, 650_000,
] as const;

export interface DailyRow {
  /** 標準報酬月額（円） */
  standardMonthly: number;
  /** 1日あたりの支給額（円） */
  dailyAmount: number;
  /** 30日分の目安（円） */
  monthly30: number;
}

/** 早見表の行（標準報酬月額／1日あたり／30日分の3列） */
export const DAILY_ROWS: DailyRow[] = TABLE_STANDARD_MONTHLY.map((standardMonthly) => {
  const { dailyAmount } = kenpoDailyAmount(standardMonthly);
  return { standardMonthly, dailyAmount, monthly30: dailyAmount * 30 };
});

/**
 * 被保険者期間が12ヶ月未満のときの日額の上限（円）。
 * SHORT_TENURE_CAP を同じ計算に通して出すので、上限額が改定されても本文が追随する。
 */
export const CAPPED_DAILY_AMOUNT = kenpoDailyAmount(SHORT_TENURE_CAP, true).dailyAmount;
