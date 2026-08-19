import { describe, expect, it } from 'vitest';
import {
  COMPARISON_JO,
  DEFAULT_TATAMI_ID,
  HYOJI_SQM_PER_JO,
  JO_LOOKUP,
  JO_LOOKUP_VALUES,
  METER_PER_KEN,
  METER_PER_SHAKU,
  SQM_PER_TSUBO,
  STANDARD_ROWS,
  TATAMI_SIZES,
  TATAMI_STANDARDS,
  TSUBO_LOOKUP,
  TSUBO_LOOKUP_VALUES,
  TSUBO_PER_SQM,
  TSUBO_SQM_DENOMINATOR,
  TSUBO_SQM_NUMERATOR,
  UNIT_LABEL,
  convertArea,
  formatArea,
  isValidArea,
  joToSqm,
  lookupRows,
  roundArea,
  sqmToJo,
  sqmOfSize,
  sqmToTsubo,
  standardRows,
  tatamiStandard,
  tsuboToSqm,
  type AreaUnit,
  type TatamiStandardId,
} from '@/lib/tsubo-heibei';

/**
 * 坪・平米・畳の換算のテスト。
 *
 * 仕様: docs/features/tsubo-heibei-jo-henkan.md
 *
 * 見張っているのは3つ。
 *
 * 1. **1坪 = 400/121 ㎡ を丸めずに使っていること**。3.31 で計算すると
 *    100坪で㎡が0.4以上ずれる
 * 2. **畳は規格ごとに違う値になること**。既定を1.62㎡（不動産表示）に固定し、
 *    切り替えたら実際に答えが変わることを確かめる
 * 3. **早見表が定数から生成されていること**。表の値を手で書くと、
 *    計算機の答えと食い違っても誰も気づけない
 */

describe('尺貫法の定義', () => {
  it('1坪は 400/121 ㎡（分数のまま持つ）', () => {
    expect(TSUBO_SQM_NUMERATOR).toBe(400);
    expect(TSUBO_SQM_DENOMINATOR).toBe(121);
    expect(SQM_PER_TSUBO).toBe(400 / 121);
    expect(SQM_PER_TSUBO).toBeCloseTo(3.305785, 6);
  });

  it('1尺 = 10/33 m、1間 = 6尺 から 1坪（1間四方）が導ける', () => {
    expect(METER_PER_SHAKU).toBe(10 / 33);
    expect(METER_PER_KEN).toBeCloseTo(20 / 11, 12);
    expect(METER_PER_KEN ** 2).toBeCloseTo(SQM_PER_TSUBO, 12);
  });

  it('1㎡ = 0.3025坪（121/400 は割り切れる）', () => {
    expect(TSUBO_PER_SQM).toBe(0.3025);
    // 「100㎡ = 30.25坪」がちょうどになる（丸めた係数だとここがずれる）
    expect(sqmToTsubo(100)).toBe(30.25);
  });

  it('丸めた係数（3.31）で計算していない', () => {
    const rough = 100 * 3.31;
    expect(tsuboToSqm(100)).not.toBeCloseTo(rough, 1);
    expect(tsuboToSqm(100)).toBeCloseTo(330.578512, 6);
  });
});

describe('坪 ⇔ ㎡', () => {
  it('よく引かれる坪数を㎡にする', () => {
    expect(roundArea(tsuboToSqm(1) as number)).toBe(3.31);
    expect(roundArea(tsuboToSqm(10) as number)).toBe(33.06);
    expect(roundArea(tsuboToSqm(30) as number)).toBe(99.17);
    expect(roundArea(tsuboToSqm(50) as number)).toBe(165.29);
  });

  it('よく引かれる㎡を坪にする', () => {
    expect(roundArea(sqmToTsubo(1) as number)).toBe(0.3);
    expect(roundArea(sqmToTsubo(60) as number)).toBe(18.15);
    expect(sqmToTsubo(100)).toBe(30.25);
  });

  it('往復しても元の値に戻る（丸めを挟まなければ誤差が積み上がらない）', () => {
    for (const tsubo of [0, 1, 3.5, 30, 100, 1234.5]) {
      expect(sqmToTsubo(tsuboToSqm(tsubo) as number)).toBeCloseTo(tsubo, 10);
    }
  });

  it('0は0（面積として有効な入力）', () => {
    expect(tsuboToSqm(0)).toBe(0);
    expect(sqmToTsubo(0)).toBe(0);
  });

  it('負の数・非有限数は null', () => {
    for (const bad of [-1, -0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tsuboToSqm(bad)).toBeNull();
      expect(sqmToTsubo(bad)).toBeNull();
      expect(joToSqm(bad)).toBeNull();
      expect(sqmToJo(bad)).toBeNull();
      expect(convertArea(bad, 'tsubo')).toBeNull();
      expect(isValidArea(bad)).toBe(false);
    }
  });
});

