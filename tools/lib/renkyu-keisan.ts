/**
 * 連休計算機のロジック
 *
 * 仕様: docs/features/renkyu-keisan.md
 *
 * 1. 有給 ◯ 日で何連休になるか（`findPlans`）
 * 2. この期間を休むには有給が何日要るか（`leaveNeeded`）
 *
 * どちらも **`isOff()` で 1 日ずつ判定する**（`businessDaysBetween()` は週末が土日に固定で、
 * 祝日データの範囲外で null を返すので使わない）。モード 1 と 2 の結果が食い違わないこと。
 *
 * 祝日の持ち主は `lib/nissu-keisan.ts` の `HOLIDAYS`。ここは import するだけで、祝日を足す作業は
 * 日数計算の仕様書どおりに 1 か所で行う。すべて純関数で、「今日」は呼び出し側から渡す。
 */

import { addDays, compareDate, daysBetween, dayOfWeek, WEEKDAY_LABELS, type DateParts } from './date-parts';
import { HOLIDAY_FIRST_YEAR, HOLIDAY_LAST_YEAR, holidayName } from './nissu-keisan';

export type { DateParts } from './date-parts';

// ---------------------------------------------------------------- 休みの決まり

/** 休みの曜日 */
export type WeekendRule = 'satsun' | 'sun';
/** 会社の年末年始休暇（法定ではなく職場の慣行） */
export type NewYearRule = 'dec29' | 'dec30' | 'none';
/** 会社の夏季休暇 */
export type SummerRule = 'obon' | 'none';

export interface OffRule {
  weekend: WeekendRule;
  newYear: NewYearRule;
  summer: SummerRule;
}

/** 画面の既定（土日休み・年末年始休暇 12/29〜1/3・夏季休暇なし） */
export const DEFAULT_RULE: OffRule = { weekend: 'satsun', newYear: 'dec29', summer: 'none' };

/** 使える有給の日数の上限（画面の選択肢 1〜5） */
export const MAX_LEAVE = 5;

/** 画面で選べる最初の年。これより前の連休は過去なので出さない */
export const FIRST_SELECTABLE_YEAR = 2026;

/** 画面で選べる年（`HOLIDAY_LAST_YEAR` まで。祝日が未確定の年は選べない） */
export function selectableYears(): number[] {
  const years: number[] = [];
  for (let y = FIRST_SELECTABLE_YEAR; y <= HOLIDAY_LAST_YEAR; y++) years.push(y);
  return years;
}

/**
 * 既定の年＝今日から見て次の年末年始を含む年（今日が N 年中なら N）。
 * 選べる範囲の外なら端に寄せる。
 */
export function defaultYear(today: DateParts): number {
  return Math.min(Math.max(today.year, FIRST_SELECTABLE_YEAR), HOLIDAY_LAST_YEAR);
}

/** 祝日が未確定の年か（`HOLIDAY_LAST_YEAR` の翌年以降。元日だけは祝日法 2 条で日付が固定） */
export function isHolidayUnconfirmed(d: DateParts): boolean {
  return d.year > HOLIDAY_LAST_YEAR;
}

/** モード 2 で選べる最初の日（祝日データの最初の日） */
export const FIRST_DATE: DateParts = { year: HOLIDAY_FIRST_YEAR, month: 1, day: 1 };

/** モード 2 で選べる最後の日（祝日データの翌年 1 月 3 日。年末年始の窓だけは元日を使って見る） */
export const LAST_DATE: DateParts = { year: HOLIDAY_LAST_YEAR + 1, month: 1, day: 3 };

/** 休みの理由の種類（カレンダーの色分けに使う） */
export type OffKind = 'holiday' | 'company' | 'weekend';

export interface OffReason {
  kind: OffKind;
  /** '元日' '年末年始休暇' '土曜' など */
  label: string;
}

function inNewYearHoliday(d: DateParts, rule: NewYearRule): boolean {
  if (rule === 'none') return false;
  const firstDecDay = rule === 'dec29' ? 29 : 30;
  return (d.month === 12 && d.day >= firstDecDay) || (d.month === 1 && d.day <= 3);
}

function inSummerHoliday(d: DateParts, rule: SummerRule): boolean {
  return rule === 'obon' && d.month === 8 && d.day >= 13 && d.day <= 16;
}

/** 祝日名。祝日が未確定の年は元日だけを祝日として扱う */
function holidayOf(d: DateParts): string | null {
  if (isHolidayUnconfirmed(d)) return d.month === 1 && d.day === 1 ? '元日' : null;
  return holidayName(d);
}

