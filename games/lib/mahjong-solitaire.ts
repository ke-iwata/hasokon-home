/**
 * 麻雀ソリティアのロジック
 *
 * 仕様: docs/features/game-mahjong-solitaire.md
 *
 * 盤面は「亀（Turtle）レイアウト」の144マス（= `TURTLE_LAYOUT`）に固定で、
 * 状態は「どのマスにどの絵柄があるか（faces）」と「どのマスがまだ場に残っているか
 * （present）」の2本だけで持つ。マスの座標は動かないので、配列の添字＝マス番号。
 *
 * このファイルの本体は3つ。
 *
 * 1. **選べるか（`isFree`）の判定** — 上に牌が乗っておらず、左右どちらかが空いている
 * 2. **必ずクリアできる配り方（`deal`）** — 空の盤から積むのではなく、
 *    **満杯の盤から2枚ずつ「選べる牌」を取り除く順番を先に作り**、
 *    その組に同じ絵柄を割り当てる。取り除ける順番が構成から手に入るので、
 *    「同じ順で消せば必ずクリアできる」が保証される（仕様書の「逆再生で配る」を、
 *    逆から書いたもの。牌を取り除いても他の牌が塞がることは無いので、こちらのほうが素直）
 * 3. **詰み検出（`deadlocked`）** — 選べる牌の中に合う組が1つも無い状態
 *
 * 座標は「牌の半分」を1とする格子で持つ（`[layer, x, y]`）。
 * 牌は2×2を占める。半マスずらした位置に置く牌（亀の頭と尾）があるので、
 * 牌1つ＝1マスの整数格子では表せない。
 */

import { BONUS_FACES, faceById, facesMatch, STANDARD_FACES, TILE_MULTISET } from './mahjong-tiles';

/** 乱数。テストで結果を固定できるよう、関数を差し替えられる形にしている */
export type Rng = () => number;

/** 牌が占める辺の長さ（半マス単位）。牌は2×2 */
export const TILE_SPAN = 2;

/** レイアウト上の1マス。x, y は半マス単位の左上位置 */
export interface Slot {
  /** 段。0が最下段で、大きいほど上に積まれる */
  layer: number;
  x: number;
  y: number;
}

function rowOf(layer: number, y: number, from: number, count: number): Slot[] {
  return Array.from({ length: count }, (_, i) => ({ layer, x: from + i * TILE_SPAN, y }));
}

function blockOf(layer: number, xs: number[], ys: number[]): Slot[] {
  return ys.flatMap((y) => xs.map((x) => ({ layer, x, y })));
}

/**
 * 亀（Turtle）レイアウト。144マス。
 *
 * 段ごとの枚数は 87 / 36 / 16 / 4 / 1 で、この配分は本家からの定番。
 * 最下段は 12・8・10・12・12・10・8・12 の8列（計84枚）に、
 * 左に1枚（亀の頭）・右に2枚（亀の尾）を**半マス下げて**足した87枚。
 * この3枚だけが列の格子から外れるので、座標を半マス単位で持っている。
 *
 * 初版は1レイアウトだけ（仕様書の「やらないこと」）。増やすときは
 * このファイルに座標の配列を足すだけで済むようにしてある。
 */
export const TURTLE_LAYOUT: Slot[] = [
  // 最下段の8列（84枚）。中央は x=14 で、上の段もすべてここを中心に積む
  ...rowOf(0, 0, 2, 12),
  ...rowOf(0, 2, 6, 8),
  ...rowOf(0, 4, 4, 10),
  ...rowOf(0, 6, 2, 12),
  ...rowOf(0, 8, 2, 12),
  ...rowOf(0, 10, 4, 10),
  ...rowOf(0, 12, 6, 8),
  ...rowOf(0, 14, 2, 12),
  // 頭（左に1枚）と尾（右に2枚）。列の境目にまたがるので y は半マスずれる
  { layer: 0, x: 0, y: 7 },
  { layer: 0, x: 26, y: 7 },
  { layer: 0, x: 28, y: 7 },
  // 2段目〜5段目。中心（x=14, y=8）を保ったまま6×6→4×4→2×2→1と細くする
  ...blockOf(1, [8, 10, 12, 14, 16, 18], [2, 4, 6, 8, 10, 12]),
  ...blockOf(2, [10, 12, 14, 16], [4, 6, 8, 10]),
  ...blockOf(3, [12, 14], [6, 8]),
  { layer: 4, x: 13, y: 7 },
];

