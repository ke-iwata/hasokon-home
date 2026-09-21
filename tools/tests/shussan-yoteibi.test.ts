import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, type DateParts } from '@/lib/date-parts';
import {
  calcShussanYoteibi,
  dueDateFrom,
  gestationalAgeOf,
  INVALID_DATE_MESSAGE,
  LMP_TO_DUE_DAYS,
  MAX_GESTATION_DAYS,
  MEDICAL_NOTE,
  OVULATION_TO_DUE_DAYS,
  parseHandoffQuery,
  shussanTeateHandoffQuery,
  TERM_END_DAY,
  TERM_START_DAY,
  trimesterOf,
} from '@/lib/shussan-yoteibi';
import { calcLeaveSchedule, calcShussanTeate } from '@/lib/shussan-teate';

/**
 * 出産予定日・妊娠週数 計算機のテスト。
 *
 * 仕様: docs/features/shussan-yoteibi-keisan.md
 *
 * いちばん怖いのは**1日ずれ**（0週0日が起点であること・産前休業は予定日を含めて42日）なので、
 * 週数の境目と産休の開始日は日付そのもので固定し、産休は `shussan-teate` 側と突き合わせる。
 */

/** 'YYYY-MM-DD' → DateParts（テストの中でだけ使う短縮形） */
const d = (iso: string) => parseDate(iso) as DateParts;

/** 計算して null でないことを確かめてから返す */
function calc(input: Parameters<typeof calcShussanYoteibi>[0]) {
  const r = calcShussanYoteibi(input);
  expect(r).not.toBeNull();
  return r!;
}

describe('出産予定日', () => {
  it('最終月経開始日 + 280日が予定日（40週0日）', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01') });
    expect(formatDate(r.dueDate)).toBe('2026-10-08');
  });

  it('排卵日 + 266日は最終月経 + 280日と同じ日になる（排卵日 = 2週0日）', () => {
    const fromLmp = calc({ basis: 'lmp', date: d('2026-01-01') });
    const fromOvulation = calc({ basis: 'ovulation', date: d('2026-01-15') });
    expect(formatDate(fromOvulation.dueDate)).toBe('2026-10-08');
    expect(fromOvulation.dueDate).toEqual(fromLmp.dueDate);
    expect(LMP_TO_DUE_DAYS - OVULATION_TO_DUE_DAYS).toBe(14);
  });

  it('医師に言われた予定日はそのまま使う（超音波での修正を優先する）', () => {
    const r = calc({ basis: 'due', date: d('2026-10-01') });
    expect(formatDate(r.dueDate)).toBe('2026-10-01');
    // 週数の起点（0週0日）は予定日から280日を引いて逆算する
    expect(formatDate(r.lmpDate)).toBe('2025-12-25');
    expect(formatDate(r.ovulationDate)).toBe('2026-01-08');
  });

  it('うるう年をまたぐと暦日が1日手前になる（2028年2月29日を含む）', () => {
    // 2028年はうるう年。280日の中に2月29日が入るので、2026年の例と同じ1月1日起点でも
    // 予定日は10月7日になる（暦の上で1日早い）
    expect(formatDate(dueDateFrom('lmp', d('2028-01-01')))).toBe('2028-10-07');
    expect(formatDate(dueDateFrom('lmp', d('2026-01-01')))).toBe('2026-10-08');
    // 年をまたぐ例（2027-12-01 起点。2月29日をまたぐ）
    expect(formatDate(dueDateFrom('lmp', d('2027-12-01')))).toBe('2028-09-06');
  });

  it('予定日から最終月経相当日・排卵日相当日を逆算できる', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01') });
    expect(formatDate(r.lmpDate)).toBe('2026-01-01');
    expect(formatDate(r.ovulationDate)).toBe('2026-01-15');
  });
});

