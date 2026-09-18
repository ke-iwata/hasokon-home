import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANNUAL_WORK_DAYS,
  DEFAULT_DAILY_HOURS,
  MONTHLY_OVERTIME_THRESHOLD,
  PREMIUM_RATES,
  calcZangyodai,
  displayYen,
  hoursFrom,
  monthlyAverageHours,
  roundHoursSimplified,
  roundYenSimplified,
  workDaysFromHolidays,
  type ZangyodaiInput,
  type ZangyodaiRow,
} from '@/lib/zangyodai';
import { prefectureByCode } from '@/lib/saitei-chingin';

/**
 * 残業代（割増賃金）計算のテスト。
 *
 * 仕様: docs/features/zangyodai-keisan.md
 *
 * 金額は**丸める前の値**を `toBeCloseTo` で固定する（法令どおりモードは
 * 小数第2位まで持ち、円への丸めは表示側の仕事なので別に見る）。
 */

/** 月給30万円・年間所定労働日数245日・1日8時間の標準的な入力 */
const base: ZangyodaiInput = {
  wageType: 'monthly',
  monthlyWage: 300_000,
  dailyHours: 8,
  annualWorkDays: 245,
};

/** 上の前提での1時間あたりの賃金（300,000 ÷ 163.333…） */
const RATE = 300_000 / ((245 * 8) / 12);

const rowOf = (rows: ZangyodaiRow[], key: ZangyodaiRow['key']) => rows.find((r) => r.key === key);

describe('1時間あたりの賃金（施行規則19条1項4号）', () => {
  it('1か月平均所定労働時間 = 年間所定労働日数 × 1日の所定労働時間 ÷ 12', () => {
    expect(monthlyAverageHours(245, 8)).toBeCloseTo(163.33, 2);
    expect(monthlyAverageHours(260, 7.5)).toBeCloseTo(162.5, 2);
  });

  it('月給30万円・245日・8時間なら単価は1,836.73円', () => {
    const r = calcZangyodai(base);
    expect(r.monthlyAverageHours).toBeCloseTo(163.33, 2);
    expect(r.hourlyRate).toBeCloseTo(1836.73, 2);
    expect(r.baseWage).toBe(300_000);
  });

  it('既定値（8時間・245日）は省略しても同じ結果になる', () => {
    expect(DEFAULT_DAILY_HOURS).toBe(8);
    expect(DEFAULT_ANNUAL_WORK_DAYS).toBe(245);
    const omitted = calcZangyodai({ monthlyWage: 300_000, hours: { overtime: 10 } });
    const explicit = calcZangyodai({ ...base, hours: { overtime: 10 } });
    expect(omitted.total).toBeCloseTo(explicit.total, 6);
  });

  it('年間休日数からの目安は 365 − 休日数（閏年は366なのであくまで目安）', () => {
    expect(workDaysFromHolidays(120)).toBe(245);
    expect(workDaysFromHolidays(105)).toBe(260);
  });

  it('時間と分から時間単位の小数を作る', () => {
    expect(hoursFrom(1, 30)).toBeCloseTo(1.5, 6);
    expect(hoursFrom(10, 0)).toBe(10);
    expect(hoursFrom(0, 45)).toBeCloseTo(0.75, 6);
  });
});

describe('割増賃金の基本（労基法37条）', () => {
  it('時間外10時間は単価×1.25×10＝22,959.18円（丸める前）', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 10 } });
    expect(r.total).toBeCloseTo(22_959.18, 2);
    expect(rowOf(r.rows, 'overtime')?.rate).toBe(1.25);
    expect(rowOf(r.rows, 'overtime')?.hours).toBe(10);
  });

  it('表示は円未満を切り上げる（切り捨ては労働者に不利なので採らない）', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 10 } });
    expect(displayYen(r.total)).toBe(22_960);
    expect(displayYen(22_959.0001)).toBe(22_960);
    // ちょうど円のときは切り上げない
    expect(displayYen(22_960)).toBe(22_960);
  });

  it('残業が無ければ0円で、内訳の行も出ない', () => {
    const r = calcZangyodai(base);
    expect(r.total).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it('法定内残業（所定7時間の会社の8時間目）は割増なしの1.00', () => {
    const input = { ...base, dailyHours: 7, hours: { withinStatutory: 5 } };
    const r = calcZangyodai(input);
    const rate = 300_000 / ((245 * 7) / 12);
    expect(r.hourlyRate).toBeCloseTo(rate, 6);
    expect(rowOf(r.rows, 'withinStatutory')?.rate).toBe(1);
    expect(r.total).toBeCloseTo(rate * 5, 6);
  });

  it('所定労働時間内の深夜（夜勤）は割増分の0.25だけが乗る', () => {
    const r = calcZangyodai({ ...base, hours: { scheduledNight: 8 } });
    expect(r.total).toBeCloseTo(RATE * 0.25 * 8, 6);
    expect(rowOf(r.rows, 'night')?.rate).toBe(0.25);
  });
});

