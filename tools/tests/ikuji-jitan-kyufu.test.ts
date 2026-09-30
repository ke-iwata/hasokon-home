import { describe, expect, it } from 'vitest';
import { parseDate, type DateParts } from '@/lib/date-parts';
import {
  LIMIT_EFFECTIVE_FROM as KYUGYO_LIMIT_FROM,
  LIMIT_EFFECTIVE_UNTIL as KYUGYO_LIMIT_UNTIL,
  WAGE_DAILY_MAX,
  WAGE_DAILY_MIN,
} from '@/lib/ikuji-kyugyo';
import {
  LIMIT_EFFECTIVE_FROM,
  LIMIT_EFFECTIVE_UNTIL,
  LIMIT_MAX,
  LIMIT_MIN,
  START_WAGE_DAILY_MAX,
  START_WAGE_DAILY_MIN,
  START_WAGE_MAX,
  START_WAGE_MIN,
  calcIkujiJitan,
  formatRate,
  hayamiRows,
  lastEligibleMonth,
  monthlyAmount,
  reachesAgeTwoOn,
  startWageFrom,
  taperRateHundredths,
  wageRateHundredths,
} from '@/lib/ikuji-jitan-kyufu';

/**
 * 育児時短就業給付金のテスト
 *
 * 仕様: docs/features/ikuji-jitan-kyufu.md
 *
 * 突き合わせる一次情報は、厚生労働省・都道府県労働局・ハローワーク
 * 「育児時短就業給付の内容と支給申請手続」2026（令和8）年8月1日時点版
 * https://www.mhlw.go.jp/content/11600000/001395102.pdf 。
 * 計算例①〜③と例4をそのまま入れて突き合わせる。
 */

const d = (iso: string): DateParts => {
  const p = parseDate(iso);
  if (!p) throw new Error(iso);
  return p;
};

describe('限度額（令和8年8月1日〜令和9年7月31日）', () => {
  it('パンフレットの額', () => {
    expect(LIMIT_MAX).toBe(484_121);
    expect(LIMIT_MIN).toBe(2_562);
    expect(START_WAGE_MAX).toBe(496_200);
    expect(START_WAGE_MIN).toBe(96_090);
    expect(LIMIT_EFFECTIVE_UNTIL).toBe('2027-07-31');
  });

  it('開始時賃金月額の上限・下限は育児休業給付の休業開始時賃金日額と同じ表（同じPRで更新する）', () => {
    expect(START_WAGE_DAILY_MAX).toBe(WAGE_DAILY_MAX);
    expect(START_WAGE_DAILY_MIN).toBe(WAGE_DAILY_MIN);
    expect(LIMIT_EFFECTIVE_FROM).toBe(KYUGYO_LIMIT_FROM);
    expect(LIMIT_EFFECTIVE_UNTIL).toBe(KYUGYO_LIMIT_UNTIL);
  });
});

describe('開始時賃金月額', () => {
  it('月給 × 6 ÷ 180 を切り捨てた日額 × 30', () => {
    expect(startWageFrom(300_000)).toEqual({ daily: 10_000, monthly: 300_000, cap: null });
    // 6か月で 1,850,005円 → 日額 10,277.8 → 10,277円 → 月額 308,310円
    expect(startWageFrom(308_334.17).monthly).toBe(308_310);
  });

  it('上限 496,200円（例③）・下限 96,090円', () => {
    expect(startWageFrom(600_000)).toEqual({ daily: 16_540, monthly: 496_200, cap: 'max' });
    expect(startWageFrom(496_200)).toEqual({ daily: 16_540, monthly: 496_200, cap: null });
    expect(startWageFrom(50_000)).toEqual({ daily: 3_203, monthly: 96_090, cap: 'min' });
  });
});

