/**
 * 日の出・日の入り 計算機のロジック（純関数のみ。DOM/React に依存しない）。
 *
 * 仕様: docs/features/hinode-hinoiri-keisan.md
 *
 * - 太陽の位置は Jean Meeus『Astronomical Algorithms』（2nd ed.）第25章の低精度式
 *   （米国 NOAA の太陽計算と同じ系統）。ユリウス日から平均近点角・黄経・均時差・赤緯を出す
 * - 日の出・日の入りは**太陽の上辺が地平線に接する**時刻（国立天文台「各地のこよみ」と同じ定義）。
 *   大気差 約35′＋視半径 約16′で、中心の高度 −0.8333° として求め、時刻を入れ直して反復する
 * - 時刻は**すべて日本標準時（UTC+9）**の 0:00 からの分。夏時間は無い
 * - 日付は 'YYYY-MM-DD'（JST の暦日）の文字列で持ち、`Date` のローカル時刻を通さない
 *   （ブラウザのタイムゾーンが JST でない人でも、日本の日付で計算するため）
 */

// 【データ更新箇所】毎年 11-15 に次の年へ上げる（次の初日の出の 6 週前。仕様書「年の定数」）。
// title・description・h1 の補足・FAQ・HTML に焼く初日の出の一覧は、すべてここから組み立てる。
// 「今の年と比べる」検査は入れない（元日の CI を止めないため）。
export const HATSUHINODE_YEAR = 2027;

/** 日の出・日の入りでの太陽の中心の高度（度）。大気差 34.5′＋視半径 16′ ≒ 50′ */
export const HORIZON_ALTITUDE = -0.8333;

/** JST は UTC+9（分） */
const JST_OFFSET_MIN = 9 * 60;

const RAD = Math.PI / 180;
const sin = (deg: number) => Math.sin(deg * RAD);
const cos = (deg: number) => Math.cos(deg * RAD);
const tan = (deg: number) => Math.tan(deg * RAD);
const asinDeg = (x: number) => Math.asin(x) / RAD;
const acosDeg = (x: number) => Math.acos(x) / RAD;
const mod = (x: number, m: number) => ((x % m) + m) % m;

