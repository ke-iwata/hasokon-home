import { describe, expect, it } from 'vitest';
import {
  DISTANCE_BANDS,
  DISTANCE_BANDS_BEFORE_2026_04,
  PARKING_CAP,
  TOTAL_CAP,
  calcTsukinTeate,
  distanceLimit,
  monthlyParkingFee,
  type TsukinTeateInput,
} from '@/lib/tsukin-teate';
import {
  AFTER_MAX,
  BEFORE_MAX,
  CASE_A,
  CASE_Q4_2,
  DISTANCE_ROWS,
  PARKING_EXAMPLES,
} from '@/app/tsukin-teate-hikazei/tables';

/**
 * 仕様: docs/features/tsukin-teate-hikazei.md
 * 一次資料: 国税庁「通勤手当の非課税限度額の改正に関するＱ＆Ａ」（令和8年4月）
 */

const base: TsukinTeateInput = {
  mode: 'vehicle',
  distanceKm: 50,
  allowance: 0,
  fare: 0,
  period: 'from-2026-04',
};

const monthlyParking = (amount: number, nearWorkOrStation = true) => ({
  fee: { unit: 'months' as const, amount, months: 1 },
  nearWorkOrStation,
});

describe('国税庁 Q&A の計算例', () => {
  it('ケースA：50km・駐車場 8,000円・支給 40,300円 → 限度額 37,300円・課税 3,000円', () => {
    const r = calcTsukinTeate({ ...base, allowance: 40_300, parking: monthlyParking(8_000) });
    expect(r.distanceLimit).toBe(32_300);
    expect(r.parkingAddition).toBe(5_000);
    expect(r.parkingCapped).toBe(true);
    expect(r.limit).toBe(37_300);
    expect(r.taxableMonthly).toBe(3_000);
  });

  it('ケースB：支給 36,000円 → 全額非課税', () => {
    const r = calcTsukinTeate({ ...base, allowance: 36_000, parking: monthlyParking(8_000) });
    expect(r.limit).toBe(37_300);
    expect(r.taxableMonthly).toBe(0);
    expect(r.nonTaxableMonthly).toBe(36_000);
  });

  it('ケースC：駐車場 4,400円・支給 37,400円 → 限度額 36,700円・課税 700円', () => {
    const r = calcTsukinTeate({ ...base, allowance: 37_400, parking: monthlyParking(4_400) });
    expect(r.parkingAddition).toBe(4_400);
    expect(r.parkingCapped).toBe(false);
    expect(r.limit).toBe(36_700);
    expect(r.taxableMonthly).toBe(700);
  });

  it('ケースD：区分せずに 35,000円 → 全額非課税', () => {
    const r = calcTsukinTeate({ ...base, allowance: 35_000, parking: monthlyParking(4_400) });
    expect(r.limit).toBe(36_700);
    expect(r.taxableMonthly).toBe(0);
  });

  it('ケースE：定期 115,000円＋50km＋駐車場 4,000円・支給 151,300円 → 限度額 150,000円・課税 1,300円', () => {
    const r = calcTsukinTeate({
      ...base,
      mode: 'both',
      fare: 115_000,
      allowance: 151_300,
      parking: monthlyParking(4_000),
    });
    expect(r.sumBeforeCap).toBe(151_300);
    expect(r.totalCapped).toBe(true);
    expect(r.limit).toBe(150_000);
    expect(r.taxableMonthly).toBe(1_300);
  });

  it('Q4-2：会社が駐車場 6,000円を負担＋距離の手当 32,300円 → 課税 1,000円', () => {
    const r = calcTsukinTeate({ ...base, allowance: 32_300 + 6_000, parking: monthlyParking(6_000) });
    expect(r.limit).toBe(37_300);
    expect(r.taxableMonthly).toBe(1_000);
  });
});

