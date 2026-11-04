/**
 * 償却資産税 計算機（令和9年度・免税点180万円対応）
 *
 * 仕様: docs/features/shokyaku-shisanzei.md
 *
 * 事業用の資産（償却資産）の取得価額・取得年月・耐用年数から、その年度の1月1日時点の評価額・
 * 課税標準・税額を出し、免税点で「かかる／かからない」を判定する。
 *
 * ■ 一次確認
 * - 地方税法（昭和25年法律第226号）341条4号・349条の2・350条（標準税率1.4%）・351条（免税点）・
 *   359条（賦課期日1月1日）・383条（1月31日までに申告）・20条の4の2（課税標準1,000円未満・税額100円未満切捨て）・
 *   20条の5第2項（期限が休日なら翌日）
 * - 地方税法等の一部を改正する法律（令和8年法律第2号）：351条の「百五十万円」→「百八十万円」。
 *   附則14条2項で**令和九年度以後の年度分**から適用（施行は2027-04-01だが、賦課期日2027-01-01の資産から180万円）
 * - 351条は「満たない場合」なので**ちょうど免税点の額は課税**
 * - 地方税法施行令49条：所得税法施行令138条（10万円未満）・139条（一括償却）の資産を除く。
 *   租税特別措置法28条の2（40万円未満の特例）で全額経費にした物は除かれない
 * - 固定資産評価基準 別表第15（減価残存率）：自治体の転載（大分市「減価残存率表」）を 2026-10-26 に取得して写した。
 *   **小数3桁の表の値をそのまま使い、式（1 − r/2）で計算しない**（5年は 0.8155 ではなく 0.815）
 *
 * ■ まだ確かめていないこと（仕様書「まだ確かめていないこと」）
 * 1. 別表第15の本文（総務省）は未取得。自治体の転載の値を使っている
 * 2. 1月1日に取得した物の扱いは一次情報で確かめられていないので、取得は「年・月」までを受け付け、
 *    **1月の取得はその年の取得（＝その年度の対象外）**として扱い、画面に注記する
 * 3. 課税標準の特例（わがまち特例・先端設備）は初版では扱わない
 *
 * 計算は円・千分率の整数で行い、浮動小数の掛け算を通さない。
 *
 * 【データ更新箇所】冒頭の定数（MENZEITEN・STANDARD_RATE_PERMIL・FLOOR_RATIO・ZANZON_RITSU・
 * TITLE_NENDO・COMPARE_UNTIL・DATA_CHECKED_AT）。
 */

import { IKKATSU_LIMIT, SHOGAKU_LIMIT, TOKUREI_LIMIT_AFTER } from './genka-shokyaku';
import { addDays, formatDate, isWeekend, type DateParts } from './date-parts';
import { isHoliday } from './nissu-keisan';

/** データ全体の最終確認日 'YYYY-MM-DD' */
export const DATA_CHECKED_AT = '2026-10-26';

// 【データ更新箇所】
/**
 * 免税点（地方税法351条）。fromNendo の年度から適用。新しい順に並べ、最後の行（fromNendo: null）がそれより前の年度。
 * 令和8年法律第2号 附則14条2項：令和9年度（2027）以後は180万円
 */
export const MENZEITEN: { fromNendo: number | null; yen: number }[] = [
  { fromNendo: 2027, yen: 1_800_000 },
  { fromNendo: null, yen: 1_500_000 },
];

/** 標準税率 1.4%（地方税法350条）を千分率の整数で */
export const STANDARD_RATE_PERMIL = 14;

/**
 * 税率の入力の範囲（千分率）。**法律上の上限ではない**（制限税率2.1%は廃止済み）。
 * 打ち間違いを防ぐための範囲で、総務省「超過課税の状況」で最高の税率を確かめられなかったので
 * 仕様書の既定どおり 1.4〜2.1% にしている
 */
export const RATE_PERMIL_MIN = 14;
export const RATE_PERMIL_MAX = 21;

/** 評価額の最低限度：取得価額の5%（固定資産評価基準） */
export const FLOOR_RATIO = 0.05;

/** 耐用年数の範囲（別表第15を写した範囲） */
export const MIN_LIFE = 2;
export const MAX_LIFE = 50;

/** 資産の行の最大数 */
export const MAX_ROWS = 10;

/** 推移表の最大年数 */
export const MAX_SCHEDULE_YEARS = 20;

