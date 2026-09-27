/**
 * 防衛特別所得税 計算機・早見表（2027年1月開始）
 *
 * 仕様: docs/features/boei-tokubetsu-shotokuzei.md
 *
 * ■ 改正の中身（令和8年度税制改正）
 * - **防衛特別所得税を創設**：令和9年（2027年）分以後、基準所得税額 × 1%。
 *   課税期間は「令和9年以後の当分の間」で、**終期の定めがない**
 * - **復興特別所得税を 2.1% → 1.1% に引下げ**、課税期間を
 *   令和19年（2037年）12月31日まで → **令和29年（2047年）12月31日まで**に10年延長
 * - どちらも令和9年1月1日以後に生ずる所得に対する所得税から適用
 *
 * 合計の付加税率は改正前後とも 2.1%（所得税額 × 102.1%）で、**2027年の税額は変わらない**。
 * 変わるのは、改正前なら付加税が無くなっていた **2038年以降**で、2038〜2047年は 2.1%、
 * 2048年以降も防衛特別分の 1% が続く。このファイルはこの「増えるようで当面増えない、
 * でも将来はずっと増える」を金額にするためのもの。
 *
 * ■ 基準所得税額の定義（仕様 3。実装前に確認したこと）
 * 国税庁Q&A Q8 のとおり、年調年税額（防衛特別所得税・復興特別所得税を含む）は
 * 「算出所得税額から住宅借入金等特別控除額を控除した後の税額（年調所得税額）× 102.1%
 * （100円未満切捨て）」（防衛財確法5の28①）で、**令和8年分と令和9年分で求め方に変更はない**。
 * つまり
 *   - 基準所得税額は**住宅ローン控除等の税額控除を引いたあと**の所得税額
 *   - 防衛特別（1%）と復興特別（1.1%）は**同じ基準所得税額**に掛かり、
 *     端数計算も両者の合計額で行う（Q6・防衛財確法5の29②）
 * 条文でも、防衛財確法5条の6（令和9年1月1日施行版）は基準所得税額を「所得税法その他の
 * 所得税の税額の計算に関する法令の規定（同法第93条及び第95条の規定を除く。）により計算した
 * 所得税の額」と定めていて、復興財確法の基準所得税額と同じ作り（分配時調整外国税相当額・
 * 外国税額控除は引く前、住宅ローン控除などの租税特別措置法の税額控除は引いたあと）。
 * このため「差し引きゼロ」はどの人にも成り立つ（基準の定義が違えば一部の人で崩れていた）。
 *
 * ■ 令和9年分 源泉徴収税額表との突き合わせ（仕様 8）
 * 令和9年分の税額表（2026-08-31 頃掲載）は「所得税、防衛特別所得税及び復興特別所得税を
 * 併せて源泉徴収する際に使用するもの」で、18ページの電算機計算の特例（令和8年4月30日
 * 財務省告示第128号）別表第四の税率は B×5.105% / 10.210% / 20.420% / 23.483% /
 * 33.693% / 40.840% / 45.945%。**所得税の速算表の税率 × 102.1% そのもの**で、
 * 合計 2.1% が改正前と同じであることを一次情報で確認した。
 * tests/boei-tokubetsu-shotokuzei.test.ts が別表第四・Q&A の計算例と突き合わせている。
 *
 * ■ このファイルが自分で計算していないこと
 * 年収 → 算出所得税額 → 住宅ローン控除後の所得税額は **lib/nenmatsu-chosei.ts の
 * calcYearTax() をそのまま呼んでいる**（令和9年分の控除は令和8年分と同じ。
 * 基礎控除の特例加算は令和8・9年分の時限措置）。社会保険料は
 * lib/furusato-nozei.ts の estimateSocialInsurance() の概算。
 * 所得税の計算を2つ書くと、改正のたびに片方だけ直ってサイト内の数字がずれる。
 *
 * ■ 施行日またぎ（仕様 6）
 * 切替日の値は lib/tedori-keisan.ts の WITHHOLDING_TABLE_EFFECTIVE_ON（2027-01-01）を
 * 参照して**日付を二重に持たない**。判定の仕組みは lib/nenshu-kabe.ts と同じく
 * 暦日の文字列比較で、基準日は呼び出し側が渡す（静的書き出しなのでビルド時刻で固定しない）。
 *
 * ■ 一次情報
 * - 国税庁「防衛特別所得税及び復興特別所得税（源泉徴収関係）Ｑ＆Ａ」（令和8年5月）
 *   https://www.nta.go.jp/publication/pamph/pdf/0026005-024_03.pdf
 *   → Q1: 改正の概要・税率・課税期間・合計税率2.1%は不変／Q5: 合計税率＝所得税率×102.1%／
 *     Q6: 端数は合計額で計算／Q8: 年調年税額＝年調所得税額×102.1%（令和8年分と9年分で同じ）
 * - 国税庁「令和9年分 源泉徴収税額表」
 *   https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/01.htm
 * - 我が国の防衛力の抜本的な強化等のために必要な財源の確保に関する特別措置法
 *   （防衛財確法・令和5年法律第69号）。防衛特別所得税の規定は
 *   所得税法等の一部を改正する法律（令和8年法律第12号）による改正で加わり、
 *   令和9年1月1日に施行される（e-Gov 法令API の改正履歴
 *   `505AC0000000069_20270101_508AC0000000012` で条文を確認。2026-09-27）。
 *   5条の5: 令和9年分以後の基準所得税額に「当分の間」課する／5条の6: 基準所得税額／
 *   5条の9: 税率 百分の一。Q&A が引く源泉徴収の条項は 5の26①②・5の27①一・5の28①・5の29②
 * - 東日本大震災からの復興のための施策を実施するために必要な財源の確保に関する特別措置法
 *   （復興財確法・平成23年法律第117号）
 *
 * 【データ更新箇所】税率・課税期間は SURTAX_PERIODS の1か所。控除額・速算表は
 * lib/furusato-nozei.ts と lib/nenmatsu-chosei.ts（ここには持たない）。
 * 早見表の年収は TABLE_INCOMES。
 */

