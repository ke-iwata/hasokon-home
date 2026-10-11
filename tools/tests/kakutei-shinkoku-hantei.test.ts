import { describe, expect, it } from 'vitest';
import {
  EMPTY_REFUND,
  NO_KINDS,
  TAX_YEAR,
  filingDeadline,
  filingStart,
  judge,
  pensionIncome,
  refundDeadline,
  refundStart,
  type HanteiInput,
} from '@/lib/kakutei-shinkoku-hantei';

/**
 * 仕様: docs/features/kakutei-shinkoku-hitsuyo-hantei.md の「テスト」11ケース。
 * 期待値は国税庁 No.1900・No.1600（令和8年4月1日現在法令等）で確かめたもの。
 */

const BASE: HanteiInput = {
  kinds: NO_KINDS,
  salaryTwoOrMore: false,
  yearEndAdjusted: true,
  salaryMain: 0,
  salarySub: 0,
  pensionAnnual: 0,
  over65: true,
  unwithheldPension: false,
  otherIncome: 0,
  refund: EMPTY_REFUND,
};

/** 給与1か所・年末調整済み・年収400万円 */
function salaried(over: Partial<HanteiInput> = {}): HanteiInput {
  return {
    ...BASE,
    kinds: { ...NO_KINDS, salary: true, side: (over.otherIncome ?? 0) > 0 },
    salaryMain: 4_000_000,
    ...over,
  };
}

describe('期日（TAX_YEAR から組み立てる）', () => {
  it('令和8年分', () => {
    expect(TAX_YEAR).toBe(2026);
    expect(filingStart()).toBe('2027-02-16');
    expect(filingDeadline()).toBe('2027-03-15');
    expect(refundStart()).toBe('2027-01-01');
    expect(refundDeadline()).toBe('2031-12-31');
  });

  it('3月15日が土日なら翌平日（令和9年分は2028-03-15が水曜でそのまま、令和7年分の2026-03-15は日曜→16日）', () => {
    expect(filingDeadline(2027)).toBe('2028-03-15');
    expect(filingDeadline(2025)).toBe('2026-03-16');
  });
});

describe('公的年金等に係る雑所得（No.1600 の計算例）', () => {
  it('65歳以上・収入350万円 → 235万円', () => {
    expect(pensionIncome(3_500_000, true)).toBe(2_350_000);
  });
  it('65歳以上は110万円まで0、65歳未満は60万円まで0', () => {
    expect(pensionIncome(1_100_000, true)).toBe(0);
    expect(pensionIncome(600_000, false)).toBe(0);
    expect(pensionIncome(1_000_000, false)).toBe(400_000);
  });
});