// ---------------------------------------------------------------------------
// 日付（JST の暦日。'YYYY-MM-DD'）
// ---------------------------------------------------------------------------

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' を年月日に。実在しない日付は null */
export function parseYmd(s: string): Ymd | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatYmd({ y, m, d }: Ymd): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  // Date.UTC は月が溢れると繰り上がるので、翌月の 0 日＝その月の末日
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' に日数を足す（UTC の暦で数えるのでタイムゾーンに依存しない） */
export function addDays(date: string, days: number): string {
  const p = parseYmd(date);
  if (!p) throw new Error(`invalid date: ${date}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return formatYmd({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** その月の日付の一覧 */
export function datesOfMonth(y: number, m: number): string[] {
  return Array.from({ length: daysInMonth(y, m) }, (_, i) => formatYmd({ y, m, d: i + 1 }));
}

/**
 * ある時点の**日本の**日付。ブラウザのタイムゾーンが JST でなくても日本の今日になる。
 * （仕様書「今日と時刻の扱い」。`new Date().getDate()` はローカル時刻なので使わない）
 */
export function todayJst(now: Date): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return formatYmd({ y: get('year'), m: get('month'), d: get('day') });
}

/** 'M/D'（ボタンのラベル用） */
export function shortDateJa(date: string): string {
  const p = parseYmd(date);
  return p ? `${p.m}/${p.d}` : date;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** '2027年1月1日（金）' */
export function longDateJa(date: string): string {
  const p = parseYmd(date);
  if (!p) return date;
  const w = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${p.y}年${p.m}月${p.d}日（${WEEKDAYS[w]}）`;
}

// ---------------------------------------------------------------------------
// 太陽の位置（Meeus 第25章の低精度式）
// ---------------------------------------------------------------------------

/** 暦日の 0:00 UT のユリウス日（Meeus 第7章。グレゴリオ暦） */
export function julianDay0Ut(y: number, m: number, d: number): number {
  let yy = y;
  let mm = m;
  if (mm <= 2) {
    yy -= 1;
    mm += 12;
  }
  const a = Math.floor(yy / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + b - 1524.5;
}

/** JST の暦日の 0:00 JST（＝前日 15:00 UT）のユリウス日 */
export function julianDayJstMidnight(date: string): number {
  const p = parseYmd(date);
  if (!p) throw new Error(`invalid date: ${date}`);
  return julianDay0Ut(p.y, p.m, p.d) - JST_OFFSET_MIN / 1440;
}

export interface SunPosition {
  /** 視黄経（度。0〜360） */
  apparentLongitude: number;
  /** 赤緯（度） */
  declination: number;
  /** 均時差（分）。視太陽時 − 平均太陽時 */
  equationOfTime: number;
}

/**
 * ユリウス日（UT。ΔT ≒ 69秒は出没の時刻に 1秒も効かないので無視する）での太陽の位置。
 */
export function sunPosition(jd: number): SunPosition {
  const t = (jd - 2451545.0) / 36525;
  const l0 = mod(280.46646 + t * (36000.76983 + t * 0.0003032), 360);
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    sin(2 * m) * (0.019993 - 0.000101 * t) +
    sin(3 * m) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = mod(trueLong - 0.00569 - 0.00478 * sin(omega), 360);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * cos(omega);
  const declination = asinDeg(sin(obliq) * sin(apparentLongitude));
  const y = tan(obliq / 2) ** 2;
  const eqRad =
    y * sin(2 * l0) -
    2 * e * sin(m) +
    4 * e * y * sin(m) * cos(2 * l0) -
    0.5 * y * y * sin(4 * l0) -
    1.25 * e * e * sin(2 * m);
  return { apparentLongitude, declination, equationOfTime: (4 * eqRad) / RAD };
}

// ---------------------------------------------------------------------------
// 日の出・南中・日の入り
// ---------------------------------------------------------------------------

export interface SunTimesInput {
  /** 緯度（度。北が正） */
  lat: number;
  /** 経度（度。東が正） */
  lon: number;
  /** JST の暦日 'YYYY-MM-DD' */
  date: string;
}

export interface SunTimes {
  /** 日の出（JST 0:00 からの分）。白夜・極夜は null */
  sunrise: number | null;
  /** 南中（JST 0:00 からの分） */
  transit: number;
  /** 日の入り（JST 0:00 からの分）。白夜・極夜は null */
  sunset: number | null;
  /** 昼の長さ（分）。白夜は 1440、極夜は 0 */
  dayLength: number;
  /** 日の出の方位（北 0°・東回り） */
  azimuthRise: number | null;
  /** 日の入りの方位（北 0°・東回り） */
  azimuthSet: number | null;
  /** 南中高度（度） */
  transitAltitude: number;
  /** 一日中沈まない（day）・昇らない（night）。日本の範囲では起きない */
  polar?: 'day' | 'night';
}

/** 経度 lon の地点で、太陽の時角が ha（度）になる JST の時刻（分）。dayShift は 1440 の倍数のずれ */
function timeForHourAngle(lon: number, ha: number, eqTime: number, dayShift: number): number {
  // 時角 H は西回りが正（日の出は負・日の入りは正）。0:00 UT からの分で 720 − 4λ + 4H − 均時差。JST はそこに +540
  return 720 + JST_OFFSET_MIN - 4 * lon + 4 * ha - eqTime - dayShift;
}

/** 太陽の中心が高度 h0 になる時角（度）。cos の値が範囲外なら白夜・極夜 */
function hourAngleCos(lat: number, decl: number, h0: number): number {
  return (sin(h0) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl));
}

export function sunTimes({ lat, lon, date }: SunTimesInput): SunTimes {
  const jd0 = julianDayJstMidnight(date);
  const at = (minutes: number) => sunPosition(jd0 + minutes / 1440);

  // 南中：まず正午の位置で概算し、その時刻で入れ直す。
  // 日本の外の経度では JST の時刻が 0〜24時の外に出るので、その日の中に入るよう 1440 分ずつずらす
  const raw = timeForHourAngle(lon, 0, at(720).equationOfTime, 0);
  const dayShift = raw - mod(raw, 1440);
  let transit = timeForHourAngle(lon, 0, at(720).equationOfTime, dayShift);
  for (let i = 0; i < 2; i++) transit = timeForHourAngle(lon, 0, at(transit).equationOfTime, dayShift);

  const posT = at(transit);
  const transitAltitude = 90 - Math.abs(lat - posT.declination);

  const c0 = hourAngleCos(lat, posT.declination, HORIZON_ALTITUDE);
  if (c0 > 1 || c0 < -1) {
    const polar = c0 > 1 ? 'night' : 'day';
    return {
      sunrise: null,
      transit,
      sunset: null,
      dayLength: polar === 'day' ? 1440 : 0,
      azimuthRise: null,
      azimuthSet: null,
      transitAltitude,
      polar,
    };
  }

  const event = (sign: -1 | 1): { time: number; azimuth: number } | null => {
    let time = transit + sign * 4 * acosDeg(c0);
    let decl = posT.declination;
    for (let i = 0; i < 3; i++) {
      const p = at(time);
      decl = p.declination;
      const c = hourAngleCos(lat, decl, HORIZON_ALTITUDE);
      if (c > 1 || c < -1) return null;
      time = timeForHourAngle(lon, sign * acosDeg(c), p.equationOfTime, dayShift);
    }
    // 出没の瞬間の方位（北 0°・東回り）
    const cosAz = (sin(decl) - sin(lat) * sin(HORIZON_ALTITUDE)) / (cos(lat) * cos(HORIZON_ALTITUDE));
    const az = acosDeg(Math.max(-1, Math.min(1, cosAz)));
    return { time, azimuth: sign < 0 ? az : 360 - az };
  };

  const rise = event(-1);
  const set = event(1);
  if (!rise || !set) {
    // 出没の直前・直後で白夜・極夜に切り替わる日（極圏の境目）。昼の長さは南中の高度で決める
    const polar = transitAltitude > 0 ? 'day' : 'night';
    return {
      sunrise: rise?.time ?? null,
      transit,
      sunset: set?.time ?? null,
      dayLength: polar === 'day' ? 1440 : 0,
      azimuthRise: rise?.azimuth ?? null,
      azimuthSet: set?.azimuth ?? null,
      transitAltitude,
      polar,
    };
  }
  // 日本の外の経度では、日の出・日の入りが JST の前日・翌日に落ちることがある。
  // 「時刻は JST で表示」の約束なので、0:00〜24:00 の中に折り返す（隣の日の出没との差は 1 分ほど）
  return {
    sunrise: mod(rise.time, 1440),
    transit,
    sunset: mod(set.time, 1440),
    dayLength: set.time - rise.time,
    azimuthRise: rise.azimuth,
    azimuthSet: set.azimuth,
    transitAltitude,
  };
}

// ---------------------------------------------------------------------------
// 表示用の整形
// ---------------------------------------------------------------------------

/** 分を 'H:MM' に（秒は四捨五入で分に。国立天文台の表と同じ丸め）。null は '—' */
export function formatHm(minutes: number | null): string {
  if (minutes === null) return '—';
  const total = Math.round(minutes);
  const h = Math.floor(mod(total, 1440) / 60);
  const m = mod(total, 60);
  return `${h}:${pad2(m)}`;
}

/** 分を「○時間○分」に（四捨五入で分に） */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

const DIRECTIONS_16 = [
  '北',
  '北北東',
  '北東',
  '東北東',
  '東',
  '東南東',
  '南東',
  '南南東',
  '南',
  '南南西',
  '南西',
  '西南西',
  '西',
  '西北西',
  '北西',
  '北北西',
] as const;

/** 方位角（北 0°・東回り）を16方位に */
export function direction16(azimuth: number): string {
  return DIRECTIONS_16[Math.round(mod(azimuth, 360) / 22.5) % 16];
}

/** 昼の長さの前日との差（分。四捨五入）。正なら長くなった */
export function dayLengthChange(input: SunTimesInput): number {
  const today = sunTimes(input).dayLength;
  const yesterday = sunTimes({ ...input, date: addDays(input.date, -1) }).dayLength;
  return Math.round(today - yesterday);
}

/** 「昨日より ○分 長い／短い」の文 */
export function dayLengthChangeText(diff: number): string {
  if (diff === 0) return '昨日とほぼ同じ（1分未満の差）';
  return diff > 0 ? `昨日より ${diff}分 長い` : `昨日より ${-diff}分 短い`;
}

// ---------------------------------------------------------------------------
// 冬至・夏至と、ボタンが指す日付
// ---------------------------------------------------------------------------

export type Solstice = 'winter' | 'summer';

/**
 * その年の冬至（視黄経 270°）・夏至（90°）の**JST の日付**。
 * その日の 0:00 JST から翌日の 0:00 JST までの間に視黄経が節の角度を通る日。
 */
export function solsticeDate(year: number, kind: Solstice): string {
  const target = kind === 'winter' ? 270 : 90;
  const month = kind === 'winter' ? 12 : 6;
  for (let d = 15; d <= 28; d++) {
    const date = formatYmd({ y: year, m: month, d });
    const a = sunPosition(julianDayJstMidnight(date)).apparentLongitude;
    const b = sunPosition(julianDayJstMidnight(addDays(date, 1))).apparentLongitude;
    if (a < target && b >= target) return date;
  }
  throw new Error(`solstice not found: ${year} ${kind}`);
}

/** 選んでいる日付以後で最初の冬至・夏至（その日自体が冬至・夏至なら、その日） */
export function nextSolstice(from: string, kind: Solstice): string {
  const p = parseYmd(from);
  if (!p) throw new Error(`invalid date: ${from}`);
  const thisYear = solsticeDate(p.y, kind);
  return thisYear >= from ? thisYear : solsticeDate(p.y + 1, kind);
}

/** 選んでいる日付が 1/1 ならその日、それ以外は翌年の 1/1 */
export function nextHatsuhinode(from: string): string {
  const p = parseYmd(from);
  if (!p) throw new Error(`invalid date: ${from}`);
  return p.m === 1 && p.d === 1 ? from : formatYmd({ y: p.y + 1, m: 1, d: 1 });
}

/**
 * 初日の出の一覧を出す日付か（12/20〜1/1）。出すときはその初日の出の年、出さないときは null
 */
export function hatsuhinodeYearFor(date: string): number | null {
  const p = parseYmd(date);
  if (!p) return null;
  if (p.m === 1 && p.d === 1) return p.y;
  if (p.m === 12 && p.d >= 20) return p.y + 1;
  return null;
}

// ---------------------------------------------------------------------------
// 1か月の表・初日の出の一覧
// ---------------------------------------------------------------------------

export interface MonthRow {
  date: string;
  sunrise: number | null;
  sunset: number | null;
  dayLength: number;
}

export function monthTable(lat: number, lon: number, y: number, m: number): MonthRow[] {
  return datesOfMonth(y, m).map((date) => {
    const r = sunTimes({ lat, lon, date });
    return { date, sunrise: r.sunrise, sunset: r.sunset, dayLength: r.dayLength };
  });
}

export interface Place {
  /** 都道府県名（'東京都'） */
  pref: string;
  /** 県庁所在地の名前（'新宿区'・'札幌市'） */
  city: string;
  lat: number;
  lon: number;
}

export interface HatsuhinodeRow {
  rank: number;
  place: Place;
  /** 日の出（JST 0:00 からの分） */
  sunrise: number;
}

/**
 * year 年 1/1 の日の出を地点ごとに出し、早い順に並べる。
 * 順位は分に丸めた時刻で付け、同じ分の地点は同じ順位（1, 2, 2, 4 …）。並びは秒まで見た早い順
 */
export function hatsuhinodeRanking(places: readonly Place[], year: number): HatsuhinodeRow[] {
  const date = formatYmd({ y: year, m: 1, d: 1 });
  const rows = places
    .map((place) => ({ place, sunrise: sunTimes({ lat: place.lat, lon: place.lon, date }).sunrise as number }))
    .sort((a, b) => a.sunrise - b.sunrise);
  let rank = 0;
  let prev = Number.NaN;
  return rows.map((r, i) => {
    const minute = Math.round(r.sunrise);
    if (minute !== prev) rank = i + 1;
    prev = minute;
    return { rank, ...r };
  });
}

/**
 * スマホの初期表示で出す行：早い5・遅い5・選んでいる地点（仕様書「結果」4）。
 * 返すのは表示する行の pref の集合
 */
export function hatsuhinodeInitialPrefs(rows: readonly HatsuhinodeRow[], selected: string | null, n = 5): Set<string> {
  const set = new Set<string>();
  rows.slice(0, n).forEach((r) => set.add(r.place.pref));
  rows.slice(-n).forEach((r) => set.add(r.place.pref));
  if (selected) set.add(selected);
  return set;
}

// ---------------------------------------------------------------------------
// 緯度経度の手入力
// ---------------------------------------------------------------------------

export type LatLonCheck =
  | { ok: true; lat: number; lon: number; inJapan: boolean }
  | { ok: false; error: string };

/** 日本の範囲（この外なら「日本時間で表示しています。現地時刻ではありません」を出す） */
export const JAPAN_BOUNDS = { latMin: 20, latMax: 46, lonMin: 122, lonMax: 154 } as const;

/** 10進の度の入力を確かめる。緯度 −90〜90・経度 −180〜180（日本の外も計算はする） */
export function checkLatLon(latText: string, lonText: string): LatLonCheck {
  const lat = Number(latText.trim());
  const lon = Number(lonText.trim());
  if (latText.trim() === '' || lonText.trim() === '') return { ok: false, error: '緯度と経度を入れてください。' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: '緯度・経度は数字（10進の度）で入れてください。' };
  if (lat < -90 || lat > 90) return { ok: false, error: '緯度は −90〜90 の範囲で入れてください（北緯が正）。' };
  if (lon < -180 || lon > 180) return { ok: false, error: '経度は −180〜180 の範囲で入れてください（東経が正）。' };
  const b = JAPAN_BOUNDS;
  const inJapan = lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
  return { ok: true, lat, lon, inJapan };
}
