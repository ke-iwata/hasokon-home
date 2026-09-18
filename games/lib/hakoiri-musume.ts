/**
 * 箱入り娘（スライドブロックパズル）のロジック
 *
 * 仕様: docs/features/game-hakoiri-musume.md
 *
 * ## 持ち方
 *
 * 盤は横4×縦5の固定。駒は `{ id, kind, x, y }` の配列だけで持ち、大きさは
 * `kind` から引く（`PIECE_SIZE`）。**盤のマス目そのものは状態に持たない**
 * （駒から毎回組み立てる。二重に持つと、動かしたときにずれる）。
 *
 * 盤面データは文字の絵（`parseLayout`）で書く。`D`＝娘（2×2）・`T`＝縦長（1×2）・
 * `W`＝横長（2×1）・`S`＝小（1×1）・`.`＝空きで、読んでそのまま配置が分かる。
 *
 * ## 手数の数え方（仕様の肝）
 *
 * **駒1つを1回動かす＝1手。** スワイプ1回で空きが続く限り動くので、
 * 1手で何マス動いてもよい。ただしスワイプは一方向なので、
 * **角を曲がる移動は1手にならない**（縦に動かしてから横に動かすのは2手）。
 *
 * `legalMoves` はこの数え方に合わせて「駒ごとに、その駒が1方向に到達できる
 * 各位置」を1手として並べる。**1マスずつの遷移でBFSを回すと別の最短値が出る**ので、
 * ソルバーもここを通す。文献の「81手」は「角を曲がるのも1手」という別の定義の値で、
 * この実装の最短手数とは一致しない（仕様書の「手数の数え方」）。
 */

/** 盤の横幅（マス） */
export const BOARD_W = 4;
/** 盤の高さ（マス） */
export const BOARD_H = 5;

/** 駒の種類。伝統的な呼び名（父・母・番頭・丁稚）は盤上に出さないので持たない */
export type PieceKind = 'daughter' | 'tall' | 'wide' | 'small';

/** 駒の大きさ（マス） */
export const PIECE_SIZE: Record<PieceKind, { w: number; h: number }> = {
  daughter: { w: 2, h: 2 },
  tall: { w: 1, h: 2 },
  wide: { w: 2, h: 1 },
  small: { w: 1, h: 1 },
};

/** 種類ごとの持ち数（伝統的な標準形。全レベルで共通） */
export const PIECE_COUNT: Record<PieceKind, number> = {
  daughter: 1,
  tall: 4,
  wide: 1,
  small: 4,
};

/** 盤面データの文字表記 */
export const KIND_CHAR: Record<PieceKind, string> = {
  daughter: 'D',
  tall: 'T',
  wide: 'W',
  small: 'S',
};

/** 空きマスの文字 */
export const EMPTY_CHAR = '.';

const CHAR_KIND: Record<string, PieceKind> = {
  D: 'daughter',
  T: 'tall',
  W: 'wide',
  S: 'small',
};

/** 盤上の駒。`x` / `y` は左上のマス（0始まり） */
export interface Piece {
  id: string;
  kind: PieceKind;
  x: number;
  y: number;
}

/** 盤面。駒の並び（順番に意味はない） */
export type Board = readonly Piece[];

/** 動かす向き */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 向きの並び。ソルバーの結果を端末によらず同じにするため固定する */
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const;

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** 逆向き（「もどす」ではなく、ソルバーの検算に使う） */
export function opposite(dir: Direction): Direction {
  return dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left';
}

/** 1手。`steps` マス動かしても1手（上の「手数の数え方」） */
export interface Move {
  id: string;
  dir: Direction;
  steps: number;
}

/** 出口（下辺の中央2マス）に娘を下ろしたときの娘の左上のマス */
export const EXIT_X = 1;
export const EXIT_Y = BOARD_H - PIECE_SIZE.daughter.h;

/** 駒の大きさ */
export function sizeOf(piece: Piece): { w: number; h: number } {
  return PIECE_SIZE[piece.kind];
}

