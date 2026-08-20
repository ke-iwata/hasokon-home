import { describe, expect, it } from 'vitest';
import { seededRng } from '@/lib/cards';
import {
  arrange,
  availableMatches,
  buildPool,
  cleared,
  deadlocked,
  deal,
  findPath,
  hint,
  LEVELS,
  newGame,
  pointOf,
  presentSlots,
  remaining,
  removePair,
  shuffleRemaining,
  tap,
  tileCount,
  undo,
  type Level,
  type NikakudoriState,
  type Point,
} from '@/lib/nikakudori';
import { faceById, STANDARD_FACES } from '@/lib/mahjong-tiles';

/**
 * 二角取り（docs/features/game-nikakudori.md）のテスト。
 *
 * いちばん大事なのは「生成した盤面は必ずクリアできる」（`deal` の解答が実際に通ること）と、
 * 「牌構成が34種の偶数枚だけ」（花牌・季節牌が混ざっていないこと）を見張ること。
 * 経路探索は仕様がいちばん間違いやすいので、境界（0曲がり・1曲がり・2曲がり・
 * 盤外経由・遮蔽あり）を1つずつ固定した。
 */

const LEVEL_LIST: Level[] = ['small', 'medium', 'large'];

/** 便利：単一絵柄の空盤を作る */
function emptyBoard(cols: number, rows: number): (string | null)[] {
  return new Array<string | null>(cols * rows).fill(null);
}

/** 便利：faces のクローンに (r, c) へ牌を置く */
function place(
  faces: (string | null)[],
  cols: number,
  r: number,
  c: number,
  id: string,
): (string | null)[] {
  const next = [...faces];
  next[r * cols + c] = id;
  return next;
}

describe('難易度と牌数', () => {
  it('各難易度の牌数はすべて偶数で、4の倍数', () => {
    for (const level of LEVEL_LIST) {
      const n = tileCount(level);
      expect(n % 2, `${level}: 偶数でない`).toBe(0);
      expect(n % 4, `${level}: 4の倍数でない`).toBe(0);
    }
  });

  it('仕様書どおりのマス数（10×6=60 / 12×7=84 / 14×8=112）', () => {
    expect(tileCount('small')).toBe(60);
    expect(tileCount('medium')).toBe(84);
    expect(tileCount('large')).toBe(112);
  });

  it('使う絵柄は 34種のうちの kinds 種、各絵柄が4枚ずつ', () => {
    for (const level of LEVEL_LIST) {
      const pool = buildPool(level, seededRng(1));
      expect(pool).toHaveLength(tileCount(level));
      const counts = new Map<string, number>();
      for (const id of pool) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(counts.size).toBe(LEVELS[level].kinds);
      for (const [face, n] of counts) {
        expect(n, `${face}`).toBe(4);
      }
    }
  });

  it('花牌・季節牌は使わない（数牌27＋字牌7の34種のみ）', () => {
    const allowed = new Set(STANDARD_FACES.map((f) => f.id));
    for (const level of LEVEL_LIST) {
      const pool = buildPool(level, seededRng(2));
      for (const id of pool) {
        expect(allowed.has(id), `${id} は花牌・季節牌`).toBe(true);
        const suit = faceById(id).suit;
        expect(suit).not.toBe('flower');
        expect(suit).not.toBe('season');
      }
    }
  });
});

