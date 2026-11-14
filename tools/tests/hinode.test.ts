import { describe, expect, it } from 'vitest';
import {
  addDays,
  checkLatLon,
  dayLengthChange,
  dayLengthChangeText,
  direction16,
  formatDuration,
  formatHm,
  HATSUHINODE_YEAR,
  hatsuhinodeInitialPrefs,
  hatsuhinodeRanking,
  hatsuhinodeYearFor,
  monthTable,
  nextHatsuhinode,
  nextSolstice,
  parseYmd,
  solsticeDate,
  sunTimes,
  todayJst,
} from '@/lib/hinode';
import { DEFAULT_PREF, findCapital, PREFECTURE_CAPITALS } from '@/lib/prefecture-capitals';

/** 'H:MM' を分に */
const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/**
 * 国立天文台 暦計算室「各地のこよみ」の値（2026-11-14 取得）。
 * 地点の緯度経度も同ページに書かれた値（国立天文台の計算地点。県庁の座標とは少し違う）を使い、
 * 式そのものが ±1 分以内で一致するかを見る。
 * [地点, 緯度, 経度, 日付, 日の出, 南中, 日の入り]
 */
const NAOJ_SEASONS: [string, number, number, string, string, string, string][] = [
  ['東京', 35.6581, 139.7414, '2026-12-22', '6:47', '11:39', '16:32'],
  ['東京', 35.6581, 139.7414, '2027-01-01', '6:50', '11:44', '16:38'],
  ['東京', 35.6581, 139.7414, '2027-06-21', '4:25', '11:43', '19:00'],
  ['東京', 35.6581, 139.7414, '2027-06-01', '4:27', '11:39', '18:51'],
  ['東京', 35.6581, 139.7414, '2027-03-20', '5:46', '11:49', '17:52'],
  ['東京', 35.6581, 139.7414, '2026-09-23', '5:29', '11:34', '17:37'],
  ['札幌', 43.0667, 141.35, '2026-12-22', '7:03', '11:33', '16:03'],
  ['札幌', 43.0667, 141.35, '2027-01-01', '7:06', '11:38', '16:10'],
  ['札幌', 43.0667, 141.35, '2027-06-21', '3:55', '11:36', '19:18'],
  ['札幌', 43.0667, 141.35, '2027-06-01', '3:58', '11:32', '19:07'],
  ['札幌', 43.0667, 141.35, '2027-03-20', '5:39', '11:42', '17:46'],
  ['札幌', 43.0667, 141.35, '2026-09-23', '5:22', '11:27', '17:31'],
  ['那覇', 26.2167, 127.6667, '2026-12-22', '7:13', '12:28', '17:43'],
  ['那覇', 26.2167, 127.6667, '2027-01-01', '7:17', '12:33', '17:49'],
  ['那覇', 26.2167, 127.6667, '2027-06-21', '5:37', '12:31', '19:25'],
  ['那覇', 26.2167, 127.6667, '2027-06-01', '5:37', '12:27', '19:17'],
  ['那覇', 26.2167, 127.6667, '2027-03-20', '6:34', '12:37', '18:40'],
  ['那覇', 26.2167, 127.6667, '2026-09-23', '6:18', '12:22', '18:25'],
];

/**
 * 国立天文台「各地のこよみ」2027年1月1日の全地点（49 地点）。
 * [地点, 緯度, 経度, 日の出, 南中, 日の入り, 日の出の方位]
 */
