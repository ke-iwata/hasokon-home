/**
 * 育児休業給付金（＋出生後休業支援給付金）計算ロジック
 *
 * 仕様: docs/features/ikuji-kyugyo-kyufu.md
 *
 * 「育休でいくらもらえるか」を、**支給単位期間ごとの推移**で出す。
 * 中身は4つに分かれる。
 *
 * 1. 休業開始時賃金日額 = 休業開始前6ヶ月の賃金総額 ÷ 180（上限・下限を当てる）
 * 2. 支給単位期間 = 育児休業を開始した日から起算した1ヶ月ごとの期間
 * 3. 育児休業給付金 = 賃金日額 × 支給日数（原則30日）× 67%（通算180日まで）／50%
 * 4. 出生後休業支援給付金 = 賃金日額 × 対象期間内の休業日数（28日が上限）× 13%
 *
 * ■ よくある誤解（このツールで正したいこと）
 * - **「手取り10割」は無条件ではない。** 80%（67%+13%）になるのは対象期間内の
 *   最大28日だけで、29日目以降は67%、通算181日目以降は50%に戻る。
 *   「実質10割」も社会保険料免除・非課税を前提にした概算で、**住民税は前年所得
 *   ベースなので休業中も課税される**（人によっては10割に届かない）
 * - **出生後休業支援給付の対象期間の起算は、産後休業をするかどうかで変わる。**
 *   産後休業をしない親（父など）は「子の出生日（出産予定日のうち遅い日）から
 *   8週間を経過する日の翌日」まで、産後休業をする親（出産した本人）は同じ起算日から
 *   **16週間**を経過する日の翌日まで。1本の式で書くと28日の位置がずれる
 * - **上限・下限は基本手当（失業保険）の賃金日額の表とは別表**で、年齢区分も無い。
 *   `lib/shitsugyo-hoken.ts` の `BENEFIT_RATE_RULES` を流用してはいけない
 *   （たまたま30〜44歳の上限額と同額だが、根拠が違うので別々に持つ）
 * - **支給単位期間は暦月ではない。** 給与の月とは1〜3日ずれる
 *
 * ■ 一次情報（2026-09-10 取得）
 * - 厚生労働省・都道府県労働局・ハローワーク
 *   「育児休業等給付の内容と支給申請手続」2026（令和8）年8月1日改訂版
 *   https://www.mhlw.go.jp/content/11600000/001461102.pdf
 *   （支給額の算式・支給単位期間の定義・支給上限額と支給下限額・
 *     出生後休業支援給付金の支給要件と対象期間の図（例1〜例4）・
 *     出生時育児休業給付金の支給日数が67%の180日に通算されること）
 * - 厚生労働省「高年齢雇用継続給付金、介護休業給付金、育児休業等給付の受給者の皆さまへ」
 *   （令和8年8月1日から支給限度額が変更になります）
 *   https://www.mhlw.go.jp/content/001728499.pdf
 *   （休業開始時の賃金月額の上限額496,200円・下限額96,090円＝日額16,540円・3,203円、
 *     支給上限額 67%332,454円／50%248,100円／13%60,205円）
 * - 厚生労働省「育児休業等給付について」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090.html
 *
 * ■ このツールで計算しないもの（仕様書の「やらないこと」）
 * - パパ・ママ育休プラス、1歳6ヶ月・2歳までの延長給付
 * - 出生時育児休業給付金（産後パパ育休）を別の給付として分けて表示すること
 *   （給付率が同じ67%で180日にも通算されるため、金額は区別しなくても変わらない）
 * - 育児時短就業給付（時短勤務の10%給付）
 * - 休業中に事業主から賃金が支払われた場合の減額（13%超〜80%未満の按分）
 * - 会社の独自上乗せ・保険料・税の厳密な手取り計算
 *
 * 【データ更新箇所】休業開始時賃金日額の上限額・下限額と支給上限額・支給下限額は
 * **毎年8月1日に改定される**（毎月勤労統計の平均定期給与額の増減による）。
 * 基本手当の表とは別なので、厚労省「育児休業等給付の内容と支給申請手続」の
 * 改訂版か、上記の支給限度額のリーフレットを正として
 * WAGE_DAILY_MAX / WAGE_DAILY_MIN と UNIT_CAP_* / UNIT_FLOOR_* / SHUSSHOGO_CAP /
 * SHUSSHOGO_FLOOR を入れ替え、LIMIT_LABEL / LIMIT_EFFECTIVE_FROM /
 * LIMIT_EFFECTIVE_UNTIL / DATA_CHECKED_AT を直す。
 * 給付率（67%/50%/13%）と180日・28日は法律なので毎年は変わらない。
 */

