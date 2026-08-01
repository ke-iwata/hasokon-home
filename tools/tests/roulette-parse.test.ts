import { describe, expect, it } from 'vitest';
import { dedupe, findDuplicates, parseItems, parseRange } from '@/lib/roulette/parse';

describe('parseRange（連番の展開）', () => {
  it('全角・半角のいろいろな区切り記号を解釈する', () => {
    for (const sep of ['〜', '～', '~', '-', '..', 'to', 'から']) {
      expect(parseRange(`1${sep}5`)).toEqual(['1', '2', '3', '4', '5']);
    }
  });

  it('前後の空白を許容する', () => {
    expect(parseRange(' 1 〜 3 ')).toEqual(['1', '2', '3']);
  });

  it('降順も展開できる', () => {
    expect(parseRange('3〜1')).toEqual(['3', '2', '1']);
  });

  it('負の数を含む範囲も扱える', () => {
    expect(parseRange('-2〜1')).toEqual(['-2', '-1', '0', '1']);
  });

  it('同じ数字なら1件だけ返す', () => {
    expect(parseRange('7〜7')).toEqual(['7']);
  });

  it('範囲でない文字列は null', () => {
    expect(parseRange('ラーメン')).toBeNull();
    expect(parseRange('1〜')).toBeNull();
    expect(parseRange('')).toBeNull();
  });

  it('200件を超える範囲は展開しない（誤入力で固まるのを防ぐため）', () => {
    expect(parseRange('1〜201')).toEqual(expect.any(Array));
    expect(parseRange('1〜202')).toBeNull();
  });
});

describe('parseItems（まとめて入力の解釈）', () => {
  it('改行・カンマ・タブ・読点のどれでも区切れる', () => {
    expect(parseItems('A\nB,C\tD、E')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('行頭の番号を取り除く', () => {
    expect(parseItems('1. A\n2) B')).toEqual(['A', 'B']);
  });

  it('行頭の記号は「後ろに空白があるとき」だけ取り除く', () => {
    // 空白があれば箇条書きの記号とみなして落とす
    expect(parseItems('・ A\n- B\n* C')).toEqual(['A', 'B', 'C']);
    // 空白がなければ項目名の一部として残す（「-5」のような入力を壊さないため）
    expect(parseItems('・A')).toEqual(['・A']);
    expect(parseItems('-5')).toEqual(['-5']);
  });

  it('全角の番号も落とせる', () => {
    expect(parseItems('１. あ\n２．い')).toEqual(['あ', 'い']);
  });

  it('連番指定はその場で展開される', () => {
    expect(parseItems('A\n1〜3\nB')).toEqual(['A', '1', '2', '3', 'B']);
  });

  it('空行や空白だけの行は無視する', () => {
    expect(parseItems('A\n\n   \nB')).toEqual(['A', 'B']);
  });

  it('空文字は空配列', () => {
    expect(parseItems('')).toEqual([]);
  });
});

describe('findDuplicates / dedupe（重複の扱い）', () => {
  it('重複した項目名と回数を返す', () => {
    const dup = findDuplicates(['A', 'B', 'A', 'C', 'A', 'B']);
    expect(dup.get('A')).toBe(3);
    expect(dup.get('B')).toBe(2);
    expect(dup.has('C')).toBe(false);
  });

  it('重複がなければ空', () => {
    expect(findDuplicates(['A', 'B']).size).toBe(0);
  });

  it('dedupe は最初の出現順を保って畳む', () => {
    const list = [{ t: 'A' }, { t: 'B' }, { t: 'A' }, { t: 'C' }];
    expect(dedupe(list, (x) => x.t).map((x) => x.t)).toEqual(['A', 'B', 'C']);
  });
});
