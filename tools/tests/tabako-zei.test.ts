import { describe, expect, it } from 'vitest';
import {
  CONSUMPTION_TAX_RATE,
  DATA_CHECKED_AT,
  DAYS_PER_YEAR,
  DEFAULT_STICKS_PER_PACK,
  HEATED_ALIGNED_FROM,
  HEATED_GRAM_PER_STICK,
  HEATED_STEP1_FROM,
  PHASES,
  PRODUCT_LABEL,
  SAMPLE_PRICES,
  SAVINGS_YEARS,
  estimateSpending,
  formatDate,
  formatYen,
  formatYenDecimal,
  heatedAlignment,
  increases,
  nextPhase,
  packTaxFor,
  phaseAt,
  phaseById,
  phaseIndexAt,
  priceTimeline,
  quitSavings,
  taxPerPack,
  taxPerStick,
  taxPerThousand,
  taxTimeline,
  toYmd,
} from '@/lib/tabako-zei';

/**
 * たばこ値上げ早見表・負担額計算のテスト。
 *
 * 仕様: docs/features/tabako-zei-neage.md
 *
 * このツールで一番こわいのは3つ。
 *
 * 1. **税率表の写し間違い** — 一次資料（財務省・国税庁）から読み取った数値を
 *    そのまま焼き込んで固定する。二次情報を見て書き換えられるのを防ぐため
 * 2. **加熱式たばこの「まだ分からない」を金額で埋めてしまうこと** — 2026年10月1日より前は
 *    製品ごとに税額が違うので undefined を返さなければならない
 * 3. **施行日の判定** — 境界日（4月1日・10月1日）でずれると全部の金額がずれる
 */

const ymd = /^\d{4}-\d{2}-\d{2}$/;

