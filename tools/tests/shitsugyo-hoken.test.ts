import { describe, expect, it } from 'vitest';
import {
  AGE_MAX,
  BENEFIT_DAILY_MIN,
  BENEFIT_RATE_RULES,
  CERTIFICATION_INTERVAL_DAYS,
  RESTRICTION_MONTHS_BEFORE_REFORM,
  RESTRICTION_MONTHS_DEFAULT,
  RESTRICTION_MONTHS_LONG,
  TAPER_FROM,
  TENURE_BANDS,
  WAGE_DAILY_MIN,
  WAITING_DAYS,
  benefitDailyFrom,
  benefitRuleFor,
  buildSchedule,
  calcKihonTeate,
  prescribedDaysFor,
  restrictionFor,
  tenureBandFor,
  tokuteiAgeBandFor,
  wageDailyFrom,
  type BenefitAgeBand,
  type TenureBand,
} from '@/lib/shitsugyo-hoken';
import { formatDate, parseDate, type DateParts } from '@/lib/date-parts';

/**
 * 失業保険（雇用保険の基本手当）のテスト。
 *
 * 仕様: docs/features/shitsugyo-hoken-kihon-teate.md
 *
 * 数値はすべて一次情報から写した期待値で固定している。
 * 制度の数値は毎年8月1日に変わるので、**改定のときにここが落ちるのが正しい**
 * （落ちなければ、定数を入れ替えたつもりで入れ替わっていない）。
 *
 * 突き合わせている一次情報:
 * - 厚生労働省「基本手当日額の計算式及び金額(令和8年8月1日～)」
 *   https://www.mhlw.go.jp/content/001726936.pdf
 * - 厚生労働省リーフレット「雇用保険の基本手当日額が変更になります」
 *   https://www.mhlw.go.jp/content/001726934.pdf（給付率の帯ごとの基本手当日額）
 * - ハローワークインターネットサービス「基本手当の所定給付日数」
 * - 厚生労働省 LL070228保01（給付制限の注1・注2）
 */

const ymd = (iso: string): DateParts => {
  const parts = parseDate(iso);
  if (!parts) throw new Error(`テストの日付が不正: ${iso}`);
  return parts;
};

const ruleOf = (band: BenefitAgeBand) => BENEFIT_RATE_RULES.find((r) => r.band === band)!;

// ---------------------------------------------------------------- 賃金日額

describe('wageDailyFrom（賃金日額）', () => {
  it('賃金総額 ÷ 180 で、1円未満は切り捨てる', () => {
    const rule = benefitRuleFor(35);
    // 180万円 ÷ 180 = 10,000円ちょうど
    expect(wageDailyFrom(1_800_000, rule)).toEqual({ raw: 10_000, value: 10_000, cap: null });
    // 180万1円 ÷ 180 = 10,000.005… → 切り捨てて10,000円
    expect(wageDailyFrom(1_800_001, rule).raw).toBe(10_000);
    // 179万9999円 ÷ 180 = 9,999.99… → 切り捨てて9,999円
    expect(wageDailyFrom(1_799_999, rule).raw).toBe(9_999);
  });

  it('下限額（3,203円）を下回ると引き上げられる', () => {
    const rule = benefitRuleFor(25);
    const r = wageDailyFrom(180_000, rule); // 1,000円/日
    expect(r.raw).toBe(1_000);
    expect(r.value).toBe(WAGE_DAILY_MIN);
    expect(r.cap).toBe('min');
  });

  it('年齢区分ごとの上限額で頭打ちになる', () => {
    // 賃金総額600万円 → 33,333円/日。どの区分でも上限に当たる
    const cases: [number, number][] = [
      [29, 14_900],
      [30, 16_540],
      [44, 16_540],
      [45, 18_220],
      [59, 18_220],
      [60, 17_400],
      [64, 17_400],
    ];
    for (const [age, expected] of cases) {
      const r = wageDailyFrom(6_000_000, benefitRuleFor(age));
      expect(r.value, `${age}歳`).toBe(expected);
      expect(r.cap).toBe('max');
    }
  });

  it('上限と下限のあいだはそのままの額', () => {
    const rule = benefitRuleFor(40);
    expect(wageDailyFrom(180 * 8_000, rule)).toEqual({ raw: 8_000, value: 8_000, cap: null });
  });
});