const NAOJ_2027_01_01: [string, number, number, string, string, string, number][] = [
  ["根室", 43.3333, 145.5833, "6:50", "11:21", "15:52", 121.6],
  ["青森", 40.8167, 140.7333, "7:01", "11:40", "16:20", 120.3],
  ["盛岡", 39.7000, 141.1500, "6:56", "11:39", "16:21", 119.8],
  ["仙台", 38.2667, 140.8667, "6:53", "11:40", "16:27", 119.1],
  ["秋田", 39.7167, 140.1167, "7:00", "11:43", "16:25", 119.8],
  ["山形", 38.2500, 140.3500, "6:55", "11:42", "16:29", 119.1],
  ["福島", 37.7500, 140.4667, "6:53", "11:41", "16:30", 118.9],
  ["水戸", 36.3667, 140.4833, "6:49", "11:41", "16:33", 118.4],
  ["宇都宮", 36.5667, 139.8833, "6:52", "11:44", "16:35", 118.4],
  ["前橋", 36.3833, 139.0667, "6:55", "11:47", "16:39", 118.4],
  ["さいたま", 35.8500, 139.6500, "6:51", "11:45", "16:38", 118.2],
  ["千葉", 35.6000, 140.1167, "6:49", "11:43", "16:37", 118.1],
  ["東京", 35.6581, 139.7414, "6:50", "11:44", "16:38", 118.1],
  ["小笠原[父島]", 27.0833, 142.1833, "6:20", "11:35", "16:49", 115.6],
  ["横浜", 35.4500, 139.6500, "6:50", "11:45", "16:39", 118.0],
  ["新潟", 37.9167, 139.0333, "6:59", "11:47", "16:35", 119.0],
  ["富山", 36.6833, 137.2167, "7:03", "11:54", "16:46", 118.5],
  ["金沢", 36.5667, 136.6500, "7:05", "11:57", "16:48", 118.4],
  ["福井", 36.0667, 136.2167, "7:06", "11:58", "16:51", 118.3],
  ["甲府", 35.6667, 138.5667, "6:55", "11:49", "16:43", 118.1],
  ["長野", 36.6500, 138.1833, "6:59", "11:51", "16:42", 118.5],
  ["岐阜", 35.4167, 136.7667, "7:02", "11:56", "16:51", 118.0],
  ["静岡", 34.9667, 138.3833, "6:54", "11:50", "16:45", 117.9],
  ["名古屋", 35.1667, 136.9167, "7:01", "11:56", "16:51", 117.9],
  ["津", 34.7333, 136.5167, "7:01", "11:57", "16:54", 117.8],
  ["大津", 35.0000, 135.8667, "7:04", "12:00", "16:55", 117.9],
  ["京都", 35.0167, 135.7500, "7:05", "12:00", "16:56", 117.9],
  ["大阪", 34.6833, 135.4833, "7:05", "12:01", "16:58", 117.8],
  ["神戸", 34.6833, 135.1833, "7:06", "12:03", "16:59", 117.8],
  ["奈良", 34.6833, 135.8333, "7:04", "12:00", "16:56", 117.8],
  ["和歌山", 34.2333, 135.1667, "7:05", "12:03", "17:00", 117.6],
  ["鳥取", 35.5000, 134.2333, "7:12", "12:06", "17:01", 118.0],
  ["松江", 35.4667, 133.0500, "7:17", "12:11", "17:05", 118.0],
  ["岡山", 34.6667, 133.9333, "7:11", "12:08", "17:04", 117.8],
  ["広島", 34.3833, 132.4500, "7:16", "12:13", "17:11", 117.7],
  ["山口", 34.1833, 131.4667, "7:20", "12:17", "17:15", 117.6],
  ["徳島", 34.0667, 134.5500, "7:07", "12:05", "17:03", 117.5],
  ["高松", 34.3500, 134.0500, "7:10", "12:07", "17:04", 117.6],
  ["松山", 33.8333, 132.7667, "7:14", "12:12", "17:11", 117.5],
  ["高知", 33.5500, 133.5333, "7:10", "12:09", "17:08", 117.4],
  ["福岡", 33.5833, 130.4000, "7:23", "12:22", "17:21", 117.4],
  ["佐賀", 33.2500, 130.3000, "7:22", "12:22", "17:22", 117.3],
  ["長崎", 32.7500, 129.8667, "7:23", "12:24", "17:25", 117.1],
  ["熊本", 32.8000, 130.7167, "7:19", "12:20", "17:22", 117.1],
  ["大分", 33.2333, 131.6167, "7:17", "12:17", "17:17", 117.3],
  ["宮崎", 31.9000, 131.4167, "7:14", "12:18", "17:21", 116.9],
  ["鹿児島", 31.6000, 130.5500, "7:17", "12:21", "17:25", 116.8],
  ["札幌", 43.0667, 141.3500, "7:06", "11:38", "16:10", 121.5],
  ["那覇", 26.2167, 127.6667, "7:17", "12:33", "17:49", 115.4],
];

