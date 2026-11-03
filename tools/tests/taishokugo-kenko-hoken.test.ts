import { describe, expect, test } from 'vitest';
import { FISCAL_YEARS } from '@/lib/kosodate-shienkin';
import { KAIGO_RATE, KYOKAI_HEALTH_RATE_TABLES, PREFECTURES } from '@/lib/shaho-ryoritsu';
import { prescribedDaysFor, restrictionFor, WAITING_DAYS } from '@/lib/shitsugyo-hoken';
import { addDays, type DateParts } from '@/lib/date-parts';
import {
  benefitPeriodOf,
  calc,
  defaultApplyDate,
  defaultBenefitTerms,
  defaultLeaveYearSalary,
  FUYO_DAILY_LIMIT,
  FUYO_DAILY_LIMIT_60,
  fuyoOkInMonth,
  involuntaryCovers,
  KOKUHO_TABLES,
  kokuhoAnnual,
  NO_FAMILY,
  ninkeiFullRate,
  ninkeiMonthly,
  salaryIncomeOf,
  shienkinFor,
  switchSteps,
  type CalcInput,
  type KokuhoTable,
} from '@/lib/taishokugo-kenko-hoken';

const d = (iso: string): DateParts => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
};

const R8 = KOKUHO_TABLES[0];
const shienkinRate = (fy: number) => FISCAL_YEARS.find((y) => y.fiscalYear === fy)!.rate;
const TOKYO = KYOKAI_HEALTH_RATE_TABLES[0].rates['東京都'];

/** 仕様書の例：45歳・東京・単身・月給50万円・2026-12-31 退職 */
const base = (over: Partial<CalcInput> = {}): CalcInput => {
  const leaveDate = d('2026-12-31');
  return {
    leaveDate,
    birthDate: d('1981-06-15'),
    monthlySalary: 500_000,
    health: { kind: 'kyokai', prefecture: '東京都' },
    ninkeiEligible: true,
    salaryPrevYear: 6_000_000,
    salaryLeaveYear: 6_000_000,
    salaryAfter: 0,
    otherIncome: 0,
    leaveKind: 'self',
    family: NO_FAMILY,
    fuyo: {
      available: false,
      supporter: 'spouse',
      benefitDaily: 0,
      applyDate: defaultApplyDate(leaveDate),
      restrictionMonths: 1,
      prescribedDays: 120,
    },
    ...over,
  };
};

const income = (salaryIncome: number, involuntary = false) => ({
  salaryIncome,
  otherIncome: 0,
  hasSalary: salaryIncome > 0,
  involuntary,
});

describe('協会けんぽの料率データ', () => {
  test('47支部ぶんある・東京は 9.85%', () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(Object.keys(KYOKAI_HEALTH_RATE_TABLES[0].rates)).toHaveLength(47);
    expect(TOKYO).toBe(0.0985);
  });
});

