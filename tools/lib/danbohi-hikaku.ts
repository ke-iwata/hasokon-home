/**
 * 暖房費 比較 計算機の計算ロジック（純関数のみ）
 *
 * 仕様: docs/features/danbohi-hikaku.md
 *
 * 主の計算は**カタログの値 × 単価だけ**（熱の理屈で推定しない。仕様「計算の約束」1）。
 * - 灯油：L/h × 円/L ＋ W ÷ 1000 × 円/kWh（送風などの電気代）
 * - ガス：kW × 3.6 ÷ 発熱量（MJ/㎥）＝ ㎥/h、× 円/㎥ ＋ 送風の電気代
 * - 電気（エアコン・電気ストーブ・こたつ）：W ÷ 1000 × 円/kWh
 *
 * 単価は持ち直さない：
 * - 灯油の既定は lib/gasoline-dai.ts の FUEL_PRICES.kerosene18L・KEROSENE_BY_PREF（石油製品価格調査）
 * - 電気の既定は lib/aircon-denkidai.ts の DEFAULT_UNIT_PRICE（目安単価 31 円/kWh）
 * - 電気・都市ガスの値引きは lib/denki-gas-shien.ts の SHIEN_PERIODS を**使用月で**引く
 * - 灯油からは激変緩和措置の額を引かない（店頭価格に織り込み済み）。LP ガスは国の支援の対象外
 *
 * 【データ更新箇所】発熱量（HEAT_VALUES）は資源エネルギー庁「エネルギー源別標準発熱量」の改訂時に直す。
 * 灯油の単価は gasoline-dai.ts 側で更新する（ここには持たない）
 */

import { DEFAULT_UNIT_PRICE } from './aircon-denkidai';
import {
  SHIEN_CHECKED_ON,
  SHIEN_PERIODS,
  defaultUsageMonth,
  discountFor,
  shienPhase,
  unitPriceAfterShien,
  usageMonthOptions,
} from './denki-gas-shien';
import { FUEL_PRICES, KEROSENE_BY_PREF, formatDateJa } from './gasoline-dai';

// ============================================================
// 【データ更新箇所】発熱量
// ============================================================

/**
 * 灯油の標準発熱量（MJ/L・総発熱量）。
 * 資源エネルギー庁「エネルギー源別標準発熱量・炭素排出係数（2023年度改訂）」の一覧表の 36.60 MJ/L
 * （2018年度改訂は 36.49）。熱 1 kWh あたりの単価（参考の表）にだけ使い、主の計算には使わない
 */
export const KEROSENE_MJ_PER_L = 36.6;

/** 都市ガス 13A の標準熱量（MJ/㎥）。大手都市ガス各社の標準熱量 45 MJ/㎥ */
export const CITY_GAS_13A_MJ_PER_M3 = 45;

/**
 * LP ガスの発熱量（MJ/㎥）＝ 液化石油ガスの標準発熱量（MJ/kg）÷ 1 kg あたりの気化量（㎥/kg）。
 * - 標準発熱量：資源エネルギー庁「エネルギー源別標準発熱量（2023年度改訂）」の LPG 50.12 MJ/kg（表示は 50.1）
 * - 気化量：プロパン 1 kg ≒ 0.502 ㎥（LP ガス業界で使われる換算。プロパンの分子量 44.1 g/mol、
 *   0℃・1 気圧の気体のモル体積 22.4 L/mol から 1000 ÷ 44.1 × 22.4 ≒ 508 L。実在気体の補正で約 0.502 ㎥）
 * 50.12 ÷ 0.502 ≒ 99.8 MJ/㎥ → 小数第1位に丸めて持つ（仕様「計算の約束」2 の約 99〜100 MJ/㎥）
 */
export const LPG_MJ_PER_KG = 50.12;
export const LPG_M3_PER_KG = 0.502;
export const LPG_MJ_PER_M3 = Math.round((LPG_MJ_PER_KG / LPG_M3_PER_KG) * 10) / 10;

export const HEAT_VALUE_SOURCE = {
  label: '資源エネルギー庁「エネルギー源別標準発熱量・炭素排出係数（2023年度改訂）」',
  url: 'https://www.enecho.meti.go.jp/statistics/total_energy/carbon.html',
} as const;

/** 1 kWh ＝ 3.6 MJ */
export const MJ_PER_KWH = 3.6;

