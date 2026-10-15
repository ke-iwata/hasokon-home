/**
 * 相続税 計算機
 *
 * 仕様: docs/features/sozokuzei-keisan.md
 *
 * 遺産額と相続人の構成から、基礎控除・相続税の総額・1人ずつの納付額を出す。
 * 加算する生前贈与は**ここでは判定しない**（贈与税の計算機の `classifyGift()` が持つ）。額だけを受け取る。
 *
 * 出典（2026-10-15 取得。いずれも [令和8年4月1日現在法令等]）:
 * - 国税庁 タックスアンサー No.4152「相続税の計算」（手順と税額控除の順序）
 * - No.4155「相続税の税率」（速算表）
 * - No.4157「相続税額の2割加算」・No.4158「配偶者の税額の軽減」
 * - No.4164「未成年者の税額控除」・No.4167「障害者の税額控除」
 * - No.4114「相続税の課税対象になる死亡保険金」・No.4117「相続税の課税対象になる死亡退職金」
 * - No.4132「相続人の範囲と法定相続分」・No.4170「相続人の中に養子がいるとき」
 * - 相続税法 12 条 1 項 6 号・7 号、15 条、16 条、18 条、19 条の 2〜19 条の 4（e-Gov 法令検索で条文を取得）
 * - 民法 900 条（法定相続分。半血の兄弟姉妹は全血の 1/2 ＝ 4 号ただし書）
 *
 * 端数：課税価格は 1,000 円未満切捨て（国税通則法 118 条 1 項）、法定相続分で分けた取得金額も各人
 * 1,000 円未満切捨て（No.4152）、納付税額は 100 円未満切捨て（同 119 条 1 項）。
 */

import { addMonths, compareDate, type DateParts } from '@/lib/date-parts';

// ─────────────────────────────────────────────
// 【データ更新箇所】税制改正で変わる値はここだけ
// ─────────────────────────────────────────────

/** 制度データの最終確認日（国税庁 No.4152 ほか・相続税法の条文を突き合わせた日） */
export const DATA_CHECKED_AT = '2026-10-15';

/** 基礎控除の定額部分（相続税法 15 条 1 項） */
export const BASIC_FIXED = 30_000_000;
/** 基礎控除の法定相続人 1 人あたり（同） */
export const BASIC_PER_HEIR = 6_000_000;

export interface Bracket {
  /** この行の上限（以下）。最後の行は Infinity */
  upTo: number;
  rate: number;
  deduction: number;
}

/** 相続税の速算表（No.4155・相続税法 16 条） */
export const BRACKETS: readonly Bracket[] = [
  { upTo: 10_000_000, rate: 0.1, deduction: 0 },
  { upTo: 30_000_000, rate: 0.15, deduction: 500_000 },
  { upTo: 50_000_000, rate: 0.2, deduction: 2_000_000 },
  { upTo: 100_000_000, rate: 0.3, deduction: 7_000_000 },
  { upTo: 200_000_000, rate: 0.4, deduction: 17_000_000 },
  { upTo: 300_000_000, rate: 0.45, deduction: 27_000_000 },
  { upTo: 600_000_000, rate: 0.5, deduction: 42_000_000 },
  { upTo: Infinity, rate: 0.55, deduction: 72_000_000 },
];

/** 配偶者の税額軽減の下限額 1 億 6 千万円（相続税法 19 条の 2 第 1 項 2 号イ） */
export const SPOUSE_RELIEF_FLOOR = 160_000_000;
/** 2 割加算の率（相続税法 18 条 1 項） */
export const SURCHARGE_RATE = 0.2;
/** 未成年者控除：この年齢に達するまで（相続税法 19 条の 3） */
export const MINOR_AGE = 18;
export const MINOR_PER_YEAR = 100_000;
/** 障害者控除：この年齢に達するまで（相続税法 19 条の 4） */
export const DISABLED_AGE = 85;
export const DISABLED_PER_YEAR = { general: 100_000, special: 200_000 } as const;
/** 死亡保険金の非課税枠（相続税法 12 条 1 項 6 号） */
export const INSURANCE_EXEMPT_PER_HEIR = 5_000_000;
/** 死亡退職金の非課税枠（同 7 号。保険金とは別枠で、数え方は同じ） */
export const RETIREMENT_EXEMPT_PER_HEIR = 5_000_000;

// ─────────────────────────────────────────────
// 分数（法定相続分は小数で掛けない。1/3 を 0.333… にすると千円未満切捨てがずれる）
// ─────────────────────────────────────────────

