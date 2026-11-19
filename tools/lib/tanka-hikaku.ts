/**
 * 単価比較 計算機（どっちが安い？）の計算ロジック。純関数のみ（DOM/React に依存しない）。
 *
 * 仕様: docs/features/tanka-hikaku.md
 *
 * - 内容量は g・ml・個（数の系統はその単位のまま）に正規化してから比べる（`toBase`）
 * - **重さ（g・kg）・量（ml・L）は系統の中で換算する。数（個・枚・本・回分）は換算できないので、
 *   同じ単位どうしだけ比べる**。g と ml の比重での換算はしない（食品ごとに違い、誤差の責任を負えない）
 * - 割引は「円引き → %引き → 税込化」の順。途中では丸めず、最後に1回だけ1円未満を切り捨てる
 *   （`effectivePrice`）。浮動小数で掛け合わせると 232.8 が 232.79999… になって1円ずれるので、
 *   値段・割引を 0.01 単位の整数にして BigInt の分数のまま計算する（`waribiki-percent` と同じやり方）
 * - 税率は `lib/shohizei.ts` の定数を使う。ここに数字を書かない
 *
 * `waribiki-percent` の `applyDiscount` は割引後（税抜）で一度丸めてから税込にするので、
 * 「端数は最後に1回だけ」の約束と合わない。丸めの部品（`toHundredths`・`roundFraction`）だけを流用する。
 */

import { convertWidth } from './hankaku-zenkaku';
import { FOOD_RATE_2027, isFoodRateShown, taxRates, type TaxRateId } from './shohizei';
import { canScaleToHundredths, roundFraction, toHundredths } from './waribiki-percent';

/* ===================================================================
   単位
   =================================================================== */

export type UnitKind = 'mass' | 'volume' | 'count';

export type UnitId = 'g' | 'kg' | 'ml' | 'L' | '個' | '枚' | '本' | '回分';

export interface UnitOption {
  id: UnitId;
  kind: UnitKind;
  /** 系統の基準の単位（g・ml・その単位そのもの）に直す係数 */
  factor: number;
}

export const UNITS: UnitOption[] = [
  { id: 'g', kind: 'mass', factor: 1 },
  { id: 'kg', kind: 'mass', factor: 1000 },
  { id: 'ml', kind: 'volume', factor: 1 },
  { id: 'L', kind: 'volume', factor: 1000 },
  { id: '個', kind: 'count', factor: 1 },
  { id: '枚', kind: 'count', factor: 1 },
  { id: '本', kind: 'count', factor: 1 },
  { id: '回分', kind: 'count', factor: 1 },
];

export function unitOption(id: UnitId): UnitOption {
  const found = UNITS.find((u) => u.id === id);
  if (!found) throw new Error(`知らない単位です: ${id}`);
  return found;
}

/**
 * 比べてよい行どうしの「組」。重さ・量は系統ごとに1つ、数は単位ごとに1つ
 * （個と枚、本と回分は比べない）。
 */
export type CompareGroup = 'mass' | 'volume' | `count:${string}`;

export interface BaseQuantity {
  kind: UnitKind;
  /** 基準の単位（g・ml・個/枚/本/回分）での量 */
  base: number;
  /** 基準の単位の表記 */
  baseUnit: string;
  group: CompareGroup;
}

/**
 * 内容量を基準の単位に直す。`packs` は入り数（「×6缶×2パック」なら [6, 2]）。
 * 1.5kg → 1500g、0.5L → 500ml、350ml×6×2 → 4200ml。
 * 量・入り数が正の有限数でなければ null。
 */
export function toBase(qty: number, unit: UnitId, packs: number[] = []): BaseQuantity | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!packs.every((p) => Number.isFinite(p) && p > 0)) return null;
  const u = unitOption(unit);
  // 0.1 + 0.2 のような誤差を見せないよう、十分な桁で丸めてから返す
  const raw = packs.reduce((acc, p) => acc * p, qty * u.factor);
  const base = Number(raw.toPrecision(12));
  if (!Number.isFinite(base) || base <= 0) return null;
  const baseUnit = u.kind === 'mass' ? 'g' : u.kind === 'volume' ? 'ml' : u.id;
  const group: CompareGroup = u.kind === 'count' ? `count:${u.id}` : u.kind;
  return { kind: u.kind, base, baseUnit, group };
}

