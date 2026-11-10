/**
 * バックギャモンのロジック（純関数）
 *
 * 仕様: docs/features/game-backgammon.md
 *
 * ## 盤の持ち方
 *
 * 駒は**それぞれの側から見た番号**で持つ。`pts[side]` は長さ 26 の配列で、
 *
 * - `[0]` … 上げた駒（ベアオフ）
 * - `[1]`〜`[24]` … ポイント（自分から見た番号。24 から 1 へ向かって進む）
 * - `[25]` … バー
 *
 * 自分のポイント t は、相手から見ると `25 - t` になる。どちらの側も
 * 「大きい番号から小さい番号へ進む」同じ形で書けるので、合法手の生成は1通りで済む。
 *
 * ## 目の使い方の決まり（機械が守らせる）
 *
 * - 2 つの目を両方使える手があるなら、両方使わなければならない
 * - 片方しか使えないなら、使える限り大きいほうを使う
 * - 使える手が無ければパス
 *
 * 画面は 1 駒ずつ動かすので、**次に動かせる1歩**（`nextSteps`）を
 * 「その1歩のあとも、目を使い切れる最大の数が減らない」ことで決める。
 * CPU は手番まるごとの手（`legalMoves`）を使い、**同じ局面になる手は1つにまとめる**。
 *
 * ## サイコロ
 *
 * サイコロは `DieSource` として注入する。本番は `cryptoDie()`（棄却サンプリングで
 * 剰余の偏りを出さない）、テストは `dieFromRng(seededRng(...))` で固定する。
 * CPU も人と同じ関数で振る（CPU に有利な目を出さない）。
 */

/** 手番の側（0 と 1。画面ではどちらが人かを Game.tsx が決める） */
export type Side = 0 | 1;

/** サイコロの目 */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/** サイコロ1個を振る関数 */
export type DieSource = () => Die;

/** 乱数（`Math.random` と同じ形）。テストからは `seededRng` を渡す */
export type Rng = () => number;

/** 1 側の駒の数 */
export const CHECKERS = 15;
/** 上げた駒の置き場の添え字 */
export const OFF = 0;
/** バーの添え字 */
export const BAR = 25;

/** 片側の駒（長さ 26。自分から見た番号） */
export type Checkers = number[];

/** 1 駒を 1 つの目で動かす1歩 */
export interface Step {
  /** 動かす前（1〜24、バーは 25） */
  from: number;
  /** 動かした先（1〜24、上げたら 0） */
  to: number;
  /** 使った目 */
  die: number;
  /** 相手のブロットを打ったか */
  hit: boolean;
}

/** 手番まるごとの手（CPU が使う） */
export interface Move {
  steps: Step[];
  /** 指したあとの自分の駒 */
  me: Checkers;
  /** 指したあとの相手の駒 */
  opp: Checkers;
}

// ---------------------------------------------------------------- サイコロ

const UINT32 = 2 ** 32;
/**
 * 棄却の境目。これ以上の 32 bit の整数は捨てて引き直す。
 * 2³² は 6 で割り切れない（余り 4）ので、そのまま `% 6` すると 1〜4 がわずかに出やすくなる
 */
export const REJECT_FROM = UINT32 - (UINT32 % 6);

/** `crypto.getRandomValues()` で 32 bit の整数を1つ引く */
function cryptoUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * 本番のサイコロ。32 bit の整数 x を引き、x ≥ 2³² − (2³² mod 6) なら引き直す。
 *
 * @param source 32 bit の整数の源（テストで棄却の境目を確かめるために差し替える）
 */
export function cryptoDie(source: () => number = cryptoUint32): Die {
  for (;;) {
    const x = source() >>> 0;
    if (x >= REJECT_FROM) continue;
    return ((x % 6) + 1) as Die;
  }
}

/** 乱数からサイコロを作る（テスト・CPU の読みの再現用） */
export function dieFromRng(rng: Rng): DieSource {
  return () => (Math.floor(rng() * 6) + 1) as Die;
}

// ---------------------------------------------------------------- 盤

/** 初期配置（自分から見て 24 に 2・13 に 5・8 に 3・6 に 5） */
export function initialCheckers(): Checkers {
  const c = new Array<number>(26).fill(0);
  c[24] = 2;
  c[13] = 5;
  c[8] = 3;
  c[6] = 5;
  return c;
}

