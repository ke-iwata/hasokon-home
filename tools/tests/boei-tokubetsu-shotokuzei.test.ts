import { describe, expect, it } from 'vitest';
import {
  DEFENSE_EFFECTIVE_ON,
  DEFENSE_START_YEAR,
  EXTENDED_YEARS,
  PHASES,
  RECONSTRUCTION_LAST_YEAR_AFTER,
  RECONSTRUCTION_LAST_YEAR_BEFORE,
  RULES_R9,
  TABLE_INCOMES,
  calcBoei,
  hayamihyo,
  isDefenseTaxInEffect,
  surtaxAmount,
  surtaxPermille,
  yearTaxWithSurtax,
} from '@/lib/boei-tokubetsu-shotokuzei';
import { RECONSTRUCTION_RATE, incomeTaxAmount, incomeTaxRate } from '@/lib/furusato-nozei';
import { RULES_R8 } from '@/lib/nenmatsu-chosei';
import { WITHHOLDING_TABLE_EFFECTIVE_ON } from '@/lib/tedori-keisan';

describe('税率と課税期間（国税庁Q&A Q1）', () => {
  it('防衛特別所得税は2027年から1%、終期の定めがない', () => {
    expect(surtaxPermille(2026, 'after').defense).toBe(0);
    expect(surtaxPermille(2027, 'after').defense).toBe(10);
    expect(surtaxPermille(2047, 'after').defense).toBe(10);
    expect(surtaxPermille(2048, 'after').defense).toBe(10);
    expect(surtaxPermille(2100, 'after').defense).toBe(10);
  });

  it('復興特別所得税は2027年から1.1%に下がり、2047年まで延長される', () => {
    expect(surtaxPermille(2026, 'after').reconstruction).toBe(21);
    expect(surtaxPermille(2027, 'after').reconstruction).toBe(11);
    expect(surtaxPermille(2047, 'after').reconstruction).toBe(11);
    expect(surtaxPermille(2048, 'after').reconstruction).toBe(0);
    // 改正前は2.1%のまま2037年で終わっていた
    expect(surtaxPermille(2037, 'before').reconstruction).toBe(21);
    expect(surtaxPermille(2038, 'before').reconstruction).toBe(0);
  });

  it('合計税率2.1%は改正前後で変わらない（2013〜2037年のどの年も）', () => {
    for (let year = 2013; year <= 2037; year++) {
      expect(surtaxPermille(year, 'after').total, `${year}年`).toBe(21);
      expect(surtaxPermille(year, 'before').total, `${year}年`).toBe(21);
    }
  });

  it('既存ツールの 1.021（復興特別所得税込みの倍率）と合計税率が一致する', () => {
    expect(1 + surtaxPermille(2027, 'after').total / 1000).toBeCloseTo(RECONSTRUCTION_RATE, 10);
  });

  it('区切りは2026年まで／2027〜2037年／2038〜2047年／2048年以降の4つ', () => {
    expect(PHASES.map((p) => p.label)).toEqual([
      '2026年まで',
      '2027〜2037年',
      '2038〜2047年',
      '2048年以降',
    ]);
    const [p2026, p2027, p2038, p2048] = PHASES;
    expect(p2026.before.total).toBe(p2026.after.total);
    expect(p2027.before.total).toBe(p2027.after.total);
    // 改正で新たに負担が生じるのは2038年以降だけ
    expect(p2038.before.total).toBe(0);
    expect(p2038.after).toEqual({ reconstruction: 11, defense: 10, total: 21 });
    expect(p2048.after).toEqual({ reconstruction: 0, defense: 10, total: 10 });
    expect(p2048.untilYear).toBeNull();
  });

  it('延長された期間は10年', () => {
    expect(EXTENDED_YEARS).toBe(10);
    expect(RECONSTRUCTION_LAST_YEAR_AFTER - RECONSTRUCTION_LAST_YEAR_BEFORE).toBe(10);
    expect(DEFENSE_START_YEAR).toBe(2027);
  });
});

