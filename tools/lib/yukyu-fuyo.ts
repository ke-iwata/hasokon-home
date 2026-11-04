/**
 * 有給休暇 付与日数 計算機のロジック（純関数のみ）
 *
 * 仕様: docs/features/yukyu-fuyo-nissu.md
 *
 * 入社日と週の働き方から、次の付与日と日数・前回分の繰越を足した今の残り・
 * 2 年の時効で消える日・年 5 日の取得義務の期限を出す。
 *
 * - 付与日数は**表の値をそのまま持つ**（10×4/5.2 のような式で出さない。
 *   式にすると端数処理の説明が要り、読み違いの元になる）
 * - 出勤率 8 割は満たしている前提（判定はしない。画面に注記を出す）
 * - 法定の最低基準だけを扱う（会社独自の上乗せ・前倒し付与・斉一的取扱いは扱わない）
 *
 * 出典:
 * - 労働基準法 39 条・115 条・120 条 https://laws.e-gov.go.jp/law/322AC0000000049
 * - 労働基準法施行規則 24 条の 3 https://laws.e-gov.go.jp/law/322M40000100023
 * - 厚生労働省「1 週間の所定労働時間が 30 時間未満の者に対する年次有給休暇の付与日数」
 *   https://www.mhlw.go.jp/www2/kisya/kijun/20001130_01_k/20001130_01_k_bessi.html
 * - 厚生労働省「年 5 日の年次有給休暇の確実な取得 わかりやすい解説」
 *   https://www.mhlw.go.jp/hatarakikata/salaried.html
 */

import { daysInMonth, formatDate, parseDate, type DateParts } from '@/lib/date-parts';

/** 週の所定労働日数の区分（5 は「5 日以上」） */
export type WeeklyDays = 5 | 4 | 3 | 2 | 1;

// 【データ更新箇所】付与日数の表（労働基準法 39 条 2 項・施行規則 24 条の 3 第 3 項）
/**
 * 付与日数の表。行は週の所定労働日数（5 は通常の表＝週 5 日以上または週 30 時間以上）、
 * 列は 6か月・1年6か月・2年6か月・3年6か月・4年6か月・5年6か月・6年6か月以上。
 */
export const GRANT_TABLE: Readonly<Record<WeeklyDays, readonly number[]>> = {
  5: [10, 11, 12, 14, 16, 18, 20],
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3],
};

/** 比例付与の区分ごとの年の所定労働日数（表の 2 列目。5 は「217 日以上」） */
export const ANNUAL_RANGE: Readonly<Record<WeeklyDays, { min: number; max: number | null }>> = {
  5: { min: 217, max: null },
  4: { min: 169, max: 216 },
  3: { min: 121, max: 168 },
  2: { min: 73, max: 120 },
  1: { min: 48, max: 72 },
};

/** 表の列見出し（短い形。360px 幅で 1 行に収める） */
export const TENURE_SHORT = ['6か月', '1年半', '2年半', '3年半', '4年半', '5年半', '6年半〜'] as const;

/** 年 5 日の取得義務の対象になる付与日数（39 条 7 項：10 日以上付与される人） */
export const DUTY_THRESHOLD = 10;

/** 年 5 日の取得義務の日数 */
export const DUTY_DAYS = 5;

/** 繰越を足した残りの上限（20 日＋20 日。時効 2 年で 1 回だけ繰り越せるため） */
export const MAX_BALANCE = 40;

/** 付与の予定表に出す回数 */
export const SCHEDULE_ROWS = 8;

// 【データ更新箇所】法改正の動き（FAQ「法改正で変わりますか」の文面はここから組み立てる）
/** 労働基準法の改正の段階。法案が提出・成立・施行されたらここを進める */
export type ReformStatus = '検討中' | '法案提出' | '成立' | '施行';
export const LAW_REFORM: { status: ReformStatus; checkedAt: string } = {
  status: '検討中',
  checkedAt: '2026-11-03',
};

/** 年の所定労働日数 → 比例付与の区分。48 日未満は付与なし（null） */
export function weeklyFromAnnual(annualDays: number): WeeklyDays | null {
  if (!Number.isFinite(annualDays)) return null;
  if (annualDays >= 217) return 5;
  if (annualDays >= 169) return 4;
  if (annualDays >= 121) return 3;
  if (annualDays >= 73) return 2;
  if (annualDays >= 48) return 1;
  return null;
}

