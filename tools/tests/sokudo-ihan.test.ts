import { describe, expect, it } from 'vitest';
import {
  FINE_BANDS,
  ROADS,
  VEHICLES,
  fineFor,
  isNotAllowed,
  judge,
  pointsFor,
  seikatsuHayami,
  speedLimit,
  violationArea,
  type Area,
  type JudgeInput,
  type RoadId,
  type VehicleId,
} from '@/lib/sokudo-ihan';

/** 生活道路・普通車・施行後・50km/h */
const base: JudgeInput = {
  road: 'seikatsu',
  vehicle: 'ordinary',
  expresswayClass: 'standard',
  date: '2026-10-17',
  speedKmh: 50,
  signArea: 'general',
};

function ok(input: Partial<JudgeInput>) {
  const r = judge({ ...base, ...input });
  if (r.kind !== 'ok') throw new Error(`ok ではない: ${r.kind}`);
  return r;
}

describe('speedLimit（制限速度）', () => {
  it('④ 生活道路は 2026-09-01 から 30km/h（前日までは 60km/h）', () => {
    expect(speedLimit('seikatsu', 'ordinary', null, '2026-08-31')).toBe(60);
    expect(speedLimit('seikatsu', 'ordinary', null, '2026-09-01')).toBe(30);
  });

  it('② ③ は 60km/h のまま', () => {
    expect(speedLimit('center-line', 'ordinary', null, '2026-10-17')).toBe(60);
    expect(speedLimit('divided', 'large', null, '2026-10-17')).toBe(60);
  });

  it('原付は道路の種類にかかわらず 30km/h', () => {
    for (const road of ['seikatsu', 'center-line', 'divided'] as RoadId[]) {
      expect(speedLimit(road, 'moped', null, '2026-08-01')).toBe(30);
    }
  });

  it('① 標識の速度', () => {
    expect(speedLimit('sign', 'ordinary', null, '2026-10-17', 40)).toBe(40);
    expect(speedLimit('sign', 'ordinary', null, '2026-10-17', 80)).toBe(80);
  });

  it('① 標識が 30km/h を超えても原付は 30km/h（標識令 別表第一「最高速度」）', () => {
    expect(speedLimit('sign', 'moped', null, '2026-10-17', 40)).toBe(30);
    expect(speedLimit('sign', 'moped', null, '2026-10-17', 20)).toBe(20);
  });

  it('① 標識の速度が無いと決まらない', () => {
    expect(speedLimit('sign', 'ordinary', null, '2026-10-17')).toBeNull();
    expect(speedLimit('sign', 'ordinary', null, '2026-10-17', 0)).toBeNull();
  });

  it('⑤ 高速自動車国道は区分で 100／90／80km/h', () => {
    expect(speedLimit('expressway', 'ordinary', 'standard', '2026-10-17')).toBe(100);
    expect(speedLimit('expressway', 'large', 'heavy-cargo', '2026-10-17')).toBe(90);
    expect(speedLimit('expressway', 'ordinary', 'tow', '2026-10-17')).toBe(80);
    expect(speedLimit('expressway', 'motorcycle', 'standard', '2026-10-17')).toBe(100);
  });

  it('⑤ 大型貨物・特定中型貨物は 2024-04-01 から 90km/h（前日までは 80km/h）', () => {
    expect(speedLimit('expressway', 'large', 'heavy-cargo', '2024-03-31')).toBe(80);
    expect(speedLimit('expressway', 'large', 'heavy-cargo', '2024-04-01')).toBe(90);
  });

  it('⑤ 区分が未選択なら決まらない', () => {
    expect(speedLimit('expressway', 'large', null, '2026-10-17')).toBeNull();
  });

  it('⑥ 自動車専用道路（標識なし）は 60km/h', () => {
    expect(speedLimit('motorway', 'ordinary', null, '2026-10-17')).toBe(60);
    expect(speedLimit('motorway', 'ordinary', null, '2026-08-01')).toBe(60);
  });
});

