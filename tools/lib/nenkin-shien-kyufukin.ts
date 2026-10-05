/**
 * 年金生活者支援給付金 対象判定・月額 計算ロジック
 *
 * 仕様: docs/features/nenkin-seikatsusha-shien-kyufukin.md
 *
 * 一次情報（日本年金機構。確認日は `DATA_CHECKED_AT`）:
 * - 「年金生活者支援給付金の支給要件」（FAQ）
 *   https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/shikyuyouken/shikyuyouken01.html
 * - 「年金生活者支援給付金の金額」（FAQ）
 *   https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/shikyuyouken/shikyuyouken03.html
 * - 「令和8年度の年金生活者支援給付金の計算」（FAQ。式・端数処理・計算例）
 *   https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/kaiteitsuchi/keisan.html
 * - 「老齢（補足的老齢）年金生活者支援給付金の概要」（昭和16年4月1日以前生まれは 480 月を短縮）
 *   https://www.nenkin.go.jp/service/jukyu/seido/sonota-kyufu/shienkyufukin/rourei.html
 * - 年金生活者支援給付金の支給に関する法律（平成24年法律第102号）
 *
 * **端数処理**：年金機構の計算ページのとおり「50銭未満は切り捨て、50銭以上1円未満は1円に切り上げ」。
 * 老齢は納付済分と免除分を**それぞれ**丸めてから足す（年金機構の計算例
 * 「240 月 + 免除 60 月 → 2,810 円 + 1,471 円 = 4,281 円」と同じ順序）。
 * 補足的老齢は式全体（基準額 × 納付済 / 被保険者月数 × 調整支給率）を最後に 1 回丸める。
 *
 * すべて純関数で、DOM・React・現在時刻に依存しない（基準日は呼び出し側が渡す）。
 */

import { addDays, compareDate, isValidDate, type DateParts } from './date-parts';

// ------------------------------------------------------------ 制度データ

/** 生年月日の区分ごとの額（昭和31年4月1日の前後で違う） */
export interface BirthBand {
  /** 老齢の所得基準額（円） */
  incomeLimit: number;
  /** 全額・3/4・半額免除の 1 月あたりの単価（老齢基礎年金満額の 1/6） */
  exemptFull: number;
  /** 1/4 免除の 1 月あたりの単価（同 1/12） */
  exemptQuarter: number;
}

/** 1 年度分の制度データ。支給は 10 月分〜翌年 9 月分で入れ替わる */
export interface FiscalYearData {
  /** 年度（4 月始まり。2026 は令和8年度） */
  fiscalYear: number;
  /** この所得基準額が使われる最初の月（'YYYY-MM'） */
  from: string;
  /** 最後の月 */
  to: string;
  /** 給付基準額（老齢・障害2級・遺族。月額） */
  baseAmount: number;
  /** 障害1級の月額（給付基準額の 1.25 倍） */
  shogai1: number;
  /** 昭和31年4月2日以後生まれ */
  after: BirthBand;
  /** 昭和31年4月1日以前生まれ */
  before: BirthBand;
  /** 補足的老齢給付金が出る幅（所得基準額 ＋ この額まで） */
  supplementWidth: number;
  /** 障害・遺族の所得制限（扶養親族 0 人） */
  shogaiIzokuLimit: number;
  /**
   * 扶養親族 1 人あたりの所得制限の加算（目安）。老人控除対象配偶者・老人扶養親族は 48 万円、
   * 特定扶養親族等は 63 万円と大きくなるが、初版は種類を聞かずに 38 万円で数える（仕様書「やらないこと」）
   */
  dependentAddition: number;
}

/**
 * 【データ更新箇所】令和8年度（2026年10月分〜2027年9月分）。
 *
 * **毎年 9 月に、翌年度分（1 月の年金額改定で決まり、10 月分から使う）を `FY2027` として足す。**
 * 所得基準額は 10 月分から、給付基準額は 4 月分から改定されるが、本ツールは
 * 「緑の封筒が届く 10 月分から」の 1 年を 1 つの定数で持つ。
 * 足し忘れると `tests/nenkin-shien-kyufukin.test.ts` の年度ガードが 2027-10-01 以降に落ちる
 */