import { addDays, addMonths, compareDate, daysBetween, type DateParts } from './date-parts';

// ------------------------------------------------------------ データの版

/** このファイルの数値を一次情報と突き合わせた日 'YYYY-MM-DD' */
export const DATA_CHECKED_AT = '2026-09-10';

/** いま持っている上限額・下限額が適用される最初の日 */
export const LIMIT_EFFECTIVE_FROM = '2026-08-01';

/** いま持っている上限額・下限額が適用される最後の日（次の改定の前日） */
export const LIMIT_EFFECTIVE_UNTIL = '2027-07-31';

/** 表の見出しに使う適用期間の名前。「現行」と書かない（静的書き出しのため） */
export const LIMIT_LABEL = '令和8年8月1日〜令和9年7月31日';

// ------------------------------------------------ 休業開始時賃金日額と給付率

/**
 * 休業開始時賃金日額の上限額（円）。**年齢区分は無い。**
 *
 * 一次情報は賃金月額（496,200円）で書かれていて、その1/30がこの額。
 * 基本手当（失業保険）の30〜44歳の上限額とたまたま同額だが別の表なので、
 * `lib/shitsugyo-hoken.ts` から借りずにここで持つ。
 */
export const WAGE_DAILY_MAX = 16_540;

/** 休業開始時賃金日額の下限額（円）。一次情報の賃金月額 96,090円 の1/30 */
export const WAGE_DAILY_MIN = 3_203;

/** 賃金日額を出すときの割る数（休業開始前6ヶ月 = 180日） */
export const WAGE_DAILY_DIVISOR = 180;

/** 一次情報が賃金「月額」で上限下限を示すときに使う日数 */
export const WAGE_MONTHLY_DAYS = 30;

/** 育児休業給付金の給付率（通算180日目まで） */
export const RATE_EARLY = 0.67;

/** 育児休業給付金の給付率（通算181日目以降） */
export const RATE_LATE = 0.5;

/** 出生後休業支援給付金の給付率（育児休業給付金への上乗せ） */
export const RATE_SHUSSHOGO = 0.13;

/** 出生後休業支援給付金が上乗せされている間の合計の給付率（67% + 13%） */
export const RATE_COMBINED = RATE_EARLY + RATE_SHUSSHOGO;

/**
 * 給付率67%で支給される上限の日数（通算）。これを超えると50%になる。
 *
 * **出生時育児休業給付金（産後パパ育休）が支給された日数もここに通算される。**
 */
export const HIGH_RATE_DAYS = 180;

/** 出生後休業支援給付金の支給日数の上限 */
export const SHUSSHOGO_MAX_DAYS = 28;

/** 出生後休業支援給付金に必要な、対象期間内の休業日数（本人・配偶者ともに） */
export const SHUSSHOGO_MIN_LEAVE_DAYS = 14;

/** 1つの支給単位期間の支給日数（原則）。休業終了日を含む期間だけ実日数になる */
export const UNIT_PERIOD_PAY_DAYS = 30;

// -------------------------------------------------------- 支給上限額・下限額
//
// いずれも「賃金日額の上限額（下限額）× 支給日数 × 給付率」を1円未満切り捨て
// した額と一致するが、**一次情報に額そのものが載っている**ので導出せず定数で持ち、
// tests/ikuji-kyugyo.test.ts で導出と突き合わせる（写し間違いに気づけるように）。

/** 支給日数30日の支給上限額（給付率67%・円） */
export const UNIT_CAP_EARLY = 332_454;

/** 支給日数30日の支給上限額（給付率50%・円） */
export const UNIT_CAP_LATE = 248_100;

/** 支給日数30日の支給下限額（給付率67%・円） */
export const UNIT_FLOOR_EARLY = 64_380;