/** ピップカウント（上がりまでの残りの目の合計） */
export function pipCount(c: Checkers): number {
  let sum = 0;
  for (let i = 1; i <= 25; i++) sum += i * c[i];
  return sum;
}

/** すべての駒がインナーボード（1〜6）か上げ済みか */
export function allHome(c: Checkers): boolean {
  for (let i = 7; i <= 25; i++) if (c[i] > 0) return false;
  return true;
}

/** 局面を文字列にする（同じ局面をまとめるため） */
export function positionKey(me: Checkers, opp: Checkers): string {
  return `${me.join(',')}|${opp.join(',')}`;
}

/**
 * 1 つの目で動かせる1歩をすべて返す（目の使い方の決まりはまだ見ない）。
 *
 * - バーに駒があるうちは、エンターしか動かせない
 * - 相手の駒が 2 個以上あるポイントには止まれない
 * - ベアオフは全駒がインナーボードにあるときだけ。ちょうどの目か、
 *   目より大きい数のポイントに駒が無いときのいちばん遠い駒
 */
export function stepsForDie(me: Checkers, opp: Checkers, die: number): Step[] {
  const out: Step[] = [];
  if (me[BAR] > 0) {
    const t = BAR - die;
    if (opp[25 - t] < 2) out.push({ from: BAR, to: t, die, hit: opp[25 - t] === 1 });
    return out;
  }
  const home = allHome(me);
  let highest = 0;
  if (home) {
    for (let i = 6; i >= 1; i--) {
      if (me[i] > 0) {
        highest = i;
        break;
      }
    }
  }
  for (let i = 24; i >= 1; i--) {
    if (me[i] === 0) continue;
    const t = i - die;
    if (t >= 1) {
      if (opp[25 - t] < 2) out.push({ from: i, to: t, die, hit: opp[25 - t] === 1 });
    } else if (home && (t === 0 || i === highest)) {
      out.push({ from: i, to: OFF, die, hit: false });
    }
  }
  return out;
}

/** 1歩を当てた新しい駒の配置（元は変えない） */
export function applyStep(me: Checkers, opp: Checkers, s: Step): [Checkers, Checkers] {
  const m = me.slice();
  const o = opp.slice();
  m[s.from]--;
  m[s.to]++;
  if (s.to >= 1 && o[25 - s.to] === 1) {
    o[25 - s.to] = 0;
    o[BAR]++;
  }
  return [m, o];
}

