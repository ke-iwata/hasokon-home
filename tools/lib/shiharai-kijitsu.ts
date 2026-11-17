/**
 * 支払期日・遅延利息 計算機（取適法・フリーランス法の60日ルール）のロジック
 *
 * 仕様: docs/features/shiharai-kijitsu-toriteki.md
 *
 * - 取適法（製造委託等に係る中小受託事業者に対する代金の支払の遅延等の防止に関する法律。
 *   昭和31年法律第120号。旧下請法。令和7年法律第41号で改題・改正、2026-01-01 施行）
 *   - 第3条第1項：支払期日は受領日から起算して60日の期間内
 *   - 第3条第2項：60日を超えて定めたときは「受領した日から起算して60日を経過した日の前日」が支払期日
 *     → 受領日を1日目として **60日目（受領日＋59日）**
 *   - 第6条第1項：遅延利息は「受領した日から起算して60日を経過した日から支払をする日まで」
 *     → 起算日は **受領日＋60日**（＝61日目）。定めた支払期日ではない
 *   - 令和7年公正取引委員会規則第9号：率は年14.6%
 * - フリーランス法（特定受託事業者に係る取引の適正化等に関する法律。令和5年法律第25号）
 *   - 第4条第1項：60日の期間内に報酬の支払期日を定める。**遅延利息の規定は無い**
 *
 * 運営者と決めることのうち、一次資料で確かめられなかったものは仕様書の既定どおりにしている：
 * - 決めること 1（月単位の締切の「2か月」読み替え）：条文の60日だけで判定し、運用は公取委に確認を、と注記
 * - 決めること 2（休業日の順延）：期日は動かさず「休業日です」とだけ出す
 * - 決めること 3（日割りの基礎と円未満）：365日・円未満切り捨て。式を画面に出す
 * - 決めること 5（両方に当てはまるときの優先）：両方の法律の名前を並べるだけ
 *
 * すべて純関数。日付は DateParts（年月日の3つ組）で受け渡す。
 */

import { addDays, compareDate, daysBetween, daysInMonth, type DateParts } from './date-parts';
import { HOLIDAY_FIRST_YEAR, HOLIDAY_LAST_YEAR, nonBusinessReason } from './nissu-keisan';

// ---------------------------------------------------------------- 【データ更新箇所】

/** 支払期日の上限（受領日を1日目とする日数）。取適法第3条・フリーランス法第4条 */
export const LIMIT_DAYS = 60;

/** 遅延利息の率（年14.6%）。令和7年公正取引委員会規則第9号。整数で持つため 1/1000 % 単位 */
export const LATE_RATE_PER_MILLE_PERCENT = 14_600;

/** 画面に出す率の表記 */
export const LATE_RATE_LABEL = '年14.6%';

/** 日割りの基礎（仕様書「決めること 3」：確かめられなければ365日） */
export const DAYS_PER_YEAR = 365;

/** 取適法の施行日。これより前にした発注は旧下請法（60日・14.6%は同じ） */
export const TORITEKI_EFFECTIVE = '2026-01-01';

/** 一次情報の最終確認日 */
export const DATA_CHECKED_AT = '2026-11-15';

/** 資本金の区分（円） */
export const CAPITAL_10M = 10_000_000;
export const CAPITAL_50M = 50_000_000;
export const CAPITAL_300M = 300_000_000;

/** 従業員基準（常時使用する従業員の数） */
export const EMPLOYEES_A = 300;
export const EMPLOYEES_B = 100;

// ---------------------------------------------------------------- 支払期日

/** 法律上の最も遅い支払期日（受領日を1日目として60日目＝受領日＋59日） */
export function legalDueDate(received: DateParts): DateParts {
  return addDays(received, LIMIT_DAYS - 1);
}

/** 受領日から支払日まで、受領日を1日目として何日目か（初日算入） */
export function dayCount(received: DateParts, paid: DateParts): number {
  return daysBetween(received, paid) + 1;
}

/** 休業日の理由。祝日表の範囲外の年は土日だけで判定する（仕様書「確かめること」） */
export function closedReason(date: DateParts): string | null {
  // 祝日表は範囲外の年に行を持たないので、範囲外では土日だけが返る
  return nonBusinessReason(date);
}

/** 祝日表で休業日を判定できる年か */
export function holidayKnown(year: number): boolean {
  return year >= HOLIDAY_FIRST_YEAR && year <= HOLIDAY_LAST_YEAR;
}

// ---------------------------------------------------------------- 支払条件のチェック

/** 締め日・支払日の「末日」は 31 で表す（その月の日数に寄せる） */
export const END_OF_MONTH = 31;

/** 締め日の選択肢（31 = 末日） */
export const CLOSING_DAYS = [5, 10, 15, 20, 25, END_OF_MONTH] as const;
/** 支払日の選択肢（31 = 末日） */
export const PAY_DAYS = [5, 10, 15, 20, 25, END_OF_MONTH] as const;

