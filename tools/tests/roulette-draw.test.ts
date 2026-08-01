import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  addRecord,
  eligible,
  pickWinner,
  tally,
  type DrawRecord,
} from '@/lib/roulette/draw';
import type { Item } from '@/lib/roulette/types';

const item = (text: string): Item => ({ id: text, text, emoji: '🎯' });
const items = ['A', 'B', 'C'].map(item);

/** 履歴は新しい順に並ぶ（addRecord が先頭に積むため） */
const hist = (...texts: string[]): DrawRecord[] =>
  texts.map((t, i) => ({ text: t, emoji: '🎯', at: 1000 - i }));

describe('eligible（毎回ランダム）', () => {
  it('履歴に関係なく全項目が対象', () => {
    expect(eligible(items, hist('A', 'A', 'A'), 'random')).toEqual(items);
  });
});

describe('eligible（全員に一巡）', () => {
  it('まだ出ていない項目だけが対象になる', () => {
    const rest = eligible(items, hist('A'), 'noRepeat').map((i) => i.text);
    expect(rest.sort()).toEqual(['B', 'C']);
  });

  it('一巡し終えたら全項目に戻る', () => {
    const rest = eligible(items, hist('C', 'B', 'A'), 'noRepeat').map((i) => i.text);
    expect(rest.sort()).toEqual(['A', 'B', 'C']);
  });

  it('一巡したあと次の周回に入っていれば、その周回で出た分だけ除く', () => {
    // 古い順に A,B,C（一巡）→ A（次の周回で既出）
    const rest = eligible(items, hist('A', 'C', 'B', 'A'), 'noRepeat').map((i) => i.text);
    expect(rest.sort()).toEqual(['B', 'C']);
  });

  it('項目一覧にない履歴は無視する（項目を入れ替えても壊れない）', () => {
    const rest = eligible(items, hist('X', 'Y'), 'noRepeat').map((i) => i.text);
    expect(rest.sort()).toEqual(['A', 'B', 'C']);
  });

  it('履歴が空なら全項目', () => {
    expect(eligible(items, [], 'noRepeat')).toHaveLength(3);
  });
});

describe('eligible（直近は避ける）', () => {
  it('直近ぶんを除外する', () => {
    // 3項目なので直近ウィンドウは1件
    const rest = eligible(items, hist('A', 'B'), 'avoidRecent').map((i) => i.text);
    expect(rest.sort()).toEqual(['B', 'C']);
  });

  it('全部が直近に入ってしまう場合は全項目に戻す（候補が尽きない）', () => {
    const two = [item('A'), item('B')];
    const rest = eligible(two, hist('A', 'B'), 'avoidRecent');
    expect(rest.length).toBeGreaterThan(0);
  });
});

describe('eligible（共通）', () => {
  it('項目が空なら空を返す', () => {
    for (const mode of ['random', 'noRepeat', 'avoidRecent'] as const) {
      expect(eligible([], hist('A'), mode)).toEqual([]);
    }
  });
});

describe('pickWinner', () => {
  it('必ず項目の中から1つ返す', () => {
    for (const mode of ['random', 'noRepeat', 'avoidRecent'] as const) {
      for (let i = 0; i < 50; i++) {
        const w = pickWinner(items, hist('A', 'B'), mode);
        expect(items.map((x) => x.text)).toContain(w.text);
      }
    }
  });

  it('全員に一巡では、一巡の間に同じ項目が二度出ない', () => {
    let history: DrawRecord[] = [];
    const drawn: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const w = pickWinner(items, history, 'noRepeat');
      drawn.push(w.text);
      history = addRecord(history, w);
    }
    expect([...new Set(drawn)].sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('tally（当選回数）', () => {
  it('回数の多い順に並ぶ', () => {
    const t = tally(items, hist('A', 'B', 'A'));
    expect(t[0]).toMatchObject({ text: 'A', count: 2 });
    expect(t.find((x) => x.text === 'C')?.count).toBe(0);
  });
});

describe('addRecord（履歴の追加）', () => {
  it('先頭に積まれる', () => {
    const h = addRecord(hist('A'), item('B'));
    expect(h[0].text).toBe('B');
    expect(h[1].text).toBe('A');
  });

  it('上限を超えたら古いものから捨てる', () => {
    let h: DrawRecord[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = addRecord(h, item(`n${i}`));
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[0].text).toBe(`n${HISTORY_LIMIT + 9}`);
  });
});
