import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDate,
  parseDate,
  weekdayLabel,
  type DateParts,
} from '@/lib/date-parts';
import {
  businessDaysBetween,
  calcDeadline,
  calcDuration,
  holidayName,
  holidaysIn,
  HOLIDAYS,
  HOLIDAY_FIRST_YEAR,
  HOLIDAY_LAST_YEAR,
  inHolidayRange,
  isBusinessDay,
  isHoliday,
  MAX_AMOUNT,
  monthsAndDays,
  weeksAndDays,
  yearsMonthsDays,
} from '@/lib/nissu-keisan';

/**
 * 日数計算・期日計算のテスト（仕様: docs/features/nissu-keisan.md）。
 *
 * 重点は仕様書が挙げている2つ。
 *
 * 1. **祝日テーブルの写し間違い**。営業日計算はここが1日ずれると静かに間違う。
 *    内閣府の一覧を写した `HOLIDAYS` を、祝日法の規則から組み立てた集合と
 *    まるごと突き合わせる（下の「祝日テーブル」）。
 * 2. **月末・うるう年の境界**。1月31日の1か月後、2月29日をまたぐ日数など。
 */

const d = (iso: string): DateParts => parseDate(iso) as DateParts;

// ---------------------------------------------------------------- 祝日テーブル

/**
 * 祝日法（昭和23年法律第178号）の規則から、その年の祝日をすべて組み立てる。
 *
 * `HOLIDAYS` は内閣府CSVの手写しなので、独立に導出したものと突き合わせて
 * 写し間違い・入れ忘れを落とす。ロジック側（lib）はこの導出を使わない
 * ——未公示の年を式で推測しないことが仕様なので、テーブルが正であるべきだから。
 */

/** その月の第n月曜（ハッピーマンデー） */
function nthMonday(year: number, month: number, n: number): DateParts {
  const first = { year, month, day: 1 };
  const shift = (8 - new Date(Date.UTC(year, month - 1, 1)).getUTCDay()) % 7;
  return { year, month, day: 1 + shift + (n - 1) * 7 };
}

/**
 * 春分日・秋分日の近似式（1980〜2099年）。
 *
 * 正は国立天文台の暦要項（前年2月の官報で公示される）。この式は暦要項の値を
 * 再現する近似で、テーブルの写し間違いを見つけるための突き合わせに使う。
 */
