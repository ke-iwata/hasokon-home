import type { MetadataRoute } from 'next';
import { SITE_URL, tools } from '@/lib/registry';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * sitemap.xml を自動生成する。
 * lib/registry.ts に ready: true のツールを追加すれば自動で載る。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/privacy/`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/contact/`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const toolPages: MetadataRoute.Sitemap = tools
    .filter((t) => t.ready)
    .map((t) => ({
      url: `${SITE_URL}/${t.slug}/`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));

  return [...staticPages, ...toolPages];
}
