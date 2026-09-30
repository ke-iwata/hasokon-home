import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_BOARD_ICONS } from '@/app/GameIcon';
import { games, publicGames } from '@/lib/registry';

/**
 * 一覧カードの盤面の絵（app/GameIcon.tsx の BOARD）の約束を見張る。
 * 仕様は docs/features/card-illustrations.md。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('カードの盤面の絵', () => {
  it('公開中のゲームには、すべて盤面の絵がある', () => {
    // 無いと線画のアイコンに落ちる。公開前ならそれで構わないが、公開中の一覧に
    // 線画が混ざると「盤面をそのまま描く」の並びが崩れる。公開するPRで描くこと
    const missing = publicGames.filter((g) => !GAME_BOARD_ICONS.includes(g.icon)).map((g) => g.slug);
    expect(missing, `盤面の絵が無い公開中ゲーム: ${missing.join(', ')}`).toEqual([]);
  });

  it('盤面の絵の名前は、どれかのゲームの icon と一致する（消したゲームの絵を残さない）', () => {
    const icons = new Set(games.map((g) => g.icon));
    const orphans = GAME_BOARD_ICONS.filter((n) => !icons.has(n));
    expect(orphans, `どのゲームにも使われていない絵: ${orphans.join(', ')}`).toEqual([]);
  });

  it('icon 名はゲームごとに1つ（絵を名前で引いているので、重なると別のゲームの盤面が出る）', () => {
    const names = games.map((g) => g.icon);
    expect(new Set(names).size).toBe(names.length);
  });

  it('タイルの地色と線の色は、明るいテーマと暗いテーマの両方で定義がある', () => {
    const css = readFileSync(`${appDir}globals.css`, 'utf8');
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    for (const name of ['--cat-play:', '--cat-play-bg:']) {
      expect(css.split(name).length - 1, `${name} が明暗の2か所に無い`).toBeGreaterThanOrEqual(2);
      expect(dark.includes(name), `${name} が暗いテーマに無い`).toBe(true);
    }
  });

  it('絵は色を直書きしない（明暗テーマに追随させるため）', () => {
    const src = readFileSync(`${appDir}GameIcon.tsx`, 'utf8');
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `直書きの色: ${hex.join(', ')}`).toHaveLength(0);
  });
});
