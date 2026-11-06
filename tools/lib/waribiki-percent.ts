/**
 * 割引・パーセント計算のロジック
 *
 * 仕様: docs/features/waribiki-percent-keisan.md
 *
 * このツールの独自性は「端数処理を選ばせる」ところにある。
 * 切り捨て・四捨五入・切り上げは、店舗ごとに実運用が異なり、
 * どれで丸めたかで「レジと1円合わない」を生む。既定は四捨五入だが、
 * 選択と内訳表示があること自体が答えになる。
 *
 * 税抜入力で消費税を併記する場合、丸めは「割引後の本体価格」と
 * 「税込額」の2段階それぞれに、選択した同じ方式で1回ずつ掛ける。
 * 端数処理の方式（`Rounding`）は 1 か所で管理し、税率も定数1か所。
 *
 * 純関数のみで DOM/React には依存しない。入力に無効値が来たときは
 * `null` を返し、呼び出し側で「入れてください」の表示に落とす。
 */

/* ===================================================================
   消費税率は `lib/shohizei.ts` が持つ（このファイルは import するだけ）

   2027年4月から飲食料品が1%になる予定で、「税率は10%と8%の2つ」という
   前提が崩れる。税率の表を消費税計算機（`shohizei.ts`）に移し、
   ここはそこから引いている。**数字を直すときは `shohizei.ts` のほうを直す。**
   export 名は互換のためそのまま残してあるので、このツールの
   `Calculator.tsx` とテストは今までどおり動く。

   丸めの部品（`Rounding` / `ROUNDINGS` / `roundBy`）は `lib/rounding.ts` に
   分けてある（`shohizei.ts` との循環importを避けるため）。
   **既定の丸めだけはツールごとに違う**（下記 `DEFAULT_ROUNDING` 参照）。
   =================================================================== */
export {
  TAX_RATE_STANDARD,
  TAX_RATE_REDUCED,
  TAX_UPDATED_AT,
} from './shohizei';

import { TAX_RATE_REDUCED, TAX_RATE_STANDARD } from './shohizei';
import { ROUNDINGS, roundBy, type Rounding, type RoundingOption } from './rounding';

export { ROUNDINGS, roundBy };
export type { Rounding, RoundingOption };

/** セレクトに出す税率の選択肢 */
export interface TaxRateOption {
  id: TaxRateId;
  label: string;
  /** 小数（0.10 / 0.08） */
  rate: number;
  /** パーセント表記（画面出力用） */
  percentLabel: string;
}

export type TaxRateId = 'standard' | 'reduced';

export const TAX_RATES: TaxRateOption[] = [
  { id: 'standard', label: '10%（標準税率）', rate: TAX_RATE_STANDARD, percentLabel: '10%' },
  {
    id: 'reduced',
    // 軽減税率は対象品目（飲食料品等）が限られる。ラベルにそれを添えるのは
    // 「このツールでは対象かどうかを判定しない」と読み手に分からせるため
    label: '8%（軽減税率・飲食料品等）',
    rate: TAX_RATE_REDUCED,
    percentLabel: '8%',
  },
];

export function taxRate(id: TaxRateId): TaxRateOption {
  const found = TAX_RATES.find((r) => r.id === id);
  if (!found) throw new Error(`未知の税率IDです: ${id}`);
  return found;
}

/**
 * このツールの既定の丸めは**四捨五入**。
 *
 * 消費税計算機（`shohizei.ts` の `DEFAULT_TAX_ROUNDING` ＝ 切り捨て）とは
 * **わざと違う値にしてある**。割引は店頭表示の検算なので四捨五入が自然だが、
 * 消費税額の1円未満は実務で切り捨てがもっとも多い。
 * 同じ `roundBy()` を共有するからといって既定まで揃えないこと。
 */
export const DEFAULT_ROUNDING: Rounding = 'round';

/** 割引率の入力が使えるか（0以上100未満、または合計100未満で成り立つ範囲） */
export function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

/** 値段の入力が使えるか（0以上の有限数） */
export function isValidPrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0;
}

/**
 * 二重割引の合計割引率（%）。
 *
 * 「30%オフからさらに20%オフ」は 30 + 20 = 50%オフではなく、
 * 残る率どうしを掛けて 1 - 0.7 × 0.8 = 0.44 → 44%オフになる。
 * このツールの独自性の1つ（3方向計算・二重割引は業界標準装備）だが、
 * 計算ロジックとして押さえるべき数字。
 *
 * 空配列を渡した場合は 0（割り引かない）。
 */