export const FY2026: FiscalYearData = {
  fiscalYear: 2026,
  from: '2026-10',
  to: '2027-09',
  baseAmount: 5_620,
  shogai1: 7_025,
  after: { incomeLimit: 826_500, exemptFull: 11_768, exemptQuarter: 5_884 },
  before: { incomeLimit: 824_100, exemptFull: 11_734, exemptQuarter: 5_867 },
  supplementWidth: 100_000,
  shogaiIzokuLimit: 4_918_000,
  dependentAddition: 380_000,
};

/** 持っている年度のデータ（新しい年度を足したら `CURRENT` も差し替える） */
export const FISCAL_YEARS: readonly FiscalYearData[] = [FY2026];

/** 画面・本文で使う年度 */
export const CURRENT: FiscalYearData = FY2026;

/** 制度データを最後に一次情報と突き合わせた日 */
export const DATA_CHECKED_AT = '2026-10-05';

/** 9 月分までの所得基準額（令和7年度。本文の「上がった」の説明だけに使う） */
export const PREVIOUS_INCOME_LIMIT = 809_000;

/** 老齢の被保険者月数（昭和16年4月2日以後生まれ） */
export const FULL_INSURED_MONTHS = 480;

/** 昭和31年4月1日。これ以前生まれは基準額・免除単価が「以前」の区分 */
const SHOWA31_0401: DateParts = { year: 1956, month: 4, day: 1 };

/** 昭和16年4月1日。これ以前生まれは被保険者月数が加入可能月数に短縮される */
const SHOWA16_0401: DateParts = { year: 1941, month: 4, day: 1 };

/** 大正15年4月1日。これ以前生まれは旧法の年金で、老齢基礎年金の加入可能年数の表に無い */
const TAISHO15_0401: DateParts = { year: 1926, month: 4, day: 1 };

/**
 * 【データ更新箇所（変わらない）】老齢基礎年金の加入可能月数（昭和16年4月1日以前生まれ）。
 *
 * 大正15年4月2日〜昭和2年4月1日生まれの 300 月（25 年）から、1 年度ずつ 12 月増えて
 * 昭和15年4月2日〜昭和16年4月1日生まれの 468 月（39 年）まで。
 * 年金機構の「老齢基礎年金の加入可能年数」の表と同じ。キーは区分の始まりの年（4 月 2 日生まれから）
 */
export const KANYU_KANO_MONTHS: Readonly<Record<number, number>> = {
  1926: 300,
  1927: 312,
  1928: 324,
  1929: 336,
  1930: 348,
  1931: 360,
  1932: 372,
  1933: 384,
  1934: 396,
  1935: 408,
  1936: 420,
  1937: 432,
  1938: 444,
  1939: 456,
  1940: 468,
};

// ------------------------------------------------------------ 区分

/** 受けている年金 */
export type PensionKind = 'rorei' | 'shogai1' | 'shogai2' | 'izoku';

export const PENSION_LABELS: Record<PensionKind, string> = {
  rorei: '老齢基礎年金',
  shogai1: '障害基礎年金（1級）',
  shogai2: '障害基礎年金（2級）',
  izoku: '遺族基礎年金',
};

/** 世帯全員が市町村民税非課税か（入力をそのまま持つ。老齢だけ） */
export type HouseholdTaxExempt = 'yes' | 'no' | 'unknown';

/** 所得の区分（老齢） */
export type IncomeClass = 'rorei' | 'hosokuteki' | 'over';

/** 円未満の端数処理（50銭未満切り捨て・50銭以上切り上げ） */
export function roundYen(x: number): number {
  // 浮動小数の誤差で 4682.4999999 のようになるのを避けるため、小さく足してから丸める
  return Math.floor(x + 0.5 + 1e-9);
}

/** 昭和31年4月1日以前生まれか（基準額・免除単価の切り替え） */
export function isBefore19560402(birth: DateParts): boolean {
  return compareDate(birth, SHOWA31_0401) <= 0;
}

