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
   【データ更新箇所】
   消費税率は法改正で動きうる唯一の数字。ここの2定数だけを直せば、
   計算機・早見表・page.tsx の本文表示まで揃って追従する。
   税率が動く可能性の低さから頻度は低いが、動くときは
   `TAX_UPDATED_AT` を必ず一緒に直すこと。
   =================================================================== */

/** 標準税率（消費税＋地方消費税の合計） */
export const TAX_RATE_STANDARD = 0.10;

/** 軽減税率（飲食料品・定期購読の新聞など） */
export const TAX_RATE_REDUCED = 0.08;

/**
 * 現行の消費税率が施行された日。
 * 2019-10-01 の税率引き上げ（8% → 10%）以降は改定されていない。
 */
export const TAX_UPDATED_AT = '2019-10-01';

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

/** 端数の丸め方 */
export type Rounding = 'floor' | 'round' | 'ceil';

export interface RoundingOption {
  id: Rounding;
  /** UIラベル */
  label: string;
  /** 内訳表示・チップ表示用の短い名前 */
  short: string;
}

/**
 * 選べる端数処理。並び順は「切り捨て → 四捨五入 → 切り上げ」で、
 * 既定は四捨五入。並びを既定に合わせない（左から順の並び）のは、
 * ラジオボタンで既定が真ん中に来ても不自然にならないため。
 */
export const ROUNDINGS: RoundingOption[] = [
  { id: 'floor', label: '切り捨て', short: '切捨' },
  { id: 'round', label: '四捨五入', short: '四捨' },
  { id: 'ceil', label: '切り上げ', short: '切上' },
];

export const DEFAULT_ROUNDING: Rounding = 'round';

/**
 * 値を整数（1円）に丸める。
 * 4捨5入・切り上げ・切り捨てのどれを選んでも、負の数の扱いは
 * 「値を0方向へ近づける（`ceil` は上へ・`floor` は下へ）」で
 * JavaScript の標準と同じ。負の値は割引計算では基本的に出ないが、
 * 逆算モードで「増えた（マークアップ）」を計算するときのため保険で挙げておく。
 *
 * 無効値（NaN・Infinity）は `NaN` を返す。呼び出し側で `Number.isFinite`
 * で受けて表示を落とせるように、null は返さない（数値のシグネチャは崩さない）。
 */
export function roundBy(value: number, rounding: Rounding): number {
  if (!Number.isFinite(value)) return Number.NaN;
  switch (rounding) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
      // Number.EPSILON を足して丸めると、二進小数の誤差で
      // 「2.5円は2円に丸まる」ような境界のブレを避けられる。
      // ただし負の値を上へ寄せるので、非負の値だけに適用する
      if (value >= 0) return Math.round(value + Number.EPSILON);
      return Math.round(value);
  }
}

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
  // 二重割引で 100% を素通しにする合理的なケースはないので、100は許容し、
  // 合計割引率が100を超える定義を出さないよう rates の各要素を上でクランプ済み。
  const eff = effectiveRate(input.rates);
  const rawDiscounted = input.price * (1 - eff / 100);
  const discounted = roundBy(rawDiscounted, input.rounding);
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
  const rawIncluding = discounted * (1 + rate);
  const includingTax = roundBy(rawIncluding, input.rounding);
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
