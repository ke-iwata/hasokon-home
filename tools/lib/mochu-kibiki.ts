/**
 * 喪中・忌引き・法要 早見のロジック。純関数のみ（DOM/React に依存しない）。
 *
 * 仕様: docs/features/mochu-kibiki-hayami.md
 *
 * - 親等・親族の範囲：民法 725 条・726 条（e-Gov 法令 https://laws.e-gov.go.jp/law/129AC0000000089 ）
 * - 忌引きの日数：人事院規則15-14 第 22 条第 1 項第 13 号・別表第二（国家公務員の基準）
 * - 喪中はがきの範囲・法要：慣習の目安（法令ではない。断定しない）
 * - 年賀状の日程：郵便料金 計算機の `NENGA_SCHEDULES` をそのまま使う（同じ日付を二重に持たない）
 *
 * 「今日」は引数で受け取り、中で `new Date()` を呼ばない（テストで日付を固定するため）。
 * 画面では `todayInTokyo()`（Asia/Tokyo）で取って渡す。
 */
import {
  addDays,
  daysBetween,
  formatMonthDay,
  NENGA_SCHEDULES,
  nengaScheduleFor,
  todayInTokyo,
  type NengaSchedule,
  type Ymd,
} from '@/lib/yubin-ryokin';

export { todayInTokyo, formatMonthDay, type Ymd };

// ---------------------------------------------------------------- 続柄と親等

export type Side = 'self' | 'spouse';

export type RelationId =
  | 'haigusha'
  | 'fubo'
  | 'ko'
  | 'sofubo'
  | 'mago'
  | 'kyodai'
  | 'ojioba'
  | 'oimei'
  | 'itoko'
  | 'sosofubo'
  | 'himago'
  | 'ko-haigusha'
  | 'kyodai-haigusha'
  | 'ojioba-haigusha'
  | 'fubo-haigusha'
  | 'gi-fubo'
  | 'gi-sofubo'
  | 'gi-kyodai'
  | 'gi-ko'
  | 'gi-ojioba'
  | 'gi-oimei'
  | 'gi-itoko';

/** 別表第二の行（`KIBIKI_TABLE` のキー） */
export type KibikiRowId =
  | 'haigusha'
  | 'fubo'
  | 'ko'
  | 'sofubo'
  | 'mago'
  | 'kyodai'
  | 'ojioba'
  | 'fubo-haigusha'
  | 'ko-haigusha'
  | 'sofubo-haigusha'
  | 'kyodai-haigusha'
  | 'ojioba-haigusha';

export interface Relation {
  id: RelationId;
  label: string;
  side: Side;
  /** 共通の祖先まで上る世代数（配偶者自身は 0） */
  up: number;
  /** 共通の祖先から下る世代数 */
  down: number;
  /** 自分側の血族の配偶者（子の配偶者・継父母など）。姻族になる */
  viaSpouse?: boolean;
  /** 配偶者自身 */
  isSpouse?: boolean;
  /** 別表第二の行。無ければ別表第二に定めなし */
  kibiki: KibikiRowId | null;
}

/**
 * 続柄の一覧（自分側 15・配偶者側 7 の計 22）。**画面の並び順（よく選ばれる順）**で並べる。
 * 自分側の 8 個目以降は「ほかの続柄」に畳む（`SELF_PRIMARY_COUNT`）
 */
