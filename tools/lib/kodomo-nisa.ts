/**
 * こどもNISA（未成年者のつみたて投資枠）シミュレーター
 *
 * 仕様: docs/features/kodomo-nisa.md
 *
 * 2027年1月から、つみたて投資枠が0〜17歳に開く（正式名は「未成年者特定累積投資勘定」。
 * 「こどもNISA」は通称）。年間60万円・非課税保有限度額600万円。
 *
 * **出すのは日付と、制度から一意に決まる拠出額だけ。** 想定利回りによる評価額・
 * 課税口座と比べた税の差は出さない（投資助言に踏み込む領域。`ideco` と同じ線）。
 *
 * 年の区切りはすべて国税庁「令和8年度 税制改正のあらまし」（措法37の14）による：
 *
 * - 枠が設けられる年：**その年1月1日において18歳未満である年**と、出生した年
 *   （措法37の14④一・⑤七）。→ 積み立てられるのは「1月1日に17歳の年」の12月まで
 * - 特定基準年：**その年3月31日において12歳である年**。この年から、子の教育費・生活費に
 *   充てるための払出しができる（措法37の14⑤六ホ⑴ロ）
 * - 基準年：**その年3月31日において18歳である年**。払出しの制限は基準年の前年12月31日まで
 *   （措法37の14⑤六ホ⑶）
 *
 * 「◯月◯日において◯歳」の満年齢は `ageAt()`（誕生日の当日から新しい年齢）で数える。
 * 大人の NISA の「1月1日において18歳以上」が「1月1日生まれまで」と案内されているのと同じ数え方で、
 * 4月1日生まれは3月31日にはまだ前の年齢になる（3/31生まれと4/1生まれで1年ずれる）。
 *
 * 600万円が大人の1,800万円の内に数えられるか・払い出した分の枠が戻るかは
 * 政省令・金融庁Q&A待ち（仕様書の要確認3・4）。本ツールは**払い出さない前提**で計算し、
 * 大人の枠の残りは出さない。
 */
import { ageAt } from './nenrei';
import type { DateParts } from './date-parts';

// ─────────────────────────────────────────────
// 【データ更新箇所】制度の数字（政省令・金融庁Q&Aが出たら見直す）
// ─────────────────────────────────────────────

/** 年間投資枠（円） */
export const ANNUAL_CAP = 600_000;
/** 非課税保有限度額（円。取得価額で数える） */
export const LIFETIME_CAP = 6_000_000;
/** 毎月の積立額の上限（円）＝年間投資枠 ÷ 12 */
export const MONTHLY_CAP = ANNUAL_CAP / 12;
/** 制度の開始月 */
export const START_YM = '2027-01';
/** 払い出せる年の判定に使う年齢（その年3月31日に満12歳） */
export const WITHDRAWAL_AGE = 12;
/** 枠が設けられなくなる年齢（その年1月1日に満18歳） */
export const ADULT_AGE = 18;
/** 一次情報を最後に確認した日 */
export const DATA_CHECKED_AT = '2026-10-06';

// ─────────────────────────────────────────────

/**
 * 学ぶ「投資の教科書」の NISA の章。tools と learn は別のアプリなので
 * learn の `chapterPath()` を import できない。`chapterPath({ subject: 'toshi', slug: 'nisa' })`
 * と同じ形を basePath（/learn）つきで書く（`tests/kodomo-nisa.test.ts` が章の実在を見張る）
 */
export const LEARN_NISA_PATH = '/learn/toshi/nisa/';

/** 'YYYY-MM' を年と月に */
export interface YearMonth {
  year: number;
  month: number;
}

export function parseYm(ym: string): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function formatYm({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

const ymIndex = ({ year, month }: YearMonth) => year * 12 + (month - 1);
const fromIndex = (i: number): YearMonth => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });

