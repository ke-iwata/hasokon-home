import { describe, expect, it } from 'vitest';
import { formatDate, type DateParts } from '@/lib/date-parts';
import { HOLIDAY_LAST_YEAR } from '@/lib/nissu-keisan';
import {
  calendarWeeks,
  DEFAULT_RULE,
  defaultYear,
  findPlans,
  groupPlans,
  isOff,
  isUpcoming,
  LAST_DATE,
  leaveNeeded,
  planHeadline,
  selectableYears,
  type OffRule,
  type Plan,
} from '@/lib/renkyu-keisan';
import { EXAMPLE_ROWS, EXAMPLE_SPECS } from '@/app/renkyu-keisan/tables';

/**
 * 連休計算機のテスト。
 *
 * 仕様: docs/features/renkyu-keisan.md の「テスト」の表。
 * 期待値は `HOLIDAYS`（lib/nissu-keisan.ts）と曜日から手で数えたもの。
 */

const d = (iso: string): DateParts => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
};
const iso = (p: DateParts) => formatDate(p);
const span = (p: Plan) => `${iso(p.start)}..${iso(p.end)}`;

/** 有給の日数・時期で絞った案（開始日の早い順） */
function plansOf(year: number, maxLeave: number, rule: OffRule, season: Plan['season'], leave: number) {
  return findPlans(year, maxLeave, rule).filter(
    (p) => p.season === season && p.leaveDays.length === leave,
  );
}

const SUN_ONLY: OffRule = { ...DEFAULT_RULE, weekend: 'sun' };
const NO_NEW_YEAR: OffRule = { ...DEFAULT_RULE, newYear: 'none' };

describe('isOff（休みの判定）', () => {
  it('土日・祝日・会社の年末年始休暇', () => {
    expect(isOff(d('2026-12-26'), DEFAULT_RULE)).toBe(true); // 土
    expect(isOff(d('2026-12-28'), DEFAULT_RULE)).toBe(false); // 月
    expect(isOff(d('2026-12-29'), DEFAULT_RULE)).toBe(true); // 年末年始休暇
    expect(isOff(d('2027-04-29'), DEFAULT_RULE)).toBe(true); // 昭和の日
  });

  it('日曜のみ休みなら土曜は休みでない', () => {
    expect(isOff(d('2027-05-01'), SUN_ONLY)).toBe(false);
    expect(isOff(d('2027-05-02'), SUN_ONLY)).toBe(true);
  });

  it('年末年始休暇 12/30〜 なら 12/29 は休みでない', () => {
    expect(isOff(d('2026-12-29'), { ...DEFAULT_RULE, newYear: 'dec30' })).toBe(false);
    expect(isOff(d('2026-12-30'), { ...DEFAULT_RULE, newYear: 'dec30' })).toBe(true);
  });

  it('夏季休暇 8/13〜8/16', () => {
    const obon: OffRule = { ...DEFAULT_RULE, summer: 'obon' };
    expect(isOff(d('2027-08-13'), obon)).toBe(true);
    expect(isOff(d('2027-08-13'), DEFAULT_RULE)).toBe(false);
  });

  it('祝日が未確定の年は元日だけを祝日として扱う', () => {
    expect(isOff(d('2028-01-01'), NO_NEW_YEAR)).toBe(true);
    // 2028-01-03（月）は祝日ではない（未確定の年は元日以外を祝日にしない）
    expect(isOff(d('2028-01-03'), NO_NEW_YEAR)).toBe(false);
  });
});

