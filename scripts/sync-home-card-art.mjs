#!/usr/bin/env node
// トップ（home/index.html）のカードの絵を、tools / games のビルド結果から写す。
//
// home/ にはビルド工程が無く、React の絵をそのまま使えない。これまでもアイコンの SVG は
// 手で写していた（index.html のコメント参照）。その写しを機械にやらせるためのもの。
// 絵の原本は tools/app/ToolArt.tsx と games/app/GameIcon.tsx の BOARD で、
// **このスクリプトは原本を書き換えない**。
//
// 使い方（先に両方をビルドしておく）:
//   (cd tools && npm run build) && (cd games && npm run build)
//   node scripts/sync-home-card-art.mjs
//
// 仕様: docs/features/card-illustrations.md
//
// - 絵はツールの404ページ（tools/out/404.html）とゲームの一覧ページ（games/out/index.html）の
//   カードから取る。ツールの一覧（/tools/）は「結果の形」の大きい絵（ToolPreview.tsx）に
//   なったので、小さいタイルの絵（ToolArt.tsx）が並ぶ404ページを写し元にしている
// - カードの <a> にはタイルの2色をインラインの変数で渡す（ツールは分類ごと、ゲームは1色）
// - 何度かけても同じ結果になる（style と絵を置き換えるだけ）
// - 写せなかったカードがあれば終了コード1（home にだけあって一覧に無いカード＝公開前や削除済み）

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ゲームは1分類なので、タイルの色は1つ */
export const GAME_TILE_STYLE = '--tile-ink:var(--cat-play);--tile-bg:var(--cat-play-bg)';

/** 開始タグから属性を1つ取り出す（属性の並び順に依存しない） */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/**
 * 一覧ページのHTMLから、カードごとの絵とタイルの style を集める。
 * @param {string} html  ビルド後の一覧ページ
 * @param {'tools'|'games'} site
 * @returns {Map<string, { svg: string, style: string }>}  slug → 絵
 */
export function collectArt(html, site) {
  const cls = site === 'tools' ? 'tool-card' : 'game-card';
  const out = new Map();
  const re = new RegExp(`<a\\b[^>]*class="${cls}"[^>]*>`, 'g');
  for (const m of html.matchAll(re)) {
    const tag = m[0];
    const href = attr(tag, 'href');
    const slug = href?.match(new RegExp(`^/${site}/([a-z0-9-]+)/$`))?.[1];
    if (!slug || out.has(slug)) continue;
    const rest = html.slice(m.index + tag.length);
    const svg = rest.match(/^\s*<div class="icon"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/)?.[1];
    if (!svg) continue;
    const style = site === 'tools' ? attr(tag, 'style') : GAME_TILE_STYLE;
    if (!style) continue;
    out.set(slug, { svg, style });
  }
  return out;
}

/**
 * home/index.html のカードに絵と style を差し込む。
 * @returns {{ html: string, updated: string[], missing: string[] }}
 */
export function applyArt(homeHtml, art) {
  const updated = [];
  const missing = [];
  // <a> と絵のあいだに、古い線画の形を説明するコメントが挟まっているカードがある
  // （「GameIcon.tsx の PyramidIcon と同じ形」など）。写したあとは嘘になるので外す
  const re =
    /<a class="card"(?: style="[^"]*")? href="\/(tools|games)\/([a-z0-9-]+)\/">(?:\s*<!--[\s\S]*?-->)*(\s*<span class="card-icon">)[\s\S]*?(<\/span>)/g;
  const html = homeHtml.replace(re, (whole, site, slug, open, close) => {
    const found = art[site].get(slug);
    if (!found) {
      missing.push(`${site}/${slug}`);
      return whole;
    }
    updated.push(`${site}/${slug}`);
    return `<a class="card" style="${found.style}" href="/${site}/${slug}/">${open}${found.svg}${close}`;
  });
  return { html, updated, missing };
}

function main(argv) {
  const opt = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const homePath = opt('--home', `${ROOT}/home/index.html`);
  const art = {
    tools: collectArt(readFileSync(opt('--tools', `${ROOT}/tools/out/404.html`), 'utf8'), 'tools'),
    games: collectArt(readFileSync(opt('--games', `${ROOT}/games/out/index.html`), 'utf8'), 'games'),
  };
  if (art.tools.size === 0 || art.games.size === 0) {
    console.error('ビルド結果から絵を1つも拾えなかった。先に tools と games をビルドしてください');
    return 2;
  }
  const { html, updated, missing } = applyArt(readFileSync(homePath, 'utf8'), art);
  writeFileSync(homePath, html);
  console.log(`写したカード: ${updated.length} 枚（ツールの絵 ${art.tools.size}・ゲームの絵 ${art.games.size} から）`);
  if (missing.length) {
    console.error(`一覧に無いため写せなかったカード: ${missing.join(', ')}`);
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