describe('sunTimes：国立天文台「各地のこよみ」と ±1 分以内', () => {
  it.each(NAOJ_SEASONS)('%s %f %f %s', (_name, lat, lon, date, rise, transit, set) => {
    const r = sunTimes({ lat, lon, date });
    expect(Math.abs(r.sunrise! - hm(rise))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.transit - hm(transit))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.sunset! - hm(set))).toBeLessThanOrEqual(1);
    // 分に丸めた表示が国立天文台と同じか、1分違い
    expect(Math.abs(hm(formatHm(r.sunrise)) - hm(rise))).toBeLessThanOrEqual(1);
  });

  it.each(NAOJ_2027_01_01)('2027-01-01 %s', (_name, lat, lon, rise, transit, set, az) => {
    const r = sunTimes({ lat, lon, date: '2027-01-01' });
    expect(Math.abs(r.sunrise! - hm(rise))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.transit - hm(transit))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.sunset! - hm(set))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.azimuthRise! - az)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(r.azimuthSet! - (360 - az))).toBeLessThanOrEqual(0.5);
  });

  it('49 地点の 1/1 の日の出は、丸めた分が国立天文台と 8 割5分以上で完全一致する（残りも ±1 分）', () => {
    const same = NAOJ_2027_01_01.filter(
      ([, lat, lon, rise]) => formatHm(sunTimes({ lat, lon, date: '2027-01-01' }).sunrise) === rise,
    ).length;
    expect(same / NAOJ_2027_01_01.length).toBeGreaterThanOrEqual(0.85);
  });

  it('南中高度・方位：東京 2027-01-01（国立天文台 31.3°・118.1°・241.9°）', () => {
    const r = sunTimes({ lat: 35.6581, lon: 139.7414, date: '2027-01-01' });
    expect(r.transitAltitude).toBeCloseTo(31.3, 0);
    expect(direction16(r.azimuthRise!)).toBe('東南東');
    expect(direction16(r.azimuthSet!)).toBe('西南西');
  });

  it('夏至の東京は日の出が北東寄り（国立天文台 60.0°）・昼が14時間半ほど', () => {
    const r = sunTimes({ lat: 35.6581, lon: 139.7414, date: '2027-06-21' });
    expect(Math.abs(r.azimuthRise! - 60.0)).toBeLessThanOrEqual(0.3);
    expect(direction16(r.azimuthRise!)).toBe('東北東');
    expect(formatDuration(r.dayLength)).toBe('14時間35分');
  });
});

describe('HATSUHINODE_YEAR（日付に依存しない妥当性の検査。元日に落ちない）', () => {
  it('その年の 1/1 の東京の日の出が 6:45〜6:55 に入る', () => {
    const tokyo = findCapital('東京都')!;
    const r = sunTimes({ lat: tokyo.lat, lon: tokyo.lon, date: `${HATSUHINODE_YEAR}-01-01` });
    expect(r.sunrise!).toBeGreaterThanOrEqual(hm('6:45'));
    expect(r.sunrise!).toBeLessThanOrEqual(hm('6:55'));
  });

  it('4桁の年', () => {
    expect(String(HATSUHINODE_YEAR)).toMatch(/^\d{4}$/);
  });
});

describe('冬至・夏至の日付（国立天文台「暦要項」と一致）', () => {
  it('2026 年の冬至は 12-22、2027 年の夏至は 6-21', () => {
    expect(solsticeDate(2026, 'winter')).toBe('2026-12-22');
    expect(solsticeDate(2027, 'summer')).toBe('2027-06-21');
  });

  it('2027 年の冬至は 12-22、2026 年の夏至は 6-21', () => {
    expect(solsticeDate(2027, 'winter')).toBe('2027-12-22');
    expect(solsticeDate(2026, 'summer')).toBe('2026-06-21');
  });
});