export const RELATIONS: readonly Relation[] = [
  // 自分側
  { id: 'haigusha', label: '配偶者', side: 'self', up: 0, down: 0, isSpouse: true, kibiki: 'haigusha' },
  { id: 'fubo', label: '父・母', side: 'self', up: 1, down: 0, kibiki: 'fubo' },
  { id: 'sofubo', label: '祖父母', side: 'self', up: 2, down: 0, kibiki: 'sofubo' },
  { id: 'kyodai', label: '兄弟姉妹', side: 'self', up: 1, down: 1, kibiki: 'kyodai' },
  { id: 'ko', label: '子', side: 'self', up: 0, down: 1, kibiki: 'ko' },
  { id: 'mago', label: '孫', side: 'self', up: 0, down: 2, kibiki: 'mago' },
  { id: 'ojioba', label: 'おじ・おば', side: 'self', up: 2, down: 1, kibiki: 'ojioba' },
  { id: 'itoko', label: 'いとこ', side: 'self', up: 2, down: 2, kibiki: null },
  { id: 'oimei', label: '甥・姪', side: 'self', up: 1, down: 2, kibiki: null },
  { id: 'sosofubo', label: '曾祖父母', side: 'self', up: 3, down: 0, kibiki: null },
  { id: 'himago', label: 'ひ孫', side: 'self', up: 0, down: 3, kibiki: null },
  { id: 'ko-haigusha', label: '子の配偶者', side: 'self', up: 0, down: 1, viaSpouse: true, kibiki: 'ko-haigusha' },
  { id: 'kyodai-haigusha', label: '兄弟姉妹の配偶者', side: 'self', up: 1, down: 1, viaSpouse: true, kibiki: 'kyodai-haigusha' },
  { id: 'ojioba-haigusha', label: 'おじ・おばの配偶者', side: 'self', up: 2, down: 1, viaSpouse: true, kibiki: 'ojioba-haigusha' },
  { id: 'fubo-haigusha', label: '父母の配偶者（継父母）', side: 'self', up: 1, down: 0, viaSpouse: true, kibiki: 'fubo-haigusha' },
  // 配偶者側
  { id: 'gi-fubo', label: '配偶者の父母', side: 'spouse', up: 1, down: 0, kibiki: 'fubo-haigusha' },
  { id: 'gi-sofubo', label: '配偶者の祖父母', side: 'spouse', up: 2, down: 0, kibiki: 'sofubo-haigusha' },
  { id: 'gi-kyodai', label: '配偶者の兄弟姉妹', side: 'spouse', up: 1, down: 1, kibiki: 'kyodai-haigusha' },
  { id: 'gi-ojioba', label: '配偶者のおじ・おば', side: 'spouse', up: 2, down: 1, kibiki: null },
  { id: 'gi-oimei', label: '配偶者の甥・姪', side: 'spouse', up: 1, down: 2, kibiki: null },
  { id: 'gi-itoko', label: '配偶者のいとこ', side: 'spouse', up: 2, down: 2, kibiki: null },
  { id: 'gi-ko', label: '配偶者の子（連れ子）', side: 'spouse', up: 0, down: 1, kibiki: 'ko-haigusha' },
];

/** 自分側で最初から見せる数（2 列 × 4 段） */
export const SELF_PRIMARY_COUNT = 8;

