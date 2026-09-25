import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 本文の薄いツール4本に足した見出しのテスト。
 *
 * 仕様: docs/features/thin-tool-content.md（共通の約束 2）
 *
 * 4本に「計算の根拠」のような同じ型の節を足すと、Google の scaled content abuse の
 * 形に近づく。**この提案で足した h2** が各ページに実在し、4本の間で重複しないことを見る
 * （既存の共通の h2「よくある質問」や共通部品の見出しは対象外）。
 */
const ADDED_H2: Record<string, string[]> = {
  'shobyo-teate': [
    '1日あたりの支給額の計算のしかた',
    '給与が出た日・ほかの給付を受けている日の扱い',
    '退職後も受け取れる条件（資格喪失後の継続給付）',
  ],
  'kosodate-shienkin': ['加入している保険で決まり方が違う', '集めたお金の使い道'],
  'hankaku-zenkaku': ['全角と半角は何が違うのか', '変換で起きやすい失敗'],
  warikan: ['幹事の扱いは3通り', '丸め単位の選び方'],
};

const source = (slug: string) =>
  readFileSync(new URL(`../app/${slug}/page.tsx`, import.meta.url), 'utf8');

describe('薄いツール4本に足した見出し', () => {
  it.each(Object.entries(ADDED_H2))('%s のページに足した h2 が実在する', (slug, headings) => {
    const src = source(slug);
    for (const h of headings) expect(src).toContain(`<h2>${h}</h2>`);
  });

  it('足した h2 は4本の間で重複しない（定型の節を作っていない）', () => {
    const all = Object.values(ADDED_H2).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('足した h2 が、ほかの3本のページに現れない', () => {
    for (const [slug, headings] of Object.entries(ADDED_H2)) {
      for (const other of Object.keys(ADDED_H2).filter((s) => s !== slug)) {
        for (const h of headings) expect(source(other)).not.toContain(`<h2>${h}</h2>`);
      }
    }
  });
});