describe('畳の規格', () => {
  it('既定は不動産表示の1.62㎡', () => {
    expect(DEFAULT_TATAMI_ID).toBe('hyoji');
    expect(tatamiStandard(DEFAULT_TATAMI_ID).sqm).toBe(HYOJI_SQM_PER_JO);
    expect(HYOJI_SQM_PER_JO).toBe(1.62);
    // 引数を省いたときも不動産表示になる
    expect(joToSqm(6)).toBe(joToSqm(6, 'hyoji'));
  });

  it('規格ごとの1畳の面積が世間で言われている値と一致する', () => {
    const expected: Record<TatamiStandardId, number> = {
      hyoji: 1.62,
      kyoma: 1.82,
      chukyoma: 1.66,
      edoma: 1.55,
      danchima: 1.45,
    };
    for (const standard of TATAMI_STANDARDS) {
      expect(roundArea(standard.sqm)).toBe(expected[standard.id]);
    }
  });

  it('面積は寸法（長辺×短辺）から導いている', () => {
    for (const standard of TATAMI_STANDARDS) {
      if (!standard.size) continue;
      expect(standard.sqm).toBe(sqmOfSize(standard.size));
      // 畳は長辺が短辺のちょうど2倍（半畳を2枚並べた形）
      expect(standard.size.longMm).toBe(standard.size.shortMm * 2);
    }
    // 寸法の定めがないのは不動産表示（面積の下限だけが決まっている）
    expect(TATAMI_STANDARDS.filter((s) => !s.size).map((s) => s.id)).toEqual(['hyoji']);
    expect(TATAMI_SIZES.kyoma).toEqual({ longMm: 1910, shortMm: 955 });
  });

  /**
   * 団地間は 1.70m × 0.85m ＝ 1.445㎡ で、小数のまま掛けると 1.4449999… になり
   * 表示が1.44㎡に落ちる。寸法をmmの整数で持ち、丸めも10進で行うことで防いでいる。
   */
  it('団地間の 1.445㎡ が 1.45㎡ に丸まる（二進小数の誤差で1.44にならない）', () => {
    expect(tatamiStandard('danchima').sqm).toBe(1.445);
    expect(roundArea(1.445)).toBe(1.45);
    expect(formatArea(1.445)).toBe('1.45');
  });

  it('京間がいちばん広く、団地間がいちばん狭い', () => {
    const sqm = (id: TatamiStandardId) => tatamiStandard(id).sqm;
    expect(sqm('kyoma')).toBeGreaterThan(sqm('chukyoma'));
    expect(sqm('chukyoma')).toBeGreaterThan(sqm('hyoji'));
    expect(sqm('hyoji')).toBeGreaterThan(sqm('edoma'));
    expect(sqm('edoma')).toBeGreaterThan(sqm('danchima'));
  });

  it('規格を変えると答えが変わる（切り替えが効いている）', () => {
    expect(roundArea(joToSqm(6, 'hyoji') as number)).toBe(9.72);
    expect(roundArea(joToSqm(6, 'kyoma') as number)).toBe(10.94);
    expect(roundArea(joToSqm(6, 'chukyoma') as number)).toBe(9.94);
    expect(roundArea(joToSqm(6, 'edoma') as number)).toBe(9.29);
    expect(roundArea(joToSqm(6, 'danchima') as number)).toBe(8.67);
  });

  it('㎡から畳へ戻せる', () => {
    expect(sqmToJo(9.72, 'hyoji')).toBeCloseTo(6, 10);
    expect(roundArea(sqmToJo(20, 'edoma') as number)).toBe(12.91);
  });

  it('未知の規格は投げる（既定へ黙って落とさない）', () => {
    expect(() => tatamiStandard('kyouma' as TatamiStandardId)).toThrow(/規格/);
  });
});

