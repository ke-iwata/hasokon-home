import { describe, expect, it } from 'vitest';
import {
  adjustmentRate,
  age65Date,
  calcShien,
  classifyIncome,
  CURRENT,
  FISCAL_YEARS,
  FY2026,
  hosokutekiMonthly,
  insuredMonths,
  isBefore19560402,
  izokuMonthly,
  roreiMonthly,
  roundYen,
  shogaiIzokuLimit,
  shogaiMonthly,
  slopePoints,
  startMonthAt65,
  thresholds,
  validate,
  type RoreiResult,
  type ShienInput,
  type ShogaiIzokuResult,
} from '@/lib/nenkin-shien-kyufukin';

/** 昭和31年4月2日以後・昭和16年4月2日以後の典型（分母 480・基準 826,500） */
const AFTER = { year: 1958, month: 6, day: 10 };
/** 昭和31年4月1日以前（分母 480・基準 824,100） */
const BEFORE = { year: 1950, month: 6, day: 10 };
const AS_OF = { year: 2026, month: 10, day: 5 };

const base: ShienInput = {
  kind: 'rorei',
  birth: AFTER,
  asOf: AS_OF,
  pensionIncome: 700_000,
  otherIncome: 0,
  paidMonths: 480,
  exemptFullMonths: 0,
  exemptQuarterMonths: 0,
  household: 'yes',
  dependents: 0,
  children: 1,
};

const rorei = (over: Partial<ShienInput> = {}) => calcShien({ ...base, ...over }) as RoreiResult;
const si = (over: Partial<ShienInput>) => calcShien({ ...base, ...over }) as ShogaiIzokuResult;

describe('端数処理（50銭未満切り捨て・50銭以上切り上げ）', () => {
  it('年金機構の計算例：納付済 240 月 ＋ 免除 60 月 → 2,810 円 ＋ 1,471 円 ＝ 4,281 円', () => {
    const r = roreiMonthly(240, 60, 0, AFTER);
    expect(r).toEqual({ paidPart: 2_810, exemptPart: 1_471, monthly: 4_281 });
  });

  it('roundYen', () => {
    expect(roundYen(4_683.33)).toBe(4_683);
    expect(roundYen(5_479.5)).toBe(5_480);
    expect(roundYen(5_479.49)).toBe(5_479);
  });
});

describe('老齢の月額', () => {
  it('480 月納付・所得 0 → 5,620 円（年 67,440 円）', () => {
    const r = rorei({ pensionIncome: 0 });
    expect(r.monthly).toBe(5_620);
    expect(r.annual).toBe(67_440);
  });

  it('400 月 → 4,683 円', () => {
    expect(rorei({ paidMonths: 400 }).monthly).toBe(4_683);
  });

  it('昭和15年4月2日〜昭和16年4月1日生まれ・納付済 468 月 → 5,620 円（分母 468）', () => {
    const birth = { year: 1940, month: 10, day: 1 };
    expect(insuredMonths(birth)).toBe(468);
    expect(roreiMonthly(468, 0, 0, birth).monthly).toBe(5_620);
  });

  it('昭和16年4月2日以後生まれ・納付済 468 月 → 5,480 円（分母 480。5,479.5 円を切り上げ）', () => {
    const birth = { year: 1941, month: 4, day: 2 };
    expect(insuredMonths(birth)).toBe(480);
    expect(roreiMonthly(468, 0, 0, birth).monthly).toBe(5_480);
  });

  it('全額免除 480 月 → 11,768 円／1/4 免除 480 月 → 5,884 円', () => {
    expect(rorei({ paidMonths: 0, exemptFullMonths: 480 }).monthly).toBe(11_768);
    expect(rorei({ paidMonths: 0, exemptQuarterMonths: 480 }).monthly).toBe(5_884);
  });

  it('昭和31年4月1日以前生まれの免除単価は 11,734／5,867', () => {
    expect(roreiMonthly(0, 480, 0, BEFORE).monthly).toBe(11_734);
    expect(roreiMonthly(0, 0, 480, BEFORE).monthly).toBe(5_867);
  });
});

describe('被保険者月数（分母）', () => {
  it('昭和16年4月1日生まれは 468、4月2日生まれは 480', () => {
    expect(insuredMonths({ year: 1941, month: 4, day: 1 })).toBe(468);
    expect(insuredMonths({ year: 1941, month: 4, day: 2 })).toBe(480);
  });

  it('昭和14年4月2日〜昭和15年4月1日生まれは 456', () => {
    expect(insuredMonths({ year: 1939, month: 4, day: 2 })).toBe(456);
    expect(insuredMonths({ year: 1940, month: 3, day: 31 })).toBe(456);
  });

  it('大正15年4月2日〜昭和2年4月1日生まれは 300。それより前も 300 で数える', () => {
    expect(insuredMonths({ year: 1926, month: 4, day: 2 })).toBe(300);
    expect(insuredMonths({ year: 1925, month: 1, day: 1 })).toBe(300);
  });
});

