/**
 * エアコン電気代 計算ロジック
 *
 * 電気代（円） = 消費電力(W) ÷ 1000 × 使用時間(h) × 電気料金単価(円/kWh)
 *
 * - 電気料金単価のデフォルト 31円/kWh は、全国家庭電気製品公正取引協議会が定める
 *   「電力料金目安単価」（2022年7月改定）にもとづく
 * - 畳数別の消費電力は、冷房は主要メーカーの冷房時の定格消費電力の目安（TATAMI_PRESETS）、
 *   暖房はダイキン工業の公式仕様表（Eシリーズ 2026年モデル）の暖房の定格消費電力（HEATING_PRESETS）
 * - 冬の電気・ガス料金支援（値引き）は lib/denki-gas-shien.ts
 *
 * 【データ更新箇所】目安単価が改定されたら DEFAULT_UNIT_PRICE を、
 * 機種の傾向が変わったら TATAMI_PRESETS / HEATING_PRESETS と HEATING_PRESETS_SOURCE を更新する
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

/** 運転の種類 */
export type AirconMode = 'cooling' | 'heating';

export const MODE_LABEL: Record<AirconMode, string> = { cooling: '冷房', heating: '暖房' };

/**
 * 畳数別の消費電力プリセット（暖房時・W）。
 * ダイキン工業 Eシリーズ 2026年モデルの仕様表の「暖房 消費電力」の定格値（カッコ内の範囲の最大を maxWatt に）。
 * 6〜10畳は単相100V、14畳・18畳は単相200V の機種（このシリーズに100Vの機種が無いため）。
 * 畳数はメーカーの「◯畳程度」（冷房と暖房で適用畳数がやや違うので、カタログの暖房の欄も見ること）
 */
export const HEATING_PRESETS: ReadonlyArray<{
  tatami: number;
  watt: number;
  maxWatt: number;
  model: string;
}> = [
  { tatami: 6, watt: 470, maxWatt: 1280, model: 'S226ATES' },
  { tatami: 8, watt: 635, maxWatt: 1290, model: 'S256ATES' },
  { tatami: 10, watt: 890, maxWatt: 1420, model: 'S286ATES' },
  { tatami: 14, watt: 1410, maxWatt: 3070, model: 'S406ATEP' },
  { tatami: 18, watt: 1880, maxWatt: 3220, model: 'S566ATEP' },
];

/** HEATING_PRESETS の出典（2026-11-13 確認） */
export const HEATING_PRESETS_SOURCE = {
  label: 'ダイキン工業「Eシリーズ 仕様」（2026年モデル）',
  url: 'https://www.ac.daikin.co.jp/kabekake/products/e_series/spec',
  checkedOn: '2026-11-13',
} as const;

/** 運転の種類ごとのプリセット */
export function presetsFor(mode: AirconMode): ReadonlyArray<{ tatami: number; watt: number }> {
  return mode === 'heating' ? HEATING_PRESETS : TATAMI_PRESETS;
}

/**
 * 開いた日の月から、冷房／暖房の既定を決める（11〜3月は暖房、それ以外は冷房）。
 * 静的書き出しなので、画面はまず日付に依らない既定で描き、マウント後にこれで差し替える
 */
export function defaultModeFor(date: Date): AirconMode {
  const m = date.getMonth() + 1;
  return m >= 11 || m <= 3 ? 'heating' : 'cooling';
}

/**
 * 設定温度を1℃控えめにしたときの年間の省エネ効果。
 * 出典：資源エネルギー庁「家庭の省エネ徹底ガイド 春夏秋冬」（2017）。
 * 2.2kW のエアコン・1日9時間の使用での年間の効果（冷房は外気温31℃のとき27℃→28℃、暖房は外気温6℃のとき21℃→20℃）。
 * 冷房と暖房で目安が違うので、%で一括りにしない（「1度で約10%」には一次の出典が無かったので使わない）
 */
export const SETTING_TEMP_SAVING: Record<AirconMode, { kwhPerYear: number; condition: string }> = {
  cooling: { kwhPerYear: 30.24, condition: '外気温31℃のとき、冷房の設定温度を27℃から28℃に' },
  heating: { kwhPerYear: 53.08, condition: '外気温6℃のとき、暖房の設定温度を21℃から20℃に' },
};

export const SETTING_TEMP_SAVING_SOURCE = '資源エネルギー庁「家庭の省エネ徹底ガイド 春夏秋冬」';

/** 設定温度1℃の年間の節約額（円。単価を掛けて四捨五入） */
export function settingTempSavingYen(mode: AirconMode, unitPrice: number = DEFAULT_UNIT_PRICE): number {
  return Math.round(SETTING_TEMP_SAVING[mode].kwhPerYear * unitPrice);
}

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
