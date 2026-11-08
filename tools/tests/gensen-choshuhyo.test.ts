import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TAX_YEAR,
  checkGensenChoshuhyo,
  parseYen,
  type GensenInput,
  type GensenResult,
} from '@/lib/gensen-choshuhyo';
import { RULES_R7, RULES_R8, calcYearTax, type NenmatsuInput } from '@/lib/nenmatsu-chosei';
import { tools } from '@/lib/registry';

/** 年末調整の計算機の入力（家族・保険なし。社会保険料だけ渡す） */
const base: NenmatsuInput = {
  income: 0,
  withheld: null,
  socialInsurance: null,
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
};

/** 年末調整の計算機で年税額を出し、それを源泉徴収票の4欄に写したもの */
function slipFrom(income: number, social: number): GensenInput {
  const y = calcYearTax({ ...base, income }, RULES_R8, social);
  return {
    payment: income,
    salaryIncome: y.totalIncome,
    deductionTotal: y.deductionTotal,
    withheldTax: y.yearTax,
  };
}

function checked(r: GensenResult) {
  if (r.status !== 'checked') throw new Error('検算されていない');
  return r;
}

describe('parseYen（票の数字の貼り付け）', () => {
  it('全角数字・カンマ・円を受け付ける', () => {
    expect(parseYen('５，０００，０００')).toBe(5_000_000);
    expect(parseYen('5,000,000円')).toBe(5_000_000);
    expect(parseYen(' ¥ 91,100 ')).toBe(91_100);
    expect(parseYen('0')).toBe(0);
  });
  it('空欄・読めない値は null', () => {
    expect(parseYen('')).toBeNull();
    expect(parseYen('  ')).toBeNull();
    expect(parseYen('abc')).toBeNull();
    expect(parseYen('-100')).toBeNull();
    expect(parseYen('1.5')).toBeNull();
  });
});

