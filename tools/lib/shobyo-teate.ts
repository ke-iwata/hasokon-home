/**
 * 傷病手当金 計算ロジック
 *
 * 一次情報:
 * - 全国健康保険協会（協会けんぽ）「病気やケガで会社を休んだとき（傷病手当金）」
 *   https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/
 * - 1日あたりの支給額 = 支給開始日以前12ヶ月の各月の標準報酬月額の平均 ÷ 30日 × 2/3
 *   （÷30 の段階で10円未満四捨五入、×2/3 の段階で1円未満四捨五入）
 * - 連続3日間の待期期間（土日祝・有給を含む）を経て4日目から支給
 * - 支給期間は支給開始日から通算1年6ヶ月（2022年1月改正で「通算」に変更）
 * - 被保険者期間が12ヶ月未満の場合は、その期間の標準報酬月額の平均と
 *   「全被保険者の標準報酬月額の平均額」の低い方を使う（令和7年4月1日以降は32万円）
 *
 * **日額の計算と SHORT_TENURE_CAP は `lib/kenpo-daily-amount.ts` にある。**
 * 出産手当金（健康保険法102条2項が99条2項を準用）が同じ式なので、
 * 同じ数字を2か所に置かないよう切り出した。ここでは再エクスポートだけしている
 * （既存の `import { SHORT_TENURE_CAP } from '@/lib/shobyo-teate'` を壊さないため）。
 */

import { kenpoDailyAmount } from '@/lib/kenpo-daily-amount';

export { SHORT_TENURE_CAP } from '@/lib/kenpo-daily-amount';
export type { KenpoDailyAmount } from '@/lib/kenpo-daily-amount';

/** 待期期間（連続した暦日数） */
export const TAIKI_DAYS = 3;

/**
 * 支給期間の上限日数（通算1年6ヶ月）。
 *
 * 令和4年（2022年）1月1日から「支給開始日から通算して1年6ヶ月」になった。
 * それ以前は「支給開始日から暦の上で1年6ヶ月」で、途中で復職しても
 * その期間が上限を食っていた。改正後は、支給されなかった期間は数えない。
 *
 * 「1年6ヶ月」は暦で数えるため、支給開始日によって実日数は 546〜548日で揺れる
 * （うるう年・月の大小）。ここでは短いほうの 546日 を採る。
 * 上限を過小に見積もる側に倒すのは、このツールが「いくらもらえるか」を
 * 調べる道具であり、多く出しすぎるほうが害が大きいため。
 */
export const MAX_PAYABLE_DAYS = 546;

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
  /** 支給対象日数（休業日数から待期3日を除き、通算1年6ヶ月の上限で頭打ちにした日数） */
  payableDays: number;
  /** 上限を当てる前の支給対象日数（入力どおりの日数 − 待期3日） */
  requestedDays: number;
  /** 通算1年6ヶ月（MAX_PAYABLE_DAYS）の上限に達したか */
  cappedByLimit: boolean;
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

  // 日額の計算（等級表への丸め・12ヶ月未満の上限・端数処理）は出産手当金と共通
  const { standardMonthly: std, capped, standardDaily, dailyAmount } = kenpoDailyAmount(
    income,
    input.under12Months === true,
  );
  // 待期3日間（最初の連続3日）は支給されない
  const requestedDays = Math.max(0, restDays - TAIKI_DAYS);
  // 支給期間は通算1年6ヶ月が上限。これを超える日数を入れられても頭打ちにする
  const payableDays = Math.min(requestedDays, MAX_PAYABLE_DAYS);
  const cappedByLimit = requestedDays > MAX_PAYABLE_DAYS;

  return {
    standardMonthly: std,
    capped,
    standardDaily,
    dailyAmount,
    payableDays,
    requestedDays,
    cappedByLimit,
    total: dailyAmount * payableDays,
    monthlyEstimate: dailyAmount * 30,
  };
}

/**
 * 本文の「月収別の早見表」に出す標準報酬月額（`lib/shaho-grades.ts` の GRADES にある値だけ）。
 * 50等級すべてはスマホで長大になるので、月収15万〜65万円の代表的な8等級に絞る
 * （docs/features/thin-tool-content.md 共通の約束 8）。
 */
export const HAYAMIHYO_STANDARD_MONTHLY = [
  150_000, 200_000, 260_000, 300_000, 360_000, 410_000, 500_000, 650_000,
] as const;

export interface ShobyoHayamihyoRow {
  /** 標準報酬月額（円） */
  standardMonthly: number;
  /** 1日あたりの支給額（円） */
  dailyAmount: number;
  /** 30日分の目安（円） */
  thirtyDays: number;
}

/**
 * 月収別の早見表。本文に手で数字を書かないために、計算機と同じ `kenpoDailyAmount()` から作る
 * （被保険者期間12ヶ月以上の場合）。
 */
export function shobyoHayamihyo(): ShobyoHayamihyoRow[] {
  return HAYAMIHYO_STANDARD_MONTHLY.map((std) => {
    const { standardMonthly, dailyAmount } = kenpoDailyAmount(std);
    return { standardMonthly, dailyAmount, thirtyDays: dailyAmount * 30 };
  });
}
