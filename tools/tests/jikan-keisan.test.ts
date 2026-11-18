import { describe, expect, it } from 'vitest';
import * as lib from '@/lib/jikan-keisan';
import {
  EXCEL_FORMULAS,
  HOUR,
  MINUTE,
  calcWorkDay,
  decimalHoursToSec,
  formatDaysHm,
  formatDecimalHours,
  formatHm,
  formatYen,
  formatYen2,
  hayamihyo,
  hmToSec,
  isWorkError,
  minutesToSec,
  nightOverlapSec,
  parseBreak,
  parseClock,
  parseDuration,
  parsePasted,
  parseWage,
  requiredBreakSec,
  roundMonthlyTotal,
  sumDurations,
  sumWorkDays,
  wageAmount,
  type WorkDay,
  type WorkInput,
} from '@/lib/jikan-keisan';
import { roundHoursSimplified } from '@/lib/zangyodai';

const day = (start: string, end: string, breakTime = ''): WorkDay => {
  const r = calcWorkDay({ start, end, breakTime });
  if (isWorkError(r)) throw new Error(`unexpected error: ${r.error}`);
  return r;
};
const hm = (h: number, m = 0, s = 0) => h * HOUR + m * MINUTE + s;

describe('parseClock（時刻の入力）', () => {
  it.each([
    ['9:00', hm(9)],
    ['09:00', hm(9)],
    ['9:00:30', hm(9, 0, 30)],
    ['900', hm(9)],
    ['0900', hm(9)],
    ['1730', hm(17, 30)],
    ['9', hm(9)],
    ['9時', hm(9)],
    ['9時30分', hm(9, 30)],
    ['９：００', hm(9)],
    ['１７３０', hm(17, 30)],
    [' 18:00 ', hm(18)],
    ['0:00', 0],
    ['24:00', hm(24)],
    ['26:00', hm(26)],
    ['29:59', hm(29, 59)],
  ])('%s', (input, expected) => {
    expect(parseClock(input)).toBe(expected);
  });

  it.each(['', 'abc', '9:60', '30:00', '960', '12345', '-1:00', '9:5'])('%s は読めない', (input) => {
    expect(parseClock(input)).toBeNull();
  });
});

describe('parseBreak（休憩の入力）', () => {
  it.each([
    ['', 0],
    ['60', 60 * MINUTE],
    ['45', 45 * MINUTE],
    ['100', hm(1)],
    ['130', hm(1, 30)],
    ['1:00', hm(1)],
    ['0:45', 45 * MINUTE],
    ['45分', 45 * MINUTE],
    ['1時間', hm(1)],
    ['1時間30分', hm(1, 30)],
    ['６０', 60 * MINUTE],
  ])('%s', (input, expected) => {
    expect(parseBreak(input)).toBe(expected);
  });

  it('3〜4桁を h:mm と読んだかを返す（120 → 1:20 の打ち間違いに気づけるように）', () => {
    expect(lib.breakReadAsHm('120')).toBe(true);
    expect(lib.breakReadAsHm('１２０')).toBe(true);
    expect(lib.breakReadAsHm('60')).toBe(false);
    expect(lib.breakReadAsHm('1:20')).toBe(false);
    expect(lib.breakReadAsHm('160')).toBe(false);
  });
  it('3桁で分が60以上は読めない', () => {
    expect(parseBreak('160')).toBeNull();
  });
});

