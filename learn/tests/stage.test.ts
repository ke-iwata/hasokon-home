import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  chapters,
  chapterUrl,
  publicChapters,
  publicSubjects,
  subjects,
  subjectUrl,
  writtenChapters,
} from '@/lib/curriculum';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('ページと curriculum の対応', () => {
  it('本文のある章にはページがある', () => {
    for (const c of writtenChapters) {
      expect(existsSync(`${appDir}${c.subject}/${c.slug}/page.tsx`), `${c.slug} のページが無い`).toBe(true);
    }
  });

  it('未執筆（wip）の章にはページが無い（目次でリンクしないのに開けてしまう）', () => {
    for (const c of chapters.filter((c) => c.stage === 'wip')) {
      expect(existsSync(`${appDir}${c.subject}/${c.slug}/page.tsx`), `${c.slug} にページがある`).toBe(false);
    }
  });

  it('app/ 直下のディレクトリはすべて登録された分野', () => {
    const known = new Set(subjects.map((s) => s.slug));
    // アンダースコア始まりは共有部品（_chapter）、それ以外の固定ページも除く
    const fixed = new Set(['privacy', 'contact', 'about']);
    const dirs = readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !fixed.has(d.name))
      .map((d) => d.name);
    for (const d of dirs) {
      expect(known.has(d), `app/${d}/ が subjects に未登録`).toBe(true);
    }
  });

  it('分野の下のディレクトリはすべて curriculum に登録された章', () => {
    for (const subject of subjects) {
      const known = new Set(chapters.filter((c) => c.subject === subject.slug).map((c) => c.slug));
      const dirs = readdirSync(`${appDir}${subject.slug}`, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const d of dirs) {
        expect(known.has(d), `app/${subject.slug}/${d}/ が curriculum に未登録`).toBe(true);
      }
    }
  });

  it('分野ごとに目次のページがある', () => {
    for (const s of subjects) {
      expect(existsSync(`${appDir}${s.slug}/page.tsx`), `${s.slug} の目次が無い`).toBe(true);
    }
  });
});

describe('章ページの約束', () => {
  const pages = writtenChapters.map((c) => ({
    slug: c.slug,
    src: readFileSync(`${appDir}${c.subject}/${c.slug}/page.tsx`, 'utf8'),
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

describe('目次と sitemap の合図が食い違わない', () => {
  it('分野の目次の robots と sitemap は同じ判断を見ている', () => {
    // 別々に書くと「sitemap には出ているのに noindex」という矛盾が起きる。
    // どちらも分野の stage を見ていることを字面で確かめる
    for (const s of subjects) {
      const toc = readFileSync(`${appDir}${s.slug}/page.tsx`, 'utf8');
      expect(toc, `${s.slug}`).toMatch(/robots:\s*subject\.stage === 'public' \? undefined/);
    }
    const sitemap = readFileSync(`${appDir}sitemap.ts`, 'utf8');
    expect(sitemap).toMatch(/if\s*\(publicSubjects\.length === 0\)\s*return\s*\[\]/);
  });

  it('公開後の sitemap には一覧・分野の目次・全章が載る', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = sitemap().map((e) => e.url);
    // 一覧 + 公開中の分野 + 公開中の章
    expect(urls).toHaveLength(1 + publicSubjects.length + publicChapters.length);
    expect(urls).toContain('https://hasokon.com/learn/');
    for (const s of publicSubjects) {
      expect(urls, `${s.slug} の目次が sitemap に無い`).toContain(subjectUrl(s.slug));
    }
    for (const c of publicChapters) {
      expect(urls, `${c.slug} が sitemap に無い`).toContain(chapterUrl(c));
    }
  });

  it('章のURLに分野が1段入っている（/learn/{subject}/{slug}/）', () => {
    for (const c of publicChapters) {
      expect(chapterUrl(c)).toBe(`https://hasokon.com/learn/${c.subject}/${c.slug}/`);
      // /learn/ の下が2段（分野 + 章）であること
      const path = chapterUrl(c).replace('https://hasokon.com/learn/', '');
      expect(path.split('/').filter(Boolean), c.slug).toHaveLength(2);
    }
  });

  it('分野の目次のURLは1段（/learn/{subject}/）', () => {
    for (const s of publicSubjects) {
      const path = subjectUrl(s.slug).replace('https://hasokon.com/learn/', '');
      expect(path.split('/').filter(Boolean), s.slug).toHaveLength(1);
    }
  });

  it('sitemap の lastmod は章の updatedAt を使う（ビルド日にしない）', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    for (const e of sitemap()) {
      expect(String(e.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