describe('PHASES（税率表）', () => {
  it('現行と3回の引き上げの計4件ある', () => {
    expect(PHASES).toHaveLength(4);
  });

  it('施行日が YYYY-MM-DD 形式で、昇順に並んでいる（phaseAt の前提）', () => {
    const dates = PHASES.map((p) => p.effectiveFrom);
    for (const d of dates) expect(d).toMatch(ymd);
    expect([...dates].sort()).toEqual(dates);
  });

  it('id が重複していない', () => {
    const ids = PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全エントリに一次情報の出典がある（仕様: 出典を明記する）', () => {
    for (const p of PHASES) {
      expect(p.source.url, `${p.label}: 出典URLが無い`).toMatch(/^https:\/\//);
      expect(p.source.url, `${p.label}: 一次情報でない出典`).toMatch(
        /^https:\/\/www\.(mof|nta)\.go\.jp\//,
      );
      expect(p.source.label, `${p.label}: 出典名が空`).not.toBe('');
      expect(p.source.checkedAt, `${p.label}: 確認日の形式`).toMatch(ymd);
    }
  });

  it('データ最終確認日が YYYY-MM-DD 形式', () => {
    expect(DATA_CHECKED_AT).toMatch(ymd);
  });

  /**
   * 現行の内訳を一次資料の数値で固定する。
   * 国6,802円 + たばこ特別税820円 + 道府県1,070円 + 市町村6,552円 = 15,244円/1,000本。
   */
  it('現行の税率の内訳が一次資料どおり（合計15,244円/1,000本）', () => {
    const [current] = PHASES;
    expect(current.effectiveFrom).toBe('2021-10-01');
    expect(current.rates).toEqual({
      national: 6802,
      special: 820,
      prefectural: 1070,
      municipal: 6552,
    });
    expect(taxPerThousand(current.rates)).toBe(15244);
  });

  it('引き上げは国たばこ税のみで、地方たばこ税とたばこ特別税は据え置き', () => {
    for (const p of PHASES) {
      expect(p.rates.special, `${p.label}: たばこ特別税が動いている`).toBe(820);
      expect(p.rates.prefectural, `${p.label}: 道府県たばこ税が動いている`).toBe(1070);
      expect(p.rates.municipal, `${p.label}: 市町村たばこ税が動いている`).toBe(6552);
    }
  });

  it('国たばこ税が1,000本あたり500円（1本0.5円）ずつ3回上がる', () => {
    const national = PHASES.map((p) => p.rates.national);
    expect(national).toEqual([6802, 7302, 7802, 8302]);
    for (let i = 1; i < national.length; i += 1) {
      expect(national[i] - national[i - 1]).toBe(500);
    }
  });

  it('引き上げは2027年・2028年・2029年の各4月1日から', () => {
    expect(PHASES.map((p) => p.effectiveFrom)).toEqual([
      '2021-10-01',
      '2027-04-01',
      '2028-04-01',
      '2029-04-01',
    ]);
  });

  it('合計税額が 15,244 → 15,744 → 16,244 → 16,744円/1,000本 と推移する', () => {
    expect(PHASES.map((p) => taxPerThousand(p.rates))).toEqual([15244, 15744, 16244, 16744]);
  });
});

describe('税額の換算', () => {
  it('1本あたりの税額は現行15.244円、最終的に16.744円', () => {
    expect(taxPerStick(PHASES[0].rates)).toBe(15.244);
    expect(taxPerStick(PHASES[3].rates)).toBe(16.744);
  });

  it('1箱20本あたりのたばこ税は現行304.88円', () => {
    expect(taxPerPack(PHASES[0].rates)).toBe(304.88);
    expect(taxPerPack(PHASES[0].rates, DEFAULT_STICKS_PER_PACK)).toBe(304.88);
  });

  it('1箱20本あたりの税額が10円ずつ上がり、最終的に334.88円になる', () => {
    expect(PHASES.map((p) => taxPerPack(p.rates))).toEqual([304.88, 314.88, 324.88, 334.88]);
  });

  it('1箱の本数を変えると比例する（10本入りは20本入りの半分）', () => {
    expect(taxPerPack(PHASES[0].rates, 10)).toBe(152.44);
    expect(taxPerPack(PHASES[0].rates, 1)).toBe(15.24);
  });
});

describe('phaseAt / phaseIndexAt（施行日の判定）', () => {
  it('施行日当日から新しい税率になる', () => {
    expect(phaseAt('2027-03-31').id).toBe('current');
    expect(phaseAt('2027-04-01').id).toBe('2027-04');
    expect(phaseAt('2028-03-31').id).toBe('2027-04');
    expect(phaseAt('2028-04-01').id).toBe('2028-04');
    expect(phaseAt('2029-03-31').id).toBe('2028-04');
    expect(phaseAt('2029-04-01').id).toBe('2029-04');
  });

  it('最後の引き上げより後はずっと最終の税率', () => {
    expect(phaseAt('2035-12-31').id).toBe('2029-04');
  });

  it('税率表の最初の施行日より前でも現行を返す（過去の履歴は扱わない）', () => {
    expect(phaseAt('2015-01-01').id).toBe('current');
    expect(phaseIndexAt('2015-01-01')).toBe(0);
  });

  it('Date でも文字列でも同じ結果になる', () => {
    expect(phaseAt(new Date(2027, 3, 1)).id).toBe(phaseAt('2027-04-01').id);
    expect(phaseAt(new Date(2027, 2, 31)).id).toBe(phaseAt('2027-03-31').id);
  });

  it('nextPhase は基準日より後の最初の引き上げを返す', () => {
    expect(nextPhase('2026-08-15')?.id).toBe('2027-04');
    expect(nextPhase('2027-04-01')?.id).toBe('2028-04');
    expect(nextPhase('2029-04-01')).toBeUndefined();
  });

  it('phaseById は未登録の id に undefined を返す', () => {
    expect(phaseById('2027-04')?.effectiveFrom).toBe('2027-04-01');
    expect(phaseById('2030-04')).toBeUndefined();
  });

  it('toYmd がゼロ埋めした YYYY-MM-DD を返す', () => {
    expect(toYmd(new Date(2027, 3, 1))).toBe('2027-04-01');
    expect(toYmd(new Date(2026, 9, 1))).toBe('2026-10-01');
  });
});

describe('taxTimeline（早見表）', () => {
  it('現行を基準にすると4行返り、増税額は0・10・20・30円', () => {
    const rows = taxTimeline();
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.risePerPack)).toEqual([0, 10, 20, 30]);
  });

  it('消費税込みの値上げ額は増税額の1.1倍（0・11・22・33円）', () => {
    expect(taxTimeline().map((r) => r.risePerPackWithTax)).toEqual([0, 11, 22, 33]);
    expect(CONSUMPTION_TAX_RATE).toBe(0.1);
  });

  it('基準の区切りを変えると、そこから先だけが返る', () => {
    const rows = taxTimeline(DEFAULT_STICKS_PER_PACK, 1);
    expect(rows.map((r) => r.phase.id)).toEqual(['2027-04', '2028-04', '2029-04']);
    expect(rows.map((r) => r.risePerPack)).toEqual([0, 10, 20]);
  });

  it('1箱の本数に比例して増税額も変わる', () => {
    expect(taxTimeline(10).map((r) => r.risePerPack)).toEqual([0, 5, 10, 15]);
  });
});

