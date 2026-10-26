import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/date-parts';
import {
  COMPARE_UNTIL,
  MENZEITEN,
  STANDARD_RATE_PERMIL,
  TITLE_NENDO,
  ZANZON_RITSU,
  assess,
  compareKaisei,
  defaultNendo,
  excluded,
  filingDeadline,
  menzeiten,
  schedule,
  selectableNendos,
  showCompareOpen,
  solarLikelyTaxable,
  valuation,
  type AssetRow,
} from '@/lib/shokyaku-shisanzei';

/** 課税標準がちょうど base になる1行（前年中取得・耐用年数2年で base / 0.658 を逆算せず、5%の下限で作る） */
function rowsWithBase(base: number, nendo: number): AssetRow[] {
  // 取得価額の5%が評価額になる（耐用年数2年を十分前に取得）。base は 1,000 円単位
  return [{ cost: base * 20, acquired: { year: nendo - 15, month: 6 }, life: 2, treatment: 'normal' }];
}

describe('減価残存率（固定資産評価基準 別表第15）', () => {
  it('2〜50年がすべてある', () => {
    for (let y = 2; y <= 50; y++) expect(ZANZON_RITSU[y], `${y}年`).toBeDefined();
    expect(ZANZON_RITSU[1]).toBeUndefined();
    expect(ZANZON_RITSU[51]).toBeUndefined();
  });

  it('表の値を使い、式（1 − r/2）で作らない（5年は 0.815、11年は 0.905、17年は 0.936）', () => {
    expect(ZANZON_RITSU[5].firstYear).toBe(0.815);
    expect(ZANZON_RITSU[11].firstYear).toBe(0.905);
    expect(ZANZON_RITSU[17].firstYear).toBe(0.936);
  });

  it('耐用年数 2 年・50 年の両端', () => {
    expect(ZANZON_RITSU[2]).toEqual({ r: 0.684, firstYear: 0.658, later: 0.316 });
    expect(ZANZON_RITSU[50]).toEqual({ r: 0.045, firstYear: 0.977, later: 0.955 });
    expect(valuation(1_000_000, { year: 2025, month: 4 }, 2, 2026)).toBe(658_000);
    expect(valuation(1_000_000, { year: 2025, month: 4 }, 2, 2027)).toBe(207_928);
    expect(valuation(1_000_000, { year: 2025, month: 4 }, 50, 2026)).toBe(977_000);
    expect(valuation(1_000_000, { year: 2025, month: 4 }, 50, 2027)).toBe(933_035);
  });

  it('B（前年前取得）は 1 − r と一致する', () => {
    for (let y = 2; y <= 50; y++) {
      const z = ZANZON_RITSU[y];
      expect(Math.round((1 - z.r) * 1000), `${y}年`).toBe(Math.round(z.later * 1000));
    }
  });
});

describe('柏市の例：30万円・耐用年数4年', () => {
  const rows = schedule(300_000, { year: 2020, month: 5 }, 4, 9);

  it('6年分の系列', () => {
    expect(rows.slice(0, 6).map((r) => r.value)).toEqual([234_300, 131_676, 74_001, 41_588, 23_372, 15_000]);
  });

  it('6年目で5%の下限に達し、以後 15,000 円で止まる', () => {
    expect(rows.slice(0, 5).every((r) => !r.atFloor)).toBe(true);
    expect(rows.slice(5).every((r) => r.value === 15_000 && r.atFloor)).toBe(true);
  });

  it('年度は取得の翌年から', () => {
    expect(rows[0].nendo).toBe(2021);
  });
});

describe('東京都主税局の例（令和8年度）', () => {
  const hoso: AssetRow = { name: '舗装路面', cost: 2_700_000, acquired: { year: 2025, month: 9 }, life: 15, treatment: 'normal' };
  const osetsu: AssetRow = { name: '応接セット', cost: 500_000, acquired: { year: 2024, month: 11 }, life: 8, treatment: 'normal' };
  const kanban: AssetRow = { name: '看板', cost: 1_655_300, acquired: { year: 2024, month: 2 }, life: 3, treatment: 'normal' };

  it('舗装路面は前年中取得の1年目', () => {
    expect(valuation(hoso.cost, hoso.acquired, hoso.life, 2026)).toBe(2_508_300);
    expect(valuation(hoso.cost, hoso.acquired, hoso.life, 2025)).toBe(0);
  });

  it('応接セット・看板は前年度の評価額 ×（1 − r）の経路（令和7年度 → 令和8年度）', () => {
    expect(valuation(osetsu.cost, osetsu.acquired, osetsu.life, 2025)).toBe(437_500);
    expect(valuation(osetsu.cost, osetsu.acquired, osetsu.life, 2026)).toBe(328_125);
    expect(valuation(kanban.cost, kanban.acquired, kanban.life, 2025)).toBe(1_211_679);
    expect(valuation(kanban.cost, kanban.acquired, kanban.life, 2026)).toBe(562_219);
  });

  it('評価額の合計 3,398,644 円・課税標準 3,398,000 円・税額 47,500 円（計算上 47,572 円）', () => {
    const a = assess([hoso, osetsu, kanban], 2026);
    expect(a.totalValue).toBe(3_398_644);
    expect(a.taxBase).toBe(3_398_000);
    expect(a.taxBeforeRounding).toBe(47_572);
    expect(a.tax).toBe(47_500);
    expect(a.taxable).toBe(true);
  });
});