describe('昭和31年4月1日の前後', () => {
  it('4月1日生まれは以前、4月2日生まれは以後', () => {
    expect(isBefore19560402({ year: 1956, month: 4, day: 1 })).toBe(true);
    expect(isBefore19560402({ year: 1956, month: 4, day: 2 })).toBe(false);
  });

  it('基準額と免除単価が切り替わる', () => {
    expect(thresholds(false)).toEqual({ base: 826_500, supplementCap: 926_500, exemptFull: 11_768, exemptQuarter: 5_884 });
    expect(thresholds(true)).toEqual({ base: 824_100, supplementCap: 924_100, exemptFull: 11_734, exemptQuarter: 5_867 });
    expect(rorei({ birth: { year: 1956, month: 4, day: 1 }, pensionIncome: 826_500 }).incomeClass).toBe('hosokuteki');
    expect(rorei({ birth: { year: 1956, month: 4, day: 2 }, pensionIncome: 826_500 }).incomeClass).toBe('rorei');
  });
});

describe('所得の区分（崖ではなく坂）', () => {
  it('826,500 → 老齢／826,501 → 補足的／926,500 → 補足的（率 0）／926,501 → 対象外', () => {
    expect(classifyIncome(826_500, false)).toBe('rorei');
    expect(classifyIncome(826_501, false)).toBe('hosokuteki');
    expect(adjustmentRate(826_501, false)).toBeCloseTo(0.99999, 5);
    expect(classifyIncome(926_500, false)).toBe('hosokuteki');
    expect(adjustmentRate(926_500, false)).toBe(0);
    expect(classifyIncome(926_501, false)).toBe('over');
  });

  it('補足的：所得 876,500・480 月 → 率 0.5 で 2,810 円', () => {
    const r = rorei({ pensionIncome: 876_500 });
    expect(r.incomeClass).toBe('hosokuteki');
    expect(r.rate).toBe(0.5);
    expect(r.monthly).toBe(2_810);
    expect(hosokutekiMonthly(480, 876_500, AFTER)).toBe(2_810);
  });

  it('補足的には免除に基づく額が無い', () => {
    expect(rorei({ pensionIncome: 826_501, paidMonths: 240, exemptFullMonths: 240 }).monthly).toBe(2_810);
  });

  it('補足的・所得 926,500 → 月額 0 円（率 0 の文面）', () => {
    const r = rorei({ pensionIncome: 926_500 });
    expect(r.incomeClass).toBe('hosokuteki');
    expect(r.monthly).toBe(0);
    expect(r.zeroReason).toBe('rate-zero');
  });

  it('老齢・納付済 0・免除 480 → 11,768 円／補足的・納付済 0・免除 480 → 0 円（納付済が無い文面）', () => {
    expect(rorei({ paidMonths: 0, exemptFullMonths: 480 }).monthly).toBe(11_768);
    const r = rorei({ paidMonths: 0, exemptFullMonths: 480, pensionIncome: 850_000 });
    expect(r.monthly).toBe(0);
    expect(r.zeroReason).toBe('no-paid');
  });

  it('対象外なら月額 0・理由は付かない', () => {
    const r = rorei({ pensionIncome: 1_000_000 });
    expect(r.incomeClass).toBe('over');
    expect(r.monthly).toBe(0);
    expect(r.zeroReason).toBeNull();
  });

  it('年金収入とその他の所得を足して判定する', () => {
    expect(rorei({ pensionIncome: 800_000, otherIncome: 30_000 }).incomeClass).toBe('hosokuteki');
  });
});

describe('所得の軸と世帯の軸は別の値', () => {
  it('所得 0・世帯「分からない」→ rorei ＋ unknown（所得の区分は消えない）', () => {
    const r = rorei({ pensionIncome: 0, household: 'unknown' });
    expect(r.incomeClass).toBe('rorei');
    expect(r.household).toBe('unknown');
    expect(r.monthly).toBe(5_620);
  });

  it('世帯「いいえ」でも所得の区分と月額は残る（画面で「対象外の見込み」を足す）', () => {
    const r = rorei({ household: 'no' });
    expect(r.incomeClass).toBe('rorei');
    expect(r.household).toBe('no');
  });
});

