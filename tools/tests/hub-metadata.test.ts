import { describe, expect, it } from 'vitest';
import { metadata as layoutMetadata } from '@/app/layout';
import { metadata as pageMetadata } from '@/app/page';
import { HUB_DESCRIPTION, HUB_NAMED_TOOLS, HUB_TITLE } from '@/lib/hub-metadata';
import { publicTools } from '@/lib/registry';

/**
 * 一覧ページ（/tools/）の title・description（docs/features/ichiran-page-title-refresh.md）。
 *
 * 一覧ページは自前の title / description を持たず、layout の既定値がそのまま出る。
 * 一覧ページ側で上書きされていないことも合わせて見る
 */
const title = layoutMetadata.title as { default: string };

describe('一覧ページの title・description', () => {
  it('一覧ページは layout の既定値をそのまま使う（自前の title / description を書かない）', () => {
    expect(pageMetadata.title).toBeUndefined();
    expect(pageMetadata.description).toBeUndefined();
    expect(title.default).toBe(HUB_TITLE);
    expect(layoutMetadata.description).toBe(HUB_DESCRIPTION);
  });

  it('title は仕様どおりで、全角30字に収まる', () => {
    expect(HUB_TITLE).toBe('無料計算ツール集｜年齢・ふるさと納税・養育費・最低賃金を計算');
    expect([...HUB_TITLE].length).toBeLessThanOrEqual(30);
  });

  it('title に時期で古びる語（値上げ）を入れない', () => {
    expect(HUB_TITLE).not.toContain('値上げ');
  });

  it('名前を挙げたツールはすべて public（一覧に無いものを見出しで約束しない）', () => {
    const publicSlugs = new Set(publicTools.map((t) => t.slug));
    for (const slug of HUB_NAMED_TOOLS) {
      expect(publicSlugs.has(slug), `${slug} が public ではない`).toBe(true);
    }
  });

  it('description の本数が publicTools の数と合っている', () => {
    const found = HUB_DESCRIPTION.match(/(\d+)本/g) ?? [];
    expect(found).toEqual([`${publicTools.length}本`]);
    expect(HUB_DESCRIPTION).toContain('たばこ税と酒税の改正');
  });
});
