/**
 * 育児時短就業給付金 計算ロジック
 *
 * 仕様: docs/features/ikuji-jitan-kyufu.md
 *
 * 2歳未満の子のために所定労働時間を短縮して働く雇用保険の被保険者に、
 * **時短中に支払われた月給の10%** を支給する給付（雇用保険法61条の12。2025-04-01 創設）。
 * 中身は3つの式と2つの限度額で閉じる。
 *
 * 1. 賃金が開始時賃金月額の90%以下 → 賃金 × 10%
 * 2. 90%超〜100%未満 → 賃金率 X ＝ 賃金 ÷ 開始時賃金月額 × 100、支給率 Y ＝ 9,000 ÷ X − 90
 * 3. 賃金 ＋ 支給額 が支給限度額を超える → 支給限度額 − 賃金
 *
 * ■ よくある誤解（このツールで正したいこと）
 * - **育児休業給付の「80%を超えたら減額」とは別物。** 時短の給付は「90%超で逓減・100%で0」。
 *   他所の計算機には育休の減額ルールを持ち込んでいるものがある（仕様書「背景と根拠」）
 * - **90%の判定は金額で行う**（パンフレットⅠ-3（1）「賃金額が開始時賃金月額の90%以下の場合」、
 *   例③「90%（446,580円）以下」）。丸めた賃金率で判定すると、表示する「どの式で決まったか」と
 *   額がずれる。丸めた賃金率は※3の式の中だけで使う
 * - **育休から引き続いて時短に入った月も、その月から支給対象月に数える**（パンフレット例4）。
 *   その月の賃金は日割りになるので、額は画面の目安より低くなる
 *
 * ■ 端数処理（パンフレット Point「90%超100%未満」）
 * - 賃金率・支給率は小数第3位を四捨五入して第2位まで
 * - 支給額は小数点以下切り捨て
 * 浮動小数の誤差で1円ずれないよう、率は「百分の一パーセント」の整数で持つ
 * （643 ＝ 6.43%）。
 *
 * ■ 一次情報（2026-09-30 取得）
 * - 厚生労働省・都道府県労働局・ハローワーク
 *   「育児時短就業給付の内容と支給申請手続」2026（令和8）年8月1日時点版
 *   https://www.mhlw.go.jp/content/11600000/001395102.pdf
 *   （受給資格・各月の要件・支給対象月・支給額の3つの式・端数処理・計算例①〜③・例4・
 *     支給限度額484,121円・最低限度額2,562円）
 * - 厚生労働省「育児休業等給付について」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090_00001.html
 *
 * ■ このツールで計算しないもの（仕様書の「やらないこと」）
 * - 受給資格（開始前2年に12か月の完全月）の判定
 * - 月ごとに違う賃金（毎月同じ賃金の前提の概算）
 * - 税・社会保険料の厳密な手取り
 *
 * 【データ更新箇所】支給限度額 LIMIT_MAX・最低限度額 LIMIT_MIN と、開始時賃金月額の
 * 上限・下限（START_WAGE_DAILY_MAX / START_WAGE_DAILY_MIN）は**毎年8月1日に改定される**。
 * `lib/ikuji-kyugyo.ts` と同じ日・同じ表（休業開始時賃金日額の上限・下限）なので、
 * **同じPRで2本まとめて更新する**（tests/ikuji-jitan-kyufu.test.ts が食い違いを落とす）。
 * LIMIT_LABEL / LIMIT_EFFECTIVE_FROM / LIMIT_EFFECTIVE_UNTIL / DATA_CHECKED_AT も直す。
 * 10%・90%・9,000 ÷ X − 90 は法令なので毎年は変わらない。
 */

import { monthAnniversary } from './nenrei';
import { addDays, compareDate, type DateParts } from './date-parts';

// ------------------------------------------------------------ データの版

/** このファイルの数値を一次情報と突き合わせた日 'YYYY-MM-DD' */
export const DATA_CHECKED_AT = '2026-09-30';

/** いま持っている限度額が適用される最初の日 */
export const LIMIT_EFFECTIVE_FROM = '2026-08-01';

