/**
 * 通勤手当 非課税限度額チェッカーの計算ロジック（純関数のみ）。
 *
 * 仕様: docs/features/tsukin-teate-hikazei.md
 *
 * 根拠:
 * - 所得税法 9条1項5号（通勤手当のうち通常必要と認められる部分は非課税）
 * - 所得税法施行令 20条の2（令和8年度改正。交通用具の距離区分・駐車場等の加算）
 * - 国税庁「通勤手当の非課税限度額の改正に関するＱ＆Ａ」（令和8年4月）
 *   https://www.nta.go.jp/users/gensen/2026tsukin/pdf/01.pdf
 *   Q1-1 の表②（距離区分）・Q2-1〜Q2-4（対象の駐車場等）・Q3-1〜Q3-4（計算例 ケースA〜E）・
 *   Q4-2（会社が駐車場を契約して負担している場合）
 *
 * 改正後の限度額は**令和8年4月1日以後に支払われるべき通勤手当**に適用される（Q1-2）。
 * 3月以前の分と、3月以前の分の差額を4月以後に追加支給するものは改正前の表で計算する。
 */

/** 通勤の手段 */
export type CommuteMode =
  /** マイカー・バイク・自転車などの交通用具だけ */
  | 'vehicle'
  /** 電車・バスなどの交通機関（または有料道路）だけ */
  | 'transit'
  /** 交通機関（または有料道路）と交通用具の併用 */
  | 'both';

/** どちらの表で計算するか */
export type Period =
  /** 令和8年4月1日以後に支払われるべき通勤手当（改正後） */
  | 'from-2026-04'
  /** 令和8年3月31日以前（改正前） */
  | 'before-2026-04';

/** 距離区分1行（片道 `fromKm` km 以上 `toKm` km 未満。`toKm` が null なら上限なし） */
export interface DistanceBand {
  fromKm: number;
  toKm: number | null;
  /** 1か月当たりの非課税限度額（円） */
  limit: number;
}

// ─────────────────────────────────────────────────────────────
// 【データ更新箇所】非課税限度額の表と上限。改正があったらここだけ直す
// ─────────────────────────────────────────────────────────────

/** 最後に国税庁のページと突き合わせた日 */
export const DATA_CHECKED_AT = '2026-09-27';

/** 改正後の表が適用される最初の日（支払われるべき日） */
export const REFORM_EFFECTIVE_FROM = '2026-04-01';

/**
 * 交通用具の距離区分（改正後。Q&A Q1-1 の表②）。
 * 片道2km未満は全額課税なので表に行を持たない（`distanceLimit()` が 0 を返す）。
 * **区分の境目は「以上」側に入る**（10.0km は 7,300円）
 */
export const DISTANCE_BANDS: readonly DistanceBand[] = [
  { fromKm: 2, toKm: 10, limit: 4_200 },
  { fromKm: 10, toKm: 15, limit: 7_300 },
  { fromKm: 15, toKm: 25, limit: 13_500 },
  { fromKm: 25, toKm: 35, limit: 19_700 },
  { fromKm: 35, toKm: 45, limit: 25_900 },
  { fromKm: 45, toKm: 55, limit: 32_300 },
  { fromKm: 55, toKm: 65, limit: 38_700 },
  { fromKm: 65, toKm: 75, limit: 45_700 },
  { fromKm: 75, toKm: 85, limit: 52_700 },
  { fromKm: 85, toKm: 95, limit: 59_600 },
  { fromKm: 95, toKm: null, limit: 66_400 },
];

/** 交通用具の距離区分（改正前。55km以上は一律 38,700円） */
export const DISTANCE_BANDS_BEFORE_2026_04: readonly DistanceBand[] = [
  { fromKm: 2, toKm: 10, limit: 4_200 },
  { fromKm: 10, toKm: 15, limit: 7_300 },
  { fromKm: 15, toKm: 25, limit: 13_500 },
  { fromKm: 25, toKm: 35, limit: 19_700 },
  { fromKm: 35, toKm: 45, limit: 25_900 },
  { fromKm: 45, toKm: 55, limit: 32_300 },
  { fromKm: 55, toKm: null, limit: 38_700 },
];

/** 交通用具を使う距離がこれ未満なら全額課税（距離区分も駐車場の加算も無い） */
export const MIN_DISTANCE_KM = 2;

/** 駐車場等の料金相当額の加算の上限（1か月当たり。複数の駐車場等は合計に対して） */
export const PARKING_CAP = 5_000;

/** 交通機関を使う場合（のみ・併用）の非課税限度額の上限（1か月当たり） */
export const TOTAL_CAP = 150_000;

