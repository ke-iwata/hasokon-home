import { describe, expect, it } from 'vitest';
import {
  calcMenjo,
  fiscalYearOf,
  formatMonth,
  MONTHLY_PREMIUM,
  parseMonth,
  premiumFor,
  splitRows,
  spouseRole,
  type MenjoInput,
} from '@/lib/kokunen-ikuji-menjo';
import { EXEMPT_TABLE_AFTER, EXEMPT_TABLE_BEFORE } from '@/app/kokunen-ikuji-menjo/tables';

const d = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
};

const run = (birth: string, role: MenjoInput['role'], extra: Partial<MenjoInput> = {}) =>
  calcMenjo({ birthDate: d(birth), role, category: 'first', ...extra });

describe('月の算術', () => {
  it('YYYY-MM と通し月番号を往復できる', () => {
    expect(formatMonth(parseMonth('2026-10')!)).toBe('2026-10');
    expect(formatMonth(parseMonth('2027-01')! - 1)).toBe('2026-12');
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026/10')).toBeNull();
  });

  it('年度は 4 月始まり', () => {
    expect(fiscalYearOf('2027-03')).toBe(2026);
    expect(fiscalYearOf('2027-04')).toBe(2027);
  });

  it('保険料の月額（令和7年度 17,510円・令和8年度 17,920円）', () => {
    expect(MONTHLY_PREMIUM['2025']).toBe(17_510);
    expect(MONTHLY_PREMIUM['2026']).toBe(17_920);
    expect(premiumFor('2026-03')).toEqual({ amount: 17_510, fiscalYear: 2025, estimated: false });
    expect(premiumFor('2026-04')).toEqual({ amount: 17_920, fiscalYear: 2026, estimated: false });
  });

  it('未公表の年度は最新年度の額で概算する', () => {
    expect(premiumFor('2027-04')).toEqual({ amount: 17_920, fiscalYear: 2027, estimated: true });
  });
});

describe('年金機構ページの例', () => {
  it('実母（単胎）は産前産後 4 か月 + 育児 9 か月 = 13 か月', () => {
    const r = run('2027-01-15', 'mother');
    expect(r.sanzen).toEqual({ from: '2026-12', to: '2027-03', months: 4 });
    expect(r.ikuji).toEqual({ from: '2027-04', to: '2027-12', months: 9 });
    expect(r.exemptMonths).toBe(13);
  });

  it('実父は生まれた月から 1 歳の誕生日の前月まで 12 か月', () => {
    const r = run('2027-01-15', 'father');
    expect(r.sanzen).toBeNull();
    expect(r.ikuji).toEqual({ from: '2027-01', to: '2027-12', months: 12 });
  });

  it('多胎の実母は産前産後 6 か月 + 育児 9 か月 = 15 か月', () => {
    const r = run('2027-01-15', 'mother', { multiple: true });
    expect(r.sanzen).toEqual({ from: '2026-10', to: '2027-03', months: 6 });
    expect(r.ikuji).toEqual({ from: '2027-04', to: '2027-12', months: 9 });
    expect(r.exemptMonths).toBe(15);
  });

  it('多胎は実父の月数を変えない', () => {
    expect(run('2027-01-15', 'father', { multiple: true }).exemptMonths).toBe(12);
  });
});

describe('年金機構「国民年金保険料の育児免除制度」の例（2026-09-27 取得）', () => {
  it('実母：出産（予定）日 令和9年5月1日 → 育児免除は令和9年8月〜令和10年4月の 9 か月', () => {
    expect(run('2027-05-01', 'mother').ikuji).toEqual({ from: '2027-08', to: '2028-04', months: 9 });
  });

  it('実父：出産日 令和9年5月1日 → 令和9年5月〜令和10年4月の 12 か月（1 日生まれも誕生日の前月まで）', () => {
    expect(run('2027-05-01', 'father').ikuji).toEqual({ from: '2027-05', to: '2028-04', months: 12 });
  });

  it('施行前の実母：出産日 令和8年1月1日 → 令和8年10月〜12月の 3 か月', () => {
    expect(run('2026-01-01', 'mother').ikuji).toEqual({ from: '2026-10', to: '2026-12', months: 3 });
  });

  it('施行前の実父：出産日 令和8年1月1日 → 令和8年10月〜12月の 3 か月', () => {
    expect(run('2026-01-01', 'father').ikuji).toEqual({ from: '2026-10', to: '2026-12', months: 3 });
  });

  it('産前産後免除期間を有しない実母は実父と同じく最大 12 か月', () => {
    const r = run('2027-05-01', 'mother', { noSanzen: true });
    expect(r.sanzen).toBeNull();
    expect(r.ikuji).toEqual({ from: '2027-05', to: '2028-04', months: 12 });
    expect(r.noFilingIfSanzenFiled).toBe(false);
  });
});

