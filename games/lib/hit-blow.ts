/**
 * ヒット＆ブロー（数あて）のロジック
 *
 * 仕様: docs/features/game-hit-blow.md
 *
 * 0〜9 から**重複なし**で 3 桁または 4 桁（先頭の 0 も可）の数を、
 * 「ヒット（数字も場所も合う）」「ブロー（数字は合うが場所が違う）」のヒントで当てる。
 *
 * ## CPU はずるをしない
 *
 * `cpuGuess()` は**引数に利用者の隠した数を取らない**。CPU が知っているのは
 * 自分が出した推測と、そこに返ってきたヒントだけで、それは型で保証される。
 *
 * ## つよい CPU は履歴から決定的に決まる
 *
 * 「残り候補を最も小さく割る手（最悪ケース最小）。同点なら候補の中の手、その中で辞書順に最小」。
 * 乱数を使わないので、同じ候補の集合からは必ず同じ手が出る。
 * テストはこれを使って判定木を 1 度だけ作り、全答えの手数を数える。
 *
 * 計算の山は 2 手目（候補が千通り超）なので、**1 手目は定数、2 手目は 1 手目の応答ごとの表**
 * （`SECOND_MOVE`）を持つ。表は `buildSecondMoveTable()` の結果をそのまま写したもので、
 * テストが「表の手 ＝ その場で計算した手」を確かめる（食い違ったらテストが正しい表を出す）。
 */

import { dailySeed, mulberry32, type DateKey } from './daily';

/** 桁数 */
export type Digits = 3 | 4;

export const DIGIT_OPTIONS: readonly Digits[] = [3, 4];

/** 今日の 1 問の桁数 */
export const DAILY_DIGITS: Digits = 4;

/** 数（`'0123'` のような文字列。先頭の 0 も残すため数値にしない） */
export type Code = string;

export interface Feedback {
  hit: number;
  blow: number;
}

/** 1 手（推測とそこに返ったヒント） */
export interface Turn extends Feedback {
  guess: Code;
}

export type Level = 'easy' | 'normal' | 'strong';

export const LEVEL_ORDER: readonly Level[] = ['easy', 'normal', 'strong'];

export const LEVEL_LABEL: Record<Level, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  strong: 'つよい',
};

export type Mode = 'daily' | 'practice' | 'cpu';

export const MODE_ORDER: readonly Mode[] = ['daily', 'practice', 'cpu'];

export const MODE_LABEL: Record<Mode, string> = {
  daily: '今日の1問',
  practice: '練習',
  cpu: 'CPUと対戦',
};

/** やさしい CPU が矛盾する手（まだ出していない数）を混ぜる割合 */
export const EASY_MISTAKE_RATE = 1 / 3;

/** 今日の 1 問で「残りの候補」のヒントを出せるようになる手数（これを超えたら出す） */
export const HINT_AFTER_MOVES = 10;

/**
 * 日替わりの答えの作り方の版。**作り方を変えたら上げる**
 * （上げないと、過去の「今日の 1 問」が黙って別の答えになる）
 */
export const DAILY_VERSION = 1;

/** 記録の変種キー（`lib/records.ts`） */
export function variantOf(mode: Mode, digits: Digits, level: Level): string {
  if (mode === 'daily') return `daily-${DAILY_DIGITS}`;
  if (mode === 'practice') return `practice-${digits}`;
  return `cpu-${level}`;
}

// ---------------------------------------------------------------------------
// 判定

/** 桁数がそろっていて、0〜9 の数字だけで、同じ数字を使っていないか */
export function isValidCode(code: string, digits: Digits): boolean {
  if (code.length !== digits || !/^[0-9]+$/.test(code)) return false;
  return new Set(code).size === code.length;
}

/**
 * ヒットとブローを数える。
 *
 * 同じ数字が同じ場所にあるときは**ヒットだけ**に数える（ブローに二重に数えない）。
 * 重複なしの数どうしなので、「共通の数字の数 − ヒット」がブローになる。
 */
export function score(secret: Code, guess: Code): Feedback {
  let hit = 0;
  let common = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) hit++;
    if (secret.includes(guess[i])) common++;
  }
  return { hit, blow: common - hit };
}

/** 全部ヒット（当たり）か */
export function isSolved(fb: Feedback, digits: Digits): boolean {
  return fb.hit === digits;
}

// ---------------------------------------------------------------------------
// 候補

interface Table {
  codes: Code[];
  /** 各数で使っている数字のビット（0〜9 → 1<<d） */
  masks: Uint16Array;
  /** 各桁の数字（`codes[i][k]` を数にしたもの。i*digits+k） */
  cells: Uint8Array;
  index: Map<Code, number>;
}

