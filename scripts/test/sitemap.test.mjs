import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { collectUrls, isSitemapIndex, parseEntries, parseLocs } from '../lib/sitemap.mjs';

const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://hasokon.com/sitemap-home.xml</loc></sitemap>
  <sitemap><loc>https://hasokon.com/tools/sitemap.xml</loc></sitemap>
  <sitemap><loc>https://hasokon.com/games/sitemap.xml</loc></sitemap>
</sitemapindex>`;

const urlset = (...locs) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((loc) => `  <url><loc>${loc}</loc><lastmod>2026-08-08</lastmod></url>`).join('\n')}
</urlset>`;

function fakeFetcher(pages) {
  const calls = [];
  const fetchText = async (url) => {
    calls.push(url);
    if (!(url in pages)) throw new Error(`HTTP 404`);
    return pages[url];
  };
  return { fetchText, calls };
}

describe('parseLocs', () => {
  it('<loc> の中身を出現順に返す', () => {
    assert.deepEqual(parseLocs(urlset('https://hasokon.com/', 'https://hasokon.com/privacy.html')), [
      'https://hasokon.com/',
      'https://hasokon.com/privacy.html',
    ]);
  });

  it('改行やインデントが入っていても取れる', () => {
    assert.deepEqual(parseLocs('<url><loc>\n  https://hasokon.com/tools/\n</loc></url>'), [
      'https://hasokon.com/tools/',
    ]);
  });

  it('CDATA を外す', () => {
    assert.deepEqual(parseLocs('<loc><![CDATA[https://hasokon.com/games/]]></loc>'), [
      'https://hasokon.com/games/',
    ]);
  });

  it('XMLの実体参照を戻す', () => {
    assert.deepEqual(parseLocs('<loc>https://hasokon.com/?a=1&amp;b=2</loc>'), [
      'https://hasokon.com/?a=1&b=2',
    ]);
  });

  it('空の <loc> は落とす', () => {
    assert.deepEqual(parseLocs('<loc></loc><loc>https://hasokon.com/</loc><loc>  </loc>'), [
      'https://hasokon.com/',
    ]);
  });

  it('<loc> が無ければ空になる', () => {
    assert.deepEqual(parseLocs('<urlset></urlset>'), []);
  });
});