// ------------------------------------------------------- 基本手当日額の算式

describe('benefitDailyFrom（基本手当日額の算式）', () => {
  it('賃金日額の下限額から下限の基本手当日額（2,562円）が出る', () => {
    // 3,203 × 0.8 = 2,562.4 → 切り捨てで2,562円
    for (const rule of BENEFIT_RATE_RULES) {
      expect(benefitDailyFrom(WAGE_DAILY_MIN, rule), rule.label).toBe(BENEFIT_DAILY_MIN);
    }
  });

  it('80%の帯（3,203円以上5,480円未満）は 2,562円〜4,383円', () => {
    for (const rule of BENEFIT_RATE_RULES) {
      expect(benefitDailyFrom(WAGE_DAILY_MIN, rule)).toBe(2_562);
      // 5,479 × 0.8 = 4,383.2 → 4,383円（帯の上端）
      expect(benefitDailyFrom(TAPER_FROM - 1, rule), rule.label).toBe(4_383);
    }
  });

  it('逓減帯の下端（5,480円）は 4,384円で、80%の帯と連続する', () => {
    for (const rule of BENEFIT_RATE_RULES) {
      expect(benefitDailyFrom(TAPER_FROM, rule), rule.label).toBe(4_384);
    }
  });

  it('60歳未満の逓減帯の上端（13,490円）は 6,745円', () => {
    for (const band of ['under30', 'age30to44', 'age45to59'] as const) {
      const rule = ruleOf(band);
      expect(benefitDailyFrom(13_490, rule), rule.label).toBe(6_745);
      // 13,490円「超」からは定率50%。連続していることも見る
      expect(benefitDailyFrom(13_491, rule)).toBe(6_745);
    }
  });

  it('60〜64歳の逓減帯の上端（12,120円）は 5,454円', () => {
    const rule = ruleOf('age60to64');
    expect(benefitDailyFrom(12_120, rule)).toBe(5_454);
    // 12,120円超からは定率45%
    expect(benefitDailyFrom(12_121, rule)).toBe(Math.floor(12_121 * 0.45));
  });

  it('年齢区分ごとの上限額（賃金日額が上限のとき基本手当日額も上限）', () => {
    for (const rule of BENEFIT_RATE_RULES) {
      expect(benefitDailyFrom(rule.wageDailyMax, rule), rule.label).toBe(rule.benefitDailyMax);
      // 上限を超える賃金日額を渡しても上限額のまま
      expect(benefitDailyFrom(rule.wageDailyMax + 5_000, rule)).toBe(rule.benefitDailyMax);
    }
  });

  it('上限額は厚労省の告知どおり（30歳未満7,450 / 30〜44歳8,270 / 45〜59歳9,110 / 60〜64歳7,830）', () => {
    expect(ruleOf('under30').benefitDailyMax).toBe(7_450);
    expect(ruleOf('age30to44').benefitDailyMax).toBe(8_270);
    expect(ruleOf('age45to59').benefitDailyMax).toBe(9_110);
    expect(ruleOf('age60to64').benefitDailyMax).toBe(7_830);
  });

  it('60〜64歳の逓減帯では「もう一つの算式（y = 0.05w + 4,848）」の低いほうを採る', () => {
    const rule = ruleOf('age60to64');
    const w = 9_000;
    const tapered = 0.8 * w - 0.35 * ((w - TAPER_FROM) / (rule.taperTo - TAPER_FROM)) * w;
    const alt = 0.05 * w + 4_848;
    // この賃金日額では alt のほうが低い（低いほうを採らないと過大に出る）
    expect(alt).toBeLessThan(tapered);
    expect(benefitDailyFrom(w, rule)).toBe(Math.floor(alt));
  });

  it('60〜64歳のもう一つの算式の切片は 12,120 × 0.4 = 4,848円', () => {
    expect(ruleOf('age60to64').altFormula).toEqual({ slope: 0.05, intercept: 4_848 });
  });

  it('賃金日額が上がれば基本手当日額は下がらない（帯の境目で逆転しない）', () => {
    for (const rule of BENEFIT_RATE_RULES) {
      let prev = 0;
      for (let w = WAGE_DAILY_MIN; w <= rule.wageDailyMax; w += 1) {
        const y = benefitDailyFrom(w, rule);
        expect(y, `${rule.label} 賃金日額${w}円`).toBeGreaterThanOrEqual(prev);
        prev = y;
      }
    }
  });

  it('基本手当日額は帯ごとに一次情報の範囲に収まる', () => {
    for (const rule of BENEFIT_RATE_RULES) {
      const taperTop = rule.band === 'age60to64' ? 5_454 : 6_745;
      expect(benefitDailyFrom(rule.taperTo, rule), rule.label).toBe(taperTop);
      for (let w = WAGE_DAILY_MIN; w <= rule.wageDailyMax; w += 7) {
        const y = benefitDailyFrom(w, rule);
        expect(y).toBeGreaterThanOrEqual(BENEFIT_DAILY_MIN);
        expect(y).toBeLessThanOrEqual(rule.benefitDailyMax);
      }
    }
  });
});

