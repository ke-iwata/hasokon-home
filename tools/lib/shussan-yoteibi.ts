/**
 * 出産予定日・妊娠週数 計算ロジック
 *
 * 仕様: docs/features/shussan-yoteibi-keisan.md
 *
 * 一次情報:
 * - 日本産科婦人科学会「産科婦人科用語集・用語解説集」の妊娠週数・分娩予定日の定義
 *   （最終月経開始日を0週0日とし、40週0日＝280日目が分娩予定日）
 * - 労働基準法65条（産前産後） https://laws.e-gov.go.jp/law/322AC0000000049
 * - 厚生労働省「働く女性の母性健康管理措置、母性保護規定について」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/seisaku05/index.html
 *
 * **産休の日程はここで計算しない。** `lib/shussan-teate.ts` の `calcLeaveSchedule()` を呼ぶ
 * （定数だけを共有すると「予定日を含めて42日」の数え方を各ページで書き直すことになり、
 * 1日ずれが起きる。実際に仕様書の初版で起きた）。
 *
 * **医療上の判断はしない。** 胎児の大きさ・症状の目安や「安定期」「妊婦健診の間隔」は
 * 扱わない（医学的な指導にあたる）。出すのは法令と用語の定義にあるものだけ。
 *
 * すべて純関数で、DOM・React・現在時刻に依存しない。
 * 日付は `lib/date-parts.ts` の DateParts（年月日の3つ組）で扱い、`Date` を直接いじらない
 * （ローカルタイムの `Date` で日付を組み立てるとタイムゾーンで1日ずれる）。
 */

import { addDays, daysBetween, formatDate, parseDate, type DateParts } from './date-parts';
import { calcLeaveSchedule, type LeaveSchedule } from './shussan-teate';

export type { DateParts } from './date-parts';
export type { LeaveSchedule } from './shussan-teate';

// ------------------------------------------------------------ 定義（公知）

/**
 * 最終月経開始日から分娩予定日までの日数。
 *
 * 最終月経開始日を妊娠0週0日とし、40週0日（= 7 × 40 = 280日目）が分娩予定日。
 * ネーゲレ概算法（月 −3 または +9、日 +7）と同じ日になる
 */
export const LMP_TO_DUE_DAYS = 280;

/** 排卵日（受精日）にあたる妊娠日数。排卵日 = 2週0日 */
export const OVULATION_DAY = 14;

/** 排卵日から分娩予定日までの日数（280 − 14） */
export const OVULATION_TO_DUE_DAYS = LMP_TO_DUE_DAYS - OVULATION_DAY;

/** 妊娠中期の開始（14週0日 = 98日目） */
export const MID_TRIMESTER_DAY = 14 * 7;

/** 妊娠後期の開始（28週0日 = 196日目） */
export const LATE_TRIMESTER_DAY = 28 * 7;

/** 正期産の開始（37週0日 = 259日目） */
export const TERM_START_DAY = 37 * 7;

/** 正期産の最終日（41週6日 = 293日目） */
export const TERM_END_DAY = 41 * 7 + 6;

/**
 * 妊娠週数を計算できる上限（42週0日 = 294日目）。
 *
 * これを超える日数は、日付の打ち間違いか、妊娠の継続が前提にならなかった場合。
 * どちらなのかは入力から分からないので、理由を書き分けず `INVALID_DATE_MESSAGE` を返す
 */
export const MAX_GESTATION_DAYS = 42 * 7;

/** 妊娠◯か月の1か月あたりの日数（4週＝1か月。妊娠月数の数え方） */
export const DAYS_PER_PREGNANCY_MONTH = 28;

/**
 * 入力を受け付けられなかったときの文言。**仕様で決めてある**（実装者の裁量にしない）。
 *
 * 未来の日付・42週を超える日付のどれであっても同じ文言を返す。
 * 「予定日を過ぎています」のような書き方をすると、妊娠の継続が前提にならなかった方にも
 * 同じ文字列が出てしまうため、理由を書き分けず淡々とした書き方に寄せている
 */
