import { describe, expect, it } from 'vitest';
import {
  JUMIN_NEW,
  JUMIN_OLD,
  SHOTOKU_NEW,
  SHOTOKU_NEW_TOKUREI,
  SHOTOKU_OLD,
  applyTable,
  calcSeimeiHokenryoKojo,
  hasUnder23Tokurei,
  kojoJuminzei,
  kojoShotokuzei,
  nenmatsuHandoffHref,
  parseLifeQuery,
  zeigakuMeyasu,
  type Payments,
} from '@/lib/seimei-hokenryo-kojo';

/**
 * 仕様: docs/features/seimei-hokenryo-kojo.md の「テスト」
 * 表は国税庁 No.1140（令和8年4月1日現在法令等）と地方税法 314条の2
 */

const ZERO: Payments = { ippanNew: 0, ippanOld: 0, kaigo: 0, nenkinNew: 0, nenkinOld: 0 };

describe('所得税・新契約の表の区切り', () => {
  it.each([
    [0, 0],
    [20_000, 20_000],
    [20_001, 20_001], // 20,001 / 2 + 10,000 = 20,000.5 → 切り上げ
    [40_000, 30_000],
    [40_001, 30_001], // 40,001 / 4 + 20,000 = 30,000.25 → 切り上げ
    [80_000, 40_000],
    [80_001, 40_000],
    [1_000_000, 40_000],
  ])('新 %i円 → %i円', (paid, kojo) => {
    expect(applyTable(SHOTOKU_NEW, paid)).toBe(kojo);
  });
});

describe('所得税・旧契約の表の区切り', () => {
  it.each([
    [25_000, 25_000],
    [25_001, 25_001], // 12,500.5 + 12,500 → 切り上げ
    [50_000, 37_500],
    [50_001, 37_501], // 12,500.25 + 25,000 → 切り上げ
    [60_000, 40_000],
    [100_000, 50_000],
    [100_001, 50_000],
  ])('旧 %i円 → %i円', (paid, kojo) => {
    expect(applyTable(SHOTOKU_OLD, paid)).toBe(kojo);
  });
});

describe('所得税・特例（新契約の一般・23歳未満の扶養親族あり）の表の区切り', () => {
  it.each([
    [30_000, 30_000],
    [30_001, 30_001],
    [60_000, 45_000],
    [60_001, 45_001],
    [120_000, 60_000],
    [120_001, 60_000],
  ])('新 %i円 → %i円', (paid, kojo) => {
    expect(applyTable(SHOTOKU_NEW_TOKUREI, paid)).toBe(kojo);
  });
});

describe('住民税の表の区切り', () => {
  it.each([
    [12_000, 12_000],
    [12_001, 12_001],
    [32_000, 22_000],
    [32_001, 22_001],
    [56_000, 28_000],
    [56_001, 28_000],
  ])('新 %i円 → %i円', (paid, kojo) => {
    expect(applyTable(JUMIN_NEW, paid)).toBe(kojo);
  });

  it.each([
    [15_000, 15_000],
    [15_001, 15_001],
    [40_000, 27_500],
    [40_001, 27_501],
    [70_000, 35_000],
    [70_001, 35_000],
  ])('旧 %i円 → %i円', (paid, kojo) => {
    expect(applyTable(JUMIN_OLD, paid)).toBe(kojo);
  });
});

describe('新旧両方ある区分（特例なし）', () => {
  it('旧 6万円ちょうど＋新 → 合算（上限 4万円）', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: false, ippanNew: 10_000, ippanOld: 60_000 });
    expect(r.ippan.amount).toBe(40_000);
    expect(r.ippan.choice).toBe('combined');
  });

  it('旧 6万1円＋新 → 旧だけ（4万円を超える）', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: false, ippanNew: 10_000, ippanOld: 60_001 });
    expect(r.ippan.amount).toBe(40_001);
    expect(r.ippan.choice).toBe('old');
  });

  it('新・旧とも少額なら合算', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: false, ippanNew: 10_000, ippanOld: 10_000 });
    expect(r.ippan.amount).toBe(20_000);
    expect(r.ippan.choice).toBe('combined');
  });

  it('個人年金も同じ採り方（特例は効かない）', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: true, nenkinNew: 50_000, nenkinOld: 70_000 });
    expect(r.nenkin.amount).toBe(42_500);
    expect(r.nenkin.choice).toBe('old');
  });
});

