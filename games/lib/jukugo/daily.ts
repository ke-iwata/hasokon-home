/**
 * きょうの1問（日替わり）と、その版の切り替え
 *
 * 仕様: docs/features/game-jukugo-anaume.md の「日替わりを動かさない」
 *
 * - 「今日」は `lib/daily.ts` の `localDateKey()`（端末のローカル日付）で決める
 * - 乱数は `mulberry32(dailySeed(key, version))`。`Math.random()` は使わない
 * - **表に語を足すと、過去・今日・未来の問題がすべて変わってしまう。**
 *   それを防ぐため、ある日の問題は「その日に当たる版 `v`」と「`since <= v` の語だけの表」から作る
 */

import { dailySeed, mulberry32, type DateKey } from '@/lib/daily';
import { buildLexicon, centersFor, generatePuzzle, shuffle, TIER_ORDER, type Lexicon, type Puzzle, type Tier } from './generate';
import { WORDS, type Word } from './words';

/**
 * 日替わりの版。from の日以降にその版を使う（最初の行より前の日も最初の版）。
 *
 * **公開後は既存の行を書き換えない（行を足すだけ）。**
 * 表を 800 → 2,000 語に増やしたら `{ from: '<切り替える日>', version: 2 }` を足す。
 * `generate.ts` の手順を変えたときも同じく版を上げ、切り替え日以降だけを変える。
 */
export const DAILY_VERSIONS = [
  { from: '2026-12-01', version: 1 },
  // 表を 800 → 2,000 語に増やしたら { from: '<切り替える日>', version: 2 } を足す
] as const satisfies readonly { from: DateKey; version: number }[];

/** その日に当たる版 */
export function versionFor(key: DateKey, versions: readonly { from: DateKey; version: number }[] = DAILY_VERSIONS): number {
  let v = versions[0].version;
  for (const row of versions) if (row.from <= key) v = row.version;
  return v;
}

/** 段ごとに種をずらす（同じ日の3段が同じ乱数列にならないように） */
const TIER_SALT: Record<Tier, number> = { sho: 0x1b873593, chu: 0x27d4eb2f, otona: 0x165667b1 };

const lexiconCache = new WeakMap<readonly Word[], Map<number, Lexicon>>();

/** 版 `version` 以下の語だけの表（同じ表・同じ版は作り直さない） */
export function lexiconFor(version: number, words: readonly Word[] = WORDS): Lexicon {
  let byVersion = lexiconCache.get(words);
  if (!byVersion) {
    byVersion = new Map();
    lexiconCache.set(words, byVersion);
  }
  let lex = byVersion.get(version);
  if (!lex) {
    lex = buildLexicon(words.filter((w) => w.since <= version));
    byVersion.set(version, lex);
  }
  return lex;
}

/** 日の数え始め（この日を 0 日目とする。**動かさない**） */
export const DAILY_EPOCH: DateKey = '2026-12-01';

/** `DAILY_EPOCH` から何日目か（それより前の日は負） */
export function dayIndex(key: DateKey): number {
  const toDays = (k: DateKey) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(toDays(key) - toDays(DAILY_EPOCH));
}

/**
 * その日の真ん中の字。
 *
 * 真ん中に置ける字をひと回りぶん並べ替え（回ごとに並びを変える）、日ごとに1つずつ進める。
 * **ひと回りのあいだは同じ字が2度出ない**（乱数で毎日選ぶと、2日後に同じ字が出たりする）。
 */
export function dailyCenter(key: DateKey, tier: Tier, lex: Lexicon, version: number): string {
  const centers = centersFor(lex, tier);
  const n = centers.length;
  const day = dayIndex(key);
  const round = Math.floor(day / n);
  const seed = dailySeed(DAILY_EPOCH, version) ^ TIER_SALT[tier] ^ Math.imul(round + 1, 0x2c1b3c6d);
  const order = shuffle(centers, mulberry32(seed));
  return order[((day % n) + n) % n];
}

/** その日のその段の1問 */
export function dailyPuzzle(
  key: DateKey,
  tier: Tier,
  words: readonly Word[] = WORDS,
  versions: readonly { from: DateKey; version: number }[] = DAILY_VERSIONS,
): Puzzle {
  const version = versionFor(key, versions);
  const lex = lexiconFor(version, words);
  const rng = mulberry32(dailySeed(key, version) ^ TIER_SALT[tier]);
  return generatePuzzle(lex, tier, rng, { center: dailyCenter(key, tier, lex, version) });
}

/** 練習に使う表（いちばん新しい版） */
export function latestLexicon(words: readonly Word[] = WORDS): Lexicon {
  return lexiconFor(Math.max(...words.map((w) => w.since)), words);
}

export { TIER_ORDER };