export function effectiveRate(rates: number[]): number {
  if (rates.length === 0) return 0;
  const kept = rates.reduce((acc, r) => acc * (1 - r / 100), 1);
  return (1 - kept) * 100;
}

/** 割引モードの入力 */
export interface DiscountInput {
  /** 元の値段（円） */
  price: number;
  /**
   * 割引率（%）。1件で通常割引、2件以上で二重割引になる。
   * 各要素は 0〜100 の範囲。
   */
  rates: number[];
  /** 端数の丸め方 */
  rounding: Rounding;
  /**
   * 入力価格の税の扱い。
   * `inclusive`（既定）: 入力はすでに税込。答えもそのまま税込
   * `exclusive`: 入力は税抜。答えとして税抜と税込の両方を返す
   */
  taxMode?: TaxMode;
  /** 税抜モードのときに使う税率ID（既定は標準10%） */
  taxRateId?: TaxRateId;
}

export type TaxMode = 'inclusive' | 'exclusive';

export const DEFAULT_TAX_MODE: TaxMode = 'inclusive';

/** 割引モードの結果 */
export interface DiscountResult {
  /** 元の値段（入力そのまま） */
  price: number;
  /** 合計割引率（%、丸めない）。二重割引なら effectiveRate() の値 */
  effectiveRate: number;
  /**
   * 割引後の本体価格（円、丸めた整数）。
   * 税込モードなら税込のまま、税抜モードなら税抜。
   */
  discounted: number;
  /** 値引き額（円、`price - discounted`） */
  saved: number;
  /** 税抜モードのときに入る「割引後の税込額」（円、2段階目の丸めを1回掛けた整数） */
  discountedIncludingTax?: number;
  /** 税抜モードのときの税額（円、`discountedIncludingTax - discounted`） */
  tax?: number;
  /** 使った税率ID（税抜モードのとき） */
  taxRateId?: TaxRateId;
  /** 使った税の扱い（表示のため） */
  taxMode: TaxMode;
  /** 使った丸め方（内訳表示のため） */
  rounding: Rounding;
}

/**
 * 割引後の値段を計算する。
 *
 * 税込モード（既定）:
 *   discounted = round(price × (1 − 合計割引率 / 100))
 *   税は入力の中に含まれているとみなし、税額は出さない。
 *
 * 税抜モード:
 *   discounted = round(price × (1 − 合計割引率 / 100))  … 割引後の税抜
 *   discountedIncludingTax = round(discounted × (1 + 税率))
 *   tax = discountedIncludingTax − discounted
 *   税額は「discounted × 税率」を丸めたものと必ずしも一致しないが、
 *   「税込額 − 税抜額」で必ず整合するようにこう定義している
 *   （表示に出したときに 1円ずれないため）。
 */
export function applyDiscount(input: DiscountInput): DiscountResult | null {
  if (!isValidPrice(input.price)) return null;
  if (!input.rates.every(isValidRate)) return null;
  // 1e307 のような有限値でも ×100 で Infinity になり BigInt() が例外を投げる（画面ごと消える）
  if (!canScaleToHundredths(input.price)) return null;
  // 二重割引で 100% を素通しにする合理的なケースはないので、100は許容し、
  // 合計割引率が100を超える定義を出さないよう rates の各要素を上でクランプ済み。
  // 合計割引率（eff）は表示用。丸めの計算には使わない（浮動小数の誤差で
  // 1000円の80%オフが 199.99999999999997 → 切り捨て 199円 になるため）。
  // 割引後の額は分子・分母を整数のまま持って丸める（docs/features/kokai-tool-seikaku-2026-11-06.md A1）
  const eff = effectiveRate(input.rates);
  let numer = BigInt(toHundredths(input.price));
  let denom = 100n;
  for (const r of input.rates) {
    numer *= BigInt(10000 - toHundredths(r));
    denom *= 10000n;
  }
  const discounted = roundFraction(numer, denom, input.rounding);
  const saved = input.price - discounted;

  const taxMode: TaxMode = input.taxMode ?? DEFAULT_TAX_MODE;
  const base: DiscountResult = {
    price: input.price,
    effectiveRate: eff,
    discounted,
    saved,
    taxMode,
    rounding: input.rounding,
  };
  if (taxMode === 'inclusive') return base;

  const rateId: TaxRateId = input.taxRateId ?? 'standard';
  const rate = taxRate(rateId).rate;
  // 消費税計算機（shohizei.ts）と同じく discounted × (100 + 税率%) / 100 を整数で
  const ratePct = BigInt(Math.round(rate * 100));
  const includingTax = roundFraction(BigInt(discounted) * (100n + ratePct), 100n, input.rounding);
  return {
    ...base,
    discountedIncludingTax: includingTax,
    tax: includingTax - discounted,
    taxRateId: rateId,
  };
}

