/**
 * ふるさと納税 控除額計算ロジック（令和8年分＝2026年の寄付）
 *
 * ふるさと納税の控除は3階建てで、寄付額から2,000円を引いた額が
 * 次の3つに分かれて戻ってくる（合計すると寄付額 − 2,000円になる）。
 *
 *   1. 所得税からの控除  =（寄付額 − 2,000円）× 所得税率 × 1.021
 *      ※寄付額は総所得金額等の40%が上限
 *   2. 住民税からの控除（基本分） =（寄付額 − 2,000円）× 10%
 *      ※寄付額は総所得金額等の30%が上限
 *   3. 住民税からの控除（特例分） =（寄付額 − 2,000円）×（90% − 所得税率 × 1.021）
 *      ※住民税所得割額の20%が上限。ここを超えると自己負担が2,000円で済まなくなる
 *
 * 3の上限から逆算したものが「控除上限額」。
 *   控除上限額 = 住民税所得割額 × 20% ÷（90% − 所得税率 × 1.021）+ 2,000円
 *
 * 1.021 は復興特別所得税（基準所得税額の2.1%。平成25年〜令和19年）。
 *
 * ワンストップ特例を使う場合は所得税からの控除がなくなり、その分が
 * 住民税の「申告特例控除額」として住民税から控除される。合計額は変わらない。
 *
 * ■ 制度データの根拠（令和8年分）
 * 令和8年度税制改正（所得税法等の一部を改正する法律・令和8年法律第12号）により
 * 令和8年分から次のとおり。lib/nenshu-kabe.ts と同じ前提。
 * - 給与所得控除の最低保障額 74万円（給与収入220万円以下）
 * - 所得税の基礎控除 本則62万円 + 特例加算（合計所得489万円以下なら42万円）
 * - 住民税の基礎控除は43万円のまま（改正なし）
 *
 * このため令和8年分は、所得税の課税所得が下がって税率区分が1段下がる人がいる。
 * 上の式のとおり所得税率が下がると控除上限額も下がるので、
 * 前年と同じ感覚で寄付すると自己負担が増える場合がある。
 *
 * 【データ更新箇所】税制改正があったら SALARY_DEDUCTION / BASIC_DEDUCTION_INCOME /
 * BASIC_DEDUCTION_RESIDENT / INCOME_TAX_BRACKETS / 各控除額の定数を更新する。
 *
 * 注意: 給与収入のみ・所得控除は下記の入力分のみという前提の概算。
 * 住宅ローン控除や配当控除など税額控除がある場合、住民税所得割額が変わるため
 * 実際の上限額は下がる。
 */

/** 自己負担額（制度上、必ず自己負担になる額） */
export const SELF_PAY = 2_000;

/** 復興特別所得税を含めた所得税率の倍率（基準所得税額の2.1%） */
export const RECONSTRUCTION_RATE = 1.021;

/** 住民税所得割の税率（市町村民税6% + 道府県民税4%） */
export const RESIDENT_RATE = 0.1;

/** 特例分の上限（住民税所得割額に対する割合） */
export const SPECIAL_CAP_RATE = 0.2;

/** 基本分の対象になる寄付額の上限（総所得金額等に対する割合） */
export const BASIC_LIMIT_RATE = 0.3;

/** 所得税分の対象になる寄付額の上限（総所得金額等に対する割合） */
export const INCOME_TAX_LIMIT_RATE = 0.4;

/**
 * 給与所得控除（令和8年分）。
 * 最低保障額74万円。220万円で「収入×30% + 8万円」とちょうどつながる。
 */
export function salaryDeduction(income: number): number {
  if (income <= 0) return 0;
  if (income <= 2_200_000) return Math.min(income, 740_000);
  if (income <= 3_600_000) return income * 0.3 + 80_000;
  if (income <= 6_600_000) return income * 0.2 + 440_000;
  if (income <= 8_500_000) return income * 0.1 + 1_100_000;
  return 1_950_000;
}

/** 給与所得（給与収入 − 給与所得控除）。給与のみの場合はこれが合計所得金額になる */
export function salaryIncome(income: number): number {
  return Math.max(0, Math.floor(income - salaryDeduction(income)));
}

