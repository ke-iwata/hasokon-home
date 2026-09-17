import type { MetadataRoute } from 'next';
import { publicGames, SITE_UPDATED_AT, SITE_URL } from '@/lib/registry';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: SITE_UPDATED_AT, changeFrequency: 'weekly', priority: 1 },
    // 運営者情報（/about/）は載せない。本文は `/about.html` に1枚へまとめ、
    // このアプリ側は noindex の受け皿として残してある
    // （docs/features/google-index-recovery.md 提案 C）。
    // `/about.html` は home/sitemap-home.xml に載っている
    {
      url: `${SITE_URL}/contact/`,
      lastModified: SITE_UPDATED_AT,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...publicGames.map((g) => ({
      url: `${SITE_URL}/${g.slug}/`,
      lastModified: g.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
