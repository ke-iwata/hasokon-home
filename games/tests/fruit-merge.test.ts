import { describe, expect, it } from 'vitest';
import {
  aimAt,
  BOX_H,
  BOX_W,
  canDrop,
  CHAIN_MAX,
  CLEAR_BONUS,
  debugFill,
  drop,
  DROPPABLE_TIERS,
  DROP_INTERVAL,
  DROP_Y,
  dropPreviewY,
  FRUITS,
  initialState,
  isWarning,
  LINE_Y,
  MAX_TIER,
  mergePoints,
  nextRandom,
  OVER_LIMIT,
  radiusOf,
  restart,
  step,
  type Fruit,
  type FruitMergeState,
} from '@/lib/fruit-merge';

/**
 * フルーツ合体パズルのテスト。
 *
 * 仕様: docs/features/game-fruit-merge.md
 *
 * 見張っているのは**仕様書が「品質の肝」と書いた物理の積み上がり**
 * （震え・すり抜け）と、合体・連鎖・ゲームオーバーの進行。
 * 描画（canvas）は `app/fruit-merge/Game.tsx` にあり、ここには入らない。
 */

const FRAME = 1 / 60;

/** n フレーム進める */
function run(state: FruitMergeState, frames: number, substeps?: number): FruitMergeState {
  let s = state;
  for (let i = 0; i < frames; i += 1) s = step(s, FRAME, substeps);
  return s;
}

/** 置く果物の指定。`landed`（ラインをくぐったか）は省くと位置から決める */
type Placed = Omit<Fruit, 'id' | 'landed'> & { landed?: boolean };

/** 果物を直接置く（落とすのを待たずに局面を作るため） */
function place(state: FruitMergeState, put: Placed[]): FruitMergeState {
  return {
    ...state,
    fruits: put.map((f, i) => ({
      ...f,
      id: state.nextId + i,
      landed: f.landed ?? f.y - radiusOf(f.tier) > LINE_Y,
    })),
    nextId: state.nextId + put.length,
  };
}

/** その位置に落として、落ち着くまで進める */
function dropAt(state: FruitMergeState, x: number, frames = 120): FruitMergeState {
  return run(drop(aimAt({ ...state, dropCool: 0 }, x)), frames);
}

describe('果物の定義', () => {
  it('11段階ある（仕様書のルール2）', () => {
    expect(FRUITS).toHaveLength(11);
    expect(MAX_TIER).toBe(10);
  });

  it('段が上がるほど必ず大きくなる', () => {
    for (let i = 1; i < FRUITS.length; i += 1) {
      expect(FRUITS[i].r).toBeGreaterThan(FRUITS[i - 1].r);
    }
  });

  it('いちばん大きい果物でも箱の幅に収まる', () => {
    expect(radiusOf(MAX_TIER) * 2).toBeLessThan(BOX_W);
  });

  it('名前が重複していない（遊び方の案内で見分けがつく）', () => {
    expect(new Set(FRUITS.map((f) => f.name)).size).toBe(FRUITS.length);
  });

  /**
   * **商標の確認**（games/CLAUDE.md「名称の商標に注意する」と仕様書の冒頭）。
   * 同系ゲームの商品名になっている果物は、名前としても最大の段としても使わない
   */
  it('スイカを果物に入れていない', () => {
    for (const f of FRUITS) expect(f.name).not.toContain('スイカ');
  });

  /**
   * **色を使い回さない。** 同じ色の段が2つあると、離れた段どうしでも
   * 「合体する組」を探すときに見間違える（大きさは並んでいないと比べにくい）
   */
  it('段ごとに違う色を使っている', () => {
    expect(new Set(FRUITS.map((f) => f.light)).size).toBe(FRUITS.length);
  });

  it('隣り合う段は色と飾りの両方が同じにならない', () => {
    for (let i = 1; i < FRUITS.length; i += 1) {
      const a = FRUITS[i - 1];
      const b = FRUITS[i];
      expect(a.light === b.light && a.deco === b.deco).toBe(false);
    }
  });

  it('段の外を渡しても端の半径に丸める（描画で NaN にしない）', () => {
    expect(radiusOf(-3)).toBe(FRUITS[0].r);
    expect(radiusOf(99)).toBe(FRUITS[MAX_TIER].r);
  });
});