describe('通れない組み合わせ', () => {
  it('原付 × ⑤ ⑥・① 高速道路 → 通行できない（数値を返さない）', () => {
    expect(judge({ ...base, vehicle: 'moped', road: 'expressway' })).toEqual({ kind: 'not-allowed' });
    expect(judge({ ...base, vehicle: 'moped', road: 'motorway' })).toEqual({ kind: 'not-allowed' });
    expect(judge({ ...base, vehicle: 'moped', road: 'sign', signKmh: 80, signArea: 'expressway' })).toEqual({
      kind: 'not-allowed',
    });
  });

  it('原付 × ① 一般道路・② ③ ④ は通れる', () => {
    expect(isNotAllowed('sign', 'moped', 'general')).toBe(false);
    for (const road of ['center-line', 'divided', 'seikatsu'] as RoadId[]) {
      expect(isNotAllowed(road, 'moped', 'general')).toBe(false);
    }
  });

  it('原付以外は高速道路を通れる', () => {
    for (const v of ['large', 'ordinary', 'motorcycle'] as VehicleId[]) {
      expect(isNotAllowed('expressway', v, 'general')).toBe(false);
      expect(isNotAllowed('motorway', v, 'general')).toBe(false);
    }
  });

  it('大型車 × ⑤ で高速道路での区分が未選択 → 結果を出さない', () => {
    expect(judge({ ...base, vehicle: 'large', road: 'expressway', expresswayClass: null })).toEqual({
      kind: 'need-class',
    });
  });

  it('原付 × ⑤ は区分の未選択より先に「通れない」を返す', () => {
    expect(judge({ ...base, vehicle: 'moped', road: 'expressway', expresswayClass: null })).toEqual({
      kind: 'not-allowed',
    });
  });
});

describe('violationArea（反則区分）', () => {
  it('① は入力どおり', () => {
    expect(violationArea('sign', 'general')).toBe('general');
    expect(violationArea('sign', 'expressway')).toBe('expressway');
  });

  it('② ③ ④ は一般、⑤ ⑥ は高速', () => {
    for (const road of ['center-line', 'divided', 'seikatsu'] as RoadId[]) {
      expect(violationArea(road, 'expressway')).toBe('general');
    }
    for (const road of ['expressway', 'motorway'] as RoadId[]) {
      expect(violationArea(road, 'general')).toBe('expressway');
    }
  });
});

describe('組み合わせの例（仕様書）', () => {
  it('① 標識 80・高速道路・普通車・115km/h → 35km/h 超過・35,000 円・3 点', () => {
    const r = ok({ road: 'sign', signKmh: 80, signArea: 'expressway', speedKmh: 115 });
    expect(r.violation).toEqual({ excess: 35, yen: 35_000, points: 3 });
  });

  it('① 標識 80・一般道路・普通車・115km/h → 35km/h 超過・赤切符・6 点', () => {
    const r = ok({ road: 'sign', signKmh: 80, signArea: 'general', speedKmh: 115 });
    expect(r.violation).toEqual({ excess: 35, yen: null, points: 6 });
  });

  it('⑥・普通車・95km/h → 35km/h 超過・35,000 円・3 点', () => {
    const r = ok({ road: 'motorway', speedKmh: 95 });
    expect(r.limit).toBe(60);
    expect(r.violation).toEqual({ excess: 35, yen: 35_000, points: 3 });
  });

  it('⑤ 大型貨物・125km/h → 35km/h 超過・40,000 円・3 点', () => {
    const r = ok({ road: 'expressway', vehicle: 'large', expresswayClass: 'heavy-cargo', speedKmh: 125 });
    expect(r.limit).toBe(90);
    expect(r.violation).toEqual({ excess: 35, yen: 40_000, points: 3 });
  });

  it('④ 生活道路・普通車・50km/h → 20km/h 超過・15,000 円・2 点', () => {
    const r = ok({});
    expect(r.limit).toBe(30);
    expect(r.violation).toEqual({ excess: 20, yen: 15_000, points: 2 });
  });

  it('原付 × ① 標識 40・45km/h → 制限は 30km/h で 15km/h 超過', () => {
    const r = ok({ vehicle: 'moped', road: 'sign', signKmh: 40, speedKmh: 45 });
    expect(r.limit).toBe(30);
    expect(r.violation).toEqual({ excess: 15, yen: 7_000, points: 1 });
    expect(r.reason).toContain('原付');
  });
});