/* ===================================================================
   何あたりで比べるか（100g / 1kg、100ml / 1L、1個 / 10個）
   =================================================================== */

/** `small` = 100g・100ml・1個あたり（既定）、`large` = 1kg・1L・10個あたり */
export type PerScale = 'small' | 'large';

export const DEFAULT_PER: PerScale = 'small';

/** 基準の単位でいくつ分あたりの値段にするか */
export function perAmount(kind: UnitKind, per: PerScale): number {
  if (kind === 'count') return per === 'small' ? 1 : 10;
  return per === 'small' ? 100 : 1000;
}

/** 「100g」「1kg」「1個」「10枚」のような表記 */
export function perLabel(kind: UnitKind, baseUnit: string, per: PerScale): string {
  if (kind === 'mass') return per === 'small' ? '100g' : '1kg';
  if (kind === 'volume') return per === 'small' ? '100ml' : '1L';
  return `${perAmount(kind, per)}${baseUnit}`;
}

/* ===================================================================
   税の扱い
   =================================================================== */

/** `inclusive` = 税込のまま。それ以外は税抜で、その税率で税込に直す */
export type TaxChoice = 'inclusive' | TaxRateId;

export const DEFAULT_TAX: TaxChoice = 'inclusive';

export interface TaxChoiceOption {
  id: TaxChoice;
  label: string;
  /** 税率（整数のパーセント）。税込は 0 */
  percent: number;
}

/**
 * 選べる税の扱い。既定は税込（店頭は総額表示が原則のため）。
 *
 * 飲食料品の1%（`FOOD_RATE_2027`）は、**施行日（2027-04-01）から期間の終わりまでのあいだだけ**
 * 並びに足す（日付で出し分ける。仕様書の決めること2）。法案が撤回されたら出さない。
 * `today` は `YYYY-MM-DD`。
 */
export function taxChoices(today: string): TaxChoiceOption[] {
  const rates = taxRates();
  const percentOf = (id: TaxRateId) => rates.find((r) => r.id === id)?.percent ?? 0;
  const list: TaxChoiceOption[] = [
    { id: 'inclusive', label: '税込', percent: 0 },
    { id: 'reduced', label: `税抜 ${percentOf('reduced')}%`, percent: percentOf('reduced') },
    { id: 'standard', label: `税抜 ${percentOf('standard')}%`, percent: percentOf('standard') },
  ];
  const food = rates.find((r) => r.id === 'food-2027');
  if (food && isFoodRateShown() && today >= FOOD_RATE_2027.from && today <= FOOD_RATE_2027.to) {
    list.push({
      id: 'food-2027',
      label: `税抜 ${food.percent}%${food.pending ? '（予定）' : ''}`,
      percent: food.percent,
    });
  }
  return list;
}

/** 税率（整数のパーセント）。税込は 0。並びに無い税率でも値は返す（計算は止めない） */
export function taxPercent(tax: TaxChoice): number {
  if (tax === 'inclusive') return 0;
  return taxRates().find((r) => r.id === tax)?.percent ?? 0;
}

/* ===================================================================
   割引・ポイント
   =================================================================== */

export interface Discounts {
  /** ◯円引き（円）。0 か未指定で使わない */
  yenOff?: number;
  /** ◯%引き。0 か未指定で使わない */
  percentOff?: number;
  /** ポイント◯%。支払う額には含めず、比較用の実質の値段にだけ効かせる */
  pointPercent?: number;
}

export interface PriceResult {
  /** 支払う額（税込・割引後・1円未満切り捨て。割引も税込化も無いときは入れた値段そのまま） */
  pay: number;
  /** もらえるポイント（税込の支払額 × ポイント%、1未満切り捨て） */
  points: number;
  /** 比較用の実質の値段（`pay - points`） */
  effective: number;
  /** 割引の順序の説明（「30円引きのあと20%引きで計算」）。割引が無ければ null */
  orderNote: string | null;
}

/** 値段・割引・ポイントが範囲外のときの理由 */
export type PriceError = 'price' | 'yen-off' | 'percent-off' | 'point';

function isOn(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v) && v !== 0;
}