export function relationById(id: RelationId): Relation {
  const r = RELATIONS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown relation: ${id}`);
  return r;
}

export type Kind = 'spouse' | 'blood' | 'affinity';

export interface Kinship {
  kind: Kind;
  /** 親等（配偶者自身は null） */
  degree: number | null;
  /** 直系か傍系か（配偶者自身は null） */
  line: 'direct' | 'collateral' | null;
  /** 民法上の親族か（725 条：6 親等内の血族・配偶者・3 親等内の姻族） */
  isRelative: boolean;
  /** 「二親等の血族（傍系）」のような説明 */
  label: string;
}

const KANJI_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 親等と関係（民法 725 条・726 条） */
export function kinship(r: Relation): Kinship {
  if (r.isSpouse) {
    return { kind: 'spouse', degree: null, line: null, isRelative: true, label: '配偶者（親等はありません）' };
  }
  const degree = r.up + r.down;
  const line = r.up === 0 || r.down === 0 ? 'direct' : 'collateral';
  const kind: Kind = r.side === 'spouse' || r.viaSpouse ? 'affinity' : 'blood';
  const isRelative = kind === 'blood' ? degree <= 6 : degree <= 3;
  const kindLabel = kind === 'blood' ? '血族' : '姻族';
  const lineLabel = line === 'direct' ? '直系' : '傍系';
  return { kind, degree, line, isRelative, label: `${KANJI_NUM[degree]}親等の${kindLabel}（${lineLabel}）` };
}

// ---------------------------------------------------------------- 喪中はがきの範囲（慣習の目安）

/** `usual` = 一般的に出す（二親等以内）、`optional` = 同居や付き合いの深さで決めてよい */
export type MochuScope = 'usual' | 'optional';

export function mochuScope(r: Relation): MochuScope {
  const k = kinship(r);
  if (k.kind === 'spouse') return 'usual';
  return k.degree !== null && k.degree <= 2 ? 'usual' : 'optional';
}

// ---------------------------------------------------------------- 忌引き（人事院規則15-14 別表第二）【データ更新箇所】

export interface KibikiRow {
  id: KibikiRowId;
  /** 別表第二の「親族」欄 */
  label: string;
  days: number;
  /** 条件つきで日数が増える場合 */
  extra?: { when: 'daishu' | 'seikei'; days: number };
}

/**
 * 人事院規則15-14 別表第二（第 22 条関係）。全 12 行。
 * 出典: e-Gov 法令API https://laws.e-gov.go.jp/api/1/lawdata/406RJNJ15014000
 * （2026-10-27 に XML を取得し、`rowspan` まで確認。配偶者・父母は 7 日の欄を共有、
 * 「兄弟姉妹の配偶者又は配偶者の兄弟姉妹」は上の行と生計同一の条件の欄を共有）。
 * 改正があれば行を直し、`tests/mochu-kibiki.test.ts` の行数の検査も直す
 */
export const KIBIKI_TABLE: readonly KibikiRow[] = [
  { id: 'haigusha', label: '配偶者', days: 7 },
  { id: 'fubo', label: '父母', days: 7 },
  { id: 'ko', label: '子', days: 5 },
  { id: 'sofubo', label: '祖父母', days: 3, extra: { when: 'daishu', days: 7 } },
  { id: 'mago', label: '孫', days: 1 },
  { id: 'kyodai', label: '兄弟姉妹', days: 3 },
  { id: 'ojioba', label: 'おじ又はおば', days: 1, extra: { when: 'daishu', days: 7 } },
  { id: 'fubo-haigusha', label: '父母の配偶者又は配偶者の父母', days: 3, extra: { when: 'seikei', days: 7 } },
  { id: 'ko-haigusha', label: '子の配偶者又は配偶者の子', days: 1, extra: { when: 'seikei', days: 5 } },
  { id: 'sofubo-haigusha', label: '祖父母の配偶者又は配偶者の祖父母', days: 1, extra: { when: 'seikei', days: 3 } },
  { id: 'kyodai-haigusha', label: '兄弟姉妹の配偶者又は配偶者の兄弟姉妹', days: 1, extra: { when: 'seikei', days: 3 } },
  { id: 'ojioba-haigusha', label: 'おじ又はおばの配偶者', days: 1 },
];

export const KIBIKI_SOURCE_URL = 'https://laws.e-gov.go.jp/law/406RJNJ15014000';

export const EXTRA_LABELS = {
  daishu: '代襲相続し、かつ、祭具等の承継を受ける',
  seikei: '生計を一にしていた',
} as const;

export function kibikiRow(r: Relation): KibikiRow | null {
  if (!r.kibiki) return null;
  return KIBIKI_TABLE.find((row) => row.id === r.kibiki) ?? null;
}

export interface KibikiInput {
  /** 生計を一にしていた */
  seikei: boolean;
  /** 代襲相続し、かつ、祭具等の承継を受ける */
  daishu: boolean;
  /** 1 日目 */
  start: Ymd;
  /** 往復に要する日数（0〜7） */
  ofuku: number;
}

export interface KibikiResult {
  row: KibikiRow;
  /** 別表第二の日数（条件を当てはめた後） */
  baseDays: number;
  /** 条件で増えたか */
  extraApplied: boolean;
  ofuku: number;
  /** 往復を足した連続する日数 */
  totalDays: number;
  start: Ymd;
  /** 終わりの日 = 1 日目 + 日数 − 1（土日・祝日を含む暦日） */
  end: Ymd;
}

export const OFUKU_MAX = 7;

/** 忌引きの日数と終わりの日。別表第二に定めの無い続柄は null */
export function kibiki(r: Relation, input: KibikiInput): KibikiResult | null {
  const row = kibikiRow(r);
  if (!row) return null;
  const extraApplied = !!row.extra && input[row.extra.when];
  const baseDays = extraApplied ? row.extra!.days : row.days;
  const ofuku = Math.max(0, Math.min(OFUKU_MAX, Math.floor(input.ofuku) || 0));
  const totalDays = baseDays + ofuku;
  return { row, baseDays, extraApplied, ofuku, totalDays, start: input.start, end: addDays(input.start, totalDays - 1) };
}

// ---------------------------------------------------------------- 喪中の正月・出しどき・寒中見舞い

export type Matsunouchi = 7 | 15;

/**
 * 立春の日。【データ更新箇所】毎年 2 月の国立天文台の暦要項の発表で翌々年分を足す。
 * 2027: 国立天文台 令和9年暦要項 https://eco.mtk.nao.ac.jp/koyomi/yoko/2027/rekiyou272.html
 */
export const RISSHUN: Readonly<Record<number, Ymd>> = { 2027: '2027-02-04' };

/** 喪中の正月の年 = 命日より後に最初に来る 1 月 1 日の年（命日当日は含めない） */
export function mochuNewYear(meinichi: Ymd): number {
  return Number(meinichi.slice(0, 4)) + 1;
}

export interface KanchuPeriod {
  /** 松の内が明けた日 */
  from: Ymd;
  /** 立春の前日（節分）。暦要項が未収録の年は null（「例年 2 月 3 日ごろ」と書く） */
  to: Ymd | null;
}

export function kanchuPeriod(year: number, matsunouchi: Matsunouchi, risshun: Readonly<Record<number, Ymd>> = RISSHUN): KanchuPeriod {
  const from = `${year}-01-${String(matsunouchi + 1).padStart(2, '0')}`;
  const r = risshun[year];
  return { from, to: r ? addDays(r, -1) : null };
}

export type Dashidoki =
  /** #2 喪中の正月は過ぎた */
  | { kind: 'passed'; year: number }
  /** #3 喪中の正月を迎えた（寒中見舞いで） */
  | { kind: 'new-year'; year: number; kanchu: KanchuPeriod }
  /** #4 その年用の年賀の日程が未確認 */
  | { kind: 'unknown'; year: number; kanchu: KanchuPeriod }
  /** #5 年賀状の受付開始の前日までに届くように */
  | {
      kind: 'before-accept';
      year: number;
      schedule: NengaSchedule;
      /** 届けたい期限（受付開始の前日） */
      deadline: Ymd;
      /** 期限まであと何日（当日は 0） */
      daysLeft: number;
      /** 命日が 12 月（間に合わない相手には寒中見舞いで、の添え書きを出す） */
      decemberNote: boolean;
      kanchu: KanchuPeriod;
    }
  /** #6 年賀状の受付が始まっている（寒中見舞いで） */
  | { kind: 'accepting'; year: number; schedule: NengaSchedule; kanchu: KanchuPeriod };

/**
 * 喪中はがきの出しどき（仕様書「喪中の正月と出しどきの場合分け」の #2〜#6。#1 の「命日が空」は呼ぶ側で扱う）。
 * 上から順に最初に当てはまるものを返す
 */
export function dashidoki(
  meinichi: Ymd,
  today: Ymd,
  matsunouchi: Matsunouchi,
  schedules: readonly NengaSchedule[] = NENGA_SCHEDULES,
  risshun: Readonly<Record<number, Ymd>> = RISSHUN,
): Dashidoki {
  const year = mochuNewYear(meinichi);
  const kanchu = kanchuPeriod(year, matsunouchi, risshun);
  const kanchuEnd = kanchu.to ?? `${year}-02-03`;
  if (today > kanchuEnd) return { kind: 'passed', year };
  if (today >= `${year}-01-01`) return { kind: 'new-year', year, kanchu };
  const schedule = schedules.find((s) => s.year === year);
  if (!schedule) return { kind: 'unknown', year, kanchu };
  if (today < schedule.acceptFrom) {
    const deadline = addDays(schedule.acceptFrom, -1);
    return {
      kind: 'before-accept',
      year,
      schedule,
      deadline,
      daysLeft: daysBetween(today, deadline),
      decemberNote: meinichi.slice(5, 7) === '12',
      kanchu,
    };
  }
  return { kind: 'accepting', year, schedule, kanchu };
}

/** 'YYYY-MM-DD' → '1月8日'（曜日なし） */
export function monthDay(ymd: Ymd): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}月${d}日`;
}