/** 減価残存率（前年中取得 A = 1 − r/2、前年前取得 B = 1 − r。どちらも表の値） */
export interface Zanzon {
  /** 耐用年数に応ずる減価率 r */
  r: number;
  /** 前年中に取得した物（1年目）に掛ける率 */
  firstYear: number;
  /** 前年より前に取得した物（前年度の評価額）に掛ける率 */
  later: number;
}

/**
 * 固定資産評価基準 別表第15（減価残存率表）。耐用年数2〜50年。
 * 大分市「減価残存率表」（『固定資産評価基準』別表15より）から写した。**式で作らない**
 */
export const ZANZON_RITSU: Record<number, Zanzon> = {
  2: { r: 0.684, firstYear: 0.658, later: 0.316 },
  3: { r: 0.536, firstYear: 0.732, later: 0.464 },
  4: { r: 0.438, firstYear: 0.781, later: 0.562 },
  5: { r: 0.369, firstYear: 0.815, later: 0.631 },
  6: { r: 0.319, firstYear: 0.84, later: 0.681 },
  7: { r: 0.28, firstYear: 0.86, later: 0.72 },
  8: { r: 0.25, firstYear: 0.875, later: 0.75 },
  9: { r: 0.226, firstYear: 0.887, later: 0.774 },
  10: { r: 0.206, firstYear: 0.897, later: 0.794 },
  11: { r: 0.189, firstYear: 0.905, later: 0.811 },
  12: { r: 0.175, firstYear: 0.912, later: 0.825 },
  13: { r: 0.162, firstYear: 0.919, later: 0.838 },
  14: { r: 0.152, firstYear: 0.924, later: 0.848 },
  15: { r: 0.142, firstYear: 0.929, later: 0.858 },
  16: { r: 0.134, firstYear: 0.933, later: 0.866 },
  17: { r: 0.127, firstYear: 0.936, later: 0.873 },
  18: { r: 0.12, firstYear: 0.94, later: 0.88 },
  19: { r: 0.114, firstYear: 0.943, later: 0.886 },
  20: { r: 0.109, firstYear: 0.945, later: 0.891 },
  21: { r: 0.104, firstYear: 0.948, later: 0.896 },
  22: { r: 0.099, firstYear: 0.95, later: 0.901 },
  23: { r: 0.095, firstYear: 0.952, later: 0.905 },
  24: { r: 0.092, firstYear: 0.954, later: 0.908 },
  25: { r: 0.088, firstYear: 0.956, later: 0.912 },
  26: { r: 0.085, firstYear: 0.957, later: 0.915 },
  27: { r: 0.082, firstYear: 0.959, later: 0.918 },
  28: { r: 0.079, firstYear: 0.96, later: 0.921 },
  29: { r: 0.076, firstYear: 0.962, later: 0.924 },
  30: { r: 0.074, firstYear: 0.963, later: 0.926 },
  31: { r: 0.072, firstYear: 0.964, later: 0.928 },
  32: { r: 0.069, firstYear: 0.965, later: 0.931 },
  33: { r: 0.067, firstYear: 0.966, later: 0.933 },
  34: { r: 0.066, firstYear: 0.967, later: 0.934 },
  35: { r: 0.064, firstYear: 0.968, later: 0.936 },
  36: { r: 0.062, firstYear: 0.969, later: 0.938 },
  37: { r: 0.06, firstYear: 0.97, later: 0.94 },
  38: { r: 0.059, firstYear: 0.97, later: 0.941 },
  39: { r: 0.057, firstYear: 0.971, later: 0.943 },
  40: { r: 0.056, firstYear: 0.972, later: 0.944 },
  41: { r: 0.055, firstYear: 0.972, later: 0.945 },
  42: { r: 0.053, firstYear: 0.973, later: 0.947 },
  43: { r: 0.052, firstYear: 0.974, later: 0.948 },
  44: { r: 0.051, firstYear: 0.974, later: 0.949 },
  45: { r: 0.05, firstYear: 0.975, later: 0.95 },
  46: { r: 0.049, firstYear: 0.975, later: 0.951 },
  47: { r: 0.048, firstYear: 0.976, later: 0.952 },
  48: { r: 0.047, firstYear: 0.976, later: 0.953 },
  49: { r: 0.046, firstYear: 0.977, later: 0.954 },
  50: { r: 0.045, firstYear: 0.977, later: 0.955 },
};