/**
 * 割引の順序の説明。円引き → %引きの順で掛けるので、その順で書く。
 * 「30円引きのあと20%引きで計算」「20%引きで計算」
 */
export function discountOrderNote(d: Discounts): string | null {
  const parts: string[] = [];
  if (isOn(d.yenOff)) parts.push(`${formatNumber(d.yenOff)}円引き`);
  if (isOn(d.percentOff)) parts.push(`${formatNumber(d.percentOff)}%引き`);
  if (parts.length === 0) return null;
  return `${parts.join('のあと')}で計算`;
}

/**
 * 支払う額・ポイント・比較用の実質の値段。
 *
 * 1. 割引は**入れた値段**に掛ける（税込の行は税込の値段に、税抜の行は税抜の値段に）
 * 2. 順序は**円引き → %引き**（入力の並びにかかわらず）
 * 3. 税抜の行は割引のあとで税込に直す（消費税は値引き後の対価に掛かる）
 * 4. 途中は丸めず、最後の額を1円未満切り捨て
 * 5. ポイントは税込の支払額に掛け、1ポイント未満を切り捨てる
 *
 * 例：税込 321円・30円引き・20%引き → 232円。税抜8% 298円・同じ割引 → 231円。
 * 範囲外の入力は理由を返す（値段は正、円引きは値段未満、%引き・ポイントは 0 以上 100 未満）。
 */
export function effectivePrice(
  price: number,
  tax: TaxChoice,
  discounts: Discounts = {},
): PriceResult | { error: PriceError } {
  if (!Number.isFinite(price) || price <= 0 || !canScaleToHundredths(price)) return { error: 'price' };
  const yen = discounts.yenOff ?? 0;
  const pct = discounts.percentOff ?? 0;
  const pt = discounts.pointPercent ?? 0;
  if (!Number.isFinite(yen) || yen < 0 || yen >= price) return { error: 'yen-off' };
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return { error: 'percent-off' };
  if (!Number.isFinite(pt) || pt < 0 || pt >= 100) return { error: 'point' };

  const taxPct = taxPercent(tax);
  let pay: number;
  if (taxPct === 0 && yen === 0 && pct === 0) {
    // 税込のまま割引も無い：丸めるものが無いので、入れた値段（0.1円単位の業務用単価も）をそのまま使う
    pay = price;
  } else {
    // (値段 − 円引き) × (1 − %/100) × (1 + 税率/100) を、0.01 単位の整数の分数で
    const numer =
      BigInt(toHundredths(price) - toHundredths(yen)) *
      BigInt(10000 - toHundredths(pct)) *
      BigInt(100 + taxPct);
    const denom = 100n * 10000n * 100n;
    pay = roundFraction(numer, denom, 'floor');
  }
  const points = pt === 0 ? 0 : roundFraction(BigInt(Math.round(pay * 100)) * BigInt(toHundredths(pt)), 1000000n, 'floor');
  return { pay, points, effective: pay - points, orderNote: discountOrderNote(discounts) };
}

export function isPriceError(r: PriceResult | { error: PriceError }): r is { error: PriceError } {
  return 'error' in r;
}

/* ===================================================================
   比べる
   =================================================================== */

export interface ItemInput {
  /** 名前（空なら A・B・C…） */
  name?: string;
  price: number;
  tax: TaxChoice;
  qty: number;
  unit: UnitId;
  /** 入り数（「×6缶×2パック」なら [6, 2]）。空の欄は入れない */
  packs?: number[];
  discounts?: Discounts;
}

/** 1 品の単価（支払う額で）。比べられない入力なら null */
export function unitPrice(item: ItemInput, per: PerScale): number | null {
  const q = toBase(item.qty, item.unit, item.packs);
  const p = effectivePrice(item.price, item.tax, item.discounts);
  if (!q || isPriceError(p)) return null;
  return (p.pay / q.base) * perAmount(q.kind, per);
}

export type RankStatus = 'ranked' | 'mismatch' | 'invalid';

