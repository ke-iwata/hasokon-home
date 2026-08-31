import { describe, expect, it } from 'vitest';
import {
  MEDICAL_CAP,
  MEDICAL_THRESHOLD_FIXED,
  SELF_MED_CAP,
  SELF_MED_THRESHOLD,
  calcIryohiKojo,
  medicalDeduction,
  medicalThreshold,
  selfMedicationDeduction,
  type IryohiInput,
} from '@/lib/iryohi-kojo';
import { salaryIncome } from '@/lib/furusato-nozei';
import { RULES_R8, calcYearTax } from '@/lib/nenmatsu-chosei';

/**
 * 医療費控除・セルフメディケーション税制のテスト。
 *
 * 仕様: docs/features/iryohi-kojo-keisan.md
 *
 * 見張っているのは4つ。
 *
 * 1. **足切りの分母**が総所得金額等であること（課税所得と取り違えると
 *    低所得帯の答えが壊れる。このツール一番の売りが逆に嘘になる）
 * 2. **還付額を「控除額×限界税率」で出していない**こと
 *    （ブラケットをまたぐ控除で過大になる）
 * 3. 上限・下限・補填額まわりで**マイナスや過大な額を出さない**こと
 * 4. 2制度の**選択適用の判定**が戻る額で決まること
 */

/** テストの既定値。各テストで必要なところだけ上書きする */
function input(over: Partial<IryohiInput> = {}): IryohiInput {
  return {
    income: 5_000_000,
    socialInsurance: null,
    kaigo: false,
    medicalExpenses: 0,
    compensation: 0,
    otcExpenses: 0,
    healthCheck: false,
    ...over,
  };
}

describe('medicalThreshold（足切り額）', () => {
  it('総所得金額等が200万円以上なら10万円で頭打ちになる', () => {
    expect(medicalThreshold(2_000_000)).toEqual({ threshold: 100_000, basis: 'fixed' });
    expect(medicalThreshold(5_000_000)).toEqual({ threshold: 100_000, basis: 'fixed' });
  });

  it('総所得金額等が200万円未満なら総所得×5%になる', () => {
    expect(medicalThreshold(1_999_999)).toEqual({ threshold: 99_999, basis: 'rate' });
    expect(medicalThreshold(1_000_000)).toEqual({ threshold: 50_000, basis: 'rate' });
  });

  it('5%の端数は円未満を切り捨てる', () => {
    // 1,234,567 × 5% = 61,728.35
    expect(medicalThreshold(1_234_567).threshold).toBe(61_728);
  });

  it('所得0でも負にならない', () => {
    expect(medicalThreshold(0)).toEqual({ threshold: 0, basis: 'rate' });
    expect(medicalThreshold(-1)).toEqual({ threshold: 0, basis: 'rate' });
  });
});

/**
 * **足切りの分母の境界テスト（仕様書が必ず入れろと書いているもの）。**
 *
 * 令和8年分の給与所得控除では、給与収入 2,971,428円 で総所得金額等が
 * ちょうど 1,999,999円（200万円未満）、1円増えると 2,000,000円 になる。
 * ここで足切りが 総所得×5% ↔ 10万円 に切り替わる。
 *
 * 分母を課税所得と取り違えると、同じ年収でも足切りが数万円に落ちて
 * このテストが落ちる（給与収入297万円の課税所得は50万円台）。
 */