describe('国税庁Q&Aの計算例と突き合わせる', () => {
  it('Q5 合計税率 = 所得税率 × 102.1%', () => {
    // [所得税率(%), 合計税率(%)]
    const table: [number, number][] = [
      [5, 5.105],
      [10, 10.21],
      [15, 15.315],
      [16, 16.336],
      [18, 18.378],
      [20, 20.42],
    ];
    const total = surtaxPermille(2027, 'after').total;
    for (const [rate, combined] of table) {
      // 千分の一パーセント単位の整数で比べる（浮動小数点の誤差を避ける）
      expect(rate * (1000 + total)).toBe(Math.round(combined * 1000));
    }
  });

  it('Q6 例1：講演料222,222円（所得税率10%）→ 22,688円', () => {
    const base = (222_222 * 10) / 100; // 22,222.2円
    expect(Math.floor(base + (base * surtaxPermille(2027, 'after').total) / 1000)).toBe(22_688);
  });

  it('Q6 例2：原稿料1,333,333円（100万円まで10%・超える部分20%）→ 170,166円', () => {
    const base = (1_000_000 * 10) / 100 + (333_333 * 20) / 100;
    expect(Math.floor(base + (base * surtaxPermille(2027, 'after').total) / 1000)).toBe(170_166);
  });

  it('Q9 退職所得：課税退職所得500万円 →（500万×20% − 427,500）× 102.1% = 584,522円', () => {
    const base = 5_000_000 * 0.2 - 427_500;
    expect(base).toBe(incomeTaxAmount(5_000_000));
    // 端数は所得税と付加税の合計額で切り捨てる（Q6）
    expect(base + surtaxAmount(base, 2027, 'after')).toBe(584_522);
  });

  it('Q8 年調年税額は令和8年分と令和9年分で求め方が変わらない', () => {
    for (const base of [0, 99, 12_345, 89_200, 1_234_567]) {
      expect(yearTaxWithSurtax(base, 2027, 'after')).toBe(yearTaxWithSurtax(base, 2026, 'after'));
      expect(yearTaxWithSurtax(base, 2027, 'after')).toBe(
        Math.floor((base * 1.021) / 100) * 100,
      );
    }
  });
});

/**
 * 令和9年分 源泉徴収税額表 18ページ「電子計算機等を使用して源泉徴収税額を計算する方法」
 * （令和8年4月30日財務省告示第128号）別表第四。2026-09-27 に国税庁サイトのPDFから写した。
 * https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/data/18.pdf
 *
 * この表は「所得税、防衛特別所得税及び復興特別所得税」を併せた税額の算式なので、
 * 税率が速算表 × 102.1% であれば「合計 2.1% は改正前と同じ」が税額表で確認できる。
 */
const R9_TABLE4: { upTo: number; ratePer100k: number; deduction: number }[] = [
  // ratePer100k は「B × 5.105%」の 5.105 を1,000倍した整数
  { upTo: 162_500, ratePer100k: 5_105, deduction: 0 },
  { upTo: 275_000, ratePer100k: 10_210, deduction: 8_296 },
  { upTo: 579_166, ratePer100k: 20_420, deduction: 36_374 },
  { upTo: 750_000, ratePer100k: 23_483, deduction: 54_113 },
  { upTo: 1_500_000, ratePer100k: 33_693, deduction: 130_688 },
  { upTo: 3_333_333, ratePer100k: 40_840, deduction: 237_893 },
  { upTo: Infinity, ratePer100k: 45_945, deduction: 408_061 },
];

/** 所得税の速算表の区切り（年額）と控除額。furusato-nozei.ts の表と同じもの */
const ANNUAL_BOUNDS = [1_950_000, 3_300_000, 6_950_000, 9_000_000, 18_000_000, 40_000_000];
const ANNUAL_DEDUCTIONS = [0, 97_500, 427_500, 636_000, 1_536_000, 2_796_000, 4_796_000];

describe('令和9年分 源泉徴収税額表（電算機計算の特例・別表第四）と突き合わせる', () => {
  it('各段の税率は、所得税の速算表の税率 × 102.1%（= 1 + 防衛1% + 復興1.1%）', () => {
    const total = surtaxPermille(2027, 'after');
    expect(total).toEqual({ reconstruction: 11, defense: 10, total: 21 });
    for (const [i, row] of R9_TABLE4.entries()) {
      // 段の中の課税所得（年額）で速算表の税率を引く
      const annualInside = (ANNUAL_BOUNDS[i] ?? 50_000_000) - 1_000;
      const ratePct = Math.round(incomeTaxRate(annualInside) * 100);
      expect(ratePct * (1000 + total.total), `${i + 1}段目`).toBe(row.ratePer100k);
    }
  });

  it('各段の区切りは速算表の区切りの12分の1（月額）', () => {
    for (const [i, bound] of ANNUAL_BOUNDS.entries()) {
      expect(R9_TABLE4[i].upTo).toBe(Math.floor(bound / 12));
    }
  });

  it('各段の控除額は、速算表の控除額の12分の1 × 102.1%（段のつなぎ目の丸めで2円以内）', () => {
    for (const [i, row] of R9_TABLE4.entries()) {
      const expected = (ANNUAL_DEDUCTIONS[i] / 12) * (1 + surtaxPermille(2027, 'after').total / 1000);
      expect(Math.abs(row.deduction - expected), `${i + 1}段目`).toBeLessThanOrEqual(2);
    }
  });
});

