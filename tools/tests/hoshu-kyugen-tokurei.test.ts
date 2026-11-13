import { describe, expect, it } from 'vitest';
import {
  acceleration,
  evaluate,
  gradeDrop,
  healthGrades,
  isPreschoolIn,
  isUnder3In,
  pensionGrades,
  preschoolEnd,
  ratesFor,
  rowOfStandard,
  specialThresholds,
  type TokureiInput,
} from '@/lib/hoshu-kyugen-tokurei';
import { dailyFromStandard, kenpoDailyAmount } from '@/lib/kenpo-daily-amount';
import { KYOKAI_HEALTH_RATE_TABLES, PENSION_RATE } from '@/lib/shaho-ryoritsu';
import { faq, title } from '@/app/hoshu-kyugen-tokurei/copy';
import { tools } from '@/lib/registry';

/** 仕様書の例：東京都・協会けんぽ・35歳、従前30万、残業の抑制で 2027-01 の報酬が22万 */
const base: TokureiInput = {
  reason: 'ryoyo-honnin',
  formerStandard: 300_000,
  firstMonthPay: 220_000,
  firstMonth: '2027-01',
  baseDays: 20,
  shortTime: false,
  lastsThreeMonths: true,
  retiresNextMonth: false,
  insuredUnder3Months: false,
  adjustment: 'zangyo',
  age: 35,
  prefecture: '東京都',
  tokureiMonths: 12,
};

const codes = (i: Partial<TokureiInput>) => evaluate({ ...base, ...i }).rejects.map((r) => r.code);

