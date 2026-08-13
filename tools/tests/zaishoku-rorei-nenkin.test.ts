import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FISCAL_YEAR,
  FISCAL_YEARS,
  MISQUOTED_THRESHOLD,
  PENSION_STANDARD_MAX,
  THRESHOLD_AFTER_REFORM,
  THRESHOLD_BEFORE_REFORM,
  calcZaishoku,
  standardMonthlyFromSalary,
  thresholdOf,
} from '@/lib/zaishoku-rorei-nenkin';

/**
 * 在職老齢年金 計算機のテスト（docs/features/zaishoku-rorei-nenkin.md）。
 *
 * 見張っているのは4つ。
 *
 * 1. **令和8年度の支給停止調整額が65万円であること**。解説記事に多い62万円で
 *    計算すると、合計62万〜65万円の帯にいる人の結論が逆になる
 * 2. **一次情報の計算例がそのまま出ること**（基本月額10万円・総報酬月額相当額46万円）
 * 3. **境界条件**。全部支給停止でマイナスを出さない・老齢基礎年金を混ぜない・
 *    加給年金を基本月額に含めないが全部支給停止では止める
 * 4. **等級表を共有していること**。標準報酬月額は lib/shaho-grades.ts の
 *    1〜32等級（88,000〜650,000円）に丸める
 *
 * 一次情報（2026-08-13 取得）:
 * - https://www.nenkin.go.jp/tokusetsu/zairoukaisei.html
 * - https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/zaishoku/20150401-01.html
 */

/** 年額を渡すのが本来の入力なので、月額で考えたいテストのための変換 */
const yearly = (monthly: number) => monthly * 12;

describe('支給停止調整額（年度別の定数）', () => {
  it('令和8年度は65万円。「62万円」ではない', () => {
    expect(THRESHOLD_AFTER_REFORM).toBe(650_000);
    expect(thresholdOf(8)).toBe(650_000);
    // 解説記事に多い62万円は法律上の令和6年度水準の額で、実際に適用される額ではない
    expect(THRESHOLD_AFTER_REFORM).not.toBe(MISQUOTED_THRESHOLD);
  });

  it('令和7年度以前（改正前）は51万円', () => {
    expect(THRESHOLD_BEFORE_REFORM).toBe(510_000);
    expect(thresholdOf(7)).toBe(510_000);
  });

  it('既定の年度は令和8年度', () => {
    expect(DEFAULT_FISCAL_YEAR).toBe(8);
    expect(thresholdOf(DEFAULT_FISCAL_YEAR)).toBe(THRESHOLD_AFTER_REFORM);
  });

  it('知らない年度は既定の年度として扱う', () => {
    expect(thresholdOf(99)).toBe(THRESHOLD_AFTER_REFORM);
  });

  it('FISCAL_YEARS は新しい年度が先頭に来る', () => {
    const years = FISCAL_YEARS.map((f) => f.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years[0]).toBe(DEFAULT_FISCAL_YEAR);
  });
});

describe('一次情報の計算例', () => {
  /**
   * 日本年金機構「在職老齢年金制度が改正されました」の例。
   * 基本月額10万円・総報酬月額相当額46万円 → 合計56万円。
   * 改正後（65万円）は全額支給、改正前（51万円）なら2.5万円が支給停止。
   */
  const r = calcZaishoku({
    pensionYearly: yearly(100_000),
    standardMonthly: 460_000,
    bonusYearly: 0,
  });

  it('基本月額10万円・総報酬月額相当額46万円 → 合計56万円', () => {
    expect(r.basicMonthly).toBe(100_000);
    expect(r.totalRemunerationMonthly).toBe(460_000);
    expect(r.combined).toBe(560_000);
  });

  it('改正後（65万円）は全額支給', () => {
    expect(r.threshold).toBe(650_000);
    expect(r.suspendedMonthly).toBe(0);
    expect(r.payableMonthly).toBe(100_000);
    expect(r.fullySuspended).toBe(false);
  });

  it('改正前（51万円）なら 25,000円 が支給停止で 75,000円', () => {
    // 100,000 −（560,000 − 510,000）÷ 2 = 100,000 − 25,000 = 75,000
    expect(r.beforeReform.threshold).toBe(510_000);
    expect(r.beforeReform.suspendedMonthly).toBe(25_000);
    expect(r.beforeReform.payableMonthly).toBe(75_000);
  });

  it('改正で月25,000円・年30万円 増える', () => {
    expect(r.reformGainMonthly).toBe(25_000);
    expect(r.reformGainYearly).toBe(300_000);
  });

  it('あと9万円まで総報酬月額相当額を増やせる（65万円までの余裕）', () => {
    expect(r.headroom).toBe(90_000);
  });
});