import { estimateSocialInsurance } from '@/lib/furusato-nozei';
import { RULES_R8, calcYearTax, type NenmatsuInput, type YearRules } from '@/lib/nenmatsu-chosei';
import { WITHHOLDING_TABLE_EFFECTIVE_ON } from '@/lib/tedori-keisan';

/** 付加税の種類 */
export type SurtaxKind = 'reconstruction' | 'defense';

/** 比べる2つの世界。改正前の法律のまま／改正後 */
export type Scenario = 'before' | 'after';

/** 付加税の税率と課税期間。税率は基準所得税額に対する千分率（0.1%単位）で持つ */
export interface SurtaxPeriod {
  kind: SurtaxKind;
  scenario: Scenario;
  /** 基準所得税額に対する税率（‰）。21 = 2.1% */
  permille: number;
  /** 最初の年分 */
  fromYear: number;
  /** 最後の年分。null は終期の定めがない（当分の間） */
  untilYear: number | null;
}

/**
 * 付加税の税率と課税期間。
 *
 * 税率は**千分率の整数**で持つ。0.01 + 0.011 は浮動小数点で 0.021 にならないので、
 * 「合計 2.1% は改正前後で同じ」を足し算で確かめられるようにするため。
 *
 * 【データ更新箇所】税率・課税期間が改正されたらここ。
 */
export const SURTAX_PERIODS: readonly SurtaxPeriod[] = [
  // 改正前：復興特別所得税 2.1%（平成25年〜令和19年）
  { kind: 'reconstruction', scenario: 'before', permille: 21, fromYear: 2013, untilYear: 2037 },
  // 改正後：令和8年分までは 2.1%、令和9年分から 1.1% に下がり令和29年まで延長
  { kind: 'reconstruction', scenario: 'after', permille: 21, fromYear: 2013, untilYear: 2026 },
  { kind: 'reconstruction', scenario: 'after', permille: 11, fromYear: 2027, untilYear: 2047 },
  // 改正後：防衛特別所得税 1%（令和9年以後の当分の間）
  { kind: 'defense', scenario: 'after', permille: 10, fromYear: 2027, untilYear: null },
];

