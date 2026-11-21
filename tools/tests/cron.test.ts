/**
 * cron 式 チェッカー（仕様: docs/features/cron-shiki-checker.md の「確かめること」）
 * 番号は仕様の 1〜12 に対応する。
 */
import { describe, expect, it } from 'vitest';
import { checkCron, jstToMs, type CheckResult } from '@/lib/cron/check';
import { analyze } from '@/lib/cron/dialect';
import { describe as describeSpec } from '@/lib/cron/describe';
import { environments, shiftZone, toAws, toCron5 } from '@/lib/cron/convert';
import { nextRuns, wallTime } from '@/lib/cron/next';
import { parseFields, splitFields } from '@/lib/cron/parse';
import { buildCron, commonRows, COMMON_EXPRESSIONS } from '@/lib/cron/build';
import type { CronSpec, Grammar } from '@/lib/cron/types';

function spec(expr: string, grammar: Grammar = 'cron5'): CronSpec {
  const r = parseFields(splitFields(expr), grammar);
  if (!r.ok) throw new Error(`${expr}: ${r.errors.map((e) => e.message).join(' / ')}`);
  return r.spec;
}

function ok(r: CheckResult) {
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join(' / '));
  return r;
}

/** 日本時間の「YYYY-MM-DD HH:MM」の並び */
function jstList(s: CronSpec, from: number, count = 10, zone: 'Asia/Tokyo' | 'UTC' = 'Asia/Tokyo'): string[] {
  return nextRuns(s, from, zone, count).runs.map((ms) => {
    const w = wallTime(ms, 'Asia/Tokyo');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${w.year}-${p(w.month)}-${p(w.day)} ${p(w.hour)}:${p(w.minute)}${w.second ? `:${p(w.second)}` : ''}`;
  });
}

function weekdays(s: CronSpec, from: number, count = 10): number[] {
  return nextRuns(s, from, 'Asia/Tokyo', count).runs.map((ms) => wallTime(ms, 'Asia/Tokyo').weekday);
}

const BASE = jstToMs(2026, 12, 28, 9, 0); // 2026-12-28（月）9:00

describe('1. 平日 9:30 の読み下し・次回 10 件・祝日と年末年始の印', () => {
  const r = ok(checkCron('30 9 * * 1-5', { now: BASE }));
  const reading = r.readings[0];

  it('読み下し', () => {
    expect(reading.description).toBe('月曜〜金曜の 9:30');
  });

  it('次回 10 件（12/28〜1/8。土日を飛ばし、元日も含む）', () => {
    expect(jstList(reading.spec, BASE)).toEqual([
      '2026-12-28 09:30',
      '2026-12-29 09:30',
      '2026-12-30 09:30',
      '2026-12-31 09:30',
      '2027-01-01 09:30',
      '2027-01-04 09:30',
      '2027-01-05 09:30',
      '2027-01-06 09:30',
      '2027-01-07 09:30',
      '2027-01-08 09:30',
    ]);
  });

  it('12/29〜1/3 に年末年始の印、1/1 に「元日」の印', () => {
    expect(reading.runs.map((x) => x.yearEnd)).toEqual([false, true, true, true, true, false, false, false, false, false]);
    expect(reading.runs[4].holiday).toEqual({ kind: 'holiday', name: '元日' });
    expect(reading.runs.filter((x) => x.holiday.kind === 'holiday')).toHaveLength(1);
  });

  it('日本時間と UTC を併記（曜日つき）', () => {
    expect(reading.runs[0].jst).toBe('2026-12-28（月）9:30');
    expect(reading.runs[0].utc).toBe('2026-12-28（月）0:30');
  });

  it('2027-01-08（金）9:31 からの1件目は 1/11（月・成人の日）で祝日の印', () => {
    const r2 = ok(checkCron('30 9 * * 1-5', { now: jstToMs(2027, 1, 8, 9, 31), count: 1 }));
    expect(r2.readings[0].runs[0].jst).toBe('2027-01-11（月）9:30');
    expect(r2.readings[0].runs[0].holiday).toEqual({ kind: 'holiday', name: '成人の日' });
  });
});

describe('2. 日と曜日の OR（Vixie cron の「* で始まる」規則）', () => {
  it('0 9 1 * 1 は 1 日と月曜の両方で動き、OR の注意が出る', () => {
    const s = spec('0 9 1 * 1');
    expect(s.mode).toBe('or');
    const list = jstList(s, BASE, 4);
    // 2027-01-01（金・1日）・01-04（月）・01-11（月）・01-18（月）
    expect(list).toEqual(['2027-01-01 09:00', '2027-01-04 09:00', '2027-01-11 09:00', '2027-01-18 09:00']);
    const r = ok(checkCron('0 9 1 * 1', { now: BASE }));
    expect(r.warnings.map((w) => w.id)).toContain('or');
  });

  it('0 9 1 * * は 1 日だけ（OR の注意は出ない）', () => {
    const s = spec('0 9 1 * *');
    expect(s.mode).toBe('and');
    expect(jstList(s, BASE, 3)).toEqual(['2027-01-01 09:00', '2027-02-01 09:00', '2027-03-01 09:00']);
    expect(ok(checkCron('0 9 1 * *', { now: BASE })).warnings.map((w) => w.id)).not.toContain('or');
  });

  it('0 9 */2 * 1 は AND（*/2 が * で始まるので、奇数日かつ月曜）', () => {
    const s = spec('0 9 */2 * 1');
    expect(s.mode).toBe('and');
    const runs = nextRuns(s, BASE, 'Asia/Tokyo', 10).runs.map((ms) => wallTime(ms, 'Asia/Tokyo'));
    for (const w of runs) {
      expect(w.weekday).toBe(1);
      expect(w.day % 2).toBe(1);
    }
    expect(jstList(s, BASE, 2)).toEqual(['2027-01-11 09:00', '2027-01-25 09:00']);
  });
});

describe('3. 間隔・うるう日・実行されない式・31 日', () => {
  it('*/15 9-18 * * * の読み下しと、18:45 の次は翌日 9:00', () => {
    const s = spec('*/15 9-18 * * *');
    expect(describeSpec(s)).toBe('9時台〜18時台の、0・15・30・45分');
    expect(jstList(s, jstToMs(2026, 12, 28, 18, 40), 2)).toEqual(['2026-12-28 18:45', '2026-12-29 09:00']);
  });

  it('0 0 29 2 * の次は 2028-02-29', () => {
    expect(jstList(spec('0 0 29 2 *'), BASE, 1)).toEqual(['2028-02-29 00:00']);
  });

  it('0 0 30 2 * は実行されない', () => {
    const r = ok(checkCron('0 0 30 2 *', { now: BASE }));
    expect(r.readings[0].runs).toEqual([]);
    expect(r.readings[0].exhausted).toBe(true);
    expect(r.warnings.find((w) => w.id === 'never')?.text).toContain('この式は実行されません');
  });

  it('0 0 31 * * は 31 日のある月だけ。無い月を注意に出す', () => {
    const list = jstList(spec('0 0 31 * *'), BASE, 7);
    expect(list).toEqual([
      '2026-12-31 00:00',
      '2027-01-31 00:00',
      '2027-03-31 00:00',
      '2027-05-31 00:00',
      '2027-07-31 00:00',
      '2027-08-31 00:00',
      '2027-10-31 00:00',
    ]);
    const w = ok(checkCron('0 0 31 * *', { now: BASE })).warnings.find((x) => x.id === 'missing-month');
    expect(w?.text).toBe('2月・4月・6月・9月・11月には実行されません（その日が無い月です）。');
  });
});

describe('4. 曜日の数字の方言', () => {
  it('crontab の 0 と 7 はどちらも日曜', () => {
    expect(spec('0 0 * * 0').dow.values).toEqual([0]);
    expect(spec('0 0 * * 7').dow.values).toEqual([0]);
    expect(jstList(spec('0 0 * * 7'), BASE, 3)).toEqual(jstList(spec('0 0 * * 0'), BASE, 3));
  });

  it('AWS の MON-FRI と 2-6 は同じ（月〜金）', () => {
    const a = analyze('cron(0 0 ? * MON-FRI *)');
    const b = analyze('cron(0 0 ? * 2-6 *)');
    if (!a.ok || a.kind !== 'cron' || !b.ok || b.kind !== 'cron') throw new Error('読めない');
    expect(a.readings[0].spec.dow.values).toEqual([1, 2, 3, 4, 5]);
    expect(b.readings[0].spec.dow.values).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('5. Quartz と Spring', () => {
  it('Quartz の 0 0 12 ? * WED は毎週水曜 12:00:00', () => {
    const s = spec('0 0 12 ? * WED', 'quartz');
    expect(describeSpec(s)).toBe('毎週水曜の 12:00');
    expect(weekdays(s, BASE, 5).every((d) => d === 3)).toBe(true);
  });

  it('Quartz の 0 15 10 L * ? は毎月末日 10:15', () => {
    expect(jstList(spec('0 15 10 L * ?', 'quartz'), BASE, 3)).toEqual(['2026-12-31 10:15', '2027-01-31 10:15', '2027-02-28 10:15']);
  });

  it('Quartz の 0 15 10 ? * 6#3 は第3金曜', () => {
    const s = spec('0 15 10 ? * 6#3', 'quartz');
    expect(describeSpec(s)).toBe('毎月第3金曜の 10:15');
    expect(jstList(s, BASE, 2)).toEqual(['2027-01-15 10:15', '2027-02-19 10:15']);
  });

  it('Spring の 0 15 10 * * 6#3 は第3土曜', () => {
    const r = ok(checkCron('0 15 10 * * 6#3', { now: BASE }));
    expect(r.readings.map((x) => x.dialect)).toEqual(['spring']);
    expect(r.readings[0].description).toBe('毎月第3土曜の 10:15');
    expect(r.readings[0].runs[0].jst).toBe('2027-01-16（土）10:15');
  });

  it('0 0 9 * * 1-5 は Spring なら月〜金。Quartz の数字で読むと日〜木', () => {
    expect(weekdays(spec('0 0 9 * * 1-5', 'spring'), BASE, 5).sort()).toEqual([1, 2, 3, 4, 5]);
    // Quartz は日か曜日の片方を ? にするので、同じ数字を ? つきで比べる
    expect(spec('0 0 9 ? * 1-5', 'quartz').dow.values).toEqual([0, 1, 2, 3, 4]);
  });

  it('Quartz は日と曜日の片方を ? にしないと誤り', () => {
    const r = parseFields(splitFields('0 0 9 * * 1-5'), 'quartz');
    expect(r.ok).toBe(false);
  });
});

describe('6. 自動判定', () => {
  it('0 0 12 ? * * は Quartz／Spring（AWS は 4 番目の ? で誤り）。曜日が * なので並べない', () => {
    const a = analyze('0 0 12 ? * *');
    if (!a.ok || a.kind !== 'cron') throw new Error('読めない');
    expect(a.readings).toHaveLength(1);
    expect(a.readings[0].grammar).toBe('quartz');
    expect(a.detectedAs).toContain('Quartz／Spring');
    const aws = parseFields(splitFields('0 0 12 ? * *'), 'aws');
    expect(aws.ok).toBe(false);
    if (!aws.ok) expect(aws.errors[0].position).toBe(4);
    expect(describeSpec(a.readings[0].spec)).toBe('毎日 12:00');
  });

  it('0 12 ? * MON * は AWS（Quartz／Spring は 3 番目の ? で誤り）', () => {
    const a = analyze('0 12 ? * MON *');
    if (!a.ok || a.kind !== 'cron') throw new Error('読めない');
    expect(a.readings.map((r) => r.grammar)).toEqual(['aws']);
    expect(a.dialect).toBe('eventbridge-rule');
    const q = parseFields(splitFields('0 12 ? * MON *'), 'quartz');
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.errors[0].position).toBe(3);
  });

  it('0 0 9 ? * 2 は Quartz（月曜）と Spring（火曜）の両方の読みが返る', () => {
    const r = ok(checkCron('0 0 9 ? * 2', { now: BASE }));
    expect(r.readings.map((x) => x.dialect)).toEqual(['quartz', 'spring']);
    expect(r.readings[0].description).toBe('毎週月曜の 9:00');
    expect(r.readings[1].description).toBe('毎週火曜の 9:00');
    expect(r.dialect).toBe('quartz');
    // 環境ごとの書き方も読みごとに出る（Spring を選んだら火曜）
    expect(r.readings[0].envs.find((e) => e.id === 'github-tz')?.expressions).toEqual(['0 9 * * 1']);
    expect(r.readings[1].envs.find((e) => e.id === 'github-tz')?.expressions).toEqual(['0 9 * * 2']);
  });

  it('5 フィールドは crontab、cron(...) は AWS のルール（UTC）', () => {
    const a = ok(checkCron('30 9 * * 1-5', { now: BASE }));
    expect(a.dialect).toBe('crontab');
    expect(a.zone).toBe('Asia/Tokyo');
    const b = ok(checkCron('cron(0 9 * * ? *)', { now: BASE }));
    expect(b.dialect).toBe('eventbridge-rule');
    expect(b.zone).toBe('UTC');
    expect(b.readings[0].runs[0].jst).toBe('2026-12-28（月）18:00');
  });

  it('crontab -l の1行は、後ろのコマンドを無視して読む', () => {
    const a = analyze('30 9 * * 1-5 /usr/local/bin/backup.sh --full');
    if (!a.ok || a.kind !== 'cron') throw new Error('読めない');
    expect(a.dialect).toBe('crontab');
    expect(a.readings[0].fields).toEqual(['30', '9', '*', '*', '1-5']);
    expect(a.ignoredCommand).toBe('/usr/local/bin/backup.sh --full');
  });

  it('7 フィールドは Quartz（年つき）', () => {
    const a = analyze('0 0 12 ? * MON 2027');
    if (!a.ok || a.kind !== 'cron') throw new Error('読めない');
    expect(a.dialect).toBe('quartz');
    expect(a.readings[0].spec.years).toEqual([2027]);
  });
});

describe('7. 環境ごとの書き方', () => {
  const envOf = (expr: string, id: string) => {
    const r = ok(checkCron(expr, { now: BASE }));
    const e = r.envs.find((x) => x.id === id);
    if (!e) throw new Error(id);
    return e;
  };

  it('GitHub Actions：timezone: "Asia/Tokyo" つきの YAML が1番目。式は変えない', () => {
    const r = ok(checkCron('30 9 * * 1-5', { now: BASE }));
    expect(r.envs[0].id).toBe('github-tz');
    expect(r.envs[0].code).toBe(['on:', '  schedule:', '    - cron: "30 9 * * 1-5"', '      timezone: "Asia/Tokyo"'].join('\n'));
  });

  it('UTC への変換：0 9 * * * → 0 0 * * *', () => {
    expect(envOf('0 9 * * *', 'github-utc').expressions).toEqual(['0 0 * * *']);
  });

  it('UTC への変換：0 8 * * 1-5 → 0 23 * * 0-4（日付をまたぐので曜日を1つ前に）', () => {
    expect(envOf('0 8 * * 1-5', 'github-utc').expressions).toEqual(['0 23 * * 0-4']);
    expect(envOf('0 8 * * 1-5', 'aws-rule').expressions).toEqual(['cron(0 23 ? * SUN-THU *)']);
  });

  it('30 8 1 * * は前月の末日に当たる：crontab では書けない旨、EventBridge ルールなら L', () => {
    const gh = envOf('30 8 1 * *', 'github-utc');
    expect(gh.code).toBeNull();
    expect(gh.expressions).toEqual([]);
    expect(gh.reason).toContain('前月の末日');
    expect(envOf('30 8 1 * *', 'aws-rule').expressions).toEqual(['cron(30 23 L * ? *)']);
  });

  it('日付をまたぐ時刻とまたがない時刻が混ざると2行に分ける', () => {
    const r = shiftZone(spec('0 8,12 * * 1-5'), -9);
    if (!r.ok) throw new Error(r.reason);
    expect(r.specs.map((s) => toCron5(s))).toEqual([
      { ok: true, lines: ['0 3 * * 1-5'] },
      { ok: true, lines: ['0 23 * * 0-4'] },
    ]);
    const code = environments(spec('0 8,12 * * 1-5'), 'Asia/Tokyo').find((e) => e.id === 'github-utc')?.code;
    expect(code).toBe(['on:', '  schedule:', '    - cron: "0 3 * * 1-5"', '    - cron: "0 23 * * 0-4"'].join('\n'));
  });

  it('EventBridge Scheduler：ScheduleExpressionTimezone と AWS 書式の式の組', () => {
    const e = envOf('30 9 * * 1-5', 'aws-scheduler');
    expect(e.code).toBe('ScheduleExpression: "cron(30 9 ? * MON-FRI *)"\nScheduleExpressionTimezone: "Asia/Tokyo"');
  });

  it('Kubernetes：spec.timeZone つき', () => {
    expect(envOf('30 9 * * 1-5', 'kubernetes').code).toBe('spec:\n  schedule: "30 9 * * 1-5"\n  timeZone: "Asia/Tokyo"');
  });

  it('crontab の OR は AWS では2つのルールに分ける', () => {
    expect(toAws(spec('0 9 1 * 1'))).toEqual({ ok: true, lines: ['cron(0 9 1 * ? *)', 'cron(0 9 ? * MON *)'] });
  });

  it('GitHub Actions（UTC の式）からは timezone つきの日本時間の式を作る', () => {
    const r = ok(checkCron('0 0 * * 1', { now: BASE, dialect: 'github' }));
    expect(r.zone).toBe('UTC');
    expect(r.envs.find((e) => e.id === 'github-tz')?.expressions).toEqual(['0 9 * * 1']);
    expect(r.envs.find((e) => e.id === 'github-utc')?.expressions).toEqual(['0 0 * * 1']);
    // UTC の 23:00 は日本時間の翌日 8:00
    const r2 = ok(checkCron('0 23 * * 0-4', { now: BASE, dialect: 'github' }));
    expect(r2.envs.find((e) => e.id === 'github-tz')?.expressions).toEqual(['0 8 * * 1-5']);
  });
});

describe('8. 誤りの位置', () => {
  it('0 9 32 * * は 3 番目（日）の誤り', () => {
    const r = checkCron('0 9 32 * *', { now: BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].position).toBe(3);
      expect(r.errors[0].message).toBe('3 番目（日）の`32` は 1〜31 の範囲外です');
    }
  });

  it('フィールドが足りない・空', () => {
    expect(checkCron('0 9 *', { now: BASE }).ok).toBe(false);
    expect(checkCron('', { now: BASE }).ok).toBe(false);
  });

  it('crontab で ? や L は使えない', () => {
    expect(parseFields(splitFields('0 9 ? * *'), 'cron5').ok).toBe(false);
    expect(parseFields(splitFields('0 9 L * *'), 'cron5').ok).toBe(false);
  });
});

describe('9. マクロ', () => {
  it('@daily は 0 0 * * * に展開する', () => {
    const r = ok(checkCron('@daily', { now: BASE }));
    expect(r.analysis.kind).toBe('cron');
    expect(r.readings[0].description).toBe('毎日 0:00');
    expect(r.warnings.map((w) => w.id)).not.toContain('github-macro');
  });

  it('@reboot は次回実行を出さない', () => {
    const r = ok(checkCron('@reboot', { now: BASE }));
    expect(r.readings).toEqual([]);
    expect(r.warnings.map((w) => w.id)).toEqual(['reboot']);
  });

  it('GitHub Actions の方言で @daily を貼ると注意が出る', () => {
    const r = ok(checkCron('@daily', { now: BASE, dialect: 'github' }));
    expect(r.warnings.find((w) => w.id === 'github-macro')?.text).toContain('0 0 * * *');
    expect(r.warnings.map((w) => w.id)).toContain('github-min');
  });
});

describe('10. 次回探索のステップ数', () => {
  it('0 0 30 2 * は 5 年の上限で止まり、ステップ数は 1,000 以下', () => {
    const r = nextRuns(spec('0 0 30 2 *'), BASE, 'Asia/Tokyo', 10);
    expect(r.runs).toEqual([]);
    expect(r.exhausted).toBe(true);
    expect(r.steps).toBeLessThanOrEqual(1000);
  });

  it('稀な式（うるう日）でも 10 件をステップ数 1,000 以下で探せる', () => {
    const r = nextRuns(spec('0 0 29 2 *'), BASE, 'Asia/Tokyo', 10);
    // 5 年先までなので 2028 年の1件だけ
    expect(r.runs).toHaveLength(1);
    expect(r.steps).toBeLessThanOrEqual(1000);
  });

  it('毎秒（Quartz）でも 10 件はすぐ', () => {
    const r = nextRuns(spec('* * * * * ?', 'quartz'), BASE, 'Asia/Tokyo', 10);
    expect(r.runs).toHaveLength(10);
    expect(r.steps).toBeLessThanOrEqual(30);
  });
});

describe('11. 祝日の表の範囲外', () => {
  it('2027-12-27 からの 0 9 * * * で、2028 年の回に範囲外の印と表の下の1行', () => {
    const r = ok(checkCron('0 9 * * *', { now: jstToMs(2027, 12, 27, 0, 0) }));
    const runs = r.readings[0].runs;
    expect(runs).toHaveLength(10);
    expect(runs[0].jst).toBe('2027-12-27（月）9:00');
    const in2028 = runs.filter((x) => x.jst.startsWith('2028'));
    expect(in2028.length).toBeGreaterThan(0);
    for (const x of in2028) expect(x.holiday.kind).toBe('out-of-range');
    for (const x of runs.filter((y) => y.jst.startsWith('2027'))) expect(x.holiday.kind).not.toBe('out-of-range');
    expect(r.holidayNote).toBe('祝日の表は 2027 年まで。それ以降の祝日は印が付きません。');
  });

  it('範囲内だけなら1行は出さない', () => {
    expect(ok(checkCron('0 9 * * *', { now: BASE })).holidayNote).toBeNull();
  });
});

describe('注意の帯：UTC の曜日のずれ', () => {
  it('GitHub Actions（timezone なし）で曜日を指定し UTC 15:00 以降なら、日本時間では1日ずれる', () => {
    const r = ok(checkCron('0 23 * * 0-4', { now: BASE, dialect: 'github' }));
    expect(r.warnings.map((w) => w.id)).toContain('utc-shift');
    // UTC 日曜 23:00 → 日本時間 月曜 8:00
    expect(r.readings[0].runs.every((x) => !x.jst.includes('（土）') && !x.jst.includes('（日）'))).toBe(true);
  });

  it('日本時間の式なら出さない', () => {
    expect(ok(checkCron('0 23 * * 0-4', { now: BASE })).warnings.map((w) => w.id)).not.toContain('utc-shift');
  });
});

describe('AWS の rate・at', () => {
  it('rate(5 minutes) は「5分ごと」と読むだけ', () => {
    const r = ok(checkCron('rate(5 minutes)', { now: BASE }));
    expect(r.plainText).toContain('5分ごと');
    expect(r.readings).toEqual([]);
  });

  it('rate(1 minutes) は単数・複数の誤り', () => {
    expect(checkCron('rate(1 minutes)', { now: BASE }).ok).toBe(false);
  });
});

describe('作る（逆向き）とよく使う式', () => {
  it('選んだ形から式を作る', () => {
    expect(buildCron({ kind: 'daily', hour: 9, minute: 0 })).toBe('0 9 * * *');
    expect(buildCron({ kind: 'weekdays', hour: 9, minute: 30 })).toBe('30 9 * * 1-5');
    expect(buildCron({ kind: 'weekly', hour: 18, minute: 0, weekday: 5 })).toBe('0 18 * * 5');
    expect(buildCron({ kind: 'monthly', hour: 3, minute: 15, day: 1 })).toBe('15 3 1 * *');
    expect(buildCron({ kind: 'interval', hour: 0, minute: 0, every: 10 })).toBe('*/10 * * * *');
  });

  it('よく使う 10 パターンはすべて読めて、読み下しが付く', () => {
    expect(COMMON_EXPRESSIONS).toHaveLength(10);
    const rows = commonRows();
    expect(rows.every((r) => r.description.length > 0)).toBe(true);
    expect(rows.find((r) => r.expression === '0 3 1 1 *')?.description).toBe('毎年1月1日の 3:00');
  });
});

describe('フィールドの内訳', () => {
  it('列に番号と名前が付く', () => {
    const r = ok(checkCron('*/15 9-18 * * 1-5', { now: BASE }));
    expect(r.readings[0].fields.map((f) => f.label)).toEqual(['① 分', '② 時', '③ 日', '④ 月', '⑤ 曜日']);
    expect(r.readings[0].fields[0].values).toBe('0, 15, 30, 45');
    expect(r.readings[0].fields[4].values).toBe('月曜〜金曜');
  });
});