/** 盤面の広さ（半マス単位）。描画側が座標を%に直すのに使う */
export const BOARD_WIDTH = 30;
export const BOARD_HEIGHT = 16;

function xOverlaps(a: Slot, b: Slot): boolean {
  return Math.abs(a.x - b.x) < TILE_SPAN;
}

function yOverlaps(a: Slot, b: Slot): boolean {
  return Math.abs(a.y - b.y) < TILE_SPAN;
}

/**
 * マスごとの「関係するマス」を先に配っておく。
 * 判定のたびに144マスを総当たりすると、配り直しを繰り返す `deal` が重くなる。
 */
interface Neighbors {
  /** 上の段にあって重なるマス（1つでも場にあれば、この牌は取れない） */
  above: number[];
  /** 同じ段で左に接するマス */
  left: number[];
  /** 同じ段で右に接するマス */
  right: number[];
}

function buildNeighbors(layout: Slot[]): Neighbors[] {
  return layout.map((s, i) => {
    const above: number[] = [];
    const left: number[] = [];
    const right: number[] = [];
    for (let j = 0; j < layout.length; j++) {
      if (j === i) continue;
      const t = layout[j];
      if (t.layer > s.layer && xOverlaps(t, s) && yOverlaps(t, s)) above.push(j);
      if (t.layer !== s.layer || !yOverlaps(t, s)) continue;
      // 同じ段の牌どうしは重ならないので、辺が接するのは差がちょうど TILE_SPAN のときだけ
      if (t.x < s.x && t.x + TILE_SPAN >= s.x) left.push(j);
      if (t.x > s.x && s.x + TILE_SPAN >= t.x) right.push(j);
    }
    return { above, left, right };
  });
}

const NEIGHBORS = buildNeighbors(TURTLE_LAYOUT);

/**
 * そのマスの牌が選べるか。
 * 上に牌が乗っておらず、左右のどちらかが空いていれば選べる。
 *
 * @param present マス番号 → 場に残っているか
 */
export function isFree(present: readonly boolean[], slot: number): boolean {
  if (!present[slot]) return false;
  const n = NEIGHBORS[slot];
  if (n.above.some((j) => present[j])) return false;
  return !n.left.some((j) => present[j]) || !n.right.some((j) => present[j]);
}

/** 場に残っていて、いま選べるマスをすべて返す */
export function freeSlots(present: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < present.length; i++) if (isFree(present, i)) out.push(i);
  return out;
}

/** Fisher–Yates。lib/cards.ts と同じ形（あちらは Card 専用なので共有できない） */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 場にあるマスを2枚ずつ取り除いていく順番を作る。
 * ここで返る順番は**絵柄を無視した「置き方の都合だけ」の順番**で、
 * この組に同じ絵柄を配れば、そのまま「必ずクリアできる消し順」になる。
 *
 * 牌を取り除いて他の牌が取れなくなることは無いので、
 * 選べる牌が2枚以上ある限り好きな2枚を選んでよい。ただし取り方によっては
 * 「最後の2枚が上下に重なっていて片方しか取れない」形に追い込める。
 * そこで1手先を見て、取り除いたあとも選べる牌が2枚以上残る組だけを採る。
 * それでも詰まったときは null を返し、呼び出し側が配り直す。
 *
 * @param slots 対象のマス番号（シャッフル機能では場に残っているマスだけを渡す）
 */
function removalOrder(slots: readonly number[], rng: Rng): [number, number][] | null {
  const present = new Array<boolean>(TURTLE_LAYOUT.length).fill(false);
  for (const s of slots) present[s] = true;

  const order: [number, number][] = [];
  let left = slots.length;

  while (left > 0) {
    const free = shuffled(freeSlots(present), rng);
    if (free.length < 2) return null;

    let taken: [number, number] | null = null;
    for (let a = 0; a < free.length && !taken; a++) {
      for (let b = a + 1; b < free.length && !taken; b++) {
        present[free[a]] = false;
        present[free[b]] = false;
        // 残りが0なら取り切れたので、選べる牌の数は問わない
        const ok = left - 2 === 0 || freeSlots(present).length >= 2;
        if (ok) {
          taken = [free[a], free[b]];
        } else {
          present[free[a]] = true;
          present[free[b]] = true;
        }
      }
    }
    if (!taken) return null;

    order.push(taken);
    left -= 2;
  }
  return order;
}

/** 配り直しの上限。1回で決まるのが普通で、ここまで来ることはまず無い */
const DEAL_ATTEMPTS = 200;

