import { describe, expect, it } from 'vitest';
import {
  CONTRIBUTION_UNIT,
  INNER_CAP_BEFORE,
  JOIN_AGE_LIMIT_AFTER,
  JOIN_AGE_LIMIT_BEFORE,
  LIMITS,
  MIN_CONTRIBUTION,
  REFORM_EFFECTIVE_FROM,
  SHARED_FRAME_AFTER,
  SHARED_FRAME_BEFORE,
  calcIdeco,
  calcSaving,
  contributionLimit,
  isReformApplied,
  type IdecoInput,
  type LimitInput,
} from '@/lib/ideco';

/**
 * iDeCo 拠出限度額・節税額 計算機のテスト
 * （docs/features/ideco-kyoshutsu-gendogaku.md）。
 *
 * 見張っているのは5つ。
 *
 * 1. **改正後の第2号は「62,000円 − 事業主掛金」であること**。仕様書が言うとおり
 *    この改正の本質は引き上げではなく合算ルールへの切り替えで、
 *    62,000円を固定の上限として扱うと、企業年金がある人に過大な額を出してしまう
 * 2. **改正前の内枠（20,000円）が改正後には残らないこと**。改正前は
 *    min(55,000 − 事業主掛金, 20,000) で頭打ちがあった
 * 3. **改正前後を必ず両方返すこと**。新しい額だけを見せると、いますぐ6.2万円
 *    出せると誤解される（施行は2026年12月1日）
 * 4. **節税額を税率の掛け算で出さないこと**。掛金で税率区分をまたぐ人に
 *    「税率20%だから ×20%」と掛けると、実際より大きな節税額が出る
 * 5. **掛金は5,000円以上・1,000円単位**。限度額の端数はそのままでは申し込めない
 *
 * 一次情報・確認先（2026-08-13 取得）:
 * - https://www.mhlw.go.jp/content/10600000/001365075.pdf
 * - https://dc.rakuten-sec.co.jp/about/revised/202505/
 * - https://info.monex.co.jp/news/2026/20260514_01.html
 */

/** 第2号・企業年金なしの既定の入力 */
const type2: LimitInput = {
  insured: 'type2',
  pension: 'none',
  employerContribution: 0,
};

/** 企業型DCがあり、事業主掛金が monthly 円の会社員 */
const withDc = (monthly: number): LimitInput => ({
  insured: 'type2',
  pension: 'dc',
  employerContribution: monthly,
});

describe('制度データ（限度額の定数）', () => {
  it('改正後の第2号は月62,000円、第1号は月75,000円', () => {
    expect(LIMITS.after.type2).toBe(62_000);
    expect(LIMITS.after.type1).toBe(75_000);
    expect(SHARED_FRAME_AFTER).toBe(62_000);
  });

  it('改正前は第1号68,000円・第2号（企業年金なし）23,000円・企業年金ありは55,000円枠の内枠20,000円', () => {
    expect(LIMITS.before.type1).toBe(68_000);
    expect(LIMITS.before.type2NoPension).toBe(23_000);
    expect(SHARED_FRAME_BEFORE).toBe(55_000);
    expect(INNER_CAP_BEFORE).toBe(20_000);
  });

  it('第3号は改正の前後で変わらない（23,000円のまま）', () => {
    expect(LIMITS.before.type3).toBe(23_000);
    expect(LIMITS.after.type3).toBe(23_000);
  });

  it('加入可能年齢は65歳未満から70歳未満に延びる', () => {
    expect(JOIN_AGE_LIMIT_BEFORE).toBe(65);
    expect(JOIN_AGE_LIMIT_AFTER).toBe(70);
  });
});

describe('施行日（2026年12月1日）', () => {
  it('施行日は2026-12-01', () => {
    expect(REFORM_EFFECTIVE_FROM).toBe('2026-12-01');
  });

  it('前日（11月30日）はまだ改正前の限度額', () => {
    expect(isReformApplied(new Date(2026, 10, 30))).toBe(false);
  });

  it('施行日当日から改正後の限度額', () => {
    expect(isReformApplied(new Date(2026, 11, 1))).toBe(true);
  });

  /**
   * Date どうしの比較では `new Date('2026-12-01')` がUTCの深夜になり、
   * 日本時間の11月30日中に切り替わってしまう。暦日の文字列で比較していることの確認。
   */
  it('日本時間の11月30日23時台はまだ切り替わらない', () => {
    expect(isReformApplied(new Date(2026, 10, 30, 23, 59))).toBe(false);
  });
});

