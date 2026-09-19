// robots.txt の Sitemap: 行と、サイトマップ index の中身がずれていないか。
//
// 仕様: docs/features/sitemap-discovery-audit.md の「A」
// index 経由でしか辿れない子は、Google が index の処理を途中で止めると発見されない。
// robots.txt に子を直接書くのはそのための独立した発見経路なので、
// **子を増減したら両方直す**必要がある。それを忘れたらここで落ちる。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { parseLocs } from '../lib/sitemap.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const INDEX_URL = 'https://hasokon.com/sitemap.xml';

/** robots.txt の `Sitemap:` 行を出現順に返す。 */
function sitemapLines(robots) {
  return robots
    .split('\n')
    .map((line) => /^\s*Sitemap:\s*(\S+)\s*$/i.exec(line))
    .filter(Boolean)
    .map((match) => match[1]);
}

describe('home/robots.txt の Sitemap: 行', () => {
  const robots = read('home/robots.txt');
  const listed = sitemapLines(robots);

  it('index と、index が指す子サイトマップを過不足なく並べている', () => {
    const children = parseLocs(read('home/sitemap.xml'));
    assert.ok(children.length > 0, 'home/sitemap.xml から子サイトマップが取れていません');

    assert.deepEqual(
      new Set(listed),
      new Set([INDEX_URL, ...children]),
      'robots.txt と home/sitemap.xml の子サイトマップがずれています',
    );
  });

  it('index の行を消していない（index を正しく辿るクローラー向けに残す）', () => {
    assert.ok(listed.includes(INDEX_URL));
  });

  it('同じサイトマップを2回書いていない', () => {
    assert.equal(new Set(listed).size, listed.length);
  });

  it('すべて hasokon.com の絶対URL（相対パスは無効）', () => {
    for (const url of listed) {
      assert.match(url, /^https:\/\/hasokon\.com\//, `絶対URLではありません: ${url}`);
    }
  });

  it('クローラーを弾いていない（既存 indexnow のテストと同じ約束）', () => {
    assert.match(robots, /^\s*Allow:\s*\/\s*$/m);
    assert.doesNotMatch(robots, /^\s*Disallow:\s*\/\s*$/m);
  });
});
