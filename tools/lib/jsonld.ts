/**
 * 構造化データ（JSON-LD）の共通部品
 *
 * 「誰が作って、いつ更新したページなのか」を機械可読な形でも示すためのもの。
 * お金・健康に関わるページ（YMYL）は、検索エンジンが情報の出どころを
 * 重く見る領域なので、全ページで publisher と dateModified を出している。
 *
 * 発行者は @id で1つに束ねてある。各ページから同じ @id を参照することで、
 * 「同じ運営者による別ページ」として結び付けられる。
 */
import { SITE_NAME, SITE_URL, tools, SITE_UPDATED_AT } from './registry';

/**
 * ドメイン直下のポータル（hasokon.com）。
 * tools は basePath 配下の別アプリなので、相対パスでは指せず絶対URLで持つ。
 */
export const HOME_URL = 'https://hasokon.com/';

/** パンくずの1段 */
export interface Crumb {
  /** 表示名。ツールは registry の name をそのまま使う */
  name: string;
  /**
   * リンク先の絶対URL。現在地（最後の段）には持たせない。
   * 表示ではリンクにせず、JSON-LD では item を出さないという意味になる。
   */
  url?: string;
  /**
   * basePath（/tools）配下の段だけが持つ、`<Link>` に渡すパス。
   * ホームは basePath の外にあるので持たない（`<a>` で絶対URLへ飛ばす）。
   */
  path?: string;
}

/**
 * パンくずの段を組み立てる。
 * 引数を省くとツール一覧ページ自身（ホーム ＞ 無料計算ツール集）の2段になる。
 *
 * 表示（app/Breadcrumb.tsx）と構造化データ（breadcrumbList）は
 * どちらもこの戻り値から作る。片方だけ直して食い違うことが起きないようにするため。
 */
export function breadcrumbTrail(current?: string): Crumb[] {
  const home: Crumb = { name: 'ホーム', url: HOME_URL };
  if (current === undefined) return [home, { name: SITE_NAME }];
  return [home, { name: SITE_NAME, url: `${SITE_URL}/`, path: '/' }, { name: current }];
}

/**
 * ツールページのパンくず。名前は registry から引くので、ページ側で手書きしない。
 * registry の name を直せば表示と構造化データの両方に反映される。
 *
 * 未登録の slug は投げる。静的書き出しなので `npm run build` で必ず落ちる
 * （パンくずだけ黙って2段になり、検索結果で階層が欠けるのを防ぐため）。
 */
export function breadcrumbFor(slug: string): Crumb[] {
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) {
    throw new Error(`パンくずに使える slug ではありません: ${slug}（lib/registry.ts に未登録）`);
  }
  return breadcrumbTrail(tool.name);
}

/**
 * BreadcrumbList。各ページの既存の @graph に1要素として足す。
 * <script> を増やさないのは、同じページに複数のJSON-LDを置くと
 * 発行者の @id 参照が別グラフに分かれてしまうため。
 */
export function breadcrumbList(trail: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      // 現在地には item を付けない（Google の推奨）
      ...(c.url ? { item: c.url } : {}),
    })),
  };
}

/** 発行者。全ページの publisher / author から参照する */
export const PUBLISHER = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#publisher`,
  name: SITE_NAME,
  url: SITE_URL,
  // 運営者情報のページ。検索エンジンにも利用者にも辿れるようにしておく
  mainEntityOfPage: `${SITE_URL}/about/`,
} as const;

/** publisher / author の参照（実体は上の PUBLISHER 側に持たせる） */
export const PUBLISHER_REF = { '@id': `${SITE_URL}/#publisher` } as const;

/** ツールの最終更新日を registry から引く。未登録なら固定ページの更新日 */
export function toolUpdatedAt(slug: string): string {
  return tools.find((t) => t.slug === slug)?.updatedAt ?? SITE_UPDATED_AT;
}

/**
 * ツールページ用の WebApplication。
 * 各ページで同じ形を書き写すと publisher の付け忘れが起きるので関数にしている。
 */
export function webApplication({
  name,
  slug,
  description,
  category = 'UtilitiesApplication',
}: {
  name: string;
  slug: string;
  description: string;
  /** FinanceApplication / HealthApplication / UtilitiesApplication など */
  category?: string;
}) {
  return {
    '@type': 'WebApplication',
    name,
    url: `${SITE_URL}/${slug}/`,
    applicationCategory: category,
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
    description,
    inLanguage: 'ja',
    isAccessibleForFree: true,
    dateModified: toolUpdatedAt(slug),
    publisher: PUBLISHER_REF,
  };
}
