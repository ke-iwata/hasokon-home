import { describe, expect, it } from 'vitest';

import {
  aimAt,
  BOX_H,
  BOX_W,
  boundOf,
  canDrop,
  CHAIN_MAX,
  collide,
  debugFill,
  debugLadder,
  drop,
  DROP_INTERVAL,
  DROPPABLE_TIERS,
  DROP_Y,
  dropPreviewY,
  HOLDS,
  holdPoints,
  initialState,
  isWarning,
  LINE_Y,
  MAX_TIER,
  mergePoints,
  nextRandom,
  OVER_LIMIT,
  restart,
  shapeOf,
  step,
  SUBSTEPS,
  type BoulderingMergeState,
  type Hold,
} from '@/lib/bouldering-merge';

const FRAME = 1 / 60;

function run(state: BoulderingMergeState, frames: number, substeps = SUBSTEPS) {
  let s = state;
  for (let i = 0; i < frames; i += 1) s = step(s, FRAME, substeps);
  return s;
}

/** ホールドを直接置く（落とすのを待たずに局面を作るため） */
type Placed = { tier: number; x: number; y: number; vx?: number; vy?: number; angle?: number };
function place(state: BoulderingMergeState, put: Placed[]): BoulderingMergeState {
  return {
    ...state,
    holds: put.map((h, i) => ({
      id: state.nextId + i,
      tier: h.tier,
      x: h.x,
      y: h.y,
      vx: h.vx ?? 0,
      vy: h.vy ?? 0,
      angle: h.angle ?? 0,
      spin: 0,
      landed: h.y - shapeOf(h.tier).bound > LINE_Y,
      restSec: 0,
      restX: h.x,
      restY: h.y,
    })),
    nextId: state.nextId + put.length,
  };
}

/** 箱からはみ出している頂点の数 */
function outsideCount(s: BoulderingMergeState): number {
  let n = 0;
  for (const h of s.holds) {
    for (const [x, y] of holdPoints(h)) {
      if (x < -1e-4 || x > BOX_W + 1e-4 || y > BOX_H + 1e-4) n += 1;
    }
  }
  return n;
}