describe('妊娠週数', () => {
  it('最終月経 2026-01-01 のとき 2026-09-18 は 37週1日（経過260日）', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-09-18') });
    expect(r.gestation?.days).toBe(260);
    expect(r.gestation?.weeks).toBe(37);
    expect(r.gestation?.dayOfWeek).toBe(1);
    expect(r.gestation?.label).toBe('37週1日');
    // 260 = 7 × 37 + 1
    expect(260).toBe(7 * 37 + 1);
  });

  it('37週0日（経過259日）は 2026-09-17（0週0日が最終月経開始日なので 7 × 37 = 259日目）', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-09-17') });
    expect(r.gestation?.days).toBe(TERM_START_DAY);
    expect(TERM_START_DAY).toBe(259);
    expect(r.gestation?.label).toBe('37週0日');
    expect(formatDate(r.termStartDate)).toBe('2026-09-17');
  });

  it('最終月経開始日そのものが 0週0日', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-01-01') });
    expect(r.gestation?.label).toBe('0週0日');
    expect(r.gestation?.days).toBe(0);
  });

  it('予定日当日は 40週0日', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-10-08') });
    expect(r.gestation?.label).toBe('40週0日');
    expect(r.gestation?.days).toBe(LMP_TO_DUE_DAYS);
    expect(r.overdueDays).toBe(0);
    expect(r.daysToDue).toBe(0);
  });

  it('予定日前は残り日数、予定日後は超過日数が出る', () => {
    const before = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-10-01') });
    expect(before.daysToDue).toBe(7);
    expect(before.overdueDays).toBe(0);

    const after = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-10-15') });
    expect(after.overdueDays).toBe(7);
    expect(after.daysToDue).toBe(0);
    expect(after.gestation?.label).toBe('41週0日');
  });

  it('妊娠月数は4週＝1か月（0週0日が1か月）', () => {
    expect(gestationalAgeOf(0).months).toBe(1);
    expect(gestationalAgeOf(27).months).toBe(1);
    expect(gestationalAgeOf(28).months).toBe(2);
    expect(gestationalAgeOf(LMP_TO_DUE_DAYS).months).toBe(11);
  });

  it('週数を渡さなければ（asOf 無し）週数は null で、予定日だけが出る', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01') });
    expect(r.gestation).toBeNull();
    expect(r.trimester).toBeNull();
    expect(formatDate(r.dueDate)).toBe('2026-10-08');
  });
});

describe('時期区分と正期産', () => {
  it('初期 〜13週6日／中期 14週0日〜27週6日／後期 28週0日〜', () => {
    expect(trimesterOf(0)).toBe('early');
    expect(trimesterOf(13 * 7 + 6)).toBe('early');
    expect(trimesterOf(14 * 7)).toBe('mid');
    expect(trimesterOf(27 * 7 + 6)).toBe('mid');
    expect(trimesterOf(28 * 7)).toBe('late');
    expect(trimesterOf(MAX_GESTATION_DAYS)).toBe('late');
  });

  it('正期産は 37週0日〜41週6日', () => {
    const at = (iso: string) =>
      calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d(iso) });
    // 36週6日（258日）は正期産の手前
    expect(at('2026-09-16').isTerm).toBe(false);
    expect(at('2026-09-17').isTerm).toBe(true);
    // 41週6日（293日）が最終日
    expect(at('2026-10-21').isTerm).toBe(true);
    expect(TERM_END_DAY).toBe(293);
    expect(formatDate(at('2026-09-17').termEndDate)).toBe('2026-10-21');
  });
});