describe('benefitRuleFor（年齢区分の境目）', () => {
  it('29歳と30歳、44歳と45歳、59歳と60歳で区分が変わる', () => {
    expect(benefitRuleFor(29).band).toBe('under30');
    expect(benefitRuleFor(30).band).toBe('age30to44');
    expect(benefitRuleFor(44).band).toBe('age30to44');
    expect(benefitRuleFor(45).band).toBe('age45to59');
    expect(benefitRuleFor(59).band).toBe('age45to59');
    expect(benefitRuleFor(60).band).toBe('age60to64');
    expect(benefitRuleFor(64).band).toBe('age60to64');
  });

  it('65歳以上は上限の区分（60〜64歳）の表を当てる', () => {
    expect(benefitRuleFor(65).band).toBe('age60to64');
    expect(benefitRuleFor(70).band).toBe('age60to64');
  });
});

// ------------------------------------------------------------ 所定給付日数

describe('prescribedDaysFor（所定給付日数）', () => {
  it('一般の離職者は年齢で変わらない（90/90/90/120/150日）', () => {
    const expected: Record<TenureBand, number> = {
      lt1: 90,
      y1to5: 90,
      y5to10: 90,
      y10to20: 120,
      y20plus: 150,
    };
    for (const age of [22, 33, 41, 52, 63]) {
      for (const { value } of TENURE_BANDS) {
        expect(prescribedDaysFor({ category: 'ippan', age, tenure: value }).days).toBe(
          expected[value],
        );
      }
    }
  });

  it('特定受給資格者の表をそのまま引く', () => {
    // ハローワークインターネットサービス「基本手当の所定給付日数」の表1
    const table: [number, TenureBand, number][] = [
      [25, 'lt1', 90],
      [25, 'y1to5', 90],
      [25, 'y5to10', 120],
      [25, 'y10to20', 180],
      [32, 'lt1', 90],
      [32, 'y1to5', 120],
      [32, 'y5to10', 180],
      [32, 'y10to20', 210],
      [32, 'y20plus', 240],
      [40, 'lt1', 90],
      [40, 'y1to5', 150],
      [40, 'y5to10', 180],
      [40, 'y10to20', 240],
      [40, 'y20plus', 270],
      [50, 'lt1', 90],
      [50, 'y1to5', 180],
      [50, 'y5to10', 240],
      [50, 'y10to20', 270],
      [50, 'y20plus', 330],
      [62, 'lt1', 90],
      [62, 'y1to5', 150],
      [62, 'y5to10', 180],
      [62, 'y10to20', 210],
      [62, 'y20plus', 240],
    ];
    for (const [age, tenure, days] of table) {
      const r = prescribedDaysFor({ category: 'tokutei', age, tenure });
      expect(r.days, `${age}歳 × ${tenure}`).toBe(days);
      expect(r.adjusted).toBe(false);
    }
  });

  it('特定受給資格者の最長は45〜59歳・20年以上の330日', () => {
    const all = TENURE_BANDS.flatMap(({ value }) =>
      [25, 32, 40, 50, 62].map((age) => prescribedDaysFor({ category: 'tokutei', age, tenure: value }).days),
    );
    expect(Math.max(...all)).toBe(330);
  });

  it('30歳未満 × 20年以上は表に無いので、日数のある区分まで下げて断る', () => {
    const r = prescribedDaysFor({ category: 'tokutei', age: 25, tenure: 'y20plus' });
    expect(r.days).toBe(180); // 10年以上20年未満の欄
    expect(r.usedTenure).toBe('y10to20');
    expect(r.adjusted).toBe(true);
  });

  it('就職困難者は45歳未満で150/300日、45歳以上で150/360日', () => {
    expect(prescribedDaysFor({ category: 'konnan', age: 30, tenure: 'lt1' }).days).toBe(150);
    expect(prescribedDaysFor({ category: 'konnan', age: 44, tenure: 'y1to5' }).days).toBe(300);
    expect(prescribedDaysFor({ category: 'konnan', age: 44, tenure: 'y20plus' }).days).toBe(300);
    expect(prescribedDaysFor({ category: 'konnan', age: 45, tenure: 'lt1' }).days).toBe(150);
    expect(prescribedDaysFor({ category: 'konnan', age: 45, tenure: 'y1to5' }).days).toBe(360);
    expect(prescribedDaysFor({ category: 'konnan', age: 64, tenure: 'y20plus' }).days).toBe(360);
  });

  it('自己都合（一般）より会社都合（特定受給資格者）のほうが短くなることはない', () => {
    for (const age of [25, 32, 40, 50, 62]) {
      for (const { value } of TENURE_BANDS) {
        const ippan = prescribedDaysFor({ category: 'ippan', age, tenure: value }).days;
        const tokutei = prescribedDaysFor({ category: 'tokutei', age, tenure: value }).days;
        expect(tokutei, `${age}歳 × ${value}`).toBeGreaterThanOrEqual(ippan);
      }
    }
  });
});

