import { describe, expect, it } from 'vitest';
import {
  aimHome,
  DAILY_DIFFICULTY,
  DAILY_VARIANT,
  dailySetup,
  DEFAULT_IMAGE_OPTIONS,
  DIFFICULTIES,
  FACE_IDS,
  FACES,
  imageCaption,
  insideFace,
  makeTray,
  moveAim,
  normalizeAngle,
  PART_KINDS,
  PART_WEIGHT,
  placedSpeech,
  playerNames,
  ranking,
  recordVariant,
  resultSvgMarkup,
  rotate,
  roughArea,
  scoreFace,
  scorePart,
  toSvgPoint,
  verdict,
  VIEW_H,
  VIEW_W,
  VISIBILITY,
  type FaceDef,
  type Placements,
} from '@/lib/fukuwarai';
import { mulberry32 } from '@/lib/daily';
import { entryOf, recordResult, type RecordStorage } from '@/lib/records';

/**
 * 福笑いのテスト。仕様: docs/features/game-fukuwarai.md の「確かめること」。
 * 見出しの番号は仕様書の番号（9 の stage と robots は tests/stage.test.ts が見る）。
 */

const okame = FACES.okame;

/** すべてのパーツを正しい中心・角度 0 で置いた状態 */
function perfect(face: FaceDef): Placements {
  const out: Placements = {};
  for (const kind of PART_KINDS) out[kind] = { x: face.parts[kind].x, y: face.parts[kind].y, rotation: 0 };
  return out;
}

const totalWeight = PART_KINDS.reduce((s, k) => s + PART_WEIGHT[k], 0);

describe('1. 満点', () => {
  it.each(FACE_IDS)('%s：6枚すべてを正しい中心・角度0で置くと100点', (id) => {
    expect(scoreFace(FACES[id], perfect(FACES[id])).total).toBe(100);
  });
});

describe('2. 位置のずれ', () => {
  it('鼻を顔幅の25%ずらすと鼻は0点、全体は重みどおり', () => {
    const p = perfect(okame);
    const nose = okame.parts.nose;
    // 鼻は顔の中ほどにあるので、下に 25% ずらしても顔の中に収まる
    p.nose = { x: nose.x, y: nose.y + okame.box.w * 0.25, rotation: 0 };
    expect(insideFace(okame, p.nose)).toBe(true);
    const s = scoreFace(okame, p);
    expect(s.parts.nose.score).toBe(0);
    expect(s.total).toBe(Math.round((100 * (totalWeight - PART_WEIGHT.nose)) / totalWeight));
  });

  it('25%を越えてずらしても0点のまま（負にならない）', () => {
    const p = perfect(okame);
    p.mouth = { x: okame.parts.mouth.x, y: okame.parts.mouth.y - okame.box.w * 0.4, rotation: 0 };
    expect(scoreFace(okame, p).parts.mouth.score).toBe(0);
  });

  it('ずれが半分（12.5%）なら位置のスコアは0.5', () => {
    const part = scorePart(okame, 'nose', {
      x: okame.parts.nose.x + okame.box.w * 0.125,
      y: okame.parts.nose.y,
      rotation: 0,
    });
    expect(part.position).toBeCloseTo(0.5, 10);
    expect(part.score).toBeCloseTo(0.8 * 0.5 + 0.2, 10);
  });
});

describe('3. 角度のずれ', () => {
  const at = (rotation: number) => scorePart(okame, 'mouth', { ...okame.parts.mouth, rotation });

  it('45°以上のずれで角度のスコアが0（位置が合っていれば 0.8 が残る）', () => {
    expect(at(45).angle).toBe(0);
    expect(at(-60).angle).toBe(0);
    expect(at(45).score).toBeCloseTo(0.8, 10);
  });

  it('180° と −180° は同じ扱い', () => {
    expect(normalizeAngle(180)).toBe(normalizeAngle(-180));
    expect(at(180)).toEqual(at(-180));
    expect(normalizeAngle(350)).toBe(-10);
    expect(at(350).angle).toBeCloseTo(at(-10).angle, 10);
  });

  it('22.5° のずれで角度のスコアは0.5', () => {
    expect(at(22.5).angle).toBeCloseTo(0.5, 10);
  });
});

