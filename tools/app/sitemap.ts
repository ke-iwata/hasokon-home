import type { MetadataRoute } from 'next';
import { SITE_UPDATED_AT, SITE_URL, tools } from '@/lib/registry';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * sitemap.xml を自動生成する。
 * lib/registry.ts に ready: true のツールを追加すれば自動で載る。
 *
 * lastmod にはビルド日時ではなく registry の updatedAt を使う。
 * ビルドのたびに現在時刻を入れると全ページが毎回「更新された」ことになり、
 * 検索エンジンに lastmod を無視されるため。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: SITE_UPDATED_AT,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy/`,
      lastModified: SITE_UPDATED_AT,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/contact/`,
      lastModified: SITE_UPDATED_AT,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const toolPages: MetadataRoute.Sitemap = tools
    .filter((t) => t.ready)
    .map((t) => ({
      url: `${SITE_URL}/${t.slug}/`,
      lastModified: t.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));

  return [...staticPages, ...toolPages];
}
