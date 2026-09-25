import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FISCAL_YEARS } from '@/lib/kosodate-shienkin';
import {
  CONFIRMED_ROWS,
  CONFIRMED_YEAR,
  HAS_UNCONFIRMED_TREND,
  TABLE_MONTHLY_INCOMES,
  TOP_STANDARD_MONTHLY,
  TREND_MONTHLY_INCOME,
  TREND_ROWS,
} from '@/app/kosodate-shienkin/tables';
import {
  BONUS_CAP_YEARLY,
  GRADES,
  calcShienkin,
  roundPremium,
  standardMonthly,
} from '@/lib/kosodate-shienkin';

describe('standardMonthly（標準報酬月額の等級判定）', () => {
  it('等級表の境界値を正しく判定する', () => {
    expect(standardMonthly(0)).toBe(58_000); // 1等級
    expect(standardMonthly(62_999)).toBe(58_000);
    expect(standardMonthly(63_000)).toBe(68_000); // 2等級（下限は「以上」）
    expect(standardMonthly(194_999)).toBe(190_000); // 16等級
    expect(standardMonthly(195_000)).toBe(200_000); // 17等級
    expect(standardMonthly(300_000)).toBe(300_000); // 22等級
    expect(standardMonthly(310_000)).toBe(320_000); // 23等級
    expect(standardMonthly(1_354_999)).toBe(1_330_000); // 49等級
    expect(standardMonthly(1_355_000)).toBe(1_390_000); // 50等級（上限なし）
    expect(standardMonthly(10_000_000)).toBe(1_390_000);
  });

  it('等級表が連続している（隙間・重複がない）', () => {
    for (let i = 1; i < GRADES.length; i++) {
      expect(GRADES[i][2]).toBe(GRADES[i - 1][3]); // 前の上限 = 次の下限
    }
  });
});

describe('roundPremium（50銭以下切り捨て・50銭超切り上げ）', () => {
  it('端数処理のルールに従う', () => {
    expect(roundPremium(471.5)).toBe(471); // ちょうど50銭 → 切り捨て
    expect(roundPremium(471.51)).toBe(472); // 50銭超 → 切り上げ
    expect(roundPremium(471.49)).toBe(471);
    expect(roundPremium(345)).toBe(345);
  });
});

describe('calcShienkin（本人負担額）', () => {
  it('一次資料の例と一致する: 標準報酬月額30万円 → 2026年度 月345円', () => {
    // 300,000 × 0.23% ÷ 2 = 345円（こども家庭庁・給与計算各社の解説例と一致）
    const r = calcShienkin(300_000)[0];
    expect(r.fiscalYear).toBe(2026);
    expect(r.standardMonthly).toBe(300_000);
    expect(r.monthly).toBe(345);
    expect(r.bonus).toBe(0);
    expect(r.yearly).toBe(345 * 12);
  });

  it('一次資料の例と一致する: 標準報酬月額50万円 → 2026年度 月575円', () => {
    expect(calcShienkin(500_000)[0].monthly).toBe(575);
  });

  it('2028年度は0.4%（本人0.2%）で計算される: 標準報酬30万円 → 月600円', () => {
    const r = calcShienkin(300_000)[2];
    expect(r.fiscalYear).toBe(2028);
    expect(r.monthly).toBe(600);
  });

  it('賞与からも徴収される: 年間賞与100万円 → 2026年度 1,150円', () => {
    // 1,000,000 × 0.23% ÷ 2 = 1,150円
    const r = calcShienkin(300_000, 1_000_000)[0];
    expect(r.bonus).toBe(1_150);
    expect(r.yearly).toBe(345 * 12 + 1_150);
  });

  it('賞与は1,000円未満切り捨てで計算される', () => {
    const withFraction = calcShienkin(300_000, 1_000_999)[0];
    const without = calcShienkin(300_000, 1_000_000)[0];
    expect(withFraction.bonus).toBe(without.bonus);
  });

  it('賞与は年度上限573万円でキャップされる', () => {
    const capped = calcShienkin(300_000, 10_000_000)[0];
    const atCap = calcShienkin(300_000, BONUS_CAP_YEARLY)[0];
    expect(capped.bonus).toBe(atCap.bonus);
    // 5,730,000 × 0.23% ÷ 2 = 6,589.5 → 50銭ちょうど → 6,589円
    expect(capped.bonus).toBe(6_589);
  });

  it('負の入力は0として扱う', () => {
    const r = calcShienkin(-100, -100)[0];
    expect(r.standardMonthly).toBe(58_000); // 最低等級
    expect(r.bonus).toBe(0);
  });

  it('3年度分の結果を返し、負担は年々増える', () => {
    const rs = calcShienkin(400_000);
    expect(rs).toHaveLength(3);
    expect(rs[0].monthly).toBeLessThan(rs[1].monthly);
    expect(rs[1].monthly).toBeLessThan(rs[2].monthly);
  });
});

