/**
 * cron 式 チェッカーの入口（仕様: docs/features/cron-shiki-checker.md）
 *
 * 画面（app/cron-shiki/Calculator.tsx）はこの `checkCron()` を呼んで、返った値を並べるだけにする。
 */
import { analyze, type Analysis, type DialectChoice, type Reading } from './dialect';
import { describe, fieldRows, type FieldRow } from './describe';
import { environments, monthsWithoutDay, type EnvBlock } from './convert';
import { HORIZON_YEARS, HOLIDAY_LAST_YEAR, jstToMs, nextRuns, runRow, zoneOffsetMs, type RunRow } from './next';
import { DEFAULT_ZONE, type CronSpec, type Dialect, type ParseError, type Zone } from './types';

/** GitHub のドキュメント（schedule の最短間隔・遅延） */
export const GITHUB_SCHEDULE_DOC =
  'https://docs.github.com/ja/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule';

export interface Warning {
  id: 'or' | 'utc-shift' | 'missing-month' | 'never' | 'github-min' | 'github-macro' | 'dow-number' | 'reboot' | 'holiday-range';
  text: string;
}

export interface ReadingResult {
  label: string;
  dialect: Dialect;
  description: string;
  runs: RunRow[];
  steps: number;
  /** 5 年以内に 10 件そろわなかった */
  exhausted: boolean;
  fields: FieldRow[];
  spec: CronSpec;
  /** この読みでの環境ごとの書き方（Quartz と Spring で割れたとき、選んだ読みに合わせる） */
  envs: EnvBlock[];
}

export type CheckResult =
  | {
      ok: true;
      analysis: Exclude<Analysis, { ok: false }>;
      dialect: Dialect;
      zone: Zone;
      /** 読み。2つなら方言で意味が変わる */
      readings: ReadingResult[];
      warnings: Warning[];
      envs: EnvBlock[];
      /** 祝日の表の範囲外の回があるときの1行 */
      holidayNote: string | null;
      /** rate・@reboot など、次回の一覧を出さないときの読み */
      plainText?: string;
    }
  | { ok: false; errors: ParseError[] };

export interface CheckOptions {
  dialect?: DialectChoice;
  /** 式のタイムゾーン。省略すると方言の既定 */
  zone?: Zone;
  /** 基準の時刻（UTC ms） */
  now: number;
  count?: number;
}

function hasSeconds(spec: CronSpec): boolean {
  return !(spec.seconds.length === 1 && spec.seconds[0] === 0);
}

function readingResult(r: Reading, zone: Zone, now: number, count: number): ReadingResult {
  const next = nextRuns(r.spec, now, zone, count);
  return {
    label: r.label,
    dialect: r.dialect,
    description: describe(r.spec),
    runs: next.runs.map((ms) => runRow(ms, hasSeconds(r.spec))),
    steps: next.steps,
    exhausted: next.exhausted,
    fields: fieldRows(r.spec, r.fields, r.grammar),
    spec: r.spec,
    envs: environments(r.spec, zone, r.grammar === 'cron5' ? r.fields.join(' ') : undefined),
  };
}

function minInterval(spec: CronSpec): number {
  if (spec.hours.length === 24 && spec.minutes.length > 1) {
    let min = 60;
    const m = spec.minutes;
    for (let i = 0; i < m.length; i++) {
      const next = i + 1 < m.length ? m[i + 1] : m[0] + 60;
      min = Math.min(min, next - m[i]);
    }
    return min;
  }
  if (spec.minutes.length > 1) {
    let min = 60;
    for (let i = 1; i < spec.minutes.length; i++) min = Math.min(min, spec.minutes[i] - spec.minutes[i - 1]);
    return min;
  }
  return 60;
}

