/**
 * 住宅取得等資金の贈与税 非課税 判定・計算機
 *
 * 仕様: docs/features/jutaku-shutoku-shikin-hikazei.md
 *
 * 直系尊属（父母・祖父母）から住宅の新築・取得・増改築の資金を贈与されたとき、省エネ等住宅なら 1,000 万円、
 * それ以外は 500 万円まで贈与税が非課税になる（租税特別措置法 70 条の 2）。適用は 2026-12-31 までの贈与で、
 * 延長は 2026 年 12 月の税制改正大綱で決まる。大綱が出たら `MEASURE.extension` の 1 語を切り替える。
 *
 * 税率表・基礎控除・相続時精算課税の定数は `lib/zoyozei-keisan.ts` が持ち主で、ここでは二重に持たない。
 *
 * 出典（2026-10-01 取得）:
 * - 国税庁 タックスアンサー No.4508「直系尊属から住宅取得等資金の贈与を受けた場合の非課税」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4508.htm
 * - 国税庁 タックスアンサー No.4503「住宅取得等資金の贈与を受けた場合の相続時精算課税選択の特例」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4503.htm
 * - 国税庁 タックスアンサー No.4408「贈与税の計算と税率（暦年課税）」・No.4103「相続時精算課税の選択」
 * - 租税特別措置法 70 条の 2・70 条の 3
 */

import { formatDate, type DateParts } from '@/lib/date-parts';
import { taxDueDate, type TaxDue } from '@/lib/sozoku-toki-kigen';
import {
  BASIC_DEDUCTION,
  giftTax,
  settlementTax,
  type Bracket,
  type SettlementResult,
  type TaxTable,
} from '@/lib/zoyozei-keisan';

// ─────────────────────────────────────────────
// 【データ更新箇所】税制改正で変わる値はここだけ
// ─────────────────────────────────────────────

/** 制度データの最終確認日（国税庁 No.4508・No.4503 を突き合わせた日） */
export const DATA_CHECKED_AT = '2026-10-01';

/** 延長の状態。12 月の税制改正大綱が出たら 1 語を切り替える */
export type Extension = 'undecided' | 'extended' | 'ended';

/**
 * 適用期間と延長の状態（措法 70 条の 2・70 条の 3。令和6年度改正で 2024-01-01〜2026-12-31 の贈与に延長されたもの）。
 *
 * **この 1 つのフラグが 70 条の 2（非課税）と 70 条の 3（相続時精算課税の年齢特例）の両方を切り替える**（いまは期限が同じ）。
 * 大綱で一方だけ延長されたら、そのときに 2 つに分ける。`extended` にしたら `to` と限度額も大綱に合わせて直すこと
 */
export const MEASURE: { from: string; to: string; extension: Extension } = {
  from: '2024-01-01',
  to: '2026-12-31',
  extension: 'undecided',
};

/** 非課税限度額（No.4508。2024〜2026 年の贈与） */
export const LIMITS = { energySaving: 10_000_000, other: 5_000_000 } as const;

/** 床面積の要件（㎡。40 以上 240 以下。40 以上 50 未満は所得の閾値が下がる） */
export const FLOOR_AREA = { min: 40, smallBelow: 50, max: 240 } as const;

/** 受贈者の合計所得金額の上限（円。以下なら可） */
export const INCOME_LIMITS = { normal: 20_000_000, small: 10_000_000 } as const;

/** 受贈者の年齢（贈与の年の 1 月 1 日に 18 歳以上） */
export const MIN_AGE = 18;

// ─────────────────────────────────────────────
// 適用期間
// ─────────────────────────────────────────────

/**
 * 贈与の年が適用期間に入るか。
 * - `in`：2024〜2026 年の贈与
 * - `before`：2023 年以前（限度額が違う。この計算機の対象外）
 * - `after-*`：2027 年以後。延長の状態で文言が変わる
 */
export type PeriodStatus = 'in' | 'before' | 'after-undecided' | 'after-extended' | 'after-ended';

const yearOf = (iso: string) => Number(iso.slice(0, 4));

export function periodStatus(giftYear: number, extension: Extension = MEASURE.extension): PeriodStatus {
  if (giftYear < yearOf(MEASURE.from)) return 'before';
  if (giftYear <= yearOf(MEASURE.to)) return 'in';
  return `after-${extension}`;
}

