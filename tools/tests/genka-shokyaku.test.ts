import { describe, expect, it } from 'vitest';
import {
  ASSETS,
  DATA_CHECKED_AT,
  MAX_LIFE,
  MIN_LIFE,
  SOURCES,
  TEIGAKU_RATE,
  TEIRITSU_200,
  annualCap,
  calculate,
  decliningBalance,
  ikkatsuSchedule,
  straightLine,
  tokureiCheck,
  tokureiLimit,
  usedLife,
  type GenkaInput,
  type MethodId,
} from '@/lib/genka-shokyaku';

/** 青色・新品・パソコン・定額法・事業割合100% */
const base: GenkaInput = {
  assetId: 'pc',
  cost: 380_000,
  acquiredOn: '2026-11-10',
  filing: 'aoiro',
};

function ok(input: GenkaInput) {
  const r = calculate(input);
  if (!r.ok) throw new Error(`calculate failed: ${r.error}`);
  return r;
}
const ids = (input: GenkaInput) => ok(input).methods.map((m) => m.id);
const method = (input: GenkaInput, id: MethodId) => {
  const m = ok(input).methods.find((x) => x.id === id);
  if (!m) throw new Error(`${id} not available`);
  return m;
};
const reasonOf = (input: GenkaInput, id: MethodId) => ok(input).unavailable.find((u) => u.id === id)?.reason;
const deps = (rows: { depreciation: number }[]) => rows.map((r) => r.depreciation);

