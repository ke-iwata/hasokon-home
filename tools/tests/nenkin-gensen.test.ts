import { describe, expect, it } from 'vitest';
import {
  EXEMPT_BELOW,
  TAX_RATE,
  calc,
  monthlyDeductionAfter,
  monthlyDeductionBefore,
  monthlyDeductionSettlement,
  paymentAmount,
  personalMonthly,
  settleFromPerPayment,
  taxPerPayment,
  type NenkinGensenInput,
} from '@/lib/nenkin-gensen';

/**
 * 仕様: docs/features/nenkin-gensen-12gatsu-seisan.md（テスト 1〜5）
 * 一次資料: 国税庁「令和8年度税制改正（基礎控除の引上げ等関係）Q&A」Q5-1、
 *           国税庁「令和8年4月 源泉所得税の改正のあらまし」⑷、
 *           日本年金機構「令和8年度税制改正による公的年金等に係る主な改正事項」1.(1)、
 *           日本年金機構 FAQ（申告書を提出した場合／提出しなかった場合の源泉徴収税額）
 */

const base: NenkinGensenInput = {
  age65: true,
  annualPension: 2_400_000,
  socialInsurancePerPayment: 0,
  submitted: true,
  spouse: 'none',
  dependents: { general: 0, specific: 0, elderly: 0 },
  disability: 'none',
  widow: 'none',
};

describe('税率と1回あたりの式', () => {
  it('合計税率は 5.105%（所得税5% × 102.1%）', () => {
    expect(TAX_RATE).toBeCloseTo(0.05 * 1.021, 10);
  });

  it('(支払額 − 社会保険料 − 控除の月割 × 2) × 5.105%、1円未満切捨て', () => {
    // 600,000 − 30,000 − 247,500 × 2 = 75,000 → 3,828.75 → 3,828
    expect(taxPerPayment(600_000, 30_000, 247_500)).toBe(3_828);
  });

  it('引ききれないときは0円（マイナスにしない）', () => {
    expect(taxPerPayment(300_000, 0, 180_000)).toBe(0);
    expect(taxPerPayment(-1, -1, -1)).toBe(0);
  });

  it('1回あたりの支払額は年額 ÷ 6（1円未満切捨て）', () => {
    expect(paymentAmount(2_400_000)).toBe(400_000);
    expect(paymentAmount(2_500_000)).toBe(416_666);
    expect(paymentAmount(Number.NaN)).toBe(0);
  });
});

describe('基礎的控除額（月割）', () => {
  it('2〜10月：65歳以上・242万円以下は ×25%＋105,000円（最低175,000円）', () => {
    expect(monthlyDeductionBefore(true, 2_000_000)).toBe(175_000);
    // 月割 201,666.5 × 25% = 50,416 + 105,000 = 155,416 → 最低額 175,000
    expect(monthlyDeductionBefore(true, 2_420_000)).toBe(175_000);
  });

  it('2〜10月：65歳以上・242万円超は ×25%＋100,000円（最低165,000円）', () => {
    expect(monthlyDeductionBefore(true, 2_420_006)).toBe(165_000);
    // 月割 300,000 × 25% = 75,000 + 100,000
    expect(monthlyDeductionBefore(true, 3_600_000)).toBe(175_000);
  });

  it('2〜10月：65歳未満は213万円で式が変わる（最低130,000円／125,000円）', () => {
    // 月割 177,500 × 25% = 44,375 + 105,000
    expect(monthlyDeductionBefore(false, 2_130_000)).toBe(149_375);
    // 213万円超：月割 177,500.5 × 25% = 44,375 + 100,000
    expect(monthlyDeductionBefore(false, 2_130_006)).toBe(144_375);
    expect(monthlyDeductionBefore(false, 1_200_000)).toBe(130_000);
    expect(monthlyDeductionBefore(false, 2_200_000)).toBe(145_833);
  });

  it('12月の精算時は年金額で分かれない：×25%＋110,000円（最低 65歳以上180,000円・未満140,000円）', () => {
    expect(monthlyDeductionSettlement(true, 2_000_000)).toBe(180_000);
    expect(monthlyDeductionSettlement(true, 3_600_000)).toBe(185_000);
    expect(monthlyDeductionSettlement(false, 1_200_000)).toBe(140_000);
    expect(monthlyDeductionSettlement(false, 3_600_000)).toBe(185_000);
  });

  it('2027年以後の各回は精算時と同じ値（国税庁あらまし⑷イの令和9年分の欄・機構 FAQ）', () => {
    for (const a of [1_000_000, 2_000_000, 2_420_000, 3_600_000, 6_000_000]) {
      expect(monthlyDeductionAfter(true, a)).toBe(monthlyDeductionSettlement(true, a));
      expect(monthlyDeductionAfter(false, a)).toBe(monthlyDeductionSettlement(false, a));
    }
  });
});