/** いま持っている限度額が適用される最後の日（次の改定の前日） */
export const LIMIT_EFFECTIVE_UNTIL = '2027-07-31';

/** 表の見出しに使う適用期間の名前。「現行」と書かない（静的書き出しのため） */
export const LIMIT_LABEL = '令和8年8月1日〜令和9年7月31日';

// ------------------------------------------------------------ 限度額

/** 支給限度額（円）。賃金 ＋ 支給額 がこれを超えない。賃金がこれ以上なら支給なし */
export const LIMIT_MAX = 484_121;

/** 最低限度額（円）。算定した支給額がこれ以下なら支給なし */
export const LIMIT_MIN = 2_562;

/**
 * 開始時賃金日額の上限額（円）。育児休業給付の休業開始時賃金日額と同じ表。
 * 一次情報は月額（496,200円）で書かれていて、その1/30。
 */
export const START_WAGE_DAILY_MAX = 16_540;

/** 開始時賃金日額の下限額（円）。一次情報の月額 96,090円 の1/30 */
export const START_WAGE_DAILY_MIN = 3_203;

/** 賃金日額を出すときの割る数（時短開始前6か月 = 180日） */
export const START_WAGE_DIVISOR = 180;

/** 日額から月額に直す日数 */
export const START_WAGE_MONTHLY_DAYS = 30;

/** 開始時賃金月額の上限額（円）＝ 16,540 × 30 */
export const START_WAGE_MAX = START_WAGE_DAILY_MAX * START_WAGE_MONTHLY_DAYS;

/** 開始時賃金月額の下限額（円）＝ 3,203 × 30 */
export const START_WAGE_MIN = START_WAGE_DAILY_MIN * START_WAGE_MONTHLY_DAYS;

// ------------------------------------------------------------ 率（法令）

/** 基本の支給率（%） */
export const BASE_RATE_PERCENT = 10;

/** これ以下なら10%（開始時賃金月額に対する%）。**判定は金額で行う** */
export const TAPER_FROM_PERCENT = 90;

/** 逓減の式 Y ＝ 9,000 ÷ X − 90 の 9,000 */
const TAPER_NUMERATOR = 9_000;

/** 支給対象月が終わる子の年齢（2歳に達する日の前日の属する月まで） */
export const CHILD_AGE_LIMIT = 2;

/** 育休から「引き続き」とみなす、育休終了日と時短開始日の間の日数 */
export const CONTINUOUS_GAP_DAYS = 14;

// ------------------------------------------------------------ 開始時賃金月額

export interface StartWage {
  /** 開始時賃金日額（円・上限下限を当てたあと） */
  daily: number;
  /** 開始時賃金月額（円）＝ daily × 30 */
  monthly: number;
  /** 上限・下限を当てたか */
  cap: 'max' | 'min' | null;
}

/**
 * 時短前の平均月給 M から開始時賃金月額を出す。
 *
 * パンフレット※2の「6か月の総額 ÷ 180 ＝ 日額（上限・下限）× 30」を、M × 6 を総額とみなして
 * 再現する。日額は1円未満切り捨て（`lib/ikuji-kyugyo.ts` の賃金日額と同じ）。
 * 育休から引き続く場合は育休の休業開始時賃金日額 × 30 で、入力が同じ M なので式も同じ。
 */
export function startWageFrom(monthlyWage: number): StartWage {
  const raw = Math.floor((monthlyWage * 6) / START_WAGE_DIVISOR);
  let daily = raw;
  let cap: StartWage['cap'] = null;
  if (raw > START_WAGE_DAILY_MAX) {
    daily = START_WAGE_DAILY_MAX;
    cap = 'max';
  } else if (raw < START_WAGE_DAILY_MIN) {
    daily = START_WAGE_DAILY_MIN;
    cap = 'min';
  }
  return { daily, monthly: daily * START_WAGE_MONTHLY_DAYS, cap };
}

// ------------------------------------------------------------ 率の丸め

/**
 * 賃金率（百分の一パーセントの整数。9333 ＝ 93.33%）。小数第3位を四捨五入。
 * 分子・分母とも整数のまま割るので、ちょうど .005 の場合も誤差なく切り上がる。
 */
