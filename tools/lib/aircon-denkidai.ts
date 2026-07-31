/**
 * エアコン電気代 計算ロジック
 *
 * 電気代（円） = 消費電力(W) ÷ 1000 × 使用時間(h) × 電気料金単価(円/kWh)
 *
 * - 電気料金単価のデフォルト 31円/kWh は、全国家庭電気製品公正取引協議会が定める
 *   「電力料金目安単価」（2022年7月改定）にもとづく
 * - 畳数別の消費電力は、主要メーカーの冷房時の定格消費電力の目安
 *
 * 【データ更新箇所】目安単価が改定されたら DEFAULT_UNIT_PRICE を、
 * 機種の傾向が変わったら TATAMI_PRESETS を更新する
 */

/** 電力料金目安単価（円/kWh・全国家庭電気製品公正取引協議会） */
export const DEFAULT_UNIT_PRICE = 31;

/** 畳数別の消費電力プリセット（冷房時の目安・W） */
export const TATAMI_PRESETS: ReadonlyArray<{ tatami: number; watt: number }> = [
  { tatami: 6, watt: 440 },
  { tatami: 8, watt: 545 },
  { tatami: 10, watt: 590 },
  { tatami: 14, watt: 800 },
  { tatami: 18, watt: 1100 },
];

export interface AirconInput {
  /** 消費電力（W） */
  watt: number;
  /** 1日の使用時間（h） */
  hoursPerDay: number;
  /** 電気料金単価（円/kWh） */
  unitPrice: number;
  /** 月の使用日数（日） */
  daysPerMonth: number;
}

export interface AirconResult {
  /** 1時間あたりの電気代（円） */
  perHour: number;
  /** 1日あたりの電気代（円） */
  perDay: number;
  /** 1ヶ月あたりの電気代（円） */
  perMonth: number;
}

/**
 * エアコンの電気代を計算する（負の入力は0として扱う）
 * 戻り値は丸めていない生の値。表示側で桁を整えること。
 */
export function calcAirconCost(input: AirconInput): AirconResult {
  const watt = Math.max(0, input.watt);
  const hours = Math.max(0, input.hoursPerDay);
  const price = Math.max(0, input.unitPrice);
  const days = Math.max(0, input.daysPerMonth);

  const perHour = (watt / 1000) * price;
  const perDay = perHour * hours;
  const perMonth = perDay * days;

  return { perHour, perDay, perMonth };
}