export interface Fraction {
  num: number;
  den: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function frac(num: number, den: number): Fraction {
  const g = gcd(Math.abs(num), Math.abs(den)) || 1;
  return { num: num / g, den: den / g };
}

function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.num, a.den * b.den);
}

function sub(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.den - b.num * a.den, a.den * b.den);
}

/** 額 × 分数（1 円未満切捨て） */
export function applyFraction(amount: number, f: Fraction): number {
  return Math.floor((amount * f.num) / f.den);
}

const floorTo = (n: number, unit: number) => Math.floor(n / unit) * unit;

// ─────────────────────────────────────────────
// 相続人の構成
// ─────────────────────────────────────────────

/**
 * 続柄。
 * - `adopted-as-real`：実子として数える養子（特別養子・配偶者の実子で養子になった人など。No.4170 の 3、相続税法 15 条 3 項）
 * - `adopted-grandchild`：孫養子（代襲でないので 2 割加算の対象。相続税法 18 条 2 項）
 * - `grandchild`：代襲相続の孫（`branch` で亡くなった子ごとに束ねる。実子として数え、2 割加算はかからない）
 */
export type Relation =
  | 'spouse'
  | 'child'
  | 'adopted'
  | 'adopted-as-real'
  | 'adopted-grandchild'
  | 'grandchild'
  | 'parent'
  | 'sibling'
  | 'half-sibling';

export const RELATION_LABELS: Record<Relation, string> = {
  spouse: '配偶者',
  child: '子',
  adopted: '養子',
  'adopted-as-real': '養子（実子として数える）',
  'adopted-grandchild': '孫養子',
  grandchild: '孫（代襲相続）',
  parent: '父母',
  sibling: '兄弟姉妹',
  'half-sibling': '兄弟姉妹（半血）',
};

export interface Person {
  id: string;
  relation: Relation;
  /** 代襲相続の孫：亡くなった子ごとの番号（同じ番号の孫で 1 人分の相続分を分ける） */
  branch?: number;
  /** 相続を放棄した */
  renounced?: boolean;
}

type Rank = 1 | 2 | 3;

function rankOf(r: Relation): Rank | 0 {
  switch (r) {
    case 'spouse':
      return 0;
    case 'parent':
      return 2;
    case 'sibling':
    case 'half-sibling':
      return 3;
    default:
      return 1;
  }
}

const isAdoptedCapped = (r: Relation) => r === 'adopted' || r === 'adopted-grandchild';

/** 配偶者の法定相続分（民法 900 条 1〜3 号。血族相続人がいなければ全部） */
function spouseShareFor(rank: Rank | null): Fraction {
  if (rank === 1) return frac(1, 2);
  if (rank === 2) return frac(2, 3);
  if (rank === 3) return frac(3, 4);
  return frac(1, 1);
}

/** その順位で相続人になる人（いちばん上の順位だけ） */
function topRank(people: readonly Person[]): Rank | null {
  const ranks = people.map((p) => rankOf(p.relation)).filter((r): r is Rank => r !== 0);
  return ranks.length === 0 ? null : (Math.min(...ranks) as Rank);
}

/**
 * 血族相続人の間の法定相続分（民法 900 条 4 号）。
 * 子は 1 人 1 単位、代襲の孫は亡くなった子 1 人分を頭数で分ける。兄弟姉妹は全血 2・半血 1 の重み。
 * `adoptedLimit` を渡すと、養子（上限の対象）を先頭からその人数だけ数える（相続税法 16 条の「総額用」）。
 */
