/**
 * マイナンバーカード・電子証明書の有効期限チェッカーのロジック
 *
 * 仕様: docs/features/mynumber-card-yuko-kigen.md
 *
 * 生年月日とカード表面の「◯年◯月◯日まで有効」から、カード本体と電子証明書の期限・
 * 更新できる日・通知書の目安・マイナ保険証の猶予の終わりを日付で出す。
 * すべて純関数で、現在時刻に依存しない（「今日」は呼び出し側から渡す）。
 *
 * - **満年齢は `nenrei.ts` の `ageAt()` を使う**（誕生日の当日から新しい年齢。
 *   2月29日生まれは平年3月1日に加齢）。作り直さない
 * - **交付時の区分は聞かない。** 券面の期限の日の年齢（`ageAt(birth, cardExpiry)`）で
 *   一意に決まる（`classifyByExpiry()`。仕様書の表の5行）
 * - 2月29日生まれの扱いは施行令の原文で確定していないので、`ageAt()` の流儀（平年は3月1日）を既定にし、
 *   画面で「2月28日または3月1日。券面の印字を優先」と注記する（仕様書「法的根拠」）
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
import { ageAt, nextBirthday } from './nenrei';
import { holidayName, inHolidayRange, isBusinessDay } from './nissu-keisan';

export { formatDate, parseDate, type DateParts } from './date-parts';

// ---------------------------------------------------------------- 【データ更新箇所】

/** 成年年齢の引き下げ（2022-04-01）の前日。この日までの申請の20歳未満は旧ルール（5回目の誕生日） */
export const LEGACY_MINOR_LAST_DAY = '2022-03-31';
/**
 * 券面から旧ルールのカードとみなす「期限−5年」の上限。
 * 旧ルールは**申請日**で決まるが券面からは分からないので、申請から交付までの遅れ（半年）を見込む。
 * 期限の日に23〜24歳になる正しいカードは旧ルールの20歳未満しか無いので、ゆるめても
 * ほかの区分と取り違える組み合わせは生まれない（#333 レビュー推奨1）
 */
export const LEGACY_MINOR_ISSUE_ALLOWANCE_LAST_DAY = '2022-09-30';
/** カード本体（交付時18歳以上）の有効期間：交付から10回目の誕生日 */
export const CARD_BIRTHDAYS_ADULT = 10;
/** カード本体（交付時18歳未満）と電子証明書の有効期間：交付から5回目の誕生日 */
export const CARD_BIRTHDAYS_MINOR = 5;
export const CERT_BIRTHDAYS = 5;
/** 交付時に18歳以上なら10回目 */
export const ADULT_AGE = 18;
/** 更新できるのは期限の3か月前から（J-LIS・厚労省） */
export const RENEW_MONTHS_BEFORE = 3;
/**
 * マイナ保険証の猶予：電子証明書の「有効期限満了日が属する月の末日から3カ月間」
 * （厚労省「マイナ保険証利用時には電子証明書の有効期限をご確認ください」令和8年8月時点）
 */
export const HOKEN_GRACE_MONTHS = 3;
/** 一次情報を最後に確かめた日 */
export const DATA_CHECKED_AT = '2026-10-03';

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
 * その年の誕生日（年齢が増える日）。2月29日生まれの平年は3月1日（`ageAt()` の流儀）。
 */
export function birthdayInYear(birth: DateParts, year: number): DateParts {
  if (isLeapDayBirth(birth) && !isLeapYear(year)) return { year, month: 3, day: 1 };
  return { year, month: birth.month, day: birth.day };
}

/**
 * from より後に来る誕生日のうち n 回目（n ≥ 1）。
 *
 * **from が誕生日の当日なら、その日は数えない**（「発行から」を初日不算入で読む。
 * J-LIS の表記例での確認は仕様書の課題として残っている）。`nextBirthday()` を n 回たどる。
 */
export function nthBirthday(birth: DateParts, from: DateParts, n: number): DateParts {
  let cursor = from;
  let date = from;
  for (let i = 0; i < n; i++) {
    date = nextBirthday(birth, addDays(cursor, 1)).date;
    cursor = date;
  }
  return date;
}

/** 2月29日生まれが平年の2月28日を券面の期限として入れたときは、`ageAt()` の流儀の3月1日に読み替える */
function normalizeExpiry(birth: DateParts, expiry: DateParts): DateParts {
  if (isLeapDayBirth(birth) && !isLeapYear(expiry.year) && expiry.month === 2 && expiry.day === 28) {
    return { year: expiry.year, month: 3, day: 1 };
  }
  return expiry;
}

// ---------------------------------------------------------------- 券面の期限から