/** 駒が占めるマス */
export function pieceCells(piece: Piece): { x: number; y: number }[] {
  const { w, h } = sizeOf(piece);
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) out.push({ x: piece.x + dx, y: piece.y + dy });
  }
  return out;
}

/** 盤に収まっているか */
function inBoard(piece: Piece): boolean {
  const { w, h } = sizeOf(piece);
  return piece.x >= 0 && piece.y >= 0 && piece.x + w <= BOARD_W && piece.y + h <= BOARD_H;
}

/**
 * マス目に駒の添字を敷いた配列（空きは -1）。
 *
 * **1つの盤面につき1回だけ作って使い回す。** 駒ごと・向きごとに作り直すと、
 * ソルバーが同じ盤を何十回も敷き直すことになり、探索が目に見えて遅くなる。
 */
function indexGrid(board: Board): Int8Array {
  const grid = new Int8Array(BOARD_W * BOARD_H).fill(-1);
  for (let i = 0; i < board.length; i += 1) {
    for (const cell of pieceCells(board[i])) grid[cell.y * BOARD_W + cell.x] = i;
  }
  return grid;
}

/**
 * 敷いた盤を使って「その向きへ何マス動かせるか」を測る。
 * **自分のマスは空きとして扱う**（動かす先が自分の元いたマスに重なるため）。
 */
function slideLimit(board: Board, index: number, dir: Direction, grid: Int8Array): number {
  const piece = board[index];
  const { dx, dy } = DELTA[dir];
  const cells = pieceCells(piece);
  let steps = 0;
  for (;;) {
    const next = steps + 1;
    for (const { x, y } of cells) {
      const nx = x + dx * next;
      const ny = y + dy * next;
      if (nx < 0 || ny < 0 || nx >= BOARD_W || ny >= BOARD_H) return steps;
      const at = grid[ny * BOARD_W + nx];
      if (at !== -1 && at !== index) return steps;
    }
    steps = next;
  }
}

/** 駒を動かした盤面を作る（合法かどうかは見ない。内部用） */
function moveUnchecked(board: Board, index: number, dir: Direction, steps: number): Board {
  const { dx, dy } = DELTA[dir];
  const next = board.slice();
  const piece = next[index];
  next[index] = { ...piece, x: piece.x + dx * steps, y: piece.y + dy * steps };
  return next;
}

/** そのマスにある駒（無ければ null） */
export function pieceAt(board: Board, x: number, y: number): Piece | null {
  if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H) return null;
  for (const piece of board) {
    const { w, h } = sizeOf(piece);
    if (x >= piece.x && x < piece.x + w && y >= piece.y && y < piece.y + h) return piece;
  }
  return null;
}

/** id で駒を引く（無ければ null） */
export function findPiece(board: Board, id: string): Piece | null {
  return board.find((piece) => piece.id === id) ?? null;
}

/** 娘の駒（盤面データが正しければ必ず1つある） */
export function daughterOf(board: Board): Piece | null {
  return board.find((piece) => piece.kind === 'daughter') ?? null;
}

/** 娘が出口に着いたらクリア */
export function isCleared(board: Board): boolean {
  const daughter = daughterOf(board);
  return daughter !== null && daughter.x === EXIT_X && daughter.y === EXIT_Y;
}

/**
 * その向きへ何マス動かせるか（0なら動かせない）。
 *
 * 跳び越しは無いので、1マスずつ「動かした先が空いているか」を見て、
 * ふさがった時点で止める。
 */
export function maxSlide(board: Board, id: string, dir: Direction): number {
  const index = board.findIndex((piece) => piece.id === id);
  if (index < 0) return 0;
  return slideLimit(board, index, dir, indexGrid(board));
}

/**
 * 駒を動かす。
 *
 * **動かせないときは受け取った盤面をそのまま返す**（同じ参照）。
 * 呼ぶ側は参照が変わったかどうかで「手が進んだか」を判定でき、
 * 空振りの操作で手数や「もどす」の履歴が伸びない（色水ソートと同じ約束）。
 */