describe('23歳未満の扶養親族がいる場合の特例', () => {
  it('一般の新 12万円 → 特例あり 6万円・なし 4万円', () => {
    expect(kojoShotokuzei({ ...ZERO, under23: true, ippanNew: 120_000 }).ippan.amount).toBe(60_000);
    expect(kojoShotokuzei({ ...ZERO, under23: false, ippanNew: 120_000 }).ippan.amount).toBe(40_000);
  });

  it('旧ありの合算でも上限は 6万円', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: true, ippanNew: 100_000, ippanOld: 100_000 });
    expect(r.ippan.amount).toBe(60_000);
  });

  it('一般・旧 7万円＋新 5万円：「はい」→ 新＋旧の合算で 6万円', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: true, ippanNew: 50_000, ippanOld: 70_000 });
    expect(r.ippan.newOnly).toBe(40_000);
    expect(r.ippan.oldOnly).toBe(42_500);
    expect(r.ippan.amount).toBe(60_000);
    expect(r.ippan.choice).toBe('combined');
  });

  it('同じで「いいえ」→ 旧だけ 4.25万円', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: false, ippanNew: 50_000, ippanOld: 70_000 });
    expect(r.ippan.amount).toBe(42_500);
    expect(r.ippan.choice).toBe('old');
  });

  it('新 0円・旧 7万円 → 特例ありでも 4.25万円（新を払っていなければ合算は効かない）', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: true, ippanOld: 70_000 });
    expect(r.ippan.amount).toBe(42_500);
    expect(r.ippan.choice).toBe('old');
  });

  it('介護医療・個人年金には特例は効かない', () => {
    const r = kojoShotokuzei({ ...ZERO, under23: true, kaigo: 200_000, nenkinNew: 200_000 });
    expect(r.kaigo.amount).toBe(40_000);
    expect(r.nenkin.amount).toBe(40_000);
  });

  it('特例は令和8年分・令和9年分だけ', () => {
    expect(hasUnder23Tokurei(2025)).toBe(false);
    expect(hasUnder23Tokurei(2026)).toBe(true);
    expect(hasUnder23Tokurei(2027)).toBe(true);
    expect(hasUnder23Tokurei(2028)).toBe(false);
  });

  it('令和10年分では「はい」でも一般の上限は 4万円', () => {
    const r = kojoShotokuzei({ ...ZERO, year: 2028, under23: true, ippanNew: 120_000 });
    expect(r.ippan.amount).toBe(40_000);
    expect(r.tokureiApplied).toBe(false);
  });

  it('年分を省くと令和8年分（特例あり）', () => {
    expect(kojoShotokuzei({ ...ZERO, under23: true, ippanNew: 120_000 }).tokureiApplied).toBe(true);
  });
});

describe('3区分の合計の上限', () => {
  const all20: Payments = { ippanNew: 200_000, ippanOld: 200_000, kaigo: 200_000, nenkinNew: 200_000, nenkinOld: 200_000 };

  it('3区分とも20万円 → 所得税 12万円・住民税 7万円', () => {
    const s = kojoShotokuzei({ ...all20, under23: false });
    // 旧が多いので一般・個人年金は旧だけ（5万円）が採られる
    expect(s.ippan.choice).toBe('old');
    expect(s.sum).toBe(50_000 + 40_000 + 50_000);
    expect(s.total).toBe(120_000);
    const j = kojoJuminzei(all20);
    expect(j.ippan.amount).toBe(35_000);
    expect(j.nenkin.amount).toBe(35_000);
    expect(j.sum).toBe(35_000 + 28_000 + 35_000);
    expect(j.total).toBe(70_000);
  });

  it('特例ありでも所得税は 12万円', () => {
    const s = kojoShotokuzei({ ...all20, under23: true });
    expect(s.ippan.amount).toBe(60_000);
    expect(s.sum).toBe(60_000 + 40_000 + 50_000);
    expect(s.total).toBe(120_000);
  });

  it('旧だけの区分は旧の上限（所得税 5万円・住民税 3.5万円）まで', () => {
    const p = { ...ZERO, ippanOld: 200_000, nenkinOld: 200_000, kaigo: 200_000 };
    expect(kojoShotokuzei({ ...p, under23: false }).total).toBe(120_000);
    expect(kojoShotokuzei({ ...p, under23: false }).ippan.amount).toBe(50_000);
    expect(kojoJuminzei(p).ippan.amount).toBe(35_000);
    expect(kojoJuminzei(p).total).toBe(70_000);
  });
});

