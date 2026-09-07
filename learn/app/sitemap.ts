import type { MetadataRoute } from 'next';
import { publicChapters, SITE_UPDATED_AT, SITE_URL } from '@/lib/curriculum';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * sitemap。**`publicChapters` を通す**ので、`wip` / `preview` の章は出ない
 * （docs/features/feature-flags.md）。
 *
 * セクション全体がまだ `preview` の段階なので、いまはトップの1件だけが出る。
 * 公開するPRで各章の `stage` を上げると自動で載る。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: SITE_UPDATED_AT, changeFrequency: 'monthly', priority: 1 },
    ...publicChapters.map((c) => ({
      url: `${SITE_URL}/${c.slug}/`,
      lastModified: c.updatedAt ?? SITE_UPDATED_AT,
      changeFrequency: 'yearly' as const,
      priority: 0.8,
    })),
  ];
}