describe('産休の日程（shussan-teate と共有していること）', () => {
  it('産前休業は予定日 − 41日から請求できる（予定日を含めて42日）', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01') });
    expect(formatDate(r.leave.leaveFrom)).toBe('2026-08-28');
    expect(r.leave.beforeDays).toBe(42);
  });

  it('多胎は予定日 − 97日（予定日を含めて98日）', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01'), fetusCount: 2 });
    expect(formatDate(r.leave.leaveFrom)).toBe('2026-07-03');
    expect(r.leave.beforeDays).toBe(98);
    expect(r.leave.multiple).toBe(true);
  });

  it('産後休業の終了日は予定日 + 56日、育休に入れるのはその翌日', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01') });
    expect(formatDate(r.leave.afterLeaveUntil)).toBe('2026-12-03');
    expect(formatDate(r.leave.childcareLeaveFrom)).toBe('2026-12-04');
  });

  it('6週間経過後に就業できるのは予定日 + 43日（満了の翌日。42日ではない）', () => {
    const r = calc({ basis: 'lmp', date: d('2026-01-01') });
    // 産後休業は出産日の翌日から数えるので、6週間（42日）の満了は出産日 + 42日。
    // 就業できるのはその翌日から
    expect(formatDate(r.leave.workableFrom)).toBe('2026-11-20');
  });

  /**
   * **共有できていない実装を落とすためのテスト。**
   * 産休の日数と数え方は `calcLeaveSchedule()` の1か所にあり、
   * 出産手当金 計算機の `leaveFromDue` と必ず同じ値になる
   */
  it('shussan-teate の leaveFromDue と同じ日付になる（単胎・多胎とも）', () => {
    for (const fetusCount of [1, 2, 3]) {
      const due = d('2026-10-08');
      const yoteibi = calc({ basis: 'due', date: due, fetusCount });
      const teate = calcShussanTeate({ dueDate: due, fetusCount, monthlyIncome: 300_000 });
      expect(teate).not.toBeNull();
      expect(yoteibi.leave.leaveFrom).toEqual(teate!.leaveFromDue);
      expect(yoteibi.leave.beforeDays).toEqual(fetusCount >= 2 ? 98 : 42);
    }
  });

  it('予定日どおりに生まれた場合の産後終了日は shussan-teate の endDate と一致する', () => {
    const due = d('2026-10-08');
    const yoteibi = calc({ basis: 'due', date: due });
    const teate = calcShussanTeate({ dueDate: due, monthlyIncome: 300_000 });
    expect(yoteibi.leave.afterLeaveUntil).toEqual(teate!.endDate);
    expect(yoteibi.leave.childcareLeaveFrom).toEqual(teate!.childcareLeaveFrom);
  });

  it('calcLeaveSchedule は胎児数を1未満にできない（0や負数は単胎として扱う）', () => {
    const due = d('2026-10-08');
    expect(calcLeaveSchedule(due, 0).beforeDays).toBe(42);
    expect(calcLeaveSchedule(due, -3).fetusCount).toBe(1);
  });
});