describe('経路探索（findPath）', () => {
  const cols = 6;
  const rows = 4;

  it('同じ行にまっすぐ（0曲がり）', () => {
    const faces = emptyBoard(cols, rows);
    const path = findPath(faces, cols, rows, { r: 1, c: 1 }, { r: 1, c: 4 });
    expect(path).not.toBeNull();
    expect(path).toEqual([
      { r: 1, c: 1 },
      { r: 1, c: 4 },
    ]);
  });

  it('同じ列にまっすぐ（0曲がり）', () => {
    const faces = emptyBoard(cols, rows);
    const path = findPath(faces, cols, rows, { r: 0, c: 2 }, { r: 3, c: 2 });
    expect(path).toEqual([
      { r: 0, c: 2 },
      { r: 3, c: 2 },
    ]);
  });

  it('途中に牌があると0曲がりは通らないが、迂回できるなら経路が立つ', () => {
    let faces = emptyBoard(cols, rows);
    faces = place(faces, cols, 1, 3, 'x');
    // 直線は通らないが、盤の外を経由した2曲がり経路（r=-1）が立つ
    const path = findPath(faces, cols, rows, { r: 1, c: 1 }, { r: 1, c: 4 });
    expect(path).not.toBeNull();
    // 経路は少なくとも角を2つ含む（コの字）
    expect((path as Point[]).length).toBe(4);
    // 直線（0曲がり）にはならないことも見張る
    const direct = (path as Point[]).length === 2;
    expect(direct).toBe(false);
  });

  it('直線が塞がっていて盤外にも出られないなら通らない', () => {
    // 上下も塞いで完全に囲む
    let faces = emptyBoard(cols, rows);
    // 直線経路 (1,2)(1,3) を塞ぐ
    faces = place(faces, cols, 1, 2, 'x');
    faces = place(faces, cols, 1, 3, 'x');
    // 上下の全マスを塞ぐ → 迂回できない
    for (let c = 0; c < cols; c++) {
      faces = place(faces, cols, 0, c, 'x');
      faces = place(faces, cols, 2, c, 'x');
    }
    // A/B の列（(0, 1) / (0, 4)）も塞がっているので、端点周りも通れない
    // A/B のマスだけ空きに戻す
    faces[1 * cols + 1] = null;
    faces[1 * cols + 4] = null;
    expect(findPath(faces, cols, rows, { r: 1, c: 1 }, { r: 1, c: 4 })).toBeNull();
  });

  it('L字（1曲がり）：角が空きマスなら通る', () => {
    const faces = emptyBoard(cols, rows);
    const path = findPath(faces, cols, rows, { r: 0, c: 0 }, { r: 3, c: 5 });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(3);
    // 角は (0,5) か (3,0) のどちらか
    const corner = (path as Point[])[1];
    const ok = (corner.r === 0 && corner.c === 5) || (corner.r === 3 && corner.c === 0);
    expect(ok, `想定外の角: ${JSON.stringify(corner)}`).toBe(true);
  });

  it('L字の角が牌で塞がっていると、もう片方の角が空きなら通る', () => {
    let faces = emptyBoard(cols, rows);
    // 両方の角 (0,5) と (3,0) のうち (0,5) を塞ぐ
    faces = place(faces, cols, 0, 5, 'x');
    const path = findPath(faces, cols, rows, { r: 0, c: 0 }, { r: 3, c: 5 });
    expect(path).not.toBeNull();
    expect((path as Point[])[1]).toEqual({ r: 3, c: 0 });
  });

  it('2曲がり：盤の中の水平経由でつながる', () => {
    let faces = emptyBoard(cols, rows);
    // A(0,0) と B(2,5) をつなぐ。L字の角 (0,5)・(2,0) を両方塞いで、2曲がりに追い込む
    faces = place(faces, cols, 0, 5, 'x');
    faces = place(faces, cols, 2, 0, 'x');
    // 途中の空きの水平/垂直経由で通れる（例：中央行 r=1 経由）
    const path = findPath(faces, cols, rows, { r: 0, c: 0 }, { r: 2, c: 5 });
    expect(path).not.toBeNull();
    expect((path as Point[]).length).toBe(4);
  });

  it('2曲がり：盤の外を経由してつながる', () => {
    let faces = emptyBoard(cols, rows);
    // A(1,0) と B(2,0) は隣り合う縦。1曲がりの角 (1,0)/(2,0) は端点。
    // 途中に壁 (1,1)(2,1) を置いて直線で通れないようにする
    // → 実は隣接なので (1,0)→(2,0) は0曲がりで通る。別のシチュエーションを作る
    // A(1,1) と B(2,1) の縦2マスを、その周囲を塞いで盤外経由でつなぐ
    for (let c = 0; c < cols; c++) {
      if (c === 1) continue;
      faces = place(faces, cols, 0, c, 'x');
      faces = place(faces, cols, 3, c, 'x');
    }
    // 中央の縦 (1,1)-(2,1) は「直線0曲がり」で隣り合っており通れる、これはOK
    expect(findPath(faces, cols, rows, { r: 1, c: 1 }, { r: 2, c: 1 })).not.toBeNull();

    // 盤外経由が必須のシチュエーション：A(0,0) と B(0,5)、間の (0,1)〜(0,4) を塞ぐ
    let boxed = emptyBoard(cols, rows);
    for (let c = 1; c <= 4; c++) boxed = place(boxed, cols, 0, c, 'x');
    // (1,0)〜(1,5) の中央行も塞いで、盤の中では L 字も 2曲がりも通れないようにする
    // → 盤外（r=-1）経由でしか繋がらない
    for (let c = 0; c < cols; c++) boxed = place(boxed, cols, 1, c, 'x');
    for (let c = 0; c < cols; c++) boxed = place(boxed, cols, 2, c, 'x');
    for (let c = 0; c < cols; c++) boxed = place(boxed, cols, 3, c, 'x');
    // A と B は空きマス、他は牌で埋まっている
    boxed[0 * cols + 0] = null;
    boxed[0 * cols + 5] = null;
    const path = findPath(boxed, cols, rows, { r: 0, c: 0 }, { r: 0, c: 5 });
    expect(path).not.toBeNull();
    // 経路のどこかの点で r=-1 を通る（盤の上を回る）
    expect((path as Point[]).some((p) => p.r === -1)).toBe(true);
  });

  it('遮蔽ありで通れない配置は null', () => {
    // A と B を「同じ絵柄で囲む」＝どの経路も塞がる
    let faces = emptyBoard(cols, rows);
    const a: Point = { r: 1, c: 1 };
    const b: Point = { r: 2, c: 2 };
    // A の周り8方向を塞ぐ（盤の中）
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = a.r + dr;
        const c = a.c + dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        faces = place(faces, cols, r, c, 'x');
      }
    }
    // 盤外に出るには A のとなり (0,1)(1,0)(1,2)(2,1) を通るが全て塞がっている
    faces[a.r * cols + a.c] = null;
    faces[b.r * cols + b.c] = null;
    expect(findPath(faces, cols, rows, a, b)).toBeNull();
  });

  it('端点は空きマスとして扱う（同じ絵柄の2枚は、その2枚以外を避けて通す）', () => {
    // A と B に牌がある状態で findPath を渡しても、端点は素通しとして扱われる
    let faces = emptyBoard(cols, rows);
    faces = place(faces, cols, 0, 0, 'm1');
    faces = place(faces, cols, 0, 5, 'm1');
    // A と B の間 (0,1)〜(0,4) は空きなので、まっすぐ通れる
    expect(findPath(faces, cols, rows, { r: 0, c: 0 }, { r: 0, c: 5 })).not.toBeNull();
  });

  it('同一点を渡すと null（消す組にならない）', () => {
    expect(findPath(emptyBoard(cols, rows), cols, rows, { r: 1, c: 1 }, { r: 1, c: 1 })).toBeNull();
  });
});

