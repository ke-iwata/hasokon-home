import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, daysBetween } from '@/lib/date-parts';
import {
  AFTER_DAYS,
  BEFORE_DAYS_MULTIPLE,
  BEFORE_DAYS_SINGLE,
  DATA_CHECKED_AT,
  LUMP_SUM_PER_CHILD,
  LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION,
  REFORM,
  SHORT_TENURE_CAP,
  calcShussanTeate,
  type ShussanTeateInput,
} from '@/lib/shussan-teate';

/** テストの読みやすさのための薄いラッパ（'YYYY-MM-DD' で渡す） */
function calc(input: Omit<ShussanTeateInput, 'dueDate' | 'birthDate'> & { dueDate: string; birthDate?: string }) {
  const r = calcShussanTeate({
    ...input,
    dueDate: parseDate(input.dueDate)!,
    birthDate: input.birthDate === undefined ? undefined : parseDate(input.birthDate)!,
  });
  return r!;
}

const BASE = { dueDate: '2026-10-01', monthlyIncome: 300_000 };

describe('支給期間（産前42日・産後56日）', () => {
  it('予定日どおりに生まれた場合: 産前42日＋産後56日＝98日', () => {
    const r = calc(BASE);
    expect(r.beforeDays).toBe(42);
    expect(r.afterDays).toBe(56);
    expect(r.totalDays).toBe(98);
    // 起算日を含めて数えるので 開始日 = 出産日 − 41
    expect(formatDate(r.startDate)).toBe('2026-08-21');
    expect(formatDate(r.endDate)).toBe('2026-11-26');
    expect(r.overdueDays).toBe(0);
    expect(r.earlyDays).toBe(0);
  });

  it('予定日より5日遅れた場合: 遅れた分も産前に足され、47日＋56日＝103日', () => {
    const r = calc({ ...BASE, birthDate: '2026-10-06' });
    expect(r.overdueDays).toBe(5);
    expect(r.beforeDays).toBe(47);
    expect(r.totalDays).toBe(103);
    // 産前の起点は予定日のままなので開始日はずれない
    expect(formatDate(r.startDate)).toBe('2026-08-21');
    // 産後は実際の出産日の翌日から56日
    expect(formatDate(r.endDate)).toBe('2026-12-01');
  });

  it('予定日より5日早い場合: 産前は42日のまま、開始日が5日前にずれる', () => {
    const r = calc({ ...BASE, birthDate: '2026-09-26' });
    expect(r.earlyDays).toBe(5);
    expect(r.overdueDays).toBe(0);
    expect(r.beforeDays).toBe(42);
    expect(r.totalDays).toBe(98);
    expect(formatDate(r.startDate)).toBe('2026-08-16');
    expect(formatDate(r.endDate)).toBe('2026-11-21');
  });

  it('多胎妊娠は産前98日（予定日どおりなら合計154日）', () => {
    const r = calc({ ...BASE, fetusCount: 2 });
    expect(r.multiple).toBe(true);
    expect(r.beforeDays).toBe(BEFORE_DAYS_MULTIPLE);
    expect(r.totalDays).toBe(BEFORE_DAYS_MULTIPLE + AFTER_DAYS);
    expect(formatDate(r.startDate)).toBe('2026-06-26');
    expect(formatDate(r.endDate)).toBe('2026-11-26');
  });

  it('多胎で予定日より遅れた場合も遅れた分が産前に足される', () => {
    const r = calc({ ...BASE, birthDate: '2026-10-11', fetusCount: 3 });
    expect(r.beforeDays).toBe(BEFORE_DAYS_MULTIPLE + 10);
    expect(r.totalDays).toBe(BEFORE_DAYS_MULTIPLE + 10 + AFTER_DAYS);
  });

  it('開始日から終了日までの暦日数と支給日数が一致する（数え方の整合）', () => {
    for (const birthDate of ['2026-09-20', '2026-10-01', '2026-10-15']) {
      for (const fetusCount of [1, 2]) {
        const r = calc({ ...BASE, birthDate, fetusCount });
        expect(daysBetween(r.startDate, r.endDate) + 1).toBe(r.totalDays);
      }
    }
  });

  it('産後56日の翌日が育児休業の開始日になる', () => {
    const r = calc(BASE);
    expect(formatDate(r.childcareLeaveFrom)).toBe('2026-11-27');
    expect(daysBetween(r.endDate, r.childcareLeaveFrom)).toBe(1);
  });

  it('実際の出産日を省略すると予定日で計算し、省略したことを返す', () => {
    expect(calc(BASE).birthDateGiven).toBe(false);
    expect(formatDate(calc(BASE).birthDate)).toBe('2026-10-01');
    expect(calc({ ...BASE, birthDate: '2026-10-01' }).birthDateGiven).toBe(true);
  });
});

