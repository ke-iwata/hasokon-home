import { describe, expect, it } from 'vitest';
import {
  adjustmentDeduction,
  basicDeductionIncomeTax,
  basicDeductionResidentTax,
  calcFurusato,
  estimateSocialInsurance,
  applyHousingLoan,
  housingLoanResidentCap,
  incomeTaxRate,
  salaryDeduction,
  salaryIncome,
  type FurusatoInput,
} from '@/lib/furusato-nozei';

/**
 * テスト用の入力。社会保険料は概算に依存すると保険料率の変更でテストが
 * 壊れるため、明示的に渡している。
 */
const base = (over: Partial<FurusatoInput> = {}): FurusatoInput => ({
  income: 5_000_000,
  socialInsurance: 734_500,
  kaigo: false,
  spouse: 'none',
  dependentsGeneral: 0,
  dependentsSpecific: 0,
  dependentsElderly: 0,
  otherDeductionsIncomeTax: 0,
  otherDeductionsResidentTax: 0,
  donation: 0,
  onestop: false,
  housingLoanCredit: 0,
  housingLoanTier: 'rate5',
  ...over,
});

describe('salaryDeduction（令和8年分）', () => {
  it('最低保障額は74万円', () => {
    expect(salaryDeduction(1_000_000)).toBe(740_000);
    expect(salaryDeduction(2_200_000)).toBe(740_000);
  });

  it('収入が控除額より少ない場合は収入額まで（所得がマイナスにならない）', () => {
    expect(salaryDeduction(500_000)).toBe(500_000);
    expect(salaryIncome(500_000)).toBe(0);
  });

  it('220万円で「収入×30% + 8万円」とつながる', () => {
    // 2,200,000 × 30% + 80,000 = 740,000 で最低保障額と一致する
    expect(salaryDeduction(2_200_001)).toBeCloseTo(2_200_001 * 0.3 + 80_000, 0);
    expect(salaryDeduction(2_200_001)).toBeGreaterThan(740_000);
  });

  it('各区分の境界で連続している', () => {
    expect(salaryDeduction(3_600_000)).toBe(3_600_000 * 0.3 + 80_000); // 116万
    expect(salaryDeduction(3_600_000)).toBe(3_600_000 * 0.2 + 440_000);
    expect(salaryDeduction(6_600_000)).toBe(6_600_000 * 0.2 + 440_000); // 176万
    expect(salaryDeduction(8_500_000)).toBe(1_950_000);
  });

  it('850万円超は195万円で頭打ち', () => {
    expect(salaryDeduction(20_000_000)).toBe(1_950_000);
  });

  it('年収500万円の給与所得は356万円', () => {
    expect(salaryIncome(5_000_000)).toBe(3_560_000);
  });

  it('収入0でも落ちない', () => {
    expect(salaryDeduction(0)).toBe(0);
    expect(salaryIncome(0)).toBe(0);
  });
});

describe('basicDeductionIncomeTax（所得税の基礎控除・令和8年分）', () => {
  it('合計所得489万円以下は104万円（本則62万 + 特例加算42万）', () => {
    expect(basicDeductionIncomeTax(3_560_000)).toBe(1_040_000);
    expect(basicDeductionIncomeTax(4_890_000)).toBe(1_040_000);
  });

  it('489万円超655万円以下は67万円', () => {
    expect(basicDeductionIncomeTax(4_890_001)).toBe(670_000);
    expect(basicDeductionIncomeTax(6_550_000)).toBe(670_000);
  });

  it('655万円超は本則の62万円', () => {
    expect(basicDeductionIncomeTax(6_550_001)).toBe(620_000);
    expect(basicDeductionIncomeTax(23_500_000)).toBe(620_000);
  });

  it('2,350万円超は段階的に減り、2,500万円超で0になる', () => {
    expect(basicDeductionIncomeTax(23_500_001)).toBe(480_000);
    expect(basicDeductionIncomeTax(24_500_000)).toBe(320_000);
    expect(basicDeductionIncomeTax(25_000_000)).toBe(160_000);
    expect(basicDeductionIncomeTax(25_000_001)).toBe(0);
  });
});

