import { describe, expect, it } from 'vitest';
import {
  CORRESPONDENCE_DEFAULT_TUITION_PER_UNIT,
  CORRESPONDENCE_DEFAULT_UNITS,
  DEFAULT_YEARS,
  PRIVATE_FULLTIME_AVERAGE_TUITION,
  PUBLIC_FULLTIME_TUITION,
  SCHOOL_TYPE_LABELS,
  SUPPORT_LIMITS,
  UNITS_PER_YEAR_CAP,
  UNITS_TOTAL_CAP,
  calcKokoJugyoryo,
  defaultTuitionFor,
} from '@/lib/koko-jugyoryo';

/**
 * 高校授業料 実質負担 計算機のテスト。
 *
 * 仕様: docs/features/koko-jugyoryo-mushoka.md
 *
 * 一次情報は文部科学省「令和8年度高等学校等就学支援金制度等に関する
 * 都道府県担当者等説明会」資料（令和8年4月8日）の
 * p.4「改正後の支給限度額の年額」と p.24「支給期間・支給限度額」。
 */

describe('支給限度額の定数（一次資料と一致すること）', () => {
  it('令和8年4月1日施行の支給限度額（年額）と一致する', () => {
    // 文科省資料 p.4 の表：公立全日制 118,800円／私立全日制 457,200円
    expect(SUPPORT_LIMITS['public-fulltime']).toEqual({ kind: 'flat', yearly: 118_800 });
    expect(SUPPORT_LIMITS['private-fulltime']).toEqual({ kind: 'flat', yearly: 457_200 });
  });

  it('私立通信制の単位制授業料は1単位13,668円', () => {
    // 文科省資料 p.24：私立・高等学校通信制・単位制授業料の場合 13,668円/単位
    expect(SUPPORT_LIMITS['private-correspondence']).toEqual({ kind: 'unit', perUnit: 13_668 });
  });

  it('定額の支給限度額は月額×12と一致する（公立9,900円・私立38,100円）', () => {
    expect(9_900 * 12).toBe(118_800);
    expect(38_100 * 12).toBe(457_200);
  });

  it('単位制の上限単位数は年間30単位・通算74単位', () => {
    expect(UNITS_PER_YEAR_CAP).toBe(30);
    expect(UNITS_TOTAL_CAP).toBe(74);
  });

  it('公立全日制の授業料は支給限度額と同額（＝授業料の自己負担が残らない）', () => {
    expect(PUBLIC_FULLTIME_TUITION).toBe(118_800);
    expect(defaultTuitionFor('public-fulltime')).toBe(118_800);
  });

  it('私立全日制の初期値は全国授業料平均相当額（＝支給上限と同額）', () => {
    expect(PRIVATE_FULLTIME_AVERAGE_TUITION).toBe(457_200);
    expect(defaultTuitionFor('private-fulltime')).toBe(457_200);
  });

  it('進路の表示名が3種類そろっている', () => {
    expect(Object.keys(SCHOOL_TYPE_LABELS)).toEqual([
      'public-fulltime',
      'private-fulltime',
      'private-correspondence',
    ]);
  });
});

describe('公立（全日制）', () => {
  it('授業料は全額まかなわれ、自己負担は3年間で0円', () => {
    const r = calcKokoJugyoryo({ schoolType: 'public-fulltime' });
    expect(r.years).toBe(DEFAULT_YEARS);
    expect(r.totalTuition).toBe(118_800 * 3);
    expect(r.totalSupport).toBe(118_800 * 3);
    expect(r.totalTuitionOutOfPocket).toBe(0);
    expect(r.totalOutOfPocket).toBe(0);
  });

  it('授業料以外を入れると、その分だけが実質負担として残る', () => {
    const r = calcKokoJugyoryo({ schoolType: 'public-fulltime', otherCostsYearly: 150_000 });
    expect(r.totalTuitionOutOfPocket).toBe(0);
    expect(r.totalOtherCosts).toBe(450_000);
    expect(r.totalOutOfPocket).toBe(450_000);
  });
});

