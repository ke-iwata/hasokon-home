import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, type DateParts } from '@/lib/date-parts';
import {
  HIGH_RATE_DAYS,
  LEAVE_MONTHS_MAX,
  RATE_COMBINED,
  RATE_EARLY,
  RATE_LATE,
  RATE_SHUSSHOGO,
  SHUSSHOGO_CAP,
  SHUSSHOGO_FLOOR,
  SHUSSHOGO_MAX_DAYS,
  SHUSSHOGO_MIN_LEAVE_DAYS,
  SHUSSHOJI_CAP,
  UNIT_CAP_EARLY,
  UNIT_CAP_LATE,
  UNIT_FLOOR_EARLY,
  UNIT_FLOOR_LATE,
  UNIT_PERIOD_PAY_DAYS,
  WAGE_DAILY_MAX,
  WAGE_DAILY_MIN,
  WAGE_MONTHLY_DAYS,
  calcIkujiKyugyo,
  defaultLeaveStart,
  shusshogoWindowFor,
  unitPeriodsBetween,
  wageDailyFrom,
  type IkujiKyugyoInput,
} from '@/lib/ikuji-kyugyo';

/**
 * 育児休業給付金（＋出生後休業支援給付金）のテスト
 *
 * 仕様: docs/features/ikuji-kyugyo-kyufu.md
 *
 * 突き合わせる一次情報は、厚生労働省・都道府県労働局・ハローワーク
 * 「育児休業等給付の内容と支給申請手続」2026（令和8）年8月1日改訂版
 * https://www.mhlw.go.jp/content/11600000/001461102.pdf と、
 * 支給限度額のリーフレット https://www.mhlw.go.jp/content/001728499.pdf 。
 * **どちらも金額・日付の例がそのまま載っている**ので、例をそのまま入れて突き合わせる。
 */

/** 'YYYY-MM-DD' → DateParts（テスト内で日付を読みやすく書くため） */
function d(iso: string): DateParts {
  const parts = parseDate(iso);
  if (!parts) throw new Error(`テストの日付が不正です: ${iso}`);
  return parts;
}

/** 月給から6ヶ月の賃金総額を作る */
function wage6m(monthly: number): number {
  return monthly * 6;
}

/** 既定の入力（各テストで必要なところだけ上書きする） */
function input(over: Partial<IkujiKyugyoInput> = {}): IkujiKyugyoInput {
  return {
    totalWage6m: wage6m(300_000),
    parent: 'partner',
    birthDate: d('2026-10-05'),
    leaveStart: d('2026-10-05'),
    leaveMonths: 12,
    shusshogo: 'yes',
    ...over,
  };
}

describe('支給限度額（一次情報に額そのものが載っているもの）', () => {
  /**
   * 上限額・下限額は毎年8月1日に改定される。定数で持ちつつ、
   * 「賃金日額 × 支給日数 × 給付率の切り捨て」と一致することをここで見張る。
   * 片方だけ直したときに落ちるようにするのが目的。
   */
  it('賃金月額の上限額・下限額は賃金日額の30倍', () => {
    expect(WAGE_DAILY_MAX * WAGE_MONTHLY_DAYS).toBe(496_200);
    expect(WAGE_DAILY_MIN * WAGE_MONTHLY_DAYS).toBe(96_090);
  });

  it('支給日数30日の支給上限額（67% / 50%）', () => {
    expect(Math.floor(WAGE_DAILY_MAX * 30 * RATE_EARLY)).toBe(UNIT_CAP_EARLY);
    expect(Math.floor(WAGE_DAILY_MAX * 30 * RATE_LATE)).toBe(UNIT_CAP_LATE);
    expect(UNIT_CAP_EARLY).toBe(332_454);
    expect(UNIT_CAP_LATE).toBe(248_100);
  });

  it('支給日数30日の支給下限額（67% / 50%）', () => {
    expect(Math.floor(WAGE_DAILY_MIN * 30 * RATE_EARLY)).toBe(UNIT_FLOOR_EARLY);
    expect(Math.floor(WAGE_DAILY_MIN * 30 * RATE_LATE)).toBe(UNIT_FLOOR_LATE);
    expect(UNIT_FLOOR_EARLY).toBe(64_380);
    expect(UNIT_FLOOR_LATE).toBe(48_045);
  });

  it('出生後休業支援給付金（28日・13%）の支給上限額・下限額', () => {
    expect(Math.floor(WAGE_DAILY_MAX * SHUSSHOGO_MAX_DAYS * RATE_SHUSSHOGO)).toBe(SHUSSHOGO_CAP);
    expect(Math.floor(WAGE_DAILY_MIN * SHUSSHOGO_MAX_DAYS * RATE_SHUSSHOGO)).toBe(SHUSSHOGO_FLOOR);
    expect(SHUSSHOGO_CAP).toBe(60_205);
    expect(SHUSSHOGO_FLOOR).toBe(11_658);
  });

  it('出生時育児休業給付金（28日・67%）の支給上限額', () => {
    expect(Math.floor(WAGE_DAILY_MAX * SHUSSHOGO_MAX_DAYS * RATE_EARLY)).toBe(SHUSSHOJI_CAP);
    expect(SHUSSHOJI_CAP).toBe(310_290);
  });

  it('67% + 13% は 80%（浮動小数の誤差を持ち込まない）', () => {
    expect(RATE_COMBINED).toBeCloseTo(0.8, 10);
  });
});