/** 期間外のときの文言。期間内は null */
export function periodMessage(status: PeriodStatus): string | null {
  switch (status) {
    case 'in':
      return null;
    case 'before':
      return '2023年以前の贈与は限度額が違うため、この計算機の対象外です（2024年1月1日〜2026年12月31日の贈与が対象）。';
    case 'after-undecided':
      return '非課税の特例は2026年12月31日までの贈与が対象です。延長は2026年12月の税制改正大綱で決まる見込みです。決まったら更新します。';
    case 'after-extended':
      return '2027年以後の贈与も、延長された特例の対象です（税制改正大綱による延長。限度額・要件は国税庁の案内で確認してください）。';
    case 'after-ended':
      return '非課税の特例は2026年12月31日までの贈与で終了しました。2027年以後の贈与は対象外です。';
  }
}

/** 期間外でも計算を続けてよいか（延長が決まったときだけ 2027 年以後も対象として扱う） */
const periodApplies = (s: PeriodStatus) => s === 'in' || s === 'after-extended';

// ─────────────────────────────────────────────
// 要件判定
// ─────────────────────────────────────────────

/** 住宅の種類（新築・取得・増改築は「新築等」、中古住宅の取得は「既存」） */
export type HouseKind = 'new' | 'existing';
/** 省エネ等住宅の基準を満たすか */
export type EnergyAnswer = 'yes' | 'no' | 'unknown';

export interface EligibilityInput {
  giftYear: number;
  /** 贈与額（円） */
  amount: number;
  houseKind: HouseKind;
  energy: EnergyAnswer;
  /** 床面積（㎡） */
  floorArea: number;
  /** 受贈者が贈与の年の 1 月 1 日に 18 歳以上か */
  adultOnJan1: boolean;
  /** 受贈者の贈与の年の合計所得金額（円） */
  income: number;
  /** 贈与者が直系尊属（父母・祖父母）か */
  lineal: boolean;
  /** 翌年 3 月 15 日までに引渡しを受け（新築・取得・増改築を済ませ）、住めるか */
  acquireAndMoveInByMar15: boolean;
  /** 床面積の 2 分の 1 以上が居住用か */
  mostlyResidential: boolean;
  /** 既存住宅のとき：昭和 57 年以降築か、耐震基準に適合しているか */
  quakeOk: boolean;
  /** 平成 21 年分〜令和 5 年分にこの非課税の適用を受けたことがない（No.4508 受贈者の要件 (4)） */
  notUsedBefore: boolean;
  /** 配偶者・親族など特別の関係がある人から取得・請負契約で新築等したものではない（同 (5)） */
  notFromRelated: boolean;
  /** 贈与を受けたときに日本国内に住所がある（同 (7)。一定の例外あり） */
  domicileInJapan: boolean;
}

/** 満たさない要件の識別子（テストと画面の両方で使う） */
export type Failure =
  | 'period'
  | 'lineal'
  | 'age'
  | 'income'
  | 'area-small'
  | 'area-large'
  | 'residential'
  | 'quake'
  | 'move-in'
  | 'used-before'
  | 'related-party'
  | 'domicile';

export interface Eligibility {
  ok: boolean;
  period: PeriodStatus;
  /** 満たさない要件（名指し）。ok のときは空 */
  failures: Failure[];
  /** 非課税限度額（円）。ok でないときは 0 */
  limit: number;
  /** 所得の閾値（円）。床面積で 2,000 万円／1,000 万円が切り替わる */
  incomeLimit: number;
  /** 「わからない」で 500 万円にしたとき、性能証明書があれば増える額（円） */
  certificateBonus: number;
}

/** 床面積から所得の閾値（40 以上 50 未満は 1,000 万円） */
export function incomeLimitFor(floorArea: number): number {
  return floorArea >= FLOOR_AREA.min && floorArea < FLOOR_AREA.smallBelow ? INCOME_LIMITS.small : INCOME_LIMITS.normal;
}

/** 省エネ等住宅の答え → 限度額（「わからない」は 500 万円） */
export function limitFor(energy: EnergyAnswer): number {
  return energy === 'yes' ? LIMITS.energySaving : LIMITS.other;
}

/**
 * 要件を 1 つずつ判定し、**満たさない要件を名指しで返す**（No.4508）。全部満たせば `limit` に限度額。
 *
 * 判定するのは受贈者・住宅・期間の要件。申告（税額 0 でも要る）は手続きなので、ここではなく画面で出す
 */
