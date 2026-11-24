import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { genreItemLists } from '@/lib/jsonld';
import { games, GENRES, publicGames, publicGamesByGenre, SITE_URL } from '@/lib/registry';

/**
 * ゲーム一覧（/games/）のジャンル分けのテスト。
 *
 * 仕様: docs/features/games-ichiran-genre.md
 *
 * 見張るのは「ジャンル分けで落ちたゲームが無い」「公開前のものが混ざらない」
 * 「目次のリンク先とセクションの id がずれない」「JSON-LD が registry と同じ数を持つ」の4つ。
 * スマホ2列の CSS がほかのページの .game-grid に漏れないことも見る。
 */

const root = fileURLToPath(new URL('../', import.meta.url));
const pageSrc = readFileSync(`${root}app/page.tsx`, 'utf8');
const css = readFileSync(`${root}app/globals.css`, 'utf8');

/** 仕様書の A の表（公開中 28 本の割り当て。「この割り当てで確定」） */
const SPEC_PUBLIC: Record<string, string[]> = {
  trump: [
    'solitaire', 'spider', 'freecell', 'pyramid-solitaire', 'tripeaks', 'golf-solitaire',
    'daifugo', 'shichinarabe', 'shinkei-suijaku', 'speed', 'doubt', 'hanafuda-koikoi',
  ],
  board: ['reversi', 'gomoku', 'yacht'],
  puzzle: [
    'nanpre', 'nonogram', 'suji-hitofude', 'shikaku-wake', 'hashi-kake', 'minesweeper',
    '2048', 'hit-blow', 'color-sort', 'block-puzzle', 'mahjong-solitaire',
  ],
  action: ['breakout', 'snake'],
};

describe('GENRES（見出しの定義）', () => {
  it('4つで、id は ASCII の固定値・この順', () => {
    expect(GENRES.map((g) => g.key)).toEqual(['trump', 'board', 'puzzle', 'action']);
    expect(GENRES.map((g) => g.label)).toEqual([
      'トランプ・花札',
      'ボード・テーブル',
      'パズル・脳トレ',
      'アクション・腕だめし',
    ]);
  });

  it('registry の全ゲーム（wip / preview も）が4つのジャンルのどれかを持つ', () => {
    const keys = new Set<string>(GENRES.map((g) => g.key));
    for (const g of games) {
      expect(keys.has(g.genre), `${g.slug} の genre: ${g.genre}`).toBe(true);
    }
  });

  it('麻雀ソリティアはパズル（仕様書のレビュー指摘）', () => {
    expect(games.find((g) => g.slug === 'mahjong-solitaire')?.genre).toBe('puzzle');
  });
});

