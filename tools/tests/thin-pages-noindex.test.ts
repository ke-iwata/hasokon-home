import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { generateMetadata as presetMetadata, generateStaticParams as presetParams } from '@/app/r/[slug]/page';
import { generateMetadata as guideMetadata, generateStaticParams as guideParams } from '@/app/guide/[slug]/page';
import { SITE_URL } from '@/lib/registry';

/**
 * 用途別ルーレット（/r/）と使い方の記事（/guide/）を noindex にした。
 *
 * 仕様: docs/features/google-index-recovery.md（提案 B）
 *
 * この 2 ルートは registry に無いので `robotsFor()` を通らず、
 * `tests/stage.test.ts` の対象外になる。**ここで見張らないと、noindex が
 * 黙って外れても気づけない**。
 */

const presets = presetParams();
const guides = guideParams();
const urls = () => sitemap().map((entry) => entry.url);

describe('用途別ルーレットと使い方の記事を検索対象から外した', () => {
  it('用途別ルーレット 10 本・使い方の記事 6 本が生成される（ページ自体は残す）', () => {
    expect(presets).toHaveLength(10);
    expect(guides).toHaveLength(6);
  });

  it.each(presets.map((p) => p.slug))('/r/%s/ は noindex・follow、canonical は自己参照', async (slug) => {
    const meta = await presetMetadata({ params: Promise.resolve({ slug }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/r/${slug}/`);
  });

  it.each(guides.map((g) => g.slug))('/guide/%s/ は noindex・follow、canonical は自己参照', async (slug) => {
    const meta = await guideMetadata({ params: Promise.resolve({ slug }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/guide/${slug}/`);
  });

  it('サイトマップに /r/ と /guide/ を載せていない', () => {
    const found = urls().filter((u) => u.startsWith(`${SITE_URL}/r/`) || u.startsWith(`${SITE_URL}/guide/`));
    expect(found).toEqual([]);
  });

  it('ルーレット本体はサイトマップに残っている（入口は消さない）', () => {
    expect(urls()).toContain(`${SITE_URL}/roulette/`);
  });
});