/** 選べる最初の年度（令和8年度。改正前の比較の年度） */
export const FIRST_NENDO = 2026;
/** 改正前後の比較に使う2つの年度（令和8年度・令和9年度） */
export const KAISEI_BEFORE_NENDO = 2026;
export const KAISEI_AFTER_NENDO = 2027;

/**
 * title・description の年度。**毎年2月（申告期限の翌日以降）に1つ上げる**。
 * `tests/shokyaku-shisanzei.test.ts` が `defaultNendo(new Date())` と食い違うと落ちて知らせる
 */
export const TITLE_NENDO = 2027;

/** この日まで改正前後の比較を開いて出す。過ぎたら `<details>` に畳む */
export const COMPARE_UNTIL = '2027-06-30';

// ---------------------------------------------------------------- 年度・期限

/** 西暦の年度 → 令和の年度 */
export const reiwa = (nendo: number) => nendo - 2018;

/** その年度の免税点（円） */
export function menzeiten(nendo: number): number {
  for (const m of MENZEITEN) {
    if (m.fromNendo === null || nendo >= m.fromNendo) return m.yen;
  }
  return MENZEITEN[MENZEITEN.length - 1].yen;
}

/**
 * 申告期限：その年度の1月31日（地方税法383条）。土日・祝日なら翌日に繰り下げる（20条の5第2項）。
 * 祝日は `nissu-keisan` の `HOLIDAYS`（祝日を足せば自動で追随する）
 */
export function filingDeadline(nendo: number): DateParts {
  let d: DateParts = { year: nendo, month: 1, day: 31 };
  while (isWeekend(d) || isHoliday(d)) d = addDays(d, 1);
  return d;
}

/** Date か 'YYYY-MM-DD' を 'YYYY-MM-DD' に（Date はローカルの暦日） */
function toYmd(today: Date | string): string {
  if (typeof today === 'string') return today;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
}

/**
 * 開いた日から決める既定の年度：その暦年の申告期限がまだ来ていなければその暦年、過ぎていれば翌暦年。
 * 2026-10-20 → 2027／2027-02-01 → 2027／2027-02-02 → 2028
 */
export function defaultNendo(today: Date | string): number {
  const ymd = toYmd(today);
  const year = Number(ymd.slice(0, 4));
  return ymd <= formatDate(filingDeadline(year)) ? year : year + 1;
}

/** 選べる年度：令和8年度〜既定の年度（未来の年度は選ばせない） */
export function selectableNendos(today: Date | string): number[] {
  const last = defaultNendo(today);
  const out: number[] = [];
  for (let n = FIRST_NENDO; n <= last; n++) out.push(n);
  return out;
}

/** 改正前後の比較を開いて出す期間か */
export function showCompareOpen(today: Date | string): boolean {
  return toYmd(today) <= COMPARE_UNTIL;
}

// ---------------------------------------------------------------- 評価額

/** 取得年月 */
export interface Acquired {
  year: number;
  /** 1〜12 */
  month: number;
}

/**
 * 取得した物が最初に対象になる年度。**1月の取得もその年の取得として翌年度から**
 * （1月1日取得の扱いは未確認。仕様書「まだ確かめていないこと」2）
 */
export function firstNendoOf(acquired: Acquired): number {
  return acquired.year + 1;
}

const permil = (rate: number) => Math.round(rate * 1000);

/** 評価額の最低限度（取得価額の5%、1円未満切捨て） */
export function floorValue(cost: number): number {
  return Math.floor((cost * permil(FLOOR_RATIO)) / 1000);
}

/** 推移表の1行 */
export interface ScheduleRow {
  nendo: number;
  /** その年度の1月1日時点の評価額 */
  value: number;
  /** 5%の下限で止まっているか */
  atFloor: boolean;
}

/**
 * 推移表：最初に対象になる年度から years 年分。
 * 1年目は 取得価額 × A、2年目以降は 前年度の評価額 × B（それぞれ1円未満切捨て）。最低は取得価額の5%
 */