describe('乱数', () => {
  it('同じ種からは同じ並びが出る（静的書き出しと食い違わせない）', () => {
    const a = initialState(42);
    const b = initialState(42);
    expect([a.hold, a.next]).toEqual([b.hold, b.next]);
  });

  it('種が違えばいずれ違う手になる', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
      let st = initialState(s);
      const seq: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        st = { ...drop(aimAt(st, 0.5)), dropCool: 0 };
        seq.push(st.hold);
      }
      return seq.join(',');
    });
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('0以上1未満を返す', () => {
    let seed = 12345;
    for (let i = 0; i < 200; i += 1) {
      const r = nextRandom(seed);
      seed = r.seed;
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
    }
  });

  it('落ちてくるのは小さい方の5段階だけ（仕様書のルール4）', () => {
    let s = initialState(3);
    for (let i = 0; i < 200; i += 1) {
      expect(s.hold).toBeGreaterThanOrEqual(0);
      expect(s.hold).toBeLessThan(DROPPABLE_TIERS);
      expect(s.next).toBeLessThan(DROPPABLE_TIERS);
      s = { ...drop(aimAt(s, 0.5)), dropCool: 0, fruits: [] };
    }
  });
});

describe('落とす', () => {
  it('予告の果物が手元に来て、新しい予告を引く', () => {
    const s = initialState(9);
    const after = drop(s);
    expect(after.fruits).toHaveLength(1);
    expect(after.fruits[0].tier).toBe(s.hold);
    expect(after.hold).toBe(s.next);
  });

  it('落とす位置は壁を突き抜けない（半径ぶん内側に寄る）', () => {
    const left = drop(aimAt(initialState(1), -5));
    const right = drop(aimAt(initialState(1), 5));
    expect(left.fruits[0].x).toBeCloseTo(radiusOf(left.fruits[0].tier), 6);
    expect(right.fruits[0].x).toBeCloseTo(BOX_W - radiusOf(right.fruits[0].tier), 6);
  });

  it('連打しても間隔が空くまでは落ちない（果物が重なって生まれるのを防ぐ）', () => {
    const first = drop(initialState(1));
    expect(canDrop(first)).toBe(false);
    expect(drop(first).fruits).toHaveLength(1);
    const later = run(first, Math.ceil(DROP_INTERVAL * 60) + 1);
    expect(canDrop(later)).toBe(true);
    expect(drop(later).fruits).toHaveLength(2);
  });

  it('ゲームオーバー後は落とせない', () => {
    const over: FruitMergeState = { ...initialState(1), status: 'gameover' };
    expect(canDrop(over)).toBe(false);
    expect(drop(over)).toBe(over);
  });

  it('落とした果物は床まで落ちて止まる', () => {
    const s = dropAt(initialState(1), 0.5);
    const f = s.fruits[0];
    expect(f.y + radiusOf(f.tier)).toBeCloseTo(BOX_H, 2);
    expect(Math.hypot(f.vx, f.vy)).toBe(0);
  });
});