describe('4. 左右の取り違え（目・まゆ）', () => {
  it.each(FACE_IDS)('%s：左目と右目を入れ替えても点が下がらない', (id) => {
    const face = FACES[id];
    const p = perfect(face);
    [p.eyeL, p.eyeR] = [p.eyeR, p.eyeL];
    [p.browL, p.browR] = [p.browR, p.browL];
    const s = scoreFace(face, p);
    expect(s.total).toBe(100);
    expect(s.swapped).toEqual(expect.arrayContaining(['eyeL', 'eyeR', 'browL', 'browR']));
  });

  it('入れ替えないほうが高いときは入れ替えない', () => {
    const s = scoreFace(okame, perfect(okame));
    expect(s.swapped).toEqual([]);
  });
});

describe('5. 鼻・口は入れ替え採点の対象外', () => {
  it('鼻と口を入れ替えると点が下がる', () => {
    const p = perfect(okame);
    [p.nose, p.mouth] = [p.mouth, p.nose];
    const s = scoreFace(okame, p);
    expect(s.total).toBeLessThan(100);
    expect(s.swapped).not.toContain('nose');
    expect(s.swapped).not.toContain('mouth');
  });
});

describe('6. 顔の外', () => {
  it('輪郭の外接矩形の外に置いたパーツは0点（角度が合っていても）', () => {
    const p = perfect(okame);
    p.mouth = { x: okame.box.x - 1, y: okame.parts.mouth.y, rotation: 0 };
    expect(scoreFace(okame, p).parts.mouth).toEqual({ position: 0, angle: 0, score: 0 });
  });

  it('置かなかったパーツも0点', () => {
    const p = perfect(okame);
    delete p.nose;
    expect(scoreFace(okame, p).parts.nose.score).toBe(0);
  });
});

describe('7. SVG 座標で採点する（表示の大きさに依らない）', () => {
  const clientsFor = (rect: { left: number; top: number; width: number; height: number }) => {
    const scale = rect.width / VIEW_W;
    return (x: number, y: number) => [rect.left + x * scale, rect.top + y * scale] as const;
  };

  it('同じ場所に置けば、表示の倍率を変えても同じ点になる', () => {
    const svgPoints = { x: 120, y: 180 };
    const scores = [0.5, 1, 2.75].map((k) => {
      const rect = { left: 13, top: 40, width: VIEW_W * k, height: VIEW_H * k };
      const [cx, cy] = clientsFor(rect)(svgPoints.x, svgPoints.y);
      const pt = toSvgPoint(cx, cy, rect);
      const p = perfect(okame);
      p.eyeL = { ...pt, rotation: 10 };
      return scoreFace(okame, p).total;
    });
    expect(new Set(scores).size).toBe(1);
  });

  it('縦横比が違う枠（余白つき）でも中心は中心に戻る', () => {
    const rect = { left: 0, top: 0, width: 600, height: 360 };
    const pt = toSvgPoint(300, 180, rect);
    expect(pt.x).toBeCloseTo(VIEW_W / 2, 10);
    expect(pt.y).toBeCloseTo(VIEW_H / 2, 10);
  });
});

describe('8. 日替わり', () => {
  it('同じ日なら顔の種類と初期の向き・並びが同じ', () => {
    expect(dailySetup('2027-01-01')).toEqual(dailySetup('2027-01-01'));
  });

  it('日が変わると並びか向きが変わる（30日で同じものが続かない）', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
    const set = new Set(keys.map((k) => JSON.stringify(dailySetup(k))));
    expect(set.size).toBeGreaterThan(25);
  });

  it('置き場は6枚すべて・±30°以内の整数', () => {
    const tray = makeTray(mulberry32(7));
    expect(tray.map((t) => t.kind).sort()).toEqual([...PART_KINDS].sort());
    for (const t of tray) {
      expect(Number.isInteger(t.rotation)).toBe(true);
      expect(Math.abs(t.rotation)).toBeLessThanOrEqual(30);
    }
  });
});