describe('判定（仕様「確かめること」）', () => {
  it('従前30万・初月22万・残業抑制（療養）・20日 → 対象になりうる／4等級低下／2月分から／比較相手は定時決定', () => {
    const r = evaluate(base);
    expect(r.eligible).toBe(true);
    expect(r.health.formerRow[0]).toBe(22);
    expect(r.health.newRow[0]).toBe(18);
    expect(r.health.drop).toBe(4);
    expect(r.accel.tokureiFrom).toBe('2027-02');
    expect(r.accel.normalKind).toBe('teiji');
    expect(r.accel.normalFrom).toBe('2027-09');
  });

  it('従前30万・初月27万 → 1等級なので対象外', () => {
    const r = evaluate({ ...base, firstMonthPay: 270_000 });
    expect(r.health.drop).toBe(1);
    expect(r.eligible).toBe(false);
    expect(r.rejects.map((x) => x.code)).toEqual(['grade-drop']);
  });

  it('支払基礎日数 16日（一般）／10日（短時間）は対象外、17日・11日は対象', () => {
    expect(codes({ baseDays: 16 })).toContain('base-days');
    expect(codes({ baseDays: 17 })).not.toContain('base-days');
    expect(codes({ baseDays: 10, shortTime: true })).toContain('base-days');
    expect(codes({ baseDays: 11, shortTime: true })).not.toContain('base-days');
  });

  it('初月の報酬 0円 → 対象外（全く勤務していない）', () => {
    expect(codes({ firstMonthPay: 0 })).toEqual(['zero-pay']);
  });

  it('育児・2021-04-01 生まれ・初月 2027-04 → 就学前でない（4/1 生まれは早生まれ側）', () => {
    expect(preschoolEnd({ year: 2021, month: 4, day: 1 })).toEqual({ year: 2027, month: 3, day: 31 });
    expect(
      codes({ reason: 'ikuji', childBirth: { year: 2021, month: 4, day: 1 }, firstMonth: '2027-04' }),
    ).toContain('reason-ikuji-age');
  });

  it('育児・2021-04-02 生まれ・初月 2027-04 → 対象になりうる（入学は 2028-04）', () => {
    expect(preschoolEnd({ year: 2021, month: 4, day: 2 })).toEqual({ year: 2028, month: 3, day: 31 });
    const r = evaluate({ ...base, reason: 'ikuji', childBirth: { year: 2021, month: 4, day: 2 }, firstMonth: '2027-04' });
    expect(r.eligible).toBe(true);
    expect(r.ikujiUnder3).toBe(false);
  });

  it('早生まれ（1〜3月生まれ）は6歳に達した年の3月31日まで', () => {
    expect(preschoolEnd({ year: 2021, month: 3, day: 15 })).toEqual({ year: 2027, month: 3, day: 31 });
    expect(preschoolEnd({ year: 2021, month: 12, day: 1 })).toEqual({ year: 2028, month: 3, day: 31 });
    expect(isPreschoolIn({ year: 2021, month: 12, day: 1 }, '2028-03')).toBe(true);
    expect(isPreschoolIn({ year: 2021, month: 12, day: 1 }, '2028-04')).toBe(false);
  });

  it('育児・子が3歳未満 → 対象になりうる＋養育特例の案内、年金の減少は0円', () => {
    const r = evaluate({ ...base, reason: 'ikuji', childBirth: { year: 2026, month: 5, day: 10 } });
    expect(r.eligible).toBe(true);
    expect(r.ikujiUnder3).toBe(true);
    expect(r.pensionLoss.ikujiMonths).toBe(12);
    expect(r.pensionLoss.withoutIkuji).toBeGreaterThan(0);
    expect(r.pensionLoss.withIkuji).toBe(0);
  });

  it('介護・認定なし → 対象外、認定あり → 対象になりうる', () => {
    expect(codes({ reason: 'kaigo', kaigoNintei: false })).toEqual(['reason-kaigo-nintei']);
    expect(codes({ reason: 'kaigo', kaigoNintei: true })).toEqual([]);
  });

  it('健保50級・報酬月額141万5,000円以上 → 49級は2等級として扱う（未満なら1等級）', () => {
    const r = evaluate({ ...base, formerStandard: 1_390_000, formerPay: 1_415_000, firstMonthPay: 1_300_000 });
    expect(r.health.formerRow[0]).toBe(50);
    expect(r.health.newRow[0]).toBe(49);
    expect(r.health.special).toBe(true);
    expect(r.health.drop).toBe(2);
    expect(r.eligible).toBe(true);
    const r2 = evaluate({ ...base, formerStandard: 1_390_000, formerPay: 1_414_999, firstMonthPay: 1_300_000 });
    expect(r2.health.drop).toBe(1);
    expect(r2.eligible).toBe(false);
  });

  it('第2級 → 報酬5万3,000円未満は2等級として扱う', () => {
    const t = healthGrades();
    const g2 = rowOfStandard(t, 68_000).row;
    expect(gradeDrop(t, g2, null, 52_999).drop).toBe(2);
    expect(gradeDrop(t, g2, null, 53_000).drop).toBe(1);
  });

  it('特則のしきい値は等級表から引く（固定値で持たない）', () => {
    expect(specialThresholds(healthGrades())).toEqual({ top: 1_415_000, bottom: 53_000 });
    expect(specialThresholds(pensionGrades('2027-08'))).toEqual({ top: 665_000, bottom: 83_000 });
    // 2027-09 から厚年の上限が33級・68万円になると、しきい値も上がる
    expect(pensionGrades('2027-09').at(-1)?.[0]).toBe(33);
    expect(specialThresholds(pensionGrades('2027-09')).top).toBe(695_000);
  });

  it('初月の翌月に退職 → 対象外／3か月未満の見込み・加入3か月未満も対象外', () => {
    expect(codes({ retiresNextMonth: true })).toEqual(['retire']);
    expect(codes({ lastsThreeMonths: false })).toEqual(['lasting']);
    expect(codes({ insuredUnder3Months: true })).toEqual(['insured-period']);
  });

  it('初月 2026-12 → 注記つきで対象外として判定（初月が2027-01以降のときだけ対象）', () => {
    const r = evaluate({ ...base, firstMonth: '2026-12' });
    expect(r.eligible).toBe(false);
    expect(r.rejects[0].code).toBe('before-effective');
    expect(r.rejects[0].message).toContain('年金事務所に確認');
  });

  it('当たらない理由は1つずつすべて出す', () => {
    expect(codes({ baseDays: 10, retiresNextMonth: true, firstMonthPay: 270_000 })).toEqual([
      'base-days',
      'grade-drop',
      'retire',
    ]);
  });
});

