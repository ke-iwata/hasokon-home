import { describe, expect, it } from 'vitest';
import {
  RULES_R7,
  RULES_R8,
  basicDeductionIncomeTaxR7,
  calcNenmatsuChosei,
  calcYearTax,
  estimateWithheld,
  salaryDeductionR7,
  spouseDeductionFor,
  specialRelativeDeductionFor,
  type NenmatsuInput,
} from '@/lib/nenmatsu-chosei';

/**
 * テスト用の入力。
 *
 * 社会保険料と源泉徴収累計は既定で実額を渡している。推計に依存させると
 * 保険料率の改定でテストがまとめて壊れ、何が壊れたのか分からなくなるため。
 * 推計そのものを見るテストだけ null を渡す。
 *
 * 734,500円は estimateSocialInsurance(5,000,000) と同じ額
 * （健康保険4.99% + 厚生年金9.15% + 雇用保険0.55%）。
 */
const base = (over: Partial<NenmatsuInput> = {}): NenmatsuInput => ({
  income: 5_000_000,
  withheld: null,
  socialInsurance: 734_500,
  kaigo: false,
  spouse: 'none',
  spouseIncome: 0,
  dependentsGeneral: 0,
  dependentsSpecific: 0,
  dependentsElderly: 0,
  specialRelativeIncomes: [],
  lifeInsurance: 0,
  earthquakeInsurance: 0,
  smallEnterpriseMutualAid: 0,
  housingLoanCredit: 0,
  housingLoanTier: 'rate5',
  ...over,
});

describe('salaryDeductionR7（比較用・令和7年分の給与所得控除）', () => {
  it('最低保障額は65万円', () => {
    expect(salaryDeductionR7(1_000_000)).toBe(650_000);
    expect(salaryDeductionR7(1_900_000)).toBe(650_000);
  });

  it('190万円で「収入×30% + 8万円」とつながる', () => {
    expect(1_900_000 * 0.3 + 80_000).toBe(650_000);
    expect(salaryDeductionR7(1_900_001)).toBeGreaterThan(650_000);
  });

  it('収入が控除額より少なければ収入額まで', () => {
    expect(salaryDeductionR7(400_000)).toBe(400_000);
    expect(salaryDeductionR7(0)).toBe(0);
  });

  it('360万円超の区分は令和8年分と同じ式', () => {
    expect(salaryDeductionR7(5_000_000)).toBe(1_440_000);
    expect(salaryDeductionR7(9_000_000)).toBe(1_950_000);
  });
});

describe('basicDeductionIncomeTaxR7（比較用・令和7年分の基礎控除）', () => {
  it('合計所得金額の区分ごとの額', () => {
    expect(basicDeductionIncomeTaxR7(1_320_000)).toBe(950_000);
    expect(basicDeductionIncomeTaxR7(3_360_000)).toBe(880_000);
    expect(basicDeductionIncomeTaxR7(4_890_000)).toBe(680_000);
    expect(basicDeductionIncomeTaxR7(6_550_000)).toBe(630_000);
    expect(basicDeductionIncomeTaxR7(23_500_000)).toBe(580_000);
    expect(basicDeductionIncomeTaxR7(25_000_001)).toBe(0);
  });

  it('令和8年分のほうが控除は大きい（＝減税になっている）', () => {
    expect(RULES_R8.basicDeduction(3_560_000)).toBe(1_040_000);
    expect(RULES_R7.basicDeduction(3_560_000)).toBe(680_000);
  });
});

describe('年税額（年調年税額）', () => {
  it('年収178万円ちょうどなら所得税はかからない', () => {
    // 給与所得控除74万 + 基礎控除104万 = 178万。これが所得税の壁
    const r = calcNenmatsuChosei(base({ income: 1_780_000, socialInsurance: 0 }));
    expect(r.current.totalIncome).toBe(1_040_000);
    expect(r.current.basicDeduction).toBe(1_040_000);
    expect(r.current.taxableIncome).toBe(0);
    expect(r.current.yearTax).toBe(0);
  });

  it('178万円を1万円超えても年500円（超えた分にだけかかる）', () => {
    const r = calcNenmatsuChosei(base({ income: 1_790_000, socialInsurance: 0 }));
    // 課税給与所得 10,000 × 5% = 500 → × 102.1% = 510.5 → 100円未満切捨てで500
    expect(r.current.taxableIncome).toBe(10_000);
    expect(r.current.yearTax).toBe(500);
  });

  it('給与収入500万円・独身・社会保険料734,500円の年税額は91,100円', () => {
    // 5,000,000 − 給与所得控除1,440,000 = 3,560,000
    // 3,560,000 −（734,500 + 1,040,000）= 1,785,500 → 1,785,000（1,000円未満切捨て）
    // 1,785,000 × 5% = 89,250 → × 102.1% = 91,124.25 → 91,100（100円未満切捨て）
    const y = calcYearTax(base(), RULES_R8, 734_500);
    expect(y.salaryDeduction).toBe(1_440_000);
    expect(y.totalIncome).toBe(3_560_000);
    expect(y.taxableIncome).toBe(1_785_000);
    expect(y.calculatedTax).toBe(89_250);
    expect(y.yearTax).toBe(91_100);
  });

  it('100円未満は切り捨てる', () => {
    const y = calcYearTax(base(), RULES_R8, 734_500);
    expect(y.yearTax % 100).toBe(0);
    expect(y.yearTax).toBeLessThan(y.adjustedTax * 1.021 + 100);
  });
});

