import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/furusato-nozei/page';
import {
  calcFurusato,
  DEFAULT_TAX_YEAR,
  hayamihyo,
  hayamihyoInput,
  HAYAMIHYO_FAMILIES,
  SPECIAL_CAP_FIXED,
  showTaxYearSelector,
  specialCapFor,
  TAX_YEAR_SELECTOR_UNTIL,
  TAX_YEARS,
  taxYearLabel,
  type TaxYear,
} from '@/lib/furusato-nozei';

/**
 * ふるさと納税の年分（令和8年分 → 令和9年分）の切り替えと、令和9年分から加わる
 * 特例分の193万円の定額上限を見張る。
 *
 * 仕様: docs/features/furusato-nozei-r9-kirikae.md
 */

/** 実行環境のローカル日付 'YYYY-MM-DD'（post-effective-copy.test.ts と同じ判定） */
function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const single = HAYAMIHYO_FAMILIES.find((f) => f.id === 'single')!;
const singleInput = (income: number, donation = 0) => ({
  ...hayamihyoInput(income, single),
  donation,
});

describe('年分の切り替えの見張り（CI）', () => {
  it('年が明けたら DEFAULT_TAX_YEAR を上げる', () => {
    // 元日以降は関係のない PR の CI も赤くなるので、メッセージに直し方を書いておく
    const year = Number(todayYmd().slice(0, 4));
    expect(
      DEFAULT_TAX_YEAR >= year || !TAX_YEARS.includes(year as TaxYear),
      `${year}年になりました。tools/lib/furusato-nozei.ts の DEFAULT_TAX_YEAR を ${year} に1行上げ、` +
        `app/furusato-nozei/page.tsx の title／description の「令和N年分」を「${taxYearLabel(year as TaxYear)}」に直せば通ります` +
        '（docs/features/furusato-nozei-r9-kirikae.md を参照。本番への反映はリリースで行う）',
    ).toBe(true);
  });

  it('計算できない年になったら年分を足す', () => {
    // TAX_YEARS に無い年になったときは、上のテストでは拾えないのでここで落とす
    const year = Number(todayYmd().slice(0, 4));
    expect(
      Math.max(...TAX_YEARS),
      `${year}年分を計算できません。TAX_YEARS と SPECIAL_CAP_FIXED に ${year} を足し、制度データを確かめてください`,
    ).toBeGreaterThanOrEqual(year);
  });

  it('metadata の title／description の「令和N年分」が DEFAULT_TAX_YEAR と一致する', () => {
    const label = taxYearLabel(DEFAULT_TAX_YEAR);
    for (const [name, text] of [
      ['title', String(metadata.title)],
      ['description', String(metadata.description)],
    ]) {
      const found = text.match(/令和\d+年分/g) ?? [];
      expect(found.length, `${name} に「令和N年分」がない`).toBeGreaterThan(0);
      for (const f of found) {
        expect(f, `${name} の年分が DEFAULT_TAX_YEAR（${label}）とずれている`).toBe(label);
      }
    }
  });

  it('DEFAULT_TAX_YEAR は計算できる年分のどれか', () => {
    expect(TAX_YEARS).toContain(DEFAULT_TAX_YEAR);
    for (const y of TAX_YEARS) expect(SPECIAL_CAP_FIXED).toHaveProperty(String(y));
  });
});

describe('年分の表記', () => {
  it('西暦から令和の年分を出す', () => {
    expect(taxYearLabel(2026)).toBe('令和8年分');
    expect(taxYearLabel(2027)).toBe('令和9年分');
  });

  it('年分の切り替えは確定申告の期限（2027-03-15）まで出す', () => {
    expect(TAX_YEAR_SELECTOR_UNTIL).toBe('2027-03-15');
    expect(showTaxYearSelector('2026-12-01')).toBe(true);
    expect(showTaxYearSelector('2027-03-15')).toBe(true);
    expect(showTaxYearSelector('2027-03-16')).toBe(false);
  });
});