describe('駐車場等の料金の月額換算（Q3-3）', () => {
  it('(1) 3か月 24,000円 → 8,000円', () => {
    expect(monthlyParkingFee({ unit: 'months', amount: 24_000, months: 3 })).toBe(8_000);
  });
  it('(2) 1年 79,200円 → 6,600円', () => {
    expect(monthlyParkingFee({ unit: 'years', amount: 79_200, years: 1 })).toBe(6_600);
  });
  it('(2) 2年 168,960円 → 7,040円', () => {
    expect(monthlyParkingFee({ unit: 'years', amount: 168_960, years: 2 })).toBe(7_040);
  });
  it('(3)イ 1か月に実際に払った合計 8,000円 → 8,000円', () => {
    expect(monthlyParkingFee({ unit: 'months', amount: 8_000, months: 1 })).toBe(8_000);
  });
  it('(3)ロ 11枚綴り 1,200円の回数券で 20日 → 2,182円（1円未満切上げ）', () => {
    expect(monthlyParkingFee({ unit: 'per-use', amount: 1_200 / 11, usesPerMonth: 20 })).toBe(2_182);
  });
  it('(3)ハ 1時間 200円 × 8時間 × 20日 → 32,000円', () => {
    expect(monthlyParkingFee({ unit: 'per-use', amount: 200 * 8, usesPerMonth: 20 })).toBe(32_000);
  });
  it('(4) 7日 5,880円 → 年 306,600円 → 25,550円', () => {
    expect(monthlyParkingFee({ unit: 'days', amount: 5_880, days: 7 })).toBe(25_550);
  });
  it('割り切れない月単位は1円未満を切り上げる', () => {
    expect(monthlyParkingFee({ unit: 'months', amount: 10_000, months: 3 })).toBe(3_334);
  });
  it('割り切れる額に割り算の誤差で1円足さない', () => {
    // 0.1 刻みの誤差が乗りやすい値
    expect(monthlyParkingFee({ unit: 'per-use', amount: 110, usesPerMonth: 30 })).toBe(3_300);
  });
  it('0円・期間 0・不正な値は 0', () => {
    expect(monthlyParkingFee({ unit: 'months', amount: 0, months: 1 })).toBe(0);
    expect(monthlyParkingFee({ unit: 'months', amount: 5_000, months: 0 })).toBe(0);
    expect(monthlyParkingFee({ unit: 'years', amount: 5_000, years: -1 })).toBe(0);
    expect(monthlyParkingFee({ unit: 'per-use', amount: 300, usesPerMonth: 0 })).toBe(0);
    expect(monthlyParkingFee({ unit: 'days', amount: Number.NaN, days: 7 })).toBe(0);
  });
});

describe('距離区分の境界', () => {
  it('2.0km は 4,200円・1.9km は 0（全額課税）', () => {
    expect(distanceLimit(2, 'from-2026-04')).toBe(4_200);
    expect(distanceLimit(1.9, 'from-2026-04')).toBe(0);
  });
  it('区分の境目は「以上」側に入る（10.0km は 7,300円・9.9km は 4,200円）', () => {
    expect(distanceLimit(10, 'from-2026-04')).toBe(7_300);
    expect(distanceLimit(9.9, 'from-2026-04')).toBe(4_200);
  });
  it('65.0km は 45,700円・64.9km は 38,700円', () => {
    expect(distanceLimit(65, 'from-2026-04')).toBe(45_700);
    expect(distanceLimit(64.9, 'from-2026-04')).toBe(38_700);
  });
  it('95.0km 以上は 66,400円（上限なし）', () => {
    expect(distanceLimit(95, 'from-2026-04')).toBe(66_400);
    expect(distanceLimit(200, 'from-2026-04')).toBe(66_400);
  });
  it('改正前の表では 55km 以上が一律 38,700円', () => {
    expect(distanceLimit(55, 'before-2026-04')).toBe(38_700);
    expect(distanceLimit(95, 'before-2026-04')).toBe(38_700);
    expect(distanceLimit(54.9, 'before-2026-04')).toBe(32_300);
  });
  it('不正な値は 0', () => {
    expect(distanceLimit(Number.NaN, 'from-2026-04')).toBe(0);
    expect(distanceLimit(-5, 'from-2026-04')).toBe(0);
  });
  it('表は隙間なく連続し、限度額は単調に増える', () => {
    for (const bands of [DISTANCE_BANDS, DISTANCE_BANDS_BEFORE_2026_04]) {
      expect(bands[0].fromKm).toBe(2);
      expect(bands[bands.length - 1].toKm).toBeNull();
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].fromKm).toBe(bands[i - 1].toKm);
        expect(bands[i].limit).toBeGreaterThan(bands[i - 1].limit);
      }
    }
  });
  it('改正で変わったのは 55km 以上だけ', () => {
    for (const km of [2, 10, 15, 25, 35, 45, 54.9]) {
      expect(distanceLimit(km, 'from-2026-04')).toBe(distanceLimit(km, 'before-2026-04'));
    }
  });
});