/** その日が休みである理由。休みでなければ null。祝日 → 会社の休み → 曜日の順に見る */
export function offReason(d: DateParts, rule: OffRule): OffReason | null {
  const holiday = holidayOf(d);
  if (holiday) return { kind: 'holiday', label: holiday };
  if (inNewYearHoliday(d, rule.newYear)) return { kind: 'company', label: '年末年始休暇' };
  if (inSummerHoliday(d, rule.summer)) return { kind: 'company', label: '夏季休暇' };
  const dow = dayOfWeek(d);
  if (dow === 0) return { kind: 'weekend', label: '日曜' };
  if (dow === 6 && rule.weekend === 'satsun') return { kind: 'weekend', label: '土曜' };
  return null;
}

/** その日が休み（土日・祝日・会社の休み）か */
export function isOff(d: DateParts, rule: OffRule): boolean {
  return offReason(d, rule) !== null;
}

// ---------------------------------------------------------------- モード 2

export interface LeaveNeededResult {
  /** 有給を使う日（期間内の休みでない日） */
  leaveDays: DateParts[];
  /** 期間の日数（両端を含む） */
  days: number;
  /** 祝日が未確定の年の日を含む（元日以外は休みの曜日と会社の休みだけで数えた） */
  unconfirmed: boolean;
}

/** モード 2 の入力として受け付ける期間か（逆順・範囲外を弾く） */
export function isSelectableRange(from: DateParts, to: DateParts): boolean {
  return (
    compareDate(from, to) <= 0 &&
    compareDate(from, FIRST_DATE) >= 0 &&
    compareDate(to, LAST_DATE) <= 0
  );
}

/**
 * モード 2：期間内の休みでない日 ＝ 必要な有給。`isOff()` で 1 日ずつ判定する。
 * 期間が逆順・選べる範囲の外なら null。
 */
export function leaveNeeded(from: DateParts, to: DateParts, rule: OffRule): LeaveNeededResult | null {
  if (!isSelectableRange(from, to)) return null;
  const leaveDays: DateParts[] = [];
  let unconfirmed = false;
  for (let d = from; compareDate(d, to) <= 0; d = addDays(d, 1)) {
    if (!isOff(d, rule)) leaveDays.push(d);
    if (isHolidayUnconfirmed(d)) unconfirmed = true;
  }
  return { leaveDays, days: daysBetween(from, to) + 1, unconfirmed };
}

// ---------------------------------------------------------------- モード 1

/** 時期のラベル */
export type Season = '年末年始' | 'GW' | 'お盆' | 'シルバーウィーク' | '3連休';

export interface Plan {
  start: DateParts;
  end: DateParts;
  /** 連休の日数（両端を含む） */
  days: number;
  /** 有給を使う日 */
  leaveDays: DateParts[];
  season: Season;
  /** カードの見出し（'年末年始' 'GW' '成人の日の連休' など） */
  label: string;
  /** 同じ時期の案をまとめるキー。3連休は最初の祝日の日付で分ける */
  key: string;
  /** 祝日が未確定の年の日を含む */
  unconfirmed: boolean;
}

function isNewYearDay(d: DateParts): boolean {
  return (d.month === 12 && d.day >= 29) || (d.month === 1 && d.day <= 3);
}

function isGoldenWeekDay(d: DateParts): boolean {
  return (d.month === 4 && d.day >= 29) || (d.month === 5 && d.day <= 6);
}

function formatKey(d: DateParts): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/**
 * 窓に含まれる「祝日・会社の休み」から時期を決める。どちらも含まなければ null
 * （ただの週末に有給をつなげた案は出さない）。
 */
function classify(
  special: { date: DateParts; reason: OffReason }[],
): { season: Season; label: string; anchor: DateParts } | null {
  if (special.length === 0) return null;
  const first = special[0];
  const newYear = special.find((s) => isNewYearDay(s.date));
  if (newYear) return { season: '年末年始', label: '年末年始', anchor: newYear.date };
  const gw = special.find((s) => s.reason.kind === 'holiday' && isGoldenWeekDay(s.date));
  if (gw) return { season: 'GW', label: 'GW（ゴールデンウィーク）', anchor: gw.date };
  const obon = special.find((s) => s.reason.label === '夏季休暇');
  if (obon) return { season: 'お盆', label: 'お盆（夏季休暇）', anchor: obon.date };
  const sw = special.find((s) => s.reason.kind === 'holiday' && s.date.month === 9);
  if (sw) return { season: 'シルバーウィーク', label: 'シルバーウィーク', anchor: sw.date };
  const holiday = special.find((s) => s.reason.kind === 'holiday') ?? first;
  return { season: '3連休', label: `${holiday.reason.label}の連休`, anchor: holiday.date };
}

