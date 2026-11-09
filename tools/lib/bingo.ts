/**
 * ビンゴ抽選機とビンゴカードのロジック（純関数のみ。DOM・React に依存しない）。
 *
 * 仕様: docs/features/bingo-chusenki.md
 *
 * 1. **抽選の乱数は `crypto.getRandomValues` だけ**を使い、剰余の偏りを棄却法で消す（`randomBelow`）。
 *    乱数源を引数（`Uint32Source`）にしてあるのは、テストで棄却の境界を固定するため
 * 2. **カードは「合言葉＋カード番号」だけから決まる。** `合言葉 + ':' + 番号` を FNV-1a で 32bit にして
 *    sfc32 の種にする。ほかのカードを作らなくても同じカードになり、カードの中身は保存も送信もしない
 * 3. **重複したら作り直す、はやらない**（作り直すと番号ごとのカードが前のカードに依存する）。
 *    標準カードは約 5.5×10²⁶ 通りあり、100 枚で一致する確率は約 9×10⁻²⁴
 */

/** 0 以上 2³² 未満の整数を1つ返す乱数源 */
export type Uint32Source = () => number;

/** 既定の乱数源。Web Crypto（ブラウザにも Node.js 19+ にもある） */
export const cryptoUint32: Uint32Source = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

const TWO_32 = 2 ** 32;

/**
 * 0 以上 `n` 未満の整数を偏りなく返す（棄却法）。
 * `2^32 % n` 個ぶんの端（`limit` 以上）を捨てて引き直す。
 */
export function randomBelow(n: number, random: Uint32Source = cryptoUint32): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
    throw new RangeError(`乱数の範囲が不正です: ${n}`);
  }
  const limit = TWO_32 - (TWO_32 % n);
  for (;;) {
    const x = random() >>> 0;
    if (x < limit) return x % n;
  }
}

// ------------------------------------------------------------------
// 抽選
// ------------------------------------------------------------------

/** 標準の範囲（B〜O の5列×15） */
export const STANDARD_MAX = 75;
/** 「1〜◯まで」で選べる範囲 */
export const MIN_MAX = 10;
export const MAX_MAX = 99;

/** 演出の長さ（ミリ秒）。このあいだは次を引かない */
export const ANIMATION_MS = 1200;

export const LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
export type Letter = (typeof LETTERS)[number];

export function isValidMax(max: number): boolean {
  return Number.isInteger(max) && max >= MIN_MAX && max <= MAX_MAX;
}

/** まだ出ていない番号（小さい順） */
export function remainingNumbers(drawn: readonly number[], max: number): number[] {
  const seen = new Set(drawn);
  const out: number[] = [];
  for (let n = 1; n <= max; n++) if (!seen.has(n)) out.push(n);
  return out;
}

/**
 * まだ出ていない番号から1つを等確率で引き、出た順の列に足した新しい列を返す。
 * 全部出ていたら `null`。
 */
export function drawNext(
  drawn: readonly number[],
  max: number,
  random: Uint32Source = cryptoUint32,
): { drawn: number[]; number: number } | null {
  const rest = remainingNumbers(drawn, max);
  if (rest.length === 0) return null;
  const number = rest[randomBelow(rest.length, random)];
  return { drawn: [...drawn, number], number };
}

/** 1つ戻す（直前の番号を残りに戻す） */
export function undoLast(drawn: readonly number[]): number[] {
  return drawn.slice(0, -1);
}

/** 1〜75 の番号の列の文字（B〜O）。範囲外なら null */
export function letterOf(n: number): Letter | null {
  if (!Number.isInteger(n) || n < 1 || n > STANDARD_MAX) return null;
  return LETTERS[Math.floor((n - 1) / 15)];
}

/** 画面に出す形。範囲が 1〜75 のときだけ「B-7」、それ以外は数字だけ */
export function numberLabel(n: number, max: number): string {
  if (max !== STANDARD_MAX) return String(n);
  return `${letterOf(n)}-${n}`;
}

