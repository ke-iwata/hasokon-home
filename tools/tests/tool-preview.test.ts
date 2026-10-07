import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOL_PREVIEW_SLUGS } from '@/app/ToolPreview';
import { publicTools, tools } from '@/lib/registry';

/**
 * 一覧（/tools/）のカードの「結果の形」の絵（app/ToolPreview.tsx）の約束を見張る。
 * 仕様は docs/features/card-illustrations.md。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('一覧カードの「結果の形」の絵', () => {
  it('公開中のツールには、すべて絵がある', () => {
    // 無いと一覧のカードに絵の枠ごと出ない。公開するPRで ToolArt.tsx と両方描くこと
    const missing = publicTools.filter((t) => !TOOL_PREVIEW_SLUGS.includes(t.slug)).map((t) => t.slug);
    expect(missing, `結果の形の絵が無い公開中ツール: ${missing.join(', ')}`).toEqual([]);
  });

  it('絵の slug はすべて registry に実在する（消したツールの絵を残さない）', () => {
    const slugs = new Set(tools.map((t) => t.slug));
    const orphans = TOOL_PREVIEW_SLUGS.filter((s) => !slugs.has(s));
    expect(orphans, `registry に無い slug: ${orphans.join(', ')}`).toEqual([]);
  });

  it('目立たせる色（--cat-mark）は、明るいテーマと暗いテーマの両方で定義がある', () => {
    const css = readFileSync(`${appDir}globals.css`, 'utf8');
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(css.split('--cat-mark:').length - 1).toBeGreaterThanOrEqual(2);
    expect(dark.includes('--cat-mark:')).toBe(true);
  });

  it('絵は色を直書きしない（明暗テーマに追随させるため）', () => {
    const src = readFileSync(`${appDir}ToolPreview.tsx`, 'utf8');
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `直書きの色: ${hex.join(', ')}`).toHaveLength(0);
  });

  it('人によって変わる額を、それらしい架空の数字で描かない（伏せ字［◯］にする）', () => {
    // 「約75%」「月5万円」のような値は、見た人が自分の答えだと受け取りうる。
    // 絵に書いてよい数字は制度で決まっている値だけ（80%・119万・6.2万円など）。
    // ここでは「約」「およそ」で始まる概数を書いていないことだけを機械で見る
    const src = readFileSync(`${appDir}ToolPreview.tsx`, 'utf8');
    const approx = src.match(/[>{'"](約|およそ)[0-9０-９]/g) ?? [];
    expect(approx, `概数: ${approx.join(', ')}`).toHaveLength(0);
  });

  it('一覧ページは結果の形の絵を、404ページは小さいタイルの絵を使う（トップの写し元が404のため）', () => {
    const page = readFileSync(`${appDir}page.tsx`, 'utf8');
    const notFound = readFileSync(`${appDir}not-found.tsx`, 'utf8');
    expect(page).toContain('<ToolPreview');
    expect(notFound).toContain('<ToolArt');
  });
});
