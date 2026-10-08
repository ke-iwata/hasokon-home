/**
 * 出席停止期間 計算機のロジック
 *
 * 仕様: docs/features/shusseki-teishi-keisan.md
 *
 * 学校保健安全法施行規則 19 条 2 号の「発症した後五日を経過し、かつ、解熱した後二日
 * （幼児にあつては、三日）を経過するまで」を日付に直し、登校・登園できる最も早い日を出す。
 * すべて純関数で、現在時刻に依存しない（「今日」は呼び出し側から渡す）。
 *
 * - **「N 日を経過するまで」は起点を 0 日目として N 日目が終わるまで**（初日不算入）。
 *   出席できる最も早い日は起点 + N + 1 日（`firstDayAfter()`）
 * - **2 つの条件は「かつ」なので遅いほう**。どちらで決まったかも返す（`decidedBy`）
 * - **土日祝のずらしは小学生以上（`group === 'school'`）だけ。** 保育所は土曜も開いていることが
 *   多く、月曜にずらすと余計に休ませる誤案内になる（#346 レビュー必須1）。大人はずらさない
 * - **大人（職場）は法令の基準が無い。** 小学生以上と同じ日数を「目安」として返すだけ
 * - 土日祝の判定は `nissu-keisan.ts` から import する（作り直さない）
 */

import { addDays, compareDate, dayOfWeek, daysBetween, weekdayLabel, type DateParts } from './date-parts';
import { HOLIDAY_LAST_YEAR, inHolidayRange, isBusinessDay, nonBusinessReason } from './nissu-keisan';

export { formatDate, parseDate, type DateParts } from './date-parts';

// ---------------------------------------------------------------- 【データ更新箇所】

/** 病気。'other' は日付にできない病気（説明だけ出す） */
export type Disease = 'influenza' | 'covid19' | 'measles' | 'mumps' | 'pcf' | 'other';
/** 通っているところ。'school' = 小学校〜大学、'preschool' = 保育所・幼稚園・認定こども園（幼児）、'adult' = 職場 */
export type Group = 'school' | 'preschool' | 'adult';

export interface Rule {
  /** 画面の選択肢の名前 */
  name: string;
  /** 条文の号（「19条2号イ」など） */
  article: string;
  /** 条文の原文 */
  text: string;
  /** 起点 A（発症・腫脹）から「◯日を経過」。無ければ null */
  afterOnsetDays: number | null;
  /**
   * 起点 B（解熱・軽快・消退）から「◯日を経過」。幼児で変わる病気はここで分岐。
   * 'adult' は法令の基準が無いので、'school'（小学生以上）と同じ日数を目安として返す
   */
  afterRecoveryDays: ((g: Group) => number) | null;
  /** 起点 A の入力欄のラベル */
  onsetLabel: string;
  /** 起点 B の入力欄のラベル */
  recoveryLabel: string;
  /** 「まだ◯」の選択肢の文面（起点 B が無い病気では使わない） */
  notYetLabel: string;
  /** 日付にできない条件（「全身状態が良好になるまで」など）。あれば画面に併記 */
  extraCondition?: string;
}

/**
 * 学校保健安全法施行規則 19 条 2 号（令和 5 年文部科学省令第 22 号による改正後。2023-05-08 施行）。
 * e-Gov 法令 API（333M50000080018）で 2026-10-08 に原文を確かめた
 */
