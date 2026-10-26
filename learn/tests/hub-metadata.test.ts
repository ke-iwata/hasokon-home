import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/page';
import { publicChapters, publicSubjects, SITE_NAME } from '@/lib/curriculum';

/**
 * 学ぶトップ（/learn/）の title・description（docs/features/ichiran-page-title-refresh.md）。
 *
 * 「全◯章」は文字で書かず publicChapters から出している。ここでは出力された文字列で確かめる
 * （`curriculum.test.ts` の「全◯章」の見張りはソースの数字しか見ないため）
 */
const title = String(metadata.title);
const description = String(metadata.description);

describe('学ぶトップの title・description', () => {
  it('title は「学ぶ｜」で始まり、分野名が入っている（hasokon.com だけにしない）', () => {
    expect(SITE_NAME).toBe('学ぶ');
    expect(title.startsWith(`${SITE_NAME}｜`)).toBe(true);
    expect(title).toContain('投資の教科書');
    expect(title).not.toContain('hasokon.com');
  });

  it('title と description の「全◯章」が publicChapters の数と合っている', () => {
    for (const [label, text] of [
      ['title', title],
      ['description', description],
    ] as const) {
      const found = text.match(/全(\d+)章/g) ?? [];
      expect(found, `${label} の章数`).toEqual([`全${publicChapters.length}章`]);
    }
  });

  it('分野が1つのうちは「投資の教科書」と書いてよい（増えたら title を組み立て直す）', () => {
    // 分野が2つ以上になったら、title の後ろ半分を subjects から組み立てる（仕様書の 3.）
    expect(publicSubjects.map((s) => s.name)).toEqual(['投資の教科書']);
  });
});