describe('合体', () => {
  it('同じ段どうしが触れると1段上になる', () => {
    const r = radiusOf(0);
    const s = run(
      place(initialState(1), [
        { tier: 0, x: 0.5 - r, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: 0, x: 0.5 + r, y: BOX_H - r, vx: 0, vy: 0 },
      ]),
      2,
    );
    expect(s.fruits).toHaveLength(1);
    expect(s.fruits[0].tier).toBe(1);
    expect(s.score).toBe(mergePoints(1));
  });

  it('段が違えば合体しない', () => {
    const s = run(
      place(initialState(1), [
        { tier: 0, x: 0.4, y: BOX_H - radiusOf(0), vx: 0, vy: 0 },
        { tier: 1, x: 0.4 + radiusOf(0) + radiusOf(1), y: BOX_H - radiusOf(1), vx: 0, vy: 0 },
      ]),
      60,
    );
    expect(s.fruits).toHaveLength(2);
    expect(s.score).toBe(0);
  });

  it('できあがった段が大きいほど点が高い（1,3,6,…,55）', () => {
    expect(mergePoints(1)).toBe(1);
    expect(mergePoints(2)).toBe(3);
    expect(mergePoints(3)).toBe(6);
    expect(mergePoints(MAX_TIER)).toBe(55);
  });

  /**
   * **1つの果物は1フレームに1度しか合体しない。** 3つ並んだときに玉突きで
   * 2回合体すると、どの組が合体したのかが見た目と食い違う
   */
  it('3つ並んでも一度に合体するのは1組だけ', () => {
    const r = radiusOf(2);
    const s = step(
      place(initialState(1), [
        { tier: 2, x: 0.5 - r * 2, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: 2, x: 0.5, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: 2, x: 0.5 + r * 2, y: BOX_H - r, vx: 0, vy: 0 },
      ]),
      FRAME,
    );
    expect(s.events).toHaveLength(1);
    expect(s.fruits.filter((f) => f.tier === 3)).toHaveLength(1);
    expect(s.fruits.filter((f) => f.tier === 2)).toHaveLength(1);
  });

  it('合体は演出用のイベントとして出る（状態に演出を持たせない）', () => {
    const r = radiusOf(0);
    const s = step(
      place(initialState(1), [
        { tier: 0, x: 0.5 - r, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: 0, x: 0.5 + r, y: BOX_H - r, vx: 0, vy: 0 },
      ]),
      FRAME,
    );
    expect(s.events).toHaveLength(1);
    expect(s.events[0].tier).toBe(1);
    expect(s.events[0].gain).toBe(mergePoints(1));
    expect(s.events[0].x).toBeCloseTo(0.5, 6);
  });

  it('イベントは次のフレームには残らない', () => {
    const r = radiusOf(0);
    const merged = step(
      place(initialState(1), [
        { tier: 0, x: 0.5 - r, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: 0, x: 0.5 + r, y: BOX_H - r, vx: 0, vy: 0 },
      ]),
      FRAME,
    );
    expect(step(merged, FRAME).events).toEqual([]);
  });

  it('最大どうしは消えてボーナスが入る（仕様書のルール2）', () => {
    const r = radiusOf(MAX_TIER);
    const s = step(
      place(initialState(1), [
        { tier: MAX_TIER, x: 0.5 - r * 0.99, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: MAX_TIER, x: 0.5 + r * 0.99, y: BOX_H - r, vx: 0, vy: 0 },
      ]),
      FRAME,
    );
    expect(s.fruits).toHaveLength(0);
    expect(s.score).toBe(CLEAR_BONUS);
    expect(s.cleared).toBe(1);
    expect(s.events[0].tier).toBe(-1);
  });
});

describe('連鎖', () => {
  /**
   * 床の2つが合体してできる1段上の果物が、真上に浮かべた同じ段と
   * ちょうど触れる並び。**1回の合体が次の合体を呼ぶ**＝連鎖になる
   */
  function chainSetup(): FruitMergeState {
    const r0 = radiusOf(0);
    const r1 = radiusOf(1);
    return place(initialState(1), [
      { tier: 0, x: 0.5 - r0, y: BOX_H - r0, vx: 0, vy: 0 },
      { tier: 0, x: 0.5 + r0, y: BOX_H - r0, vx: 0, vy: 0 },
      { tier: 1, x: 0.5, y: BOX_H - r0 - r1 * 2, vx: 0, vy: 0 },
    ]);
  }

  it('続けて合体すると連鎖が伸びる', () => {
    const s = run(chainSetup(), 30);
    expect(s.chain).toBeGreaterThanOrEqual(2);
    expect(s.fruits.some((f) => f.tier === 2)).toBe(true);
  });

  it('連鎖の倍率で点が上がる', () => {
    const chained = run(chainSetup(), 30);
    // 素点（1連鎖目の合体1つ＋2連鎖目の合体1つ）より必ず高くなる
    expect(chained.score).toBeGreaterThan(mergePoints(1) + mergePoints(2));
  });

  it('倍率には上限がある', () => {
    const s: FruitMergeState = { ...initialState(1), chain: 99, chainSec: 1 };
    const r = radiusOf(0);
    const merged = step(
      place(s, [
        { tier: 0, x: 0.5 - r, y: BOX_H - r, vx: 0, vy: 0 },
        { tier: 0, x: 0.5 + r, y: BOX_H - r, vx: 0, vy: 0 },
      ]),
      FRAME,
    );
    expect(merged.events[0].gain).toBe(mergePoints(1) * CHAIN_MAX);
  });

  it('間が空くと連鎖は切れる', () => {
    const s = run(chainSetup(), 30);
    expect(run(s, 90).chain).toBe(0);
  });
});

