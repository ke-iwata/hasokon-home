import { describe, expect, it } from 'vitest';
import {
  RULES,
  buildCalendar,
  decidedByText,
  earliestReturn,
  firstDayAfter,
  formatDate,
  headline,
  parseDate,
  type Disease,
  type Group,
  type ReturnResult,
} from '@/lib/shusseki-teishi';

/**
 * 出席停止期間 計算機のテスト。
 *
 * 仕様: docs/features/shusseki-teishi-keisan.md の「テスト」の表をそのまま並べる。
 * 条文は学校保健安全法施行規則 19 条 2 号（e-Gov 法令 API で 2026-10-08 に確認）。
 */

const d = (s: string) => parseDate(s)!;
const TODAY = d('2026-10-20');

function calc(
  disease: Exclude<Disease, 'other'>,
  group: Group,
  onset: string | null,
  recovery: string | null,
  today = TODAY,
): ReturnResult {
  const r = earliestReturn({ disease, group, onset: onset ? d(onset) : null, recovery: recovery ? d(recovery) : null, today });
  if (typeof r === 'string') throw new Error(`入力エラー: ${r}`);
  return r;
}

describe('firstDayAfter（「N 日を経過するまで」の翌日）', () => {
  it('起点を 0 日目にして N 日目が終わった翌日', () => {
    expect(formatDate(firstDayAfter(d('2026-10-01'), 5))).toBe('2026-10-07');
    expect(formatDate(firstDayAfter(d('2026-10-01'), 2))).toBe('2026-10-04');
  });
});

describe('条文の日数', () => {
  it('インフルエンザは発症後5日・解熱後2日（幼児3日）。大人は小学生以上と同じ', () => {
    expect(RULES.influenza.afterOnsetDays).toBe(5);
    expect(RULES.influenza.afterRecoveryDays!('school')).toBe(2);
    expect(RULES.influenza.afterRecoveryDays!('preschool')).toBe(3);
    expect(RULES.influenza.afterRecoveryDays!('adult')).toBe(2);
  });
  it('新型コロナは発症後5日・軽快後1日で、幼児の区別が無い', () => {
    expect(RULES.covid19.afterOnsetDays).toBe(5);
    for (const g of ['school', 'preschool', 'adult'] as const) expect(RULES.covid19.afterRecoveryDays!(g)).toBe(1);
  });
  it('おたふくかぜは日付にできない条件を併記する', () => {
    expect(RULES.mumps.extraCondition).toContain('全身状態が良好');
  });
});

describe('earliestReturn（仕様書の表）', () => {
  it('発症日に解熱（小学生・インフル）→ 10/7、発症側で決まる', () => {
    const r = calc('influenza', 'school', '2026-10-01', '2026-10-01');
    expect(formatDate(r.earliest)).toBe('2026-10-07');
    expect(r.decidedBy).toBe('onset');
  });

  it('解熱が遅い（小学生・インフル）→ 10/8、解熱側で決まる', () => {
    const r = calc('influenza', 'school', '2026-10-01', '2026-10-05');
    expect(formatDate(r.earliest)).toBe('2026-10-08');
    expect(r.decidedBy).toBe('recovery');
  });

  it('両方が同じ日に満ちる → 10/7（both）', () => {
    const r = calc('influenza', 'school', '2026-10-01', '2026-10-04');
    expect(formatDate(r.earliest)).toBe('2026-10-07');
    expect(r.decidedBy).toBe('both');
  });

  it('幼児・インフル（発症 10/1、解熱 10/4）→ 10/8', () => {
    const r = calc('influenza', 'preschool', '2026-10-01', '2026-10-04');
    expect(formatDate(r.earliest)).toBe('2026-10-08');
    expect(r.decidedBy).toBe('recovery');
  });

  it('幼児・登園できる日が土曜 → 10/10（土）のまま。ずらさない', () => {
    const r = calc('influenza', 'preschool', '2026-10-04', '2026-10-06');
    expect(formatDate(r.earliest)).toBe('2026-10-10');
    expect(r.closedBecause).toBe('土曜');
    expect(r.actualSchoolDay).toBeNull();
  });

  it('小学生・登校できる日が土曜 → 10/10（土）、実際に登校するのは 10/13（火）（10/12 はスポーツの日）', () => {
    const r = calc('influenza', 'school', '2026-10-04', '2026-10-07');
    expect(formatDate(r.earliest)).toBe('2026-10-10');
    expect(r.actualSchoolDay && formatDate(r.actualSchoolDay)).toBe('2026-10-13');
  });

  it('大人・インフル（発症 10/1、解熱 10/5）→ 10/8。目安の文面で、土日祝のずらしなし', () => {
    const r = calc('influenza', 'adult', '2026-10-01', '2026-10-05');
    expect(formatDate(r.earliest)).toBe('2026-10-08');
    expect(headline(r, 'adult')).toContain('出勤の目安');
    const sat = calc('influenza', 'adult', '2026-10-04', '2026-10-07');
    expect(sat.closedBecause).toBe('土曜');
    expect(sat.actualSchoolDay).toBeNull();
  });

  it('新型コロナ（発症 10/1、軽快 10/5）→ 10/7（both）', () => {
    const r = calc('covid19', 'school', '2026-10-01', '2026-10-05');
    expect(formatDate(r.earliest)).toBe('2026-10-07');
    expect(r.decidedBy).toBe('both');
  });

  it('新型コロナは幼児でも同じ日', () => {
    expect(formatDate(calc('covid19', 'preschool', '2026-10-01', '2026-10-05').earliest)).toBe('2026-10-07');
  });

  it('麻しん（解熱 10/5）→ 10/9', () => {
    const r = calc('measles', 'school', null, '2026-10-05');
    expect(formatDate(r.earliest)).toBe('2026-10-09');
    expect(r.decidedBy).toBe('recovery');
  });

  it('おたふくかぜ（腫れ 10/1）→ 10/7', () => {
    const r = calc('mumps', 'school', '2026-10-01', null);
    expect(formatDate(r.earliest)).toBe('2026-10-07');
    expect(r.assumedRecoveryToday).toBe(false);
  });

  it('プール熱（症状が消えた日 10/5）→ 10/8', () => {
    expect(formatDate(calc('pcf', 'school', null, '2026-10-05').earliest)).toBe('2026-10-08');
  });

  it('月またぎ・年またぎ（発症 12/29、解熱 12/31）→ 1/4', () => {
    const r = calc('influenza', 'school', '2026-12-29', '2026-12-31', d('2027-01-02'));
    expect(formatDate(r.earliest)).toBe('2027-01-04');
  });

  it('まだ熱がある（today = 10/3、発症 10/1）→ 10/7 と「今日解熱したとしても」', () => {
    const r = calc('influenza', 'school', '2026-10-01', null, d('2026-10-03'));
    expect(formatDate(r.earliest)).toBe('2026-10-07');
    expect(r.assumedRecoveryToday).toBe(true);
    expect(r.recovery && formatDate(r.recovery)).toBe('2026-10-03');
  });

  it('祝日データの範囲外は土日だけで判定し、未確認の印を立てる', () => {
    const r = calc('influenza', 'school', '2028-01-03', '2028-01-04', d('2028-01-10'));
    // 2028-01-09 は日曜
    expect(formatDate(r.earliest)).toBe('2028-01-09');
    expect(r.closedBecause).toBe('日曜');
    expect(r.actualSchoolDay && formatDate(r.actualSchoolDay)).toBe('2028-01-10');
    expect(r.holidayUnknown).toBe(true);
  });
});