describe('支給期間（月末・うるう年をまたぐ日付）', () => {
  it('うるう年の2月をまたいでも産前は42日', () => {
    // 2028年はうるう年（2月29日まである）
    const r = calc({ ...BASE, dueDate: '2028-03-01' });
    expect(formatDate(r.startDate)).toBe('2028-01-20');
    expect(daysBetween(r.startDate, parseDate('2028-03-01')!) + 1).toBe(BEFORE_DAYS_SINGLE);
  });

  it('平年の2月をまたぐと開始日が1日前になる（2月が1日短いぶん遡る）', () => {
    const r = calc({ ...BASE, dueDate: '2027-03-01' });
    expect(formatDate(r.startDate)).toBe('2027-01-19');
    expect(daysBetween(r.startDate, parseDate('2027-03-01')!) + 1).toBe(BEFORE_DAYS_SINGLE);
  });

  it('年をまたぐ場合（1月1日出産）', () => {
    const r = calc({ ...BASE, dueDate: '2027-01-01' });
    expect(formatDate(r.startDate)).toBe('2026-11-21');
    expect(formatDate(r.endDate)).toBe('2027-02-26');
  });

  it('月末（12月31日）出産でも産後は56日', () => {
    const r = calc({ ...BASE, dueDate: '2026-12-31' });
    expect(daysBetween(parseDate('2026-12-31')!, r.endDate)).toBe(AFTER_DAYS);
    expect(formatDate(r.endDate)).toBe('2027-02-25');
  });
});

describe('出産手当金の額', () => {
  it('協会けんぽの計算例: 標準報酬月額30万円 → 日額6,667円 → 98日で653,366円', () => {
    const r = calc(BASE);
    expect(r.standardDaily).toBe(10_000);
    expect(r.dailyAmount).toBe(6_667);
    expect(r.allowanceTotal).toBe(653_366);
  });

  it('多胎は日数が増えた分だけ総額が増える', () => {
    const r = calc({ ...BASE, fetusCount: 2 });
    expect(r.allowanceTotal).toBe(6_667 * 154);
  });

  it('被保険者期間12ヶ月未満は標準報酬月額32万円が上限', () => {
    const r = calc({ ...BASE, monthlyIncome: 800_000, under12Months: true });
    expect(r.capped).toBe(true);
    expect(r.standardMonthly).toBe(SHORT_TENURE_CAP);
    expect(r.dailyAmount).toBe(7_113);
  });

  it('12ヶ月未満でも上限より低い月収なら上限は当たらない', () => {
    const r = calc({ ...BASE, monthlyIncome: 200_000, under12Months: true });
    expect(r.capped).toBe(false);
    expect(r.dailyAmount).toBe(4_447);
  });
});

describe('給与が出る場合の差額支給', () => {
  it('給与日額が手当金の日額より少なければ差額が支給される', () => {
    // 月給15万円 → 給与日額5,000円。6,667 − 5,000 = 1,667円
    const r = calc({ ...BASE, salaryDuringLeave: 150_000 });
    expect(r.salaryDaily).toBe(5_000);
    expect(r.payableDaily).toBe(1_667);
    expect(r.salaryAdjusted).toBe(true);
    expect(r.fullyOffset).toBe(false);
    expect(r.allowanceTotal).toBe(1_667 * 98);
  });

  it('給与日額が手当金の日額以上なら支給されない（0円）', () => {
    const r = calc({ ...BASE, salaryDuringLeave: 300_000 });
    expect(r.payableDaily).toBe(0);
    expect(r.allowanceTotal).toBe(0);
    expect(r.fullyOffset).toBe(true);
  });

  it('ちょうど同額でも支給されない', () => {
    // 日額6,667円 ＝ 給与日額6,667円（月額200,010円）
    const r = calc({ ...BASE, salaryDuringLeave: 200_010 });
    expect(r.salaryDaily).toBe(6_667);
    expect(r.payableDaily).toBe(0);
    expect(r.fullyOffset).toBe(true);
  });

  it('給与0円なら調整しない', () => {
    const r = calc({ ...BASE, salaryDuringLeave: 0 });
    expect(r.salaryAdjusted).toBe(false);
    expect(r.payableDaily).toBe(r.dailyAmount);
  });

  it('給与が出ても出産育児一時金は減らない', () => {
    const r = calc({ ...BASE, salaryDuringLeave: 300_000 });
    expect(r.lumpSumTotal).toBe(LUMP_SUM_PER_CHILD);
    expect(r.total).toBe(LUMP_SUM_PER_CHILD);
  });
});