describe('人的控除（月割）', () => {
  it('配偶者・扶養・障害者・寡婦の月割額', () => {
    expect(personalMonthly({ ...base, spouse: 'general' }, 2026)).toBe(32_500);
    expect(personalMonthly({ ...base, spouse: 'elderly' }, 2026)).toBe(40_000);
    expect(
      personalMonthly({ ...base, dependents: { general: 2, specific: 1, elderly: 1 } }, 2026),
    ).toBe(32_500 * 2 + 52_500 + 40_000);
    expect(personalMonthly({ ...base, disability: 'general' }, 2026)).toBe(22_500);
    expect(personalMonthly({ ...base, disability: 'special' }, 2026)).toBe(35_000);
    expect(personalMonthly({ ...base, widow: 'widow' }, 2026)).toBe(22_500);
  });

  it('ひとり親は2026年が30,000円・2027年から32,500円', () => {
    expect(personalMonthly({ ...base, widow: 'singleParent' }, 2026)).toBe(30_000);
    expect(personalMonthly({ ...base, widow: 'singleParent' }, 2027)).toBe(32_500);
  });

  it('申告書を出していなければ人的控除は0', () => {
    expect(personalMonthly({ ...base, submitted: false, spouse: 'elderly' }, 2027)).toBe(0);
  });
});

describe('テスト1：機構の還付イメージ（改正前1回6,000円 → 精算時4,600円）', () => {
  // 機構のイメージ図は控除額の差から作った数字ではない（実際の控除の差は月5,000〜20,000円で、
  // 1回あたりの差は約510〜1,530円）。年金の入力からは同じ数字を作れないので、精算の算式そのものを確かめる
  it('6回分 27,600円 − 5回分 30,000円 ＝ −2,400円 → 12月は0円・2,400円が戻る', () => {
    const r = settleFromPerPayment(6_000, 4_600);
    expect(r.annualTaxAtSettlement).toBe(27_600);
    expect(r.withheldFebToOct).toBe(30_000);
    expect(r.decemberTax).toBe(0);
    expect(r.refund).toBe(2_400);
    // 機構の図の「取りすぎ 1,400 × 5 ＝ 7,000円 − 12月分 4,600円 ＝ 2,400円」と同じ
    expect((6_000 - 4_600) * 5 - 4_600).toBe(r.refund);
  });

  it('取りすぎより12月分が大きければ、12月は差額を引く（還付は0）', () => {
    const r = settleFromPerPayment(14_294, 13_273);
    expect(r.decemberTax).toBe(13_273 * 6 - 14_294 * 5);
    expect(r.refund).toBe(0);
  });
});

describe('精算の通し計算', () => {
  it('65歳以上・240万円・社会保険料2万円：1回1,531円 → 精算1,021円、12月は0円で1,529円戻る', () => {
    const r = calc({ ...base, annualPension: 2_400_000, socialInsurancePerPayment: 20_000 });
    // 400,000 − 20,000 − 175,000×2 = 30,000 → 1,531
    expect(r.perPaymentBefore).toBe(1_531);
    // 400,000 − 20,000 − 180,000×2 = 20,000 → 1,021
    expect(r.perPaymentSettlement).toBe(1_021);
    expect(r.perPayment2027).toBe(1_021);
    expect(r.decemberTax).toBe(0);
    expect(r.refund).toBe(1_529);
  });

  it('精算に2027年以後の控除を混ぜない（12月の税額は 6×精算時 − 5×改正前 だけで決まる）', () => {
    const r = calc({ ...base, annualPension: 4_000_000, socialInsurancePerPayment: 25_000 });
    expect(r.annualTaxAtSettlement).toBe(r.perPaymentSettlement * 6);
    expect(r.withheldFebToOct).toBe(r.perPaymentBefore * 5);
    expect(r.decemberTax - r.refund).toBe(r.annualTaxAtSettlement - r.withheldFebToOct);
  });
});