describe('休業開始時賃金日額', () => {
  it('賃金総額 ÷ 180 を1円未満切り捨て', () => {
    // 300,000円 × 6ヶ月 ÷ 180 = 10,000円（一次情報の計算例と同じ賃金日額）
    expect(wageDailyFrom(wage6m(300_000))).toEqual({ raw: 10_000, value: 10_000, cap: null });
    // 割り切れないときは切り捨て（1,800,001 ÷ 180 = 10,000.005…）
    expect(wageDailyFrom(1_800_001).value).toBe(10_000);
  });

  it('上限額・下限額に当てる', () => {
    const high = wageDailyFrom(wage6m(600_000));
    expect(high.raw).toBe(20_000);
    expect(high.value).toBe(WAGE_DAILY_MAX);
    expect(high.cap).toBe('max');

    const low = wageDailyFrom(wage6m(50_000));
    expect(low.raw).toBe(1_666);
    expect(low.value).toBe(WAGE_DAILY_MIN);
    expect(low.cap).toBe('min');
  });

  it('上限額・下限額ちょうどは張り付き扱いにしない', () => {
    expect(wageDailyFrom(WAGE_DAILY_MAX * 180).cap).toBeNull();
    expect(wageDailyFrom(WAGE_DAILY_MIN * 180).cap).toBeNull();
  });

  it('賃金が0でも下限額まで引き上げる（0円と表示しない）', () => {
    expect(wageDailyFrom(0).value).toBe(WAGE_DAILY_MIN);
    expect(wageDailyFrom(-1).value).toBe(WAGE_DAILY_MIN);
  });
});

describe('出生後休業支援給付の対象期間（一次情報の例1・例3）', () => {
  /**
   * 一次情報：出生日10月5日 →
   * 「出生日から起算して8週間を経過する日の翌日は11/30」（産後休業をしない親）、
   * 「16週間を経過する日の翌日は1/25」（産後休業をする親）。
   */
  it('産後休業をしない親（父など）は8週間', () => {
    const w = shusshogoWindowFor(d('2026-10-05'), 'partner');
    expect(w.weeks).toBe(8);
    expect(formatDate(w.start)).toBe('2026-10-05');
    expect(formatDate(w.end)).toBe('2026-11-30');
  });

  it('産後休業をする親（出産した本人）は16週間', () => {
    const w = shusshogoWindowFor(d('2026-10-05'), 'mother');
    expect(w.weeks).toBe(16);
    expect(formatDate(w.end)).toBe('2027-01-25');
  });

  it('出産予定日より前に出生した例（一次情報の例2・例4は起算日が出産予定日）', () => {
    // 起算日に出産予定日10/6を渡すと、8週間 → 12/1、16週間 → 1/26
    expect(formatDate(shusshogoWindowFor(d('2026-10-06'), 'partner').end)).toBe('2026-12-01');
    expect(formatDate(shusshogoWindowFor(d('2026-10-06'), 'mother').end)).toBe('2027-01-26');
  });
});

describe('育児休業を開始できる最も早い日', () => {
  /** 一次情報の例：12月9日に出産 → 2月4日から育児休業を開始（産後休業8週間のあと） */
  it('産後休業をする親は出生日の57日後', () => {
    expect(formatDate(defaultLeaveStart(d('2026-12-09'), 'mother'))).toBe('2027-02-04');
  });

  it('産後休業をしない親は出生日から取れる', () => {
    expect(formatDate(defaultLeaveStart(d('2026-12-09'), 'partner'))).toBe('2026-12-09');
  });
});