export function wageRateHundredths(paid: number, startMonthly: number): number {
  return Math.round((paid * 10_000) / startMonthly);
}

/**
 * 賃金率 X（百分の一パーセントの整数）から、逓減後の支給率 Y ＝ 9,000 ÷ X − 90 を
 * 百分の一パーセントの整数で返す（小数第3位を四捨五入）。
 * 例: 9333（93.33%）→ 643（6.43%）。
 */
export function taperRateHundredths(wageRateH: number): number {
  // Y × 100 ＝ 9,000 × 100 × 100 ÷ (X × 100) − 90 × 100
  return Math.round((TAPER_NUMERATOR * 10_000) / wageRateH) - TAPER_FROM_PERCENT * 100;
}

// ------------------------------------------------------------ 月の支給額

/**
 * どの式で決まったか。
 * - `base`：賃金が90%以下なので10%
 * - `taper`：90%超なので逓減
 * - `cap`：支給限度額に当たるので「限度額 − 賃金」
 * - `none-over100`：賃金が開始時賃金月額の100%以上なので支給なし
 * - `none-over-limit`：賃金が支給限度額以上なので支給なし
 * - `none-min`：算定した支給額が最低限度額以下なので支給なし
 */
export type AmountReason =
  | 'base'
  | 'taper'
  | 'cap'
  | 'none-over100'
  | 'none-over-limit'
  | 'none-min';

export interface MonthlyAmount {
  /** 月の支給額（円）。支給なしなら0 */
  amount: number;
  /** 適用した支給率（百分の一パーセントの整数。1000 ＝ 10.00%）。支給なしなら0 */
  rateHundredths: number;
  /** 賃金率（百分の一パーセントの整数・表示用）。判定には使わない */
  wageRateHundredths: number;
  /** 開始時賃金月額の90%の額（円）。判定の境目 */
  threshold90: number;
  /**
   * 限度額で頭打ちにする前の支給額（円）。`cap` のときだけ意味がある
   * （例③の「10% ＝ 44,500円だが…」を画面に出すため）
   */
  beforeCap: number;
  reason: AmountReason;
}

/**
 * 支給対象月に支払われた賃金 paid と開始時賃金月額から、その月の支給額を出す。
 *
 * パンフレットⅠ-3と「ご注意ください」①〜③の順に判定する。
 */
export function monthlyAmount(paid: number, startMonthly: number): MonthlyAmount {
  // 開始時賃金月額 × 90%。月額は日額 × 30 なので × 9 ÷ 10 は必ず整数になる
  const threshold90 = (startMonthly * TAPER_FROM_PERCENT) / 100;
  const wageRateH = wageRateHundredths(paid, startMonthly);
  const none = (reason: AmountReason): MonthlyAmount => ({
    amount: 0,
    rateHundredths: 0,
    wageRateHundredths: wageRateH,
    threshold90,
    beforeCap: 0,
    reason,
  });

  if (paid >= startMonthly) return none('none-over100');
  if (paid >= LIMIT_MAX) return none('none-over-limit');

  // 90%の判定は金額で（丸めた賃金率で判定しない。仕様書 #302 レビュー3）
  const tapered = paid * 100 > startMonthly * TAPER_FROM_PERCENT;
  const rateH = tapered ? taperRateHundredths(wageRateH) : BASE_RATE_PERCENT * 100;
  const beforeCap = Math.floor((paid * rateH) / 10_000);

  let amount = beforeCap;
  let reason: AmountReason = tapered ? 'taper' : 'base';
  if (paid + amount > LIMIT_MAX) {
    amount = LIMIT_MAX - paid;
    reason = 'cap';
  }
  if (amount <= LIMIT_MIN) return { ...none('none-min'), rateHundredths: rateH, beforeCap };

  return { amount, rateHundredths: rateH, wageRateHundredths: wageRateH, threshold90, beforeCap, reason };
}

// ------------------------------------------------------------ 支給対象月

/** 年月 */
export interface YearMonth {
  year: number;
  month: number;
}