/** 防衛特別所得税が始まる年分 */
export const DEFENSE_START_YEAR = 2027;
/** 改正前の復興特別所得税の最後の年分 */
export const RECONSTRUCTION_LAST_YEAR_BEFORE = 2037;
/** 改正後の復興特別所得税の最後の年分 */
export const RECONSTRUCTION_LAST_YEAR_AFTER = 2047;

/**
 * 防衛特別所得税が始まる日。
 * 令和9年1月1日以後に生ずる所得に適用され、源泉徴収税額表の切替日と同じ日なので、
 * **日付は lib/tedori-keisan.ts の定数を使い、ここでは持たない**。
 */
export const DEFENSE_EFFECTIVE_ON = WITHHOLDING_TABLE_EFFECTIVE_ON;

/** その年分・その世界での付加税率（‰）の内訳 */
export function surtaxPermille(
  year: number,
  scenario: Scenario,
): { reconstruction: number; defense: number; total: number } {
  const rate = (kind: SurtaxKind) =>
    SURTAX_PERIODS.find(
      (p) =>
        p.kind === kind &&
        p.scenario === scenario &&
        year >= p.fromYear &&
        (p.untilYear === null || year <= p.untilYear),
    )?.permille ?? 0;
  const reconstruction = rate('reconstruction');
  const defense = rate('defense');
  return { reconstruction, defense, total: reconstruction + defense };
}

/**
 * 付加税（復興特別＋防衛特別）の合計額。
 *
 * 端数は2つの付加税の**合計額**で計算する（Q&A Q6・防衛財確法5の29②）。
 * 千分率の整数で掛けるので、1.1% + 1% を浮動小数点で足したときの誤差が出ない。
 * 改正前後の差・将来の追加負担は**この額の差**で出す（年税額の100円未満切捨てを挟むと、
 * 付加税とは関係のない丸めの段差が「負担」に混ざるため）。
 */
export function surtaxAmount(baseTax: number, year: number, scenario: Scenario): number {
  const base = Math.max(0, Math.floor(baseTax));
  return Math.floor((base * surtaxPermille(year, scenario).total) / 1000);
}

/**
 * 基準所得税額に付加税を足した年税額（年末調整の年調年税額。100円未満切捨て）。
 *
 * 国税庁Q&A Q8：「年調所得税額 × 102.1%（100円未満切捨て）」。
 * 令和8年分と令和9年分で求め方は変わらない。
 */
export function yearTaxWithSurtax(baseTax: number, year: number, scenario: Scenario): number {
  const base = Math.max(0, Math.floor(baseTax));
  const withSurtax = Math.floor((base * (1000 + surtaxPermille(year, scenario).total)) / 1000);
  return Math.floor(withSurtax / 100) * 100;
}

/** 年分で見た付加税の区切り（早見表・タイムラインの行） */
export interface Phase {
  id: 'until2026' | 'y2027to2037' | 'y2038to2047' | 'from2048';
  label: string;
  fromYear: number;
  /** null は終期の定めがない */
  untilYear: number | null;
  /** 改正前の法律のままだった場合の付加税率（‰） */
  before: { reconstruction: number; defense: number; total: number };
  /** 改正後の付加税率（‰） */
  after: { reconstruction: number; defense: number; total: number };
}

/**
 * 改正前後で税率が変わる区切り。SURTAX_PERIODS の境目から作る。
 * 区切りの年は SURTAX_PERIODS から導いているので、課税期間が改正されたら追随する。
 */