/** 寒中見舞いの期間の文言（「1月8日〜2月3日」／暦要項が無い年は「1月8日〜立春の前日（例年2月3日ごろ）」） */
export function kanchuText(k: KanchuPeriod): string {
  return `${monthDay(k.from)}〜${k.to ? monthDay(k.to) : '立春の前日（例年2月3日ごろ）'}`;
}

/** 出しどきのカードの見出しと本文 */
export function dashidokiText(d: Dashidoki): { head: string; body: string; note: string | null } {
  switch (d.kind) {
    case 'passed':
      return {
        head: `喪中の正月（${d.year}年）は過ぎています`,
        body: '喪中はがき・寒中見舞いを出す時期は過ぎました。',
        note: null,
      };
    case 'new-year':
      return {
        head: `喪中の正月（${d.year}年）を迎えました`,
        body: `年賀状をいただいた方へは、寒中見舞い（${kanchuText(d.kanchu)}）でお知らせするのが一般的です。`,
        note: null,
      };
    case 'unknown':
      return {
        head: `${d.year}年用の日程は未確認です`,
        body: '例年は11月中旬〜12月上旬に届くように出します。年賀状の受付開始日は、毎年8月末に日本郵便が発表します。',
        note: null,
      };
    case 'before-accept':
      return {
        head: `${monthDay(d.deadline)}までに届くように（${d.daysLeft === 0 ? '今日まで' : `あと${d.daysLeft}日`}）`,
        body:
          `${d.year}年用の年賀状の受付は${formatMonthDay(d.schedule.acceptFrom)}からです。` +
          `相手が年賀状を書き始める前に届くよう、理想は12月上旬まで。遅くとも受付開始の前日（${formatMonthDay(d.deadline)}）までに届くように出します。`,
        note: d.decemberNote
          ? `間に合わない相手や、すでに年賀状を出した相手には、寒中見舞い（${kanchuText(d.kanchu)}）でお知らせします。`
          : null,
      };
    case 'accepting':
      return {
        head: '年賀状の受付が始まっています',
        body: `寒中見舞い（${kanchuText(d.kanchu)}）でお知らせするのが一般的です。`,
        note: null,
      };
  }
}