/**
 * 子が2歳に達する日。**誕生日の前日**（年齢計算に関する法律・民法143条）。
 * 2月29日生まれは、平年の2月28日に達する。
 */
export function reachesAgeTwoOn(birth: DateParts): DateParts {
  return addDays(monthAnniversary(birth, CHILD_AGE_LIMIT * 12), -1);
}

/**
 * 支給対象月の最後の月。**2歳に達する日の前日の属する月**（パンフレットⅠ-2）。
 * 例: 4月1日生まれ → 2歳に達する日は3月31日 → その前日3月30日 → 3月まで。
 * 4月2日生まれでも、前日が3月31日なので3月まで。
 */
export function lastEligibleMonth(birth: DateParts): YearMonth {
  const d = addDays(reachesAgeTwoOn(birth), -1);
  return { year: d.year, month: d.month };
}

const monthIndex = (ym: YearMonth) => ym.year * 12 + (ym.month - 1);

// ------------------------------------------------------------ まとめ

export interface IkujiJitanInput {
  /** 時短前（育休から引き続く場合は育休前）の平均月給（円・総支給額） */
  wageBefore: number;
  /** 時短後の月給（円・支給対象月に支払われる賃金） */
  wageAfter: number;
  /** 子の生年月日 */
  birth: DateParts;
  /** 時短の開始日 */
  jitanStart: DateParts;
}

export interface IkujiJitanResult {
  startWage: StartWage;
  month: MonthlyAmount;
  /** 支給対象月の最初の月（時短開始日の属する月。月の途中でもその月から） */
  firstMonth: YearMonth;
  /** 支給対象月の最後の月 */
  lastMonth: YearMonth;
  /** 子が2歳に達する日 */
  reachesTwo: DateParts;
  /** 支給対象月の月数。時短開始が遅すぎて対象月が無ければ0 */
  months: number;
  /** 期間合計（毎月同じ賃金なら。月の支給額 × 月数） */
  total: number;
  /** 手取りの目安（時短後の月給 ＋ 支給額。給付は非課税・社会保険料の対象外） */
  paidPlusBenefit: number;
}

/**
 * 育児時短就業給付金の月額・支給対象月・期間合計をまとめて出す。
 *
 * @returns 月給が正でない、または時短開始日が子の生年月日より前なら null
 */
export function calcIkujiJitan(input: IkujiJitanInput): IkujiJitanResult | null {
  const { wageBefore, wageAfter, birth, jitanStart } = input;
  if (!(wageBefore > 0) || !(wageAfter > 0)) return null;
  if (compareDate(jitanStart, birth) < 0) return null;

  const startWage = startWageFrom(wageBefore);
  const month = monthlyAmount(wageAfter, startWage.monthly);
  const firstMonth = { year: jitanStart.year, month: jitanStart.month };
  const lastMonth = lastEligibleMonth(birth);
  const months = Math.max(0, monthIndex(lastMonth) - monthIndex(firstMonth) + 1);

  return {
    startWage,
    month,
    firstMonth,
    lastMonth,
    reachesTwo: reachesAgeTwoOn(birth),
    months,
    total: month.amount * months,
    paidPlusBenefit: wageAfter + month.amount,
  };
}

// ------------------------------------------------------------ 早見表

export interface HayamiRow {
  /** 賃金率（百分の一パーセントの整数） */
  wageRateH: number;
  /** 支給率（百分の一パーセントの整数） */
  rateH: number;
}

/**
 * 支給率の早見表。賃金率90.5%〜99.5%の0.5%刻み（パンフレットの早見表と同じ刻み）。
 * 本文に率を手で書かないため、ここで式から作る。
 */
export function hayamiRows(): HayamiRow[] {
  const rows: HayamiRow[] = [];
  for (let wr = 9_050; wr <= 9_950; wr += 50) {
    rows.push({ wageRateH: wr, rateH: taperRateHundredths(wr) });
  }
  return rows;
}

/** 百分の一パーセントの整数 → '6.43%' */
export function formatRate(hundredths: number): string {
  return `${(hundredths / 100).toFixed(2)}%`;
}