describe('仕様書の検算 15 ケース', () => {
  it('#1 パソコン 380,000円・2026-11-10 取得・青色：特例で今年 380,000円。一括は不可。通常償却も並ぶ', () => {
    const r = ok(base);
    expect(r.primary.id).toBe('tokurei');
    expect(r.primary.thisYearExpense).toBe(380_000);
    expect(r.primary.inShokyakuShisan).toBe(true);
    expect(reasonOf(base, 'ikkatsu')).toBe('over200k');
    // 380,000 × 0.250 × 2/12 = 15,833.3… → 15,833円
    expect(method(base, 'normal').thisYearExpense).toBe(15_833);
    expect(method(base, 'normal').schedule[0].months).toBe(2);
  });

  it('#2 同じで 2026-03-20 取得・3月から：30万円以上なので特例不可。定額法4年', () => {
    const input = { ...base, acquiredOn: '2026-03-20' };
    expect(reasonOf(input, 'tokurei')).toBe('overLimit');
    expect(ok(input).tokureiLimit).toBe(300_000);
    const rows = method(input, 'normal').schedule;
    expect(deps(rows)).toEqual([79_166, 95_000, 95_000, 95_000, 15_833]);
    expect(rows.at(-1)!.endBalance).toBe(1);
    expect(rows[0].months).toBe(10);
  });

  it('#3 取得日 2026-03-31 は不可、2026-04-01 は可（境界）', () => {
    expect(ids({ ...base, acquiredOn: '2026-03-31' })).not.toContain('tokurei');
    expect(ids({ ...base, acquiredOn: '2026-04-01' })).toContain('tokurei');
  });

  it('#4 400,000円ちょうどは不可（「未満」）', () => {
    expect(reasonOf({ ...base, cost: 400_000, acquiredOn: '2026-05-01' }, 'tokurei')).toBe('overLimit');
  });

  it('#5 既使用 2,800,000円＋この物 380,000円 > 300万円：この物には特例を使えない（一部だけの適用はしない）', () => {
    const input = { ...base, tokureiUsedThisYear: 2_800_000 };
    expect(reasonOf(input, 'tokurei')).toBe('overCap');
    expect(ok(input).primary.id).toBe('normal');
  });

  it('#6 パソコン 250,000円・白色・2026-07 から：定額法4年で 31,250／62,500×3／31,249、合計 249,999円', () => {
    const input: GenkaInput = { ...base, cost: 250_000, acquiredOn: '2026-07-01', filing: 'shiro' };
    expect(ids(input)).toEqual(['normal']);
    expect(reasonOf(input, 'tokurei')).toBe('shiro');
    const rows = method(input, 'normal').schedule;
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(deps(rows)).toEqual([31_250, 62_500, 62_500, 62_500, 31_249]);
    expect(deps(rows).reduce((a, b) => a + b, 0)).toBe(249_999);
  });

  it('#7 150,000円・副業の雑所得：特例不可、一括償却は 3 年間 50,000円ずつ（月割しない）', () => {
    const input: GenkaInput = { ...base, cost: 150_000, acquiredOn: '2026-12-20', filing: 'zatsu' };
    expect(reasonOf(input, 'tokurei')).toBe('zatsu');
    const ik = method(input, 'ikkatsu');
    expect(deps(ik.schedule)).toEqual([50_000, 50_000, 50_000]);
    expect(ik.thisYearExpense).toBe(50_000);
    expect(ik.inShokyakuShisan).toBe(false);
    expect(ok(input).primary.id).toBe('ikkatsu');
  });

  it('#8 180,000円・青色：特例（償却資産税に載る）／一括 60,000円×3（載らない）／通常償却 の3つ', () => {
    const input = { ...base, cost: 180_000 };
    expect(ids(input)).toEqual(['tokurei', 'ikkatsu', 'normal']);
    expect(method(input, 'tokurei').thisYearExpense).toBe(180_000);
    expect(method(input, 'tokurei').inShokyakuShisan).toBe(true);
    expect(deps(method(input, 'ikkatsu').schedule)).toEqual([60_000, 60_000, 60_000]);
    expect(method(input, 'ikkatsu').inShokyakuShisan).toBe(false);
    expect(method(input, 'normal').inShokyakuShisan).toBe(true);
  });

  it('#9 99,999円・白色：全額 99,999円（どの申告でも）', () => {
    for (const filing of ['aoiro', 'shiro', 'zatsu'] as const) {
      const r = ok({ ...base, cost: 99_999, filing });
      expect(r.methods.map((m) => m.id)).toEqual(['shogaku']);
      expect(r.primary.thisYearExpense).toBe(99_999);
      expect(r.primary.inShokyakuShisan).toBe(false);
    }
  });

  it('#10 中古の普通自動車・前の持ち主 4 年・1,200,000円・2026-10 から・事業割合 70%', () => {
    const input: GenkaInput = {
      assetId: 'car',
      cost: 1_200_000,
      acquiredOn: '2026-10-05',
      filing: 'aoiro',
      usedElapsedMonths: 48,
      businessRatio: 70,
    };
    const r = ok(input);
    expect(r.legalYears).toBe(6);
    expect(r.life).toBe(2);
    const rows = method(input, 'normal').schedule;
    expect(rows[0].rate).toBe(0.5);
    expect(deps(rows)).toEqual([150_000, 600_000, 449_999]);
    expect(rows.map((x) => x.expense)).toEqual([105_000, 420_000, 314_999]);
    // 未償却残高は償却費の全額で減らす（経費にした部分だけではない）
    expect(rows.map((x) => x.endBalance)).toEqual([1_050_000, 450_000, 1]);
  });

  it('#11 中古の軽自動車・前の持ち主 5 年：全部経過 4 × 0.2 = 0.8 → 最低 2 年', () => {
    expect(usedLife(4, 60)).toBe(2);
    expect(ok({ ...base, assetId: 'kei', cost: 500_000, usedElapsedMonths: 60 }).life).toBe(2);
  });

  it('#12 定率法 1,000,000円・5 年・1 月から：4 年目に改定償却率へ切り替わり 108,000、5 年目 107,999', () => {
    const rows = decliningBalance(1_000_000, 5, 2026, 1);
    expect(deps(rows)).toEqual([400_000, 240_000, 144_000, 108_000, 107_999]);
    expect(rows.map((r) => !!r.revised)).toEqual([false, false, false, true, true]);
    expect(rows[3].base).toBe(216_000);
    expect(rows.at(-1)!.endBalance).toBe(1);
  });

  it('#13 定額法 1,000,000円・10 年・1 月から（国税庁 No.2106 の例）：1〜9 年目 100,000、10 年目 99,999', () => {
    const rows = straightLine(1_000_000, 10, 2026, 1);
    expect(deps(rows)).toEqual([...Array(9).fill(100_000), 99_999]);
  });

  it('#14 税抜 370,000円なら特例可、税込 407,000円なら不可（経理方式の違いは入れる額で区別する）', () => {
    expect(ids({ ...base, cost: 370_000, acquiredOn: '2026-06-01' })).toContain('tokurei');
    expect(reasonOf({ ...base, cost: 407_000, acquiredOn: '2026-06-01' }, 'tokurei')).toBe('overLimit');
  });

  it('#15 2026-08 開業・青色：年の上限 3,000,000 × 5／12 = 1,250,000円', () => {
    expect(annualCap(5)).toBe(1_250_000);
    expect(ok({ ...base, businessMonths: 5 }).annualCap).toBe(1_250_000);
    expect(reasonOf({ ...base, businessMonths: 5, tokureiUsedThisYear: 900_000 }, 'tokurei')).toBe('overCap');
  });
});

