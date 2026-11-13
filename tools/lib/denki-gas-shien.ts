/**
 * 電気・ガス料金支援（政府の値引き）の表と、使用月から値引きを引く計算
 *
 * 仕様: docs/features/aircon-denkidai-fuyu-hojo.md
 *
 * - 申請は不要。電気・都市ガスの小売事業者が、使用量に応じて毎月の料金から値引きする
 * - 「12月使用分」は原則として、12月中の検針日から1月中の検針日までの使用分。
 *   **請求書（検針票）では使用月の翌月に載る**ので、使用月と請求月を取り違えないこと
 * - LP ガス（プロパン）は対象外。高圧（企業向け）の単価は表にだけ持ち、計算には使わない
 *
 * 【データ更新箇所】支援が延長・再開されたら SHIEN_PERIODS に1行足し、
 * SHIEN_CHECKED_ON を公式ページで確かめた日に、境目の日付（SHIEN_ENDED_FROM・
 * SHIEN_ARCHIVED_FROM）を新しい期間に合わせて書き換える。
 * ビルドで固まる文（page.tsx の metadata・FAQ）は期間を書いた言い回しなので、
 * 境目を過ぎたら tools を再リリースして差し替える（仕様書 D）
 */

/** 出典：経済産業省 資源エネルギー庁「電気・ガス料金支援」 */
export const SHIEN_SOURCE_URL = 'https://denkigas-gekihenkanwa.go.jp/';

/** 上の公式ページで単価を確かめた日 */
export const SHIEN_CHECKED_ON = '2026-11-13';

export interface ShienPeriod {
  /** 使用月（YYYY-MM） */
  usageMonth: string;
  /** 電気・低圧（一般家庭）の値引き単価（円/kWh） */
  lowVoltageYenPerKwh: number;
  /** 電気・高圧（企業）の値引き単価（円/kWh）。表に載せるだけで計算には使わない */
  highVoltageYenPerKwh: number;
  /** 都市ガスの値引き単価（円/㎥。家庭・年間契約量1,000万㎥未満の企業等） */
  cityGasYenPerM3: number;
}

/** 値引きの単価（使用月ごと）。資源エネルギー庁の公式ページ（2026-11-13 確認） */
export const SHIEN_PERIODS: readonly ShienPeriod[] = [
  { usageMonth: '2026-12', lowVoltageYenPerKwh: 1.0, highVoltageYenPerKwh: 0.5, cityGasYenPerM3: 4.0 },
  { usageMonth: '2027-01', lowVoltageYenPerKwh: 4.5, highVoltageYenPerKwh: 2.3, cityGasYenPerM3: 18.0 },
  { usageMonth: '2027-02', lowVoltageYenPerKwh: 4.5, highVoltageYenPerKwh: 2.3, cityGasYenPerM3: 18.0 },
];

/**
 * この日から「終了した」言い回しに変える（最後の使用月の翌月1日）。
 * 最後の使用月の分は翌月以降の請求に載るので、しばらくは「請求書には載ることがある」と添える
 */
export const SHIEN_ENDED_FROM = '2027-03-01';

/** この日から支援の節を畳む（過去の制度として FAQ 1問だけ残す） */
export const SHIEN_ARCHIVED_FROM = '2027-05-01';

/** 支援の出し方の段階 */
export type ShienPhase = 'active' | 'ended' | 'archived';