/**
 * 毎月の積立額を制度の範囲に収める。
 * 上限（月5万円＝年60万円）を超えたら5万円に丸め、`capped` を立てる（画面で断るため）。
 */
export function clampMonthly(monthly: number): { monthly: number; capped: boolean } {
  if (!Number.isFinite(monthly) || monthly <= 0) return { monthly: 0, capped: false };
  const yen = Math.floor(monthly);
  if (yen > MONTHLY_CAP) return { monthly: MONTHLY_CAP, capped: true };
  return { monthly: yen, capped: false };
}

/**
 * 非課税で払い出せる最初の年（その年3月31日に満12歳以上である最初の年＝特定基準年）。
 * **開始年より前なら開始年を返す**（2027年1月にすでに14歳の子は、始めた年から払い出せる）。
 */
export function firstWithdrawalYear(birth: DateParts, startYear: number): number {
  // 3月31日に12歳になっている最初の年。誕生日が3/31以前なら生年+12、4/1以降なら生年+13
  let year = birth.year + WITHDRAWAL_AGE;
  if (ageAt(birth, { year, month: 3, day: 31 }) < WITHDRAWAL_AGE) year += 1;
  return Math.max(year, startYear);
}

/**
 * 積み立てられる最後の年（その年1月1日に満18歳未満である最後の年）。
 * 1月1日生まれは生年+17、それ以外は生年+18。
 */
export function lastContributionYear(birth: DateParts): number {
  let year = birth.year + ADULT_AGE;
  while (ageAt(birth, { year, month: 1, day: 1 }) >= ADULT_AGE) year -= 1;
  return year;
}

/**
 * 大人の NISA へ移る日（その年1月1日に満18歳以上である最初の年の1月1日）。
 * この日から未成年の枠は設けられず、大人の NISA の枠（つみたて投資枠・成長投資枠）になる。
 */
export function transferDate(birth: DateParts): DateParts {
  return { year: lastContributionYear(birth) + 1, month: 1, day: 1 };
}

/**
 * 払出しの制限が外れる日（基準年＝その年3月31日に満18歳である年の1月1日）。
 * 1月2日〜4月1日生まれは、大人の NISA へ移る日の1年前になる。
 */
export function restrictionEndDate(birth: DateParts): DateParts {
  let year = birth.year + ADULT_AGE;
  if (ageAt(birth, { year, month: 3, day: 31 }) < ADULT_AGE) year += 1;
  return { year, month: 1, day: 1 };
}

export interface MonthlyContribution {
  ym: string;
  amount: number;
  /** この月までの累計（取得価額） */
  cumulative: number;
}

export interface YearlyContribution {
  year: number;
  /** その年に積み立てた月数 */
  months: number;
  amount: number;
  cumulative: number;
}

export interface ScheduleInput {
  birth: DateParts;
  /** 積立を始める月 'YYYY-MM' */
  startYm: string;
  /** 毎月の積立額（円）。上限を超えたら丸める */
  monthly: number;
}

export interface ScheduleResult {
  /** 実際に積立を始める月（制度開始・生まれた月より前は繰り下げる） */
  startYm: string;
  /** 丸めた後の毎月の積立額 */
  monthly: number;
  /** 上限を超えた入力を丸めたか */
  capped: boolean;
  months: MonthlyContribution[];
  years: YearlyContribution[];
  /** 18歳で移行するまでの拠出額の合計 */
  total: number;
  /** 600万円の枠の残り */
  remaining: number;
  /** 600万円に届いた月（届かなければ null） */
  reachedYm: string | null;
  /** 最後に積み立てられる月（1月1日に17歳の年の12月） */
  lastYm: string;
  /** 払い出せる最初の年 */
  firstWithdrawalYear: number;
  /** 始めた時点ですでに払い出せる年齢を過ぎている（2027年1月に14歳など） */
  withdrawableFromStart: boolean;
  /** 払出しの制限が外れる日 */
  restrictionEnd: DateParts;
  /** 大人の NISA へ移る日 */
  transfer: DateParts;
}

