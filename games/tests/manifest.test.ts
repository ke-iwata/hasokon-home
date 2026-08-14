import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/layout';
import manifest, { HOMESCREEN_UTM, MANIFEST_SCOPE } from '@/app/manifest';

/**
 * Webアプリマニフェスト（「ホーム画面に追加」）のテスト。
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * 壊れても画面には何も出ない（ホーム画面に追加したときだけ症状が出て、
 * しかもただのブックマークに戻るだけ）ので、機械で見張る価値が高い。
 * アイコンの実ファイルと生成スクリプトは scripts/test/manifest-icons.test.mjs が見ている。
 */

const gamesRoot = fileURLToPath(new URL('../', import.meta.url));
const m = manifest();

describe('manifest', () => {
  it('スタンドアロン起動になる', () => {
    // display が無い / browser だと、ホーム画面から開いても通常のタブになる
    expect(m.display).toBe('standalone');
  });

  it('start_url が /games/ 配下で、ホーム画面起動を数える印が付く', () => {
    // 仕様書「計測」: この utm_source で GA4 のセッションを識別する
    expect(m.start_url).toBe(`${MANIFEST_SCOPE}?${HOMESCREEN_UTM}`);
    expect(HOMESCREEN_UTM).toBe('utm_source=homescreen');
  });

  it('scope が /games/ に閉じている（ポータルや tools はブラウザに戻す）', () => {
    expect(m.scope).toBe('/games/');
    expect(MANIFEST_SCOPE).toBe('/games/');
    expect(m.start_url?.startsWith(m.scope as string)).toBe(true);
  });

  it('id がクエリを含まない（start_url を変えても別アプリ扱いにならない）', () => {
    // id を省略すると start_url が既定のIDになり、utm を足し引きしただけで
    // 「もう1つのアプリ」としてホーム画面に増えてしまう
    expect(m.id).toBe(MANIFEST_SCOPE);
    expect(m.id).not.toContain('?');
  });

  it('名前と説明が入っていて、short_name が切られない長さである', () => {
    expect(m.name).toBeTruthy();
    expect(m.description).toBeTruthy();
    expect(m.lang).toBe('ja');
    // ホーム画面のラベルは12文字前後で切られる
    expect((m.short_name as string).length).toBeLessThanOrEqual(12);
  });

  it('配色が globals.css のライト側 --bg と揃っている', () => {
    // マニフェストはダークの出し分けができないので既定のライトを使う
    expect(m.background_color).toBe('#faf9f7');
    expect(m.theme_color).toBe('#faf9f7');
  });
});

describe('manifest のアイコン', () => {
  const icons = m.icons ?? [];

  it('any と maskable を両方持つ', () => {
    // maskable が無いと Android の切り抜きで絵が欠ける。
    // any が無いと切り抜かない環境（iOS・デスクトップ）で余白ぶん小さく見える
    const purposes = new Set(icons.map((icon) => icon.purpose));
    expect(purposes).toEqual(new Set(['any', 'maskable']));
  });

  it('purpose ごとに 192 と 512 がある', () => {
    for (const purpose of ['any', 'maskable']) {
      const sizes = icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes);
      expect(sizes.sort()).toEqual(['192x192', '512x512']);
    }
  });

  it('src が basePath込みのルート相対で、public/ の実ファイルを指す', () => {
    // Next.js はマニフェストの中身に basePath を足さないので、自分で /games を付ける。
    // 付け忘れるとアイコンが404になり、インストール導線そのものが出なくなる
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.src.startsWith('/games/icons/')).toBe(true);
      expect(icon.type).toBe('image/png');
      const file = join(gamesRoot, 'public', icon.src.replace('/games/', ''));
      expect(existsSync(file), `${icon.src} の実ファイルが無い`).toBe(true);
    }
  });
});

describe('layout の metadata', () => {
  it('manifest へのリンクを出す', () => {
    expect(metadata.manifest).toBe(`${MANIFEST_SCOPE}manifest.webmanifest`);
  });

  it('manifest のURLがルート相対である', () => {
    // 絶対URLにすると test.hasokon.com から本番のマニフェストを読みに行き、
    // scope 外として弾かれる
    expect(String(metadata.manifest).startsWith('/')).toBe(true);
  });
});