// ─────────────────────────────────────────────────────────────

/** 距離区分の表を返す */
export function bandsFor(period: Period): readonly DistanceBand[] {
  return period === 'from-2026-04' ? DISTANCE_BANDS : DISTANCE_BANDS_BEFORE_2026_04;
}

/** 片道距離の区分を引く。2km未満（または不正な値）は undefined */
export function distanceBandFor(km: number, period: Period): DistanceBand | undefined {
  if (!Number.isFinite(km) || km < MIN_DISTANCE_KM) return undefined;
  return bandsFor(period).find((b) => km >= b.fromKm && (b.toKm === null || km < b.toKm));
}

/** 片道距離に応じた1か月当たりの非課税限度額（2km未満は 0） */
export function distanceLimit(km: number, period: Period): number {
  return distanceBandFor(km, period)?.limit ?? 0;
}

/** 区分の見出し（'45km以上55km未満' など） */
export function bandLabel(band: DistanceBand): string {
  return band.toKm === null ? `${band.fromKm}km以上` : `${band.fromKm}km以上${band.toKm}km未満`;
}

/**
 * 駐車場等の料金の決まり方（Q&A Q3-3 の (1)〜(4)）。
 *
 * - `months`：月単位（(1)）。`months` か月で `amount` 円。1か月ぶんを払っているなら 1
 * - `years`：年単位（(2)）。`years` 年で `amount` 円
 * - `per-use`：利用の都度（(3)ロ・ハ）。1回 `amount` 円 × 1か月の利用回数。
 *   回数券なら 1回あたり（1,200円 ÷ 11枚）を入れる。(3)イの「実際に払った1か月の合計」は
 *   `months`（1か月で合計額）で表せる
 * - `days`：それ以外（(4)）。`days` 日で `amount` 円 → × 365 ÷ 日数 ÷ 12
 */
export type ParkingFee =
  | { unit: 'months'; amount: number; months: number }
  | { unit: 'years'; amount: number; years: number }
  | { unit: 'per-use'; amount: number; usesPerMonth: number }
  | { unit: 'days'; amount: number; days: number };

/**
 * 1か月当たりの駐車場等の料金相当額（Q&A Q3-3）。消費税込みの額で計算する。
 *
 * **1円未満は切り上げる。** Q&A で端数処理が書かれているのは回数券の例（(3)ロ。
 * 1,200円 ÷ 11枚 × 20日 = 2,181.8… → 2,182円）だけで、ほかの例はすべて割り切れる。
 * 割り切れない月単位・年単位の料金も同じく切り上げて揃えている（画面にその旨を書く）。
 * 金額や期間が 0 以下・不正な値なら 0。
 */
export function monthlyParkingFee(fee: ParkingFee): number {
  const amount = fee.amount;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  let monthly: number;
  switch (fee.unit) {
    case 'months':
      if (!(fee.months > 0)) return 0;
      monthly = amount / fee.months;
      break;
    case 'years':
      if (!(fee.years > 0)) return 0;
      monthly = amount / (12 * fee.years);
      break;
    case 'per-use':
      if (!(fee.usesPerMonth > 0)) return 0;
      monthly = amount * fee.usesPerMonth;
      break;
    case 'days':
      if (!(fee.days > 0)) return 0;
      monthly = (amount * 365) / fee.days / 12;
      break;
  }
  // 1,200 / 11 * 20 のような割り算の誤差で 1円余計に切り上げないよう、先に銭で丸める
  return Math.ceil(Math.round(monthly * 100) / 100);
}

/** 駐車場の加算が 0 になった理由 */
export type ParkingExclusion =
  /** 駐車場の入力が無い・0円 */
  | 'none'
  /** 交通機関のみ（交通用具を使っていない） */
  | 'transit-only'
  /** 交通用具の片道距離が2km未満（Q3-4） */
  | 'under-2km'
  /** 勤務先・駅などの周辺ではない（自宅付近など。Q2-1・Q2-4） */
  | 'not-eligible-location'
  /** 改正前の表で計算している（加算そのものが無い） */
  | 'before-reform';

export interface TsukinTeateInput {
  mode: CommuteMode;
  /** 交通用具を使う片道の通勤距離（km）。交通機関のみなら使わない */
  distanceKm: number;
  /** 勤務先から支給されている通勤手当の月額（会社が直接払っている駐車場代も含める。Q4-2） */
  allowance: number;
  /** 1か月当たりの合理的な運賃等（定期代・有料道路の料金）。交通用具のみなら使わない */
  fare: number;
  /** 駐車場等。無ければ省略 */
  parking?: {
    fee: ParkingFee;
    /** 勤務先か、通勤で使う駅・停留所・空港などの周辺にあるか（自宅付近は false） */
    nearWorkOrStation: boolean;
  };
  period: Period;
}