/**
 * 所得税の基礎控除（令和8年分）。
 * 本則62万円に、合計所得金額に応じた特例加算（令和8・9年分の時限措置）が乗る。
 */
export function basicDeductionIncomeTax(totalIncome: number): number {
  if (totalIncome <= 4_890_000) return 1_040_000; // 62万 + 42万
  if (totalIncome <= 6_550_000) return 670_000; // 62万 + 5万
  if (totalIncome <= 23_500_000) return 620_000; // 本則のみ
  if (totalIncome <= 24_000_000) return 480_000;
  if (totalIncome <= 24_500_000) return 320_000;
  if (totalIncome <= 25_000_000) return 160_000;
  return 0;
}

/** 住民税の基礎控除。令和8年度改正でも43万円のまま据え置かれている */
export function basicDeductionResidentTax(totalIncome: number): number {
  if (totalIncome <= 24_000_000) return 430_000;
  if (totalIncome <= 24_500_000) return 290_000;
  if (totalIncome <= 25_000_000) return 150_000;
  return 0;
}

/** 所得税の速算表（課税総所得金額の上限と税率） */
const INCOME_TAX_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 1_950_000, rate: 0.05 },
  { upTo: 3_300_000, rate: 0.1 },
  { upTo: 6_950_000, rate: 0.2 },
  { upTo: 9_000_000, rate: 0.23 },
  { upTo: 18_000_000, rate: 0.33 },
  { upTo: 40_000_000, rate: 0.4 },
  { upTo: Infinity, rate: 0.45 },
];

/**
 * 課税総所得金額に対応する所得税率を返す。
 * 課税所得が0以下（所得税がかからない）なら0。
 */
export function incomeTaxRate(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  return INCOME_TAX_BRACKETS.find((b) => taxableIncome < b.upTo)?.rate ?? 0.45;
}

/** 配偶者控除の区分 */
export type SpouseType = 'none' | 'general' | 'elderly';

/**
 * 控除額と「人的控除の差」をまとめたもの。
 * 差は住民税の調整控除に使う（所得税と住民税で控除額が違う分を穴埋めする仕組み）。
 */
interface PersonalDeduction {
  incomeTax: number;
  residentTax: number;
  /** 調整控除に使う人的控除の差額（実際の差ではなく地方税法が定める固定値） */
  diff: number;
}

/**
 * 配偶者控除。本人の合計所得金額900万円超で段階的に減る。
 * 【データ更新箇所】金額が変わったらここ。
 */
function spouseDeduction(type: SpouseType, totalIncome: number): PersonalDeduction {
  if (type === 'none' || totalIncome > 10_000_000) {
    return { incomeTax: 0, residentTax: 0, diff: 0 };
  }
  const tier = totalIncome <= 9_000_000 ? 0 : totalIncome <= 9_500_000 ? 1 : 2;
  if (type === 'elderly') {
    return [
      { incomeTax: 480_000, residentTax: 380_000, diff: 100_000 },
      { incomeTax: 320_000, residentTax: 260_000, diff: 60_000 },
      { incomeTax: 160_000, residentTax: 130_000, diff: 30_000 },
    ][tier];
  }
  return [
    { incomeTax: 380_000, residentTax: 330_000, diff: 50_000 },
    { incomeTax: 260_000, residentTax: 220_000, diff: 40_000 },
    { incomeTax: 130_000, residentTax: 110_000, diff: 20_000 },
  ][tier];
}

/**
 * 扶養控除。1人あたりの額。
 * 【データ更新箇所】金額が変わったらここ。
 */
const DEPENDENT_DEDUCTION: Record<'general' | 'specific' | 'elderly', PersonalDeduction> = {
  /** 一般（16〜18歳・23〜69歳） */
  general: { incomeTax: 380_000, residentTax: 330_000, diff: 50_000 },
  /** 特定扶養親族（19〜22歳） */
  specific: { incomeTax: 630_000, residentTax: 450_000, diff: 180_000 },
  /** 老人扶養親族（70歳以上・同居老親等を除く） */
  elderly: { incomeTax: 480_000, residentTax: 380_000, diff: 100_000 },
};

/** 基礎控除の人的控除の差。地方税法上は5万円で固定（実際の差額とは一致しない） */
const BASIC_DEDUCTION_DIFF = 50_000;