describe('basicDeductionResidentTax（住民税の基礎控除）', () => {
  it('令和8年度改正でも43万円のまま', () => {
    expect(basicDeductionResidentTax(3_560_000)).toBe(430_000);
    expect(basicDeductionResidentTax(20_000_000)).toBe(430_000);
  });

  it('2,400万円超は段階的に減り、2,500万円超で0になる', () => {
    expect(basicDeductionResidentTax(24_500_000)).toBe(290_000);
    expect(basicDeductionResidentTax(25_000_000)).toBe(150_000);
    expect(basicDeductionResidentTax(25_000_001)).toBe(0);
  });
});

describe('incomeTaxRate', () => {
  it('速算表の境界どおりに切り替わる', () => {
    expect(incomeTaxRate(1_949_000)).toBe(0.05);
    expect(incomeTaxRate(1_950_000)).toBe(0.1);
    expect(incomeTaxRate(3_299_000)).toBe(0.1);
    expect(incomeTaxRate(3_300_000)).toBe(0.2);
    expect(incomeTaxRate(6_949_000)).toBe(0.2);
    expect(incomeTaxRate(6_950_000)).toBe(0.23);
    expect(incomeTaxRate(8_999_000)).toBe(0.23);
    expect(incomeTaxRate(9_000_000)).toBe(0.33);
    expect(incomeTaxRate(18_000_000)).toBe(0.4);
    expect(incomeTaxRate(40_000_000)).toBe(0.45);
  });

  it('課税所得が0以下なら0%', () => {
    expect(incomeTaxRate(0)).toBe(0);
    expect(incomeTaxRate(-100)).toBe(0);
  });
});

describe('adjustmentDeduction（住民税の調整控除）', () => {
  it('課税所得200万円以下は「人的控除の差」と課税所得の小さいほうの5%', () => {
    expect(adjustmentDeduction(1_500_000, 50_000, 3_000_000)).toBe(2_500);
    // 課税所得のほうが小さいときはそちらを使う
    expect(adjustmentDeduction(30_000, 50_000, 3_000_000)).toBe(1_500);
  });

  it('課税所得200万円超は差し引き計算になり、2,500円が最低保障', () => {
    expect(adjustmentDeduction(2_395_000, 50_000, 3_560_000)).toBe(2_500);
    // 人的控除の差が大きければ2,500円を上回る
    expect(adjustmentDeduction(2_100_000, 230_000, 5_000_000)).toBe(6_500);
  });

  it('合計所得2,500万円超は適用されない', () => {
    expect(adjustmentDeduction(20_000_000, 50_000, 25_000_001)).toBe(0);
  });

  it('課税所得が0なら適用されない', () => {
    expect(adjustmentDeduction(0, 50_000, 3_000_000)).toBe(0);
  });
});

describe('estimateSocialInsurance', () => {
  it('年収500万円で約14.7%（会社員の目安）', () => {
    const v = estimateSocialInsurance(5_000_000);
    expect(v).toBe(734_500);
    expect(v / 5_000_000).toBeGreaterThan(0.14);
    expect(v / 5_000_000).toBeLessThan(0.16);
  });

  it('厚生年金の上限があるため高収入ほど負担率が下がる', () => {
    const low = estimateSocialInsurance(5_000_000) / 5_000_000;
    const high = estimateSocialInsurance(20_000_000) / 20_000_000;
    expect(high).toBeLessThan(low);
    // 年収の15%固定で計算すると高収入で大きく過大になる
    expect(estimateSocialInsurance(20_000_000)).toBeLessThan(20_000_000 * 0.15);
  });

  it('介護保険（40〜64歳）があると増える', () => {
    expect(estimateSocialInsurance(5_000_000, true)).toBeGreaterThan(
      estimateSocialInsurance(5_000_000, false),
    );
  });

  it('収入0なら0', () => {
    expect(estimateSocialInsurance(0)).toBe(0);
  });
});