describe('駐車場の加算が付かない場合', () => {
  it('片道 2km 未満は加算なし（Q3-4）', () => {
    const r = calcTsukinTeate({ ...base, distanceKm: 1.9, allowance: 5_000, parking: monthlyParking(3_000) });
    expect(r.parkingAddition).toBe(0);
    expect(r.parkingExclusion).toBe('under-2km');
    expect(r.limit).toBe(0);
    expect(r.taxableMonthly).toBe(5_000);
  });
  it('自宅付近の駐車場は加算なし（Q2-4）', () => {
    const r = calcTsukinTeate({ ...base, allowance: 40_300, parking: monthlyParking(8_000, false) });
    expect(r.parkingExclusion).toBe('not-eligible-location');
    expect(r.limit).toBe(32_300);
    expect(r.taxableMonthly).toBe(8_000);
  });
  it('改正前の表では加算なし', () => {
    const r = calcTsukinTeate({
      ...base,
      period: 'before-2026-04',
      allowance: 40_300,
      parking: monthlyParking(8_000),
    });
    expect(r.parkingExclusion).toBe('before-reform');
    expect(r.limit).toBe(32_300);
  });
  it('交通機関のみなら駐車場は見ない', () => {
    const r = calcTsukinTeate({ ...base, mode: 'transit', fare: 20_000, allowance: 20_000, parking: monthlyParking(3_000) });
    expect(r.parkingExclusion).toBe('transit-only');
    expect(r.distanceLimit).toBe(0);
    expect(r.limit).toBe(20_000);
  });
  it('駐車場の入力が無ければ none', () => {
    expect(calcTsukinTeate(base).parkingExclusion).toBe('none');
  });
  it('駐車場 5,000円ちょうどは頭打ちにならない', () => {
    const r = calcTsukinTeate({ ...base, parking: monthlyParking(PARKING_CAP) });
    expect(r.parkingAddition).toBe(5_000);
    expect(r.parkingCapped).toBe(false);
    expect(r.parkingExclusion).toBeUndefined();
  });
});

describe('150,000円の頭打ちと手段ごとの式', () => {
  it('交通機関のみ：運賃がそのまま限度額（150,000円まで）', () => {
    expect(calcTsukinTeate({ ...base, mode: 'transit', fare: 150_000, allowance: 150_000 }).taxableMonthly).toBe(0);
    const over = calcTsukinTeate({ ...base, mode: 'transit', fare: 180_000, allowance: 180_000 });
    expect(over.limit).toBe(TOTAL_CAP);
    expect(over.totalCapped).toBe(true);
    expect(over.taxableMonthly).toBe(30_000);
  });
  it('併用で合計が 150,000円ちょうどなら頭打ちにならない', () => {
    const r = calcTsukinTeate({ ...base, mode: 'both', fare: 112_700, distanceKm: 50, parking: monthlyParking(5_000) });
    expect(r.sumBeforeCap).toBe(150_000);
    expect(r.totalCapped).toBe(false);
    expect(r.limit).toBe(150_000);
  });
  it('併用で交通用具の区間が片道 2km 未満なら運賃だけで判定（表の⑤⑥から除かれる）', () => {
    const r = calcTsukinTeate({
      ...base,
      mode: 'both',
      distanceKm: 1.5,
      fare: 10_000,
      allowance: 15_000,
      parking: monthlyParking(3_000),
    });
    expect(r.distanceLimit).toBe(0);
    expect(r.parkingAddition).toBe(0);
    expect(r.limit).toBe(10_000);
    expect(r.taxableMonthly).toBe(5_000);
  });
  it('交通用具のみのときは運賃の入力を無視する', () => {
    expect(calcTsukinTeate({ ...base, fare: 50_000 }).limit).toBe(32_300);
  });
});