describe('任意継続', () => {
  test('標準報酬50万円・東京・45歳 → 上限32万円 × 11.70% ＝ 37,440円', () => {
    const r = ninkeiFullRate('東京都', 2026, 45);
    expect(r.rate).toBeCloseTo(TOKYO + shienkinRate(2026) + KAIGO_RATE * 2, 10);
    expect(ninkeiMonthly(500_000, 320_000, r.rate)).toBe(37_440);
  });

  test('39歳は介護なし：32万円 × 10.08%', () => {
    const r = ninkeiFullRate('東京都', 2026, 39);
    expect(r.kaigo).toBe(0);
    expect(ninkeiMonthly(500_000, 320_000, r.rate)).toBe(
      Math.round(320_000 * (TOKYO + shienkinRate(2026))),
    );
    expect(ninkeiMonthly(500_000, 320_000, r.rate)).toBe(32_256);
  });

  test('標準報酬26万円（上限未満）はそのまま', () => {
    const r = ninkeiFullRate('東京都', 2026, 45);
    expect(ninkeiMonthly(260_000, 320_000, r.rate)).toBe(Math.round(260_000 * r.rate));
  });

  test('支援金率は FISCAL_YEARS から引き、確定でない年度は同じ言葉で印を付ける', () => {
    expect(shienkinFor(2026)).toEqual({ rate: shienkinRate(2026), mark: null, substituted: false });
    expect(shienkinFor(2027)).toEqual({ rate: shienkinRate(2027), mark: '見込み', substituted: false });
    expect(shienkinFor(2028)).toEqual({ rate: shienkinRate(2028), mark: '政府試算', substituted: false });
    // FISCAL_YEARS に無い年度は最後の年度で代用
    expect(shienkinFor(2029)).toMatchObject({ rate: shienkinRate(2028), substituted: true });
    // 制度の前は0
    expect(shienkinFor(2025).rate).toBe(0);
  });

  test('例の R9（2027-04〜）・R10（2028-04〜）の月額', () => {
    const r = calc(base());
    const at = (ym: string) => r.months.find((m) => m.ym === ym)!;
    const expected = (fy: number) =>
      Math.round(320_000 * (TOKYO + shienkinRate(fy) + KAIGO_RATE * 2));
    expect(at('2027-01').ninkei).toBe(37_440);
    expect(at('2027-04').ninkei).toBe(expected(2027));
    expect(at('2027-04').ninkei).toBe(37_664);
    expect(at('2027-04').marks).toContain('支援金率は見込み');
    expect(at('2027-04').marks).toContain('健保料率は令和8年度で代用');
    expect(at('2028-04').ninkei).toBe(expected(2028));
    expect(at('2028-04').marks).toContain('支援金率は政府試算');
  });

  test('加入2か月未満では任意継続の列が出ない', () => {
    const r = calc(base({ ninkeiEligible: false }));
    expect(r.months.every((m) => m.ninkei === null)).toBe(true);
    expect(r.ninkeiOnly).toBeNull();
    expect(r.plans.some((p) => p.choices.includes('ninkei'))).toBe(false);
  });

  test('健康保険組合は料率と上限の手入力で計算する', () => {
    const r = calc(base({ health: { kind: 'kumiai', ratePercent: 9, kaigoRatePercent: 1.8, cap: 380_000 } }));
    expect(r.months[0].ninkei).toBe(Math.round(380_000 * 0.108));
  });

  test('申出期限：退職日 2026-12-31 → 2027-01-20', () => {
    expect(calc(base()).ninkeiDeadline).toEqual(d('2027-01-20'));
  });
});

describe('国保（特別区 令和8年度）', () => {
  const kyuyo = salaryIncomeOf(6_000_000, 2025);

  test('給与収入600万円の給与所得は436万円', () => {
    expect(kyuyo).toBe(4_360_000);
    expect(salaryIncomeOf(6_000_000, 2026)).toBe(4_360_000);
  });

  test('自己都合：年額 596,166円（区分ごとの円単位）', () => {
    const r = kokuhoAnnual({ income: income(kyuyo), family: NO_FAMILY, selfKaigo: true, table: R8 });
    expect(r).toMatchObject({ iryo: 342_743, shien: 127_640, kaigo: 113_299, kodomo: 12_484 });
    expect(r.total).toBe(596_166);
    expect(r.keigenTenths).toBe(0);
  });

  test('会社都合（給与所得30/100）：年額 199,099円', () => {
    const r = kokuhoAnnual({ income: income(kyuyo, true), family: NO_FAMILY, selfKaigo: true, table: R8 });
    expect(r).toMatchObject({ iryo: 113_537, shien: 42_184, kaigo: 39_135, kodomo: 4_243 });
    expect(r.total).toBe(199_099);
  });

  test('所得0円：均等割の7割軽減だけで 25,461円', () => {
    const r = kokuhoAnnual({ income: income(0), family: NO_FAMILY, selfKaigo: true, table: R8 });
    expect(r.keigenTenths).toBe(7);
    expect(r.total).toBe(25_461);
  });

  test('限度額で頭打ち（医療分67万円）', () => {
    const r = kokuhoAnnual({ income: income(20_000_000), family: NO_FAMILY, selfKaigo: true, table: R8 });
    expect(r.iryo).toBe(670_000);
    expect(r.shien).toBe(260_000);
    expect(r.kaigo).toBe(170_000);
    expect(r.kodomo).toBe(30_000);
  });

  test('子ども分の均等割は18歳以上 1,873円・18歳未満 0円／未就学児は医療・後期が5割', () => {
    const zero = (family = NO_FAMILY) =>
      kokuhoAnnual({ income: { ...income(0), hasSalary: false, otherIncome: 10_000_000 }, family, selfKaigo: false, table: R8 });
    const single = zero();
    const minor = zero({ ...NO_FAMILY, minor: 1 });
    const pre = zero({ ...NO_FAMILY, preschool: 1 });
    const adult = zero({ ...NO_FAMILY, adult: 1 });
    // 高所得で軽減なし・限度額にも当たらない区分（子ども分）で差を見る
    expect(single.kodomo).toBeLessThan(30_000);
    expect(minor.kodomo - single.kodomo).toBe(0);
    expect(adult.kodomo - single.kodomo).toBe(1_873);
    // 医療分は限度額に当たるので所得の低い例で見る
    const low = (family = NO_FAMILY) =>
      kokuhoAnnual({ income: { ...income(0), hasSalary: false, otherIncome: 3_000_000 }, family, selfKaigo: false, table: R8 });
    expect(low({ ...NO_FAMILY, minor: 1 }).iryo - low().iryo).toBe(47_600);
    expect(low({ ...NO_FAMILY, preschool: 1 }).iryo - low().iryo).toBe(23_800);
    expect(low({ ...NO_FAMILY, preschool: 1 }).shien - low().shien).toBe(8_800);
    expect(pre.kodomo).toBe(single.kodomo);
  });

  test('7・5・2割の軽減の境目（加入者1人・2人。給与以外の所得で見る）', () => {
    const k = (total: number, members: number) =>
      kokuhoAnnual({
        income: { salaryIncome: 0, otherIncome: total, hasSalary: false, involuntary: false },
        family: { ...NO_FAMILY, adult: members - 1 },
        selfKaigo: false,
        table: R8,
      }).keigenTenths;
    expect(k(430_000, 1)).toBe(7);
    expect(k(430_001, 1)).toBe(5);
    expect(k(740_000, 1)).toBe(5);
    expect(k(740_001, 1)).toBe(2);
    expect(k(1_000_000, 1)).toBe(2);
    expect(k(1_000_001, 1)).toBe(0);
    expect(k(1_050_000, 2)).toBe(5);
    expect(k(1_050_001, 2)).toBe(2);
    expect(k(1_570_000, 2)).toBe(2);
    expect(k(1_570_001, 2)).toBe(0);
  });
});