describe('別表第八・第十の写し', () => {
  it('2〜50 年の全行がある', () => {
    for (let y = MIN_LIFE; y <= MAX_LIFE; y++) {
      expect(TEIGAKU_RATE[y], `別表第八 ${y}年`).toBeGreaterThan(0);
      expect(TEIRITSU_200[y], `別表第十 ${y}年`).toBeDefined();
    }
    expect(Object.keys(TEIGAKU_RATE)).toHaveLength(49);
    expect(Object.keys(TEIRITSU_200)).toHaveLength(49);
  });

  it('1/n で計算した値と違う行がある（手書きで 1/n にした実装を落とす）', () => {
    const differs = Object.entries(TEIGAKU_RATE)
      .filter(([y, rate]) => Math.round((1 / Number(y)) * 1000) / 1000 !== rate)
      .map(([y]) => Number(y));
    expect(differs).toContain(3); // 0.334（1/3 の丸めは 0.333）
    expect(differs).toContain(9); // 0.112（1/9 の丸めは 0.111）
    expect(TEIGAKU_RATE[3]).toBe(0.334);
    expect(TEIGAKU_RATE[9]).toBe(0.112);
    // 200%定率法の償却率は 2/n の丸めでもない行がある（7年 0.286 は一致、6年 0.333 は一致、ここは定義どおりの値を固定）
    expect(TEIRITSU_200[5]).toEqual({ rate: 0.4, revised: 0.5, guarantee: 0.108 });
    expect(TEIRITSU_200[10]).toEqual({ rate: 0.2, revised: 0.25, guarantee: 0.06552 });
    expect(TEIRITSU_200[50]).toEqual({ rate: 0.04, revised: 0.042, guarantee: 0.0144 });
  });

  it('2 年は改定償却率・保証率が無い（―――）', () => {
    expect(TEIRITSU_200[2]).toEqual({ rate: 1, revised: null, guarantee: null });
    // 1 月から使えば初年に 1 円を残して全額
    expect(deps(decliningBalance(500_000, 2, 2026, 1))).toEqual([499_999]);
    // 7 月からなら 6/12、翌年に残り
    expect(deps(decliningBalance(500_000, 2, 2026, 7))).toEqual([250_000, 249_999]);
  });
});

describe('境界', () => {
  it('取得日 2026-03-31 は上限 30万円、2026-04-01 は 40万円', () => {
    expect(tokureiLimit('2026-03-31')).toBe(300_000);
    expect(tokureiLimit('2026-04-01')).toBe(400_000);
  });

  it('特例の期限：2029-03-31 までは可、2029-04-01 からは特例なし', () => {
    expect(tokureiLimit('2029-03-31')).toBe(400_000);
    expect(tokureiLimit('2029-04-01')).toBeNull();
    expect(reasonOf({ ...base, acquiredOn: '2029-04-01' }, 'tokurei')).toBe('expired');
    expect(ids({ ...base, acquiredOn: '2029-03-31' })).toContain('tokurei');
  });

  it('99,999／100,000：10万円ちょうどは全額にならない', () => {
    expect(ids({ ...base, cost: 99_999 })).toEqual(['shogaku']);
    expect(ids({ ...base, cost: 100_000 })).toEqual(['tokurei', 'ikkatsu', 'normal']);
  });

  it('199,999／200,000：20万円ちょうどは一括償却にできない', () => {
    expect(ids({ ...base, cost: 199_999, filing: 'shiro' })).toEqual(['ikkatsu', 'normal']);
    expect(ids({ ...base, cost: 200_000, filing: 'shiro' })).toEqual(['normal']);
  });

  it('399,999／400,000（2026-04-01 以後）', () => {
    expect(ids({ ...base, cost: 399_999 })).toContain('tokurei');
    expect(ids({ ...base, cost: 400_000 })).not.toContain('tokurei');
  });

  it('299,999／300,000（2026-03-31 以前）', () => {
    expect(ids({ ...base, cost: 299_999, acquiredOn: '2026-03-31' })).toContain('tokurei');
    expect(ids({ ...base, cost: 300_000, acquiredOn: '2026-03-31' })).not.toContain('tokurei');
  });

  it('年の枠ちょうど 3,000,000 は可、1 円でも超えたら不可', () => {
    expect(
      tokureiCheck({ cost: 380_000, acquiredOn: '2026-11-10', filing: 'aoiro', tokureiUsedThisYear: 2_620_000 }),
    ).toEqual({ ok: true });
    expect(
      tokureiCheck({ cost: 380_000, acquiredOn: '2026-11-10', filing: 'aoiro', tokureiUsedThisYear: 2_620_001 }),
    ).toEqual({ ok: false, reason: 'overCap' });
  });

  it('開業・廃業の年の月数は 1〜12 に収め、1 か月未満は切上げ', () => {
    expect(annualCap(undefined)).toBe(3_000_000);
    expect(annualCap(12)).toBe(3_000_000);
    expect(annualCap(1)).toBe(250_000);
    expect(annualCap(0.5)).toBe(250_000);
  });
});