/** '末日' / '20日' */
export function dayLabel(day: number): string {
  return day >= END_OF_MONTH ? '末日' : `${day}日`;
}

/** その年月の「n日」。31（末日）や 2月30日などは月末に寄せる */
function dayOf(year: number, month: number, day: number): DateParts {
  // month は 1〜12 を外れてもよい（繰り上げ・繰り下げ）
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const m = (total - y * 12) + 1;
  return { year: y, month: m, day: Math.min(day, daysInMonth(y, m)) };
}

export interface MonthCase {
  /** 締め日のある月（1〜12） */
  month: number;
  /** 締め期間の初日（最も長くなる納品日） */
  earliestDelivery: DateParts;
  /** 締め期間の末日（締め日。最も短くなる納品日） */
  latestDelivery: DateParts;
  /** 支払日 */
  payDate: DateParts;
  /** 締め期間の初日に納品したときの日数（初日算入） */
  maxDays: number;
  /** 締め日に納品したときの日数（初日算入） */
  minDays: number;
  /** 60日を超えるか */
  over60: boolean;
}

/**
 * 「○日締め・翌月（翌々月）○日払い」の条件で、締め日のある月ごとに最も長い・短いケースを出す。
 *
 * @param closingDay 締め日（5〜25、31 = 末日）
 * @param payMonthOffset 1 = 翌月、2 = 翌々月
 * @param payDay 支払日（5〜25、31 = 末日）
 * @param year 締め日のある年（その年の1〜12月の12件を返す）
 */
export function worstCaseDays(
  closingDay: number,
  payMonthOffset: number,
  payDay: number,
  year: number,
): MonthCase[] {
  const out: MonthCase[] = [];
  for (let month = 1; month <= 12; month++) {
    const closing = dayOf(year, month, closingDay);
    const prevClosing = dayOf(year, month - 1, closingDay);
    const earliestDelivery = addDays(prevClosing, 1);
    const payDate = dayOf(year, month + payMonthOffset, payDay);
    const maxDays = dayCount(earliestDelivery, payDate);
    out.push({
      month,
      earliestDelivery,
      latestDelivery: closing,
      payDate,
      maxDays,
      minDays: dayCount(closing, payDate),
      over60: maxDays > LIMIT_DAYS,
    });
  }
  return out;
}

/** 12か月のうち最も長いケース（同じ日数なら早い月） */
export function longestCase(cases: MonthCase[]): MonthCase {
  return cases.reduce((a, b) => (b.maxDays > a.maxDays ? b : a));
}

/** 締め期間に入る納品日から、その条件での支払日を出す */
export function payDateFor(
  received: DateParts,
  closingDay: number,
  payMonthOffset: number,
  payDay: number,
): DateParts {
  // その月の締め日を過ぎていれば、翌月の締めに入る
  let closing = dayOf(received.year, received.month, closingDay);
  if (compareDate(received, closing) > 0) closing = dayOf(received.year, received.month + 1, closingDay);
  return dayOf(closing.year, closing.month + payMonthOffset, payDay);
}

/** 「締めなし（納品ごとに受領日から○日後に払う）」の日数（初日算入） */
export function daysForAfterN(n: number): number {
  return n + 1;
}

// ---------------------------------------------------------------- 遅延利息

export interface LateInterest {
  /** 遅延利息の起算日（受領日から60日を経過した日＝受領日＋60日） */
  fromDate: DateParts;
  /** 起算日から支払日までの日数（両端を含む）。遅延でなければ 0 */
  days: number;
  /** 遅延利息（円。円未満切り捨て） */
  interest: number;
}

/**
 * 取適法第6条第1項の遅延利息。
 *
 * 受領日から起算して60日を経過した日（受領日＋60日）から支払をする日までの日数 ×
 * 未払金額 × 年14.6% ÷ 365。円未満切り捨て。
 * `paidOn` が受領日＋59日（60日目）以前なら 0。
 */
export function lateInterest(amount: number, received: DateParts, paidOn: DateParts): LateInterest {
  const fromDate = addDays(received, LIMIT_DAYS);
  const days = compareDate(paidOn, fromDate) >= 0 ? daysBetween(fromDate, paidOn) + 1 : 0;
  const yen = Math.max(0, Math.floor(amount));
  // 大きな額でも誤差が出ないよう BigInt で掛けてから割る（14.6% = 14600 / 100000）
  const interest =
    days === 0 || yen === 0
      ? 0
      : Number(
          (BigInt(yen) * BigInt(days) * BigInt(LATE_RATE_PER_MILLE_PERCENT)) /
            (BigInt(100_000) * BigInt(DAYS_PER_YEAR)),
        );
  return { fromDate, days, interest };
}

