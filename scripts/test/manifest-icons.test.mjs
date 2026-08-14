import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 「ホーム画面に追加」用アイコンのテスト。
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * ここが見るのは**実ファイル**と生成スクリプト。マニフェストの中身
 * （start_url・scope・display など）は games/tests/manifest.test.ts（vitest）が見ている。
 *
 * 見張っているのは3つ。
 *
 * 1. **PNGが4枚とも存在し、宣言どおりの寸法であること**。マニフェストの `sizes` と
 *    実ファイルがずれると、Android がインストール可能と判定しない
 * 2. **`games/app/manifest.ts` が参照するファイルが実在すること**。
 *    アイコンが404だとインストール導線そのものが出ない
 * 3. **生成スクリプトの絵が `games/app/icon.svg` と揃っていること**。
 *    ずれるとタブのファビコンとホーム画面のアイコンが別の絵になる
 */

import {
  ART,
  ICONS,
  SAFE_ZONE,
  iconUrl,
  renderSvg,
} from '../../design/manifest-icons/gen-manifest-icons.mjs';

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

describe('アイコンの実ファイル', () => {
  for (const icon of ICONS) {
    it(`${icon.out} が ${icon.size}×${icon.size} のPNGである`, () => {
      assert.deepEqual(pngSize(readBytes(icon.out)), { width: icon.size, height: icon.size });
    });
  }

  it('4枚がそれぞれ違う絵である（コピーで済ませていない）', () => {
    // any と maskable が同じ絵だと、切り抜きに耐える余白を持たせた意味が消える
    const contents = ICONS.map((icon) => readBytes(icon.out).toString('base64'));
    assert.equal(new Set(contents).size, ICONS.length);
  });

  it('192 と 512 が any / maskable の2種類ずつある', () => {
    for (const purpose of ['any', 'maskable']) {
      const sizes = ICONS.filter((icon) => icon.purpose === purpose)
        .map((icon) => icon.size)
        .sort((a, b) => a - b);
      assert.deepEqual(sizes, [192, 512], purpose);
    }
  });
});

describe('games/app/manifest.ts との突き合わせ', () => {
  const source = readText('games/app/manifest.ts');

  for (const icon of ICONS) {
    it(`${iconUrl(icon.out)} を参照している`, () => {
      // 参照先が実ファイルとずれるとアイコンが404になり、
      // ブラウザの「アプリをインストール」導線が出なくなる
      assert.ok(
        source.includes(`src: '${iconUrl(icon.out)}'`),
        `manifest.ts に ${iconUrl(icon.out)} の参照が無い`,
      );
    });
  }

  it('公開URLに basePath（/games）が付いている', () => {
    // Next.js はマニフェストの中身に basePath を足さない
    for (const icon of ICONS) {
      assert.match(iconUrl(icon.out), /^\/games\/icons\//, icon.out);
    }
  });

  it('start_url にホーム画面起動の印が付いている', () => {
    // 仕様書「計測」: 導入効果はこのセッション数で測る
    assert.match(source, /utm_source=homescreen/);
  });
});

/**
 * 生成スクリプトのテスト。
 * Chromium を起こす main() は走らせず、絵の定義とSVGの組み立てだけを見る
 * （playwright はCIに入れていないので、描画そのものはここでは確かめられない）。
 */
describe('design/manifest-icons/gen-manifest-icons.mjs', () => {
  const iconSvg = readText('games/app/icon.svg');

  it('絵の定義が games/app/icon.svg と揃っている', () => {
    // 原典は icon.svg。ここがずれると、タブのファビコンとホーム画面の
    // アイコンが別の絵になる
    assert.match(iconSvg, new RegExp(`viewBox="0 0 ${ART.viewBox} ${ART.viewBox}"`), 'viewBox');
    assert.ok(iconSvg.includes(`stop-color="${ART.from}"`), 'グラデーションの始点');
    assert.ok(iconSvg.includes(`stop-color="${ART.to}"`), 'グラデーションの終点');
    assert.ok(iconSvg.includes(`rx="${ART.corner}"`), '角丸');
    assert.ok(iconSvg.includes(`font-size="${ART.glyphSize}"`), '文字の大きさ');
    assert.ok(iconSvg.includes(`>${ART.glyph}</text>`), '文字');
  });

  it('any は icon.svg と同じ角丸・同じ文字の大きさで描く', () => {
    const svg = renderSvg({ size: 512, purpose: 'any' });
    assert.match(svg, new RegExp(`rx="${ART.corner}"`));
    assert.match(svg, new RegExp(`font-size="${ART.glyphSize}"`));
  });

  it('maskable は縁まで塗り、文字をセーフゾーンに収める', () => {
    // Android は端末ごとに違う形で切り抜く。角丸を残すと切り口に地の欠けが出るし、
    // 文字が大きいままだと切り抜きの外に出る
    const svg = renderSvg({ size: 512, purpose: 'maskable' });
    assert.match(svg, /rx="0"/, '角丸を残している');
    assert.match(svg, new RegExp(`font-size="${ART.glyphSize * SAFE_ZONE}"`), '文字を縮めていない');
    assert.ok(SAFE_ZONE <= 0.8, 'セーフゾーンは中心80%の円（appmanifest の仕様）');
  });

  it('any と maskable で別のSVGになる', () => {
    assert.notEqual(
      renderSvg({ size: 512, purpose: 'any' }),
      renderSvg({ size: 512, purpose: 'maskable' }),
    );
  });

  it('書き出す大きさが width / height に反映される', () => {
    for (const icon of ICONS) {
      const svg = renderSvg(icon);
      assert.match(svg, new RegExp(`width="${icon.size}"`), icon.out);
      assert.match(svg, new RegExp(`height="${icon.size}"`), icon.out);
    }
  });

  it('書き出し先が games/public/icons/ の下に閉じている', () => {
    // public/ の外（app/ 配下など）に置くと、静的エクスポートで配信されない
    for (const icon of ICONS) {
      assert.match(icon.out, /^games\/public\/icons\/[\w-]+\.png$/, icon.out);
    }
  });
});
