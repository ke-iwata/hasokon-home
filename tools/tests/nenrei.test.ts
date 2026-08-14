import { describe, expect, it } from 'vitest';
import {
  ageAt,
  calcNenrei,
  compareDate,
  daysBetween,
  daysInMonth,
  ERAS,
  eraYearLabel,
  formatDate,
  formatJa,
  fromWareki,
  isLeapYear,
  isValidDate,
  isWarekiError,
  maxEraYear,
  nextBirthday,
  parseDate,
  schoolYears,
  sexagenary,
  TABLE_END_YEAR,
  toWareki,
  warekiTable,
  warekiYearLabelAt,
  warekiYearLabels,
  zodiac,
  type DateParts,
} from '@/lib/nenrei';

/**
 * 年齢計算・西暦⇔和暦変換のテスト（仕様: docs/features/nenrei-keisan.md）。
 *
 * 仕様書が「境界ケースを厚くする」と定めているところを重点的に見ている。
 * 誕生日当日／前日・2月29日生まれ・改元日・4月1日生まれの学年・過去の基準日。
 */

const d = (iso: string): DateParts => parseDate(iso) as DateParts;

describe('日付の基本', () => {
  it('うるう年を判定する（100年・400年の例外を含む）', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('月の日数を返す（2月はうるう年で変わる）', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it('存在しない日付を弾く', () => {
    expect(isValidDate({ year: 2025, month: 2, day: 29 })).toBe(false);
    expect(isValidDate({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isValidDate({ year: 2025, month: 13, day: 1 })).toBe(false);
    expect(isValidDate({ year: 2025, month: 4, day: 31 })).toBe(false);
  });

  it('parseDate は形式・実在の両方を見る', () => {
    expect(parseDate('2026-08-14')).toEqual({ year: 2026, month: 8, day: 14 });
    expect(parseDate('2026-8-14')).toBeNull();
    expect(parseDate('2025-02-29')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('formatDate は input[type=date] に渡せる形にする', () => {
    expect(formatDate({ year: 2026, month: 8, day: 4 })).toBe('2026-08-04');
    expect(formatJa({ year: 2026, month: 8, day: 4 })).toBe('2026年8月4日');
  });

  it('日数の差を出す（うるう日・年またぎを含む）', () => {
    expect(daysBetween(d('2026-01-01'), d('2026-01-02'))).toBe(1);
    expect(daysBetween(d('2024-02-28'), d('2024-03-01'))).toBe(2);
    expect(daysBetween(d('2025-02-28'), d('2025-03-01'))).toBe(1);
    expect(daysBetween(d('2025-12-31'), d('2026-01-01'))).toBe(1);
    // 逆向きは負になる
    expect(daysBetween(d('2026-01-02'), d('2026-01-01'))).toBe(-1);
  });

  it('日付を比較する', () => {
    expect(compareDate(d('2026-01-01'), d('2026-01-02'))).toBeLessThan(0);
    expect(compareDate(d('2026-01-02'), d('2026-01-02'))).toBe(0);
    expect(compareDate(d('2027-01-01'), d('2026-12-31'))).toBeGreaterThan(0);
  });
});

describe('西暦 → 和暦', () => {
  it('現行元号に変換する', () => {
    expect(toWareki(d('2026-08-14'))?.label).toBe('令和8年8月14日');
    expect(toWareki(d('2026-08-14'))?.short).toBe('R8.8.14');
  });

  it('元年は「元年」と書く', () => {
    expect(toWareki(d('2019-05-01'))?.label).toBe('令和元年5月1日');
    expect(toWareki(d('1989-01-08'))?.label).toBe('平成元年1月8日');
  });

  it('昭和から平成への改元日をまたぐ（1989-01-07 / 01-08）', () => {
    expect(toWareki(d('1989-01-07'))?.label).toBe('昭和64年1月7日');
    expect(toWareki(d('1989-01-08'))?.label).toBe('平成元年1月8日');
  });

  it('平成から令和への改元日をまたぐ（2019-04-30 / 05-01）', () => {
    expect(toWareki(d('2019-04-30'))?.label).toBe('平成31年4月30日');
    expect(toWareki(d('2019-05-01'))?.label).toBe('令和元年5月1日');
  });

  it('明治・大正・昭和の改元日をまたぐ', () => {
    expect(toWareki(d('1912-07-29'))?.label).toBe('明治45年7月29日');
    expect(toWareki(d('1912-07-30'))?.label).toBe('大正元年7月30日');
    expect(toWareki(d('1926-12-24'))?.label).toBe('大正15年12月24日');
    expect(toWareki(d('1926-12-25'))?.label).toBe('昭和元年12月25日');
  });

  it('明治より前は変換しない（旧暦のため）', () => {
    expect(toWareki(d('1868-01-24'))).toBeNull();
    expect(toWareki(d('1868-01-25'))?.label).toBe('明治元年1月25日');
  });

  it('新暦採用（1873-01-01）より前は lunisolar を立てる', () => {
    expect(toWareki(d('1872-12-31'))?.lunisolar).toBe(true);
    expect(toWareki(d('1873-01-01'))?.lunisolar).toBe(false);
  });
});

describe('和暦 → 西暦', () => {
  it('通常の和暦を西暦に直す', () => {
    expect(fromWareki('昭和', 45, 6, 1)).toEqual({ year: 1970, month: 6, day: 1 });
    expect(fromWareki('平成', 10, 5, 3)).toEqual({ year: 1998, month: 5, day: 3 });
    expect(fromWareki('令和', 1, 5, 1)).toEqual({ year: 2019, month: 5, day: 1 });
  });

  it('改元日の前後を取り違えない', () => {
    expect(fromWareki('昭和', 64, 1, 7)).toEqual({ year: 1989, month: 1, day: 7 });
    expect(fromWareki('平成', 31, 4, 30)).toEqual({ year: 2019, month: 4, day: 30 });
  });

  it('存在しない和暦は理由つきで返す（昭和64年1月8日）', () => {
    const result = fromWareki('昭和', 64, 1, 8);
    expect(isWarekiError(result)).toBe(true);
    if (isWarekiError(result)) {
      expect(result.error).toContain('存在しません');
      expect(result.error).toContain('平成');
    }
  });

  it('元号の開始前も弾く（明治元年1月1日）', () => {
    const result = fromWareki('明治', 1, 1, 1);
    expect(isWarekiError(result)).toBe(true);
    if (isWarekiError(result)) expect(result.error).toContain('1月25日');
  });

  it('平成32年のように改元後の年も弾く', () => {
    expect(isWarekiError(fromWareki('平成', 32, 1, 1))).toBe(true);
  });

  it('実在しない日付・扱えない元号・0年を弾く', () => {
    expect(isWarekiError(fromWareki('平成', 30, 2, 30))).toBe(true);
    expect(isWarekiError(fromWareki('慶応', 3, 1, 1))).toBe(true);
    expect(isWarekiError(fromWareki('令和', 0, 1, 1))).toBe(true);
  });

  it('往復しても元に戻る', () => {
    for (const iso of ['1912-07-30', '1926-12-25', '1989-01-08', '2019-05-01', '2026-08-14']) {
      const w = toWareki(d(iso));
      expect(w).not.toBeNull();
      expect(fromWareki(w!.era, w!.eraYear, w!.month, w!.day)).toEqual(d(iso));
    }
  });
});

describe('元号データと早見表', () => {
  it('元号は隙間なく連続する（前の元号の翌日が次の元号の初日）', () => {
    for (let i = 0; i < ERAS.length - 1; i++) {
      const end = d(ERAS[i].end as string);
      const nextStart = d(ERAS[i + 1].start);
      expect(daysBetween(end, nextStart)).toBe(1);
    }
  });

  it('現行元号だけが end を持たない', () => {
    expect(ERAS.filter((e) => !e.end)).toHaveLength(1);
    expect(ERAS[ERAS.length - 1].name).toBe('令和');
  });

  it('元号ごとの最終年が実際の年数と合う', () => {
    expect(maxEraYear(ERAS[0])).toBe(45); // 明治45年まで
    expect(maxEraYear(ERAS[1])).toBe(15); // 大正15年まで
    expect(maxEraYear(ERAS[2])).toBe(64); // 昭和64年まで
    expect(maxEraYear(ERAS[3])).toBe(31); // 平成31年まで
    expect(maxEraYear(ERAS[4])).toBe(TABLE_END_YEAR - 2019 + 1);
  });

  it('早見表は元年から最終年まで並ぶ', () => {
    const showa = warekiTable('昭和');
    expect(showa).toHaveLength(64);
    expect(showa[0]).toMatchObject({ label: '昭和元年', year: 1926 });
    expect(showa[44]).toMatchObject({ label: '昭和45年', year: 1970 });
    expect(showa[63]).toMatchObject({ label: '昭和64年', year: 1989 });
  });

  it('改元した年に「◯月◯日まで／から」の注記が付く', () => {
    expect(warekiTable('昭和')[63].note).toBe('1月7日まで');
    expect(warekiTable('平成')[0].note).toBe('1月8日から');
    expect(warekiTable('平成')[30].note).toBe('4月30日まで');
    expect(warekiTable('令和')[0].note).toBe('5月1日から');
    expect(warekiTable('明治')[44].note).toBe('7月29日まで');
  });

  it('新暦より前の年には旧暦の注記が付く', () => {
    const meiji = warekiTable('明治');
    expect(meiji[0].note).toContain('月日は旧暦'); // 明治元年
    expect(meiji[4].note).toContain('月日は旧暦'); // 明治5年
    expect(meiji[5].note ?? '').not.toContain('旧暦'); // 明治6年（1873年）から新暦
  });

  it('干支の欄が入る', () => {
    expect(warekiTable('令和')[7]).toMatchObject({ year: 2026, eto: '丙午', zodiac: '午' });
  });

  it('扱えない元号は空配列', () => {
    expect(warekiTable('慶応')).toEqual([]);
  });

  it('改元した西暦年は2つの和暦を返す', () => {
    expect(warekiYearLabels(1989)).toEqual(['昭和64年', '平成元年']);
    expect(warekiYearLabels(2019)).toEqual(['平成31年', '令和元年']);
    expect(warekiYearLabels(2026)).toEqual(['令和8年']);
    expect(warekiYearLabels(1800)).toEqual([]);
  });

  it('月まで見れば改元年でも和暦は1つに決まる', () => {
    expect(warekiYearLabelAt(1989, 1)).toBe('昭和64年');
    expect(warekiYearLabelAt(1989, 4)).toBe('平成元年');
    expect(warekiYearLabelAt(2019, 4)).toBe('平成31年');
    expect(warekiYearLabelAt(2019, 5)).toBe('令和元年');
    expect(warekiYearLabelAt(1800, 4)).toBeNull();
  });

  it('元年の表記だけ「元」にする', () => {
    expect(eraYearLabel('令和', 1)).toBe('令和元年');
    expect(eraYearLabel('令和', 2)).toBe('令和2年');
  });
});

describe('干支', () => {
  it('十二支は西暦年で決まる', () => {
    expect(zodiac(2024)).toBe('辰');
    expect(zodiac(2025)).toBe('巳');
    expect(zodiac(2026)).toBe('午');
    expect(zodiac(1988)).toBe('辰');
  });

  it('十干十二支は60年で一巡する', () => {
    expect(sexagenary(2026)).toBe('丙午');
    expect(sexagenary(1966)).toBe('丙午');
    expect(sexagenary(1989)).toBe('己巳');
    expect(sexagenary(1980)).toBe('庚申');
    for (const year of [1901, 1955, 2003, 2026]) {
      expect(sexagenary(year)).toBe(sexagenary(year + 60));
    }
  });
});

describe('満年齢', () => {
  it('誕生日の当日に1つ増える（前日はまだ増えない）', () => {
    const birth = d('1990-08-14');
    expect(ageAt(birth, d('2026-08-13'))).toBe(35);
    expect(ageAt(birth, d('2026-08-14'))).toBe(36);
    expect(ageAt(birth, d('2026-08-15'))).toBe(36);
  });

  it('生まれた日は0歳', () => {
    expect(ageAt(d('2026-08-14'), d('2026-08-14'))).toBe(0);
  });

  it('月をまたぐ前は増えない', () => {
    expect(ageAt(d('2000-12-31'), d('2026-01-01'))).toBe(25);
    expect(ageAt(d('2000-01-01'), d('2025-12-31'))).toBe(25);
  });

  it('2月29日生まれは、平年は3月1日に増える（2月28日はまだ増えない）', () => {
    const birth = d('2000-02-29');
    expect(ageAt(birth, d('2025-02-28'))).toBe(24);
    expect(ageAt(birth, d('2025-03-01'))).toBe(25);
    // うるう年は2月29日に増える
    expect(ageAt(birth, d('2024-02-28'))).toBe(23);
    expect(ageAt(birth, d('2024-02-29'))).toBe(24);
  });

  it('基準日を過去にすると、その時点の年齢になる', () => {
    const birth = d('1990-08-14');
    expect(ageAt(birth, d('2000-01-01'))).toBe(9);
    expect(ageAt(birth, d('1991-08-14'))).toBe(1);
  });
});

describe('次の誕生日', () => {
  it('誕生日までの日数を出す', () => {
    const next = nextBirthday(d('1990-08-20'), d('2026-08-14'));
    expect(next.days).toBe(6);
    expect(next.isToday).toBe(false);
    expect(next.age).toBe(36);
    expect(formatDate(next.date)).toBe('2026-08-20');
  });

  it('誕生日を過ぎていれば翌年になる', () => {
    const next = nextBirthday(d('1990-08-10'), d('2026-08-14'));
    expect(formatDate(next.date)).toBe('2027-08-10');
    expect(next.days).toBe(361);
    expect(next.age).toBe(37);
  });

  it('当日は0日で isToday が立つ', () => {
    const next = nextBirthday(d('1990-08-14'), d('2026-08-14'));
    expect(next.days).toBe(0);
    expect(next.isToday).toBe(true);
    expect(next.age).toBe(36);
  });

  it('2月29日生まれは、平年には3月1日へ繰り下がる', () => {
    const common = nextBirthday(d('2000-02-29'), d('2025-02-20'));
    expect(formatDate(common.date)).toBe('2025-03-01');
    expect(common.shifted).toBe(true);

    const leap = nextBirthday(d('2000-02-29'), d('2024-02-20'));
    expect(formatDate(leap.date)).toBe('2024-02-29');
    expect(leap.shifted).toBe(false);
  });

  it('年をまたぐ場合も正しく日数を出す', () => {
    const next = nextBirthday(d('1990-01-05'), d('2025-12-31'));
    expect(formatDate(next.date)).toBe('2026-01-05');
    expect(next.days).toBe(5);
  });
});

describe('学年の目安', () => {
  it('4月2日生まれと4月1日生まれで学年が1つずれる', () => {
    const later = schoolYears(d('2018-04-02'));
    const earlier = schoolYears(d('2019-04-01'));
    // 同じ学年（2018年度）に入る
    expect(later.cohortYear).toBe(2018);
    expect(earlier.cohortYear).toBe(2018);
    expect(later.milestones[0].year).toBe(2025);
    expect(earlier.milestones[0].year).toBe(2025);

    // 1日違いの4月2日生まれは次の学年
    const nextGrade = schoolYears(d('2019-04-02'));
    expect(nextGrade.cohortYear).toBe(2019);
    expect(nextGrade.milestones[0].year).toBe(2026);
  });

  it('1月1日〜4月1日生まれを早生まれとする', () => {
    expect(schoolYears(d('2019-01-01')).hayaumare).toBe(true);
    expect(schoolYears(d('2019-03-31')).hayaumare).toBe(true);
    expect(schoolYears(d('2019-04-01')).hayaumare).toBe(true);
    expect(schoolYears(d('2019-04-02')).hayaumare).toBe(false);
    expect(schoolYears(d('2019-12-31')).hayaumare).toBe(false);
  });

  it('入学・卒業の節目が学校教育法の年限どおりに並ぶ', () => {
    const s = schoolYears(d('2018-04-02'));
    expect(s.milestones.map((m) => [m.label, m.year, m.month])).toEqual([
      ['小学校 入学', 2025, 4],
      ['小学校 卒業', 2031, 3],
      ['中学校 入学', 2031, 4],
      ['中学校 卒業', 2034, 3],
      ['高校 入学', 2034, 4],
      ['高校 卒業', 2037, 3],
      ['大学 入学（現役）', 2037, 4],
      ['大学 卒業（4年制）', 2041, 3],
    ]);
  });

  it('表示は西暦と和暦を併記する', () => {
    expect(schoolYears(d('2018-04-02')).milestones[0].text).toBe('2025年（令和7年）4月');
  });

  it('改元をまたぐ年でも和暦が正しく付く', () => {
    // 2012年4月2日生まれ → 2019年4月に小学校入学（平成31年4月。令和は5月から）
    expect(schoolYears(d('2012-04-02')).milestones[0].text).toBe('2019年（平成31年）4月');
  });

  it('2月29日生まれは早生まれとして扱う', () => {
    const s = schoolYears(d('2020-02-29'));
    expect(s.hayaumare).toBe(true);
    expect(s.cohortYear).toBe(2019);
  });
});

describe('calcNenrei（まとめ）', () => {
  it('生年月日と基準日から一式を返す', () => {
    const result = calcNenrei(d('1990-08-20'), d('2026-08-14'));
    expect(result).not.toBeNull();
    expect(result?.age).toBe(35);
    expect(result?.birthWareki?.label).toBe('平成2年8月20日');
    expect(result?.zodiac).toBe('午');
    expect(result?.eto).toBe('庚午');
    expect(result?.nextBirthday.days).toBe(6);
    expect(result?.livedDays).toBe(13143);
    expect(result?.school.cohortYear).toBe(1990);
  });

  it('生まれた日の曜日を返す', () => {
    // 2026年8月14日は金曜日
    expect(calcNenrei(d('2026-08-14'), d('2026-08-14'))?.birthWeekday).toBe('金');
  });

  it('基準日が生年月日より前なら null（未来の生年月日は計算しない）', () => {
    expect(calcNenrei(d('2030-01-01'), d('2026-08-14'))).toBeNull();
  });

  it('生年月日と基準日が同じ日なら0歳・0日', () => {
    const result = calcNenrei(d('2026-08-14'), d('2026-08-14'));
    expect(result?.age).toBe(0);
    expect(result?.livedDays).toBe(0);
    expect(result?.nextBirthday.isToday).toBe(true);
  });

  it('明治より前の生年月日は和暦を出さない（旧暦のため）', () => {
    const result = calcNenrei(d('1860-01-01'), d('1900-01-01'));
    expect(result?.birthWareki).toBeNull();
    expect(result?.age).toBe(40);
  });
});
