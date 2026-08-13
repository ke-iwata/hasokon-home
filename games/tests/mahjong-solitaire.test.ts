import { describe, expect, it } from 'vitest';
import { seededRng } from '@/lib/cards';
import {
  arrange,
  availableMatches,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  cleared,
  deadlocked,
  deal,
  freeSlots,
  hint,
  isFree,
  LAYOUT_SIZE,
  newGame,
  presentSlots,
  remaining,
  shuffleRemaining,
  tap,
  TILE_SPAN,
  TURTLE_LAYOUT,
  undo,
  type MahjongState,
} from '@/lib/mahjong-solitaire';
import {
  BONUS_FACES,
  COPIES,
  faceById,
  facesMatch,
  STANDARD_FACES,
  TILE_COUNT,
  TILE_FACES,
  TILE_MULTISET,
} from '@/lib/mahjong-tiles';

/**
 * 麻雀ソリティア（docs/features/game-mahjong-solitaire.md）のテスト。
 *
 * いちばん大事なのは「生成した盤面は必ずクリアできる」を繰り返し確かめること。
 * 生成器が壊れても遊んでみるまで気づけない類のバグなので、
 * ナンプレ・ノノグラムが出題の妥当性をテストしているのと同じ位置づけで入れている。
 */

/** 全部のマスが埋まった present 配列 */
function fullBoard(): boolean[] {
  return new Array<boolean>(LAYOUT_SIZE).fill(true);
}

/** 座標からマス番号を引く（テストで特定の牌を名指しするため） */
function slotAt(layer: number, x: number, y: number): number {
  const i = TURTLE_LAYOUT.findIndex((s) => s.layer === layer && s.x === x && s.y === y);
  expect(i, `そんな座標のマスは無い: [${layer}, ${x}, ${y}]`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('牌の定義', () => {
  it('4枚ずつ入るのは34種（数牌27＋字牌7）', () => {
    expect(STANDARD_FACES).toHaveLength(34);
    expect(new Set(STANDARD_FACES.map((f) => f.id)).size).toBe(34);
  });

  it('34種×4枚でちょうど136枚になる', () => {
    const standard = TILE_MULTISET.filter((id) => faceById(id).suit !== 'flower' && faceById(id).suit !== 'season');
    expect(standard).toHaveLength(34 * COPIES);
    expect(standard).toHaveLength(136);
    for (const face of STANDARD_FACES) {
      expect(standard.filter((id) => id === face.id), `${face.name} の枚数`).toHaveLength(COPIES);
    }
  });

  it('花牌4種・季節牌4種が1枚ずつ入り、合わせて144枚になる', () => {
    expect(BONUS_FACES).toHaveLength(8);
    for (const face of BONUS_FACES) {
      expect(TILE_MULTISET.filter((id) => id === face.id)).toHaveLength(1);
    }
    expect(TILE_COUNT).toBe(144);
    expect(TILE_MULTISET).toHaveLength(144);
  });

  it('絵柄IDは全種類で重複しない', () => {
    expect(new Set(TILE_FACES.map((f) => f.id)).size).toBe(TILE_FACES.length);
  });

  it('知らないIDを引くと投げる（壊れた盤面を黙って描かない）', () => {
    expect(() => faceById('m10')).toThrow(/知らない牌/);
  });
});

describe('合わせ判定', () => {
  it('通常の牌は同じ絵柄どうしでしか合わない', () => {
    expect(facesMatch('m1', 'm1')).toBe(true);
    expect(facesMatch('m1', 'm2')).toBe(false);
    expect(facesMatch('m1', 'p1')).toBe(false);
    expect(facesMatch('we', 'ws')).toBe(false);
  });

  it('花牌は同じ組の別の牌と合う', () => {
    expect(facesMatch('f-plum', 'f-bamboo')).toBe(true);
    expect(facesMatch('f-orchid', 'f-chrys')).toBe(true);
  });

  it('季節牌も同じ組の別の牌と合う', () => {
    expect(facesMatch('k-spring', 'k-winter')).toBe(true);
  });

  it('花牌と季節牌は組が違うので合わない', () => {
    expect(facesMatch('f-plum', 'k-spring')).toBe(false);
  });

  it('花牌・季節牌は通常の牌とは合わない', () => {
    expect(facesMatch('f-plum', 'm1')).toBe(false);
    expect(facesMatch('k-spring', 'dc')).toBe(false);
  });
});

describe('亀レイアウト', () => {
  it('144マスあり、牌の枚数とちょうど一致する', () => {
    expect(LAYOUT_SIZE).toBe(144);
    expect(LAYOUT_SIZE).toBe(TILE_COUNT);
  });

  it('段ごとの枚数が 87 / 36 / 16 / 4 / 1', () => {
    const perLayer = [0, 1, 2, 3, 4].map(
      (l) => TURTLE_LAYOUT.filter((s) => s.layer === l).length,
    );
    expect(perLayer).toEqual([87, 36, 16, 4, 1]);
  });

  it('同じ段の牌どうしは重ならない', () => {
    for (let i = 0; i < TURTLE_LAYOUT.length; i++) {
      for (let j = i + 1; j < TURTLE_LAYOUT.length; j++) {
        const a = TURTLE_LAYOUT[i];
        const b = TURTLE_LAYOUT[j];
        if (a.layer !== b.layer) continue;
        const overlap =
          Math.abs(a.x - b.x) < TILE_SPAN && Math.abs(a.y - b.y) < TILE_SPAN;
        expect(overlap, `[${a.layer},${a.x},${a.y}] と [${b.layer},${b.x},${b.y}] が重なる`).toBe(
          false,
        );
      }
    }
  });

  it('上の段の牌はかならず下の段の牌に乗っている（宙に浮かない）', () => {
    for (const s of TURTLE_LAYOUT) {
      if (s.layer === 0) continue;
      const supported = TURTLE_LAYOUT.some(
        (t) =>
          t.layer === s.layer - 1 &&
          Math.abs(t.x - s.x) < TILE_SPAN &&
          Math.abs(t.y - s.y) < TILE_SPAN,
      );
      expect(supported, `[${s.layer},${s.x},${s.y}] が宙に浮いている`).toBe(true);
    }
  });

  it('すべてのマスが盤面の枠に収まる', () => {
    for (const s of TURTLE_LAYOUT) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + TILE_SPAN).toBeLessThanOrEqual(BOARD_WIDTH);
      expect(s.y + TILE_SPAN).toBeLessThanOrEqual(BOARD_HEIGHT);
    }
  });
});

