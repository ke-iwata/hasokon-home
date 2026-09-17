import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 運営者情報（`home/about.html`）のテスト。
 *
 * 仕様: docs/features/google-index-recovery.md（提案 C）
 *
 * 運営者情報は `/tools/about/` と `/games/about/` の2枚に分かれていて、
 * どちらも Google に登録されていなかった。ルート直下の1枚にまとめ、
 * 既存2枚は `noindex` にしてある。
 *
 * ここで見張るのは、**`noindex` にしたページへの導線が残ること**。
 * home/ はビルド工程もリンクチェックも無いので、`/tools/about/` への
 * リンクが1本でも戻ってくると、検索結果に出ないページへ案内し続けることになる。
 */

const repoRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');

const ABOUT_HTML = read('home/about.html');
const INDEX_HTML = read('home/index.html');
const PRIVACY_HTML = read('home/privacy.html');
const NOT_FOUND_HTML = read('home/404.html');
const LLMS_TXT = read('home/llms.txt');
const SITEMAP_HOME = read('home/sitemap-home.xml');

/** home/ にある、公開しているHTML（ここに置いたものは全部リンクを検査する） */
const HOME_PAGES = {
  'home/index.html': INDEX_HTML,
  'home/about.html': ABOUT_HTML,
  'home/privacy.html': PRIVACY_HTML,
  'home/404.html': NOT_FOUND_HTML,
};

describe('運営者情報（home/about.html）', () => {
  it('canonical が絶対URLで自己参照になっている', () => {
    assert.match(
      ABOUT_HTML,
      /<link rel="canonical" href="https:\/\/hasokon\.com\/about\.html" \/>/,
      'canonical が無いか、表記が sitemap とずれている',
    );
  });

  it('title と description がある', () => {
    assert.match(ABOUT_HTML, /<title>[^<]*運営者情報[^<]*<\/title>/);
    const description = /<meta\s+name="description"\s+content="([^"]+)"/s.exec(
      ABOUT_HTML.replace(/\n\s*/g, ' '),
    );
    assert.ok(description, 'meta description が無い');
    assert.ok(description[1].length > 30, 'meta description が短すぎる');
  });

  it('noindex になっていない（登録されることが目的のページ）', () => {
    // 既存2枚を noindex にした代わりに載せるページなので、ここが noindex では意味がない
    assert.doesNotMatch(ABOUT_HTML, /<meta\s+name="robots"/i);
  });

  it('privacy.html と同じ骨組み（トークン・レイアウト）になっている', () => {
    // home はビルド工程が無く CSS を共有していないので、骨組みは手で揃えるしかない。
    // 崩れやすいところ（トークンの値と本文幅）だけ機械で見張る
    for (const token of ['--bg: #faf9f7', '--brand: #15803d', '--text: #1c1917']) {
      assert.ok(ABOUT_HTML.includes(token), `デザイントークンが privacy.html とずれている: ${token}`);
    }
    assert.ok(ABOUT_HTML.includes('max-width: 44rem'), '本文幅が privacy.html とずれている');
    assert.match(ABOUT_HTML, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
  });

  it('お問い合わせ・プライバシーポリシーへ辿れる', () => {
    assert.ok(ABOUT_HTML.includes('href="/privacy.html"'));
    assert.ok(ABOUT_HTML.includes('href="/tools/contact/"'));
  });

  it('tools / games / learn のそれぞれに辿れる', () => {
    // サイト全体の運営者情報なので、3つのセクションすべてを扱っていることの最低限の確認
    for (const path of ['/tools/', '/games/', '/learn/']) {
      assert.ok(ABOUT_HTML.includes(`href="${path}"`), `${path} への導線が無い`);
    }
  });

  it('sitemap-home.xml に載っている', () => {
    assert.ok(
      SITEMAP_HOME.includes('<loc>https://hasokon.com/about.html</loc>'),
      'sitemap-home.xml に /about.html が無い（載せないと登録されない）',
    );
  });
});

describe('noindex にした運営者情報への導線', () => {
  it('home/ のどのページからも /tools/about/・/games/about/ へリンクしていない', () => {
    for (const [name, html] of Object.entries(HOME_PAGES)) {
      for (const dead of ['/tools/about/', '/games/about/']) {
        assert.ok(
          !html.includes(`href="${dead}"`),
          `${name} が noindex のページへ案内している: ${dead}（/about.html に付け替えること）`,
        );
      }
    }
  });

  it('llms.txt の運営者情報は /about.html の1行だけ', () => {
    assert.ok(
      LLMS_TXT.includes('](https://hasokon.com/about.html):'),
      'llms.txt に /about.html の行が無い',
    );
    for (const dead of ['https://hasokon.com/tools/about/', 'https://hasokon.com/games/about/']) {
      assert.ok(!LLMS_TXT.includes(dead), `llms.txt が noindex のページを案内している: ${dead}`);
    }
  });

  it('index.html と privacy.html の運営者情報が /about.html を指している', () => {
    // 「footer の付け替え（home）」は index.html だけでなく privacy.html も含む
    for (const [name, html] of [
      ['home/index.html', INDEX_HTML],
      ['home/privacy.html', PRIVACY_HTML],
    ]) {
      assert.ok(html.includes('href="/about.html"'), `${name} に /about.html への導線が無い`);
    }
  });
});
