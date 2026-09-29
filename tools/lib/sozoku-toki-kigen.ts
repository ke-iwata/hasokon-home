/**
 * 相続登記の期限チェッカーのロジック
 *
 * 仕様: docs/features/sozoku-toki-kigen.md
 *
 * 相続登記の申請義務（不動産登記法76条の2。2024-04-01施行）の期限と、
 * 同じ死亡日から決まる相続の手続き期限3つ（相続放棄・準確定申告・相続税申告）を日付で出す。
 * すべて純関数で、現在時刻に依存しない（「今日」は呼び出し側から渡す）。
 *
 * - **4つの期限はすべて「知った日と同じ日付の応当日」**（`addMonthsSameDay`）。
 *   民法140条の初日不算入と、税法の「翌日から◯か月」は書き方が違うだけで同じ日付になる
 *   （国税庁の例：1月10日に死亡 → 準確定申告5月10日・相続税11月10日）。
 *   起算日をコードで分けると1日ずれる誤りを生むので、分けない
 * - 経過措置（改正法附則5条6項）は「知った日」と「分割の日」を
 *   **施行日（2024-04-01）とのいずれか遅い日**に読み替える。施行日は午前零時から始まるので
 *   初日を算入し（民法140条ただし書き）、期限は 2027-03-31 になる（法務省Q&A Q4）
 * - 土日祝の繰り下げは**税の2つだけ**（国税通則法10条2項）。登記・放棄は額面の日付を出し、
 *   扱いは法務局・家庭裁判所に確認するよう画面で注記する（断定しない。仕様書「下段」）
 */

import {
  addDays,
  addMonths,
  compareDate,
  daysBetween,
  formatDate,
  parseDate,
  weekdayLabel,
  type DateParts,
} from './date-parts';
import { HOLIDAY_FIRST_YEAR, HOLIDAY_LAST_YEAR, holidayName } from './nissu-keisan';

export { formatDate, parseDate, type DateParts } from './date-parts';

// ---------------------------------------------------------------- 【データ更新箇所】

/** 不動産登記法76条の2の施行日（令和3年法律第24号附則1条2号・法務省Q&A Q3） */
export const GIMUKA_START = '2024-04-01';
/** 施行日前の相続の経過措置の期限（改正法附則5条6項・法務省Q&A Q4） */
export const KEIKA_SOCHI_DEADLINE = '2027-03-31';
/** 相続登記の申請期限（不動産登記法76条の2第1項・第2項） */
export const TOKI_YEARS = 3;
/** 相続放棄・限定承認の熟慮期間（民法915条1項） */
export const HOKI_MONTHS = 3;
/** 準確定申告（所得税法125条1項） */
export const JUN_KAKUTEI_MONTHS = 4;
/** 相続税の申告・納付（相続税法27条1項・33条） */
export const SOZOKUZEI_MONTHS = 10;
/** 登録免許税の免税措置（100万円以下の土地）の期限（租税特別措置法84条の2の3第2項） */
export const MENZEI_DEADLINE = '2027-03-31';
/** 条文・法務省Q&Aを最後に確かめた日 */
export const DATA_CHECKED_AT = '2026-09-29';

// ---------------------------------------------------------------- 日付の計算

function mustParse(ymd: string): DateParts {
  const p = parseDate(ymd);
  if (!p) throw new Error(`不正な日付: ${ymd}`);
  return p;
}

/**
 * 応当日（民法143条2項。応当日が無い月は末日）。4つの期限すべてがこれ1本。
 *
 * 例：2026-01-10 の4か月後 → 2026-05-10。2028-02-29 の36か月後 → 2031-02-28
 */
export function addMonthsSameDay(ymd: string, months: number): string {
  return formatDate(addMonths(mustParse(ymd), months));
}

/** 'YYYY-MM-DD' の大小比較（a < b なら負） */
function cmp(a: string, b: string): number {
  return compareDate(mustParse(a), mustParse(b));
}

/** deadline までの残り日数（今日が期限なら0、過ぎていれば負） */
export function daysLeft(deadline: string, today: string): number {
  return daysBetween(mustParse(today), mustParse(deadline));
}

// ---------------------------------------------------------------- 相続登記

export interface DivisionInput {
  /** 遺産分割の成立日 */
  on: string;
  /** 先に法定相続分での登記、または相続人申告登記をしたか */
  registeredFirst: boolean;
}

export interface TokiDeadline {
  /** 相続登記の期限 */
  deadline: string;
  /** 'principle' は知った日から3年、'transitional' は施行日前に知った相続の経過措置 */
  basis: 'principle' | 'transitional';
  /**
   * 遺産分割の内容で登記する期限（分割の日から3年。76条の2第2項・76条の3第4項）。
   * **先に法定相続分での登記か相続人申告登記をした人にだけ**返す。していなければ、
   * 分割の内容で登記する期限は `deadline` のまま（76条の2第1項）。分割日＋3年を見せると
   * 期限を実際より遅く誤認させる
   */
  divisionDeadline?: string;
  /** divisionDeadline が経過措置（施行日前の分割）で 2027-03-31 になったか */
  divisionBasis?: 'principle' | 'transitional';
}

/** 知った日（または分割の日）から3年。施行日より前なら経過措置の 2027-03-31 */
function threeYearsFrom(on: string): { date: string; basis: 'principle' | 'transitional' } {
  if (cmp(on, GIMUKA_START) < 0) return { date: KEIKA_SOCHI_DEADLINE, basis: 'transitional' };
  return { date: addMonthsSameDay(on, TOKI_YEARS * 12), basis: 'principle' };
}