describe('年度の切り替え（国保の基準の所得）', () => {
  test('退職 12-31 → 1〜3月は前年、4月から退職した年、翌々年4月から退職翌年の所得', () => {
    const r = calc(base({ salaryPrevYear: 5_000_000 }));
    const at = (ym: string) => r.months.find((m) => m.ym === ym)!;
    expect(at('2027-01').kokuhoIncomeYear).toBe(2025);
    expect(at('2027-04').kokuhoIncomeYear).toBe(2026);
    expect(at('2028-04').kokuhoIncomeYear).toBe(2027);
    expect(at('2027-01').kokuhoAnnual).not.toBe(at('2027-04').kokuhoAnnual);
    expect(at('2027-04').kokuhoAnnual).toBe(596_166);
    expect(at('2028-04').kokuhoAnnual).toBe(25_461);
  });

  test('例の月額（年額 ÷ 12）', () => {
    const r = calc(base());
    expect(r.months[0].kokuho).toBe(Math.round(596_166 / 12));
  });

  test('国保の表に無い年度は「代用」の印、R9 の表を足すと 2027-04 以降がそちらで計算される', () => {
    const r = calc(base());
    const apr = r.months.find((m) => m.ym === '2027-04')!;
    expect(apr.marks).toContain('国保の料率は令和8年度で代用');
    expect(r.months[0].marks.some((m) => m.startsWith('国保の料率'))).toBe(false);

    const r9: KokuhoTable = { ...R8, fiscalYear: 2027, label: 'R9', iryo: { ...R8.iryo, rate: 800 } };
    const r2 = calc(base({ kokuhoTables: [R8, r9] }));
    const apr2 = r2.months.find((m) => m.ym === '2027-04')!;
    expect(apr2.marks.some((m) => m.startsWith('国保の料率'))).toBe(false);
    expect(apr2.kokuhoAnnual).toBeGreaterThan(apr.kokuhoAnnual);
    expect(r2.months[0].kokuhoAnnual).toBe(r.months[0].kokuhoAnnual);
  });

  test('退職年の給与収入の既定は1月から退職月まで', () => {
    expect(defaultLeaveYearSalary(500_000, d('2026-12-31'))).toBe(6_000_000);
    expect(defaultLeaveYearSalary(500_000, d('2026-03-31'))).toBe(1_500_000);
    expect(defaultLeaveYearSalary(500_000, d('2026-03-15'))).toBe(1_000_000);
  });
});

