import { describe, expect, it } from 'vitest';
import { metadata as layoutMetadata } from '@/app/layout';
import { metadata as pageMetadata } from '@/app/page';
import { HUB_DESCRIPTION, HUB_NAMED_GAMES, HUB_TITLE, HUB_TITLE_GAMES } from '@/lib/hub-metadata';
import { games, publicGames } from '@/lib/registry';

/**
 * 一覧ページ（/games/）の title・description（docs/features/ichiran-page-title-refresh.md）。
 *
 * 一覧ページは自前の title / description を持たず、layout の既定値がそのまま出る。
 * 「layout の値を直したのに一覧ページで上書きされていた」を防ぐため、両方を見る
 */
const title = layoutMetadata.title as { default: string };

describe('一覧ページの title・description', () => {
  it('一覧ページは layout の既定値をそのまま使う（自前の title / description を書かない）', () => {
    expect(pageMetadata.title).toBeUndefined();
    expect(pageMetadata.description).toBeUndefined();
    expect(title.default).toBe(HUB_TITLE);
    expect(layoutMetadata.description).toBe(HUB_DESCRIPTION);
  });

  it('6本時代の「ナンプレ・ブロック崩し」の文言が残っていない', () => {
    expect(title.default).not.toContain('ナンプレ・ブロック崩し');
    expect(HUB_DESCRIPTION).not.toContain('ナンプレ・ブロック崩し');
  });

  it('title は仕様どおりで、全角30字に収まる', () => {
    expect(HUB_TITLE).toBe('無料ミニゲーム集｜ソリティア・リバーシ・大富豪・ナンプレ');
    expect([...HUB_TITLE].length).toBeLessThanOrEqual(30);
  });

  it('title に挙げた名前は registry の name から出ている', () => {
    for (const slug of HUB_TITLE_GAMES) {
      expect(HUB_TITLE).toContain(games.find((g) => g.slug === slug)!.name);
    }
  });

  it('名前を挙げたゲームはすべて public（一覧に無いものを見出しで約束しない）', () => {
    const publicSlugs = new Set(publicGames.map((g) => g.slug));
    for (const slug of HUB_NAMED_GAMES) {
      expect(publicSlugs.has(slug), `${slug} が public ではない`).toBe(true);
    }
  });

  it('description の本数が publicGames の数と合っている', () => {
    const found = HUB_DESCRIPTION.match(/(\d+)本/g) ?? [];
    expect(found).toEqual([`${publicGames.length}本`]);
  });

  it('description に例示が入っている', () => {
    expect(HUB_DESCRIPTION).toContain('ソリティア（クロンダイク・スパイダー・フリーセル）');
    expect(HUB_DESCRIPTION).toContain('花札こいこい');
    expect(HUB_DESCRIPTION).toContain('CPU対戦つき、スマホ対応。');
  });
});
