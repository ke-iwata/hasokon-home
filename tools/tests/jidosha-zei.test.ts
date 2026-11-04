import { describe, expect, test } from 'vitest';
import {
  DISPLACEMENT_CLASSES,
  EV_SURCHARGE_DECIDED,
  ageBandAt,
  ageBandStart,
  ecoPeriodOn,
  fiscalYearOf,
  inspectionMonths,
  jukaStartFiscalYear,
  juryozei,
  kankyoSeinowariRange,
  proratedOnAcquire,
  refundOnDeregister,
  reiwaLabel,
  shinshaJuryozei,
  shubetsuwari,
  summarize,
  timeline,
  type CarInput,
  type JuryoInput,
} from '@/lib/jidosha-zei';

const futsu = (over: Partial<JuryoInput> = {}): JuryoInput => ({
  kind: 'futsu',
  power: 'gasoline',
  displacementClass: 1,
  firstRegistered: '2020-04',
  weightUnits: 3,
  ecoClass: 'unknown',
  ...over,
});
const kei = (over: Partial<JuryoInput> = {}): JuryoInput =>
  futsu({ kind: 'kei', displacementClass: 0, weightUnits: 1, ...over });

const R8 = 2026;

describe('年度の数え方', () => {
  test('4月で年度が変わる', () => {
    expect(fiscalYearOf('2026-03')).toBe(2025);
    expect(fiscalYearOf('2026-04')).toBe(2026);
    expect(fiscalYearOf('2026-05-01')).toBe(2026);
    expect(reiwaLabel(2026)).toBe('令和8年度');
    expect(reiwaLabel(2019)).toBe('令和元年度');
  });
});

describe('種別割（登録車）：10区分 × 2019-10-01 の前後', () => {
  const before = [29500, 34500, 39500, 45000, 51000, 58000, 66500, 76500, 88000, 111000];
  const after = [25000, 30500, 36000, 43500, 50000, 57000, 65500, 75500, 87000, 110000];
  test.each(DISPLACEMENT_CLASSES.map((c) => [c.id, c.label]))('%i %s', (id) => {
    // 2019-09（境目の前日 2019-09-30 を含む月）と 2019-10（2019-10-01）
    const b = shubetsuwari(futsu({ displacementClass: id, firstRegistered: '2019-09' }), R8);
    const a = shubetsuwari(futsu({ displacementClass: id, firstRegistered: '2019-10' }), R8);
    expect(b).toMatchObject({ status: 'standard', yen: before[id] });
    expect(a).toMatchObject({ status: 'standard', yen: after[id] });
  });

  test('公開条件の期待値：1.5L・2019年10月以後・ガソリンは 30,500円', () => {
    expect(shubetsuwari(futsu({ firstRegistered: '2020-01' }), R8).yen).toBe(30500);
  });

  test('EV・FCV は排気量によらず1L以下の区分', () => {
    expect(shubetsuwari(futsu({ power: 'ev', displacementClass: 9, firstRegistered: '2021-06' }), R8).yen).toBe(25000);
    expect(shubetsuwari(futsu({ power: 'ev', displacementClass: 5, firstRegistered: '2018-06' }), R8).yen).toBe(29500);
  });

  test('PHEV は排気量の区分', () => {
    expect(shubetsuwari(futsu({ power: 'phev', displacementClass: 2, firstRegistered: '2021-06' }), R8).yen).toBe(36000);
  });

  test('登録した年度は通知が来ない（月割で納める）・登録前の年度は課税なし', () => {
    expect(shubetsuwari(futsu({ firstRegistered: '2026-06' }), R8).status).toBe('first-year');
    expect(shubetsuwari(futsu({ firstRegistered: '2026-06' }), 2025).status).toBe('not-registered');
  });

  test('令和10年度以後に新規登録する EV は「未定」', () => {
    const r = shubetsuwari(futsu({ power: 'ev', firstRegistered: '2028-04' }), 2029);
    expect(r).toMatchObject({ status: 'undecided', yen: null });
    expect(shubetsuwari(futsu({ power: 'ev', firstRegistered: '2028-03' }), 2029).status).not.toBe('undecided');
  });

  test('令和10年度以後は見直しの可能性の印', () => {
    expect(shubetsuwari(futsu(), 2027).mayChange).toBe(false);
    expect(shubetsuwari(futsu(), 2028).mayChange).toBe(true);
  });
});