describe('月の支給額 — パンフレットの計算例', () => {
  it('例①：開始時 300,000円・賃金 200,000円 → 90%以下で10% ＝ 20,000円', () => {
    const r = monthlyAmount(200_000, 300_000);
    expect(r.reason).toBe('base');
    expect(r.amount).toBe(20_000);
    expect(r.rateHundredths).toBe(1_000);
  });

  it('例②：開始時 300,000円・賃金 280,000円 → 逓減 6.43% ＝ 18,004円', () => {
    const r = monthlyAmount(280_000, 300_000);
    expect(r.reason).toBe('taper');
    expect(r.wageRateHundredths).toBe(9_333);
    expect(r.rateHundredths).toBe(643);
    expect(r.amount).toBe(18_004);
  });

  it('例③：開始時 496,200円・賃金 445,000円 → 90%（446,580円）以下だが限度額で 39,121円', () => {
    const r = monthlyAmount(445_000, 496_200);
    expect(r.threshold90).toBe(446_580);
    expect(r.reason).toBe('cap');
    expect(r.beforeCap).toBe(44_500);
    expect(r.amount).toBe(39_121);
  });
});

describe('月の支給額 — 90%の境界は金額で判定する', () => {
  it('ちょうど 90%（270,000円）は10%', () => {
    const r = monthlyAmount(270_000, 300_000);
    expect(r.reason).toBe('base');
    expect(r.amount).toBe(27_000);
  });

  it('270,010円は逓減側に入るが、賃金率が 90.00% に丸まり Y ＝ 10.00% で 27,001円', () => {
    const r = monthlyAmount(270_010, 300_000);
    expect(r.reason).toBe('taper');
    expect(r.wageRateHundredths).toBe(9_000);
    expect(r.rateHundredths).toBe(1_000);
    expect(r.amount).toBe(27_001);
  });

  it('270,300円（90.10%）で初めて Y ＝ 9.89%', () => {
    const r = monthlyAmount(270_300, 300_000);
    expect(r.rateHundredths).toBe(989);
    expect(r.amount).toBe(Math.floor((270_300 * 989) / 10_000));
  });
});

describe('月の支給額 — 支給されないケース', () => {
  it('99.99% はほぼ0で、最低限度額以下なので支給なし', () => {
    const r = monthlyAmount(299_970, 300_000);
    expect(r.rateHundredths).toBe(1);
    expect(r.reason).toBe('none-min');
    expect(r.amount).toBe(0);
  });

  it('100.00%（同額）は支給なし', () => {
    expect(monthlyAmount(300_000, 300_000).reason).toBe('none-over100');
    expect(monthlyAmount(310_000, 300_000).reason).toBe('none-over100');
  });

  it('賃金が支給限度額 484,121円ちょうどなら支給なし', () => {
    const r = monthlyAmount(484_121, 496_200);
    expect(r.reason).toBe('none-over-limit');
    expect(r.amount).toBe(0);
  });

  it('支給額ちょうど 2,562円は支給なし、2,563円は支給', () => {
    expect(monthlyAmount(25_620, 96_090)).toMatchObject({ reason: 'none-min', amount: 0 });
    expect(monthlyAmount(25_630, 96_090)).toMatchObject({ reason: 'base', amount: 2_563 });
  });

  it('限度額で頭打ちにした額が最低限度額以下なら支給なし', () => {
    // 482,000 × 10% ＝ 48,200 → 限度額で 2,121円 → 2,562円以下
    const r = monthlyAmount(482_000, 496_200);
    expect(r.reason).toBe('none-min');
    expect(r.amount).toBe(0);
  });
});

describe('率の丸め', () => {
  it('賃金率は小数第3位を四捨五入', () => {
    expect(wageRateHundredths(280_000, 300_000)).toBe(9_333);
    // 93.335% ちょうど → 93.34%
    expect(wageRateHundredths(186_670, 200_000)).toBe(9_334);
  });

  it('早見表（パンフレットと同じ 0.5% 刻み）', () => {
    const rows = hayamiRows();
    expect(rows).toHaveLength(19);
    expect(rows[0].wageRateH).toBe(9_050);
    expect(rows.at(-1)?.wageRateH).toBe(9_950);
    const at = (wr: number) => rows.find((r) => r.wageRateH === wr)?.rateH;
    expect(at(9_100)).toBe(890);
    expect(at(9_500)).toBe(474);
    expect(at(9_900)).toBe(91);
    // 支給率は賃金率が上がるほど下がる
    for (let i = 1; i < rows.length; i++) expect(rows[i].rateH).toBeLessThan(rows[i - 1].rateH);
  });

  it('taperRateHundredths は 90.00% で 10.00%', () => {
    expect(taperRateHundredths(9_000)).toBe(1_000);
  });

  it('formatRate', () => {
    expect(formatRate(643)).toBe('6.43%');
    expect(formatRate(1_000)).toBe('10.00%');
  });
});