describe('4つの欄の検算', () => {
  it('年収500万円・社会保険料72万円・基礎控除のみ：calcYearTax と一致する', () => {
    const slip = slipFrom(5_000_000, 720_000);
    // 別表第五：500万円 → 3,560,000円。所得控除 72万 + 104万 = 176万
    expect(slip.salaryIncome).toBe(3_560_000);
    expect(slip.deductionTotal).toBe(1_760_000);
    const r = checked(checkGensenChoshuhyo(slip));
    expect(r.salaryIncome.ok).toBe(true);
    expect(r.taxableIncome.expected).toBe(1_800_000);
    expect(r.calculatedTax).toBe(90_000);
    expect(r.yearTax.expected).toBe(91_800);
    expect(r.yearTax.ok).toBe(true);
    expect(r.allOk).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it.each([
    [1_600_000, 0], // 給与所得控除 74万円の最低保障の帯
    [1_900_000, 200_000],
    [2_200_000, 300_000], // 74万円と式がつながる境目
    [6_599_999, 950_000], // 表の最後
    [6_600_000, 950_000], // 式に切り替わる
    [12_000_000, 1_500_000],
  ])('年収 %i 円：年末調整の計算機と同じ答えで ✓ になる', (income, social) => {
    const r = checked(checkGensenChoshuhyo(slipFrom(income, social)));
    expect(r.salaryIncome.ok).toBe(true);
    expect(r.yearTax.ok).toBe(true);
    expect(r.allOk).toBe(true);
  });

  it('年収160万円は給与所得控除74万円で給与所得控除後の金額が86万円', () => {
    const r = checked(
      checkGensenChoshuhyo({
        payment: 1_600_000,
        salaryIncome: 860_000,
        deductionTotal: 1_040_000,
        withheldTax: 0,
      }),
    );
    expect(r.salaryIncome.expected).toBe(860_000);
    expect(r.salaryIncome.ok).toBe(true);
  });

  it('660万円は表ではなく式（20% + 44万円）', () => {
    const r = checked(
      checkGensenChoshuhyo({
        payment: 6_600_000,
        salaryIncome: 4_840_000,
        deductionTotal: 0,
        withheldTax: 0,
      }),
    );
    expect(r.salaryIncome.expected).toBe(4_840_000);
    expect(r.salaryIncome.ok).toBe(true);
  });

  it('源泉徴収税額0円（課税所得0円）で ✗ にならない', () => {
    const r = checked(
      checkGensenChoshuhyo({
        payment: 1_500_000,
        salaryIncome: 760_000,
        deductionTotal: 1_250_000,
        withheldTax: 0,
      }),
    );
    expect(r.taxableIncome.expected).toBe(0);
    expect(r.yearTax.expected).toBe(0);
    expect(r.yearTax.ok).toBe(true);
    expect(r.allOk).toBe(true);
  });

  it('住宅ローン控除で年税額が0円になる（票の額をそのまま引く）', () => {
    const slip = slipFrom(5_000_000, 720_000);
    const r = checked(
      checkGensenChoshuhyo({ ...slip, withheldTax: 0, housingLoanCredit: 90_000 }),
    );
    expect(r.calculatedTax).toBe(90_000);
    expect(r.housingLoanCredit).toBe(90_000);
    expect(r.adjustedTax).toBe(0);
    expect(r.yearTax.ok).toBe(true);
  });

  it('住宅ローン控除の一部だけ引く：算出税額 − 票の額 → ×102.1% → 100円未満切捨て', () => {
    const slip = slipFrom(5_000_000, 720_000);
    // 90,000 − 50,000 = 40,000 → ×1.021 = 40,840 → 40,800
    const r = checked(
      checkGensenChoshuhyo({ ...slip, withheldTax: 40_800, housingLoanCredit: 50_000 }),
    );
    expect(r.yearTax.expected).toBe(40_800);
    expect(r.yearTax.ok).toBe(true);
  });

  it('1円ずらすと ✗ になり、よくある理由が出る（最大3つ）', () => {
    const slip = slipFrom(5_000_000, 720_000);
    const r = checked(checkGensenChoshuhyo({ ...slip, withheldTax: slip.withheldTax + 1 }));
    expect(r.yearTax.ok).toBe(false);
    expect(r.allOk).toBe(false);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.length).toBeLessThanOrEqual(3);
    expect(r.reasons).toContain('previous-employer');
  });

  it('給与所得控除後の金額が表より小さければ、所得金額調整控除を先頭の理由にする', () => {
    const slip = slipFrom(9_000_000, 1_200_000);
    const r = checked(checkGensenChoshuhyo({ ...slip, salaryIncome: slip.salaryIncome - 150_000 }));
    expect(r.salaryIncome.ok).toBe(false);
    expect(r.reasons[0]).toBe('adjustment-deduction');
  });

  it('所得金額調整控除額を入れると、その額を差し引いて比べる', () => {
    const slip = slipFrom(9_000_000, 1_200_000);
    const r = checked(
      checkGensenChoshuhyo({
        ...slip,
        salaryIncome: slip.salaryIncome - 150_000,
        adjustmentDeduction: 150_000,
      }),
    );
    expect(r.salaryIncome.ok).toBe(true);
  });

  it('給与所得控除後の金額が合わなくても、年税額は票の数字で検算する（連鎖させない）', () => {
    const slip = slipFrom(5_000_000, 720_000);
    const r = checked(checkGensenChoshuhyo({ ...slip, payment: slip.payment + 100_000 }));
    expect(r.salaryIncome.ok).toBe(false);
    expect(r.yearTax.ok).toBe(true);
  });
});

describe('年調未済・乙欄', () => {
  it('年調未済の印があると検算を出さず、確定申告の判定へ案内する', () => {
    const r = checkGensenChoshuhyo({ ...slipFrom(5_000_000, 720_000), notAdjusted: true });
    expect(r.status).toBe('skipped');
    expect(r.recommendKakutei).toBe(true);
  });
  it('乙欄でも検算しない', () => {
    const r = checkGensenChoshuhyo({ ...slipFrom(5_000_000, 720_000), otsu: true });
    expect(r).toMatchObject({ status: 'skipped', reason: 'otsu' });
  });
  it('給与2,000万円超は確定申告を強く案内する', () => {
    expect(checked(checkGensenChoshuhyo(slipFrom(20_000_001, 2_000_000))).recommendKakutei).toBe(
      true,
    );
    expect(checked(checkGensenChoshuhyo(slipFrom(20_000_000, 2_000_000))).recommendKakutei).toBe(
      false,
    );
  });
});

describe('所得控除の額の合計額の内訳', () => {
  it('基礎控除が無ければ合計所得から令和8年分の額を推定する', () => {
    const r = checked(checkGensenChoshuhyo(slipFrom(5_000_000, 720_000)));
    expect(r.breakdown.basicDeduction).toBe(1_040_000);
    expect(r.breakdown.basicDeductionEstimated).toBe(true);
    expect(r.breakdown.others).toBe(720_000);
  });
  it('社会保険料・生命保険料・地震保険料を入れると残りを「その他」に出す', () => {
    const r = checked(
      checkGensenChoshuhyo({
        payment: 5_000_000,
        salaryIncome: 3_560_000,
        deductionTotal: 2_250_000,
        withheldTax: 0,
        basicDeduction: 1_040_000,
        socialInsurance: 720_000,
        lifeInsurance: 100_000,
        earthquakeInsurance: 10_000,
      }),
    );
    expect(r.breakdown.basicDeductionEstimated).toBe(false);
    expect(r.breakdown.others).toBe(380_000);
  });
});

describe('令和7年分の制度との比較（基礎控除と給与所得控除だけ差し替えた概算）', () => {
  it('年収500万円・社会保険料72万円：年末調整の計算機の令和7年分と一致する', () => {
    const slip = slipFrom(5_000_000, 720_000);
    const prev = calcYearTax({ ...base, income: 5_000_000 }, RULES_R7, 720_000);
    const r = checked(checkGensenChoshuhyo(slip));
    expect(r.previous.yearTax).toBe(prev.yearTax);
    expect(r.previous.difference).toBe(prev.yearTax - slip.withheldTax);
    expect(r.previous.difference).toBeGreaterThan(0);
  });
  it('基礎控除を入れたらその額を差し替える', () => {
    const slip = slipFrom(3_000_000, 450_000);
    const r = checked(checkGensenChoshuhyo({ ...slip, basicDeduction: 1_040_000 }));
    const prev = calcYearTax({ ...base, income: 3_000_000 }, RULES_R7, 450_000);
    expect(r.previous.yearTax).toBe(prev.yearTax);
  });
});

describe('ページ', () => {
  const src = (f: string) =>
    readFileSync(fileURLToPath(new URL(`../app/gensen-choshuhyo/${f}`, import.meta.url)), 'utf8');

  it('registry にあり、まだ公開していない', () => {
    const t = tools.find((x) => x.slug === 'gensen-choshuhyo');
    expect(t).toBeDefined();
    expect(t?.stage).not.toBe('public');
  });

  it('title は年分の定数から組み立てる', () => {
    expect(TAX_YEAR.label).toBe('令和8年分');
    expect(src('page.tsx')).toMatch(/TAX_YEAR\.label/);
    expect(src('page.tsx')).not.toMatch(/title = '.*令和8年分/);
  });

  it('金額を URL に載せない（次の行き先は単なるリンク）', () => {
    const calc = src('Calculator.tsx');
    expect(calc).not.toMatch(/\?pay=|\?income=|searchParams|location\.(search|hash)\s*=/);
    expect(calc).not.toMatch(/href=\{`[^`]*\$\{/);
  });

  it('tool_use には金額を混ぜない（action は直書き）', () => {
    const calc = src('Calculator.tsx');
    expect(calc).toMatch(/trackToolUse\(SLUG, /);
    expect(calc).not.toMatch(/trackToolUse\([^)]*`/);
  });

  it('「会社の計算が間違い」と断定しない', () => {
    expect(src('Calculator.tsx') + src('page.tsx')).not.toMatch(/会社の計算(が|は)(間違|誤)/);
  });
});