describe('仕様書のテスト11ケース', () => {
  it('1. 給与1か所・年末調整済み・他の所得なし → 所得税 不要・住民税 不要', () => {
    const r = judge(salaried());
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toEqual(['salary-other-income-under-200k']);
    expect(r.residentTax).toBe('notRequired');
    expect(r.refundHints).toEqual([]);
  });

  it('2. 給与1か所・副業所得15万円 → 所得税 不要・住民税 要', () => {
    const r = judge(salaried({ otherIncome: 150_000 }));
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toContain('salary-other-income-under-200k');
    expect(r.residentTax).toBe('required');
  });

  it('3. 給与1か所・副業所得25万円 → 所得税 要', () => {
    const r = judge(salaried({ otherIncome: 250_000 }));
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toContain('salary-other-income-over-200k');
    // 所得税の申告書が市区町村に回るので、住民税の申告は別に要らない
    expect(r.residentTax).toBe('notRequired');
  });

  it('20万円ちょうどは「超」ではないので不要', () => {
    expect(judge(salaried({ otherIncome: 200_000 })).incomeTax).toBe('notRequired');
    expect(judge(salaried({ otherIncome: 200_001 })).incomeTax).toBe('required');
  });

  it('4. 給与2,100万円 → 所得税 要（salary-over-20m）', () => {
    const r = judge(salaried({ salaryMain: 21_000_000 }));
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toContain('salary-over-20m');
    expect(judge(salaried({ salaryMain: 20_000_000 })).incomeTax).toBe('notRequired');
  });

  it('5. 給与2か所（主400万円・従30万円）→ 所得税 要（two-salaries）', () => {
    const r = judge(salaried({ salaryTwoOrMore: true, salarySub: 300_000 }));
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toContain('two-salaries');
  });

  it('2か所でも、年末調整されなかった給与と他の所得の合計が20万円以下なら不要', () => {
    const r = judge(salaried({ salaryTwoOrMore: true, salarySub: 150_000 }));
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toContain('two-salaries-under-limit');
  });

  it('2か所で、給与の合計150万円以下かつ他の所得20万円以下なら不要（No.1900 3の注）', () => {
    const r = judge(salaried({ salaryMain: 1_000_000, salaryTwoOrMore: true, salarySub: 500_000 }));
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toContain('two-salaries-under-limit');
  });

  it('6. 年金380万円のみ（全部源泉徴収）→ 所得税 不要・住民税は「控除を足したいなら要」の注記', () => {
    const r = judge({ ...BASE, kinds: { ...NO_KINDS, pension: true }, pensionAnnual: 3_800_000 });
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toEqual(['pension-under-4m']);
    expect(r.residentTax).toBe('notRequired');
    expect(r.notes).toContain('pension-resident-deductions');
  });

  it('7. 年金420万円 → 所得税 要（pension-over-4m）', () => {
    const r = judge({ ...BASE, kinds: { ...NO_KINDS, pension: true }, pensionAnnual: 4_200_000 });
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toContain('pension-over-4m');
    expect(judge({ ...BASE, kinds: { ...NO_KINDS, pension: true }, pensionAnnual: 4_000_000 }).incomeTax).toBe(
      'notRequired',
    );
  });

  it('源泉徴収されない年金があると、400万円以下でも特例は使えない（No.1600 注3）', () => {
    const r = judge({
      ...BASE,
      kinds: { ...NO_KINDS, pension: true },
      pensionAnnual: 3_000_000,
      unwithheldPension: true,
    });
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toContain('no-withholding-pension');
  });

  it('年金と給与：給与の所得は「年金以外の所得」に入る', () => {
    const r = judge({
      ...BASE,
      kinds: { ...NO_KINDS, salary: true, pension: true },
      salaryMain: 1_500_000,
      pensionAnnual: 2_000_000,
    });
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toContain('pension-other-income-over-200k');
  });

  it('8. 事業所得50万円のみ → 所得税額0で不要（120条）・住民税 要', () => {
    const r = judge({ ...BASE, kinds: { ...NO_KINDS, business: true }, otherIncome: 500_000 });
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toEqual(['no-tax-due']);
    expect(r.residentTax).toBe('required');
  });

  it('事業所得だけで基礎控除104万円を超えれば要（business-tax-due）', () => {
    const r = judge({ ...BASE, kinds: { ...NO_KINDS, business: true }, otherIncome: 1_040_001 });
    expect(r.incomeTax).toBe('required');
    expect(r.reasons).toEqual(['business-tax-due']);
    expect(judge({ ...BASE, kinds: { ...NO_KINDS, business: true }, otherIncome: 1_040_000 }).incomeTax).toBe(
      'notRequired',
    );
  });

  it('事業所得が住民税の基礎控除43万円以下なら、住民税は「市区町村に確認」', () => {
    const r = judge({ ...BASE, kinds: { ...NO_KINDS, business: true }, otherIncome: 300_000 });
    expect(r.residentTax).toBe('unknown');
  });

  it('給与が少なく、副業所得が20万円を超えても所得税額が出なければ不要', () => {
    const r = judge(salaried({ salaryMain: 1_000_000, otherIncome: 300_000 }));
    // 給与所得26万円 + 30万円 = 56万円 ≦ 基礎控除104万円
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toEqual(['salary-other-income-over-200k', 'no-tax-due']);
    expect(r.residentTax).toBe('required');
  });

  it('9. 給与1か所・医療費控除あり → notRequiredButRefund、還付期限 2031-12-31', () => {
    const r = judge(salaried({ refund: { ...EMPTY_REFUND, medical: true } }));
    expect(r.incomeTax).toBe('notRequiredButRefund');
    expect(r.refundHints).toEqual(['medical']);
    expect(refundDeadline()).toBe('2031-12-31');
  });

  it('10. ワンストップ特例を出した・医療費控除で申告する → notRequiredButRefund かつ onestop-invalid', () => {
    const r = judge(salaried({ refund: { ...EMPTY_REFUND, medical: true, onestopApplied: true } }));
    expect(r.incomeTax).toBe('notRequiredButRefund');
    expect(r.notes).toContain('onestop-invalid');
  });

  it('ワンストップ特例だけで申告しない人には onestop-invalid を出さない', () => {
    const r = judge(salaried({ refund: { ...EMPTY_REFUND, onestopApplied: true } }));
    expect(r.incomeTax).toBe('notRequired');
    expect(r.notes).not.toContain('onestop-invalid');
  });

  it('申告が要る人がワンストップ特例を出していれば onestop-invalid', () => {
    const r = judge(salaried({ otherIncome: 300_000, refund: { ...EMPTY_REFUND, onestopApplied: true } }));
    expect(r.incomeTax).toBe('required');
    expect(r.notes).toContain('onestop-invalid');
  });

  it('11. 給与1か所・副業所得15万円・医療費控除あり → refund-include-other-income が付く', () => {
    const r = judge(salaried({ otherIncome: 150_000, refund: { ...EMPTY_REFUND, medical: true } }));
    expect(r.incomeTax).toBe('notRequiredButRefund');
    expect(r.notes).toContain('refund-include-other-income');
  });

  it('11. 副業所得0円で同じ条件なら refund-include-other-income は付かない', () => {
    const r = judge(salaried({ otherIncome: 0, refund: { ...EMPTY_REFUND, medical: true } }));
    expect(r.incomeTax).toBe('notRequiredButRefund');
    expect(r.notes).not.toContain('refund-include-other-income');
  });
});

