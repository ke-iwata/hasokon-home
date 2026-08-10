/**
 * 2048系スライド合体パズルのロジック
 *
 * 盤面は長さ16の配列（4x4、0 = 空き、それ以外はタイルの数字）。
 * index = row * 4 + col。
 *
 * スライドは「1行ぶんの配列を左に詰めて合体する」処理に還元する。
 * 右・上・下は行の取り出し方（向き）を変えて同じ処理を使う。
 * 1回のスライドで同じタイルが2度合体しないのは本家と同じ仕様
 * （[2,2,4] を左に寄せると [4,4] で止まり、[8] にはならない）。
 *
 * 本家2048はMITライセンスで公開されており、ルール自体に権利は主張されていない。
 */

export type Board2048 = number[];
export type Direction = 'left' | 'right' | 'up' | 'down';

/** タイル1枚の移動。合体は2つの from が同じ to を持つ */
export interface TileMove {
  from: number;
  to: number;
  /** この移動の到達先で合体が起きるか（アニメーション後に値を差し替える合図） */
  merged: boolean;
}

export interface SlideResult {
  board: Board2048;
  /** このスライドで合体してできたタイルの合計（スコア加算分） */
  gained: number;
  /** 1枚でもタイルが動いたか。動いていないスライドは無効（新タイルも湧かない） */
  moved: boolean;
  /** UIのスライドアニメーション用。全タイルの移動元→移動先（盤面index） */
  moves: TileMove[];
}

/**
 * 1列を左に詰めて合体する。長さ4を保つ。
 * sources[k] は「出力スロットkに入った入力位置」の一覧（合体なら2要素）。
 */
export function slideLine(line: number[]): {
  line: number[];
  gained: number;
  sources: number[][];
} {
  // 位置付きで詰める
  const packed: { v: number; src: number }[] = [];
  line.forEach((v, i) => {
    if (v !== 0) packed.push({ v, src: i });
  });
  const out: number[] = [];
  const sources: number[][] = [];
  let gained = 0;
  for (let i = 0; i < packed.length; i += 1) {
    if (i + 1 < packed.length && packed[i].v === packed[i + 1].v) {
      const merged = packed[i].v * 2;
      out.push(merged);
      sources.push([packed[i].src, packed[i + 1].src]);
      gained += merged;
      i += 1; // 合体に使った次のタイルを飛ばす（二重合体の防止）
    } else {
      out.push(packed[i].v);
      sources.push([packed[i].src]);
    }
  }
  while (out.length < 4) {
    out.push(0);
    sources.push([]);
  }
  return { line: out, gained, sources };
}

/** 方向ごとの「行の取り出し順」。left を基準に、他は並びを変えて同じ処理を通す */
const LINE_INDICES: Record<Direction, number[][]> = {
  left: [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
  ],
  right: [
    [3, 2, 1, 0],
    [7, 6, 5, 4],
    [11, 10, 9, 8],
    [15, 14, 13, 12],
  ],
  up: [
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
  ],
  down: [
    [12, 8, 4, 0],
    [13, 9, 5, 1],
    [14, 10, 6, 2],
    [15, 11, 7, 3],
  ],
};

/** 盤面を指定方向にスライドする（新タイルは湧かせない） */
export function slide(board: Board2048, dir: Direction): SlideResult {
  const next = [...board];
  let gained = 0;
  let moved = false;
  const moves: TileMove[] = [];
  for (const indices of LINE_INDICES[dir]) {
    const line = indices.map((i) => board[i]);
    const r = slideLine(line);
    gained += r.gained;
    indices.forEach((boardIndex, k) => {
      if (next[boardIndex] !== r.line[k]) moved = true;
      next[boardIndex] = r.line[k];
      for (const src of r.sources[k]) {
        moves.push({
          from: indices[src],
          to: boardIndex,
          merged: r.sources[k].length === 2,
        });
      }
    });
  }
  return { board: next, gained, moved, moves };
}

/**
 * 空きマスに新しいタイルを湧かせる。90%で2、10%で4（本家と同じ確率）。
 * 空きがなければそのまま返す。
 */
export function spawn(board: Board2048, rng: () => number = Math.random): Board2048 {
  const empty = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i !== -1);
  if (empty.length === 0) return board;
  const next = [...board];
  next[empty[Math.floor(rng() * empty.length)]] = rng() < 0.9 ? 2 : 4;
  return next;
}

/** どの方向にも動かせなくなったらゲームオーバー */
export function canMove(board: Board2048): boolean {
  return (['left', 'right', 'up', 'down'] as Direction[]).some(
    (d) => slide(board, d).moved,
  );
}

/** 2048のタイルができているか（勝利。続行は可能） */
export function hasWon(board: Board2048): boolean {
  return board.some((v) => v >= 2048);
}

/** 初期盤面（タイル2枚でスタート） */
export function newBoard(rng: () => number = Math.random): Board2048 {
  return spawn(spawn(new Array(16).fill(0), rng), rng);
}
