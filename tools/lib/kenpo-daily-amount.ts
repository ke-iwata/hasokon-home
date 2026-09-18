/**
 * 健康保険の「1日あたりの支給額（日額）」の算定
 *
 * 一次情報:
 * - 全国健康保険協会（協会けんぽ）「病気やケガで会社を休んだとき（傷病手当金）」
 *   https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/
 *
 * 傷病手当金（健康保険法99条2項）と出産手当金（同102条2項が99条2項を準用）は
 * **日額の出し方が同一**なので、2ツールが同じ数字を2か所に持たないようにここへ切り出した。
 * もとは lib/shobyo-teate.ts にあり、あちらは互換のため再エクスポートしている。
 *
 * - 日額 = 支給開始日以前12か月の各月の標準報酬月額の平均 ÷ 30（10円未満四捨五入）× 2/3（1円未満四捨五入）
 * - 被保険者期間が12か月未満なら「その平均」と「全被保険者の標準報酬月額の平均額」の低いほう
 *
 * 標準報酬月額の等級表は '@/lib/shaho-grades' の standardMonthly を再利用。
 * 【データ更新箇所】等級表が改定されたら shaho-grades.ts の GRADES を、
 * 全被保険者の標準報酬月額の平均額が改定されたら SHORT_TENURE_CAP を更新する
 * （SHORT_TENURE_CAP は傷病手当金・出産手当金の2ツールに効く）
 */

import { standardMonthly } from '@/lib/shaho-grades';

/**
 * 被保険者期間が12ヶ月未満のときに上限として使う「全被保険者の標準報酬月額の平均額」。
 * 協会けんぽ・支給開始日が令和7年4月1日以降は32万円（それ以前は30万円）。
 * 健康保険組合では別の額が定められている場合がある。
 */
export const SHORT_TENURE_CAP = 320_000;

export interface KenpoDailyAmount {
  /** 算定に使った標準報酬月額（円） */
  standardMonthly: number;
  /** 被保険者期間12ヶ月未満の上限（SHORT_TENURE_CAP）が適用されたか */
  capped: boolean;
  /** 標準報酬日額（標準報酬月額÷30、10円未満四捨五入・円） */
  standardDaily: number;
  /** 手当金の日額（標準報酬日額×2/3、1円未満四捨五入・円） */
  dailyAmount: number;
}

/**
 * 月収（額面）から健康保険の手当金の日額を出す。
 *
 * @param monthlyIncome 直近12ヶ月の平均月収（額面・円）
 * @param under12Months 支給開始日以前の被保険者期間が12ヶ月未満か
 */
export function kenpoDailyAmount(monthlyIncome: number, under12Months = false): KenpoDailyAmount {
  const income = Math.max(0, monthlyIncome);

  // 被保険者期間が12ヶ月未満なら、全被保険者の平均額を超えない額で算定する
  const graded = standardMonthly(income);
  const capped = under12Months && graded > SHORT_TENURE_CAP;
  const std = capped ? SHORT_TENURE_CAP : graded;

  // 標準報酬日額: ÷30 の10円未満四捨五入（=10円単位に丸め）
  const standardDaily = Math.round(std / 30 / 10) * 10;
  // 日額: ×2/3 の1円未満四捨五入
  const dailyAmount = Math.round((standardDaily * 2) / 3);

  return { standardMonthly: std, capped, standardDaily, dailyAmount };
}
