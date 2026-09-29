import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadRegistries } from '../lib/registry.mjs';
import { GAME_TILE_STYLE, applyArt, collectArt } from '../sync-home-card-art.mjs';

/**
 * トップ（home/index.html）のカードの絵とタイルの色のテスト。
 *
 * 仕様: docs/features/card-illustrations.md
 *
 * home/ にはビルド工程が無いので、絵は scripts/sync-home-card-art.mjs が
 * tools / games の一覧ページから写している。見張っているのは
 * 「写し忘れたカード」（古い線画のまま・地色なし）と「分類と色のずれ」。
 */

const repoRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');

const INDEX_HTML = read('home/index.html');

/** tools/app/ToolArt.tsx の CATEGORY_TOKEN と同じ対応（ずれたら下のテストが落ちる） */
const CATEGORY_TOKEN = {
  'お金・社会保険': 'money',
  '生活・健康': 'life',
  '計算・変換': 'calc',
  '決める・選ぶ': 'pick',
};

/** トップの /tools/・/games/ 行きのカード（公開前の差し込みカードは含まない） */
function homeCards(html) {
  const re =
    /<a class="card"(?: style="([^"]*)")? href="\/(tools|games)\/([a-z0-9-]+)\/">\s*<span class="card-icon">([\s\S]*?)<\/span>/g;
  return [...html.matchAll(re)].map(([, style, site, slug, icon]) => ({ style, site, slug, icon }));
}

describe('トップのカードの絵', () => {
  const cards = homeCards(INDEX_HTML);

  it('ツールとゲームのカードを拾えている（正規表現が空振りしていない）', () => {
    assert.ok(cards.filter((c) => c.site === 'tools').length >= 20, 'ツールのカードが少なすぎる');
    assert.ok(cards.filter((c) => c.site === 'games').length >= 10, 'ゲームのカードが少なすぎる');
  });

  it('どのカードも 64×64 の新しい絵とタイルの2色を持つ（sync-home-card-art.mjs の写し忘れ）', () => {
    const stale = cards
      .filter((c) => !c.style?.includes('--tile-ink:') || !c.style.includes('--tile-bg:') || !c.icon.includes('viewBox="0 0 64 64"'))
      .map((c) => `${c.site}/${c.slug}`);
    assert.deepEqual(stale, [], `node scripts/sync-home-card-art.mjs を回していないカード: ${stale.join(', ')}`);
  });

  it('ツールのタイルの色は registry の分類と合っている', () => {
    const categoryOf = new Map(
      loadRegistries()
        .filter((e) => e.kind === 'tools')
        .map((e) => [e.slug, e.category]),
    );
    for (const c of cards.filter((x) => x.site === 'tools')) {
      const token = CATEGORY_TOKEN[categoryOf.get(c.slug)];
      assert.ok(token, `${c.slug} の分類が registry に無い`);
      assert.equal(c.style, `--tile-ink:var(--cat-${token});--tile-bg:var(--cat-${token}-bg)`, c.slug);
    }
  });

  it('ゲームのタイルは1色（遊ぶ）', () => {
    for (const c of cards.filter((x) => x.site === 'games')) assert.equal(c.style, GAME_TILE_STYLE, c.slug);
  });

  it('分類の色は tools/app/ToolArt.tsx の対応と同じ', () => {
    const src = read('tools/app/ToolArt.tsx');
    for (const [category, token] of Object.entries(CATEGORY_TOKEN)) {
      assert.ok(src.includes(`'${category}': '${token}'`), `ToolArt.tsx の ${category} → ${token} が見つからない`);
    }
  });

  it('タイルの色は明るいテーマと暗いテーマの両方で定義がある', () => {
    const dark = INDEX_HTML.slice(INDEX_HTML.indexOf('@media (prefers-color-scheme: dark)'));
    for (const token of [...Object.values(CATEGORY_TOKEN), 'play']) {
      for (const name of [`--cat-${token}:`, `--cat-${token}-bg:`]) {
        assert.ok(INDEX_HTML.split(name).length - 1 >= 2, `${name} が明暗の2か所に無い`);
        assert.ok(dark.includes(name), `${name} が暗いテーマに無い`);
      }
    }
  });
});

describe('sync-home-card-art.mjs', () => {
  const toolsHtml =
    '<a class="tool-card" style="--tile-ink:var(--cat-calc);--tile-bg:var(--cat-calc-bg)" href="/tools/qr-code/">' +
    '<div class="icon"><svg viewBox="0 0 64 64"><rect/></svg></div></a>';
  const gamesHtml = '<a class="game-card" href="/games/snake/"><div class="icon"><svg viewBox="0 0 64 64"><path/></svg></div></a>';
  const art = { tools: collectArt(toolsHtml, 'tools'), games: collectArt(gamesHtml, 'games') };

  it('一覧ページから slug ごとの絵と style を拾う', () => {
    assert.deepEqual(art.tools.get('qr-code'), {
      svg: '<svg viewBox="0 0 64 64"><rect/></svg>',
      style: '--tile-ink:var(--cat-calc);--tile-bg:var(--cat-calc-bg)',
    });
    assert.equal(art.games.get('snake').style, GAME_TILE_STYLE);
  });

  it('古い絵と、形を説明する古いコメントを置き換える。2回かけても同じ', () => {
    const home =
      '<a class="card" href="/games/snake/">\n  <!-- GameIcon.tsx の SnakeIcon と同じ形 -->\n' +
      '  <span class="card-icon"><svg viewBox="0 0 256 256"></svg></span>';
    const once = applyArt(home, art);
    assert.deepEqual(once.updated, ['games/snake']);
    assert.ok(!once.html.includes('SnakeIcon'));
    assert.ok(once.html.includes(`style="${GAME_TILE_STYLE}"`));
    assert.ok(once.html.includes('<svg viewBox="0 0 64 64"><path/></svg>'));
    assert.equal(applyArt(once.html, art).html, once.html);
  });

  it('一覧に無いカード（公開前・削除済み）は触らずに報告する', () => {
    const home = '<a class="card" href="/tools/nai/"><span class="card-icon"><svg></svg></span>';
    const r = applyArt(home, art);
    assert.deepEqual(r.missing, ['tools/nai']);
    assert.equal(r.html, home);
  });
});