describe('priceTimeline（想定小売価格）', () => {
  it('580円の銘柄は 580 → 591 → 602 → 613円になる想定', () => {
    expect(priceTimeline({ basePrice: 580 }).map((r) => r.priceYen)).toEqual([580, 591, 602, 613]);
  });

  it('代表価格帯のどれでも、最終的な上げ幅は33円になる', () => {
    for (const price of SAMPLE_PRICES) {
      const rows = priceTimeline({ basePrice: price });
      expect(rows[0].priceYen, `${price}円: 起点がずれている`).toBe(price);
      expect(rows[3].priceYen! - price, `${price}円: 最終的な上げ幅`).toBe(33);
    }
  });

  it('基準価格を渡さなければ価格を持たない（増税額だけ分かる状態）', () => {
    const rows = priceTimeline();
    for (const row of rows) expect(row.priceYen).toBeUndefined();
    expect(rows.map((r) => r.risePerPackWithTax)).toEqual([0, 11, 22, 33]);
  });

  it('0円や負の価格は基準にしない（priceYen を出さない）', () => {
    expect(priceTimeline({ basePrice: 0 })[0].priceYen).toBeUndefined();
    expect(priceTimeline({ basePrice: -100 })[0].priceYen).toBeUndefined();
  });

  it('2027年4月を起点にすると、そこからの3行になる', () => {
    const rows = priceTimeline({ basePrice: 591, baseIndex: 1 });
    expect(rows.map((r) => r.phase.id)).toEqual(['2027-04', '2028-04', '2029-04']);
    expect(rows.map((r) => r.priceYen)).toEqual([591, 602, 613]);
  });
});

