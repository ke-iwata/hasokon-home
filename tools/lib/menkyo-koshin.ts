/**
 * 運転免許の更新期間 計算機のロジック
 *
 * 仕様: docs/features/menkyo-koshin-kikan.md
 *
 * 生年月日と免許証の有効期限（券面の「○年○月○日まで」）から、更新できる期間・
 * 土日祝と年末年始で延びる最終日・70歳以上の講習／75歳以上の認知機能検査を受けられる期間・
 * 次の有効期限の見込み・失効したときの試験免除の期限を日付で出す。
 * すべて純関数で、現在時刻に依存しない（「今日」は呼び出し側から渡す）。
 *
 * 条文（道路交通法・同施行令。e-Gov 法令API v2 で 2026-11-14 に確認）：
 * - 第101条1項：更新期間＝有効期間が満了する日の直前の誕生日の**1月前**〜満了する日。2項：2/29 生まれは平年 2/28
 * - 第95条の6第3項・施行令第33条の8：末日が日曜・土曜・休日・12/29〜1/3 なら翌日（連続して繰り下がる）
 * - 第95条の6第1項の表：次の有効期間の末日は「満了日等の後の n 回目の誕生日から起算して1月を経過する日」。
 *   n は 優良・一般で 70歳未満=5・70歳=4・71歳以上=3、違反運転者等（初回更新を含む）=3。
 *   年齢は「更新日等」で見るが、誕生日当日なら前日（備考二）、誕生日の後なら直前の誕生日の前日（備考三）で読む
 * - 第101条の4：更新期間が満了する日の年齢が70歳以上なら高齢者講習、75歳以上なら認知機能検査を、満了する日前6月以内に
 * - 第97条の2第1項第3号：失効した日から6月を経過しない者は学科・技能試験の免除（やむを得ない理由は3年以内・事情がやんでから1月）
 *
 * **満年齢は `nenrei.ts` の `ageAt()` を使う**（誕生日の当日から新しい年齢）。作り直さない。
 */

import {
  addDays,
  addMonths,
  compareDate,
  daysBetween,
  daysInMonth,
  formatDate,
  isLeapYear,
  parseDate,
  weekdayLabel,
  type DateParts,
} from './date-parts';
import { ageAt, fromWareki } from './nenrei';
import { HOLIDAY_FIRST_YEAR, HOLIDAY_LAST_YEAR, holidayName } from './nissu-keisan';

export { formatDate, parseDate, type DateParts } from './date-parts';

// ---------------------------------------------------------------- 【データ更新箇所】

/** 更新期間の始まり：直前の誕生日の何か月前か（第101条1項） */
export const RENEW_MONTHS_BEFORE_BIRTHDAY = 1;
/** 有効期間の末日：n 回目の誕生日から何か月か（第95条の6第1項の表） */
export const EXPIRY_MONTHS_AFTER_BIRTHDAY = 1;
/** 高齢者講習が要る年齢（更新期間が満了する日の年齢。第101条の4第1項） */
export const SENIOR_LECTURE_AGE = 70;
/** 認知機能検査が要る年齢（第101条の4第2項） */
export const COGNITIVE_TEST_AGE = 75;
/** 講習・検査を受けられるのは満了する日前何か月以内か（第101条の4） */
export const SENIOR_WINDOW_MONTHS = 6;
/** 失効してから試験の免除を受けられる期間（第97条の2第1項第3号） */
export const LAPSE_MONTHS = 6;
/** やむを得ない理由があるときの上限（同号） */
export const LAPSE_UNAVOIDABLE_YEARS = 3;
/**
 * 次の有効期間の誕生日の回数（第95条の6第1項の表）。
 * 優良・一般運転者は更新日等の年齢で 5・4・3、違反運転者等（継続5年未満の初回更新を含む）は3
 */
export const BIRTHDAYS_BY_AGE: ReadonlyArray<{
  maxAge: number;
  birthdays: number;
}> = [
  { maxAge: 69, birthdays: 5 },
  { maxAge: 70, birthdays: 4 },
  { maxAge: Infinity, birthdays: 3 },
];
export const BIRTHDAYS_THREE_YEAR = 3;
/** 末日が年末年始なら延びる期間（施行令第33条の8第3号）：12/29〜1/3 */
export const YEAR_END_FROM = { month: 12, day: 29 } as const;
export const YEAR_END_TO = { month: 1, day: 3 } as const;
/** 一次情報を最後に確かめた日 */
export const DATA_CHECKED_AT = '2026-11-14';