export function eligibility(input: EligibilityInput, extension: Extension = MEASURE.extension): Eligibility {
  const period = periodStatus(input.giftYear, extension);
  const incomeLimit = incomeLimitFor(input.floorArea);
  const failures: Failure[] = [];
  if (!periodApplies(period)) failures.push('period');
  if (!input.lineal) failures.push('lineal');
  if (!input.adultOnJan1) failures.push('age');
  if (input.floorArea < FLOOR_AREA.min) failures.push('area-small');
  if (input.floorArea > FLOOR_AREA.max) failures.push('area-large');
  if (input.income > incomeLimit) failures.push('income');
  if (!input.mostlyResidential) failures.push('residential');
  if (input.houseKind === 'existing' && !input.quakeOk) failures.push('quake');
  if (!input.acquireAndMoveInByMar15) failures.push('move-in');
  if (!input.notUsedBefore) failures.push('used-before');
  if (!input.notFromRelated) failures.push('related-party');
  if (!input.domicileInJapan) failures.push('domicile');
  const ok = failures.length === 0;
  return {
    ok,
    period,
    failures,
    limit: ok ? limitFor(input.energy) : 0,
    incomeLimit,
    certificateBonus: ok && input.energy === 'unknown' ? LIMITS.energySaving - LIMITS.other : 0,
  };
}

/** 満たさない要件の文言 */
export function failureMessage(f: Failure, ctx: { giftYear: number; incomeLimit: number }): string {
  const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;
  switch (f) {
    case 'period':
      return '贈与の年が適用期間（2024年1月1日〜2026年12月31日）の外です';
    case 'lineal':
      return '贈与者が父母・祖父母など直系尊属ではありません（配偶者の父母は直系尊属に当たりません）';
    case 'age':
      return `受贈者が${ctx.giftYear}年1月1日に18歳未満です`;
    case 'income':
      return `受贈者の合計所得金額が${man(ctx.incomeLimit)}を超えています`;
    case 'area-small':
      return '床面積が40㎡未満です';
    case 'area-large':
      return '床面積が240㎡を超えています';
    case 'residential':
      return '床面積の2分の1以上が居住用ではありません';
    case 'quake':
      return '既存住宅が昭和57年より前の建築で、耐震基準に適合していません（取得までに耐震改修すれば対象になります）';
    case 'move-in':
      return `${ctx.giftYear + 1}年3月15日までに取得・増改築を済ませ（建売・分譲・中古は引渡し、注文住宅の新築は上棟まで）、住むことができません`;
    case 'used-before':
      return '平成21年分〜令和5年分（2009〜2023年分）にこの非課税の適用を受けたことがあります';
    case 'related-party':
      return '配偶者・親族など特別の関係がある人から住宅を取得するか、その人との請負契約で新築・増改築します';
    case 'domicile':
      return '贈与を受けたときに日本国内に住所がありません（一定の例外は税務署に確認してください）';
  }
}

/**
 * 贈与の年の 1 月 1 日に 18 歳以上になる生年月日の最終日。
 *
 * 年齢は誕生日の前日の終わりに加わる（年齢計算ニ関スル法律・民法 143 条）ので、
 * 1 月 2 日生まれの人は前日の 1 月 1 日に 18 歳になる。2026 年の贈与なら「2008 年 1 月 2 日以前生まれ」
 */
export function adultBirthCutoff(giftYear: number): DateParts {
  return { year: giftYear - MIN_AGE, month: 1, day: 2 };
}

/** 生年月日（YYYY-MM-DD）から、贈与の年の 1 月 1 日に 18 歳以上か */
export function isAdultOnJan1(birth: string, giftYear: number): boolean {
  return birth <= formatDate(adultBirthCutoff(giftYear));
}

// ─────────────────────────────────────────────
// 非課税のあとの贈与税（2 方式）
// ─────────────────────────────────────────────

export interface RekinenAfterExclusion {
  amount: number;
  /** 非課税にできた額（贈与額と限度額の小さいほう） */
  exclusion: number;
  /** 非課税分を引いた額 */
  afterExclusion: number;
  /** 使った基礎控除 */
  basicDeduction: number;
  /** 基礎控除後の課税価格（1,000 円未満切捨て） */
  taxable: number;
  table: TaxTable;
  bracket?: Bracket;
  /** 贈与税（100 円未満切捨て） */
  tax: number;
}

export interface SettlementAfterExclusion {
  amount: number;
  exclusion: number;
  afterExclusion: number;
  /** `zoyozei-keisan` の `settlementTax()` の結果（基礎控除 → 特別控除の残り → 20%） */
  settlement: SettlementResult;
  tax: number;
}

/**
 * 暦年課税：贈与額 − 非課税分 − 基礎控除 110 万円 に速算表を当てる（No.4408）。
 * 直系尊属から 18 歳以上への贈与は特例税率。どちらかを満たさないときは一般税率
 */