describe('還付額', () => {
  /**
   * 令和8年度改正は令和8年12月1日施行で、11月までの源泉徴収事務には反映されていない
   * （国税庁「令和8年4月 源泉所得税の改正のあらまし」2ページ）。
   * このため推計の源泉徴収累計は**改正前の控除額**で計算される。
   */
  it('源泉徴収の推計は改正前（令和7年分）の控除額で行う', () => {
    // 3,560,000 −（734,500 + 680,000）= 2,145,500 → 2,145,000
    // 2,145,000 × 10% − 97,500 = 117,000 → × 102.1% = 119,400
    expect(estimateWithheld(base(), 734_500)).toBe(119_400);
    expect(calcNenmatsuChosei(base()).withheld).toBe(119_400);
  });

  it('年末調整でしか効かない控除が無くても、改正の分だけ還付が出る', () => {
    // これが令和8年分の年末調整で還付が大きくなる主因。
    // 源泉徴収の推計 119,400 − 年税額 91,100 = 28,300
    const r = calcNenmatsuChosei(base());
    expect(r.current.yearTax).toBe(91_100);
    expect(r.refund).toBe(28_300);
    expect(r.refund).toBe(r.reformSaving);
    expect(r.shortfall).toBe(0);
  });

  it('生命保険料控除4万円なら、改正の分に上乗せして30,400円戻る', () => {
    // 源泉徴収の推計 119,400 − 年税額 89,000 = 30,400
    //   内訳: 改正の効果 28,300 + 生命保険料控除の効果 2,100
    const r = calcNenmatsuChosei(base({ lifeInsurance: 40_000 }));
    expect(r.withheld).toBe(119_400);
    expect(r.current.taxableIncome).toBe(1_745_000);
    expect(r.current.yearTax).toBe(89_000);
    expect(r.refund).toBe(30_400);
    expect(r.shortfall).toBe(0);
  });

  it('生命保険料控除などは推計の源泉徴収累計に含めない（年末調整で初めて効くため）', () => {
    const withInsurance = estimateWithheld(base({ lifeInsurance: 40_000 }), 734_500);
    expect(withInsurance).toBe(estimateWithheld(base(), 734_500));
  });

  it('源泉徴収累計の実額を入れたらそれをそのまま使う', () => {
    const r = calcNenmatsuChosei(base({ withheld: 120_000 }));
    expect(r.withheld).toBe(120_000);
    expect(r.withheldEstimated).toBe(false);
    expect(r.refund).toBe(120_000 - 91_100);
  });

  it('源泉徴収累計が年税額より少なければ不足額（追徴）になる', () => {
    const r = calcNenmatsuChosei(base({ withheld: 50_000 }));
    expect(r.current.yearTax).toBe(91_100);
    expect(r.difference).toBe(50_000 - 91_100);
    expect(r.refund).toBe(0);
    expect(r.shortfall).toBe(41_100);
  });

  it('iDeCo・地震保険料控除も所得控除として効く', () => {
    const r = calcNenmatsuChosei(
      base({ smallEnterpriseMutualAid: 276_000, earthquakeInsurance: 50_000 }),
    );
    expect(r.current.insuranceDeduction).toBe(326_000);
    expect(r.refund).toBeGreaterThan(0);
  });

  it('推計を使ったかどうかが分かる', () => {
    expect(calcNenmatsuChosei(base()).estimated).toBe(true);
    expect(calcNenmatsuChosei(base({ withheld: 100_000 })).estimated).toBe(false);
    expect(
      calcNenmatsuChosei(base({ withheld: 100_000, socialInsurance: null })).estimated,
    ).toBe(true);
  });

  it('社会保険料を推計すると年収から概算される', () => {
    const r = calcNenmatsuChosei(base({ socialInsurance: null }));
    // 健康保険4.99% + 厚生年金9.15% + 雇用保険0.55% = 14.69%
    expect(r.socialInsurance).toBe(734_500);
    expect(r.socialInsuranceEstimated).toBe(true);
  });
});