/** 比例付与の対象か（30 時間以上なら日数にかかわらず通常の表） */
export function isProportional(weekly: WeeklyDays, over30h: boolean): boolean {
  return !over30h && weekly <= 4;
}

/** n 回目（0 始まり）の付与日数。表の行・列を引くだけ（式で出さない） */
export function grantDays(n: number, weekly: WeeklyDays, over30h: boolean): number {
  const row = GRANT_TABLE[isProportional(weekly, over30h) ? weekly : 5];
  return row[Math.min(Math.max(0, Math.floor(n)), row.length - 1)];
}

/** n 回目（0 始まり）の付与の勤続年数の表記（'6か月'・'1年6か月'…） */
export function tenureLabel(n: number): string {
  return n === 0 ? '6か月' : `${n}年6か月`;
}

/** 予定表の短い勤続表記（'6か月'・'1年半'…）。360px で折り返さないため */
export function tenureShort(n: number): string {
  return n === 0 ? '6か月' : `${n}年半`;
}

/**
 * start の日から数えて months か月の期間が満了する日（その日まで含む）。
 *
 * 入社日（付与日）その日から勤務している前提で、その日を 1 日目として数える
 * （4 月 1 日入社の 6 か月は 9 月 30 日に満了し、10 月 1 日に付与。厚生労働省の例と同じ）。
 * 応当日の前日に満了し、**応当日が無い月はその月の末日に満了する**（民法 143 条 2 項ただし書き）。
 * 8 月 31 日入社の 6 か月は 2 月末日に満了し、付与は翌日の 3 月 1 日になる。
 */
export function periodEnd(start: DateParts, months: number): DateParts {
  const total = start.year * 12 + (start.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = daysInMonth(year, month);
  if (start.day > last) return { year, month, day: last };
  if (start.day === 1) {
    // 応当日が 1 日 → 前の月の末日
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    return { year: py, month: pm, day: daysInMonth(py, pm) };
  }
  return { year, month, day: start.day - 1 };
}

/** 満了日の翌日 */
function nextDay(d: DateParts): DateParts {
  if (d.day < daysInMonth(d.year, d.month)) return { ...d, day: d.day + 1 };
  if (d.month < 12) return { year: d.year, month: d.month + 1, day: 1 };
  return { year: d.year + 1, month: 1, day: 1 };
}

function parseOrThrow(iso: string): DateParts {
  const d = parseDate(iso);
  if (!d) throw new Error(`日付の形式が不正です: ${iso}`);
  return d;
}

/** n 回目（0 始まり）の付与日（入社から 6 か月＋12n か月の継続勤務を満たした日） */
export function grantDateAt(hireDate: string, n: number): string {
  return formatDate(nextDay(periodEnd(parseOrThrow(hireDate), 6 + 12 * n)));
}

/** 付与日の列（入社日 + 6か月、以後 1 年ごと）。until 以前のものだけ */
export function grantDates(hireDate: string, until: string): string[] {
  const out: string[] = [];
  for (let n = 0; n < 200; n++) {
    const d = grantDateAt(hireDate, n);
    if (d > until) break;
    out.push(d);
  }
  return out;
}

/** 時効で消える前の最後の日（付与日から 2 年の期間の満了日＝2 年後の応当日の前日） */
export function expiresOn(grantedOn: string): string {
  return formatDate(periodEnd(parseOrThrow(grantedOn), 24));
}

/** 年 5 日の取得義務の期限（基準日＝付与日から 1 年以内＝1 年後の応当日の前日） */
export function dutyDeadline(grantedOn: string): string {
  return formatDate(periodEnd(parseOrThrow(grantedOn), 12));
}

export type YukyuInput = {
  /** 入社日（雇入れ日）'YYYY-MM-DD' */
  hireDate: string;
  /** 週の所定労働日数。週で決まっていなければ 'annual' */
  weekly: WeeklyDays | 'annual';
  /** weekly が 'annual' のときの年の所定労働日数 */
  annualDays?: number;
  /** 週の所定労働時間が 30 時間以上か（週 5 日以上なら見ない） */
  over30h: boolean;
  /** 今回の付与日の時点で前回分が何日残っていたか（繰越の元）。空なら 0 */
  carriedAtGrant?: number;
  /** 今回の付与日以降に取った日数（繰越分から取った日も含む・時間単位の分は除く）。空なら 0 */
  usedSinceGrant?: number;
  /** 基準日（今日）'YYYY-MM-DD' */
  today: string;
};

export type YukyuError =
  | 'invalid-hire'
  | 'invalid-today'
  | 'before-hire'
  | 'invalid-annual'
  | 'no-grant'
  | 'invalid-days';

export const YUKYU_ERROR_MESSAGES: Record<YukyuError, string> = {
  'invalid-hire': '入社日を入れてください。',
  'invalid-today': '基準日（今日）を入れてください。',
  'before-hire': '入社前です。入社日は基準日（今日）より前の日付を入れてください。',
  'invalid-annual': '年の所定労働日数は 1〜366 の数で入れてください。',
  'no-grant': '年の所定労働日数が 48 日未満のため、法定の年次有給休暇の付与はありません（施行規則 24 条の 3）。',
  'invalid-days': '日数は 0 以上の数で入れてください。',
};

export type GrantRow = {
  n: number;
  date: string;
  tenure: string;
  days: number;
  expiresOn: string;
};

export type YukyuResult = {
  /** 区分（週の所定労働日数。年の日数から引いたものを含む） */
  weekly: WeeklyDays;
  /** 比例付与の対象か */
  proportional: boolean;
  /** まだ最初の付与（6 か月）の前か */
  beforeFirstGrant: boolean;
  nextGrant: { n: number; date: string; days: number };
  /** 今回分（基準日の時点でいちばん新しい付与）。時効で消える日＝付与日の 2 年後の前日 */
  current: {
    n: number;
    grantedOn: string;
    days: number;
    expiresOn: string;
    remaining: number;
  } | null;
  /** 前回分（繰越。今回の付与日から 1 年以内に消える） */
  carried: {
    grantedOn: string;
    days: number;
    expiresOn: string;
    remaining: number;
  } | null;
  /** carried + current - used（0 未満にしない。古いほうから先に引く） */
  balance: number;
  /** 年 5 日の取得義務（今回分が 10 日以上のときだけ対象） */
  fiveDayDuty: {
    applies: boolean;
    deadline: string | null;
    remaining: number | null;
  };
  /** 比例付与で、初めて 10 日以上になる付与（週 2 日・週 1 日・通常の表は null） */
  dutyStartsAt: { n: number; date: string; days: number } | null;
  /** 付与の予定（8 回分。前回分から） */
  schedule: GrantRow[];
};

/** 入力の検査。問題なければ null */
export function validateYukyu(input: YukyuInput): YukyuError | null {
  if (!parseDate(input.hireDate)) return 'invalid-hire';
  if (!parseDate(input.today)) return 'invalid-today';
  if (input.hireDate > input.today) return 'before-hire';
  if (input.weekly === 'annual') {
    const a = input.annualDays;
    if (a === undefined || !Number.isFinite(a) || a < 1 || a > 366) return 'invalid-annual';
    if (weeklyFromAnnual(a) === null) return 'no-grant';
  }
  for (const v of [input.carriedAtGrant, input.usedSinceGrant]) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return 'invalid-days';
  }
  return null;
}