export function slide(board: Board, id: string, dir: Direction, steps: number): Board {
  if (!Number.isInteger(steps) || steps <= 0) return board;
  if (steps > maxSlide(board, id, dir)) return board;
  const { dx, dy } = DELTA[dir];
  return board.map((piece) =>
    piece.id === id ? { ...piece, x: piece.x + dx * steps, y: piece.y + dy * steps } : piece,
  );
}

/** 1手を適用する（`slide` と同じで、動かせなければ同じ参照） */
export function applyMove(board: Board, move: Move): Board {
  return slide(board, move.id, move.dir, move.steps);
}

/**
 * 指せる手をすべて並べる。
 *
 * **1方向に到達できる位置ごとに1手**（1マス動かすのも3マス動かすのも1手）。
 * ソルバーと画面の両方がこの列挙を使うので、ここが手数の定義そのものになる。
 */
export function legalMoves(board: Board): Move[] {
  const grid = indexGrid(board);
  const out: Move[] = [];
  for (let index = 0; index < board.length; index += 1) {
    for (const dir of DIRECTIONS) {
      const max = slideLimit(board, index, dir, grid);
      for (let steps = 1; steps <= max; steps += 1) out.push({ id: board[index].id, dir, steps });
    }
  }
  return out;
}

/**
 * 盤面を1つの文字列にする（ソルバーの重複判定用）。
 *
 * **同じ種類の駒は区別しない。** 縦長どうし・小駒どうしを入れ替えただけの盤面は
 * 遊ぶうえで同じものなので、別の状態として数えると探索が跳ね上がる。
 */
export function boardKey(board: Board): string {
  const cells = new Array<string>(BOARD_W * BOARD_H).fill(EMPTY_CHAR);
  for (const piece of board) {
    const char = KIND_CHAR[piece.kind];
    for (const cell of pieceCells(piece)) cells[cell.y * BOARD_W + cell.x] = char;
  }
  return cells.join('');
}

/** 盤面を文字の絵（1行1段）に戻す。盤面データを書き出すときに使う */
export function toLayout(board: Board): string[] {
  const key = boardKey(board);
  const rows: string[] = [];
  for (let y = 0; y < BOARD_H; y += 1) rows.push(key.slice(y * BOARD_W, (y + 1) * BOARD_W));
  return rows;
}

/**
 * 文字の絵から駒を組み立てる。
 *
 * 左上から順に、まだどの駒にも属していないマスを見つけたら、その文字の大きさで
 * 駒を1つ置く。同じ文字が縦に並んでいても、上から順に切り出すので迷いはない。
 * 大きさぶんのマスが同じ文字で埋まっていなければ投げる（データの書き損じ）。
 */
export function parseLayout(rows: readonly string[]): Piece[] {
  if (rows.length !== BOARD_H) {
    throw new Error(`盤面は${BOARD_H}行で書く（受け取った行数: ${rows.length}）`);
  }
  const chars = rows.map((row) => {
    if (row.length !== BOARD_W) {
      throw new Error(`盤面の1行は${BOARD_W}文字で書く（受け取った行: ${row}）`);
    }
    return [...row];
  });
  const taken = new Array<boolean>(BOARD_W * BOARD_H).fill(false);
  const pieces: Piece[] = [];
  const seq: Record<string, number> = {};

  for (let y = 0; y < BOARD_H; y += 1) {
    for (let x = 0; x < BOARD_W; x += 1) {
      if (taken[y * BOARD_W + x]) continue;
      const char = chars[y][x];
      if (char === EMPTY_CHAR) continue;
      const kind = CHAR_KIND[char];
      if (kind === undefined) throw new Error(`盤面に知らない文字がある: ${char}`);
      const { w, h } = PIECE_SIZE[kind];
      const piece: Piece = { id: '', kind, x, y };
      if (!inBoard(piece)) throw new Error(`駒が盤からはみ出している: ${char} (${x}, ${y})`);
      for (const cell of pieceCells(piece)) {
        if (chars[cell.y][cell.x] !== char || taken[cell.y * BOARD_W + cell.x]) {
          throw new Error(`${char} の駒は ${w}×${h} マスで書く (${x}, ${y})`);
        }
        taken[cell.y * BOARD_W + cell.x] = true;
      }
      seq[char] = (seq[char] ?? 0) + 1;
      pieces.push({ ...piece, id: `${char}${seq[char]}` });
    }
  }
  return pieces;
}