describe('確かめること 1〜3：実働・8時間超・休憩の不足（労基法32・34条）', () => {
  it('1. 9:00〜18:00・休憩60分 → 実働 8:00・8時間超 0:00・不足なし', () => {
    const d = day('9:00', '18:00', '60');
    expect(formatHm(d.workSec)).toBe('8:00');
    expect(formatDecimalHours(d.workSec)).toBe('8.00');
    expect(d.spanSec).toBe(hm(9));
    expect(d.over8Sec).toBe(0);
    expect(d.breakShortage).toBeNull();
    expect(d.overnight).toBe(false);
  });

  it('2. 9:00〜18:00・休憩45分 → 実働 8:15・8時間超 0:15・休憩不足（60分必要）', () => {
    const d = day('9:00', '18:00', '45');
    expect(formatHm(d.workSec)).toBe('8:15');
    expect(formatHm(d.over8Sec)).toBe('0:15');
    expect(d.breakShortage).toEqual({ requiredSec: 60 * MINUTE, shortSec: 15 * MINUTE });
  });

  it('3. ちょうど6時間は不足の印なし、6時間1分は印あり（45分必要）', () => {
    expect(day('9:00', '15:00', '0').breakShortage).toBeNull();
    expect(formatHm(day('9:00', '15:00', '0').workSec)).toBe('6:00');
    expect(day('9:00', '15:01', '0').breakShortage).toEqual({ requiredSec: 45 * MINUTE, shortSec: 45 * MINUTE });
  });

  it('34条は実働で判定する：拘束 6:45・休憩45分（実働 6:00）は不要の側', () => {
    expect(day('9:00', '15:45', '45').breakShortage).toBeNull();
  });

  it('ちょうど8時間・休憩45分は不足なし、8時間1分なら60分が必要', () => {
    expect(day('9:00', '17:45', '45').breakShortage).toBeNull();
    expect(day('9:00', '17:46', '45').breakShortage).toEqual({ requiredSec: 60 * MINUTE, shortSec: 15 * MINUTE });
  });

  it('requiredBreakSec の境界', () => {
    expect(requiredBreakSec(hm(6))).toBe(0);
    expect(requiredBreakSec(hm(6) + 1)).toBe(45 * MINUTE);
    expect(requiredBreakSec(hm(8))).toBe(45 * MINUTE);
    expect(requiredBreakSec(hm(8) + 1)).toBe(60 * MINUTE);
  });
});

describe('確かめること 4：深夜（22〜5時、労基法37条4項）の幅', () => {
  it('22:00〜翌7:00・休憩60分 → 日またぎ・実働 8:00・深夜の拘束 7:00・深夜の実働 6:00〜7:00', () => {
    const d = day('22:00', '7:00', '60');
    expect(d.overnight).toBe(true);
    expect(formatHm(d.workSec)).toBe('8:00');
    expect(formatHm(d.nightSpanSec)).toBe('7:00');
    expect(formatHm(d.nightMinSec)).toBe('6:00');
    expect(formatHm(d.nightMaxSec)).toBe('7:00');
  });

  it('9:00〜18:00 は深夜 0:00（最小と最大が同じ）', () => {
    const d = day('9:00', '18:00', '60');
    expect(d.nightMinSec).toBe(0);
    expect(d.nightMaxSec).toBe(0);
  });

  it('早朝 4:00〜13:00 は 4:00〜5:00 の1時間が深夜', () => {
    expect(day('4:00', '13:00', '60').nightSpanSec).toBe(hm(1));
  });

  it('最大は実働を超えない：22:00〜23:00・休憩30分 → 0:30〜0:30', () => {
    const d = day('22:00', '23:00', '30');
    expect(d.nightMinSec).toBe(30 * MINUTE);
    expect(d.nightMaxSec).toBe(30 * MINUTE);
  });

  it('前日の深夜帯（0:00〜5:00）と翌日の深夜帯（22:00〜）の両方にかかる勤務', () => {
    // 3:00〜翌 0:00（21時間）：3〜5時の2時間と 22〜24時の2時間
    expect(nightOverlapSec(hm(3), hm(24))).toBe(hm(4));
  });
});

describe('確かめること 5：25時表記と日またぎ', () => {
  it('17:00〜26:00 と 17:00〜2:00 が同じ結果', () => {
    const a = day('17:00', '26:00', '60');
    const b = day('17:00', '2:00', '60');
    expect(a).toEqual(b);
    expect(formatHm(a.workSec)).toBe('8:00');
    expect(formatHm(a.nightSpanSec)).toBe('4:00');
    expect(a.overnight).toBe(true);
  });

  it('退勤が出勤と同じなら翌日（24時間の拘束）', () => {
    expect(day('9:00', '9:00', '60').spanSec).toBe(hm(24));
  });
});

