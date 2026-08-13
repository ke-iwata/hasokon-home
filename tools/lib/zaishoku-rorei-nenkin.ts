/**
 * 在職老齢年金の支給停止額 計算ロジック
 *
 * 働きながら老齢厚生年金を受け取る人について、賃金と年金の合計が
 * 支給停止調整額（基準額）を超えると年金の一部または全部が止まる。
 * その「いくら止まって、いくら受け取れるか」を出す。
 *
 * 令和7年年金制度改正法（令和7年法律第74号）により、令和8年4月から
 * 支給停止調整額が月51万円から月65万円へ引き上げられた。
 *
 * ■ 「62万円」ではなく「65万円」
 * 改正の解説記事には「62万円に引き上げ」と書いているものが多いが、
 * 62万円は法律に書かれた令和6年度水準の額で、実際に適用される額ではない。
 * 支給停止調整額は毎年度、賃金の変動に応じて改定される。
 * 名目賃金変動率を織り込んだ結果、**令和8年度に実際に使われる額は65万円**である。
 * 合計が62万〜65万円の帯にいる人は、62万円で計算すると
 * 「年金が減る」と誤って表示される（実際には全額支給）。
 *
 * ■ 計算式（一次情報のとおり）
 *   基本月額       = 加給年金額を除いた老齢厚生年金（報酬比例部分）の月額
 *   総報酬月額相当額 = その月の標準報酬月額 ＋（その月以前1年間の標準賞与額の合計 ÷ 12）
 *
 *   合計 ≦ 支給停止調整額 → 全額支給
 *   合計 ＞ 支給停止調整額 → 基本月額 －（合計 － 支給停止調整額）÷ 2
 *
 * ■ 境界条件（すべて一次情報に明記されている）
 * 1. 年金支給月額がマイナスになる場合は、老齢厚生年金（加給年金額を含む）は全額支給停止
 * 2. 老齢基礎年金と経過的加算額は調整の対象外で、全額支給される
 * 3. 加給年金額は基本月額に含めない。ただし全部支給停止のときは加給年金額も止まる
 * 4. 70歳以上も在職支給停止は行われる（厚生年金の被保険者ではないので保険料負担は無い）
 * 5. 厚生年金基金の加入期間がある場合は、代行部分を国が支払うべき年金額とみなして
 *    基本月額を算出する（このツールでは注記に留める）
 *
 * ■ 一次情報（2026-08-13 取得。ページの更新日は2026年4月1日）
 * - 日本年金機構「在職老齢年金制度が改正されました」
 *   https://www.nenkin.go.jp/tokusetsu/zairoukaisei.html
 * - 日本年金機構「在職老齢年金の計算方法」
 *   https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/zaishoku/20150401-01.html
 *
 * ■ このツールで計算しないもの
 * - 老齢厚生年金の額そのもの（ねんきん定期便・ねんきんネットの数字を入れてもらう）
 * - 令和4年3月以前の65歳未満の計算式（28万円・47万円の4分岐）
 * - 共済組合等から受け取る老齢厚生年金との合算（注記のみ）
 * - 在職定時改定・退職改定による年金額の増加
 *
 * 【データ更新箇所】支給停止調整額が改定されたら FISCAL_YEARS に年度を1行足す。
 * 毎年度、賃金の変動に応じて改定されるので、官報・日本年金機構の告示で確認すること
 */

import { PENSION_STANDARD_MAX, pensionStandardMonthly } from '@/lib/shaho-grades';

/** 支給停止調整額を持つ年度の定義 */
export interface FiscalYearDef {
  /** 年度のキー（令和の年）。令和8年度なら 8 */
  year: number;
  /** 画面に出す表示名 */
  label: string;
  /** 支給停止調整額（円・月額） */
  threshold: number;
}

/**
 * 年度ごとの支給停止調整額。
 *
 * 令和8年度の65万円は「令和8年度の基準額」であって、法律に書かれた
 * 令和6年度水準の額（62万円）ではない。混同しないこと。
 *
 * 令和4年4月〜令和7年度は47万円→48万円→50万円→51万円と改定されてきたが、
 * 「改正前」として比べる相手は直前の令和7年度（51万円）で足りるので、
 * それ以前の年度は持たない（画面の選択肢を増やしても使われないため）。
 *
 * 【データ更新箇所】令和9年度の額が告示されたら先頭に1行足し、
 * DEFAULT_FISCAL_YEAR を新しい年度に変える
 */