/** 区分を決める（'annual' なら年の日数から引く） */
export function resolveWeekly(input: Pick<YukyuInput, 'weekly' | 'annualDays'>): WeeklyDays | null {
  return input.weekly === 'annual' ? weeklyFromAnnual(input.annualDays ?? Number.NaN) : input.weekly;
}

function row(hireDate: string, n: number, weekly: WeeklyDays, over30h: boolean): GrantRow {
  const date = grantDateAt(hireDate, n);
  return {
    n,
    date,
    tenure: tenureLabel(n),
    days: grantDays(n, weekly, over30h),
    expiresOn: expiresOn(date),
  };
}

/** 比例付与で、初めて 10 日以上になる付与（なければ null） */
export function dutyStart(
  hireDate: string,
  weekly: WeeklyDays,
  over30h: boolean,
): { n: number; date: string; days: number } | null {
  if (!isProportional(weekly, over30h)) return null;
  const n = GRANT_TABLE[weekly].findIndex((d) => d >= DUTY_THRESHOLD);
  if (n < 0) return null;
  return { n, date: grantDateAt(hireDate, n), days: GRANT_TABLE[weekly][n] };
}

/** 計算本体。入力は validateYukyu を通したものを渡す（通らないものは例外） */
export function calcYukyu(input: YukyuInput): YukyuResult {
  const error = validateYukyu(input);
  if (error) throw new Error(YUKYU_ERROR_MESSAGES[error]);
  const weekly = resolveWeekly(input) as WeeklyDays;
  // 週 5 日以上は時間にかかわらず通常の表
  const over30h = weekly === 5 ? true : input.over30h;
  const proportional = isProportional(weekly, over30h);

  const past = grantDates(input.hireDate, input.today);
  const currentN = past.length - 1; // -1 は最初の付与の前
  const nextN = currentN + 1;
  const nextGrant = {
    n: nextN,
    date: grantDateAt(input.hireDate, nextN),
    days: grantDays(nextN, weekly, over30h),
  };

  const used = input.usedSinceGrant ?? 0;
  let current: YukyuResult['current'] = null;
  let carried: YukyuResult['carried'] = null;
  let balance = 0;
  let fiveDayDuty: YukyuResult['fiveDayDuty'] = {
    applies: false,
    deadline: null,
    remaining: null,
  };

  if (currentN >= 0) {
    const cur = row(input.hireDate, currentN, weekly, over30h);
    // 繰越の元は前回の付与日数を超えない（最初の付与には繰越が無い）
    const carriedDays =
      currentN >= 1 ? Math.min(input.carriedAtGrant ?? 0, grantDays(currentN - 1, weekly, over30h)) : 0;
    // 使った日は古いほう（繰越分）から先に引く（法令に定めは無い。就業規則による）
    const fromCarried = Math.min(carriedDays, used);
    const fromCurrent = Math.min(cur.days, used - fromCarried);
    if (carriedDays > 0) {
      const prevDate = grantDateAt(input.hireDate, currentN - 1);
      carried = {
        grantedOn: prevDate,
        days: carriedDays,
        expiresOn: expiresOn(prevDate),
        remaining: carriedDays - fromCarried,
      };
    }
    current = {
      n: currentN,
      grantedOn: cur.date,
      days: cur.days,
      expiresOn: cur.expiresOn,
      remaining: cur.days - fromCurrent,
    };
    balance = Math.min(MAX_BALANCE, Math.max(0, carriedDays + cur.days - used));
    // 年 5 日：基準日から 1 年のあいだに取った日を数える。繰越分から取った日も含める
    if (cur.days >= DUTY_THRESHOLD) {
      fiveDayDuty = {
        applies: true,
        deadline: dutyDeadline(cur.date),
        remaining: Math.max(0, DUTY_DAYS - used),
      };
    }
  }

  const start = Math.max(0, currentN - 1);
  const schedule = Array.from({ length: SCHEDULE_ROWS }, (_, i) => row(input.hireDate, start + i, weekly, over30h));

  return {
    weekly,
    proportional,
    beforeFirstGrant: currentN < 0,
    nextGrant,
    current,
    carried,
    balance,
    fiveDayDuty,
    dutyStartsAt: dutyStart(input.hireDate, weekly, over30h),
    schedule,
  };
}