describe('findPlans（有給 ◯ 日で何連休）', () => {
  it('2026-27 年末年始・有給 1 → 12/26〜1/3 の 9 連休、有給 12/28', () => {
    const plans = plansOf(2026, 1, DEFAULT_RULE, '年末年始', 1);
    expect(plans.map(span)).toEqual(['2026-12-26..2027-01-03']);
    expect(plans[0].days).toBe(9);
    expect(plans[0].leaveDays.map(iso)).toEqual(['2026-12-28']);
  });

  it('2026-27 年末年始・有給 2 → 10 連休が 2 案（開始日の早い順）', () => {
    const plans = plansOf(2026, 2, DEFAULT_RULE, '年末年始', 2);
    expect(plans.map(span)).toEqual(['2026-12-25..2027-01-03', '2026-12-26..2027-01-04']);
    expect(plans.every((p) => p.days === 10)).toBe(true);
    expect(plans[0].leaveDays.map(iso)).toEqual(['2026-12-25', '2026-12-28']);
    expect(plans[1].leaveDays.map(iso)).toEqual(['2026-12-28', '2027-01-04']);
  });

  it('2027 GW・有給 1 → 4/29〜5/5 の 7 連休、有給 4/30', () => {
    const plans = plansOf(2027, 1, DEFAULT_RULE, 'GW', 1);
    expect(plans.map(span)).toEqual(['2027-04-29..2027-05-05']);
    expect(plans[0].leaveDays.map(iso)).toEqual(['2027-04-30']);
  });

  it('2027 GW・有給 2 → 5/1〜5/9 の 9 連休、有給 5/6・5/7', () => {
    const plans = plansOf(2027, 2, DEFAULT_RULE, 'GW', 2);
    expect(plans.map(span)).toEqual(['2027-05-01..2027-05-09']);
    expect(plans[0].leaveDays.map(iso)).toEqual(['2027-05-06', '2027-05-07']);
  });

  it('2027 GW・有給 3 → 4/29〜5/9 の 11 連休', () => {
    const plans = plansOf(2027, 3, DEFAULT_RULE, 'GW', 3);
    expect(plans.map(span)).toEqual(['2027-04-29..2027-05-09']);
    expect(plans[0].days).toBe(11);
    expect(plans[0].leaveDays.map(iso)).toEqual(['2027-04-30', '2027-05-06', '2027-05-07']);
  });

  it('年末年始休暇なし・2026-27・有給 1 → 9 連休にならず、1/1（金）の前後で 4 連休が最長', () => {
    const plans = plansOf(2026, 1, NO_NEW_YEAR, '年末年始', 1);
    expect(plans.length).toBeGreaterThan(0);
    expect(Math.max(...plans.map((p) => p.days))).toBe(4);
    expect(plans.map(span)).toEqual(['2026-12-31..2027-01-03', '2027-01-01..2027-01-04']);
  });

  it('日曜のみ休み・2027 GW・有給 1 → 最初の案は 5/1（土）〜5/5（水）の 5 連休、有給 5/1', () => {
    const plans = plansOf(2027, 1, SUN_ONLY, 'GW', 1);
    expect(plans[0].days).toBe(5);
    expect(span(plans[0])).toBe('2027-05-01..2027-05-05');
    expect(plans[0].leaveDays.map(iso)).toEqual(['2027-05-01']);
    // 4/30 を使う案（4/29〜4/30 の 2 日で止まる）は最長でないので出ない
    expect(plans.some((p) => iso(p.leaveDays[0]) === '2027-04-30')).toBe(false);
    expect(plans.every((p) => p.days === 5)).toBe(true);
  });

  it('年 2027 の年末年始は 2027-28（12/25〜1/3 の 10 連休）で、2026-27 は出ない', () => {
    const all = findPlans(2027, 2, DEFAULT_RULE);
    const newYear = all.filter((p) => p.season === '年末年始');
    expect(newYear.every((p) => p.start.year === 2027 && p.start.month === 12)).toBe(true);
    const two = newYear.filter((p) => p.leaveDays.length === 2);
    expect(two.map(span)).toEqual(['2027-12-25..2028-01-03']);
    expect(two[0].leaveDays.map(iso)).toEqual(['2027-12-27', '2027-12-28']);
    expect(two[0].unconfirmed).toBe(true);
  });

  it('年 2026 には 2026 年 1 月の正月休み（2025-26 年末年始）が出ない', () => {
    const plans = findPlans(2026, 5, DEFAULT_RULE);
    expect(plans.some((p) => p.season === '年末年始' && p.start.year === 2026 && p.start.month === 1)).toBe(false);
    expect(plans.filter((p) => p.season === '年末年始').every((p) => p.start.month === 12)).toBe(true);
  });

  it('2027 シルバーウィーク・有給 1 → 4 連休', () => {
    const plans = plansOf(2027, 1, DEFAULT_RULE, 'シルバーウィーク', 1);
    expect(plans.map(span)).toContain('2027-09-23..2027-09-26');
    expect(plans.every((p) => p.days === 4)).toBe(true);
  });

  it('夏季休暇ありならお盆の案が出る', () => {
    const obon: OffRule = { ...DEFAULT_RULE, summer: 'obon' };
    expect(findPlans(2027, 2, obon).some((p) => p.season === 'お盆')).toBe(true);
    expect(findPlans(2027, 2, DEFAULT_RULE).some((p) => p.season === 'お盆')).toBe(false);
  });

  it('祝日も会社の休みも含まない「週末＋有給」だけの案は出さない', () => {
    for (const p of findPlans(2027, 3, DEFAULT_RULE)) {
      expect(p.season).toBeTruthy();
      expect(p.leaveDays.length).toBeGreaterThanOrEqual(1);
      expect(p.leaveDays.length).toBeLessThanOrEqual(3);
    }
  });

  it('有給を増やしても長くならない案は出さない', () => {
    const plans = findPlans(2027, 5, DEFAULT_RULE);
    for (const p of plans) {
      const fewer = plans.filter((q) => q.key === p.key && q.leaveDays.length < p.leaveDays.length);
      for (const q of fewer) expect(p.days).toBeGreaterThan(q.days);
    }
  });

  it('範囲外の年・不正な有給の日数は空', () => {
    expect(findPlans(HOLIDAY_LAST_YEAR + 1, 2, DEFAULT_RULE)).toEqual([]);
    expect(findPlans(2027, 0, DEFAULT_RULE)).toEqual([]);
  });
});

