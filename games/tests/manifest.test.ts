import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest, { dynamic } from '@/app/manifest';

/**
 * Webアプリマニフェスト（「ホーム画面に追加」対応）のテスト。
 *
 * 仕様: docs/features/games-pwa-manifest.md
 *
 * 壊れても画面には何も出ないのに、スタンドアロン起動だけが静かに止まる種類の
 * 設定なので、値を1つずつ見ている。特に落ちやすいのは basePath（/games）で、
 * `start_url` や `scope` から抜けると **scope の外になって普通のタブで開く**。
 *
 * PNGの実ファイル側は `scripts/test/pwa-manifest.test.mjs`（node --test）が見ている。
 */

const m = manifest();

const repoRoot = new URL('../../', import.meta.url);
const readText = (path: string) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');

describe('静的書き出しの設定', () => {
  it("dynamic = 'force-static'（output: export では明示が必要）", () => {
    // これが無いと `next build` が /manifest.webmanifest で落ちる
    expect(dynamic).toBe('force-static');
  });
});

describe('URL（basePath /games が付いていること）', () => {
  it('start_url が /games/ 配下で、ホーム画面起動の印が付く', () => {
    // GA4 でホーム画面からのセッションを数えるための utm_source（仕様書の「計測」）
    expect(m.start_url).toBe('/games/?utm_source=homescreen');
  });

  it('scope が /games/ で、start_url がその配下にある', () => {
    expect(m.scope).toBe('/games/');
    expect(m.start_url?.startsWith(m.scope as string)).toBe(true);
  });

  it('id が固定されている（start_url を変えても同じアプリとして扱われる）', () => {
    expect(m.id).toBe('/games/');
  });

  it('アイコンのsrcがすべて /games/ 配下', () => {
    for (const icon of m.icons ?? []) {
      expect(icon.src.startsWith('/games/')).toBe(true);
    }
  });
});

describe('表示', () => {
  it('display が standalone（アドレスバー無しのアプリ風起動）', () => {
    expect(m.display).toBe('standalone');
  });

  it('向きを固定しない（横持ちのゲームがあるため）', () => {
    expect(m.orientation).toBeUndefined();
  });

  it('short_name がホーム画面で切れない長さ（12文字以内）', () => {
    expect(m.short_name).toBeTruthy();
    expect((m.short_name as string).length).toBeLessThanOrEqual(12);
  });

  it('name と description が入っている', () => {
    expect(m.name).toContain('無料ミニゲーム集');
    expect(m.description).toBeTruthy();
  });

  it('lang が ja', () => {
    expect(m.lang).toBe('ja');
  });
});

describe('配色', () => {
  /**
   * マニフェストは静止した値なのでダークテーマの出し分けができない。
   * app/globals.css のライト側の値と食い違っていないかだけを見る
   * （ずれるとスプラッシュ画面だけサイトと違う地色になる）
   */
  const css = readText('games/app/globals.css');
  const token = (name: string) => css.match(new RegExp(`\\s${name}:\\s*(#[0-9a-f]{3,8});`))?.[1];

  it('background_color が globals.css の --bg と一致する', () => {
    expect(m.background_color).toBe(token('--bg'));
  });

  it('theme_color が globals.css の --accent と一致する', () => {
    expect(m.theme_color).toBe(token('--accent'));
  });
});

describe('アイコン', () => {
  it('192 と 512 が any / maskable の両方そろっている', () => {
    const combos = (m.icons ?? []).map((i) => `${i.sizes}:${i.purpose}`).sort();
    expect(combos).toEqual(
      ['192x192:any', '192x192:maskable', '512x512:any', '512x512:maskable'].sort(),
    );
  });

  it('maskable を必ず持つ（Android のランチャーが端末ごとの形に切り抜くため）', () => {
    // maskable が無いと、角丸のアイコンが更に丸く切られて角が二重に落ちる
    expect((m.icons ?? []).some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('type がすべて image/png', () => {
    for (const icon of m.icons ?? []) {
      expect(icon.type).toBe('image/png');
    }
  });

  it('sizes の宣言とファイル名の数字が食い違っていない', () => {
    for (const icon of m.icons ?? []) {
      const declared = (icon.sizes as string).split('x')[0];
      expect(icon.src).toContain(`-${declared}.png`);
    }
  });
});

describe('やらないこと', () => {
  it('Service Worker を登録していない', () => {
    // 仕様書の「やらないこと」。静的サイトで古いHTMLがキャッシュに残り続ける
    // 事故のリスクが利益を上回る。manifest だけでスタンドアロン起動は成立する
    const layout = readText('games/app/layout.tsx');
    expect(layout).not.toContain('serviceWorker');
    expect(layout).not.toContain('navigator.serviceWorker');
  });
});