describe('calcBoei：年収から防衛特別所得税を出す', () => {
  it('年収500万円・扶養なし（計算過程）', () => {
    const r = calcBoei({ income: 5_000_000, dependents: 0 });
    expect(r.salaryDeduction).toBe(1_440_000); // 500万 × 20% + 44万
    expect(r.totalIncome).toBe(3_560_000);
    expect(r.basicDeduction).toBe(1_040_000); // 合計所得489万円以下
    expect(r.taxableIncome).toBe(
      Math.floor((r.totalIncome - r.socialInsurance - r.basicDeduction) / 1000) * 1000,
    );
    expect(r.calculatedTax).toBe(incomeTaxAmount(r.taxableIncome));
    expect(r.baseTax).toBe(r.calculatedTax);
    expect(r.defenseTax).toBe(Math.floor(r.baseTax / 100));
    expect(r.reconstructionAfter).toBe(Math.floor((r.baseTax * 11) / 1000));
    expect(r.reconstructionBefore).toBe(Math.floor((r.baseTax * 21) / 1000));
  });

  it('2027年の変化はどの年収でも0円（差し引きゼロ）', () => {
    for (let income = 0; income <= 30_000_000; income += 250_000) {
      for (const dependents of [0, 2]) {
        const r = calcBoei({ income, dependents });
        expect(r.change2027, `${income}円・扶養${dependents}人`).toBe(0);
        expect(r.yearTax2027After).toBe(r.yearTax2027Before);
      }
    }
  });

  it('2038〜2047年の追加負担は基準所得税額 × 2.1%、2048年以降は × 1%', () => {
    for (const income of [3_000_000, 5_000_000, 8_000_000, 15_000_000]) {
      const r = calcBoei({ income, dependents: 0 });
      expect(r.annual2038).toBe(Math.floor((r.baseTax * 21) / 1000));
      expect(r.annual2048).toBe(Math.floor(r.baseTax / 100));
      expect(r.cumulative2038to2047).toBe(r.annual2038 * 10);
      // 2048年以降の1%は防衛特別所得税の額と同じ
      expect(r.annual2048).toBe(r.defenseTax);
    }
  });

  it('課税所得ゼロ近辺：給与所得控除74万円＋基礎控除104万円に収まる年収では0円', () => {
    const r = calcBoei({ income: 1_500_000, dependents: 0 });
    expect(r.taxableIncome).toBe(0);
    expect(r.baseTax).toBe(0);
    expect(r.defenseTax).toBe(0);
    expect(r.annual2038).toBe(0);
    expect(r.annual2048).toBe(0);
  });

  it('年収0・負の入力・NaNでも落ちない', () => {
    for (const income of [0, -1_000_000, Number.NaN]) {
      const r = calcBoei({ income, dependents: Number.NaN });
      expect(r.gross).toBe(0);
      expect(r.baseTax).toBe(0);
      expect(r.cumulative2038to2047).toBe(0);
    }
  });

  it('速算表の段差（課税所得195万円）をまたいでも基準所得税額は連続する', () => {
    expect(incomeTaxAmount(1_949_000)).toBe(97_450);
    expect(incomeTaxAmount(1_950_000)).toBe(97_500);
    expect(incomeTaxAmount(1_951_000)).toBe(97_600);
    // 年収を1万円ずつ上げても、防衛特別所得税は税率10%の傾き（1万円あたり数円）でしか増えない
    let prev = calcBoei({ income: 4_000_000, dependents: 0 }).defenseTax;
    for (let income = 4_010_000; income <= 5_500_000; income += 10_000) {
      const cur = calcBoei({ income, dependents: 0 }).defenseTax;
      expect(cur).toBeGreaterThanOrEqual(prev);
      expect(cur - prev).toBeLessThanOrEqual(30);
      prev = cur;
    }
  });

  it('扶養親族がいると基準所得税額が下がる（1人38万円）', () => {
    const none = calcBoei({ income: 6_000_000, dependents: 0 });
    const two = calcBoei({ income: 6_000_000, dependents: 2 });
    expect(two.dependentDeduction).toBe(760_000);
    expect(two.baseTax).toBeLessThan(none.baseTax);
    expect(two.defenseTax).toBeLessThan(none.defenseTax);
  });

  it('基準所得税額は住宅ローン控除（税額控除）を引いたあとの額（Q&A Q8）', () => {
    const plain = calcBoei({ income: 6_000_000, dependents: 0 });
    const partial = calcBoei({ income: 6_000_000, dependents: 0, housingLoanCredit: 50_000 });
    expect(partial.calculatedTax).toBe(plain.calculatedTax);
    expect(partial.taxCredit).toBe(50_000);
    expect(partial.baseTax).toBe(plain.baseTax - 50_000);
    expect(partial.defenseTax).toBe(Math.floor(partial.baseTax / 100));
    expect(partial.defenseTax).toBeLessThan(plain.defenseTax);
    // 基準の定義が同じなので、税額控除があっても差し引きゼロは崩れない
    expect(partial.change2027).toBe(0);
  });

  it('税額控除で基準所得税額がゼロになると、付加税もすべて0円', () => {
    const plain = calcBoei({ income: 5_000_000, dependents: 0 });
    const r = calcBoei({
      income: 5_000_000,
      dependents: 0,
      housingLoanCredit: plain.calculatedTax + 100_000,
    });
    // 所得税から引ききれない分は住民税に回るので、所得税側で使うのは算出所得税額まで
    expect(r.taxCredit).toBe(plain.calculatedTax);
    expect(r.baseTax).toBe(0);
    expect(r.defenseTax).toBe(0);
    expect(r.reconstructionAfter).toBe(0);
    expect(r.annual2038).toBe(0);
    expect(r.cumulative2038to2047).toBe(0);
    expect(r.annual2048).toBe(0);
  });

  it('令和9年分の控除は令和8年分と同じ（表示の年分だけが違う）', () => {
    expect(RULES_R9.label).toBe('令和9年分');
    expect(RULES_R9.basicDeduction).toBe(RULES_R8.basicDeduction);
    expect(RULES_R9.salaryDeduction).toBe(RULES_R8.salaryDeduction);
  });
});