describe('第2号被保険者・企業年金なし', () => {
  it('23,000円 → 62,000円（2.7倍）になる', () => {
    expect(contributionLimit(type2, 'before').monthly).toBe(23_000);
    expect(contributionLimit(type2, 'after').monthly).toBe(62_000);
  });

  it('差し引く事業主掛金が無いので、枠がそのまま限度額になる', () => {
    const after = contributionLimit(type2, 'after');
    expect(after.frame).toBe(62_000);
    expect(after.deducted).toBe(0);
    expect(after.reducedByDeduction).toBe(false);
    expect(after.cap).toBeNull();
    expect(after.yearly).toBe(744_000);
  });
});

describe('第2号被保険者・企業型DCあり（この改正の要）', () => {
  /**
   * 仕様書の表。改正後の上限は「62,000円 − 事業主掛金」で、
   * 勤め先の事業主掛金の額によって一人ひとり違う額になる。
   */
  it.each([
    { employer: 0, expected: 62_000 },
    { employer: 10_000, expected: 52_000 },
    { employer: 40_000, expected: 22_000 },
    { employer: 62_000, expected: 0 },
    { employer: 70_000, expected: 0 },
  ])('事業主掛金 $employer 円 → 改正後は $expected 円', ({ employer, expected }) => {
    expect(contributionLimit(withDc(employer), 'after').monthly).toBe(expected);
  });

  it('引き算をそのまま画面に出せる形で返す（62,000 − 40,000 = 22,000）', () => {
    const r = contributionLimit(withDc(40_000), 'after');
    expect(r.frame).toBe(62_000);
    expect(r.deducted).toBe(40_000);
    expect(r.afterDeduction).toBe(22_000);
    expect(r.monthly).toBe(22_000);
    expect(r.reducedByDeduction).toBe(true);
  });

  it('事業主掛金が枠を食い切ると拠出できない（blocked）', () => {
    const r = contributionLimit(withDc(62_000), 'after');
    expect(r.monthly).toBe(0);
    expect(r.blocked).toBe(true);
    expect(r.contributableMonthly).toBe(0);
  });

  it('改正前は min(55,000 − 事業主掛金, 20,000) で20,000円の頭打ちがあった', () => {
    // 55,000 − 10,000 = 45,000 だが、内枠20,000円で頭打ち
    const capped = contributionLimit(withDc(10_000), 'before');
    expect(capped.monthly).toBe(20_000);
    expect(capped.cap).toBe(20_000);
    expect(capped.cappedByInner).toBe(true);

    // 55,000 − 40,000 = 15,000 は内枠より小さいので、そのまま限度額になる
    const notCapped = contributionLimit(withDc(40_000), 'before');
    expect(notCapped.monthly).toBe(15_000);
    expect(notCapped.cappedByInner).toBe(false);
  });

  it('改正後は内枠（20,000円）が無い。62,000円を固定の上限として扱わない', () => {
    const after = contributionLimit(withDc(10_000), 'after');
    expect(after.cap).toBeNull();
    expect(after.cappedByInner).toBe(false);
    // 事業主掛金があるのに62,000円を返したら、合算ルールを実装できていない
    expect(after.monthly).not.toBe(62_000);
    expect(after.monthly).toBe(52_000);
  });

  it('DB等・両方でも式は同じ（差し引くのは掛金相当額の合計）', () => {
    const db = contributionLimit(
      { insured: 'type2', pension: 'db', employerContribution: 25_000 },
      'after',
    );
    const both = contributionLimit(
      { insured: 'type2', pension: 'both', employerContribution: 25_000 },
      'after',
    );
    expect(db.monthly).toBe(37_000);
    expect(both.monthly).toBe(37_000);
  });

  it('企業年金なしを選んでいれば、事業主掛金の入力値は無視される', () => {
    const r = contributionLimit(
      { insured: 'type2', pension: 'none', employerContribution: 30_000 },
      'after',
    );
    expect(r.monthly).toBe(62_000);
  });
});

