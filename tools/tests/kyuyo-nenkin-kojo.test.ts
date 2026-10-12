import { describe, expect, it } from 'vitest';
import {
  CAP,
  calc,
  capAdjustment,
  thresholdSalary,
  thresholdSalaryYen,
} from '@/lib/kyuyo-nenkin-kojo';
import { MOF_EXAMPLE, THRESHOLD_ROWS } from '@/app/kyuyo-nenkin-kojo/tables';

/**
 * 仕様書（docs/features/kyuyo-nenkin-kojo-280man.md）の「テスト」1〜8。
 */

const MAN = 10_000;

describe('280万円上限（所得税法35条5項）', () => {
  it('1. 財務省の例：給与900万円・年金200万円・65歳以上 → 合計305万円、削られる25万円、年金の控除85万円', () => {
    const r = calc({ salary: 900 * MAN, pension: 200 * MAN, age65: true, otherIncome: 0 });
    expect(r.before.salaryDeduction).toBe(195 * MAN);
    expect(r.before.pensionDeduction).toBe(110 * MAN);
    expect(r.before.totalDeduction).toBe(305 * MAN);
    expect(r.cut).toBe(25 * MAN);
    expect(r.after.pensionDeduction).toBe(85 * MAN);
    expect(r.after.totalDeduction).toBe(CAP);
    // 給与所得控除は削らない
    expect(r.after.salaryDeduction).toBe(195 * MAN);
    // 本文の例は lib から作っている
    expect(MOF_EXAMPLE.cut).toBe(r.cut);
  });

  it('2. 給与0または年金0：対象外で削られない', () => {
    const noSalary = calc({ salary: 0, pension: 1000 * MAN, age65: true, otherIncome: 0 });
    expect(noSalary.eligible).toBe(false);
    expect(noSalary.cut).toBe(0);
    const noPension = calc({ salary: 2000 * MAN, pension: 0, age65: true, otherIncome: 0 });
    expect(noPension.eligible).toBe(false);
    expect(noPension.cut).toBe(0);
    expect(noPension.incomeTaxIncrease).toBe(0);
  });

  it('3. 合計がちょうど280万円：削られる額は0', () => {
    expect(capAdjustment(170 * MAN, 110 * MAN)).toBe(0);
    expect(capAdjustment(170 * MAN + 1, 110 * MAN)).toBe(1);
    // 給与630万円は給与所得控除がちょうど170万円
    const r = calc({ salary: 630 * MAN, pension: 200 * MAN, age65: true, otherIncome: 0 });
    expect(r.before.totalDeduction).toBe(CAP);
    expect(r.cut).toBe(0);
    expect(r.incomeTaxIncrease).toBe(0);
    expect(r.residentTaxIncrease).toBe(0);
  });

  it('4. 65歳未満・年金130万円・給与1,000万円：合計255万円でかからない', () => {
    const r = calc({ salary: 1000 * MAN, pension: 130 * MAN, age65: false, otherIncome: 0 });
    expect(r.before.pensionDeduction).toBe(60 * MAN);
    expect(r.before.totalDeduction).toBe(255 * MAN);
    expect(r.cut).toBe(0);
    expect(thresholdSalary({ pension: 130 * MAN, age65: false, otherIncome: 0 })).toBeNull();
  });

  it('6. 線の逆算：65歳以上・年金200万円 → 630万円（630万円で0、640万円で2万円）', () => {
    const input = { pension: 200 * MAN, age65: true, otherIncome: 0 };
    expect(thresholdSalary(input)).toBe(630 * MAN);
    expect(calc({ ...input, salary: 630 * MAN }).cut).toBe(0);
    expect(calc({ ...input, salary: 640 * MAN }).cut).toBe(2 * MAN);
    // 1円単位の線はこの額の手前の1万円の中にある（式で測るので 6,300,000 円まで0）
    const yen = thresholdSalaryYen(input)!;
    expect(yen).toBeGreaterThan(629 * MAN);
    expect(yen).toBeLessThanOrEqual(630 * MAN);
    expect(calc({ ...input, salary: yen }).cut).toBe(0);
    expect(calc({ ...input, salary: yen + 1 }).cut).toBeGreaterThan(0);
  });

  it('6. 線の逆算：65歳未満・年金300万円（控除102.5万円）→ 給与675万円', () => {
    expect(thresholdSalary({ pension: 300 * MAN, age65: false, otherIncome: 0 })).toBe(675 * MAN);
  });

  it('年金の控除が年金収入を上回る人は、所得が増え始める給与を線にする（65歳以上・年金100万円 → 700万円）', () => {
    const input = { pension: 100 * MAN, age65: true, otherIncome: 0 };
    expect(thresholdSalary(input)).toBe(700 * MAN);
    // 条文の線（630万円）と700万円の間では、削っても控除が年金額を下回らず税額は変わらない
    const r = calc({ ...input, salary: 660 * MAN });
    expect(r.cut).toBe(0);
    expect(r.incomeTaxIncrease).toBe(0);
  });

  it('7. 年金以外の合計所得に給与所得を含める：給与1,300万円 → 年金の控除100万円・削られる15万円', () => {
    const r = calc({ salary: 1300 * MAN, pension: 200 * MAN, age65: true, otherIncome: 0 });
    expect(r.before.salaryIncome).toBe(1105 * MAN);
    expect(r.before.pensionDeduction).toBe(100 * MAN);
    expect(r.before.totalDeduction).toBe(295 * MAN);
    // 給与所得を含め忘れると 110万円・25万円になる
    expect(r.cut).toBe(15 * MAN);
  });

  it('8. 基礎控除の段差をまたぐ：給与750万円 → 合計所得645万円（67万円）→ 660万円（62万円）', () => {
    const r = calc({ salary: 750 * MAN, pension: 200 * MAN, age65: true, otherIncome: 0 });
    expect(r.before.salaryDeduction).toBe(185 * MAN);
    // 所得金額調整控除10万円
    expect(r.before.adjustment).toBe(10 * MAN);
    expect(r.after.adjustment).toBe(10 * MAN);
    expect(r.before.totalIncome).toBe(645 * MAN);
    expect(r.before.basicDeduction).toBe(67 * MAN);
    expect(r.cut).toBe(15 * MAN);
    expect(r.after.totalIncome).toBe(660 * MAN);
    expect(r.after.basicDeduction).toBe(62 * MAN);
    // 課税所得は削られた15万円ではなく20万円増える
    expect(r.after.taxableIncome - r.before.taxableIncome).toBe(20 * MAN);
    // 20%の帯：20万円 × 20% × 1.021 ＝ 40,840円（15万円 × 20% × 1.021 ＝ 30,630円より大きい）
    expect(r.incomeTaxIncrease).toBe(40_840);
    // 住民税は基礎控除43万円のままなので、増えた所得15万円 × 10%
    expect(r.residentTaxIncrease).toBe(15_000);
  });
});