describe('月60時間を超える時間外（37条1項ただし書）', () => {
  it('70時間なら 60時間×1.25 ＋ 10時間×1.50', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 70 } });
    expect(r.overtimeWithin60).toBe(60);
    expect(r.overtimeOver60).toBe(10);
    expect(r.total).toBeCloseTo(RATE * (60 * 1.25 + 10 * 1.5), 6);
  });

  it('ちょうど60時間なら超過分は0（境目）', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: MONTHLY_OVERTIME_THRESHOLD } });
    expect(r.overtimeOver60).toBe(0);
    expect(rowOf(r.rows, 'overtimeOver60')).toBeUndefined();
    expect(r.total).toBeCloseTo(RATE * 60 * 1.25, 6);
  });

  it('法定休日労働は60時間の算定に入らない', () => {
    const withHoliday = calcZangyodai({ ...base, hours: { overtime: 55, holiday: 8 } });
    expect(withHoliday.overtimeOver60).toBe(0);
    expect(withHoliday.total).toBeCloseTo(RATE * (55 * 1.25 + 8 * 1.35), 6);
  });
});

describe('法定休日労働（割増賃金令）', () => {
  it('10時間働いても1.35のまま（8時間超で1.25を重ねない）', () => {
    const r = calcZangyodai({ ...base, hours: { holiday: 10 } });
    expect(r.total).toBeCloseTo(RATE * 10 * 1.35, 6);
    expect(rowOf(r.rows, 'holiday')?.rate).toBe(PREMIUM_RATES.holiday);
  });

  it('うち深夜2時間なら 8時間×1.35 ＋ 2時間×1.60', () => {
    const r = calcZangyodai({ ...base, hours: { holiday: 10, holidayNight: 2 } });
    expect(r.total).toBeCloseTo(RATE * (8 * 1.35 + 2 * 1.6), 6);
  });
});

describe('深夜の重なり（37条4項）', () => {
  it('時間外5時間のうち深夜2時間なら 3時間×1.25 ＋ 2時間×1.50', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 5, overtimeNight: 2 } });
    expect(r.total).toBeCloseTo(RATE * (3 * 1.25 + 2 * 1.5), 6);
  });

  it('60時間超と深夜が重なれば1.75になる', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 70, overtimeNight: 10 } });
    // 60時間×1.25 ＋ 10時間×1.50 に、深夜10時間ぶんの +0.25 が乗る
    expect(r.total).toBeCloseTo(RATE * (60 * 1.25 + 10 * 1.75), 6);
  });

  it('「うち深夜」は親の時間を超えない（超える入力は頭打ち）', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 3, overtimeNight: 5 } });
    expect(r.nightHours).toBe(3);
    expect(r.total).toBeCloseTo(RATE * 3 * 1.5, 6);
  });

  it('深夜は時間外・法定休日・所定内をまとめて1行の加算にする', () => {
    const r = calcZangyodai({
      ...base,
      hours: { overtime: 5, overtimeNight: 2, holiday: 8, holidayNight: 3, scheduledNight: 4 },
    });
    expect(r.nightHours).toBe(9);
    expect(rowOf(r.rows, 'night')?.hours).toBe(9);
    expect(r.total).toBeCloseTo(RATE * (5 * 1.25 + 8 * 1.35 + 9 * 0.25), 6);
  });
});