describe('施行日の壁（2026-10 より前は育児免除の対象外）', () => {
  it('2026-02 生まれの実父は 2026-10〜2027-01 の 4 か月だけ', () => {
    const r = run('2026-02-10', 'father');
    expect(r.ikuji).toEqual({ from: '2026-10', to: '2027-01', months: 4 });
    expect(r.ikujiDroppedMonths).toBe(8);
    expect(r.amount).toBe(17_920 * 4);
  });

  it('2026-05 生まれの実母は 2026-10〜2027-04 の 7 か月（「10 月から 9 か月」ではない）', () => {
    const r = run('2026-05-20', 'mother');
    expect(r.sanzen).toEqual({ from: '2026-04', to: '2026-07', months: 4 });
    expect(r.ikuji).toEqual({ from: '2026-10', to: '2027-04', months: 7 });
    expect(r.ikujiDroppedMonths).toBe(2);
  });

  it('施行日前の月は帯に「対象外」として残り、額には入らない', () => {
    const r = run('2026-02-10', 'father');
    const before = r.cells.filter((c) => c.kind === 'before-enforcement');
    expect(before.map((c) => c.ym)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(before.every((c) => c.premium === 0)).toBe(true);
  });

  it('2 歳以上の子は育児免除 0 か月', () => {
    expect(run('2024-06-01', 'father').exemptMonths).toBe(0);
    expect(run('2024-06-01', 'father').ikuji).toBeNull();
    expect(run('2024-06-01', 'mother').ikuji).toBeNull();
  });

  it('2025-10 生まれ（施行時にちょうど 1 歳未満）の実父は 2026-10 と 2026-09 の境で 0 か月', () => {
    // 1 歳の誕生日の前月は 2026-09。施行月の 10 月には 1 歳になっている
    expect(run('2025-10-15', 'father').ikuji).toBeNull();
    expect(run('2025-11-15', 'father').ikuji).toEqual({ from: '2026-10', to: '2026-10', months: 1 });
  });

  it('産前産後免除は施行日（2019-04）より前の月を落とす', () => {
    const r = run('2019-04-10', 'mother');
    expect(r.sanzen).toEqual({ from: '2019-04', to: '2019-06', months: 3 });
  });
});

describe('仕様書の表示例', () => {
  it('2026年10月〜2027年8月の 11 か月・197,120円（うち 2027年4月〜8月の 5 か月は概算）', () => {
    const r = run('2026-09-10', 'father');
    expect(r.ikuji).toEqual({ from: '2026-10', to: '2027-08', months: 11 });
    expect(r.amount).toBe(197_120);
    expect(r.amount).toBe(17_920 * 11);
    expect(r.estimatedMonths).toBe(5);
    expect(r.estimatedPeriod).toEqual({ from: '2027-04', to: '2027-08', months: 5 });
  });

  it('夫婦とも第1号なら合計 448,000円（実母 232,960円 + 実父 215,040円。令和8年度の額）', () => {
    const mother = run('2026-11-15', 'mother');
    const father = run('2026-11-15', spouseRole('mother'));
    expect(mother.amount).toBe(232_960);
    expect(father.amount).toBe(215_040);
    expect(mother.amount + father.amount).toBe(448_000);
  });
});

describe('年度またぎ', () => {
  it('2026-03 と 2026-04 で月額が変わる（令和7年度 → 令和8年度）', () => {
    const r = run('2026-03-10', 'mother');
    // 産前産後 2026-02〜05（02・03 は令和7年度）
    expect(r.sanzen).toEqual({ from: '2026-02', to: '2026-05', months: 4 });
    const sanzenAmount = r.cells
      .filter((c) => c.kind === 'sanzen')
      .reduce((s, c) => s + c.premium, 0);
    expect(sanzenAmount).toBe(17_510 * 2 + 17_920 * 2);
    expect(r.byFiscalYear[0]).toEqual({ fiscalYear: 2025, months: 2, premium: 17_510, estimated: false });
  });

  it('令和9年度の額が未定のうちは同額で、境目だけ概算の印が立つ', () => {
    const r = run('2027-03-10', 'father');
    const mar = r.cells.find((c) => c.ym === '2027-03')!;
    const apr = r.cells.find((c) => c.ym === '2027-04')!;
    expect(mar).toMatchObject({ premium: 17_920, estimated: false });
    expect(apr).toMatchObject({ premium: 17_920, estimated: true });
  });
});

describe('1 日生まれ・養父母・区分', () => {
  it('1 日生まれも誕生日の前月まで（2027-03-01 生まれ → 2028-02 まで）', () => {
    expect(run('2027-03-01', 'father').ikuji).toEqual({ from: '2027-03', to: '2028-02', months: 12 });
  });

  it('養父母は縁組の月から 1 歳の誕生日の前月まで', () => {
    const r = run('2027-01-15', 'adoptive', { adoptionDate: d('2027-05-10') });
    expect(r.ikuji).toEqual({ from: '2027-05', to: '2027-12', months: 8 });
  });

  it('1 歳を過ぎてからの縁組は 0 か月', () => {
    expect(run('2027-01-15', 'adoptive', { adoptionDate: d('2028-02-01') }).exemptMonths).toBe(0);
  });

  it('第1号被保険者でなければ計算しない', () => {
    const r = calcMenjo({ birthDate: d('2027-01-15'), role: 'mother', category: 'other' });
    expect(r.eligible).toBe(false);
    expect(r.amount).toBe(0);
    expect(r.cells).toEqual([]);
  });
});

describe('届出不要の判定', () => {
  it('産前産後免除が 2026-09 以降に終わる実母は届出不要になりうる', () => {
    expect(run('2026-07-10', 'mother').noFilingIfSanzenFiled).toBe(true); // 2026-06〜09
    expect(run('2026-06-10', 'mother').noFilingIfSanzenFiled).toBe(false); // 2026-05〜08
    expect(run('2027-01-10', 'father').noFilingIfSanzenFiled).toBe(false);
  });
});

describe('月の帯の折り返し', () => {
  it('12 マス以下は 1 段', () => {
    expect(splitRows(run('2027-01-15', 'father').cells)).toHaveLength(1);
  });

  it('13 マス以上は年度の境（4 月）で折り返す', () => {
    const rows = splitRows(run('2027-01-15', 'mother', { multiple: true }).cells);
    expect(rows).toHaveLength(2);
    expect(rows[0].at(-1)!.ym).toBe('2027-03');
    expect(rows[1][0].ym).toBe('2027-04');
    expect(rows.flat()).toHaveLength(15);
  });
});

describe('早見表', () => {
  it('2026年10月〜2027年9月生まれは実母 13 か月・実父 12 か月', () => {
    expect(EXEMPT_TABLE_AFTER).toHaveLength(12);
    expect(EXEMPT_TABLE_AFTER[0].month).toBe('2026-10');
    expect(EXEMPT_TABLE_AFTER.at(-1)!.month).toBe('2027-09');
    for (const row of EXEMPT_TABLE_AFTER) {
      expect(row.mother.months).toBe(13);
      expect(row.father.months).toBe(12);
    }
  });

  it('施行日前に生まれた子の表は calcMenjo と一致する', () => {
    for (const row of EXEMPT_TABLE_BEFORE) {
      const birth = `${row.month}-15`;
      expect(row.mother.amount).toBe(run(birth, 'mother').amount);
      expect(row.father.months).toBe(run(birth, 'father').exemptMonths);
    }
    const may = EXEMPT_TABLE_BEFORE.find((r) => r.month === '2026-05')!;
    expect(may.motherIkujiMonths).toBe(7);
  });
});