/**
 * 老齢の被保険者月数（分母）。昭和16年4月2日以後生まれは 480、それより前は加入可能月数。
 * 大正15年4月1日以前生まれは表に無いので、表の最小（300）で数える
 */
export function insuredMonths(birth: DateParts): number {
  if (compareDate(birth, SHOWA16_0401) > 0) return FULL_INSURED_MONTHS;
  if (compareDate(birth, TAISHO15_0401) <= 0) return KANYU_KANO_MONTHS[1926];
  // 4月2日〜翌4月1日を 1 区分にする。1〜3月生まれと 4月1日生まれは前年の区分
  const startYear =
    birth.month > 4 || (birth.month === 4 && birth.day >= 2) ? birth.year : birth.year - 1;
  return KANYU_KANO_MONTHS[startYear];
}

/** 生年月日の区分の基準額・単価 */
export function thresholds(before: boolean, fy: FiscalYearData = CURRENT) {
  const band = before ? fy.before : fy.after;
  return {
    base: band.incomeLimit,
    supplementCap: band.incomeLimit + fy.supplementWidth,
    exemptFull: band.exemptFull,
    exemptQuarter: band.exemptQuarter,
  };
}

/** 所得（年金収入 ＋ その他所得）の区分。基準額ちょうどは老齢、＋10万円ちょうどは補足的 */
export function classifyIncome(income: number, before: boolean, fy: FiscalYearData = CURRENT): IncomeClass {
  const t = thresholds(before, fy);
  if (income <= t.base) return 'rorei';
  if (income <= t.supplementCap) return 'hosokuteki';
  return 'over';
}

/** 老齢年金生活者支援給付金の月額（納付済分・免除分を別々に丸めて足す） */
export function roreiMonthly(
  paid: number,
  exemptFull: number,
  exemptQuarter: number,
  birth: DateParts,
  fy: FiscalYearData = CURRENT,
) {
  const n = insuredMonths(birth);
  const t = thresholds(isBefore19560402(birth), fy);
  const paidPart = roundYen((fy.baseAmount * paid) / n);
  const exemptPart = roundYen((t.exemptFull * exemptFull + t.exemptQuarter * exemptQuarter) / n);
  return { paidPart, exemptPart, monthly: paidPart + exemptPart };
}

/** 補足的老齢給付金の調整支給率（(上限 − 所得) / 10万円）。帯の外は 0〜1 に収める */
export function adjustmentRate(income: number, before: boolean, fy: FiscalYearData = CURRENT): number {
  const t = thresholds(before, fy);
  const rate = (t.supplementCap - income) / fy.supplementWidth;
  return Math.min(1, Math.max(0, rate));
}

/** 補足的老齢年金生活者支援給付金の月額（免除分は無い） */
export function hosokutekiMonthly(
  paid: number,
  income: number,
  birth: DateParts,
  fy: FiscalYearData = CURRENT,
): number {
  const rate = adjustmentRate(income, isBefore19560402(birth), fy);
  return roundYen(((fy.baseAmount * paid) / insuredMonths(birth)) * rate);
}

/** 障害・遺族の所得制限（扶養親族 1 人あたり 38 万円の目安で加算） */
export function shogaiIzokuLimit(dependents: number, fy: FiscalYearData = CURRENT): number {
  return fy.shogaiIzokuLimit + fy.dependentAddition * dependents;
}

/** 障害年金生活者支援給付金の月額 */
export function shogaiMonthly(grade: 1 | 2, fy: FiscalYearData = CURRENT): number {
  return grade === 1 ? fy.shogai1 : fy.baseAmount;
}

/** 遺族年金生活者支援給付金の月額（子が複数で受けていれば人数で割る） */
export function izokuMonthly(children: number, fy: FiscalYearData = CURRENT): number {
  return roundYen(fy.baseAmount / Math.max(1, children));
}

// ------------------------------------------------------------ 年齢

/**
 * 65 歳に達する日（年齢計算ニ関スル法律により、65 回目の誕生日の前日）。
 * 給付金は老齢基礎年金と同じく、65 歳に達した月の翌月分から
 */