describe('calcFurusato 年収500万円・独身', () => {
  const r = calcFurusato(base());

  it('計算の途中経過が正しい', () => {
    expect(r.totalIncome).toBe(3_560_000);
    expect(r.incomeTax.basicDeduction).toBe(1_040_000);
    expect(r.incomeTax.taxableIncome).toBe(1_785_000);
    expect(r.incomeTax.rate).toBe(0.05);
    expect(r.residentTax.basicDeduction).toBe(430_000);
    expect(r.residentTax.taxableIncome).toBe(2_395_000);
    expect(r.residentTax.adjustment).toBe(2_500);
    expect(r.residentTax.incomeLevy).toBe(237_000);
  });

  it('控除上限額は約5.8万円', () => {
    // 237,000 × 20% ÷ (90% − 5% × 1.021) + 2,000
    expect(r.limit).toBe(57_833);
  });

  it('寄付額を指定しなければ上限額いっぱいで内訳を出す', () => {
    expect(r.breakdown.donation).toBe(r.limit);
  });

  it('上限額いっぱいなら自己負担はほぼ2,000円', () => {
    // 各控除は円未満を切り捨てるため、端数で数円ぶん増える
    expect(r.breakdown.outOfPocket).toBeGreaterThanOrEqual(2_000);
    expect(r.breakdown.outOfPocket).toBeLessThan(2_100);
    expect(r.breakdown.specialCapped).toBe(false);
  });

  it('内訳の合計が控除の合計と一致する', () => {
    const b = r.breakdown;
    expect(b.fromIncomeTax + b.residentBasic + b.residentSpecial + b.residentOnestop).toBe(
      b.total,
    );
    expect(b.residentBasic + b.residentSpecial + b.residentOnestop).toBe(b.residentTotal);
  });
});

describe('calcFurusato 上限額を超えた寄付', () => {
  const r = calcFurusato(base({ donation: 67_833 }));

  it('特例分が所得割額の20%で頭打ちになる', () => {
    expect(r.breakdown.specialCapped).toBe(true);
    expect(r.breakdown.residentSpecial).toBe(47_400); // 237,000 × 20%
  });

  it('超えた分はほぼ丸ごと自己負担になる', () => {
    // 上限（57,833円）から1万円多く寄付しても、控除は約1,500円しか増えない
    const atLimit = calcFurusato(base({ donation: 57_833 }));
    expect(r.breakdown.total - atLimit.breakdown.total).toBeLessThan(2_000);
    expect(r.breakdown.outOfPocket).toBeGreaterThan(10_000);
  });
});

describe('calcFurusato ワンストップ特例', () => {
  const shinkoku = calcFurusato(base({ donation: 50_000, onestop: false }));
  const onestop = calcFurusato(base({ donation: 50_000, onestop: true }));

  it('所得税からの控除がなくなり、同額が住民税に回る', () => {
    expect(onestop.breakdown.fromIncomeTax).toBe(0);
    expect(onestop.breakdown.residentOnestop).toBe(shinkoku.breakdown.fromIncomeTax);
  });

  it('控除の合計は確定申告と同じ', () => {
    expect(onestop.breakdown.total).toBe(shinkoku.breakdown.total);
    expect(onestop.breakdown.outOfPocket).toBe(shinkoku.breakdown.outOfPocket);
  });

  it('上限額は変わらない', () => {
    expect(onestop.limit).toBe(shinkoku.limit);
  });
});

describe('calcFurusato 家族構成の影響', () => {
  it('扶養親族がいると課税所得が減り、上限額も下がる', () => {
    const single = calcFurusato(base());
    const withChild = calcFurusato(base({ dependentsGeneral: 1 }));
    expect(withChild.limit).toBeLessThan(single.limit);
  });

  it('特定扶養親族（19〜22歳）のほうが一般より控除が大きい', () => {
    const general = calcFurusato(base({ dependentsGeneral: 1 }));
    const specific = calcFurusato(base({ dependentsSpecific: 1 }));
    expect(specific.limit).toBeLessThan(general.limit);
    expect(specific.incomeTax.personalDeduction).toBe(630_000);
    expect(specific.residentTax.personalDeduction).toBe(450_000);
  });

  it('配偶者控除は本人の合計所得900万円超で段階的に減る', () => {
    // 給与収入1,200万円 → 給与所得1,005万円（900万円超950万円以下）
    const r = calcFurusato(base({ income: 12_000_000, spouse: 'general' }));
    expect(r.totalIncome).toBe(10_050_000);
    expect(r.incomeTax.personalDeduction).toBe(0); // 1,000万円超なので適用なし
  });

  it('その他の所得控除を入れると上限額が下がる', () => {
    const without = calcFurusato(base());
    const withOther = calcFurusato(
      base({ otherDeductionsIncomeTax: 120_000, otherDeductionsResidentTax: 70_000 }),
    );
    expect(withOther.limit).toBeLessThan(without.limit);
  });
});