describe('グリーン化特例（翌年度分だけ概ね75%軽減）', () => {
  test('EV：2025-04〜2028-03 の登録の翌年度だけ 6,500円', () => {
    expect(shubetsuwari(futsu({ power: 'ev', firstRegistered: '2025-04' }), 2026)).toMatchObject({
      status: 'green',
      yen: 6500,
    });
    expect(shubetsuwari(futsu({ power: 'ev', firstRegistered: '2025-04' }), 2027).yen).toBe(25000);
    expect(shubetsuwari(futsu({ power: 'ev', firstRegistered: '2025-03' }), 2025).status).toBe('standard');
    expect(shubetsuwari(futsu({ power: 'ev', firstRegistered: '2028-03' }), 2028).status).toBe('green');
  });
  test('PHEV 2.0L は 9,000円、軽の EV は 2,700円', () => {
    expect(shubetsuwari(futsu({ power: 'phev', displacementClass: 2, firstRegistered: '2026-01' }), 2026).yen).toBe(9000);
    expect(shubetsuwari(kei({ power: 'ev', firstRegistered: '2026-01' }), 2026).yen).toBe(2700);
  });
  test('ガソリン・ハイブリッドは対象外', () => {
    expect(shubetsuwari(futsu({ firstRegistered: '2026-01' }), 2026).status).toBe('standard');
    expect(shubetsuwari(futsu({ power: 'hybrid', firstRegistered: '2026-01' }), 2026).status).toBe('standard');
  });
});