describe('「62万円」で計算すると結論が逆になる帯', () => {
  /**
   * 合計が62万〜65万円の人は、62万円で計算すると「年金が減る」と出るが、
   * 実際に適用される65万円では全額支給になる。3万円ぶんの帯で結論が逆になる。
   */
  const r = calcZaishoku({
    pensionYearly: yearly(120_000),
    standardMonthly: 500_000,
    bonusYearly: 0,
  });

  it('合計62万円は65万円以下なので全額支給', () => {
    expect(r.combined).toBe(620_000);
    expect(r.combined).toBeGreaterThanOrEqual(MISQUOTED_THRESHOLD);
    expect(r.suspendedMonthly).toBe(0);
    expect(r.payableMonthly).toBe(120_000);
  });

  it('誤った62万円で計算すると支給停止が出てしまう（比較のための確認）', () => {
    // 62万円を基準にすると（620,000 − 620,000）÷2 = 0 なのでちょうどでは同じ。
    // 帯の内側（合計64万円）で差が出ることを確かめる
    const inBand = calcZaishoku({
      pensionYearly: yearly(120_000),
      standardMonthly: 520_000,
      bonusYearly: 0,
    });
    expect(inBand.combined).toBe(640_000);
    expect(inBand.suspendedMonthly).toBe(0); // 実際に適用される65万円では全額支給
    // 62万円で計算していたら（640,000 − 620,000）÷2 = 10,000円 止まっていた
    expect(Math.round((inBand.combined - MISQUOTED_THRESHOLD) / 2)).toBe(10_000);
  });
});

describe('支給停止の計算式', () => {
  it('合計が支給停止調整額ちょうどなら全額支給（境界値）', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(150_000),
      standardMonthly: 500_000,
      bonusYearly: 0,
    });
    expect(r.combined).toBe(650_000);
    expect(r.suspendedMonthly).toBe(0);
    expect(r.payableMonthly).toBe(150_000);
    expect(r.headroom).toBe(0);
  });

  it('超えた分の半分が止まる', () => {
    // 基本月額15万・総報酬月額相当額55万 → 合計70万。（70万−65万）÷2 = 2.5万
    const r = calcZaishoku({
      pensionYearly: yearly(150_000),
      standardMonthly: 550_000,
      bonusYearly: 0,
    });
    expect(r.combined).toBe(700_000);
    expect(r.suspendedMonthly).toBe(25_000);
    expect(r.payableMonthly).toBe(125_000);
    expect(r.fullySuspended).toBe(false);
    expect(r.headroom).toBe(0);
  });

  it('賞与は直近1年分を12で割って総報酬月額相当額に足す', () => {
    // 標準報酬月額50万 + 賞与120万÷12 = 10万 → 総報酬月額相当額60万
    const r = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: 500_000,
      bonusYearly: 1_200_000,
    });
    expect(r.totalRemunerationMonthly).toBe(600_000);
    expect(r.combined).toBe(700_000);
    expect(r.suspendedMonthly).toBe(25_000);
  });

  it('賞与が無くても計算できる（0円は普通にある）', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: 500_000,
      bonusYearly: 0,
    });
    expect(r.totalRemunerationMonthly).toBe(500_000);
    expect(r.suspendedMonthly).toBe(0);
  });
});