export interface TsukinTeateResult {
  /** 距離区分（2km未満・交通機関のみなら undefined） */
  band: DistanceBand | undefined;
  /** 距離区分の限度額（交通機関のみなら 0） */
  distanceLimit: number;
  /** 駐車場等の料金の1か月当たりの換算額（加算の上限前） */
  parkingMonthly: number;
  /** 限度額に加える駐車場等の額（上限 5,000円） */
  parkingAddition: number;
  /** 加算が 0 になった理由（加算があれば undefined） */
  parkingExclusion: ParkingExclusion | undefined;
  /** 加算が上限 5,000円で頭打ちになったか */
  parkingCapped: boolean;
  /** 限度額に入れる運賃等（交通用具のみなら 0） */
  fare: number;
  /** 頭打ち前の合計 */
  sumBeforeCap: number;
  /** 150,000円で頭打ちになったか */
  totalCapped: boolean;
  /** 1か月当たりの非課税限度額 */
  limit: number;
  /** 非課税になる額（月） */
  nonTaxableMonthly: number;
  /** 課税される額（月）。給与収入に入る */
  taxableMonthly: number;
  /** 毎月同額として12か月分 */
  taxableAnnual: number;
}

const nonNegative = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * 通勤手当の非課税限度額と課税される額を出す。
 *
 * ```
 * 交通用具のみ: 距離区分 + 駐車場（上限 5,000）
 * 交通機関のみ: min(運賃, 150,000)
 * 併用:         min(運賃 + 距離区分 + 駐車場, 150,000)
 * 課税される額 = max(0, 支給額 − 非課税限度額)
 * ```
 *
 * 交通用具のみのときは 150,000円の頭打ちが無い（表②③に最高限度の記載が無い。
 * 最大でも 66,400 + 5,000 なので実際に効くことはない）。
 * 併用で交通用具の区間が片道2km未満の人は、表の⑤⑥から除かれ①（運賃だけ）で判定される。
 * 距離区分 0・加算 0 になるので、同じ式で結果が一致する。
 */
export function calcTsukinTeate(input: TsukinTeateInput): TsukinTeateResult {
  const { mode, period } = input;
  const usesVehicle = mode !== 'transit';
  const usesTransit = mode !== 'vehicle';

  const band = usesVehicle ? distanceBandFor(input.distanceKm, period) : undefined;
  const dLimit = band?.limit ?? 0;

  const parkingMonthly = input.parking ? monthlyParkingFee(input.parking.fee) : 0;
  let parkingExclusion: ParkingExclusion | undefined;
  if (parkingMonthly <= 0) parkingExclusion = 'none';
  else if (!usesVehicle) parkingExclusion = 'transit-only';
  else if (period === 'before-2026-04') parkingExclusion = 'before-reform';
  else if (!band) parkingExclusion = 'under-2km';
  else if (!input.parking?.nearWorkOrStation) parkingExclusion = 'not-eligible-location';
  const parkingAddition = parkingExclusion ? 0 : Math.min(parkingMonthly, PARKING_CAP);
  const parkingCapped = !parkingExclusion && parkingMonthly > PARKING_CAP;

  const fare = usesTransit ? nonNegative(input.fare) : 0;
  const sumBeforeCap = fare + dLimit + parkingAddition;
  const totalCapped = usesTransit && sumBeforeCap > TOTAL_CAP;
  const limit = totalCapped ? TOTAL_CAP : sumBeforeCap;

  const allowance = nonNegative(input.allowance);
  const taxableMonthly = Math.max(0, allowance - limit);

  return {
    band,
    distanceLimit: dLimit,
    parkingMonthly,
    parkingAddition,
    parkingExclusion,
    parkingCapped,
    fare,
    sumBeforeCap,
    totalCapped,
    limit,
    nonTaxableMonthly: allowance - taxableMonthly,
    taxableMonthly,
    taxableAnnual: taxableMonthly * 12,
  };
}

/** 令和8年4月〜12月の月数（改正後の表で計算する令和8年分の月数） */
export const MONTHS_FROM_REFORM_IN_2026 = 9;

/** 駐車場の料金の単位の選択肢（画面の select と早見表で共用） */
export const PARKING_UNIT_LABELS: Record<ParkingFee['unit'], string> = {
  months: '月単位',
  years: '年単位',
  'per-use': '1回ごと',
  days: '日単位（週など）',
};