/** 日付（Date か YYYY-MM-DD）を YYYY-MM-DD にする。Date はその環境の現地時刻で読む */
function toIsoDate(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 日付から YYYY-MM（その日の使用月） */
export function toYearMonth(date: Date | string): string {
  return toIsoDate(date).slice(0, 7);
}

/** YYYY-MM に n か月足す（負も可） */
export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** YYYY-MM を「2027年1月」にする */
export function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${y}年${m}月`;
}

/** その使用月の値引き単価。支援の月でなければ null */
export function discountFor(usageMonth: string): { lowVoltage: number; cityGas: number } | null {
  const p = SHIEN_PERIODS.find((s) => s.usageMonth === usageMonth);
  return p ? { lowVoltage: p.lowVoltageYenPerKwh, cityGas: p.cityGasYenPerM3 } : null;
}

/**
 * その使用月の値引きが載る請求（検針票）の月。原則として使用月の翌月。
 * 検針日によっては1か月ずれることがあるので、表示では必ずその旨を添える
 */
export function billingMonthFor(usageMonth: string): string {
  return addMonths(usageMonth, 1);
}

/** 請求月から、その請求に載る値引きの使用月（billingMonthFor の逆） */
export function usageMonthForBilling(billingMonth: string): string {
  return addMonths(billingMonth, -1);
}

/** 電気（低圧）の値引き額（円）。使用量 kWh × 値引き単価。支援の月でなければ 0 */
export function electricityDiscountYen(kwh: number, usageMonth: string): number {
  const d = discountFor(usageMonth);
  if (!d) return 0;
  // 4.5 × 260 のような小数の掛け算を、円の位で誤差なく出す（0.1円単位の単価なので10倍して整数で掛ける）
  return (Math.round(Math.max(0, kwh) * 10) * Math.round(d.lowVoltage * 10)) / 100;
}

/** 値引き後の単価（円/kWh）。入力単価 − 値引き単価（0 未満にはしない）。支援の月でなければ入力単価のまま */
export function unitPriceAfterShien(unitPrice: number, usageMonth: string): number {
  const d = discountFor(usageMonth);
  if (!d) return unitPrice;
  return Math.max(0, Math.round((unitPrice - d.lowVoltage) * 1000) / 1000);
}

/**
 * 開いた日の段階。日付を差し込んで使う（テストで今日の日付に依らないため）
 * - 〜2027-02-28：active（値引きの期間中）
 * - 2027-03-01〜04-30：ended（2027年2月使用分で終了。3〜4月の請求書まで値引きが載ることがある）
 * - 2027-05-01〜：archived（節を畳む）
 */
export function shienPhase(date: Date | string): ShienPhase {
  const iso = toIsoDate(date);
  if (iso >= SHIEN_ARCHIVED_FROM) return 'archived';
  if (iso >= SHIEN_ENDED_FROM) return 'ended';
  return 'active';
}

/** 使用月の選択肢：支援の月の前後1か月まで（2026-11〜2027-03）。期間の外の月は「値引きなし」の確認用 */
export function usageMonthOptions(): string[] {
  const first = SHIEN_PERIODS[0].usageMonth;
  const last = SHIEN_PERIODS[SHIEN_PERIODS.length - 1].usageMonth;
  const out: string[] = [];
  for (let m = addMonths(first, -1); m <= addMonths(last, 1); m = addMonths(m, 1)) out.push(m);
  return out;
}

/** 選択肢に無い月のときの値（「上記以外の月」＝値引きなし） */
export const OTHER_MONTH = 'other';

/** 開いた日の使用月の既定。選択肢に無ければ OTHER_MONTH */
export function defaultUsageMonth(date: Date | string): string {
  const ym = toYearMonth(date);
  return usageMonthOptions().includes(ym) ? ym : OTHER_MONTH;
}

/** 請求月の選択肢（使用月の選択肢をひと月ずらしたもの） */
export function billingMonthOptions(): string[] {
  return usageMonthOptions().map(billingMonthFor);
}

/** 開いた日の請求月の既定。選択肢に無ければ OTHER_MONTH */
export function defaultBillingMonth(date: Date | string): string {
  const ym = toYearMonth(date);
  return billingMonthOptions().includes(ym) ? ym : OTHER_MONTH;
}

/** 期間を書いた言い回し（ビルドで固まる文に使う。「現在」「今月」と書かない） */
export function shienPeriodLabel(): string {
  const first = SHIEN_PERIODS[0].usageMonth;
  const last = SHIEN_PERIODS[SHIEN_PERIODS.length - 1].usageMonth;
  return `${formatYearMonth(first)}〜${formatYearMonth(last)}使用分`;
}