describe('所得金額調整控除（租税特別措置法41条の3の11第2項）', () => {
  it('上限で削る前の年金の雑所得で判定する（削ったあとで10万円を下回っても10万円のまま）', () => {
    // 65歳以上・年金115万円：控除110万円 → 雑所得5万円。給与900万円で15万円削られ雑所得20万円
    const r = calc({ salary: 900 * MAN, pension: 115 * MAN, age65: true, otherIncome: 0 });
    expect(r.before.pensionIncome).toBe(5 * MAN);
    expect(r.cut).toBe(25 * MAN);
    expect(r.after.pensionIncome).toBe(30 * MAN);
    // 削る前の5万円で判定：min(給与所得,10万) + min(5万,10万) − 10万 ＝ 5万円
    expect(r.before.adjustment).toBe(5 * MAN);
    expect(r.after.adjustment).toBe(5 * MAN);
  });

  it('年金の雑所得が0なら調整控除は無い', () => {
    const r = calc({ salary: 900 * MAN, pension: 100 * MAN, age65: true, otherIncome: 0 });
    expect(r.before.pensionIncome).toBe(0);
    expect(r.before.adjustment).toBe(0);
  });
});

describe('早見表（tables.ts）', () => {
  it('lib から作られていて、年金200万円・65歳以上は630万円', () => {
    const row = THRESHOLD_ROWS.find((r) => r.pension === 200 * MAN)!;
    expect(row.over65).toBe(630 * MAN);
    for (const r of THRESHOLD_ROWS) {
      expect(r.over65).toBe(thresholdSalary({ pension: r.pension, age65: true, otherIncome: 0 }));
      expect(r.under65).toBe(thresholdSalary({ pension: r.pension, age65: false, otherIncome: 0 }));
    }
  });

  it('年金が増えるほど線は下がる（かからない行は null）', () => {
    const values = THRESHOLD_ROWS.map((r) => r.over65).filter((v): v is number => v !== null);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    // 65歳未満・年金100万円（控除60万円）は給与所得控除の上限195万円と足しても255万円
    expect(THRESHOLD_ROWS.find((r) => r.pension === 100 * MAN)!.under65).toBeNull();
  });
});

describe('異常値', () => {
  it('負の値・NaN は0として扱う', () => {
    const r = calc({ salary: -1, pension: Number.NaN, age65: true, otherIncome: -5 });
    expect(r.cut).toBe(0);
    expect(r.before.totalIncome).toBe(0);
  });
});