describe('10. 顔のデータ', () => {
  it('5種の顔がある', () => {
    expect(FACE_IDS).toHaveLength(5);
    expect(Object.keys(FACES).sort()).toEqual([...FACE_IDS].sort());
  });

  it.each(FACE_IDS)('%s：6枚のパーツが絵を持ち、正しい位置が輪郭の中にある', (id) => {
    const face = FACES[id];
    expect(face.id).toBe(id);
    expect(face.outline.length).toBeGreaterThan(0);
    expect(Object.keys(face.parts).sort()).toEqual([...PART_KINDS].sort());
    for (const kind of PART_KINDS) {
      const part = face.parts[kind];
      expect(part.els.length, `${id}.${kind} の絵が無い`).toBeGreaterThan(0);
      expect(insideFace(face, part), `${id}.${kind} が輪郭の外`).toBe(true);
    }
    const { x, y, w, h } = face.box;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(VIEW_W);
    expect(y + h).toBeLessThanOrEqual(VIEW_H);
  });

  it.each(FACE_IDS)('%s：左右のパーツは画面の左と右にある（まゆは目より上・口は鼻より下）', (id) => {
    const p = FACES[id].parts;
    expect(p.eyeL.x).toBeLessThan(p.eyeR.x);
    expect(p.browL.x).toBeLessThan(p.browR.x);
    expect(p.browL.y).toBeLessThan(p.eyeL.y);
    expect(p.nose.y).toBeLessThan(p.mouth.y);
  });

  it.each(FACE_IDS)('%s：パーツどうしの距離は顔幅の25%未満にならない組がある（全部重ねて置いても満点にならない）', (id) => {
    const face = FACES[id];
    const p: Placements = {};
    for (const kind of PART_KINDS) p[kind] = { ...aimHome(face), rotation: 0 };
    expect(scoreFace(face, p).total).toBeLessThan(80);
  });
});

describe('11. 難易度ごとの見え方（仕様書の表と設定のずれを落とす）', () => {
  // 仕様書「難易度ごとの見え方」の表を、そのまま写したもの
  const TABLE = {
    preview: { easy: true, normal: true, hard: true },
    outline: { easy: 'solid', normal: 'faint', hard: 'none' },
    tray: { easy: true, normal: true, hard: true },
    dragging: { easy: true, normal: false, hard: false },
    placed: { easy: true, normal: false, hard: false },
    cursor: { easy: 'normal', normal: 'normal', hard: 'none' },
    aim: { easy: 'cross-part', normal: 'cross', hard: 'none' },
    speech: { easy: 'rough-place', normal: 'count-only', hard: 'count-only' },
    count: { easy: true, normal: true, hard: true },
  } as const;

  it.each(DIFFICULTIES)('%s：設定が表どおり', (d) => {
    for (const [key, row] of Object.entries(TABLE)) {
      expect(VISIBILITY[d][key as keyof typeof TABLE], `${d}.${key}`).toBe(row[d]);
    }
  });

  it('ふつう・むずかしいでは、ドラッグ中のパーツと置いたパーツを描かない', () => {
    for (const d of ['normal', 'hard'] as const) {
      expect(VISIBILITY[d].dragging).toBe(false);
      expect(VISIBILITY[d].placed).toBe(false);
    }
  });

  it('ふつう・むずかしいの読み上げに場所が入らない、かんたんには入る', () => {
    const at = { x: 200, y: 120 };
    expect(placedSpeech('easy', okame, 'eyeR', at, 3)).toContain(roughArea(okame, at));
    for (const d of ['normal', 'hard'] as const) {
      const s = placedSpeech(d, okame, 'eyeR', at, 3);
      expect(s).toBe('目（右）を置きました（6枚中3枚）');
    }
  });

  it('大まかな場所は3×3に分ける', () => {
    const { x, y, w, h } = okame.box;
    expect(roughArea(okame, { x: x + w * 0.9, y: y + h * 0.1 })).toBe('顔の右上');
    expect(roughArea(okame, { x: x + w / 2, y: y + h / 2 })).toBe('顔のまんなか');
    expect(roughArea(okame, { x: x + w * 0.1, y: y + h / 2 })).toBe('顔の左');
    expect(roughArea(okame, { x: -5, y: 0 })).toBe('顔の外');
  });
});