describe('加熱式たばこの課税方式見直し', () => {
  it('見直しは2026年4月1日と2026年10月1日の2段階', () => {
    expect(HEATED_STEP1_FROM).toBe('2026-04-01');
    expect(HEATED_ALIGNED_FROM).toBe('2026-10-01');
    expect(HEATED_GRAM_PER_STICK).toBe(0.35);
  });

  it('第1段階の前・移行期間中・第2段階以降を取り違えない', () => {
    expect(heatedAlignment('2026-03-31')).toMatchObject({ aligned: false, transitional: false });
    expect(heatedAlignment('2026-04-01')).toMatchObject({ aligned: false, transitional: true });
    expect(heatedAlignment('2026-09-30')).toMatchObject({ aligned: false, transitional: true });
    expect(heatedAlignment('2026-10-01')).toMatchObject({ aligned: true, transitional: false });
    expect(heatedAlignment('2027-04-01')).toMatchObject({ aligned: true, transitional: false });
  });

  it('紙巻たばこの1箱の税額は基準日にかかわらず出せる', () => {
    expect(packTaxFor('paper', '2026-08-15')).toBe(304.88);
    expect(packTaxFor('paper', '2027-04-01')).toBe(314.88);
  });

  /**
   * 移行期間中の加熱式は製品の重量と小売定価で税額が決まるため、
   * 銘柄を特定せずに金額を出せない。0 や紙巻と同額で埋めてはいけない。
   */
  it('揃う前の加熱式は税額を出さない（undefined を返す）', () => {
    expect(packTaxFor('heated', '2026-08-15')).toBeUndefined();
    expect(packTaxFor('heated', '2026-09-30')).toBeUndefined();
  });

  it('2026年10月1日以降の加熱式は紙巻と同じ税額になる', () => {
    expect(packTaxFor('heated', '2026-10-01')).toBe(304.88);
    expect(packTaxFor('heated', '2027-04-01')).toBe(packTaxFor('paper', '2027-04-01'));
    expect(packTaxFor('heated', '2029-04-01')).toBe(334.88);
  });

  it('製品の種類に表示名がある', () => {
    expect(PRODUCT_LABEL.paper).toBe('紙巻たばこ');
    expect(PRODUCT_LABEL.heated).toContain('加熱式');
  });
});

describe('estimateSpending（負担額計算）', () => {
  it('1日20本・1箱580円なら年間211,700円（1日580円 × 365日）', () => {
    const s = estimateSpending({ sticksPerDay: 20, pricePerPack: 580 });
    expect(s.daily).toBe(580);
    expect(s.annual).toBe(580 * DAYS_PER_YEAR);
    expect(s.monthly).toBe(Math.round((580 * DAYS_PER_YEAR) / 12));
    expect(s.sticksPerYear).toBe(20 * DAYS_PER_YEAR);
    expect(s.packsPerYear).toBe(365);
  });

  it('本数で按分する（1日10本なら半箱ぶん）', () => {
    const s = estimateSpending({ sticksPerDay: 10, pricePerPack: 580 });
    expect(s.daily).toBe(290);
    expect(s.packsPerYear).toBe(182.5);
  });

  it('年間の税額の内訳が出る（1日20本なら たばこ税111,281円）', () => {
    const s = estimateSpending({ sticksPerDay: 20, pricePerPack: 580 });
    // 15.244円/本 × 7,300本
    expect(s.annualTobaccoTax).toBe(Math.round(15.244 * 20 * DAYS_PER_YEAR));
    // 税込価格の 10/110
    expect(s.annualConsumptionTax).toBe(Math.round((580 * DAYS_PER_YEAR) / 11));
  });

  it('税負担の割合は6割前後（580円の銘柄で）', () => {
    const s = estimateSpending({ sticksPerDay: 20, pricePerPack: 580 });
    expect(s.taxRatioPercent).toBeGreaterThan(55);
    expect(s.taxRatioPercent).toBeLessThan(70);
  });

  it('高い銘柄ほど税負担の割合が下がる（従量税なので税額は変わらない）', () => {
    const cheap = estimateSpending({ sticksPerDay: 20, pricePerPack: 500 });
    const rich = estimateSpending({ sticksPerDay: 20, pricePerPack: 650 });
    expect(cheap.annualTobaccoTax).toBe(rich.annualTobaccoTax);
    expect(cheap.taxRatioPercent).toBeGreaterThan(rich.taxRatioPercent);
  });

  it('増税後の税率を渡すと、たばこ税だけが増える', () => {
    const now = estimateSpending({ sticksPerDay: 20, pricePerPack: 580 });
    const later = estimateSpending({
      sticksPerDay: 20,
      pricePerPack: 580,
      rates: PHASES[3].rates,
    });
    expect(later.annualTobaccoTax).toBeGreaterThan(now.annualTobaccoTax);
    expect(later.annual).toBe(now.annual);
  });

  it('1箱の本数を指定できる（10本入りでも1本あたりの価格で按分する）', () => {
    const s = estimateSpending({ sticksPerDay: 10, pricePerPack: 300, sticksPerPack: 10 });
    expect(s.daily).toBe(300);
  });

  it('0本・0円でも壊れない', () => {
    const zero = estimateSpending({ sticksPerDay: 0, pricePerPack: 580 });
    expect(zero.annual).toBe(0);
    expect(zero.taxRatioPercent).toBe(0);
  });

  it('負の入力は0として扱う', () => {
    const s = estimateSpending({ sticksPerDay: -5, pricePerPack: -100 });
    expect(s.annual).toBe(0);
    expect(s.sticksPerYear).toBe(0);
  });
});