describe('住宅ローン控除（税額控除）', () => {
  it('年税額は0円を下回らない（マイナスの年税額にならない）', () => {
    const r = calcNenmatsuChosei(base({ housingLoanCredit: 200_000, withheld: 91_100 }));
    expect(r.current.calculatedTax).toBe(89_250);
    expect(r.current.adjustedTax).toBe(0);
    expect(r.current.yearTax).toBe(0);
    // 還付されるのは源泉徴収された額まで。控除しきれない分は所得税からは戻らない
    expect(r.refund).toBe(91_100);
  });

  it('引ききれない分は住民税側へ回り、超過分は切り捨てになる', () => {
    const r = calcNenmatsuChosei(base({ housingLoanCredit: 200_000 }));
    const h = r.current.housingLoan!;
    expect(h.fromIncomeTax).toBe(89_250);
    // 住民税側の限度額は課税総所得金額等の5%（上限97,500円）
    expect(h.residentCap).toBe(89_250);
    expect(h.fromResidentTax).toBe(89_250);
    expect(h.wasted).toBe(200_000 - 89_250 * 2);
  });

  it('所得税額の範囲内なら全額が所得税から引かれる', () => {
    const r = calcNenmatsuChosei(base({ housingLoanCredit: 50_000 }));
    expect(r.current.housingLoan!.fromIncomeTax).toBe(50_000);
    expect(r.current.adjustedTax).toBe(89_250 - 50_000);
    // 39,250 × 102.1% = 40,074.25 → 40,000
    expect(r.current.yearTax).toBe(40_000);
  });

  it('住宅ローン控除は源泉徴収の推計には含めない（年末調整で初めて効くため）', () => {
    const input = base({ housingLoanCredit: 200_000 });
    expect(estimateWithheld(input, 734_500)).toBe(119_400);
    expect(estimateWithheld(input, 734_500)).toBe(estimateWithheld(base(), 734_500));
  });
});

describe('改正の効果（令和7年分の控除額との比較）', () => {
  it('給与収入500万円・独身なら28,300円の減税になる', () => {
    // 令和7年分: 3,560,000 −（734,500 + 680,000）= 2,145,500 → 2,145,000
    //            2,145,000 × 10% − 97,500 = 117,000 → × 102.1% = 119,400
    const r = calcNenmatsuChosei(base());
    expect(r.previous.basicDeduction).toBe(680_000);
    expect(r.previous.taxableIncome).toBe(2_145_000);
    expect(r.previous.yearTax).toBe(119_400);
    expect(r.current.yearTax).toBe(91_100);
    expect(r.reformSaving).toBe(28_300);
  });

  it('所得税がかからない人は改正の効果も0になる', () => {
    const r = calcNenmatsuChosei(base({ income: 1_000_000, socialInsurance: 0 }));
    expect(r.current.yearTax).toBe(0);
    expect(r.previous.yearTax).toBe(0);
    expect(r.reformSaving).toBe(0);
  });

  it('比較では給与所得控除の差も効く（低い年収帯）', () => {
    // 令和7年分の給与所得控除は65万円、令和8年分は74万円
    const r = calcNenmatsuChosei(base({ income: 2_000_000, socialInsurance: 0 }));
    expect(r.current.salaryDeduction).toBe(740_000);
    expect(r.previous.salaryDeduction).toBe(2_000_000 * 0.3 + 80_000);
    expect(r.reformSaving).toBeGreaterThan(0);
  });
});