/** 割引率の逆算 */
export interface ReverseDiscountInput {
  /** 元の値段（円、0より大きい） */
  original: number;
  /** 売値（円、0以上） */
  sale: number;
}

export interface ReverseDiscountResult {
  /** 何%オフか（丸めない）。売値が元の値段より高いときは負の値 */
  rate: number;
  /** 値引き額（`original − sale`） */
  saved: number;
}

/**
 * 元の値段と売値から割引率を求める。
 *
 * 「50%オフ」と書かれた売値を検算するときに使う逆引き。
 * 元の値段が0のときは意味がない（何をかけても0）ので null を返す。
 * 売値が元の値段より高い場合は、rate が負（マークアップ）になる。
 */
export function reverseDiscount(input: ReverseDiscountInput): ReverseDiscountResult | null {
  if (!isValidPrice(input.original) || input.original === 0) return null;
  if (!isValidPrice(input.sale)) return null;
  const saved = input.original - input.sale;
  return { rate: (saved / input.original) * 100, saved };
}

/**
 * AのB%はいくら？（丸めない生の値）。
 * 呼び出し側で `roundBy` するかどうかを決める。
 */
export function percentOf(base: number, percent: number): number | null {
  if (!Number.isFinite(base) || !Number.isFinite(percent)) return null;
  return (base * percent) / 100;
}

/**
 * AのB%を、選んだ丸め方で整数にする。
 *
 * `roundBy(percentOf(a, b))` だと 375 × 18.4 / 100 が 68.99999999999999 になり、
 * 切り捨てで 68 と出る（正しくは 69）。A・B を 0.01 単位の整数にして
 * `numer = A100 × B100`・`denom = 1,000,000` を BigInt のまま丸める。
 * A・B は小数第2位まで（超える入力は画面側で `hasAtMostTwoDecimals` で弾く）。
 */
export function percentOfRounded(base: number, percent: number, rounding: Rounding): number | null {
  if (!canScaleToHundredths(base) || !canScaleToHundredths(percent)) return null;
  return roundFraction(
    BigInt(toHundredths(base)) * BigInt(toHundredths(percent)),
    1_000_000n,
    rounding,
  );
}

/**
 * AのB%の正確な値を、10進の文字列で返す（丸めない表示用）。
 * `68.99999999999999` のような二進小数の誤差を出さないため、分子・分母から起こす。
 * 375 の 18.4% → "69"、1200 の 8.5% → "102"、33 の 12.34% → "4.0722"。
 */
export function percentOfExact(base: number, percent: number): string | null {
  if (!canScaleToHundredths(base) || !canScaleToHundredths(percent)) return null;
  return fractionToDecimal(BigInt(toHundredths(base)) * BigInt(toHundredths(percent)), 6);
}

/* ===================================================================
   整数での丸め（A1：浮動小数の誤差で1円ずれないように）
   =================================================================== */

/**
 * 数値を 0.01 単位の整数に直す（12.34 → 1234）。
 * 小数第2位までの入力を前提にしている（超える入力は画面側で弾く）。
 */
export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

/**
 * `toHundredths` → `BigInt` に渡してよい値か（×100 しても有限か）。
 * `Number.isFinite` だけだと 1e307 が素通りし、×100 で Infinity になって BigInt() が RangeError を投げる。
 */
export function canScaleToHundredths(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(value * 100);
}

/**
 * 入力の文字列が小数第2位までか（`33.33` は true、`33.333` は false）。
 *
 * 判定は**文字列で**行う。`r * 100` が整数かを浮動小数で見ると、
 * それ自体が誤差でぶれる（例：`1.1 * 100` は 110.00000000000001）。
 * 空欄・数値でない文字列は true を返す（そちらは別の案内で扱う）。
 */
export function hasAtMostTwoDecimals(str: string): boolean {
  const t = str.trim();
  if (t === '') return true;
  const m = /^[+-]?(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m) {
    // 1e-3 のような指数表記。値で判定する（文字列が数字だけでないので例外的に）
    const v = Number(t);
    if (!Number.isFinite(v)) return true;
    return Number.isInteger(Number((v * 100).toPrecision(12)));
  }
  return (m[2] ?? '').length <= 2;
}