describe('支給単位期間の区切り', () => {
  /**
   * 一次情報の図：2月4日に育児休業を開始した場合の支給単位期間は
   * 2/4〜3/3、3/4〜4/3、4/4〜5/3、5/4〜6/3。**暦月ではない。**
   */
  it('休業開始日の応当日で区切る（一次情報の図）', () => {
    const periods = unitPeriodsBetween(d('2027-02-04'), d('2027-06-03'));
    expect(periods.map((p) => `${formatDate(p.start)}〜${formatDate(p.end)}`)).toEqual([
      '2027-02-04〜2027-03-03',
      '2027-03-04〜2027-04-03',
      '2027-04-04〜2027-05-03',
      '2027-05-04〜2027-06-03',
    ]);
    expect(periods.at(-1)?.isFinal).toBe(true);
  });

  it('応当日が無い月はその月の末日を応当日とみなす（5月31日の翌月応当日は6月30日）', () => {
    const periods = unitPeriodsBetween(d('2026-05-31'), d('2026-07-30'));
    expect(periods.map((p) => formatDate(p.end))).toEqual(['2026-06-29', '2026-07-30']);
  });

  it('休業終了日を含む期間はそこで打ち切る', () => {
    const periods = unitPeriodsBetween(d('2027-02-04'), d('2027-03-20'));
    expect(periods).toHaveLength(2);
    expect(formatDate(periods[1].end)).toBe('2027-03-20');
    expect(periods[1].calendarDays).toBe(17);
  });

  it('1日だけの休業でも1期間になる', () => {
    expect(unitPeriodsBetween(d('2027-02-04'), d('2027-02-04'))).toHaveLength(1);
  });
});

describe('支給額（一次情報の計算例）', () => {
  /**
   * 一次情報：休業開始時の賃金日額10,000円
   * - 支給単位期間に賃金が支払われていない場合
   *   育児休業給付金 = 10,000円 × 30日 × 67% = 201,000円
   *   出生後休業支援給付金 = 10,000円 × 28日 × 13% = 36,400円
   */
  it('賃金日額10,000円の最初の支給単位期間は201,000円 + 36,400円', () => {
    const r = calcIkujiKyugyo(input());
    const first = r.periods[0];
    expect(r.wage.value).toBe(10_000);
    expect(first.payDays).toBe(30);
    expect(first.ikuji).toBe(201_000);
    expect(first.shusshogoDays).toBe(28);
    expect(first.shusshogo).toBe(36_400);
    expect(first.total).toBe(237_400);
  });

  /**
   * 一次情報：賃金日額10,000円で14日間の産後パパ育休
   *   出生時育児休業給付金 = 10,000円 × 14日 × 67% = 93,800円
   *   出生後休業支援給付金 = 10,000円 × 14日 × 13% = 18,200円
   *
   * 初版は出生時育児休業給付金を育児休業給付金と区別せず67%で計算する
   * （給付率が同じで180日にも通算されるため、金額は変わらない）。
   */
  it('14日間だけの休業（産後パパ育休と同じ日数）', () => {
    const r = calcIkujiKyugyo(input({ leaveEnd: d('2026-10-18') }));
    expect(r.leaveDays).toBe(14);
    expect(r.periods).toHaveLength(1);
    expect(r.periods[0].payDays).toBe(14);
    expect(r.totalIkuji).toBe(93_800);
    expect(r.totalShusshogo).toBe(18_200);
    expect(r.total).toBe(112_000);
  });

  it('賃金日額が上限額に張り付くと支給上限額になる', () => {
    const r = calcIkujiKyugyo(input({ totalWage6m: wage6m(600_000) }));
    expect(r.wage.cap).toBe('max');
    expect(r.periods[0].ikuji).toBe(UNIT_CAP_EARLY);
    expect(r.totalShusshogo).toBe(SHUSSHOGO_CAP);
    expect(r.periods.at(-1)?.days50).toBeGreaterThan(0);
    expect(r.periods[6].ikuji).toBe(UNIT_CAP_LATE);
  });

  it('賃金日額が下限額に張り付くと支給下限額になる', () => {
    const r = calcIkujiKyugyo(input({ totalWage6m: wage6m(50_000) }));
    expect(r.wage.cap).toBe('min');
    expect(r.periods[0].ikuji).toBe(UNIT_FLOOR_EARLY);
    expect(r.periods[6].ikuji).toBe(UNIT_FLOOR_LATE);
    expect(r.totalShusshogo).toBe(SHUSSHOGO_FLOOR);
  });

  it('支給日数は原則30日（2月から始まっても28日にしない）', () => {
    const r = calcIkujiKyugyo(
      input({ birthDate: d('2026-12-09'), parent: 'mother', leaveStart: d('2027-02-04') }),
    );
    expect(r.periods[0].calendarDays).toBe(28);
    expect(r.periods[0].payDays).toBe(UNIT_PERIOD_PAY_DAYS);
    expect(r.periods[0].ikuji).toBe(201_000);
  });

  it('休業終了日を含む支給単位期間だけは実日数で計算する', () => {
    // 2/4開始・3/20終了 → 2期目は3/4〜3/20の17日
    const r = calcIkujiKyugyo(
      input({
        birthDate: d('2026-12-09'),
        parent: 'mother',
        leaveStart: d('2027-02-04'),
        leaveEnd: d('2027-03-20'),
      }),
    );
    expect(r.periods[1].payDays).toBe(17);
    expect(r.periods[1].ikuji).toBe(Math.floor(10_000 * 17 * RATE_EARLY));
  });
});