describe('parseEntries', () => {
  it('<url> ごとに loc と lastmod を返す', () => {
    assert.deepEqual(parseEntries(urlset('https://hasokon.com/', 'https://hasokon.com/tools/')), [
      { loc: 'https://hasokon.com/', lastmod: '2026-08-08' },
      { loc: 'https://hasokon.com/tools/', lastmod: '2026-08-08' },
    ]);
  });

  it('<lastmod> が無ければ null', () => {
    assert.deepEqual(parseEntries('<urlset><url><loc>https://hasokon.com/</loc></url></urlset>'), [
      { loc: 'https://hasokon.com/', lastmod: null },
    ]);
  });

  it('<lastmod> が空でも null', () => {
    assert.deepEqual(
      parseEntries('<urlset><url><loc>https://hasokon.com/</loc><lastmod> </lastmod></url></urlset>'),
      [{ loc: 'https://hasokon.com/', lastmod: null }],
    );
  });

  it('他の要素が挟まっていても、その <url> の lastmod を拾う', () => {
    const xml = `<urlset>
      <url>
        <loc>https://hasokon.com/</loc>
        <lastmod>2026-09-16</lastmod>
        <changefreq>monthly</changefreq>
        <priority>1.0</priority>
      </url>
      <url>
        <loc>https://hasokon.com/privacy.html</loc>
        <lastmod>2026-08-16</lastmod>
        <changefreq>yearly</changefreq>
      </url>
    </urlset>`;
    assert.deepEqual(parseEntries(xml), [
      { loc: 'https://hasokon.com/', lastmod: '2026-09-16' },
      { loc: 'https://hasokon.com/privacy.html', lastmod: '2026-08-16' },
    ]);
  });

  it('<url> で囲まれていない断片は loc だけ拾う', () => {
    assert.deepEqual(parseEntries('<loc>https://hasokon.com/</loc>'), [
      { loc: 'https://hasokon.com/', lastmod: null },
    ]);
  });

  it('<urlset> の属性を <url> と読み違えない', () => {
    const xml =
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://hasokon.com/</loc></url></urlset>';
    assert.deepEqual(parseEntries(xml), [{ loc: 'https://hasokon.com/', lastmod: null }]);
  });

  it('<url> が無ければ空になる', () => {
    assert.deepEqual(parseEntries('<urlset></urlset>'), []);
  });

  it('実物の sitemap-home.xml を読める', () => {
    const xml = readFileSync(new URL('../../home/sitemap-home.xml', import.meta.url), 'utf8');
    const entries = parseEntries(xml);
    assert.ok(entries.length >= 2);
    for (const entry of entries) {
      assert.match(entry.loc, /^https:\/\/hasokon\.com\//);
      assert.match(entry.lastmod, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('isSitemapIndex', () => {
  it('sitemapindex を見分ける', () => {
    assert.equal(isSitemapIndex(INDEX_XML), true);
  });

  it('urlset は index ではない', () => {
    assert.equal(isSitemapIndex(urlset('https://hasokon.com/')), false);
  });
});

describe('collectUrls', () => {
  it('sitemapindex をたどって全URLを集める', async () => {
    const { fetchText } = fakeFetcher({
      'https://hasokon.com/sitemap.xml': INDEX_XML,
      'https://hasokon.com/sitemap-home.xml': urlset('https://hasokon.com/', 'https://hasokon.com/privacy.html'),
      'https://hasokon.com/tools/sitemap.xml': urlset('https://hasokon.com/tools/', 'https://hasokon.com/tools/nenshu-kabe/'),
      'https://hasokon.com/games/sitemap.xml': urlset('https://hasokon.com/games/minesweeper/'),
    });

    const result = await collectUrls('https://hasokon.com/sitemap.xml', fetchText);

    assert.deepEqual(result.urls, [
      'https://hasokon.com/',
      'https://hasokon.com/privacy.html',
      'https://hasokon.com/tools/',
      'https://hasokon.com/tools/nenshu-kabe/',
      'https://hasokon.com/games/minesweeper/',
    ]);
    assert.equal(result.sitemaps.length, 4);
    assert.deepEqual(result.errors, []);
  });

  it('entries には lastmod も付いてくる（urls と同じ順・同じ件数）', async () => {
    const { fetchText } = fakeFetcher({
      'https://hasokon.com/sitemap.xml': INDEX_XML,
      'https://hasokon.com/sitemap-home.xml': urlset('https://hasokon.com/'),
      'https://hasokon.com/tools/sitemap.xml': urlset('https://hasokon.com/tools/'),
      'https://hasokon.com/games/sitemap.xml': urlset('https://hasokon.com/games/'),
    });

    const result = await collectUrls('https://hasokon.com/sitemap.xml', fetchText);

    assert.deepEqual(
      result.entries.map((entry) => entry.loc),
      result.urls,
    );
    assert.deepEqual(new Set(result.entries.map((entry) => entry.lastmod)), new Set(['2026-08-08']));
  });

  it('urlset を直接渡してもよい', async () => {
    const { fetchText } = fakeFetcher({
      'https://hasokon.com/sitemap-home.xml': urlset('https://hasokon.com/'),
    });

    const result = await collectUrls('https://hasokon.com/sitemap-home.xml', fetchText);
    assert.deepEqual(result.urls, ['https://hasokon.com/']);
  });

  it('重複するURLは1件にまとめる', async () => {
    const { fetchText } = fakeFetcher({
      'https://hasokon.com/sitemap.xml': INDEX_XML,
      'https://hasokon.com/sitemap-home.xml': urlset('https://hasokon.com/'),
      'https://hasokon.com/tools/sitemap.xml': urlset('https://hasokon.com/'),
      'https://hasokon.com/games/sitemap.xml': urlset('https://hasokon.com/'),
    });

    const result = await collectUrls('https://hasokon.com/sitemap.xml', fetchText);
    assert.deepEqual(result.urls, ['https://hasokon.com/']);
  });

  it('読めないサイトマップがあっても、残りは集める', async () => {
    const { fetchText } = fakeFetcher({
      'https://hasokon.com/sitemap.xml': INDEX_XML,
      'https://hasokon.com/sitemap-home.xml': urlset('https://hasokon.com/'),
      'https://hasokon.com/tools/sitemap.xml': urlset('https://hasokon.com/tools/'),
      // games/sitemap.xml は用意しない
    });

    const result = await collectUrls('https://hasokon.com/sitemap.xml', fetchText);

    assert.deepEqual(result.urls, ['https://hasokon.com/', 'https://hasokon.com/tools/']);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].sitemap, 'https://hasokon.com/games/sitemap.xml');
  });

  it('同じサイトマップを2回読みに行かない', async () => {
    const selfReferencing = `<sitemapindex>
      <sitemap><loc>https://hasokon.com/sitemap.xml</loc></sitemap>
      <sitemap><loc>https://hasokon.com/sitemap-home.xml</loc></sitemap>
    </sitemapindex>`;
    const { fetchText, calls } = fakeFetcher({
      'https://hasokon.com/sitemap.xml': selfReferencing,
      'https://hasokon.com/sitemap-home.xml': urlset('https://hasokon.com/'),
    });

    const result = await collectUrls('https://hasokon.com/sitemap.xml', fetchText);

    assert.deepEqual(result.urls, ['https://hasokon.com/']);
    assert.equal(calls.filter((url) => url === 'https://hasokon.com/sitemap.xml').length, 1);
  });

  it('入れ子が深すぎるときは打ち切ってエラーに残す', async () => {
    const nested = (next) => `<sitemapindex><sitemap><loc>${next}</loc></sitemap></sitemapindex>`;
    const { fetchText } = fakeFetcher({
      'https://hasokon.com/a.xml': nested('https://hasokon.com/b.xml'),
      'https://hasokon.com/b.xml': nested('https://hasokon.com/c.xml'),
      'https://hasokon.com/c.xml': nested('https://hasokon.com/d.xml'),
      'https://hasokon.com/d.xml': urlset('https://hasokon.com/'),
    });

    const result = await collectUrls('https://hasokon.com/a.xml', fetchText, { maxDepth: 2 });

    assert.deepEqual(result.urls, []);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /入れ子/);
  });
});