export interface RankedItem {
  /** 入力の並びでの位置（0 始まり） */
  index: number;
  name: string;
  status: RankStatus;
  /** invalid・mismatch のときの説明 */
  message?: string;
  quantity?: BaseQuantity;
  price?: PriceResult;
  /** 支払う額での単価（per あたり。丸めない） */
  unitPrice?: number;
  /** 比較用の実質単価（ポイント込み。丸めない）。順位はこちらで付ける */
  effectiveUnitPrice?: number;
  /** 「100g」などの何あたりの表記 */
  perLabel?: string;
  /** 安い順の順位（1 始まり）。ranked だけ */
  rank?: number;
  /** いちばん安い行か */
  cheapest?: boolean;
  /** いちばん安い行との単価の差（円、per あたり） */
  diffYen?: number;
  /** いちばん安い行との単価の差（%） */
  diffPercent?: number;
  /** 差が 0.1% 未満（「ほぼ同じ」） */
  nearlySame?: boolean;
  /** いちばん安い行と単価がまったく同じ（「同じ」） */
  sameAsCheapest?: boolean;
  /** この行の支払額で、いちばん安い行なら基準の単位でどれだけ買えるか */
  sameMoneyQty?: number;
}

/** 「ほぼ同じ」とみなす差（%） */
export const NEARLY_SAME_PERCENT = 0.1;