describe('非自発的失業者の軽減', () => {
  test('離職翌月から翌年度末まで 30/100、その翌月から元に戻る', () => {
    expect(involuntaryCovers(d('2026-12-31'), 2026)).toBe(true);
    expect(involuntaryCovers(d('2026-12-31'), 2027)).toBe(true);
    expect(involuntaryCovers(d('2026-12-31'), 2028)).toBe(false);
    // 3-31 退職 → 翌日は4月（R8）なので R9 末まで
    expect(involuntaryCovers(d('2026-03-31'), 2027)).toBe(true);
    expect(involuntaryCovers(d('2026-03-31'), 2028)).toBe(false);

    const r = calc(base({ leaveKind: 'company', salaryAfter: 6_000_000 }));
    const at = (ym: string) => r.months.find((m) => m.ym === ym)!;
    expect(at('2027-01').kokuhoAnnual).toBe(199_099);
    expect(at('2028-03').involuntary).toBe(true);
    expect(at('2028-04').involuntary).toBe(false);
    expect(at('2028-04').kokuhoAnnual).toBe(596_166);
  });

  test('給与以外の所得は 30/100 にしない', () => {
    const a = kokuhoAnnual({
      income: { salaryIncome: 0, otherIncome: 4_360_000, hasSalary: false, involuntary: true },
      family: NO_FAMILY,
      selfKaigo: true,
      table: R8,
    });
    expect(a.total).toBe(596_166);
  });

  test('65歳以上の離職は対象外', () => {
    const r = calc(base({ leaveKind: 'company', birthDate: d('1961-06-15') }));
    expect(r.involuntary).toBe(false);
    expect(r.months[0].involuntary).toBe(false);
  });
});

describe('扶養と失業給付', () => {
  const leave = d('2026-12-31');
  const period = (restrictionMonths: number) =>
    benefitPeriodOf(leave, {
      available: true,
      supporter: 'spouse',
      benefitDaily: 5_000,
      applyDate: d('2027-01-15'),
      restrictionMonths,
      prescribedDays: 90,
    })!;

  test('日額 3,612円で入れない／3,611円で入れる（受給中の月）', () => {
    const p = period(0);
    expect(fuyoOkInMonth('2027-02', p, FUYO_DAILY_LIMIT, 45)).toBe(false);
    expect(fuyoOkInMonth('2027-02', p, FUYO_DAILY_LIMIT - 1, 45)).toBe(true);
  });

  test('60歳以上は 180万円（日額5,000円）の線', () => {
    const p = period(0);
    expect(fuyoOkInMonth('2027-02', p, 4_999, 60)).toBe(true);
    expect(fuyoOkInMonth('2027-02', p, FUYO_DAILY_LIMIT_60, 60)).toBe(false);
    expect(fuyoOkInMonth('2027-02', p, 4_999, 59)).toBe(false);
  });

  test('自己都合（給付制限1か月）：待期7日＋1か月は扶養、その翌日から所定給付日数ぶん外れる', () => {
    const p = period(1);
    // 1/15 申込み → 待期 1/15〜1/21 → 給付制限 1/22〜2/21 → 受給 2/22〜5/22（90日）
    expect(p.start).toEqual(addDays(d('2027-01-15'), WAITING_DAYS + 31));
    expect(p.start).toEqual(d('2027-02-22'));
    expect(p.end).toEqual(d('2027-05-22'));
    expect(fuyoOkInMonth('2027-01', p, 5_000, 45)).toBe(true);
    expect(fuyoOkInMonth('2027-02', p, 5_000, 45)).toBe(false); // 月末は受給中
    expect(fuyoOkInMonth('2027-04', p, 5_000, 45)).toBe(false);
    expect(fuyoOkInMonth('2027-05', p, 5_000, 45)).toBe(true); // 5/22 に終わり、月末は扶養
  });

  test('会社都合は待期7日のあとすぐ外れる', () => {
    const p = period(0);
    expect(p.start).toEqual(d('2027-01-22'));
    expect(fuyoOkInMonth('2027-01', p, 5_000, 45)).toBe(false);
  });

  test('所定給付日数・給付制限の既定値は shitsugyo-hoken の値と一致する', () => {
    const self = defaultBenefitTerms({ leaveKind: 'self', age: 45, tenureYears: 15, leaveDate: leave });
    expect(self.restrictionMonths).toBe(restrictionFor({ reason: 'self', leaveDate: '2026-12-31' }).months);
    expect(self.prescribedDays).toBe(prescribedDaysFor({ category: 'ippan', age: 45, tenure: 'y10to20' }).days);
    const company = defaultBenefitTerms({ leaveKind: 'company', age: 45, tenureYears: 15, leaveDate: leave });
    expect(company.restrictionMonths).toBe(0);
    expect(company.prescribedDays).toBe(prescribedDaysFor({ category: 'tokutei', age: 45, tenure: 'y10to20' }).days);
  });

  test('扶養の期間は calc の月ごとの表に出る', () => {
    const r = calc(
      base({
        fuyo: {
          available: true,
          supporter: 'spouse',
          benefitDaily: 6_000,
          applyDate: d('2027-01-15'),
          restrictionMonths: 1,
          prescribedDays: 90,
        },
      }),
    );
    const ok = r.months.map((m) => `${m.ym}:${m.fuyoOk ? 'o' : 'x'}`).slice(0, 6);
    expect(ok).toEqual(['2027-01:o', '2027-02:x', '2027-03:x', '2027-04:x', '2027-05:o', '2027-06:o']);
    const fuyoPlan = r.plans.find((p) => p.key === 'fuyo')!;
    expect(fuyoPlan.label).toBe('家族の扶養 → 国保 → 家族の扶養');
  });

  test('見込みの年収が130万円以上なら扶養に入れない', () => {
    const r = calc(base({ salaryAfter: 1_300_000, fuyo: { ...base().fuyo, available: true } }));
    expect(r.fuyoBlockedReason).not.toBeNull();
    expect(r.months.every((m) => !m.fuyoOk)).toBe(true);
  });
});