/** 単価の日付が古いとみなす日数（ビルド時の警告だけに使う。ビルドは落とさない） */
export const STALE_PRICE_DAYS = 60;

/** 最大の行数 */
export const MAX_ROWS = 4;

// ============================================================

export type HeaterKind = 'aircon' | 'kerosene' | 'gas' | 'electric' | 'kotatsu';
export type GasType = 'city13A' | 'lpg';

export const HEATER_LABELS: Record<HeaterKind, string> = {
  aircon: 'エアコン（暖房）',
  kerosene: '石油ファンヒーター・石油ストーブ',
  gas: 'ガスファンヒーター',
  electric: '電気ストーブ・セラミックヒーター',
  kotatsu: 'こたつ',
};

export const GAS_LABELS: Record<GasType, string> = {
  city13A: '都市ガス（13A）',
  lpg: 'LP ガス（プロパン）',
};

/** 1 台分の入力（カタログの値）。文字列は画面の入力欄のまま。空欄・不正は 0 として扱う（単価は別） */
export interface HeaterRow {
  kind: HeaterKind;
  /** 消費電力（W）。灯油・ガスは送風などの消費電力（ストーブは 0） */
  watt: number;
  /** 灯油消費量（L/h）。kerosene のときだけ */
  litersPerHour?: number;
  /** ガス消費量（kW）。gas のときだけ */
  gasKw?: number;
  gasType?: GasType;
}

/** 単価。null は「空（入っていない）」で、0 円として扱わない（仕様「計算の約束」10） */
export interface Prices {
  /** 電気（円/kWh） */
  electricity: number | null;
  /** 灯油（円/L） */
  kerosenePerLiter: number | null;
  /** 都市ガス（円/㎥） */
  cityGas: number | null;
  /** LP ガス（円/㎥） */
  lpg: number | null;
  /** 都市ガスの発熱量（MJ/㎥）。既定 45。地域で標準熱量が違う都市ガスがある */
  cityGasMj: number;
  /** LP ガスの発熱量（MJ/㎥） */
  lpgMj: number;
}

export type PriceKey = 'electricity' | 'kerosenePerLiter' | 'cityGas' | 'lpg';

export const PRICE_LABELS: Record<PriceKey, string> = {
  electricity: '電気',
  kerosenePerLiter: '灯油',
  cityGas: '都市ガス',
  lpg: 'LP ガス',
};

export interface Usage {
  hoursPerDay: number;
  daysPerMonth: number;
  /** 使用月（YYYY-MM）。null は「選んでいない＝値引きなし」 */
  usageMonth: string | null;
}

/** 1 時間あたりの額（円・丸める前） */
export interface HourlyCost {
  /** 燃料代（灯油・ガス。電気の機器は 0） */
  fuel: number;
  /** 電気代（電気の機器の全部、灯油・ガスの機器の送風など） */
  electricity: number;
  total: number;
}

export type RowResult =
  | {
      ok: true;
      /** 値引き前（1 時間・丸める前） */
      hourly: HourlyCost;
      /** 値引き後（1 時間・丸める前）。支援の月でなければ hourly と同じ */
      hourlyAfter: HourlyCost;
      /** ガスの使用量（㎥/h）。gas のときだけ */
      m3PerHour?: number;
      /** 表示用（円未満を四捨五入。最後に一度だけ丸める） */
      perHour: number;
      perDay: number;
      perMonth: number;
      /** 値引き後の 1 か月の額（円） */
      perMonthAfter: number;
      /** 1 か月の値引き額（円）＝ perMonth − perMonthAfter */
      discountMonth: number;
      /** 値引きの扱い */
      shien: 'discounted' | 'none-month' | 'not-covered';
      /** 内訳（1 か月・円。値引き後） */
      fuelMonthAfter: number;
      electricityMonthAfter: number;
    }
  | { ok: false; missing: PriceKey[] };

/** 18L の値を円/L に（丸めない） */
export function perLiterFrom18L(yen18L: number): number {
  return yen18L / 18;
}

export type KeroseneUnit = '18L' | '1L';

/**
 * 灯油の単価の欄の値を、単位を切り替えたときに換算する（欄の数値をそのまま残すと 18 倍・18 分の 1 の額になる）。
 * 18L→1L は ÷18 を小数第1位に、1L→18L は ×18 を整数に丸める。空欄・読めない値はそのまま返す
 */