describe('施行日またぎ（仕様 6）', () => {
  it('切替日は手取り計算機の源泉徴収税額表の切替日を参照する（日付を二重に持たない）', () => {
    expect(DEFENSE_EFFECTIVE_ON).toBe(WITHHOLDING_TABLE_EFFECTIVE_ON);
    expect(DEFENSE_EFFECTIVE_ON).toBe('2027-01-01');
  });

  it('2026-12-31 まではまだ始まっておらず、2027-01-01 から始まる', () => {
    expect(isDefenseTaxInEffect('2026-09-27')).toBe(false);
    expect(isDefenseTaxInEffect('2026-12-31')).toBe(false);
    expect(isDefenseTaxInEffect('2027-01-01')).toBe(true);
    expect(isDefenseTaxInEffect('2030-06-01')).toBe(true);
  });
});

describe('年収別の早見表', () => {
  it('仕様どおり300万〜1,500万円', () => {
    expect(TABLE_INCOMES[0]).toBe(3_000_000);
    expect(TABLE_INCOMES[TABLE_INCOMES.length - 1]).toBe(15_000_000);
    expect([...TABLE_INCOMES]).toEqual([...TABLE_INCOMES].sort((a, b) => a - b));
  });

  it('どの行も2027年の変化は0円、防衛特別所得税は年収とともに増える', () => {
    const rows = hayamihyo();
    expect(rows.map((r) => r.gross)).toEqual([...TABLE_INCOMES]);
    for (const [i, row] of rows.entries()) {
      expect(row.change2027).toBe(0);
      expect(row.defenseTax).toBeGreaterThan(0);
      expect(row.annual2038).toBeGreaterThan(row.defenseTax);
      if (i > 0) expect(row.defenseTax).toBeGreaterThan(rows[i - 1].defenseTax);
    }
  });

  it('年収500万円の行（スナップショット：控除・料率の改定で動いたら気づけるように）', () => {
    const row = hayamihyo().find((r) => r.gross === 5_000_000)!;
    expect(row).toEqual({
      gross: 5_000_000,
      defenseTax: 892,
      change2027: 0,
      annual2038: 1_873,
      annual2048: 892,
    });
  });
});