/** 名前の欄が空のときの名前（A・B・C…、26 を超えたら番号） */
export function defaultName(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}品目`;
}

const PRICE_MESSAGES: Record<PriceError, string> = {
  price: '値段を入れてください',
  'yen-off': '円引きは0以上で、値段より小さくしてください',
  'percent-off': '%引きは0以上100未満で入れてください',
  point: 'ポイントは0以上100未満で入れてください',
};

/**
 * 何品でも並べて、比較用の実質単価の安い順に順位を付ける。
 *
 * - 比べる組（重さ・量・数の単位）は**いちばん多くの行が入っている組**。同数なら上の行の組
 * - 組の違う行は「単位が違います」として順位から外す（g と ml、個と枚など）
 * - 順位は丸める前の値で付け、同じ値なら入力の並び順
 */
export function rank(items: ItemInput[], per: PerScale): RankedItem[] {
  const rows: RankedItem[] = items.map((item, index) => {
    const name = item.name?.trim() || defaultName(index);
    const quantity = toBase(item.qty, item.unit, item.packs);
    const price = effectivePrice(item.price, item.tax, item.discounts);
    if (isPriceError(price)) return { index, name, status: 'invalid', message: PRICE_MESSAGES[price.error] };
    if (!quantity) return { index, name, status: 'invalid', message: '内容量（と入り数）を入れてください' };
    const amount = perAmount(quantity.kind, per);
    return {
      index,
      name,
      status: 'ranked',
      quantity,
      price,
      unitPrice: (price.pay / quantity.base) * amount,
      effectiveUnitPrice: (price.effective / quantity.base) * amount,
      perLabel: perLabel(quantity.kind, quantity.baseUnit, per),
    };
  });

  // 比べる組を決める（いちばん多い組。同数なら先に出てきた組）
  const counts = new Map<CompareGroup, number>();
  for (const r of rows) {
    if (r.status === 'ranked' && r.quantity) counts.set(r.quantity.group, (counts.get(r.quantity.group) ?? 0) + 1);
  }
  let main: CompareGroup | null = null;
  for (const [g, c] of counts) {
    if (main === null || c > (counts.get(main) ?? 0)) main = g;
  }
  if (main === null) return rows;

  const mainUnit = rows.find((r) => r.quantity?.group === main)?.quantity?.baseUnit ?? '';
  for (const r of rows) {
    if (r.status === 'ranked' && r.quantity && r.quantity.group !== main) {
      r.status = 'mismatch';
      r.message = `単位が違います（ほかの品は${groupLabel(main, mainUnit)}、この品は${groupLabel(r.quantity.group, r.quantity.baseUnit)}）`;
    }
  }

  const ranked = rows
    .filter((r) => r.status === 'ranked')
    .sort((a, b) => (a.effectiveUnitPrice as number) - (b.effectiveUnitPrice as number) || a.index - b.index);
  const best = ranked[0];
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.cheapest = i === 0;
    const min = best.effectiveUnitPrice as number;
    const u = r.effectiveUnitPrice as number;
    r.diffYen = u - min;
    r.diffPercent = min > 0 ? ((u - min) / min) * 100 : 0;
    r.sameAsCheapest = i > 0 && r.diffYen === 0;
    r.nearlySame = i > 0 && !r.sameAsCheapest && r.diffPercent < NEARLY_SAME_PERCENT;
    if (i > 0 && best.price && best.quantity && best.price.effective > 0 && r.price) {
      // この行の実質の値段を、いちばん安い行の単価で割ると、同じお金で買える量
      r.sameMoneyQty = (r.price.effective / best.price.effective) * best.quantity.base;
    }
  });
  return rows;
}

function groupLabel(group: CompareGroup, baseUnit: string): string {
  if (group === 'mass') return '重さ（g・kg）';
  if (group === 'volume') return '量（ml・L）';
  return `数（${baseUnit}）`;
}

/** 順位の付いた行だけを安い順に */
export function rankedOnly(rows: RankedItem[]): RankedItem[] {
  return rows.filter((r) => r.status === 'ranked').sort((a, b) => (a.rank as number) - (b.rank as number));
}

/* ===================================================================
   実質値上げ率（タブ B）
   =================================================================== */

export interface PriceQty {
  price: number;
  qty: number;
  unit: UnitId;
}

export interface ShrinkflationResult {
  /** 値段の変化率（%） */
  pricePct: number;
  /** 内容量の変化率（%） */
  qtyPct: number;
  /** 単価の変化率（%）。これが「実質値上げ率」 */
  unitPct: number;
}

/**
 * 前と今の値段・内容量から、値段・量・単価の変化率を出す。
 * 200g 198円 → 180g 198円 = 単価 +11.1%。単位の系統が違う（g と ml など）か、
 * 値段・量が正でなければ null。
 */
export function shrinkflation(before: PriceQty, after: PriceQty): ShrinkflationResult | null {
  const b = toBase(before.qty, before.unit);
  const a = toBase(after.qty, after.unit);
  if (!b || !a || b.group !== a.group) return null;
  if (!(before.price > 0) || !(after.price > 0) || !Number.isFinite(before.price) || !Number.isFinite(after.price)) {
    return null;
  }
  const pricePct = (after.price / before.price - 1) * 100;
  const qtyPct = (a.base / b.base - 1) * 100;
  const unitPct = ((after.price / a.base) / (before.price / b.base) - 1) * 100;
  return { pricePct, qtyPct, unitPct };
}

/* ===================================================================
   入力の読み取りと表示
   =================================================================== */

/**
 * 数字の欄の読み取り。全角数字・カンマ・「円」「g」などの混入は受け流して数字だけ読む
 * （「２９８円」→ 298、「1,280」→ 1280、「350ｍｌ」→ 350）。読めなければ NaN。
 */
export function parseLooseNumber(input: string): number {
  const half = convertWidth(input, 'toHalf', { kana: false, space: true })
    .replace(/[，,、]/g, '')
    .replace(/。/g, '.');
  const m = /(-|−|ー|‐)?\s*(\d+(?:\.\d+)?|\.\d+)/.exec(half);
  // マイナスは受け付けない（「-5」を 5 と読んで円引き・値段に正の数として効かせないため。#526 レビュー）
  if (!m || m[1]) return Number.NaN;
  return Number(m[2]);
}

/** 入り数の欄（空欄は「入れていない」）。空なら null、読めなければ NaN */
export function parsePack(input: string): number | null {
  if (input.trim() === '') return null;
  return parseLooseNumber(input);
}

/** 3桁区切り（小数は最大 `digits` 桁） */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits });
}

/** 単価の表示：小数第2位まで（四捨五入）。「12.30」のように桁をそろえる */
export function formatUnitPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 変化率の表示：+11.1% / −5.0% / ±0.0% */
export function formatChange(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  const r = Math.round(pct * 10) / 10;
  if (r === 0) return '±0.0%';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}%`;
}

/** 同じお金で買える量の表示（g・ml は整数、数は小数1桁） */
export function formatQty(value: number, baseUnit: string): string {
  const digits = baseUnit === 'g' || baseUnit === 'ml' ? 0 : 1;
  return `${formatNumber(Math.floor(value * 10 ** digits) / 10 ** digits, digits)}${baseUnit}`;
}

/** `tool_use` に付ける品数の区分（値段・名前は送らない） */
export function itemCountBucket(n: number): '2' | '3' | '4plus' {
  if (n >= 4) return '4plus';
  return n === 3 ? '3' : '2';
}
