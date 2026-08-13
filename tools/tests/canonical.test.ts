import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SITE_URL } from '@/lib/registry';

/**
 * 自己参照canonicalの網羅テスト。
 *
 * 仕様: docs/features/self-canonical-coverage.md
 *
 * `layout.tsx` は `metadataBase` を持つが `alternates` を持たないため、
 * **ページ側が書かないと `<link rel="canonical">` は1つも出力されない。**
 * 実際、モノレポ統合のときに申し送りが落ちて、セクショントップとプライバシーの
 * 4ページだけ canonical が欠けたまま本番に出ていた。
 * 人間の注意力ではなくテストで止める。
 *
 * layout.tsx に既定の canonical を置いて解決しないのは、書き忘れたページが
 * 「canonicalが無い」ではなく「セクショントップを正規URLとして主張する」に
 * 変わってしまうため（仕様書の「やらないこと」）。
 */

/** app/ 配下の page.tsx をすべて集める（not-found.tsx は対象外） */
function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /^page\.tsx$/.test(entry.name) ? [path] : [];
  });
}

const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const pages = pageFiles(appDir).map((path) => ({
  path: path.slice(appDir.length),
  source: readFileSync(path, 'utf8'),
}));

describe('自己参照canonical', () => {
  it('走査対象のページが1件以上ある（走査そのものが壊れていないこと）', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  /**
   * 除外は not-found.tsx だけ。404は robots: { index: false } を持っており、
   * canonical を持たせる対象ではない。
   * 動的ルート（app/r/[slug]/・app/guide/[slug]/）は generateMetadata の中で
   * canonical を組み立てているので、文字列の走査でそのまま引っかかる。
   */
  it('すべての page.tsx が alternates.canonical を持つ', () => {
    const offenders = pages
      .filter(({ source }) => !(source.includes('alternates') && source.includes('canonical')))
      .map(({ path }) => path);

    expect(offenders, 'canonical が無いページは重複判定で正規URLを主張できない').toEqual([]);
  });

  /**
   * CloudFront Function がスラッシュ無しのURLを301で寄せているので
   * （hasokon-infra/functions/hasokon-home-site-rewrite.js）、
   * canonical がスラッシュ無しだと「canonicalがリダイレクトを指す」状態になる。
   */
  it('canonical の値が SITE_URL から始まり、末尾がスラッシュで終わる', () => {
    const offenders = pages.flatMap(({ path, source }) =>
      [...source.matchAll(/canonical:\s*`([^`]*)`/g)]
        .map((match) => match[1])
        // テンプレートリテラルの ${SITE_URL} を実際の値に置き換えてから見る
        // （${...} が残るのは slug などの動的部分。末尾の判定には影響しない）
        .map((value) => value.replace(/\$\{SITE_URL\}/g, SITE_URL))
        .filter((value) => !value.startsWith(`${SITE_URL}/`) || !value.endsWith('/'))
        .map((value) => `${path}: ${value}`),
    );

    expect(offenders, 'canonical は SITE_URL 起点の絶対URLで、末尾スラッシュ付き').toEqual([]);
  });

  it('セクショントップとプライバシーが canonical を持つ（取りこぼした4ページ）', () => {
    const top = pages.find(({ path }) => path === 'page.tsx');
    const privacy = pages.find(({ path }) => path === join('privacy', 'page.tsx'));

    expect(top?.source).toContain('canonical: `${SITE_URL}/`');
    expect(privacy?.source).toContain('canonical: `${SITE_URL}/privacy/`');
  });

  /**
   * セクショントップに title を書くと、layout.tsx の title.template が '%s' なので
   * title.default（無料計算ツール集｜…）がそのまま置き換わって消える。
   * 文言を変える意図は無いので、alternates だけを持たせている状態を見張る。
   */
  it('セクショントップは title / description を上書きしない', () => {
    const top = pages.find(({ path }) => path === 'page.tsx');
    const block = top?.source.match(/export const metadata: Metadata = \{[\s\S]*?\n\};/)?.[0];

    expect(block, 'セクショントップに metadata の export が無い').toBeDefined();
    expect(block).not.toMatch(/\btitle:/);
    expect(block).not.toMatch(/\bdescription:/);
  });
});