describe('ゲームオーバー', () => {
  /**
   * ラインの上にはみ出したまま止まる山を置く。
   *
   * **`landed` を立てておく**のがこの局面の要点。実際の遊びでは、
   * いったん積み上がった（＝ラインをくぐった）果物が下からの合体で
   * 押し上げられて危なくなる。落とした直後の果物とは違うことを、
   * ここで作り分けている
   */
  function overflowing(): FruitMergeState {
    const fruits: Placed[] = [];
    // 同じ段が隣り合うと合体して崩れるので、段違いで縦に積む
    let y = BOX_H;
    for (let i = 0; i < 12; i += 1) {
      const tier = 3 + (i % 2);
      const r = radiusOf(tier);
      y -= r;
      fruits.push({ tier, x: 0.5, y, vx: 0, vy: 0, landed: true });
      y -= r;
    }
    return place(initialState(1), fruits);
  }

  it('ラインを超えているあいだは警告が出る（突然死にしない）', () => {
    const s = run(overflowing(), 5);
    expect(isWarning(s)).toBe(true);
    expect(s.status).toBe('playing');
  });

  it('超えたまま一定時間たつと終わる', () => {
    const s = run(overflowing(), Math.ceil(OVER_LIMIT * 60) + 20);
    expect(s.status).toBe('gameover');
  });

  it('少し超えただけならすぐには終わらない', () => {
    const s = run(overflowing(), Math.floor(OVER_LIMIT * 60) - 20);
    expect(s.status).toBe('playing');
  });

  /**
   * **落とした直後の果物はラインより上にある。** これを判定に入れると
   * 落とした瞬間に警告が出て、遊びが成立しない
   */
  it('落とした直後の果物はラインの上でも判定に入らない', () => {
    const s = step(drop(aimAt(initialState(1), 0.5)), FRAME);
    expect(s.fruits[0].landed).toBe(false);
    expect(isWarning(s)).toBe(false);
    expect(s.overSec).toBe(0);
  });

  it('一度ラインをくぐった果物は判定に入る', () => {
    const s = dropAt(initialState(1), 0.5);
    expect(s.fruits[0].landed).toBe(true);
  });

  it('終わったあとは物理が動かない', () => {
    const over = run(overflowing(), Math.ceil(OVER_LIMIT * 60) + 20);
    const later = run(over, 60);
    expect(later.fruits.map((f) => f.y)).toEqual(over.fruits.map((f) => f.y));
    expect(later.score).toBe(over.score);
  });
});

/**
 * **仕様書が「品質の肝」と書いた部分。**
 * 公開の条件2「果物を60個積んだ状態で、震えとすり抜けが目視で出ない」を
 * 目視ではなく数値で見る
 */