// ---------------------------------------------------------------- 日付の部品

function mustParse(ymd: string): DateParts {
  const p = parseDate(ymd);
  if (!p) throw new Error(`不正な日付: ${ymd}`);
  return p;
}

function isLeapDayBirth(birth: DateParts): boolean {
  return birth.month === 2 && birth.day === 29;
}

/**
 * その年の誕生日（道路交通法の読み方）。**2月29日生まれは平年 2月28日**
 * （第101条2項・第95条の6備考六）。`ageAt()` の流儀（3月1日）とは違うので取り違えない。
 */
export function licenseBirthday(birth: DateParts, year: number): DateParts {
  if (isLeapDayBirth(birth) && !isLeapYear(year)) return { year, month: 2, day: 28 };
  return { year, month: birth.month, day: birth.day };
}

/** date より前（当日を含まない）で直前の誕生日 */
function birthdayBefore(birth: DateParts, date: DateParts): DateParts {
  const same = licenseBirthday(birth, date.year);
  return compareDate(same, date) < 0 ? same : licenseBirthday(birth, date.year - 1);
}

/** date より後（当日を含まない）の n 回目の誕生日 */
function nthBirthdayAfter(birth: DateParts, date: DateParts, n: number): DateParts {
  let first = licenseBirthday(birth, date.year);
  if (compareDate(first, date) <= 0) first = licenseBirthday(birth, date.year + 1);
  return licenseBirthday(birth, first.year + n - 1);
}

/** 12/29〜1/3 か（施行令第33条の8第3号） */
export function isYearEndHoliday(p: DateParts): boolean {
  return (
    (p.month === YEAR_END_FROM.month && p.day >= YEAR_END_FROM.day) ||
    (p.month === YEAR_END_TO.month && p.day <= YEAR_END_TO.day)
  );
}

/** 末日が延びる理由（'土曜' '日曜' '年末年始' '憲法記念日' など）。延びない日なら null */
export function extensionReason(p: DateParts): string | null {
  if (isYearEndHoliday(p)) return '年末年始';
  const h = holidayName(p);
  if (h) return h;
  const w = weekdayLabel(p);
  if (w === '土') return '土曜';
  if (w === '日') return '日曜';
  return null;
}

export interface ExtendedDay {
  /** 延ばしたあとの日 */
  date: DateParts;
  /** 飛ばした日（古い順）とその理由 */
  skipped: Array<{ date: DateParts; reason: string }>;
  /**
   * 判定した日のどれかが祝日表（`HOLIDAY_FIRST_YEAR`〜`HOLIDAY_LAST_YEAR`）の外。
   * その日は土日・年末年始だけで判定しているので、祝日なら実際はさらに延びる
   */
  holidayTableOutOfRange: boolean;
}

/**
 * 期間の末日が土曜・日曜・休日・12/29〜1/3 なら、そうでない日まで繰り下げる
 * （第95条の6第3項・施行令第33条の8。連休なら連続して繰り下がる）。
 */
export function nextExtendedDay(parts: DateParts): ExtendedDay {
  let date = parts;
  const skipped: ExtendedDay['skipped'] = [];
  let outOfRange = false;
  for (;;) {
    if (date.year < HOLIDAY_FIRST_YEAR || date.year > HOLIDAY_LAST_YEAR) outOfRange = true;
    const reason = extensionReason(date);
    if (!reason) break;
    skipped.push({ date, reason });
    date = addDays(date, 1);
  }
  return { date, skipped, holidayTableOutOfRange: outOfRange };
}

// ---------------------------------------------------------------- 更新期間

export interface RenewalWindow {
  /** 有効期限の直前の誕生日（2/29 生まれの平年は 2/28） */
  birthday: DateParts;
  /** 更新期間の始まり（誕生日の1か月前の日） */
  start: DateParts;
  /** 券面の有効期限（延長前） */
  expiry: DateParts;
  /** 法律上の末日（土日祝・年末年始なら延長後） */
  legalEnd: DateParts;
  extended: boolean;
  /** 飛ばした日の理由（'土曜' '日曜' など。古い順） */
  extendedReasons: string[];
  holidayTableOutOfRange: boolean;
}

