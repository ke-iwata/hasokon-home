import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_PREVIEW_SLUGS } from '@/app/GamePreview';
import { games, publicGames } from '@/lib/registry';

/**
 * ゲーム一覧（/games/）のカードの「遊んでいる画面」の絵（app/GamePreview.tsx）の約束を見張る。
 * 仕様は docs/features/card-illustrations.md。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('一覧カードの「遊んでいる画面」の絵', () => {
  it('公開中のゲームには、すべて絵がある', () => {
    // 無いと一覧のカードに絵の枠ごと出ない。公開するPRで GameIcon.tsx の BOARD と両方描くこと
    const missing = publicGames.filter((g) => !GAME_PREVIEW_SLUGS.includes(g.slug)).map((g) => g.slug);
    expect(missing, `絵が無い公開中ゲーム: ${missing.join(', ')}`).toEqual([]);
  });

  it('絵の slug はすべて registry に実在する（消したゲームの絵を残さない）', () => {
    const slugs = new Set(games.map((g) => g.slug));
    const orphans = GAME_PREVIEW_SLUGS.filter((s) => !slugs.has(s));
    expect(orphans, `registry に無い slug: ${orphans.join(', ')}`).toEqual([]);
  });

  it('目立たせる色（--cat-mark）は、明るいテーマと暗いテーマの両方で定義がある', () => {
    const css = readFileSync(`${appDir}globals.css`, 'utf8');
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(css.split('--cat-mark:').length - 1).toBeGreaterThanOrEqual(2);
    expect(dark.includes('--cat-mark:')).toBe(true);
  });

  it('絵は色を直書きしない（明暗テーマに追随させるため）', () => {
    const src = readFileSync(`${appDir}GamePreview.tsx`, 'utf8');
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `直書きの色: ${hex.join(', ')}`).toHaveLength(0);
  });

  it('一覧ページは遊んでいる画面の絵を使う', () => {
    const page = readFileSync(`${appDir}page.tsx`, 'utf8');
    expect(page).toContain('<GamePreview');
  });
});
