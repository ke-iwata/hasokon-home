import type { MetadataRoute } from 'next';
import { publicChapters, sectionIsPublic, SITE_UPDATED_AT, SITE_URL } from '@/lib/curriculum';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * sitemap。**`publicChapters` を通す**ので、`wip` / `preview` の章は出ない
 * （docs/features/feature-flags.md）。
 *
 * セクションごと公開前のあいだは**空にする**。目次に `noindex` を出しながら
 * sitemap には出す、という矛盾した合図を検索エンジンに送らないため
 * （目次の `robots` と同じ `sectionIsPublic()` を見ている）。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!sectionIsPublic()) return [];
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
