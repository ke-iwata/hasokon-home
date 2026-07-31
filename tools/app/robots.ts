import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/registry';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