describe('障害・遺族', () => {
  it('障害2級・扶養 0・所得 4,918,000 → 対象／4,918,001 → 超えている', () => {
    expect(si({ kind: 'shogai2', otherIncome: 4_918_000 }).withinLimit).toBe(true);
    expect(si({ kind: 'shogai2', otherIncome: 4_918_000 }).monthly).toBe(5_620);
    const over = si({ kind: 'shogai2', otherIncome: 4_918_001 });
    expect(over.withinLimit).toBe(false);
    expect(over.monthly).toBe(0);
  });

  it('世帯の非課税・年金収入は障害・遺族の判定に効かない', () => {
    const a = si({ kind: 'shogai2', household: 'no', pensionIncome: 9_000_000, otherIncome: 0 });
    expect(a.withinLimit).toBe(true);
    expect('household' in a).toBe(false);
  });

  it('扶養親族 1 人で 38 万円の加算', () => {
    expect(shogaiIzokuLimit(0)).toBe(4_918_000);
    expect(shogaiIzokuLimit(2)).toBe(5_678_000);
    expect(si({ kind: 'izoku', otherIncome: 5_298_000, dependents: 1 }).withinLimit).toBe(true);
  });

  it('障害1級 → 7,025 円・2級 → 5,620 円', () => {
    expect(shogaiMonthly(1)).toBe(7_025);
    expect(shogaiMonthly(2)).toBe(5_620);
    expect(si({ kind: 'shogai1' }).monthly).toBe(7_025);
  });

  it('遺族・子 2 人 → 2,810 円（子 3 人は 1,873 円）', () => {
    expect(si({ kind: 'izoku', children: 2 }).monthly).toBe(2_810);
    expect(izokuMonthly(3)).toBe(1_873);
  });
});

describe('65 歳', () => {
  it('65 歳に達する日は誕生日の前日。翌月分から', () => {
    expect(age65Date({ year: 1961, month: 11, day: 15 })).toEqual({ year: 2026, month: 11, day: 14 });
    expect(startMonthAt65({ year: 1961, month: 11, day: 15 })).toBe('2026-12');
  });

  it('1日生まれは前月に達するので、誕生月から', () => {
    expect(startMonthAt65({ year: 1961, month: 12, day: 1 })).toBe('2026-12');
    expect(startMonthAt65({ year: 1962, month: 1, day: 1 })).toBe('2027-01');
  });

  it('基準日に 65 歳に達しているか', () => {
    expect(rorei({ birth: { year: 1961, month: 10, day: 6 } }).is65).toBe(true); // 10/5 に達する
    expect(rorei({ birth: { year: 1961, month: 10, day: 7 } }).is65).toBe(false);
  });
});

describe('入力の検証', () => {
  it('月数の合計 481（分母 480）→ エラー', () => {
    expect(validate({ ...base, paidMonths: 400, exemptFullMonths: 81 })).toHaveLength(1);
    expect(validate({ ...base, paidMonths: 400, exemptFullMonths: 80 })).toEqual([]);
  });

  it('分母 468 の人は 469 でエラー', () => {
    expect(validate({ ...base, birth: { year: 1940, month: 10, day: 1 }, paidMonths: 469 })).toHaveLength(1);
  });

  it('負数・小数の月数、未来の生年月日、子 0 人はエラー', () => {
    expect(validate({ ...base, paidMonths: -1 })).not.toEqual([]);
    expect(validate({ ...base, paidMonths: 1.5 })).not.toEqual([]);
    expect(validate({ ...base, pensionIncome: -1 })).not.toEqual([]);
    expect(validate({ ...base, birth: { year: 2030, month: 1, day: 1 } })).not.toEqual([]);
    expect(validate({ ...base, kind: 'izoku', children: 0 })).not.toEqual([]);
  });

  it('障害・遺族では月数を見ない', () => {
    expect(validate({ ...base, kind: 'shogai1', paidMonths: 999 })).toEqual([]);
  });
});

describe('坂の図', () => {
  it('基準額までは平ら、上限で 0、その先も 0', () => {
    const pts = slopePoints(480, 0, 0, AFTER);
    const at = (x: number) => pts.find((p) => p.income === x)!.monthly;
    expect(at(800_000)).toBe(5_620);
    expect(at(826_500)).toBe(5_620);
    expect(at(826_501)).toBe(5_620);
    expect(at(875_000)).toBe(2_894); // 5,620 × 0.515 ＝ 2,894.3
    expect(at(926_500)).toBe(0);
    expect(at(940_000)).toBe(0);
    // 単調に減る（増えない）
    for (let i = 1; i < pts.length; i++) expect(pts[i].monthly).toBeLessThanOrEqual(pts[i - 1].monthly);
  });
});

describe('年度データ', () => {
  it('令和8年度の額', () => {
    expect(CURRENT).toBe(FY2026);
    expect(FY2026.baseAmount).toBe(5_620);
    expect(FY2026.shogai1).toBe(7_025);
  });

  /**
   * 年度ガード：所得基準額は毎年 10 月分から入れ替わる。2027-10-01 を過ぎて
   * 令和9年度（FY2027）のデータが無ければ、古い基準額のまま判定していることになる
   */
  it('2027-10-01 以降は FY2027 のデータがある', () => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (ymd >= '2027-10-01') {
      expect(FISCAL_YEARS.some((fy) => fy.fiscalYear === 2027), '毎年 9 月に翌年度の改定を反映する').toBe(true);
    }
  });
});