export const RULES: Record<Exclude<Disease, 'other'>, Rule> = {
  influenza: {
    name: 'インフルエンザ',
    article: '19条2号イ',
    text: '発症した後五日を経過し、かつ、解熱した後二日（幼児にあつては、三日）を経過するまで',
    afterOnsetDays: 5,
    afterRecoveryDays: (g) => (g === 'preschool' ? 3 : 2),
    onsetLabel: '発症した日（熱などの症状が出た日）',
    recoveryLabel: '解熱した日',
    notYetLabel: 'まだ熱がある',
  },
  covid19: {
    name: '新型コロナ',
    article: '19条2号チ',
    text: '発症した後五日を経過し、かつ、症状が軽快した後一日を経過するまで',
    afterOnsetDays: 5,
    afterRecoveryDays: () => 1,
    onsetLabel: '発症した日（熱などの症状が出た日）',
    recoveryLabel: '症状が軽快した日',
    notYetLabel: 'まだ症状が軽快していない',
  },
  measles: {
    name: '麻しん（はしか）',
    article: '19条2号ハ',
    text: '解熱した後三日を経過するまで',
    afterOnsetDays: null,
    afterRecoveryDays: () => 3,
    onsetLabel: '発症した日',
    recoveryLabel: '解熱した日',
    notYetLabel: 'まだ熱がある',
  },
  mumps: {
    name: 'おたふくかぜ（流行性耳下腺炎）',
    article: '19条2号ニ',
    text: '耳下腺、顎下腺又は舌下腺の腫脹が発現した後五日を経過し、かつ、全身状態が良好になるまで',
    afterOnsetDays: 5,
    afterRecoveryDays: null,
    onsetLabel: '腫れが出た日（耳の下・あごの下が腫れた日）',
    recoveryLabel: '',
    notYetLabel: '',
    extraCondition: '「全身状態が良好になるまで」は日付にできません。この日より後でも、元気になっていなければ出席停止が続きます',
  },
  pcf: {
    name: 'プール熱（咽頭結膜熱）',
    article: '19条2号ト',
    text: '主要症状が消退した後二日を経過するまで',
    afterOnsetDays: null,
    afterRecoveryDays: () => 2,
    onsetLabel: '発症した日',
    recoveryLabel: '主な症状（熱・のどの痛み・目の充血）が消えた日',
    notYetLabel: 'まだ症状がある',
  },
};

/** 日付にできない第二種の感染症（「その他」を選んだときの説明） */
export const OTHER_RULES = [
  { name: '百日咳', article: '19条2号ロ', text: '特有の咳が消失するまで又は五日間の適正な抗菌性物質製剤による治療が終了するまで' },
  { name: '風しん', article: '19条2号ホ', text: '発しんが消失するまで' },
  { name: '水痘（水ぼうそう）', article: '19条2号ヘ', text: 'すべての発しんが痂皮化するまで' },
] as const;

/** 一次情報（施行規則の原文）を最後に確かめた日 */
export const DATA_CHECKED_AT = '2026-10-08';

// ---------------------------------------------------------------- 計算

/** 「N 日を経過するまで」→ 出席できる最も早い日 ＝ 起点 + N + 1 日（初日不算入。起点が 0 日目） */
export function firstDayAfter(start: DateParts, days: number): DateParts {
  return addDays(start, days + 1);
}

export type InputError =
  | 'onset-missing'
  | 'recovery-missing'
  | 'onset-in-future'
  | 'recovery-before-onset'
  | 'recovery-in-future';

export const INPUT_ERROR_MESSAGES: Record<InputError, string> = {
  'onset-missing': '発症した日を入れてください。',
  'recovery-missing': '日付を入れるか、「まだ」を選んでください。',
  'onset-in-future': '発症した日が今日より後になっています。',
  'recovery-before-onset': '解熱（軽快）した日が発症した日より前になっています。',
  'recovery-in-future': '解熱（軽快）した日が今日より後になっています。まだのときは「まだ」を選んでください。',
};

export interface ReturnInput {
  disease: Exclude<Disease, 'other'>;
  group: Group;
  /** 発症日（腫脹が出た日）。起点 A を使わない病気（麻しん・プール熱）では省略できる */
  onset: DateParts | null;
  /** 解熱日（軽快・消退した日）。null は「まだ」 */
  recovery: DateParts | null;
  /** 今日。「まだ」のときの仮の解熱日と、未来日の入力検証に使う */
  today: DateParts;
}