describe('くらべる（引下げ前の 60km/h なら）', () => {
  it('④ 生活道路のときだけ返る', () => {
    expect(ok({}).compare).toEqual({ limit: 60, violation: null });
    const others: Partial<JudgeInput>[] = [
      { road: 'sign', signKmh: 40 },
      { road: 'center-line' },
      { road: 'divided' },
      { road: 'expressway' },
      { road: 'motorway' },
    ];
    for (const o of others) expect(ok(o).compare).toBeNull();
  });

  it('80km/h → いまは 50km/h 超過・12 点、引下げ前は 20km/h 超過・15,000 円・2 点', () => {
    const r = ok({ speedKmh: 80 });
    expect(r.violation).toEqual({ excess: 50, yen: null, points: 12 });
    expect(r.compare?.violation).toEqual({ excess: 20, yen: 15_000, points: 2 });
  });

  it('施行前の日付・原付では、前後が同じなので返らない', () => {
    expect(ok({ date: '2026-08-31' }).compare).toBeNull();
    expect(ok({ vehicle: 'moped' }).compare).toBeNull();
  });
});

describe('反則金の境界（普通車）', () => {
  it('一般道路で 14・15・19・20・24・25・29km/h 超過', () => {
    const cases: [number, number][] = [
      [1, 9_000],
      [14, 9_000],
      [15, 12_000],
      [19, 12_000],
      [20, 15_000],
      [24, 15_000],
      [25, 18_000],
      [29, 18_000],
    ];
    for (const [excess, yen] of cases) expect(fineFor('ordinary', 'general', excess)).toBe(yen);
  });

  it('一般道路で 30km/h 以上の超過 → 対象外（赤切符）', () => {
    expect(fineFor('ordinary', 'general', 30)).toBeNull();
    expect(fineFor('ordinary', 'general', 39)).toBeNull();
  });

  it('高速で 30・35・39 → 25,000・35,000・35,000 円、40 → 対象外', () => {
    expect(fineFor('ordinary', 'expressway', 30)).toBe(25_000);
    expect(fineFor('ordinary', 'expressway', 34)).toBe(25_000);
    expect(fineFor('ordinary', 'expressway', 35)).toBe(35_000);
    expect(fineFor('ordinary', 'expressway', 39)).toBe(35_000);
    expect(fineFor('ordinary', 'expressway', 40)).toBeNull();
  });

  it('高速道路でも 30km/h 未満は一般道路と同じ額', () => {
    for (const excess of [1, 15, 20, 25, 29]) {
      expect(fineFor('ordinary', 'expressway', excess)).toBe(fineFor('ordinary', 'general', excess));
    }
  });
});

describe('違反点数', () => {
  it('19 → 1・20 → 2・25 → 3・30（一般）→ 6・30（高速）→ 3・40（高速）→ 6・50 → 12', () => {
    expect(pointsFor('general', 1)).toBe(1);
    expect(pointsFor('general', 19)).toBe(1);
    expect(pointsFor('general', 20)).toBe(2);
    expect(pointsFor('general', 24)).toBe(2);
    expect(pointsFor('general', 25)).toBe(3);
    expect(pointsFor('general', 29)).toBe(3);
    expect(pointsFor('general', 30)).toBe(6);
    expect(pointsFor('general', 49)).toBe(6);
    expect(pointsFor('expressway', 30)).toBe(3);
    expect(pointsFor('expressway', 39)).toBe(3);
    expect(pointsFor('expressway', 40)).toBe(6);
    expect(pointsFor('expressway', 49)).toBe(6);
    expect(pointsFor('general', 50)).toBe(12);
    expect(pointsFor('expressway', 50)).toBe(12);
  });
});