describe('選択可能の判定', () => {
  it('左右が塞がった牌は選べない', () => {
    const present = fullBoard();
    // 最下段いちばん上の列（x=2〜24）の真ん中。左右どちらにも同じ段の牌がある
    const middle = slotAt(0, 12, 0);
    expect(isFree(present, middle)).toBe(false);

    // 右どなりを外すと選べるようになる
    present[slotAt(0, 14, 0)] = false;
    expect(isFree(present, middle)).toBe(true);
  });

  it('列の端は片側が空いているので最初から選べる', () => {
    const present = fullBoard();
    expect(isFree(present, slotAt(0, 2, 0))).toBe(true);
    expect(isFree(present, slotAt(0, 24, 0))).toBe(true);
  });

  it('上に牌が乗っている牌は、左右が空いていても選べない', () => {
    const present = fullBoard();
    const under = slotAt(0, 8, 2);

    // 右どなりを外して「左右のどちらかが空いている」を満たさせても、
    // 上に2段目が乗っているうちは選べない
    present[slotAt(0, 10, 2)] = false;
    expect(isFree(present, under)).toBe(false);

    present[slotAt(1, 8, 2)] = false;
    expect(isFree(present, under)).toBe(true);
  });

  it('2つ上の段に乗られていても選べない（真上だけを見ていない）', () => {
    const present = fullBoard();
    const under = slotAt(2, 12, 6);

    // 同じ段の左右と、真上の3段目まで外す。残るのは5段目の1枚だけ
    present[slotAt(2, 10, 6)] = false;
    present[slotAt(2, 14, 6)] = false;
    present[slotAt(3, 12, 6)] = false;
    expect(isFree(present, under)).toBe(false);

    present[slotAt(4, 13, 7)] = false;
    expect(isFree(present, under)).toBe(true);
  });

  it('いちばん上の1枚（5段目）は最初から選べる', () => {
    expect(isFree(fullBoard(), slotAt(4, 13, 7))).toBe(true);
  });

  it('亀の尾（右の2枚）は外側から順にしか取れない', () => {
    const present = fullBoard();
    const outer = slotAt(0, 28, 7);
    const inner = slotAt(0, 26, 7);
    expect(isFree(present, outer)).toBe(true);
    expect(isFree(present, inner)).toBe(false);

    present[outer] = false;
    expect(isFree(present, inner)).toBe(true);
  });

  it('場に無い牌は選べない', () => {
    const present = fullBoard();
    present[0] = false;
    expect(isFree(present, 0)).toBe(false);
  });

  it('最初から選べる牌が2枚以上ある（開始直後に詰んでいない）', () => {
    expect(freeSlots(fullBoard()).length).toBeGreaterThanOrEqual(2);
  });
});