describe('calcFurusato 令和8年改正の影響', () => {
  it('基礎控除が上がった分、税率区分が下がる人がいる', () => {
    // 年収500万円・独身は課税所得178.5万円で5%区分。
    // 改正前（基礎控除58万円）なら224.5万円で10%区分だった
    const r = calcFurusato(base());
    expect(r.incomeTax.rate).toBe(0.05);
    expect(r.totalIncome - (734_500 + 580_000)).toBeGreaterThan(1_950_000);
  });

  it('所得税率が高いほど上限額が大きくなる', () => {
    const mid = calcFurusato(base({ income: 7_000_000, socialInsurance: 1_000_000 }));
    const high = calcFurusato(base({ income: 15_000_000, socialInsurance: 1_400_000 }));
    expect(high.incomeTax.rate).toBeGreaterThan(mid.incomeTax.rate);
    expect(high.limit).toBeGreaterThan(mid.limit);
  });
});

describe('calcFurusato 異常値', () => {
  it('収入0なら上限額も0で、寄付は全額自己負担', () => {
    const r = calcFurusato(base({ income: 0, socialInsurance: 0, donation: 10_000 }));
    expect(r.limit).toBe(0);
    expect(r.residentTax.incomeLevy).toBe(0);
    expect(r.breakdown.total).toBe(0);
    expect(r.breakdown.outOfPocket).toBe(10_000);
  });

  it('住民税がかからない年収なら上限額は0', () => {
    const r = calcFurusato(base({ income: 1_000_000, socialInsurance: 150_000 }));
    expect(r.residentTax.incomeLevy).toBe(0);
    expect(r.limit).toBe(0);
  });

  it('寄付額が2,000円以下なら控除は発生しない', () => {
    const r = calcFurusato(base({ donation: 2_000 }));
    expect(r.breakdown.total).toBe(0);
    expect(r.breakdown.outOfPocket).toBe(2_000);
  });

  it('マイナスの収入を渡しても落ちない', () => {
    const r = calcFurusato(base({ income: -100, socialInsurance: 0 }));
    expect(r.limit).toBe(0);
    expect(r.totalIncome).toBe(0);
  });

  it('社会保険料を未指定にすると概算値が使われる', () => {
    const r = calcFurusato(base({ socialInsurance: null }));
    expect(r.socialInsuranceEstimated).toBe(true);
    expect(r.socialInsurance).toBe(734_500);
  });
});

describe('housingLoanResidentCap（住宅ローン控除の住民税側の限度額）', () => {
  it('令和4年以降の入居は課税総所得金額等の5%・上限97,500円', () => {
    expect(housingLoanResidentCap(1_000_000, 'rate5')).toBe(50_000);
    expect(housingLoanResidentCap(1_950_000, 'rate5')).toBe(97_500);
    // 上限に達したらそれ以上は増えない
    expect(housingLoanResidentCap(10_000_000, 'rate5')).toBe(97_500);
  });

  it('平成28年〜令和3年入居（消費税8%・10%）は7%・上限136,500円', () => {
    expect(housingLoanResidentCap(1_000_000, 'rate7')).toBe(70_000);
    expect(housingLoanResidentCap(10_000_000, 'rate7')).toBe(136_500);
  });

  it('課税所得0なら0', () => {
    expect(housingLoanResidentCap(0, 'rate5')).toBe(0);
  });
});