describe('convertArea', () => {
  it('どの単位で入れても同じ3つ組になる', () => {
    const fromTsubo = convertArea(30, 'tsubo');
    expect(fromTsubo).not.toBeNull();
    const fromSqm = convertArea((fromTsubo as { sqm: number }).sqm, 'sqm');
    const fromJo = convertArea((fromTsubo as { jo: number }).jo, 'jo');
    for (const other of [fromSqm, fromJo]) {
      expect(other?.tsubo).toBeCloseTo(fromTsubo?.tsubo as number, 10);
      expect(other?.sqm).toBeCloseTo(fromTsubo?.sqm as number, 10);
      expect(other?.jo).toBeCloseTo(fromTsubo?.jo as number, 10);
    }
  });

  it('30坪 = 99.17㎡ ≒ 61.22畳（不動産表示の1.62㎡換算）', () => {
    const r = convertArea(30, 'tsubo');
    expect(roundArea(r?.sqm as number)).toBe(99.17);
    expect(roundArea(r?.jo as number)).toBe(61.22);
    expect(r?.standard.id).toBe('hyoji');
  });

  it('1坪はおよそ2畳（不動産表示なら2.04畳、江戸間なら2.13畳）', () => {
    expect(roundArea(convertArea(1, 'tsubo')?.jo as number)).toBe(2.04);
    expect(roundArea(convertArea(1, 'tsubo', 'edoma')?.jo as number)).toBe(2.13);
  });

  it('6畳は9.72㎡ ≒ 2.94坪（不動産表示）', () => {
    const r = convertArea(6, 'jo');
    expect(roundArea(r?.sqm as number)).toBe(9.72);
    expect(roundArea(r?.tsubo as number)).toBe(2.94);
  });

  it('㎡はそのまま返す（往復で値が変わらない）', () => {
    expect(convertArea(70, 'sqm')?.sqm).toBe(70);
  });

  it('規格を変えても坪と㎡は動かない（畳だけが変わる）', () => {
    const hyoji = convertArea(20, 'sqm', 'hyoji');
    const edoma = convertArea(20, 'sqm', 'edoma');
    expect(edoma?.sqm).toBe(hyoji?.sqm);
    expect(edoma?.tsubo).toBe(hyoji?.tsubo);
    expect(edoma?.jo).toBeGreaterThan(hyoji?.jo as number);
  });

  it('0は3つとも0', () => {
    expect(convertArea(0, 'jo')).toMatchObject({ tsubo: 0, sqm: 0, jo: 0 });
  });
});

describe('表示用の丸め', () => {
  it('roundArea は既定で小数2桁（四捨五入）', () => {
    expect(roundArea(3.305785)).toBe(3.31);
    expect(roundArea(99.1735537)).toBe(99.17);
    expect(roundArea(1.555)).toBe(1.56);
    expect(roundArea(3.305785, 4)).toBe(3.3058);
    expect(roundArea(3.305785, 0)).toBe(3);
  });

  it('formatArea は小数2桁を必ず出し、3桁区切りを入れる', () => {
    expect(formatArea(3.305785)).toBe('3.31');
    expect(formatArea(9.72)).toBe('9.72');
    expect(formatArea(3)).toBe('3.00');
    expect(formatArea(3305.785)).toBe('3,305.79');
    expect(formatArea(3.305785, 4)).toBe('3.3058');
  });
});