export const INVALID_DATE_MESSAGE =
  '入力された日付からは妊娠週数を計算できません。日付をご確認ください。';

/**
 * 計算結果のすぐ下に置く注意書き。**仕様で決めてある**（実装者の裁量にしない）。
 *
 * 予定日は医師が超音波検査の結果などをもとに判断するもので、
 * このツールが出すのは一般的な数え方による目安であることを断る
 */
export const MEDICAL_NOTE =
  'この計算は、最終月経開始日を妊娠0週0日として280日目を出産予定日とする一般的な数え方によるものです。実際の出産予定日は、超音波検査の結果などをもとに医師が判断します。医師から伝えられた予定日がある場合は、そちらが優先されます。';

/** 制度・定義データを最後に確認した日 */
export const DATA_CHECKED_AT = '2026-09-19';

// ------------------------------------------------------------ 入出力

/** 何を基準に予定日を出すか */
export type DueDateBasis =
  /** 最終月経の開始日（既定）。+280日 */
  | 'lmp'
  /** 排卵日・受精日。+266日 */
  | 'ovulation'
  /** 医師に言われた出産予定日。そのまま使う */
  | 'due';

export interface ShussanYoteibiInput {
  /** 基準にするもの */
  basis: DueDateBasis;
  /** その日付 */
  date: DateParts;
  /** 胎児数（1=単胎、2以上=多胎）。**産休の開始日にだけ効く** */
  fetusCount?: number;
  /** 「今日」（既定は指定なし＝週数を出さない）。静的書き出しなので呼び出し側が渡す */
  asOf?: DateParts;
}

/** 妊娠週数（満の数え方） */
export interface GestationalAge {
  /** 最終月経開始日からの経過日数（0週0日の当日は0） */
  days: number;
  /** 週数（満） */
  weeks: number;
  /** 週の中の日数（0〜6） */
  dayOfWeek: number;
  /** 妊娠月数（4週＝1か月なので「◯か月目」。0週0日は1か月） */
  months: number;
  /** '37週1日' の形 */
  label: string;
}

/** 妊娠の時期区分 */
export type Trimester = 'early' | 'mid' | 'late';

/** 週数の帯に置く節目 */
export interface Milestone {
  /** 節目の日 */
  date: DateParts;
  /** その節目にあたる妊娠日数（帯の中の位置を出すのに使う） */
  day: number;
  /** 表示名 */
  label: string;
  /** 根拠（法令・用語の定義）。**根拠を書けないものは節目にしない** */
  basis: string;
  /** `asOf` より前か（同日は false。「もう過ぎた」の表示に使う） */
  passed: boolean;
}

export interface ShussanYoteibiResult {
  /** 何を基準に計算したか */
  basis: DueDateBasis;
  /** 出産予定日（40週0日） */
  dueDate: DateParts;
  /** 週数の起点にあたる日（最終月経開始日相当。= 予定日 − 280日） */
  lmpDate: DateParts;
  /** 排卵日相当の日（2週0日。= 予定日 − 266日） */
  ovulationDate: DateParts;
  /** 胎児数 */
  fetusCount: number;
  /** 多胎妊娠か */
  multiple: boolean;

  /** 今日の妊娠週数。`asOf` を渡さなかった場合は null */
  gestation: GestationalAge | null;
  /** 今日の時期区分。`asOf` を渡さなかった場合は null */
  trimester: Trimester | null;
  /** 今日が正期産の期間（37週0日〜41週6日）に入っているか */
  isTerm: boolean;
  /** 予定日を過ぎた日数（過ぎていなければ0） */
  overdueDays: number;
  /** 予定日までの残り日数（過ぎていれば0） */
  daysToDue: number;

  /** 正期産の開始日（37週0日） */
  termStartDate: DateParts;
  /** 正期産の最終日（41週6日） */
  termEndDate: DateParts;

