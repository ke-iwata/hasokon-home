/**
 * OGP画像（1200×630）の生成スクリプト
 *
 * 仕様: docs/features/ogp-image.md の「案B（共通画像1枚）」
 *
 * home / tools / games それぞれの共通OGP画像を1枚ずつ書き出す。
 * 出力先は各サイトの配信ディレクトリで、**生成物はコミットする**
 * （ページごとに1枚作る案Aと違い、3枚しかなく registry の変更でも増えないため。
 * 案Aに進むときは docs/features/ogp-image.md の「1. 画像の作り方」を参照）。
 *
 * ふだん動かす必要はない。デザイントークン（design/tokens.css）や
 * サイト名・説明文を変えたときだけ回して、出てきたPNGを一緒にコミットする。
 *
 *   npm install --no-save playwright   # または npx playwright
 *   node design/ogp/gen-ogp.mjs
 *
 * 描画は headless Chromium のスクリーンショット。日本語のWebフォントは
 * 埋め込まず、実行環境にある端末フォント（Hiragino / Noto Sans JP / IPAGothic）を
 * 使う。PNGはコミットするので、実行環境ごとの字面の差が本番に出ることはない。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** OGPの標準サイズ。X の summary_large_image もこの比率（1.91:1）を前提にしている */
export const WIDTH = 1200;
export const HEIGHT = 630;

/**
 * 配色。design/tokens.css のライト側の値をそのまま持ってきている。
 * OGP画像は静止画なのでダークテーマの出し分けはできない。
 * 【データ更新箇所】tokens.css を変えたらここも合わせる
 */
const T = {
  bg: '#faf9f7',
  surface: '#ffffff',
  text: '#1c1917',
  muted: '#6f6a65',
  border: '#e5e2dd',
  accent: '#15803d',
  accentStrong: '#14532d',
  accentSoft: '#edf7f0',
  accentLight: '#4ade80',
  onAccent: '#ffffff',
};

/**
 * 書き出す3枚。
 *
 * tools と games で地の色を反転させているのは、仕様書の
 * 「games/ は配色を変えて、ツールとゲームが見分けられるようにする」に対応するため。
 * アクセントは1色のままなので、サイト全体の配色からは外れない。
 */
export const VARIANTS = [
  {
    name: 'home',
    out: 'home/ogp.png',
    title: 'hasokon',
    subtitle: '個人開発の無料ツール・ゲーム・アプリ',
    theme: 'light',
  },
  {
    name: 'tools',
    out: 'tools/public/ogp.png',
    title: '無料計算ツール集',
    subtitle: '年収の壁・ふるさと納税・電気代をすぐ計算',
    theme: 'light',
  },
  {
    name: 'games',
    out: 'games/public/ogp.png',
    title: '無料ミニゲーム集',
    subtitle: 'ナンプレ・ソリティア・ブロック崩しをブラウザで',
    theme: 'dark',
  },
];

/**
 * 1枚分のHTMLを組み立てる。
 *
 * 絵文字は使わない（端末ごとに絵柄が変わるため。registry.ts のアイコン方針と同じ）。
 * 文字は端末フォントで描くので、字幅に頼ったレイアウトにはしない
 * （中央寄せ + 折り返し可の箱に収める）。
 */
export function renderHtml({ title, subtitle, theme }) {
  const dark = theme === 'dark';
  const bg = dark ? T.accentStrong : T.bg;
  const fg = dark ? T.onAccent : T.text;
  const sub = dark ? 'rgba(255,255,255,0.78)' : T.muted;
  const rule = dark ? 'rgba(255,255,255,0.22)' : T.border;
  const domain = dark ? T.accentLight : T.accent;
  const markBg = dark ? T.onAccent : T.accent;
  const markFg = dark ? T.accentStrong : T.onAccent;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
      body {
        background: ${bg};
        color: ${fg};
        font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP",
          "IPAGothic", "Yu Gothic", sans-serif;
        /* 約物のアキを詰める。design/tokens.css の日本語タイポグラフィと同じ方針 */
        font-feature-settings: "palt" 1;
        -webkit-font-smoothing: antialiased;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 76px 84px 68px;
        /* 左端のアクセント帯。3枚に共通の「hasokon.com のカード」らしさを出す */
        border-left: 16px solid ${dark ? T.accentLight : T.accent};
      }
      .mark {
        width: 96px; height: 96px;
        border-radius: 24px;
        background: ${markBg};
        color: ${markFg};
        display: flex; align-items: center; justify-content: center;
        font-size: 62px; font-weight: 700; line-height: 1;
        font-family: Helvetica, Arial, sans-serif;
      }
      h1 {
        font-size: 88px; font-weight: 700; line-height: 1.18;
        letter-spacing: 0.01em;
      }
      p {
        margin-top: 24px;
        font-size: 38px; font-weight: 400; line-height: 1.45;
        color: ${sub};
      }
      footer {
        display: flex; align-items: center; gap: 28px;
        font-size: 30px; font-weight: 700; color: ${domain};
        font-family: Helvetica, Arial, sans-serif;
        letter-spacing: 0.02em;
      }
      footer .rule { flex: 1; height: 2px; background: ${rule}; }
    </style>
  </head>
  <body>
    <div class="mark">h</div>
    <div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <footer><span class="rule"></span><span>hasokon.com</span></footer>
  </body>
</html>`;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      'playwright が見つかりません。`npm install --no-save playwright` してから実行してください。',
    );
    process.exit(2);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  for (const variant of VARIANTS) {
    await page.setContent(renderHtml(variant), { waitUntil: 'load' });
    const png = await page.screenshot({ type: 'png' });
    const dest = join(repoRoot, variant.out);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, png);
    console.log(`${variant.out}  ${png.length.toLocaleString()} bytes`);
  }

  await browser.close();
}

// import されたとき（テスト）は実行しない
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
