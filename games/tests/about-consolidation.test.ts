import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { metadata as aboutMetadata } from '@/app/about/page';
import { SITE_URL } from '@/lib/registry';

/**
 * 運営者情報の1枚化（`/about.html`）のテスト。
 *
 * 仕様: docs/features/google-index-recovery.md（提案 C）
 *
 * 運営者情報は `/tools/about/` と `/games/about/` の2枚に分かれていて、
 * どちらも Google に登録されていなかった（URL検査で unknown）。
 * ルート直下の `/about.html` 1枚にまとめ、既存2枚は `noindex` にして
 * サイトマップから外してある。
 *
 * `/about/` は registry に無い固定ページなので `robotsFor()` を通らず、
 * `tests/stage.test.ts` の対象外になる。ここで見張らないと `noindex` が
 * 黙って外れても気づけない。
 */

/** app/ 配下の page.tsx をすべて集める */
function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /^page\.tsx$/.test(entry.name) ? [path] : [];
  });
}

const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const sources = [
  ...pageFiles(appDir).map((path) => ({
    path: path.slice(appDir.length),
    source: readFileSync(path, 'utf8'),
  })),
  { path: 'layout.tsx', source: readFileSync(join(appDir, 'layout.tsx'), 'utf8') },
];

describe('運営者情報（/games/about/）を noindex にした', () => {
  it('走査対象のページが1件以上ある（走査そのものが壊れていないこと）', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it('about ページが noindex・follow になっている', () => {
    expect(aboutMetadata.robots).toEqual({ index: false, follow: true });
  });

  it('canonical は自己参照のまま（内容の違うページへ向けない）', () => {
    expect(aboutMetadata.alternates?.canonical).toBe(`${SITE_URL}/about/`);
  });

  it('about ページから /about.html へ辿れる', () => {
    const source = sources.find((s) => s.path === join('about', 'page.tsx'))?.source;
    expect(source, 'about ページが見つからない').toBeDefined();
    expect(source).toContain('href="/about.html"');
  });

  it('サイトマップに /games/about/ を載せていない', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).not.toContain(`${SITE_URL}/about/`);
  });

  it('サイトマップの中身自体は壊れていない（トップとゲームは載っている）', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/`);
    expect(urls.length).toBeGreaterThan(15);
  });
});

describe('運営者情報への導線', () => {
  it('アプリ内から /games/about/・/tools/about/ へリンクしていない', () => {
    // noindex 同士で相互にリンクする形を残さない（about ページ自身の canonical は除く）
    const offenders = sources
      .filter(({ path }) => path !== join('about', 'page.tsx'))
      .filter(({ source }) => /href=["'`]\/(?:tools\/|games\/)?about\/["'`]/.test(source))
      .map(({ path }) => path);
    expect(offenders, '運営者情報のリンクは /about.html に付け替えること').toEqual([]);
  });

  it('about ページが /tools/about/ へリンクしていない（noindex 同士をつながない）', () => {
    const source = sources.find((s) => s.path === join('about', 'page.tsx'))?.source;
    expect(source).not.toContain('href="/tools/about/"');
  });

  it('footer が /about.html を指している', () => {
    const layout = sources.find(({ path }) => path === 'layout.tsx')?.source;
    expect(layout).toContain('href="/about.html"');
  });
});