describe('12. 記録の区分', () => {
  function memory(): RecordStorage {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  }

  it('記録の鍵は顔の種類 × 難易度で分かれる', () => {
    const keys = new Set(FACE_IDS.flatMap((f) => DIFFICULTIES.map((d) => recordVariant(f, d))));
    expect(keys.size).toBe(FACE_IDS.length * DIFFICULTIES.length);
    expect(keys.has(DAILY_VARIANT)).toBe(false);
  });

  it('かんたんの点が ふつう の記録に入らない', () => {
    const storage = memory();
    const { records } = recordResult('fukuwarai', { score: 98 }, recordVariant('okame', 'easy'), storage);
    expect(entryOf(records, recordVariant('okame', 'easy')).bestScore).toBe(98);
    expect(entryOf(records, recordVariant('okame', 'normal')).bestScore).toBeUndefined();
  });

  it('今日のお題の難易度は ふつう に固定', () => {
    expect(DAILY_DIFFICULTY).toBe('normal');
  });
});

describe('13. 画像で保存', () => {
  it('既定では名前が入らない', () => {
    expect(DEFAULT_IMAGE_OPTIONS.includeName).toBe(false);
    const svg = resultSvgMarkup(okame, perfect(okame), { total: 87, playerName: 'たろう', ...DEFAULT_IMAGE_OPTIONS });
    expect(svg).not.toContain('たろう');
    expect(svg).toContain('87点');
    expect(svg).toContain('おかめ');
  });

  it('「名前を入れる」を選んだときだけ名前が入る（文字はエスケープする）', () => {
    expect(imageCaption(okame, { total: 50, playerName: 'A&B', includeName: true })).toContain('A&B');
    const svg = resultSvgMarkup(okame, {}, { total: 50, playerName: '<b>', includeName: true });
    expect(svg).toContain('&lt;b&gt;');
    expect(svg).not.toContain('<b>');
  });

  it('置いたパーツは画像に描かれる（右側は鏡像）', () => {
    const svg = resultSvgMarkup(okame, perfect(okame), { total: 100 });
    expect(svg.match(/<g transform=/g)).toHaveLength(6);
    expect(svg).toContain('scale(-1 1)');
  });
});

describe('操作・家族モード・ひと言', () => {
  it('回すのは15°ずつで −180〜180 に収まる', () => {
    expect(rotate(0, 1)).toBe(15);
    expect(rotate(-30, -1)).toBe(-45);
    expect(rotate(180, 1)).toBe(-165);
  });

  it('照準は矢印で動き、Shift で大きく、紙の外へは出ない', () => {
    expect(moveAim({ x: 100, y: 100 }, 'ArrowRight', false)).toEqual({ x: 105, y: 100 });
    expect(moveAim({ x: 100, y: 100 }, 'ArrowUp', true)).toEqual({ x: 100, y: 75 });
    expect(moveAim({ x: 2, y: VIEW_H - 1 }, 'ArrowLeft', true).x).toBe(0);
    expect(moveAim({ x: 2, y: VIEW_H - 1 }, 'ArrowDown', true).y).toBe(VIEW_H);
  });

  it('家族モードは2〜6人、空欄は「1ばん」…', () => {
    expect(playerNames(['', ' はなこ '], 3)).toEqual(['1ばん', 'はなこ', '3ばん']);
    expect(playerNames([], 1)).toHaveLength(2);
    expect(playerNames([], 10)).toHaveLength(6);
  });

  it('順位は点の高い順、同点は同じ順位', () => {
    const r = ranking([
      { name: 'a', placements: {}, total: 50 },
      { name: 'b', placements: {}, total: 80 },
      { name: 'c', placements: {}, total: 50 },
    ]);
    expect(r.map((x) => [x.entry.name, x.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
    ]);
  });

  it('ひと言は5段階', () => {
    expect(new Set([100, 80, 60, 40, 0].map(verdict)).size).toBe(5);
  });
});
