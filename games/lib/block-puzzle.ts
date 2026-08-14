/**
 * ブロックパズル（8×8にピースを置いて行・列を消す）のロジック
 *
 * 仕様: docs/features/game-block-puzzle.md
 *
 * 盤面は長さ 64 の配列で持つ（index = row * SIZE + col）。値は 0 が空きマス、
 * 1以上は「そのマスを埋めたピースの色ID」。色を盤面に持たせているのは、
 * 置いたあともどのピースだったかが見えるほうが盤面を読みやすいため。
 *
 * **回転はしない**（この型の標準仕様。docs/features/game-block-puzzle.md の
 * 「やらないこと」）。そのぶん、回転済みの形をあらかじめ配り札の候補として持つ。
 *
 * ※「Block Blast」「Woodoku」「Blockudoku」などは他社の固有名なので使わない。
 *   一般名称の「ブロックパズル」で統一すること（games/CLAUDE.md の商標の約束）。
 */

/** 盤面の一辺 */
export const SIZE = 8;

/** 1手で配られるピースの数 */
export const HAND_SIZE = 3;

/** 盤面。0 は空き、1以上は色ID */
export type Board = number[];

/** 乱数。テストで結果を固定できるよう、関数を差し替えられる形にしている */
export type Rng = () => number;

/** ピース1つ。`cells` は左上を (0,0) に寄せた相対座標 [行, 列] */
export interface Piece {
  /** 一意なID。回転違いは別のIDになる（`t-0`・`t-1` など） */
  id: string;
  cells: [number, number][];
  width: number;
  height: number;
  /** 色ID。同じ形は常に同じ色にして、形を覚えやすくする */
  color: number;
}

/**
 * ピースの定義。`rows` の `#` が埋まるマス。
 *
 * `weight` は**その形の一族**（回転違いを含む）が配られる重みで、
 * 回転で増えた分は等分する。均等に選ぶと5マス以上の大物ばかり来て
 * すぐ詰むため、小さい形ほど重くしている。
 */
interface ShapeSpec {
  id: string;
  rows: string[];
  weight: number;
  color: number;
  /** 回転4方向に増やすか（同じ形になる向きは自動で1つにまとめられる） */
  rotate?: boolean;
}

const SHAPES: ShapeSpec[] = [
  { id: 'dot', rows: ['#'], weight: 2, color: 1 },
  { id: 'line2', rows: ['##'], weight: 5, color: 2, rotate: true },
  { id: 'line3', rows: ['###'], weight: 5, color: 2, rotate: true },
  { id: 'line4', rows: ['####'], weight: 3, color: 3, rotate: true },
  { id: 'line5', rows: ['#####'], weight: 2, color: 3, rotate: true },
  { id: 'square2', rows: ['##', '##'], weight: 4, color: 4 },
  { id: 'square3', rows: ['###', '###', '###'], weight: 1, color: 5 },
  { id: 'rect23', rows: ['###', '###'], weight: 2, color: 5 },
  { id: 'corner3', rows: ['#.', '##'], weight: 6, color: 6, rotate: true },
  { id: 'corner5', rows: ['#..', '#..', '###'], weight: 2, color: 7, rotate: true },
  { id: 'lmino', rows: ['#.', '#.', '##'], weight: 3, color: 7, rotate: true },
  { id: 'jmino', rows: ['.#', '.#', '##'], weight: 3, color: 7, rotate: true },
  { id: 'smino', rows: ['.##', '##.'], weight: 2, color: 6, rotate: true },
  { id: 'zmino', rows: ['##.', '.##'], weight: 2, color: 6, rotate: true },
  { id: 'tmino', rows: ['###', '.#.'], weight: 3, color: 4, rotate: true },
];

/** `rows` の `#` を相対座標に開く。形が空なら定義の書き間違いなので落とす */
function parseRows(rows: string[]): [number, number][] {
  const cells: [number, number][] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') cells.push([r, c]);
    }
  });
  if (cells.length === 0) throw new Error('埋まるマスが1つもない形は作れない');
  return cells;
}