describe('ボタンが指す日付（選んでいる日付から見て次に来る日）', () => {
  it('12-23 を選んでいると、冬至は翌年の冬至・初日の出は翌年 1/1', () => {
    expect(nextSolstice('2026-12-23', 'winter')).toBe('2027-12-22');
    expect(nextHatsuhinode('2026-12-23')).toBe('2027-01-01');
  });

  it('冬至の当日はその日、前日は同じ年の冬至', () => {
    expect(nextSolstice('2026-12-22', 'winter')).toBe('2026-12-22');
    expect(nextSolstice('2026-12-21', 'winter')).toBe('2026-12-22');
  });

  it('夏至：11 月から見ると翌年、6-21 当日はその日、6-22 は翌年（2028 年は 6-21 5時台 JST。UTC では 6-20）', () => {
    expect(nextSolstice('2026-11-14', 'summer')).toBe('2027-06-21');
    expect(nextSolstice('2027-06-21', 'summer')).toBe('2027-06-21');
    expect(nextSolstice('2027-06-22', 'summer')).toBe('2028-06-21');
  });

  it('初日の出：1/1 はその日、1/2 は翌年 1/1', () => {
    expect(nextHatsuhinode('2027-01-01')).toBe('2027-01-01');
    expect(nextHatsuhinode('2027-01-02')).toBe('2028-01-01');
  });

  it('初日の出の一覧を出すのは 12/20〜1/1', () => {
    expect(hatsuhinodeYearFor('2026-12-19')).toBeNull();
    expect(hatsuhinodeYearFor('2026-12-20')).toBe(2027);
    expect(hatsuhinodeYearFor('2026-12-31')).toBe(2027);
    expect(hatsuhinodeYearFor('2027-01-01')).toBe(2027);
    expect(hatsuhinodeYearFor('2027-01-02')).toBeNull();
  });
});

describe('47 地点のデータ', () => {
  it('47 件で、都道府県が重複しない', () => {
    expect(PREFECTURE_CAPITALS).toHaveLength(47);
    expect(new Set(PREFECTURE_CAPITALS.map((p) => p.pref)).size).toBe(47);
  });

  it('緯度 24〜46・経度 122〜146 に収まる', () => {
    for (const p of PREFECTURE_CAPITALS) {
      expect(p.lat).toBeGreaterThanOrEqual(24);
      expect(p.lat).toBeLessThanOrEqual(46);
      expect(p.lon).toBeGreaterThanOrEqual(122);
      expect(p.lon).toBeLessThanOrEqual(146);
    }
  });

  it('県庁と国立天文台の計算地点が近い県は、1/1 の日の出が 2 分以内で同じ', () => {
    // 国立天文台の地点名 → 県。県庁所在地と同じ市の地点だけ比べる
    const pairs: [string, string][] = [
      ['札幌', '北海道'],
      ['青森', '青森県'],
      ['仙台', '宮城県'],
      ['名古屋', '愛知県'],
      ['大阪', '大阪府'],
      ['福岡', '福岡県'],
      ['那覇', '沖縄県'],
    ];
    for (const [naojName, pref] of pairs) {
      const row = NAOJ_2027_01_01.find((r) => r[0] === naojName)!;
      const cap = findCapital(pref)!;
      const r = sunTimes({ lat: cap.lat, lon: cap.lon, date: '2027-01-01' });
      expect(Math.abs(r.sunrise! - hm(row[3]))).toBeLessThanOrEqual(2);
    }
  });

  it('既定の地点は東京都', () => {
    expect(findCapital(DEFAULT_PREF)?.pref).toBe('東京都');
  });
});

describe('初日の出の一覧', () => {
  const rows = hatsuhinodeRanking(PREFECTURE_CAPITALS, 2027);

  it('47 地点を早い順に並べる', () => {
    expect(rows).toHaveLength(47);
    for (let i = 1; i < rows.length; i++) expect(rows[i].sunrise).toBeGreaterThanOrEqual(rows[i - 1].sunrise);
  });

  it('同じ分の地点は同じ順位', () => {
    expect(rows[0].rank).toBe(1);
    for (let i = 1; i < rows.length; i++) {
      const same = Math.round(rows[i].sunrise) === Math.round(rows[i - 1].sunrise);
      expect(rows[i].rank).toBe(same ? rows[i - 1].rank : i + 1);
    }
  });

  it('最も早いのは東の地点・最も遅いのは西の地点（2027 年。県庁 47 地点）', () => {
    // 経度だけでなく緯度でも決まる：北の札幌は東京より東にあるのに東京より遅い
    expect(['茨城県', '千葉県', '東京都', '神奈川県']).toContain(rows[0].place.pref);
    expect(['長崎県', '福岡県', '佐賀県', '沖縄県']).toContain(rows[rows.length - 1].place.pref);
    const sapporo = rows.find((r) => r.place.pref === '北海道')!;
    const tokyo = rows.find((r) => r.place.pref === '東京都')!;
    expect(sapporo.sunrise).toBeGreaterThan(tokyo.sunrise);
  });

  it('スマホの初期表示は早い5・遅い5・選んでいる地点', () => {
    const set = hatsuhinodeInitialPrefs(rows, '岐阜県');
    expect(set.has(rows[0].place.pref)).toBe(true);
    expect(set.has(rows[46].place.pref)).toBe(true);
    expect(set.has('岐阜県')).toBe(true);
    expect(set.size).toBe(11);
    expect(hatsuhinodeInitialPrefs(rows, rows[0].place.pref).size).toBe(10);
  });
});