describe('配り方（必ずクリアできること）', () => {
  it('配った144枚が 34種×4枚＋花牌4枚＋季節牌4枚 ちょうどになる', () => {
    const { faces } = deal(seededRng(1));
    expect(faces).toHaveLength(144);

    for (const face of STANDARD_FACES) {
      expect(faces.filter((id) => id === face.id), `${face.name} の枚数`).toHaveLength(COPIES);
    }
    for (const face of BONUS_FACES) {
      expect(faces.filter((id) => id === face.id), `${face.name} の枚数`).toHaveLength(1);
    }
  });

  it('消し順は72組で、すべてのマスをちょうど1回ずつ使う', () => {
    const { solution } = deal(seededRng(2));
    expect(solution).toHaveLength(72);
    expect(new Set(solution.flat()).size).toBe(144);
  });

  it('消し順の各組は合う2枚になっている', () => {
    const { faces, solution } = deal(seededRng(3));
    for (const [a, b] of solution) {
      expect(facesMatch(faces[a], faces[b]), `${faces[a]} と ${faces[b]}`).toBe(true);
    }
  });

  /**
   * 仕様書がいちばん重く見ているテスト。
   * 生成した盤面を、生成が返した順で消していくと必ず全部消せる。
   * 途中で「その牌はいま取れない」が1度でも起きたら落ちる。
   */
  it('100回配って、そのすべてが返された順で全消しできる', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { faces, solution } = deal(seededRng(seed));
      let state: MahjongState = {
        faces,
        present: fullBoard(),
        removed: [],
        selected: null,
      };

      for (const [a, b] of solution) {
        expect(isFree(state.present, a), `seed=${seed}: ${a} が取れない`).toBe(true);
        expect(isFree(state.present, b), `seed=${seed}: ${b} が取れない`).toBe(true);

        const first = tap(state, a);
        expect(first.result).toBe('selected');
        const second = tap(first.state, b);
        expect(second.result, `seed=${seed}: ${faces[a]} と ${faces[b]} が合わない`).toBe('matched');
        state = second.state;
      }

      expect(cleared(state), `seed=${seed}: 消し残りがある`).toBe(true);
    }
  });

  it('配るたびに違う盤面になる（同じ配置を配り続けない）', () => {
    const a = deal(seededRng(11)).faces.join(',');
    const b = deal(seededRng(12)).faces.join(',');
    expect(a).not.toBe(b);
  });

  it('newGame は144枚すべてが場にある状態から始まる', () => {
    const state = newGame(seededRng(7));
    expect(remaining(state)).toBe(144);
    expect(state.removed).toEqual([]);
    expect(state.selected).toBeNull();
    expect(cleared(state)).toBe(false);
    expect(deadlocked(state)).toBe(false);
  });
});