/** 生年月日と券面の有効期限から、更新できる期間（第101条1項・第95条の6第3項） */
export function renewalWindow(birth: DateParts, expiry: DateParts): RenewalWindow {
  const birthday = birthdayBefore(birth, expiry);
  const start = addMonths(birthday, -RENEW_MONTHS_BEFORE_BIRTHDAY);
  const ext = nextExtendedDay(expiry);
  return {
    birthday,
    start,
    expiry,
    legalEnd: ext.date,
    extended: ext.skipped.length > 0,
    extendedReasons: ext.skipped.map((s) => s.reason),
    holidayTableOutOfRange: ext.holidayTableOutOfRange,
  };
}

/**
 * 「更新の年」だけ分かる人の代替入力：その年の誕生日の1か月後を有効期限とみなす
 * （券面の日付はふつうこの日。違ったら券面を入れてもらう）
 */
export function estimatedExpiry(birth: DateParts, renewalYear: number): DateParts {
  return addMonths(licenseBirthday(birth, renewalYear), EXPIRY_MONTHS_AFTER_BIRTHDAY);
}

/**
 * 今日以降で最初に来る「誕生日の1か月後」の日。画面を開いた瞬間の例に使う
 * （既定値を固定の日付にすると、日がたつと「期限を過ぎています」が出てしまう。#503 レビュー必須1）
 */
export function upcomingExpiry(birth: DateParts, today: DateParts): DateParts {
  for (let year = today.year - 1; ; year++) {
    const e = estimatedExpiry(birth, year);
    if (compareDate(e, today) >= 0) return e;
  }
}

/** 券面の有効期限が「誕生日の1か月後」の形になっているか（なっていなければ確かめてもらう） */
export function isRegularExpiry(birth: DateParts, expiry: DateParts): boolean {
  const birthday = birthdayBefore(birth, expiry);
  return compareDate(addMonths(birthday, EXPIRY_MONTHS_AFTER_BIRTHDAY), expiry) === 0;
}

// ---------------------------------------------------------------- 高齢者講習・認知機能検査

export interface SeniorWindow {
  /** 更新期間が満了する日（延長後の末日）の年齢 */
  ageAtEnd: number;
  /** 高齢者講習が要る（70歳以上） */
  lecture: boolean;
  /** 認知機能検査が要る（75歳以上） */
  cognitive: boolean;
  /** 受けられる期間の始まり（満了する日の6か月前の応当日の翌日。境目の読み方は仕様書「決めること」1） */
  from: DateParts;
  /** 受けられる期間の終わり（満了する日） */
  to: DateParts;
}

/** 更新期間が満了する日の年齢で、講習・検査が要るかと受けられる期間（第101条の4） */
export function seniorWindow(birth: DateParts, legalEnd: DateParts): SeniorWindow {
  const age = ageAt(birth, legalEnd);
  return {
    ageAtEnd: age,
    lecture: age >= SENIOR_LECTURE_AGE,
    cognitive: age >= COGNITIVE_TEST_AGE,
    from: addDays(addMonths(legalEnd, -SENIOR_WINDOW_MONTHS), 1),
    to: legalEnd,
  };
}

// ---------------------------------------------------------------- 次の有効期限

/** いまの免許の有効期間（色）。優良かどうかの判定はしない（利用者に選ばせる） */
export type LicenseTerm = 'five' | 'three';

export interface NextExpiry {
  /** 次の有効期限（**延長前**＝券面に印字される日付。延長は判定しない） */
  date: DateParts;
  /** 年齢と回数を数えるときの「更新日等」の年齢（備考二・三で読み替えたあと） */
  ageAtRenewal: number;
  /** 何回目の誕生日か */
  birthdays: number;
  /** 更新期間より前の更新（第101条の2の特例更新）として数えたか */
  early: boolean;
}

/**
 * 次の有効期限の見込み（第95条の6第1項の表）。
 *
 * - 年齢は**更新日の年齢をそのまま使わない**。更新期間の誕生日の当日・後に更新しても、
 *   誕生日の前日の年齢で数える（備考二・三）。期間内なら、いつ更新しても同じ結果になる
 * - 「満了日等」は更新期間内の更新なら**いまの免許の有効期間が満了する日**（券面の日付）。
 *   更新期間より前に更新したとき（特例更新）は更新した日から数える
 * - 次の期限は祝日表の外（2029年以降）になるので、土日祝・年末年始の延長は判定しない
 */
