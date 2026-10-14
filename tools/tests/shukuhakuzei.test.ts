import { describe, expect, it, test } from 'vitest';
import { tools } from '@/lib/registry';
import {
  AREAS,
  DATA_CHECKED_AT,
  OKINAWA_SPLIT_CONFIRMED,
  TOKYO_RATE_DETAILS_CONFIRMED,
  addDaysYmd,
  areaById,
  describeRule,
  isYmd,
  quickTable,
  revisionCompare,
  taxPerNight,
  totalTax,
} from '@/lib/shukuhakuzei';

const tokyo = areaById('tokyo');
const okinawa = areaById('okinawa');
const kyoto = areaById('kyoto');
const osaka = areaById('osaka');

const tax = (area: typeof tokyo, price: number, date: string) => taxPerNight(area, price, date)!.tax;

describe('東京都', () => {
  it('現行の区分（2027-03-31 まで）', () => {
    expect([9_999, 10_000, 14_999, 15_000].map((p) => tax(tokyo, p, '2027-03-31'))).toEqual([
      0, 100, 100, 200,
    ]);
  });

  it('改正後の崖：12,999 円は非課税、13,000 円は 390 円', () => {
    expect(tax(tokyo, 12_999, '2027-04-01')).toBe(0);
    expect(tax(tokyo, 13_000, '2027-04-01')).toBe(390);
    expect(taxPerNight(tokyo, 12_999, '2027-04-01')!.note).toEqual({
      kind: 'exempt-below',
      threshold: 13_000,
    });
  });

  it('12,000 円は改正で 100 円 → 0 円（差 −100）', () => {
    expect(tax(tokyo, 12_000, '2027-03-31')).toBe(100);
    expect(tax(tokyo, 12_000, '2027-04-01')).toBe(0);
    expect(revisionCompare(tokyo, 12_000, '2027-03-31')).toEqual({
      kind: 'after',
      from: '2027-04-01',
      tax: 0,
      diff: -100,
      newlyIntroduced: false,
    });
    expect(revisionCompare(tokyo, 12_000, '2027-04-01')).toMatchObject({
      kind: 'before',
      until: '2027-03-31',
      tax: 100,
      diff: -100,
    });
  });

  it('仕様書の代表値の表', () => {
    expect([9_000, 12_000, 13_000, 20_000, 50_000].map((p) => tax(tokyo, p, '2027-04-01'))).toEqual(
      [0, 0, 390, 600, 1_500],
    );
  });

  it('境目をまたぐ連泊：2027-03-31 から 2 泊・20,000 円は 200 ＋ 600 = 800 円', () => {
    const r = totalTax(tokyo, 20_000, 1, '2027-03-31', 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nights.map((n) => n.tax)).toEqual([200, 600]);
    expect(r.total).toBe(800);
    expect(r.uniformPerNight).toBeNull();
  });

  it('人数・泊数：20,000 円、2 人 × 3 泊（改正後）は 3,600 円', () => {
    const r = totalTax(tokyo, 20_000, 2, '2027-04-01', 3);
    expect(r.ok && r.total).toBe(3_600);
    expect(r.ok && r.uniformPerNight).toBe(600);
  });

  // 端数処理（料金・税額の切り捨て単位）と上限は、主税局のページ・報道発表に書かれていない。
  // 改正条例か「宿泊税の手引き（改正条例対応版）」で確認したら、値を入れて本テストにする
  test.todo('東京 3% の端数処理・上限（条例確認後に値を入れる）');
});

describe('沖縄県', () => {
  it('施行前（2027-01-31）は 0 円で「2027-02-01 から」', () => {
    const r = taxPerNight(okinawa, 30_000, '2027-01-31')!;
    expect(r.tax).toBe(0);
    expect(r.note).toEqual({ kind: 'not-yet', from: '2027-02-01' });
  });

  it('施行前でも 2 行目に施行後の額を出す（30,000 円 → 600 円）', () => {
    expect(revisionCompare(okinawa, 30_000, '2027-01-31')).toEqual({
      kind: 'after',
      from: '2027-02-01',
      tax: 600,
      diff: 600,
      newlyIntroduced: true,
    });
  });

  it('施行後は「新設」として前の期間を示す', () => {
    expect(revisionCompare(okinawa, 30_000, '2027-02-01')).toMatchObject({
      kind: 'before',
      newlyIntroduced: true,
    });
  });

  it('料金を 1,000 円未満切り捨て：12,345 円 → 240 円', () => {
    expect(tax(okinawa, 12_345, '2027-02-01')).toBe(240);
  });

  it('上限 2,000 円：150,000 円 → 2,000 円', () => {
    const r = taxPerNight(okinawa, 150_000, '2027-02-01')!;
    expect(r.tax).toBe(2_000);
    expect(r.note).toEqual({ kind: 'cap', cap: 2_000 });
    expect(tax(okinawa, 99_999, '2027-02-01')).toBe(1_980);
    expect(tax(okinawa, 100_000, '2027-02-01')).toBe(2_000);
  });

  it('1/31〜2/1 の連泊は 1/31 泊が対象外', () => {
    const r = totalTax(okinawa, 30_000, 1, '2027-01-31', 2);
    expect(r.ok && r.nights.map((n) => n.tax)).toEqual([0, 600]);
  });

  it('併課の注記を 1 行持つ', () => {
    expect(okinawa.notes.join('')).toContain('県分と市町村分');
  });
});