export function schedule(cost: number, acquired: Acquired, life: number, years: number): ScheduleRow[] {
  const z = ZANZON_RITSU[life];
  if (!z || !(cost > 0)) return [];
  const floor = floorValue(cost);
  const out: ScheduleRow[] = [];
  let value = 0;
  for (let i = 0; i < years; i++) {
    const raw = i === 0 ? Math.floor((cost * permil(z.firstYear)) / 1000) : Math.floor((value * permil(z.later)) / 1000);
    const atFloor = raw <= floor;
    value = atFloor ? floor : raw;
    out.push({ nendo: firstNendoOf(acquired) + i, value, atFloor });
  }
  return out;
}

/** その年度の評価額（1円未満切捨て、最低5%）。まだ対象でない年度（取得がその年以後）は 0 */
export function valuation(cost: number, acquired: Acquired, life: number, nendo: number): number {
  const n = nendo - firstNendoOf(acquired) + 1;
  if (n <= 0) return 0;
  const rows = schedule(cost, acquired, life, n);
  return rows.length === n ? rows[n - 1].value : 0;
}

// ---------------------------------------------------------------- 少額資産

/** 所得税・法人税での扱い */
export type Treatment = 'normal' | 'shogaku' | 'ikkatsu' | 'tokurei';

export const TREATMENT_LABEL: Record<Treatment, string> = {
  normal: '通常の減価償却',
  shogaku: '10万円未満で全額経費',
  ikkatsu: '一括償却（3年）',
  tokurei: '40万円未満の特例で全額経費',
};

/** 申告から外れるか（地方税法施行令49条）。**40万円未満の特例は false**（申告が要る） */
export function excluded(treatment: Treatment): boolean {
  return treatment === 'shogaku' || treatment === 'ikkatsu';
}

/** 取得価額がその扱いの上限（未満）に収まっているか */
export function treatmentFits(treatment: Treatment, cost: number): boolean {
  switch (treatment) {
    case 'shogaku':
      return cost < SHOGAKU_LIMIT;
    case 'ikkatsu':
      return cost < IKKATSU_LIMIT;
    case 'tokurei':
      return cost < TOKUREI_LIMIT_AFTER;
    case 'normal':
      return true;
  }
}

// ---------------------------------------------------------------- 判定

/** 資産の1行 */
export interface AssetRow {
  name?: string;
  cost: number;
  acquired: Acquired;
  life: number;
  treatment: Treatment;
}

export type RowStatus =
  /** 申告に載り、評価額を合計する */
  | 'included'
  /** 10万円未満・一括償却で申告から外れる */
  | 'excluded'
  /** その年度の1月1日にまだ持っていない（取得がその年以後） */
  | 'notYet'
  /** 入力が足りない・範囲外 */
  | 'invalid';

export interface RowResult {
  index: number;
  row: AssetRow;
  status: RowStatus;
  /** その年度の評価額（included のときだけ 0 より大きい） */
  value: number;
  /** 取得価額が選んだ扱いの上限を超えている（扱いは無視して申告に載せる） */
  treatmentMismatch: boolean;
}

export interface Assessment {
  nendo: number;
  ratePermil: number;
  rows: RowResult[];
  /** 評価額の合計 */
  totalValue: number;
  /** 課税標準（1,000円未満切捨て） */
  taxBase: number;
  /** 免税点 */
  menzeiten: number;
  /** 課税されるか（課税標準が免税点**以上**） */
  taxable: boolean;
  /** 税額（100円未満切捨て）。免税点未満は 0 */
  tax: number;
  /** 税率を掛けた額（100円未満を切り捨てる前） */
  taxBeforeRounding: number;
}

/** 入力の行が計算できるか */
export function rowValid(row: AssetRow): boolean {
  return (
    Number.isInteger(row.cost) &&
    row.cost > 0 &&
    Number.isInteger(row.acquired.year) &&
    row.acquired.year >= 1900 &&
    Number.isInteger(row.acquired.month) &&
    row.acquired.month >= 1 &&
    row.acquired.month <= 12 &&
    ZANZON_RITSU[row.life] !== undefined
  );
}