describe('配り方（必ずクリアできること）', () => {
  it('各難易度で、生成した消し順で全消しできる', () => {
    for (const level of LEVEL_LIST) {
      for (let seed = 1; seed <= 15; seed++) {
        const { faces, solution } = deal(level, seededRng(seed));
        const N = tileCount(level);
        expect(faces).toHaveLength(N);
        expect(solution.length * 2).toBe(N);
        // 消し順のマスがすべて重複なし
        expect(new Set(solution.flat()).size).toBe(N);

        // 実際に消していく
        const { cols, rows } = LEVELS[level];
        let state: NikakudoriState = {
          level,
          cols,
          rows,
          faces: [...faces],
          removed: [],
          selected: null,
          shuffles: 0,
          hints: 0,
        };
        for (const [a, b] of solution) {
          const first = tap(state, a);
          expect(first.result, `${level} seed=${seed}: ${a} を選べない`).toBe('selected');
          const second = tap(first.state, b);
          expect(second.result, `${level} seed=${seed}: ${a}-${b} が消せない`).toBe('matched');
          state = second.state;
        }
        expect(cleared(state), `${level} seed=${seed}: 消し残り`).toBe(true);
      }
    }
  });

  it('絵柄の内訳は 34種中 kinds 種の各4枚ずつ（花牌・季節牌は入らない）', () => {
    for (const level of LEVEL_LIST) {
      const { faces } = deal(level, seededRng(31));
      const counts = new Map<string, number>();
      for (const id of faces) if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(counts.size).toBe(LEVELS[level].kinds);
      for (const [face, n] of counts) {
        expect(n, `${face}`).toBe(4);
        const suit = faceById(face).suit;
        expect(suit).not.toBe('flower');
        expect(suit).not.toBe('season');
      }
    }
  });

  it('配るたびに違う盤面になる（同じ配置を配り続けない）', () => {
    const a = deal('small', seededRng(101)).faces.join(',');
    const b = deal('small', seededRng(102)).faces.join(',');
    expect(a).not.toBe(b);
  });

  it('newGame は満杯・未選択・履歴なしから始まる', () => {
    for (const level of LEVEL_LIST) {
      const state = newGame(level, seededRng(7));
      expect(remaining(state)).toBe(tileCount(level));
      expect(state.removed).toEqual([]);
      expect(state.selected).toBeNull();
      expect(state.shuffles).toBe(0);
      expect(state.hints).toBe(0);
      expect(cleared(state)).toBe(false);
      expect(deadlocked(state)).toBe(false);
    }
  });
});