describe('出産育児一時金', () => {
  it('産科医療補償制度に加入する医療機関なら1児50万円', () => {
    const r = calc(BASE);
    expect(r.lumpSumPerChild).toBe(LUMP_SUM_PER_CHILD);
    expect(r.lumpSumTotal).toBe(500_000);
  });

  it('制度未加入の医療機関・妊娠22週未満は48.8万円', () => {
    const r = calc({ ...BASE, obstetricCompensation: false });
    expect(r.lumpSumPerChild).toBe(LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION);
    expect(r.lumpSumTotal).toBe(488_000);
  });

  it('双子は胎児数分（100万円）', () => {
    expect(calc({ ...BASE, fetusCount: 2 }).lumpSumTotal).toBe(1_000_000);
  });

  it('三つ子は150万円、制度未加入なら146.4万円', () => {
    expect(calc({ ...BASE, fetusCount: 3 }).lumpSumTotal).toBe(1_500_000);
    expect(calc({ ...BASE, fetusCount: 3, obstetricCompensation: false }).lumpSumTotal).toBe(1_464_000);
  });

  it('合計は出産手当金＋出産育児一時金', () => {
    const r = calc(BASE);
    expect(r.total).toBe(r.allowanceTotal + r.lumpSumTotal);
    expect(r.total).toBe(653_366 + 500_000);
  });
});

describe('入力の扱い', () => {
  it('胎児数は1未満にならない（0や負数は単胎として扱う）', () => {
    for (const fetusCount of [0, -1, 0.5]) {
      const r = calc({ ...BASE, fetusCount });
      expect(r.fetusCount).toBe(1);
      expect(r.multiple).toBe(false);
    }
  });

  it('マイナスの月収・給与は0として扱う', () => {
    const r = calc({ ...BASE, monthlyIncome: -300_000, salaryDuringLeave: -100_000 });
    expect(r.dailyAmount).toBe(calc({ ...BASE, monthlyIncome: 0 }).dailyAmount);
    expect(r.salaryDaily).toBe(0);
  });

  it('予定日と出産日が1年以上離れている入力は計算しない（打ち間違い）', () => {
    expect(
      calcShussanTeate({
        dueDate: parseDate('2026-10-01')!,
        birthDate: parseDate('2027-10-02')!,
        monthlyIncome: 300_000,
      }),
    ).toBeNull();
  });

  it('1年ちょうどの差は受け付ける（境界）', () => {
    expect(
      calcShussanTeate({
        dueDate: parseDate('2026-10-01')!,
        birthDate: parseDate('2027-10-01')!,
        monthlyIncome: 300_000,
      }),
    ).not.toBeNull();
  });
});

describe('制度データ（【データ更新箇所】が腐っていないこと）', () => {
  it('日数は法定どおり', () => {
    expect(BEFORE_DAYS_SINGLE).toBe(42);
    expect(BEFORE_DAYS_MULTIPLE).toBe(98);
    expect(AFTER_DAYS).toBe(56);
  });

  it('一時金は加入機関50万円 > 未加入48.8万円', () => {
    expect(LUMP_SUM_PER_CHILD).toBe(500_000);
    expect(LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION).toBe(488_000);
    expect(LUMP_SUM_PER_CHILD).toBeGreaterThan(LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION);
  });

  /**
   * 無償化の改正法は**公布済みだが施行日は政令待ち**。
   * 一次資料で確認できていない法律番号を勝手に埋めない（null のままなら画面に出さない）。
   */
  it('無償化の改正法は公布日まで。施行日は政令で定める（未定）', () => {
    expect(REFORM.promulgatedOn).toBe('2026-06-05');
    expect(REFORM.effectiveRule).toContain('政令で定める日');
    expect(REFORM.lawNumber).toBeNull();
  });

  it('確認日は ISO 形式', () => {
    expect(DATA_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