describe('タップの遷移', () => {
  const start = () => newGame(seededRng(21));

  it('選べない牌を押しても何も起きない', () => {
    const state = start();
    const blocked = state.present.findIndex((_, i) => !isFree(state.present, i));
    const { state: next, result } = tap(state, blocked);
    expect(result).toBe('ignored');
    expect(next).toBe(state);
  });

  it('選べる牌を押すと選択、もう一度押すと選択解除', () => {
    const state = start();
    const [first] = freeSlots(state.present);
    const selected = tap(state, first);
    expect(selected.result).toBe('selected');
    expect(selected.state.selected).toBe(first);

    const off = tap(selected.state, first);
    expect(off.result).toBe('deselected');
    expect(off.state.selected).toBeNull();
  });

  it('合う2枚を続けて押すと2枚とも消える', () => {
    const state = start();
    const [a, b] = availableMatches(state)[0];
    const after = tap(tap(state, a).state, b);
    expect(after.result).toBe('matched');
    expect(after.state.present[a]).toBe(false);
    expect(after.state.present[b]).toBe(false);
    expect(remaining(after.state)).toBe(142);
    expect(after.state.selected).toBeNull();
    expect(after.state.removed).toEqual([[a, b]]);
  });

  it('合わない牌を押すと、選択が後から押したほうに移る', () => {
    const state = start();
    const free = freeSlots(state.present);
    const a = free[0];
    const b = free.find((i) => i !== a && !facesMatch(state.faces[a], state.faces[i]));
    expect(b, '合わない組が見つからない').toBeDefined();

    const after = tap(tap(state, a).state, b as number);
    expect(after.result).toBe('mismatched');
    expect(after.state.selected).toBe(b);
    expect(remaining(after.state)).toBe(144);
  });

  it('元の状態を書き換えない（純関数）', () => {
    const state = start();
    const before = [...state.present];
    const [a, b] = availableMatches(state)[0];
    tap(tap(state, a).state, b);
    expect(state.present).toEqual(before);
    expect(state.selected).toBeNull();
  });
});

describe('もどす', () => {
  it('直前に消した組が場に戻る', () => {
    const state = newGame(seededRng(31));
    const [a, b] = availableMatches(state)[0];
    const after = tap(tap(state, a).state, b).state;

    const back = undo(after);
    expect(back.present[a]).toBe(true);
    expect(back.present[b]).toBe(true);
    expect(remaining(back)).toBe(144);
    expect(back.removed).toEqual([]);
  });

  it('何も消していなければ何もしない', () => {
    const state = newGame(seededRng(32));
    expect(undo(state)).toBe(state);
  });

  it('消した回数ぶん戻せる', () => {
    let state = newGame(seededRng(33));
    for (let i = 0; i < 5; i++) {
      const [a, b] = availableMatches(state)[0];
      state = tap(tap(state, a).state, b).state;
    }
    expect(remaining(state)).toBe(134);

    for (let i = 0; i < 5; i++) state = undo(state);
    expect(remaining(state)).toBe(144);
    expect(state.removed).toEqual([]);
  });
});

describe('ヒントと詰み検出', () => {
  it('ヒントは実際に消せる組を返す', () => {
    const state = newGame(seededRng(41));
    const pair = hint(state, seededRng(1));
    expect(pair).not.toBeNull();
    const [a, b] = pair as [number, number];
    expect(isFree(state.present, a)).toBe(true);
    expect(isFree(state.present, b)).toBe(true);
    expect(facesMatch(state.faces[a], state.faces[b])).toBe(true);
  });

  it('選べる牌に合う組が無い盤面で詰みが立つ', () => {
    // 選べる牌が2枚だけ・その2枚が合わない、という盤面を手で組む
    const faces = new Array<string>(LAYOUT_SIZE).fill('m1');
    const present = new Array<boolean>(LAYOUT_SIZE).fill(false);
    const a = slotAt(0, 2, 0);
    const b = slotAt(0, 2, 14);
    present[a] = true;
    present[b] = true;
    faces[a] = 'm1';
    faces[b] = 'p9';

    const state: MahjongState = { faces, present, removed: [], selected: null };
    expect(freeSlots(present)).toEqual([a, b].sort((x, y) => x - y));
    expect(availableMatches(state)).toEqual([]);
    expect(deadlocked(state)).toBe(true);
    expect(hint(state)).toBeNull();
  });

  it('全部消えた盤面は詰みではなくクリア', () => {
    const state: MahjongState = {
      faces: new Array<string>(LAYOUT_SIZE).fill('m1'),
      present: new Array<boolean>(LAYOUT_SIZE).fill(false),
      removed: [],
      selected: null,
    };
    expect(cleared(state)).toBe(true);
    expect(deadlocked(state)).toBe(false);
  });

  it('花牌どうしは合う組として数えられる', () => {
    const faces = new Array<string>(LAYOUT_SIZE).fill('m1');
    const present = new Array<boolean>(LAYOUT_SIZE).fill(false);
    const a = slotAt(0, 2, 0);
    const b = slotAt(0, 2, 14);
    present[a] = true;
    present[b] = true;
    faces[a] = 'f-plum';
    faces[b] = 'f-chrys';

    const state: MahjongState = { faces, present, removed: [], selected: null };
    expect(availableMatches(state)).toEqual([[a, b].sort((x, y) => x - y)] as [number, number][]);
    expect(deadlocked(state)).toBe(false);
  });
});

