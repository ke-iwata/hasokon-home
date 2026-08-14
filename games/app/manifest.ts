import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/registry';

/**
 * Webアプリマニフェスト（「ホーム画面に追加」対応）
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * 静的書き出しで `/games/manifest.webmanifest` として出力され、
 * Next.js が各ページの `<head>` に `<link rel="manifest">` を自動で入れる。
 *
 * 最大チャネルが Direct（リピーター）でゲームが上位を占めているため、
 * スマホのホーム画面から1タップで開ける導線を用意する。
 *
 * **Service Worker は入れない**（仕様書の「やらないこと」）。
 * 静的サイトで古いHTMLがキャッシュに残り続ける事故のリスクが利益を上回る。
 * manifest だけでも「ホーム画面に追加 → スタンドアロン起動」は成立する。
 */

// output: 'export' では静的生成であることの明示が必要（app/sitemap.ts と同じ）
export const dynamic = 'force-static';

/**
 * basePath（/games）はマニフェストの中身には自動で付かないため、
 * URLはすべて `/games/` から手で書く。
 * 【注意】ここを `/` にすると scope の外になり、スタンドアロン起動しない
 */
const BASE = '/games/';

/**
 * ホーム画面から起動したセッションを GA4 で数えるための印。
 * 導入効果はこのパラメータの付いたセッション数で測る（仕様書の「計測」）。
 * `lib/analytics.ts` の本番ホスト判定はそのまま効く
 */
const START_URL = `${BASE}?utm_source=homescreen`;

/**
 * スプラッシュ画面とブラウザUIの色。app/globals.css のライト側の値。
 * 【データ更新箇所】globals.css の --bg / --accent を変えたらここも合わせる
 * （マニフェストは静止した値なので、ダークテーマの出し分けはできない）
 */
const BACKGROUND_COLOR = '#faf9f7';
const THEME_COLOR = '#15803d';

/**
 * アイコン。実体は `public/` で、原典は `games/app/icon.svg`。
 * `design/icons/gen-app-icons.mjs` で書き出しているので直接編集しない。
 *
 * `any` と `maskable` を分けているのは、Android のランチャーが端末ごとに
 * 違う形（円・角丸四角・しずく）で切り抜くため。角丸のSVGをそのまま渡すと
 * 角が二重に落ちる。maskable 側は地を全面に敷き、字を中央80%に収めてある
 */
const ICONS: MetadataRoute.Manifest['icons'] = [
  { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: `${BASE}icon-maskable-192.png`,
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable',
  },
  {
    src: `${BASE}icon-maskable-512.png`,
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    // id を固定しておくと、start_url を変えても同じアプリとして扱われる
    id: BASE,
    name: `${SITE_NAME}｜hasokon`,
    // ホーム画面のアイコン下に出る名前。Android で切れないよう12文字以内に収める
    short_name: 'はそこんゲーム',
    description:
      'インストール不要・登録不要でそのまま遊べる無料ミニゲーム集。ナンプレ・ソリティア・ブロック崩しなどをブラウザだけで。',
    lang: 'ja',
    dir: 'ltr',
    start_url: START_URL,
    scope: BASE,
    display: 'standalone',
    // 横持ちのゲームもあるので向きは固定しない
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    categories: ['games', 'entertainment'],
    icons: ICONS,
  };
}
