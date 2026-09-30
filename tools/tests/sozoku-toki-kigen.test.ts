import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GIMUKA_START,
  KEIKA_SOCHI_DEADLINE,
  MENZEI_DEADLINE,
  NO_FIRST_REGISTRATION_NOTE,
  OVERDUE_MESSAGE,
  addMonthsSameDay,
  daysLeft,
  daysLeftLabel,
  formatJaWithWeekday,
  isTokiOverdue,
  otherDeadlines,
  taxDueDate,
  tokiDeadline,
  validateInput,
} from '@/lib/sozoku-toki-kigen';

/**
 * 相続登記の期限チェッカーのテスト。
 *
 * 仕様: docs/features/sozoku-toki-kigen.md（「テスト」の節の期待値をそのまま置いている）
 */

describe('制度データ', () => {
  it('施行日と経過措置の期限（法務省Q&A Q3・Q4）', () => {
    expect(GIMUKA_START).toBe('2024-04-01');
    expect(KEIKA_SOCHI_DEADLINE).toBe('2027-03-31');
    expect(MENZEI_DEADLINE).toBe('2027-03-31');
  });
});

describe('addMonthsSameDay（応当日・民法143条2項）', () => {
  it('同じ日付の応当日を返す', () => {
    expect(addMonthsSameDay('2026-09-28', 3)).toBe('2026-12-28');
    expect(addMonthsSameDay('2026-09-28', 36)).toBe('2029-09-28');
  });

  it('応当日が無い月は末日', () => {
    expect(addMonthsSameDay('2028-02-29', 36)).toBe('2031-02-28');
    expect(addMonthsSameDay('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonthsSameDay('2027-10-31', 4)).toBe('2028-02-29');
  });

  it('国税庁の例：1月10日に死亡 → 準確定申告5月10日・相続税11月10日（額面）', () => {
    expect(addMonthsSameDay('2026-01-10', 4)).toBe('2026-05-10');
    expect(addMonthsSameDay('2026-01-10', 10)).toBe('2026-11-10');
  });
});

describe('tokiDeadline（相続登記の期限）', () => {
  it('施行日前に知った相続は経過措置で 2027-03-31', () => {
    expect(tokiDeadline('2023-06-01')).toEqual({ deadline: '2027-03-31', basis: 'transitional' });
    expect(tokiDeadline('2024-03-31')).toEqual({ deadline: '2027-03-31', basis: 'transitional' });
    expect(tokiDeadline('1990-01-01').deadline).toBe('2027-03-31');
  });

  it('施行日以後に知った相続は知った日から3年（原則）', () => {
    expect(tokiDeadline('2024-04-01')).toEqual({ deadline: '2027-04-01', basis: 'principle' });
    expect(tokiDeadline('2026-09-28')).toEqual({ deadline: '2029-09-28', basis: 'principle' });
  });

  it('応当日なし：2028-02-29 に知った → 2031-02-28', () => {
    expect(tokiDeadline('2028-02-29').deadline).toBe('2031-02-28');
  });

  it('遺産分割 2026-10-01・先に登記あり → 2029-10-01 の行が出る', () => {
    const r = tokiDeadline('2026-01-15', { on: '2026-10-01', registeredFirst: true });
    expect(r.deadline).toBe('2029-01-15');
    expect(r.divisionDeadline).toBe('2029-10-01');
    expect(r.divisionBasis).toBe('principle');
  });

  it('遺産分割 2026-10-01・先に登記なし → 行が出ず、期限は元のまま', () => {
    const r = tokiDeadline('2026-01-15', { on: '2026-10-01', registeredFirst: false });
    expect(r.deadline).toBe('2029-01-15');
    expect(r.divisionDeadline).toBeUndefined();
    expect(r).toEqual(tokiDeadline('2026-01-15'));
  });

  it('施行日前に成立した遺産分割は、分割の日を施行日に読み替える（改正法附則5条6項）→ 2027-03-31', () => {
    const r = tokiDeadline('2020-05-01', { on: '2021-02-01', registeredFirst: true });
    expect(r.deadline).toBe('2027-03-31');
    expect(r.divisionDeadline).toBe('2027-03-31');
    expect(r.divisionBasis).toBe('transitional');
  });

  it('施行日前に知った相続でも、分割が施行日以後なら分割の日から3年', () => {
    const r = tokiDeadline('2020-05-01', { on: '2026-10-01', registeredFirst: true });
    expect(r.deadline).toBe('2027-03-31');
    expect(r.divisionDeadline).toBe('2029-10-01');
  });
});

describe('otherDeadlines（放棄・準確定申告・相続税）', () => {
  it('2026-09-28 → 放棄 2026-12-28・準確定申告 2027-01-28・相続税 2027-07-28（4つとも同じ日付の応当日）', () => {
    expect(otherDeadlines('2026-09-28')).toEqual({
      hoki: '2026-12-28',
      junKakutei: '2027-01-28',
      sozokuzei: '2027-07-28',
    });
    expect(tokiDeadline('2026-09-28').deadline.slice(-2)).toBe('28');
  });

  it('国税庁の例 2026-01-10：額面は 2026-05-10・2026-11-10', () => {
    const r = otherDeadlines('2026-01-10');
    expect(r.junKakutei).toBe('2026-05-10');
    expect(r.sozokuzei).toBe('2026-11-10');
  });
});

describe('taxDueDate（国税通則法10条2項の繰り下げ）', () => {
  it('国税庁の例：準確定申告の額面 2026-05-10 は日曜なので、画面の期限は 2026-05-11（月）', () => {
    const r = taxDueDate(otherDeadlines('2026-01-10').junKakutei);
    expect(r.nominal).toBe('2026-05-10');
    expect(r.due).toBe('2026-05-11');
    expect(r.shiftedBecause).toBe('日曜');
    expect(formatJaWithWeekday(r.due)).toBe('2026年5月11日（月）');
  });

  it('相続税の 2026-11-10 は火曜日で繰り下げなし', () => {
    const r = taxDueDate(otherDeadlines('2026-01-10').sozokuzei);
    expect(r.due).toBe('2026-11-10');
    expect(r.shiftedBecause).toBeNull();
  });

  it('土曜に当たると翌開庁日（2026-06-13 土 → 2026-06-15 月）', () => {
    const r = taxDueDate(otherDeadlines('2026-02-13').junKakutei);
    expect(r.nominal).toBe('2026-06-13');
    expect(r.due).toBe('2026-06-15');
    expect(r.shiftedBecause).toBe('土曜');
  });

  it('祝日に当たると翌日（2027-01-11 成人の日 → 2027-01-12）', () => {
    const r = taxDueDate(otherDeadlines('2026-03-11').sozokuzei);
    expect(r.nominal).toBe('2027-01-11');
    expect(r.due).toBe('2027-01-12');
    expect(r.shiftedBecause).toBe('成人の日');
  });

  it('年末年始をまたいで繰り下がる（2026-12-29 → 2027-01-04）', () => {
    const r = taxDueDate(otherDeadlines('2026-08-29').junKakutei);
    expect(r.nominal).toBe('2026-12-29');
    expect(r.due).toBe('2027-01-04');
  });

  it('祝日データの範囲外は印を立てる（推測で祝日を足さない）', () => {
    expect(taxDueDate('2028-05-10').holidayUnknown).toBe(true);
    expect(taxDueDate('2026-05-10').holidayUnknown).toBe(false);
  });

  it('登記・放棄は額面のまま（otherDeadlines は繰り下げない）', () => {
    // 2026-03-13 の3か月後 2026-06-13 は土曜だが、放棄の期限は額面で出す
    expect(otherDeadlines('2026-03-13').hoki).toBe('2026-06-13');
    // 2023-05-10 に知った相続も、2027-03-31（水）のまま
    expect(tokiDeadline('2023-05-10').deadline).toBe('2027-03-31');
  });
});

describe('daysLeft / daysLeftLabel', () => {
  it('残り日数', () => {
    expect(daysLeft('2027-03-31', '2026-09-29')).toBe(183);
    expect(daysLeft('2027-03-31', '2027-03-31')).toBe(0);
    expect(daysLeft('2027-03-31', '2027-04-02')).toBe(-2);
  });

  it('表示', () => {
    expect(daysLeftLabel(183)).toBe('あと183日');
    expect(daysLeftLabel(0)).toBe('今日が期限');
    expect(daysLeftLabel(-2)).toBe('2日過ぎています');
  });
});

describe('isTokiOverdue（期限切れの警告を出すか）', () => {
  // #299 レビューの再現：死亡日 2020-01-10、分割 2025-10-01、今日 2027-05-01
  it('先に登記・申出をした人（はい）は、主の期限を過ぎても警告しない', () => {
    const toki = tokiDeadline('2020-01-10', { on: '2025-10-01', registeredFirst: true });
    expect(toki.deadline).toBe('2027-03-31');
    expect(toki.divisionDeadline).toBe('2028-10-01');
    expect(isTokiOverdue(toki, '2027-05-01')).toBe(false);
  });

  it('「はい」でも分割の内容で登記する期限を過ぎたら警告する', () => {
    const toki = tokiDeadline('2020-01-10', { on: '2025-10-01', registeredFirst: true });
    expect(isTokiOverdue(toki, '2028-10-01')).toBe(false);
    expect(isTokiOverdue(toki, '2028-10-02')).toBe(true);
  });

  it('先に登記・申出をしていない人（いいえ）は、主の期限を過ぎたら警告する', () => {
    const toki = tokiDeadline('2020-01-10', { on: '2025-10-01', registeredFirst: false });
    expect(isTokiOverdue(toki, '2027-05-01')).toBe(true);
    expect(isTokiOverdue(toki, '2027-03-31')).toBe(false);
  });

  it('分割日を入れていない人は、主の期限で判定する', () => {
    expect(isTokiOverdue(tokiDeadline('2020-01-10'), '2027-04-01')).toBe(true);
    expect(isTokiOverdue(tokiDeadline('2020-01-10'), '2026-09-30')).toBe(false);
  });
});

describe('validateInput', () => {
  it('知った日・分割日が死亡日より前なら弾く', () => {
    expect(validateInput('2026-01-10', '2026-01-10')).toBeNull();
    expect(validateInput('2026-01-10', '2026-01-09')).toBe('known-before-death');
    expect(validateInput('2026-01-10', '2026-02-01', '2025-12-31')).toBe('division-before-death');
  });
});

describe('画面の文言（断定しない）', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const sources = [
    read('../app/sozoku-toki-kigen/page.tsx'),
    read('../app/sozoku-toki-kigen/Calculator.tsx'),
    read('../lib/sozoku-toki-kigen.ts'),
  ];

  it('禁止表現（「必ず」「確実に」「すべき」）が無い', () => {
    for (const src of sources) {
      expect(src).not.toMatch(/必ず|確実に|すべき|べきです/);
    }
  });

  it('期限切れの文言は Q&A の順序どおりで、過料の有無を断定しない', () => {
    expect(OVERDUE_MESSAGE).toContain('催告書');
    expect(OVERDUE_MESSAGE.indexOf('催告書')).toBeLessThan(OVERDUE_MESSAGE.indexOf('裁判所へ通知'));
    expect(OVERDUE_MESSAGE).toContain('過料になるかどうかは裁判所が決めます');
    expect(OVERDUE_MESSAGE).not.toMatch(/過料になります|過料にはなりません/);
  });

  it('先に登記・申出をしていない人への1行', () => {
    expect(NO_FIRST_REGISTRATION_NOTE).toBe('先に登記も申出もしていない場合、遺産分割の内容で登記する期限は上の期限と同じです。');
  });

  it('ツール名に「過料」を入れない（判定するように読めるため）', () => {
    const page = sources[0];
    const h1 = /<h1>([^<]+)<\/h1>/.exec(page)?.[1] ?? '';
    expect(h1).toBe('相続登記の期限チェッカー');
  });
});