describe('配偶者控除・配偶者特別控除', () => {
  const forSpouse = (spouseIncome: number, spouse: 'general' | 'elderly' = 'general') =>
    spouseDeductionFor({ spouse, spouseIncome, totalIncome: 3_560_000, rules: RULES_R8 });

  it('配偶者の年収136万円までは配偶者控除38万円', () => {
    expect(forSpouse(1_000_000)).toEqual({ amount: 380_000, isSpecial: false });
    expect(forSpouse(1_360_000)).toEqual({ amount: 380_000, isSpecial: false });
  });

  it('136万円を超えても配偶者特別控除38万円に自動で移り、額は変わらない', () => {
    // 「136万円の壁」で世帯の税負担が急に増えないのはこのため
    expect(forSpouse(1_360_001)).toEqual({ amount: 380_000, isSpecial: true });
    expect(forSpouse(1_690_000)).toEqual({ amount: 380_000, isSpecial: true });
  });

  it('169万円を超えると段階的に減り、207万円で消える', () => {
    expect(forSpouse(1_690_001).amount).toBe(360_000);
    expect(forSpouse(2_070_000).amount).toBe(30_000);
    expect(forSpouse(2_070_001).amount).toBe(0);
  });

  it('70歳以上の配偶者は48万円', () => {
    expect(forSpouse(0, 'elderly')).toEqual({ amount: 480_000, isSpecial: false });
  });

  it('本人の合計所得金額900万円超で減り、1,000万円超で対象外', () => {
    const at = (totalIncome: number) =>
      spouseDeductionFor({ spouse: 'general', spouseIncome: 0, totalIncome, rules: RULES_R8 })
        .amount;
    expect(at(9_000_000)).toBe(380_000);
    expect(at(9_500_000)).toBe(260_000);
    expect(at(10_000_000)).toBe(130_000);
    expect(at(10_000_001)).toBe(0);
  });

  it('配偶者なしなら0', () => {
    expect(
      spouseDeductionFor({
        spouse: 'none',
        spouseIncome: 0,
        totalIncome: 3_560_000,
        rules: RULES_R8,
      }),
    ).toEqual({ amount: 0, isSpecial: false });
  });

  it('令和7年分では配偶者控除の上限が年収123万円だった', () => {
    const r7 = (spouseIncome: number) =>
      spouseDeductionFor({ spouse: 'general', spouseIncome, totalIncome: 3_560_000, rules: RULES_R7 });
    expect(r7(1_230_000).isSpecial).toBe(false);
    expect(r7(1_230_001).isSpecial).toBe(true);
  });
});

describe('特定親族特別控除（19〜22歳の親族）', () => {
  const at = (income: number) => specialRelativeDeductionFor(income, RULES_R8);

  it('年収136万円までは扶養控除の対象なので0（人数のほうに数える）', () => {
    expect(at(1_360_000)).toBe(0);
  });

  it('159万円までは満額63万円', () => {
    expect(at(1_360_001)).toBe(630_000);
    expect(at(1_590_000)).toBe(630_000);
  });

  it('159万円を超えると段階的に減り、197万円で消える', () => {
    expect(at(1_590_001)).toBe(610_000);
    expect(at(1_970_000)).toBe(30_000);
    expect(at(1_970_001)).toBe(0);
  });

  it('人数分が合算される', () => {
    const r = calcNenmatsuChosei(
      base({ specialRelativeIncomes: [1_500_000, 1_800_000], withheld: 200_000 }),
    );
    expect(r.current.specialRelativeDeduction).toBe(630_000 + 210_000);
  });
});

describe('扶養控除', () => {
  it('区分ごとの控除額を合算する', () => {
    const r = calcNenmatsuChosei(
      base({ dependentsGeneral: 2, dependentsSpecific: 1, dependentsElderly: 1 }),
    );
    expect(r.current.dependentDeduction).toBe(380_000 * 2 + 630_000 + 480_000);
  });

  it('扶養親族が増えると年税額が下がる', () => {
    const alone = calcNenmatsuChosei(base()).current.yearTax;
    const withKid = calcNenmatsuChosei(base({ dependentsGeneral: 1 })).current.yearTax;
    expect(withKid).toBeLessThan(alone);
  });

  it('マイナスの人数は0として扱う', () => {
    const r = calcNenmatsuChosei(base({ dependentsGeneral: -3 }));
    expect(r.current.dependentDeduction).toBe(0);
  });
});

describe('異常値', () => {
  it('年収0円でも落ちない', () => {
    const r = calcNenmatsuChosei(base({ income: 0, socialInsurance: 0 }));
    expect(r.current.yearTax).toBe(0);
    expect(r.refund).toBe(0);
    expect(r.shortfall).toBe(0);
  });

  it('マイナスの年収・控除額は0として扱う', () => {
    const r = calcNenmatsuChosei(
      base({ income: -100, socialInsurance: -100, lifeInsurance: -100, withheld: -100 }),
    );
    expect(r.current.totalIncome).toBe(0);
    expect(r.socialInsurance).toBe(0);
    expect(r.current.insuranceDeduction).toBe(0);
    expect(r.withheld).toBe(0);
  });

  it('高収入でも速算表の最上位まで計算できる', () => {
    const r = calcNenmatsuChosei(base({ income: 50_000_000, socialInsurance: null }));
    expect(r.current.salaryDeduction).toBe(1_950_000);
    expect(r.current.basicDeduction).toBe(0);
    expect(r.current.yearTax).toBeGreaterThan(0);
  });
});