describe('重課が始まる年度（附則12条の3：登録の年度＋14、軽油は＋12）', () => {
  const start = (car: CarInput) => {
    const r = jukaStartFiscalYear(car);
    if (r.kind !== 'start') throw new Error('exempt');
    return r;
  };

  test('年度の境目（3月・4月）：2013-03 → 令和8年度、2013-04 → 令和9年度', () => {
    expect(start(futsu({ firstRegistered: '2013-03' })).fiscalYear).toBe(2026);
    expect(start(futsu({ firstRegistered: '2013-04' })).fiscalYear).toBe(2027);
  });

  test('暦年の境目（12月・1月）：2012-12 と 2013-01 はどちらも令和8年度', () => {
    expect(start(futsu({ firstRegistered: '2012-12' })).fiscalYear).toBe(2026);
    expect(start(futsu({ firstRegistered: '2013-01' })).fiscalYear).toBe(2026);
  });

  test('公開条件の期待値：2012年4月登録の 2.0L は令和8年度から 45,400円', () => {
    const car = futsu({ displacementClass: 2, firstRegistered: '2012-04' });
    expect(start(car)).toMatchObject({ fiscalYear: 2026, yen: 45400, statutory: true, standardYen: 39500 });
    expect(shubetsuwari(car, 2026)).toMatchObject({ status: 'juka', yen: 45400 });
    expect(shubetsuwari(car, 2025)).toMatchObject({ status: 'standard', yen: 39500 });
  });

  test('宮城県の表：平成24年度登録 → 令和8年度、平成22年度 → 令和6年度', () => {
    expect(start(futsu({ firstRegistered: '2012-04' })).fiscalYear).toBe(2026);
    expect(start(futsu({ firstRegistered: '2011-03' })).fiscalYear).toBe(2024);
  });

  test('重課後の額（附則12条の4 3項）', () => {
    const juka = [33900, 39600, 45400, 51700, 58600, 66700, 76400, 87900, 101200, 127600];
    for (const c of DISPLACEMENT_CLASSES) {
      expect(start(futsu({ displacementClass: c.id, firstRegistered: '2010-05' })).yen).toBe(juka[c.id]);
    }
  });

  test('ディーゼルは 11 年超（登録の年度＋12）', () => {
    expect(start(futsu({ power: 'diesel', firstRegistered: '2015-03' })).fiscalYear).toBe(2026);
    expect(start(futsu({ power: 'diesel', firstRegistered: '2015-04' })).fiscalYear).toBe(2027);
    expect(start(futsu({ power: 'diesel', firstRegistered: '2015-04' })).years).toBe(11);
  });

  test('ハイブリッド・EV・PHEV は重課なし', () => {
    for (const power of ['hybrid', 'ev', 'phev'] as const) {
      expect(jukaStartFiscalYear(futsu({ power, firstRegistered: '2005-01' })).kind).toBe('exempt');
      expect(shubetsuwari(futsu({ power, firstRegistered: '2005-01' }), R8).status).toBe('standard');
    }
    expect(jukaStartFiscalYear(kei({ power: 'hybrid', firstRegistered: '2005-01' })).kind).toBe('exempt');
    expect(jukaStartFiscalYear(kei({ power: 'ev', firstRegistered: '2005-01' })).kind).toBe('exempt');
  });

  test('現行の条文の対象（ガソリン 2015-03 まで・軽油 2017-03 まで）より後は見込み', () => {
    expect(start(futsu({ firstRegistered: '2015-03' })).statutory).toBe(true);
    expect(start(futsu({ firstRegistered: '2015-04' })).statutory).toBe(false);
    expect(start(futsu({ power: 'diesel', firstRegistered: '2017-03' })).statutory).toBe(true);
    expect(start(futsu({ power: 'diesel', firstRegistered: '2017-04' })).statutory).toBe(false);
    expect(shubetsuwari(futsu({ firstRegistered: '2016-05' }), 2030).status).toBe('juka-projected');
  });

  test('2019-10 以後の登録車は重課後の額が条文に無い', () => {
    const car = futsu({ firstRegistered: '2019-10' });
    expect(start(car)).toMatchObject({ fiscalYear: 2033, yen: null });
    expect(shubetsuwari(car, 2033)).toMatchObject({ status: 'juka-undetermined', yen: 30500 });
  });
});

describe('軽自動車税（種別割）', () => {
  test('2015-04 以後に最初の検査 10,800円、それより前 7,200円', () => {
    expect(shubetsuwari(kei({ firstRegistered: '2015-03' }), R8).yen).toBe(7200);
    expect(shubetsuwari(kei({ firstRegistered: '2015-04' }), R8).yen).toBe(10800);
  });

  test('13年超（附則30条：指定の月から14年を経過した月の属する年度）は 12,900円', () => {
    expect(jukaStartFiscalYear(kei({ firstRegistered: '2013-03' }))).toMatchObject({ fiscalYear: 2026, yen: 12900 });
    expect(jukaStartFiscalYear(kei({ firstRegistered: '2013-04' }))).toMatchObject({ fiscalYear: 2027 });
    expect(jukaStartFiscalYear(kei({ firstRegistered: '2012-12' }))).toMatchObject({ fiscalYear: 2026 });
    expect(jukaStartFiscalYear(kei({ firstRegistered: '2013-01' }))).toMatchObject({ fiscalYear: 2026 });
    expect(shubetsuwari(kei({ firstRegistered: '2013-03' }), R8)).toMatchObject({ status: 'juka', yen: 12900 });
    expect(shubetsuwari(kei({ firstRegistered: '2013-04' }), R8)).toMatchObject({ status: 'standard', yen: 7200 });
  });

  test('2003-10-14 前の指定は「その年の12月」から数える', () => {
    // 2002-01 → 2002-12 から14年 → 2016-12 → 平成28年度
    expect(jukaStartFiscalYear(kei({ firstRegistered: '2002-01' }))).toMatchObject({ fiscalYear: 2016 });
  });

  test('軽は月割なし：登録した年度は課税なし', () => {
    expect(shubetsuwari(kei({ firstRegistered: '2026-05' }), R8).status).toBe('first-year');
  });
});