describe('tenureBandFor / tokuteiAgeBandFor（区分の境目）', () => {
  it('被保険者であった期間は 1・5・10・20年で切り替わる', () => {
    expect(tenureBandFor(0)).toBe('lt1');
    expect(tenureBandFor(0.99)).toBe('lt1');
    expect(tenureBandFor(1)).toBe('y1to5');
    expect(tenureBandFor(4.9)).toBe('y1to5');
    expect(tenureBandFor(5)).toBe('y5to10');
    expect(tenureBandFor(9.9)).toBe('y5to10');
    expect(tenureBandFor(10)).toBe('y10to20');
    expect(tenureBandFor(19.9)).toBe('y10to20');
    expect(tenureBandFor(20)).toBe('y20plus');
    expect(tenureBandFor(40)).toBe('y20plus');
  });

  it('特定受給資格者の年齢区分は 30・35・45・60歳で切り替わる', () => {
    expect(tokuteiAgeBandFor(29)).toBe('under30');
    expect(tokuteiAgeBandFor(30)).toBe('age30to34');
    expect(tokuteiAgeBandFor(34)).toBe('age30to34');
    expect(tokuteiAgeBandFor(35)).toBe('age35to44');
    expect(tokuteiAgeBandFor(44)).toBe('age35to44');
    expect(tokuteiAgeBandFor(45)).toBe('age45to59');
    expect(tokuteiAgeBandFor(59)).toBe('age45to59');
    expect(tokuteiAgeBandFor(60)).toBe('age60to64');
  });
});

// ---------------------------------------------------------------- 給付制限