/** 小数第2位を超える率を入れたときの案内 */
export const TOO_MANY_DECIMALS_MESSAGE = '割引率は小数第2位まで入力してください（例：33.33）';

/**
 * 分数 numer / denom を、選んだ丸め方で整数にする（BigInt のまま）。
 * denom は正の数。負の numer も JavaScript の Math.floor / ceil / round と同じ向きに丸める。
 */
export function roundFraction(numer: bigint, denom: bigint, rounding: Rounding): number {
  if (denom <= 0n) throw new Error('分母は正の数にしてください');
  // BigInt の割り算は0方向への切り捨てなので、負の数は floor を自前で作る
  const floorDiv = (n: bigint, d: bigint): bigint => {
    const q = n / d;
    return n % d !== 0n && n < 0n ? q - 1n : q;
  };
  switch (rounding) {
    case 'floor':
      return Number(floorDiv(numer, denom));
    case 'ceil':
      return Number(-floorDiv(-numer, denom));
    case 'round':
      // floor((2·numer + denom) / (2·denom))。x.5 は上へ（Math.round と同じ）
      return Number(floorDiv(2n * numer + denom, 2n * denom));
  }
}

/** numer / 10^scale を10進の文字列にする（末尾の0は落とす） */
function fractionToDecimal(numer: bigint, scale: number): string {
  const neg = numer < 0n;
  const abs = neg ? -numer : numer;
  const unit = 10n ** BigInt(scale);
  const int = abs / unit;
  const frac = (abs % unit).toString().padStart(scale, '0').replace(/0+$/, '');
  const body = frac === '' ? int.toString() : `${int.toString()}.${frac}`;
  return neg && body !== '0' ? `-${body}` : body;
}

/**
 * AはBの何%？
 * B（whole）が 0 のときは定義できないので null を返す。
 */
export function percentRatio(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return (part / whole) * 100;
}

/**
 * from から to への変化率（%）。
 * from が 0 のときは分母が 0 になるので null を返す。
 * to が from より小さいときは負の値（減少）になる。
 */
export function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

/* ===================================================================
   早見表（このページ内の静的な表として置く）
   仕様書「やらないこと」より、%別・価格別の個別ページは作らない。
   表はページ内の1つに留め、`〇%オフ 早見表` 系のクエリで受ける。
   =================================================================== */

/** 早見表に並べる代表価格（円） */
export const LOOKUP_PRICES: number[] = [100, 500, 1000, 2000, 3000, 5000, 8000, 10000];

/** 早見表に並べる割引率（%） */
export const LOOKUP_RATES: number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90];

/** 早見表の1セル */
export interface LookupCell {
  /** 割引後の値段（円） */
  discounted: number;
  /** 値引き額（円） */
  saved: number;
}

/**
 * 早見表を作る。丸め方は既定（四捨五入）で作る。
 *
 * 表と計算機の答えを揃えるため、内部で `applyDiscount` を通す。
 * 手書きの表を持つと、税率や丸め方を直したときに片方だけ古いままになる。
 */
export function lookupTable(
  prices: number[] = LOOKUP_PRICES,
  rates: number[] = LOOKUP_RATES,
  rounding: Rounding = DEFAULT_ROUNDING,
): LookupCell[][] {
  return prices.map((price) =>
    rates.map((rate) => {
      const r = applyDiscount({ price, rates: [rate], rounding });
      if (r === null) throw new Error(`早見表に使えない組み合わせ: ${price}円 × ${rate}%`);
      return { discounted: r.discounted, saved: r.saved };
    }),
  );
}

/** 早見表の実体（既定の丸め＝四捨五入で1回だけ計算する） */
export const LOOKUP_TABLE: LookupCell[][] = lookupTable();

/* ===================================================================
   表示ヘルパ
   =================================================================== */

/** 円表示（3桁区切り＋「円」） */
export function formatYen(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

/**
 * 割引率の表示（%）。二重割引の合計を出すため小数を許容し、
 * 端数が0なら小数を出さず、そうでなければ小数1桁で丸める。
 * 「44%オフ」と「44.0%オフ」が混在しないようにするための1本化。
 */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return Number.isInteger(rounded)
    ? `${rounded.toLocaleString('ja-JP')}%`
    : rounded.toLocaleString('ja-JP', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }) + '%';
}