describe('increases（増税による負担増）', () => {
  it('1日20本なら1箱11円・22円・33円の値上げに対応する3行が返る', () => {
    const rows = increases({ sticksPerDay: 20 });
    expect(rows.map((r) => r.phase.id)).toEqual(['2027-04', '2028-04', '2029-04']);
    expect(rows.map((r) => r.perPack)).toEqual([11, 22, 33]);
  });

  it('1日20本（年365箱）なら最終的に年間12,045円の増加', () => {
    const rows = increases({ sticksPerDay: 20 });
    expect(rows[0].annual).toBe(11 * 365);
    expect(rows[2].annual).toBe(33 * 365);
    expect(rows[2].monthly).toBe(Math.round((33 * 365) / 12));
  });

  it('増加0の行（基準の区切り自身）は返さない', () => {
    for (const row of increases({ sticksPerDay: 20 })) {
      expect(row.perPack).toBeGreaterThan(0);
    }
  });

  it('基準の区切りを2027年4月にすると、残り2回ぶんになる', () => {
    const rows = increases({ sticksPerDay: 20, baseIndex: 1 });
    expect(rows.map((r) => r.phase.id)).toEqual(['2028-04', '2029-04']);
    expect(rows.map((r) => r.perPack)).toEqual([11, 22]);
  });

  it('吸う本数が半分なら増加額も半分', () => {
    const full = increases({ sticksPerDay: 20 });
    const half = increases({ sticksPerDay: 10 });
    expect(half[2].annual).toBe(Math.round(full[2].annual / 2));
  });

  it('1箱の本数が0でも落ちない', () => {
    expect(() => increases({ sticksPerDay: 20, sticksPerPack: 0 })).not.toThrow();
  });
});

describe('quitSavings（買わなくなった場合に浮く額）', () => {
  it('既定は1年・5年・10年', () => {
    expect(quitSavings(211700).map((s) => s.years)).toEqual(SAVINGS_YEARS);
  });

  it('年間支出をそのまま年数倍する', () => {
    expect(quitSavings(211700)).toEqual([
      { years: 1, yen: 211700 },
      { years: 5, yen: 1058500 },
      { years: 10, yen: 2117000 },
    ]);
  });

  it('負の年間支出は0として扱う', () => {
    expect(quitSavings(-1000)[0].yen).toBe(0);
  });

  it('年数を指定できる', () => {
    expect(quitSavings(1000, [20])).toEqual([{ years: 20, yen: 20000 }]);
  });
});

describe('表示の整形', () => {
  it('formatYen は3桁区切りで円をつける', () => {
    expect(formatYen(211700)).toBe('211,700円');
    expect(formatYen(0)).toBe('0円');
  });

  it('formatYenDecimal は小数を残しつつ、末尾の0は落とす', () => {
    expect(formatYenDecimal(304.88)).toBe('304.88円');
    expect(formatYenDecimal(15.244, 3)).toBe('15.244円');
    expect(formatYenDecimal(310)).toBe('310円');
    expect(formatYenDecimal(15244)).toBe('15,244円');
    expect(formatYenDecimal(0)).toBe('0円');
  });

  it('formatDate は和文の日付にする', () => {
    expect(formatDate('2027-04-01')).toBe('2027年4月1日');
    expect(formatDate('2026-10-01')).toBe('2026年10月1日');
  });
});