describe('足切りの分母は総所得金額等（課税所得ではない）', () => {
  const boundaryBelow = 2_971_428;
  const boundaryAbove = 2_971_429;

  it('境界の給与収入が総所得金額等200万円の前後になっている（前提の確認）', () => {
    expect(salaryIncome(boundaryBelow)).toBe(1_999_999);
    expect(salaryIncome(boundaryAbove)).toBe(2_000_000);
  });

  it('総所得金額等200万円未満（給与収入2,971,428円）は 総所得×5% を使う', () => {
    const r = calcIryohiKojo(input({ income: boundaryBelow, medicalExpenses: 150_000 }));
    expect(r.totalIncome).toBe(1_999_999);
    expect(r.medical.thresholdBasis).toBe('rate');
    expect(r.medical.threshold).toBe(99_999);
    expect(r.medical.deduction).toBe(150_000 - 99_999);
  });

  it('総所得金額等200万円ちょうど（給与収入2,971,429円）から10万円になる', () => {
    const r = calcIryohiKojo(input({ income: boundaryAbove, medicalExpenses: 150_000 }));
    expect(r.totalIncome).toBe(2_000_000);
    expect(r.medical.thresholdBasis).toBe('fixed');
    expect(r.medical.threshold).toBe(MEDICAL_THRESHOLD_FIXED);
    expect(r.medical.deduction).toBe(50_000);
  });

  it('課税所得は総所得金額等よりずっと小さい（取り違えたら値が変わることの確認）', () => {
    const r = calcIryohiKojo(input({ income: boundaryBelow, medicalExpenses: 150_000 }));
    expect(r.taxableIncome).toBeLessThan(r.totalIncome);
    // 課税所得×5% を足切りに使っていたら、この額になっていたはず
    expect(Math.floor(r.taxableIncome * 0.05)).not.toBe(r.medical.threshold);
  });

  it('医療費が10万円以下でも、総所得金額等200万円未満なら控除できる', () => {
    // 給与収入250万円 → 給与所得控除83万円 → 総所得167万円 → 足切り83,500円
    const r = calcIryohiKojo(input({ income: 2_500_000, medicalExpenses: 95_000 }));
    expect(r.totalIncome).toBe(1_670_000);
    expect(r.medical.threshold).toBe(83_500);
    expect(r.medical.deduction).toBe(11_500);
    expect(r.medical.total).toBeGreaterThan(0);
  });

  it('同じ医療費でも高所得なら控除は0になる（足切り10万円に届かない）', () => {
    const r = calcIryohiKojo(input({ income: 6_000_000, medicalExpenses: 95_000 }));
    expect(r.medical.deduction).toBe(0);
    expect(r.medical.total).toBe(0);
    expect(r.medical.shortfall).toBe(5_000);
  });
});

describe('medicalDeduction（控除額）', () => {
  it('補填額を引いてから足切りを引く', () => {
    // 医療費50万 − 補填20万 = 30万 − 足切り10万 = 20万
    expect(medicalDeduction(500_000, 200_000, 5_000_000)).toBe(200_000);
  });

  /**
   * 補填額の按分（その給付の目的になった医療費を限度に引く）は、合計額1本を受け取る
   * この設計では表現できず、**入力欄の補足文と結果の注記で担保している**。
   * ロジックで縛れるのはここまで＝「合計での引きすぎがマイナスにならないこと」
   * （仕様書「テスト」節）。
   */
  it('補填額が医療費を超えてもマイナスにならない', () => {
    expect(medicalDeduction(100_000, 300_000, 5_000_000)).toBe(0);
    expect(calcIryohiKojo(input({ medicalExpenses: 100_000, compensation: 300_000 })).medical)
      .toMatchObject({ netExpenses: 0, deduction: 0, total: 0 });
  });

  it('足切りに届かなければ0（マイナスにしない）', () => {
    expect(medicalDeduction(80_000, 0, 5_000_000)).toBe(0);
  });

  it('上限は200万円', () => {
    expect(medicalDeduction(10_000_000, 0, 5_000_000)).toBe(MEDICAL_CAP);
    // ちょうど上限になる額（足切り10万円 + 200万円）
    expect(medicalDeduction(2_100_000, 0, 5_000_000)).toBe(MEDICAL_CAP);
    expect(medicalDeduction(2_099_999, 0, 5_000_000)).toBe(1_999_999);
  });
});

describe('selfMedicationDeduction（セルフメディケーション税制の控除額）', () => {
  it('1.2万円を引いた額になる', () => {
    expect(selfMedicationDeduction(50_000)).toBe(38_000);
  });

  it('1.2万円ちょうどは0（超えた分だけが対象）', () => {
    expect(selfMedicationDeduction(SELF_MED_THRESHOLD)).toBe(0);
    expect(selfMedicationDeduction(SELF_MED_THRESHOLD + 1)).toBe(1);
  });

  it('足切り未満はマイナスにしない', () => {
    expect(selfMedicationDeduction(5_000)).toBe(0);
    expect(selfMedicationDeduction(0)).toBe(0);
  });

  it('上限は8.8万円（購入額10万円で頭打ち）', () => {
    expect(selfMedicationDeduction(100_000)).toBe(SELF_MED_CAP);
    expect(selfMedicationDeduction(1_000_000)).toBe(SELF_MED_CAP);
    expect(selfMedicationDeduction(99_999)).toBe(87_999);
  });
});

