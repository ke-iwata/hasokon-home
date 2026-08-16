import type { MetadataRoute } from 'next';
import { games, SITE_UPDATED_AT, SITE_URL } from '@/lib/registry';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: SITE_UPDATED_AT, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${SITE_URL}/about/`,
      lastModified: SITE_UPDATED_AT,
      changeFrequency: 'yearly',
      priority: 0.3,
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
    ...games
      .filter((g) => g.ready)
      .map((g) => ({
        url: `${SITE_URL}/${g.slug}/`,
        lastModified: g.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
  ];
}
