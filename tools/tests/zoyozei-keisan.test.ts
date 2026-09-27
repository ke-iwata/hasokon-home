import { describe, expect, it } from 'vitest';
import {
  BASIC_DEDUCTION,
  GENERAL_BRACKETS,
  SPECIAL_BRACKETS,
  addedAmountRange,
  additionPeriod,
  classifyGift,
  giftTax,
  giftTaxMixed,
  hayamiTable,
  settlementTax,
  taxOnTaxable,
  yearsBefore,
  type DateParts,
} from '@/lib/zoyozei-keisan';

const d = (iso: string): DateParts => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
};
const MAN = 10_000;

describe('贈与税（暦年課税）— No.4408 の計算例', () => {
  it('（1）一般税率 500万円 → 53万円', () => {
    const r = giftTax(500 * MAN, { lineal: false, adultOn0101: true });
    expect(r.taxable).toBe(390 * MAN);
    expect(r.table).toBe('general');
    expect(r.bracket).toEqual({ upTo: 4_000_000, rate: 0.2, deduction: 250_000 });
    expect(r.tax).toBe(530_000);
  });

  it('（2）特例税率 500万円 → 48.5万円', () => {
    const r = giftTax(500 * MAN, { lineal: true, adultOn0101: true });
    expect(r.table).toBe('special');
    expect(r.tax).toBe(485_000);
    expect(r.effectiveRate).toBeCloseTo(0.097, 6);
  });

  it('（3）一般 100万円＋特例 400万円 → 10.6万円＋38.8万円＝49.4万円', () => {
    const r = giftTaxMixed({ general: 100 * MAN, special: 400 * MAN });
    expect(r.table).toBe('mixed');
    expect(r.general?.fullTax).toBe(530_000);
    expect(r.general?.share).toBeCloseTo(106_000, 6);
    expect(r.special?.fullTax).toBe(485_000);
    expect(r.special?.share).toBeCloseTo(388_000, 6);
    expect(r.tax).toBe(494_000);
  });

  it('混在：父から300万円と叔父から200万円（FAQ の例）', () => {
    const r = giftTax(500 * MAN, { lineal: true, adultOn0101: true, linealAmount: 300 * MAN });
    // 一般 53万 × 200/500 = 21.2万、特例 48.5万 × 300/500 = 29.1万
    expect(r.tax).toBe(503_000);
  });

  it('18歳未満（贈与年の1月1日時点）は直系尊属からでも一般税率', () => {
    expect(giftTax(500 * MAN, { lineal: true, adultOn0101: false }).tax).toBe(530_000);
    // 按分の指定があっても一般税率
    expect(giftTax(500 * MAN, { lineal: true, adultOn0101: false, linealAmount: 500 * MAN }).tax).toBe(530_000);
  });

  it('混在の片方が0なら、その速算表だけの計算と一致する', () => {
    expect(giftTaxMixed({ general: 0, special: 800 * MAN }).tax).toBe(
      giftTax(800 * MAN, { lineal: true, adultOn0101: true }).tax,
    );
    expect(giftTaxMixed({ general: 800 * MAN, special: 0 }).tax).toBe(
      giftTax(800 * MAN, { lineal: false, adultOn0101: true }).tax,
    );
  });
});