/**
 * 絵柄IDの多重集合を、合う2枚ずつの組に分ける。
 *
 * 通常の34種は同じIDどうしでしか合わないので同じIDで組にする。
 * 花牌・季節牌は組の中ならどれとでも合うので、組の中でシャッフルして2枚ずつにする。
 * どちらも枚数は必ず偶数になる（配り始めは4枚ずつ／1枚ずつ×4種、
 * 遊んでいる途中も合う2枚ずつしか消えないため）。
 */
function pairUpFaces(faces: readonly string[], rng: Rng): [string, string][] {
  const byGroup = new Map<string, string[]>();
  for (const id of faces) {
    const group = faceById(id).group;
    const list = byGroup.get(group);
    if (list) list.push(id);
    else byGroup.set(group, [id]);
  }

  const pairs: [string, string][] = [];
  for (const [group, list] of byGroup) {
    if (list.length % 2 !== 0) {
      throw new Error(`合う2枚に分けられません: ${group} が ${list.length} 枚`);
    }
    const order = shuffled(list, rng);
    for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  }
  return shuffled(pairs, rng);
}

export interface Arrangement {
  /** マス番号 → 絵柄ID。場に無いマスは空文字 */
  faces: string[];
  /** 必ずクリアできる消し順。テストがこの順で消して全消しを確かめる */
  solution: [number, number][];
}

/**
 * 指定したマスに絵柄を配る。**必ずクリアできる配置になる。**
 *
 * 最初の配り（144マス全部）と、遊んでいる途中のシャッフル（残っているマスだけ）の
 * どちらもこの1本を通す。「消せる順番を先に作り、その組に合う2枚を割り当てる」
 * という手順が同じで、配る対象のマスが違うだけだから。
 *
 * 何度やっても組めなかったときだけ投げる。詰みが避けられない盤面を黙って配ると、
 * 遊んでみるまで壊れていることに気づけないため、握りつぶさない。
 *
 * @param slots 配る対象のマス番号
 * @param pool  配る絵柄（枚数は slots と同じで、合う組に分けられること）
 */
export function arrange(
  slots: readonly number[],
  pool: readonly string[],
  rng: Rng = Math.random,
): Arrangement {
  if (slots.length !== pool.length) {
    throw new Error(`マスと牌の数が合いません: ${slots.length} !== ${pool.length}`);
  }

  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
    const order = removalOrder(slots, rng);
    if (!order) continue;

    const facePairs = pairUpFaces(pool, rng);
    const faces = new Array<string>(TURTLE_LAYOUT.length).fill('');
    order.forEach(([a, b], i) => {
      faces[a] = facePairs[i][0];
      faces[b] = facePairs[i][1];
    });
    return { faces, solution: order };
  }

  throw new Error('クリアできる配置を作れませんでした');
}

/** 144枚を亀レイアウトに配る。**必ずクリアできる配置になる** */
export function deal(rng: Rng = Math.random): Arrangement {
  return arrange(
    TURTLE_LAYOUT.map((_, i) => i),
    TILE_MULTISET,
    rng,
  );
}

/** 盤面の状態。手番の概念が無いので、これだけで全部 */
export interface MahjongState {
  /** マス番号 → 絵柄ID */
  faces: string[];
  /** マス番号 → 場に残っているか */
  present: boolean[];
  /** 消した組を消した順に。もどす（undo）に使う */
  removed: [number, number][];
  /** 選択中のマス。未選択は null */
  selected: number | null;
}

export function newGame(rng: Rng = Math.random): MahjongState {
  const { faces } = deal(rng);
  return {
    faces,
    present: new Array<boolean>(faces.length).fill(true),
    removed: [],
    selected: null,
  };
}

/** 場に残っている枚数 */
export function remaining(state: MahjongState): number {
  return state.present.reduce((n, p) => (p ? n + 1 : n), 0);
}

/** 全部消せたか */
export function cleared(state: MahjongState): boolean {
  return state.present.every((p) => !p);
}

/**
 * いま消せる組をすべて返す。
 * ヒント・詰み検出の両方がこれを使う（判定を2か所に書かないため）。
 */
export function availableMatches(state: MahjongState): [number, number][] {
  const free = freeSlots(state.present);
  const out: [number, number][] = [];
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      if (facesMatch(state.faces[free[a]], state.faces[free[b]])) out.push([free[a], free[b]]);
    }
  }
  return out;
}