describe('給付率67% → 50% の段差', () => {
  it('通算180日までが67%、181日目以降は50%', () => {
    const r = calcIkujiKyugyo(input({ leaveMonths: 12 }));
    expect(r.periods).toHaveLength(12);
    expect(r.days67).toBe(HIGH_RATE_DAYS);
    expect(r.days50).toBe(r.payDays - HIGH_RATE_DAYS);

    // 6期目までが67%（30日 × 6 = 180日）、7期目から50%
    for (const p of r.periods.slice(0, 6)) {
      expect(p.days50).toBe(0);
      expect(p.ikuji).toBe(Math.floor(10_000 * p.payDays * RATE_EARLY));
    }
    expect(r.periods[6].days67).toBe(0);
    expect(r.periods[6].ikuji).toBe(Math.floor(10_000 * 30 * RATE_LATE));
    expect(r.reachesLateRate).toBe(true);
  });

  /**
   * ちょうど6ヶ月の育休は「180日まで67%」の枠にぴったり収まる。
   * 最後の支給単位期間の暦日が31日あっても支給日数を30日で止めないと、
   * 支給日数が181日になって「最後の1日だけ50%」という制度に無い段差が出る。
   */
  it('6ヶ月で終わる育休は50%の期間に届かない', () => {
    const r = calcIkujiKyugyo(input({ leaveMonths: 6 }));
    expect(r.periods).toHaveLength(6);
    expect(r.periods.at(-1)?.calendarDays).toBe(31);
    expect(r.periods.at(-1)?.payDays).toBe(UNIT_PERIOD_PAY_DAYS);
    expect(r.payDays).toBe(HIGH_RATE_DAYS);
    expect(r.days50).toBe(0);
    expect(r.reachesLateRate).toBe(false);
  });

  it('支給日数は1つの支給単位期間で30日を超えない', () => {
    const r = calcIkujiKyugyo(input({ leaveMonths: 12 }));
    expect(r.periods.every((p) => p.payDays <= UNIT_PERIOD_PAY_DAYS)).toBe(true);
  });

  it('取得期間は12ヶ月で頭打ちにする（延長は扱わない）', () => {
    const r = calcIkujiKyugyo(input({ leaveMonths: 24 }));
    expect(r.periods).toHaveLength(LEAVE_MONTHS_MAX);
  });
});