describe('贈与税 — 速算表の境界（基礎控除後の課税価格で ±1,000円）', () => {
  // 課税価格は1,000円未満切捨てなので、境界の前後は1,000円刻みで見る
  const cases: { table: 'general' | 'special'; brackets: typeof GENERAL_BRACKETS }[] = [
    { table: 'general', brackets: GENERAL_BRACKETS },
    { table: 'special', brackets: SPECIAL_BRACKETS },
  ];
  for (const { table, brackets } of cases) {
    for (let i = 0; i < brackets.length - 1; i++) {
      const b = brackets[i];
      const next = brackets[i + 1];
      it(`${table}: ${b.upTo / MAN}万円ちょうどは ${b.rate * 100}%、+1,000円は ${next.rate * 100}%`, () => {
        const at = giftTax(b.upTo + BASIC_DEDUCTION, { lineal: table === 'special', adultOn0101: true });
        expect(at.taxable).toBe(b.upTo);
        expect(at.bracket?.rate).toBe(b.rate);
        expect(at.tax).toBe(Math.floor((b.upTo * b.rate - b.deduction) / 100) * 100);

        const over = giftTax(b.upTo + 1000 + BASIC_DEDUCTION, { lineal: table === 'special', adultOn0101: true });
        expect(over.bracket?.rate).toBe(next.rate);

        const under = giftTax(b.upTo - 1000 + BASIC_DEDUCTION, { lineal: table === 'special', adultOn0101: true });
        expect(under.bracket?.rate).toBe(b.rate);
      });

      it(`${table}: ${b.upTo / MAN}万円で速算表の2行が同じ税額になる（控除額の転記ミスを見張る）`, () => {
        expect(b.upTo * b.rate - b.deduction).toBeCloseTo(b.upTo * next.rate - next.deduction, 6);
      });
    }
  }

  it('基礎控除後の課税価格が1円でも出れば税額は切捨てで決まる（1,000円未満は切捨て）', () => {
    expect(giftTax(BASIC_DEDUCTION + 1, { lineal: false, adultOn0101: true }).taxable).toBe(0);
    expect(giftTax(BASIC_DEDUCTION + 1_999, { lineal: false, adultOn0101: true }).taxable).toBe(1_000);
    expect(giftTax(BASIC_DEDUCTION + 1_999, { lineal: false, adultOn0101: true }).tax).toBe(100);
  });

  it('4,500万円超は特例 55%／640万円、一般 55%／400万円', () => {
    expect(taxOnTaxable(5000 * MAN, 'special')).toBeCloseTo(5000 * MAN * 0.55 - 640 * MAN, 6);
    expect(taxOnTaxable(5000 * MAN, 'general')).toBeCloseTo(5000 * MAN * 0.55 - 400 * MAN, 6);
  });
});

describe('贈与税 — 110万円以下と異常値', () => {
  it('110万円ちょうど・それ以下は税額0', () => {
    for (const a of [0, 1, 500_000, BASIC_DEDUCTION]) {
      expect(giftTax(a, { lineal: true, adultOn0101: true }).tax).toBe(0);
      expect(giftTax(a, { lineal: false, adultOn0101: true }).tax).toBe(0);
    }
  });

  it('負の入力・NaN は 0 として扱う', () => {
    expect(giftTax(-5_000_000, { lineal: false, adultOn0101: true }).tax).toBe(0);
    expect(giftTax(Number.NaN, { lineal: false, adultOn0101: true }).tax).toBe(0);
    expect(giftTaxMixed({ general: -1, special: -1 }).effectiveRate).toBe(0);
    expect(settlementTax(-1).tax).toBe(0);
  });

  it('直系尊属からの額が合計を超えていたら合計で止める', () => {
    const r = giftTax(500 * MAN, { lineal: true, adultOn0101: true, linealAmount: 900 * MAN });
    expect(r.tax).toBe(485_000);
  });
});