export function rekinenAfterExclusion(
  amount: number,
  limit: number,
  { special = true }: { special?: boolean } = {},
): RekinenAfterExclusion {
  const a = Math.max(0, Math.floor(amount) || 0);
  const exclusion = Math.min(a, Math.max(0, limit));
  const afterExclusion = a - exclusion;
  const r = giftTax(afterExclusion, { lineal: special, adultOn0101: special });
  const table: TaxTable = special ? 'special' : 'general';
  return {
    amount: a,
    exclusion,
    afterExclusion,
    basicDeduction: Math.min(afterExclusion, BASIC_DEDUCTION),
    taxable: r.taxable,
    table,
    bracket: r.taxable > 0 && r.table !== 'mixed' ? r.bracket : undefined,
    tax: r.tax,
  };
}

/**
 * 相続時精算課税：`settlementTax(贈与額 − 非課税分, 前年までに使った特別控除)`。
 * 特別控除 2,500 万円は累計枠なので、前年までに使った額を渡す（既定 0 ＝初めて使う）
 */
export function settlementAfterExclusion(amount: number, limit: number, usedSpecialDeduction = 0): SettlementAfterExclusion {
  const a = Math.max(0, Math.floor(amount) || 0);
  const exclusion = Math.min(a, Math.max(0, limit));
  const afterExclusion = a - exclusion;
  const settlement = settlementTax(afterExclusion, usedSpecialDeduction);
  return { amount: a, exclusion, afterExclusion, settlement, tax: settlement.tax };
}

export type Method = 'rekinen' | 'seisan';

/** 仕様書の `taxAfterExclusion(amount, limit, method)`。2 方式のどちらかの税額だけを返す */
export function taxAfterExclusion(amount: number, limit: number, method: Method, usedSpecialDeduction = 0): number {
  return method === 'rekinen'
    ? rekinenAfterExclusion(amount, limit).tax
    : settlementAfterExclusion(amount, limit, usedSpecialDeduction).tax;
}

// ─────────────────────────────────────────────
// 期限
// ─────────────────────────────────────────────

export interface Deadlines {
  /** 引渡し（新築・取得・増改築）と居住の期限：翌年 3 月 15 日（額面） */
  moveIn: string;
  /** 申告の期間の初日：翌年 2 月 1 日 */
  filingFrom: string;
  /** 申告の期限（翌年 3 月 15 日。土日祝なら国税通則法 10 条 2 項で翌開庁日） */
  filingTo: TaxDue;
}

export function deadlines(giftYear: number): Deadlines {
  const next = giftYear + 1;
  return {
    moveIn: `${next}-03-15`,
    filingFrom: `${next}-02-01`,
    filingTo: taxDueDate(`${next}-03-15`),
  };
}

// ─────────────────────────────────────────────
// 画面の文言（テストで見張る）
// ─────────────────────────────────────────────

/** 相続時精算課税の列の脚注（措法 70 条の 3・No.4503） */
export const SETTLEMENT_AGE_NOTE =
  '住宅取得等資金の贈与は、贈与者が60歳未満でも相続時精算課税を選べます（措法70条の3・国税庁 No.4503。2026年12月31日までの贈与）。通常の「60歳以上の父母・祖父母から」の例外です。';

/** 相続時精算課税は撤回できない（No.4103） */
export const SETTLEMENT_IRREVOCABLE_NOTE =
  '相続時精算課税の税率は一律20%です。一度選ぶと、その贈与者からの贈与は暦年課税に戻せません。';

/** 特別控除を初めて使う前提のときの 1 行 */
export const FIRST_SETTLEMENT_NOTE = '初めて相続時精算課税を使う前提で計算しています（前年までに使った特別控除 0円）。';

/**
 * 新築の「翌年 3 月 15 日まで」の読み方（No.4508 の注記）。注文住宅は上棟（屋根・骨組みがあり土地に定着した状態）まででよい。
 * 取得（建売・分譲・中古）は引渡しまでが要る
 */
export const NEW_BUILD_NOTE =
  '注文住宅の新築は、翌年3月15日の時点で屋根（骨組みを含む）があり土地に定着した状態（上棟）なら足ります。建売・分譲・中古の取得は引渡しまでが要ります。';

/** 遅滞なく住む場合の注意（No.4508 の注記） */
export const LATE_MOVE_IN_NOTE =
  '翌年3月15日の後に住む場合は、翌年12月31日までに住んでいないと非課税が取り消され、修正申告が要ります。';

/** 申告の 1 行（税額 0 でも要る） */
export const FILING_NOTE = '税額が0円でも、贈与税の申告をしないと非課税になりません。';