/** 振った目から、この手番で使える目の並び（ゾロ目は4回） */
export function diceToUse(dice: readonly number[]): number[] {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

/** 残りの目から1つ取り除く */
function without(dice: readonly number[], die: number): number[] {
  const i = dice.indexOf(die);
  return i < 0 ? dice.slice() : [...dice.slice(0, i), ...dice.slice(i + 1)];
}

/**
 * 残りの目で、最大でいくつ目を使えるか。
 * ゾロ目は「動かす前の位置が大きい順」に限って数える（順番を入れ替えただけの手を読まない）
 */
export function maxUsable(me: Checkers, opp: Checkers, dice: readonly number[], below = 26): number {
  if (dice.length === 0) return 0;
  const values = [...new Set(dice)];
  const doubles = values.length === 1;
  let best = 0;
  for (const d of values) {
    for (const s of stepsForDie(me, opp, d)) {
      if (doubles && s.from > below) continue;
      const [m, o] = applyStep(me, opp, s);
      // 最後の1個を上げたら、残りの目は使わなくても使い切ったのと同じ（決着している）
      const n = m[OFF] === CHECKERS ? dice.length : 1 + maxUsable(m, o, without(dice, d), doubles ? s.from : 26);
      if (n > best) best = n;
      if (best === dice.length) return best;
    }
  }
  return best;
}

/**
 * 手番まるごとの合法手。**同じ局面になる手は1つにまとめる**。
 * 使える手が無ければ、何も動かさない手が1つだけ返る（パス）。
 */
export function legalMoves(me: Checkers, opp: Checkers, dice: readonly number[]): Move[] {
  const use = diceToUse(dice);
  const doubles = use.length === 4;
  const orders = doubles ? [use] : [use, [use[1], use[0]]];
  const all: Move[] = [];
  const walk = (m: Checkers, o: Checkers, order: number[], k: number, steps: Step[], below: number) => {
    const cand = k < order.length ? stepsForDie(m, o, order[k]).filter((s) => !doubles || s.from <= below) : [];
    if (cand.length === 0) {
      all.push({ steps, me: m, opp: o });
      return;
    }
    for (const s of cand) {
      const [m2, o2] = applyStep(m, o, s);
      walk(m2, o2, order, k + 1, [...steps, s], s.from);
    }
  };
  for (const order of orders) walk(me, opp, order, 0, [], 26);

  // 決着した手は、目を使い切った手と同じに数える
  const used = (x: Move) => (x.me[OFF] === CHECKERS ? use.length : x.steps.length);
  const max = Math.max(...all.map(used));
  let kept = all.filter((x) => used(x) === max);
  if (max === 1 && !doubles) {
    const big = Math.max(use[0], use[1]);
    const withBig = kept.filter((x) => x.steps[0].die === big);
    if (withBig.length > 0) kept = withBig;
  }
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const x of kept) {
    const key = positionKey(x.me, x.opp);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------- 対局の進行

export type Phase = 'roll' | 'move' | 'done';

export interface BgState {
  /** 両者の駒（それぞれの側から見た番号） */
  pts: [Checkers, Checkers];
  /** 手番 */
  turn: Side;
  /** 振る前・動かしている・決着 */
  phase: Phase;
  /** この手番で振った目（2 つ。振る前は null） */
  dice: [number, number] | null;
  /** 先手決めの目（[側0, 側1]）。最初の「振る」でこの2つの目を使う */
  opening: [number, number] | null;
  /** 手番の初めの駒（1手戻すのため） */
  turnStart: [Checkers, Checkers] | null;
  /** この手番で動かした1歩 */
  played: Step[];
  /** この手番で使える目の数の最大（決まりで使わなければならない数） */
  required: number;
  /** 勝った側 */
  winner: Side | null;
  /** 勝ちの点数（1・2・3） */
  points: number;
}

function other(s: Side): Side {
  return s === 0 ? 1 : 0;
}

/**
 * 先手決め。互いに1個ずつ振り、大きいほうが先手（同じ目なら振り直し）。
 * 先手はその2つの目で最初の手を指す
 */
export function openingRoll(die: DieSource): { dice: [number, number]; first: Side } {
  for (;;) {
    const a = die();
    const b = die();
    if (a !== b) return { dice: [a, b], first: a > b ? 0 : 1 };
  }
}

/** 新しい対局（先手決めまで済ませた、最初の「振る」を待つ局面） */
export function newGame(die: DieSource): BgState {
  const { dice, first } = openingRoll(die);
  return {
    pts: [initialCheckers(), initialCheckers()],
    turn: first,
    phase: 'roll',
    dice: null,
    opening: dice,
    turnStart: null,
    played: [],
    required: 0,
    winner: null,
    points: 0,
  };
}

/** 手番の側から見た [自分, 相手] */
export function sides(state: BgState): [Checkers, Checkers] {
  return [state.pts[state.turn], state.pts[other(state.turn)]];
}

function withSides(state: BgState, me: Checkers, opp: Checkers): [Checkers, Checkers] {
  return state.turn === 0 ? [me, opp] : [opp, me];
}

/**
 * サイコロを振る。最初の手番は先手決めの2つの目を使う（振り直さない）
 */
export function roll(state: BgState, die: DieSource): BgState {
  if (state.phase !== 'roll') return state;
  const dice: [number, number] = state.opening
    ? [state.opening[state.turn], state.opening[other(state.turn)]]
    : [die(), die()];
  const [me, opp] = sides(state);
  return {
    ...state,
    phase: 'move',
    dice,
    opening: null,
    turnStart: state.pts,
    played: [],
    required: maxUsable(me, opp, diceToUse(dice)),
  };
}

/** まだ使っていない目 */
export function remainingDice(state: BgState): number[] {
  if (!state.dice) return [];
  let rest = diceToUse(state.dice);
  for (const s of state.played) rest = without(rest, s.die);
  return rest;
}

/**
 * 次に動かせる1歩。**その1歩のあとも、決まりで使わなければならない目の数を使い切れる**ものだけ。
 * 片方の目しか使えない手番では、大きいほうの目が使えるなら大きいほうだけ
 */
export function nextSteps(state: BgState): Step[] {
  if (state.phase !== 'move' || !state.dice) return [];
  const left = state.required - state.played.length;
  if (left <= 0) return [];
  const rest = remainingDice(state);
  const [me, opp] = sides(state);
  const out: Step[] = [];
  const values = [...new Set(rest)].sort((a, b) => a - b);
  for (const d of values) {
    for (const s of stepsForDie(me, opp, d)) {
      const [m, o] = applyStep(me, opp, s);
      if (m[OFF] === CHECKERS || 1 + maxUsable(m, o, without(rest, d)) >= left) out.push(s);
    }
  }
  const [a, b] = state.dice;
  if (state.required === 1 && a !== b) {
    const big = Math.max(a, b);
    const withBig = out.filter((s) => s.die === big);
    if (withBig.length > 0) return withBig;
  }
  return out;
}

function sameStep(a: Step, b: Step): boolean {
  return a.from === b.from && a.to === b.to && a.die === b.die;
}

/** 駒を1歩動かす。決着したら `done`。`autoPass` なら目を使い切った瞬間に手番を渡す */
export function playStep(state: BgState, step: Step, autoPass = false): BgState {
  const legal = nextSteps(state).find((s) => sameStep(s, step));
  if (!legal) return state;
  const [me, opp] = sides(state);
  const [m, o] = applyStep(me, opp, legal);
  let next: BgState = {
    ...state,
    pts: withSides(state, m, o),
    played: [...state.played, legal],
  };
  if (m[OFF] === CHECKERS) {
    next = { ...next, phase: 'done', winner: state.turn, points: winPoints(o) };
    return next;
  }
  if (autoPass && canEndTurn(next)) next = endTurn(next);
  return next;
}

/** 決着したときの点数。相手が1個も上げていなければギャモン（2点）、
    さらに相手の駒がバーか勝者のインナーボードに残っていればバックギャモン（3点） */
export function winPoints(loser: Checkers): number {
  if (loser[OFF] > 0) return 1;
  // 勝者のインナーボード（勝者から見て 1〜6）は、負けた側から見て 19〜24
  for (let i = 19; i <= 25; i++) if (loser[i] > 0) return 3;
  return 2;
}

/** 1手戻せるか（この手番で振ったあとの手だけ。振った目は戻さない） */
export function canUndo(state: BgState): boolean {
  return state.phase === 'move' && state.played.length > 0;
}

/** 1手戻す。振った目はそのまま */
export function undoStep(state: BgState): BgState {
  if (!canUndo(state) || !state.turnStart) return state;
  const keep = state.played.slice(0, -1);
  let s: BgState = { ...state, pts: state.turnStart, played: [] };
  for (const step of keep) s = playStep(s, step);
  return s;
}

/** 手番を終えられるか（目を全部使った、または使える手が尽きた） */
export function canEndTurn(state: BgState): boolean {
  return state.phase === 'move' && nextSteps(state).length === 0;
}

/** 手番を渡す */
export function endTurn(state: BgState): BgState {
  if (!canEndTurn(state)) return state;
  return {
    ...state,
    turn: other(state.turn),
    phase: 'roll',
    dice: null,
    turnStart: null,
    played: [],
    required: 0,
  };
}

/**
 * 選んだ駒の行き先の候補。**行き先ごとに1つ**（重複させない）。
 * 2つ以上の目を合わせた行き先は、途中で止まれる場合だけ出す。
 * 値はその行き先までの1歩の並び（短い順・小さい目から先に探す）
 */
export function destinations(state: BgState, from: number): Map<number, Step[]> {
  const out = new Map<number, Step[]>();
  let frontier: { state: BgState; at: number; path: Step[] }[] = [{ state, at: from, path: [] }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const s of nextSteps(f.state)) {
        if (s.from !== f.at) continue;
        const path = [...f.path, s];
        if (!out.has(s.to)) {
          out.set(s.to, path);
          const after = playStep(f.state, s);
          if (s.to !== OFF && after.phase === 'move') next.push({ state: after, at: s.to, path });
        }
      }
    }
    frontier = next;
  }
  return out;
}

/** 動かせる駒のあるポイント（光らせる列） */
export function movableFrom(state: BgState): number[] {
  return [...new Set(nextSteps(state).map((s) => s.from))];
}

/** 側 s のポイント（s から見た番号 n）を、側 0 から見た番号に直す（画面の並べ方に使う） */
export function toSide0(side: Side, n: number): number {
  return side === 0 ? n : 25 - n;
}