function equinoxDay(year: number, base: number): number {
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

const vernalEquinox = (year: number) => equinoxDay(year, 20.8431);
const autumnalEquinox = (year: number) => equinoxDay(year, 23.2488);

/** 祝日法2条の「国民の祝日」（振替休日・国民の休日を含まない） */
function statutoryHolidays(year: number): Map<string, string> {
  const list: [DateParts, string][] = [
    [{ year, month: 1, day: 1 }, '元日'],
    [nthMonday(year, 1, 2), '成人の日'],
    [{ year, month: 2, day: 11 }, '建国記念の日'],
    [{ year, month: 2, day: 23 }, '天皇誕生日'],
    [{ year, month: 3, day: vernalEquinox(year) }, '春分の日'],
    [{ year, month: 4, day: 29 }, '昭和の日'],
    [{ year, month: 5, day: 3 }, '憲法記念日'],
    [{ year, month: 5, day: 4 }, 'みどりの日'],
    [{ year, month: 5, day: 5 }, 'こどもの日'],
    [nthMonday(year, 7, 3), '海の日'],
    [{ year, month: 8, day: 11 }, '山の日'],
    [nthMonday(year, 9, 3), '敬老の日'],
    [{ year, month: 9, day: autumnalEquinox(year) }, '秋分の日'],
    [nthMonday(year, 10, 2), 'スポーツの日'],
    [{ year, month: 11, day: 3 }, '文化の日'],
    [{ year, month: 11, day: 23 }, '勤労感謝の日'],
  ];
  return new Map(list.map(([parts, name]) => [formatDate(parts), name]));
}

/** 祝日法3条の休日（振替休日・国民の休日）まで含めた、その年の休日すべて */
function derivedHolidays(year: number): Map<string, string> {
  const statutory = statutoryHolidays(year);
  const all = new Map(statutory);

  // 3条2項 振替休日: 祝日が日曜のとき、その日後で最も近い「祝日でない日」
  for (const iso of [...statutory.keys()].sort()) {
    if (weekdayLabel(d(iso)) !== '日') continue;
    let cur = addDays(d(iso), 1);
    while (statutory.has(formatDate(cur))) cur = addDays(cur, 1);
    all.set(formatDate(cur), '振替休日');
  }

  // 3条3項 国民の休日: 前日も翌日も祝日である日（日曜・振替休日を除く）
  for (const iso of [...statutory.keys()].sort()) {
    const next2 = addDays(d(iso), 2);
    const between = addDays(d(iso), 1);
    const key = formatDate(between);
    if (!statutory.has(formatDate(next2))) continue;
    if (statutory.has(key) || all.has(key)) continue;
    if (weekdayLabel(between) === '日') continue;
    all.set(key, '国民の休日');
  }

  return all;
}

describe('祝日テーブル', () => {
  it('データの範囲は「1月1日〜12月31日」で揃っている', () => {
    for (let year = HOLIDAY_FIRST_YEAR; year <= HOLIDAY_LAST_YEAR; year++) {
      expect(holidaysIn(year).length, `${year}年の祝日が入っていない`).toBeGreaterThan(0);
    }
    expect(HOLIDAYS.every((h) => inHolidayRange(d(h.date)))).toBe(true);
  });

  it('祝日法から導いた休日と1日単位で一致する（内閣府の一覧の写し間違いを落とす）', () => {
    for (let year = HOLIDAY_FIRST_YEAR; year <= HOLIDAY_LAST_YEAR; year++) {
      const actual = Object.fromEntries(holidaysIn(year).map((h) => [h.date, h.name]));
      const expected = Object.fromEntries([...derivedHolidays(year)].sort());
      expect(actual, `${year}年の祝日がずれている`).toEqual(expected);
    }
  });

  it('日付の昇順に並んでいて、重複が無い', () => {
    const dates = HOLIDAYS.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });

  /** 仕様書が名指ししている代表ケース。導出テストが壊れても、ここは目で追える */
  it('ゴールデンウィーク（2026年）が正しい', () => {
    expect(holidayName(d('2026-04-29'))).toBe('昭和の日');
    expect(holidayName(d('2026-05-03'))).toBe('憲法記念日');
    expect(holidayName(d('2026-05-04'))).toBe('みどりの日');
    expect(holidayName(d('2026-05-05'))).toBe('こどもの日');
    // 5月3日が日曜。5月4日・5日は祝日なので、振替休日は5月6日に寄る
    expect(weekdayLabel(d('2026-05-03'))).toBe('日');
    expect(holidayName(d('2026-05-06'))).toBe('振替休日');
  });

  it('振替休日が日曜の祝日にだけ付く（2024年11月3日→11月4日）', () => {
    expect(weekdayLabel(d('2024-11-03'))).toBe('日');
    expect(holidayName(d('2024-11-04'))).toBe('振替休日');
    // 土曜の祝日には振替休日が無い（2024年11月23日は土曜）
    expect(weekdayLabel(d('2024-11-23'))).toBe('土');
    expect(holidayName(d('2024-11-24'))).toBeNull();
  });

  it('国民の休日が祝日に挟まれた平日に入る（2026年9月22日）', () => {
    expect(holidayName(d('2026-09-21'))).toBe('敬老の日');
    expect(holidayName(d('2026-09-22'))).toBe('国民の休日');
    expect(holidayName(d('2026-09-23'))).toBe('秋分の日');
  });

  it('年末年始は元日だけが祝日（企業の休業日は扱わない）', () => {
    expect(holidayName(d('2026-12-29'))).toBeNull();
    expect(holidayName(d('2026-12-31'))).toBeNull();
    expect(holidayName(d('2027-01-01'))).toBe('元日');
    expect(holidayName(d('2027-01-04'))).toBeNull();
    // 2026年12月30日は水曜なので、このツールでは営業日として数える
    expect(weekdayLabel(d('2026-12-30'))).toBe('水');
    expect(isBusinessDay(d('2026-12-30'))).toBe(true);
  });

  it('祝日・土日の判定', () => {
    expect(isHoliday(d('2026-01-01'))).toBe(true);
    expect(isBusinessDay(d('2026-01-01'))).toBe(false);
    expect(isBusinessDay(d('2026-08-15'))).toBe(false); // 土曜
    expect(isBusinessDay(d('2026-08-14'))).toBe(true); // 金曜
  });

  it('祝日データの範囲外を範囲内と偽らない', () => {
    expect(inHolidayRange(d(`${HOLIDAY_FIRST_YEAR}-01-01`))).toBe(true);
    expect(inHolidayRange(d(`${HOLIDAY_LAST_YEAR}-12-31`))).toBe(true);
    expect(inHolidayRange(d(`${HOLIDAY_FIRST_YEAR - 1}-12-31`))).toBe(false);
    expect(inHolidayRange(d(`${HOLIDAY_LAST_YEAR + 1}-01-01`))).toBe(false);
  });
});

// ---------------------------------------------------------------- 日付の足し引き

describe('月の足し引き（月末の寄せ）', () => {
  it('1月31日の1か月後は2月末（平年は28日、うるう年は29日）', () => {
    expect(addMonths(d('2026-01-31'), 1)).toEqual(d('2026-02-28'));
    expect(addMonths(d('2024-01-31'), 1)).toEqual(d('2024-02-29'));
  });

  it('年をまたぐ足し引きができる', () => {
    expect(addMonths(d('2026-11-30'), 3)).toEqual(d('2027-02-28'));
    expect(addMonths(d('2026-01-15'), -1)).toEqual(d('2025-12-15'));
    expect(addMonths(d('2026-03-31'), -1)).toEqual(d('2026-02-28'));
  });

  it('日数の足し引きはうるう日をまたいでも合う', () => {
    expect(addDays(d('2024-02-28'), 1)).toEqual(d('2024-02-29'));
    expect(addDays(d('2026-02-28'), 1)).toEqual(d('2026-03-01'));
    expect(daysBetween(d('2024-02-01'), d('2024-03-01'))).toBe(29);
    expect(daysBetween(d('2026-02-01'), d('2026-03-01'))).toBe(28);
  });
});

// ---------------------------------------------------------------- 日数計算

describe('日数計算', () => {
  it('初日を含む／含まないの両方を出す', () => {
    const r = calcDuration(d('2026-08-01'), d('2026-08-15'));
    expect(r?.days).toBe(14);
    expect(r?.daysInclusive).toBe(15);
  });

  it('同じ日は0日（初日を含めれば1日）', () => {
    const r = calcDuration(d('2026-08-15'), d('2026-08-15'));
    expect(r?.days).toBe(0);
    expect(r?.daysInclusive).toBe(1);
    expect(r?.weeks).toEqual({ weeks: 0, days: 0 });
  });

  it('終了日が開始日より前なら計算しない', () => {
    expect(calcDuration(d('2026-08-15'), d('2026-08-14'))).toBeNull();
  });

  it('週数と端数に分ける', () => {
    expect(weeksAndDays(29)).toEqual({ weeks: 4, days: 1 });
    expect(weeksAndDays(14)).toEqual({ weeks: 2, days: 0 });
    expect(weeksAndDays(6)).toEqual({ weeks: 0, days: 6 });
  });

  it('月数の端数は応当日で数える（1月31日→3月1日は1か月と1日）', () => {
    expect(monthsAndDays(d('2026-01-31'), d('2026-02-28'))).toEqual({ months: 1, days: 0 });
    expect(monthsAndDays(d('2026-01-31'), d('2026-03-01'))).toEqual({ months: 1, days: 1 });
    // うるう年は2月29日でちょうど1か月
    expect(monthsAndDays(d('2024-01-31'), d('2024-02-29'))).toEqual({ months: 1, days: 0 });
    expect(monthsAndDays(d('2024-01-31'), d('2024-03-01'))).toEqual({ months: 1, days: 1 });
  });

  it('応当日の前日はまだ1か月に満たない', () => {
    expect(monthsAndDays(d('2026-08-15'), d('2026-09-14'))).toEqual({ months: 0, days: 30 });
    expect(monthsAndDays(d('2026-08-15'), d('2026-09-15'))).toEqual({ months: 1, days: 0 });
  });

  it('年・月・日に分ける', () => {
    expect(yearsMonthsDays(d('2020-04-01'), d('2026-08-15'))).toEqual({
      years: 6,
      months: 4,
      days: 14,
    });
    expect(yearsMonthsDays(d('2026-01-01'), d('2026-12-31'))).toEqual({
      years: 0,
      months: 11,
      days: 30,
    });
  });

  it('開始日・終了日の曜日と祝日名を返す', () => {
    const r = calcDuration(d('2026-05-03'), d('2026-05-06'));
    expect(r?.fromWeekday).toBe('日');
    expect(r?.toWeekday).toBe('水');
    expect(r?.fromHoliday).toBe('憲法記念日');
    expect(r?.toHoliday).toBe('振替休日');
  });

  it('期間内の営業日数を両端込みで数える（2026年ゴールデンウィーク）', () => {
    // 5/1金・5/7木・5/8金 の3営業日。土日は5/2,5/3,5/9,5/10、祝日は5/4,5/5,5/6
    expect(businessDaysBetween(d('2026-05-01'), d('2026-05-10'))).toEqual({
      count: 3,
      weekends: 4,
      holidays: 3,
    });
  });

  it('土日と重なった祝日は土日として1回だけ数える', () => {
    // 2026-05-03 は日曜かつ憲法記念日
    const r = businessDaysBetween(d('2026-05-02'), d('2026-05-03'));
    expect(r).toEqual({ count: 0, weekends: 2, holidays: 0 });
  });

  it('祝日データの範囲外を含む期間の営業日数は出さない', () => {
    expect(businessDaysBetween(d(`${HOLIDAY_LAST_YEAR}-12-30`), d(`${HOLIDAY_LAST_YEAR + 1}-01-05`))).toBeNull();
    expect(calcDuration(d(`${HOLIDAY_FIRST_YEAR - 1}-12-01`), d(`${HOLIDAY_FIRST_YEAR}-01-10`))?.business).toBeNull();
    // 日数そのものは範囲外でも出る（祝日に依存しないため）
    expect(calcDuration(d('1990-01-01'), d('1990-12-31'))?.days).toBe(364);
  });
});

// ---------------------------------------------------------------- 期日計算

describe('期日計算（暦日）', () => {
  it('◯日後は起算日を数えない（民法140条の初日不算入）', () => {
    const r = calcDeadline({ start: d('2026-08-15'), amount: 3, direction: 'after', unit: 'calendar' });
    expect(r.ok && formatDate(r.date)).toBe('2026-08-18');
  });

  it('◯日前も同じ数え方', () => {
    const r = calcDeadline({ start: d('2026-08-15'), amount: 3, direction: 'before', unit: 'calendar' });
    expect(r.ok && formatDate(r.date)).toBe('2026-08-12');
  });

  it('0日後はその日のまま', () => {
    const r = calcDeadline({ start: d('2026-08-15'), amount: 0, direction: 'after', unit: 'calendar' });
    expect(r.ok && formatDate(r.date)).toBe('2026-08-15');
  });

  it('月またぎ・年またぎ・うるう日をまたいでも合う', () => {
    const over = calcDeadline({ start: d('2026-12-25'), amount: 10, direction: 'after', unit: 'calendar' });
    expect(over.ok && formatDate(over.date)).toBe('2027-01-04');

    const leap = calcDeadline({ start: d('2024-02-28'), amount: 2, direction: 'after', unit: 'calendar' });
    expect(leap.ok && formatDate(leap.date)).toBe('2024-03-01');

    const common = calcDeadline({ start: d('2026-02-28'), amount: 2, direction: 'after', unit: 'calendar' });
    expect(common.ok && formatDate(common.date)).toBe('2026-03-02');
  });

  it('求まった期日が祝日ならその名前と、営業日でないことを添える', () => {
    const r = calcDeadline({ start: d('2026-05-01'), amount: 4, direction: 'after', unit: 'calendar' });
    expect(r.ok && formatDate(r.date)).toBe('2026-05-05');
    expect(r.ok && r.holiday).toBe('こどもの日');
    expect(r.ok && r.isBusinessDay).toBe(false);
  });

  it('祝日データの範囲外でも暦日なら計算する（祝日名は付けない）', () => {
    const r = calcDeadline({
      start: d(`${HOLIDAY_LAST_YEAR + 1}-03-01`),
      amount: 30,
      direction: 'after',
      unit: 'calendar',
    });
    expect(r.ok && formatDate(r.date)).toBe(`${HOLIDAY_LAST_YEAR + 1}-03-31`);
    expect(r.ok && r.holiday).toBeNull();
    expect(r.ok && r.isBusinessDay).toBeNull();
  });

  it('日数が負・小数・上限超えなら理由を返す', () => {
    const base = { start: d('2026-08-15'), direction: 'after', unit: 'calendar' } as const;
    expect(calcDeadline({ ...base, amount: -1 }).ok).toBe(false);
    expect(calcDeadline({ ...base, amount: 1.5 }).ok).toBe(false);
    expect(calcDeadline({ ...base, amount: MAX_AMOUNT + 1 }).ok).toBe(false);
    expect(calcDeadline({ ...base, amount: MAX_AMOUNT }).ok).toBe(true);
  });
});

describe('期日計算（営業日）', () => {
  it('◯営業日後は翌日から数え、土日と祝日を飛ばす', () => {
    // 2026-05-01(金) → 5/2土 5/3日 5/4祝 5/5祝 5/6振替 を飛ばして 5/7木=1、5/8金=2、5/11月=3
    const r = calcDeadline({ start: d('2026-05-01'), amount: 3, direction: 'after', unit: 'business' });
    expect(r.ok && formatDate(r.date)).toBe('2026-05-11');
    expect(r.ok && r.weekday).toBe('月');
    expect(r.ok && r.isBusinessDay).toBe(true);
  });

  it('飛ばした日を理由つきで返す', () => {
    const r = calcDeadline({ start: d('2026-05-01'), amount: 1, direction: 'after', unit: 'business' });
    expect(r.ok && formatDate(r.date)).toBe('2026-05-07');
    expect(r.ok && r.skipped.map((s) => `${formatDate(s.date)} ${s.reason}`)).toEqual([
      '2026-05-02 土曜',
      '2026-05-03 憲法記念日',
      '2026-05-04 みどりの日',
      '2026-05-05 こどもの日',
      '2026-05-06 振替休日',
    ]);
  });

  it('◯営業日前も同じ数え方で遡る', () => {
    // 2026-05-07(木) → 5/6振替 5/5祝 5/4祝 5/3祝 5/2土 を飛ばして 5/1金=1、4/30木=2、4/28火=3
    const r = calcDeadline({ start: d('2026-05-07'), amount: 3, direction: 'before', unit: 'business' });
    expect(r.ok && formatDate(r.date)).toBe('2026-04-28');
  });

  it('0営業日後はその日のまま（土日祝でも動かさない）', () => {
    const r = calcDeadline({ start: d('2026-05-03'), amount: 0, direction: 'after', unit: 'business' });
    expect(r.ok && formatDate(r.date)).toBe('2026-05-03');
  });

  it('土日祝から数え始めても、最初の営業日が1営業日目になる', () => {
    // 2026-01-01(祝・木) の1営業日後は 1/2(金)
    const r = calcDeadline({ start: d('2026-01-01'), amount: 1, direction: 'after', unit: 'business' });
    expect(r.ok && formatDate(r.date)).toBe('2026-01-02');
  });

  it('祝日データの範囲を出たら概算せず、理由を返す', () => {
    const forward = calcDeadline({
      start: d(`${HOLIDAY_LAST_YEAR}-12-30`),
      amount: 5,
      direction: 'after',
      unit: 'business',
    });
    expect(forward.ok).toBe(false);
    expect(!forward.ok && forward.message).toContain('祝日データの範囲外');

    const backward = calcDeadline({
      start: d(`${HOLIDAY_FIRST_YEAR}-01-02`),
      amount: 5,
      direction: 'before',
      unit: 'business',
    });
    expect(backward.ok).toBe(false);

    const outside = calcDeadline({
      start: d(`${HOLIDAY_LAST_YEAR + 1}-06-01`),
      amount: 1,
      direction: 'after',
      unit: 'business',
    });
    expect(outside.ok).toBe(false);
  });

  it('範囲の内側で収まるなら年をまたいでも計算する', () => {
    // 2026-12-30(水) の3営業日後: 12/31木=1、1/1は元日、1/2金=2、1/3土 1/4日 を飛ばして 1/5月=3
    const r = calcDeadline({ start: d('2026-12-30'), amount: 3, direction: 'after', unit: 'business' });
    expect(r.ok && formatDate(r.date)).toBe('2027-01-05');
  });
});