describe('年の選択', () => {
  it('2028 年は選べない（HOLIDAY_LAST_YEAR まで）', () => {
    expect(selectableYears()).toEqual([2026, 2027]);
    expect(selectableYears()).not.toContain(2028);
  });

  it('既定の年は今日の年（範囲の端に寄せる）', () => {
    expect(defaultYear(d('2026-10-07'))).toBe(2026);
    expect(defaultYear(d('2027-03-01'))).toBe(2027);
    expect(defaultYear(d('2025-05-01'))).toBe(2026);
    expect(defaultYear(d('2030-01-01'))).toBe(HOLIDAY_LAST_YEAR);
  });
});

describe('過去の案を出さない', () => {
  it('today = 2026-10-07・年 2026 → GW・お盆・SW が無く、年末年始はある', () => {
    const obon: OffRule = { ...DEFAULT_RULE, summer: 'obon' };
    const plans = findPlans(2026, 2, obon).filter((p) => isUpcoming(p, d('2026-10-07')));
    const seasons = new Set(groupPlans(plans).map((c) => c.season));
    expect(seasons.has('GW')).toBe(false);
    expect(seasons.has('お盆')).toBe(false);
    expect(seasons.has('シルバーウィーク')).toBe(false);
    expect(seasons.has('年末年始')).toBe(true);
    // 11 月の 3 連休（文化の日・勤労感謝の日）は残る
    expect(plans.some((p) => p.start.month === 11)).toBe(true);
  });

  it('有給の日が過ぎた案は出さない', () => {
    const plan = plansOf(2026, 1, DEFAULT_RULE, '年末年始', 1)[0];
    expect(isUpcoming(plan, d('2026-12-28'))).toBe(true);
    expect(isUpcoming(plan, d('2026-12-29'))).toBe(false);
  });
});

describe('groupPlans（カードの並び）', () => {
  it('「連休の日数 ÷ 有給の日数」の大きい順', () => {
    const cards = groupPlans(findPlans(2026, 2, DEFAULT_RULE));
    expect(cards[0].season).toBe('年末年始');
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i - 1].efficiency).toBeGreaterThanOrEqual(cards[i].efficiency);
    }
  });

  it('同じ時期の案は 1 枚にまとまり、有給の少ない順に並ぶ', () => {
    const cards = groupPlans(findPlans(2027, 3, DEFAULT_RULE));
    const gw = cards.filter((c) => c.season === 'GW');
    expect(gw).toHaveLength(1);
    expect(gw[0].plans.map((p) => p.leaveDays.length)).toEqual([1, 2, 3]);
  });
});