describe('タップの遷移', () => {
  const start = () => newGame('small', seededRng(201));

  it('空きマスをタップしても何も起きない', () => {
    const state = start();
    // どこか1つ消して空きマスを作る
    const [a, b] = availableMatches(state)[0];
    const after = tap(tap(state, a).state, b).state;
    const empty = after.faces.findIndex((f) => f === null);
    const outcome = tap(after, empty);
    expect(outcome.result).toBe('ignored');
    expect(outcome.state).toBe(after);
  });

  it('選択→もう一度で解除、合う2枚で消せる、合わないなら選択が移る', () => {
    const state = start();
    const [a, b] = availableMatches(state)[0];

    const first = tap(state, a);
    expect(first.result).toBe('selected');
    expect(first.state.selected).toBe(a);

    // 同じ牌をもう一度：解除
    const off = tap(first.state, a);
    expect(off.result).toBe('deselected');
    expect(off.state.selected).toBeNull();

    // 合う相手を押すと消える
    const matched = tap(first.state, b);
    expect(matched.result).toBe('matched');
    expect(matched.state.faces[a]).toBeNull();
    expect(matched.state.faces[b]).toBeNull();
    expect(matched.state.removed).toHaveLength(1);
    expect(matched.state.selected).toBeNull();
    expect(matched.path).toBeDefined();
    expect((matched.path as Point[])[0]).toEqual(pointOf(state.cols, a));

    // 合わない相手を押すと選択が移る
    const slots = presentSlots(state);
    const bad = slots.find((i) => i !== a && state.faces[i] !== state.faces[a]);
    expect(bad).toBeDefined();
    const mis = tap(first.state, bad as number);
    expect(mis.result).toBe('mismatched');
    expect(mis.state.selected).toBe(bad);
  });

  it('元の state を書き換えない（純関数）', () => {
    const state = start();
    const before = [...state.faces];
    const [a, b] = availableMatches(state)[0];
    tap(tap(state, a).state, b);
    expect(state.faces).toEqual(before);
    expect(state.selected).toBeNull();
  });
});

describe('もどす', () => {
  it('直前に消した組が元の絵柄で戻る', () => {
    const state = newGame('small', seededRng(301));
    const [a, b] = availableMatches(state)[0];
    const face = state.faces[a];
    const after = tap(tap(state, a).state, b).state;
    expect(after.faces[a]).toBeNull();

    const back = undo(after);
    expect(back.faces[a]).toBe(face);
    expect(back.faces[b]).toBe(face);
    expect(back.removed).toEqual([]);
  });

  it('何も消していなければ何もしない', () => {
    const state = newGame('small', seededRng(302));
    expect(undo(state)).toBe(state);
  });

  it('消した回数ぶん戻せる（絵柄も含めて元通り）', () => {
    let state = newGame('small', seededRng(303));
    const initialFaces = [...state.faces];
    for (let i = 0; i < 4; i++) {
      const [a, b] = availableMatches(state)[0];
      state = tap(tap(state, a).state, b).state;
    }
    for (let i = 0; i < 4; i++) state = undo(state);
    expect(state.faces).toEqual(initialFaces);
    expect(state.removed).toEqual([]);
  });
});

describe('ヒントと詰み検出', () => {
  it('ヒントは実際に消せる組を返す', () => {
    const state = newGame('small', seededRng(401));
    const pair = hint(state, seededRng(1));
    expect(pair).not.toBeNull();
    const [a, b] = pair as [number, number];
    expect(state.faces[a]).toBe(state.faces[b]);
    expect(
      findPath(state.faces, state.cols, state.rows, pointOf(state.cols, a), pointOf(state.cols, b)),
    ).not.toBeNull();
  });

  it('消せる組が無い盤面で詰みが立つ', () => {
    // 空盤に「合わない2枚」だけ置く
    const { cols, rows } = LEVELS.small;
    const faces = emptyBoard(cols, rows);
    faces[0] = 'm1';
    faces[1] = 'p9';
    const state: NikakudoriState = {
      level: 'small',
      cols,
      rows,
      faces,
      removed: [],
      selected: null,
      shuffles: 0,
      hints: 0,
    };
    expect(availableMatches(state)).toEqual([]);
    expect(deadlocked(state)).toBe(true);
    expect(hint(state)).toBeNull();
  });

  it('全部消えた盤面は詰みではなくクリア', () => {
    const { cols, rows } = LEVELS.small;
    const state: NikakudoriState = {
      level: 'small',
      cols,
      rows,
      faces: emptyBoard(cols, rows),
      removed: [],
      selected: null,
      shuffles: 0,
      hints: 0,
    };
    expect(cleared(state)).toBe(true);
    expect(deadlocked(state)).toBe(false);
  });
});