describe('restrictionFor（給付制限）', () => {
  it('会社都合などは給付制限なし', () => {
    const r = restrictionFor({ reason: 'company' });
    expect(r.months).toBe(0);
    expect(r.kind).toBe('none');
  });

  it('令和7年4月1日以降の自己都合は原則1ヶ月（「2ヶ月」は旧制度）', () => {
    const r = restrictionFor({ reason: 'self', leaveDate: '2026-08-31' });
    expect(r.months).toBe(RESTRICTION_MONTHS_DEFAULT);
    expect(r.months).toBe(1);
    expect(r.kind).toBe('default');
    expect(r.releasableByTraining).toBe(true);
  });

  it('離職日を渡さないときも改正後（1ヶ月）として扱う', () => {
    expect(restrictionFor({ reason: 'self' }).months).toBe(1);
  });

  it('令和7年3月31日以前の離職は改正前の2ヶ月', () => {
    const r = restrictionFor({ reason: 'self', leaveDate: '2025-03-31' });
    expect(r.months).toBe(RESTRICTION_MONTHS_BEFORE_REFORM);
    expect(r.kind).toBe('legacy');
    // 施行日ちょうどは改正後
    expect(restrictionFor({ reason: 'self', leaveDate: '2025-04-01' }).months).toBe(1);
  });

  it('5年内に2回以上の自己都合離職は3ヶ月（今回は回数に含めない）', () => {
    expect(restrictionFor({ reason: 'self', pastSelfLeaves: 1 }).months).toBe(1);
    const r = restrictionFor({ reason: 'self', pastSelfLeaves: 2 });
    expect(r.months).toBe(RESTRICTION_MONTHS_LONG);
    expect(r.kind).toBe('repeat');
    expect(restrictionFor({ reason: 'self', pastSelfLeaves: 5 }).months).toBe(3);
  });

  it('重責解雇は3ヶ月', () => {
    const r = restrictionFor({ reason: 'grave' });
    expect(r.months).toBe(3);
    expect(r.kind).toBe('grave');
  });

  it('教育訓練等を受けると給付制限が解除される', () => {
    expect(restrictionFor({ reason: 'self', training: true }).months).toBe(0);
    expect(restrictionFor({ reason: 'self', training: true }).kind).toBe('released');
    // 3ヶ月になる繰り返しの離職でも解除される
    expect(restrictionFor({ reason: 'self', pastSelfLeaves: 3, training: true }).months).toBe(0);
  });

  it('重責解雇は教育訓練等を受けても解除されない（一次情報の注2）', () => {
    const r = restrictionFor({ reason: 'grave', training: true });
    expect(r.months).toBe(3);
    expect(r.kind).toBe('grave');
    expect(r.releasableByTraining).toBe(false);
  });
});

// -------------------------------------------------------------- スケジュール

