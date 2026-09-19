import { describe, expect, it } from 'vitest';
import {
  hasSokuonOrYoon,
  invalidWords,
  isHiraganaOnly,
  LENGTH_RANGE,
  LEVELS,
  LEVEL_LABELS,
  MIN_WORDS,
  WORDS,
} from '@/lib/typing-words';
import { defaultRomaji, isTypableKana } from '@/lib/typing-romaji';

/**
 * 出題語彙の品質テスト。
 *
 * 仕様: docs/features/game-typing.md（「出題語彙はデータとして持つ」）
 *
 * パスワード生成の日本語ワードリストと同じ考え方で、**語を足したときに
 * 崩れる約束をここで固定する**。とくに「ローマ字変換表との整合」は、
 * 打てない語が1つ混ざるだけでその出題に当たった人がゲームを進められなくなる
 * （60秒のうち何十秒かが死ぬ）ので、全語を実際に変換して確かめる。
 */

describe('語彙リストの体裁', () => {
  it('レベルは3段階', () => {
    expect(LEVELS).toEqual(['easy', 'normal', 'hard']);
  });

  it('すべてのレベルに名前と説明がある', () => {
    for (const level of LEVELS) {
      expect(LEVEL_LABELS[level].name.length).toBeGreaterThan(0);
      expect(LEVEL_LABELS[level].hint.length).toBeGreaterThan(0);
    }
  });

  it('各レベルに100語以上ある（仕様の「レベル別・各100語以上」）', () => {
    for (const level of LEVELS) {
      expect(WORDS[level].length).toBeGreaterThanOrEqual(MIN_WORDS);
    }
  });
});

describe.each(LEVELS)('%s の語', (level) => {
  const words = WORDS[level];

  it('ひらがなだけでできている', () => {
    expect(words.filter((w) => !isHiraganaOnly(w))).toEqual([]);
  });

  it(`長さが ${LENGTH_RANGE[level].min}〜${LENGTH_RANGE[level].max} 文字に収まっている`, () => {
    const { min, max } = LENGTH_RANGE[level];
    expect(words.filter((w) => w.length < min || w.length > max)).toEqual([]);
  });

  it('重複していない', () => {
    expect(words.length).toBe(new Set(words).size);
  });

  it('ローマ字変換表ですべて打てる', () => {
    expect(words.filter((w) => !isTypableKana(w))).toEqual([]);
  });

  it('見本のローマ字が空にならない', () => {
    expect(words.filter((w) => defaultRomaji(w).length === 0)).toEqual([]);
  });

  it('invalidWords が1つも返さない', () => {
    expect(invalidWords(level)).toEqual([]);
  });
});

describe('レベル間の約束', () => {
  it('レベルをまたいでも同じ語を出さない', () => {
    const all = LEVELS.flatMap((level) => [...WORDS[level]]);
    const duplicated = all.filter((word, i) => all.indexOf(word) !== i);
    expect([...new Set(duplicated)]).toEqual([]);
  });

  it('むずかしいの語は促音か拗音を含む（判定の山場を練習する狙い）', () => {
    expect(WORDS.hard.filter((w) => !hasSokuonOrYoon(w))).toEqual([]);
  });

  it('やさしいの語はむずかしいの語より短い', () => {
    expect(Math.max(...WORDS.easy.map((w) => w.length))).toBeLessThan(
      Math.min(...WORDS.hard.map((w) => w.length)),
    );
  });
});

describe('判定関数そのもの', () => {
  it('isHiraganaOnly は長音符・カタカナ・漢字をはじく', () => {
    expect(isHiraganaOnly('ねこ')).toBe(true);
    expect(isHiraganaOnly('しゅっぱつ')).toBe(true);
    expect(isHiraganaOnly('こーひー')).toBe(false);
    expect(isHiraganaOnly('ネコ')).toBe(false);
    expect(isHiraganaOnly('猫')).toBe(false);
    expect(isHiraganaOnly('ねこ2')).toBe(false);
  });

  it('hasSokuonOrYoon は促音と拗音を見つける', () => {
    expect(hasSokuonOrYoon('きっぷ')).toBe(true);
    expect(hasSokuonOrYoon('きゃく')).toBe(true);
    expect(hasSokuonOrYoon('しゅう')).toBe(true);
    expect(hasSokuonOrYoon('しょく')).toBe(true);
    expect(hasSokuonOrYoon('たいよう')).toBe(false);
  });
});
