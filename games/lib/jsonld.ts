/**
 * 構造化データ（JSON-LD）の共通部品
 *
 * 構成は tools/lib/jsonld.ts と揃えてある。片方だけ直さないこと。
 */
import { SITE_NAME, SITE_URL, games } from './registry';

/**
 * ドメイン直下のポータル（hasokon.com）。
 * games は basePath 配下の別アプリなので、相対パスでは指せず絶対URLで持つ。
 */
export const HOME_URL = 'https://hasokon.com/';

/** パンくずの1段 */
export interface Crumb {
  /** 表示名。ゲームは registry の name をそのまま使う */
  name: string;
  /**
   * リンク先の絶対URL。現在地（最後の段）には持たせない。
   * 表示ではリンクにせず、JSON-LD では item を出さないという意味になる。
   */
  url?: string;
  /**
   * basePath（/games）配下の段だけが持つ、`<Link>` に渡すパス。
   * ホームは basePath の外にあるので持たない（`<a>` で絶対URLへ飛ばす）。
   */
  path?: string;
}

/**
 * パンくずの段を組み立てる。
 * 引数を省くとゲーム一覧ページ自身（ホーム ＞ 無料ミニゲーム集）の2段になる。
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
 * ゲームページのパンくず。名前は registry から引くので、ページ側で手書きしない。
 * registry の name を直せば表示と構造化データの両方に反映される。
 *
 * 未登録の slug は投げる。静的書き出しなので `npm run build` で必ず落ちる
 * （パンくずだけ黙って2段になり、検索結果で階層が欠けるのを防ぐため）。
 */
export function breadcrumbFor(slug: string): Crumb[] {
  const game = games.find((g) => g.slug === slug);
  if (!game) {
    throw new Error(`パンくずに使える slug ではありません: ${slug}（lib/registry.ts に未登録）`);
  }
  return breadcrumbTrail(game.name);
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