describe('重量税', () => {
  test('公開条件の期待値：1.2t（0.5t×3）・エコカー外・13年以内は 2年 24,600円', () => {
    const r = juryozei(futsu({ firstRegistered: '2020-04' }), '2027-04');
    expect(r).toMatchObject({ yen: 24600, rate: 'normal', assumedNonEco: true });
  });

  test('車検の月：初回は3年、以後2年ごと', () => {
    expect(inspectionMonths('2020-04', '2026-11', 3)).toEqual(['2027-04', '2029-04', '2031-04']);
    expect(inspectionMonths('2026-11', '2026-11', 2)).toEqual(['2029-11', '2031-11']);
    expect(inspectionMonths('2020-04', '2027-04', 1)).toEqual(['2027-04']);
  });

  test('13年の境目：登録から 12年11か月の月から（H11.6 登録 → H24.5 から）', () => {
    expect(ageBandStart('futsu', '1999-06', 'over13')).toBe('2012-05');
    expect(ageBandAt('futsu', '2013-06', '2026-04')).toBe('under13');
    expect(ageBandAt('futsu', '2013-06', '2026-05')).toBe('over13');
    expect(juryozei(futsu({ firstRegistered: '2013-06' }), '2026-05')).toMatchObject({ rate: 'over13', yen: 11400 * 3 });
  });

  test('18年の境目：17年11か月の月から 12,600円／0.5t', () => {
    expect(ageBandAt('futsu', '2008-06', '2026-04')).toBe('over13');
    expect(ageBandAt('futsu', '2008-06', '2026-05')).toBe('over18');
    expect(juryozei(futsu({ firstRegistered: '2008-06' }), '2026-05').yen).toBe(12600 * 3);
  });

  test('軽：初度検査の年から13年（18年）たった年の12月から', () => {
    expect(ageBandAt('kei', '2013-01', '2026-11')).toBe('under13');
    expect(ageBandAt('kei', '2013-12', '2026-12')).toBe('over13');
    expect(ageBandAt('kei', '2008-03', '2026-12')).toBe('over18');
    expect(juryozei(kei({ firstRegistered: '2020-04' }), '2027-04').yen).toBe(6600);
    expect(juryozei(kei({ firstRegistered: '2013-01' }), '2027-01').yen).toBe(8200);
    expect(juryozei(kei({ firstRegistered: '2008-01' }), '2027-01').yen).toBe(8800);
  });

  test('エコカーは本則（2年 5,000円／0.5t）で、経年の重課もない', () => {
    expect(juryozei(futsu({ ecoClass: 'cut50' }), '2027-04')).toMatchObject({ rate: 'honsoku', yen: 15000 });
    expect(juryozei(futsu({ ecoClass: 'honsoku', firstRegistered: '2008-01' }), '2027-01').rate).toBe('honsoku');
  });

  test('ガソリン車の「免税」は初回の継続車検で 125% 以上なら免税の印', () => {
    const r = juryozei(futsu({ ecoClass: 'exempt' }), '2023-04');
    expect(r).toMatchObject({ rate: 'honsoku', maybeExempt125: true });
  });

  test('EV・PHEV：初回の継続車検は免税、以後は本則', () => {
    expect(juryozei(futsu({ power: 'ev', firstRegistered: '2024-01' }), '2027-01')).toMatchObject({ rate: 'exempt', yen: 0 });
    expect(juryozei(futsu({ power: 'phev', firstRegistered: '2020-01' }), '2025-01')).toMatchObject({
      rate: 'honsoku',
      yen: 15000,
    });
  });

  test('EV・PHEV の 2028-05-01 以後の車検：既販車の最初の1回は免除、その次からは未定', () => {
    expect(EV_SURCHARGE_DECIDED).toBe(false);
    const ev = futsu({ power: 'ev', firstRegistered: '2021-06' });
    // 継続車検は 2024-06, 2026-06, 2028-06, 2030-06
    expect(juryozei(ev, '2026-06').evSurcharge).toBe('none');
    expect(juryozei(ev, '2028-06').evSurcharge).toBe('exempt-first');
    expect(juryozei(ev, '2030-06')).toMatchObject({ evSurcharge: 'undecided', evSurchargeYen: null });
    // 施行日の前月と当月
    const ev2 = futsu({ power: 'ev', firstRegistered: '2021-04' });
    expect(juryozei(ev2, '2028-04').evSurcharge).toBe('none');
    const ev3 = futsu({ power: 'ev', firstRegistered: '2021-05' });
    expect(juryozei(ev3, '2028-05').evSurcharge).toBe('exempt-first');
    // 施行後に買った新車は最初の継続車検からかかる
    expect(juryozei(futsu({ power: 'ev', firstRegistered: '2028-05' }), '2031-05').evSurcharge).toBe('undecided');
    // ガソリン車にはかからない
    expect(juryozei(futsu(), '2029-04').evSurcharge).toBe('none');
  });
});

