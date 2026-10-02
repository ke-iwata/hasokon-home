/**
 * 住所変更登記の期限チェッカーのロジック
 *
 * 仕様: docs/features/jusho-henko-toki-kigen.md
 *
 * 住所・氏名の変更登記の申請義務（不動産登記法76条の5。2026-04-01施行）の期限を、
 * 変わった日から出す。すべて純関数で、現在時刻に依存しない（「今日」は呼び出し側から渡す）。
 *
 * - 応当日の計算は相続登記の `addMonthsSameDay()` をそのまま使う（二重に持たない）
 * - 施行日より前の変更は一律に経過措置の 2028-03-31（法務省Q&A Q4・Q5）。
 *   施行前の最後の日 2026-03-31 ＋ 2年 ＝ 2028-03-31 なので「遅いほう」を取る必要が無い
 * - 期限が土日祝に当たる場合の扱いは画面で「法務局に確認」と注記するだけで、繰り下げない。
 *   祝日データ（日数計算の祝日表）は 2027年までなので**参照しない**（2028年以降で黙って平日扱いになるため）
 */

import { addMonthsSameDay, daysLeft, parseDate } from './sozoku-toki-kigen';

export { addMonthsSameDay, daysLeft, daysLeftLabel, formatDate, formatJaWithWeekday, parseDate } from './sozoku-toki-kigen';

// ---------------------------------------------------------------- 【データ更新箇所】
// 相続登記の同名定数（GIMUKA_START など）と紛れないよう JUSHO_ を前置する

/** 不動産登記法76条の5の施行日（令和3年法律第24号） */
export const JUSHO_GIMUKA_START = '2026-04-01';
/** 施行前の変更の経過措置の期限（法務省「住所等変更登記の義務化に関するQ&A」Q4・Q5） */
export const JUSHO_KEIKA_SOCHI_DEADLINE = '2028-03-31';
/** 変更日から2年（76条の5） */
export const JUSHO_TOKI_MONTHS = 24;
/** 過料の上限（164条2項） */
export const JUSHO_KARYO_MAX_YEN = 50_000;
/** 登録免許税（登録免許税法 別表第一 1号(14)。不動産1個につき） */
export const TOROKU_MENKYO_PER_PROPERTY = 1_000;
/** 検索用情報の申出の開始日（この日以後の所有権の登記で同時に申し出る） */
export const SEARCH_INFO_FROM = '2025-04-21';
/** 条文・法務省の案内を最後に確かめた日 */
export const JUSHO_DATA_CHECKED_AT = '2026-10-02';

// ---------------------------------------------------------------- 期限

export type JushoBasis = 'principle' | 'transitional';

export interface JushoDeadline {
  deadline: string;
  /** 'principle' は変更日から2年、'transitional' は施行日前の変更の経過措置 */
  basis: JushoBasis;
}

/** 'YYYY-MM-DD' の文字列比較（形式が揃っていれば辞書順＝日付順） */
function before(a: string, b: string): boolean {
  return a < b;
}

/** 住所・氏名が変わった日から、変更登記の期限を出す */
export function tokiDeadline(changedOn: string): JushoDeadline {
  if (!parseDate(changedOn)) throw new Error(`不正な日付: ${changedOn}`);
  if (before(changedOn, JUSHO_GIMUKA_START)) {
    return { deadline: JUSHO_KEIKA_SOCHI_DEADLINE, basis: 'transitional' };
  }
  return { deadline: addMonthsSameDay(changedOn, JUSHO_TOKI_MONTHS), basis: 'principle' };
}

/** 未登記の変更が複数あるとき、いちばん早く来る期限（of はその期限を決めた変更日） */
export function earliestDeadline(changes: string[]): JushoDeadline & { of: string } {
  if (changes.length === 0) throw new Error('変更日がありません');
  let best: (JushoDeadline & { of: string }) | null = null;
  for (const c of changes) {
    const d = tokiDeadline(c);
    if (!best || before(d.deadline, best.deadline) || (d.deadline === best.deadline && before(c, best.of))) {
      best = { ...d, of: c };
    }
  }
  return best!;
}

/** 期限を過ぎているか */
export function isOverdue(deadline: string, today: string): boolean {
  return daysLeft(deadline, today) < 0;
}

// ---------------------------------------------------------------- 登録免許税

/** 登録免許税の合計（負数・小数・NaN は切り捨てて0以上の整数個として数える） */
export function torokuMenkyo(count: number): number {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return n * TOROKU_MENKYO_PER_PROPERTY;
}

// ---------------------------------------------------------------- 入力の検査

export type InputError = 'future' | 'order';

/** 入力の矛盾。問題が無ければ null（同じ日の改姓と転居は許す） */
export function validateInput(changedOn: string, earlierChangedOn: string | undefined, today: string): InputError | null {
  if (before(today, changedOn)) return 'future';
  if (earlierChangedOn && before(changedOn, earlierChangedOn)) return 'order';
  return null;
}

export const INPUT_ERROR_MESSAGES: Record<InputError, string> = {
  future: '変わった日は今日以前の日付を入れてください。',
  order: '前の変更日は今回より前の日付を入れてください。',
};

// ---------------------------------------------------------------- 画面の文言

/** 期限を過ぎているときに画面へそのまま出す文言（相続登記と同じ。過料の有無は書かない） */
export { OVERDUE_MESSAGE } from './sozoku-toki-kigen';

/**
 * 検索用情報の申出（または会社法人等番号の登記）が「済んでいる」人への注記。
 * 期限は消さない。申出の効果（義務を果たしたことになるか）は言い切らない（#316 レビュー必須 1）
 */
export const SEARCH_INFO_DONE_NOTE =
  '法務局が職権で変更登記をする対象です。職権登記は法務局から本人への確認を経て行われ、応答が無ければ登記されません。法務局からの通知に応答してください。期限までに職権登記がされない場合に備えて、期限は上のとおり把握しておいてください。';

/** 申出をしたか「分からない」人への注記 */
export const SEARCH_INFO_UNKNOWN_NOTE =
  '2025年4月21日より前に取得した不動産は、申出をしていない可能性が高いです。登記識別情報通知や法務局の案内で確認してください。';

/** 未登記の変更が複数ある人への注記 */
export const MULTIPLE_CHANGES_NOTE =
  '期限はいちばん早いものが先に来ます。住所が何度か変わっている場合の申請のしかた（現在の住所へまとめて直せるか、添付する住民票・戸籍の附票）は、法務局に確認してください。';