export function convertKeroseneUnit(text: string, from: KeroseneUnit, to: KeroseneUnit): string {
  if (from === to) return text;
  const n = parsePrice(text);
  if (n === null) return text;
  return to === '1L' ? String(Math.round((n / 18) * 10) / 10) : String(Math.round(n * 18));
}

/** 灯油の既定の単価（18L・円）。都道府県を選んでいればその県、なければ全国平均 */
export function defaultKerosene18L(pref: string | null): number {
  if (pref) {
    const p = KEROSENE_BY_PREF.find((x) => x.pref === pref);
    if (p) return p.yen18L;
  }
  return FUEL_PRICES.kerosene18L;
}

/** ガスの消費量（kW）を㎥/h に：kW × 3.6 ÷ 発熱量（MJ/㎥） */
export function gasM3PerHour(kw: number, mjPerM3: number): number {
  if (!(mjPerM3 > 0)) return 0;
  return (Math.max(0, kw) * MJ_PER_KWH) / mjPerM3;
}

/**
 * エアコンの消費電力の目安（W）＝ 暖房能力（kW）÷ COP × 1000。
 * APF（通年エネルギー消費効率）を COP の代わりに使う。**目安**で、外気温が下がると COP が下がり、
 * 霜取り運転でも電気を使うので、寒冷地ではこの目安より多くなる（仕様「計算の約束」6）
 */
export function airconWattEstimate(capacityKw: number, apf: number): number | null {
  if (!(capacityKw > 0) || !(apf > 0)) return null;
  return (capacityKw / apf) * 1000;
}

/** その行の計算に要る単価 */
export function requiredPrices(row: HeaterRow): PriceKey[] {
  switch (row.kind) {
    case 'kerosene':
      return row.watt > 0 ? ['kerosenePerLiter', 'electricity'] : ['kerosenePerLiter'];
    case 'gas': {
      const fuel: PriceKey = row.gasType === 'lpg' ? 'lpg' : 'cityGas';
      return row.watt > 0 ? [fuel, 'electricity'] : [fuel];
    }
    default:
      return ['electricity'];
  }
}

/** 値引きの単価（使用月）。電気（低圧）と都市ガスだけ。LP ガス・灯油は対象外 */
function cityGasAfterShien(price: number, usageMonth: string | null): number {
  const d = usageMonth ? discountFor(usageMonth) : null;
  if (!d) return price;
  return Math.max(0, Math.round((price - d.cityGas) * 1000) / 1000);
}

function electricityAfter(price: number, usageMonth: string | null): number {
  return usageMonth ? unitPriceAfterShien(price, usageMonth) : price;
}

function hourlyCost(row: HeaterRow, prices: Prices, usageMonth: string | null): { cost: HourlyCost; m3?: number } {
  const elecPrice = electricityAfter(prices.electricity ?? 0, usageMonth);
  const electricity = (Math.max(0, row.watt) / 1000) * elecPrice;
  let fuel = 0;
  let m3: number | undefined;
  if (row.kind === 'kerosene') {
    // 灯油は激変緩和措置が店頭価格に入っているので、ここで値引きしない（仕様「計算の約束」4）
    fuel = Math.max(0, row.litersPerHour ?? 0) * (prices.kerosenePerLiter ?? 0);
  } else if (row.kind === 'gas') {
    const lpg = row.gasType === 'lpg';
    m3 = gasM3PerHour(row.gasKw ?? 0, lpg ? prices.lpgMj : prices.cityGasMj);
    const unit = lpg ? (prices.lpg ?? 0) : cityGasAfterShien(prices.cityGas ?? 0, usageMonth);
    fuel = m3 * unit;
  }
  return { cost: { fuel, electricity, total: fuel + electricity }, m3 };
}

/** その行が支援の対象か（使用月が支援の月で、電気か都市ガスを使う行） */
function shienStatus(row: HeaterRow, usageMonth: string | null): 'discounted' | 'none-month' | 'not-covered' {
  const hasDiscount = usageMonth !== null && discountFor(usageMonth) !== null;
  if (row.kind === 'kerosene' || (row.kind === 'gas' && row.gasType === 'lpg')) {
    // 燃料は対象外（灯油は店頭価格に織り込み済み、LP ガスは国の支援の対象外）。送風の電気代には値引きが乗る
    return 'not-covered';
  }
  return hasDiscount ? 'discounted' : 'none-month';
}

