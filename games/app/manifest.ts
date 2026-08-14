import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/registry';

/**
 * Webアプリマニフェスト（「ホーム画面に追加」対応）
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * これが無いとホーム画面に追加してもただのブックマークで、通常のブラウザタブとして
 * 開く。GA4の実測でこのサイトの最大チャネルは Direct（リピーター）で、その多くが
 * ゲームなので、再訪の摩擦を下げるためにスタンドアロン起動できるようにする。
 *
 * 静的エクスポートでは `/games/manifest.webmanifest` として書き出され、
 * `app/layout.tsx` の `metadata.manifest` が全ページの <head> にリンクを出す。
 *
 * **Service Worker は入れない**（仕様書の「やらないこと」）。静的サイトで
 * 古いHTMLがキャッシュに残り続ける事故のリスクが利益を上回る。
 * manifest だけでも「ホーム画面に追加 → スタンドアロン起動」は成立する。
 */

// output: 'export' では静的生成であることの明示が必要（sitemap.ts と同じ）
export const dynamic = 'force-static';

/** basePath（/games）込みの配信パス。Next.js は manifest の中身を補正しないので自分で付ける */
export const MANIFEST_SCOPE = '/games/';

/**
 * ホーム画面から起動したセッションを GA4 で数えるための印。
 * 通常の流入（Direct・検索）と混ざらないので、導入効果はこれで測る
 * （仕様書「計測」）。`lib/analytics.ts` の本番ホスト判定はそのまま効く。
 */
export const HOMESCREEN_UTM = 'utm_source=homescreen';

/**
 * 配色は `app/globals.css` のライト側の値。
 *
 * マニフェストはダークテーマの出し分けができないので、既定であるライトの
 * `--bg` を使う。`.site-header` の地も `--bg` なので、スタンドアロン起動時の
 * タイトルバーがページのヘッダーと地続きに見える。
 * 【データ更新箇所】globals.css の `--bg`（ライト）を変えたらここも合わせる
 */
const BG = '#faf9f7';

/**
 * アイコンは `design/manifest-icons/gen-manifest-icons.mjs` の生成物。
 * 実体は `public/icons/` にあり、basePath が付いて /games/icons/... で配信される。
 *
 * `any` と `maskable` を分けているのは、Android の切り抜き（円・雫など）に耐える
 * 余白を持たせた絵を、切り抜かない環境にも使うとアイコンが小さく見えるため。
 */
const ICONS: MetadataRoute.Manifest['icons'] = [
  { src: '/games/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/games/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: '/games/icons/icon-maskable-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable',
  },
  {
    src: '/games/icons/icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    // ホーム画面のラベルは12文字前後で切られる。ブランドは "h" のアイコンが
    // 担うので、short_name は切れない長さの一般名にしている
    name: `hasokon ${SITE_NAME}`,
    short_name: 'ミニゲーム',
    description:
      'インストール不要・登録不要でそのまま遊べる無料ミニゲーム集。ナンプレ・ソリティア・ブロック崩しなどをブラウザだけで。',
    lang: 'ja',
    // 起動元をアプリとして同一視させるためのID。start_url にクエリが付くので、
    // 省略すると start_url がIDになり、クエリを変えるたびに別アプリ扱いになる
    id: MANIFEST_SCOPE,
    start_url: `${MANIFEST_SCOPE}?${HOMESCREEN_UTM}`,
    // /games/ の外（ポータル・tools）へ出たらブラウザに戻す
    scope: MANIFEST_SCOPE,
    display: 'standalone',
    background_color: BG,
    theme_color: BG,
    icons: ICONS,
  };
}