/**
 * 「年収別の負担額の早見表」「年度ごとの負担額の推移」
 * （docs/features/thin-tool-content.md）のテスト。
 *
 * 料率が未確定の年度を含むので、表の額が calcShienkin() の結果と一致すること、
 * 確定・未確定の区別が表に出ること、page.tsx が額を持たないことを見る。
 */
describe('負担額の早見表（本文）', () => {
  it('表Aは確定した年度を使う', () => {
    expect(CONFIRMED_YEAR.status).toBe('確定');
    // 確定年度が複数あるときは、最も新しいものを使う
    const confirmed = FISCAL_YEARS.filter((y) => y.status === '確定');
    expect(CONFIRMED_YEAR.fiscalYear).toBe(confirmed[confirmed.length - 1].fiscalYear);
  });

  it('表Aは4列に収まる行数（8行前後）', () => {
    expect(CONFIRMED_ROWS.length).toBeGreaterThanOrEqual(6);
    expect(CONFIRMED_ROWS.length).toBeLessThanOrEqual(10);
  });

  it('表Aの各行が calcShienkin() の結果と一致する', () => {
    expect(CONFIRMED_ROWS).toHaveLength(TABLE_MONTHLY_INCOMES.length);
    CONFIRMED_ROWS.forEach((row, i) => {
      const income = TABLE_MONTHLY_INCOMES[i];
      const expected = calcShienkin(income).find(
        (r) => r.fiscalYear === CONFIRMED_YEAR.fiscalYear,
      );
      expect(expected).toBeDefined();
      expect(row.yearlyIncome).toBe(income * 12);
      expect(row.standardMonthly).toBe(standardMonthly(income));
      expect(row.monthly).toBe(expected!.monthly);
      // 賞与なしなので年額は月額×12
      expect(row.yearly).toBe(expected!.monthly * 12);
    });
  });

  it('最高等級は GRADES から出す（表の最後の行を上限と書かないため）', () => {
    expect(TOP_STANDARD_MONTHLY).toBe(GRADES[GRADES.length - 1][1]);
    // 表は代表的な等級に絞っているので、最後の行は最高等級ではない
    const last = CONFIRMED_ROWS[CONFIRMED_ROWS.length - 1];
    expect(last.standardMonthly).toBeLessThan(TOP_STANDARD_MONTHLY);
  });

  it('表Bは年度の数だけ行があり、額は calcShienkin() と一致する', () => {
    expect(TREND_ROWS).toHaveLength(FISCAL_YEARS.length);
    const expected = calcShienkin(TREND_MONTHLY_INCOME);
    TREND_ROWS.forEach((row, i) => {
      expect(row.fiscalYear).toBe(expected[i].fiscalYear);
      expect(row.ratePercent).toBe(expected[i].ratePercent);
      expect(row.status).toBe(expected[i].status);
      expect(row.monthly).toBe(expected[i].monthly);
    });
  });

  it('未確定の年度があれば、表Bのセルに「見込み」「政府試算」が出て注記も出る', () => {
    const unconfirmed = TREND_ROWS.filter((r) => r.status !== '確定');
    expect(HAS_UNCONFIRMED_TREND).toBe(unconfirmed.length > 0);
    for (const row of unconfirmed) {
      expect(['見込み', '政府試算']).toContain(row.status);
    }
  });

  it('page.tsx は早見表の額を手で書いていない', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../app/kosodate-shienkin/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(source).toContain("from './tables'");
    // 行は map で描く（行を手で並べ直したら落ちる）
    expect(source).toContain('CONFIRMED_ROWS.map(');
    expect(source).toContain('TREND_ROWS.map(');
    // 3桁区切りになる額（誤検知しにくい形）が本文に書かれていないこと
    for (const n of [
      ...CONFIRMED_ROWS.map((r) => r.monthly),
      ...CONFIRMED_ROWS.map((r) => r.yearly),
      ...TREND_ROWS.map((r) => r.monthly),
    ]) {
      const formatted = n.toLocaleString('ja-JP');
      if (formatted.includes(',')) expect(source).not.toContain(formatted);
    }
    // 料率も FISCAL_YEARS から描画する（0.23% などを書かない）
    for (const row of TREND_ROWS) {
      expect(source).not.toContain(`${row.ratePercent.toFixed(2)}%`);
    }
  });
});