  /** 産前産後休業の日程（`lib/shussan-teate.ts` の `calcLeaveSchedule()` の戻り値） */
  leave: LeaveSchedule;
  /** 週数の帯に置く節目（日付の昇順） */
  milestones: Milestone[];
}

// ------------------------------------------------------------ 計算

/** 時期区分（初期 〜13週6日／中期 14週0日〜27週6日／後期 28週0日〜） */
export function trimesterOf(days: number): Trimester {
  if (days < MID_TRIMESTER_DAY) return 'early';
  if (days < LATE_TRIMESTER_DAY) return 'mid';
  return 'late';
}

/** 時期区分の日本語表記 */
export function trimesterLabel(trimester: Trimester): string {
  return { early: '妊娠初期', mid: '妊娠中期', late: '妊娠後期' }[trimester];
}

/**
 * 経過日数 → 妊娠週数。
 *
 * 0週0日が最終月経開始日なので、37週0日は 7 × 37 = 259日目、
 * 37週1日は260日目になる（週数は「満」の数え方）。
 * 妊娠月数は4週＝1か月で、0週0日が「1か月」（数えの数え方）。
 */
export function gestationalAgeOf(days: number): GestationalAge {
  const weeks = Math.floor(days / 7);
  const dayOfWeek = days % 7;
  return {
    days,
    weeks,
    dayOfWeek,
    months: Math.floor(days / DAYS_PER_PREGNANCY_MONTH) + 1,
    label: `${weeks}週${dayOfWeek}日`,
  };
}

/** 基準の日付から出産予定日を出す */
export function dueDateFrom(basis: DueDateBasis, date: DateParts): DateParts {
  if (basis === 'lmp') return addDays(date, LMP_TO_DUE_DAYS);
  if (basis === 'ovulation') return addDays(date, OVULATION_TO_DUE_DAYS);
  return date;
}

/**
 * 出産予定日・妊娠週数・産休の日程を計算する。
 *
 * @returns 入力から妊娠週数を出せないときは null（文言は `INVALID_DATE_MESSAGE`）。
 *   `asOf` を渡さない場合は週数の検証をしないので、予定日だけが返る
 */
export function calcShussanYoteibi(input: ShussanYoteibiInput): ShussanYoteibiResult | null {
  const { basis, date } = input;
  const fetusCount = Math.max(1, Math.floor(input.fetusCount ?? 1));

  const dueDate = dueDateFrom(basis, date);
  const lmpDate = addDays(dueDate, -LMP_TO_DUE_DAYS);
  const ovulationDate = addDays(dueDate, -OVULATION_TO_DUE_DAYS);

  const asOf = input.asOf;
  let gestation: GestationalAge | null = null;
  if (asOf) {
    const elapsed = daysBetween(lmpDate, asOf);
    // 起点より前（妊娠前）・42週を超える日数は計算しない。理由は書き分けない
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > MAX_GESTATION_DAYS) return null;
    gestation = gestationalAgeOf(elapsed);
  }

  const leave = calcLeaveSchedule(dueDate, fetusCount);
  const termStartDate = addDays(lmpDate, TERM_START_DAY);
  const termEndDate = addDays(lmpDate, TERM_END_DAY);

  const elapsed = gestation?.days ?? null;
  const overdueDays = elapsed === null ? 0 : Math.max(0, elapsed - LMP_TO_DUE_DAYS);
  const daysToDue = elapsed === null ? 0 : Math.max(0, LMP_TO_DUE_DAYS - elapsed);
  const isTerm = elapsed !== null && elapsed >= TERM_START_DAY && elapsed <= TERM_END_DAY;

  return {
    basis,
    dueDate,
    lmpDate,
    ovulationDate,
    fetusCount,
    multiple: leave.multiple,
    gestation,
    trimester: elapsed === null ? null : trimesterOf(elapsed),
    isTerm,
    overdueDays,
    daysToDue,
    termStartDate,
    termEndDate,
    leave,
    milestones: milestonesOf(lmpDate, leave, asOf),
  };
}