describe('入力の誤り', () => {
  const err = (i: WorkInput) => {
    const r = calcWorkDay(i);
    return isWorkError(r) ? r.error : null;
  };
  it('時刻・休憩が読めない', () => {
    expect(err({ start: 'x', end: '18:00', breakTime: '' })).toBe('start');
    expect(err({ start: '9:00', end: '', breakTime: '' })).toBe('end');
    expect(err({ start: '9:00', end: '18:00', breakTime: 'abc' })).toBe('break');
  });
  it('休憩が拘束時間以上', () => {
    expect(err({ start: '9:00', end: '10:00', breakTime: '60' })).toBe('break-too-long');
  });
  it('36時間を超える勤務は受け付けない（上限の定数）', () => {
    expect(lib.MAX_SPAN_SEC).toBe(hm(36));
    // 25時表記の上限 29:59 と日またぎの組み合わせでは 36時間を超えない
    expect(err({ start: '0:00', end: '29:59', breakTime: '' })).toBeNull();
  });
});

describe('確かめること 6：時間の足し算・引き算', () => {
  it('1:30 + 0:50 − 0:15 = 2:05', () => {
    const r = sumDurations('1:30 + 0:50 − 0:15');
    expect(formatHm(r.totalSec)).toBe('2:05');
    expect(r.errors).toEqual([]);
  });
  it('23:30 + 1:00 = 24:30（0:30 に戻らない）', () => {
    expect(formatHm(sumDurations('23:30\n1:00').totalSec)).toBe('24:30');
  });
  it('行頭の符号で引く・単位を混ぜる', () => {
    const r = sumDurations('1:00\n-90分\n+1.5時間\n0:00:30');
    expect(r.totalSec).toBe(hm(1, 0, 30));
    expect(formatHm(r.totalSec)).toBe('1:00:30');
  });
  it('マイナスは符号つき', () => {
    expect(formatHm(sumDurations('0:10 - 0:35').totalSec)).toBe('−0:25');
  });
  it('日本語入力の「ー」（長音）も引き算として読む', () => {
    const r = sumDurations('1:30\nー0:15');
    expect(r.errors).toEqual([]);
    expect(formatHm(r.totalSec)).toBe('1:15');
  });
  it('全角の式も読む', () => {
    expect(formatHm(sumDurations('１：３０＋０：５０').totalSec)).toBe('2:20');
  });
  it('読めない項はエラーに出し、合計からは外す', () => {
    const r = sumDurations('1:00 + abc');
    expect(r.totalSec).toBe(hm(1));
    expect(r.errors).toEqual(['abc']);
  });
  it('◯日と◯時間◯分', () => {
    expect(formatDaysHm(hm(50, 15))).toBe('2日と2時間15分');
    expect(formatDaysHm(hm(2, 5))).toBe('2時間5分');
  });
});

describe('確かめること 7：10進数 ⇔ 時分の換算', () => {
  it('7:45 ⇔ 7.75', () => {
    expect(formatDecimalHours(hmToSec('7:45')!)).toBe('7.75');
    expect(formatHm(decimalHoursToSec('7.75')!)).toBe('7:45');
  });
  it('7.8 → 7:48', () => {
    expect(formatHm(decimalHoursToSec('7.8')!)).toBe('7:48');
  });
  it('7:20 → 7.33（表示）だが内部は 26,400 秒のまま', () => {
    const s = hmToSec('7:20')!;
    expect(s).toBe(26400);
    expect(formatDecimalHours(s)).toBe('7.33');
  });
  it('465分 → 7:45', () => {
    expect(formatHm(minutesToSec('465')!)).toBe('7:45');
  });
  it('二進小数の誤差を出さない（0.1 + 0.2 型）', () => {
    expect(decimalHoursToSec('0.1')! + decimalHoursToSec('0.2')!).toBe(decimalHoursToSec('0.3'));
  });
  it('割り切れない10進数は秒に丸めて h:mm:ss で出す', () => {
    expect(formatHm(decimalHoursToSec('7.33')!)).toBe('7:19:48');
  });
  it('早見表（15分刻み・5分刻み）', () => {
    expect(hayamihyo(15).map((r) => `${r.hm}=${r.decimal}`)).toEqual([
      '0:15=0.25',
      '0:30=0.50',
      '0:45=0.75',
      '1:00=1.00',
    ]);
    const five = hayamihyo(5);
    expect(five).toHaveLength(12);
    expect(five[0]).toEqual({ hm: '0:05', minutes: 5, decimal: '0.08' });
    expect(five[3].decimal).toBe('0.33');
  });
  it('parseDuration は単位のない数を時間として読む', () => {
    expect(parseDuration('1.5')).toBe(hm(1, 30));
    expect(parseDuration('90分')).toBe(hm(1, 30));
    expect(parseDuration('1時間30分')).toBe(hm(1, 30));
    expect(parseDuration('1:75')).toBeNull();
  });
});

