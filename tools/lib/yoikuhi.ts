/**
 * 養育費 計算ロジック（裁判所の標準算定方式＋2026年4月施行の改正民法）
 *
 * 離婚後に子を監護しない親が支払う養育費の月額の目安を、家庭裁判所が使う
 * **標準算定方式**（平成30年度司法研究、令和元年12月23日公表）で計算する。
 * 算定表（表1〜表9）の値をそのまま持つのではなく方式を実装しているので、
 * 表の升目の中間の年収でも連続した金額が出る。
 *
 * ■ 標準算定方式の手順
 * 1. 基礎収入 ＝ 総収入 × 基礎収入割合（給与所得者と自営業者で別の表）
 * 2. 子に充てられる生活費 ＝ 義務者の基礎収入 × 子の生活費指数の合計
 *      ÷（親の指数100 ＋ 子の生活費指数の合計）
 * 3. 養育費（年額）＝ 2の額 × 義務者の基礎収入 ÷（義務者の基礎収入 ＋ 権利者の基礎収入）
 * 4. 月額 ＝ 3 ÷ 12
 *
 * 3で義務者・権利者の基礎収入比を掛けるのは、子の生活費を双方の負担能力に応じて
 * 分担するため。権利者の収入が高いほど義務者の負担は小さくなる。
 *
 * ■ 2026年4月（令和8年4月1日）施行の改正民法
 * 民法等の一部を改正する法律（**令和6年法律第33号**）が令和8年4月1日に施行され、
 * 養育費について2つの制度が新設された。金額はいずれも法務省令
 * （**令和7年法務省令第56号**・令和7年12月12日制定）で定められている。
 *
 * - **法定養育費**（新民法766条の3）… 取決めなしで離婚した場合でも、
 *   離婚のときから請求できる暫定的な養育費。**月額2万円 × 子の数**。
 *   **改正法の施行後に離婚したケースのみに適用される（遡及適用なし）**
 * - **養育費債権の先取特権**（新民法308条の2）… 債務名義がなくても差押えができる
 *   優先権。先取特権が付与されるのは **月額8万円 × 子の数** まで。
 *   取決めた養育費の全額に及ぶわけではない
 *
 * ■ 一次情報（2026-08-15 取得・実装時に再確認済み）
 * - 法務省「民法等の一部を改正する法律（父母の離婚後等の子の養育に関する見直し）に
 *   ついて〔令和8年4月1日施行〕」
 *   https://www.moj.go.jp/MINJI/minji07_00357.html
 * - 法務省民事局「養育費に関する法務省令の概要」（令和7年12月）
 *   https://www.moj.go.jp/content/001452582.pdf
 *   - 法定養育費「月額2万円に子の数を乗じて得た額」
 *   - 先取特権「月額8万円に子の数を乗じて得た額」
 *   - 「民法等改正法と併せて、令和8年4月1日施行」
 * - 法務省民事局パンフレット「父母の離婚後の子の養育に関するルールが
 *   改正されました」（2026年1月改訂）
 *   https://www.moj.go.jp/content/001449160.pdf
 *   - Q5「私たちは今回の改正法施行前に離婚しましたが、暫定的な養育費は発生しますか。」
 *     A5「発生しません。この規定は、改正法施行後に離婚したケースのみに適用されます。」
 *   - 先取特権の上限は「子一人当たり月額8万円」
 * - 裁判所「平成30年度司法研究（養育費，婚姻費用の算定に関する実証的研究）の報告について」
 *   https://www.courts.go.jp/toukei_siryou/siryo/H30shihou_houkoku/index.html
 *   - 算定表（表1〜表9）と「養育費・婚姻費用算定表について」（説明書）
 *   - 説明書「養育費の表は，養育費の額を養育費を支払う親の年収額が少ない場合は1万円，
 *     それ以外の場合は2万円の幅をもたせてあります。」
 *
 * 【データ更新箇所】
 * - 標準算定方式が改定されたら BASIC_INCOME_RATES / LIVING_COST_INDEX / 算定表の上限
 * - 法務省令が改正されたら STATUTORY_SUPPORT_PER_CHILD / LIEN_CAP_PER_CHILD
 */

/** 収入の種別。基礎収入割合の表が給与所得者と自営業者で分かれている */
export type IncomeKind = 'salary' | 'business';

