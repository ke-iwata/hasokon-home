import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, type DateParts } from '@/lib/date-parts';
import { HOLIDAY_LAST_YEAR } from '@/lib/nissu-keisan';
import {
  applicability,
  closedReason,
  dayCount,
  daysForAfterN,
  freelanceApplies,
  holidayKnown,
  lateInterest,
  legalDueDate,
  longestCase,
  payDateFor,
  toritekiClause,
  worstCaseDays,
  END_OF_MONTH,
  type ApplicabilityInput,
} from '@/lib/shiharai-kijitsu';

/**
 * 支払期日・遅延利息 計算機のテスト。
 * 仕様: docs/features/shiharai-kijitsu-toriteki.md「確かめること」の表（#1〜#12）。
 * 期待値は条文（取適法第3条・第6条、規則第9号、フリーランス法第4条）から手で出したもの。
 */

const d = (iso: string): DateParts => parseDate(iso)!;
const iso = (p: DateParts) => formatDate(p);

describe('法律上の支払期日（受領日を1日目として60日目）', () => {
  it('#1 受領 2027-01-10 → 2027-03-10（＋59日）', () => {
    expect(iso(legalDueDate(d('2027-01-10')))).toBe('2027-03-10');
    expect(dayCount(d('2027-01-10'), d('2027-03-10'))).toBe(60);
  });

  it('#2 閏年：受領 2028-01-10 → 2028-03-09（2/29 を数える）', () => {
    expect(iso(legalDueDate(d('2028-01-10')))).toBe('2028-03-09');
  });

  it('受領日当日に払えば1日目', () => {
    expect(dayCount(d('2027-05-01'), d('2027-05-01'))).toBe(1);
  });
});

describe('休業日の注記', () => {
  it('祝日表の範囲内は祝日名を出す', () => {
    expect(closedReason(d('2027-01-01'))).toBe('元日');
  });

  it('土日', () => {
    expect(closedReason(d('2027-03-13'))).toBe('土曜');
    expect(closedReason(d('2027-03-14'))).toBe('日曜');
    expect(closedReason(d('2027-03-10'))).toBeNull();
  });

  it('祝日表の範囲外の年は土日だけで判定する', () => {
    const y = HOLIDAY_LAST_YEAR + 1;
    expect(holidayKnown(y)).toBe(false);
    // 元日は平日でも祝日として返さない（範囲外）
    const newYear = d(`${y}-01-01`);
    const r = closedReason(newYear);
    expect(r === null || r === '土曜' || r === '日曜').toBe(true);
  });
});