describe('神戸市の例：70万円・5年（前年中取得）', () => {
  it('570,500 円（表の 0.815。0.8155 なら 570,850 円になる）', () => {
    expect(valuation(700_000, { year: 2025, month: 7 }, 5, 2026)).toBe(570_500);
  });
});

describe('免税点（地方税法351条・令和8年法律第2号）', () => {
  it('令和8年度までは150万円、令和9年度から180万円', () => {
    expect(menzeiten(2025)).toBe(1_500_000);
    expect(menzeiten(2026)).toBe(1_500_000);
    expect(menzeiten(2027)).toBe(1_800_000);
    expect(menzeiten(2030)).toBe(1_800_000);
    expect(MENZEITEN[0]).toEqual({ fromNendo: 2027, yen: 1_800_000 });
  });

  it('課税標準 1,799,000 円 → 令和9年度は非課税', () => {
    const a = assess(rowsWithBase(1_799_000, 2027), 2027);
    expect(a.taxBase).toBe(1_799_000);
    expect(a.taxable).toBe(false);
    expect(a.tax).toBe(0);
  });

  it('課税標準 1,800,000 円 → 令和9年度は課税で 25,200 円（ちょうどは課税）', () => {
    const a = assess(rowsWithBase(1_800_000, 2027), 2027);
    expect(a.taxBase).toBe(1_800_000);
    expect(a.taxable).toBe(true);
    expect(a.tax).toBe(25_200);
  });

  it('課税標準 1,500,000 円 → 令和8年度は課税で 21,000 円、令和9年度は非課税', () => {
    const b = assess(rowsWithBase(1_500_000, 2026), 2026);
    expect(b.taxBase).toBe(1_500_000);
    expect(b.taxable).toBe(true);
    expect(b.tax).toBe(21_000);
    const a = assess(rowsWithBase(1_500_000, 2027), 2027);
    expect(a.taxBase).toBe(1_500_000);
    expect(a.taxable).toBe(false);
  });

  it('課税標準 1,499,000 円 → 令和8年度も非課税', () => {
    const b = assess(rowsWithBase(1_499_000, 2026), 2026);
    expect(b.taxBase).toBe(1_499_000);
    expect(b.taxable).toBe(false);
  });

  it('改正で「かからない」に変わる人を拾う', () => {
    // 2016年取得の 2 年資産は 2026・2027 年度とも 5% の下限 → 課税標準 1,600,000 円
    const c = compareKaisei(rowsWithBase(1_600_000, 2027));
    expect(c.before.taxBase).toBe(1_600_000);
    expect(c.after.taxBase).toBe(1_600_000);
    expect(c.before.tax).toBe(22_400);
    expect(c.after.tax).toBe(0);
    expect(c.becomesExempt).toBe(true);
    expect(compareKaisei(rowsWithBase(2_000_000, 2027)).becomesExempt).toBe(false);
  });
});