describe('中古の耐用年数（簡便法）', () => {
  it('法定 6 年で経過 3 年 9 か月 → 3.00 → 3 年、3 年 10 か月 → 2.93 → 2 年', () => {
    expect(usedLife(6, 45)).toBe(3);
    expect(usedLife(6, 46)).toBe(2);
  });

  it('経過 4 年の普通自動車は 2.8 → 2 年', () => {
    expect(usedLife(6, 48)).toBe(2);
  });

  it('全部経過は 法定 × 20%（10 年 → 2 年、15 年 → 3 年）。最低 2 年', () => {
    expect(usedLife(10, 200)).toBe(2);
    expect(usedLife(15, 180)).toBe(3);
    expect(usedLife(2, 30)).toBe(2);
  });

  it('経過 0 か月は法定どおり（calculate では新品扱い）', () => {
    expect(usedLife(5, 0)).toBe(5);
    expect(ok({ ...base, usedElapsedMonths: 0 }).used).toBe(false);
  });
});

describe('定率法の改定償却率への切り替え（別表第十の保証率どおり）', () => {
  it('5 年：4 年目から', () => {
    expect(decliningBalance(1_000_000, 5, 2026, 1).findIndex((r) => r.revised)).toBe(3);
  });

  it('4 年：4 年目から（3 年目の 125,000 は保証額 124,990 以上）', () => {
    const rows = decliningBalance(1_000_000, 4, 2026, 1);
    expect(deps(rows)).toEqual([500_000, 250_000, 125_000, 124_999]);
    expect(rows.findIndex((r) => r.revised)).toBe(3);
  });

  it('10 年：7 年目から（6 年目の 65,536 は保証額 65,520 以上）', () => {
    const rows = decliningBalance(1_000_000, 10, 2026, 1);
    expect(rows.findIndex((r) => r.revised)).toBe(6);
    expect(deps(rows)).toEqual([200_000, 160_000, 128_000, 102_400, 81_920, 65_536, 65_536, 65_536, 65_536, 65_535]);
  });

  it('初年は月割（10 月から 3 か月分）', () => {
    expect(decliningBalance(1_000_000, 5, 2026, 10)[0].depreciation).toBe(100_000);
  });
});

describe('事業割合', () => {
  it('0% は経費 0 円、償却費と未償却残高は 100% と同じ', () => {
    const zero = method({ ...base, filing: 'shiro', businessRatio: 0 }, 'normal');
    const full = method({ ...base, filing: 'shiro', businessRatio: 100 }, 'normal');
    expect(zero.schedule.every((r) => r.expense === 0)).toBe(true);
    expect(deps(zero.schedule)).toEqual(deps(full.schedule));
    expect(zero.schedule.map((r) => r.endBalance)).toEqual(full.schedule.map((r) => r.endBalance));
  });

  it('未入力は 100%', () => {
    expect(ok(base).businessRatio).toBe(100);
    expect(method(base, 'tokurei').thisYearExpense).toBe(380_000);
  });

  it('特例・全額も事業割合で按分する（判定は取得価額の全額）', () => {
    expect(method({ ...base, businessRatio: 50 }, 'tokurei').thisYearExpense).toBe(190_000);
    expect(method({ ...base, cost: 99_999, businessRatio: 50 }, 'shogaku').thisYearExpense).toBe(49_999);
  });
});