describe('節目（milestones）', () => {
  const r = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-09-18') });

  it('日付の昇順で並び、根拠つきで5つ出る', () => {
    expect(r.milestones.map((m) => m.label)).toEqual([
      '妊娠中期に入る（14週0日）',
      '妊娠後期に入る（28週0日）',
      '産前休業を請求できる（予定日の6週間前）',
      '正期産に入る（37週0日）',
      '出産予定日（40週0日）',
    ]);
    for (const m of r.milestones) expect(m.basis).not.toBe('');
    const days = r.milestones.map((m) => m.day);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it('根拠が法令か用語の定義にないもの（安定期・妊婦健診）は入れない', () => {
    const labels = r.milestones.map((m) => m.label).join();
    expect(labels).not.toMatch(/安定期/);
    expect(labels).not.toMatch(/健診/);
  });

  it('産前休業の節目は断定形にせず「請求できる」と書く（労基法65条1項の請求権）', () => {
    const leave = r.milestones.find((m) => m.basis === '労働基準法65条1項');
    expect(leave?.label).toMatch(/請求できる/);
    expect(leave?.date).toEqual(r.leave.leaveFrom);
  });

  it('asOf より前の節目は passed になる（同日は passed にしない）', () => {
    const byLabel = (part: string) => r.milestones.find((m) => m.label.includes(part));
    // 2026-09-18 時点：中期・後期・産前休業（8/28）は過ぎ、正期産（9/17）も過ぎている
    expect(byLabel('妊娠中期')?.passed).toBe(true);
    expect(byLabel('産前休業')?.passed).toBe(true);
    expect(byLabel('正期産')?.passed).toBe(true);
    expect(byLabel('出産予定日')?.passed).toBe(false);

    const onTheDay = calc({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-09-17') });
    expect(onTheDay.milestones.find((m) => m.label.includes('正期産'))?.passed).toBe(false);
  });

  it('多胎は産前休業の節目が14週間前になる', () => {
    const twins = calc({ basis: 'lmp', date: d('2026-01-01'), fetusCount: 2 });
    expect(twins.milestones.find((m) => m.basis === '労働基準法65条1項')?.label).toBe(
      '産前休業を請求できる（予定日の14週間前）',
    );
  });
});

describe('計算できない入力', () => {
  it('未来の最終月経は null（＝計算できない）', () => {
    expect(
      calcShussanYoteibi({ basis: 'lmp', date: d('2026-09-19'), asOf: d('2026-09-18') }),
    ).toBeNull();
  });

  it('42週（294日）を超える入力は null', () => {
    // 2026-01-01 起点で 294日目は 2026-10-22。その翌日から計算しない
    expect(
      calcShussanYoteibi({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-10-22') }),
    ).not.toBeNull();
    expect(
      calcShussanYoteibi({ basis: 'lmp', date: d('2026-01-01'), asOf: d('2026-10-23') }),
    ).toBeNull();
    expect(MAX_GESTATION_DAYS).toBe(294);
  });

  it('300日より前の最終月経も同じ扱い（理由を書き分けない）', () => {
    expect(
      calcShussanYoteibi({ basis: 'lmp', date: d('2025-01-01'), asOf: d('2026-09-18') }),
    ).toBeNull();
  });

  it('医師の予定日が遠すぎる場合（起点が未来）も null', () => {
    expect(
      calcShussanYoteibi({ basis: 'due', date: d('2027-12-31'), asOf: d('2026-09-18') }),
    ).toBeNull();
  });

  it('例外時の文言は1つで、理由を書き分けない', () => {
    expect(INVALID_DATE_MESSAGE).toBe(
      '入力された日付からは妊娠週数を計算できません。日付をご確認ください。',
    );
    // 「予定日を過ぎています」のような書き方をしない（仕様書の約束）
    expect(INVALID_DATE_MESSAGE).not.toMatch(/過ぎ/);
  });

  it('医療上の判断をしない旨の文言が仕様どおり入っている', () => {
    expect(MEDICAL_NOTE).toMatch(/医師が判断します/);
    expect(MEDICAL_NOTE).toMatch(/医師から伝えられた予定日がある場合は、そちらが優先されます/);
  });
});

describe('出産手当金への引き継ぎ（クエリ）', () => {
  it('予定日と胎児数をクエリに組む', () => {
    expect(shussanTeateHandoffQuery(d('2026-10-08'), 1)).toBe('?due=2026-10-08&babies=1');
    expect(shussanTeateHandoffQuery(d('2026-10-08'), 2)).toBe('?due=2026-10-08&babies=2');
  });

  it('組んだクエリをそのまま読み戻せる', () => {
    const query = shussanTeateHandoffQuery(d('2026-10-08'), 2);
    expect(parseHandoffQuery(query)).toEqual({ dueDate: d('2026-10-08'), fetusCount: 2 });
    // 先頭の '?' はあってもなくてもよい
    expect(parseHandoffQuery(query.slice(1))).toEqual(parseHandoffQuery(query));
  });

  it('不正な日付は無視して既定に戻る（受け側は既定値のまま動く）', () => {
    expect(parseHandoffQuery('?due=2026-02-30&babies=1').dueDate).toBeUndefined();
    expect(parseHandoffQuery('?due=2026/10/08').dueDate).toBeUndefined();
    expect(parseHandoffQuery('?due=abc').dueDate).toBeUndefined();
    expect(parseHandoffQuery('?due=').dueDate).toBeUndefined();
    expect(parseHandoffQuery('')).toEqual({});
    // 日付だけが不正なら胎児数は生きる
    expect(parseHandoffQuery('?due=xxx&babies=2')).toEqual({ fetusCount: 2 });
  });

  it('胎児数は1〜10の整数だけを受け付ける', () => {
    expect(parseHandoffQuery('?babies=0').fetusCount).toBeUndefined();
    expect(parseHandoffQuery('?babies=-1').fetusCount).toBeUndefined();
    expect(parseHandoffQuery('?babies=1.5').fetusCount).toBeUndefined();
    expect(parseHandoffQuery('?babies=99').fetusCount).toBeUndefined();
    expect(parseHandoffQuery('?babies=abc').fetusCount).toBeUndefined();
    expect(parseHandoffQuery('?babies=3').fetusCount).toBe(3);
  });

  it('引き継いだ予定日で出産手当金が計算できる（受け渡しが噛み合っている）', () => {
    const yoteibi = calc({ basis: 'lmp', date: d('2026-01-01'), fetusCount: 2 });
    const handoff = parseHandoffQuery(
      shussanTeateHandoffQuery(yoteibi.dueDate, yoteibi.fetusCount),
    );
    const teate = calcShussanTeate({
      dueDate: handoff.dueDate!,
      fetusCount: handoff.fetusCount,
      monthlyIncome: 300_000,
    });
    expect(teate!.leaveFromDue).toEqual(yoteibi.leave.leaveFrom);
    expect(teate!.multiple).toBe(true);
  });
});
