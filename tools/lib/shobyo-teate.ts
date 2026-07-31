/**
 * 傷病手当金 計算ロジック
 *
 * 一次情報:
 * - 全国健康保険協会（協会けんぽ）「病気やケガで会社を休んだとき（傷病手当金）」
 *   https://www.kyoukaikenpo.or.jp/g6/cat620/r306/
 * - 1日あたりの支給額 = 支給開始日以前12ヶ月の各月の標準報酬月額の平均 ÷ 30日 × 2/3
 *   （÷30 の段階で10円未満四捨五入、×2/3 の段階で1円未満四捨五入）
 * - 連続3日間の待期期間（土日祝・有給を含む）を経て4日目から支給
 * - 支給期間は支給開始日から通算1年6ヶ月（2022年1月改正で「通算」に変更）
 *
 * 標準報酬月額の等級表は '@/lib/kosodate-shienkin' の standardMonthly を再利用。
 * 【データ更新箇所】等級表が改定されたら kosodate-shienkin.ts の GRADES を更新する
 */

import { standardMonthly } from '@/lib/kosodate-shienkin';

/** 待期期間（連続した暦日数） */
export const TAIKI_DAYS = 3;

export interface ShobyoTeateInput {
  /** 直近12ヶ月の平均月収（額面・円） */
  monthlyIncome: number;
  /** 会社を休んだ日数（連続・土日祝を含む暦日） */
  restDays: number;
}

export interface ShobyoTeateResult {
  /** 算定に使った標準報酬月額（円） */
  standardMonthly: number;
  /** 標準報酬日額（標準報酬月額÷30、10円未満四捨五入・円） */
  standardDaily: number;
  /** 傷病手当金の日額（標準報酬日額×2/3、1円未満四捨五入・円） */
  dailyAmount: number;
  /** 支給対象日数（休業日数から待期3日を除いた日数） */
  payableDays: number;
  /** 支給総額（日額×支給対象日数・円） */
  total: number;
  /** 1ヶ月休んだ場合の月額目安（日額×30・円） */
  monthlyEstimate: number;
}

/**
 * 傷病手当金の日額・支給額を計算する
 * @param input 平均月収と休業日数
 */
export function calcShobyoTeate(input: ShobyoTeateInput): ShobyoTeateResult {
  const income = Math.max(0, input.monthlyIncome);
  const restDays = Math.max(0, Math.floor(input.restDays));

  const std = standardMonthly(income);
  // 標準報酬日額: ÷30 の10円未満四捨五入（=10円単位に丸め）
  const standardDaily = Math.round(std / 30 / 10) * 10;
  // 日額: ×2/3 の1円未満四捨五入
  const dailyAmount = Math.round((standardDaily * 2) / 3);
  // 待期3日間（最初の連続3日）は支給されない
  const payableDays = Math.max(0, restDays - TAIKI_DAYS);

  return {
    standardMonthly: std,
    standardDaily,
    dailyAmount,
    payableDays,
    total: dailyAmount * payableDays,
    monthlyEstimate: dailyAmount * 30,
  };
}
