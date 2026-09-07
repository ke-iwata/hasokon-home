import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chapters, writtenChapters } from '@/lib/curriculum';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('ページと curriculum の対応', () => {
  it('本文のある章にはページがある', () => {
    for (const c of writtenChapters) {
      expect(existsSync(`${appDir}${c.slug}/page.tsx`), `${c.slug} のページが無い`).toBe(true);
    }
  });

  it('未執筆（wip）の章にはページが無い（目次でリンクしないのに開けてしまう）', () => {
    for (const c of chapters.filter((c) => c.stage === 'wip')) {
      expect(existsSync(`${appDir}${c.slug}/page.tsx`), `${c.slug} にページがある`).toBe(false);
    }
  });

  it('章ディレクトリはすべて curriculum に登録されている', () => {
    const known = new Set(chapters.map((c) => c.slug));
    // アンダースコア始まりは共有部品（_chapter）、それ以外の固定ページも除く
    const fixed = new Set(['privacy', 'contact', 'about']);
    const dirs = readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !fixed.has(d.name))
      .map((d) => d.name);
    for (const d of dirs) {
      expect(known.has(d), `app/${d}/ が curriculum に未登録`).toBe(true);
    }
  });
});

describe('章ページの約束', () => {
  const pages = writtenChapters.map((c) => ({
    slug: c.slug,
    src: readFileSync(`${appDir}${c.slug}/page.tsx`, 'utf8'),
  }));

  it('metadata に robots: robotsFor(...) を書いている（公開事故を防ぐ）', () => {
    for (const { slug, src } of pages) {
      expect(src, slug).toMatch(/robots:\s*robotsFor\(/);
    }
  });

  it('canonical を自分のURLで書いている', () => {
    for (const { slug, src } of pages) {
      expect(src, slug).toMatch(/alternates:\s*\{\s*canonical:/);
    }
  });

  it('共通の Chapter を通している（免責・参考文献の書き忘れを防ぐ）', () => {
    for (const { slug, src } of pages) {
      expect(src, slug).toMatch(/<Chapter\b/);
    }
  });

  it('ページ側で openGraph を書いていない（layout の og:image ごと差し替わる）', () => {
    for (const { slug, src } of pages) {
      expect(src, slug).not.toMatch(/openGraph:/);
    }
  });

  it('免責を各ページに手書きしていない（Chapter が必ず出すので二重になる）', () => {
    for (const { slug, src } of pages) {
      expect(src, slug).not.toMatch(/<Disclaimer\b/);
    }
  });
});