const tables = new Map<Digits, Table>();

function tableOf(digits: Digits): Table {
  const cached = tables.get(digits);
  if (cached) return cached;
  const codes: Code[] = [];
  const walk = (prefix: string) => {
    if (prefix.length === digits) {
      codes.push(prefix);
      return;
    }
    for (let d = 0; d <= 9; d++) {
      const c = String(d);
      if (!prefix.includes(c)) walk(prefix + c);
    }
  };
  walk('');
  const masks = new Uint16Array(codes.length);
  const cells = new Uint8Array(codes.length * digits);
  codes.forEach((code, i) => {
    for (let k = 0; k < digits; k++) {
      const d = code.charCodeAt(k) - 48;
      masks[i] |= 1 << d;
      cells[i * digits + k] = d;
    }
  });
  const t: Table = { codes, masks, cells, index: new Map(codes.map((c, i) => [c, i])) };
  tables.set(digits, t);
  return t;
}

/** ありうる数のすべて（辞書順）。3 桁 720 通り・4 桁 5,040 通り */
export function allCodes(digits: Digits): readonly Code[] {
  return tableOf(digits).codes;
}

const BIT_COUNT = (() => {
  const a = new Uint8Array(1024);
  for (let i = 1; i < 1024; i++) a[i] = (i & 1) + a[i >> 1];
  return a;
})();

/** ヒントを 1 つの数にする（hit*5+blow。0〜24） */
function keyOfIndex(t: Table, digits: Digits, a: number, b: number): number {
  let hit = 0;
  const oa = a * digits;
  const ob = b * digits;
  for (let k = 0; k < digits; k++) if (t.cells[oa + k] === t.cells[ob + k]) hit++;
  const common = BIT_COUNT[t.masks[a] & t.masks[b]];
  return hit * 5 + (common - hit);
}

function digitsOf(history: readonly Turn[], fallback: Digits): Digits {
  const len = history[0]?.guess.length;
  return len === 3 || len === 4 ? len : fallback;
}