/** 支給日数30日の支給下限額（給付率50%・円） */
export const UNIT_FLOOR_LATE = 48_045;

/** 出生後休業支援給付金の支給上限額（支給日数28日・給付率13%・円） */
export const SHUSSHOGO_CAP = 60_205;

/** 出生後休業支援給付金の支給下限額（支給日数28日・給付率13%・円） */
export const SHUSSHOGO_FLOOR = 11_658;

/** 出生時育児休業給付金（産後パパ育休）の支給上限額（休業28日・給付率67%・円） */
export const SHUSSHOJI_CAP = 310_290;

// ------------------------------------------------------ 出生後休業支援給付の窓

/**
 * 育休を取る本人の立場。**出生後休業支援給付の対象期間の起算が変わる**ので、
 * 金額の前提として欠かせない。
 *
 * - `mother` 産後休業をする親（出産した本人）。対象期間は16週間
 * - `partner` 産後休業をしない親（父など）。対象期間は8週間
 *
 * 子が養子の場合など、出産した本人でなくても産後休業をしないことがある。
 * 判定の軸は戸籍上の性別ではなく**産後休業をするかどうか**である点に注意。
 */
export type ParentType = 'mother' | 'partner';

/** 産後休業をしない親（父など）の対象期間の週数 */
export const SHUSSHOGO_WEEKS_DEFAULT = 8;

/** 産後休業をする親（出産した本人）の対象期間の週数 */
export const SHUSSHOGO_WEEKS_POSTPARTUM = 16;

/** 産後休業の週数（出生日の翌日から8週間） */
export const POSTPARTUM_LEAVE_WEEKS = 8;

/** 立場から対象期間の週数を引く */
export function shusshogoWeeksFor(parent: ParentType): number {
  return parent === 'mother' ? SHUSSHOGO_WEEKS_POSTPARTUM : SHUSSHOGO_WEEKS_DEFAULT;
}

/** 出生後休業支援給付金の対象期間 */
export interface ShusshogoWindow {
  /** 対象期間の初日（子の出生日または出産予定日のうち早い日） */
  start: DateParts;
  /** 対象期間の末日（起算日から8週間／16週間を経過する日の翌日） */
  end: DateParts;
  /** 8 か 16 */
  weeks: number;
}

/**
 * 出生後休業支援給付金の対象期間を出す。
 *
 * 一次情報の言い方は「子の出生日または出産予定日のうち早い日」から
 * 「子の出生日または出産予定日のうち**遅い日**から起算して8週間（産後休業を
 * する場合は16週間）を経過する日の翌日」まで。
 *
 * 起算日を1日目として8週間（56日）を経過する日は `起算日 + 55日` で、
 * その翌日は `起算日 + 56日` ＝ `起算日 + 8週間`。よって末日は
 * 「起算日 + 週数×7日」になる（一次情報の例：出生日10月5日 → 11月30日、
 * 産後休業をする場合は 1月25日）。
 *
 * **出産予定日と出生日が違う場合、実際の対象期間は数日ずれる。**
 * ここでは片方（`birthDate`）しか受け取らないので、画面でその旨を断ること。
 */
export function shusshogoWindowFor(birthDate: DateParts, parent: ParentType): ShusshogoWindow {
  const weeks = shusshogoWeeksFor(parent);
  return { start: birthDate, end: addDays(birthDate, weeks * 7), weeks };
}

/**
 * 育児休業を開始できる最も早い日の目安。
 *
 * 産後休業は出生日の翌日から8週間なので、出産した本人が育休に入れるのは
 * `出生日 + 57日`（一次情報の例：12月9日に出産 → 2月4日から育児休業を開始）。
 * 産後休業をしない親は出生日から取れる。
 *
 * 画面の初期値を作るためのもので、制度上の強制ではない。
 */
export function defaultLeaveStart(birthDate: DateParts, parent: ParentType): DateParts {
  return parent === 'mother'
    ? addDays(birthDate, POSTPARTUM_LEAVE_WEEKS * 7 + 1)
    : birthDate;
}

// ------------------------------------------------------------ 賃金日額