describe('支給額', () => {
  it('支給額 0 なら課税 0（限度額の早見になる）', () => {
    const r = calcTsukinTeate({ ...base, distanceKm: 70 });
    expect(r.limit).toBe(45_700);
    expect(r.taxableMonthly).toBe(0);
    expect(r.nonTaxableMonthly).toBe(0);
  });
  it('年額は月額の12倍', () => {
    const r = calcTsukinTeate({ ...base, allowance: 40_300, parking: monthlyParking(8_000) });
    expect(r.taxableAnnual).toBe(36_000);
  });
  it('負・不正な支給額は 0 として扱う', () => {
    expect(calcTsukinTeate({ ...base, allowance: -100 }).taxableMonthly).toBe(0);
    expect(calcTsukinTeate({ ...base, allowance: Number.NaN }).taxableMonthly).toBe(0);
  });
});

describe('早見表（tables.ts）', () => {
  it('距離区分の行は改正後の表と一致し、変わった行は 55km 以上の5行', () => {
    expect(DISTANCE_ROWS.map((r) => r.after)).toEqual(DISTANCE_BANDS.map((b) => b.limit));
    expect(DISTANCE_ROWS.filter((r) => r.changed).map((r) => r.label)).toEqual([
      '55km以上65km未満',
      '65km以上75km未満',
      '75km以上85km未満',
      '85km以上95km未満',
      '95km以上',
    ]);
    // 55〜65km は額は同じだが、改正前は「55km以上」の区分に含まれていた
    expect(DISTANCE_ROWS.find((r) => r.label === '55km以上65km未満')?.before).toBe(38_700);
  });
  it('本文の計算例はケースA・Q4-2 の額と一致する', () => {
    expect(CASE_A.result.limit).toBe(37_300);
    expect(CASE_A.result.taxableMonthly).toBe(3_000);
    expect(CASE_Q4_2.distanceAllowance).toBe(32_300);
    expect(CASE_Q4_2.result.taxableMonthly).toBe(1_000);
    expect(BEFORE_MAX).toBe(38_700);
    expect(AFTER_MAX).toBe(66_400);
  });
  it('page.tsx の本文に3桁区切りの額を手で書いていない（metadata の description を除く）', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(
      fileURLToPath(new URL('../app/tsukin-teate-hikazei/page.tsx', import.meta.url)),
      'utf8',
    );
    const body = src.replace(/const description =[\s\S]*?;\n/, '');
    expect(body.match(/\d{1,3}(,\d{3})+円/g) ?? []).toEqual([]);
  });
  it('駐車場料金の換算例は Q3-3 の額と一致する', () => {
    expect(PARKING_EXAMPLES.map((e) => e.monthly)).toEqual([
      8_000, 6_600, 7_040, 8_000, 2_182, 32_000, 25_550,
    ]);
  });
});

describe('既存ページからのリンク（公開前は出さない）', () => {
  it('isPublicTool は stage が public のときだけ true', async () => {
    const { isPublicTool, tools } = await import('@/lib/registry');
    for (const t of tools) expect(isPublicTool(t.slug)).toBe(t.stage === 'public');
    expect(isPublicTool('registry-ni-nai-slug')).toBe(false);
  });

  it('残業代・手取り・年末調整の本文のリンクは isPublicTool で囲まれている', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    for (const slug of ['zangyodai-keisan', 'tedori-keisan', 'nenmatsu-chosei']) {
      const src = readFileSync(fileURLToPath(new URL(`../app/${slug}/page.tsx`, import.meta.url)), 'utf8');
      const links = src.split('href="/tsukin-teate-hikazei/"').length - 1;
      const guards = src.split("isPublicTool('tsukin-teate-hikazei')").length - 1;
      expect(links, slug).toBeGreaterThan(0);
      expect(guards, slug).toBe(links);
    }
  });
});