/** 子の年齢帯。標準算定方式は0〜14歳と15歳以上の2区分だけを使う */
export type ChildAgeBand = '0-14' | '15+';

/** 収入種別の表示名 */
export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  salary: '給与',
  business: '自営',
};

/** 子の年齢帯の表示名 */
export const CHILD_AGE_LABELS: Record<ChildAgeBand, string> = {
  '0-14': '0〜14歳',
  '15+': '15歳以上',
};

/**
 * 生活費指数。親を100としたときに、その年齢の子に必要な生活費の割合。
 *
 * 【データ更新箇所】標準算定方式（令和元年12月改定）の値。
 * 公立中学校・公立高等学校の教育費相当額を織り込んで算出されている。
 */
export const LIVING_COST_INDEX = {
  /** 親（義務者・権利者とも100） */
  parent: 100,
  '0-14': 62,
  '15+': 85,
} as const;

/** 基礎収入割合の表の1行（この総収入までなら rate を使う） */
interface BasicIncomeRate {
  /** 総収入の上限（円・この額を含む） */
  upTo: number;
  /** 基礎収入割合（0〜1） */
  rate: number;
}

/**
 * 基礎収入割合。総収入のうち、公租公課・職業費・特別経費を引いて
 * 生活費に充てられる部分の割合。収入が上がるほど割合は下がる。
 *
 * 【データ更新箇所】標準算定方式（令和元年12月改定）の表。
 * 給与所得者は年収2,000万円、自営業者は年収1,567万円が表の上限で、
 * これを超える収入は算定表の範囲外（個別の判断が必要）。
 */
export const BASIC_INCOME_RATES: Record<IncomeKind, BasicIncomeRate[]> = {
  // 給与所得者: 54%（〜75万円）〜 38%（〜2,000万円）
  salary: [
    { upTo: 750_000, rate: 0.54 },
    { upTo: 1_000_000, rate: 0.5 },
    { upTo: 1_250_000, rate: 0.46 },
    { upTo: 1_750_000, rate: 0.44 },
    { upTo: 2_750_000, rate: 0.43 },
    { upTo: 5_250_000, rate: 0.42 },
    { upTo: 7_250_000, rate: 0.41 },
    { upTo: 13_250_000, rate: 0.4 },
    { upTo: 14_750_000, rate: 0.39 },
    { upTo: 20_000_000, rate: 0.38 },
  ],
  // 自営業者: 61%（〜66万円）〜 48%（〜1,567万円）
  business: [
    { upTo: 660_000, rate: 0.61 },
    { upTo: 820_000, rate: 0.6 },
    { upTo: 980_000, rate: 0.59 },
    { upTo: 2_560_000, rate: 0.58 },
    { upTo: 3_490_000, rate: 0.57 },
    { upTo: 3_920_000, rate: 0.56 },
    { upTo: 4_960_000, rate: 0.55 },
    { upTo: 5_630_000, rate: 0.54 },
    { upTo: 7_840_000, rate: 0.53 },
    { upTo: 9_420_000, rate: 0.52 },
    { upTo: 10_460_000, rate: 0.51 },
    { upTo: 11_790_000, rate: 0.5 },
    { upTo: 14_820_000, rate: 0.49 },
    { upTo: 15_670_000, rate: 0.48 },
  ],
};

/**
 * 算定表が扱える総収入の上限（円）。基礎収入割合の表の最終行と一致する。
 * これを超える収入は算定表の範囲外なので、このツールは計算しない。
 */
export const INCOME_LIMIT: Record<IncomeKind, number> = {
  salary: 20_000_000,
  business: 15_670_000,
};

/**
 * 算定表の**横軸**（権利者の年収）の上限（円）。
 *
 * 縦軸（義務者）は給与2,000万円まであるが、横軸は給与1,000万円までしか
 * 印刷されていない。標準算定方式そのものは横軸の上限を超えても計算できるので
 * 計算は続けるが、「印刷された算定表の升目とは突き合わせられない」ことを
 * 結果に添えるために持っている。
 */
export const OBLIGEE_TABLE_AXIS_LIMIT: Record<IncomeKind, number> = {
  salary: 10_000_000,
  business: 7_630_000,
};

/** 算定表が用意されている子の人数の上限（表1〜表9は子3人まで） */
export const MAX_CHILDREN = 3;