describe('leaveNeeded（この期間を休むには有給が何日）', () => {
  it('2027-04-29〜05-09 → 有給 3 日（4/30・5/6・5/7）', () => {
    const r = leaveNeeded(d('2027-04-29'), d('2027-05-09'), DEFAULT_RULE);
    expect(r?.leaveDays.map(iso)).toEqual(['2027-04-30', '2027-05-06', '2027-05-07']);
    expect(r?.days).toBe(11);
    expect(r?.unconfirmed).toBe(false);
  });

  it('2027-12-25〜2028-01-03 → 有給 2 日（12/27・12/28）と未確定の注記。null にならない', () => {
    const r = leaveNeeded(d('2027-12-25'), d('2028-01-03'), DEFAULT_RULE);
    expect(r).not.toBeNull();
    expect(r?.leaveDays.map(iso)).toEqual(['2027-12-27', '2027-12-28']);
    expect(r?.unconfirmed).toBe(true);
  });

  it('日曜のみ休みが効く', () => {
    const r = leaveNeeded(d('2027-05-01'), d('2027-05-05'), SUN_ONLY);
    expect(r?.leaveDays.map(iso)).toEqual(['2027-05-01']);
  });

  it('翌年 1 月 3 日より後・逆順は選べない', () => {
    expect(iso(LAST_DATE)).toBe(`${HOLIDAY_LAST_YEAR + 1}-01-03`);
    expect(leaveNeeded(d('2027-12-25'), d('2028-01-04'), DEFAULT_RULE)).toBeNull();
    expect(leaveNeeded(d('2027-05-09'), d('2027-04-29'), DEFAULT_RULE)).toBeNull();
  });

  it('モード 1 と 2 の一致：findPlans の各案の期間を leaveNeeded に渡すと有給の日が同じ', () => {
    const rules: OffRule[] = [
      DEFAULT_RULE,
      SUN_ONLY,
      NO_NEW_YEAR,
      { weekend: 'satsun', newYear: 'dec30', summer: 'obon' },
    ];
    for (const rule of rules) {
      for (const year of selectableYears()) {
        for (const p of findPlans(year, 5, rule)) {
          const r = leaveNeeded(p.start, p.end, rule);
          expect(r?.leaveDays.map(iso)).toEqual(p.leaveDays.map(iso));
          expect(r?.days).toBe(p.days);
        }
      }
    }
  });
});

describe('calendarWeeks（ミニカレンダー）', () => {
  it('連休の前後 1 日を含む週を 7 マスずつ返し、有給・祝日・会社の休みを区別する', () => {
    const plan = plansOf(2026, 1, DEFAULT_RULE, '年末年始', 1)[0];
    const weeks = calendarWeeks(plan, DEFAULT_RULE);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const cells = weeks.flat();
    expect(cells[0].date.month).toBe(12);
    expect(dow(cells[0].date)).toBe(0); // 日曜はじまり
    const byIso = new Map(cells.map((c) => [iso(c.date), c]));
    expect(byIso.get('2026-12-25')?.inPlan).toBe(false);
    expect(byIso.get('2026-12-28')?.kind).toBe('leave');
    expect(byIso.get('2026-12-29')?.kind).toBe('company');
    expect(byIso.get('2027-01-01')?.kind).toBe('holiday');
    expect(byIso.get('2027-01-01')?.label).toBe('元日');
    expect(byIso.get('2027-01-04')?.inPlan).toBe(false);
  });
});

function dow(p: DateParts): number {
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

describe('解説の表（app/renkyu-keisan/tables.ts）', () => {
  it('表の各行が findPlans() の結果と一致する', () => {
    expect(EXAMPLE_ROWS).toHaveLength(EXAMPLE_SPECS.length);
    for (const row of EXAMPLE_ROWS) {
      const expected = plansOf(row.year, row.leave, DEFAULT_RULE, row.season, row.leave);
      expect(row.plans.map(span)).toEqual(expected.map(span));
      expect(row.plans.length).toBeGreaterThan(0);
    }
  });

  it('仕様書の具体例の日数になっている', () => {
    const days = EXAMPLE_ROWS.map((r) => `${r.year}:${r.season}:${r.leave}=${r.plans[0].days}`);
    expect(days).toEqual([
      '2026:年末年始:1=9',
      '2026:年末年始:2=10',
      '2027:GW:1=7',
      '2027:GW:2=9',
      '2027:GW:3=11',
      '2027:シルバーウィーク:1=4',
      '2027:年末年始:2=10',
    ]);
  });
});

describe('planHeadline（カードの太字 1 行）', () => {
  it('有給 1 日（12/28 月）で 12/26（土）〜1/3（日）の 9 連休', () => {
    const plan = plansOf(2026, 1, DEFAULT_RULE, '年末年始', 1)[0];
    expect(planHeadline(plan)).toBe('有給 1 日（12/28 月）で 12/26（土）〜1/3（日）の 9 連休');
  });
});