/**
 * 交付時の区分（券面の期限の日の年齢で決まる）。
 *
 * | 期限の日の年齢 | 区分 |
 * |---|---|
 * | 〜19 | 'under15'（15歳未満で交付・5回目。署名用電子証明書は原則なし） |
 * | 20〜22 | 'minor'（15〜17歳で交付・5回目） |
 * | 23〜24 | 'legacyMinor'（2022-03-31以前に申請の18〜19歳・旧ルール5回目）。期限−5年が交付の遅れを見込んだ日より後なら 'invalid' |
 * | 25〜27 | 'invalid'（券面か生年月日の入れ間違い） |
 * | 28〜 | 'adult'（18歳以上で交付・10回目） |
 */
export type CardClass = 'under15' | 'minor' | 'legacyMinor' | 'adult' | 'invalid';

export function classifyByExpiry(birthYmd: string, cardExpiryYmd: string): CardClass {
  const birth = mustParse(birthYmd);
  const expiry = normalizeExpiry(birth, mustParse(cardExpiryYmd));
  const age = ageAt(birth, expiry);
  if (age < 0) return 'invalid';
  if (age <= 19) return 'under15';
  if (age <= 22) return 'minor';
  if (age <= 24) {
    const fiveYearsBefore = birthdayInYear(birth, expiry.year - CARD_BIRTHDAYS_MINOR);
    return compareDate(fiveYearsBefore, mustParse(LEGACY_MINOR_ISSUE_ALLOWANCE_LAST_DAY)) <= 0 ? 'legacyMinor' : 'invalid';
  }
  if (age <= 27) return 'invalid';
  return 'adult';
}

/**
 * 券面の期限から電子証明書の期限を出す（主の入り口）。
 * 18歳以上で交付なら**カードの5年前の同じ誕生日**、それ以外はカードと同じ日。
 * 区分が 'invalid' のときは null。
 */
export function certExpiryFromCard(birthYmd: string, cardExpiryYmd: string): string | null {
  const cls = classifyByExpiry(birthYmd, cardExpiryYmd);
  if (cls === 'invalid') return null;
  if (cls !== 'adult') return cardExpiryYmd;
  const birth = mustParse(birthYmd);
  const expiry = normalizeExpiry(birth, mustParse(cardExpiryYmd));
  return formatDate(birthdayInYear(birth, expiry.year - (CARD_BIRTHDAYS_ADULT - CERT_BIRTHDAYS)));
}

/** 署名用電子証明書が付いているか（15歳未満で交付されたカードは原則なし） */
export function signatureCertIssued(birthYmd: string, cardExpiryYmd: string): boolean {
  return classifyByExpiry(birthYmd, cardExpiryYmd) !== 'under15';
}

/**
 * 券面の期限が誕生日の日付になっているか（なっていなければ入れ間違いの可能性を注記する）。
 * 2月29日生まれは2月28日・3月1日のどちらでも誕生日とみなす。
 */
export function isBirthdayDate(birthYmd: string, cardExpiryYmd: string): boolean {
  const birth = mustParse(birthYmd);
  const expiry = normalizeExpiry(birth, mustParse(cardExpiryYmd));
  return compareDate(expiry, birthdayInYear(birth, expiry.year)) === 0;
}

// ---------------------------------------------------------------- 交付日から（分かる人向け）

/** 交付日が2022-03-31以前で、交付時に18〜19歳だったか（旧ルールで5回目） */
export function isLegacyMinorIssue(birthYmd: string, issuedYmd: string): boolean {
  const age = ageAt(mustParse(birthYmd), mustParse(issuedYmd));
  return age >= ADULT_AGE && age <= 19 && issuedYmd <= LEGACY_MINOR_LAST_DAY;
}

/** 交付日からカード本体の期限（18歳以上で交付なら10回目、それ以外は5回目の誕生日） */
export function cardExpiryFromIssue(birthYmd: string, issuedYmd: string, legacyMinor: boolean): string {
  const birth = mustParse(birthYmd);
  const issued = mustParse(issuedYmd);
  const n = ageAt(birth, issued) >= ADULT_AGE && !legacyMinor ? CARD_BIRTHDAYS_ADULT : CARD_BIRTHDAYS_MINOR;
  return formatDate(nthBirthday(birth, issued, n));
}

/** 交付日（または電子証明書を更新した日）から電子証明書の期限（年齢にかかわらず5回目の誕生日） */
export function certExpiryFromIssue(birthYmd: string, issuedYmd: string): string {
  return formatDate(nthBirthday(mustParse(birthYmd), mustParse(issuedYmd), CERT_BIRTHDAYS));
}