/**
 * 盤面データの誤りを並べる（空なら正しい）。
 * 出題データが壊れていないことを `tests/hakoiri-musume.test.ts` で見張るために使う。
 */
export function boardErrors(board: Board): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const grid = new Array<string | null>(BOARD_W * BOARD_H).fill(null);
  const counts: Record<PieceKind, number> = { daughter: 0, tall: 0, wide: 0, small: 0 };

  for (const piece of board) {
    if (ids.has(piece.id)) errors.push(`id が重複している: ${piece.id}`);
    ids.add(piece.id);
    counts[piece.kind] += 1;
    if (!inBoard(piece)) {
      errors.push(`盤からはみ出している: ${piece.id}`);
      continue;
    }
    for (const cell of pieceCells(piece)) {
      const at = grid[cell.y * BOARD_W + cell.x];
      if (at !== null) errors.push(`駒が重なっている: ${piece.id} と ${at}`);
      grid[cell.y * BOARD_W + cell.x] = piece.id;
    }
  }
  for (const kind of Object.keys(PIECE_COUNT) as PieceKind[]) {
    if (counts[kind] !== PIECE_COUNT[kind]) {
      errors.push(`${kind} は${PIECE_COUNT[kind]}個（いまは${counts[kind]}個）`);
    }
  }
  return errors;
}

/** 探索の打ち切り。状態数は数万で収まるので、これに当たるのはデータが壊れたとき */
const MAX_STATES = 200_000;

/** ソルバーの答え */
export interface Solution {
  /** 最短手数（この実装の数え方） */
  minMoves: number;
  /** 最短手順の一例 */
  moves: Move[];
}

/**
 * 最短手順を幅優先で探す。解けない盤面は null。
 *
 * 遷移は `legalMoves`（＝1方向に到達できる位置ごとに1手）。**同種の駒を区別しない**
 * ので、標準配置から到達できる状態は数万で収まり、テストの中で1秒かからずに終わる。
 */
