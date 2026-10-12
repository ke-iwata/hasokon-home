/**
 * ローン返済シミュレーションの計算ロジック
 *
 * 仕様: docs/features/loan-hensai-simulation.md
 *
 * 借入額・金利・年数から、毎月の返済額・総返済額・利息の合計・年末残高を出す。
 * 元利均等／元金均等・ボーナス払い・繰上返済（期間短縮／返済額軽減）・
 * 金利の変化（変動金利の5年ルール・125%ルールを当てる／当てない）を扱う。
 *
 * ■ 端数の規則（仕様書「計算」）
 * - 毎月の利息は円未満切り捨て、返済額も円未満切り捨て、**最終回で残りを精算**する。
 *   金融機関によって数円ずれる（ページにも書く）
 * - 金利は 0.001% 刻みの整数（`rateMilli`：1.0% → 1000）で持ち、利息は整数の割り算で出す。
 *   年利 ÷ 12 を浮動小数で回すと、切り捨ての直前で 1 円ずれることがあるため
 *
 * ■ 5年ルール・125%ルールは法令ではなく金融機関の約定
 * 多くの金融機関の変動金利型（元利均等）で採られているが、採っていない商品もある。
 * **元利均等だけに当てる**（元金均等は元金の返済額が一定なので、利息だけを引き直す）。
 *
 * ■ 法令の数字は持たない
 * 住宅ローン控除の控除率・借入限度額は `lib/jutaku-loan-kojo.ts` が持っている値を使う
 * （本ツールで二重に持たない）。ここにあるのは算数だけ。
 */

import {
  CREDIT_RATE,
  ECO_GRADES,
  HOUSE_KINDS,
  MOVE_IN_YEARS,
  RESIDENT_CAP_MAX,
  limitRow,
} from '@/lib/jutaku-loan-kojo';

/** この結果は試算である旨の固定文（仕様書「ページ」。計算機の直下に出し、テストで存在を確かめる） */
export const DISCLAIMER =
  'この結果は試算です。実際の返済額は金融機関の約定や端数の処理で異なります。借入の判断は金融機関に確認してください。';

/** 返済方式 */
export type Method = 'ganri' | 'gankin';

export const METHOD_LABEL: Record<Method, string> = {
  ganri: '元利均等',
  gankin: '元金均等',
};

/** 繰上返済の型 */
export type PrepayType = 'shorten' | 'reduce';

export const PREPAY_TYPE_LABEL: Record<PrepayType, string> = {
  shorten: '期間短縮',
  reduce: '返済額軽減',
};

/** 入力の範囲（仕様書「入力」） */
export const YEARS_MIN = 1;
export const YEARS_MAX = 50;
export const RATE_MAX_PERCENT = 15;
/** ボーナス払いに回せるのは借入額の 50% まで */
export const BONUS_RATIO_MAX = 0.5;
/** 金利の変化は最大 5 段 */
export const RATE_CHANGES_MAX = 5;
/** 5年ルール：返済額の見直しは 60 回（5 年）ごと */
export const REVIEW_EVERY_MONTHS = 60;
/** 125%ルール：見直し後の返済額は前回の 1.25 倍まで */
export const CAP_RATIO_NUM = 125;
export const CAP_RATIO_DEN = 100;

/** 繰上返済 1 回分。`afterPayment` 回目の返済の後に、元金へ `amount` 円を充てる */
export interface Prepayment {
  afterPayment: number;
  amount: number;
  type: PrepayType;
}

/** 金利の変化 1 段。`fromPayment` 回目の返済から年 `ratePercent`% になる */
export interface RateChange {
  fromPayment: number;
  ratePercent: number;
}

export interface LoanInput {
  /** 借入額（円）。ボーナス払いの分を含む */
  principal: number;
  /** 返済期間（年） */
  years: number;
  /** 当初の金利（年 %） */
  ratePercent: number;
  method: Method;
  /** 借入額のうちボーナス払いに回す額（円）。年 2 回 */
  bonusPrincipal?: number;
  prepayments?: Prepayment[];
  rateChanges?: RateChange[];
  /** 5年ルール・125%ルールを当てるか（元利均等のときだけ効く） */
  rule125?: boolean;
}