export function nextExpiry(birth: DateParts, expiry: DateParts, renewalDate: DateParts, term: LicenseTerm): NextExpiry {
  const w = renewalWindow(birth, expiry);
  const early = compareDate(renewalDate, w.start) < 0;
  // 備考二・三：誕生日当日〜有効期間の末日に更新したら、直前の誕生日の前日で読む
  const ageBase = !early && compareDate(renewalDate, w.birthday) >= 0 ? addDays(w.birthday, -1) : renewalDate;
  const age = ageAt(birth, ageBase);
  const birthdays =
    term === 'three'
      ? BIRTHDAYS_THREE_YEAR
      : (BIRTHDAYS_BY_AGE.find((r) => age <= r.maxAge) as { birthdays: number }).birthdays;
  const base = early ? renewalDate : expiry;
  const nth = nthBirthdayAfter(birth, base, birthdays);
  return {
    date: addMonths(nth, EXPIRY_MONTHS_AFTER_BIRTHDAY),
    ageAtRenewal: age,
    birthdays,
    early,
  };
}

// ---------------------------------------------------------------- 失効したとき

export interface LapseDeadline {
  /** 失効した日（延長後の末日の翌日） */
  lapsedOn: DateParts;
  /** 試験の免除を受けられる最後の日（失効した日から起算して6月を経過しない日） */
  deadline: DateParts;
  /** やむを得ない理由があったときの上限（失効した日から起算して3年を経過しない日） */
  unavoidableDeadline: DateParts;
}

/** from を初日に数えて months か月を経過しない最後の日（応当日の前日。応当日が無ければその月の末日。民法143条2項） */
function lastDayWithinMonths(from: DateParts, months: number): DateParts {
  const total = from.year * 12 + (from.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return from.day > daysInMonth(year, month)
    ? { year, month, day: daysInMonth(year, month) }
    : addDays({ year, month, day: from.day }, -1);
}

/**
 * 失効したときの試験免除の期限（第97条の2第1項第3号）。
 * 失効した日を初日に数え、6か月（やむを得ない理由は3年）の応当日の前日まで。
 */
export function lapseDeadline(legalEnd: DateParts): LapseDeadline {
  const lapsedOn = addDays(legalEnd, 1);
  return {
    lapsedOn,
    deadline: lastDayWithinMonths(lapsedOn, LAPSE_MONTHS),
    unavoidableDeadline: lastDayWithinMonths(lapsedOn, LAPSE_UNAVOIDABLE_YEARS * 12),
  };
}

/**
 * 今日から見た失効後の状態（#503 レビュー必須2）。
 * - 'within6m'：6か月の免除期限の当日まで
 * - 'within3y'：6か月は過ぎたが、やむを得ない理由があれば3年の上限の当日まで
 * - 'over3y'：3年も過ぎた（新たに取り直す）
 */
export type LapseStatus = 'within6m' | 'within3y' | 'over3y';

export function lapseStatus(lapse: LapseDeadline, today: DateParts): LapseStatus {
  if (compareDate(today, lapse.deadline) <= 0) return 'within6m';
  if (compareDate(today, lapse.unavoidableDeadline) <= 0) return 'within3y';
  return 'over3y';
}

// ---------------------------------------------------------------- 今日から見た状態

export type RenewalStatus =
  | { kind: 'before'; daysUntilStart: number }
  | { kind: 'during'; daysLeft: number }
  | { kind: 'expired'; daysSinceLapse: number };

/** 今日から見た状態。'during' の daysLeft は末日当日なら0。'expired' の daysSinceLapse は失効した日を1日目とする */
export function renewalStatus(w: RenewalWindow, today: DateParts): RenewalStatus {
  if (compareDate(today, w.start) < 0) return { kind: 'before', daysUntilStart: daysBetween(today, w.start) };
  if (compareDate(today, w.legalEnd) <= 0) return { kind: 'during', daysLeft: daysBetween(today, w.legalEnd) };
  return { kind: 'expired', daysSinceLapse: daysBetween(w.legalEnd, today) };
}

// ---------------------------------------------------------------- 入力

/**
 * 券面の日付の文字列を読む。'2026-12-29'・'2026/12/29'・'2026年12月29日'・
 * '令和8年12月29日'・'R8.12.29'（平成・昭和も）に対応。読めなければ null。
 * 全角数字は半角にしてから読む
 */
export function parseCardDate(text: string): DateParts | null {
  const s = text
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。／－]/g, (c) => ({ '．': '.', '。': '.', '／': '/', '－': '-' })[c] as string)
    .replace(/\s+/g, '')
    .replace(/まで$/, '');
  const west = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(s);
  if (west) {
    const p = {
      year: Number(west[1]),
      month: Number(west[2]),
      day: Number(west[3]),
    };
    return parseDate(formatDate(p));
  }
  const ERA: Record<string, string> = {
    令和: '令和',
    R: '令和',
    r: '令和',
    平成: '平成',
    H: '平成',
    h: '平成',
    昭和: '昭和',
    S: '昭和',
    s: '昭和',
  };
  const wa = /^(令和|平成|昭和|[RrHhSs])(元|\d{1,2})[年.](\d{1,2})[月.](\d{1,2})日?$/.exec(s);
  if (!wa) return null;
  const r = fromWareki(ERA[wa[1]], wa[2] === '元' ? 1 : Number(wa[2]), Number(wa[3]), Number(wa[4]));
  return 'error' in r ? null : r;
}