/** findPlans が見る日付の範囲。前後の休みの塊を正しく切るため、年の前後を少し含める */
function scanRange(year: number): { from: DateParts; to: DateParts } {
  const from =
    year - 1 >= HOLIDAY_FIRST_YEAR
      ? { year: year - 1, month: 12, day: 1 }
      : { year, month: 1, day: 1 };
  // 翌年の祝日が確定していれば 1 月末まで（正月の塊の後ろを正しく切る）。未確定なら 1 月 3 日で打ち切る
  const to = year + 1 <= HOLIDAY_LAST_YEAR ? { year: year + 1, month: 1, day: 31 } : LAST_DATE;
  return { from, to };
}

/**
 * 有給 maxLeave 日以内で作れる連休を列挙する。
 *
 * - 窓 [s, e] の中の「休みでない日」がすべて有給になり、その数が 1..maxLeave
 * - s の前日と e の翌日が休みでない（＝それ以上伸びない）
 * - 祝日か会社の休みを 1 日以上含む（ただの週末＋有給は出さない）
 * - 「年 N」は N 年中に始まる連休。年末年始は N 年 12 月〜N+1 年 1 月の 1 つだけを N 年に入れる
 * - 同じ時期の案は、有給の日数ごとに最長のもの（同じ長さなら全部）に絞り、
 *   有給を減らしても同じ長さになる案は出さない
 *
 * 並びは開始日の早い順、同じ開始日なら有給の少ない順。
 */
export function findPlans(year: number, maxLeave: number, rule: OffRule): Plan[] {
  if (year < HOLIDAY_FIRST_YEAR || year > HOLIDAY_LAST_YEAR) return [];
  if (!Number.isInteger(maxLeave) || maxLeave < 1) return [];

  const { from, to } = scanRange(year);
  const n = daysBetween(from, to) + 1;
  const dates: DateParts[] = [];
  const reasons: (OffReason | null)[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    dates.push(d);
    reasons.push(offReason(d, rule));
  }
  const off = (i: number) => i >= 0 && i < n && reasons[i] !== null;

  const candidates: Plan[] = [];
  for (let s = 0; s < n; s++) {
    if (off(s - 1)) continue;
    let leave = 0;
    for (let e = s; e < n; e++) {
      if (!off(e)) leave++;
      if (leave > maxLeave) break;
      if (leave === 0 || off(e + 1)) continue;

      const special: { date: DateParts; reason: OffReason }[] = [];
      const leaveDays: DateParts[] = [];
      for (let i = s; i <= e; i++) {
        const r = reasons[i];
        if (r === null) leaveDays.push(dates[i]);
        else if (r.kind !== 'weekend') special.push({ date: dates[i], reason: r });
      }
      const cls = classify(special);
      if (!cls) continue;

      const start = dates[s];
      const planYear = cls.season === '年末年始' && start.month === 1 ? start.year - 1 : start.year;
      if (planYear !== year) continue;

      candidates.push({
        start,
        end: dates[e],
        days: e - s + 1,
        leaveDays,
        season: cls.season,
        label: cls.label,
        key: cls.season === '3連休' ? `3連休:${formatKey(cls.anchor)}` : `${cls.season}:${year}`,
        unconfirmed: dates.slice(s, e + 1).some(isHolidayUnconfirmed),
      });
    }
  }

  // 時期 × 有給の日数ごとに最長だけ残す
  const best = new Map<string, number>();
  for (const p of candidates) {
    const k = `${p.key}|${p.leaveDays.length}`;
    best.set(k, Math.max(best.get(k) ?? 0, p.days));
  }
  const longest = candidates.filter((p) => best.get(`${p.key}|${p.leaveDays.length}`) === p.days);

  // 有給を減らしても同じ長さ以上になる案は出さない
  const kept = longest.filter((p) => {
    for (let l = 1; l < p.leaveDays.length; l++) {
      if ((best.get(`${p.key}|${l}`) ?? 0) >= p.days) return false;
    }
    return true;
  });

  return kept.sort(
    (a, b) => compareDate(a.start, b.start) || a.leaveDays.length - b.leaveDays.length,
  );
}

/** 今日の時点でまだ選べる案か（終わっていない・有給の日が過ぎていない） */
export function isUpcoming(plan: Plan, today: DateParts): boolean {
  return compareDate(plan.end, today) >= 0 && plan.leaveDays.every((d) => compareDate(d, today) >= 0);
}