export const PHASES: readonly Phase[] = (() => {
  const make = (id: Phase['id'], label: string, fromYear: number, untilYear: number | null) => ({
    id,
    label,
    fromYear,
    untilYear,
    before: surtaxPermille(fromYear, 'before'),
    after: surtaxPermille(fromYear, 'after'),
  });
  return [
    make('until2026', `${DEFENSE_START_YEAR - 1}年まで`, 2013, DEFENSE_START_YEAR - 1),
    make(
      'y2027to2037',
      `${DEFENSE_START_YEAR}〜${RECONSTRUCTION_LAST_YEAR_BEFORE}年`,
      DEFENSE_START_YEAR,
      RECONSTRUCTION_LAST_YEAR_BEFORE,
    ),
    make(
      'y2038to2047',
      `${RECONSTRUCTION_LAST_YEAR_BEFORE + 1}〜${RECONSTRUCTION_LAST_YEAR_AFTER}年`,
      RECONSTRUCTION_LAST_YEAR_BEFORE + 1,
      RECONSTRUCTION_LAST_YEAR_AFTER,
    ),
    make('from2048', `${RECONSTRUCTION_LAST_YEAR_AFTER + 1}年以降`, RECONSTRUCTION_LAST_YEAR_AFTER + 1, null),
  ];
})();

/** 改正前なら付加税が無くなっていた期間の年数（2038〜2047年＝10年） */
export const EXTENDED_YEARS = RECONSTRUCTION_LAST_YEAR_AFTER - RECONSTRUCTION_LAST_YEAR_BEFORE;

/**
 * 令和9年分の控除。**令和8年分と同じ**（基礎控除の特例加算42万円は令和8・9年分の時限措置、
 * 給与所得控除の最低保障74万円は令和8年分以後）。表示の年分だけを差し替える。
 */
export const RULES_R9: YearRules = { ...RULES_R8, label: '令和9年分' };

export interface BoeiInput {
  /** 年収（給与収入・賞与込みの年間総額・円） */
  income: number;
  /** 扶養親族の人数（一般の控除対象扶養親族。1人38万円の扶養控除として数える） */
  dependents: number;
  /**
   * 住宅ローン控除などの税額控除（年額・円）。初版の画面には出していない。
   * 基準所得税額が「税額控除のあと」の額であることをテストで固定するための入口
   */
  housingLoanCredit?: number;
  /** 40〜64歳（社会保険料の概算に介護保険料を含める） */
  kaigo?: boolean;
}

export interface BoeiResult {
  /** 年収（円） */
  gross: number;
  /** 給与所得控除 */
  salaryDeduction: number;
  /** 給与所得（＝合計所得金額） */
  totalIncome: number;
  /** 社会保険料控除（年収からの概算） */
  socialInsurance: number;
  /** 基礎控除 */
  basicDeduction: number;
  /** 扶養控除 */
  dependentDeduction: number;
  /** 課税所得金額（1,000円未満切捨て） */
  taxableIncome: number;
  /** 算出所得税額（速算表から。税額控除の前） */
  calculatedTax: number;
  /** 所得税から引いた税額控除（住宅ローン控除） */
  taxCredit: number;
  /** 基準所得税額（算出所得税額 − 税額控除）。付加税はこれに掛かる */
  baseTax: number;
  /** 防衛特別所得税（基準所得税額 × 1%・内訳の目安） */
  defenseTax: number;
  /** 2027年以降の復興特別所得税（× 1.1%・内訳の目安） */
  reconstructionAfter: number;
  /** 改正前の復興特別所得税（× 2.1%・内訳の目安） */
  reconstructionBefore: number;
  /** 2027年の年税額（年調年税額。改正前の法律のまま） */
  yearTax2027Before: number;
  /** 2027年の年税額（年調年税額。改正後） */
  yearTax2027After: number;
  /** 2027年の付加税の変化（改正後 − 改正前。正なら負担増）。制度上つねに0 */
  change2027: number;
  /** 2038〜2047年の1年あたりの追加負担（付加税の改正後 − 改正前。基準所得税額 × 2.1%） */
  annual2038: number;
  /** 2038〜2047年の10年分の追加負担。**下限**（2048年以降も続く） */
  cumulative2038to2047: number;
  /** 2048年以降の1年あたりの追加負担（防衛特別の1%分。終期の定めがない） */
  annual2048: number;
}

/**
 * 年収と扶養人数から、防衛特別所得税と改正前後の差を計算する。
 *
 * 金額は「同じ年収・同じ控除が続いた場合」の目安。将来の年の額は、
 * その年の控除・税率が今と同じだと置いたもの（控除の改正は織り込めない）。
 */
