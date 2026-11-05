import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DATE_LIMIT_MS,
  EXCEL_1904_OFFSET_DAYS,
  LOG_MAX_BYTES,
  annotateLog,
  convertNumber,
  dateTimeToNumbers,
  detectUnit,
  excelSerialToWall,
  formatHms,
  formatIso,
  formatJa,
  formatRelative,
  formatSerial,
  formatYmd,
  parseNumberInput,
  warekiOf,
  wallClockAt,
  wallToMs,
  y2038Note,
  type ConvertResult,
  type UnixResult,
} from '@/lib/unix-jikan';
import { robotsFor, tools } from '@/lib/registry';

/**
 * UNIX時間・Excel シリアル値 変換（docs/features/unix-jikan-excel-serial.md の「計算の約束」1〜6）
 */

const detect = (raw: string) => detectUnit(parseNumberInput(raw)!);

function unix(raw: string, unit?: Parameters<typeof convertNumber>[1]): UnixResult {
  const r = convertNumber(raw, unit)!.result;
  if (r.kind !== 'unix') throw new Error(`unix ではない: ${JSON.stringify(r)}`);
  return r;
}

function excelText(r: ConvertResult): string {
  if (r.kind === 'excel') return `${formatYmd(r.wall)} ${formatHms(r.wall)}`;
  if (r.kind === 'excel-phantom') return `1900-02-29* ${r.time}`;
  if (r.kind === 'excel-time-only') return `time ${r.time}`;
  return `${r.kind}`;
}

describe('判定（整数部の桁数だけで決める）', () => {
  it('仕様の境界値', () => {
    expect(detect('999999')).toBe('excel');
    expect(detect('1000000')).toBe('sec');
    expect(detect('46331.5')).toBe('excel');
    expect(detect('1793836800.123456')).toBe('sec');
    expect(detect('99999999999')).toBe('sec');
    expect(detect('100000000000')).toBe('ms');
  });

  it('13・16・19 桁', () => {
    expect(detect('1793836800000')).toBe('ms');
    expect(detect('99999999999999')).toBe('ms');
    expect(detect('100000000000000')).toBe('us');
    expect(detect('1793836800000000')).toBe('us');
    expect(detect('99999999999999999')).toBe('us');
    expect(detect('100000000000000000')).toBe('ns');
    expect(detect('1793836800000000000')).toBe('ns');
  });

  it('小数でも整数部が 7 桁以上なら秒・ミリ秒…（小数かどうかでは決めない）', () => {
    expect(detect('1793836800000.5')).toBe('ms');
    expect(detect('1000000.5')).toBe('sec');
  });

  it('0 と負の値は Excel にしない', () => {
    expect(detect('0')).toBe('sec');
    expect(detect('-1')).toBe('sec');
    expect(detect('-46331')).toBe('sec');
    expect(detect('-100000000000')).toBe('ms');
  });

  it('桁区切り・全角・前後の空白を受ける', () => {
    expect(parseNumberInput(' 1,793,836,800 ')?.intDigits).toBe('1793836800');
    expect(parseNumberInput('１７９３８３６８００')?.intDigits).toBe('1793836800');
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('1.2.3')).toBeNull();
  });
});