describe('除外できる手当（施行規則21条・最低賃金法施行規則1条）', () => {
  it('通勤手当(i)は単価から外れ、精皆勤手当(iii)は単価に残る', () => {
    const r = calcZangyodai({
      ...base,
      allowances: { commuteFamily: 10_000, attendance: 5_000 },
    });
    expect(r.baseWage).toBe(290_000);
    expect(r.hourlyRate).toBeCloseTo(290_000 / ((245 * 8) / 12), 6);
  });

  it('住宅手当(ii)は単価から外れるが、最低賃金の対象賃金には残る', () => {
    const r = calcZangyodai({
      ...base,
      allowances: { commuteFamily: 10_000, housing: 20_000, attendance: 5_000 },
    });
    // 割増の算定基礎: 月給 −(i)−(ii)
    expect(r.baseWage).toBe(270_000);
    // 最低賃金の対象賃金: 月給 −(i)−(iii)。住宅手当は含め、精皆勤手当を除く（割増と逆）
    expect(r.minWageBaseWage).toBe(285_000);
    expect(r.minWageHourly).toBeCloseTo(285_000 / ((245 * 8) / 12), 6);
  });

  it('手当が月給を上回っても単価は負にならない', () => {
    const r = calcZangyodai({ ...base, allowances: { commuteFamily: 500_000 } });
    expect(r.baseWage).toBe(0);
    expect(r.hourlyRate).toBe(0);
  });
});

describe('最低賃金との比較（lib/saitei-chingin.ts の checkWage を共有）', () => {
  it('都道府県を選ぶと「対象賃金 ÷ 月平均所定労働時間」で判定する', () => {
    const r = calcZangyodai({
      ...base,
      allowances: { commuteFamily: 10_000, attendance: 5_000 },
      prefectureCode: 13,
    });
    expect(r.minWageCheck?.prefecture.name).toBe('東京');
    expect(r.minWageCheck?.hourlyYen).toBeCloseTo(285_000 / ((245 * 8) / 12), 6);
    // 東京の最低賃金は checkWage 側が持つ。ここでは同じ値を見ていることだけ確かめる
    expect(r.minWageCheck?.current.minimumYen).toBe(prefectureByCode(13)?.currentYen);
  });

  it('都道府県を選ばなければ比較結果を返さない', () => {
    expect(calcZangyodai(base).minWageCheck).toBeUndefined();
    expect(calcZangyodai({ ...base, prefectureCode: null }).minWageCheck).toBeUndefined();
  });

  it('時給制では時給をそのまま最低賃金と比べる', () => {
    const r = calcZangyodai({ wageType: 'hourly', hourlyWage: 1_000, prefectureCode: 13 });
    expect(r.minWageHourly).toBe(1_000);
    expect(r.minWageCheck?.hourlyYen).toBe(1_000);
  });

  it('最低賃金を下回っていれば meets が false になる', () => {
    const tokyo = prefectureByCode(13);
    const r = calcZangyodai({
      wageType: 'hourly',
      hourlyWage: (tokyo?.currentYen ?? 1_226) - 1,
      prefectureCode: 13,
    });
    expect(r.minWageCheck?.current.meets).toBe(false);
  });
});

describe('端数処理（基発150号の簡便法）', () => {
  it('1か月の時間数は30分未満を切り捨て、30分以上を切り上げる', () => {
    expect(roundHoursSimplified(hoursFrom(10, 29))).toBe(10);
    expect(roundHoursSimplified(hoursFrom(10, 30))).toBe(11);
    expect(roundHoursSimplified(hoursFrom(10, 59))).toBe(11);
    expect(roundHoursSimplified(10)).toBe(10);
  });

  it('円未満は50銭未満を切り捨て、50銭以上を切り上げる', () => {
    expect(roundYenSimplified(1_000.49)).toBe(1_000);
    expect(roundYenSimplified(1_000.5)).toBe(1_001);
  });

  it('簡便法では時間外の合計に30分ルールが当たる', () => {
    const under = calcZangyodai({
      ...base,
      rounding: 'simplified',
      hours: { overtime: hoursFrom(10, 29) },
    });
    const over = calcZangyodai({
      ...base,
      rounding: 'simplified',
      hours: { overtime: hoursFrom(10, 30) },
    });
    expect(under.hours.overtime).toBe(10);
    expect(over.hours.overtime).toBe(11);
  });

  it('簡便法では単価も金額も円になる', () => {
    const r = calcZangyodai({ ...base, rounding: 'simplified', hours: { overtime: 10 } });
    // 1,836.7346… → 50銭以上の切り上げで 1,837円
    expect(r.hourlyRate).toBe(1_837);
    expect(r.total).toBe(Math.round(1_837 * 1.25 * 10));
    expect(Number.isInteger(r.total)).toBe(true);
  });

  it('法令どおり（既定）は丸めない', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: hoursFrom(10, 29) } });
    expect(r.hours.overtime).toBeCloseTo(hoursFrom(10, 29), 6);
    expect(Number.isInteger(r.total)).toBe(false);
  });
});

