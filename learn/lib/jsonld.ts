/**
 * 構造化データ（JSON-LD）の共通部品
 *
 * 構成は tools/lib/jsonld.ts・games/lib/jsonld.ts と揃えてある。
 * 学習セクションは記事なので、ページ側の主役は WebApplication ではなく `Article`。
 */
import {
  SITE_NAME,
  SITE_URL,
  chapterBySlug,
  subjectBySlug,
  subjectPath,
  subjectUrl,
} from './curriculum';

/** ドメイン直下のポータル（hasokon.com）。basePath の外なので絶対URLで持つ */
export const HOME_URL = 'https://hasokon.com/';

/** パンくずの1段 */
export interface Crumb {
  name: string;
  /** リンク先の絶対URL。現在地（最後の段）には持たせない */
  url?: string;
  /** basePath（/learn）配下の段だけが持つ、`<Link>` に渡すパス */
  path?: string;
}

/**
 * パンくずの段。
 *
 * 学習セクションは分野を1段挟むので、章まで行くと4段になる。
 *
 * ```
 * ホーム ＞ 学ぶ                                （/learn/ 自身）
 * ホーム ＞ 学ぶ ＞ 投資の教科書                 （/learn/toshi/）
 * ホーム ＞ 学ぶ ＞ 投資の教科書 ＞ 複利と時間   （章）
 * ```
 */
export function breadcrumbTrail(): Crumb[] {
  return [{ name: 'ホーム', url: HOME_URL }, { name: SITE_NAME }];
}

/** 分野の目次（`/learn/{subject}/`）のパンくず */
export function subjectTrail(subjectName: string): Crumb[] {
  return [
    { name: 'ホーム', url: HOME_URL },
    { name: SITE_NAME, url: `${SITE_URL}/`, path: '/' },
    { name: subjectName },
  ];
}

/**
 * 章のパンくず。名前は curriculum から引くのでページ側で手書きしない。
 * 未登録の slug は投げる（ビルドで落ちる）。
 */
export function breadcrumbFor(slug: string): Crumb[] {
  const chapter = chapterBySlug(slug);
  const subject = subjectBySlug(chapter.subject);
  return [
    { name: 'ホーム', url: HOME_URL },
    { name: SITE_NAME, url: `${SITE_URL}/`, path: '/' },
    { name: subject.name, url: subjectUrl(subject.slug), path: subjectPath(subject.slug) },
    { name: chapter.title },
  ];
}

/** BreadcrumbList。各ページの @graph に1要素として足す */
export function breadcrumbList(trail: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.url ? { item: c.url } : {}),
    })),
  };
}

/**
 * 章そのものを表す Article。
 *
 * `LearningResource` ではなく `Article` にしているのは、Google がリッチリザルトの
 * 対象として扱うのが Article 系だから。教育目的であることは
 * `learningResourceType` を添えて示す。
 */
export function articleFor(slug: string) {
  const chapter = chapterBySlug(slug);
  const subject = subjectBySlug(chapter.subject);
  return {
    '@type': 'Article',
    headline: chapter.title,
    description: chapter.description,
    url: `${SITE_URL}/${chapter.subject}/${chapter.slug}/`,
    isPartOf: {
      '@type': 'CreativeWorkSeries',
      name: subject.name,
      url: subjectUrl(subject.slug),
    },
    inLanguage: 'ja',
    learningResourceType: '解説記事',
    isAccessibleForFree: true,
    ...(chapter.updatedAt ? { dateModified: chapter.updatedAt } : {}),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
  };
}