describe('少額資産（地方税法施行令49条）', () => {
  it('10万円未満の全額経費・一括償却は外れ、40万円未満の特例は外れない', () => {
    expect(excluded('shogaku')).toBe(true);
    expect(excluded('ikkatsu')).toBe(true);
    expect(excluded('tokurei')).toBe(false);
    expect(excluded('normal')).toBe(false);
  });

  it('99,999 円の全額経費・199,999 円の一括償却は外し、399,999 円の特例は含める', () => {
    const acquired = { year: 2026, month: 5 };
    const a = assess(
      [
        { cost: 99_999, acquired, life: 4, treatment: 'shogaku' },
        { cost: 199_999, acquired, life: 4, treatment: 'ikkatsu' },
        { cost: 399_999, acquired, life: 4, treatment: 'tokurei' },
      ],
      2027,
    );
    expect(a.rows.map((r) => r.status)).toEqual(['excluded', 'excluded', 'included']);
    expect(a.totalValue).toBe(Math.floor((399_999 * 781) / 1000));
  });

  it('上限を超える額で全額経費を選んでも申告に載せ、食い違いを知らせる', () => {
    const a = assess([{ cost: 150_000, acquired: { year: 2026, month: 5 }, life: 4, treatment: 'shogaku' }], 2027);
    expect(a.rows[0].status).toBe('included');
    expect(a.rows[0].treatmentMismatch).toBe(true);
  });

  it('その年度の1月1日にまだ持っていない物（取得がその年以後。1月の取得を含む）は数えない', () => {
    const a = assess([{ cost: 500_000, acquired: { year: 2027, month: 1 }, life: 4, treatment: 'normal' }], 2027);
    expect(a.rows[0].status).toBe('notYet');
    expect(a.totalValue).toBe(0);
  });

  it('入力が足りない行は invalid', () => {
    const a = assess([{ cost: 0, acquired: { year: 2026, month: 5 }, life: 4, treatment: 'normal' }], 2027);
    expect(a.rows[0].status).toBe('invalid');
    expect(assess([{ cost: 1000, acquired: { year: 2026, month: 5 }, life: 1, treatment: 'normal' }], 2027).rows[0].status).toBe(
      'invalid',
    );
  });
});

describe('税率と端数（千分率の整数・100円未満切捨て）', () => {
  it('1.4% と 2.1%', () => {
    const rows = rowsWithBase(3_398_000, 2027);
    expect(assess(rows, 2027, STANDARD_RATE_PERMIL).tax).toBe(47_500);
    const a = assess(rows, 2027, 21);
    expect(a.taxBeforeRounding).toBe(71_358);
    expect(a.tax).toBe(71_300);
  });
});

describe('申告期限（地方税法383条・20条の5第2項）', () => {
  it('令和9年度は 2027-02-01（2027-01-31 が日曜）', () => {
    expect(formatDate(filingDeadline(2027))).toBe('2027-02-01');
  });
  it('令和8年度は 2026-02-02（2026-01-31 が土曜）', () => {
    expect(formatDate(filingDeadline(2026))).toBe('2026-02-02');
  });
  it('平日ならそのまま（令和10年度 2028-01-31 は月曜）', () => {
    expect(formatDate(filingDeadline(2028))).toBe('2028-01-31');
  });
});

describe('年度の決め方', () => {
  it('defaultNendo：申告期限までその暦年、過ぎたら翌暦年', () => {
    expect(defaultNendo('2026-10-20')).toBe(2027);
    expect(defaultNendo('2027-01-15')).toBe(2027);
    expect(defaultNendo('2027-02-01')).toBe(2027);
    expect(defaultNendo('2027-02-02')).toBe(2028);
  });

  it('selectableNendos：令和8年度〜既定の年度', () => {
    expect(selectableNendos('2026-10-20')).toEqual([2026, 2027]);
    expect(selectableNendos('2027-02-02')).toEqual([2026, 2027, 2028]);
  });

  it('比較を開いて出すのは COMPARE_UNTIL まで', () => {
    expect(COMPARE_UNTIL).toBe('2027-06-30');
    expect(showCompareOpen('2027-06-30')).toBe(true);
    expect(showCompareOpen('2027-07-01')).toBe(false);
  });

  it('TITLE_NENDO が今日の既定の年度と一致する（申告期限の翌日以降に落ちて知らせる）', () => {
    const now = defaultNendo(new Date());
    expect(
      now,
      `既定の年度が令和${now - 2018}年度になりました。tools/lib/shokyaku-shisanzei.ts の TITLE_NENDO を ${now} に上げ、` +
        'registry の updatedAt と DATA_CHECKED_AT を直してください。免税点・税率の改正がないかも確かめること',
    ).toBe(TITLE_NENDO);
  });
});

describe('太陽光の案内（断定しない）', () => {
  it('住宅用 10kW 未満は対象外の場合が多く、10kW 以上・事業用は対象の場合が多い', () => {
    expect(solarLikelyTaxable(5, 'jutaku')).toBe(false);
    expect(solarLikelyTaxable(10, 'jutaku')).toBe(true);
    expect(solarLikelyTaxable(5, 'jigyo')).toBe(true);
  });
});