describe('国民年金', () => {
  const withFuyo = (supporter: 'spouse' | 'other', birth = '1981-06-15') =>
    calc(base({ birthDate: d(birth), fuyo: { ...base().fuyo, available: true, supporter } }));

  test('配偶者の扶養（本人45歳）は 0円', () => {
    const m = withFuyo('spouse').months.find((x) => x.ym === '2027-04')!;
    expect(m.pensionFuyo).toBe(0);
    expect(m.pension).toBe(17_920);
  });

  test('親・子の扶養は健康保険 0円でも国民年金 17,920円（R8）', () => {
    const r = withFuyo('other');
    const m = r.months[0];
    expect(m.pensionFuyo).toBe(17_920);
    const fuyoPlan = r.plans.find((p) => p.key === 'fuyo')!;
    expect(fuyoPlan.health).toBe(0);
    expect(fuyoPlan.pension).toBeGreaterThan(0);
  });

  test('60歳以上はどの列も 0円', () => {
    const r = withFuyo('other', '1965-06-15');
    expect(r.months.every((m) => m.pension === 0 && m.pensionFuyo === 0)).toBe(true);
  });

  test('60歳に達した月から払わない（誕生日の前日に達する）', () => {
    // 1967-07-01 生まれ → 60歳に達するのは 2027-06-30 → 2027-06 から 0
    const r = withFuyo('other', '1967-07-01');
    expect(r.months.find((m) => m.ym === '2027-05')!.pension).toBeGreaterThan(0);
    expect(r.months.find((m) => m.ym === '2027-06')!.pension).toBe(0);
  });
});

describe('おすすめの入り方', () => {
  test('例：任意継続 → 2028-04 に国保', () => {
    const r = calc(base());
    expect(r.best.key).toBe('switch');
    expect(r.best.switchAt).toBe('2028-04');
    expect(r.best.label).toBe('任意継続 → 国保');
    expect(r.best.segments[0]).toMatchObject({ choice: 'ninkei', from: '2027-01', to: '2028-03', months: 15 });
    expect(r.best.total).toBeLessThan(r.ninkeiOnly!.total);
    expect(r.best.total).toBeLessThan(r.kokuhoOnly.total);
    expect(switchSteps('2028-04')).toEqual({ applyMonth: '2028-03', lossDate: d('2028-04-01') });
  });

  test('会社都合では「国保 2年」', () => {
    const r = calc(base({ leaveKind: 'company' }));
    expect(r.best.key).toBe('kokuho');
  });

  test('国保に一緒に入る家族が増えると任意継続 2年が選ばれる境目がある', () => {
    // 給与以外の所得が毎年ある（年度が替わっても国保の所得が下がらない）・月給26万円
    const pick = (adult: number) =>
      calc(
        base({
          monthlySalary: 260_000,
          salaryPrevYear: 3_120_000,
          salaryLeaveYear: 3_120_000,
          otherIncome: 2_500_000,
          family: { ...NO_FAMILY, adult },
        }),
      ).best.key;
    expect(pick(0)).toBe('switch');
    expect(pick(1)).toBe('ninkei');
    expect(pick(3)).toBe('ninkei');
  });

  test('扶養に入れる人は扶養を含む入り方が選ばれる', () => {
    const r = calc(base({ fuyo: { ...base().fuyo, available: true, supporter: 'spouse' } }));
    expect(r.best.key).toBe('fuyo');
    expect(r.best.label).toBe('家族の扶養 2年');
    expect(r.best.total).toBe(0);
  });
});