describe('第1号・第3号被保険者', () => {
  const type1 = (fund: number): LimitInput => ({
    insured: 'type1',
    pension: 'none',
    employerContribution: 0,
    nationalPensionFund: fund,
  });

  it('第1号は68,000円 → 75,000円', () => {
    expect(contributionLimit(type1(0), 'before').monthly).toBe(68_000);
    expect(contributionLimit(type1(0), 'after').monthly).toBe(75_000);
  });

  it('第1号は国民年金基金の掛金・付加保険料と合算した枠になる', () => {
    const r = contributionLimit(type1(30_000), 'after');
    expect(r.frame).toBe(75_000);
    expect(r.deducted).toBe(30_000);
    expect(r.monthly).toBe(45_000);
  });

  it('第3号は改正の前後どちらも23,000円で、増えない', () => {
    const input: LimitInput = { insured: 'type3', pension: 'none', employerContribution: 0 };
    expect(contributionLimit(input, 'before').monthly).toBe(23_000);
    expect(contributionLimit(input, 'after').monthly).toBe(23_000);
  });

  it('負の入力は0として扱う', () => {
    expect(contributionLimit(withDc(-10_000), 'after').monthly).toBe(62_000);
    expect(contributionLimit(type1(-5_000), 'after').monthly).toBe(75_000);
  });
});

describe('実際に申し込める額（5,000円以上・1,000円単位）', () => {
  it('最低額と刻みの定数', () => {
    expect(MIN_CONTRIBUTION).toBe(5_000);
    expect(CONTRIBUTION_UNIT).toBe(1_000);
  });

  it('限度額の1,000円未満は切り捨てになる（51,500円 → 51,000円）', () => {
    const r = contributionLimit(withDc(10_500), 'after');
    expect(r.monthly).toBe(51_500);
    expect(r.contributableMonthly).toBe(51_000);
  });

  it('限度額が5,000円に届かなければ拠出できない', () => {
    const r = contributionLimit(withDc(58_000), 'after');
    expect(r.monthly).toBe(4_000);
    expect(r.contributableMonthly).toBe(0);
    // 制度上の限度額は0ではないので blocked ではない（申し込めないだけ）
    expect(r.blocked).toBe(false);
  });

  it('ちょうど5,000円なら申し込める', () => {
    expect(contributionLimit(withDc(57_000), 'after').contributableMonthly).toBe(5_000);
  });
});

/** 年収500万円・企業年金なしの会社員（社会保険料は推計） */
const salaryInput: IdecoInput = {
  ...type2,
  age: 40,
  incomeMode: 'salary',
  income: 5_000_000,
  taxableIncome: 0,
  socialInsurance: null,
  kaigo: false,
  contributionMonthly: null,
  asOf: new Date(2026, 11, 1),
};

