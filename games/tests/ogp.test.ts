import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/layout';
import { OGP_IMAGE, SITE_NAME, SITE_URL } from '@/lib/registry';

/**
 * OGP画像（SNS共有時のサムネイル）のテスト。
 *
 * 仕様: docs/features/ogp-image.md
 * 見張っている内容は tools/tests/ogp.test.ts と同じ（絶対URL・twitter:card・1200×630）。
 * ゲームは特に共有と相性がよいので、ここが欠けると影響が大きい。
 */

describe('OGP_IMAGE', () => {
  it('basePath込みの絶対URLを指す', () => {
    expect(OGP_IMAGE.url).toBe('https://hasokon.com/games/ogp.png');
    expect(OGP_IMAGE.url.startsWith(`${SITE_URL}/`)).toBe(true);
  });

  it('1200×630（summary_large_image の前提）', () => {
    expect(OGP_IMAGE.width).toBe(1200);
    expect(OGP_IMAGE.height).toBe(630);
  });

  it('代替テキストにサイト名が入る', () => {
    expect(OGP_IMAGE.alt).toBe(SITE_NAME);
  });
});

describe('layout の metadata', () => {
  it('openGraph.images に既定のOGP画像が入る', () => {
    expect(metadata.openGraph?.images).toEqual([OGP_IMAGE]);
  });

  it('twitter:card が summary_large_image で、画像も明示されている', () => {
    // Next.js の twitter メタデータは openGraph から画像を引き継がない
    // metadata.twitter は形の違う複数の型のunionなので、確かめたい2つだけに絞って読む
    const twitter = metadata.twitter as unknown as { card?: string; images?: string[] };
    expect(twitter.card).toBe('summary_large_image');
    expect(twitter.images).toEqual([OGP_IMAGE.url]);
  });

  it('og:image は http(s) から始まる（相対パスにしない）', () => {
    const [image] = metadata.openGraph?.images as unknown as [{ url: string }];
    expect(image.url).toMatch(/^https:\/\//);
  });
});

/** app/ 配下の page.tsx / not-found.tsx をすべて集める */
function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /^(page|not-found)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe('各ページの metadata', () => {
  const appDir = fileURLToPath(new URL('../app/', import.meta.url));

  /**
   * layout.tsx の openGraph はページ側が openGraph を書いた瞬間まるごと差し替わる
   * （Next.js のメタデータは入れ子のオブジェクトを浅く上書きする）。
   * `openGraph: { url: ... }` とだけ書いたページは og:image を落とすので見張る。
   */
  it('openGraph を書いているページは images も必ず持つ', () => {
    const offenders = pageFiles(appDir).filter((path) => {
      const source = readFileSync(path, 'utf8');
      return source.includes('openGraph') && !source.includes('images');
    });

    expect(offenders, 'openGraph を上書きすると layout の og:image が消える').toEqual([]);
  });
});