describe('相続時精算課税 — No.4103', () => {
  it('No.4103 の具体例：令和7年1,610万円 → 令和8年1,890万円', () => {
    // 令和7年分は精算課税の基礎控除110万円を引いた1,500万円に特別控除1,500万円 → 税額0
    const r7 = settlementTax(1610 * MAN, 0);
    expect(r7.afterBasic).toBe(1500 * MAN);
    expect(r7.specialDeductionUsed).toBe(1500 * MAN);
    expect(r7.tax).toBe(0);
    // 令和8年分は1,780万円から残りの特別控除1,000万円 → 780万円 × 20% = 156万円
    const r8 = settlementTax(1890 * MAN, r7.specialDeductionUsed);
    expect(r8.afterBasic).toBe(1780 * MAN);
    expect(r8.specialDeductionUsed).toBe(1000 * MAN);
    expect(r8.specialDeductionLeft).toBe(0);
    expect(r8.tax).toBe(156 * MAN);
  });

  it('110万円以内なら加算額（afterBasic）も税額も0', () => {
    const r = settlementTax(BASIC_DEDUCTION);
    expect(r.afterBasic).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('特別控除を使い切った後は、基礎控除後の額に一律20%', () => {
    const r = settlementTax(500 * MAN, 2500 * MAN);
    expect(r.specialDeductionUsed).toBe(0);
    expect(r.tax).toBe(78 * MAN);
  });

  it('使用済みの特別控除が限度額を超えて入力されても限度額で止める', () => {
    expect(settlementTax(500 * MAN, 9999 * MAN).specialDeductionLeft).toBe(0);
  });
});

describe('加算期間 — No.4161 の表', () => {
  it('相続開始日で 3 行のどれになるか', () => {
    expect(additionPeriod(d('2026-12-31'))).toEqual({ kind: '3y', from: d('2023-12-31') });
    expect(additionPeriod(d('2027-01-01'))).toEqual({ kind: 'from-2024-01-01', from: d('2024-01-01') });
    expect(additionPeriod(d('2030-12-31'))).toEqual({ kind: 'from-2024-01-01', from: d('2024-01-01') });
    expect(additionPeriod(d('2031-01-01'))).toEqual({ kind: '7y', from: d('2024-01-01') });
    expect(additionPeriod(d('2033-06-15'))).toEqual({ kind: '7y', from: d('2026-06-15') });
  });

  it('応当日の無い 2 月 29 日は 2 月 28 日に寄せる', () => {
    expect(yearsBefore(d('2028-02-29'), 3)).toEqual(d('2025-02-28'));
    expect(yearsBefore(d('2032-02-29'), 7)).toEqual(d('2025-02-28'));
    expect(yearsBefore(d('2024-02-29'), -4)).toEqual(d('2028-02-29'));
  });
});

describe('加算チェッカー — 相続開始日 4 点 × 贈与日 3 点', () => {
  // 贈与日：改正前ルールの贈与（2023年）・経過期間の起点（2024-01-01）・3年以内に入りうる贈与（2026年）
  const gifts = ['2023-06-01', '2024-01-01', '2026-06-01'];
  const expected: Record<string, Record<string, string>> = {
    '2026-12-31': { '2023-06-01': 'not-added', '2024-01-01': 'within-3y', '2026-06-01': 'within-3y' },
    // 2027-01-01 は「2024-01-01 から」だが、3年前の日も 2024-01-01 なので延長分はまだ無い
    '2027-01-01': { '2023-06-01': 'not-added', '2024-01-01': 'within-3y', '2026-06-01': 'within-3y' },
    '2030-12-31': { '2023-06-01': 'not-added', '2024-01-01': 'extended-4y', '2026-06-01': 'extended-4y' },
    '2031-01-01': { '2023-06-01': 'not-added', '2024-01-01': 'extended-4y', '2026-06-01': 'extended-4y' },
  };
  for (const [inh, row] of Object.entries(expected)) {
    for (const g of gifts) {
      it(`相続 ${inh} × 贈与 ${g} → ${row[g]}`, () => {
        expect(classifyGift(d(g), d(inh))).toBe(row[g]);
      });
    }
  }

  it('2027-01-02 の相続から延長分（100万円の枠）が生まれる（No.4161 の注）', () => {
    expect(classifyGift(d('2024-01-01'), d('2027-01-02'))).toBe('extended-4y');
  });

  it('3 年前の応当日は「3 年以内」に含む', () => {
    expect(classifyGift(d('2025-05-10'), d('2028-05-10'))).toBe('within-3y');
    expect(classifyGift(d('2025-05-09'), d('2028-05-10'))).toBe('extended-4y');
  });

  it('7 年前の応当日は含み、その前日は対象外', () => {
    expect(classifyGift(d('2026-03-01'), d('2033-03-01'))).toBe('extended-4y');
    expect(classifyGift(d('2026-02-28'), d('2033-03-01'))).toBe('not-added');
  });

  it('うるう日：2028-02-29 の相続は 2025-02-28 からが 3 年以内', () => {
    expect(classifyGift(d('2025-02-28'), d('2028-02-29'))).toBe('within-3y');
    expect(classifyGift(d('2025-02-27'), d('2028-02-29'))).toBe('extended-4y');
  });

  it('うるう日の贈与：2024-02-29 の贈与は 2027-02-28 の相続まで 3 年以内', () => {
    expect(classifyGift(d('2024-02-29'), d('2027-02-28'))).toBe('within-3y');
    expect(classifyGift(d('2024-02-29'), d('2027-03-01'))).toBe('extended-4y');
  });

  it('相続開始日より後の贈与は対象外（同じ日は 3 年以内）', () => {
    expect(classifyGift(d('2027-05-02'), d('2027-05-01'))).toBe('not-added');
    expect(classifyGift(d('2027-05-01'), d('2027-05-01'))).toBe('within-3y');
  });

  it('駆け込みで扱いは変わらない：2026年12月と2027年1月の贈与は、同じ相続開始日なら同じ区分', () => {
    for (const inh of ['2029-06-01', '2030-06-01', '2031-06-01', '2033-06-01', '2034-06-01']) {
      expect(classifyGift(d('2026-12-15'), d(inh)), inh).toBe(classifyGift(d('2027-01-15'), d(inh)));
    }
  });
});

describe('加算される額', () => {
  it('3年以内は全額（110万円以下でも）', () => {
    expect(addedAmountRange(500_000, 'within-3y')).toEqual({ min: 500_000, max: 500_000 });
  });
  it('延長 4 年分は 100 万円の枠のぶん幅がある', () => {
    expect(addedAmountRange(3_000_000, 'extended-4y')).toEqual({ min: 2_000_000, max: 3_000_000 });
    expect(addedAmountRange(800_000, 'extended-4y')).toEqual({ min: 0, max: 800_000 });
  });
  it('対象外は 0', () => {
    expect(addedAmountRange(3_000_000, 'not-added')).toEqual({ min: 0, max: 0 });
  });
});

describe('早見表（贈与日を固定して相続開始年を動かす）', () => {
  it('2026-06-01 の贈与：2029-06-01 までは 3 年以内、以後は延長 4 年分、2033-06-02 から対象外', () => {
    const rows = hayamiTable(d('2026-06-01'));
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034]);
    const byYear = new Map(rows.map((r) => [r.year, r.segments]));
    expect(byYear.get(2026)).toEqual([
      { from: d('2026-06-01'), to: d('2026-12-31'), cls: 'within-3y', kind: '3y' },
    ]);
    expect(byYear.get(2028)?.map((s) => s.cls)).toEqual(['within-3y']);
    expect(byYear.get(2029)).toEqual([
      { from: d('2029-01-01'), to: d('2029-06-01'), cls: 'within-3y', kind: 'from-2024-01-01' },
      { from: d('2029-06-02'), to: d('2029-12-31'), cls: 'extended-4y', kind: 'from-2024-01-01' },
    ]);
    expect(byYear.get(2031)?.map((s) => s.cls)).toEqual(['extended-4y']);
    expect(byYear.get(2033)).toEqual([
      { from: d('2033-01-01'), to: d('2033-06-01'), cls: 'extended-4y', kind: '7y' },
      { from: d('2033-06-02'), to: d('2033-12-31'), cls: 'not-added', kind: '7y' },
    ]);
    expect(byYear.get(2034)?.map((s) => s.cls)).toEqual(['not-added']);
  });

  it('2023 年の贈与：2026 年中は 3 年以内、2027-01-01 から対象外（2024 年より前の贈与は加算期間の外）', () => {
    const rows = hayamiTable(d('2023-06-01'));
    expect(rows[0].segments).toEqual([
      { from: d('2026-01-01'), to: d('2026-06-01'), cls: 'within-3y', kind: '3y' },
      { from: d('2026-06-02'), to: d('2026-12-31'), cls: 'not-added', kind: '3y' },
    ]);
    expect(rows.slice(1).every((r) => r.segments.length === 1 && r.segments[0].cls === 'not-added')).toBe(true);
  });

  it('区間は年の中で切れ目なく並び、各区間の判定は classifyGift と一致する', () => {
    for (const g of ['2024-01-01', '2024-02-29', '2025-12-31', '2027-03-15']) {
      for (const row of hayamiTable(d(g))) {
        for (const s of row.segments) {
          expect(classifyGift(d(g), s.from), `${g} ${row.year}`).toBe(s.cls);
          expect(classifyGift(d(g), s.to), `${g} ${row.year}`).toBe(s.cls);
        }
      }
    }
  });

  it('贈与日より前の年は出さない', () => {
    expect(hayamiTable(d('2028-04-01'))[0].year).toBe(2028);
    expect(hayamiTable(d('2028-04-01'))[0].segments[0].from).toEqual(d('2028-04-01'));
  });
});

describe('画面の文言（#280 レビュー）', () => {
  it('贈与額の注記は「全員分の合計」を案内し、「同じ人から」に戻らない（B の贈与税が過少に出るため）', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../app/zoyozei-keisan/Calculator.tsx', import.meta.url), 'utf8');
    expect(src).not.toContain('同じ人から');
    expect(src).toContain('複数の人から受けた場合は全員分の合計');
  });

  it('父200万円・母200万円は合計400万円で計算する（1人分の200万円で計算すると過少）', () => {
    expect(giftTax(4_000_000, { lineal: true, adultOn0101: true }).tax).toBe(335_000);
    expect(giftTax(2_000_000, { lineal: true, adultOn0101: true }).tax).toBe(90_000);
  });
});