/**
 * 住民税の調整控除。
 *
 * 所得税と住民税で人的控除の額が違うため、そのままだと住民税の負担が
 * 増えてしまう。それを打ち消すための控除で、所得割額から直接引かれる。
 * 合計所得金額2,500万円超は適用なし。
 */
export function adjustmentDeduction(
  taxableResident: number,
  humanDiff: number,
  totalIncome: number,
): number {
  if (totalIncome > 25_000_000 || taxableResident <= 0) return 0;
  if (taxableResident <= 2_000_000) {
    return Math.floor(Math.min(humanDiff, taxableResident) * 0.05);
  }
  const value = (humanDiff - (taxableResident - 2_000_000)) * 0.05;
  return Math.max(2_500, Math.floor(value));
}

/**
 * 社会保険料の年額上限を求めるための、保険料がかかる報酬の上限（年額）。
 *
 * 標準報酬月額と標準賞与額それぞれに上限があるので、年間で見た上限は
 * 「月額の上限×12 + 賞与の上限」になる。
 * - 厚生年金: 標準報酬月額65万円 × 12 + 標準賞与額150万円 × 年3回 = 1,230万円
 * - 健康保険: 標準報酬月額139万円 × 12 + 標準賞与額の年間累計573万円 = 2,241万円
 *
 * 年収を12等分して月額の上限だけを見ると、賞与の割合が大きい人で
 * 保険料を大幅に少なく見積もってしまうため、年額で判定している。
 */
const PENSION_CAP = 12_300_000;
const HEALTH_CAP = 22_410_000;

/**
 * 社会保険料の概算（会社員・年間）。
 *
 * 「年収の15%」といった一定割合で計算すると、上限がある厚生年金の分だけ
 * 高収入の人ほど過大になる。上限を反映しているので年収2,000万円でも
 * 実態に近い値になる。
 *
 * あくまで目安。実際の保険料は加入している健康保険組合の料率、
 * 月給と賞与の配分、住んでいる都道府県で変わる。
 * 正確に計算したい場合は源泉徴収票の「社会保険料等の金額」を入力すること。
 *
 * 【データ更新箇所】保険料率・上限額が変わったらここ。
 */
export function estimateSocialInsurance(income: number, kaigo = false): number {
  if (income <= 0) return 0;
  // 協会けんぽの全国平均（本人負担分）。介護保険は40〜64歳のみ
  const healthRate = 0.0499 + (kaigo ? 0.008 : 0);
  const health = Math.min(income, HEALTH_CAP) * healthRate;
  const pension = Math.min(income, PENSION_CAP) * 0.0915;
  // 雇用保険（一般の事業・労働者負担）は上限なし
  const employment = income * 0.0055;
  return Math.round(health + pension + employment);
}

export interface FurusatoInput {
  /** 給与収入（額面・年間・円） */
  income: number;
  /** 社会保険料（年間・円）。null なら income から概算する */
  socialInsurance: number | null;
  /** 40〜64歳（介護保険料がかかる）。社会保険料を概算するときだけ使う */
  kaigo: boolean;
  spouse: SpouseType;
  /** 一般の扶養親族の人数（16〜18歳・23〜69歳） */
  dependentsGeneral: number;
  /** 特定扶養親族の人数（19〜22歳） */
  dependentsSpecific: number;
  /** 老人扶養親族の人数（70歳以上） */
  dependentsElderly: number;
  /** その他の所得控除・所得税分（生命保険料控除・医療費控除・iDeCoなど・円） */
  otherDeductionsIncomeTax: number;
  /** その他の所得控除・住民税分（同上。生命保険料控除などは所得税より上限が低い） */
  otherDeductionsResidentTax: number;
  /** 寄付額（円）。0 なら上限額いっぱいで計算する */
  donation: number;
  /** ワンストップ特例を使う（確定申告をしない） */
  onestop: boolean;
}