describe('還付額は控除の前後の年税額の差で出す', () => {
  /**
   * 税率ブラケットをまたぐケース。
   * 課税所得が330万円（10%と20%の境目）をまたぐ控除では、
   * 「控除額 × 限界税率」で出すと過大になる。
   */
  it('ブラケットをまたぐ控除で「控除額×限界税率」より小さくなる', () => {
    // 給与収入700万円・医療費60万円 → 控除50万円
    const r = calcIryohiKojo(input({ income: 7_000_000, medicalExpenses: 600_000 }));
    expect(r.medical.deduction).toBe(500_000);

    // 控除前の課税所得が20%帯にあり、控除後は10%帯へ落ちる
    expect(r.marginalRate).toBe(0.2);
    expect(r.taxableIncome).toBeGreaterThan(3_300_000);
    expect(r.taxableIncome - r.medical.deduction).toBeLessThan(3_300_000);

    const naive = Math.floor(r.medical.deduction * r.marginalRate * 1.021);
    expect(r.medical.incomeTaxRefund).toBeLessThan(naive);
  });

  it('ブラケットをまたがない控除なら、ほぼ 控除額×税率×1.021 になる', () => {
    // 給与収入700万円・医療費15万円 → 控除5万円（20%帯に収まる）
    const r = calcIryohiKojo(input({ income: 7_000_000, medicalExpenses: 150_000 }));
    expect(r.medical.deduction).toBe(50_000);
    const naive = 50_000 * 0.2 * 1.021;
    // 年税額の100円未満切捨てぶんだけずれる
    expect(Math.abs(r.medical.incomeTaxRefund - naive)).toBeLessThanOrEqual(200);
  });

  it('控除前の年税額は lib/nenmatsu-chosei の calcYearTax と一致する', () => {
    const r = calcIryohiKojo(input({ income: 5_000_000, medicalExpenses: 300_000 }));
    const expected = calcYearTax(
      {
        income: 5_000_000,
        withheld: null,
        socialInsurance: r.socialInsurance,
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
      },
      RULES_R8,
      r.socialInsurance,
    ).yearTax;
    expect(r.yearTaxBefore).toBe(expected);
  });

  it('所得税がかからない人でも住民税の軽減だけは出る', () => {
    // 給与収入180万円 → 総所得106万円。基礎控除と社会保険料で所得税は0
    const r = calcIryohiKojo(input({ income: 1_800_000, medicalExpenses: 300_000 }));
    expect(r.yearTaxBefore).toBe(0);
    expect(r.medical.incomeTaxRefund).toBe(0);
    expect(r.medical.deduction).toBeGreaterThan(0);
    expect(r.medical.residentSaving).toBeGreaterThan(0);
  });

  it('住民税の軽減額は課税標準を超えない（低所得帯で過大にしない）', () => {
    // 給与収入160万円 → 総所得86万円。社会保険料と基礎控除43万で課税標準はごく小さい
    const r = calcIryohiKojo(input({ income: 1_600_000, medicalExpenses: 1_000_000 }));
    expect(r.medical.deduction).toBeGreaterThan(500_000);
    // 「控除額×10%」で出していたら5万円を超えるはず
    expect(r.medical.residentSaving).toBeLessThan(r.medical.deduction * 0.1);
  });

  it('戻る額が控除額を超えることはない', () => {
    for (const income of [1_000_000, 3_000_000, 5_000_000, 8_000_000, 20_000_000]) {
      const r = calcIryohiKojo(input({ income, medicalExpenses: 1_500_000 }));
      expect(r.medical.total).toBeLessThanOrEqual(r.medical.deduction);
      expect(r.medical.total).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('セルフメディケーション税制の要件（一定の取組）', () => {
  it('取組なしでは控除も戻る額も0', () => {
    const r = calcIryohiKojo(input({ otcExpenses: 60_000, healthCheck: false }));
    expect(r.selfMedication.available).toBe(false);
    expect(r.selfMedication.deduction).toBe(0);
    expect(r.selfMedication.total).toBe(0);
  });

  it('取組ありなら控除できる', () => {
    const r = calcIryohiKojo(input({ otcExpenses: 60_000, healthCheck: true }));
    expect(r.selfMedication.available).toBe(true);
    expect(r.selfMedication.deduction).toBe(48_000);
    expect(r.selfMedication.total).toBeGreaterThan(0);
  });

  it('上限で切られたことが分かる', () => {
    const r = calcIryohiKojo(input({ otcExpenses: 200_000, healthCheck: true }));
    expect(r.selfMedication.deduction).toBe(SELF_MED_CAP);
    expect(r.selfMedication.capped).toBe(true);
  });
});

describe('どちらが得かの判定（選択適用）', () => {
  it('医療費が大きければ医療費控除', () => {
    const r = calcIryohiKojo(
      input({ medicalExpenses: 400_000, otcExpenses: 50_000, healthCheck: true }),
    );
    expect(r.better).toBe('medical');
    expect(r.difference).toBe(r.medical.total - r.selfMedication.total);
  });

  it('医療費が足切りに届かず、OTCの購入が多ければセルフメディケーション税制', () => {
    const r = calcIryohiKojo(
      input({ medicalExpenses: 90_000, otcExpenses: 90_000, healthCheck: true }),
    );
    expect(r.medical.deduction).toBe(0);
    expect(r.better).toBe('selfMedication');
    expect(r.difference).toBe(r.selfMedication.total);
  });

  it('どちらも0なら none', () => {
    const r = calcIryohiKojo(input({ medicalExpenses: 50_000, otcExpenses: 5_000 }));
    expect(r.better).toBe('none');
    expect(r.difference).toBe(0);
  });

  it('取組がなければ、OTCをいくら買っても医療費控除が選ばれる', () => {
    const r = calcIryohiKojo(
      input({ medicalExpenses: 200_000, otcExpenses: 500_000, healthCheck: false }),
    );
    expect(r.better).toBe('medical');
  });
});

describe('あといくらで控除が始まるか（駆け込み判断）', () => {
  it('足切りに届いていなければ差額を出す', () => {
    const r = calcIryohiKojo(
      input({ medicalExpenses: 70_000, otcExpenses: 8_000, healthCheck: true }),
    );
    expect(r.medical.shortfall).toBe(30_000);
    expect(r.selfMedication.shortfall).toBe(4_000);
  });

  it('足切りを超えていれば0', () => {
    const r = calcIryohiKojo(
      input({ medicalExpenses: 300_000, otcExpenses: 50_000, healthCheck: true }),
    );
    expect(r.medical.shortfall).toBe(0);
    expect(r.selfMedication.shortfall).toBe(0);
  });

  it('補填額を引いたあとの額で判定する', () => {
    const r = calcIryohiKojo(input({ medicalExpenses: 150_000, compensation: 100_000 }));
    expect(r.medical.netExpenses).toBe(50_000);
    expect(r.medical.shortfall).toBe(50_000);
  });
});

describe('異常値', () => {
  it('全部0でも壊れない', () => {
    const r = calcIryohiKojo(input({ income: 0 }));
    expect(r.totalIncome).toBe(0);
    expect(r.taxableIncome).toBe(0);
    expect(r.medical.deduction).toBe(0);
    expect(r.medical.total).toBe(0);
    expect(r.better).toBe('none');
  });

  it('マイナスの入力は0として扱う', () => {
    const r = calcIryohiKojo(
      input({ income: -100, medicalExpenses: -50_000, compensation: -1, otcExpenses: -1 }),
    );
    expect(r.totalIncome).toBe(0);
    expect(r.medical.netExpenses).toBe(0);
    expect(r.medical.deduction).toBe(0);
    expect(r.selfMedication.deduction).toBe(0);
  });

  it('社会保険料を入力すると推計を使わない', () => {
    const estimated = calcIryohiKojo(input({ medicalExpenses: 300_000 }));
    const actual = calcIryohiKojo(
      input({ medicalExpenses: 300_000, socialInsurance: 900_000 }),
    );
    expect(estimated.socialInsuranceEstimated).toBe(true);
    expect(actual.socialInsuranceEstimated).toBe(false);
    expect(actual.socialInsurance).toBe(900_000);
    // 社会保険料が増えれば課税所得が減る
    expect(actual.taxableIncome).toBeLessThan(estimated.taxableIncome);
  });

  it('限界税率は説明用の値で、還付額の計算には使っていない', () => {
    const r = calcIryohiKojo(input({ income: 20_000_000, medicalExpenses: 500_000 }));
    expect(r.marginalRate).toBe(0.33);
    // 33%帯に収まる控除なので、限界税率での概算とほぼ一致する（別の値ではない）
    const naive = r.medical.deduction * r.marginalRate * 1.021;
    expect(Math.abs(r.medical.incomeTaxRefund - naive)).toBeLessThanOrEqual(200);
  });
});