describe('境界条件1: 全部支給停止でマイナスを出さない', () => {
  /**
   * 基本月額10万・総報酬月額相当額90万 → 合計100万。
   * （100万 − 65万）÷2 = 17.5万 で基本月額10万を超えるため全部支給停止。
   * 「−7.5万円」とは表示しない。
   */
  const r = calcZaishoku({
    pensionYearly: yearly(100_000),
    standardMonthly: 900_000,
    bonusYearly: 0,
    kakyuYearly: yearly(33_000),
  });

  it('支給停止額は基本月額で頭打ちになり、支給額は0円', () => {
    expect(r.fullySuspended).toBe(true);
    expect(r.suspendedMonthly).toBe(100_000);
    expect(r.payableMonthly).toBe(0);
    expect(r.payableMonthly).toBeGreaterThanOrEqual(0);
  });

  it('全部支給停止のときは加給年金額も止まる（境界条件3）', () => {
    expect(r.kakyuMonthly).toBe(0);
  });

  it('全部支給停止でちょうど0になる境目でも支給額は0', () => {
    // 基本月額10万・総報酬月額相当額75万 → 合計85万。（85万−65万）÷2 = 10万
    const edge = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: 750_000,
      bonusYearly: 0,
    });
    expect(edge.suspendedMonthly).toBe(100_000);
    expect(edge.payableMonthly).toBe(0);
    expect(edge.fullySuspended).toBe(true);
  });
});

describe('境界条件2: 老齢基礎年金と経過的加算額は調整の対象外', () => {
  it('全部支給停止でも老齢基礎年金は全額受け取れる', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: 900_000,
      bonusYearly: 0,
      basicPensionYearly: yearly(68_000),
    });
    expect(r.payableMonthly).toBe(0);
    expect(r.basicPensionMonthly).toBe(68_000);
    expect(r.totalReceivedMonthly).toBe(68_000);
  });

  it('老齢基礎年金を入れても支給停止額は変わらない（合計に混ぜない）', () => {
    const base = {
      pensionYearly: yearly(150_000),
      standardMonthly: 550_000,
      bonusYearly: 0,
    };
    const without = calcZaishoku(base);
    const withBasic = calcZaishoku({ ...base, basicPensionYearly: yearly(68_000) });
    expect(withBasic.combined).toBe(without.combined);
    expect(withBasic.suspendedMonthly).toBe(without.suspendedMonthly);
    expect(withBasic.payableMonthly).toBe(without.payableMonthly);
    // 受取総額だけが老齢基礎年金のぶん増える
    expect(withBasic.totalReceivedMonthly).toBe(without.totalReceivedMonthly + 68_000);
  });

  it('省略したときは0として扱う', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: 400_000,
      bonusYearly: 0,
    });
    expect(r.basicPensionMonthly).toBe(0);
    expect(r.totalReceivedMonthly).toBe(100_000);
  });
});

describe('境界条件3: 加給年金額は基本月額に含めない', () => {
  it('加給年金を入れても基本月額・支給停止額は変わらない', () => {
    const base = {
      pensionYearly: yearly(150_000),
      standardMonthly: 550_000,
      bonusYearly: 0,
    };
    const without = calcZaishoku(base);
    const withKakyu = calcZaishoku({ ...base, kakyuYearly: yearly(33_000) });
    expect(withKakyu.basicMonthly).toBe(without.basicMonthly);
    expect(withKakyu.combined).toBe(without.combined);
    expect(withKakyu.suspendedMonthly).toBe(without.suspendedMonthly);
  });

  it('一部支給停止なら加給年金は全額受け取れる', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(150_000),
      standardMonthly: 550_000,
      bonusYearly: 0,
      kakyuYearly: yearly(33_000),
    });
    expect(r.fullySuspended).toBe(false);
    expect(r.kakyuMonthly).toBe(33_000);
    expect(r.totalReceivedMonthly).toBe(125_000 + 33_000);
  });
});