/** 賃金日額に上限・下限を当てた結果 */
export interface WageDailyResult {
  /** 賃金総額 ÷ 180 を1円未満切り捨てした額（上限下限を当てる前） */
  raw: number;
  /** 上限・下限を当てたあとの賃金日額（円） */
  value: number;
  /** 上限に当たったか・下限に当たったか */
  cap: 'min' | 'max' | null;
}

/**
 * 休業開始前6ヶ月の賃金総額から休業開始時賃金日額を出す。
 *
 * 賃金総額は**額面**で、賞与（3ヶ月を超える期間ごとに支払われる賃金）を含めない。
 * 1円未満は切り捨て。
 */
export function wageDailyFrom(totalWage6m: number): WageDailyResult {
  const raw = Math.floor(Math.max(0, totalWage6m) / WAGE_DAILY_DIVISOR);
  if (raw > WAGE_DAILY_MAX) return { raw, value: WAGE_DAILY_MAX, cap: 'max' };
  if (raw < WAGE_DAILY_MIN) return { raw, value: WAGE_DAILY_MIN, cap: 'min' };
  return { raw, value: raw, cap: null };
}

// ------------------------------------------------------------ 支給単位期間

/** 支給単位期間1つ分の内訳 */
export interface UnitPeriod {
  /** 1から始まる通し番号 */
  index: number;
  /** 期間の初日（休業開始日またはその応当日） */
  start: DateParts;
  /** 期間の末日（翌月の応当日の前日。休業終了日を含む期間は休業終了日） */
  end: DateParts;
  /** 期間の実日数（暦のうえで何日あるか） */
  calendarDays: number;
  /**
   * 支給日数。**原則30日**で、暦の日数が28日でも31日でも30日として計算する。
   * 休業終了日を含む期間だけ「休業終了日までの実日数」になる。
   */
  payDays: number;
  /** そのうち給付率67%で計算される日数 */
  days67: number;
  /** そのうち給付率50%で計算される日数 */
  days50: number;
  /** 育児休業給付金の額（円） */
  ikuji: number;
  /** この期間に対応する出生後休業支援給付金の支給日数 */
  shusshogoDays: number;
  /** 出生後休業支援給付金の額（円） */
  shusshogo: number;
  /** この期間に受け取る合計額（円） */
  total: number;
  /** 休業終了日を含む期間か */
  isFinal: boolean;
}

/**
 * 支給単位期間の区切りを作る。
 *
 * 「支給単位期間」は**育児休業を開始した日から起算した1ヶ月ごとの期間**
 * （休業開始日または応当日から翌月の応当日の前日まで）。応当日が無い月は
 * その月の末日を応当日とみなす（`addMonths` が民法143条と同じ扱いをする）。
 *
 * **応当日は必ず休業開始日から数える。** 1つ前の期間の末日の翌日から数えると、
 * 応当日の無い月をまたいだあとズレたままになる（5月31日開始なら
 * 5/31〜6/29・**6/30〜7/30**・7/31〜… であって、6/30〜7/29 ではない）。
 *
 * **暦月ではない**ので、給与の月とは1〜3日ずれる。
 *
 * @param maxPeriods 無限ループ避けの安全弁（延長を扱わないので通常は12前後）
 */
export function unitPeriodsBetween(
  leaveStart: DateParts,
  leaveEnd: DateParts,
  maxPeriods = 36,
): { start: DateParts; end: DateParts; calendarDays: number; isFinal: boolean }[] {
  const periods: { start: DateParts; end: DateParts; calendarDays: number; isFinal: boolean }[] =
    [];

  for (let i = 0; i < maxPeriods; i += 1) {
    const start = i === 0 ? leaveStart : addMonths(leaveStart, i);
    if (compareDate(start, leaveEnd) > 0) break;
    const naturalEnd = addDays(addMonths(leaveStart, i + 1), -1);
    const isFinal = compareDate(naturalEnd, leaveEnd) >= 0;
    const end = isFinal ? leaveEnd : naturalEnd;
    periods.push({ start, end, calendarDays: daysBetween(start, end) + 1, isFinal });
    if (isFinal) break;
  }

  return periods;
}