describe('積み上がりの安定（公開の条件2）', () => {
  /**
   * 60個積んで落ち着かせた状態。**10秒ぶん進めてから測る**
   * （山が落ち着くまでにはそれだけかかる。5秒では崩れている最中を
   * 「震え」と読み違える）
   */
  const settled = run(debugFill(initialState(1), 60), 600);

  it('60個を自動配置できる（再現手段）', () => {
    // 置いた瞬間は重ならない＝指定した数がそのまま入る
    expect(debugFill(initialState(1), 60).fruits.length).toBe(60);
    // **60個の山のまま確かめられること。** 落ち着くあいだに同じ段が
    // 触れて合体するぶんはあるが、数個にとどまる
    expect(settled.fruits.length).toBeGreaterThanOrEqual(55);
  });

  it('ラインを超えない高さに収まる（60個でも遊びが終わらない）', () => {
    expect(settled.status).toBe('playing');
  });

  it('箱からはみ出さない（すり抜けが無い）', () => {
    for (const f of settled.fruits) {
      const r = radiusOf(f.tier);
      expect(f.x).toBeGreaterThanOrEqual(r - 1e-6);
      expect(f.x).toBeLessThanOrEqual(BOX_W - r + 1e-6);
      expect(f.y).toBeLessThanOrEqual(BOX_H - r + 1e-6);
    }
  });

  it('果物どうしが深くめり込まない', () => {
    for (let i = 0; i < settled.fruits.length; i += 1) {
      for (let j = i + 1; j < settled.fruits.length; j += 1) {
        const a = settled.fruits[i];
        const b = settled.fruits[j];
        const sum = radiusOf(a.tier) + radiusOf(b.tier);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // めり込みは半径の1割まで。これを超えると見た目で分かる
        expect(d).toBeGreaterThan(sum - Math.min(radiusOf(a.tier), radiusOf(b.tier)) * 0.1);
      }
    }
  });

  it('震えない（積んだ山がいつまでも動き続けない）', () => {
    const before = settled;
    const after = run(before, 60);
    const moved = after.fruits.map((f, i) => {
      const prev = before.fruits.find((p) => p.id === f.id);
      return prev ? Math.hypot(f.x - prev.x, f.y - prev.y) : 0;
    });
    // **落ち着いた山はぴたりと止まる。** 1秒で動いてよいのは
    // いちばん小さい果物の半径の1%まで（実測では完全に0になる）
    expect(Math.max(...moved)).toBeLessThan(radiusOf(0) * 0.01);
  });

  /**
   * **すり抜けない。** 最高速でぶつかっても相手を通り抜けないこと。
   * 横向きに撃つのは、落下と重力を混ぜると「押しのけて沈んだ」のか
   * 「貫いた」のか区別できなくなるため
   */
  it('最高速でぶつかった果物が相手を通り抜けない', () => {
    const light = radiusOf(0);
    const heavy = radiusOf(5);
    const s = run(
      place(initialState(1), [
        { tier: 0, x: 0.1, y: BOX_H - light, vx: 40, vy: 0 },
        { tier: 5, x: 0.6, y: BOX_H - heavy, vx: 0, vy: 0 },
      ]),
      120,
    );
    const bullet = s.fruits.find((f) => f.tier === 0) as Fruit;
    const target = s.fruits.find((f) => f.tier === 5) as Fruit;
    expect(bullet).toBeDefined();
    expect(target).toBeDefined();
    // 追い越していたら（右側に回り込んでいたら）貫通している
    expect(bullet.x).toBeLessThan(target.x);
  });

  /** 落下中の1フレームも箱の外に出ないこと（当たったあとだけ見ても分からない） */
  it('速く落ちてくるあいだ、どのフレームでも箱から出ない', () => {
    const r = radiusOf(0);
    const floor: Placed[] = [];
    for (let i = 0; i < 9; i += 1) {
      floor.push({ tier: i % 2, x: 0.06 + i * 0.1, y: BOX_H - r, vx: 0, vy: 0 });
    }
    let s = place(initialState(1), [
      ...floor,
      { tier: MAX_TIER, x: 0.5, y: 0.3, vx: 0, vy: 40 },
    ]);
    for (let i = 0; i < 180; i += 1) {
      s = step(s, FRAME);
      for (const f of s.fruits) {
        const fr = radiusOf(f.tier);
        expect(f.y).toBeLessThanOrEqual(BOX_H - fr + 1e-6);
        expect(f.x).toBeGreaterThanOrEqual(fr - 1e-6);
        expect(f.x).toBeLessThanOrEqual(BOX_W - fr + 1e-6);
      }
    }
  });

  it('サブステップを減らしても箱から出ない（低速端末の縮退）', () => {
    const s = run(debugFill(initialState(1), 60), 600, 2);
    for (const f of s.fruits) {
      const r = radiusOf(f.tier);
      expect(f.x).toBeGreaterThanOrEqual(r - 1e-6);
      expect(f.y).toBeLessThanOrEqual(BOX_H - r + 1e-6);
    }
  });
});

/**
 * **公開の条件3「1プレイが3〜10分に収まる」**を、機械で測れる形にしたもの。
 *
 * 実際の長さは「1手にどれだけ考えるか」で決まるので秒では測れない。
 * 代わりに**でたらめに置く相手が何手もつか**を見る。手つきの速さを
 * 1手1.5秒とすると、200手で約5分・400手で約10分に当たる。
 * 実機での確認は運営者が preview 段階で行う（仕様書の判定リスト）。
 */