describe('逆引き早見表', () => {
  it('坪の表は仕様どおりの坪数を並べる', () => {
    expect(TSUBO_LOOKUP_VALUES).toEqual([1, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100]);
    expect(TSUBO_LOOKUP).toHaveLength(TSUBO_LOOKUP_VALUES.length);
    expect(TSUBO_LOOKUP.map((r) => roundArea(r.tsubo))).toEqual(TSUBO_LOOKUP_VALUES);
  });

  it('畳の表は間取りに出てくる畳数を並べる', () => {
    expect(JO_LOOKUP_VALUES).toEqual([4.5, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(JO_LOOKUP).toHaveLength(JO_LOOKUP_VALUES.length);
    expect(JO_LOOKUP.map((r) => roundArea(r.jo))).toEqual(JO_LOOKUP_VALUES);
  });

  /** 表を手で書いていたら、ここが計算機の答えとずれる */
  it('表の値は convertArea と完全に一致する（手書きしていない）', () => {
    for (const [i, tsubo] of TSUBO_LOOKUP_VALUES.entries()) {
      expect(TSUBO_LOOKUP[i]).toEqual({
        tsubo: convertArea(tsubo, 'tsubo')?.tsubo,
        sqm: convertArea(tsubo, 'tsubo')?.sqm,
        jo: convertArea(tsubo, 'tsubo')?.jo,
      });
    }
    for (const [i, jo] of JO_LOOKUP_VALUES.entries()) {
      expect(JO_LOOKUP[i].sqm).toBe(convertArea(jo, 'jo')?.sqm);
      expect(JO_LOOKUP[i].tsubo).toBe(convertArea(jo, 'jo')?.tsubo);
    }
  });

  it('代表的な行の値（30坪・6畳）', () => {
    const row30 = TSUBO_LOOKUP[TSUBO_LOOKUP_VALUES.indexOf(30)];
    expect(roundArea(row30.sqm)).toBe(99.17);
    expect(roundArea(row30.jo)).toBe(61.22);

    const row6 = JO_LOOKUP[JO_LOOKUP_VALUES.indexOf(6)];
    expect(roundArea(row6.sqm)).toBe(9.72);
    expect(roundArea(row6.tsubo)).toBe(2.94);
  });

  it('坪数・㎡・畳数はどれも増える一方（並びが崩れていない）', () => {
    for (const rows of [TSUBO_LOOKUP, JO_LOOKUP]) {
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i].sqm).toBeGreaterThan(rows[i - 1].sqm);
        expect(rows[i].tsubo).toBeGreaterThan(rows[i - 1].tsubo);
        expect(rows[i].jo).toBeGreaterThan(rows[i - 1].jo);
      }
    }
  });

  it('規格を渡すと畳の換算だけが変わる', () => {
    const edoma = lookupRows([30], 'tsubo', 'edoma')[0];
    expect(edoma.sqm).toBe(TSUBO_LOOKUP[TSUBO_LOOKUP_VALUES.indexOf(30)].sqm);
    expect(roundArea(edoma.jo)).toBe(64.03);
  });

  it('負の値を渡したら投げる（黙って0の行を作らない）', () => {
    expect(() => lookupRows([-1], 'tsubo')).toThrow(/早見表/);
  });

  it('単位の表示名を1か所で持っている', () => {
    const units: AreaUnit[] = ['tsubo', 'sqm', 'jo'];
    expect(units.map((u) => UNIT_LABEL[u])).toEqual(['坪', '㎡', '畳']);
  });
});

describe('規格の比較表', () => {
  it('6畳ぶんを規格の一覧と同じ並びで出す', () => {
    expect(COMPARISON_JO).toBe(6);
    expect(STANDARD_ROWS.map((r) => r.standard.id)).toEqual(TATAMI_STANDARDS.map((s) => s.id));
  });

  it('同じ6畳でも規格で1.5畳ぶん以上の差が出る', () => {
    const kyoma = STANDARD_ROWS.find((r) => r.standard.id === 'kyoma') as { sqm: number };
    const danchima = STANDARD_ROWS.find((r) => r.standard.id === 'danchima') as { sqm: number };
    expect(roundArea(kyoma.sqm)).toBe(10.94);
    expect(roundArea(danchima.sqm)).toBe(8.67);
    expect(kyoma.sqm - danchima.sqm).toBeGreaterThan(2);
  });

  it('畳数を変えて作れる', () => {
    const rows = standardRows(8);
    expect(roundArea(rows[0].sqm)).toBe(12.96);
    expect(rows[0].sqmPerJo).toBe(HYOJI_SQM_PER_JO);
    expect(roundArea(rows[0].tsubo)).toBe(3.92);
  });
});