export function calcBoei(input: BoeiInput): BoeiResult {
  const income = Math.max(0, Math.floor(input.income || 0));
  const dependents = Math.max(0, Math.floor(input.dependents || 0));
  const credit = Math.max(0, Math.floor(input.housingLoanCredit ?? 0));
  const socialInsurance = estimateSocialInsurance(income, input.kaigo === true);

  const nenmatsuInput: NenmatsuInput = {
    income,
    withheld: null,
    socialInsurance,
    kaigo: input.kaigo === true,
    spouse: 'none',
    spouseIncome: 0,
    dependentsGeneral: dependents,
    dependentsSpecific: 0,
    dependentsElderly: 0,
    specialRelativeIncomes: [],
    lifeInsurance: 0,
    earthquakeInsurance: 0,
    smallEnterpriseMutualAid: 0,
    housingLoanCredit: credit,
    housingLoanTier: 'rate5',
  };
  const t = calcYearTax(nenmatsuInput, RULES_R9, socialInsurance);
  const baseTax = t.adjustedTax;

  const share = (permille: number) => Math.floor((baseTax * permille) / 1000);
  const diff = (year: number) =>
    surtaxAmount(baseTax, year, 'after') - surtaxAmount(baseTax, year, 'before');

  const yearTax2027Before = yearTaxWithSurtax(baseTax, DEFENSE_START_YEAR, 'before');
  const yearTax2027After = yearTaxWithSurtax(baseTax, DEFENSE_START_YEAR, 'after');
  const annual2038 = diff(RECONSTRUCTION_LAST_YEAR_BEFORE + 1);

  return {
    gross: income,
    salaryDeduction: t.salaryDeduction,
    totalIncome: t.totalIncome,
    socialInsurance,
    basicDeduction: t.basicDeduction,
    dependentDeduction: t.dependentDeduction,
    taxableIncome: t.taxableIncome,
    calculatedTax: t.calculatedTax,
    taxCredit: t.housingLoan?.fromIncomeTax ?? 0,
    baseTax,
    defenseTax: share(surtaxPermille(DEFENSE_START_YEAR, 'after').defense),
    reconstructionAfter: share(surtaxPermille(DEFENSE_START_YEAR, 'after').reconstruction),
    reconstructionBefore: share(surtaxPermille(DEFENSE_START_YEAR, 'before').reconstruction),
    yearTax2027Before,
    yearTax2027After,
    change2027: diff(DEFENSE_START_YEAR),
    annual2038,
    cumulative2038to2047: annual2038 * EXTENDED_YEARS,
    annual2048: diff(RECONSTRUCTION_LAST_YEAR_AFTER + 1),
  };
}

/** 'YYYY-MM-DD' の基準日に、防衛特別所得税がもう始まっているか */
export function isDefenseTaxInEffect(asOfYmd: string): boolean {
  return asOfYmd >= DEFENSE_EFFECTIVE_ON;
}

/**
 * 早見表の年収（円）。仕様 4 のとおり 300万〜1,500万円。
 * 100万円刻み（1,000万円からは250万円刻み）で、「防衛増税 年収◯万円」のクエリを受ける。
 */
export const TABLE_INCOMES: readonly number[] = [
  3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000, 10_000_000,
  12_500_000, 15_000_000,
];

/** 早見表の1行 */
export interface TableRow {
  gross: number;
  /** 防衛特別所得税（年額） */
  defenseTax: number;
  /** 2027年の手取りの変化 */
  change2027: number;
  /** 2038〜2047年の1年あたりの追加負担 */
  annual2038: number;
  /** 2048年以降の1年あたりの追加負担 */
  annual2048: number;
}

/** 年収別の早見表（独身・扶養なし・40歳未満） */
export function hayamihyo(): TableRow[] {
  return TABLE_INCOMES.map((gross) => {
    const r = calcBoei({ income: gross, dependents: 0 });
    return {
      gross,
      defenseTax: r.defenseTax,
      change2027: r.change2027,
      annual2038: r.annual2038,
      annual2048: r.annual2048,
    };
  });
}