/** 1 回分の返済（月の分・ボーナスの分それぞれ） */
export interface Installment {
  /** その返済の何回目か（ボーナスはボーナスの回数で数える） */
  k: number;
  /** その返済の月が、返済開始から数えて何か月目か（1 始まり） */
  month: number;
  rateMilli: number;
  payment: number;
  interest: number;
  /** その回に払った利息（未払利息の返済を含む） */
  interestPaid: number;
  principalPaid: number;
  /** 返済後の元金の残高 */
  balance: number;
  /** 返済後の未払利息 */
  unpaid: number;
  /** その回の後に繰上返済した額 */
  prepaid: number;
  isFinal: boolean;
}

/** 5年ルールの見直し・金利の変化による返済額の引き直し 1 回分 */
export interface Review {
  k: number;
  month: number;
  /** 引き直した額（上限をかける前） */
  computed: number;
  /** 125%ルールの上限。ルールを当てないときは null */
  cap: number | null;
  /** 実際に使う返済額 */
  payment: number;
}

export interface TrancheResult {
  rows: Installment[];
  reviews: Review[];
  /** 初回の返済額 */
  firstPayment: number;
  /** 最終回の返済額 */
  finalPayment: number;
  totalPaid: number;
  totalInterest: number;
  totalPrepaid: number;
  /** 未払利息がいちばん多かったときの額 */
  maxUnpaid: number;
  /** 最終回の月（返済開始から数えて） */
  lastMonth: number;
  count: number;
}

export interface LoanResult {
  method: Method;
  monthly: TrancheResult;
  /** ボーナス払いが無いときは null */
  bonus: TrancheResult | null;
  /** 初回（1 か月目）の毎月の返済額 */
  firstMonthlyPayment: number;
  /** 初回のボーナス月の加算額（ボーナス払いが無いときは 0） */
  firstBonusPayment: number;
  /** 総返済額（繰上返済の額を含む） */
  totalPaid: number;
  totalInterest: number;
  /** 最後の返済の月（返済開始から数えて） */
  lastMonth: number;
  /** 当初の予定の返済月数 */
  plannedMonths: number;
  /** 最初の 12 か月の返済額の合計（返済負担率の分子） */
  firstYearPaid: number;
}

/** 年 % を 0.001% 刻みの整数にする（1.0 → 1000） */
export function toRateMilli(ratePercent: number): number {
  return Math.round(ratePercent * 1000);
}

/** 1 回分の利息（円未満切り捨て）。`mult` は月の分なら 1、ボーナス（半年ごと）なら 6 */
export function periodInterest(balance: number, rateMilli: number, mult = 1): number {
  // 年利 rateMilli / 100,000、月利はその 1/12
  return Math.floor((balance * rateMilli * mult) / 1_200_000);
}

/**
 * 元利均等の 1 回あたりの返済額（円未満切り捨て）。
 * P·r / (1 − (1 + r)^−n)。r = 0 のときは P / n。
 */
export function annuityPayment(principal: number, count: number, rateMilli: number, mult = 1): number {
  if (count <= 0) return principal;
  if (rateMilli === 0) return Math.floor(principal / count);
  const r = (rateMilli * mult) / 1_200_000;
  const v = (principal * r) / (1 - Math.pow(1 + r, -count));
  // 浮動小数の誤差で整数のすぐ下に落ちるのを避ける
  return Math.floor(v + 1e-7);
}

interface TrancheSpec {
  principal: number;
  count: number;
  /** k 回目が何か月目か */
  monthOf: (k: number) => number;
  /** 1 回あたりの月数（月の分 1・ボーナス 6） */
  mult: number;
  /** 5年ルールの見直しの間隔（回数） */
  reviewEvery: number;
  method: Method;
  rule125: boolean;
  rateAt: (month: number) => number;
  prepayments: Map<number, Prepayment[]>;
}