describe('京都市・大阪府', () => {
  it('京都・区分の境', () => {
    expect(
      [5_999, 6_000, 19_999, 20_000, 49_999, 50_000, 99_999, 100_000].map((p) =>
        tax(kyoto, p, '2026-10-13'),
      ),
    ).toEqual([200, 400, 400, 1_000, 1_000, 4_000, 4_000, 10_000]);
  });

  it('大阪・免税点', () => {
    expect([4_999, 5_000, 14_999, 15_000, 19_999, 20_000].map((p) => tax(osaka, p, '2026-10-13'))).toEqual(
      [0, 200, 200, 400, 400, 500],
    );
  });

  it('改正の予定が無い自治体は 2 行目を出さない', () => {
    expect(revisionCompare(kyoto, 20_000, '2026-10-13')).toBeNull();
    expect(revisionCompare(osaka, 20_000, '2026-10-13')).toBeNull();
  });

  it('データより前の宿泊日はエラー', () => {
    const r = totalTax(kyoto, 20_000, 1, '2026-02-28', 1);
    expect(r.ok).toBe(false);
  });
});

describe('入力エラー', () => {
  it.each([
    ['料金 0', 0, 1, 1, '2027-04-01'],
    ['料金 負', -1, 1, 1, '2027-04-01'],
    ['料金 小数', 1000.5, 1, 1, '2027-04-01'],
    ['人数 0', 20_000, 0, 1, '2027-04-01'],
    ['泊数 0', 20_000, 1, 0, '2027-04-01'],
    ['泊数 31', 20_000, 1, 31, '2027-04-01'],
    ['日付なし', 20_000, 1, 1, ''],
    ['実在しない日付', 20_000, 1, 1, '2027-02-30'],
  ])('%s', (_label, price, people, nights, date) => {
    const r = totalTax(tokyo, price, people, date, nights);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });
});

describe('データの形', () => {
  it('確認日は YYYY-MM-DD の形（古さは見ない）', () => {
    expect(DATA_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isYmd(DATA_CHECKED_AT)).toBe(true);
  });

  it.each(AREAS.map((a) => [a.name, a] as const))('%s：期間が隙間なく昇順で、最後は to = null', (_n, a) => {
    a.periods.forEach((p, i) => {
      expect(isYmd(p.from)).toBe(true);
      const next = a.periods[i + 1];
      if (next) expect(addDaysYmd(p.to!, 1)).toBe(next.from);
      else expect(p.to).toBeNull();
      if (p.rule.kind !== 'none') expect(p.source).toMatch(/^https:\/\//);
    });
  });

  it('早見表は境目の前後を含み、料金の昇順', () => {
    const t = quickTable(tokyo);
    const prices = t.rows.map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices).toEqual(expect.arrayContaining([12_999, 13_000, 9_999, 10_000, 14_999, 15_000]));
    expect(t.columns).toHaveLength(2);
    const row = t.rows.find((r) => r.price === 13_000)!;
    expect(row.taxes).toEqual([100, 390]);
    expect(quickTable(okinawa).rows.map((r) => r.price)).toContain(100_000);
  });

  it('税率の説明はデータから作る', () => {
    expect(describeRule(okinawa.periods[1].rule)).toBe(
      '宿泊料金の2%（料金の1,000円未満切り捨て）／上限2,000円',
    );
    expect(describeRule(osaka.periods[0].rule)).toContain('5,000円未満 非課税');
  });
});

describe('公開条件（仕様書の「公開条件」）', () => {
  const stage = tools.find((t) => t.slug === 'shukuhakuzei')?.stage;

  it('東京 3% の端数処理・上限を確認するまで public にしない', () => {
    if (stage === 'public') expect(TOKYO_RATE_DETAILS_CONFIRMED).toBe(true);
  });

  it('沖縄の県＋市町村の内訳を確認するまで public にしない', () => {
    if (stage === 'public') expect(OKINAWA_SPLIT_CONFIRMED).toBe(true);
  });
});