describe('日付の扱い（JST の暦日）', () => {
  it('日の入り後〜24時でも日本の「今日」になる（UTC に変換して前日・翌日にずれない）', () => {
    // 2026-12-22 23:30 JST ＝ 14:30 UTC
    expect(todayJst(new Date('2026-12-22T14:30:00Z'))).toBe('2026-12-22');
    // 2026-12-23 0:00 JST ＝ 12-22 15:00 UTC
    expect(todayJst(new Date('2026-12-22T15:00:00Z'))).toBe('2026-12-23');
    // 2026-12-22 18:00 JST（日の入り後）
    expect(todayJst(new Date('2026-12-22T09:00:00Z'))).toBe('2026-12-22');
    // ロサンゼルスでは 12-22 の朝でも、日本は 12-23
    expect(todayJst(new Date('2026-12-22T16:00:00-08:00'))).toBe('2026-12-23');
  });

  it('日付の文字列で計算するので、結果は実行環境のタイムゾーンに依存しない', () => {
    const a = sunTimes({ lat: 35.6896, lon: 139.6918, date: '2026-12-22' });
    // 前日・翌日とは違う値
    const prev = sunTimes({ lat: 35.6896, lon: 139.6918, date: '2026-12-21' });
    expect(a.sunset).not.toBe(prev.sunset);
    // 東京の日の出は 0:00〜24:00 JST の中
    expect(a.sunrise!).toBeGreaterThan(0);
    expect(a.sunset!).toBeLessThan(1440);
  });

  it('addDays・parseYmd', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(parseYmd('2027-02-29')).toBeNull();
    expect(parseYmd('2027-1-1')).toBeNull();
  });
});

describe('1か月の表・昼の長さの差', () => {
  it('その月の日数ぶんの行', () => {
    const tokyo = findCapital('東京都')!;
    expect(monthTable(tokyo.lat, tokyo.lon, 2027, 1)).toHaveLength(31);
    expect(monthTable(tokyo.lat, tokyo.lon, 2027, 2)).toHaveLength(28);
  });

  it('冬至の翌日は昼が長くなり、夏至の翌日は短くなる（12月下旬は1分未満の差）', () => {
    const tokyo = findCapital('東京都')!;
    const base = { lat: tokyo.lat, lon: tokyo.lon };
    expect(dayLengthChange({ ...base, date: '2027-01-20' })).toBeGreaterThan(0);
    expect(dayLengthChange({ ...base, date: '2027-08-01' })).toBeLessThan(0);
    expect(dayLengthChange({ ...base, date: '2026-12-23' })).toBe(0);
    expect(dayLengthChangeText(0)).toContain('ほぼ同じ');
    expect(dayLengthChangeText(2)).toBe('昨日より 2分 長い');
    expect(dayLengthChangeText(-1)).toBe('昨日より 1分 短い');
  });

  it('日の入りが最も早いのは12月上旬、日の出が最も遅いのは1月上旬（冬至ではない）', () => {
    const tokyo = findCapital('東京都')!;
    const rows = [...monthTable(tokyo.lat, tokyo.lon, 2026, 11), ...monthTable(tokyo.lat, tokyo.lon, 2026, 12), ...monthTable(tokyo.lat, tokyo.lon, 2027, 1)];
    const earliestSet = rows.reduce((a, b) => (b.sunset! < a.sunset! ? b : a));
    const latestRise = rows.reduce((a, b) => (b.sunrise! > a.sunrise! ? b : a));
    expect(earliestSet.date >= "2026-11-25" && earliestSet.date <= "2026-12-12").toBe(true);
    expect(latestRise.date >= '2027-01-01' && latestRise.date <= '2027-01-15').toBe(true);
  });
});

