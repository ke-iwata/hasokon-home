/**
 * 出題（真ん中の1字・4つの熟語・別解・4択の誤答・ヒント）
 *
 * 仕様: docs/features/game-jukugo-anaume.md の「ルール」「出題」
 *
 * すべて純関数。乱数は `rng`（`[0, 1)` を返す関数）を注入する。
 * 日替わりは `daily.ts` が `mulberry32(dailySeed(...))` を渡す（`Math.random()` は使わない）。
 *
 * **ここの手順を変えたら、`daily.ts` の `DAILY_VERSIONS` に版を足す**
 * （変えた日より前の「きょうの1問」を動かさないため）。
 */

import { isJoyo, isKyoiku, KANJI, readingsOf } from './kanji';
import { AMBIGUOUS_WORDS, EXCLUDED_WORDS, type Word } from './words';

/** 段。小学生（教育漢字だけ）・中学生（常用漢字）・おとな（常用漢字・やや難しい語も） */
export type Tier = 'sho' | 'chu' | 'otona';
export const TIER_ORDER: readonly Tier[] = ['sho', 'chu', 'otona'];
export const TIER_LABEL: Record<Tier, string> = { sho: '小学生', chu: '中学生', otona: 'おとな' };

/** 盤の4か所。上・左は「その字＋□」、下・右は「□＋その字」 */
export type Slot = 'top' | 'left' | 'bottom' | 'right';
export const SLOTS: readonly Slot[] = ['top', 'left', 'bottom', 'right'];

/** □ が熟語の何字目に入るか（上・左は2字目、下・右は1字目） */
export function blankIndex(slot: Slot): 0 | 1 {
  return slot === 'top' || slot === 'left' ? 1 : 0;
}

export interface Puzzle {
  tier: Tier;
  /** 真ん中の字（正解） */
  answer: string;
  /** 4つの熟語。上・左は答えが2字目、下・右は答えが1字目 */
  words: Record<Slot, Word>;
  /** 盤に出す4字 */
  clues: Record<Slot, string>;
  /** 4つすべてを満たす、答え以外の字（別解。どれも正解） */
  alternatives: readonly string[];
  /** 4択（答え＋誤答3つ。並びは乱数で決まる） */
  choices: readonly string[];
  /** 1回目のヒントに使う語 */
  hintSlot: Slot;
  /** 2回目のヒント（意味の1行）に使う語。1回目とは別の語 */
  meaningSlot: Slot;
}

/** 表の引き方をまとめたもの（毎回表を走査しないため） */
export interface Lexicon {
  /** 表のすべての語（読みが2つある語は除いたもの）。「その語はある」の判定に使う */
  all: ReadonlyMap<string, Word>;
  /** 段ごとの出題に使える語 */
  pool: Record<Tier, readonly Word[]>;
  /** 字 → その字を1字目にもつ語（表のすべての語） */
  byFirst: ReadonlyMap<string, readonly Word[]>;
  /** 字 → その字を2字目にもつ語（表のすべての語） */
  bySecond: ReadonlyMap<string, readonly Word[]>;
  /** 字 → 表に出てくる回数（読み入力の候補の並び順） */
  frequency: ReadonlyMap<string, number>;
  /** 読み → その読みを音訓に持つ、表に出てくる字（誤答の埋め合わせに使う） */
  byReading: ReadonlyMap<string, readonly string[]>;
  /** 段ごとの、字 → その字を2字目にもつ出題用の語（1字目と2字目が同じ語は除く） */
  ends: Record<Tier, ReadonlyMap<string, readonly Word[]>>;
  /** 段ごとの、字 → その字を1字目にもつ出題用の語 */
  starts: Record<Tier, ReadonlyMap<string, readonly Word[]>>;
}

/** その段に出してよい字か（小学生は教育漢字だけ） */
export function charAllowed(tier: Tier, ch: string): boolean {
  return tier === 'sho' ? isKyoiku(ch) : isJoyo(ch);
}