describe('publicGamesByGenre（一覧に出すもの）', () => {
  const sections = publicGamesByGenre();
  const listed = sections.flatMap((s) => s.games);

  it('一覧に出るゲームの数＝publicGames.length（ジャンル分けで落ちたものが無い・重複も無い）', () => {
    expect(listed.length).toBe(publicGames.length);
    expect(new Set(listed.map((g) => g.slug)).size).toBe(publicGames.length);
  });

  it('wip / preview は出ない', () => {
    for (const g of listed) expect(g.stage, g.slug).toBe('public');
  });

  it('ジャンル内の並びは registry の並び順のまま', () => {
    for (const s of sections) {
      const order = s.games.map((g) => publicGames.indexOf(g));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('空のジャンルは出さない', () => {
    for (const s of sections) expect(s.games.length).toBeGreaterThan(0);
  });

  it('公開中のゲームの割り当ては仕様書の表どおり（ここにある公開中のものだけ確かめる）', () => {
    for (const g of publicGames) {
      const expected = Object.entries(SPEC_PUBLIC).find(([, slugs]) => slugs.includes(g.slug))?.[0];
      // 仕様書の起票後に公開したゲームは表に無い。それは genre を持っていれば足りる
      if (expected) expect(g.genre, g.slug).toBe(expected);
    }
  });
});

describe('一覧ページ（app/page.tsx）', () => {
  it('publicGamesByGenre を通していて、games を直に使わない', () => {
    expect(pageSrc).toMatch(/publicGamesByGenre\(\)/);
    expect(pageSrc).not.toMatch(/\bgames\.filter\(/);
    expect(pageSrc).not.toMatch(/import\s*\{[^}]*\bgames\b[^}]*\}\s*from '@\/lib\/registry'/);
  });

  it('目次の href とセクションの id は同じ key から作る（ずれない）', () => {
    expect(pageSrc).toMatch(/<nav className="genre-nav" aria-label="ジャンル">/);
    expect(pageSrc).toMatch(/href=\{`#\$\{section\.key\}`\}/);
    expect(pageSrc).toMatch(/<section key=\{section\.key\} id=\{section\.key\}/);
  });

  it('カードのマークアップ（a.game-card > div.icon > svg）を保つ（ホームの絵の同期が拾う並び）', () => {
    expect(pageSrc).toMatch(
      /<Link key=\{g\.slug\} className="game-card"[^>]*>\s*<div className="icon"[^>]*>\s*<GamePreview slug=\{g\.slug\} \/>/,
    );
  });

  it('列の指定はインライン style に置かない（@media で上書きできなくなる）', () => {
    expect(pageSrc).not.toMatch(/gridTemplateColumns/);
    expect(pageSrc).not.toMatch(/WebkitLineClamp/);
  });

  it('.quicknav は使わない', () => {
    expect(pageSrc).not.toMatch(/quicknav/);
  });
});

describe('ビルド結果（out/index.html があるときだけ）', () => {
  const outFile = `${root}out/index.html`;
  const built = existsSync(outFile);

  it.skipIf(!built)('目次のリンク先がすべてページ内にあり、公開中のゲームだけがカードになる', () => {
    const html = readFileSync(outFile, 'utf8');
    const hrefs = [...html.matchAll(/<nav class="genre-nav"[\s\S]*?<\/nav>/g)][0]?.[0]
      .match(/href="#([a-z]+)"/g)
      ?.map((h) => h.slice(7, -1));
    expect(hrefs).toEqual(publicGamesByGenre().map((s) => s.key));
    for (const id of hrefs ?? []) expect(html).toContain(`<section id="${id}"`);
    const cards = [...html.matchAll(/<a[^>]*class="game-card"[^>]*href="\/games\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
    expect(cards.sort()).toEqual(publicGames.map((g) => g.slug).sort());
  });
});

describe('構造化データ（ItemList）', () => {
  const lists = genreItemLists();

  it('ジャンルごとに1つ。URL の合計＝publicGames.length', () => {
    expect(lists.map((l) => l['@id'])).toEqual(publicGamesByGenre().map((s) => `${SITE_URL}/#${s.key}`));
    const urls = lists.flatMap((l) => l.itemListElement.map((e) => e.url));
    expect(urls.length).toBe(publicGames.length);
    expect(new Set(urls)).toEqual(new Set(publicGames.map((g) => `${SITE_URL}/${g.slug}/`)));
  });

  it('名前は registry から・position は1始まりの連番・numberOfItems が件数と合う', () => {
    for (const l of lists) {
      expect(l.numberOfItems).toBe(l.itemListElement.length);
      l.itemListElement.forEach((e, i) => {
        expect(e.position).toBe(i + 1);
        expect(e.name).toBe(publicGames.find((g) => e.url.endsWith(`/${g.slug}/`))?.name);
      });
    }
  });

  it('一覧ページの @graph に入っている', () => {
    expect(pageSrc).toMatch(/\.\.\.genreItemLists\(\)/);
  });
});

describe('スマホ2列の CSS（globals.css）', () => {
  // 一覧のブロック（見出しのコメントから末尾まで）だけを取り出す
  const start = css.indexOf('/* ---- ゲーム一覧（/games/）のジャンル見出し・目次・列 ----');
  const block = css.slice(start);

  it('ブロックがファイルにあり、末尾に置かれている（途中だと後ろの規則に負ける）', () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toMatch(/@media \(max-width: 479px\)/);
  });

  it('セレクタは .genre-nav / .genre-section の配下だけ（.tp-guide などほかのページに効かせない）', () => {
    const selectors = [
      ...block
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@media[^{]*\{/g, '')
        .matchAll(/([^{}]+)\{/g),
    ]
      .map((m) => m[1].trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(5);
    for (const s of selectors) {
      for (const part of s.split(',')) expect(part.trim(), part).toMatch(/^\.genre-(nav|section)\b/);
    }
  });

  it('!important を使わない', () => {
    expect(block).not.toMatch(/!important/);
  });
});