describe('早まる月数の式', () => {
  it('初月 2027-01・残業の抑制のみ → 7か月（2〜8月分）', () => {
    const a = acceleration('2027-01', 'zangyo');
    expect(a.months).toEqual(['2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08']);
  });

  it('初月 2027-01・時短 → 2か月（2・3月分。随時改定は4月分から）', () => {
    const a = acceleration('2027-01', 'jitan');
    expect(a.normalFrom).toBe('2027-04');
    expect(a.months).toEqual(['2027-02', '2027-03']);
  });

  it('初月 2027-07・残業の抑制のみ → その年の定時決定の対象外、翌年9月分まで13か月', () => {
    const a = acceleration('2027-07', 'zangyo');
    expect(a.tokureiFrom).toBe('2027-08');
    expect(a.teijiSkipped).toBe(true);
    expect(a.normalFrom).toBe('2028-09');
    expect(a.months).toHaveLength(13);
  });

  it('初月 10月 → 翌年9月分まで（定時決定の対象外ではない）', () => {
    const a = acceleration('2027-10', 'zangyo');
    expect(a.months).toHaveLength(10);
    expect(a.teijiSkipped).toBe(false);
  });

  it('初月 5月 → 定時決定に減る前の4月が混ざる注記', () => {
    expect(acceleration('2027-05', 'zangyo').teijiMixed).toBe(true);
    expect(acceleration('2027-05', 'zangyo').months).toHaveLength(3);
    expect(acceleration('2027-04', 'zangyo').teijiMixed).toBe(false);
    expect(acceleration('2027-05', 'jitan').teijiMixed).toBe(false);
  });
});

describe('保険料（仕様の例）', () => {
  const r = evaluate(base);
  const tokyo = KYOKAI_HEALTH_RATE_TABLES.find((t) => t.fiscalYear === 2026)!.rates['東京都'];

  it('厚生年金の本人分は 27,450円 → 20,130円（月 7,320円減）', () => {
    expect(r.firstRow.before.pension).toBe(27_450);
    expect(r.firstRow.after.pension).toBe(20_130);
    expect(PENSION_RATE).toBe(0.0915);
  });

  it('健康保険の本人分も、東京都の料率で下がる', () => {
    expect(r.firstRow.before.health).toBe(Math.round((300_000 * tokyo) / 2));
    expect(r.firstRow.after.health).toBe(Math.round((220_000 * tokyo) / 2));
    expect(r.firstRow.before.kaigo).toBe(0); // 35歳
  });

  it('早く下がる7か月の厚生年金だけで 7,320円 × 7 = 51,240円', () => {
    const pension = r.rows.reduce((a, x) => a + x.before.pension - x.after.pension, 0);
    expect(r.rows).toHaveLength(7);
    expect(pension).toBe(51_240);
    expect(r.acceleratedTotal).toBe(r.rows.reduce((a, x) => a + x.diff, 0));
    expect(r.acceleratedTotal).toBeGreaterThan(pension);
  });

  it('料率は月ごとに引く（4月分からは支援金が令和9年度の見込み）', () => {
    const feb = ratesFor('2027-02', base);
    const apr = ratesFor('2027-04', base);
    expect(feb.shienkinMark).toBeNull();
    expect(apr.shienkinMark).toBe('見込み');
    expect(apr.shienkin).toBeGreaterThan(feb.shienkin);
    // 協会けんぽは3月分から新年度。表に無い令和9年度は直近の年度で代用する
    expect(feb.healthSubstituted).toBe(false);
    expect(ratesFor('2027-03', base).healthSubstituted).toBe(true);
    expect(r.notes.some((n) => n.includes('直近の年度'))).toBe(true);
  });

  it('40〜64歳は介護保険料を含める', () => {
    const r40 = evaluate({ ...base, age: 45 });
    expect(r40.firstRow.before.kaigo).toBeGreaterThan(0);
  });

  it('健康保険組合は入れた料率で計算する', () => {
    const k = evaluate({ ...base, prefecture: null, kumiaiHealthRate: 0.09 });
    expect(k.firstRow.before.health).toBe(13_500);
    expect(k.firstRow.after.health).toBe(9_900);
  });

  it('事業主の負担も出す（厚生年金は本人と同額）', () => {
    expect(r.firstRow.employerBefore.pension).toBe(27_450);
    expect(r.acceleratedEmployerTotal).toBeGreaterThan(0);
  });
});