describe('シャッフル', () => {
  it('枚数と絵柄の内訳は変わらない', () => {
    let state = newGame(seededRng(51));
    for (let i = 0; i < 10; i++) {
      const [a, b] = availableMatches(state)[0];
      state = tap(tap(state, a).state, b).state;
    }
    const before = state.present
      .flatMap((p, i) => (p ? [state.faces[i]] : []))
      .sort();

    const after = shuffleRemaining(state, seededRng(52));
    const shuffledFaces = after.present
      .flatMap((p, i) => (p ? [after.faces[i]] : []))
      .sort();

    expect(after.present).toEqual(state.present);
    expect(shuffledFaces).toEqual(before);
  });

  /**
   * 詰んだから押したのに詰んだまま、が起きないこと。
   *
   * シャッフルは `arrange` をそのまま通しているので、
   * 「途中まで消した盤面に配り直しても、返された順で全消しできる」を確かめれば
   * シャッフル後の配置がクリア可能であることの裏づけになる。
   * 同じ種を渡した `shuffleRemaining` が同じ絵柄を並べることも合わせて見る。
   */
  it('途中まで消した盤面に配り直しても、返された順で全消しできる（20回）', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let played = newGame(seededRng(seed));
      for (let i = 0; i < 12; i++) {
        const [a, b] = availableMatches(played)[0];
        played = tap(tap(played, a).state, b).state;
      }
      expect(remaining(played)).toBe(120);

      const slots = presentSlots(played);
      const { faces, solution } = arrange(
        slots,
        slots.map((i) => played.faces[i]),
        seededRng(seed + 500),
      );
      expect(solution).toHaveLength(60);

      let state: MahjongState = { ...played, faces, removed: [], selected: null };
      for (const [a, b] of solution) {
        const after = tap(tap(state, a).state, b);
        expect(after.result, `seed=${seed}: ${faces[a]} と ${faces[b]} が消せない`).toBe('matched');
        state = after.state;
      }
      expect(cleared(state), `seed=${seed}: 消し残りがある`).toBe(true);

      // shuffleRemaining は同じ種なら同じ結果になる（同じ arrange を通しているため）
      const shuffledBoard = shuffleRemaining(played, seededRng(seed + 500));
      for (const i of slots) expect(shuffledBoard.faces[i]).toBe(faces[i]);
      expect(deadlocked(shuffledBoard), `seed=${seed}: 並べ替えた直後に詰んでいる`).toBe(false);
    }
  });

  it('取り切れない残り方（上下に重なった2枚だけ）では盤面を触らない', () => {
    const faces = new Array<string>(LAYOUT_SIZE).fill('m1');
    const present = new Array<boolean>(LAYOUT_SIZE).fill(false);
    const under = slotAt(3, 12, 6);
    const over = slotAt(4, 13, 7);
    present[under] = true;
    present[over] = true;
    faces[under] = 'm1';
    faces[over] = 'p2';

    const state: MahjongState = { faces, present, removed: [], selected: null };
    const after = shuffleRemaining(state, seededRng(56));
    expect(after.faces).toEqual(faces);
    expect(after.present).toEqual(present);
  });

  it('もどす履歴は消える（戻した先の絵柄が変わっているため）', () => {
    let state = newGame(seededRng(53));
    const [a, b] = availableMatches(state)[0];
    state = tap(tap(state, a).state, b).state;
    expect(state.removed).toHaveLength(1);

    expect(shuffleRemaining(state, seededRng(54)).removed).toEqual([]);
  });

  it('場に牌が無ければ何もしない', () => {
    const state: MahjongState = {
      faces: new Array<string>(LAYOUT_SIZE).fill('m1'),
      present: new Array<boolean>(LAYOUT_SIZE).fill(false),
      removed: [],
      selected: null,
    };
    expect(shuffleRemaining(state, seededRng(55))).toBe(state);
  });
});