function warningsFor(a: Extract<Analysis, { kind: 'cron' }>, reading: ReadingResult, zone: Zone, dialect: Dialect): Warning[] {
  const w: Warning[] = [];
  const spec = reading.spec;
  const fields = a.readings[0].fields;
  const grammar = a.readings[0].grammar;
  if (grammar === 'cron5' && spec.mode === 'or') {
    w.push({
      id: 'or',
      text: '日と曜日はどちらかに当てはまれば動きます（OR）。例：0 9 1 * 1 は「毎月1日」と「毎週月曜」の両方。両方に当てはまる日だけにしたいときは、どちらかを * にしてスクリプトの中で判定します。',
    });
  }
  if (zone === 'UTC' && (!spec.dom.any || !spec.dow.any) && spec.hours.some((h) => h >= 15)) {
    w.push({
      id: 'utc-shift',
      text: '式は UTC です。UTC の 15:00〜23:59 は日本時間の翌日 0:00〜8:59 なので、日本時間では曜日（日付）が1日あとにずれます。',
    });
  }
  if (reading.runs.length === 0 && reading.exhausted) {
    w.push({ id: 'never', text: `この式は実行されません（${HORIZON_YEARS}年以内に当てはまる日時がありません）。` });
  } else {
    const missing = monthsWithoutDay(spec);
    if (missing.length > 0 && missing.length < spec.months.length) {
      w.push({ id: 'missing-month', text: `${missing.map((m) => `${m}月`).join('・')}には実行されません（その日が無い月です）。` });
    }
  }
  if (dialect === 'github') {
    const short = minInterval(spec) < 5;
    w.push({
      id: 'github-min',
      text: `GitHub Actions の schedule は最短5分ごとです${short ? '（この式は5分より短い間隔です）' : ''}。混雑する時間（毎時0分など）は遅れたり、飛ばされたりすることがあります。`,
    });
    if (a.macro) {
      const expanded = fields.join(' ');
      w.push({ id: 'github-macro', text: `GitHub Actions は ${a.macro} のようなマクロを受け付けません。「${expanded}」と書いてください。` });
    }
  }
  const dowIndex = grammar === 'cron5' ? 4 : grammar === 'aws' ? 4 : 5;
  if (/\d/.test((fields[dowIndex] ?? '').replace(/#\d/, ''))) {
    w.push({
      id: 'dow-number',
      text: '曜日の数字は方言で読みが違います：crontab は 0 と 7 が日曜・1 が月曜、Spring も 0／7 が日曜、Quartz と AWS は 1 が日曜〜7 が土曜。迷ったら MON・FRI のように名前で書くと確実です。',
    });
  }
  return w;
}

/** 曜日の数字の対応表（注意の帯に添える） */
export const DOW_NUMBER_TABLE: { dialect: string; values: string[] }[] = [
  { dialect: 'crontab・GitHub Actions・Kubernetes', values: ['0・7', '1', '2', '3', '4', '5', '6'] },
  { dialect: 'Spring', values: ['0・7', '1', '2', '3', '4', '5', '6'] },
  { dialect: 'Quartz・AWS', values: ['1', '2', '3', '4', '5', '6', '7'] },
];

export function checkCron(input: string, opts: CheckOptions): CheckResult {
  const count = opts.count ?? 10;
  const a = analyze(input, opts.dialect ?? 'auto');
  if (!a.ok) return { ok: false, errors: a.errors };
  const dialect = a.dialect;
  const zone = opts.zone ?? DEFAULT_ZONE[dialect];

  if (a.kind === 'reboot') {
    return {
      ok: true,
      analysis: a,
      dialect,
      zone,
      readings: [],
      warnings: [{ id: 'reboot', text: '@reboot はサーバー（cron）が起動したときに1回だけ動くので、次回の日時は出せません。' }],
      envs: [],
      holidayNote: null,
      plainText: '起動したときに1回',
    };
  }
  if (a.kind === 'rate') {
    return { ok: true, analysis: a, dialect, zone, readings: [], warnings: [], envs: [], holidayNote: null, plainText: a.text };
  }
  if (a.kind === 'at') {
    const { year, month, day, hour, minute, second } = a.wall;
    const ms = Date.UTC(year, month - 1, day, hour, minute, second) - zoneOffsetMs(zone);
    const row = runRow(ms, second !== 0);
    return {
      ok: true,
      analysis: a,
      dialect,
      zone,
      readings: [],
      warnings: [],
      envs: [],
      holidayNote: null,
      plainText: `${row.jst}（日本時間）に1回だけ`,
    };
  }

  const readings = a.readings.map((r) => readingResult(r, zone, opts.now, count));
  const warnings = warningsFor(a, readings[0], zone, dialect);
  const outOfRange = readings.some((r) => r.runs.some((x) => x.holiday.kind === 'out-of-range'));
  const holidayNote = outOfRange ? `祝日の表は ${HOLIDAY_LAST_YEAR} 年まで。それ以降の祝日は印が付きません。` : null;
  return { ok: true, analysis: a, dialect, zone, readings, warnings, envs: readings[0].envs, holidayNote };
}

export { jstToMs };