/** 課税標準・税額・免税点の判定 */
export function assess(rows: AssetRow[], nendo: number, ratePermil: number = STANDARD_RATE_PERMIL): Assessment {
  const results: RowResult[] = rows.map((row, index) => {
    if (!rowValid(row)) return { index, row, status: 'invalid', value: 0, treatmentMismatch: false };
    const fits = treatmentFits(row.treatment, row.cost);
    if (fits && excluded(row.treatment)) {
      return { index, row, status: 'excluded', value: 0, treatmentMismatch: false };
    }
    if (nendo < firstNendoOf(row.acquired)) {
      return { index, row, status: 'notYet', value: 0, treatmentMismatch: !fits };
    }
    return {
      index,
      row,
      status: 'included',
      value: valuation(row.cost, row.acquired, row.life, nendo),
      treatmentMismatch: !fits,
    };
  });
  const totalValue = results.reduce((a, r) => a + r.value, 0);
  const taxBase = Math.floor(totalValue / 1000) * 1000;
  const m = menzeiten(nendo);
  const taxable = taxBase >= m;
  const taxBeforeRounding = Math.floor((taxBase * ratePermil) / 1000);
  const tax = taxable ? Math.floor(taxBeforeRounding / 100) * 100 : 0;
  return {
    nendo,
    ratePermil,
    rows: results,
    totalValue,
    taxBase,
    menzeiten: m,
    taxable,
    tax,
    taxBeforeRounding,
  };
}

/** 改正前後（令和8年度・令和9年度）の比較 */
export interface KaiseiCompare {
  before: Assessment;
  after: Assessment;
  /**
   * 改正で「かからない」に変わる：令和8年度は課税、令和9年度は免税点未満で、
   * しかも令和9年度の課税標準が旧免税点以上（改正がなければ課税だった）。
   * 評価額が1年分下がっただけで旧免税点も割った人は含めない
   */
  becomesExempt: boolean;
}

export function compareKaisei(rows: AssetRow[], ratePermil: number = STANDARD_RATE_PERMIL): KaiseiCompare {
  const before = assess(rows, KAISEI_BEFORE_NENDO, ratePermil);
  const after = assess(rows, KAISEI_AFTER_NENDO, ratePermil);
  return {
    before,
    after,
    becomesExempt: before.taxable && !after.taxable && after.taxBase >= menzeiten(KAISEI_BEFORE_NENDO),
  };
}

// ---------------------------------------------------------------- 太陽光

export type SolarUse = 'jutaku' | 'jigyo';

/**
 * 太陽光発電の案内（断定しない）。住宅用で10kW未満は対象外の場合が多く、10kW以上・事業用は対象の場合が多い。
 * 市町村によって扱いが違うので、画面では必ず「お住まいの市町村に確認」を添える
 */
export function solarLikelyTaxable(kw: number, use: SolarUse): boolean {
  return use === 'jigyo' || kw >= 10;
}

// ---------------------------------------------------------------- 出典

export interface Source {
  label: string;
  url: string;
  checkedAt: string;
}

export const SOURCES: Source[] = [
  {
    label: '総務省「地方税法等の一部を改正する法律（令和8年法律第2号）」法律本文',
    url: 'https://www.soumu.go.jp/main_content/001066241.pdf',
    checkedAt: '2026-10-19',
  },
  {
    label: '総務省「固定資産税の概要」',
    url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_08.html',
    checkedAt: '2026-10-19',
  },
  {
    label: 'e-Gov法令検索「地方税法」（341条・349条の2・350条・351条・359条・383条・20条の4の2・20条の5）',
    url: 'https://laws.e-gov.go.jp/law/325AC0000000226',
    checkedAt: '2026-10-19',
  },
  {
    label: 'e-Gov法令検索「地方税法施行令」（49条）',
    url: 'https://laws.e-gov.go.jp/law/325CO0000000245',
    checkedAt: '2026-10-19',
  },
  {
    label: '大分市「減価残存率表」（固定資産評価基準 別表15より）',
    url: 'https://www.city.oita.oita.jp/o036/kurashi/zekin/documents/gennkaritu.pdf',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: '東京都主税局「償却資産（固定資産税）」',
    url: 'https://www.tax.metro.tokyo.lg.jp/shisan/shokyak_sis.html',
    checkedAt: '2026-10-20',
  },
  {
    label: '柏市「償却資産の評価額の計算方法」',
    url: 'https://www.city.kashiwa.lg.jp/shisanzei/zeikin/kotei/syoukyakushisan/hyouka.html',
    checkedAt: '2026-10-19',
  },
  {
    label: '神戸市「償却資産の評価」',
    url: 'https://www.city.kobe.lg.jp/a03858/kurashi/tax/kotei/shokyakushisan/syokyaku_hyoka.html',
    checkedAt: '2026-10-19',
  },
];