/** 返済額 `payment` のまま、残高を返しきるまでに何回かかるか（期間短縮の繰上返済で使う） */
function countToPayoff(balance: number, payment: number, rateMilli: number, mult: number, limit: number): number {
  let b = balance;
  for (let m = 1; m <= limit; m += 1) {
    const i = periodInterest(b, rateMilli, mult);
    if (payment >= b + i) return m;
    if (payment <= i) return limit;
    b -= payment - i;
  }
  return limit;
}

function runTranche(spec: TrancheSpec): TrancheResult {
  const { principal, count, monthOf, mult, reviewEvery, method, rule125, rateAt, prepayments } = spec;
  const rows: Installment[] = [];
  const reviews: Review[] = [];
  let bal = principal;
  let unpaid = 0;
  let termEnd = count;
  let lastRate = rateAt(monthOf(1));
  let payment = annuityPayment(bal, termEnd, lastRate, mult);
  let principalPer = Math.floor(principal / count);
  let maxUnpaid = 0;
  let totalPaid = 0;
  let totalPrepaid = 0;

  for (let k = 1; k <= termEnd && bal + unpaid > 0; k += 1) {
    const month = monthOf(k);
    const rate = rateAt(month);
    const remaining = termEnd - k + 1;

    if (method === 'ganri') {
      if (rule125) {
        // 5年ルール：61・121…回目（月の分）に見直す。見直しまでは金利が変わっても返済額は据え置き
        if (k > 1 && (k - 1) % reviewEvery === 0) {
          const computed = annuityPayment(bal + unpaid, remaining, rate, mult);
          const cap = Math.floor((payment * CAP_RATIO_NUM) / CAP_RATIO_DEN);
          const next = Math.min(computed, cap);
          if (next !== payment || computed !== payment) {
            reviews.push({ k, month, computed, cap, payment: next });
          }
          payment = next;
        }
      } else if (rate !== lastRate) {
        const computed = annuityPayment(bal + unpaid, remaining, rate, mult);
        reviews.push({ k, month, computed, cap: null, payment: computed });
        payment = computed;
      }
    }
    lastRate = rate;

    const interest = periodInterest(bal, rate, mult);
    let row: Installment;
    const isFinal =
      k === termEnd ||
      (method === 'ganri' ? payment >= bal + unpaid + interest : principalPer >= bal);
    if (isFinal) {
      const pay = bal + unpaid + interest;
      row = {
        k, month, rateMilli: rate, payment: pay, interest, interestPaid: unpaid + interest,
        principalPaid: bal, balance: 0, unpaid: 0, prepaid: 0, isFinal: true,
      };
      bal = 0;
      unpaid = 0;
    } else if (method === 'ganri') {
      // まず未払利息、次にその回の利息、残りを元金へ
      let avail = payment;
      const payUnpaid = Math.min(unpaid, avail);
      avail -= payUnpaid;
      unpaid -= payUnpaid;
      const payInterest = Math.min(interest, avail);
      avail -= payInterest;
      unpaid += interest - payInterest;
      bal -= avail;
      row = {
        k, month, rateMilli: rate, payment, interest, interestPaid: payUnpaid + payInterest,
        principalPaid: avail, balance: bal, unpaid, prepaid: 0, isFinal: false,
      };
    } else {
      bal -= principalPer;
      row = {
        k, month, rateMilli: rate, payment: principalPer + interest, interest, interestPaid: interest,
        principalPaid: principalPer, balance: bal, unpaid: 0, prepaid: 0, isFinal: false,
      };
    }
    maxUnpaid = Math.max(maxUnpaid, row.unpaid);
    totalPaid += row.payment;

    // 繰上返済：その回の返済の後に元金へ充てる（手数料は扱わない）
    const pre = row.isFinal ? undefined : prepayments.get(k);
    if (pre) {
      for (const p of pre) {
        if (bal <= 0) break;
        const amount = Math.min(Math.max(0, Math.floor(p.amount)), bal);
        bal -= amount;
        row.prepaid += amount;
        row.balance = bal;
        totalPrepaid += amount;
        totalPaid += amount;
        if (bal <= 0) break;
        const left = termEnd - k;
        if (p.type === 'reduce') {
          if (method === 'ganri') payment = annuityPayment(bal + unpaid, left, rate, mult);
          else principalPer = Math.floor(bal / left);
        } else if (method === 'ganri') {
          termEnd = k + countToPayoff(bal, payment, rate, mult, left);
        } else {
          termEnd = k + Math.min(left, Math.ceil(bal / principalPer));
        }
      }
      if (bal <= 0 && unpaid <= 0) row.isFinal = true;
    }
    rows.push(row);
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    reviews,
    firstPayment: rows[0]?.payment ?? 0,
    finalPayment: last?.payment ?? 0,
    totalPaid,
    totalInterest: totalPaid - principal,
    totalPrepaid,
    maxUnpaid,
    lastMonth: last?.month ?? 0,
    count: rows.length,
  };
}