/**
 * 相続登記の期限。
 *
 * @param knownOn 相続の開始と、不動産を相続で取得したことを知った日
 * @param division 遺産分割の成立日と、その前に登記・申出をしたか（任意）
 */
export function tokiDeadline(knownOn: string, division?: DivisionInput): TokiDeadline {
  const main = threeYearsFrom(knownOn);
  const result: TokiDeadline = { deadline: main.date, basis: main.basis };
  if (division && division.registeredFirst) {
    const d = threeYearsFrom(division.on);
    result.divisionDeadline = d.date;
    result.divisionBasis = d.basis;
  }
  return result;
}

// ---------------------------------------------------------------- ほかの期限

export interface OtherDeadlines {
  /** 相続放棄・限定承認（額面。繰り下げない） */
  hoki: string;
  /** 準確定申告（額面の応当日） */
  junKakutei: string;
  /** 相続税の申告・納付（額面の応当日） */
  sozokuzei: string;
}

/** 同じ知った日から決まる、相続のほかの期限（すべて額面の応当日） */
export function otherDeadlines(knownOn: string): OtherDeadlines {
  return {
    hoki: addMonthsSameDay(knownOn, HOKI_MONTHS),
    junKakutei: addMonthsSameDay(knownOn, JUN_KAKUTEI_MONTHS),
    sozokuzei: addMonthsSameDay(knownOn, SOZOKUZEI_MONTHS),
  };
}

/** 税の期限が繰り下がらない日か（国税通則法10条2項・同法施行令2条2項） */
function taxClosedReason(p: DateParts): string | null {
  const h = holidayName(p);
  if (h) return h;
  const w = weekdayLabel(p);
  if (w === '日') return '日曜';
  if (w === '土') return '土曜';
  if (p.month === 12 && p.day >= 29) return '年末（12月29日〜31日）';
  // 1月1日は元日（祝日）。2日・3日は「一般の休日」として扱われる
  if (p.month === 1 && p.day <= 3) return '年始の休日';
  return null;
}

export interface TaxDue {
  /** 額面の応当日 */
  nominal: string;
  /** 繰り下げ後の期限（繰り下げが無ければ nominal と同じ） */
  due: string;
  /** 額面の日が休みだった理由（'日曜' '海の日' など）。繰り下げが無ければ null */
  shiftedBecause: string | null;
  /** 祝日データ（`nissu-keisan` の HOLIDAYS）の範囲外で、祝日を見られなかった */
  holidayUnknown: boolean;
}

/**
 * 税の期限の繰り下げ（国税通則法10条2項）。
 *
 * 期限が日曜・祝日などの休日、土曜、12月29日〜31日に当たるときは、その翌日（それも休みならさらに翌日）
 * が期限になる。祝日は `nissu-keisan` の `HOLIDAYS`（2024〜2027年）で見る。範囲外の年は
 * 土日・年末年始だけ見て `holidayUnknown` を立てる（推測で祝日を足さない）。
 */
export function taxDueDate(nominal: string): TaxDue {
  let p = mustParse(nominal);
  const inRange = (d: DateParts) => d.year >= HOLIDAY_FIRST_YEAR && d.year <= HOLIDAY_LAST_YEAR;
  let holidayUnknown = !inRange(p);
  const first = taxClosedReason(p);
  let reason = first;
  while (reason) {
    p = addDays(p, 1);
    if (!inRange(p)) holidayUnknown = true;
    reason = taxClosedReason(p);
  }
  return { nominal, due: formatDate(p), shiftedBecause: first, holidayUnknown };
}

// ---------------------------------------------------------------- 入力の検査

export type InputError = 'known-before-death' | 'division-before-death';

/** 入力の矛盾。問題が無ければ null */
export function validateInput(death: string, knownOn: string, divisionOn?: string): InputError | null {
  if (cmp(knownOn, death) < 0) return 'known-before-death';
  if (divisionOn && cmp(divisionOn, death) < 0) return 'division-before-death';
  return null;
}

export const INPUT_ERROR_MESSAGES: Record<InputError, string> = {
  'known-before-death': '「知った日」が死亡日より前になっています。',
  'division-before-death': '遺産分割の成立日が死亡日より前になっています。',
};

/** 期限を過ぎているときに画面へそのまま出す文言（法務省Q&A Q2・Q4の順序どおり。過料の有無は書かない） */
export const OVERDUE_MESSAGE =
  '期限を過ぎています。法務省の説明では、登記官から催告書が届き、その期限内に申請がないと裁判所へ通知されます。過料になるかどうかは裁判所が決めます。';

/** 分割日を入れたが先に登記・申出をしていない人に添える1行（76条の2第1項） */
export const NO_FIRST_REGISTRATION_NOTE =
  '先に登記も申出もしていない場合、遺産分割の内容で登記する期限は上の期限と同じです。';

/** 残り日数の表示（'あと183日' / '今日が期限' / '12日過ぎています'） */
export function daysLeftLabel(n: number): string {
  if (n > 0) return `あと${n.toLocaleString('ja-JP')}日`;
  if (n === 0) return '今日が期限';
  return `${(-n).toLocaleString('ja-JP')}日過ぎています`;
}

/** '2026-09-27' → '2026年9月27日（日）' */
export function formatJaWithWeekday(ymd: string): string {
  const p = mustParse(ymd);
  return `${p.year}年${p.month}月${p.day}日（${weekdayLabel(p)}）`;
}