/** 盤面の行。1〜75 は B〜O の5行×15、それ以外は 1 から順に 10 列で折り返す */
export function boardRows(max: number): { letter: Letter | null; numbers: number[] }[] {
  if (max === STANDARD_MAX) {
    return LETTERS.map((letter, i) => ({
      letter,
      numbers: Array.from({ length: 15 }, (_, k) => i * 15 + k + 1),
    }));
  }
  const rows: { letter: Letter | null; numbers: number[] }[] = [];
  for (let start = 1; start <= max; start += 10) {
    rows.push({
      letter: null,
      numbers: Array.from({ length: Math.min(10, max - start + 1) }, (_, k) => start + k),
    });
  }
  return rows;
}

// ------------------------------------------------------------------
// キー操作（誤爆防止）
// ------------------------------------------------------------------

export interface KeyContext {
  key: string;
  /** 押しっぱなし */
  repeat: boolean;
  /** 入力欄（input / textarea / select / contenteditable）にフォーカスがある */
  inInput: boolean;
  /** 「引く」ボタンそのものにフォーカスがある（ボタンの click に任せる） */
  onDrawButton: boolean;
  /** ほかのボタンやリンクにフォーカスがある（そのボタンの Space / Enter を奪わない） */
  onOtherControl: boolean;
  dialogOpen: boolean;
  animating: boolean;
}

/**
 * `document` の keydown で引いてよいか。
 * Space / Enter だけ。入力欄・ダイアログ・演出中・押しっぱなしでは引かない。
 * 「引く」ボタンにフォーカスがあるときはボタンの click が走るので、こちらでは何もしない（2個引く事故を防ぐ）
 */
export function shouldDrawOnKey(c: KeyContext): boolean {
  if (c.key !== ' ' && c.key !== 'Enter' && c.key !== 'Spacebar') return false;
  if (c.repeat) return false;
  if (c.inInput || c.dialogOpen || c.animating) return false;
  if (c.onDrawButton || c.onOtherControl) return false;
  return true;
}

// ------------------------------------------------------------------
// 合言葉
// ------------------------------------------------------------------

/** 合言葉に使う文字。紛らわしい 0/O・1/I/l を外した大文字と数字（32 文字） */
export const PASSPHRASE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PASSPHRASE_LENGTH = 6;

export function newPassphrase(random: Uint32Source = cryptoUint32): string {
  let s = '';
  for (let i = 0; i < PASSPHRASE_LENGTH; i++) {
    s += PASSPHRASE_ALPHABET[randomBelow(PASSPHRASE_ALPHABET.length, random)];
  }
  return s;
}

/**
 * 入力された合言葉を読む。大文字小文字を区別せず、空白とハイフンは無視する。
 * 使えない文字が入っている・長さが違うときは null
 */
export function normalizePassphrase(input: string): string | null {
  const s = input.normalize('NFKC').replace(/[\s\-‐－]/g, '').toUpperCase();
  if (s.length !== PASSPHRASE_LENGTH) return null;
  for (const ch of s) if (!PASSPHRASE_ALPHABET.includes(ch)) return null;
  return s;
}

// ------------------------------------------------------------------
// カード
// ------------------------------------------------------------------

/** 1セットで作れる枚数 */
export const MIN_CARDS = 1;
export const MAX_CARDS = 100;
/** カード番号の上限（No.001〜No.999。あとから番号を足して作れるように、枚数の上限より大きくしてある） */
export const MAX_CARD_NO = 999;

/** 中央の FREE を表す値 */
export const FREE = 0;

/**
 * カード。`cells[row * 5 + col]`。列 col は LETTERS[col] の範囲（col*15+1〜col*15+15）。
 * 中央（12）は FREE（0）
 */
export type Card = number[];

/** FNV-1a（32bit）。文字列は UTF-16 のコード単位ごとに混ぜる */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** sfc32 の疑似乱数（種を決めれば同じ列）。種のなじませに 15 回空回しする */
export function sfc32(seed: number): Uint32Source {
  let a = seed >>> 0;
  let b = (seed ^ 0x9e3779b9) >>> 0;
  let c = (seed ^ 0x85ebca6b) >>> 0;
  let d = 1;
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) next();
  return next;
}

/** 乱数源から標準カードを1枚作る */
export function cardFromRandom(random: Uint32Source): Card {
  const out = new Int32Array(25);
  fillCard(out, new Int32Array(15), random);
  return Array.from(out);
}