describe('節税額', () => {
  it('掛金の全額が所得控除になる（住民税は一律10%）', () => {
    const r = calcSaving(
      { ...salaryInput, incomeMode: 'taxable', taxableIncome: 5_000_000 },
      240_000,
    );
    expect(r.residentTax).toBe(24_000);
  });

  it('所得税には復興特別所得税（2.1%）が乗る', () => {
    // 課税所得500万円は税率20%の区分。240,000円を引いても区分は変わらない
    const r = calcSaving(
      { ...salaryInput, incomeMode: 'taxable', taxableIncome: 5_000_000 },
      240_000,
    );
    expect(r.rate).toBe(0.2);
    expect(r.incomeTax).toBe(Math.floor(240_000 * 0.2 * 1.021));
    expect(r.total).toBe(r.incomeTax + 24_000);
  });

  /**
   * 仕様書が求めているのは「拠出額 ×（所得税率 + 住民税率）」だが、掛金で税率区分を
   * またぐ人にそのまま掛けると過大になる。税額の差で出していることの確認。
   */
  it('掛金で税率区分をまたぐ人は、税率の掛け算より小さくなる', () => {
    // 課税所得340万円（税率20%）→ 744,000円を引くと 2,656,000円（税率10%）
    const r = calcSaving(
      { ...salaryInput, incomeMode: 'taxable', taxableIncome: 3_400_000 },
      744_000,
    );
    const naive = Math.floor(744_000 * 0.2 * 1.021);
    expect(r.incomeTax).toBeLessThan(naive);
    // 速算表の差額（252,500 − 168,100 = 84,400）に復興特別所得税を乗せた額
    expect(r.incomeTax).toBe(Math.floor(84_400 * 1.021));
  });

  it('課税所得が無ければ節税にならない（0を返し、マイナスにしない）', () => {
    const r = calcSaving({ ...salaryInput, incomeMode: 'taxable', taxableIncome: 0 }, 744_000);
    expect(r.incomeTax).toBe(0);
    expect(r.residentTax).toBe(0);
    expect(r.total).toBe(0);
    expect(r.noTaxableIncome).toBe(true);
    expect(r.effectiveRate).toBe(0);
  });

  it('課税所得より掛金が多くても、減る税額の分までしか返さない', () => {
    const r = calcSaving(
      { ...salaryInput, incomeMode: 'taxable', taxableIncome: 300_000 },
      744_000,
    );
    // 課税所得30万円ぶんの税金（所得税5% + 住民税10%）が上限
    expect(r.incomeTax).toBe(Math.floor(15_000 * 1.021));
    expect(r.residentTax).toBe(30_000);
  });

  it('年収モードでは社会保険料を推計し、推計であることを返す', () => {
    const r = calcSaving(salaryInput, 744_000);
    expect(r.socialInsuranceEstimated).toBe(true);
    expect(r.socialInsurance).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(0);
  });

  it('社会保険料を入れれば推計しない', () => {
    const r = calcSaving({ ...salaryInput, socialInsurance: 800_000 }, 744_000);
    expect(r.socialInsuranceEstimated).toBe(false);
    expect(r.socialInsurance).toBe(800_000);
  });

  it('社会保険料が大きいほど課税所得が下がり、節税額も小さくなる', () => {
    const light = calcSaving({ ...salaryInput, socialInsurance: 300_000 }, 744_000);
    const heavy = calcSaving({ ...salaryInput, socialInsurance: 900_000 }, 744_000);
    expect(heavy.taxableIncomeTax).toBeLessThan(light.taxableIncomeTax);
    expect(heavy.total).toBeLessThanOrEqual(light.total);
  });

  it('掛金が0なら節税額も0', () => {
    const r = calcSaving(salaryInput, 0);
    expect(r.total).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });
});

describe('calcIdeco（全体）', () => {
  const r = calcIdeco(salaryInput);

  it('改正前と改正後の限度額を必ず両方返す', () => {
    expect(r.before.monthly).toBe(23_000);
    expect(r.after.monthly).toBe(62_000);
    expect(r.gainMonthly).toBe(39_000);
    expect(r.gainYearly).toBe(468_000);
    expect(r.gainRatio).toBeCloseTo(62 / 23, 5);
  });

  it('基準日で「いま適用される限度額」が切り替わる', () => {
    const now = calcIdeco({ ...salaryInput, asOf: new Date(2026, 7, 13) });
    expect(now.reformApplied).toBe(false);
    expect(now.current.monthly).toBe(23_000);

    const dec = calcIdeco({ ...salaryInput, asOf: new Date(2026, 11, 1) });
    expect(dec.reformApplied).toBe(true);
    expect(dec.current.monthly).toBe(62_000);

    // 基準日が変わっても、比較のための両方の額は変わらない
    expect(now.after.monthly).toBe(dec.after.monthly);
    expect(now.before.monthly).toBe(dec.before.monthly);
  });

  it('拠出額を省略すると、申し込める最大額で計算する', () => {
    expect(r.contributionMonthly).toBe(62_000);
    expect(r.contributionYearly).toBe(744_000);
    expect(r.contributionAtLimit).toBe(true);
  });

  it('限度額を超える拠出額は限度額まで切り下げる', () => {
    const over = calcIdeco({ ...salaryInput, contributionMonthly: 100_000 });
    expect(over.contributionMonthly).toBe(62_000);
  });

  it('拠出額を減らすと節税額も減る', () => {
    const half = calcIdeco({ ...salaryInput, contributionMonthly: 31_000 });
    expect(half.contributionYearly).toBe(372_000);
    expect(half.saving.total).toBeLessThan(r.saving.total);
    expect(half.contributionAtLimit).toBe(false);
  });

  it('改正前の限度額で拠出した場合の節税額も返す（比較用）', () => {
    expect(r.savingBefore.total).toBeGreaterThan(0);
    expect(r.savingBefore.total).toBeLessThan(r.saving.total);
  });

  it('限度額いっぱいでも節税額は掛金の全額にはならない（税率ぶんだけ戻る）', () => {
    expect(r.saving.total).toBeLessThan(r.contributionYearly);
    expect(r.saving.effectiveRate).toBeGreaterThan(0);
    expect(r.saving.effectiveRate).toBeLessThan(1);
  });
});