describe('還付申告の行き先', () => {
  it('年の途中で退職して年末調整を受けていない → retired-no-adjustment', () => {
    const r = judge(salaried({ yearEndAdjusted: false }));
    expect(r.incomeTax).toBe('notRequiredButRefund');
    expect(r.refundHints).toEqual(['retired-no-adjustment']);
  });

  it('チェックした順ではなく決まった順で返す', () => {
    const r = judge(
      salaried({
        refund: {
          ...EMPTY_REFUND,
          disaster: true,
          furusato: true,
          housingLoanFirst: true,
          selfMedication: true,
          retirementNoDeclaration: true,
        },
      }),
    );
    expect(r.refundHints).toEqual([
      'self-medication',
      'furusato',
      'housing-loan-first',
      'retirement-no-declaration',
      'disaster',
    ]);
  });
});

describe('入力の端', () => {
  it('収入なし → すべて不要', () => {
    const r = judge(BASE);
    expect(r.incomeTax).toBe('notRequired');
    expect(r.reasons).toEqual(['no-income']);
    expect(r.residentTax).toBe('notRequired');
  });

  it('種類を外した欄の値は数えない（給与のチェックを外したら給与の年収は無視）', () => {
    const r = judge({ ...BASE, salaryMain: 30_000_000, otherIncome: 500_000 });
    expect(r.reasons).toEqual(['no-income']);
  });

  it('負の値・NaN は0として扱う', () => {
    const r = judge(salaried({ otherIncome: Number.NaN, salarySub: -1 }));
    expect(r.incomeTax).toBe('notRequired');
  });
});
