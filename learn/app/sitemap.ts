import type { MetadataRoute } from 'next';
import {
  chapterUrl,
  publicChapters,
  publicSubjects,
  SITE_UPDATED_AT,
  SITE_URL,
  subjectUrl,
} from '@/lib/curriculum';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * sitemap。**`publicSubjects` / `publicChapters` を通す**ので、
 * 公開していない分野・章は出ない（docs/features/feature-flags.md）。
 *
 * 3階層ぶん出す:
 *   /learn/                   分野の一覧
 *   /learn/{subject}/         分野の目次
 *   /learn/{subject}/{slug}/  章
 *
 * 公開している分野が1つも無ければ空にする。一覧に `noindex` を出しながら
 * sitemap には出す、という矛盾した合図を検索エンジンに送らないため。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (publicSubjects.length === 0) return [];
  return [
    { url: `${SITE_URL}/`, lastModified: SITE_UPDATED_AT, changeFrequency: 'monthly', priority: 1 },
    ...publicSubjects.map((s) => ({
      url: subjectUrl(s.slug),
      lastModified: s.updatedAt ?? SITE_UPDATED_AT,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    ...publicChapters.map((c) => ({
      url: chapterUrl(c),
      lastModified: c.updatedAt ?? SITE_UPDATED_AT,
      changeFrequency: 'yearly' as const,
      priority: 0.8,
    })),
  ];
}