describe('buildSchedule（申請からの流れ）', () => {
  const base = {
    leaveDate: ymd('2026-08-31'),
    applyDate: ymd('2026-09-15'),
    prescribedDays: 90,
  };

  it('待期は受給資格決定日を1日目として7日（9/15申込 → 9/21満了）', () => {
    const s = buildSchedule({ ...base, restrictionMonths: 0 });
    expect(WAITING_DAYS).toBe(7);
    expect(formatDate(s.waitingEndDate)).toBe('2026-09-21');
    // 給付制限が無ければ翌日から支給対象
    expect(formatDate(s.benefitStartDate)).toBe('2026-09-22');
    expect(s.restrictionStartDate).toBeNull();
    expect(s.restrictionEndDate).toBeNull();
  });

  it('給付制限は待期満了日の翌日から起算し、応当日の前日に満了する', () => {
    const s = buildSchedule({ ...base, restrictionMonths: 1 });
    expect(formatDate(s.restrictionStartDate!)).toBe('2026-09-22');
    expect(formatDate(s.restrictionEndDate!)).toBe('2026-10-21');
    expect(formatDate(s.benefitStartDate)).toBe('2026-10-22');
  });

  it('給付制限3ヶ月でも同じ数え方になる', () => {
    const s = buildSchedule({ ...base, restrictionMonths: 3 });
    expect(formatDate(s.restrictionEndDate!)).toBe('2026-12-21');
    expect(formatDate(s.benefitStartDate)).toBe('2026-12-22');
  });

  it('応当日が無い月は末日に寄せる（1/31の1ヶ月後は2/28）', () => {
    const s = buildSchedule({
      leaveDate: ymd('2027-01-10'),
      applyDate: ymd('2027-01-25'),
      restrictionMonths: 1,
      prescribedDays: 90,
    });
    expect(formatDate(s.waitingEndDate)).toBe('2027-01-31');
    expect(formatDate(s.restrictionStartDate!)).toBe('2027-02-01');
    expect(formatDate(s.restrictionEndDate!)).toBe('2027-02-28');
  });

  it('支給対象期間は所定給付日数と同じ日数になる', () => {
    const s = buildSchedule({ ...base, restrictionMonths: 0 });
    // 9/22 から90日 → 90日目は12/20
    expect(formatDate(s.benefitStartDate)).toBe('2026-09-22');
    expect(formatDate(s.benefitEndDate)).toBe('2026-12-20');
  });

  it('受給期間は離職日の翌日から1年', () => {
    const s = buildSchedule({ ...base, restrictionMonths: 0 });
    // 8/31離職 → 9/1から1年 → 2027-08-31が満了日
    expect(formatDate(s.eligibilityEndDate)).toBe('2027-08-31');
    expect(s.fitsInEligibility).toBe(true);
    expect(s.overflowDays).toBe(0);
  });

  it('給付制限と所定給付日数が長いと受給期間からはみ出す', () => {
    const s = buildSchedule({
      leaveDate: ymd('2026-08-31'),
      applyDate: ymd('2026-11-30'), // 手続きが3ヶ月遅れた
      restrictionMonths: 3,
      prescribedDays: 330,
    });
    expect(s.fitsInEligibility).toBe(false);
    expect(s.overflowDays).toBeGreaterThan(0);
    // はみ出す日数 = 使い切る日 − 受給期間の満了日
    expect(formatDate(s.eligibilityEndDate)).toBe('2027-08-31');
  });
});

// ---------------------------------------------------------------- まとめ