describe('緯度経度の手入力・日本の外', () => {
  it('範囲チェック', () => {
    expect(checkLatLon('', '139')).toMatchObject({ ok: false });
    expect(checkLatLon('abc', '139')).toMatchObject({ ok: false });
    expect(checkLatLon('91', '139')).toMatchObject({ ok: false });
    expect(checkLatLon('35', '181')).toMatchObject({ ok: false });
    expect(checkLatLon('35.68', '139.69')).toEqual({ ok: true, lat: 35.68, lon: 139.69, inJapan: true });
    expect(checkLatLon('34.05', '-118.24')).toMatchObject({ ok: true, inJapan: false });
  });

  it('日本の外の経度でも、JST の 0:00〜24:00 の中の時刻を返す', () => {
    const la = sunTimes({ lat: 34.05, lon: -118.24, date: '2027-01-01' });
    for (const t of [la.sunrise!, la.transit, la.sunset!]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1440);
    }
    // ロサンゼルスの南中は 12:00 PST ≒ 5:00 JST 前後
    expect(Math.abs(la.transit - hm('4:57'))).toBeLessThanOrEqual(5);
  });

  it('白夜・極夜は polar を返す', () => {
    expect(sunTimes({ lat: 78, lon: 15, date: '2027-06-21' }).polar).toBe('day');
    expect(sunTimes({ lat: 78, lon: 15, date: '2027-06-21' }).dayLength).toBe(1440);
    expect(sunTimes({ lat: 78, lon: 15, date: '2026-12-22' }).polar).toBe('night');
    expect(sunTimes({ lat: 78, lon: 15, date: '2026-12-22' }).sunrise).toBeNull();
    expect(sunTimes({ lat: 35, lon: 139, date: '2027-06-21' }).polar).toBeUndefined();
  });
});

describe('整形', () => {
  it('formatHm・formatDuration・direction16', () => {
    expect(formatHm(410.4)).toBe('6:50');
    expect(formatHm(410.5)).toBe('6:51');
    expect(formatHm(null)).toBe('—');
    expect(formatDuration(585)).toBe('9時間45分');
    expect(formatDuration(600)).toBe('10時間');
    expect(direction16(0)).toBe('北');
    expect(direction16(90)).toBe('東');
    expect(direction16(118)).toBe('東南東');
    expect(direction16(359)).toBe('北');
  });
});

describe('ページの文面（app/hinode-hinoiri/copy.ts）', async () => {
  const copy = await import('@/app/hinode-hinoiri/copy');

  it('title・description・FAQ の年は HATSUHINODE_YEAR から組み立てる', () => {
    expect(copy.title).toContain(`初日の出${HATSUHINODE_YEAR}`);
    expect(copy.description).toContain(`${HATSUHINODE_YEAR}年の初日の出`);
    expect(copy.faq[0].q).toBe(`${HATSUHINODE_YEAR}年の初日の出は何時？`);
  });

  it('FAQ は5問で、1問目は計算結果の地点名と時刻を書く', () => {
    expect(copy.faq).toHaveLength(5);
    const first = copy.RANKING[0];
    const last = copy.RANKING[copy.RANKING.length - 1];
    expect(copy.faq[0].a).toContain(`${first.place.pref}（${first.place.city}）の${formatHm(first.sunrise)}`);
    expect(copy.faq[0].a).toContain(`${last.place.pref}（${last.place.city}）の${formatHm(last.sunrise)}`);
  });

  it('「東京より東の札幌が東京より遅い」は計算でも成り立つ', () => {
    expect(findCapital('北海道')!.lon).toBeGreaterThan(findCapital('東京都')!.lon);
    expect(copy.SAPPORO_HATSU).toBeGreaterThan(copy.TOKYO_HATSU);
  });

  it('均時差の FAQ：日の入りが最も早い日・日の出が最も遅い日は冬至ではない', () => {
    const ex = copy.EQUATION_OF_TIME_EXAMPLE;
    expect(ex.earliestSet.date < ex.winter).toBe(true);
    expect(ex.latestRise.date > ex.winter).toBe(true);
    expect(ex.latestRise.date.slice(5, 7)).toBe('01');
  });
});
