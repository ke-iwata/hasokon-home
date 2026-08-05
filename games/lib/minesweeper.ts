/**
 * マインスイーパーのロジック
 *
 * 盤面はセルの配列（幅 width × 高さ height）。index = row * width + col。
 * 地雷の配置は「最初に開けたマスとその周囲8マス」を避けて行う（初手で
 * 負けない・初手から数字に囲まれない、現代の実装で標準の仕様）。
 * そのため盤面の生成は最初のクリック時に行う。
 */

export interface Cell {
  mine: boolean;
  /** 周囲8マスの地雷数（mine=true のセルでは意味を持たない） */
  count: number;
  revealed: boolean;
  flagged: boolean;
}

export type MsStatus = 'playing' | 'won' | 'lost';

export interface MsState {
  width: number;
  height: number;
  mines: number;
  cells: Cell[];
  status: MsStatus;
  /** 地雷を踏んだマス（負けたときの表示用） */
  exploded: number | null;
}

/** 難易度（Windows版として広まった伝統的な構成） */
export const MS_LEVELS = {
  easy: { label: '初級', width: 9, height: 9, mines: 10 },
  normal: { label: '中級', width: 16, height: 16, mines: 40 },
  hard: { label: '上級', width: 16, height: 30, mines: 99 },
} as const;

export type MsLevel = keyof typeof MS_LEVELS;

/** 周囲8マスの index を返す（盤面の端は範囲内だけ） */
export function neighbors(index: number, width: number, height: number): number[] {
  const r = Math.floor(index / width);
  const c = index % width;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < height && nc >= 0 && nc < width) out.push(nr * width + nc);
    }
  }
  return out;
}

/** 空盤面（地雷なし・全部閉じている）。地雷は最初のクリックで置く */
export function emptyState(level: MsLevel): MsState {
  const { width, height, mines } = MS_LEVELS[level];
  return {
    width,
    height,
    mines,
    cells: Array.from({ length: width * height }, () => ({
      mine: false,
      count: 0,
      revealed: false,
      flagged: false,
    })),
    status: 'playing',
    exploded: null,
  };
}

/**
 * 地雷を配置する。safeIndex とその周囲8マスには置かない。
 * 盤面が小さく除外域を確保できない場合は safeIndex だけを避ける。
 */
export function placeMines(
  state: MsState,
  safeIndex: number,
  rng: () => number = Math.random,
): MsState {
  const { width, height, mines } = state;
  const total = width * height;
  let excluded = new Set([safeIndex, ...neighbors(safeIndex, width, height)]);
  if (total - excluded.size < mines) excluded = new Set([safeIndex]);

  const candidates = [...Array(total).keys()].filter((i) => !excluded.has(i));
  // Fisher–Yates で先頭 mines 個を選ぶ
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const mineSet = new Set(candidates.slice(0, mines));

  const cells = state.cells.map((cell, i) => ({
    ...cell,
    mine: mineSet.has(i),
  }));
  for (let i = 0; i < total; i += 1) {
    cells[i].count = neighbors(i, width, height).filter((n) => cells[n].mine).length;
  }
  return { ...state, cells };
}

/** 地雷がまだ置かれていないか（=最初のクリック前か） */
export function isFresh(state: MsState): boolean {
  return state.cells.every((c) => !c.mine) && state.cells.every((c) => !c.revealed);
}

/** 勝利判定: 地雷以外がすべて開いている */
function checkWin(cells: Cell[]): boolean {
  return cells.every((c) => c.mine || c.revealed);
}

/**
 * マスを開ける。count=0 のマスは周囲を連鎖して開ける（洪水充填）。
 * 地雷を踏んだら lost。旗の立ったマスと開いているマスは何もしない。
 */
export function reveal(state: MsState, index: number): MsState {
  if (state.status !== 'playing') return state;
  const cell = state.cells[index];
  if (cell.revealed || cell.flagged) return state;

  if (cell.mine) {
    // 負け。全地雷を開いて見せる
    const cells = state.cells.map((c) => (c.mine ? { ...c, revealed: true } : c));
    return { ...state, cells, status: 'lost', exploded: index };
  }

  const cells = [...state.cells];
  const stack = [index];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (cells[i].revealed || cells[i].flagged) continue;
    cells[i] = { ...cells[i], revealed: true };
    if (cells[i].count === 0) {
      for (const n of neighbors(i, state.width, state.height)) {
        if (!cells[n].revealed && !cells[n].mine) stack.push(n);
      }
    }
  }
  return { ...state, cells, status: checkWin(cells) ? 'won' : 'playing' };
}

/** 旗を立てる/外す（開いているマスには立てられない） */
export function toggleFlag(state: MsState, index: number): MsState {
  if (state.status !== 'playing') return state;
  const cell = state.cells[index];
  if (cell.revealed) return state;
  const cells = [...state.cells];
  cells[index] = { ...cell, flagged: !cell.flagged };
  return { ...state, cells };
}

/**
 * 開いている数字マスをタップしたとき、周囲の旗の数が数字と一致していれば
 * 残りの閉じたマスを一括で開ける（いわゆるコード。PCの両クリック相当）。
 * 旗の位置が間違っていれば地雷を踏んで負けることもある（本家どおり）。
 */
export function chord(state: MsState, index: number): MsState {
  if (state.status !== 'playing') return state;
  const cell = state.cells[index];
  if (!cell.revealed || cell.count === 0) return state;
  const ns = neighbors(index, state.width, state.height);
  const flags = ns.filter((n) => state.cells[n].flagged).length;
  if (flags !== cell.count) return state;
  let next = state;
  for (const n of ns) {
    if (!next.cells[n].flagged && !next.cells[n].revealed) {
      next = reveal(next, n);
      if (next.status === 'lost') return next;
    }
  }
  return next;
}

/** 残り地雷数の表示用（地雷数 − 旗の数。マイナスにもなる） */
export function minesLeft(state: MsState): number {
  return state.mines - state.cells.filter((c) => c.flagged).length;
}