export type InputError = 'birth-future' | 'expiry-before-birth' | 'expiry-too-early';

export const INPUT_ERROR_MESSAGES: Record<InputError, string> = {
  'birth-future': '生年月日が今日より後になっています。',
  'expiry-before-birth': '免許証の有効期限が生年月日より前になっています。',
  'expiry-too-early': '有効期限の日に16歳未満になります。生年月日と券面の日付を確かめてください。',
};

/** 入力の矛盾。問題が無ければ null */
export function validateInput(birth: DateParts, expiry: DateParts, today: DateParts): InputError | null {
  if (compareDate(birth, today) > 0) return 'birth-future';
  if (compareDate(expiry, birth) <= 0) return 'expiry-before-birth';
  // 原付・小型特殊の16歳が最年少。それより前に期限が来る免許は無い
  if (ageAt(birth, expiry) < 16) return 'expiry-too-early';
  return null;
}

// ---------------------------------------------------------------- まとめ

export interface MenkyoInput {
  birth: string;
  /** 券面の有効期限。無ければ renewalYear から推定する */
  expiry?: string;
  /** 代替入力：次の誕生日の年（＝更新の年） */
  renewalYear?: number;
  term: LicenseTerm;
}

export interface MenkyoResult {
  window: RenewalWindow;
  senior: SeniorWindow;
  next: NextExpiry;
  lapse: LapseDeadline;
  /** 代替入力（更新の年だけ）から推定した */
  estimated: boolean;
  /** 券面の日付が「誕生日の1か月後」の形になっていない */
  irregularExpiry: boolean;
  leapDayBirth: boolean;
}

/** 計算のひとまとめ。日付が読めなければ null */
export function calcMenkyo(input: MenkyoInput): MenkyoResult | null {
  const birth = parseDate(input.birth);
  if (!birth) return null;
  let expiry: DateParts | null = null;
  let estimated = false;
  if (input.expiry) expiry = parseDate(input.expiry);
  else if (input.renewalYear && Number.isInteger(input.renewalYear) && input.renewalYear > birth.year) {
    expiry = estimatedExpiry(birth, input.renewalYear);
    estimated = true;
  }
  if (!expiry || compareDate(expiry, birth) <= 0) return null;
  const window = renewalWindow(birth, expiry);
  return {
    window,
    senior: seniorWindow(birth, window.legalEnd),
    // 更新期間内ならいつ更新しても同じ（備考三）。始まりの日で数える
    next: nextExpiry(birth, expiry, window.start, input.term),
    lapse: lapseDeadline(window.legalEnd),
    estimated,
    irregularExpiry: !estimated && !isRegularExpiry(birth, expiry),
    leapDayBirth: isLeapDayBirth(birth),
  };
}

// ---------------------------------------------------------------- 表示

/** DateParts → '2026年11月14日（土）' */
export function formatJaWithWeekday(p: DateParts): string {
  return `${p.year}年${p.month}月${p.day}日（${weekdayLabel(p)}）`;
}

/** 結果のすぐ下に必ず出す1行（仕様書「結果」） */
export const OFFICIAL_NOTICE =
  '正式な期限は免許証の券面と、警察から届く更新連絡書（はがき）でご確認ください。この計算は条文から出した目安です。';

/** 結果の見出し。代替入力のときは「推定」をつける */
export function windowHeading(estimated: boolean): string {
  return estimated ? '更新できる期間（推定）' : '更新できる期間';
}