describe('固定残業代（みなし残業）', () => {
  it('単価1,200円で3万円・20時間分なら過不足なし', () => {
    const r = calcZangyodai({
      wageType: 'hourly',
      hourlyWage: 1_200,
      hours: { overtime: 20 },
      fixedOvertime: { amount: 30_000, hours: 20 },
    });
    expect(r.fixedOvertime?.requiredYen).toBeCloseTo(30_000, 6);
    expect(r.fixedOvertime?.sufficient).toBe(true);
    expect(r.fixedOvertime?.shortfallYen).toBe(0);
    expect(r.fixedOvertime?.differenceYen).toBeCloseTo(0, 6);
  });

  it('25時間なら固定分を超えた7,500円が差額になる', () => {
    const r = calcZangyodai({
      wageType: 'hourly',
      hourlyWage: 1_200,
      hours: { overtime: 25 },
      fixedOvertime: { amount: 30_000, hours: 20 },
    });
    expect(r.total).toBeCloseTo(1_200 * 1.25 * 25, 6);
    expect(r.fixedOvertime?.differenceYen).toBeCloseTo(7_500, 6);
    expect(r.fixedOvertime?.exceedsHours).toBe(true);
  });

  it('固定残業代が「何時間分」に足りていなければ不足額を出す', () => {
    const r = calcZangyodai({
      wageType: 'hourly',
      hourlyWage: 1_200,
      hours: { overtime: 10 },
      fixedOvertime: { amount: 20_000, hours: 20 },
    });
    expect(r.fixedOvertime?.sufficient).toBe(false);
    expect(r.fixedOvertime?.shortfallYen).toBeCloseTo(10_000, 6);
  });

  it('入力が無ければ突き合わせを返さない', () => {
    expect(calcZangyodai(base).fixedOvertime).toBeUndefined();
    expect(calcZangyodai({ ...base, fixedOvertime: null }).fixedOvertime).toBeUndefined();
    expect(
      calcZangyodai({ ...base, fixedOvertime: { amount: 0, hours: 0 } }).fixedOvertime,
    ).toBeUndefined();
  });
});

describe('時給制', () => {
  it('単価は入力した時給がそのまま使われる', () => {
    const r = calcZangyodai({ wageType: 'hourly', hourlyWage: 1_500, hours: { overtime: 10 } });
    expect(r.hourlyRate).toBe(1_500);
    expect(r.total).toBeCloseTo(1_500 * 1.25 * 10, 6);
  });

  it('時給制でも法定内残業（所定〜8時間）の入力が効く', () => {
    const r = calcZangyodai({
      wageType: 'hourly',
      hourlyWage: 1_500,
      hours: { withinStatutory: 2 },
    });
    expect(r.total).toBeCloseTo(1_500 * 2, 6);
  });

  it('所定内賃金が分からないので「残業代込みの額面」は出さない', () => {
    const r = calcZangyodai({ wageType: 'hourly', hourlyWage: 1_500, hours: { overtime: 10 } });
    expect(r.grossWithOvertime).toBeUndefined();
  });
});

describe('月収・年換算', () => {
  it('残業代込みの額面は月給＋残業代', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 10 } });
    expect(r.grossWithOvertime).toBeCloseTo(300_000 + 22_959.18, 2);
  });

  it('年換算は今月と同じ残業が12か月続いた場合', () => {
    const r = calcZangyodai({ ...base, hours: { overtime: 10 } });
    expect(r.annualOvertime).toBeCloseTo(r.total * 12, 6);
  });
});

describe('異常値', () => {
  it('負の入力は0として扱う', () => {
    const r = calcZangyodai({
      ...base,
      monthlyWage: -100,
      hours: { overtime: -5, holiday: -1 },
    });
    expect(r.hourlyRate).toBe(0);
    expect(r.total).toBe(0);
  });

  it('所定労働時間が0でも落ちない（既定値に戻す）', () => {
    const r = calcZangyodai({ ...base, dailyHours: 0, annualWorkDays: 0 });
    expect(r.monthlyAverageHours).toBeCloseTo(163.33, 2);
  });

  it('NaN が来ても落ちない', () => {
    const r = calcZangyodai({ ...base, monthlyWage: Number.NaN, hours: { overtime: Number.NaN } });
    expect(r.total).toBe(0);
  });
});