describe('1プレイの長さ（公開の条件3）', () => {
  /** でたらめな位置に、落とせるようになり次第ずっと落とし続ける */
  function randomGame(seed: number): { drops: number; state: FruitMergeState } {
    let s = initialState(seed);
    let rng = seed ^ 0x5f3a;
    let drops = 0;
    // 20分ぶん回しても終わらなければ「終わらないゲーム」として落とす
    for (let i = 0; i < 60 * 60 * 20 && s.status === 'playing'; i += 1) {
      if (canDrop(s)) {
        const r = nextRandom(rng);
        rng = r.seed;
        s = drop(aimAt(s, r.value));
        drops += 1;
      }
      s = step(s, FRAME);
    }
    return { drops, state: s };
  }

  const games = [1001, 1039, 1077].map(randomGame);

  it('必ず終わる（積み上がらないまま延々と続かない）', () => {
    for (const g of games) expect(g.state.status).toBe('gameover');
  });

  it('でたらめに置いても200手はもつ（すぐ終わる難しさにしない）', () => {
    for (const g of games) expect(g.drops).toBeGreaterThan(200);
  });

  it('でたらめに置くだけでは1000手ももたない（歯ごたえが残る）', () => {
    for (const g of games) expect(g.drops).toBeLessThan(1000);
  });

  it('遊べば点が入る', () => {
    for (const g of games) expect(g.state.score).toBeGreaterThan(0);
  });
});

describe('落下予測線（遊びやすさ）', () => {
  it('何も無ければ床まで届く', () => {
    expect(dropPreviewY(aimAt(initialState(1), 0.5))).toBeCloseTo(BOX_H, 6);
  });

  it('真下に果物があれば、その上で止まる', () => {
    const base = dropAt(initialState(1), 0.5);
    const aimed = aimAt(base, 0.5);
    const y = dropPreviewY(aimed);
    expect(y).toBeLessThan(BOX_H);
    expect(y).toBeGreaterThan(base.fruits[0].y - radiusOf(base.fruits[0].tier) - 0.3);
  });

  it('横にずれていれば影響を受けない', () => {
    const base = dropAt(initialState(1), 0.1);
    expect(dropPreviewY(aimAt(base, 0.9))).toBeCloseTo(BOX_H, 6);
  });

  it('落とす位置より上には行かない', () => {
    const packed = run(debugFill(initialState(1), 60), 600);
    expect(dropPreviewY(aimAt(packed, 0.5))).toBeGreaterThanOrEqual(DROP_Y);
  });
});

describe('進行の不変条件', () => {
  it('遊び続けても果物の id が重複しない', () => {
    let s = initialState(5);
    for (let i = 0; i < 40; i += 1) {
      s = run(drop(aimAt({ ...s, dropCool: 0 }, 0.15 + (i % 7) * 0.11)), 30);
    }
    expect(new Set(s.fruits.map((f) => f.id)).size).toBe(s.fruits.length);
  });

  it('スコアは減らない', () => {
    let s = initialState(5);
    let last = 0;
    for (let i = 0; i < 40; i += 1) {
      s = run(drop(aimAt({ ...s, dropCool: 0 }, 0.15 + (i % 7) * 0.11)), 30);
      expect(s.score).toBeGreaterThanOrEqual(last);
      last = s.score;
    }
  });

  it('やり直すと最初に戻る', () => {
    const played = run(drop(aimAt(initialState(1), 0.5)), 120);
    const fresh = restart(1);
    expect(fresh.fruits).toEqual([]);
    expect(fresh.score).toBe(0);
    expect(fresh.status).toBe('playing');
    expect(played.fruits.length).toBeGreaterThan(0);
  });

  it('進めても元の状態を書き換えない（純関数）', () => {
    const s = dropAt(initialState(1), 0.5, 10);
    const snapshot = JSON.parse(JSON.stringify(s));
    run(s, 60);
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });

  it('dt が飛んでも壊れない（タブを戻したときの一撃）', () => {
    const s = step(dropAt(initialState(1), 0.5, 10), 30);
    for (const f of s.fruits) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(f.y).toBeLessThanOrEqual(BOX_H - radiusOf(f.tier) + 1e-6);
    }
  });

  it('落とす前の果物はラインより上にいる（そこで警告が出ない）', () => {
    const s = initialState(1);
    expect(DROP_Y + radiusOf(s.hold)).toBeLessThan(LINE_Y);
  });
});