// ---------------------------------------------------------------- 適用の判定

/**
 * 取引の種類（4択）
 * - manufacture: 製造委託・修理委託
 * - transport: 特定運送委託
 * - designated: 情報成果物作成委託・役務提供委託のうち政令で定めるもの（プログラム作成・運送・倉庫保管・情報処理）
 * - other: 上記以外の情報成果物作成委託・役務提供委託（デザイン・コンテンツ制作・コンサルなど）
 */
export type DealKind = 'manufacture' | 'transport' | 'designated' | 'other';

export const DEAL_KIND_LABELS: Record<DealKind, string> = {
  manufacture: '製造委託・修理委託',
  transport: '特定運送委託（発荷主から運送事業者への運送の委託）',
  designated: 'プログラム作成・運送・倉庫保管・情報処理の委託',
  other: 'それ以外の情報成果物作成・役務提供の委託（デザイン・記事・コンサルなど）',
};

/** 受注側の形態 */
export type ContractorType = 'individual' | 'soloCorp' | 'corp';

export const CONTRACTOR_TYPE_LABELS: Record<ContractorType, string> = {
  individual: '個人（個人事業主）',
  soloCorp: '法人（役員は代表者1人だけ）',
  corp: '法人（役員が2人以上）',
};

export interface ApplicabilityInput {
  /** 発注側の資本金（円）。発注側は法人とみなす */
  ordererCapital: number;
  /** 発注側の常時使用する従業員の数 */
  ordererEmployees: number;
  /** 受注側の資本金（円）。個人なら無視 */
  contractorCapital: number;
  /** 受注側の常時使用する従業員の数 */
  contractorEmployees: number;
  contractorType: ContractorType;
  kind: DealKind;
}

export type ApplicabilityVerdict = 'both' | 'toriteki' | 'freelance' | 'none';

export interface Applicability {
  verdict: ApplicabilityVerdict;
  /** 取適法の対象になる根拠（第2条第8項の号）。対象外なら null */
  toritekiClause: number | null;
  /** フリーランス法の60日がかかるか */
  freelance: boolean;
  /** 取適法の遅延利息（第6条）がかかるか */
  lateInterestApplies: boolean;
}

/** 製造委託等（資本金 3億円／1千万円、従業員 300人）の区分か */
function isGroupA(kind: DealKind): boolean {
  return kind !== 'other';
}

/** 取適法 第2条第8項の何号に当たるか（資本金基準を先に見る）。当たらなければ null */
export function toritekiClause(input: ApplicabilityInput): number | null {
  const { ordererCapital, ordererEmployees, contractorCapital, contractorEmployees, contractorType, kind } = input;
  const individual = contractorType === 'individual';
  const smallCap = (limit: number) => individual || contractorCapital <= limit;
  if (isGroupA(kind)) {
    if (ordererCapital > CAPITAL_300M && smallCap(CAPITAL_300M)) return 1;
    if (ordererCapital > CAPITAL_10M && ordererCapital <= CAPITAL_300M && smallCap(CAPITAL_10M)) return 2;
  } else {
    if (ordererCapital > CAPITAL_50M && smallCap(CAPITAL_50M)) return 3;
    if (ordererCapital > CAPITAL_10M && ordererCapital <= CAPITAL_50M && smallCap(CAPITAL_10M)) return 4;
  }
  // 従業員基準（改正で追加）
  const limit = isGroupA(kind) ? EMPLOYEES_A : EMPLOYEES_B;
  if (ordererEmployees > limit && contractorEmployees <= limit) return isGroupA(kind) ? 5 : 6;
  return null;
}

/**
 * フリーランス法の「特定受託事業者」と「特定業務委託事業者」の組か。
 * 受注側：従業員を使用しない個人・一人法人。発注側：従業員を使用する事業者（ここでは従業員1人以上）
 */
export function freelanceApplies(input: ApplicabilityInput): boolean {
  const solo = input.contractorType !== 'corp' && input.contractorEmployees === 0;
  return solo && input.ordererEmployees >= 1;
}

export function applicability(input: ApplicabilityInput): Applicability {
  const clause = toritekiClause(input);
  const freelance = freelanceApplies(input);
  const verdict: ApplicabilityVerdict =
    clause !== null && freelance ? 'both' : clause !== null ? 'toriteki' : freelance ? 'freelance' : 'none';
  return { verdict, toritekiClause: clause, freelance, lateInterestApplies: clause !== null };
}

/** 判定の見出し */
export const VERDICT_LABELS: Record<ApplicabilityVerdict, string> = {
  both: '取適法とフリーランス法の両方',
  toriteki: '取適法の対象',
  freelance: '取適法は対象外／フリーランス法の60日がかかる',
  none: 'どちらも対象外',
};