describe('支払条件のチェック（12か月）', () => {
  it('#3 末日締め・翌月末払い、2027年7月：7/1 → 8/31 で62日・超える', () => {
    const jul = worstCaseDays(END_OF_MONTH, 1, END_OF_MONTH, 2027)[6];
    expect(iso(jul.earliestDelivery)).toBe('2027-07-01');
    expect(iso(jul.latestDelivery)).toBe('2027-07-31');
    expect(iso(jul.payDate)).toBe('2027-08-31');
    expect(jul.maxDays).toBe(62);
    expect(jul.minDays).toBe(32);
    expect(jul.over60).toBe(true);
  });

  it('#4 末日締め・翌月末払い、2027年1月：1/1 → 2/28 で59日・超えない', () => {
    const jan = worstCaseDays(END_OF_MONTH, 1, END_OF_MONTH, 2027)[0];
    expect(iso(jan.earliestDelivery)).toBe('2027-01-01');
    expect(iso(jan.payDate)).toBe('2027-02-28');
    expect(jan.maxDays).toBe(59);
    expect(jan.over60).toBe(false);
  });

  it('#5 末日締め・翌々月末払い、2027年1月：1/1 → 3/31 で90日・超える', () => {
    const jan = worstCaseDays(END_OF_MONTH, 2, END_OF_MONTH, 2027)[0];
    expect(iso(jan.payDate)).toBe('2027-03-31');
    expect(jan.maxDays).toBe(90);
    expect(jan.over60).toBe(true);
  });

  it('#6 20日締め・翌月10日払い（2026〜2027年）：最長52日・全月超えない', () => {
    for (const year of [2026, 2027]) {
      const cases = worstCaseDays(20, 1, 10, year);
      expect(cases).toHaveLength(12);
      expect(cases.every((c) => !c.over60)).toBe(true);
      expect(longestCase(cases).maxDays).toBe(52);
    }
    // 締め期間が月をまたぐ：1月締めは前年12/21〜1/20
    const jan = worstCaseDays(20, 1, 10, 2027)[0];
    expect(iso(jan.earliestDelivery)).toBe('2026-12-21');
    expect(iso(jan.latestDelivery)).toBe('2027-01-20');
    expect(iso(jan.payDate)).toBe('2027-02-10');
  });

  it('末日締め・翌月末払いの最長は7月（62日）、12月も62日', () => {
    const cases = worstCaseDays(END_OF_MONTH, 1, END_OF_MONTH, 2027);
    expect(longestCase(cases).month).toBe(7);
    expect(cases[11].maxDays).toBe(62);
    expect(cases.filter((c) => c.over60).map((c) => c.month)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('翌々月の支払いは年をまたぐ（11月締め → 翌年1月払い）', () => {
    const nov = worstCaseDays(END_OF_MONTH, 2, END_OF_MONTH, 2027)[10];
    expect(iso(nov.payDate)).toBe('2028-01-31');
  });

  it('閏年の2月の末日締め', () => {
    const feb = worstCaseDays(END_OF_MONTH, 1, END_OF_MONTH, 2028)[1];
    expect(iso(feb.latestDelivery)).toBe('2028-02-29');
    expect(iso(feb.payDate)).toBe('2028-03-31');
    expect(feb.maxDays).toBe(60);
    expect(feb.over60).toBe(false);
  });

  it('納品日から支払日を出す（締め日を過ぎたら翌月の締め）', () => {
    expect(iso(payDateFor(d('2027-07-01'), END_OF_MONTH, 1, END_OF_MONTH))).toBe('2027-08-31');
    expect(iso(payDateFor(d('2027-01-20'), 20, 1, 10))).toBe('2027-02-10');
    expect(iso(payDateFor(d('2027-01-21'), 20, 1, 10))).toBe('2027-03-10');
    expect(iso(payDateFor(d('2027-12-25'), 20, 2, END_OF_MONTH))).toBe('2028-03-31');
  });

  it('締めなし：受領日から59日後なら60日目、60日後なら61日目', () => {
    expect(daysForAfterN(59)).toBe(60);
    expect(daysForAfterN(60)).toBe(61);
  });
});

describe('遅延利息（第6条第1項・年14.6%）', () => {
  it('#7 1,000,000円、受領 2027-01-10、支払 2027-03-31：3/11〜3/31 の21日・8,400円', () => {
    const r = lateInterest(1_000_000, d('2027-01-10'), d('2027-03-31'));
    expect(iso(r.fromDate)).toBe('2027-03-11');
    expect(r.days).toBe(21);
    expect(r.interest).toBe(8_400);
  });

  it('#8 60日目（3/10）の支払いは遅延でない：0円', () => {
    const r = lateInterest(1_000_000, d('2027-01-10'), d('2027-03-10'));
    expect(r.days).toBe(0);
    expect(r.interest).toBe(0);
  });

  it('61日目の支払いは1日分（円未満切り捨て）', () => {
    const r = lateInterest(1_000_000, d('2027-01-10'), d('2027-03-11'));
    expect(r.days).toBe(1);
    // 1,000,000 × 0.146 ÷ 365 = 400
    expect(r.interest).toBe(400);
    expect(lateInterest(100_000, d('2027-01-10'), d('2027-03-11')).interest).toBe(40);
    // 12,345 × 0.146 ÷ 365 = 4.938 → 4
    expect(lateInterest(12_345, d('2027-01-10'), d('2027-03-11')).interest).toBe(4);
  });

  it('大きな額でも誤差が出ない', () => {
    // 10億円 × 365日 × 14.6% = 1億4,600万円
    const r = lateInterest(1_000_000_000, d('2027-01-01'), d('2028-02-29'));
    expect(r.days).toBe(365);
    expect(r.interest).toBe(146_000_000);
  });

  it('0円・負の額は0円', () => {
    expect(lateInterest(0, d('2027-01-10'), d('2027-03-31')).interest).toBe(0);
    expect(lateInterest(-5, d('2027-01-10'), d('2027-03-31')).interest).toBe(0);
  });
});

describe('適用の判定', () => {
  const base: ApplicabilityInput = {
    ordererCapital: 0,
    ordererEmployees: 0,
    contractorCapital: 0,
    contractorEmployees: 0,
    contractorType: 'corp',
    kind: 'other',
  };

  it('#9 資本金基準：発注 5千万円・120人、受注 1千万円・20人、政令以外の役務 → 取適法 第2条第8項第4号', () => {
    const input = {
      ...base,
      ordererCapital: 50_000_000,
      ordererEmployees: 120,
      contractorCapital: 10_000_000,
      contractorEmployees: 20,
    };
    const r = applicability(input);
    expect(r.verdict).toBe('toriteki');
    expect(r.toritekiClause).toBe(4);
    expect(r.lateInterestApplies).toBe(true);
  });

  it('#10 従業員基準：発注 1千万円・150人、受注 2千万円・50人、役務 → 第6号', () => {
    const r = applicability({
      ...base,
      ordererCapital: 10_000_000,
      ordererEmployees: 150,
      contractorCapital: 20_000_000,
      contractorEmployees: 50,
    });
    expect(r.verdict).toBe('toriteki');
    expect(r.toritekiClause).toBe(6);
  });

  it('#11 発注 1千万円・5人、受注 個人・従業員なし → 取適法は対象外／フリーランス法', () => {
    const r = applicability({
      ...base,
      ordererCapital: 10_000_000,
      ordererEmployees: 5,
      contractorType: 'individual',
    });
    expect(r.verdict).toBe('freelance');
    expect(r.toritekiClause).toBeNull();
    expect(r.lateInterestApplies).toBe(false);
  });

  it('#12 発注 5千万円・30人、受注 個人・従業員なし、政令以外の役務 → 両方（第4号＋フリーランス法）。遅延利息は取適法で', () => {
    const r = applicability({
      ...base,
      ordererCapital: 50_000_000,
      ordererEmployees: 30,
      contractorType: 'individual',
    });
    expect(r.verdict).toBe('both');
    expect(r.toritekiClause).toBe(4);
    expect(r.freelance).toBe(true);
    expect(r.lateInterestApplies).toBe(true);
  });

  it('製造委託等の資本金基準：3億円超 → 第1号、1千万円超〜3億円 → 第2号', () => {
    const m = { ...base, kind: 'manufacture' as const, contractorEmployees: 10 };
    expect(toritekiClause({ ...m, ordererCapital: 300_000_001, contractorCapital: 300_000_000 })).toBe(1);
    expect(toritekiClause({ ...m, ordererCapital: 300_000_000, contractorCapital: 10_000_000 })).toBe(2);
    expect(toritekiClause({ ...m, ordererCapital: 300_000_000, contractorCapital: 10_000_001 })).toBeNull();
    expect(toritekiClause({ ...m, ordererCapital: 10_000_000, contractorCapital: 0 })).toBeNull();
  });

  it('政令で定める役務・特定運送委託は製造委託等と同じ区分', () => {
    for (const kind of ['designated', 'transport'] as const) {
      expect(toritekiClause({ ...base, kind, ordererCapital: 100_000_000, contractorCapital: 10_000_000 })).toBe(2);
      expect(toritekiClause({ ...base, kind, ordererEmployees: 301, contractorEmployees: 300 })).toBe(5);
      expect(toritekiClause({ ...base, kind, ordererEmployees: 300, contractorEmployees: 10 })).toBeNull();
    }
  });

  it('それ以外の役務：5千万円超 → 第3号', () => {
    expect(toritekiClause({ ...base, ordererCapital: 50_000_001, contractorCapital: 50_000_000 })).toBe(3);
    expect(toritekiClause({ ...base, ordererEmployees: 101, contractorEmployees: 101 })).toBeNull();
  });

  it('フリーランス法：受注側に従業員がいる・役員2人以上の法人・発注側に従業員がいない、はかからない', () => {
    const f = { ...base, ordererEmployees: 3, contractorType: 'individual' as const };
    expect(freelanceApplies(f)).toBe(true);
    expect(freelanceApplies({ ...f, contractorType: 'soloCorp' })).toBe(true);
    expect(freelanceApplies({ ...f, contractorType: 'corp' })).toBe(false);
    expect(freelanceApplies({ ...f, contractorEmployees: 1 })).toBe(false);
    expect(freelanceApplies({ ...f, ordererEmployees: 0 })).toBe(false);
  });

  it('どちらも対象外', () => {
    expect(applicability({ ...base, ordererCapital: 5_000_000, ordererEmployees: 0, contractorType: 'individual' }).verdict).toBe(
      'none',
    );
  });
});