/** 1 枚のカード（同じ時期の案を有給の日数ごとに並べる） */
export interface PlanCard {
  key: string;
  season: Season;
  label: string;
  /** 有給の少ない順。同じ有給の日数で同じ長さの案は開始日の早い順に複数並ぶ */
  plans: Plan[];
  /** 「連休の日数 ÷ 有給の日数」のいちばん大きい値（並び順に使う） */
  efficiency: number;
}

/** 連休の日数 ÷ 有給の日数 */
export function efficiency(plan: Plan): number {
  return plan.days / plan.leaveDays.length;
}

/**
 * 案を時期ごとのカードにまとめ、「連休の日数 ÷ 有給の日数」の大きい順に並べる。
 * 同じ効率なら時期の早い順。
 */
export function groupPlans(plans: Plan[]): PlanCard[] {
  const cards = new Map<string, PlanCard>();
  for (const p of plans) {
    const card = cards.get(p.key);
    if (card) {
      card.plans.push(p);
      card.efficiency = Math.max(card.efficiency, efficiency(p));
    } else {
      cards.set(p.key, { key: p.key, season: p.season, label: p.label, plans: [p], efficiency: efficiency(p) });
    }
  }
  for (const card of cards.values()) {
    card.plans.sort(
      (a, b) => a.leaveDays.length - b.leaveDays.length || compareDate(a.start, b.start),
    );
  }
  return [...cards.values()].sort(
    (a, b) => b.efficiency - a.efficiency || compareDate(a.plans[0].start, b.plans[0].start),
  );
}

// ---------------------------------------------------------------- ミニカレンダー

/** カレンダーのマスの種類 */
export type CellKind = 'leave' | OffKind | 'work';

export interface CalendarCell {
  date: DateParts;
  kind: CellKind;
  /** 祝日名・'年末年始休暇' など（土日・平日は null） */
  label: string | null;
  /** 連休に含まれる日か */
  inPlan: boolean;
}

/**
 * 連休の前後 1 日を含む週（日曜はじまり）を 7 マスずつ返す。表示専用（タップしない）。
 */
export function calendarWeeks(plan: Pick<Plan, 'start' | 'end' | 'leaveDays'>, rule: OffRule): CalendarCell[][] {
  const first = addDays(plan.start, -1);
  const last = addDays(plan.end, 1);
  let cursor = addDays(first, -dayOfWeek(first));
  const leave = new Set(plan.leaveDays.map(formatKey));
  const weeks: CalendarCell[][] = [];
  while (compareDate(cursor, last) <= 0) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = cursor;
      const inPlan = compareDate(date, plan.start) >= 0 && compareDate(date, plan.end) <= 0;
      const reason = offReason(date, rule);
      const kind: CellKind = leave.has(formatKey(date)) ? 'leave' : reason ? reason.kind : 'work';
      week.push({ date, kind, label: reason && reason.kind !== 'weekend' ? reason.label : null, inPlan });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * ミニカレンダーの見出し。'2026年12月〜2027年1月' / '2027年5月'。
 * マスには日だけを書く（320 幅では '10/11' がマスに収まらないため）。
 */
export function calendarCaption(weeks: CalendarCell[][]): string {
  const first = weeks[0][0].date;
  const lastWeek = weeks[weeks.length - 1];
  const last = lastWeek[lastWeek.length - 1].date;
  const head = `${first.year}年${first.month}月`;
  if (first.year === last.year && first.month === last.month) return head;
  return `${head}〜${first.year === last.year ? '' : `${last.year}年`}${last.month}月`;
}

// ---------------------------------------------------------------- 表示用の文字列

/** '12/28（月）' */
export function formatMd(d: DateParts): string {
  return `${d.month}/${d.day}（${WEEKDAY_LABELS[dayOfWeek(d)]}）`;
}

/** 有給を使う日の並び。'12/28（月）・1/4（月）' */
export function formatLeaveDays(days: DateParts[]): string {
  return days.map(formatMd).join('・');
}

/** カードの太字 1 行。'有給 1 日（12/28 月）で 12/26（土）〜1/3（日）の 9 連休' */
export function planHeadline(plan: Pick<Plan, 'start' | 'end' | 'days' | 'leaveDays'>): string {
  const leave = plan.leaveDays.map((d) => `${d.month}/${d.day} ${WEEKDAY_LABELS[dayOfWeek(d)]}`).join('・');
  return `有給 ${plan.leaveDays.length} 日（${leave}）で ${formatMd(plan.start)}〜${formatMd(plan.end)}の ${plan.days} 連休`;
}