describe('確かめること 8：時給 × 実働（切り捨ては置かない）', () => {
  it('1,226円 × 7:20 = 8,990.666… → 8,990.67円・目安 8,991円', () => {
    const a = wageAmount(hm(7, 20), 1226);
    expect(formatYen2(a.hundredths)).toBe('8,990.67円');
    expect(formatYen(a.yenRounded)).toBe('8,991円');
  });
  it('切り捨ての値を返す関数・フィールドが無い', () => {
    const a = wageAmount(hm(7, 20), 1226);
    expect(Object.keys(a).sort()).toEqual(['hundredths', 'yenRounded']);
    const names = Object.keys(lib).join(',');
    expect(names).not.toMatch(/floor|truncat|kirisute/i);
  });
  it('ちょうど50銭は切り上げ', () => {
    // 1,001円 × 0:30 = 500.5円
    expect(wageAmount(hm(0, 30), 1001).yenRounded).toBe(501);
  });
  it('時給の入力', () => {
    expect(parseWage('1,226')).toBe(1226);
    expect(parseWage('１２２６円')).toBe(1226);
    expect(parseWage('0')).toBeNull();
    expect(parseWage('12.5')).toBeNull();
    expect(parseWage('')).toBeNull();
  });
});

describe('確かめること 9：月の合計の丸め（基発第150号(1)）', () => {
  it('20:29 → 20:00、20:30 → 21:00、20:29:59 → 20:00（分に切り捨ててから渡す）', () => {
    expect(roundMonthlyTotal(hm(20, 29))).toBe(hm(20));
    expect(roundMonthlyTotal(hm(20, 30))).toBe(hm(21));
    expect(roundMonthlyTotal(hm(20, 29, 59))).toBe(hm(20));
  });

  it('zangyodai.ts の roundHoursSimplified と一致する', () => {
    for (let m = 0; m <= 180; m += 1) {
      expect(roundMonthlyTotal(m * MINUTE)).toBe(roundHoursSimplified(m / 60) * HOUR);
    }
  });

  it('実働の合計は 168:45 のまま変わらない（丸めの選択に関係なく）', () => {
    // 20日 × 8:00 ＋ 1日 8:45 = 168:45
    const days = [...Array.from({ length: 20 }, () => day('9:00', '18:00', '60')), day('9:00', '18:45', '60')];
    const none = sumWorkDays(days, 'none');
    const rounded = sumWorkDays(days, 'kihatsu150');
    expect(formatHm(none.workSec)).toBe('168:45');
    expect(formatDecimalHours(none.workSec)).toBe('168.75');
    expect(rounded.workSec).toBe(none.workSec);
    expect(formatHm(rounded.over8Sec)).toBe('0:45');
    expect(formatHm(rounded.rounded.over8Sec)).toBe('1:00');
  });

  it('8時間超の合計・深夜の合計にだけ丸めが効く', () => {
    const days = [day('9:00', '19:29', '60'), day('9:00', '18:00', '60'), day('22:00', '6:30', '60'), day('22:00', '22:29', '0')];
    const t = sumWorkDays(days, 'kihatsu150');
    expect(formatHm(t.over8Sec)).toBe('1:29');
    expect(formatHm(t.rounded.over8Sec)).toBe('1:00');
    // 深夜：22:00〜6:30（拘束 7:00・休憩60分 → 6:00〜7:00）＋ 22:00〜22:29（0:29）
    expect(formatHm(t.nightMinSec)).toBe('6:29');
    expect(formatHm(t.nightMaxSec)).toBe('7:29');
    expect(formatHm(t.rounded.nightMinSec)).toBe('6:00');
    expect(formatHm(t.rounded.nightMaxSec)).toBe('7:00');
    expect(t.days).toBe(4);
    expect(t.overnightDays).toBe(1);
    const n = sumWorkDays(days, 'none');
    expect(n.rounded).toEqual({ nightMinSec: n.nightMinSec, nightMaxSec: n.nightMaxSec, over8Sec: n.over8Sec });
  });

  it('休憩の不足の日数を数える', () => {
    expect(sumWorkDays([day('9:00', '18:00', '45'), day('9:00', '18:00', '60')]).breakShortDays).toBe(1);
  });
});