export function age65Date(birth: DateParts): DateParts {
  const birthday = { year: birth.year + 65, month: birth.month, day: birth.day };
  // 2月29日生まれで平年なら 3月1日を誕生日とみなし、その前日の 2月28日
  const valid = isValidDate(birthday) ? birthday : { year: birthday.year, month: 3, day: 1 };
  return addDays(valid, -1);
}

/** 65 歳に達した月の翌月（支給の始まる月。'YYYY-MM'） */
export function startMonthAt65(birth: DateParts): string {
  const d = age65Date(birth);
  const y = d.month === 12 ? d.year + 1 : d.year;
  const m = d.month === 12 ? 1 : d.month + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ------------------------------------------------------------ 検証

export interface ShienInput {
  kind: PensionKind;
  birth: DateParts;
  /** 判定の基準日（ふつうは今日） */
  asOf: DateParts;
  /** 前年の公的年金等の収入金額（老齢だけ。遺族・障害年金は含めない） */
  pensionIncome: number;
  /** 前年のその他の所得（老齢では年金収入と足す。障害・遺族ではこれが前年所得） */
  otherIncome: number;
  /** 保険料納付済月数（老齢だけ） */
  paidMonths: number;
  /** 全額・3/4・半額免除の月数（老齢だけ） */
  exemptFullMonths: number;
  /** 1/4 免除の月数（老齢だけ） */
  exemptQuarterMonths: number;
  /** 世帯全員が市町村民税非課税か（老齢だけ） */
  household: HouseholdTaxExempt;
  /** 扶養親族等の数（障害・遺族だけ） */
  dependents: number;
  /** 遺族基礎年金を受けている子の人数（遺族だけ） */
  children: number;
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;
const isYen = (n: number) => Number.isFinite(n) && n >= 0;

/** 入力の誤り。空なら計算してよい（種類ごとに使わない入力は見ない） */
export function validate(input: ShienInput): string[] {
  const errors: string[] = [];
  if (!isValidDate(input.birth)) errors.push('生年月日が正しくありません。');
  else if (compareDate(input.birth, input.asOf) > 0) errors.push('生年月日が未来の日付です。');
  if (!isYen(input.otherIncome)) errors.push('その他の所得は 0 以上の数で入れてください。');

  if (input.kind === 'rorei') {
    if (!isYen(input.pensionIncome)) errors.push('年金の収入金額は 0 以上の数で入れてください。');
    const months = [input.paidMonths, input.exemptFullMonths, input.exemptQuarterMonths];
    if (!months.every(isCount)) errors.push('月数は 0 以上の整数で入れてください。');
    else if (isValidDate(input.birth)) {
      const n = insuredMonths(input.birth);
      const sum = months.reduce((a, b) => a + b, 0);
      if (sum > n) errors.push(`納付済と免除の月数の合計（${sum}月）が被保険者月数（${n}月）を超えています。`);
    }
  } else {
    if (!isCount(input.dependents)) errors.push('扶養親族等の数は 0 以上の整数で入れてください。');
    if (input.kind === 'izoku' && !(Number.isInteger(input.children) && input.children >= 1)) {
      errors.push('子の人数は 1 以上の整数で入れてください。');
    }
  }
  return errors;
}

// ------------------------------------------------------------ まとめ

/** 月額が 0 円になった理由（補足的の帯の中で） */
export type ZeroReason = 'rate-zero' | 'no-paid';

export interface RoreiResult {
  kind: 'rorei';
  before: boolean;
  insuredMonths: number;
  /** 年金収入 ＋ その他の所得 */
  income: number;
  incomeClass: IncomeClass;
  /** 世帯の軸（入力のまま。所得の区分とは混ぜない） */
  household: HouseholdTaxExempt;
  thresholds: ReturnType<typeof thresholds>;
  /** 老齢の区分のときの内訳 */
  paidPart: number;
  exemptPart: number;
  /** 補足的の区分のときの調整支給率 */
  rate: number | null;
  monthly: number;
  annual: number;
  /** 補足的の帯で月額が 0 円になったとき */
  zeroReason: ZeroReason | null;
  /** 基準日に 65 歳に達しているか */
  is65: boolean;
  /** 65 歳に達した月の翌月（支給開始月） */
  startMonth: string;
}

export interface ShogaiIzokuResult {
  kind: 'shogai1' | 'shogai2' | 'izoku';
  /** 前年所得（その他の所得） */
  income: number;
  limit: number;
  withinLimit: boolean;
  monthly: number;
  annual: number;
}

export type ShienResult = RoreiResult | ShogaiIzokuResult;

/** 判定と月額。`validate` が空のときだけ呼ぶ */
export function calcShien(input: ShienInput, fy: FiscalYearData = CURRENT): ShienResult {
  if (input.kind !== 'rorei') {
    const limit = shogaiIzokuLimit(input.dependents, fy);
    const withinLimit = input.otherIncome <= limit;
    const amount =
      input.kind === 'izoku'
        ? izokuMonthly(input.children, fy)
        : shogaiMonthly(input.kind === 'shogai1' ? 1 : 2, fy);
    const monthly = withinLimit ? amount : 0;
    return { kind: input.kind, income: input.otherIncome, limit, withinLimit, monthly, annual: monthly * 12 };
  }

  const before = isBefore19560402(input.birth);
  const income = input.pensionIncome + input.otherIncome;
  const incomeClass = classifyIncome(income, before, fy);
  let paidPart = 0;
  let exemptPart = 0;
  let rate: number | null = null;
  let monthly = 0;
  let zeroReason: ZeroReason | null = null;

  if (incomeClass === 'rorei') {
    ({ paidPart, exemptPart, monthly } = roreiMonthly(
      input.paidMonths,
      input.exemptFullMonths,
      input.exemptQuarterMonths,
      input.birth,
      fy,
    ));
  } else if (incomeClass === 'hosokuteki') {
    rate = adjustmentRate(income, before, fy);
    monthly = hosokutekiMonthly(input.paidMonths, income, input.birth, fy);
    if (monthly === 0) zeroReason = input.paidMonths === 0 ? 'no-paid' : 'rate-zero';
  }

  return {
    kind: 'rorei',
    before,
    insuredMonths: insuredMonths(input.birth),
    income,
    incomeClass,
    household: input.household,
    thresholds: thresholds(before, fy),
    paidPart,
    exemptPart,
    rate,
    monthly,
    annual: monthly * 12,
    zeroReason,
    is65: compareDate(age65Date(input.birth), input.asOf) <= 0,
    startMonth: startMonthAt65(input.birth),
  };
}

/**
 * 「崖ではなく坂」の図の点。所得 `from`〜`to` を `step` 刻みで、そのときの月額を返す
 * （納付済・免除の月数と生年月日は利用者のもの）
 */
export function slopePoints(
  paid: number,
  exemptFull: number,
  exemptQuarter: number,
  birth: DateParts,
  from = 800_000,
  to = 940_000,
  step = 5_000,
  fy: FiscalYearData = CURRENT,
): { income: number; monthly: number }[] {
  const before = isBefore19560402(birth);
  const t = thresholds(before, fy);
  // 区切り（基準額・上限）の前後で形が変わるので、刻みの点に加えて区切りの点も入れる
  const incomes = new Set<number>();
  for (let x = from; x <= to; x += step) incomes.add(x);
  for (const x of [t.base, t.base + 1, t.supplementCap, t.supplementCap + 1]) {
    if (x >= from && x <= to) incomes.add(x);
  }
  return [...incomes]
    .sort((a, b) => a - b)
    .map((income) => {
      const c = classifyIncome(income, before, fy);
      const monthly =
        c === 'rorei'
          ? roreiMonthly(paid, exemptFull, exemptQuarter, birth, fy).monthly
          : c === 'hosokuteki'
            ? hosokutekiMonthly(paid, income, birth, fy)
            : 0;
      return { income, monthly };
    });
}

/** 'YYYY-MM' → '2026年10月' */
export function formatMonthJa(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}