/** 2つの期限の日付が同じか。2月29日生まれの2月28日／3月1日の違いは同じとみなす */
export function sameExpiry(birthYmd: string, a: string, b: string): boolean {
  const birth = mustParse(birthYmd);
  return compareDate(normalizeExpiry(birth, mustParse(a)), normalizeExpiry(birth, mustParse(b))) === 0;
}

// ---------------------------------------------------------------- 更新・通知書・猶予

/** 更新できる最初の日（期限の3か月前の応当日。応当日が無い月は末日） */
export function renewFrom(expiryYmd: string): string {
  return formatDate(addMonths(mustParse(expiryYmd), -RENEW_MONTHS_BEFORE));
}

/** 有効期限通知書が届く目安（期限の2〜3か月前の月）。'2026年8〜9月' / '2026年12月〜2027年1月' */
export function noticeWindow(expiryYmd: string): string {
  const e = mustParse(expiryYmd);
  const from = addMonths({ ...e, day: 1 }, -3);
  const to = addMonths({ ...e, day: 1 }, -2);
  if (from.year === to.year) return `${from.year}年${from.month}〜${to.month}月`;
  return `${from.year}年${from.month}月〜${to.year}年${to.month}月`;
}

/**
 * マイナ保険証として使える最後の日（電子証明書の期限切れ後）。
 * 「有効期限満了日が属する月の末日から3カ月間」＝満了月の3か月後の月の末日。
 * 例：2026-11-14 満了 → 2027-02-28
 */
export function hokenGraceEnd(certExpiryYmd: string): string {
  const e = mustParse(certExpiryYmd);
  const m = addMonths({ year: e.year, month: e.month, day: 1 }, HOKEN_GRACE_MONTHS);
  return formatDate({ year: m.year, month: m.month, day: daysInMonth(m.year, m.month) });
}

/** deadline までの残り日数（今日が期限なら0、過ぎていれば負） */
export function daysLeft(deadline: string, today: string): number {
  return daysBetween(mustParse(today), mustParse(deadline));
}

/** いまの状態：期限前（まだ更新できない）／更新できる期間／期限切れ */
export type ExpiryStatus = 'ok' | 'renewable' | 'expired';

export function expiryStatus(expiryYmd: string, today: string): ExpiryStatus {
  if (daysLeft(expiryYmd, today) < 0) return 'expired';
  if (today >= renewFrom(expiryYmd)) return 'renewable';
  return 'ok';
}

/**
 * 期限日が窓口の閉まっている日（土日祝）なら、その理由（'土曜' '文化の日' など）。
 * 祝日データ（2024〜2027年）の範囲外は土日だけ見る。期限は繰り下げない（注記に使うだけ）
 */
export function closedDayReason(expiryYmd: string): string | null {
  const p = mustParse(expiryYmd);
  if (inHolidayRange(p) && isBusinessDay(p)) return null;
  const h = holidayName(p);
  if (h) return h;
  const w = weekdayLabel(p);
  if (w === '土') return '土曜';
  if (w === '日') return '日曜';
  return null;
}

// ---------------------------------------------------------------- まとめ

export interface ExpiryItem {
  /** 期限日 'YYYY-MM-DD' */
  expiry: string;
  renewFrom: string;
  notice: string;
  /** 期限日が土日祝ならその理由 */
  closedBecause: string | null;
}

export interface MynumberResult {
  cls: Exclude<CardClass, 'invalid'>;
  card: ExpiryItem;
  cert: ExpiryItem & {
    /** 電子証明書を途中で更新した日から出し直したか */
    fromRenewal: boolean;
    /** 更新した日から数えた期限がカード本体の期限より後で、カード本体の期限に詰めたか */
    cappedByCard: boolean;
    /** マイナ保険証として使える最後の日 */
    hokenGraceEnd: string;
  };
  signatureCert: boolean;
  /** 2月29日生まれ（期限が2月28日か3月1日かは券面の印字を優先する注記を出す） */
  leapDayBirth: boolean;
  /** 券面の期限が誕生日の日付になっていない（入れ間違いの可能性） */
  notBirthday: boolean;
  /** 交付日を入れて、そこから出したカードの期限が券面と食い違った（券面を優先する） */
  issueMismatch: boolean;
}

function item(expiry: string): ExpiryItem {
  return { expiry, renewFrom: renewFrom(expiry), notice: noticeWindow(expiry), closedBecause: closedDayReason(expiry) };
}

export interface MynumberInput {
  birth: string;
  /** カード表面の「◯年◯月◯日まで有効」 */
  cardExpiry: string;
  /** 交付日（任意） */
  issued?: string;
  /** 電子証明書を途中で更新した日（任意） */
  certRenewed?: string;
}

/** 入力の矛盾。問題が無ければ null */
export type InputError =
  | 'birth-future'
  | 'expiry-before-birth'
  | 'invalid-band'
  | 'renewed-before-birth'
  | 'renewed-future'
  | 'renewed-after-card';