// ---------------------------------------------------------------- 法要の日付（慣習の目安）

export type HoyoCount = 'meinichi' | 'zenjitsu';

export interface Hoyo {
  name: string;
  date: Ymd;
  /**
   * その日以前の直近の土日（当日が土日なら当日だけ）。**命日以前の日は外す**
   * （初七日では命日当日・亡くなる前の日が候補に入りうるため）。残らなければ空
   */
  weekend: Ymd[];
  /** 2/29 の命日を 2/28 にずらした */
  leapAdjusted?: boolean;
}

/** 曜日（0=日〜6=土） */
export function weekday(ymd: Ymd): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * その日以前の直近の土日。当日が土日なら当日だけ（前の週には戻さない）。
 * 月〜金なら、その前の土曜と日曜の 2 日
 */
export function weekendBefore(ymd: Ymd): Ymd[] {
  const w = weekday(ymd);
  if (w === 0 || w === 6) return [ymd];
  const sat = addDays(ymd, -(w + 1));
  return [sat, addDays(sat, 1)];
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function addYears(ymd: Ymd, n: number): { date: Ymd; leapAdjusted: boolean } {
  const [y, m, d] = ymd.split('-').map(Number);
  const ty = y + n;
  if (m === 2 && d === 29 && !isLeap(ty)) return { date: `${ty}-02-28`, leapAdjusted: true };
  return { date: `${ty}${ymd.slice(4)}`, leapAdjusted: false };
}

/** 日で数える法要（命日を 1 日目として、命日 + n 日） */
const DAY_HOYO: readonly [string, number][] = [
  ['初七日', 6],
  ['四十九日', 48],
  ['百か日', 99],
];

/** 年で数える法要（n 回忌 = n − 1 年後。一周忌は 1 年後） */
const YEAR_HOYO: readonly [string, number][] = [
  ['一周忌', 1],
  ['三回忌', 2],
  ['七回忌', 6],
  ['十三回忌', 12],
  ['十七回忌', 16],
  ['二十三回忌', 22],
  ['二十七回忌', 26],
  ['三十三回忌', 32],
];

/**
 * 法要の日付。`zenjitsu`（命日の前日から数える。関西の一部）は日で数える法要だけが 1 日早まる。
 * 年忌（一周忌以降）は数え方に関係なく命日と同じ月日
 */
export function hoyoDates(meinichi: Ymd, count: HoyoCount = 'meinichi'): Hoyo[] {
  const base = count === 'zenjitsu' ? addDays(meinichi, -1) : meinichi;
  const after = (date: Ymd) => weekendBefore(date).filter((w) => w > meinichi);
  const out: Hoyo[] = DAY_HOYO.map(([name, n]) => {
    const date = addDays(base, n);
    return { name, date, weekend: after(date) };
  });
  for (const [name, n] of YEAR_HOYO) {
    const { date, leapAdjusted } = addYears(meinichi, n);
    out.push({ name, date, weekend: after(date), ...(leapAdjusted ? { leapAdjusted } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- ページの文面

const STATIC_TITLE = '喪中はがきの範囲・忌引き日数・四十九日 早見｜何親等か・法要の日付も';

/**
 * title。ビルド日が年賀の表示期間（前年 11-01〜販売終了）の中なら年賀の受付開始を入れる。
 * 期間外は日付の無い文面（静的 HTML は開いた日で切り替わらないため）
 */
export function pageTitle(asOf: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string {
  const s = nengaScheduleFor(asOf, schedules);
  if (!s) return STATIC_TITLE;
  return `喪中はがきの範囲・忌引き日数・四十九日 早見｜${s.year}年用は年賀状の受付が${monthDay(s.acceptFrom)}から`;
}

export function pageDescription(asOf: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string {
  const s = nengaScheduleFor(asOf, schedules);
  const timing = s ? `出す時期（${s.year}年用の年賀状の受付は${monthDay(s.acceptFrom)}から）` : '時期';
  const range = s ? '喪中はがきを出す範囲・' : '喪中はがきを出す範囲と';
  return (
    `亡くなった方の続柄と命日から、何親等か・${range}${timing}・寒中見舞いの期間・` +
    '忌引きの日数（国家公務員の基準）・四十九日や一周忌の日付を一度に表示。登録不要・無料。'
  );
}

/** FAQ「喪中はがきはいつまでに出す？」の答え。期間外は日付を書かない */
export function dashidokiFaqAnswer(asOf: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string {
  const s = nengaScheduleFor(asOf, schedules);
  const common = '喪中はがきは「年賀状を控えます」というお知らせなので、相手が年賀状を書き始める前に届くのが目的です。';
  if (!s) {
    return common + '年賀状の受付開始（例年12月中旬）より前、11月中旬〜12月上旬に届くように出すのが一般的です。';
  }
  return (
    common +
    `${s.year}年用の年賀状の受付は${monthDay(s.acceptFrom)}からで、従前の12月15日より遅くなりました。` +
    `遅くとも${monthDay(addDays(s.acceptFrom, -1))}（受付開始の前日）までに届くように、理想は12月上旬までに出します。` +
    '受付開始より後になったら、松の内が明けてから寒中見舞いで知らせるのが一般的です。'
  );
}