/** 相対座標を左上（0,0）に寄せ直し、比較しやすいよう順序も揃える */
export function normalize(cells: [number, number][]): [number, number][] {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** 時計回りに90度回す。(r, c) → (c, maxR - r) */
export function rotate90(cells: [number, number][]): [number, number][] {
  const maxR = Math.max(...cells.map(([r]) => r));
  return normalize(cells.map(([r, c]) => [c, maxR - r] as [number, number]));
}

/** 形の同一性を見るためのキー */
function keyOf(cells: [number, number][]): string {
  return normalize(cells)
    .map(([r, c]) => `${r},${c}`)
    .join(' ');
}

/**
 * 定義から配り札の候補を組み立てる。
 * 回転して同じ形になる向き（正方形・直線など）は1つにまとめるので、
 * `rotate: true` を付けても候補が無駄に増えることはない。
 */
function buildPieces(): { piece: Piece; weight: number }[] {
  const out: { piece: Piece; weight: number }[] = [];
  for (const spec of SHAPES) {
    const variants: [number, number][][] = [];
    const seen = new Set<string>();
    let cells = normalize(parseRows(spec.rows));
    for (let i = 0; i < (spec.rotate ? 4 : 1); i++) {
      const key = keyOf(cells);
      if (!seen.has(key)) {
        seen.add(key);
        variants.push(cells);
      }
      cells = rotate90(cells);
    }
    for (const [i, v] of variants.entries()) {
      out.push({
        piece: {
          id: `${spec.id}-${i}`,
          cells: v,
          width: Math.max(...v.map(([, c]) => c)) + 1,
          height: Math.max(...v.map(([r]) => r)) + 1,
          color: spec.color,
        },
        // 一族の重みを向きの数で等分する（向きが多い形ほど出やすくなるのを防ぐ）
        weight: spec.weight / variants.length,
      });
    }
  }
  return out;
}

const WEIGHTED_PIECES = buildPieces();

/** 配られうるピースの一覧（回転違いを含む） */
export const PIECES: Piece[] = WEIGHTED_PIECES.map((w) => w.piece);

/** 得点の配分。1マス置くたびの点・1本消しの基準点・連続消しの上乗せ */
export const CELL_POINT = 1;
export const LINE_POINT = 10;
export const COMBO_POINT = 5;

export function idx(row: number, col: number): number {
  return row * SIZE + col;
}

export function newBoard(): Board {
  return new Array<number>(SIZE * SIZE).fill(0);
}

/** ピースを (row, col) に置いたときに埋まる盤面のindex。盤外は含めずに落とす */
export function placementCells(piece: Piece, row: number, col: number): number[] {
  return piece.cells.map(([r, c]) => idx(row + r, col + c));
}

/** そこに置けるか。盤からはみ出さず、埋まっているマスと重ならないこと */
export function canPlace(board: Board, piece: Piece, row: number, col: number): boolean {
  if (row < 0 || col < 0) return false;
  if (row + piece.height > SIZE || col + piece.width > SIZE) return false;
  return piece.cells.every(([r, c]) => board[idx(row + r, col + c)] === 0);
}

/**
 * ピースを置いた盤面を返す（元の盤面は変えない）。
 * 置けない位置は投げる。黙って無視すると、UI側の判定漏れが
 * 「ピースだけ消えて盤面が変わらない」形で表に出るため。
 */
export function place(board: Board, piece: Piece, row: number, col: number): Board {
  if (!canPlace(board, piece, row, col)) {
    throw new Error(`置けない位置: row=${row} col=${col} piece=${piece.id}`);
  }
  const next = [...board];
  for (const i of placementCells(piece, row, col)) next[i] = piece.color;
  return next;
}

/** 埋まりきった行・列 */
export function fullLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    let full = true;
    for (let c = 0; c < SIZE; c++) if (board[idx(r, c)] === 0) full = false;
    if (full) rows.push(r);
  }
  for (let c = 0; c < SIZE; c++) {
    let full = true;
    for (let r = 0; r < SIZE; r++) if (board[idx(r, c)] === 0) full = false;
    if (full) cols.push(c);
  }
  return { rows, cols };
}