export interface ReturnResult {
  /** 登校・登園できる最も早い日（条文どおり。土日祝でもずらさない） */
  earliest: DateParts;
  /** どちらの条件で決まったか */
  decidedBy: 'onset' | 'recovery' | 'both';
  /** 発症側の条件で出席できる最も早い日（条件が無ければ null） */
  byOnset: DateParts | null;
  /** 解熱側の条件で出席できる最も早い日（条件が無ければ null） */
  byRecovery: DateParts | null;
  /** 計算に使った解熱日（「まだ」なら今日） */
  recovery: DateParts | null;
  /** 「まだ」を選んで今日を仮の解熱日にしたか */
  assumedRecoveryToday: boolean;
  /** 発症側・解熱側の日数（画面の説明用） */
  onsetDays: number | null;
  recoveryDays: number | null;
  /**
   * 小学生以上で、最も早い日が土日祝のときの「実際に登校する日」。それ以外は null。
   * 祝日データの範囲外なら土日だけで判定する（`holidayUnknown`）
   */
  actualSchoolDay: DateParts | null;
  /** 最も早い日が土日祝の理由（'土曜' 'スポーツの日' など）。平日なら null */
  closedBecause: string | null;
  /** 祝日データの範囲外の日付が絡むか（「祝日は未確認」と注記する） */
  holidayUnknown: boolean;
}

/** 入力の検証。問題が無ければ null */
export function validateInput(input: ReturnInput): InputError | null {
  const rule = RULES[input.disease];
  const { onset, recovery, today } = input;
  if (rule.afterOnsetDays !== null && !onset) return 'onset-missing';
  if (onset && compareDate(onset, today) > 0) return 'onset-in-future';
  if (rule.afterRecoveryDays !== null && recovery) {
    if (onset && compareDate(recovery, onset) < 0) return 'recovery-before-onset';
    if (compareDate(recovery, today) > 0) return 'recovery-in-future';
  }
  return null;
}

/** 土日祝でない次の日（その日を含む）。祝日データの範囲外は土日だけで判定 */
function nextSchoolDay(from: DateParts): DateParts {
  let d = from;
  while (inHolidayRange(d) ? !isBusinessDay(d) : dayOfWeek(d) === 0 || dayOfWeek(d) === 6) d = addDays(d, 1);
  return d;
}

/** 2 条件の遅いほう。入力に誤りがあれば throw せず InputError を返す */
export function earliestReturn(input: ReturnInput): ReturnResult | InputError {
  const error = validateInput(input);
  if (error) return error;
  const rule = RULES[input.disease];
  const assumedRecoveryToday = rule.afterRecoveryDays !== null && input.recovery === null;
  const recovery = rule.afterRecoveryDays === null ? null : (input.recovery ?? input.today);

  const onsetDays = rule.afterOnsetDays;
  const recoveryDays = rule.afterRecoveryDays ? rule.afterRecoveryDays(input.group) : null;
  const byOnset = onsetDays !== null && input.onset ? firstDayAfter(input.onset, onsetDays) : null;
  const byRecovery = recoveryDays !== null && recovery ? firstDayAfter(recovery, recoveryDays) : null;

  let earliest: DateParts;
  let decidedBy: ReturnResult['decidedBy'];
  if (byOnset && byRecovery) {
    const c = compareDate(byOnset, byRecovery);
    earliest = c >= 0 ? byOnset : byRecovery;
    decidedBy = c === 0 ? 'both' : c > 0 ? 'onset' : 'recovery';
  } else if (byOnset) {
    earliest = byOnset;
    decidedBy = 'onset';
  } else {
    earliest = byRecovery!;
    decidedBy = 'recovery';
  }

  const holidayUnknown = !inHolidayRange(earliest);
  const closedBecause = holidayUnknown
    ? dayOfWeek(earliest) === 6
      ? '土曜'
      : dayOfWeek(earliest) === 0
        ? '日曜'
        : null
    : nonBusinessReason(earliest);
  const shifted = input.group === 'school' && closedBecause ? nextSchoolDay(earliest) : null;

  return {
    earliest,
    decidedBy,
    byOnset,
    byRecovery,
    recovery,
    assumedRecoveryToday,
    onsetDays,
    recoveryDays,
    actualSchoolDay: shifted,
    closedBecause,
    holidayUnknown: holidayUnknown || (shifted !== null && !inHolidayRange(shifted)),
  };
}

