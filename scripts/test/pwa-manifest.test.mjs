import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 「ホーム画面に追加」用アイコンの実ファイルのテスト。
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * マニフェストの中身（start_url・scope・配色）は games の vitest
 * （`games/tests/manifest.test.ts`）が見ている。ここが見るのは
 * **design/ の生成スクリプトと、書き出されたPNGの実ファイル**で、
 * ogp.test.mjs と同じ「原典はスクリプト」の見張り方をしている。
 *
 * マニフェストが icons に挙げているのに実ファイルが無い、という壊れ方は
 * ビルドでもブラウザでもエラーにならず、ホーム画面に追加したときの
 * アイコンだけが白紙になるので、機械で見張る価値がある。
 */

import { ICONS, MASKABLE_SAFE_RATIO, SOURCE_SVG, parseIconSvg, renderHtml } from '../../design/icons/gen-app-icons.mjs';

const repoRoot = new URL('../../', import.meta.url);
const readBytes = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)));
const readText = (path) => readBytes(path).toString('utf8');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * PNGのヘッダ（IHDR）から幅と高さを読む。
 * 画像ライブラリを入れずに寸法を確かめるためだけの最小実装（ogp.test.mjs と同じ）。
 */
function pngSize(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), 'PNGの署名がない');
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', '先頭チャンクがIHDRではない');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const manifestSource = readText('games/app/manifest.ts');

describe('アイコンの実ファイル', () => {
  for (const { out, size } of ICONS) {
    it(`${out} が ${size}×${size} のPNGである`, () => {
      assert.deepEqual(pngSize(readBytes(out)), { width: size, height: size });
    });
  }

  it('4枚がそれぞれ違う絵である（コピーで済ませていない）', () => {
    // any と maskable が同じ絵だと、maskable を分けた意味（安全領域）が消える
    const digests = ICONS.map(({ out }) => readBytes(out).toString('base64'));
    assert.equal(new Set(digests).size, ICONS.length);
  });
});

describe('manifest.ts が挙げているアイコン', () => {
  /** `src: `${BASE}icon-192.png`` のようなテンプレート文字列からファイル名を拾う */
  const referenced = [...manifestSource.matchAll(/src: `\$\{BASE\}([\w.-]+)`/g)].map((m) => m[1]);

  it('参照しているファイルが design/icons の書き出し先と一致する', () => {
    // ここがずれると、ビルドは通るのにホーム画面のアイコンだけ白紙になる
    assert.deepEqual(
      referenced.sort(),
      ICONS.map(({ out }) => out.replace('games/public/', '')).sort(),
    );
  });

  it('参照しているファイルが games/public/ に実在する', () => {
    for (const name of referenced) {
      assert.doesNotThrow(() => readBytes(`games/public/${name}`), `games/public/${name} が無い`);
    }
  });
});

/**
 * 生成スクリプトのテスト。
 * Chromium を起こす main() は走らせず、原典SVGの読み取りとHTMLの組み立てだけを見る
 * （playwright はCIに入れていないので、描画そのものはここでは確かめられない）。
 */
describe('design/icons/gen-app-icons.mjs', () => {
  const icon = parseIconSvg(readText(SOURCE_SVG));

  it('原典は games/app/icon.svg（ファビコンと同じ絵）である', () => {
    assert.equal(SOURCE_SVG, 'games/app/icon.svg');
    assert.equal(icon.glyph, 'h');
    assert.match(icon.from, /^#[0-9a-f]{6}$/i);
    assert.match(icon.to, /^#[0-9a-f]{6}$/i);
    assert.notEqual(icon.from, icon.to, 'グラデーションの2色が同じになっている');
  });

  it('原典のSVGが変わったら気づける（読み取りに失敗したら投げる）', () => {
    assert.throws(() => parseIconSvg('<svg></svg>'), /形が変わっている/);
  });

  it('any は原典と同じ角丸で描く', () => {
    const html = renderHtml({ size: 512, purpose: 'any' }, icon);
    assert.match(html, /border-radius: 112px/); // 512 × 14/64
  });

  it('maskable は角丸を外し、字を安全領域（中央80%）まで縮める', () => {
    // Android のランチャーが円・しずくなど端末ごとの形に切り抜くため、
    // 角丸のまま渡すと角が二重に落ち、透明部分が黒く出る
    const html = renderHtml({ size: 512, purpose: 'maskable' }, icon);
    assert.match(html, /border-radius: 0px/);
    assert.equal(MASKABLE_SAFE_RATIO, 0.8);
    const fontSize = Number(html.match(/font-size: ([\d.]+)px/)[1]);
    assert.equal(fontSize, icon.fontRatio * 512 * MASKABLE_SAFE_RATIO);
  });

  it('192 と 512 の2サイズを any / maskable の両方で書き出す', () => {
    assert.deepEqual(
      ICONS.map(({ size, purpose }) => `${size}:${purpose}`).sort(),
      ['192:any', '192:maskable', '512:any', '512:maskable'].sort(),
    );
  });

  it('書き出し先が games/public/ 配下である', () => {
    // app/ 配下に置いてもNext.jsは配信しない（Next.jsのメタデータ規約の
    // ファイル名以外は無視される）。ogp.png と同じく public/ に置く
    for (const { out } of ICONS) {
      assert.ok(out.startsWith('games/public/'), out);
    }
  });
});

describe('Service Worker を入れていない', () => {
  it('games に Service Worker の登録も sw.js も無い', () => {
    // 仕様書の「やらないこと」。静的サイトで古いHTMLがキャッシュに残り続ける
    // 事故のリスクが利益を上回る。manifest だけでスタンドアロン起動は成立する
    assert.doesNotMatch(readText('games/app/layout.tsx'), /serviceWorker/);
    assert.doesNotMatch(manifestSource, /serviceWorker|sw\.js/);
  });
});