/**
 * 法定養育費の額（子1人あたりの月額・円）。
 *
 * 【データ更新箇所】令和7年法務省令第56号。「月額2万円に子の数を乗じて得た額」。
 */
export const STATUTORY_SUPPORT_PER_CHILD = 20_000;

/**
 * 養育費債権のうち先取特権が付与される額の上限（子1人あたりの月額・円）。
 *
 * 【データ更新箇所】令和7年法務省令第56号。「月額8万円に子の数を乗じて得た額」。
 */
export const LIEN_CAP_PER_CHILD = 80_000;

/**
 * 改正民法（令和6年法律第33号）の施行日。
 * 法定養育費は**この日以降に成立した離婚にしか適用されない**（遡及適用なし）。
 */
export const LAW_EFFECTIVE_DATE = '2026-04-01';

/** 法定養育費が発生しなくなる子の年齢（民法766条の3。18歳に達した日まで） */
export const STATUTORY_SUPPORT_END_AGE = 18;

export interface YoikuhiInput {
  /** 義務者（支払う側）の総収入（年額・円） */
  obligorIncome: number;
  /** 義務者の収入種別 */
  obligorKind: IncomeKind;
  /** 権利者（受け取る側）の総収入（年額・円） */
  obligeeIncome: number;
  /** 権利者の収入種別 */
  obligeeKind: IncomeKind;
  /** 子の年齢帯（1〜3人分。並び順は結果に影響しない） */
  children: ChildAgeBand[];
}

/** 算定表と同じ幅に丸めた金額のレンジ */
export interface TableRange {
  /** レンジの下限（円・この額を含む） */
  fromYen: number;
  /** レンジの上限（円・この額は含まない） */
  toYen: number;
  /** 表示用のラベル（例 '4〜6万円'） */
  label: string;
}

/** 算定表の範囲外になった理由 */
export type OutOfRangeReason =
  | 'obligor-income'
  | 'obligee-income'
  | 'children-count';

/** 算定表の範囲外だったときの結果 */
export interface YoikuhiOutOfRange {
  outOfRange: true;
  reasons: OutOfRangeReason[];
}

/** 計算できたときの結果 */
export interface YoikuhiAmount {
  outOfRange: false;
  /** 義務者の基礎収入（年額・円） */
  obligorBasicIncome: number;
  /** 権利者の基礎収入（年額・円） */
  obligeeBasicIncome: number;
  /** 適用した基礎収入割合（義務者） */
  obligorRate: number;
  /** 適用した基礎収入割合（権利者） */
  obligeeRate: number;
  /** 子の生活費指数の合計 */
  childIndexSum: number;
  /** 子に充てられる生活費（年額・円） */
  childrenLivingCost: number;
  /** 養育費の年額（円・端数処理前） */
  annual: number;
  /** 養育費の月額（円・1円未満四捨五入） */
  monthly: number;
  /** 算定表と同じ幅に丸めたレンジ */
  range: TableRange;
  /** 子の人数 */
  childCount: number;
  /** 法定養育費の月額（2万円 × 子の数・円） */
  statutoryMonthly: number;
  /** 先取特権が付与される上限の月額（8万円 × 子の数・円） */
  lienCapMonthly: number;
  /**
   * 権利者の年収が算定表の横軸の上限を超えているか。
   * 方式では計算できるが、印刷された算定表の升目とは突き合わせられない。
   */
  beyondObligeeAxis: boolean;
}

export type YoikuhiResult = YoikuhiOutOfRange | YoikuhiAmount;

/** 数値として扱えない・負の値は0にする */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 総収入から基礎収入割合を引く。
 * 表の上限を超える収入では最終行の割合を返すが、そもそも算定表の範囲外なので
 * `calcYoikuhi` は計算に進まない（この関数を単体で使うときは上限を自分で見ること）。
 */
export function basicIncomeRate(income: number, kind: IncomeKind): number {
  const table = BASIC_INCOME_RATES[kind];
  const row = table.find((r) => nonNegative(income) <= r.upTo);
  return (row ?? table[table.length - 1]).rate;
}

/** 総収入から基礎収入（年額・円）を出す */
export function basicIncome(income: number, kind: IncomeKind): number {
  return nonNegative(income) * basicIncomeRate(income, kind);
}

