/**
 * スネーク（ヘビゲーム）のルールと進行ロジック
 *
 * 仕様: docs/features/game-snake.md
 *
 * 描画（canvas）から切り離した純関数のステート機械。
 * UI側は一定間隔で `step()` を呼び、返ってきた状態を描くだけにする。
 * `breakout` と違って**時間ではなくマス目で進む**ので、1回の `step()` が
 * ちょうど1マスぶんの前進になる（dt を渡さないのはこのため）。
 *
 * 座標は左上が原点の格子。x は右向き、y は下向きに正。
 */

/** 進む向き */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 格子の1マス */
export interface Cell {
  x: number;
  y: number;
}

export interface SnakeState {
  /** 盤の1辺のマス数（正方形） */
  size: number;
  /** ヘビの体。**先頭が頭**で、末尾が尾 */
  body: Cell[];
  /** いま進んでいる向き */
  dir: Direction;
  /**
   * 入力の待ち行列（先頭から1回の `step()` で1つ消費する）。
   *
   * 直接 `dir` を書き換えないのは、1回の前進のあいだに2回曲げられたとき
   * （角を曲がってすぐ折り返す操作）に**手前の入力が消えてしまう**ため。
   * ここに積んでおけば、次の前進で順に効く。
   */
  queued: Direction[];
  /** 餌の位置。盤が埋まって置き場が無いときだけ null */
  food: Cell | null;
  /** 食べた餌の数 */
  score: number;
  status: 'ready' | 'playing' | 'paused' | 'gameover' | 'cleared';
}

/** 盤の1辺のマス数。1画面に収まり、かつ狭すぎない大きさ */
export const BOARD_SIZE = 17;

/** 最初の体の長さ（頭を含む） */
export const INITIAL_LENGTH = 3;

/** 1マス進むのにかける時間（ミリ秒）。スコアが伸びるほど短くなる */
export const BASE_INTERVAL_MS = 180;
/** 速さの上限（これ以上は速くしない）。人の反応が追いつかなくなるため */
export const MIN_INTERVAL_MS = 80;
/** 何点ごとに加速するか */
const SPEED_UP_EVERY = 5;
/** 1段階あたり縮める時間（ミリ秒） */
const SPEED_UP_MS = 8;

/** 反対向き。逆走（自分の首に突っ込む操作）を弾くのに使う */
export function opposite(dir: Direction): Direction {
  switch (dir) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    default:
      return 'left';
  }
}

/** そのスコアでの1マスあたりの時間（ミリ秒）。上限で頭打ちになる */
export function intervalFor(score: number): number {
  const steps = Math.floor(score / SPEED_UP_EVERY);
  return Math.max(MIN_INTERVAL_MS, BASE_INTERVAL_MS - steps * SPEED_UP_MS);
}

/** 同じマスか */
export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 1マス進んだ先（盤の外に出るかどうかはここでは見ない） */
export function nextCell(cell: Cell, dir: Direction): Cell {
  switch (dir) {
    case 'up':
      return { x: cell.x, y: cell.y - 1 };
    case 'down':
      return { x: cell.x, y: cell.y + 1 };
    case 'left':
      return { x: cell.x - 1, y: cell.y };
    default:
      return { x: cell.x + 1, y: cell.y };
  }
}

/** 盤の中か（壁すり抜けは無いので、外に出た時点でゲームオーバー） */
export function inBoard(cell: Cell, size: number): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < size && cell.y < size;
}

/**
 * 餌を置く。**空きマスの一覧から選ぶ**ので、体の上には絶対に置かない。
 * 「当たるまで引き直す」方式にしないのは、体が伸びるほど時間が読めなくなるため。
 *
 * 空きが無ければ null（＝盤面をヘビが埋め尽くした）。
 */
export function placeFood(size: number, body: Cell[], rng: () => number = Math.random): Cell | null {
  const taken = new Set(body.map((c) => `${c.x},${c.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  const index = Math.min(free.length - 1, Math.max(0, Math.floor(rng() * free.length)));
  return free[index];
}

/**
 * 初期状態。盤の中央から右向きに、長さ3で始まる。
 *
 * 頭を中央に置くのは、どちらへ曲がっても同じだけ余裕があるようにするため
 * （右向きなので体は左側に伸びる）。
 */
export function initialState(rng: () => number = Math.random, size: number = BOARD_SIZE): SnakeState {
  const center = Math.floor(size / 2);
  const body: Cell[] = [];
  for (let i = 0; i < INITIAL_LENGTH; i += 1) body.push({ x: center - i, y: center });
  return {
    size,
    body,
    dir: 'right',
    queued: [],
    food: placeFood(size, body, rng),
    score: 0,
    status: 'ready',
  };
}

/**
 * 方向転換を受け付ける。
 *
 * - **逆走は無効**（標準の作法。押した瞬間に自分の首に刺さって終わるのを防ぐ）
 * - 同じ向きの連打も積まない（待ち行列が同じ向きで埋まると、次の曲がりが遅れる）
 * - 積めるのは2つまで（それ以上は先の操作が読めなくなる）
 *
 * 判定の基準は「いまの向き」ではなく**待ち行列の最後**。角を曲がる入力が
 * まだ効いていない時点で次の入力を見るので、ここを取り違えると
 * 「曲がってすぐ折り返す」が逆走扱いで消える。
 */
export function turn(state: SnakeState, dir: Direction): SnakeState {
  if (state.status !== 'playing' && state.status !== 'ready') return state;
  if (state.queued.length >= 2) return state;
  const last = state.queued.length > 0 ? state.queued[state.queued.length - 1] : state.dir;
  if (dir === last || dir === opposite(last)) return state;
  return { ...state, queued: [...state.queued, dir] };
}

/** スタート待ちから動かし始める */
export function start(state: SnakeState): SnakeState {
  if (state.status !== 'ready') return state;
  return { ...state, status: 'playing' };
}

/** 一時停止と再開。動いている最中と止めている最中だけ効く */
export function togglePause(state: SnakeState): SnakeState {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

/**
 * 1マス進める。
 *
 * @param state 現在の状態（変更しない）
 * @param rng 餌の置き場所に使う乱数
 */
export function step(state: SnakeState, rng: () => number = Math.random): SnakeState {
  if (state.status !== 'playing') return state;

  const dir = state.queued.length > 0 ? state.queued[0] : state.dir;
  const queued = state.queued.slice(1);
  const head = nextCell(state.body[0], dir);

  // 壁
  if (!inBoard(head, state.size)) {
    return { ...state, dir, queued, status: 'gameover' };
  }

  const eating = state.food !== null && sameCell(head, state.food);

  // 自分の体。**食べないときは尾が1マス空く**ので、尾のあった場所へは進める
  // （伸びていない状態で真後ろを追いかける形になるだけで、当たりではない）
  const occupied = eating ? state.body : state.body.slice(0, -1);
  if (occupied.some((c) => sameCell(c, head))) {
    return { ...state, dir, queued, status: 'gameover' };
  }

  const body = eating ? [head, ...state.body] : [head, ...state.body.slice(0, -1)];
  if (!eating) {
    return { ...state, dir, queued, body };
  }

  const food = placeFood(state.size, body, rng);
  return {
    ...state,
    dir,
    queued,
    body,
    food,
    score: state.score + 1,
    // 空きマスが無い＝盤面をすべて埋めた。ヘビゲームでの「上がり」
    status: food === null ? 'cleared' : 'playing',
  };
}