/** 入力が計算できる範囲か。読めない・範囲外なら理由を返す */
export function validate(input: LoanInput): string | null {
  const { principal, years, ratePercent } = input;
  const bonus = input.bonusPrincipal ?? 0;
  if (![principal, years, ratePercent, bonus].every(Number.isFinite)) return '数字を入れてください';
  if (principal <= 0) return '借入額を入れてください';
  if (!Number.isInteger(years) || years < YEARS_MIN || years > YEARS_MAX) {
    return `返済期間は${YEARS_MIN}〜${YEARS_MAX}年で入れてください`;
  }
  if (ratePercent < 0 || ratePercent > RATE_MAX_PERCENT) return `金利は0〜${RATE_MAX_PERCENT}%で入れてください`;
  if (bonus < 0 || bonus > principal * BONUS_RATIO_MAX) return 'ボーナス払いの分は借入額の50%までです';
  for (const c of input.rateChanges ?? []) {
    if (!Number.isFinite(c.ratePercent) || c.ratePercent < 0 || c.ratePercent > RATE_MAX_PERCENT) {
      return `変化後の金利は0〜${RATE_MAX_PERCENT}%で入れてください`;
    }
  }
  return null;
}

/** 返済の月数ごとの金利を返す関数を作る */
export function rateSchedule(ratePercent: number, changes: RateChange[] = []): (month: number) => number {
  const base = toRateMilli(ratePercent);
  const sorted = [...changes]
    .filter((c) => Number.isFinite(c.fromPayment) && c.fromPayment >= 1)
    .sort((a, b) => a.fromPayment - b.fromPayment)
    .slice(0, RATE_CHANGES_MAX);
  return (month: number) => {
    let r = base;
    for (const c of sorted) if (c.fromPayment <= month) r = toRateMilli(c.ratePercent);
    return r;
  };
}

