import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOL_ART_SLUGS, categoryStyle, categoryToken } from '@/app/ToolArt';
import { categories, publicTools, tools } from '@/lib/registry';

/**
 * 一覧カードの絵（app/ToolArt.tsx）の約束を見張る。
 * 仕様は docs/features/card-illustrations.md。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('カードの絵', () => {
  it('公開中のツールには、すべて絵がある', () => {
    // 絵が無いと Phosphor の線画に落ちる。公開前ならそれで構わないが、
    // 公開中のカードに線画が混ざると「出てくるものを描く」の並びが崩れる。
    // 公開するPRで絵も描くこと
    const missing = publicTools.filter((t) => !TOOL_ART_SLUGS.includes(t.slug)).map((t) => t.slug);
    expect(missing, `絵の無い公開中ツール: ${missing.join(', ')}`).toEqual([]);
  });

  it('絵の slug はすべて registry に実在する（消したツールの絵を残さない）', () => {
    const slugs = new Set(tools.map((t) => t.slug));
    const orphans = TOOL_ART_SLUGS.filter((s) => !slugs.has(s));
    expect(orphans, `registry に無い slug: ${orphans.join(', ')}`).toEqual([]);
  });

  it('すべての分類が、タイルの2色を渡す', () => {
    for (const c of categories) {
      const style = categoryStyle(c) as Record<string, string>;
      expect(style['--tile-ink'], c).toMatch(/^var\(--cat-[a-z]+\)$/);
      expect(style['--tile-bg'], c).toMatch(/^var\(--cat-[a-z]+-bg\)$/);
    }
  });

  it('分類の色は globals.css に、明るいテーマと暗いテーマの両方で定義がある', () => {
    // 片方にしか無いと、もう片方のテーマで地色が消えてタイルが見えなくなる
    const css = readFileSync(`${appDir}globals.css`, 'utf8');
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    for (const c of categories) {
      const t = categoryToken(c);
      for (const name of [`--cat-${t}:`, `--cat-${t}-bg:`]) {
        expect(css.split(name).length - 1, `${name} が明暗の2か所に無い`).toBeGreaterThanOrEqual(2);
        expect(dark.includes(name), `${name} が暗いテーマに無い`).toBe(true);
      }
    }
  });

  it('絵は色を直書きしない（明暗テーマに追随させるため）', () => {
    // 線と塗りは currentColor、抜きはタイルの地色の変数。生のカラーコードを書くと、
    // 暗いテーマで地と同化したり、分類の色から外れたりする
    const src = readFileSync(`${appDir}ToolArt.tsx`, 'utf8');
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `直書きの色: ${hex.join(', ')}`).toHaveLength(0);
  });
});