describe('テスト2・3：源泉徴収の対象外の線（2027年以後）', () => {
  it('線は 65歳以上214万円未満・65歳未満164万円未満（令和8年11月までは205万・155万）', () => {
    expect(EXEMPT_BELOW[2027]).toEqual({ over65: 2_140_000, under65: 1_640_000 });
    expect(EXEMPT_BELOW[2026]).toEqual({ over65: 2_050_000, under65: 1_550_000 });
  });

  it('65歳以上：214万円ちょうどは対象（未満ではない）、213.9万円は対象外', () => {
    expect(calc({ ...base, annualPension: 2_140_000 }).exempt2027).toBe(false);
    expect(calc({ ...base, annualPension: 2_139_000 }).exempt2027).toBe(true);
    // 214万円ちょうどでも、控除の最低額（月180,000円）で引ききれるので税額は0円
    expect(calc({ ...base, annualPension: 2_140_000 }).perPayment2027).toBe(0);
  });

  it('65歳未満：164万円ちょうどは対象、163.9万円は対象外', () => {
    expect(calc({ ...base, age65: false, annualPension: 1_640_000 }).exempt2027).toBe(false);
    expect(calc({ ...base, age65: false, annualPension: 1_639_000 }).exempt2027).toBe(true);
  });

  it('令和8年11月までの線（205万円）未満は2〜10月も0円', () => {
    const r = calc({ ...base, annualPension: 2_049_000 });
    expect(r.exempt2026).toBe(true);
    expect(r.perPaymentBefore).toBe(0);
    expect(r.refund).toBe(0);
  });
});

describe('テスト4：扶養親族等申告書を出していない', () => {
  const input: NenkinGensenInput = {
    ...base,
    annualPension: 3_600_000,
    socialInsurancePerPayment: 30_000,
    spouse: 'elderly',
    dependents: { general: 1, specific: 0, elderly: 0 },
  };

  it('基礎控除だけを引いた (支払額 − 社会保険料 − 基礎控除の月割 × 2) × 5.105% になる', () => {
    const r = calc({ ...input, submitted: false });
    // 600,000 − 30,000 − 185,000×2 = 200,000 → 10,210
    expect(r.perPayment2027).toBe(10_210);
    expect(r.perPayment2027WithoutForm).toBe(10_210);
  });

  it('申告書ありより、人的控除（40,000＋32,500）×2 × 5.105% の分だけ多い', () => {
    const withForm = calc(input);
    const without = calc({ ...input, submitted: false });
    // 600,000 − 30,000 − (185,000 + 72,500)×2 = 55,000 → 2,807
    expect(withForm.perPayment2027).toBe(2_807);
    expect(without.perPayment2027 - withForm.perPayment2027).toBe(7_403);
    expect(withForm.withoutFormIncrease).toBe(7_403);
    // 72,500 × 2 × 5.105% ＝ 7,402.25（切捨ての差で1円ずれる）
    expect(Math.abs(without.perPayment2027 - withForm.perPayment2027 - 72_500 * 2 * TAX_RATE)).toBeLessThan(1);
  });
});

describe('テスト5：老人配偶者＋扶養1人で、12月が0円＋還付', () => {
  it('65歳以上・360万円・社会保険料3万円', () => {
    const r = calc({
      ...base,
      annualPension: 3_600_000,
      socialInsurancePerPayment: 30_000,
      spouse: 'elderly',
      dependents: { general: 1, specific: 0, elderly: 0 },
    });
    // 改正前：600,000 − 30,000 − (175,000 + 72,500)×2 = 75,000 → 3,828
    expect(r.perPaymentBefore).toBe(3_828);
    // 精算時：600,000 − 30,000 − (185,000 + 72,500)×2 = 55,000 → 2,807
    expect(r.perPaymentSettlement).toBe(2_807);
    expect(r.annualTaxAtSettlement).toBe(16_842);
    expect(r.withheldFebToOct).toBe(19_140);
    expect(r.decemberTax).toBe(0);
    expect(r.refund).toBe(2_298);
  });
});