describe('1. UNIX時間（うるう秒は数えない）', () => {
  it('0 は 1970-01-01T00:00:00Z', () => {
    const r = unix('0');
    expect(formatIso(r.utc, false, 'Z')).toBe('1970-01-01T00:00:00Z');
    expect(formatIso(r.jst, false, '+09:00')).toBe('1970-01-01T09:00:00+09:00');
  });

  it('1793836800 は 2026-11-05 09:00:00 日本時間（木）', () => {
    const r = unix('1793836800');
    expect(r.unit).toBe('sec');
    expect(formatJa(r.jst)).toBe('2026年11月5日（木） 09:00:00');
    expect(formatIso(r.utc, false, 'Z')).toBe('2026-11-05T00:00:00Z');
    expect(r.showMs).toBe(false);
    expect(r.truncated).toBe(false);
  });

  it('うるう秒を挟んでも 1 日は 86400 秒（2016-12-31 の 23:59:60 を数えない）', () => {
    expect(formatIso(unix('1483228800').utc, false, 'Z')).toBe('2017-01-01T00:00:00Z');
    expect(formatIso(unix('1483142400').utc, false, 'Z')).toBe('2016-12-31T00:00:00Z');
  });

  it('ミリ秒・マイクロ秒・ナノ秒は同じ瞬間になり、ミリ秒まで出す', () => {
    for (const raw of ['1793836800123', '1793836800123456', '1793836800123456789']) {
      const r = unix(raw);
      expect(formatIso(r.utc, r.showMs, 'Z'), raw).toBe('2026-11-05T00:00:00.123Z');
    }
    expect(unix('1793836800123').truncated).toBe(false);
    expect(unix('1793836800123456').truncated).toBe(true);
    expect(unix('1793836800123000').truncated).toBe(false);
  });

  it('ナノ秒の 19 桁を倍精度で丸めない（下の桁まで正しい）', () => {
    expect(unix('1793836800999999999').epochMs).toBe(1793836800999);
  });

  it('小数つきの秒（Python の time.time()）は .123 まで出して以下切り捨て', () => {
    const r = unix('1793836800.123456');
    expect(r.unit).toBe('sec');
    expect(formatHms(r.jst, r.showMs)).toBe('09:00:00.123');
    expect(r.truncated).toBe(true);
  });

  it('負の値（1970 年より前）は過去側に切り捨てる', () => {
    expect(formatIso(unix('-1').utc, false, 'Z')).toBe('1969-12-31T23:59:59Z');
    const r = unix('-0.5');
    expect(formatIso(r.utc, true, 'Z')).toBe('1969-12-31T23:59:59.500Z');
  });

  it('判定を手で切り替えられる', () => {
    expect(formatYmd(unix('46331', 'sec').utc)).toBe('1970-01-01');
    expect(formatIso(unix('1793836800', 'ms').utc, true, 'Z')).toBe('1970-01-21T18:17:16.800Z');
  });

  it('Date の範囲（±8.64e15 ミリ秒）を超えたら範囲外', () => {
    expect(convertNumber(String(DATE_LIMIT_MS), 'ms')!.result.kind).toBe('unix');
    expect(convertNumber(String(DATE_LIMIT_MS + 1), 'ms')!.result.kind).toBe('error');
    expect(convertNumber('9'.repeat(25))!.result.kind).toBe('error');
    expect(convertNumber(`-${DATE_LIMIT_MS + 1}`, 'ms')!.result.kind).toBe('error');
  });
});