/** 「合言葉＋カード番号」から決まるカード。ほかの番号のカードに依存しない */
export function makeCard(passphrase: string, no: number): Card {
  return cardFromRandom(sfc32(fnv1a32(`${passphrase}:${no}`)));
}

/** カード番号の表示（No.001） */
export function cardNoLabel(no: number): string {
  return `No.${String(no).padStart(3, '0')}`;
}

// ------------------------------------------------------------------
// 判定
// ------------------------------------------------------------------

export interface Line {
  /** 画面に出す名前（「横1行目」「縦 B 列」「斜め（左上から右下）」） */
  name: string;
  cells: number[];
}

/** 縦横斜めの 12 列 */
export const LINES: Line[] = [
  ...Array.from({ length: 5 }, (_, r) => ({
    name: `横${r + 1}行目`,
    cells: Array.from({ length: 5 }, (_, c) => r * 5 + c),
  })),
  ...Array.from({ length: 5 }, (_, c) => ({
    name: `縦 ${LETTERS[c]} 列`,
    cells: Array.from({ length: 5 }, (_, r) => r * 5 + c),
  })),
  { name: '斜め（左上から右下）', cells: [0, 6, 12, 18, 24] },
  { name: '斜め（右上から左下）', cells: [4, 8, 12, 16, 20] },
];

export interface CardCheck {
  /** マスごとの「開いているか」（FREE は開いている） */
  marked: boolean[];
  /** 揃った列 */
  bingo: Line[];
  /** あと1つの列と、待っている番号 */
  reach: { line: Line; waiting: number }[];
  /** 待っている番号（重複なし・小さい順） */
  waiting: number[];
  status: 'bingo' | 'reach' | 'none';
}

export function checkCard(card: Card, drawn: Iterable<number>): CardCheck {
  const seen = new Set(drawn);
  const marked = card.map((n) => n === FREE || seen.has(n));
  const bingo: Line[] = [];
  const reach: { line: Line; waiting: number }[] = [];
  for (const line of LINES) {
    const open = line.cells.filter((i) => !marked[i]);
    if (open.length === 0) bingo.push(line);
    else if (open.length === 1) reach.push({ line, waiting: card[open[0]] });
  }
  const waiting = [...new Set(reach.map((r) => r.waiting))].sort((a, b) => a - b);
  return {
    marked,
    bingo,
    reach,
    waiting,
    status: bingo.length > 0 ? 'bingo' : reach.length > 0 ? 'reach' : 'none',
  };
}

// ------------------------------------------------------------------
// 目安の表（シミュレーション）
// ------------------------------------------------------------------

/** 12 列のマスの番号を平らに並べたもの（シミュレーションを速くするため） */
const LINE_CELLS = Int8Array.from(LINES.flatMap((l) => l.cells));

/** 何個目の番号でそのカードが初めてビンゴになるか（`positionOf[番号]` は引いた順の何個目か） */
export function bingoDrawIndex(card: ArrayLike<number>, positionOf: Int32Array): number {
  let best = Infinity;
  for (let l = 0; l < LINE_CELLS.length; l += 5) {
    let worst = 0;
    for (let k = l; k < l + 5; k++) {
      const n = card[LINE_CELLS[k]];
      if (n === FREE) continue;
      const p = positionOf[n];
      if (p > worst) worst = p;
    }
    if (worst < best) best = worst;
  }
  return best;
}

/**
 * 標準カードを `out` に書き込む。各列で部分的なフィッシャー–イェーツにより5つ（N列は4つ）を重複なく選ぶ。
 * シミュレーションで配列を使い回せるように、書き込み先を引数にしている
 */
function fillCard(out: Int32Array, pool: Int32Array, random: Uint32Source): void {
  for (let col = 0; col < 5; col++) {
    for (let k = 0; k < 15; k++) pool[k] = col * 15 + k + 1;
    for (let row = 0; row < 5; row++) {
      if (col === 2 && row === 2) {
        out[12] = FREE;
        continue;
      }
      const j = row + randomBelow(15 - row, random);
      const t = pool[row];
      pool[row] = pool[j];
      pool[j] = t;
      out[row * 5 + col] = pool[row];
    }
  }
}

