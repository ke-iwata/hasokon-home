import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toolUpdatedAt } from '@/lib/jsonld';

/**
 * 本文の薄いツール4本に足した節の見張り。
 *
 * 仕様: docs/features/thin-tool-content.md（共通の約束 2「そのページにしか書けないこと
 * だけを足す」・4本に共通の定型の節を作らない）
 *
 * **なぜテストにするか**: 「全ツールに同じ型の節を足す」のは Google の
 * scaled content abuse の形に近づく、というのが本提案の出発点。
 * 後から「4本に同じ見出しを並べたほうが揃って見える」と直されると、
 * 提案が避けたかった形に戻ってしまうので、見出しの重複を機械で止める。
 *
 * 判定の対象は**この提案で足した見出しだけ**。4本には元から共通の h2
 * （「よくある質問」）があり、共通部品の「他のツール」「このページについて」もあるので、
 * ページの h2 を全部拾うと必ず重複する。
 */

/** この提案で足した h2。ページごとに、そのページにしか無い言葉であること */
const ADDED_HEADINGS: Record<string, string[]> = {
  'shobyo-teate': [
    '1日あたりの支給額の計算のしかた',
    '月収別の支給額の早見表',
    '給与が出た日・ほかの給付を受けている日の扱い',
    '退職後も受け取れる条件（継続給付）',
  ],
  'kosodate-shienkin': [
    '年収別の負担額の早見表',
    '年度ごとの負担額の推移',
    '加入している保険で決まり方が違う',
    '集めたお金の使い道',
  ],
  'hankaku-zenkaku': ['全角と半角は何が違うのか', '変換で起きやすい失敗'],
  warikan: ['幹事の扱いは3通り', '丸め単位の選び方'],
};

const SLUGS = Object.keys(ADDED_HEADINGS);

/** 仕様がこの提案で本文を足す4本。増やすときは仕様書を先に直す */
const EXPECTED_SLUGS = ['shobyo-teate', 'kosodate-shienkin', 'hankaku-zenkaku', 'warikan'];

function pageSource(slug: string): string {
  return readFileSync(fileURLToPath(new URL(`../app/${slug}/page.tsx`, import.meta.url)), 'utf8');
}

/** page.tsx から h2 の中身を取り出す（JSXの式を含む見出しは対象外） */
function headings(source: string): string[] {
  return [...source.matchAll(/<h2>([^<{]+)<\/h2>/g)].map((m) => m[1].trim());
}

describe('本文の薄いツール4本に足した節', () => {
  it('対象は仕様書の4本', () => {
    expect(SLUGS.sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it('足した見出しは4本を通して重複しない（定型の節を作らない）', () => {
    const all = Object.values(ADDED_HEADINGS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('足した見出しが page.tsx に実在する', () => {
    for (const slug of SLUGS) {
      const found = headings(pageSource(slug));
      for (const heading of ADDED_HEADINGS[slug]) {
        expect(found, `${slug} の h2 に「${heading}」が無い`).toContain(heading);
      }
    }
  });

  it('足した見出しを、ほかの3本が持っていない', () => {
    for (const slug of SLUGS) {
      const others = SLUGS.filter((s) => s !== slug);
      for (const heading of ADDED_HEADINGS[slug]) {
        for (const other of others) {
          expect(
            headings(pageSource(other)),
            `${other} に ${slug} と同じ h2「${heading}」がある`,
          ).not.toContain(heading);
        }
      }
    }
  });

  it('本文を足した4本は registry の updatedAt が上がっている', () => {
    // sitemap の lastmod と IndexNow の差分送信が updatedAt を見ている。
    // 据え置くと本文を直しても Bing に更新が通知されない
    for (const slug of SLUGS) {
      expect(toolUpdatedAt(slug) >= '2026-09-26', `${slug} の updatedAt が古い`).toBe(true);
    }
  });

  it('早見表は最大4列（スマホで横スクロールを出さない）', () => {
    for (const slug of SLUGS) {
      const source = pageSource(slug);
      const heads = [...source.matchAll(/<thead>([\s\S]*?)<\/thead>/g)];
      expect(heads.length, `${slug} に表が無い`).toBeGreaterThan(0);
      for (const [, thead] of heads) {
        const columns = [...thead.matchAll(/<th>/g)].length;
        expect(columns, `${slug} の表が${columns}列ある`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('新しいCSSクラスやラッパを足していない（既存の table のまま）', () => {
    for (const slug of SLUGS) {
      const source = pageSource(slug);
      // 表は素の <table> で書く（overflow 用のラッパを足すと横スクロールが復活する）
      expect(source, `${slug} の表にラッパが付いている`).not.toMatch(/<div[^>]*>\s*<table>/);
      const classNames = [...source.matchAll(/className="([^"]+)"/g)].map((m) => m[1]);
      for (const name of classNames) {
        expect(['note', 'lead'], `${slug} に見慣れない class「${name}」がある`).toContain(name);
      }
    }
  });
});
