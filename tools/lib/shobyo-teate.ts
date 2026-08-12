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
 * - 被保険者期間が12ヶ月未満の場合は、その期間の標準報酬月額の平均と
 *   「全被保険者の標準報酬月額の平均額」の低い方を使う（令和7年4月1日以降は32万円）
 *
 * 標準報酬月額の等級表は '@/lib/shaho-grades' の standardMonthly を再利用。
 * 【データ更新箇所】等級表が改定されたら shaho-grades.ts の GRADES を、
 * 全被保険者の標準報酬月額の平均額が改定されたら SHORT_TENURE_CAP を更新する
 */

import { standardMonthly } from '@/lib/shaho-grades';

/** 待期期間（連続した暦日数） */
export const TAIKI_DAYS = 3;

/**
 * 被保険者期間が12ヶ月未満のときに上限として使う「全被保険者の標準報酬月額の平均額」。
 * 協会けんぽ・支給開始日が令和7年4月1日以降は32万円（それ以前は30万円）。
 * 健康保険組合では別の額が定められている場合がある。
 */
export const SHORT_TENURE_CAP = 320_000;

export interface ShobyoTeateInput {
  /** 直近12ヶ月の平均月収（額面・円） */
  monthlyIncome: number;
  /** 会社を休んだ日数（連続・土日祝を含む暦日） */
  restDays: number;
  /**
   * 支給開始日以前の被保険者期間が12ヶ月未満か。
   * true の場合、標準報酬月額は SHORT_TENURE_CAP が上限になる
   */
  under12Months?: boolean;
}

export interface ShobyoTeateResult {
  /** 算定に使った標準報酬月額（円） */
  standardMonthly: number;
  /** 被保険者期間12ヶ月未満の上限（SHORT_TENURE_CAP）が適用されたか */
  capped: boolean;
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

  // 被保険者期間が12ヶ月未満なら、全被保険者の平均額を超えない額で算定する
  const graded = standardMonthly(income);
  const capped = input.under12Months === true && graded > SHORT_TENURE_CAP;
  const std = capped ? SHORT_TENURE_CAP : graded;

  // 標準報酬日額: ÷30 の10円未満四捨五入（=10円単位に丸め）
  const standardDaily = Math.round(std / 30 / 10) * 10;
  // 日額: ×2/3 の1円未満四捨五入
  const dailyAmount = Math.round((standardDaily * 2) / 3);
  // 待期3日間（最初の連続3日）は支給されない
  const payableDays = Math.max(0, restDays - TAIKI_DAYS);

  return {
    standardMonthly: std,
    capped,
    standardDaily,
    dailyAmount,
    payableDays,
    total: dailyAmount * payableDays,
    monthlyEstimate: dailyAmount * 30,
  };
}