/** '2027-04-01' → '2027年4月1日' */
export function formatJaDate(iso: string): string {
  const d = parseOrThrow(iso);
  return `${d.year}年${d.month}月${d.day}日`;
}

/** '2027-04-01' → '2027/4/1'（予定表の短い形） */
export function formatShortDate(iso: string): string {
  const d = parseOrThrow(iso);
  return `${d.year}/${d.month}/${d.day}`;
}

/** 0.5 刻みの日数の表記（3 → '3'、2.5 → '2.5'） */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** FAQ「法改正で変わりますか」の答え。LAW_REFORM.status から組み立てる */
export function reformAnswer(reform: { status: ReformStatus; checkedAt: string } = LAW_REFORM): string {
  const checked = formatJaDate(reform.checkedAt);
  const base = '付与日数・2年の時効・年5日の取得義務そのものを変える案は出ていません。';
  switch (reform.status) {
    case '検討中':
      return `${checked}時点で、労働基準法の見直し（連続勤務の上限・勤務間インターバル・有給の日の賃金の算定方式など）は労働政策審議会（労働条件分科会）で議論が続いており、国会には法案が提出されていません。${base}有給の日の賃金の算定方式は論点に入っていますが、このツールは日数だけを出すので影響しません。法案が提出されたら、この答えを書き直します。`;
    case '法案提出':
      return `${checked}時点で、労働基準法の改正案が国会に提出されています。${base}成立・施行の時期が決まったら、この答えを書き直します。`;
    case '成立':
      return `${checked}時点で、労働基準法の改正が成立しています。${base}施行日以降もこのツールの日数は変わりません。`;
    case '施行':
      return `${checked}時点で、労働基準法の改正が施行されています。${base}`;
  }
}