describe('2. 日本時間は UTC+9 固定', () => {
  it('日付をまたぐ（UTC 15:00 は日本時間の翌日 0 時）', () => {
    const r = unix('1793890800');
    expect(formatIso(r.utc, false, 'Z')).toBe('2026-11-05T15:00:00Z');
    expect(formatJa(r.jst)).toBe('2026年11月6日（金） 00:00:00');
  });

  it('利用者の PC のタイムゾーン（TZ=America/New_York）でも同じ結果', () => {
    const saved = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // TZ の差し替えが効いていることを先に確かめる（効いていなければこのテストは意味がない）
      expect(new Date(Date.UTC(2026, 10, 5)).getTimezoneOffset()).toBe(300);
      expect(formatJa(unix('1793836800').jst)).toBe('2026年11月5日（木） 09:00:00');
      expect(excelText(convertNumber('46331.5')!.result)).toBe('2026-11-05 12:00:00');
      const back = dateTimeToNumbers('2026-11-05', '09:00:00', 'jst')!;
      expect(back.seconds).toBe(1793836800);
      expect(back.excel).toBe(46331.375);
      const log = annotateLog('1793836800');
      expect(log.ok && log.output).toBe('1793836800［2026-11-05 09:00:00 JST］');
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});

describe('3. Excel のシリアル値（1900 年基準）', () => {
  it('46331 は 2026-11-05、46331.5 は 12:00', () => {
    expect(excelText(excelSerialToWall(46331))).toBe('2026-11-05 00:00:00');
    expect(excelText(convertNumber('46331.5')!.result)).toBe('2026-11-05 12:00:00');
  });

  it('1 = 1900-01-01、59 = 1900-02-28、60 は Excel だけの 1900-02-29、61 = 1900-03-01', () => {
    expect(excelText(excelSerialToWall(1))).toBe('1900-01-01 00:00:00');
    expect(excelText(excelSerialToWall(59))).toBe('1900-02-28 00:00:00');
    expect(excelText(excelSerialToWall(60))).toBe('1900-02-29* 00:00:00');
    expect(excelText(excelSerialToWall(60.25))).toBe('1900-02-29* 06:00:00');
    expect(excelText(excelSerialToWall(61))).toBe('1900-03-01 00:00:00');
  });

  it('999999 は 4637 年、上限 2958465 は 9999-12-31、それより先は表せない', () => {
    expect(excelText(convertNumber('999999')!.result)).toBe('4637-11-25 00:00:00');
    expect(excelText(excelSerialToWall(2958465))).toBe('9999-12-31 00:00:00');
    expect(excelSerialToWall(2958466).kind).toBe('error');
  });

  it('1 未満は時刻だけ、負の値は日付にならない', () => {
    expect(excelText(excelSerialToWall(0.5))).toBe('time 12:00:00');
    expect(excelSerialToWall(-1).kind).toBe('error');
    expect(convertNumber('-46331', 'excel')!.result.kind).toBe('error');
  });

  it('秒は四捨五入（浮動小数の誤差で 23:59:59 が 23:59:58 に落ちない・0:00:00 に転ばない）', () => {
    // 23:59:59 = 86399 / 86400
    expect(excelText(excelSerialToWall(46331 + 86399 / 86400))).toBe('2026-11-05 23:59:59');
    expect(excelText(excelSerialToWall(46331.99998843))).toBe('2026-11-05 23:59:59');
    // 1/3 日 = 08:00:00
    expect(excelText(excelSerialToWall(46331 + 1 / 3))).toBe('2026-11-05 08:00:00');
    // 23:59:59.6 は翌日の 0:00:00 に繰り上がる
    expect(excelText(excelSerialToWall(46331 + 86399.6 / 86400))).toBe('2026-11-06 00:00:00');
  });

  it('自動の判定が Excel でも「秒として読むと」を併記できる', () => {
    const r = convertNumber('46331')!;
    expect(r.detected).toBe('excel');
    expect(formatJa(unix('46331', 'sec').jst)).toBe('1970年1月1日（木） 21:52:11');
  });
});

describe('4. 1904 年基準（Mac の古い Excel）', () => {
  it('0 = 1904-01-01、差は 1462 日', () => {
    expect(excelText(excelSerialToWall(0, 1904))).toBe('1904-01-01 00:00:00');
    expect(excelText(excelSerialToWall(46331 - EXCEL_1904_OFFSET_DAYS, 1904))).toBe('2026-11-05 00:00:00');
    expect(excelText(convertNumber('44869.5', 'excel', { excelBase: 1904 })!.result)).toBe('2026-11-05 12:00:00');
  });
});

describe('5. 和暦（toWareki を流用。1873-01-01 より前は出さない）', () => {
  const w = (y: number, m: number, d: number) => warekiOf(wallClockAt(wallToMs(y, m, d), 0));

  it('改元日の境目', () => {
    expect(w(1989, 1, 7)).toBe('昭和64年1月7日');
    expect(w(1989, 1, 8)).toBe('平成元年1月8日');
    expect(w(2019, 4, 30)).toBe('平成31年4月30日');
    expect(w(2019, 5, 1)).toBe('令和元年5月1日');
    expect(w(2026, 11, 5)).toBe('令和8年11月5日');
  });

  it('1872-12-31 は出さず、1873-01-01 は明治6年', () => {
    expect(w(1872, 12, 31)).toBeNull();
    expect(w(1873, 1, 1)).toBe('明治6年1月1日');
    expect(w(1800, 1, 1)).toBeNull();
  });

  it('和暦は日本時間の日付で出す', () => {
    const r = unix('1556636400'); // 2019-04-30T15:00:00Z = 日本時間 2019-05-01 0:00
    expect(warekiOf(r.jst)).toBe('令和元年5月1日');
    expect(warekiOf(r.utc)).toBe('平成31年4月30日');
  });
});

describe('6. 2038 年問題の境目', () => {
  it('2147483647 は 2038-01-19 03:14:07 UTC（日本時間 12:14:07）', () => {
    const r = unix('2147483647');
    expect(formatIso(r.utc, false, 'Z')).toBe('2038-01-19T03:14:07Z');
    expect(formatHms(r.jst)).toBe('12:14:07');
    expect(y2038Note(r.epochMs)).toContain('最後の秒です');
  });

  it('前後 1 日だけ一言添える', () => {
    expect(y2038Note(2147483646 * 1000)).toContain('1 秒前');
    expect(y2038Note(2147483648 * 1000)).toContain('超えています');
    expect(y2038Note((2147483647 + 86400) * 1000)).not.toBeNull();
    expect(y2038Note((2147483647 + 86401) * 1000)).toBeNull();
    expect(y2038Note(1793836800 * 1000)).toBeNull();
  });
});

describe('日時 → 数字', () => {
  it('日本時間の 2026-11-05 09:00 は 1793836800、シリアル値は見たままの 46331.375', () => {
    const r = dateTimeToNumbers('2026-11-05', '09:00', 'jst')!;
    expect(r.seconds).toBe(1793836800);
    expect(r.milliseconds).toBe(1793836800000);
    expect(r.excel).toBe(46331.375);
    expect(r.iso).toBe('2026-11-05T09:00:00+09:00');
  });

  it('UTC に切り替えると UNIX時間だけ 9 時間ずれ、シリアル値は変わらない', () => {
    const r = dateTimeToNumbers('2026-11-05', '09:00:00', 'utc')!;
    expect(r.seconds).toBe(1793836800 + 9 * 3600);
    expect(r.excel).toBe(46331.375);
    expect(r.iso).toBe('2026-11-05T09:00:00Z');
  });

  it('1900-02-28 以前は 1〜59、1900-03-01 は 61、1900-01-01 より前は表せない', () => {
    expect(dateTimeToNumbers('1900-01-01', '00:00', 'jst')!.excel).toBe(1);
    expect(dateTimeToNumbers('1900-02-28', '00:00', 'jst')!.excel).toBe(59);
    expect(dateTimeToNumbers('1900-03-01', '00:00', 'jst')!.excel).toBe(61);
    const before = dateTimeToNumbers('1899-12-31', '00:00', 'jst')!;
    expect(before.excel).toBeNull();
    expect(before.excelError).toContain('Excel では表せません');
  });

  it('秒の行き来がずれない（シリアル値 → 日時 → シリアル値）', () => {
    const r = dateTimeToNumbers('2026-11-05', '23:59:59', 'jst')!;
    expect(excelText(excelSerialToWall(r.excel!))).toBe('2026-11-05 23:59:59');
    expect(formatSerial(r.excel!)).toBe('46331.9999884259');
  });

  it('実在しない日・形の崩れた入力は null', () => {
    expect(dateTimeToNumbers('2026-02-30', '00:00', 'jst')).toBeNull();
    expect(dateTimeToNumbers('2026-11-05', '24:00', 'jst')).toBeNull();
    expect(dateTimeToNumbers('', '00:00', 'jst')).toBeNull();
  });
});

describe('いまから◯日前／後', () => {
  const now = 1793836800000;
  it('単位を選んで出す', () => {
    expect(formatRelative(now, now)).toBe('いま');
    expect(formatRelative(now - 30_000, now)).toBe('30秒前');
    expect(formatRelative(now + 5 * 60_000, now)).toBe('5分後');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3時間前');
    expect(formatRelative(now + 400 * 86_400_000, now)).toBe('400日後');
  });
});

describe('ログ欄', () => {
  it('10 桁・13 桁の直後に日本時間を添え、元の文字は変えない', () => {
    const text = '{"timestamp": 1793836800, "at": 1793836800123}\nok';
    const r = annotateLog(text);
    if (!r.ok) throw new Error(r.message);
    expect(r.count).toBe(2);
    expect(r.output).toBe(
      '{"timestamp": 1793836800［2026-11-05 09:00:00 JST］, "at": 1793836800123［2026-11-05 09:00:00.123 JST］}\nok',
    );
    // 添えたものを取り除くと元に戻る
    expect(r.output.replace(/［[^］]*］/g, '')).toBe(text);
  });

  it('誤検出を避ける（先頭 0・直前が . - /・前後が英数字）', () => {
    for (const text of ['0312345678', 'v1.1793836800', 'ID-1793836800', '/tmp/1793836800', 'id1793836800', '1793836800abc']) {
      const r = annotateLog(text);
      expect(r.ok && r.count, text).toBe(0);
    }
  });

  it('桁違いと 2000-01-01〜2100-12-31（UTC）の外は拾わない', () => {
    const count = (text: string) => {
      const r = annotateLog(text);
      if (!r.ok) throw new Error(r.message);
      return r.count;
    };
    expect(count('946684800')).toBe(0); // 9 桁
    expect(count('12345678901')).toBe(0); // 11 桁
    expect(count('9466847990')).toBe(0); // 2269 年
    expect(count('4133980799')).toBe(1); // 2100-12-31 23:59:59Z
    expect(count('4133980800')).toBe(0); // 2101 年
    expect(count('1000000000000')).toBe(1); // ms で 2001 年
    expect(count('9466848000000')).toBe(0); // ms で 2269 年
  });

  it('前後の区切り（= ・カンマ・空白・かっこ）は拾う', () => {
    const r = annotateLog('t=1793836800,1793836800 [1793836800]');
    expect(r.ok && r.count).toBe(3);
  });

  it('Excel のシリアル値は拾わない', () => {
    const r = annotateLog('date 46331');
    expect(r.ok && r.count).toBe(0);
  });

  it('1MB を超えたら止める', () => {
    const r = annotateLog('a'.repeat(LOG_MAX_BYTES + 1));
    expect(r.ok).toBe(false);
    expect(annotateLog('a'.repeat(LOG_MAX_BYTES)).ok).toBe(true);
  });
});

describe('registry と送らない約束', () => {
  it('wip で、robots は noindex', () => {
    const tool = tools.find((t) => t.slug === 'unix-jikan')!;
    expect(tool.stage).toBe('wip');
    expect(tool.category).toBe('計算・変換');
    expect(robotsFor('unix-jikan')).toMatchObject({ index: false });
  });

  const dir = fileURLToPath(new URL('../app/unix-jikan/', import.meta.url));
  const files = [
    ...readdirSync(dir).map((name) => `${dir}${name}`),
    fileURLToPath(new URL('../lib/unix-jikan.ts', import.meta.url)),
  ];

  it('通信・保存の処理が無い', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB']) {
        expect(source.includes(word), `${file} に ${word}`).toBe(false);
      }
    }
  });

  it('毎秒の表示に aria-live を付けず、setInterval で回す', () => {
    const source = readFileSync(`${dir}Calculator.tsx`, 'utf8');
    expect(source).not.toMatch(/aria-live=/);
    expect(source).not.toContain('requestAnimationFrame');
    expect(source).toContain('setInterval');
    expect(source).toContain('visibilitychange');
  });

  it('lib はローカルタイムの関数と Intl のタイムゾーンを使わない', () => {
    const source = readFileSync(files[files.length - 1], 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    for (const word of ['getHours(', 'getDate(', 'getFullYear(', 'getTimezoneOffset', 'Intl.', 'toLocaleString(\'ja-JP\', {']) {
      expect(source.includes(word), word).toBe(false);
    }
  });
});