describe('出生後休業支援給付金の支給日数', () => {
  it('対象期間と重なる日数が28日を超えても28日で頭打ち', () => {
    const r = calcIkujiKyugyo(input({ parent: 'mother', leaveStart: d('2026-12-01') }));
    expect(r.shusshogo.overlapDays).toBeGreaterThan(SHUSSHOGO_MAX_DAYS);
    expect(r.shusshogo.days).toBe(SHUSSHOGO_MAX_DAYS);
  });

  it('対象期間からはみ出した分は13%が付かない', () => {
    // 産後休業をしない親の対象期間は 10/5〜11/30。11/15開始なら重なりは16日
    const r = calcIkujiKyugyo(input({ leaveStart: d('2026-11-15') }));
    expect(r.shusshogo.overlapDays).toBe(16);
    expect(r.shusshogo.days).toBe(16);
    expect(r.totalShusshogo).toBe(Math.floor(10_000 * 16 * RATE_SHUSSHOGO));
  });

  it('対象期間内の休業が14日に満たないと支給されない', () => {
    // 11/18開始なら対象期間との重なりは13日
    const r = calcIkujiKyugyo(input({ leaveStart: d('2026-11-18') }));
    expect(r.shusshogo.overlapDays).toBe(SHUSSHOGO_MIN_LEAVE_DAYS - 1);
    expect(r.shusshogo.shortOfMinDays).toBe(true);
    expect(r.shusshogo.applied).toBe(false);
    expect(r.totalShusshogo).toBe(0);
  });

  it('育休が対象期間より後に始まると1日も付かない', () => {
    const r = calcIkujiKyugyo(input({ leaveStart: d('2026-12-01') }));
    expect(r.shusshogo.overlapDays).toBe(0);
    expect(r.totalShusshogo).toBe(0);
  });

  it('「対象にならない」と答えたら13%を足さない', () => {
    const r = calcIkujiKyugyo(input({ shusshogo: 'no' }));
    expect(r.shusshogo.applied).toBe(false);
    expect(r.totalShusshogo).toBe(0);
    expect(r.periods[0].total).toBe(201_000);
  });

  it('「わからない」は付く前提で計算し、申告として区別できる', () => {
    const r = calcIkujiKyugyo(input({ shusshogo: 'unknown' }));
    expect(r.shusshogo.answer).toBe('unknown');
    expect(r.shusshogo.applied).toBe(true);
    expect(r.totalShusshogo).toBe(36_400);
  });

  it('出産した本人は産後休業のぶん対象期間が後ろに伸びる', () => {
    // 産後休業明け（出生日+57日）から育休に入っても28日ぶん受け取れる。
    // 8週間で切ると0日になってしまうところ
    const r = calcIkujiKyugyo(
      input({
        birthDate: d('2026-12-09'),
        parent: 'mother',
        leaveStart: d('2027-02-04'),
      }),
    );
    expect(r.shusshogo.days).toBe(SHUSSHOGO_MAX_DAYS);
    expect(r.totalShusshogo).toBe(36_400);

    // 同じ日程でも産後休業をしない親の8週間の窓では1日も重ならない
    const partner = calcIkujiKyugyo(
      input({ birthDate: d('2026-12-09'), parent: 'partner', leaveStart: d('2027-02-04') }),
    );
    expect(partner.shusshogo.days).toBe(0);
  });

  it('13%が付くのは最初の支給単位期間だけで、2期目以降は67%に戻る', () => {
    const r = calcIkujiKyugyo(input());
    expect(r.periods[0].shusshogoDays).toBe(28);
    expect(r.periods.slice(1).every((p) => p.shusshogoDays === 0)).toBe(true);
    expect(r.periods[1].total).toBe(201_000);
  });
});

describe('合計と内訳の整合', () => {
  it('合計は支給単位期間の合計と一致する', () => {
    const r = calcIkujiKyugyo(input({ totalWage6m: wage6m(432_100) }));
    expect(r.totalIkuji).toBe(r.periods.reduce((s, p) => s + p.ikuji, 0));
    expect(r.totalShusshogo).toBe(r.periods.reduce((s, p) => s + p.shusshogo, 0));
    expect(r.total).toBe(r.totalIkuji + r.totalShusshogo);
    expect(r.firstPeriodTotal).toBe(r.periods[0].total);
  });

  /**
   * 出生後休業支援給付金は一次情報では「賃金日額 × 日数 × 13%」の一括計算。
   * 期間ごとに切り捨てると1円ずれうるので、累計から差し引く形にしてある。
   */
  it('出生後休業支援給付金の合計は一括計算と1円もずれない', () => {
    for (const monthly of [301_111, 432_100, 199_999, 587_654]) {
      const r = calcIkujiKyugyo(input({ totalWage6m: wage6m(monthly) }));
      expect(r.totalShusshogo).toBe(Math.floor(r.wage.value * r.shusshogo.days * RATE_SHUSSHOGO));
    }
  });

  it('支給日数の合計は67%の日数と50%の日数の合計', () => {
    const r = calcIkujiKyugyo(input({ leaveMonths: 12 }));
    expect(r.payDays).toBe(r.days67 + r.days50);
  });

  it('端数は1円未満切り捨て（円未満を表示に持ち込まない）', () => {
    const r = calcIkujiKyugyo(input({ totalWage6m: wage6m(301_111) }));
    for (const p of r.periods) {
      expect(Number.isInteger(p.ikuji)).toBe(true);
      expect(Number.isInteger(p.shusshogo)).toBe(true);
    }
    expect(Number.isInteger(r.total)).toBe(true);
  });
});

describe('入力が壊れていても落ちない', () => {
  it('終了日が開始日より前でも1期間として扱う', () => {
    const r = calcIkujiKyugyo(input({ leaveEnd: d('2026-09-01') }));
    expect(r.periods).toHaveLength(1);
    expect(r.leaveDays).toBe(1);
  });

  it('取得期間が0ヶ月でも1ヶ月として扱う', () => {
    const r = calcIkujiKyugyo(input({ leaveMonths: 0 }));
    expect(r.periods).toHaveLength(1);
  });
});