export interface SimulationRow {
  cards: number;
  /** 最初のビンゴが出る番号の個数（中央値） */
  firstMedian: number;
  /** 10 人目のビンゴが出る番号の個数（中央値）。カードが 10 枚未満なら null */
  tenthMedian: number | null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** 固定の種で、カード枚数ごとの「何個目でビンゴが出るか」を数える */
export function simulate(cards: number, trials: number, seed: number): SimulationRow {
  const random = sfc32(seed);
  const firsts: number[] = [];
  const tenths: number[] = [];
  const positionOf = new Int32Array(STANDARD_MAX + 1);
  const order = Array.from({ length: STANDARD_MAX }, (_, k) => k + 1);
  const card = new Int32Array(25);
  const pool = new Int32Array(15);
  const times = new Int32Array(cards);
  for (let t = 0; t < trials; t++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomBelow(i + 1, random);
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((n, i) => (positionOf[n] = i + 1));
    for (let c = 0; c < cards; c++) {
      fillCard(card, pool, random);
      times[c] = bingoDrawIndex(card, positionOf);
    }
    times.sort();
    firsts.push(times[0]);
    if (cards >= 10) tenths.push(times[9]);
  }
  return {
    cards,
    firstMedian: median(firsts),
    tenthMedian: cards >= 10 ? median(tenths) : null,
  };
}

/** 本文の表に載せる枚数 */
export const TABLE_CARD_COUNTS = [1, 10, 20, 30, 50, 100] as const;
/** 本文の表の試行回数と種（固定。表の数字はここから出す） */
export const TABLE_TRIALS = 4000;
export const TABLE_SEED = 20261109;

export function bingoTable(): SimulationRow[] {
  return TABLE_CARD_COUNTS.map((n, i) => simulate(n, TABLE_TRIALS, TABLE_SEED + i));
}

// ------------------------------------------------------------------
// 保存（localStorage の鍵 hasokon:bingo:v1。値は1つの JSON）
// ------------------------------------------------------------------

export const STORAGE_KEY = 'hasokon:bingo:v1';

export interface SavedState {
  /** 出た順の番号 */
  drawn: number[];
  max: number;
  /** 合言葉（未設定なら空文字） */
  passphrase: string;
  /** ビンゴを確かめたカード番号 */
  bingoDone: number[];
  /** 演出なし */
  noAnimation: boolean;
  /** 効果音（既定はオフ） */
  sound: boolean;
}

export const INITIAL_STATE: SavedState = {
  drawn: [],
  max: STANDARD_MAX,
  passphrase: '',
  bingoDone: [],
  noAnimation: false,
  sound: false,
};

/** 保存した JSON を読む。形が違う・壊れているときは null（古い保存で落ちないように） */
export function parseSaved(raw: string | null): SavedState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const max = o.max;
  if (typeof max !== 'number' || !isValidMax(max)) return null;
  if (!Array.isArray(o.drawn)) return null;
  const drawn: number[] = [];
  const seen = new Set<number>();
  for (const n of o.drawn) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max || seen.has(n)) return null;
    seen.add(n);
    drawn.push(n);
  }
  const passphrase = typeof o.passphrase === 'string' ? (normalizePassphrase(o.passphrase) ?? '') : '';
  const bingoDone = Array.isArray(o.bingoDone)
    ? [...new Set(o.bingoDone.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_CARD_NO))].sort((a, b) => a - b)
    : [];
  return {
    drawn,
    max,
    passphrase,
    bingoDone,
    noAnimation: o.noAnimation === true,
    sound: o.sound === true,
  };
}

export function serializeState(s: SavedState): string {
  return JSON.stringify(s);
}

/**
 * 「最初からやり直す」。出た順とビンゴ済みを消す（前の回のビンゴ済みが残ると二重取り防止が誤判定になる）。
 * 合言葉・範囲・スイッチ類は残す（同じカードで2回戦をするのがふつう）
 */
export function resetGame(s: SavedState): SavedState {
  return { ...s, drawn: [], bingoDone: [] };
}

/** ビンゴ済みに足す（重複なし・小さい順） */
export function addBingoDone(list: readonly number[], no: number): number[] {
  return [...new Set([...list, no])].sort((a, b) => a - b);
}