/** 詰み。まだ牌が残っているのに、消せる組が1つも無い */
export function deadlocked(state: MahjongState): boolean {
  return !cleared(state) && availableMatches(state).length === 0;
}

/**
 * ヒント。消せる組を1つ返す（無ければ null）。
 * 毎回同じ組を出すと「ヒントを押しても何も進まない」ように見えるので、乱数で選ぶ。
 */
export function hint(state: MahjongState, rng: Rng = Math.random): [number, number] | null {
  const matches = availableMatches(state);
  if (matches.length === 0) return null;
  return matches[Math.floor(rng() * matches.length)];
}

/** タップの結果。UI側が音や計測を出し分けるために何が起きたかを返す */
export type TapResult = 'ignored' | 'selected' | 'deselected' | 'matched' | 'mismatched';

export interface TapOutcome {
  state: MahjongState;
  result: TapResult;
}

/**
 * 牌をタップしたときの遷移。**操作はこれ1つだけ**（同じ絵柄を2回タップして消す）。
 *
 * - 選べない牌は無視する（塞がった牌を押しても何も起きない）
 * - 選択中の牌をもう一度押すと選択解除
 * - 合う牌なら2枚とも消える。合わなければ、押したほうを新しく選択し直す
 *   （選択が外れるだけだと、続けて別の牌を選ぶのに2回押すことになるため）
 */
export function tap(state: MahjongState, slot: number): TapOutcome {
  if (!isFree(state.present, slot)) return { state, result: 'ignored' };

  if (state.selected === slot) {
    return { state: { ...state, selected: null }, result: 'deselected' };
  }

  if (state.selected === null) {
    return { state: { ...state, selected: slot }, result: 'selected' };
  }

  if (!facesMatch(state.faces[state.selected], state.faces[slot])) {
    return { state: { ...state, selected: slot }, result: 'mismatched' };
  }

  const present = [...state.present];
  present[state.selected] = false;
  present[slot] = false;
  return {
    state: {
      ...state,
      present,
      removed: [...state.removed, [state.selected, slot]],
      selected: null,
    },
    result: 'matched',
  };
}

/** もどす。直前に消した組を場に戻す。消していなければ何もしない */
export function undo(state: MahjongState): MahjongState {
  if (state.removed.length === 0) return state;
  const removed = [...state.removed];
  const [a, b] = removed.pop() as [number, number];
  const present = [...state.present];
  present[a] = true;
  present[b] = true;
  return { ...state, present, removed, selected: null };
}

/**
 * 場に残っている牌を配り直す（シャッフル）。
 *
 * **並べ替えたあともクリアできることを保証する。** 残っているマスに対して
 * `deal` と同じやり方（消せる順番を先に作って、その組に同じ絵柄を配る）を
 * もう一度回すだけなので、詰みで押したのに詰みのまま、が起きない。
 * もどす履歴は消す（戻した先の絵柄がもう違うため、戻せると嘘になる）。
 */
export function shuffleRemaining(state: MahjongState, rng: Rng = Math.random): MahjongState {
  const slots = presentSlots(state);
  if (slots.length === 0) return state;

  let arranged: Arrangement;
  try {
    arranged = arrange(
      slots,
      slots.map((i) => state.faces[i]),
      rng,
    );
  } catch {
    // 残った牌が上下に重なった2枚だけ、のように、絵柄をどう配っても
    // 取り切れない形になっていることがある。並べ替えても救えないので盤面は触らない
    return { ...state, selected: null };
  }

  // 場に無いマスは空文字で返るので、消えた牌の絵柄はそのまま残す
  // （盤面データに空文字を混ぜないほうが描画側の分岐が減る）
  const next = state.faces.map((id, i) => (state.present[i] ? arranged.faces[i] : id));
  return { ...state, faces: next, removed: [], selected: null };
}

/** 場に残っているマス番号 */
export function presentSlots(state: MahjongState): number[] {
  return state.present.flatMap((p, i) => (p ? [i] : []));
}

/** レイアウトの検算に使う定数（テストとUIが同じ値を見るため） */
export const LAYOUT_SIZE = TURTLE_LAYOUT.length;

/** 同じ絵柄が4枚ずつ入る種類の数（34）。テストが「136枚ちょうど」を見張る */
export const STANDARD_KINDS = STANDARD_FACES.length;

/** 1枚ずつ入る花牌・季節牌の枚数（8） */
export const BONUS_COUNT = BONUS_FACES.length;