// ---------------------------------------------------------------- 表示用

/** 区分ごとの動詞（「登校」「登園」「出勤」） */
export const VERB: Record<Group, string> = { school: '登校', preschool: '登園', adult: '出勤' };

/** DateParts → '10月13日（火）'。年が今日と違うときだけ年を付ける */
export function formatMd(parts: DateParts, today?: DateParts): string {
  const year = today && today.year !== parts.year ? `${parts.year}年` : '';
  return `${year}${parts.month}月${parts.day}日（${weekdayLabel(parts)}）`;
}

/** 結果の 1 行目（太字にする部分）。「10月13日（火）から登校できます」 */
export function headline(r: ReturnResult, group: Group, today?: DateParts): string {
  const day = formatMd(r.earliest, today);
  if (group === 'adult') return `${day}から出勤の目安`;
  return `${day}から${VERB[group]}できます`;
}

/** どちらの条件で決まったかの 1 行 */
export function decidedByText(r: ReturnResult, disease: Exclude<Disease, 'other'>): string | null {
  if (!r.byOnset || !r.byRecovery) return null;
  const rec = disease === 'covid19' ? '軽快' : '解熱';
  const onsetPart = `発症日から数えた条件（発症の${r.onsetDays! + 1}日後）`;
  const recPart = `${rec}日から数えた条件（${rec}の${r.recoveryDays! + 1}日後）`;
  if (r.decidedBy === 'both') return `${onsetPart}と${recPart}が同じ日に満たされます。`;
  if (r.decidedBy === 'onset') return `${onsetPart}のほうが${recPart}より遅いので、こちらで決まりました。`;
  return `${recPart}のほうが${onsetPart}より遅いので、こちらで決まりました。`;
}

export interface CalendarCell {
  date: DateParts;
  /** 発症日を 0 日目とした日数（発症日より前・発症日を使わない病気は null） */
  onsetIndex: number | null;
  /** 解熱日を 0 日目とした日数（解熱日より前・解熱日を使わない病気は null） */
  recoveryIndex: number | null;
  /** 'stop' = 出席停止、'return' = 出席できる最も早い日、'actual' = 実際に登校する日、'after' = それ以降 */
  state: 'stop' | 'return' | 'actual' | 'after';
}

/**
 * 0 日目からのカレンダー（日曜始まりの 7 列。前後は null で埋める）。
 * 起点（発症日・解熱日の早いほう）から、登校できる日（ずらした日があればその日）までを並べる
 */
export function buildCalendar(r: ReturnResult, onset: DateParts | null): (CalendarCell | null)[][] {
  const starts = [onset, r.recovery].filter((d): d is DateParts => d !== null);
  const start = starts.reduce((a, b) => (compareDate(a, b) <= 0 ? a : b));
  const end = r.actualSchoolDay ?? r.earliest;
  const cells: (CalendarCell | null)[] = Array(dayOfWeek(start)).fill(null);
  for (let d = start; compareDate(d, end) <= 0; d = addDays(d, 1)) {
    const c = compareDate(d, r.earliest);
    const diff = (from: DateParts | null) => {
      if (!from) return null;
      const n = daysBetween(from, d);
      return n >= 0 ? n : null;
    };
    cells.push({
      date: d,
      onsetIndex: r.byOnset ? diff(onset) : null,
      recoveryIndex: r.byRecovery ? diff(r.recovery) : null,
      state:
        c < 0
          ? 'stop'
          : c === 0
            ? 'return'
            : r.actualSchoolDay && compareDate(d, r.actualSchoolDay) === 0
              ? 'actual'
              : 'after',
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 祝日データの最終年（画面の注記用） */
export { HOLIDAY_LAST_YEAR };