describe('改正前との比較', () => {
  it('改正前も全額支給なら差は0', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: 300_000,
      bonusYearly: 0,
    });
    expect(r.beforeReform.suspendedMonthly).toBe(0);
    expect(r.reformGainMonthly).toBe(0);
    expect(r.reformGainYearly).toBe(0);
  });

  it('改正前後で両方とも一部支給停止なら、差は7万円（＝14万円の半分）', () => {
    // 支給停止調整額が51万→65万に上がると、止まる額は（65万−51万）÷2 = 7万円 減る
    const r = calcZaishoku({
      pensionYearly: yearly(200_000),
      standardMonthly: 650_000,
      bonusYearly: 0,
    });
    expect(r.combined).toBe(850_000);
    expect(r.suspendedMonthly).toBe(100_000); // (850,000 − 650,000) ÷ 2
    expect(r.beforeReform.suspendedMonthly).toBe(170_000); // (850,000 − 510,000) ÷ 2
    expect(r.reformGainMonthly).toBe(70_000);
  });

  it('改正前は全部支給停止だった人が、改正後は一部支給になる', () => {
    // 基本月額8万・総報酬月額相当額62万 → 合計70万
    const r = calcZaishoku({
      pensionYearly: yearly(80_000),
      standardMonthly: 620_000,
      bonusYearly: 0,
    });
    // 改正前:（70万−51万）÷2 = 9.5万 ≧ 8万 → 全部支給停止
    expect(r.beforeReform.fullySuspended).toBe(true);
    expect(r.beforeReform.payableMonthly).toBe(0);
    // 改正後:（70万−65万）÷2 = 2.5万 → 5.5万は受け取れる
    expect(r.fullySuspended).toBe(false);
    expect(r.suspendedMonthly).toBe(25_000);
    expect(r.payableMonthly).toBe(55_000);
    expect(r.reformGainMonthly).toBe(55_000);
  });

  it('令和7年度を選ぶと、選んだ年度の結果と改正前の結果が一致する', () => {
    const r = calcZaishoku({
      pensionYearly: yearly(150_000),
      standardMonthly: 550_000,
      bonusYearly: 0,
      fiscalYear: 7,
    });
    expect(r.threshold).toBe(THRESHOLD_BEFORE_REFORM);
    expect(r.payableMonthly).toBe(r.beforeReform.payableMonthly);
    expect(r.reformGainMonthly).toBe(0);
  });
});

describe('標準報酬月額（lib/shaho-grades.ts の等級表を共有する）', () => {
  it('月給から厚生年金の標準報酬月額に丸める', () => {
    expect(standardMonthlyFromSalary(300_000)).toBe(300_000);
    expect(standardMonthlyFromSalary(310_000)).toBe(320_000);
  });

  it('厚生年金の上限は650,000円（32等級）で頭打ち', () => {
    expect(standardMonthlyFromSalary(2_000_000)).toBe(PENSION_STANDARD_MAX);
    expect(PENSION_STANDARD_MAX).toBe(650_000);
  });

  it('厚生年金の下限は88,000円', () => {
    expect(standardMonthlyFromSalary(50_000)).toBe(88_000);
    expect(standardMonthlyFromSalary(0)).toBe(88_000);
  });

  it('上限に達しているかを結果で知らせる', () => {
    const capped = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: standardMonthlyFromSalary(1_000_000),
      bonusYearly: 0,
    });
    expect(capped.standardMonthlyCapped).toBe(true);

    const notCapped = calcZaishoku({
      pensionYearly: yearly(100_000),
      standardMonthly: standardMonthlyFromSalary(400_000),
      bonusYearly: 0,
    });
    expect(notCapped.standardMonthlyCapped).toBe(false);
  });
});

describe('不正な入力', () => {
  it('負の年金額・標準報酬月額・賞与は0として扱う', () => {
    const r = calcZaishoku({
      pensionYearly: -1_200_000,
      standardMonthly: -300_000,
      bonusYearly: -600_000,
      basicPensionYearly: -100,
      kakyuYearly: -100,
    });
    expect(r.basicMonthly).toBe(0);
    expect(r.totalRemunerationMonthly).toBe(0);
    expect(r.suspendedMonthly).toBe(0);
    expect(r.payableMonthly).toBe(0);
    expect(r.totalReceivedMonthly).toBe(0);
    expect(r.headroom).toBe(650_000);
  });

  it('すべて0でも落ちない', () => {
    const r = calcZaishoku({ pensionYearly: 0, standardMonthly: 0, bonusYearly: 0 });
    expect(r.payableMonthly).toBe(0);
    expect(r.fullySuspended).toBe(false);
  });

  it('年額を12で割った端数は円未満四捨五入する', () => {
    // 1,000,000 ÷ 12 = 83,333.33… → 83,333
    const r = calcZaishoku({
      pensionYearly: 1_000_000,
      standardMonthly: 300_000,
      bonusYearly: 0,
    });
    expect(r.basicMonthly).toBe(83_333);
  });
});