describe('引き換えに減るもの', () => {
  it('老齢厚生年金：(300,000 − 220,000) × 5.481/1000 × 12 ≒ 年 5,262円', () => {
    const r = evaluate(base);
    expect(r.pensionLoss.withoutIkuji).toBe(5_262);
    expect(r.pensionLoss.withIkuji).toBe(5_262);
  });

  it('養育特例：基準28万／従前30万／改定後22万 → 2万ぶんだけ残る', () => {
    const r = evaluate({
      ...base,
      reason: 'ikuji',
      childBirth: { year: 2026, month: 5, day: 10 },
      ikujiBaseStandard: 280_000,
    });
    expect(r.pensionLoss.ikujiBase).toBe(280_000);
    expect(r.pensionLoss.withIkuji).toBe(Math.round(20_000 * (5.481 / 1000) * 12));
  });

  it('養育特例：基準20万／従前30万／改定後22万 → 8万ぶん（みなしは効かない）', () => {
    const r = evaluate({
      ...base,
      reason: 'ikuji',
      childBirth: { year: 2026, month: 5, day: 10 },
      ikujiBaseStandard: 200_000,
    });
    expect(r.pensionLoss.withIkuji).toBe(5_262);
  });

  it('子が3歳になる月からは養育特例が効かない', () => {
    // 2024-05 生まれ：2027-04 分まで3歳未満。特例は 2027-02 分から → 12か月のうち3か月だけ守られる
    const birth = { year: 2024, month: 5, day: 10 };
    expect(isUnder3In(birth, '2027-04')).toBe(true);
    expect(isUnder3In(birth, '2027-05')).toBe(false);
    const r = evaluate({ ...base, reason: 'ikuji', childBirth: birth });
    expect(r.pensionLoss.ikujiMonths).toBe(3);
    expect(r.pensionLoss.withIkuji).toBe(Math.round(80_000 * (5.481 / 1000) * 9));
  });

  it('傷病手当金・出産手当金の日額：12か月とも改定後なら改定後の標準報酬月額で', () => {
    const r = evaluate(base);
    expect(r.allowance.without).toBe(kenpoDailyAmount(300_000).dailyAmount);
    expect(r.allowance.with).toBe(kenpoDailyAmount(220_000).dailyAmount);
    expect(r.allowance.without).toBe(6_667);
    expect(r.allowance.with).toBe(4_887);
  });

  it('特例の月数が6か月なら、平均の半分だけ下がる', () => {
    const r = evaluate({ ...base, tokureiMonths: 6 });
    expect(r.allowance.monthsInAverage).toBe(6);
    expect(r.allowance.with).toBe(dailyFromStandard(260_000).dailyAmount);
  });
});

describe('ページの文言', () => {
  it('registry に wip で載っている', () => {
    const t = tools.find((x) => x.slug === 'hoshu-kyugen-tokurei');
    expect(t?.stage).toBe('wip');
  });

  it('FAQ は仕様の8問（質問の形）', () => {
    expect(faq).toHaveLength(8);
    for (const f of faq) expect(f.q).toMatch(/[？?]$/);
    expect(title).toContain('報酬急減の特例改定');
  });

  it('FAQ の例の額は lib から出している（年金の減少 5,262円）', () => {
    expect(faq.map((f) => f.a).join('')).toContain('5,262円');
  });
});