describe('エコカー減税（新車の新規検査・3年分）', () => {
  test('期間の境目（日付は文字列で比べる）', () => {
    expect(ecoPeriodOn('2026-04-30')?.id).toBe('r7');
    expect(ecoPeriodOn('2026-05-01')?.id).toBe('r8a');
    expect(ecoPeriodOn('2027-04-30')?.id).toBe('r8a');
    expect(ecoPeriodOn('2027-05-01')?.id).toBe('r8b');
    expect(ecoPeriodOn('2028-04-30')?.id).toBe('r8b');
    expect(ecoPeriodOn('2028-05-01')).toBeNull();
    expect(ecoPeriodOn('2025-04-30')).toBeNull();
  });

  test('区分ごとの額（1.5t：本則 22,500円、当分の間 36,900円）', () => {
    const on = '2026-06-01';
    expect(shinshaJuryozei(futsu({ ecoClass: 'none' }), on).yen).toBe(36900);
    expect(shinshaJuryozei(futsu({ ecoClass: 'exempt' }), on).yen).toBe(0);
    expect(shinshaJuryozei(futsu({ ecoClass: 'cut75' }), on).yen).toBe(5600);
    expect(shinshaJuryozei(futsu({ ecoClass: 'cut50' }), on).yen).toBe(11200);
    expect(shinshaJuryozei(futsu({ ecoClass: 'cut25' }), on).yen).toBe(16800);
  });

  test('2026-05〜2027-04 には本則の区分が無い（エコカー外で計算）', () => {
    expect(shinshaJuryozei(futsu({ ecoClass: 'honsoku' }), '2026-05-01')).toMatchObject({
      classUnavailable: true,
      yen: 36900,
    });
    expect(shinshaJuryozei(futsu({ ecoClass: 'honsoku' }), '2027-05-01')).toMatchObject({
      classUnavailable: false,
      yen: 22500,
    });
    expect(shinshaJuryozei(futsu({ ecoClass: 'cut75' }), '2026-04-30').classUnavailable).toBe(true);
  });

  test('EV は免税、軽は1両あたり', () => {
    expect(shinshaJuryozei(futsu({ power: 'ev' }), '2026-06-01').yen).toBe(0);
    expect(shinshaJuryozei(kei({ ecoClass: 'none' }), '2026-06-01').yen).toBe(9900);
    expect(shinshaJuryozei(kei({ ecoClass: 'cut50' }), '2026-06-01').yen).toBe(3700);
  });
});