describe('加入可能年齢までの累計', () => {
  it('40歳なら65歳まで300ヶ月、70歳まで360ヶ月', () => {
    const r = calcIdeco(salaryInput);
    expect(r.cumulativeBefore.months).toBe(300);
    expect(r.cumulativeAfter.months).toBe(360);
    expect(r.cumulativeBefore.untilAge).toBe(65);
    expect(r.cumulativeAfter.untilAge).toBe(70);
  });

  it('累計の拠出額は 月額 × 月数', () => {
    const r = calcIdeco(salaryInput);
    expect(r.cumulativeAfter.contribution).toBe(62_000 * 360);
    expect(r.cumulativeBefore.contribution).toBe(62_000 * 300);
  });

  it('加入可能年齢が5年延びるぶん、累計の節税額が増える', () => {
    const r = calcIdeco(salaryInput);
    expect(r.cumulativeSavingGain).toBe(
      r.cumulativeAfter.saving - r.cumulativeBefore.saving,
    );
    expect(r.cumulativeSavingGain).toBeGreaterThan(0);
  });

  it('66歳は改正前なら加入できず（0ヶ月）、改正後は48ヶ月', () => {
    const r = calcIdeco({ ...salaryInput, age: 66 });
    expect(r.cumulativeBefore.months).toBe(0);
    expect(r.cumulativeBefore.contribution).toBe(0);
    expect(r.cumulativeBefore.saving).toBe(0);
    expect(r.cumulativeAfter.months).toBe(48);
  });

  it('70歳以上はどちらも0ヶ月', () => {
    const r = calcIdeco({ ...salaryInput, age: 72 });
    expect(r.cumulativeBefore.months).toBe(0);
    expect(r.cumulativeAfter.months).toBe(0);
    expect(r.cumulativeSavingGain).toBe(0);
  });
});

describe('企業型DCがある会社員の全体像', () => {
  /** 事業主掛金4万円。改正後は 62,000 − 40,000 = 22,000 円 */
  const r = calcIdeco({
    ...salaryInput,
    pension: 'dc',
    employerContribution: 40_000,
  });

  it('改正前15,000円 → 改正後22,000円', () => {
    expect(r.before.monthly).toBe(15_000);
    expect(r.after.monthly).toBe(22_000);
    expect(r.gainMonthly).toBe(7_000);
  });

  it('企業年金なしの人（62,000円）より小さい額になる', () => {
    expect(r.after.monthly).toBeLessThan(calcIdeco(salaryInput).after.monthly);
  });

  it('拠出できない人は節税額も0', () => {
    const blocked = calcIdeco({
      ...salaryInput,
      pension: 'dc',
      employerContribution: 62_000,
    });
    expect(blocked.after.blocked).toBe(true);
    expect(blocked.contributionMonthly).toBe(0);
    expect(blocked.saving.total).toBe(0);
    expect(blocked.cumulativeAfter.contribution).toBe(0);
  });
});