describe('私立（全日制）', () => {
  it('全国平均どおりの授業料なら自己負担は残らない', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: 457_200 });
    expect(r.totalSupport).toBe(457_200 * 3);
    expect(r.totalTuitionOutOfPocket).toBe(0);
  });

  it('上限を超える授業料は超過分が自己負担になる', () => {
    // 年60万円の学校: 600,000 − 457,200 = 142,800円/年 → 3年で428,400円
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: 600_000 });
    expect(r.perYear[0].support).toBe(457_200);
    expect(r.perYear[0].tuitionOutOfPocket).toBe(142_800);
    expect(r.totalTuitionOutOfPocket).toBe(428_400);
    expect(r.extraVsPublicTuition).toBe(428_400);
  });

  it('支給は授業料を超えない（限度額より安い学校は授業料の額まで）', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: 300_000 });
    expect(r.perYear[0].support).toBe(300_000);
    expect(r.perYear[0].tuitionOutOfPocket).toBe(0);
    // 差額の157,200円が現金でもらえるわけではない
    expect(r.totalSupport).toBe(900_000);
  });

  it('授業料以外は支援の対象外なので、そのまま総額に乗る', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-fulltime',
      yearlyTuition: 600_000,
      otherCostsYearly: 300_000,
    });
    expect(r.totalOutOfPocket).toBe(428_400 + 900_000);
  });
});

describe('私立（通信制・単位制）', () => {
  it('履修単位 × 13,668円が支給される（年30単位以内）', () => {
    // 25単位 × 13,668 = 341,700円。授業料は 25 × 15,000 = 375,000円
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 25,
      tuitionPerUnit: 15_000,
      years: 1,
    });
    expect(r.perYear[0].supportedUnits).toBe(25);
    expect(r.perYear[0].support).toBe(341_700);
    expect(r.perYear[0].tuition).toBe(375_000);
    expect(r.perYear[0].tuitionOutOfPocket).toBe(33_300);
    expect(r.cappedByYearlyUnits).toBe(false);
    expect(r.cappedByTotalUnits).toBe(false);
  });

  it('年間30単位を超えて履修しても、支給対象は30単位まで', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 36,
      tuitionPerUnit: 12_000,
      years: 1,
    });
    expect(r.perYear[0].supportedUnits).toBe(30);
    expect(r.perYear[0].support).toBe(30 * 13_668);
    // 授業料は36単位分かかる
    expect(r.perYear[0].tuition).toBe(36 * 12_000);
    expect(r.cappedByYearlyUnits).toBe(true);
  });

  it('通算74単位の上限は在学年数をまたいで効く（30+30+14）', () => {
    // 授業料を支給限度額より高くして、単位数の上限だけが効く状態にする
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 30,
      tuitionPerUnit: 20_000,
      years: 3,
    });
    expect(r.perYear.map((y) => y.supportedUnits)).toEqual([30, 30, 14]);
    expect(r.cappedByTotalUnits).toBe(true);
    // 支給対象は通算74単位ぶんだけ。3年目は16単位分が丸ごと自己負担になる
    expect(r.totalSupport).toBe(74 * 13_668);
    expect(r.totalTuition).toBe(90 * 20_000);
  });

  it('3年で74単位以内に収まる履修なら通算上限に当たらない', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 24,
      tuitionPerUnit: 20_000,
      years: 3,
    });
    expect(r.perYear.map((y) => y.supportedUnits)).toEqual([24, 24, 24]);
    expect(r.cappedByTotalUnits).toBe(false);
    expect(r.totalSupport).toBe(72 * 13_668);
  });

  it('授業料が支給限度額より安ければ、単位上限より先に授業料で頭打ちになる', () => {
    // 1単位12,000円（< 13,668円）なので、支給は実際に払う授業料までしか出ない
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 30,
      tuitionPerUnit: 12_000,
      years: 3,
    });
    expect(r.perYear.map((y) => y.support)).toEqual([360_000, 360_000, 14 * 13_668]);
    expect(r.totalSupport).toBe(360_000 * 2 + 14 * 13_668);
  });

  it('1単位あたりの授業料が支給限度額より安ければ、授業料の額までしか出ない', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 25,
      tuitionPerUnit: 8_000,
      years: 1,
    });
    expect(r.perYear[0].support).toBe(25 * 8_000);
    expect(r.perYear[0].tuitionOutOfPocket).toBe(0);
  });

  it('省略時は既定の単位数・単位あたり授業料が使われる', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-correspondence', years: 1 });
    expect(r.perYear[0].tuition).toBe(
      CORRESPONDENCE_DEFAULT_UNITS * CORRESPONDENCE_DEFAULT_TUITION_PER_UNIT
    );
    expect(r.perYear[0].supportedUnits).toBe(CORRESPONDENCE_DEFAULT_UNITS);
  });
});