describe('月割・還付・環境性能割', () => {
  test('買ったとき：登録の翌月から3月まで（100円未満切捨て）', () => {
    expect(proratedOnAcquire(30500, '2026-10')).toEqual({ months: 5, yen: 12700 });
    expect(proratedOnAcquire(30500, '2026-04')).toEqual({ months: 11, yen: 27900 });
    expect(proratedOnAcquire(30500, '2027-03')).toEqual({ months: 0, yen: 0 });
    expect(proratedOnAcquire(36000, '2027-01')).toEqual({ months: 2, yen: 6000 });
  });

  test('抹消したとき：抹消した月まで課税、残りが戻る', () => {
    expect(refundOnDeregister(39500, '2026-09')).toEqual({ months: 6, yen: 39500 - 19700 });
    expect(refundOnDeregister(39500, '2027-03')).toEqual({ months: 0, yen: 0 });
    expect(refundOnDeregister(36000, '2026-04')).toEqual({ months: 11, yen: 33000 });
  });

  test('環境性能割は 0〜3%（軽 0〜2%）の幅', () => {
    expect(kankyoSeinowariRange('futsu', 3_000_000)).toEqual({ maxRate: 3, maxYen: 90000 });
    expect(kankyoSeinowariRange('kei', 1_800_500)).toEqual({ maxRate: 2, maxYen: 36000 });
  });
});

describe('まとめ・推移', () => {
  test('1.5L・2020年登録・1.2t のガソリン車：1年あたり 30,500＋12,300', () => {
    const r = summarize(futsu(), '2026-11-04');
    if (r.kind !== 'ok') throw new Error(r.error);
    expect(r.summary.shubetsu.yen).toBe(30500);
    expect(r.summary.next).toMatchObject({ inspection: '2027-04', yen: 24600 });
    expect(r.summary.perYear).toBe(42800);
    expect(r.summary.yearsToJuka).toBe(8); // 2020年度＋14＝2034年度、今年度は2026年度
  });

  test('重課まであと何年度（すでに重課なら null）', () => {
    const r = summarize(futsu({ firstRegistered: '2013-04', displacementClass: 2 }), '2026-11-04');
    if (r.kind !== 'ok') throw new Error(r.error);
    expect(r.summary.yearsToJuka).toBe(1);
    const r2 = summarize(futsu({ firstRegistered: '2012-04', displacementClass: 2 }), '2026-11-04');
    if (r2.kind !== 'ok') throw new Error(r2.error);
    expect(r2.summary.yearsToJuka).toBeNull();
    expect(r2.summary.shubetsu.yen).toBe(45400);
  });

  test('入力の誤り', () => {
    expect(summarize(futsu({ firstRegistered: '' }), '2026-11-04')).toEqual({ kind: 'error', error: 'registered' });
    expect(summarize(futsu({ firstRegistered: '2026-12' }), '2026-11-04')).toEqual({ kind: 'error', error: 'future' });
    expect(summarize(futsu({ weightUnits: 9 }), '2026-11-04')).toEqual({ kind: 'error', error: 'weight' });
    expect(summarize(futsu({ displacementClass: 10 }), '2026-11-04')).toEqual({ kind: 'error', error: 'displacement' });
    // EV と軽は排気量・重量を見ない
    expect(summarize(futsu({ power: 'ev', displacementClass: 10 }), '2026-11-04').kind).toBe('ok');
    expect(summarize(kei({ weightUnits: 9 }), '2026-11-04').kind).toBe('ok');
  });

  test('10年の推移：重課の年度から額が上がり、車検の年に重量税が載る', () => {
    const rows = timeline(futsu({ firstRegistered: '2013-04', displacementClass: 2 }), 2026);
    expect(rows).toHaveLength(10);
    expect(rows[0].shubetsu.yen).toBe(39500);
    expect(rows[1].shubetsu.yen).toBe(45400);
    // 継続車検は 2026-04（済）, 2028-04, 2030-04 …（2013-04 から3年、以後2年ごと）
    expect(rows.flatMap((r) => r.inspections.map((i) => i.inspection))).toEqual([
      '2026-04',
      '2028-04',
      '2030-04',
      '2032-04',
      '2034-04',
    ]);
    expect(rows[0].inspections[0].rate).toBe('over13');
    expect(rows[6].inspections[0].rate).toBe('over18');
  });
});