/** ローン返済のシミュレーション。入力が範囲外なら null */
export function simulate(input: LoanInput): LoanResult | null {
  if (validate(input)) return null;
  const principal = Math.floor(input.principal);
  const bonusPrincipal = Math.floor(input.bonusPrincipal ?? 0);
  const months = input.years * 12;
  const rateAt = rateSchedule(input.ratePercent, input.rateChanges);
  // 5年ルール・125%ルールは元利均等で、金利の変化を入れたときだけ当てる。
  // 金利が変わらないのに見直しで引き直すと、端数で 1 円ずつ動いて最終回の額がずれる
  const rule125 =
    input.method === 'ganri' && (input.rule125 ?? false) && (input.rateChanges ?? []).length > 0;

  const prepayments = new Map<number, Prepayment[]>();
  for (const p of input.prepayments ?? []) {
    if (!Number.isFinite(p.afterPayment) || !Number.isFinite(p.amount) || p.amount <= 0) continue;
    const k = Math.floor(p.afterPayment);
    if (k < 1 || k >= months) continue;
    prepayments.set(k, [...(prepayments.get(k) ?? []), p]);
  }

  const monthly = runTranche({
    principal: principal - bonusPrincipal,
    count: months,
    monthOf: (k) => k,
    mult: 1,
    reviewEvery: REVIEW_EVERY_MONTHS,
    method: input.method,
    rule125,
    rateAt,
    prepayments,
  });
  // ボーナス払い分は半年ごとの返済として別に回す（6・12・18…か月目）。
  // 5年ルール・125%ルールも月の分とは別に、10 回（5 年）ごとに当てる
  const bonus =
    bonusPrincipal > 0
      ? runTranche({
          principal: bonusPrincipal,
          count: input.years * 2,
          monthOf: (k) => k * 6,
          mult: 6,
          reviewEvery: REVIEW_EVERY_MONTHS / 6,
          method: input.method,
          rule125,
          rateAt,
          prepayments: new Map(),
        })
      : null;

  const firstYearPaid =
    monthly.rows.filter((r) => r.month <= 12).reduce((s, r) => s + r.payment, 0) +
    (bonus?.rows.filter((r) => r.month <= 12).reduce((s, r) => s + r.payment, 0) ?? 0);
  const totalPaid = monthly.totalPaid + (bonus?.totalPaid ?? 0);
  return {
    method: input.method,
    monthly,
    bonus,
    firstMonthlyPayment: monthly.firstPayment,
    firstBonusPayment: bonus?.firstPayment ?? 0,
    totalPaid,
    totalInterest: totalPaid - principal,
    lastMonth: Math.max(monthly.lastMonth, bonus?.lastMonth ?? 0),
    plannedMonths: months,
    firstYearPaid,
  };
}

/** `month` か月目の返済の後の元金の残高（月の分＋ボーナスの分） */
export function balanceAfter(result: LoanResult, month: number): number {
  const pick = (t: TrancheResult | null, initial: number) => {
    if (!t) return 0;
    let b = initial;
    for (const r of t.rows) {
      if (r.month > month) break;
      b = r.balance;
    }
    return b;
  };
  const monthlyInitial = (result.monthly.rows[0]?.balance ?? 0) + (result.monthly.rows[0]?.principalPaid ?? 0) + (result.monthly.rows[0]?.prepaid ?? 0);
  const bonusInitial = result.bonus
    ? (result.bonus.rows[0]?.balance ?? 0) + (result.bonus.rows[0]?.principalPaid ?? 0) + (result.bonus.rows[0]?.prepaid ?? 0)
    : 0;
  return pick(result.monthly, monthlyInitial) + pick(result.bonus, bonusInitial);
}

/** 住宅ローン控除の目安（年末残高 × 控除率。円未満切り捨て）。上限の目安であって実際の控除額ではない */
export function kojoEstimate(yearEndBalance: number): number {
  return Math.floor(yearEndBalance * CREDIT_RATE);
}

export interface YearEndRow {
  year: number;
  /** その年の最後の返済の後の残高 */
  balance: number;
  /** 年末残高 × 0.7%（住宅ローン控除の上限の目安） */
  kojo: number;
}

/**
 * 年末残高の表。返済開始年月（`startYear` 年 `startMonth` 月が 1 回目）から、完済の年まで。
 * 1 回目より前の月しかない年は無い（開始の年から始める）。
 */
export function yearEndTable(result: LoanResult, startYear: number, startMonth: number): YearEndRow[] {
  const rows: YearEndRow[] = [];
  const lastCal = startMonth - 1 + result.lastMonth; // 0 始まりの通し月（開始年の 1 月 = 0）
  const endYear = startYear + Math.floor((lastCal - 1) / 12);
  for (let y = startYear; y <= endYear; y += 1) {
    // その年の 12 月が何か月目の返済か
    const decIndex = (y - startYear) * 12 + 12 - startMonth + 1;
    const balance = balanceAfter(result, Math.min(decIndex, result.lastMonth));
    rows.push({ year: y, balance, kojo: kojoEstimate(balance) });
  }
  return rows;
}

