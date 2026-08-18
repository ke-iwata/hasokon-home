import { describe, expect, it } from 'vitest';
import { BITS_PER_WORD, PASSPHRASE_WORDS } from '@/lib/password-words';

/**
 * パスフレーズ用単語リスト（docs/features/password-seisei.md）の品質テスト。
 *
 * リストは**完全自作**で、外部のリストを転用していない。そのぶん
 * 「うっかり同じ語を2回入れた」「1文字違いの語ばかりになった」を
 * 人の目で防ぐのは無理なので、収録の基準を機械で固定する。
 *
 * とくに**語数**は強度の説明そのもの（2048語 = 1語11ビット）なので、
 * 語を足し引きしたら必ずここで落ちる。
 */

/** 同じ長さで1文字だけ違う（ハミング距離1）か */
function isOneCharApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 1) return false;
  }
  return diff === 1;
}

/** 語ごとに「1文字違いの相手」が何語あるかを数える */
function neighborCounts(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>(words.map((w) => [w, 0]));
  const byLength = new Map<number, string[]>();
  for (const word of words) {
    const group = byLength.get(word.length);
    if (group) group.push(word);
    else byLength.set(word.length, [word]);
  }
  for (const group of byLength.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!isOneCharApart(group[i], group[j])) continue;
        counts.set(group[i], (counts.get(group[i]) as number) + 1);
        counts.set(group[j], (counts.get(group[j]) as number) + 1);
      }
    }
  }
  return counts;
}

/** 1文字違いの相手を持てる上限。ここを超える語は入れない */
const MAX_NEIGHBORS = 3;

/** 1文字違いの相手を持つ語の割合の上限 */
const MAX_SIMILAR_RATIO = 0.4;

describe('単語リストの基準', () => {
  it('語数はちょうど2048（＝1語11ビット）', () => {
    expect(PASSPHRASE_WORDS).toHaveLength(2048);
    expect(BITS_PER_WORD).toBe(11);
  });

  it('重複がない', () => {
    const duplicates = PASSPHRASE_WORDS.filter(
      (word, index) => PASSPHRASE_WORDS.indexOf(word) !== index,
    );
    expect(duplicates).toEqual([]);
  });

  it('英小文字だけでできている（空文字・記号・数字を含まない）', () => {
    expect(PASSPHRASE_WORDS.filter((word) => !/^[a-z]+$/.test(word))).toEqual([]);
  });

  it('長さは3〜9文字に収まる', () => {
    expect(PASSPHRASE_WORDS.filter((word) => word.length < 3 || word.length > 9)).toEqual([]);
  });

  /**
   * 実際は4文字以上にしてある。3文字の語は「kaki / kagi / kami」のように
   * 1文字違いの組が急に増えるため。基準を緩めるとここが落ちる
   */
  it('実際には4文字以上だけを収録している', () => {
    expect(PASSPHRASE_WORDS.filter((word) => word.length < 4)).toEqual([]);
  });

  it('辞書順に並んでいる（語を足したときに探しやすくするため）', () => {
    expect([...PASSPHRASE_WORDS]).toEqual([...PASSPHRASE_WORDS].sort());
  });

  /**
   * **紛らわしい語の「連発」を止める。**
   * ローマ字の日本語では1文字違いの組そのものは避けられない（kaze/kase/kake…）。
   * できるのは、1つの語のまわりに紛らわしい語が集まるのを防ぐことなので、
   * 「1語あたりの1文字違いの相手」に上限を置いている。
   */
  it(`1文字違いの相手が${MAX_NEIGHBORS}語を超える語がない`, () => {
    const counts = neighborCounts(PASSPHRASE_WORDS);
    const crowded = [...counts]
      .filter(([, count]) => count > MAX_NEIGHBORS)
      .map(([word, count]) => `${word}(${count})`);
    expect(crowded).toEqual([]);
  });

  it(`1文字違いの相手を持つ語が全体の${MAX_SIMILAR_RATIO * 100}%未満`, () => {
    const counts = neighborCounts(PASSPHRASE_WORDS);
    const similar = [...counts.values()].filter((count) => count > 0).length;
    expect(similar / PASSPHRASE_WORDS.length).toBeLessThan(MAX_SIMILAR_RATIO);
  });

  it('判定そのものが正しく動く（1文字違いを見つけられる）', () => {
    expect(isOneCharApart('kaki', 'kagi')).toBe(true);
    expect(isOneCharApart('kaki', 'kaki')).toBe(false);
    expect(isOneCharApart('kaki', 'kagu')).toBe(false);
    expect(isOneCharApart('kaki', 'kakizome')).toBe(false);
    expect(neighborCounts(['aaaa', 'aaab', 'aaac', 'bbbb']).get('aaaa')).toBe(2);
  });
});