/** 2つの期間が重なる日数（重ならなければ0） */
function overlapDays(
  aStart: DateParts,
  aEnd: DateParts,
  bStart: DateParts,
  bEnd: DateParts,
): number {
  const start = compareDate(aStart, bStart) >= 0 ? aStart : bStart;
  const end = compareDate(aEnd, bEnd) <= 0 ? aEnd : bEnd;
  return Math.max(0, daysBetween(start, end) + 1);
}

// ------------------------------------------------------------------ まとめ

/** 出生後休業支援給付が対象かどうかの申告 */
export type ShusshogoAnswer = 'yes' | 'no' | 'unknown';

/** 出生後休業支援給付金の計算結果 */
export interface ShusshogoResult {
  /** 画面での申告（`unknown` は「わからない」） */
  answer: ShusshogoAnswer;
  /** 実際に金額へ入れたか（`yes` / `unknown` で、日数の要件も満たすとき） */
  applied: boolean;
  /** 支給日数（0〜28） */
  days: number;
  /** 支給額（円） */
  amount: number;
  /** 対象期間 */
  window: ShusshogoWindow;
  /** 対象期間と育休が重なる日数（28日で切る前の日数） */
  overlapDays: number;
  /**
   * 対象期間内の休業が14日に満たないため支給されない。
   * `answer` が `yes` でもここが true なら金額に入れない
   */
  shortOfMinDays: boolean;
}

/** 計算の入力 */
export interface IkujiKyugyoInput {
  /** 休業開始前6ヶ月の賃金総額（円・額面。賞与は含めない） */
  totalWage6m: number;
  /** 育休を取る本人の立場（対象期間の起算が変わる） */
  parent: ParentType;
  /** 子の出生日（出産予定日のほうが遅ければ出産予定日） */
  birthDate: DateParts;
  /** 育児休業の開始日 */
  leaveStart: DateParts;
  /** 取得予定期間（月数）。`leaveEnd` を渡すときは使われない */
  leaveMonths?: number;
  /** 育児休業の終了日。渡すと `leaveMonths` より優先する */
  leaveEnd?: DateParts;
  /** 出生後休業支援給付の対象になるか（省略時は `unknown`） */
  shusshogo?: ShusshogoAnswer;
}

/** 計算の結果 */
export interface IkujiKyugyoResult {
  /** 休業開始時賃金日額（上限・下限の適用前後） */
  wage: WageDailyResult;
  /** 賃金月額（賃金日額 × 30）。一次情報が月額で書いているので併記用 */
  wageMonthly: number;
  /** 育児休業の開始日 */
  leaveStart: DateParts;
  /** 育児休業の終了日 */
  leaveEnd: DateParts;
  /** 育児休業の日数（暦日） */
  leaveDays: number;
  /** 支給単位期間ごとの内訳 */
  periods: UnitPeriod[];
  /** 出生後休業支援給付金 */
  shusshogo: ShusshogoResult;
  /** 育児休業給付金の合計（円） */
  totalIkuji: number;
  /** 出生後休業支援給付金の合計（円） */
  totalShusshogo: number;
  /** 受け取る合計額（円） */
  total: number;
  /** 給付率67%で計算された支給日数の合計 */
  days67: number;
  /** 給付率50%で計算された支給日数の合計 */
  days50: number;
  /** 支給日数の合計 */
  payDays: number;
  /** 最初の支給単位期間の合計額（80%になる期間の目安として使う） */
  firstPeriodTotal: number;
  /** 育休が通算181日目に届き、50%の期間があるか */
  reachesLateRate: boolean;
}

/** 育休の取得期間として画面で受け付ける月数の上限（延長は扱わない） */
export const LEAVE_MONTHS_MAX = 12;

/**
 * 育児休業給付金と出生後休業支援給付金を、支給単位期間ごとに出す。
 *
 * 休業中に事業主から賃金が支払われた場合の減額は扱わない（無給の前提）。
 * 受給資格の有無・出生後休業支援給付の要件の判定はハローワークの決定事項で、
 * ここでは「もらえる前提でいくらか」を出す。
 */