/**
 * 週数の帯に置く節目。
 *
 * **根拠が法令か用語の定義にあるものだけ**を置く。「安定期」（医学用語ではない俗称）や
 * 妊婦健診の間隔（医学的な指導にあたる）は入れない。
 *
 * 産前休業は「請求できる」ものなので（労基法65条1項）、断定形にしない。
 */
function milestonesOf(
  lmpDate: DateParts,
  leave: LeaveSchedule,
  asOf: DateParts | undefined,
): Milestone[] {
  const passed = (date: DateParts) => (asOf ? daysBetween(date, asOf) > 0 : false);
  const at = (day: number) => addDays(lmpDate, day);

  const list: Milestone[] = [
    {
      date: at(MID_TRIMESTER_DAY),
      day: MID_TRIMESTER_DAY,
      label: '妊娠中期に入る（14週0日）',
      basis: '産科婦人科用語集の時期区分',
      passed: false,
    },
    {
      date: at(LATE_TRIMESTER_DAY),
      day: LATE_TRIMESTER_DAY,
      label: '妊娠後期に入る（28週0日）',
      basis: '産科婦人科用語集の時期区分',
      passed: false,
    },
    {
      date: leave.leaveFrom,
      day: daysBetween(lmpDate, leave.leaveFrom),
      label: `産前休業を請求できる（予定日の${leave.multiple ? 14 : 6}週間前）`,
      basis: '労働基準法65条1項',
      passed: false,
    },
    {
      date: at(TERM_START_DAY),
      day: TERM_START_DAY,
      label: '正期産に入る（37週0日）',
      basis: '産科婦人科用語集の正期産の定義',
      passed: false,
    },
    {
      date: at(LMP_TO_DUE_DAYS),
      day: LMP_TO_DUE_DAYS,
      label: '出産予定日（40週0日）',
      basis: '産科婦人科用語集の分娩予定日の定義',
      passed: false,
    },
  ];

  return list
    .map((m) => ({ ...m, passed: passed(m.date) }))
    .sort((a, b) => a.day - b.day);
}

// ------------------------------------------------------------ 出産手当金への引き継ぎ

/**
 * 出産手当金 計算機へ渡すクエリ文字列（`?due=YYYY-MM-DD&babies=1`）。
 *
 * 予定日を入れ直さずに給付の計算へ進めるようにするためのもの。
 * **受け側（`app/shussan-teate/Calculator.tsx`）は `useSearchParams` を使わない。**
 * 静的エクスポートでは Suspense 境界とページの CSR 化を招くため、
 * `useEffect` で `window.location.search` を読み、`parseHandoffQuery()` で検証する
 */
export function shussanTeateHandoffQuery(dueDate: DateParts, fetusCount: number): string {
  return `?due=${formatDate(dueDate)}&babies=${Math.max(1, Math.floor(fetusCount))}`;
}

/** `parseHandoffQuery()` が読み取れた値だけ。読めなかった項目は undefined */
export interface HandoffQuery {
  dueDate?: DateParts;
  fetusCount?: number;
}

/**
 * 引き継ぎのクエリを読む。**不正な値は黙って捨てる**（受け側は既定値のまま動く）。
 *
 * @param search `window.location.search`（先頭の `?` はあってもなくてもよい）
 */
export function parseHandoffQuery(search: string): HandoffQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const out: HandoffQuery = {};

  const due = params.get('due');
  if (due) {
    const parsed = parseDate(due);
    if (parsed) out.dueDate = parsed;
  }

  const babies = Number(params.get('babies'));
  // 胎児数は1〜10だけを受け付ける（範囲外・小数・文字列は捨てる）
  if (Number.isInteger(babies) && babies >= 1 && babies <= 10) out.fetusCount = babies;

  return out;
}