export const FISCAL_YEARS: readonly FiscalYearDef[] = [
  { year: 8, label: '令和8年度（2026年4月〜）', threshold: 650_000 },
  { year: 7, label: '令和7年度以前（〜2026年3月）', threshold: 510_000 },
];

/** 既定の年度（令和8年度）。改正後の額で計算するのが既定 */
export const DEFAULT_FISCAL_YEAR = 8;

/** 改正後（令和8年度）の支給停止調整額 */
export const THRESHOLD_AFTER_REFORM = 650_000;

/** 改正前（令和7年度）の支給停止調整額。改正でどれだけ変わったかの比較に使う */
export const THRESHOLD_BEFORE_REFORM = 510_000;

/**
 * 解説記事に多く出てくる「62万円」。法律に書かれた令和6年度水準の額で、
 * 実際に令和8年度に適用される額ではない。ページで注意喚起するために持っている。
 */
export const MISQUOTED_THRESHOLD = 620_000;

/** 年度キーから支給停止調整額を引く。未知の年度は既定の年度として扱う */
export function thresholdOf(fiscalYear: number): number {
  const def = FISCAL_YEARS.find((f) => f.year === fiscalYear);
  return (def ?? FISCAL_YEARS.find((f) => f.year === DEFAULT_FISCAL_YEAR)!).threshold;
}

/**
 * 月給（額面）から厚生年金の標準報酬月額を求める。
 *
 * 等級表は lib/shaho-grades.ts のものをそのまま使う（1〜32等級・88,000〜650,000円）。
 * このツールのために新しい等級表を持たない。
 */
export function standardMonthlyFromSalary(monthlySalary: number): number {
  return pensionStandardMonthly(Math.max(0, monthlySalary));
}

export interface ZaishokuInput {
  /**
   * 老齢厚生年金（報酬比例部分）の年額（円）。**加給年金額を除く。**
   * ねんきん定期便・ねんきんネットに書かれている額を入れてもらう
   */
  pensionYearly: number;
  /** 標準報酬月額（円）。月給から求めるときは standardMonthlyFromSalary() を通す */
  standardMonthly: number;
  /** その月以前1年間の標準賞与額の合計（円）。賞与が無ければ0 */
  bonusYearly: number;
  /** 年度（令和の年）。省略時は DEFAULT_FISCAL_YEAR（令和8年度） */
  fiscalYear?: number;
  /**
   * 老齢基礎年金（経過的加算額を含む）の年額（円）。任意。
   * **在職による支給停止の対象外**で、常に全額支給される。
   * 入れると「止まらない分」を含めた受取総額が出せる
   */
  basicPensionYearly?: number;
  /**
   * 加給年金額の年額（円）。任意。
   * 基本月額には含めないが、**全部支給停止のときは加給年金額も止まる**
   */
  kakyuYearly?: number;
}

/** ある支給停止調整額のもとでの計算結果 */
export interface ZaishokuOutcome {
  /** 適用した支給停止調整額（円・月額） */
  threshold: number;
  /** 基本月額（円・月額）。加給年金額を除いた老齢厚生年金の月額 */
  basicMonthly: number;
  /** 総報酬月額相当額（円・月額） */
  totalRemunerationMonthly: number;
  /** 基本月額 + 総報酬月額相当額（円・月額）。これが支給停止調整額を超えると止まる */
  combined: number;
  /** 支給停止額（円・月額）。0なら全額支給 */
  suspendedMonthly: number;
  /** 調整後の老齢厚生年金の支給月額（円・月額）。マイナスにはならない */
  payableMonthly: number;
  /** 全部支給停止か（加給年金額も止まる） */
  fullySuspended: boolean;
  /** 加給年金の支給月額（円・月額）。全部支給停止なら0 */
  kakyuMonthly: number;
  /** 老齢基礎年金（経過的加算額を含む）の月額（円）。調整対象外なので常に全額 */
  basicPensionMonthly: number;
  /** 実際に受け取る年金の合計月額（老齢厚生 + 加給 + 老齢基礎） */
  totalReceivedMonthly: number;
  /**
   * 支給停止が始まるまでの余裕（円・月額）。
   * 総報酬月額相当額をあと何円増やすと止まり始めるか。既に止まっていれば0
   */
  headroom: number;
}