/**
 * 指定の行・列を消した盤面を返す。
 * 行と列が同時に埋まったときは**両方消す**（交点は1マスとして消えるだけ）。
 */
export function clearLines(board: Board, lines: { rows: number[]; cols: number[] }): Board {
  const next = [...board];
  for (const r of lines.rows) for (let c = 0; c < SIZE; c++) next[idx(r, c)] = 0;
  for (const c of lines.cols) for (let r = 0; r < SIZE; r++) next[idx(r, c)] = 0;
  return next;
}

/** その盤面のどこかに置けるか */
export function canPlaceAnywhere(board: Board, piece: Piece): boolean {
  for (let r = 0; r + piece.height <= SIZE; r++) {
    for (let c = 0; c + piece.width <= SIZE; c++) {
      if (canPlace(board, piece, r, c)) return true;
    }
  }
  return false;
}

/** 手持ちのどれも置けなくなったら終了。手持ちが空のときは終了ではない（次が配られる） */
export function isGameOver(board: Board, hand: Piece[]): boolean {
  if (hand.length === 0) return false;
  return !hand.some((p) => canPlaceAnywhere(board, p));
}

/**
 * 1手ぶんの得点。
 *
 * - 置いたマス数 × `CELL_POINT`（置くだけでも少し入る）
 * - 消した本数 n の同時消しボーナス： `LINE_POINT × n(n+1)/2`
 *   （1本=10、2本=30、3本=60。まとめて消すほど1本あたりの価値が上がる）
 * - 連続消しボーナス： `COMBO_POINT × (combo - 1) × n`
 *   （combo は「消せた手が続いた回数」。1手目は上乗せ無し）
 */
export function gainFor(placedCells: number, clearedLines: number, combo: number): number {
  let gained = placedCells * CELL_POINT;
  if (clearedLines > 0) {
    gained += (LINE_POINT * clearedLines * (clearedLines + 1)) / 2;
    gained += COMBO_POINT * Math.max(0, combo - 1) * clearedLines;
  }
  return gained;
}

export interface PlacementResult {
  board: Board;
  /** 消えた行・列の合計本数 */
  cleared: number;
  clearedRows: number[];
  clearedCols: number[];
  /** 消せた手が続いた回数。消せなかった手で 0 に戻る */
  combo: number;
  gained: number;
}

/**
 * 「置く → 揃った行・列を消す → 得点する」の1手ぶん。
 *
 * `combo` には**直前までの**連続消し回数を渡す（最初は 0）。
 * 戻り値の `combo` を次の手にそのまま渡していけばよい。
 */
export function applyPlacement(
  board: Board,
  piece: Piece,
  row: number,
  col: number,
  combo = 0,
): PlacementResult {
  const placed = place(board, piece, row, col);
  const lines = fullLines(placed);
  const cleared = lines.rows.length + lines.cols.length;
  const nextCombo = cleared > 0 ? combo + 1 : 0;
  return {
    board: cleared > 0 ? clearLines(placed, lines) : placed,
    cleared,
    clearedRows: lines.rows,
    clearedCols: lines.cols,
    combo: nextCombo,
    gained: gainFor(piece.cells.length, cleared, nextCombo),
  };
}

/** 重み付きで1つ選ぶ。`rng` は 0以上1未満を返すこと */
export function pickPiece(rng: Rng): Piece {
  const total = WEIGHTED_PIECES.reduce((sum, w) => sum + w.weight, 0);
  let x = rng() * total;
  for (const w of WEIGHTED_PIECES) {
    x -= w.weight;
    if (x < 0) return w.piece;
  }
  // rng が 1 を返す実装でも落ちないように、末尾を返す
  return WEIGHTED_PIECES[WEIGHTED_PIECES.length - 1].piece;
}

/** 次の3つを配る */
export function deal(rng: Rng): Piece[] {
  return Array.from({ length: HAND_SIZE }, () => pickPiece(rng));
}