describe('反則金の表（施行令 別表第六・警視庁の一覧表と突き合わせ）', () => {
  /** 警視庁「反則行為の種別及び反則金一覧表」の写し。列は 大型・普通・二輪・原付等 */
  const KEISHICHO: [number, number[]][] = [
    [0, [12_000, 9_000, 7_000, 6_000]],
    [15, [15_000, 12_000, 9_000, 7_000]],
    [20, [20_000, 15_000, 12_000, 10_000]],
    [25, [25_000, 18_000, 15_000, 12_000]],
    [30, [30_000, 25_000, 20_000, 15_000]],
    [35, [40_000, 35_000, 30_000, 20_000]],
  ];
  const ORDER: VehicleId[] = ['large', 'ordinary', 'motorcycle', 'moped'];

  it('6 区分', () => {
    expect(FINE_BANDS.map((b) => b.from)).toEqual(KEISHICHO.map(([from]) => from));
  });

  it('全 24 マスが一致する', () => {
    let cells = 0;
    for (const [from, row] of KEISHICHO) {
      const band = FINE_BANDS.find((b) => b.from === from)!;
      ORDER.forEach((v, i) => {
        expect(band.yen[v], `${band.label} × ${v}`).toBe(row[i]);
        // fineFor からも同じ額が引ける（高速道路の区分は高速で）
        const area: Area = band.expresswayOnly ? 'expressway' : 'general';
        expect(fineFor(v, area, from)).toBe(row[i]);
        cells++;
      });
    }
    expect(cells).toBe(24);
  });
});

describe('速度超過ではないとき', () => {
  it('超過 0 以下 → 違反なし', () => {
    expect(ok({ speedKmh: 30 }).violation).toBeNull();
    expect(ok({ speedKmh: 25 }).violation).toBeNull();
    expect(ok({ speedKmh: 31 }).violation).toEqual({ excess: 1, yen: 9_000, points: 1 });
  });
});

describe('入力の異常値', () => {
  it('速度が整数でない・0 以下', () => {
    expect(judge({ ...base, speedKmh: 0 })).toEqual({ kind: 'error', error: 'speed' });
    expect(judge({ ...base, speedKmh: 50.5 })).toEqual({ kind: 'error', error: 'speed' });
    expect(judge({ ...base, speedKmh: Number.NaN })).toEqual({ kind: 'error', error: 'speed' });
  });

  it('① で標識の速度が無い', () => {
    expect(judge({ ...base, road: 'sign' })).toEqual({ kind: 'error', error: 'sign' });
  });

  it('日付が読めない', () => {
    expect(judge({ ...base, date: '' })).toEqual({ kind: 'error', error: 'date' });
  });
});

describe('なぜその速度か', () => {
  it('④ 施行後・施行前で言い方が変わる', () => {
    expect(ok({}).reason).toBe('中央線の無い一般道路は、2026年9月1日から法定速度30km/hです。');
    expect(ok({ date: '2026-08-31' }).reason).toContain('60km/h');
  });

  it('すべての道路の種類で理由が出る', () => {
    for (const r of ROADS) {
      const input: Partial<JudgeInput> = r.id === 'sign' ? { road: r.id, signKmh: 40 } : { road: r.id };
      expect(ok(input).reason.length).toBeGreaterThan(0);
    }
  });
});

describe('早見表（生活道路・普通車）', () => {
  const rows = seikatsuHayami();

  it('反則金・点数が変わる境目で切る', () => {
    expect(rows.map((r) => r.label)).toEqual([
      '31〜44km/h',
      '45〜49km/h',
      '50〜54km/h',
      '55〜59km/h',
      '60〜79km/h',
      '80km/h以上',
    ]);
  });

  it('値は judge と同じ', () => {
    for (const row of rows) {
      const r = ok({ speedKmh: row.from });
      expect(row.now).toEqual(r.violation);
      expect(row.before).toEqual(r.compare?.violation ?? null);
    }
  });

  it('60km/h 以上は赤切符', () => {
    expect(rows.filter((r) => r.now.yen === null).map((r) => r.from)).toEqual([60, 80]);
  });
});

describe('選択肢の定義', () => {
  it('道路の種類は 6 つ・車の種類は 4 つ', () => {
    expect(ROADS).toHaveLength(6);
    expect(VEHICLES.map((v) => v.id).sort()).toEqual(['large', 'moped', 'motorcycle', 'ordinary']);
  });
});