describe('calcKihonTeate（全体）', () => {
  it('厚労省の例（29歳・賃金日額17,000円）は上限が当たって日額7,450円', () => {
    const r = calcKihonTeate({
      totalWage6m: 17_000 * 180,
      age: 29,
      tenure: 'y1to5',
      category: 'ippan',
      reason: 'self',
    });
    expect(r.wage.raw).toBe(17_000);
    expect(r.wage.value).toBe(14_900);
    expect(r.wage.cap).toBe('max');
    expect(r.benefitDaily).toBe(7_450);
    expect(r.atBenefitMax).toBe(true);
  });

  it('月給30万円・35歳・自己都合10年 → 日額と総額が出る', () => {
    const r = calcKihonTeate({
      totalWage6m: 300_000 * 6,
      age: 35,
      tenure: 'y10to20',
      category: 'ippan',
      reason: 'self',
    });
    // 1,800,000 ÷ 180 = 10,000円（逓減帯）
    expect(r.wage.value).toBe(10_000);
    // 0.8×10000 − 0.3×((10000−5480)/8010)×10000 = 8000 − 1692.88… = 6307.11… → 6,307円
    expect(r.benefitDaily).toBe(6_307);
    expect(r.prescribed.days).toBe(120);
    expect(r.total).toBe(6_307 * 120);
    expect(r.perCertification).toBe(6_307 * CERTIFICATION_INTERVAL_DAYS);
    expect(r.restriction.months).toBe(1);
  });

  it('同じ賃金でも会社都合なら日数が伸び、給付制限が消える', () => {
    const input = {
      totalWage6m: 300_000 * 6,
      age: 35,
      tenure: 'y10to20' as const,
      reason: 'company' as const,
    };
    const jiko = calcKihonTeate({ ...input, category: 'ippan', reason: 'self' });
    const kaisha = calcKihonTeate({ ...input, category: 'tokutei' });
    expect(kaisha.benefitDaily).toBe(jiko.benefitDaily);
    expect(kaisha.prescribed.days).toBe(240);
    expect(jiko.prescribed.days).toBe(120);
    expect(kaisha.restriction.months).toBe(0);
    expect(kaisha.total).toBeGreaterThan(jiko.total);
  });

  it('実効の給付率は上限に当たると50%を下回る', () => {
    const low = calcKihonTeate({
      totalWage6m: 6_000 * 180,
      age: 35,
      tenure: 'y1to5',
      category: 'ippan',
      reason: 'self',
    });
    const high = calcKihonTeate({
      totalWage6m: 30_000 * 180,
      age: 35,
      tenure: 'y1to5',
      category: 'ippan',
      reason: 'self',
    });
    expect(low.effectiveRate).toBeGreaterThan(0.5);
    // 賃金日額30,000円でも上限額16,540円で計算されるので、額面に対する率はもっと低い
    expect(high.benefitDaily / high.wage.raw).toBeLessThan(0.3);
  });

  it('離職日を渡すとスケジュールが付き、渡さないと null', () => {
    const withDate = calcKihonTeate({
      totalWage6m: 300_000 * 6,
      age: 35,
      tenure: 'y10to20',
      category: 'ippan',
      reason: 'self',
      leaveDate: ymd('2026-08-31'),
      applyDate: ymd('2026-09-15'),
    });
    expect(withDate.schedule).not.toBeNull();
    expect(formatDate(withDate.schedule!.benefitStartDate)).toBe('2026-10-22');

    const without = calcKihonTeate({
      totalWage6m: 300_000 * 6,
      age: 35,
      tenure: 'y10to20',
      category: 'ippan',
      reason: 'self',
    });
    expect(without.schedule).toBeNull();
  });

  it('受給資格決定日を省略すると離職日の2週間後として組み立てる', () => {
    const r = calcKihonTeate({
      totalWage6m: 300_000 * 6,
      age: 35,
      tenure: 'y10to20',
      category: 'ippan',
      reason: 'company',
      leaveDate: ymd('2026-08-31'),
    });
    expect(formatDate(r.schedule!.applyDate)).toBe('2026-09-14');
  });

  it('65歳以上は基本手当の対象外として印を付ける', () => {
    const r = calcKihonTeate({
      totalWage6m: 300_000 * 6,
      age: 66,
      tenure: 'y20plus',
      category: 'ippan',
      reason: 'company',
    });
    expect(r.age65OrOver).toBe(true);
    expect(AGE_MAX).toBe(64);
  });

  it('一般の離職者で被保険者であった期間が1年未満なら受給資格の注意を出す', () => {
    const r = calcKihonTeate({
      totalWage6m: 300_000 * 6,
      age: 30,
      tenure: 'lt1',
      category: 'ippan',
      reason: 'self',
    });
    expect(r.eligibilityCaution).toBe(true);
    // 会社都合（特定受給資格者）では出さない
    expect(
      calcKihonTeate({
        totalWage6m: 300_000 * 6,
        age: 30,
        tenure: 'lt1',
        category: 'tokutei',
        reason: 'company',
      }).eligibilityCaution,
    ).toBe(false);
  });

  it('賃金総額が0や負でも壊れず、下限額で計算される', () => {
    for (const totalWage6m of [0, -1_000_000]) {
      const r = calcKihonTeate({
        totalWage6m,
        age: 40,
        tenure: 'y1to5',
        category: 'ippan',
        reason: 'self',
      });
      expect(r.wage.value).toBe(WAGE_DAILY_MIN);
      expect(r.benefitDaily).toBe(BENEFIT_DAILY_MIN);
      expect(r.atBenefitMin).toBe(true);
      expect(r.total).toBe(BENEFIT_DAILY_MIN * 90);
    }
  });
});
