/**
 * cron 式 チェッカーの型（仕様: docs/features/cron-shiki-checker.md）
 *
 * 式は方言ごとの文法で解析し、方言によらない「値の集合」（CronSpec）に直してから
 * 次回探索・読み下し・UTC 変換に回す。曜日は内部ではすべて 0=日曜〜6=土曜で持つ
 * （方言ごとの数字の読み替えは parse.ts の中だけで済ませる）。
 */

/** 画面で選べる方言 */
export type Dialect =
  | 'crontab'
  | 'github'
  | 'eventbridge-rule'
  | 'eventbridge-scheduler'
  | 'kubernetes'
  | 'quartz'
  | 'spring';

/** 文法（方言のうち、式の書き方が同じものをまとめたもの） */
export type Grammar = 'cron5' | 'aws' | 'quartz' | 'spring';

/** 扱うタイムゾーンは2つだけ（日本に夏時間は無いので固定差で計算できる） */
export type Zone = 'Asia/Tokyo' | 'UTC';

export const DIALECTS: readonly Dialect[] = [
  'crontab',
  'github',
  'eventbridge-rule',
  'eventbridge-scheduler',
  'kubernetes',
  'quartz',
  'spring',
];

export const DIALECT_LABELS: Record<Dialect, string> = {
  crontab: 'Linux crontab',
  github: 'GitHub Actions',
  'eventbridge-rule': 'AWS EventBridge ルール',
  'eventbridge-scheduler': 'AWS EventBridge Scheduler',
  kubernetes: 'Kubernetes CronJob',
  quartz: 'Quartz',
  spring: 'Spring',
};

/** URL のクエリ（`?d=`）で使う短い名前 */
export const DIALECT_QUERY: Record<Dialect, string> = {
  crontab: 'crontab',
  github: 'github',
  'eventbridge-rule': 'aws-rule',
  'eventbridge-scheduler': 'aws-scheduler',
  kubernetes: 'k8s',
  quartz: 'quartz',
  spring: 'spring',
};

export const GRAMMAR_OF: Record<Dialect, Grammar> = {
  crontab: 'cron5',
  github: 'cron5',
  kubernetes: 'cron5',
  'eventbridge-rule': 'aws',
  'eventbridge-scheduler': 'aws',
  quartz: 'quartz',
  spring: 'spring',
};

/** 方言ごとの「式のタイムゾーン」の既定（仕様の表） */
export const DEFAULT_ZONE: Record<Dialect, Zone> = {
  crontab: 'Asia/Tokyo',
  github: 'UTC',
  'eventbridge-rule': 'UTC',
  'eventbridge-scheduler': 'Asia/Tokyo',
  kubernetes: 'Asia/Tokyo',
  quartz: 'Asia/Tokyo',
  spring: 'Asia/Tokyo',
};

/** 方言ごとに画面へ出す一言（仕様の表） */
export const ZONE_NOTE: Record<Dialect, string> = {
  crontab: 'サーバーのタイムゾーンで動きます（timedatectl で確認）',
  github: 'timezone: "Asia/Tokyo" を書けば日本時間で書けます（書かなければ UTC）',
  'eventbridge-rule': 'ルールはタイムゾーンを指定できません（UTC 固定）。Scheduler なら指定できます',
  'eventbridge-scheduler': 'ScheduleExpressionTimezone を指定しないと UTC です',
  kubernetes: 'spec.timeZone を指定しないとコントローラーのタイムゾーンです',
  quartz: 'アプリの JVM・スケジューラーの設定のタイムゾーンです',
  spring: 'アプリの JVM・スケジューラーの設定のタイムゾーンです',
};

/** 日（day of month）の条件 */
export interface DomSpec {
  /** 制限なし（`*`・`?`） */
  any: boolean;
  /** フィールドが `*` で始まる（Vixie cron の OR／AND の判定に使う。`*\/2` も true） */
  star: boolean;
  /** 1〜31 の値 */
  values: number[];
  /** `L`（0）・`L-3`（3）：末日から数えた日 */
  last: number[];
  /** `15W`：その日に近い平日 */
  nearest: number[];
  /** `LW`：最終平日 */
  lastWeekday: boolean;
}

/** 曜日の条件（0=日曜〜6=土曜） */
export interface DowSpec {
  any: boolean;
  star: boolean;
  values: number[];
  /** `5L`（Quartz の金曜）：その月の最後のその曜日 */
  last: number[];
  /** `6#3`（Quartz の金曜）：第 n のその曜日 */
  nth: { dow: number; n: number }[];
}

/** 方言によらない、値の集合に展開した式 */
export interface CronSpec {
  seconds: number[];
  minutes: number[];
  hours: number[];
  dom: DomSpec;
  months: number[];
  dow: DowSpec;
  /** 年の指定（Quartz・AWS）。null は毎年 */
  years: number[] | null;
  /** 日と曜日の組み合わせ。crontab で両方とも `*` で始まらないときだけ 'or' */
  mode: 'and' | 'or';
}

/** 位置つきの誤り */
export interface ParseError {
  /** 何番目のフィールドか（1 から）。式全体の誤りは 0 */
  position: number;
  message: string;
}

export const FIELD_NAMES = {
  second: '秒',
  minute: '分',
  hour: '時',
  dom: '日',
  month: '月',
  dow: '曜日',
  year: '年',
} as const;

export type FieldKind = keyof typeof FIELD_NAMES;

/** 文法ごとのフィールドの並び */
export const FIELD_ORDER: Record<Grammar, FieldKind[]> = {
  cron5: ['minute', 'hour', 'dom', 'month', 'dow'],
  aws: ['minute', 'hour', 'dom', 'month', 'dow', 'year'],
  quartz: ['second', 'minute', 'hour', 'dom', 'month', 'dow', 'year'],
  spring: ['second', 'minute', 'hour', 'dom', 'month', 'dow'],
};