function consistentIndices(t: Table, digits: Digits, history: readonly Turn[]): number[] {
  const turns = history.map((h) => ({ g: t.index.get(h.guess) ?? -1, key: h.hit * 5 + h.blow }));
  const out: number[] = [];
  for (let i = 0; i < t.codes.length; i++) {
    let ok = true;
    for (const { g, key } of turns) {
      if (g < 0 || keyOfIndex(t, digits, g, i) !== key) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

/**
 * これまでのヒントと矛盾しない候補。
 *
 * `candidates` を渡せばその中から絞る（渡さなければ全部の数から）。
 */
export function consistent(candidates: readonly Code[], history: readonly Turn[]): Code[] {
  return candidates.filter((c) => history.every((h) => {
    const fb = score(c, h.guess);
    return fb.hit === h.hit && fb.blow === h.blow;
  }));
}

/** 残りの候補の数（今日の 1 問のヒント） */
export function remainingCount(history: readonly Turn[], digits: Digits): number {
  return consistentIndices(tableOf(digits), digits, history).length;
}

// ---------------------------------------------------------------------------
// つよい CPU

/**
 * 候補の集合を最も小さく割る手（最悪ケース最小）。
 * 同点なら候補の中の手を優先し、その中で辞書順に最小（`codes` は辞書順なので添字の小さい方）。
 */
function bestSplit(t: Table, digits: Digits, cands: readonly number[]): number {
  if (cands.length <= 2) return cands[0];
  const isCand = new Uint8Array(t.codes.length);
  for (const c of cands) isCand[c] = 1;
  const counts = new Uint16Array(25);
  let bestWorst = Infinity;
  let best = -1;
  let bestIsCand = false;
  for (let g = 0; g < t.codes.length; g++) {
    counts.fill(0);
    let worst = 0;
    let pruned = false;
    for (let j = 0; j < cands.length; j++) {
      const k = keyOfIndex(t, digits, g, cands[j]);
      const n = ++counts[k];
      if (n > worst) {
        worst = n;
        // 最善より悪いことが決まったら打ち切る（同点は候補かどうかで比べるので続ける）
        if (worst > bestWorst) {
          pruned = true;
          break;
        }
      }
    }
    if (pruned) continue;
    const gIsCand = isCand[g] === 1;
    if (worst < bestWorst || (worst === bestWorst && gIsCand && !bestIsCand)) {
      bestWorst = worst;
      best = g;
      bestIsCand = gIsCand;
    }
  }
  return best;
}

/** つよい CPU の 1 手目（どの数も対称なので、辞書順に最小の数） */
export const OPENING: Record<Digits, Code> = { 3: '012', 4: '0123' };

/**
 * つよい CPU の 2 手目（1 手目 `OPENING` への応答 `"ヒット-ブロー"` → 手）。
 *
 * **手で書き換えない。** `buildSecondMoveTable()` の結果を写したもので、
 * `tests/hit-blow.test.ts` が食い違いを落とす。全部ヒット（当たり）の行は無い。
 */
export const SECOND_MOVE: Record<Digits, Readonly<Record<string, Code>>> = {
  3: { '0-0': '345', '0-1': '103', '0-2': '123', '0-3': '120', '1-0': '023', '1-1': '013', '1-2': '021', '2-0': '023' },
  4: {
    '0-0': '4567',
    '0-1': '1456',
    '0-2': '1204',
    '0-3': '1045',
    '0-4': '0231',
    '1-0': '0145',
    '1-1': '0145',
    '1-2': '0145',
    '1-3': '0231',
    '2-0': '0245',
    '2-1': '0245',
    '2-2': '0124',
    '3-0': '0145',
  },
};

/** 1 手目への応答ごとに、つよい CPU の 2 手目をその場で計算する（表を作るため。重い） */
export function buildSecondMoveTable(digits: Digits): Record<string, Code> {
  const t = tableOf(digits);
  const opening = OPENING[digits];
  const g = t.index.get(opening) as number;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < t.codes.length; i++) {
    const k = keyOfIndex(t, digits, g, i);
    if (Math.floor(k / 5) === digits) continue;
    const list = groups.get(k) ?? [];
    list.push(i);
    groups.set(k, list);
  }
  const out: Record<string, Code> = {};
  for (const k of [...groups.keys()].sort((a, b) => a - b)) {
    out[`${Math.floor(k / 5)}-${k % 5}`] = t.codes[bestSplit(t, digits, groups.get(k) as number[])];
  }
  return out;
}

/** つよい CPU の手。履歴（と桁数）だけから決定的に決まる */
export function strongGuess(history: readonly Turn[], digits: Digits): Code {
  if (history.length === 0) return OPENING[digits];
  if (history.length === 1 && history[0].guess === OPENING[digits]) {
    const fromTable = SECOND_MOVE[digits][`${history[0].hit}-${history[0].blow}`];
    if (fromTable) return fromTable;
  }
  const t = tableOf(digits);
  const cands = consistentIndices(t, digits, history);
  // ヒントが食い違っている（入力の誤り）ときは、まだ出していない数を出す
  if (cands.length === 0) return firstUnplayed(t, history);
  return t.codes[bestSplit(t, digits, cands)];
}

/**
 * 候補の集合だけを見て、つよい CPU の手を出す（判定木を作るテストのため）。
 * `strongGuess()` と同じ規則で、表は使わない。
 */
export function strongSplit(candidates: readonly Code[], digits: Digits): Code {
  const t = tableOf(digits);
  return t.codes[bestSplit(t, digits, candidates.map((c) => t.index.get(c) as number))];
}

function firstUnplayed(t: Table, history: readonly Turn[]): Code {
  const played = new Set(history.map((h) => h.guess));
  return t.codes.find((c) => !played.has(c)) as Code;
}

// ---------------------------------------------------------------------------
// CPU の手

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/**
 * CPU の次の推測。**利用者の隠した数は引数に取らない**（取れないので、ずるはできない）。
 *
 * - やさしい：矛盾しない候補から無作為。ただし `EASY_MISTAKE_RATE` の割合で、
 *   矛盾する手（まだ出していない数）を混ぜる
 * - ふつう：矛盾しない候補から無作為
 * - つよい：`strongGuess()`（乱数を使わない）
 */
export function cpuGuess(level: Level, history: readonly Turn[], rng: () => number, digits: Digits = 4): Code {
  const d = digitsOf(history, digits);
  if (level === 'strong') return strongGuess(history, d);
  const t = tableOf(d);
  const cands = consistentIndices(t, d, history);
  if (level === 'easy' && history.length > 0 && rng() < EASY_MISTAKE_RATE) {
    const played = new Set(history.map((h) => h.guess));
    const isCand = new Set(cands);
    const wrong: number[] = [];
    for (let i = 0; i < t.codes.length; i++) if (!isCand.has(i) && !played.has(t.codes[i])) wrong.push(i);
    if (wrong.length > 0) return t.codes[pick(wrong, rng)];
  }
  if (cands.length === 0) return firstUnplayed(t, history);
  return t.codes[pick(cands, rng)];
}

// ---------------------------------------------------------------------------
// 答えを作る

/** 重複なしの数を無作為に作る（乱数は注入する） */
export function randomCode(digits: Digits, rng: () => number): Code {
  const pool = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, digits).join('');
}

/** 今日の 1 問の答え。日付だけから決まる（全員同じ） */
export function dailySecret(dateKey: DateKey): Code {
  return randomCode(DAILY_DIGITS, mulberry32(dailySeed(dateKey, DAILY_VERSION)));
}

/** 推測の列から、答えに対するヒントつきの手の列を作り直す（保存から戻すとき） */
export function replay(secret: Code, guesses: readonly Code[]): Turn[] {
  return guesses.map((guess) => ({ guess, ...score(secret, guess) }));
}

// ---------------------------------------------------------------------------
// 対戦の勝敗

export type MatchOutcome = 'first' | 'second' | 'draw';

/**
 * 対戦の勝敗。**同じ手数ずつ打ち終えたところ（後手が打った直後）で呼ぶ。**
 *
 * - 先手が当てたら、後手は同じ手数目の 1 手だけ打てる。後手もそこで当てたら引き分け、外したら先手の勝ち
 * - 後手が先に当てたら（先手はその手数目を打ち終えて外している）後手の勝ち
 * - どちらもまだなら null（続ける）
 *
 * @param firstPlayerSolvedAt 先手が当てた手数（まだなら null）
 * @param secondPlayerSolvedAt 後手が当てた手数（まだなら null）
 */
export function matchOutcome(
  firstPlayerSolvedAt: number | null,
  secondPlayerSolvedAt: number | null,
): MatchOutcome | null {
  if (firstPlayerSolvedAt === null && secondPlayerSolvedAt === null) return null;
  if (firstPlayerSolvedAt === null) return 'second';
  if (secondPlayerSolvedAt === null) return 'first';
  if (firstPlayerSolvedAt === secondPlayerSolvedAt) return 'draw';
  return firstPlayerSolvedAt < secondPlayerSolvedAt ? 'first' : 'second';
}

// ---------------------------------------------------------------------------
// 共有・保存

/** 1 手を 🟢（ヒット）🟡（ブロー）⚪（外れ）で並べる。**数字は入れない** */
export function turnEmoji(fb: Feedback, digits: Digits): string {
  const miss = Math.max(0, digits - fb.hit - fb.blow);
  return '🟢'.repeat(fb.hit) + '🟡'.repeat(fb.blow) + '⚪'.repeat(miss);
}

/** 今日の 1 問の共有文。**答えの数字は入れない**（ネタばらしになる） */
export function shareText(params: {
  dateKey: DateKey;
  history: readonly Feedback[];
  streak?: number;
  url: string;
}): string {
  const { dateKey, history, streak, url } = params;
  const label = `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}`;
  const head = `ヒット＆ブロー ${label} ${history.length}手で正解${streak ? `・連続${streak}日` : ''}`;
  return [head, ...history.map((h) => turnEmoji(h, DAILY_DIGITS)), url].join('\n');
}

/** 今日の 1 問の途中経過を置くキー（設定・途中経過なので `lib/records.ts` とは別に持つ） */
export const DAILY_PROGRESS_KEY = 'hit-blow:daily';

/** `localStorage` のうち、ここで使う部分だけ（テストでは差し替える） */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 今日の 1 問の途中経過。**答えそのものは保存しない**（日付キーから `dailySecret()` で作り直す）。
 * 保存しているのは日付と推測の列だけ。
 */
export interface DailyProgress {
  dateKey: DateKey;
  guesses: Code[];
}

/** 保存してある途中経過を読む。今日のものでない・壊れている・読めないときは空の列 */
export function readDailyProgress(storage: ProgressStorage | null, today: DateKey): Code[] {
  try {
    const raw = storage?.getItem(DAILY_PROGRESS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Partial<DailyProgress>;
    if (data.dateKey !== today || !Array.isArray(data.guesses)) return [];
    const guesses = data.guesses.filter((g): g is Code => typeof g === 'string' && isValidCode(g, DAILY_DIGITS));
    // 当たりのあとに続く手は捨てる（当たったところで終わり）
    const secret = dailySecret(today);
    const solvedAt = guesses.indexOf(secret);
    return solvedAt >= 0 ? guesses.slice(0, solvedAt + 1) : guesses;
  } catch {
    return [];
  }
}

/** 途中経過を書く。書けなくても遊べる（再読み込みで手が戻らないだけ） */
export function writeDailyProgress(storage: ProgressStorage | null, progress: DailyProgress): void {
  try {
    storage?.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // 何もしない
  }
}
