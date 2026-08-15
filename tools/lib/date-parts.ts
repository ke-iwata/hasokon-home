/**
 * 暦日（年月日）の基本操作
 *
 * 年齢計算（`lib/nenrei.ts`）と日数計算（`lib/nissu-keisan.ts`）が共有する土台。
 * もともと `lib/nenrei.ts` に置いていたが、日数計算からも同じものが要るので
 * ここへ切り出した（`lib/nenrei.ts` は後方互換のため同名で再エクスポートしている）。
 *
 * 日付は「年・月・日の3つ組」（DateParts）で持ち、`Date` は日数の差を出すときに
 * UTC で作るときだけ使う。ローカルタイムの `Date` で日付を組み立てると、
 * タイムゾーンによって1日ずれるため。
 */

/** 年月日の3つ組。month は 1〜12、day は 1〜31（実在する日だけを入れる） */
export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** うるう年か（グレゴリオ暦） */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** その年月の日数 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 実在する日付か（2月30日・4月31日などを弾く） */
export function isValidDate(parts: DateParts): boolean {
  const { year, month, day } = parts;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** 'YYYY-MM-DD' → DateParts。形式が不正・実在しない日付なら null */
export function parseDate(iso: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidDate(parts) ? parts : null;
}

/** DateParts → 'YYYY-MM-DD'（`<input type="date">` に渡せる形） */
export function formatDate(parts: DateParts): string {
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** DateParts → '2026年8月14日' */
export function formatJa(parts: DateParts): string {
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

/** 日付の大小比較（a < b なら負、同日なら0、a > b なら正） */
export function compareDate(a: DateParts, b: DateParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** 1970-01-01 からの通算日数。差を出すためだけに使う（UTCなので夏時間の影響を受けない） */
function toDayNumber(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

/** 通算日数 → DateParts */
function fromDayNumber(days: number): DateParts {
  const d = new Date(days * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** a から b までの日数（b が後なら正） */
export function daysBetween(a: DateParts, b: DateParts): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** n日後（負数なら n日前） */
export function addDays(parts: DateParts, n: number): DateParts {
  return fromDayNumber(toDayNumber(parts) + n);
}

/**
 * nか月後（負数なら nか月前）。
 *
 * 応当日が無い月は末日に寄せる（1月31日の1か月後は2月28日、うるう年は2月29日）。
 * 民法143条2項ただし書きの「その月に応当する日がないときは、その月の末日に満了する」
 * と同じ扱い。
 */
export function addMonths(parts: DateParts, n: number): DateParts {
  const total = parts.year * 12 + (parts.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(parts.day, daysInMonth(year, month)) };
}

/** 曜日（0=日〜6=土） */
export function dayOfWeek(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** 曜日の日本語表記 */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 曜日の日本語1文字（'金' など） */
export function weekdayLabel(parts: DateParts): string {
  return WEEKDAY_LABELS[dayOfWeek(parts)];
}

/** 土曜・日曜か */
export function isWeekend(parts: DateParts): boolean {
  const w = dayOfWeek(parts);
  return w === 0 || w === 6;
}