describe('公立との比較（私立にした場合の追い金）', () => {
  it('公立は3年間で35万6,400円の授業料が全額まかなわれる', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: 457_200 });
    expect(r.publicComparison.totalTuition).toBe(356_400);
    expect(r.publicComparison.totalSupport).toBe(356_400);
    expect(r.publicComparison.totalTuitionOutOfPocket).toBe(0);
  });

  it('追い金は私立の授業料自己負担そのもの（公立の自己負担が0のため）', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: 700_000 });
    expect(r.extraVsPublicTuition).toBe(r.totalTuitionOutOfPocket);
    expect(r.extraVsPublicTuition).toBe((700_000 - 457_200) * 3);
  });

  it('公立を選んだ場合は追い金が0になる', () => {
    const r = calcKokoJugyoryo({ schoolType: 'public-fulltime' });
    expect(r.extraVsPublicTuition).toBe(0);
  });

  it('在学年数を変えると比較の基準も同じ年数で計算される', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: 600_000, years: 1 });
    expect(r.publicComparison.totalTuition).toBe(118_800);
    expect(r.extraVsPublicTuition).toBe(142_800);
  });
});

describe('入力の異常値', () => {
  it('負の授業料・負の費用は0として扱う', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-fulltime',
      yearlyTuition: -500_000,
      otherCostsYearly: -100_000,
    });
    expect(r.totalTuition).toBe(0);
    expect(r.totalSupport).toBe(0);
    expect(r.totalOutOfPocket).toBe(0);
  });

  it('負の単位数は0単位として扱う', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: -10,
      tuitionPerUnit: 12_000,
      years: 1,
    });
    expect(r.perYear[0].supportedUnits).toBe(0);
    expect(r.perYear[0].support).toBe(0);
  });

  it('単位数の小数は切り捨てる', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 25.9,
      tuitionPerUnit: 10_000,
      years: 1,
    });
    expect(r.perYear[0].supportedUnits).toBe(25);
  });

  it('NaN は0として扱う', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', yearlyTuition: Number.NaN });
    expect(r.totalTuition).toBe(0);
  });

  it('年数が0以下・NaN なら既定の3年に戻す', () => {
    expect(calcKokoJugyoryo({ schoolType: 'public-fulltime', years: 0 }).years).toBe(DEFAULT_YEARS);
    expect(calcKokoJugyoryo({ schoolType: 'public-fulltime', years: -3 }).years).toBe(DEFAULT_YEARS);
    expect(calcKokoJugyoryo({ schoolType: 'public-fulltime', years: Number.NaN }).years).toBe(
      DEFAULT_YEARS
    );
  });

  it('在学年数を1年・4年に変えられる（転入・単位制の在籍延長）', () => {
    expect(calcKokoJugyoryo({ schoolType: 'public-fulltime', years: 1 }).perYear).toHaveLength(1);
    expect(calcKokoJugyoryo({ schoolType: 'public-fulltime', years: 4 }).perYear).toHaveLength(4);
  });

  it('学年ごとの内訳は年数ぶんあり、1から連番になっている', () => {
    const r = calcKokoJugyoryo({ schoolType: 'private-fulltime', years: 3 });
    expect(r.perYear.map((y) => y.year)).toEqual([1, 2, 3]);
  });

  it('合計は学年ごとの内訳の合計と一致する', () => {
    const r = calcKokoJugyoryo({
      schoolType: 'private-correspondence',
      unitsPerYear: 30,
      tuitionPerUnit: 12_000,
      otherCostsYearly: 80_000,
      years: 3,
    });
    expect(r.totalTuition).toBe(r.perYear.reduce((a, y) => a + y.tuition, 0));
    expect(r.totalSupport).toBe(r.perYear.reduce((a, y) => a + y.support, 0));
    expect(r.totalOutOfPocket).toBe(r.totalTuitionOutOfPocket + r.totalOtherCosts);
  });
});