describe('ホールドの定義', () => {
  it('11段ある', () => {
    expect(HOLDS).toHaveLength(11);
    expect(MAX_TIER).toBe(10);
  });

  it('段が上がるほど必ず大きくなる', () => {
    for (let t = 1; t <= MAX_TIER; t += 1) {
      expect(HOLDS[t].size).toBeGreaterThan(HOLDS[t - 1].size);
    }
  });

  it('いちばん大きいホールドでも箱の幅に収まる', () => {
    expect(boundOf(MAX_TIER) * 2).toBeLessThan(BOX_W);
  });

  it('名前が重複していない', () => {
    expect(new Set(HOLDS.map((h) => h.name)).size).toBe(HOLDS.length);
  });

  /**
   * **形はすべて凸でなければならない。** 凹んでいると SAT（分離軸定理）が
   * 破綻して、当たっているのに当たっていないと判定される。
   * 頂点を並べ替えたときに気づけるよう、機械で確かめる
   */
  it('どの段の形も凸多角形', () => {
    for (let t = 0; t <= MAX_TIER; t += 1) {
      const pts = shapeOf(t).points;
      for (let i = 0; i < pts.length; i += 1) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        const [x3, y3] = pts[(i + 2) % pts.length];
        const cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
        expect(cross, `${HOLDS[t].name} の頂点${i}が凹んでいる`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('面積・慣性モーメント・外接円がすべて正の値', () => {
    for (let t = 0; t <= MAX_TIER; t += 1) {
      const s = shapeOf(t);
      expect(s.area).toBeGreaterThan(0);
      expect(s.inertia).toBeGreaterThan(0);
      expect(s.bound).toBeGreaterThan(0);
    }
  });

  it('段の外を渡しても端に丸める（描画で NaN にしない）', () => {
    expect(boundOf(-5)).toBe(boundOf(0));
    expect(boundOf(999)).toBe(boundOf(MAX_TIER));
  });

  it('ホールドの種類名だけを使う（商品名を入れない）', () => {
    const names = HOLDS.map((h) => h.name).join(' ');
    for (const banned of ['スイカ', 'すいか']) {
      expect(names).not.toContain(banned);
    }
  });
});

describe('当たり判定（多角形）', () => {
  it('離れていれば当たらない', () => {
    const a: Hold = { id: 1, tier: 5, x: 0.2, y: 1, vx: 0, vy: 0, angle: 0, spin: 0, landed: true, restSec: 0, restX: 0.2, restY: 1 };
    const b: Hold = { ...a, id: 2, x: 0.8 };
    expect(collide(a, b)).toBeNull();
  });

  it('重なっていれば法線と深さが返る', () => {
    const a: Hold = { id: 1, tier: 5, x: 0.5, y: 1, vx: 0, vy: 0, angle: 0, spin: 0, landed: true, restSec: 0, restX: 0.5, restY: 1 };
    const b: Hold = { ...a, id: 2, x: 0.5 + shapeOf(5).bound * 0.5 };
    const c = collide(a, b);
    expect(c).not.toBeNull();
    expect(c!.depth).toBeGreaterThan(0);
    // **法線は単位ベクトル。** 向きは a→b に寄せてあるが、
    // いちばん浅い軸が中心を結んだ線と直交することがあるので、
    // 「必ず右向き」とは言えない（最小移動ベクトルの性質）
    expect(Math.hypot(c!.nx, c!.ny)).toBeCloseTo(1, 6);
    expect(c!.points.length).toBeGreaterThan(0);
  });

  /**
   * **面で接しているときは接触点が2つ以上できること。**
   * 1点しか作らないと、平らな面で載っている多角形が支えられずに回り続ける
   * （円には無い、多角形ならではの問題）
   */
  it('面どうしが重なると接触点が2つ以上できる', () => {
    // カチ（薄い横長の板）を上下に少し重ねる
    const r = shapeOf(0).bound;
    const a: Hold = { id: 1, tier: 0, x: 0.5, y: 1, vx: 0, vy: 0, angle: 0, spin: 0, landed: true, restSec: 0, restX: 0.5, restY: 1 };
    const b: Hold = { ...a, id: 2, y: 1 - r * 0.5 };
    const c = collide(a, b);
    expect(c).not.toBeNull();
    expect(c!.points.length).toBeGreaterThanOrEqual(2);
  });
});

describe('落とす', () => {
  it('予告のホールドが手元に来て、新しい予告を引く', () => {
    const s = initialState(1);
    const after = drop(s);
    expect(after.hold).toBe(s.next);
    expect(after.holds).toHaveLength(1);
    expect(after.holds[0].tier).toBe(s.hold);
  });

  it('落ちてくるのは小さい方の5段階だけ', () => {
    let s = initialState(1);
    for (let i = 0; i < 200; i += 1) {
      expect(s.hold).toBeLessThan(DROPPABLE_TIERS);
      s = drop({ ...s, dropCool: 0 });
    }
  });

  it('落とす位置は壁を突き抜けない', () => {
    const s = aimAt(initialState(1), 5);
    expect(s.aim).toBeLessThanOrEqual(BOX_W - boundOf(s.hold));
    expect(aimAt(initialState(1), -5).aim).toBeGreaterThanOrEqual(boundOf(s.hold));
  });

  it('連打しても間隔が空くまでは落ちない', () => {
    let s = drop(initialState(1));
    expect(canDrop(s)).toBe(false);
    s = drop(s);
    expect(s.holds).toHaveLength(1);
    s = run(s, Math.ceil(DROP_INTERVAL * 60) + 1);
    expect(canDrop(s)).toBe(true);
  });

  it('落としたホールドは床まで落ちて止まる', () => {
    const s = run(drop(aimAt(initialState(1), 0.5)), 180);
    const h = s.holds[0];
    expect(h.y).toBeGreaterThan(BOX_H - boundOf(h.tier) * 2);
    expect(Math.hypot(h.vx, h.vy)).toBeLessThan(0.01);
  });
});

describe('合体', () => {
  it('同じ段どうしが触れると1段上になる', () => {
    const r = shapeOf(1).bound;
    const s = run(
      place(initialState(1), [
        { tier: 1, x: 0.5 - r * 0.4, y: BOX_H - r },
        { tier: 1, x: 0.5 + r * 0.4, y: BOX_H - r },
      ]),
      2,
    );
    expect(s.holds).toHaveLength(1);
    expect(s.holds[0].tier).toBe(2);
  });

  it('段が違えば合体しない', () => {
    const r = shapeOf(1).bound;
    const s = run(
      place(initialState(1), [
        { tier: 1, x: 0.5 - r * 0.4, y: BOX_H - r },
        { tier: 2, x: 0.5 + r * 0.4, y: BOX_H - r },
      ]),
      2,
    );
    expect(s.holds).toHaveLength(2);
  });

  it('できあがった段が大きいほど点が高い（1,3,6,…,55）', () => {
    expect(mergePoints(1)).toBe(1);
    expect(mergePoints(2)).toBe(3);
    expect(mergePoints(10)).toBe(55);
  });

  it('最大どうしは消えてボーナスが入る', () => {
    const r = shapeOf(MAX_TIER).bound;
    const s = run(
      place(initialState(1), [
        { tier: MAX_TIER, x: 0.5 - r * 0.4, y: BOX_H - r },
        { tier: MAX_TIER, x: 0.5 + r * 0.4, y: BOX_H - r },
      ]),
      2,
    );
    expect(s.holds).toHaveLength(0);
    expect(s.cleared).toBe(1);
    expect(s.score).toBeGreaterThan(0);
  });

  it('合体は演出用のイベントとして出て、次のフレームには残らない', () => {
    const r = shapeOf(1).bound;
    const s = run(
      place(initialState(1), [
        { tier: 1, x: 0.5 - r * 0.4, y: BOX_H - r },
        { tier: 1, x: 0.5 + r * 0.4, y: BOX_H - r },
      ]),
      1,
    );
    expect(s.events).toHaveLength(1);
    expect(run(s, 1).events).toHaveLength(0);
  });

  /**
   * **合体でできたホールドは親より大きく、形も違う。**
   * 親の中点に置くと壁・床に刺さるので、生まれた時点で箱に収める
   */
  it('合体してできたホールドも箱の中に収まる', () => {
    const r = shapeOf(0).bound;
    const s = run(
      place(initialState(1), [
        { tier: 0, x: r * 1.1, y: BOX_H - r },
        { tier: 0, x: r * 1.9, y: BOX_H - r },
      ]),
      1,
    );
    expect(s.events).toHaveLength(1);
    expect(outsideCount(s)).toBe(0);
  });
});

describe('連鎖', () => {
  it('倍率には上限がある', () => {
    expect(CHAIN_MAX).toBeGreaterThan(1);
  });
});

describe('ゲームオーバー', () => {
  it('落とす前のホールドはラインより上にいる', () => {
    expect(DROP_Y).toBeLessThan(LINE_Y);
  });

  /**
   * **実際に落として終わらせる。**
   *
   * 局面を手で組んで「ラインを超えた山」を作ろうとしたが、
   * 細い柱は横に崩れ、詰めて置くと重なって合体し、どちらもラインより下で
   * 落ち着いてしまった。遊びと同じ手順で積むのがいちばん確実で、
   * 「積み上がったら終わる」という筋そのものを確かめられる
   */
  it('積み上がってラインを超え続けると終わる', () => {
    let s = initialState(1);
    let frames = 0;
    // 同じあたりに落とし続ければ、いつかは積み上がって終わる
    while (s.status === 'playing' && frames < 60 * 400) {
      if (canDrop(s)) s = drop(aimAt(s, 0.5));
      s = step(s, FRAME);
      frames += 1;
    }
    expect(s.status).toBe('gameover');
  }, 120000);

  it('終わったあとは物理が動かない', () => {
    const s: BoulderingMergeState = { ...place(initialState(1), [{ tier: 2, x: 0.5, y: 0.6 }]), status: 'gameover' };
    expect(run(s, 30).holds[0].y).toBe(s.holds[0].y);
  });
});

describe('積み上がりの安定（公開の条件2）', () => {
  /** 落として積んで、合体が止まるまで待つ（合体はゲームそのものなので待つ） */
  function pile(seed: number) {
    let s = initialState(seed);
    for (let n = 0; n < 80; n += 1) {
      s = drop(aimAt({ ...s, dropCool: 0 }, 0.12 + ((n * 0.29) % 0.76)));
      s = run(s, 14);
      if (s.status === 'gameover') break;
    }
    let prev = -1;
    let f = 0;
    while (prev !== s.holds.length && f < 1800) {
      prev = s.holds.length;
      s = run(s, 120);
      f += 120;
    }
    return run(s, 600);
  }

  const settled = pile(3);

  it('たくさん積める（確認の手段が成立している）', () => {
    expect(settled.holds.length).toBeGreaterThan(10);
    expect(settled.status).toBe('playing');
  });

  it('箱からはみ出さない', () => {
    expect(outsideCount(settled)).toBe(0);
  });

  it('ホールドどうしが深くめり込まない', () => {
    let worst = 0;
    for (let i = 0; i < settled.holds.length; i += 1) {
      for (let j = i + 1; j < settled.holds.length; j += 1) {
        const c = collide(settled.holds[i], settled.holds[j]);
        if (!c) continue;
        const small = Math.min(
          shapeOf(settled.holds[i].tier).bound,
          shapeOf(settled.holds[j].tier).bound,
        );
        worst = Math.max(worst, c.depth / small);
      }
    }
    // めり込みは小さい方の外接円の1割まで
    expect(worst).toBeLessThan(0.1);
  });

  /**
   * **落ち着いた山は勝手に動かない。**
   *
   * 摩擦が低いと、積んだ山が砂利のように**ゆっくり流れ続ける**。
   * 実測では摩擦0.35のとき、落ち着いた山を30秒放置しただけで
   * 勝手に6回合体し、最大0.16（箱の16%）崩れた
   */
  it('放置しても勝手に崩れない・勝手に合体しない', () => {
    const before = settled;
    const after = run(before, 60 * 30); // 30秒
    expect(after.holds.length).toBe(before.holds.length);
    let drift = 0;
    for (const h of after.holds) {
      const p = before.holds.find((q) => q.id === h.id);
      if (p) drift = Math.max(drift, Math.hypot(h.x - p.x, h.y - p.y));
    }
    expect(drift).toBeLessThan(boundOf(0));
  }, 120000);

  it('最高速でぶつかっても相手を通り抜けない', () => {
    const r = shapeOf(0).bound;
    const floor: Placed[] = [];
    for (let i = 0; i < 7; i += 1) floor.push({ tier: 0, x: 0.08 + i * 0.14, y: BOX_H - r });
    let s = place(initialState(1), [...floor, { tier: MAX_TIER, x: 0.5, y: 0.3, vy: 40 }]);
    for (let i = 0; i < 180; i += 1) {
      s = step(s, FRAME);
      expect(outsideCount(s)).toBe(0);
    }
  });

  it('サブステップを減らしても箱から出ない（低速端末の縮退）', () => {
    let s = place(initialState(1), [{ tier: MAX_TIER, x: 0.5, y: 0.3, vy: 30 }]);
    for (let i = 0; i < 180; i += 1) {
      s = step(s, FRAME, 1);
      expect(outsideCount(s)).toBe(0);
    }
  });
});

describe('落下予測線', () => {
  it('何も無ければ床の近くまで届く', () => {
    const s = aimAt(initialState(1), 0.5);
    expect(dropPreviewY(s)).toBeGreaterThan(BOX_H * 0.7);
  });

  it('真下にホールドがあれば、その上で止まる', () => {
    const s = aimAt(place(initialState(1), [{ tier: 4, x: 0.5, y: BOX_H - shapeOf(4).bound }]), 0.5);
    expect(dropPreviewY(s)).toBeLessThan(BOX_H - shapeOf(4).bound);
  });

  it('落とす位置より上には行かない', () => {
    const s = aimAt(place(initialState(1), [{ tier: 4, x: 0.5, y: 0.2 }]), 0.5);
    expect(dropPreviewY(s)).toBeGreaterThanOrEqual(DROP_Y);
  });
});

describe('進行の不変条件', () => {
  it('同じ種からは同じ並びが出る（静的書き出しと食い違わせない）', () => {
    expect(nextRandom(7)).toEqual(nextRandom(7));
  });

  it('遊び続けても id が重複しない', () => {
    // **「見た id の総数」では数えられない**（合体で消えたものは観測できない）。
    // 同じ瞬間に同じ id が2つ無いこと、と id が使い回されないことを見る
    let s = initialState(1);
    let maxId = 0;
    for (let n = 0; n < 40; n += 1) {
      s = drop(aimAt({ ...s, dropCool: 0 }, 0.2 + ((n * 0.31) % 0.6)));
      s = run(s, 20);
      const ids = s.holds.map((h) => h.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toBeLessThan(s.nextId);
        maxId = Math.max(maxId, id);
      }
    }
    expect(maxId).toBeGreaterThan(0);
  });

  it('スコアは減らない', () => {
    let s = initialState(1);
    let last = 0;
    for (let n = 0; n < 40; n += 1) {
      s = drop(aimAt({ ...s, dropCool: 0 }, 0.2 + ((n * 0.31) % 0.6)));
      s = run(s, 20);
      expect(s.score).toBeGreaterThanOrEqual(last);
      last = s.score;
    }
  });

  it('進めても元の状態を書き換えない（純関数）', () => {
    const s = place(initialState(1), [{ tier: 2, x: 0.5, y: 0.5 }]);
    const snapshot = JSON.stringify(s);
    run(s, 30);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('dt が飛んでも壊れない（タブを戻したときの一撃）', () => {
    const s = step(place(initialState(1), [{ tier: 2, x: 0.5, y: 0.5 }]), 10);
    expect(Number.isFinite(s.holds[0].y)).toBe(true);
    expect(outsideCount(s)).toBe(0);
  });

  it('やり直すと最初に戻る', () => {
    expect(restart(1)).toEqual(initialState(1));
  });

  it('警告はラインを超えているあいだだけ出る', () => {
    expect(isWarning(initialState(1))).toBe(false);
  });
});

describe('確認用（?debug=1）', () => {
  it('11段を並べられる', () => {
    expect(debugLadder(initialState(1)).holds).toHaveLength(11);
  });

  it('山を作れて、その山が箱に収まる', () => {
    const s = run(debugFill(initialState(1), 60), 600);
    expect(s.holds.length).toBeGreaterThan(20);
    expect(outsideCount(s)).toBe(0);
  });
});
