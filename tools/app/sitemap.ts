import type { MetadataRoute } from 'next';
import { publicTools, SITE_UPDATED_AT, SITE_URL } from '@/lib/registry';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * sitemap.xml を自動生成する。
 * lib/registry.ts に stage: 'public' のツールを追加すれば自動で載る。
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
  ];

  const toolPages: MetadataRoute.Sitemap = publicTools.map((t) => ({
    url: `${SITE_URL}/${t.slug}/`,
    lastModified: t.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // 用途別ルーレット（/r/<slug>/）と使い方の記事（/guide/<slug>/）は載せない。
  // 同じアプリに短い本文を足した近い作りのページが16本あり、サイト全体の品質判定を
  // 下げうるので、Google の登録が戻るまで noindex にしてある（lib/roulette/indexing.ts、
  // docs/features/google-index-recovery.md 提案 B）。戻すときはここと robots を一緒に戻す

  return [...staticPages, ...toolPages];
}