export interface ZaishokuResult extends ZaishokuOutcome {
  /** 選んだ年度（令和の年） */
  fiscalYear: number;
  /**
   * 改正前（支給停止調整額51万円）で計算した場合の結果。
   * 「改正前なら○円止まっていたが、いまは○円」を出すための比較用
   */
  beforeReform: ZaishokuOutcome;
  /**
   * 改正によって増える年金の月額（円）。
   * payableMonthly − beforeReform.payableMonthly。改正前と同じ年度を選べば0
   */
  reformGainMonthly: number;
  /** 同・年額（円） */
  reformGainYearly: number;
  /**
   * 標準報酬月額が厚生年金の上限（650,000円）に達しているか。
   * 上限に達していると、月給を増やしても総報酬月額相当額は賞与でしか増えない
   */
  standardMonthlyCapped: boolean;
}

/** 円未満は四捨五入する。年金額の実際の端数処理規則とは別で、表示のための丸め */
const yen = (v: number) => Math.round(v);

/**
 * 支給停止調整額を1つ与えて、その額での支給停止・支給額を出す。
 *
 * 支給停止額は「（基本月額 + 総報酬月額相当額 − 支給停止調整額）÷ 2」。
 * これが基本月額以上になると全部支給停止で、加給年金額も止まる（境界条件1・3）。
 * 老齢基礎年金は調整の対象外なので、支給停止額に関係なく全額を足す（境界条件2）。
 */
function evaluate(
  basicMonthly: number,
  totalRemunerationMonthly: number,
  threshold: number,
  kakyuMonthly: number,
  basicPensionMonthly: number,
): ZaishokuOutcome {
  const combined = basicMonthly + totalRemunerationMonthly;
  const excess = Math.max(0, combined - threshold);
  const rawSuspended = yen(excess / 2);

  // 支給停止額が基本月額を超えても、止まるのは基本月額まで（マイナスは表示しない）
  const fullySuspended = excess > 0 && rawSuspended >= basicMonthly;
  const suspendedMonthly = Math.min(basicMonthly, rawSuspended);
  const payableMonthly = basicMonthly - suspendedMonthly;

  // 全部支給停止のときは加給年金額も止まる
  const payableKakyu = fullySuspended ? 0 : kakyuMonthly;

  return {
    threshold,
    basicMonthly,
    totalRemunerationMonthly,
    combined,
    suspendedMonthly,
    payableMonthly,
    fullySuspended,
    kakyuMonthly: payableKakyu,
    basicPensionMonthly,
    totalReceivedMonthly: payableMonthly + payableKakyu + basicPensionMonthly,
    headroom: Math.max(0, threshold - combined),
  };
}

/**
 * 在職老齢年金の支給停止額を計算する。
 *
 * 負の入力は0として扱う（画面から負の額が来ることはないが、
 * 途中式にマイナスが混ざると「支給停止額がマイナス」のような無意味な結果になるため）。
 */
export function calcZaishoku(input: ZaishokuInput): ZaishokuResult {
  const fiscalYear = input.fiscalYear ?? DEFAULT_FISCAL_YEAR;
  const threshold = thresholdOf(fiscalYear);

  const basicMonthly = yen(Math.max(0, input.pensionYearly) / 12);
  const standardMonthly = Math.max(0, input.standardMonthly);
  const totalRemunerationMonthly = yen(standardMonthly + Math.max(0, input.bonusYearly) / 12);
  const kakyuMonthly = yen(Math.max(0, input.kakyuYearly ?? 0) / 12);
  const basicPensionMonthly = yen(Math.max(0, input.basicPensionYearly ?? 0) / 12);

  const current = evaluate(
    basicMonthly,
    totalRemunerationMonthly,
    threshold,
    kakyuMonthly,
    basicPensionMonthly,
  );
  const beforeReform = evaluate(
    basicMonthly,
    totalRemunerationMonthly,
    THRESHOLD_BEFORE_REFORM,
    kakyuMonthly,
    basicPensionMonthly,
  );

  const reformGainMonthly = current.payableMonthly - beforeReform.payableMonthly;

  return {
    ...current,
    fiscalYear,
    beforeReform,
    reformGainMonthly,
    reformGainYearly: reformGainMonthly * 12,
    standardMonthlyCapped: standardMonthly >= PENSION_STANDARD_MAX,
  };
}

export { PENSION_STANDARD_MAX };
