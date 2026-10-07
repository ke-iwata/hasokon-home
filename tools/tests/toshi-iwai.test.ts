import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  baseYearChoices,
  CHOJU,
  chojuTable,
  chojuYears,
  cohortAlignedYear,
  currentOrNextYaku,
  defaultShichigosanYear,
  defaultYakudoshiYear,
  isBirthYearInRange,
  kazoeAge,
  lifetimeYaku,
  SHICHIGOSAN_YEAR,
  shichigosanDescription,
  shichigosanTable,
  shichigosanWeekday,
  shichigosanYears,
  taiyakuBirthYears,
  todayInJapan,
  YAKUDOSHI_YEAR,
  yakudoshiDescription,
  yakudoshiTable,
  yakuOf,
  yearOfKazoe,
  yearOfMan,
  yearWithWareki,
} from '@/lib/toshi-iwai';
import { parseDate, type DateParts } from '@/lib/nenrei';

/**
 * 七五三・厄年・長寿祝いのテスト。
 *
 * 仕様: docs/features/shichigosan-yakudoshi-hayamihyo.md の「テスト」の表。
 * 期待値は仕様書の「2026 年・2027 年の答え」と同じ（神社本庁の令和8年用の厄年表とも一致する）。
 */

const d = (iso: string): DateParts => parseDate(iso) as DateParts;

describe('数え年', () => {
  it('2024 年生まれは 2026 年に数え 3', () => {
    expect(kazoeAge(2024, 2026)).toBe(3);
  });

  it('数え n の年・満 n の年', () => {
    expect(yearOfKazoe(2023, 3)).toBe(2025);
    expect(yearOfMan(2023, 3)).toBe(2026);
  });

  it('範囲外（1899 年生まれ）はエラー', () => {
    expect(isBirthYearInRange(1899)).toBe(false);
    expect(isBirthYearInRange(1900)).toBe(true);
    expect(isBirthYearInRange(2040)).toBe(true);
    expect(isBirthYearInRange(2041)).toBe(false);
    expect(() => kazoeAge(1899, 2026)).toThrow(RangeError);
    expect(() => shichigosanYears(1899)).toThrow(RangeError);
    expect(() => lifetimeYaku(1899, 'male')).toThrow(RangeError);
    expect(() => chojuYears(1899)).toThrow(RangeError);
  });
});

describe('七五三', () => {
  it('2023-05-10 生まれ：3 歳 数え 2025・満 2026、5 歳 2027・2028、7 歳 2029・2030', () => {
    expect(shichigosanYears(2023)).toEqual([
      { age: 3, kazoe: 2025, man: 2026 },
      { age: 5, kazoe: 2027, man: 2028 },
      { age: 7, kazoe: 2029, man: 2030 },
    ]);
  });

  it('男の子は 3・5、女の子は 3・7', () => {
    expect(shichigosanYears(2023, 'boy').map((r) => r.age)).toEqual([3, 5]);
    expect(shichigosanYears(2023, 'girl').map((r) => r.age)).toEqual([3, 7]);
  });

  it('2026 年の早見表：数え 2024/2022/2020・満 2023/2021/2019', () => {
    expect(shichigosanTable(2026)).toEqual([
      { age: 3, kazoeBirthYear: 2024, manBirthYear: 2023 },
      { age: 5, kazoeBirthYear: 2022, manBirthYear: 2021 },
      { age: 7, kazoeBirthYear: 2020, manBirthYear: 2019 },
    ]);
  });

  it('和暦の境：2019 年生まれは「平成31年／令和元年」', () => {
    expect(yearWithWareki(2019)).toBe('2019年（平成31年／令和元年）');
    expect(yearWithWareki(2024)).toBe('2024年（令和6年）');
  });

  it('11 月 15 日の曜日（2026 年は日曜）', () => {
    expect(shichigosanWeekday(2026)).toBe('日');
    expect(shichigosanWeekday(2027)).toBe('月');
  });

  it('早生まれ（2023-02-10 生・3 歳）：満 2026、学年で揃えるなら 2025', () => {
    expect(yearOfMan(2023, 3)).toBe(2026);
    expect(cohortAlignedYear(d('2023-02-10'), 3)).toBe(2025);
  });

  it('早生まれの境：4/1 生まれは早生まれ（揃える年 2025）、4/2 生まれは行を出さない', () => {
    expect(cohortAlignedYear(d('2023-04-01'), 3)).toBe(2025);
    expect(cohortAlignedYear(d('2023-04-02'), 3)).toBeNull();
    expect(yearOfMan(2023, 3)).toBe(2026);
  });

  it('揃える年は数え年の年と同じ（早生まれのとき）', () => {
    for (const age of [3, 5, 7]) {
      expect(cohortAlignedYear(d('2020-01-01'), age)).toBe(yearOfKazoe(2020, age));
    }
  });
});

