import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * OGP画像（SNS共有時のサムネイル）のテスト。
 *
 * 仕様: docs/features/ogp-image.md
 *
 * ここが見るのは**実ファイル**と、ビルド工程を持たない home/ の素のHTML。
 * tools / games のメタデータ側は各ディレクトリの vitest（tests/ogp.test.ts）が見ている。
 *
 * 見張っているのは3つ。
 *
 * 1. **PNGが3枚とも存在し、1200×630 であること**。X の summary_large_image は
 *    この比率（1.91:1）を前提にしていて、ずれると切れて表示される
 * 2. **home の og:image が絶対URLで、実ファイルを指していること**。
 *    OGPの仕様上、相対パスは多くのクローラーが解決できない
 * 3. **twitter:card があること**。og:image があっても twitter:card が無いと
 *    X ではカードそのものが生成されず、テキストリンクのままになる
 */

import { HEIGHT as GEN_HEIGHT, VARIANTS, WIDTH as GEN_WIDTH, renderHtml } from '../../design/ogp/gen-ogp.mjs';

const repoRoot = new URL('../../', import.meta.url);
const readBytes = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)));
const readText = (path) => readBytes(path).toString('utf8');

/** OGPの標準サイズ。design/ogp/gen-ogp.mjs もこの値で書き出している */
const WIDTH = 1200;
const HEIGHT = 630;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * PNGのヘッダ（IHDR）から幅と高さを読む。
 * IHDRは必ず先頭チャンクなので、署名8バイト + 長さ4 + 型4 の直後に
 * 幅・高さがビッグエンディアンの4バイトずつ並ぶ。
 * 画像ライブラリを入れずに寸法を確かめるためだけの最小実装。
 */
function pngSize(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), 'PNGの署名がない');
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', '先頭チャンクがIHDRではない');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * 配信先ごとの1枚。パスと公開URLの対応は
 * `design/ogp/gen-ogp.mjs` の VARIANTS と揃えること。
 * tools / games は basePath 配下に置かれるので public/ の下になる。
 */
const IMAGES = [
  { file: 'home/ogp.png', url: 'https://hasokon.com/ogp.png' },
  { file: 'tools/public/ogp.png', url: 'https://hasokon.com/tools/ogp.png' },
  { file: 'games/public/ogp.png', url: 'https://hasokon.com/games/ogp.png' },
];

describe('OGP画像の実ファイル', () => {
  for (const { file } of IMAGES) {
    it(`${file} が 1200×630 のPNGである`, () => {
      assert.deepEqual(pngSize(readBytes(file)), { width: WIDTH, height: HEIGHT });
    });
  }

  it('3枚がそれぞれ違う絵である（同じファイルを使い回していない）', () => {
    // tools と games は地の色を反転させて見分けられるようにしている。
    // コピーで済ませるとその区別が消えるので、中身が違うことを確かめる
    const digests = IMAGES.map(({ file }) => readBytes(file).toString('base64'));
    assert.equal(new Set(digests).size, IMAGES.length);
  });
});

describe('tools / games のOGP画像の参照先', () => {
  for (const { file, url } of IMAGES.slice(1)) {
    const registry = file.startsWith('tools/') ? 'tools/lib/registry.ts' : 'games/lib/registry.ts';

    it(`${registry} の OGP_IMAGE が ${url} になる`, () => {
      // registry は `${SITE_URL}/ogp.png` というテンプレート文字列で持っている。
      // 値の組み立てそのものは各ディレクトリの vitest が見ているので、
      // ここでは「実ファイルの置き場所と食い違っていないか」だけを見る
      const source = readText(registry);
      const siteUrl = source.match(/export const SITE_URL = '([^']+)'/)?.[1];
      assert.ok(siteUrl, `${registry} から SITE_URL を読めない`);
      assert.match(source, /OGP_IMAGE = \{\s*url: `\$\{SITE_URL\}\/ogp\.png`/);
      assert.equal(`${siteUrl}/ogp.png`, url);
    });
  }
});

describe('home（素の静的HTML）のOGPタグ', () => {
  const homeImage = IMAGES[0];

  for (const page of ['home/index.html', 'home/404.html']) {
    describe(page, () => {
      const html = readText(page);
      const meta = (attr, name) =>
        html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];

      it('og:image が実ファイルを指す絶対URLである', () => {
        const image = meta('property', 'og:image');
        assert.equal(image, homeImage.url);
        assert.ok(image.startsWith('https://'), '相対パスを解決できないクローラーが多い');
      });

      it('og:image:width / height が実ファイルの寸法と一致する', () => {
        assert.equal(meta('property', 'og:image:width'), String(WIDTH));
        assert.equal(meta('property', 'og:image:height'), String(HEIGHT));
      });

      it('twitter:card が summary_large_image である', () => {
        // ここが無いと X ではカードそのものが生成されない
        assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
      });

      it('og:image:alt がある', () => {
        assert.ok(meta('property', 'og:image:alt'));
      });
    });
  }

  it('404.html は og:url を持たない（どのURLでも表示されるページなので）', () => {
    const html = readText('home/404.html');
    assert.doesNotMatch(html, /property="og:url"/);
  });
});

/**
 * 生成スクリプトのテスト。
 * Chromium を起こす main() は走らせず、書き出し先の一覧とHTMLの組み立てだけを見る
 * （playwright はCIに入れていないので、描画そのものはここでは確かめられない）。
 */
describe('design/ogp/gen-ogp.mjs', () => {
  it('書き出し先がテストの対象ファイルと一致する', () => {
    assert.deepEqual(
      VARIANTS.map((v) => v.out),
      IMAGES.map((image) => image.file),
    );
  });

  it('出力サイズが 1200×630 で固定されている', () => {
    assert.equal(GEN_WIDTH, WIDTH);
    assert.equal(GEN_HEIGHT, HEIGHT);
  });

  it('3枚とも見出しと説明文が入る', () => {
    for (const variant of VARIANTS) {
      const html = renderHtml(variant);
      assert.ok(html.includes(variant.title), `${variant.name}: 見出しが無い`);
      assert.ok(html.includes(variant.subtitle), `${variant.name}: 説明文が無い`);
      assert.ok(html.includes('hasokon.com'), `${variant.name}: ドメイン表記が無い`);
    }
  });

  it('絵文字を使わない（端末ごとに絵柄が変わるため）', () => {
    // registry.ts のアイコン方針と同じ。仕様書の「デザイン」節の約束
    for (const variant of VARIANTS) {
      assert.doesNotMatch(renderHtml(variant), /\p{Extended_Pictographic}/u, variant.name);
    }
  });

  it('日本語フォントを端末フォントで解決する（Webフォントを読み込まない）', () => {
    // 日本語のWebフォントは数MBあり、生成のたびにネットワークに依存させたくない。
    // 豆腐（□）にならないことは、生成したPNGを目で見て確かめる
    for (const variant of VARIANTS) {
      const html = renderHtml(variant);
      assert.doesNotMatch(html, /@font-face|fonts\.googleapis\.com/, variant.name);
      assert.match(html, /"Hiragino Sans"/, variant.name);
    }
  });

  it('地の色でツールとゲームを見分けられる', () => {
    // 仕様書の「games/ は配色を変えて、ツールとゲームが見分けられるようにする」
    const themes = Object.fromEntries(VARIANTS.map((v) => [v.name, v.theme]));
    assert.equal(themes.tools, 'light');
    assert.equal(themes.games, 'dark');
    assert.notEqual(renderHtml({ ...VARIANTS[1] }), renderHtml({ ...VARIANTS[2] }));
  });
});