/** その段の出題に使える語か */
export function wordAllowed(tier: Tier, w: Word): boolean {
  if (AMBIGUOUS_WORDS.includes(w.word) || EXCLUDED_WORDS.includes(w.word)) return false;
  if (!w.chars.every((c) => isJoyo(c))) return false;
  if (tier === 'sho') return !w.hard && w.chars.every((c) => isKyoiku(c));
  if (tier === 'chu') return !w.hard;
  return true;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildLexicon(words: readonly Word[]): Lexicon {
  const all = new Map<string, Word>();
  for (const w of words) {
    if (AMBIGUOUS_WORDS.includes(w.word)) continue;
    if (!all.has(w.word)) all.set(w.word, w);
  }
  const byFirst = new Map<string, Word[]>();
  const bySecond = new Map<string, Word[]>();
  const frequency = new Map<string, number>();
  for (const w of all.values()) {
    push(byFirst, w.chars[0], w);
    push(bySecond, w.chars[1], w);
    for (const c of w.chars) frequency.set(c, (frequency.get(c) ?? 0) + 1);
  }
  const list = [...all.values()];
  const pool = {
    sho: list.filter((w) => wordAllowed('sho', w)),
    chu: list.filter((w) => wordAllowed('chu', w)),
    otona: list.filter((w) => wordAllowed('otona', w)),
  };
  const byReading = new Map<string, string[]>();
  for (const c of [...frequency.keys()].sort()) for (const r of readingsOf(c)) push(byReading, r, c);
  const index = (key: 0 | 1) => {
    const out = {} as Record<Tier, Map<string, Word[]>>;
    for (const tier of TIER_ORDER) {
      const m = new Map<string, Word[]>();
      for (const w of pool[tier]) if (w.chars[0] !== w.chars[1]) push(m, w.chars[key], w);
      out[tier] = m;
    }
    return out;
  };
  return { all, pool, byFirst, bySecond, frequency, byReading, ends: index(1), starts: index(0) };
}

/** 字 `ch` を□に入れたとき、その場所の熟語（例：上「看」に「病」→「看病」） */
export function wordAt(slot: Slot, clue: string, ch: string): string {
  return blankIndex(slot) === 1 ? clue + ch : ch + clue;
}

/** `ch` を入れたとき、4か所のうちいくつが表の語になるか */
export function matchCount(lex: Lexicon, clues: Record<Slot, string>, ch: string): number {
  return SLOTS.filter((s) => lex.all.has(wordAt(s, clues[s], ch))).length;
}

/** 別解：答え以外で、4か所すべてが表の語になる字（その段に出してよい字だけ） */
export function findAlternatives(lex: Lexicon, tier: Tier, clues: Record<Slot, string>, answer: string): string[] {
  const out = new Set<string>();
  // 上の字で始まる語の2字目が候補。ほかの3か所も満たすかを見る
  for (const w of lex.byFirst.get(clues.top) ?? []) {
    const ch = w.chars[1];
    if (ch === answer || !charAllowed(tier, ch)) continue;
    if (matchCount(lex, clues, ch) === 4) out.add(ch);
  }
  return [...out].sort();
}

/**
 * 段ごとの「その段らしさ」の条件。
 *
 * - 中学生：5字のどこかに中学以上の字（教育漢字でない常用漢字）を含む
 * - おとな：やや難しい語を含むか、真ん中の字が中学以上の字
 */
function meetsTier(tier: Tier, answer: string, words: readonly Word[]): boolean {
  if (tier === 'sho') return true;
  if (tier === 'chu') return [answer, ...words.flatMap((w) => w.chars)].some((c) => !isKyoiku(c));
  return !isKyoiku(answer) || words.some((w) => w.hard);
}

/** 真ん中に置ける字（その字を2字目にもつ語・1字目にもつ語が、その段に2つずつある） */
export function centersFor(lex: Lexicon, tier: Tier): string[] {
  const ends = lex.ends[tier];
  const starts = lex.starts[tier];
  return [...ends.keys()]
    .filter((c) => {
      const e = ends.get(c) ?? [];
      const st = starts.get(c) ?? [];
      if (!charAllowed(tier, c) || e.length < 2 || st.length < 2) return false;
      // その段らしさの条件を満たせない字は外す（満たす組み合わせが1つでもあれば残す）
      return meetsTier(tier, c, [...e, ...st]);
    })
    .sort();
}

/** 0 以上 n 未満の整数 */
function pickIndex(rng: () => number, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/** 2つ選ぶ（順番も乱数で決まる） */
function pickTwo<T>(rng: () => number, list: readonly T[]): [T, T] {
  const i = pickIndex(rng, list.length);
  let j = pickIndex(rng, list.length - 1);
  if (j >= i) j += 1;
  return [list[i], list[j]];
}

/** フィッシャー–イェーツ（乱数は注入） */
export function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = pickIndex(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 4択の誤答を3つ選ぶ。
 *
 * 1. 同じ段の字で、4か所のうち2〜3か所は表の語になるが、4か所全部はならない字
 * 2. 足りなければ、真ん中の字と同じ読みを持つ同じ段の字（`kanji.ts` の音訓）
 * 3. それでも足りなければ、1か所だけ語になる字・表に出てくる字
 *
 * 形の似た字の一覧は作らない（仕様書）。
 */
export function pickDistractors(
  lex: Lexicon,
  tier: Tier,
  clues: Record<Slot, string>,
  answer: string,
  rng: () => number,
): string[] {
  const banned = new Set([answer, ...SLOTS.map((s) => clues[s])]);
  const ok = (ch: string) => !banned.has(ch) && charAllowed(tier, ch) && matchCount(lex, clues, ch) < 4;

  // 4か所それぞれで語になる字を数える
  const hits = new Map<string, number>();
  for (const s of SLOTS) {
    const list = blankIndex(s) === 1 ? lex.byFirst.get(clues[s]) : lex.bySecond.get(clues[s]);
    for (const w of list ?? []) {
      const ch = w.chars[blankIndex(s)];
      hits.set(ch, (hits.get(ch) ?? 0) + 1);
    }
  }
  // 誤答の出どころを、よいものから順に（足りたら先は作らない）
  const sources: (() => string[])[] = [
    () => [...hits.keys()].filter((c) => (hits.get(c) ?? 0) >= 2 && ok(c)).sort(),
    () => [...new Set(readingsOf(answer).flatMap((r) => lex.byReading.get(r) ?? []))].filter(ok).sort(),
    () => [...hits.keys()].filter((c) => (hits.get(c) ?? 0) === 1 && ok(c)).sort(),
    () => [...lex.frequency.keys()].filter(ok).sort(),
  ];

  const chosen: string[] = [];
  for (const source of sources) {
    for (const c of shuffle(source(), rng)) {
      if (chosen.length >= 3) break;
      if (!chosen.includes(c)) chosen.push(c);
    }
    if (chosen.length >= 3) break;
  }
  return chosen;
}

/** 1問を組み立てる（盤の4語が決まったあと） */
function assemble(
  lex: Lexicon,
  tier: Tier,
  answer: string,
  picked: Record<Slot, Word>,
  rng: () => number,
): Puzzle {
  const clues = {
    top: picked.top.chars[0],
    left: picked.left.chars[0],
    bottom: picked.bottom.chars[1],
    right: picked.right.chars[1],
  };
  const alternatives = findAlternatives(lex, tier, clues, answer);
  const distractors = pickDistractors(lex, tier, clues, answer, rng);
  const choices = shuffle([answer, ...distractors], rng);
  const hintSlot = SLOTS[pickIndex(rng, 4)];
  const rest = SLOTS.filter((s) => s !== hintSlot);
  const meaningSlot = rest[pickIndex(rng, rest.length)];
  return { tier, answer, words: picked, clues, alternatives, choices, hintSlot, meaningSlot };
}

/** 試す回数の上限（別解の無い問題を探す） */
const MAX_TRIES = 40;

export interface GenerateOptions {
  /** 真ん中の字を決めて作る（日替わりが字の並びを先に決めるため）。作れなければ乱数で選び直す */
  center?: string;
  /** 出したくない真ん中の字（練習で続けて同じ字を出さないため） */
  avoid?: ReadonlySet<string>;
}

/** 1問作る。別解が無く、誤答が3つそろう問題を優先する */
export function generatePuzzle(lex: Lexicon, tier: Tier, rng: () => number, opts: GenerateOptions = {}): Puzzle {
  const all = centersFor(lex, tier);
  if (all.length === 0) throw new Error(`出題できる字がない: ${tier}`);
  const avoid = opts.avoid ?? new Set<string>();
  const fresh = all.filter((c) => !avoid.has(c));
  const centers = fresh.length > 0 ? fresh : all;
  const fixed = opts.center !== undefined && all.includes(opts.center) ? opts.center : undefined;
  let best: Puzzle | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < MAX_TRIES * 2; i++) {
    // 決めた字で MAX_TRIES 回試して作れなければ、残りは乱数で選んだ字で試す
    const center = fixed !== undefined && i < MAX_TRIES ? fixed : centers[pickIndex(rng, centers.length)];
    if (best && i >= MAX_TRIES) break;
    const ends = lex.ends[tier].get(center) ?? [];
    const starts = lex.starts[tier].get(center) ?? [];
    if (ends.length < 2 || starts.length < 2) continue;
    const [top, left] = pickTwo(rng, ends);
    const [bottom, right] = pickTwo(rng, starts);
    const outer = [top.chars[0], left.chars[0], bottom.chars[1], right.chars[1]];
    if (new Set(outer).size < 4) continue;
    const picked = { top, left, bottom, right };
    if (!meetsTier(tier, center, [top, left, bottom, right])) continue;
    const p = assemble(lex, tier, center, picked, rng);
    // 別解が無いこと・4択がそろうことを最優先に、「2〜3語は作れる」それらしい誤答が多いものを選ぶ
    const near = p.choices.filter((c) => c !== center && matchCount(lex, p.clues, c) >= 2).length;
    const score = (p.choices.length === 4 ? 100 : 0) - p.alternatives.length * 30 + near;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
    if (p.alternatives.length === 0 && p.choices.length === 4 && near >= 2) break;
  }
  if (!best) throw new Error(`問題を作れなかった: ${tier}`);
  return best;
}

/** その字が正解か（答えか別解） */
export function isCorrect(p: Puzzle, ch: string): boolean {
  return ch === p.answer || p.alternatives.includes(ch);
}

/** 盤の語を「□」入りで書く（例：上「看」→「看□」） */
export function maskedWord(p: Puzzle, slot: Slot): string {
  return wordAt(slot, p.clues[slot], '□');
}

/** その語での、真ん中の字の読み */
export function centerReading(p: Puzzle, slot: Slot): string {
  return p.words[slot].readings[blankIndex(slot)];
}

/** 1回目のヒント：語を添えて、その語での真ん中の字の読みの頭の1字 */
export function readingHint(p: Puzzle): { masked: string; head: string; text: string } {
  const masked = maskedWord(p, p.hintSlot);
  const head = Array.from(centerReading(p, p.hintSlot))[0];
  return { masked, head, text: `${masked} の □ は「${head}」から` };
}

/** 2回目のヒント：別の1語の意味の1行。意味の中の答え・別解の字は □ で伏せる */
export function meaningHint(p: Puzzle): { masked: string; meaning: string; text: string } {
  const masked = maskedWord(p, p.meaningSlot);
  const hide = new Set([p.answer, ...p.alternatives]);
  const meaning = Array.from(p.words[p.meaningSlot].meaning)
    .map((c) => (hide.has(c) ? '□' : c))
    .join('');
  return { masked, meaning, text: `${masked}：${meaning}` };
}

/** ヒントの数（1回目＝読みの頭、2回目＝意味） */
export const MAX_HINTS = 2;

/**
 * 読み入力の候補。
 *
 * - ひらがな（カタカナも可）：その読みを音訓に持つ、その段の字を表に多く出る順に並べる。
 *   4語のどれかでの真ん中の字の読み（連濁・促音のついた形も）なら、答えと別解も必ず入れる
 * - 漢字をそのまま打った（端末の変換で漢字になった）ときは、その字をそのまま候補にする
 */
export function readingCandidates(lex: Lexicon, p: Puzzle, input: string): string[] {
  const text = input.trim();
  if (!text) return [];
  const kanji = Array.from(text).filter((c) => isJoyo(c) && charAllowed(p.tier, c));
  if (kanji.length > 0) return [...new Set(kanji)];
  const kana = text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const found = new Set<string>();
  for (const [c, info] of KANJI) {
    if (charAllowed(p.tier, c) && info.readings.includes(kana)) found.add(c);
  }
  // 熟語の中での読み（学校の「がっ」など）でも、答えは候補に出す
  if (SLOTS.some((s) => centerReading(p, s) === kana)) found.add(p.answer);
  for (const alt of p.alternatives) {
    const words = SLOTS.map((s) => lex.all.get(wordAt(s, p.clues[s], alt)));
    if (words.some((w, i) => w && w.readings[blankIndex(SLOTS[i])] === kana)) found.add(alt);
  }
  return [...found].sort((a, b) => {
    const d = (lex.frequency.get(b) ?? 0) - (lex.frequency.get(a) ?? 0);
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
}