export type ScheduleError = 'invalid-start' | 'too-old' | 'nothing-to-contribute';

export const SCHEDULE_ERROR_MESSAGES: Record<ScheduleError, string> = {
  'invalid-start': '積立を始める月を選んでください。',
  'too-old': 'この子は2027年1月1日の時点で18歳以上のため、未成年者のつみたて投資枠は使えません（大人の NISA の対象です）。',
  'nothing-to-contribute': '毎月の積立額を入れてください。',
};

/**
 * 月ごとの拠出。年60万円・累計600万円・18歳到達（1月1日に18歳の年）で止める。
 * **途中で払い出さない前提**（払い出した分の枠が戻るかは未確定のため）。
 */
export function contributionSchedule(input: ScheduleInput): ScheduleResult | ScheduleError {
  const start = parseYm(input.startYm);
  if (!start) return 'invalid-start';
  const { monthly, capped } = clampMonthly(input.monthly);
  if (monthly <= 0) return 'nothing-to-contribute';

  const lastYear = lastContributionYear(input.birth);
  const lastIdx = ymIndex({ year: lastYear, month: 12 });
  const firstIdx = Math.max(
    ymIndex(start),
    ymIndex(parseYm(START_YM)!),
    ymIndex({ year: input.birth.year, month: input.birth.month }),
  );
  if (firstIdx > lastIdx) return 'too-old';

  const months: MonthlyContribution[] = [];
  const yearMap = new Map<number, YearlyContribution>();
  let cumulative = 0;
  let reachedYm: string | null = null;
  for (let i = firstIdx; i <= lastIdx && cumulative < LIFETIME_CAP; i++) {
    const ym = fromIndex(i);
    const y = yearMap.get(ym.year) ?? { year: ym.year, months: 0, amount: 0, cumulative: 0 };
    const amount = Math.min(monthly, LIFETIME_CAP - cumulative, ANNUAL_CAP - y.amount);
    if (amount <= 0) continue;
    cumulative += amount;
    months.push({ ym: formatYm(ym), amount, cumulative });
    y.months += 1;
    y.amount += amount;
    y.cumulative = cumulative;
    yearMap.set(ym.year, y);
    if (cumulative >= LIFETIME_CAP) reachedYm = formatYm(ym);
  }

  return {
    startYm: formatYm(fromIndex(firstIdx)),
    monthly,
    capped,
    months,
    years: [...yearMap.values()],
    total: cumulative,
    remaining: LIFETIME_CAP - cumulative,
    reachedYm,
    lastYm: formatYm({ year: lastYear, month: 12 }),
    firstWithdrawalYear: firstWithdrawalYear(input.birth, fromIndex(firstIdx).year),
    withdrawableFromStart: firstWithdrawalYear(input.birth, 0) < fromIndex(firstIdx).year,
    restrictionEnd: restrictionEndDate(input.birth),
    transfer: transferDate(input.birth),
  };
}

export function isScheduleError(r: ScheduleResult | ScheduleError): r is ScheduleError {
  return typeof r === 'string';
}

/** 'YYYY-MM' → '2027年1月' */
export function formatYmJa(ym: string): string {
  const p = parseYm(ym);
  return p ? `${p.year}年${p.month}月` : ym;
}

/** DateParts → '2045年1月1日' */
export function formatDateJa(d: DateParts): string {
  return `${d.year}年${d.month}月${d.day}日`;
}

/** 金額 → '600万円' / '25万5,000円' */
export function formatYen(yen: number): string {
  const man = Math.floor(yen / 10_000);
  const rest = yen % 10_000;
  if (man === 0) return `${rest.toLocaleString('ja-JP')}円`;
  if (rest === 0) return `${man.toLocaleString('ja-JP')}万円`;
  return `${man.toLocaleString('ja-JP')}万${rest.toLocaleString('ja-JP')}円`;
}