describe('償却方法', () => {
  it('ソフトウエアで定率法を選んでも定額法になる', () => {
    const r = ok({ ...base, assetId: 'software', depMethod: 'teiritsu', filing: 'shiro' });
    expect(r.depMethod).toBe('teigaku');
    expect(r.depMethodForced).toBe(true);
    expect(
      method({ ...base, assetId: 'software', depMethod: 'teiritsu', filing: 'shiro' }, 'normal').schedule[0].rate,
    ).toBe(0.2);
  });

  it('パソコンで定率法を選ぶと別表第十の 4 年（0.500）', () => {
    const r = ok({ ...base, depMethod: 'teiritsu', filing: 'shiro', acquiredOn: '2026-01-10' });
    expect(r.depMethod).toBe('teiritsu');
    expect(
      method({ ...base, depMethod: 'teiritsu', filing: 'shiro', acquiredOn: '2026-01-10' }, 'normal').schedule[0]
        .depreciation,
    ).toBe(190_000);
  });

  it('2012-03-31 以前の取得の定率法（250%）と 2007-03-31 以前の取得（旧定額法）は扱わない', () => {
    expect(calculate({ ...base, depMethod: 'teiritsu', acquiredOn: '2012-03-31' })).toEqual({
      ok: false,
      error: 'teiritsu250',
    });
    expect(calculate({ ...base, acquiredOn: '2007-03-31' })).toEqual({ ok: false, error: 'tooOld' });
    expect(ok({ ...base, acquiredOn: '2007-04-01' }).depMethod).toBe('teigaku');
  });
});

describe('入力の検査', () => {
  it('取得価額 0・小数・不正な日付・使い始めが買う前・耐用年数の範囲外はエラー', () => {
    expect(calculate({ ...base, cost: 0 })).toEqual({ ok: false, error: 'cost' });
    expect(calculate({ ...base, cost: 1.5 })).toEqual({ ok: false, error: 'cost' });
    expect(calculate({ ...base, acquiredOn: '2026-02-30' })).toEqual({ ok: false, error: 'date' });
    expect(calculate({ ...base, startYear: 2026, startMonth: 10 })).toEqual({
      ok: false,
      error: 'startBeforeAcquired',
    });
    expect(calculate({ ...base, assetId: 'other', customYears: 1 })).toEqual({ ok: false, error: 'years' });
    expect(calculate({ ...base, assetId: 'other', customYears: 51 })).toEqual({ ok: false, error: 'years' });
    expect(calculate({ ...base, assetId: 'nope' })).toEqual({ ok: false, error: 'asset' });
  });

  it('使い始めた月が買った月より後なら、月割は使い始めた月から', () => {
    const r = method({ ...base, filing: 'shiro', acquiredOn: '2026-11-10', startYear: 2027, startMonth: 2 }, 'normal');
    expect(r.schedule[0].year).toBe(2027);
    expect(r.schedule[0].months).toBe(11);
  });

  it('その他は耐用年数を直接入れる', () => {
    expect(ok({ ...base, assetId: 'other', customYears: 7, filing: 'shiro' }).life).toBe(7);
  });

  it('令和8年分（2026 年取得）だけ 30万円／40万円の注意を出す', () => {
    expect(ok(base).mixedYearNotice).toBe(true);
    expect(ok({ ...base, acquiredOn: '2027-01-05' }).mixedYearNotice).toBe(false);
  });
});

describe('一括償却の端数', () => {
  it('1/3 で割り切れない額は 3 年目に寄せ、合計が取得価額になる', () => {
    const rows = ikkatsuSchedule(100_001, 2026);
    expect(deps(rows)).toEqual([33_333, 33_333, 33_335]);
    expect(rows.at(-1)!.endBalance).toBe(0);
  });
});

describe('資産の選択肢と出典', () => {
  it('仕様書の耐用年数の表どおり', () => {
    const years = Object.fromEntries(ASSETS.map((a) => [a.id, a.years]));
    expect(years).toEqual({
      pc: 4,
      phone: 10,
      copier: 5,
      camera: 5,
      tv: 5,
      aircon: 6,
      fridge: 6,
      deskMetal: 15,
      deskOther: 8,
      software: 5,
      car: 6,
      kei: 4,
      bike: 3,
      bicycle: 2,
      other: 0,
    });
  });

  it('出典は国税庁・中小企業庁・e-Gov で、確認日がそろっている', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const s of SOURCES) {
      expect(s.url).toMatch(/^https:\/\/(www\.nta\.go\.jp|www\.chusho\.meti\.go\.jp|laws\.e-gov\.go\.jp)\//);
      expect(s.checkedAt).toBe(DATA_CHECKED_AT);
    }
  });
});