describe('Excel からの貼り付け', () => {
  it('タブ区切り 3列', () => {
    const r = parsePasted('9:00\t18:00\t1:00\n9:30\t18:30\t1:00\n');
    expect(r.rows).toEqual([
      { label: null, start: '9:00', end: '18:00', breakTime: '1:00' },
      { label: null, start: '9:30', end: '18:30', breakTime: '1:00' },
    ]);
    expect(r.skipped).toEqual([]);
  });
  it('カンマ区切り 2列・見出し行・日付の列', () => {
    const r = parsePasted('日付,出勤,退勤,休憩\n11/1,9:00,18:00,60\n2026/11/02(月),22:00,7:00,60\n9:00,17:00');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0].label).toBe('11/1');
    expect(r.rows[1].label).toBe('2026/11/02(月)');
    expect(r.rows[2]).toEqual({ label: null, start: '9:00', end: '17:00', breakTime: '' });
    expect(r.skipped).toEqual([]);
  });
  it('Excel の h:mm:ss の形も読む', () => {
    const r = parsePasted('9:00:00\t18:00:00\t1:00:00');
    const d = calcWorkDay(r.rows[0]);
    expect(!isWorkError(d) && formatHm(d.workSec)).toBe('8:00');
  });
  it('読めない行の番号を返す', () => {
    expect(parsePasted('9:00\t18:00\nあいう 1\n9:00').skipped).toEqual([2, 3]);
  });
  it('行数の上限', () => {
    const text = Array.from({ length: lib.MAX_ROWS + 5 }, () => '9:00\t18:00\t60').join('\n');
    const r = parsePasted(text);
    expect(r.rows).toHaveLength(lib.MAX_ROWS);
    expect(r.truncated).toBe(5);
  });
});

describe('Excel の式', () => {
  it('A列=出勤・B列=退勤・C列=休憩の固定の式', () => {
    const f = Object.fromEntries(EXCEL_FORMULAS.map((x) => [x.key, x.formula]));
    expect(f.work).toBe('=MOD(B2-A2,1)-C2');
    expect(f['work-minutes']).toBe('=MOD(B2-A2,1)-C2/1440');
    expect(f.decimal).toBe('=(MOD(B2-A2,1)-C2)*24');
    expect(f.sum).toBe('[h]:mm');
  });
});

describe('表示', () => {
  it('formatHm は24時間を超えても繰り上げない', () => {
    expect(formatHm(hm(168, 45))).toBe('168:45');
    expect(formatHm(hm(0, 5))).toBe('0:05');
    expect(formatHm(hm(1, 0, 5))).toBe('1:00:05');
    expect(formatHm(hm(1, 0, 5), 'never')).toBe('1:00');
  });
  it('formatDecimalHours の四捨五入', () => {
    expect(formatDecimalHours(hm(0, 5))).toBe('0.08');
    expect(formatDecimalHours(-hm(0, 25))).toBe('-0.42');
    expect(formatDecimalHours(hm(168, 45))).toBe('168.75');
  });
});