/** 1 台分の計算。単価が足りなければ ok: false（0 円として扱わない） */
export function calcRow(row: HeaterRow, prices: Prices, usage: Usage): RowResult {
  const missing = requiredPrices(row).filter((k) => prices[k] === null || !Number.isFinite(prices[k] as number));
  if (missing.length > 0) return { ok: false, missing };

  const hours = Math.max(0, usage.hoursPerDay);
  const days = Math.max(0, usage.daysPerMonth);
  const base = hourlyCost(row, prices, null);
  const after = hourlyCost(row, prices, usage.usageMonth);

  // 丸めは最後に一度だけ。月の額は 1 時間の額（丸める前）× 時間 × 日数（仕様「計算の約束」7）
  const perMonth = Math.round(base.cost.total * hours * days);
  const perMonthAfter = Math.round(after.cost.total * hours * days);
  return {
    ok: true,
    hourly: base.cost,
    hourlyAfter: after.cost,
    m3PerHour: base.m3,
    perHour: Math.round(base.cost.total),
    perDay: Math.round(base.cost.total * hours),
    perMonth,
    perMonthAfter,
    discountMonth: perMonth - perMonthAfter,
    shien: shienStatus(row, usage.usageMonth),
    fuelMonthAfter: Math.round(after.cost.fuel * hours * days),
    electricityMonthAfter: Math.round(after.cost.electricity * hours * days),
  };
}

export interface Ranking {
  /** いちばん安い行の番号（同額なら複数）。比べられる行が 2 つ未満なら空 */
  cheapest: number[];
  /** 各行の「いちばん安い行より月◯円高い」（比べられない行・いちばん安い行は null） */
  moreThanCheapest: (number | null)[];
  /** いちばん安い行が、2 番目より月◯円安いか（同額・比べられないときは null） */
  cheapestSaves: number | null;
}

/**
 * いちばん安い行（値引き後の 1 か月の額で比べる）。単価が空の行は判定から外す。
 * 行が 1 つ（比べられる行が 1 つ）なら印は出さない（仕様「計算の約束」8・10）
 */
export function rankRows(results: RowResult[]): Ranking {
  const ok = results
    .map((r, i) => ({ r, i }))
    .filter((x): x is { r: Extract<RowResult, { ok: true }>; i: number } => x.r.ok);
  if (ok.length < 2) {
    return { cheapest: [], moreThanCheapest: results.map(() => null), cheapestSaves: null };
  }
  const min = Math.min(...ok.map((x) => x.r.perMonthAfter));
  const cheapest = ok.filter((x) => x.r.perMonthAfter === min).map((x) => x.i);
  const others = ok.filter((x) => x.r.perMonthAfter !== min);
  const second = others.length > 0 ? Math.min(...others.map((x) => x.r.perMonthAfter)) : null;
  return {
    cheapest,
    moreThanCheapest: results.map((r, i) => (r.ok && !cheapest.includes(i) ? r.perMonthAfter - min : null)),
    cheapestSaves: second === null ? null : second - min,
  };
}

// ------------------------------------------------------------
// 同じ熱で比べる（参考の表）
// ------------------------------------------------------------

export interface HeatUnitRow {
  label: string;
  formula: string;
  premise: string;
  /** 熱 1 kWh あたりの額（円・丸める前） */
  yenPerKwhHeat: number;
}

/**
 * 熱 1 kWh（3.6 MJ）を作るのにかかる額。単価のない燃料の行・COP が空のエアコンの行は出さない。
 * 燃焼器具の効率（排気で逃げる熱）は入れない（仕様「同じ熱で比べる」）。値引きは使用月で引く
 */
