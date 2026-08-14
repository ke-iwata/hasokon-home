/**
 * Webアプリマニフェスト用アイコン（PNG）の生成スクリプト
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * `games/app/icon.svg`（ブラウザのタブに出るファビコン）と同じ絵を、
 * ホーム画面に置ける大きさのPNGで書き出す。`design/ogp/gen-ogp.mjs` と同じ
 * 「原典はスクリプト、生成物はコミットする」流儀。**PNGを直接編集しない。**
 *
 * ふだん動かす必要はない。`games/app/icon.svg` を変えたときだけ回して、
 * 出てきたPNGを一緒にコミットする。
 *
 *   npm install --no-save playwright   # このリポジトリは playwright を常設していない
 *   node design/manifest-icons/gen-manifest-icons.mjs
 *
 * 描画は headless Chromium のスクリーンショット。文字は 'h' のラテン1文字だけなので、
 * OGP画像と違って日本語フォントの有無に左右されない。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * 絵柄。**原典は `games/app/icon.svg`** で、ここはその写し。
 * ずれると「タブのファビコンとホーム画面のアイコンが別の絵」になるので、
 * `scripts/test/manifest-icons.test.mjs` が icon.svg と突き合わせて見張っている。
 */
export const ART = {
  /** icon.svg の viewBox。座標はすべてこの正方形の中の値 */
  viewBox: 64,
  /** 角丸。icon.svg の <rect rx="14"> */
  corner: 14,
  /** グラデーション（左上→右下） */
  from: '#0ea5e9',
  to: '#6366f1',
  /** 中央に置く文字と色 */
  glyph: 'h',
  glyphColor: '#fff',
  glyphSize: 40,
  glyphFont: 'Helvetica, Arial, sans-serif',
};

/**
 * maskable のセーフゾーン。
 *
 * Android は端末ごとに違う形（円・角丸四角・雫）でアイコンを切り抜くため、
 * 仕様上は「中心 80% の円の中」に絵が収まっていないと欠ける。
 * そこで maskable 版は
 *
 * - 背景の角丸をやめて、グラデーションを縁まで塗る（どこで切られても地が続く）
 * - 文字をこの比率まで小さくして、切り抜きの外に出ないようにする
 *
 * https://www.w3.org/TR/appmanifest/#purpose-member
 */
export const SAFE_ZONE = 0.8;

/**
 * 書き出す4枚。
 *
 * `any` と `maskable` を1枚で兼ねない。兼ねるとセーフゾーンの余白のぶん、
 * 切り抜かない環境（iOS・デスクトップ）でアイコンが小さく見えるため。
 *
 * 192 と 512 の2サイズは、Android のホーム画面（192）と
 * スプラッシュ・アプリ一覧（512）がそれぞれ見る大きさ。
 */
export const ICONS = [
  { size: 192, purpose: 'any', out: 'games/public/icons/icon-192.png' },
  { size: 512, purpose: 'any', out: 'games/public/icons/icon-512.png' },
  { size: 192, purpose: 'maskable', out: 'games/public/icons/icon-maskable-192.png' },
  { size: 512, purpose: 'maskable', out: 'games/public/icons/icon-maskable-512.png' },
];

/** マニフェストから参照するURL。basePath（/games）込みの絶対パス */
export const iconUrl = (out) => out.replace(/^games\/public/, '/games');

/**
 * アイコン1枚のSVG。
 *
 * `maskable` のときだけ、角丸をやめて文字を SAFE_ZONE ぶん小さくする。
 * それ以外は icon.svg と同じ絵。
 */
export function renderSvg({ size, purpose }) {
  const maskable = purpose === 'maskable';
  const { viewBox, corner, from, to, glyph, glyphColor, glyphSize, glyphFont } = ART;
  const rx = maskable ? 0 : corner;
  const fontSize = maskable ? glyphSize * SAFE_ZONE : glyphSize;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}" />
      <stop offset="1" stop-color="${to}" />
    </linearGradient>
  </defs>
  <rect width="${viewBox}" height="${viewBox}" rx="${rx}" fill="url(#g)" />
  <text
    x="${viewBox / 2}"
    y="${viewBox / 2 + 1}"
    fill="${glyphColor}"
    font-family="${glyphFont}"
    font-size="${fontSize}"
    font-weight="700"
    text-anchor="middle"
    dominant-baseline="central"
  >${glyph}</text>
</svg>`;
}

/**
 * スクリーンショット用のHTML。
 * 余白と地色を持たせない（`any` は角丸の外が透過、`maskable` は縁まで塗り）。
 */
export function renderHtml(icon) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; }
      html, body { width: ${icon.size}px; height: ${icon.size}px; background: transparent; }
      svg { display: block; }
    </style>
  </head>
  <body>${renderSvg(icon)}</body>
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

  for (const icon of ICONS) {
    const page = await browser.newPage({
      viewport: { width: icon.size, height: icon.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(renderHtml(icon), { waitUntil: 'load' });
    // 角丸の外を透過で残す（不透明な白地が乗ると、丸く切り抜く環境で四角が見える）
    const png = await page.screenshot({ type: 'png', omitBackground: true });
    const dest = join(repoRoot, icon.out);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, png);
    await page.close();
    console.log(`${icon.out}  ${png.length.toLocaleString()} bytes`);
  }

  await browser.close();
}

// import されたとき（テスト）は実行しない
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