/** 寄付額に対する控除の内訳 */
export interface FurusatoBreakdown {
  donation: number;
  /** 所得税からの控除（還付）。ワンストップ特例のときは0 */
  fromIncomeTax: number;
  /** 住民税からの控除・基本分 */
  residentBasic: number;
  /** 住民税からの控除・特例分 */
  residentSpecial: number;
  /** 住民税からの控除・申告特例控除額（ワンストップ特例のときだけ） */
  residentOnestop: number;
  /** 住民税から控除される合計 */
  residentTotal: number;
  /** 控除の合計 */
  total: number;
  /** 自己負担額（2,000円で収まっているかの確認に使う） */
  outOfPocket: number;
  /** 特例分が上限（所得割額の20%）に達したか。達していると自己負担が増える */
  specialCapped: boolean;
}

export interface FurusatoResult {
  /** 給与所得控除 */
  salaryDeduction: number;
  /** 合計所得金額（給与所得） */
  totalIncome: number;
  /** 社会保険料（入力値、または概算値） */
  socialInsurance: number;
  /** 社会保険料が概算値か */
  socialInsuranceEstimated: boolean;
  incomeTax: {
    basicDeduction: number;
    /** 人的控除（配偶者控除 + 扶養控除） */
    personalDeduction: number;
    /** 所得控除の合計 */
    deductionTotal: number;
    /** 課税総所得金額（1,000円未満切捨て） */
    taxableIncome: number;
    /** 所得税率（0〜0.45） */
    rate: number;
  };
  residentTax: {
    basicDeduction: number;
    personalDeduction: number;
    deductionTotal: number;
    taxableIncome: number;
    /** 調整控除 */
    adjustment: number;
    /** 所得割額（ふるさと納税の上限を決める額） */
    incomeLevy: number;
  };
  /** 控除上限額（自己負担が2,000円で収まる寄付額の上限） */
  limit: number;
  /** 寄付額に対する控除の内訳 */
  breakdown: FurusatoBreakdown;
}

/** 課税所得は1,000円未満を切り捨てる */
const floorTo1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);

/**
 * ふるさと納税の控除上限額と、寄付額に対する控除の内訳を計算する。
 *
 * @param input 給与収入・家族構成・寄付額など
 * @returns 計算の途中経過を含む結果。UIで内訳を見せるため中間値も返す
 */
export function calcFurusato(input: FurusatoInput): FurusatoResult {
  const income = Math.max(0, input.income);
  const deduction = salaryDeduction(income);
  const totalIncome = salaryIncome(income);

  const socialInsuranceEstimated = input.socialInsurance === null;
  const socialInsurance = Math.max(
    0,
    socialInsuranceEstimated
      ? estimateSocialInsurance(income, input.kaigo)
      : (input.socialInsurance ?? 0),
  );

  // 人的控除（配偶者控除 + 扶養控除）を所得税・住民税それぞれで積む。
  // あわせて調整控除に使う「人的控除の差」も集計する
  const counts: [keyof typeof DEPENDENT_DEDUCTION, number][] = [
    ['general', Math.max(0, input.dependentsGeneral)],
    ['specific', Math.max(0, input.dependentsSpecific)],
    ['elderly', Math.max(0, input.dependentsElderly)],
  ];
  const spouse = spouseDeduction(input.spouse, totalIncome);
  let personalIncomeTax = spouse.incomeTax;
  let personalResidentTax = spouse.residentTax;
  let humanDiff = BASIC_DEDUCTION_DIFF + spouse.diff;
  for (const [key, n] of counts) {
    const d = DEPENDENT_DEDUCTION[key];
    personalIncomeTax += d.incomeTax * n;
    personalResidentTax += d.residentTax * n;
    humanDiff += d.diff * n;
  }

  const basicIncomeTax = basicDeductionIncomeTax(totalIncome);
  const basicResidentTax = basicDeductionResidentTax(totalIncome);
  const otherIncomeTax = Math.max(0, input.otherDeductionsIncomeTax);
  const otherResidentTax = Math.max(0, input.otherDeductionsResidentTax);

  const deductionTotalIncomeTax =
    socialInsurance + basicIncomeTax + personalIncomeTax + otherIncomeTax;
  const deductionTotalResidentTax =
    socialInsurance + basicResidentTax + personalResidentTax + otherResidentTax;

  const taxableIncomeTax = floorTo1000(totalIncome - deductionTotalIncomeTax);
  const taxableResidentTax = floorTo1000(totalIncome - deductionTotalResidentTax);

  const rate = incomeTaxRate(taxableIncomeTax);
  const adjustment = adjustmentDeduction(taxableResidentTax, humanDiff, totalIncome);
  const incomeLevy = Math.max(
    0,
    Math.floor(taxableResidentTax * RESIDENT_RATE) - adjustment,
  );

  // 控除上限額。特例分の上限（所得割額の20%）から逆算する。
  // 基本分の対象になる寄付額の上限（総所得金額等の30%）も超えられないので、
  // 小さいほうを採用する（通常は特例分のほうが先に効く）
  const denominator = 0.9 - rate * RECONSTRUCTION_RATE;
  const fromSpecial =
    incomeLevy <= 0 ? 0 : (incomeLevy * SPECIAL_CAP_RATE) / denominator + SELF_PAY;
  const fromBasicCap = totalIncome * BASIC_LIMIT_RATE;
  const limit = Math.max(0, Math.floor(Math.min(fromSpecial, fromBasicCap)));

  const donation = input.donation > 0 ? Math.max(0, input.donation) : limit;
  const breakdown = calcBreakdown({
    donation,
    rate,
    incomeLevy,
    totalIncome,
    onestop: input.onestop,
  });

  return {
    salaryDeduction: Math.floor(deduction),
    totalIncome,
    socialInsurance,
    socialInsuranceEstimated,
    incomeTax: {
      basicDeduction: basicIncomeTax,
      personalDeduction: personalIncomeTax,
      deductionTotal: Math.floor(deductionTotalIncomeTax),
      taxableIncome: taxableIncomeTax,
      rate,
    },
    residentTax: {
      basicDeduction: basicResidentTax,
      personalDeduction: personalResidentTax,
      deductionTotal: Math.floor(deductionTotalResidentTax),
      taxableIncome: taxableResidentTax,
      adjustment,
      incomeLevy,
    },
    limit,
    breakdown,
  };
}