describe('入力エラー', () => {
  const run = (onset: string | null, recovery: string | null, disease: Exclude<Disease, 'other'> = 'influenza') =>
    earliestReturn({ disease, group: 'school', onset: onset ? d(onset) : null, recovery: recovery ? d(recovery) : null, today: TODAY });

  it('解熱日が発症日より前', () => expect(run('2026-10-05', '2026-10-01')).toBe('recovery-before-onset'));
  it('解熱日が今日より後', () => expect(run('2026-10-15', '2026-10-21')).toBe('recovery-in-future'));
  it('発症日が今日より後', () => expect(run('2026-10-21', null)).toBe('onset-in-future'));
  it('発症日が無い', () => expect(run(null, '2026-10-05')).toBe('onset-missing'));
  it('麻しんは発症日が無くてもよい', () => expect(typeof run(null, '2026-10-05', 'measles')).toBe('object'));
});

describe('表示用', () => {
  it('区分で動詞が変わる', () => {
    const r = calc('influenza', 'school', '2026-10-01', '2026-10-05');
    expect(headline(r, 'school')).toBe('10月8日（木）から登校できます');
    expect(headline(r, 'preschool')).toBe('10月8日（木）から登園できます');
  });

  it('どちらの条件で決まったかの 1 行', () => {
    expect(decidedByText(calc('influenza', 'school', '2026-10-01', '2026-10-05'), 'influenza')).toContain('解熱日から数えた条件（解熱の3日後）のほうが');
    expect(decidedByText(calc('covid19', 'school', '2026-10-01', '2026-10-05'), 'covid19')).toContain('同じ日に');
    expect(decidedByText(calc('measles', 'school', null, '2026-10-05'), 'measles')).toBeNull();
  });

  it('カレンダーは日曜始まりの 7 列で、発症日・解熱日を 0 日目に数える', () => {
    const onset = d('2026-10-01'); // 木曜
    const r = calc('influenza', 'school', '2026-10-01', '2026-10-05');
    const weeks = buildCalendar(r, onset);
    for (const w of weeks) expect(w).toHaveLength(7);
    const cells = weeks.flat().filter((c) => c !== null);
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[0].onsetIndex).toBe(0);
    expect(cells[0].state).toBe('stop');
    const rec = cells.find((c) => formatDate(c.date) === '2026-10-05')!;
    expect(rec.recoveryIndex).toBe(0);
    expect(rec.onsetIndex).toBe(4);
    const last = cells[cells.length - 1];
    expect(formatDate(last.date)).toBe('2026-10-08');
    expect(last.state).toBe('return');
  });

  it('カレンダーは実際に登校する日まで伸びる', () => {
    const r = calc('influenza', 'school', '2026-10-04', '2026-10-07');
    const cells = buildCalendar(r, d('2026-10-04')).flat().filter((c) => c !== null);
    expect(cells.map((c) => c.state).slice(-4)).toEqual(['return', 'after', 'after', 'actual']);
  });
});
