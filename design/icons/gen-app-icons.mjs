/**
 * ゲームの「ホーム画面に追加」用アイコン（PNG）の生成スクリプト
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * `games/app/manifest.ts`（Webアプリマニフェスト）が参照するアイコンを書き出す。
 * **原典は `games/app/icon.svg`**（ブラウザのタブに出ているファビコンそのもの）で、
 * 配色・角丸・字はこのSVGから読み取っている。PNGを直接編集しないこと
 * （design/ogp/gen-ogp.mjs と同じ「原典はスクリプト」の流儀）。
 *
 * ふだん動かす必要はない。`games/app/icon.svg` を変えたときだけ回して、
 * 出てきたPNGを一緒にコミットする。
 *
 *   npm install --no-save playwright   # このリポジトリは playwright を常設していない
 *   node design/icons/gen-app-icons.mjs
 *
 * 描画は headless Chromium のスクリーンショット。字は Helvetica/Arial の
 * ラテン1文字だけなので、gen-ogp.mjs と違って端末フォントの差はほぼ出ない。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 原典のSVG。games の app/icon.svg（= /games/icon.svg として配信されるファビコン） */
export const SOURCE_SVG = 'games/app/icon.svg';

/**
 * 書き出す4枚。
 *
 * `any` と `maskable` を分けているのは、**マスカブルはOSが好きな形に切り抜くから**。
 * Android のランチャーは円・角丸四角・しずくなど端末ごとに違う形でマスクするので、
 * 角丸SVGをそのまま渡すと角が二重に落ちたり、地の透明部分が黒く出たりする。
 * マスカブル側は地を全面に敷き、字を安全領域（中央80%）に収める。
 *
 * 192 と 512 の2サイズは manifest の慣例（192=ホーム画面のアイコン、
 * 512=スプラッシュ画面とインストール時のプレビュー）。
 */
export const ICONS = [
  { out: 'games/public/icon-192.png', size: 192, purpose: 'any' },
  { out: 'games/public/icon-512.png', size: 512, purpose: 'any' },
  { out: 'games/public/icon-maskable-192.png', size: 192, purpose: 'maskable' },
  { out: 'games/public/icon-maskable-512.png', size: 512, purpose: 'maskable' },
];

/**
 * マスカブルの安全領域。仕様（W3C の maskable icon）では中央 80% の円に
 * 収めれば、どの端末のマスクでも欠けない。字はこの比率まで縮める
 */
export const MASKABLE_SAFE_RATIO = 0.8;

/**
 * 原典のSVGから、描き直すのに必要な値だけを抜く。
 *
 * SVGをそのまま `<img>` で貼らずに読み取っているのは、マスカブル側で
 * 角丸を外して字だけ縮める必要があるため。パーサは入れず、
 * このSVG（グラデーション + 角丸矩形 + 1文字）の形に限って正規表現で読む。
 */
export function parseIconSvg(svg) {
  const stops = [...svg.matchAll(/stop-color="([^"]+)"/g)].map((m) => m[1]);
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const radius = svg.match(/<rect[^>]*\brx="(\d+(?:\.\d+)?)"/);
  const fontSize = svg.match(/font-size="(\d+(?:\.\d+)?)"/);
  const glyph = svg.match(/>([^<>]+)<\/text>/);
  const fill = svg.match(/<text[^>]*\bfill="([^"]+)"/);

  if (stops.length !== 2 || !viewBox || !radius || !fontSize || !glyph || !fill) {
    throw new Error(`${SOURCE_SVG} の形が変わっている。gen-app-icons.mjs を直すこと`);
  }

  const box = Number(viewBox[1]);
  return {
    /** viewBox に対する比率で持つ。192/512 どちらにも同じ形で拡大できる */
    box,
    from: stops[0],
    to: stops[1],
    radiusRatio: Number(radius[1]) / box,
    fontRatio: Number(fontSize[1]) / box,
    glyph: glyph[1].trim(),
    glyphColor: fill[1],
  };
}

/**
 * 1枚分のHTMLを組み立てる。
 *
 * `any` は原典のSVGと同じ見た目（角丸・字は原寸比）。
 * `maskable` は角丸を外して地を全面に敷き、字を安全領域まで縮める。
 */
export function renderHtml({ size, purpose }, icon) {
  const maskable = purpose === 'maskable';
  const radius = maskable ? 0 : Math.round(icon.radiusRatio * size);
  const fontSize = icon.fontRatio * size * (maskable ? MASKABLE_SAFE_RATIO : 1);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${size}px; height: ${size}px; }
      body {
        /* 角丸の外側は透明。maskable では radius が 0 なので全面が地になる */
        background: transparent;
        display: flex; align-items: center; justify-content: center;
      }
      .icon {
        width: ${size}px; height: ${size}px;
        border-radius: ${radius}px;
        background: linear-gradient(135deg, ${icon.from}, ${icon.to});
        color: ${icon.glyphColor};
        display: flex; align-items: center; justify-content: center;
        font-family: Helvetica, Arial, sans-serif;
        font-size: ${fontSize}px;
        font-weight: 700;
        line-height: 1;
      }
    </style>
  </head>
  <body><div class="icon">${icon.glyph}</div></body>
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

  const icon = parseIconSvg(await readFile(join(repoRoot, SOURCE_SVG), 'utf8'));

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const spec of ICONS) {
    await page.setViewportSize({ width: spec.size, height: spec.size });
    await page.setContent(renderHtml(spec, icon), { waitUntil: 'load' });
    // 角丸の外は透明のまま残す（マスカブルでない側はOSが角を丸めないため）
    const png = await page.screenshot({ type: 'png', omitBackground: true });
    const dest = join(repoRoot, spec.out);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, png);
    console.log(`${spec.out}  ${png.length.toLocaleString()} bytes`);
  }

  await browser.close();
}

// import されたとき（テスト）は実行しない
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