/** 返済負担率（年間返済額 ÷ 税込年収）。年収が無ければ null。目安の数字は示さない */
export function burdenRatio(result: LoanResult, annualIncome: number): number | null {
  if (!Number.isFinite(annualIncome) || annualIncome <= 0) return null;
  return result.firstYearPaid / annualIncome;
}

export interface Comparison {
  ganri: LoanResult;
  gankin: LoanResult;
}

/** 元利均等と元金均等を同じ条件で並べる */
export function compareMethods(input: LoanInput): Comparison | null {
  const ganri = simulate({ ...input, method: 'ganri' });
  const gankin = simulate({ ...input, method: 'gankin' });
  if (!ganri || !gankin) return null;
  return { ganri, gankin };
}

export interface PrepayEffect {
  /** 短くなった月数（期間短縮） */
  monthsShortened: number;
  /** 減った利息 */
  interestSaved: number;
  /** 最後の繰上返済の前後での毎月の返済額の差（返済額軽減。下がった分を正で返す） */
  paymentDrop: number;
  /** 最後の繰上返済の後の毎月の返済額 */
  paymentAfter: number;
}

/** 繰上返済の効果。繰上返済の無い同じ条件と比べる */
export function prepayEffect(input: LoanInput): PrepayEffect | null {
  const pre = input.prepayments ?? [];
  if (pre.length === 0) return null;
  const withPre = simulate(input);
  const without = simulate({ ...input, prepayments: [] });
  if (!withPre || !without) return null;
  const lastAfter = Math.max(...pre.map((p) => Math.floor(p.afterPayment)));
  const rowAfter = withPre.monthly.rows.find((r) => r.k === lastAfter + 1);
  const rowBefore = without.monthly.rows.find((r) => r.k === lastAfter + 1);
  const paymentAfter = rowAfter?.payment ?? 0;
  return {
    monthsShortened: without.monthly.lastMonth - withPre.monthly.lastMonth,
    interestSaved: without.totalInterest - withPre.totalInterest,
    paymentDrop: rowAfter && rowBefore ? rowBefore.payment - rowAfter.payment : 0,
    paymentAfter,
  };
}

/** 住宅ローン控除の借入限度額の幅（`lib/jutaku-loan-kojo.ts` の表から取る。0 = 対象外は除く） */
export function kojoLimitRange(): { min: number; max: number; years: number[] } {
  const limits: number[] = [];
  const years = new Set<number>();
  for (const k of HOUSE_KINDS) {
    for (const g of ECO_GRADES) {
      for (const y of MOVE_IN_YEARS) {
        const { row } = limitRow(k.value, g.value, y);
        if (row.years > 0) {
          limits.push(row.limit, row.limitTokurei);
          years.add(row.years);
        }
      }
    }
  }
  return {
    min: Math.min(...limits),
    max: Math.max(...limits),
    years: [...years].sort((a, b) => b - a),
  };
}

/** 住民税からの控除の上限（`lib/jutaku-loan-kojo.ts` から取る） */
export const KOJO_RESIDENT_CAP = RESIDENT_CAP_MAX;
/** 住宅ローン控除の控除率（表示用） */
export const KOJO_RATE = CREDIT_RATE;

/** 何年何か月の表記 */
export function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}か月`;
  if (m === 0) return `${y}年`;
  return `${y}年${m}か月`;
}

export function formatYen(v: number): string {
  return `${Math.round(v).toLocaleString('ja-JP')}円`;
}

/** 入力欄の文字列を数値に（カンマ・全角数字を許す。空は NaN） */
export function parseNumber(raw: string): number {
  const s = raw
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, '');
  if (s === '') return NaN;
  return Number(s);
}