describe('支給対象月の終わり', () => {
  it('4月1日生まれ → 2歳に達する日は3月31日、前日3月30日 → 3月まで', () => {
    expect(reachesAgeTwoOn(d('2025-04-01'))).toEqual(d('2027-03-31'));
    expect(lastEligibleMonth(d('2025-04-01'))).toEqual({ year: 2027, month: 3 });
  });

  it('4月2日生まれは、前日が3月31日なので3月まで', () => {
    expect(lastEligibleMonth(d('2025-04-02'))).toEqual({ year: 2027, month: 3 });
  });

  it('4月3日生まれは4月まで', () => {
    expect(lastEligibleMonth(d('2025-04-03'))).toEqual({ year: 2027, month: 4 });
  });

  it('閏日生まれ → 2歳に達する日は2月28日、前日2月27日 → 2月まで', () => {
    expect(reachesAgeTwoOn(d('2024-02-29'))).toEqual(d('2026-02-28'));
    expect(lastEligibleMonth(d('2024-02-29'))).toEqual({ year: 2026, month: 2 });
  });

  it('3月1日生まれ → 2歳に達する日は2月末日、前日の属する2月まで', () => {
    expect(reachesAgeTwoOn(d('2025-03-01'))).toEqual(d('2027-02-28'));
    expect(lastEligibleMonth(d('2025-03-01'))).toEqual({ year: 2027, month: 2 });
  });
});

describe('calcIkujiJitan', () => {
  const base = {
    wageBefore: 300_000,
    wageAfter: 200_000,
    birth: d('2025-04-10'),
    jitanStart: d('2026-04-21'),
  };

  it('例4：育休 4/20 終了・4/21 時短開始 → 支給対象月は4月から（月の途中でもその月から数える）', () => {
    const r = calcIkujiJitan(base);
    expect(r?.firstMonth).toEqual({ year: 2026, month: 4 });
    // 2027-04-09 に2歳に達する → 前日 2027-04-08 → 4月まで
    expect(r?.lastMonth).toEqual({ year: 2027, month: 4 });
    expect(r?.months).toBe(13);
    expect(r?.month.amount).toBe(20_000);
    expect(r?.total).toBe(260_000);
    expect(r?.paidPlusBenefit).toBe(220_000);
  });

  it('時短開始が支給対象月の最後の月より後なら0か月で、月の額も支給なし', () => {
    const r = calcIkujiJitan({ ...base, jitanStart: d('2027-05-01') });
    expect(r?.months).toBe(0);
    expect(r?.total).toBe(0);
    expect(r?.month.amount).toBe(0);
    expect(r?.month.reason).toBe('none-no-months');
    expect(r?.paidPlusBenefit).toBe(200_000);
  });

  it('最後の月に始めれば1か月', () => {
    expect(calcIkujiJitan({ ...base, jitanStart: d('2027-04-01') })?.months).toBe(1);
  });

  it('支給なしなら期間合計も0で、手取りの目安は月給のまま', () => {
    const r = calcIkujiJitan({ ...base, wageAfter: 300_000 });
    expect(r?.month.reason).toBe('none-over100');
    expect(r?.total).toBe(0);
    expect(r?.paidPlusBenefit).toBe(300_000);
  });

  it('入力が不正なら null', () => {
    expect(calcIkujiJitan({ ...base, wageBefore: 0 })).toBeNull();
    expect(calcIkujiJitan({ ...base, wageAfter: 0 })).toBeNull();
    expect(calcIkujiJitan({ ...base, wageAfter: Number.NaN })).toBeNull();
    expect(calcIkujiJitan({ ...base, jitanStart: d('2025-04-09') })).toBeNull();
  });
});