export function calcIkujiKyugyo(input: IkujiKyugyoInput): IkujiKyugyoResult {
  const wage = wageDailyFrom(input.totalWage6m);
  const w = wage.value;

  const months = Math.max(1, Math.min(Math.floor(input.leaveMonths ?? 12), LEAVE_MONTHS_MAX));
  const leaveEndRaw = input.leaveEnd ?? addDays(addMonths(input.leaveStart, months), -1);
  // 終了日が開始日より前でも落ちないようにする（画面から日付を直接入れられるため）
  const leaveEnd =
    compareDate(leaveEndRaw, input.leaveStart) < 0 ? input.leaveStart : leaveEndRaw;

  const window = shusshogoWindowFor(input.birthDate, input.parent);
  const answer = input.shusshogo ?? 'unknown';
  const overlap = overlapDays(input.leaveStart, leaveEnd, window.start, window.end);
  const shortOfMinDays = overlap < SHUSSHOGO_MIN_LEAVE_DAYS;
  const applied = answer !== 'no' && !shortOfMinDays;
  const shusshogoDaysTotal = applied ? Math.min(SHUSSHOGO_MAX_DAYS, overlap) : 0;

  const periods: UnitPeriod[] = [];
  let paidDays = 0;
  let shusshogoAssignedDays = 0;
  let shusshogoAssignedAmount = 0;

  for (const [i, span] of unitPeriodsBetween(input.leaveStart, leaveEnd).entries()) {
    // 支給日数は原則30日で、休業終了日を含む期間だけ「休業終了日までの日数」。
    // **30日を超えさせない。** 期間の暦日が31日あっても支給日数は30日で、
    // 支給上限額（一次情報）も支給日数30日を前提に示されている。
    // ここを実日数のままにすると、ちょうど6ヶ月の育休で支給日数が181日になり
    // 「最後の1日だけ50%」という制度に無い段差が出る
    const payDays = span.isFinal
      ? Math.min(span.calendarDays, UNIT_PERIOD_PAY_DAYS)
      : UNIT_PERIOD_PAY_DAYS;
    const days67 = Math.max(0, Math.min(HIGH_RATE_DAYS - paidDays, payDays));
    const days50 = payDays - days67;
    const ikuji = Math.floor(w * days67 * RATE_EARLY + w * days50 * RATE_LATE);

    // 出生後休業支援給付は対象期間と重なる日から順に割り当てる。
    // 額は「累計日数ぶんの額 − 割り当て済みの額」にして、期間ごとに切り捨てても
    // 合計が一次情報の算式（賃金日額 × 支給日数 × 13%）と1円もずれないようにする
    const remaining = shusshogoDaysTotal - shusshogoAssignedDays;
    const shusshogoDays = Math.min(
      remaining,
      overlapDays(span.start, span.end, window.start, window.end),
      payDays,
    );
    shusshogoAssignedDays += shusshogoDays;
    const cumulative = Math.floor(w * shusshogoAssignedDays * RATE_SHUSSHOGO);
    const shusshogo = cumulative - shusshogoAssignedAmount;
    shusshogoAssignedAmount = cumulative;

    paidDays += payDays;
    periods.push({
      index: i + 1,
      start: span.start,
      end: span.end,
      calendarDays: span.calendarDays,
      payDays,
      days67,
      days50,
      ikuji,
      shusshogoDays,
      shusshogo,
      total: ikuji + shusshogo,
      isFinal: span.isFinal,
    });
  }

  const totalIkuji = periods.reduce((sum, p) => sum + p.ikuji, 0);
  const totalShusshogo = periods.reduce((sum, p) => sum + p.shusshogo, 0);

  return {
    wage,
    wageMonthly: w * WAGE_MONTHLY_DAYS,
    leaveStart: input.leaveStart,
    leaveEnd,
    leaveDays: daysBetween(input.leaveStart, leaveEnd) + 1,
    periods,
    shusshogo: {
      answer,
      applied,
      days: shusshogoDaysTotal,
      amount: totalShusshogo,
      window,
      overlapDays: overlap,
      shortOfMinDays,
    },
    totalIkuji,
    totalShusshogo,
    total: totalIkuji + totalShusshogo,
    days67: periods.reduce((sum, p) => sum + p.days67, 0),
    days50: periods.reduce((sum, p) => sum + p.days50, 0),
    payDays: periods.reduce((sum, p) => sum + p.payDays, 0),
    firstPeriodTotal: periods[0]?.total ?? 0,
    reachesLateRate: periods.some((p) => p.days50 > 0),
  };
}