/**
 * 月額を算定表と同じ幅のレンジに丸める。
 *
 * 裁判所の説明書のとおり、**2万円未満は1万円幅、それ以上は2万円幅**。
 * 算定表の升目に「4〜6万円」と書かれているのと同じ区切りになる。
 */
export function tableRangeFor(monthly: number): TableRange {
  const yen = nonNegative(monthly);
  const man = (v: number) => v / 10_000;

  if (yen < 20_000) {
    const fromYen = yen < 10_000 ? 0 : 10_000;
    const toYen = fromYen + 10_000;
    return { fromYen, toYen, label: `${man(fromYen)}〜${man(toYen)}万円` };
  }

  const fromYen = 20_000 + Math.floor((yen - 20_000) / 20_000) * 20_000;
  const toYen = fromYen + 20_000;
  return { fromYen, toYen, label: `${man(fromYen)}〜${man(toYen)}万円` };
}

/**
 * 標準算定方式で養育費の月額の目安を計算する。
 *
 * 算定表の範囲外（年収が表の上限を超える・子が4人以上）のときは金額を出さず、
 * 理由だけを返す。範囲外を無理に外挿すると、実務では通らない額を
 * 「裁判所の基準」として見せることになるため。
 *
 * @param input 双方の年収・収入種別と子の年齢帯
 */
export function calcYoikuhi(input: YoikuhiInput): YoikuhiResult {
  const obligorIncome = nonNegative(input.obligorIncome);
  const obligeeIncome = nonNegative(input.obligeeIncome);
  const children = input.children ?? [];

  const reasons: OutOfRangeReason[] = [];
  if (obligorIncome > INCOME_LIMIT[input.obligorKind]) reasons.push('obligor-income');
  if (obligeeIncome > INCOME_LIMIT[input.obligeeKind]) reasons.push('obligee-income');
  if (children.length < 1 || children.length > MAX_CHILDREN) reasons.push('children-count');
  if (reasons.length > 0) return { outOfRange: true, reasons };

  const obligorRate = basicIncomeRate(obligorIncome, input.obligorKind);
  const obligeeRate = basicIncomeRate(obligeeIncome, input.obligeeKind);
  const obligorBasicIncome = obligorIncome * obligorRate;
  const obligeeBasicIncome = obligeeIncome * obligeeRate;

  const childIndexSum = children.reduce((sum, band) => sum + LIVING_COST_INDEX[band], 0);
  const childrenLivingCost =
    (obligorBasicIncome * childIndexSum) / (LIVING_COST_INDEX.parent + childIndexSum);

  // 双方とも収入0のときは按分できない。負担能力が無いので0円とする
  const totalBasicIncome = obligorBasicIncome + obligeeBasicIncome;
  const annual =
    totalBasicIncome > 0 ? (childrenLivingCost * obligorBasicIncome) / totalBasicIncome : 0;
  const monthly = Math.round(annual / 12);

  return {
    outOfRange: false,
    obligorBasicIncome,
    obligeeBasicIncome,
    obligorRate,
    obligeeRate,
    childIndexSum,
    childrenLivingCost,
    annual,
    monthly,
    range: tableRangeFor(monthly),
    childCount: children.length,
    statutoryMonthly: STATUTORY_SUPPORT_PER_CHILD * children.length,
    lienCapMonthly: LIEN_CAP_PER_CHILD * children.length,
    beyondObligeeAxis: obligeeIncome > OBLIGEE_TABLE_AXIS_LIMIT[input.obligeeKind],
  };
}

/** 法定養育費の月額（2万円 × 子の数・円） */
export function statutorySupport(childCount: number): number {
  return STATUTORY_SUPPORT_PER_CHILD * Math.max(0, Math.floor(nonNegative(childCount)));
}

/** 先取特権が付与される上限の月額（8万円 × 子の数・円） */
export function lienCap(childCount: number): number {
  return LIEN_CAP_PER_CHILD * Math.max(0, Math.floor(nonNegative(childCount)));
}

/**
 * 法定養育費の対象になる離婚かどうか。
 *
 * **改正法の施行日（2026年4月1日）以降に成立した離婚だけが対象**で、
 * それより前に離婚している場合は遡って請求できない。
 *
 * @param divorceDate 離婚が成立した日（'YYYY-MM-DD'）
 */
export function isStatutorySupportEligible(divorceDate: string): boolean {
  return divorceDate >= LAW_EFFECTIVE_DATE;
}