describe('年の定数と年またぎ', () => {
  /**
   * 【このテストが落ちたら】`lib/toshi-iwai.ts` の定数を上げる。
   * 七五三は 11-16 以降に翌年へ、厄年は 10 月に翌年へ（仕様書「いつ手で上げるか」）。
   */
  it('SHICHIGOSAN_YEAR・YAKUDOSHI_YEAR は実行した年か翌年', () => {
    const year = new Date().getFullYear();
    expect([year, year + 1]).toContain(SHICHIGOSAN_YEAR);
    expect([year, year + 1]).toContain(YAKUDOSHI_YEAR);
  });

  it('七五三の既定の年：11-15 までは今年、11-16 からは来年', () => {
    expect(defaultShichigosanYear(d('2026-10-07'))).toBe(2026);
    expect(defaultShichigosanYear(d('2026-11-15'))).toBe(2026);
    expect(defaultShichigosanYear(d('2026-11-16'))).toBe(2027);
    expect(defaultShichigosanYear(d('2026-12-31'))).toBe(2027);
    expect(defaultShichigosanYear(d('2027-01-01'))).toBe(2027);
  });

  it('厄年の既定の年：9-30 までは今年、10-01 からは来年', () => {
    expect(defaultYakudoshiYear(d('2026-09-30'))).toBe(2026);
    expect(defaultYakudoshiYear(d('2026-10-01'))).toBe(2027);
    expect(defaultYakudoshiYear(d('2027-02-03'))).toBe(2027);
  });

  it('日本の暦日で判定する（UTC では前日でも、日本で 11-16 なら来年）', () => {
    // 2026-11-15T15:30Z は日本時間 11-16 00:30
    const today = todayInJapan(new Date('2026-11-15T15:30:00Z'));
    expect(today).toEqual({ year: 2026, month: 11, day: 16 });
    expect(defaultShichigosanYear(today)).toBe(2027);
    // 2026-09-30T15:00Z は日本時間 10-01 00:00
    expect(defaultYakudoshiYear(todayInJapan(new Date('2026-09-30T15:00:00Z')))).toBe(2027);
  });

  it('基準の年の選択肢は今年・来年（既定値が外れていれば足す）', () => {
    expect(baseYearChoices(2026)).toEqual([2026, 2027]);
    expect(baseYearChoices(2026, 2027)).toEqual([2026, 2027]);
    expect(baseYearChoices(2026, 2028)).toEqual([2026, 2027, 2028]);
  });

  it('2026-11-16 にマウントしても SSR の早見表は定数の年（2026）のまま', () => {
    // 七五三のページは早見表・title・description を SHICHIGOSAN_YEAR だけで作る。
    // マウント後に変わるのは「基準の年」の既定値だけ（Calculator.tsx）
    const page = readFileSync(
      fileURLToPath(new URL('../app/shichigosan/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(page).toContain('const year = SHICHIGOSAN_YEAR');
    expect(page).not.toMatch(/new Date\(\)\.getFullYear|defaultShichigosanYear/);
    expect(defaultShichigosanYear(d('2026-11-16'))).toBe(2027);
    expect(shichigosanTable(SHICHIGOSAN_YEAR)[0].kazoeBirthYear).toBe(SHICHIGOSAN_YEAR - 2);
  });
});

describe('厄年', () => {
  it('1986 年生・男性・2027：本厄・数え 42・大厄', () => {
    expect(yakuOf(1986, 2027, 'male')).toEqual({ kind: 'hon', age: 42, honAge: 42, taiyaku: true });
  });

  it('1987 年生は前厄、1985 年生は後厄（男性・2027）', () => {
    expect(yakuOf(1987, 2027, 'male')?.kind).toBe('mae');
    expect(yakuOf(1985, 2027, 'male')?.kind).toBe('ato');
  });

  it('厄年でなければ null', () => {
    expect(yakuOf(1990, 2027, 'male')).toBeNull();
  });

  it('女性 61：既定は null、female61: true で本厄', () => {
    expect(yakuOf(1967, 2027, 'female')).toBeNull();
    expect(yakuOf(1967, 2027, 'female', { female61: true })).toEqual({
      kind: 'hon',
      age: 61,
      honAge: 61,
      taiyaku: false,
    });
  });

  it('2027 年・女性の表（19/33/37 の 9 行）', () => {
    expect(yakudoshiTable(2027, 'female').map((r) => [r.honAge, r.kind, r.birthYear])).toEqual([
      [19, 'mae', 2010],
      [19, 'hon', 2009],
      [19, 'ato', 2008],
      [33, 'mae', 1996],
      [33, 'hon', 1995],
      [33, 'ato', 1994],
      [37, 'mae', 1992],
      [37, 'hon', 1991],
      [37, 'ato', 1990],
    ]);
  });

  it('2027 年・男性の表（仕様書の表）', () => {
    expect(yakudoshiTable(2027, 'male').map((r) => r.birthYear)).toEqual([
      2004, 2003, 2002, 1987, 1986, 1985, 1968, 1967, 1966,
    ]);
  });

  it('2026 年・男性の表は神社本庁の令和8年用の表と一致（42 歳本厄＝昭和60年＝1985 年生）', () => {
    const rows = yakudoshiTable(2026, 'male');
    expect(rows.find((r) => r.honAge === 42 && r.kind === 'hon')?.birthYear).toBe(1985);
    expect(rows.find((r) => r.honAge === 25 && r.kind === 'mae')?.birthYear).toBe(2003);
    expect(rows.find((r) => r.honAge === 61 && r.kind === 'ato')?.birthYear).toBe(1965);
  });

  it('一生分の表と早見表が食い違わない', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const row of yakudoshiTable(2027, sex)) {
        const life = lifetimeYaku(row.birthYear, sex);
        expect(life.find((y) => y.year === 2027)?.kind).toBe(row.kind);
      }
    }
  });

  it('今年の厄、無ければ次の厄', () => {
    expect(currentOrNextYaku(1986, 2027, 'male')).toMatchObject({
      current: true,
      yaku: { year: 2027, kind: 'hon' },
    });
    // 1990 年生・男性：2027 は数え 38、次は数え 41（前厄）＝ 2030
    expect(currentOrNextYaku(1990, 2027, 'male')).toMatchObject({
      current: false,
      yaku: { year: 2030, kind: 'mae', honAge: 42 },
    });
    // 女性 61 を含めなければ 1960 年生の女性に次の厄は無い
    expect(currentOrNextYaku(1960, 2027, 'female')).toBeNull();
  });
});