export function validateInput(input: MynumberInput, today: string): InputError | null {
  if (input.birth > today) return 'birth-future';
  if (input.cardExpiry <= input.birth) return 'expiry-before-birth';
  if (classifyByExpiry(input.birth, input.cardExpiry) === 'invalid') return 'invalid-band';
  if (input.certRenewed && input.certRenewed < input.birth) return 'renewed-before-birth';
  if (input.certRenewed && input.certRenewed > today) return 'renewed-future';
  if (input.certRenewed && input.certRenewed > input.cardExpiry) return 'renewed-after-card';
  return null;
}

export const INPUT_ERROR_MESSAGES: Record<InputError, string> = {
  'birth-future': '生年月日が今日より後になっています。',
  'expiry-before-birth': 'カードの有効期限が生年月日より前になっています。',
  'invalid-band': 'カード表面の有効期限と生年月日を確かめてください（この組み合わせになるカードはありません）。',
  'renewed-before-birth': '電子証明書を更新した日が生年月日より前になっています。',
  'renewed-future': '電子証明書を更新した日が今日より後になっています。',
  'renewed-after-card': '電子証明書を更新した日がカードの有効期限より後になっています。',
};

/** 期限の計算のひとまとめ。入力が矛盾していれば null（`validateInput()` で理由を出す） */
export function calcMynumber(input: MynumberInput): MynumberResult | null {
  const cls = classifyByExpiry(input.birth, input.cardExpiry);
  if (cls === 'invalid' || input.cardExpiry <= input.birth) return null;
  const certFromCard = certExpiryFromCard(input.birth, input.cardExpiry) as string;
  // 電子証明書はカードに入っているので、カード本体の期限を超えない（#333 レビュー必須2）
  const renewedExpiry = input.certRenewed ? certExpiryFromIssue(input.birth, input.certRenewed) : null;
  const cappedByCard = renewedExpiry !== null && renewedExpiry > input.cardExpiry;
  const certExpiry = renewedExpiry === null ? certFromCard : cappedByCard ? input.cardExpiry : renewedExpiry;
  const birth = mustParse(input.birth);
  const issueMismatch = input.issued
    ? !sameExpiry(
        input.birth,
        cardExpiryFromIssue(input.birth, input.issued, isLegacyMinorIssue(input.birth, input.issued)),
        input.cardExpiry
      )
    : false;
  return {
    cls,
    card: item(input.cardExpiry),
    cert: {
      ...item(certExpiry),
      fromRenewal: Boolean(input.certRenewed),
      cappedByCard,
      hokenGraceEnd: hokenGraceEnd(certExpiry),
    },
    signatureCert: cls !== 'under15',
    leapDayBirth: isLeapDayBirth(birth),
    notBirthday: !isBirthdayDate(input.birth, input.cardExpiry),
    issueMismatch,
  };
}

/**
 * 券面から数えた電子証明書の期限が過ぎているが、カード本体はまだ有効で、更新した日が入っていない。
 *
 * 18歳以上で交付された人の多くは、券面から数えた最初の期限の時点で電子証明書を一度更新しているので、
 * この場合は「期限切れ」と断定せず、更新した日を入れるよう促す（#333 レビュー必須1）
 */
export function certMaybeRenewed(r: MynumberResult, today: string): boolean {
  return !r.cert.fromRenewal && daysLeft(r.cert.expiry, today) < 0 && daysLeft(r.card.expiry, today) >= 0;
}

// ---------------------------------------------------------------- 表示

/** 残り日数の表示（'あと42日' / '今日が期限' / '12日過ぎています'） */
export function daysLeftLabel(n: number): string {
  if (n > 0) return `あと${n.toLocaleString('ja-JP')}日`;
  if (n === 0) return '今日が期限';
  return `${(-n).toLocaleString('ja-JP')}日過ぎています`;
}

/** '2026-11-14' → '2026年11月14日（土）' */
export function formatJaWithWeekday(ymd: string): string {
  const p = mustParse(ymd);
  return `${p.year}年${p.month}月${p.day}日（${weekdayLabel(p)}）`;
}

/** 区分ごとの「根拠」の行（カード本体） */
export const CARD_BASIS: Record<MynumberResult['cls'], string> = {
  adult: '券面の印字（交付時18歳以上なので10回目の誕生日）',
  legacyMinor: '券面の印字（2022年3月31日以前に申請した20歳未満なので5回目の誕生日）',
  minor: '券面の印字（交付時18歳未満なので5回目の誕生日）',
  under15: '券面の印字（交付時18歳未満なので5回目の誕生日）',
};