/**
 * 寄付額に対する控除の内訳を計算する。
 *
 * ワンストップ特例では所得税から控除されず、同額が住民税の
 * 「申告特例控除額」として上乗せされる。合計は確定申告の場合と一致する。
 */
function calcBreakdown({
  donation,
  rate,
  incomeLevy,
  totalIncome,
  onestop,
}: {
  donation: number;
  rate: number;
  incomeLevy: number;
  totalIncome: number;
  onestop: boolean;
}): FurusatoBreakdown {
  const base = Math.max(0, donation - SELF_PAY);
  if (base === 0) {
    return {
      donation,
      fromIncomeTax: 0,
      residentBasic: 0,
      residentSpecial: 0,
      residentOnestop: 0,
      residentTotal: 0,
      total: 0,
      outOfPocket: donation,
      specialCapped: false,
    };
  }

  // 所得税分・基本分はそれぞれ対象になる寄付額に上限がある
  const incomeTaxBase = Math.max(0, Math.min(donation, totalIncome * INCOME_TAX_LIMIT_RATE) - SELF_PAY);
  const basicBase = Math.max(0, Math.min(donation, totalIncome * BASIC_LIMIT_RATE) - SELF_PAY);

  const rateWithSurtax = rate * RECONSTRUCTION_RATE;
  const fromIncomeTaxFull = Math.floor(incomeTaxBase * rateWithSurtax);
  const residentBasic = Math.floor(basicBase * RESIDENT_RATE);

  // 特例分。所得割額の20%が上限で、超えた分は自己負担になる
  const specialCap = Math.floor(incomeLevy * SPECIAL_CAP_RATE);
  const specialRaw = Math.floor(base * (0.9 - rateWithSurtax));
  const specialCapped = specialRaw > specialCap;
  const residentSpecial = specialCapped ? specialCap : specialRaw;

  // ワンストップ特例では所得税から引かれず、同額が住民税に回る
  const fromIncomeTax = onestop ? 0 : fromIncomeTaxFull;
  const residentOnestop = onestop ? fromIncomeTaxFull : 0;

  const residentTotal = residentBasic + residentSpecial + residentOnestop;
  const total = fromIncomeTax + residentTotal;

  return {
    donation,
    fromIncomeTax,
    residentBasic,
    residentSpecial,
    residentOnestop,
    residentTotal,
    total,
    outOfPocket: donation - total,
    specialCapped,
  };
}