describe('applyHousingLoan（所得税→住民税の順に当てはめる）', () => {
  const args = { incomeTax: 89_250, taxableIncomeTax: 1_785_000, tier: 'rate5' as const };

  it('所得税額の範囲内なら全額を所得税から引く', () => {
    const r = applyHousingLoan({ ...args, credit: 50_000 });
    expect(r.fromIncomeTax).toBe(50_000);
    expect(r.fromResidentTax).toBe(0);
    expect(r.wasted).toBe(0);
  });

  it('所得税で引ききれない分は住民税から引く', () => {
    const r = applyHousingLoan({ ...args, credit: 150_000 });
    expect(r.fromIncomeTax).toBe(89_250);
    expect(r.fromResidentTax).toBe(60_750);
    expect(r.wasted).toBe(0);
  });

  it('住民税側の限度額を超えた分は切り捨てになる', () => {
    const r = applyHousingLoan({ ...args, credit: 200_000 });
    expect(r.residentCap).toBe(89_250); // 1,785,000 × 5%（97,500円の上限には未達）
    expect(r.fromIncomeTax).toBe(89_250);
    expect(r.fromResidentTax).toBe(89_250);
    expect(r.used).toBe(178_500);
    expect(r.wasted).toBe(21_500);
  });
});

describe('calcFurusato 住宅ローン控除との併用', () => {
  const withLoan = (credit: number, over: Partial<FurusatoInput> = {}) =>
    calcFurusato(base({ donation: 57_833, housingLoanCredit: credit, ...over }));

  it('住宅ローン控除を使っていなければ情報は返さない', () => {
    const r = calcFurusato(base({ donation: 57_833 }));
    expect(r.housingLoan).toBeNull();
    expect(r.housingLoanBase).toBeNull();
    expect(r.onestopAdvantage).toBe(0);
    expect(r.breakdown.housingLoanLoss).toBe(0);
  });

  it('控除上限額そのものは変わらない（20%上限は住宅ローン控除前の所得割額で決まる）', () => {
    // 特例控除額の上限の基礎になるのは「調整控除後」の所得割額であり、
    // 住宅ローン控除は差し引かない
    expect(withLoan(200_000).limit).toBe(calcFurusato(base()).limit);
  });

  it('住民税側の限度額に余裕があれば目減りしない', () => {
    // 所得税額89,250円に対して控除15万円。住民税側の枠（89,250円）に収まる
    const r = withLoan(150_000);
    expect(r.housingLoanBase?.wasted).toBe(0);
    expect(r.breakdown.housingLoanLoss).toBe(0);
    expect(r.onestopAdvantage).toBe(0);
  });

  it('限度額いっぱいの人は、確定申告すると住宅ローン控除が目減りする', () => {
    const r = withLoan(200_000);
    // 寄付で課税所得が下がり、所得税額と住民税側の限度額の両方が小さくなる。
    // どちらも（寄付額 − 2,000円）× 税率5% ＝ 2,800円ずつ減る
    expect(r.housingLoanBase?.used).toBe(178_500);
    expect(r.housingLoan?.used).toBe(172_900);
    expect(r.breakdown.housingLoanLoss).toBe(5_600);
  });

  it('目減りした分は自己負担に加算される', () => {
    const withoutLoan = calcFurusato(base({ donation: 57_833 }));
    const r = withLoan(200_000);
    expect(r.breakdown.outOfPocket).toBe(withoutLoan.breakdown.outOfPocket + 5_600);
  });

  it('ワンストップ特例なら課税所得が下がらないので目減りしない', () => {
    const r = withLoan(200_000, { onestop: true });
    expect(r.housingLoan?.used).toBe(178_500);
    expect(r.breakdown.housingLoanLoss).toBe(0);
  });

  it('ワンストップ特例にすると得する額を出せる', () => {
    expect(withLoan(200_000).onestopAdvantage).toBe(5_600);
    // 目減りしないケースでは差が出ない
    expect(withLoan(150_000).onestopAdvantage).toBe(0);
  });

  it('7%区分のほうが住民税側の枠が広く、目減りしにくい', () => {
    const r5 = withLoan(200_000, { housingLoanTier: 'rate5' });
    const r7 = withLoan(200_000, { housingLoanTier: 'rate7' });
    expect(r7.housingLoanBase!.used).toBeGreaterThan(r5.housingLoanBase!.used);
    expect(r7.breakdown.housingLoanLoss).toBeLessThanOrEqual(r5.breakdown.housingLoanLoss);
  });

  it('所得税額は速算表どおり', () => {
    expect(calcFurusato(base()).incomeTax.amount).toBe(89_250); // 1,785,000 × 5%
  });
});