describe('長寿祝い', () => {
  it('1967 年生：還暦 2027（数え・満とも）', () => {
    const kanreki = chojuYears(1967).find((r) => r.choju.name === '還暦');
    expect(kanreki).toMatchObject({ kazoe: 2027, man: 2027 });
  });

  it('1958 年生：古希 数え 2027・満 2028', () => {
    const koki = chojuYears(1958).find((r) => r.choju.name === '古希');
    expect(koki).toMatchObject({ kazoe: 2027, man: 2028 });
  });

  it('緑寿は満 66 のみ（1961 年生は 2027。数え年の列は出さない）', () => {
    const rokuju = chojuYears(1961).find((r) => r.choju.name === '緑寿');
    expect(rokuju).toMatchObject({ kazoe: null, man: 2027 });
    expect(CHOJU.filter((c) => c.basis === 'man').map((c) => c.name)).toEqual(['緑寿']);
  });

  it('2027 年の長寿祝いの早見表（仕様書の行）', () => {
    expect(
      chojuTable(2027).map((r) => [r.choju.name, r.kazoeBirthYear, r.manBirthYear]),
    ).toEqual([
      ['還暦', 1967, 1967],
      ['緑寿', null, 1961],
      ['古希', 1958, 1957],
      ['喜寿', 1951, 1950],
      ['傘寿', 1948, 1947],
      ['米寿', 1940, 1939],
      ['卒寿', 1938, 1937],
      ['白寿', 1929, 1928],
      ['百寿', 1928, 1927],
    ]);
  });
});

/** ページの本文（出典を書く ToolMeta の中は除く） */
function pageBody(slug: string): string {
  const read = (file: string) =>
    readFileSync(fileURLToPath(new URL(`../app/${slug}/${file}`, import.meta.url)), 'utf8');
  const page = read('page.tsx').replace(/<ToolMeta[\s\S]*<\/ToolMeta>/, '');
  return page + read('Calculator.tsx');
}

describe('ページの文言', () => {
  it('厄年の description の数字が yakudoshiTable() の結果と一致する', () => {
    const description = yakudoshiDescription(2027);
    expect(description).toContain('男性1986年生まれ');
    expect(description).toContain('女性1995年生まれ');
    expect(taiyakuBirthYears(2027)).toEqual({ male: 1986, female: 1995 });
    const male42 = yakudoshiTable(2027, 'male').find((r) => r.taiyaku && r.kind === 'hon');
    expect(description).toContain(`男性${male42?.birthYear}年生まれ`);
  });

  it('七五三の description の数字が shichigosanTable() の結果と一致する', () => {
    const description = shichigosanDescription(2026);
    expect(description).toContain('数え年なら2024・2022・2020年生まれ');
    expect(description).toContain('満年齢なら2023・2021・2019年生まれ');
  });

  it('ページの description は定数の年から組み立てている', () => {
    const shichigosan = readFileSync(
      fileURLToPath(new URL('../app/shichigosan/page.tsx', import.meta.url)),
      'utf8',
    );
    const yakudoshi = readFileSync(
      fileURLToPath(new URL('../app/yakudoshi/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(shichigosan).toContain('shichigosanDescription(year)');
    expect(yakudoshi).toContain('yakudoshiDescription(year)');
    expect(yakudoshi).toContain('const year = YAKUDOSHI_YEAR');
  });

  it('2 ページの本文に寺社の固有名・祈祷料・お守り・効果などの語を含まない', () => {
    const banned = ['神社本庁', '神宮', '大社', '八幡宮', '天満宮', '稲荷', '不動尊', '大師', '祈祷料', '初穂料', 'お守り', '効果', 'ご利益', '着物レンタル'];
    for (const slug of ['shichigosan', 'yakudoshi']) {
      const body = pageBody(slug);
      for (const word of banned) {
        expect(body, `${slug} に「${word}」がある`).not.toContain(word);
      }
    }
  });
});
