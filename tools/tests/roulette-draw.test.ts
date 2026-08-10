import { describe, expect, it } from 'vitest';
import { pickWinner } from '@/lib/roulette/draw';
import type { Item } from '@/lib/roulette/types';

const item = (text: string): Item => ({ id: text, text, emoji: '🎯' });
const items = ['A', 'B', 'C'].map(item);

describe('pickWinner', () => {
  it('必ず渡した項目の中から1つ返す', () => {
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(pickWinner(items));
    }
  });

  it('項目が1つならそれを返す', () => {
    const one = [item('A')];
    expect(pickWinner(one)).toBe(one[0]);
  });

  it('どの項目も選ばれうる（特定の項目に固定されない）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickWinner(items).text);
    expect(seen.size).toBe(items.length);
  });

  it('空配列は誤用なので例外にする', () => {
    expect(() => pickWinner([])).toThrow();
  });
});