export function solve(board: Board): Solution | null {
  if (isCleared(board)) return { minMoves: 0, moves: [] };

  const startKey = boardKey(board);
  /** たどってきた道。`prev` は1手前の盤面のキー */
  const seen = new Map<string, { prev: string; move: Move } | null>([[startKey, null]]);
  let frontier: { key: string; board: Board }[] = [{ key: startKey, board }];
  let depth = 0;

  const trace = (key: string): Move[] => {
    const moves: Move[] = [];
    for (let cursor: string | undefined = key; cursor !== undefined; ) {
      const step = seen.get(cursor);
      if (step === null || step === undefined) break;
      moves.push(step.move);
      cursor = step.prev;
    }
    return moves.reverse();
  };

  while (frontier.length > 0) {
    if (seen.size > MAX_STATES) throw new Error('状態が多すぎる（盤面データが壊れている可能性）');
    depth += 1;
    const next: { key: string; board: Board }[] = [];
    for (const { key, board: current } of frontier) {
      const grid = indexGrid(current);
      for (let index = 0; index < current.length; index += 1) {
        for (const dir of DIRECTIONS) {
          const max = slideLimit(current, index, dir, grid);
          for (let steps = 1; steps <= max; steps += 1) {
            const moved = moveUnchecked(current, index, dir, steps);
            const movedKey = boardKey(moved);
            if (seen.has(movedKey)) continue;
            const move: Move = { id: current[index].id, dir, steps };
            seen.set(movedKey, { prev: key, move });
            if (isCleared(moved)) return { minMoves: depth, moves: trace(movedKey) };
            next.push({ key: movedKey, board: moved });
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** 最短手数だけ欲しいとき。解けなければ null */
export function minMovesOf(board: Board): number | null {
  return solve(board)?.minMoves ?? null;
}

/** レベルの区分 */
export type LevelGroup = 'easy' | 'standard' | 'hard';

/** 区分の見出し（画面のボタンに出る） */
export const LEVEL_GROUPS: Record<LevelGroup, { label: string; note: string }> = {
  easy: { label: 'はじめて', note: '娘が出口の近くにある練習用の配置です' },
  standard: { label: '標準', note: '昔から遊ばれている伝統的な配置です' },
  hard: { label: 'むずかしい', note: '駒は同じで、標準よりも手数がかかる配置です' },
};

/** 出題1面。`minMoves` はソルバーで計算した値（手で数えた値は入れない） */
export interface Level {
  id: string;
  group: LevelGroup;
  name: string;
  /** 文字の絵で書いた配置 */
  layout: readonly string[];
  /** この実装の数え方での最短手数（`tests` がソルバーと突き合わせる） */
  minMoves: number;
}

/**
 * 出題（10面）。
 *
 * **`minMoves` はすべて `solve()` が出した値**で、`tests/hakoiri-musume.test.ts` が
 * ソルバーと突き合わせて固定している（ずれたらテストが落ちる）。
 * 「はじめて」「むずかしい」の配置は、盤に収まる置き方をすべて列挙して
 * ソルバーで距離を測り、そこから選んだもの（他所の問題集からの転記はしない）。
 * 標準配置だけは伝統的な公有の並び。
 */
export const LEVELS: readonly Level[] = [
  {
    id: 'easy-1',
    group: 'easy',
    name: 'はじめて 1',
    layout: ['TSST', 'TWWT', '.TSS', 'TTDD', 'T.DD'],
    minMoves: 10,
  },
  {
    id: 'easy-2',
    group: 'easy',
    name: 'はじめて 2',
    layout: ['T.WW', 'TSTT', 'DDTT', 'DDT.', 'SSTS'],
    minMoves: 14,
  },
  {
    id: 'easy-3',
    group: 'easy',
    name: 'はじめて 3',
    layout: ['STT.', 'TTT.', 'TDDT', 'SDDT', 'WWSS'],
    minMoves: 18,
  },
  {
    // 伝統的な標準配置（娘が上中央、縦長が両脇、横長がその下、小4個が下）。
    // 公有の並びで、ここだけは昔から遊ばれているものをそのまま使う。
    // 文献の「81手」は角を曲がる移動も1手と数える別の定義の値なので、
    // この数え方（1方向の移動が1手）の90手とは一致しない
    id: 'standard',
    group: 'standard',
    name: '標準配置',
    layout: ['TDDT', 'TDDT', 'TWWT', 'TSST', 'S..S'],
    minMoves: 90,
  },
  {
    id: 'hard-1',
    group: 'hard',
    name: 'むずかしい 1',
    layout: ['SDDT', '.DDT', 'TTWW', 'TTST', '.SST'],
    minMoves: 96,
  },
  {
    id: 'hard-2',
    group: 'hard',
    name: 'むずかしい 2',
    layout: ['TDDS', 'TDD.', 'WWTT', 'TSTT', 'TSS.'],
    minMoves: 96,
  },
  {
    id: 'hard-3',
    group: 'hard',
    name: 'むずかしい 3',
    layout: ['DDT.', 'DDT.', 'STWW', 'TTST', 'TSST'],
    minMoves: 99,
  },
  {
    id: 'hard-4',
    group: 'hard',
    name: 'むずかしい 4',
    layout: ['.TDD', '.TDD', 'WWTS', 'TSTT', 'TSST'],
    minMoves: 99,
  },
  {
    id: 'hard-5',
    group: 'hard',
    name: 'むずかしい 5',
    layout: ['.DDT', 'SDDT', 'TWWT', 'TT.T', 'STSS'],
    minMoves: 101,
  },
  {
    id: 'hard-6',
    group: 'hard',
    name: 'むずかしい 6',
    layout: ['TDD.', 'TDDS', 'TWWT', 'T.TT', 'SSTS'],
    minMoves: 101,
  },
];

/** 既定のレベル（初めて来た人が最初に触る面） */
export const DEFAULT_LEVEL_ID = 'easy-1';

/** 区分ごとのレベル（レベル選びのボタンを並べるのに使う） */
export function levelsOf(group: LevelGroup): Level[] {
  return LEVELS.filter((level) => level.group === group);
}

/** id でレベルを引く（無ければ投げる。呼び出し側の書き損じに気づけるように） */
export function levelById(id: string): Level {
  const found = LEVELS.find((level) => level.id === id);
  if (found === undefined) throw new Error(`知らないレベル: ${id}`);
  return found;
}

/** レベルの初期配置 */
export function levelBoard(level: Level): Board {
  return parseLayout(level.layout);
}

/** 遊んでいるあいだの状態。「もどす」と「最初から」のために初期配置と履歴を持つ */
export interface PlayState {
  levelId: string;
  initial: Board;
  board: Board;
  /** 直前の盤面から順に積む（仕様どおり無制限） */
  history: readonly Board[];
  moves: number;
}

/** レベルを始める */
export function startLevel(level: Level): PlayState {
  const board = levelBoard(level);
  return { levelId: level.id, initial: board, board, history: [], moves: 0 };
}

/**
 * 1手指す。**動かせない操作では状態をそのまま返す**（同じ参照）ので、
 * 空振りで手数も履歴も増えない。
 */
export function play(state: PlayState, id: string, dir: Direction, steps: number): PlayState {
  const board = slide(state.board, id, dir, steps);
  if (board === state.board) return state;
  return {
    ...state,
    board,
    history: [...state.history, state.board],
    moves: state.moves + 1,
  };
}

/** 1手もどす。履歴が無ければそのまま */
export function undo(state: PlayState): PlayState {
  if (state.history.length === 0) return state;
  return {
    ...state,
    board: state.history[state.history.length - 1],
    history: state.history.slice(0, -1),
    moves: Math.max(0, state.moves - 1),
  };
}

/** 最初から（同じレベルの初期配置に戻す） */
export function restart(state: PlayState): PlayState {
  return { ...state, board: state.initial, history: [], moves: 0 };
}

/**
 * 指の動き（px）から向きを決める。
 *
 * **指を離した位置ではなく動かした方向で判定する**（仕様の「ずれに強い」）。
 * 斜めに振れても、動きの大きいほうの軸だけを見る。
 * `threshold` に満たない動きは「押した」であって「はらった」ではないので null。
 */
export function directionFromDelta(dx: number, dy: number, threshold = 12): Direction | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * 「駒を選んでから動かしたい先のマスをタップする」操作を1手に直す。
 *
 * 選んだ駒と同じ行（または列）にあるマスだけが対象。届かないマスをタップしたときは
 * 途中まで（`maxSlide` ぶん）動かす。1マスも動かせない・筋が違うときは null。
 */
export function moveToward(board: Board, id: string, x: number, y: number): Move | null {
  const piece = findPiece(board, id);
  if (piece === null) return null;
  const { w, h } = sizeOf(piece);
  let dir: Direction | null = null;
  let want = 0;

  if (x >= piece.x && x < piece.x + w) {
    if (y < piece.y) {
      dir = 'up';
      want = piece.y - y;
    } else if (y >= piece.y + h) {
      dir = 'down';
      want = y - (piece.y + h - 1);
    }
  } else if (y >= piece.y && y < piece.y + h) {
    if (x < piece.x) {
      dir = 'left';
      want = piece.x - x;
    } else if (x >= piece.x + w) {
      dir = 'right';
      want = x - (piece.x + w - 1);
    }
  }
  if (dir === null) return null;
  const steps = Math.min(want, maxSlide(board, id, dir));
  return steps > 0 ? { id, dir, steps } : null;
}