export function heatUnitTable(prices: Prices, usageMonth: string | null, cop: number | null): HeatUnitRow[] {
  const rows: HeatUnitRow[] = [];
  if (prices.kerosenePerLiter !== null) {
    rows.push({
      label: '灯油',
      formula: `3.6 ÷ ${KEROSENE_MJ_PER_L} × 円/L`,
      premise: `灯油の標準発熱量 ${KEROSENE_MJ_PER_L} MJ/L`,
      yenPerKwhHeat: (MJ_PER_KWH / KEROSENE_MJ_PER_L) * prices.kerosenePerLiter,
    });
  }
  if (prices.cityGas !== null && prices.cityGasMj > 0) {
    rows.push({
      label: '都市ガス',
      formula: `3.6 ÷ ${prices.cityGasMj} × 円/㎥`,
      premise: `発熱量 ${prices.cityGasMj} MJ/㎥（13A は 45）`,
      yenPerKwhHeat: (MJ_PER_KWH / prices.cityGasMj) * cityGasAfterShien(prices.cityGas, usageMonth),
    });
  }
  if (prices.lpg !== null && prices.lpgMj > 0) {
    rows.push({
      label: 'LP ガス',
      formula: `3.6 ÷ ${prices.lpgMj} × 円/㎥`,
      premise: `発熱量 ${prices.lpgMj} MJ/㎥`,
      yenPerKwhHeat: (MJ_PER_KWH / prices.lpgMj) * prices.lpg,
    });
  }
  if (prices.electricity !== null) {
    const e = electricityAfter(prices.electricity, usageMonth);
    rows.push({
      label: '電気（ヒーター）',
      formula: '1 × 円/kWh',
      premise: '電気を熱にそのまま変える',
      yenPerKwhHeat: e,
    });
    if (cop !== null && cop > 0) {
      rows.push({
        label: '電気（エアコン）',
        formula: `1 ÷ ${cop} × 円/kWh`,
        premise: `COP ${cop}（外気温が下がると小さくなる）`,
        yenPerKwhHeat: e / cop,
      });
    }
  }
  return rows;
}

// ------------------------------------------------------------
// 使用月（開いた日で決まる。denki-gas-shien.ts の判定をそのまま使う）
// ------------------------------------------------------------

/**
 * 使用月のボタン（支援の最初の月〜最後の月の翌月。いまは 2026-12〜2027-03）。
 * 開いた日が SHIEN_ENDED_FROM 以降（ended / archived）なら出さない
 */
export function heaterUsageMonthOptions(date: Date | string): string[] {
  if (shienPhase(date) !== 'active') return [];
  const first = SHIEN_PERIODS[0].usageMonth;
  return usageMonthOptions().filter((m) => m >= first);
}

/** 使用月の既定。開いた日の月（11 月以前なら支援の最初の月）。ボタンを出さない時期は null */
export function heaterDefaultUsageMonth(date: Date | string): string | null {
  const options = heaterUsageMonthOptions(date);
  if (options.length === 0) return null;
  const m = defaultUsageMonth(date);
  if (options.includes(m)) return m;
  return options[0];
}

// ------------------------------------------------------------
// 単価の日付（結果の下に必ず出す。仕様「計算の約束」9）
// ------------------------------------------------------------

export function priceDateNotes(opts: { pref: string | null; keroseneIsDefault: boolean; electricityIsDefault: boolean }): string[] {
  const notes: string[] = [];
  const where = opts.pref ? `${opts.pref}の` : '全国平均の';
  notes.push(
    opts.keroseneIsDefault
      ? `灯油：${formatDateJa(FUEL_PRICES.asOf)}調査の${where}店頭価格（${FUEL_PRICES.source}）。激変緩和措置の値引きは店頭価格に入っています`
      : '灯油：入力した単価',
  );
  notes.push(
    opts.electricityIsDefault
      ? `電気：目安単価 ${DEFAULT_UNIT_PRICE} 円/kWh（全国家庭電気製品公正取引協議会、2022年7月改定）`
      : '電気：入力した単価',
  );
  notes.push(`電気・ガス料金支援の値引き単価：${formatDateJa(SHIEN_CHECKED_ON)}に資源エネルギー庁の公式ページで確認`);
  return notes;
}

/** asOf から today までの日数が STALE_PRICE_DAYS を超えたか */
export function isPriceStale(asOf: string, today: Date | string): boolean {
  const t = typeof today === 'string' ? Date.parse(`${today.slice(0, 10)}T00:00:00Z`) : Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const a = Date.parse(`${asOf}T00:00:00Z`);
  return (t - a) / 86_400_000 > STALE_PRICE_DAYS;
}

// ------------------------------------------------------------
// 入力欄の読み取り
// ------------------------------------------------------------

/** 単価の欄：空欄（または数として読めない・負）は null。0 は 0 円として受ける */
export function parsePrice(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 数の欄：空欄・不正は 0 */
export function parseAmount(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 1,234 の形 */
export function formatYen(yen: number): string {
  return Math.round(yen).toLocaleString('ja-JP');
}

/** 小数を桁を決めて（余計な 0 を付けない） */
export function formatNum(n: number, digits = 1): string {
  const p = 10 ** digits;
  return (Math.round(n * p) / p).toLocaleString('ja-JP', { maximumFractionDigits: digits });
}