describe('シャッフル（並べ替え）', () => {
  it('枚数と絵柄の内訳は変わらない', () => {
    let state = newGame('small', seededRng(501));
    for (let i = 0; i < 6; i++) {
      const [a, b] = availableMatches(state)[0];
      state = tap(tap(state, a).state, b).state;
    }
    const before = presentSlots(state)
      .map((i) => state.faces[i] as string)
      .sort();

    const after = shuffleRemaining(state, seededRng(502));
    // マスの集合は保存される（場に残るマス番号）
    expect(presentSlots(after)).toEqual(presentSlots(state));
    const shuffled = presentSlots(after)
      .map((i) => after.faces[i] as string)
      .sort();
    expect(shuffled).toEqual(before);
  });

  it('並べ替えたあとも消せる組が立つ（詰まない）', () => {
    // わざと詰み盤面を作って、並べ替えると解決するかを見る
    let state = newGame('small', seededRng(503));
    for (let i = 0; i < 10; i++) {
      const [a, b] = availableMatches(state)[0];
      state = tap(tap(state, a).state, b).state;
    }
    const shuffled = shuffleRemaining(state, seededRng(504));
    expect(shuffled.removed).toEqual([]);
    expect(shuffled.selected).toBeNull();
    expect(shuffled.shuffles).toBe(1);
    // 残っている牌があるうちは、並べ替え後に必ず消せる組が存在する
    expect(deadlocked(shuffled)).toBe(false);
  });

  it('もどす履歴は消える（戻した先の絵柄が変わるため）', () => {
    let state = newGame('small', seededRng(505));
    const [a, b] = availableMatches(state)[0];
    state = tap(tap(state, a).state, b).state;
    expect(state.removed).toHaveLength(1);
    expect(shuffleRemaining(state, seededRng(506)).removed).toEqual([]);
  });

  it('場に牌が無ければ何もしない（shuffles も増えない）', () => {
    const { cols, rows } = LEVELS.small;
    const state: NikakudoriState = {
      level: 'small',
      cols,
      rows,
      faces: emptyBoard(cols, rows),
      removed: [],
      selected: null,
      shuffles: 0,
      hints: 0,
    };
    const after = shuffleRemaining(state, seededRng(507));
    expect(after.shuffles).toBe(0);
    expect(after).toEqual({ ...state, selected: null });
  });
});

describe('removePair', () => {
  it('経路が立たない組は消せない（null を返す）', () => {
    // 「同じ絵柄だけど経路が立たない」状態を作る
    const { cols, rows } = LEVELS.small;
    let faces = emptyBoard(cols, rows);
    // A(1,1), B(3,3) を 'm1' に。周囲を 'x' で囲んで盤の中も外も届かないようにする
    faces = place(faces, cols, 1, 1, 'm1');
    faces = place(faces, cols, 3, 3, 'm1');
    // A の周り全部を塞ぐ（盤の外に出るとしても、どの1マスも通れない）
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = 1 + dr;
        const c = 1 + dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        faces = place(faces, cols, r, c, 'x');
      }
    }
    const state: NikakudoriState = {
      level: 'small',
      cols,
      rows,
      faces,
      removed: [],
      selected: null,
      shuffles: 0,
      hints: 0,
    };
    const aId = 1 * cols + 1;
    const bId = 3 * cols + 3;
    expect(removePair(state, aId, bId)).toBeNull();
  });
});

describe('arrange（残ったマスへの配り直し）', () => {
  /**
   * 途中まで消した盤面に対して、残りマスへ配り直すと、返された順で全消しできる。
   * `shuffleRemaining` の裏づけにもなる。
   */
  it('途中の盤面に配り直しても、返された順で全消しできる（10回）', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let played = newGame('small', seededRng(seed));
      for (let i = 0; i < 5; i++) {
        const [a, b] = availableMatches(played)[0];
        played = tap(tap(played, a).state, b).state;
      }
      const slots = presentSlots(played);
      const pool = slots.map((i) => played.faces[i] as string);
      const { faces, solution } = arrange(played.cols, played.rows, slots, pool, seededRng(seed + 900));

      let state: NikakudoriState = { ...played, faces, removed: [], selected: null };
      for (const [a, b] of solution) {
        const after = tap(tap(state, a).state, b);
        expect(after.result, `seed=${seed}: 経路が立たない`).toBe('matched');
        state = after.state;
      }
      expect(cleared(state)).toBe(true);
    }
  });
});