describe('住民税（特例は無い）', () => {
  it('新旧両方は合算の上限 2.8万円と旧だけの大きいほう', () => {
    expect(kojoJuminzei({ ...ZERO, ippanNew: 30_000, ippanOld: 30_000 }).ippan.amount).toBe(28_000);
    const r = kojoJuminzei({ ...ZERO, ippanNew: 10_000, ippanOld: 70_000 });
    expect(r.ippan.amount).toBe(35_000);
    expect(r.ippan.choice).toBe('old');
  });
});

describe('画面で使う一式', () => {
  it('確認手順 1・2：一般・新 12万円 → 特例で +2万円', () => {
    const yes = calcSeimeiHokenryoKojo({ ...ZERO, under23: true, ippanNew: 120_000 });
    expect(yes.shotoku.total).toBe(60_000);
    expect(yes.shotokuWithoutTokurei).toBe(40_000);
    expect(yes.tokureiGain).toBe(20_000);
    expect(yes.jumin.total).toBe(28_000);
    const no = calcSeimeiHokenryoKojo({ ...ZERO, under23: false, ippanNew: 120_000 });
    expect(no.shotoku.total).toBe(40_000);
    expect(no.tokureiGain).toBe(0);
  });

  it('確認手順 3・4：一般・旧 7万円＋新 5万円 → 特例で +1.75万円', () => {
    const r = calcSeimeiHokenryoKojo({ ...ZERO, under23: true, ippanNew: 50_000, ippanOld: 70_000 });
    expect(r.shotoku.total).toBe(60_000);
    expect(r.tokureiGain).toBe(17_500);
  });

  it('負の入力は 0 として扱う', () => {
    const r = calcSeimeiHokenryoKojo({ ...ZERO, under23: true, ippanNew: -1, kaigo: -100 });
    expect(r.shotoku.total).toBe(0);
    expect(r.shotoku.ippan.choice).toBe('none');
  });
});

describe('税額の目安', () => {
  it('所得税 5%×1.021・住民税 10%（1円未満切り捨て）', () => {
    expect(zeigakuMeyasu(40_000, 28_000, 5)).toEqual({ incomeTax: 2_042, residentTax: 2_800, total: 4_842 });
    expect(zeigakuMeyasu(120_000, 70_000, 20)).toEqual({ incomeTax: 24_504, residentTax: 7_000, total: 31_504 });
  });
});

describe('年末調整の計算機への引き継ぎ（?life=）', () => {
  it('送る側', () => {
    expect(nenmatsuHandoffHref(60_000)).toBe('/nenmatsu-chosei/?life=60000');
  });

  it('整数 0〜120,000 だけを読む', () => {
    expect(parseLifeQuery('?life=60000')).toBe(60_000);
    expect(parseLifeQuery('life=0')).toBe(0);
    expect(parseLifeQuery('?life=120000')).toBe(120_000);
    expect(parseLifeQuery('?foo=1&life=42500')).toBe(42_500);
  });

  it.each(['', '?life=', '?life=120001', '?life=-1', '?life=1.5', '?life=abc', '?life=1e4', '?life=%2010', '?other=1'])(
    '%s は捨てる',
    (q) => {
      expect(parseLifeQuery(q)).toBeUndefined();
    },
  );
});