describe('特例分の193万円の定額上限（令和9年分から）', () => {
  it('令和8年分には定額上限がなく、令和9年分は193万円', () => {
    expect(SPECIAL_CAP_FIXED[2026]).toBeNull();
    expect(SPECIAL_CAP_FIXED[2027]).toBe(1_930_000);
  });

  it('所得割の20%と193万円の小さいほうが上限になる', () => {
    expect(specialCapFor(5_000_000, 2027)).toEqual({ cap: 1_000_000, kind: 'rate' });
    expect(specialCapFor(10_000_000, 2027)).toEqual({ cap: 1_930_000, kind: 'fixed' });
    // ちょうど同額なら所得割の20%として扱う
    expect(specialCapFor(9_650_000, 2027)).toEqual({ cap: 1_930_000, kind: 'rate' });
    expect(specialCapFor(10_000_000, 2026)).toEqual({ cap: 2_000_000, kind: 'rate' });
  });

  it('令和9年分・給与1億2,000万円・独身 → 特例分が1,930,000円で頭打ち、警告は「193万円の上限」', () => {
    const r = calcFurusato(singleInput(120_000_000, 6_000_000), { taxYear: 2027 });
    expect(r.taxYear).toBe(2027);
    expect(r.specialCapKind).toBe('fixed');
    expect(r.specialCap).toBe(1_930_000);
    expect(r.breakdown.specialCapped).toBe(true);
    expect(r.breakdown.specialCapKind).toBe('fixed');
    expect(r.breakdown.residentSpecial).toBe(1_930_000);
    // 上限を超えた分は自己負担になる
    expect(r.breakdown.outOfPocket).toBeGreaterThan(2_100);
  });

  it('令和9年分の上限額は、特例分が193万円に達する寄付額で頭打ちになる', () => {
    const r = calcFurusato(singleInput(120_000_000), { taxYear: 2027 });
    // 所得税率45%：193万円 ÷（90% − 45% × 1.021）+ 2,000円
    expect(r.incomeTax.rate).toBe(0.45);
    expect(r.limit).toBe(Math.floor(1_930_000 / (0.9 - 0.45 * 1.021) + 2_000));
    // 総務省の資料の「438万円を寄附した場合の特例控除額が193万円」と同じ規模
    expect(Math.round(r.limit / 10_000)).toBe(438);
    // 上限額ちょうどの寄付なら自己負担は2,000円で収まる（端数を含む）
    expect(r.breakdown.specialCapped).toBe(false);
    expect(r.breakdown.outOfPocket).toBeLessThanOrEqual(2_100);
  });

  it('令和8年分・同じ入力 → 193万円の上限はかからない', () => {
    const r8 = calcFurusato(singleInput(120_000_000, 6_000_000), { taxYear: 2026 });
    expect(r8.specialCapKind).toBe('rate');
    expect(r8.specialCap).toBe(Math.floor(r8.residentTax.incomeLevy * 0.2));
    expect(r8.breakdown.residentSpecial).toBeGreaterThan(1_930_000);
    // 年分を省略すると DEFAULT_TAX_YEAR（いまは令和8年分）で計算する
    expect(calcFurusato(singleInput(120_000_000, 6_000_000))).toEqual(
      calcFurusato(singleInput(120_000_000, 6_000_000), { taxYear: DEFAULT_TAX_YEAR }),
    );
    const r9 = calcFurusato(singleInput(120_000_000), { taxYear: 2027 });
    expect(calcFurusato(singleInput(120_000_000), { taxYear: 2026 }).limit).toBeGreaterThan(r9.limit);
  });

  it('令和9年分・給与500万円・独身 → 上限額は令和8年分と同じ', () => {
    const r8 = calcFurusato(singleInput(5_000_000), { taxYear: 2026 });
    const r9 = calcFurusato(singleInput(5_000_000), { taxYear: 2027 });
    expect(r9.limit).toBe(r8.limit);
    expect(r9.breakdown).toEqual(r8.breakdown);
  });

  it('早見表の範囲（年収1,500万円まで）では、令和9年分も令和8年分と同じ額', () => {
    expect(hayamihyo(2027)).toEqual(hayamihyo(2026));
  });
});
