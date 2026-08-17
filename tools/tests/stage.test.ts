import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tools, publicTools, robotsFor, robotsForStage } from '@/lib/registry';

/**
 * 公開の段階（`stage`）のテスト。
 *
 * 仕様: docs/features/feature-flags.md
 *
 * `stage` は「本番リリースから外す」ための唯一の切り替えなので、
 * **効いていないことに気づけない**のがいちばん怖い。
 * 一覧・sitemap・`noindex` の3方向から、非公開のものが漏れないことを見る。
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
const pages = new Map(
  pageFiles(appDir).map((path) => [
    path.slice(appDir.length).replace(/\/page\.tsx$/, ''),
    readFileSync(path, 'utf8'),
  ]),
);

describe('公開の段階（stage）', () => {
  it('走査対象のツールが1件以上ある（走査そのものが壊れていないこと）', () => {
    expect(tools.length).toBeGreaterThan(5);
  });

  it('stage は wip / preview / public のどれか', () => {
    for (const entry of tools) {
      expect(['wip', 'preview', 'public']).toContain(entry.stage);
    }
  });

  it('publicTools は stage が public のものだけを含む', () => {
    expect(publicTools.map((e) => e.slug).sort()).toEqual(
      tools.filter((e) => e.stage === 'public').map((e) => e.slug).sort(),
    );
  });

  /**
   * **各ページが `robots: robotsFor('<slug>')` を書いていること。**
   * 書き忘れると、そのページだけ非公開にしても noindex が付かない。
   * ここで落とさないと、気づくのは検索結果に出てからになる。
   */
  it('registry の全ツールのページが robotsFor を通している', () => {
    const missing = tools
      .filter((e) => pages.has(e.slug))
      .filter((e) => !(pages.get(e.slug) as string).includes(`robotsFor('${e.slug}')`))
      .map((e) => e.slug);
    expect(missing).toEqual([]);
  });

  it('registry の全ツールにページがある', () => {
    expect(tools.filter((e) => !pages.has(e.slug)).map((e) => e.slug)).toEqual([]);
  });

  it('公開中のものは noindex にならない', () => {
    for (const entry of publicTools) {
      expect(robotsFor(entry.slug)).toBeUndefined();
    }
  });

  /** いまは全部 public なので、規則そのもの（`robotsForStage`）を確かめる */
  it('公開前のものは noindex になる', () => {
    expect(robotsForStage('wip')).toEqual({ index: false, follow: false });
    expect(robotsForStage('preview')).toEqual({ index: false, follow: false });
    expect(robotsForStage('public')).toBeUndefined();
  });

  it('registry に無い slug は既定のまま（特設ページを巻き込まない）', () => {
    expect(robotsFor('registry-ni-nai-slug')).toBeUndefined();
  });
});