function bloodShares(
  members: readonly Person[],
  rest: Fraction,
  adoptedLimit = Infinity,
): Map<string, Fraction> {
  const out = new Map<string, Fraction>();
  let adoptedSeen = 0;
  const counted = members.filter((p) => {
    if (!isAdoptedCapped(p.relation)) return true;
    adoptedSeen += 1;
    return adoptedSeen <= adoptedLimit;
  });
  // 単位：子（代襲の孫は枝ごとに 1）・父母は 1・兄弟姉妹は全血 2・半血 1
  const branches = new Map<number, Person[]>();
  let units = 0;
  const unitOf = new Map<string, number>();
  for (const p of counted) {
    if (p.relation === 'grandchild') {
      const b = p.branch ?? 0;
      if (!branches.has(b)) {
        branches.set(b, []);
        units += 1;
      }
      branches.get(b)!.push(p);
    } else {
      const w = p.relation === 'sibling' ? 2 : 1;
      unitOf.set(p.id, w);
      units += w;
    }
  }
  if (units === 0) return out;
  for (const p of counted) {
    if (p.relation === 'grandchild') {
      const size = branches.get(p.branch ?? 0)!.length;
      out.set(p.id, mul(rest, frac(1, units * size)));
    } else {
      out.set(p.id, mul(rest, frac(unitOf.get(p.id)!, units)));
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// 2 つの相続人の集合（レビュー #390 の必須 4）
//   総額用の相続人（LegalHeirs）：放棄がなかったものとした相続人。基礎控除・総額・非課税枠の人数はこちら
//   実際の取得者（Acquirer）：財産を取得する人。按分・2 割加算・各控除はこちら
// 型の `kind` を分けて、`totalTax()` に取得者を渡すとコンパイルで落ちるようにしている
// ─────────────────────────────────────────────

export interface LegalHeirs {
  kind: 'legal';
  /** 法定相続人の数（放棄を戻し、養子を上限で切った数。相続税法 15 条 2 項） */
  count: number;
  /** 相続税の総額を出すときの法定相続分（養子を上限で切った人数で民法 900 条を当てる。相続税法 16 条） */
  shares: Fraction[];
  /** 配偶者の法定相続分（放棄がなかったものとした場合。相続税法 19 条の 2 第 1 項 2 号イ）。配偶者がいなければ null */
  spouseShare: Fraction | null;
  /** 法定相続人に当たる人の id（放棄した人を含む。上限で数えなかった養子も含む） */
  memberIds: string[];
  /** 養子の人数・数えた人数（内訳の表示用） */
  adoptedTotal: number;
  adoptedCounted: number;
  /** 実子（実子として数える人を含む）がいるか */
  hasRealChild: boolean;
  /** 放棄した人の数（数えた人） */
  renouncedCounted: number;
}

/**
 * 法定相続人（総額用）を組み立てる。放棄を戻し、養子は実子ありで 1 人・なしで 2 人まで（相続税法 15 条 2 項）。
 * 実子として数える養子と代襲の孫は実子とみなす（同 3 項・No.4170 の 3）。
 */
export function legalHeirs(people: readonly Person[]): LegalHeirs {
  const spouse = people.find((p) => p.relation === 'spouse');
  const rank = topRank(people);
  const members = rank === null ? [] : people.filter((p) => rankOf(p.relation) === rank);
  const hasRealChild =
    rank === 1 && members.some((p) => p.relation === 'child' || p.relation === 'adopted-as-real' || p.relation === 'grandchild');
  const adoptedTotal = members.filter((p) => isAdoptedCapped(p.relation)).length;
  const limit = hasRealChild ? 1 : 2;
  const adoptedCounted = Math.min(adoptedTotal, limit);
  const countedMembers = members.length - adoptedTotal + adoptedCounted;

  const spouseShare = spouse ? spouseShareFor(rank) : null;
  const rest = spouse ? sub(frac(1, 1), spouseShare!) : frac(1, 1);
  const blood = bloodShares(members, rest, limit);
  const shares = [...(spouseShare ? [spouseShare] : []), ...blood.values()];

  const counted = new Set<string>([...(spouse ? [spouse.id] : []), ...blood.keys()]);
  return {
    kind: 'legal',
    count: countedMembers + (spouse ? 1 : 0),
    shares,
    spouseShare,
    memberIds: [...(spouse ? [spouse.id] : []), ...members.map((p) => p.id)],
    adoptedTotal,
    adoptedCounted,
    hasRealChild,
    renouncedCounted: people.filter((p) => p.renounced && counted.has(p.id)).length,
  };
}

/** 法定相続人の数（相続税法 15 条 2 項） */
export function legalHeirCount(people: readonly Person[]): number {
  return legalHeirs(people).count;
}

/** 基礎控除（3,000 万円 ＋ 600 万円 × 法定相続人の数） */
export function basicDeduction(heirCount: number): number {
  return BASIC_FIXED + BASIC_PER_HEIR * heirCount;
}

/**
 * 実際に相続する人の法定相続分（民法 900 条。放棄した人は初めから相続人でなかったものとする＝民法 939 条）。
 * 子が全員放棄すれば父母へ、父母もいなければ兄弟姉妹へ移る。「法定相続分どおり」の分け方に使う。
 */
export function civilShares(people: readonly Person[]): Map<string, Fraction> {
  const active = people.filter((p) => !p.renounced);
  const spouse = active.find((p) => p.relation === 'spouse');
  const rank = topRank(active);
  const members = rank === null ? [] : active.filter((p) => rankOf(p.relation) === rank);
  const spouseShare = spouse ? spouseShareFor(rank) : null;
  const rest = spouse ? sub(frac(1, 1), spouseShare!) : frac(1, 1);
  const out = bloodShares(members, rest);
  if (spouse) out.set(spouse.id, spouseShare!);
  return out;
}

// ─────────────────────────────────────────────
// 相続税の総額
// ─────────────────────────────────────────────

export function bracketFor(amount: number): Bracket {
  return BRACKETS.find((b) => amount <= b.upTo)!;
}

/** 速算表を当てた額（1 円未満切捨て） */
export function taxOnShare(amount: number): number {
  if (amount <= 0) return 0;
  const b = bracketFor(amount);
  return Math.max(0, Math.floor(amount * b.rate) - b.deduction);
}

export interface TotalTaxRow {
  share: Fraction;
  /** 法定相続分に応ずる取得金額（千円未満切捨て） */
  amount: number;
  bracket: Bracket;
  tax: number;
}

export interface TotalTax {
  taxableEstate: number;
  rows: TotalTaxRow[];
  total: number;
}

/** 相続税の総額：課税遺産総額 × 法定相続分 → 各人千円未満切捨て → 速算表 → 合計（No.4152 の 2） */
export function totalTax(taxableTotal: number, heirs: LegalHeirs): TotalTax {
  const taxableEstate = Math.max(0, taxableTotal - basicDeduction(heirs.count));
  const rows = heirs.shares.map((share) => {
    const amount = floorTo(applyFraction(taxableEstate, share), 1000);
    return { share, amount, bracket: bracketFor(amount), tax: taxOnShare(amount) };
  });
  return { taxableEstate, rows, total: rows.reduce((s, r) => s + r.tax, 0) };
}

// ─────────────────────────────────────────────
// 死亡保険金・死亡退職金の非課税枠
// ─────────────────────────────────────────────

/**
 * 非課税枠を受取額に応じて按分する（相続税法 12 条 1 項 6 号・7 号）。
 * 枠を使えるのは**相続人**（放棄した人・相続人以外は不可）。`eligible` が false の人は 0。
 * 返り値は id → 非課税になる額。
 */
export function exemptAmount(
  received: readonly { id: string; amount: number; eligible: boolean }[],
  heirCount: number,
  perHeir = INSURANCE_EXEMPT_PER_HEIR,
): Map<string, number> {
  const limit = perHeir * heirCount;
  const eligibleTotal = received.filter((r) => r.eligible).reduce((s, r) => s + r.amount, 0);
  const out = new Map<string, number>();
  for (const r of received) {
    if (!r.eligible || r.amount <= 0) out.set(r.id, 0);
    else if (eligibleTotal <= limit) out.set(r.id, r.amount);
    else out.set(r.id, Math.floor((limit * r.amount) / eligibleTotal));
  }
  return out;
}

// ─────────────────────────────────────────────
// 未成年者・障害者控除の年数
// ─────────────────────────────────────────────

/** 相続開始日から `age` 歳に達するまでの年数（1 年未満の端数は 1 年に切上げ）。達していれば 0 */
export function yearsUntilAge(birth: DateParts, inheritance: DateParts, age: number): number {
  const target = addMonths(birth, 12 * age);
  if (compareDate(inheritance, target) >= 0) return 0;
  let n = 1;
  while (compareDate(addMonths(inheritance, 12 * n), target) < 0) n += 1;
  return n;
}

export type DisabilityKind = 'general' | 'special';

// ─────────────────────────────────────────────
// 1 人ずつの税額
// ─────────────────────────────────────────────

export interface PersonInput {
  person: Person;
  /** 取得した遺産の額（正味。死亡保険金・退職金を除く） */
  acquired: number;
  /** 受け取った死亡保険金・死亡退職金 */
  insurance?: number;
  retirement?: number;
  /** 加算する生前贈与（暦年課税）の額と、その贈与税額 */
  addedGifts?: number;
  giftTaxPaid?: number;
  /** 生年月日（未成年者・障害者控除に使う） */
  birth?: DateParts | null;
  disability?: DisabilityKind | null;
}

export interface Acquirer {
  kind: 'acquirer';
  person: Person;
  acquired: number;
  insurance: number;
  insuranceExempt: number;
  retirement: number;
  retirementExempt: number;
  addedGifts: number;
  /** 課税価格（千円未満切捨て） */
  taxable: number;
  /** 法定相続人（放棄がなかったものとした場合）に当たるか。未成年者・障害者控除の要件 */
  isLegalHeir: boolean;
  /** 按分した税額 */
  allocated: number;
  /** 2 割加算 */
  surcharge: number;
  /** 暦年課税分の贈与税額控除 */
  giftCredit: number;
  /** 配偶者の税額軽減 */
  spouseRelief: number;
  /** 未成年者控除（引けた額）と、引ききれなかった額 */
  minorCredit: number;
  minorUnused: number;
  disabledCredit: number;
  disabledUnused: number;
  /** 納付税額（100 円未満切捨て） */
  payable: number;
}

/** 2 割加算の対象か（一親等の血族・代襲の孫・配偶者以外。孫養子は代襲でない限り対象。相続税法 18 条） */
export function hasSurcharge(r: Relation): boolean {
  return !(r === 'spouse' || r === 'child' || r === 'adopted' || r === 'adopted-as-real' || r === 'grandchild' || r === 'parent');
}

export type Verdict =
  /** 課税価格の合計 ≦ 基礎控除 */
  | 'below-basic'
  /** 総額は出るが、配偶者の税額軽減で全員の納付税額が 0 */
  | 'zero-by-spouse-relief'
  | 'tax';

export interface InheritanceInput {
  people: readonly Person[];
  inputs: readonly PersonInput[];
  inheritanceDate: DateParts;
}

export interface InheritanceResult {
  heirs: LegalHeirs;
  basic: number;
  taxableTotal: number;
  total: TotalTax;
  acquirers: Acquirer[];
  payableTotal: number;
  verdict: Verdict;
}

/**
 * 1 人ずつの税額（No.4152 の 3・4）。
 * 按分 → 2 割加算 → 贈与税額控除 → 配偶者の税額軽減 → 未成年者控除 → 障害者控除 の順に引き、各段の値を全部返す。
 * 按分割合は 各人の課税価格 ÷ 課税価格の合計 をそのまま使う（実務の小数点以下 2 位の調整はしない）。
 * 未成年者・障害者控除の扶養義務者への振替はしない（引ききれない額を返すだけ）。
 * 法定相続人が 0 人なら null（相続人がいない場合は対象外）。
 */
export function perHeirTax({ people, inputs, inheritanceDate }: InheritanceInput): InheritanceResult | null {
  const heirs = legalHeirs(people);
  if (heirs.count === 0) return null;
  const legalIds = new Set(heirs.memberIds);
  const civil = civilShares(people);

  // 非課税枠は「相続人」だけ。放棄した人・相続人でない人は枠なし（No.4114・No.4117）
  const eligible = (p: Person) => civil.has(p.id);
  const insExempt = exemptAmount(
    inputs.map((i) => ({ id: i.person.id, amount: i.insurance ?? 0, eligible: eligible(i.person) })),
    heirs.count,
    INSURANCE_EXEMPT_PER_HEIR,
  );
  const retExempt = exemptAmount(
    inputs.map((i) => ({ id: i.person.id, amount: i.retirement ?? 0, eligible: eligible(i.person) })),
    heirs.count,
    RETIREMENT_EXEMPT_PER_HEIR,
  );

  const base = inputs.map((i) => {
    const insurance = i.insurance ?? 0;
    const retirement = i.retirement ?? 0;
    const addedGifts = i.addedGifts ?? 0;
    const insuranceExempt = insExempt.get(i.person.id) ?? 0;
    const retirementExempt = retExempt.get(i.person.id) ?? 0;
    const raw = Math.max(0, i.acquired + insurance - insuranceExempt + retirement - retirementExempt) + addedGifts;
    return { i, insurance, retirement, addedGifts, insuranceExempt, retirementExempt, taxable: floorTo(raw, 1000) };
  });

  const taxableTotal = base.reduce((s, b) => s + b.taxable, 0);
  const total = totalTax(taxableTotal, heirs);
  const basic = basicDeduction(heirs.count);

  // 配偶者の税額軽減の上限（相続税法 19 条の 2 第 1 項 2 号）
  const spouseLegalAmount = (() => {
    if (!heirs.spouseShare) return 0;
    const byShare = applyFraction(taxableTotal, heirs.spouseShare);
    return Math.max(byShare, SPOUSE_RELIEF_FLOOR);
  })();

  const acquirers: Acquirer[] = base
    .filter((b) => b.taxable > 0)
    .map((b) => {
      const p = b.i.person;
      const allocated = taxableTotal > 0 ? Math.floor((total.total * b.taxable) / taxableTotal) : 0;
      const surcharge = hasSurcharge(p.relation) ? Math.floor(allocated * SURCHARGE_RATE) : 0;
      const giftCredit = Math.min(b.i.giftTaxPaid ?? 0, allocated + surcharge);
      let remaining = allocated + surcharge - giftCredit;

      let spouseRelief = 0;
      if (p.relation === 'spouse' && taxableTotal > 0) {
        const relief = Math.floor((total.total * Math.min(b.taxable, spouseLegalAmount)) / taxableTotal);
        spouseRelief = Math.min(relief, remaining);
        remaining -= spouseRelief;
      }

      const isLegalHeir = legalIds.has(p.id);
      const minorFull =
        isLegalHeir && b.i.birth ? MINOR_PER_YEAR * yearsUntilAge(b.i.birth, inheritanceDate, MINOR_AGE) : 0;
      const minorCredit = Math.min(minorFull, remaining);
      remaining -= minorCredit;

      const disabledFull =
        isLegalHeir && b.i.birth && b.i.disability
          ? DISABLED_PER_YEAR[b.i.disability] * yearsUntilAge(b.i.birth, inheritanceDate, DISABLED_AGE)
          : 0;
      const disabledCredit = Math.min(disabledFull, remaining);
      remaining -= disabledCredit;

      return {
        kind: 'acquirer' as const,
        person: p,
        acquired: b.i.acquired,
        insurance: b.insurance,
        insuranceExempt: b.insuranceExempt,
        retirement: b.retirement,
        retirementExempt: b.retirementExempt,
        addedGifts: b.addedGifts,
        taxable: b.taxable,
        isLegalHeir,
        allocated,
        surcharge,
        giftCredit,
        spouseRelief,
        minorCredit,
        minorUnused: minorFull - minorCredit,
        disabledCredit,
        disabledUnused: disabledFull - disabledCredit,
        payable: floorTo(remaining, 100),
      };
    });

  const payableTotal = acquirers.reduce((s, a) => s + a.payable, 0);
  const verdict: Verdict =
    taxableTotal <= basic
      ? 'below-basic'
      : payableTotal === 0 && acquirers.some((a) => a.spouseRelief > 0)
        ? 'zero-by-spouse-relief'
        : 'tax';

  return { heirs, basic, taxableTotal, total, acquirers, payableTotal, verdict };
}

// ─────────────────────────────────────────────
// 画面の文言（結果の 3 通り。レビュー #390 の必須 2）
// ─────────────────────────────────────────────

export const VERDICT_MESSAGES: Record<Verdict, string> = {
  'below-basic': '相続税はかかりません。',
  'zero-by-spouse-relief': '納める相続税は0円ですが、配偶者の税額軽減を受けるには申告が必要です。',
  tax: '相続税がかかります。',
};

/** 課税価格の合計が基礎控除以下のときに**必ず**添える 1 行（ツールからは特例を使ったかが分からない） */
export const SMALL_LAND_NOTE = '小規模宅地等の特例を使ってこの額になった場合は、申告が必要です。';

/** 結果のすぐ下に置く免責（省略しない。税理士法 52 条の線） */
export const DISCLAIMER = '概算です。財産の評価や特例の適用は、税理士または税務署に確認してください。';

/** 法定相続人の数の内訳（「養子 3 人のうち 1 人を数えました（実子がいるため）」など） */
export function heirCountNotes(heirs: LegalHeirs): string[] {
  const notes: string[] = [];
  if (heirs.adoptedTotal > heirs.adoptedCounted) {
    notes.push(
      `養子${heirs.adoptedTotal}人のうち${heirs.adoptedCounted}人を数えました（${heirs.hasRealChild ? '実子がいるため1人まで' : '実子がいないため2人まで'}）`,
    );
  }
  if (heirs.renouncedCounted > 0) notes.push(`放棄した${heirs.renouncedCounted}人も数えました（放棄がなかったものとして数えます）`);
  return notes;
}

/** 分数の表示（'1/2'） */
export function formatFraction(f: Fraction): string {
  return f.den === 1 ? `${f.num}` : `${f.num}/${f.den}`;
}
