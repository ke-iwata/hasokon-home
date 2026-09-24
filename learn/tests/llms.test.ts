import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  chapterUrl,
  chapters,
  publicChapters,
  publicSubjects,
  SITE_URL,
  subjects,
  subjectUrl,
} from '@/lib/curriculum';
import { buildLlmsTxt } from '@/lib/llms';

/**
 * `/learn/llms.txt`（AIアシスタント向けの章の一覧）のテスト。
 *
 * 仕様: docs/features/ai-assistant-channel.md の B-2 / B-3 / B-4
 *
 * **見張りの本体は「公開前のものが混ざらないこと」。**
 * `stage` が `public` 以外の章はページに `noindex` が付くが、
 * **llms.txt は robots と別経路なので止まらない**。
 * しかも `wip` の章は**本文がまだ無い**ので、出せば死んだリンクを配ることになる。
 */

const TXT = buildLlmsTxt();
const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const libSrc = readFileSync(fileURLToPath(new URL('../lib/llms.ts', import.meta.url)), 'utf8');

/** `- [名前](URL): 説明` の行 */
const LINKS = TXT.split('\n')
  .filter((line) => line.startsWith('- '))
  .map((line) => {
    const m = /^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/.exec(line);
    expect(m, `箇条書きの書式が違う: ${line}`).not.toBeNull();
    return { label: m![1], url: m![2], description: (m![3] ?? '').trim() };
  });

describe('llmstxt.org の形', () => {
  it('H1 → 要約の引用 → H2セクション の順で並ぶ', () => {
    const lines = TXT.split('\n');
    expect(lines[0]).toBe('# 学ぶ（hasokon.com/learn/）');
    expect(lines.slice(1, 4).some((l) => l.startsWith('> '))).toBe(true);
    expect(TXT.endsWith('\n')).toBe(true);
    expect(TXT).not.toMatch(/\n\n\n/);
  });

  it('URLは `/learn/{subject}/{slug}/` の3階層（chapterUrl を通している）', () => {
    for (const c of publicChapters) {
      expect(TXT.includes(chapterUrl(c)), `${c.slug} のURLが無い`).toBe(true);
      expect(chapterUrl(c)).toBe(`${SITE_URL}/${c.subject}/${c.slug}/`);
    }
  });

  it('すべて絶対URL・末尾スラッシュつき（canonical と同じ表記）', () => {
    for (const { url } of LINKS) {
      expect(url.startsWith('https://hasokon.com/'), `絶対URLで書くこと: ${url}`).toBe(true);
      if (/\.\w+$/.test(url)) continue; // llms.txt のような実ファイル
      expect(url.endsWith('/'), `末尾スラッシュが要る: ${url}`).toBe(true);
    }
  });

  it('すべての行に1行説明がついている', () => {
    for (const { label, description } of LINKS) {
      expect(description.length, `「${label}」に説明がない`).toBeGreaterThan(0);
    }
  });

  it('同じURLが二度出てこない', () => {
    const urls = LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('リンク文字列が curriculum の title / name と一致する', () => {
    const names = new Map<string, string>([
      ...publicSubjects.map((s) => [subjectUrl(s.slug), s.name] as const),
      ...publicChapters.map((c) => [chapterUrl(c), c.title] as const),
    ]);
    for (const { label, url } of LINKS) {
      const name = names.get(url);
      if (!name) continue; // 固定ページは curriculum に無い
      expect(label, `${url} の表記が curriculum とずれている`).toBe(name);
    }
  });
});

describe('公開前の分野・章を出さない（stage）', () => {
  it('出ている章は publicChapters と過不足なく一致する', () => {
    const listed = LINKS.map((l) => l.url).filter((url) => /\/learn\/[^/]+\/[^/]+\/$/.test(url));
    expect(new Set(listed)).toEqual(new Set(publicChapters.map(chapterUrl)));
  });

  it('出ている分野は publicSubjects と過不足なく一致する', () => {
    const listed = LINKS.map((l) => l.url).filter((url) => /\/learn\/[^/]+\/$/.test(url));
    expect(new Set(listed)).toEqual(new Set(publicSubjects.map((s) => subjectUrl(s.slug))));
  });

  it('wip / preview の章が1件も混ざっていない', () => {
    for (const c of chapters.filter((c) => c.stage !== 'public')) {
      expect(TXT.includes(`/${c.slug}/`), `公開前の章が llms.txt に出ている: ${c.slug}`).toBe(false);
      expect(TXT.includes(c.title), `公開前の章題が llms.txt に出ている: ${c.title}`).toBe(false);
    }
    for (const s of subjects.filter((s) => s.stage !== 'public')) {
      expect(TXT.includes(`/${s.slug}/`), `公開前の分野が llms.txt に出ている: ${s.slug}`).toBe(
        false,
      );
    }
  });

  it('生成は publicChapters / publicSubjects を通している', () => {
    // CLAUDE.md の約束。`chapters` を直に filter する形に書き換えたら落とす
    expect(libSrc).toMatch(/import \{[\s\S]*publicChapters/);
    expect(libSrc).toMatch(/import \{[\s\S]*publicSubjects/);
    expect(libSrc).not.toMatch(/\bchapters\.filter\b/);
    expect(libSrc).not.toMatch(/\bsubjects\.filter\b/);
  });

  it('リンク先のページが実在する', () => {
    for (const { url } of LINKS) {
      if (!url.startsWith(`${SITE_URL}/`)) continue;
      const path = url.slice(`${SITE_URL}/`.length);
      if (path === '') continue;
      expect(existsSync(`${appDir}${path}page.tsx`), `リンク切れ: ${url}`).toBe(true);
    }
  });
});

describe('最終更新日（B-3）', () => {
  it('章の行には curriculum の updatedAt が入る', () => {
    for (const c of publicChapters) {
      const line = TXT.split('\n').find((l) => l.includes(chapterUrl(c)));
      expect(line, `${c.slug} の行が無い`).toBeDefined();
      if (c.updatedAt) {
        expect(line!.includes(`最終更新 ${c.updatedAt}`), `${c.slug} の最終更新日が違う`).toBe(true);
      }
    }
  });

  it('日付は curriculum の形（YYYY-MM-DD）でだけ出る', () => {
    for (const stamp of TXT.match(/最終更新 [^）]*/g) ?? []) {
      expect(stamp).toMatch(/^最終更新 \d{4}-\d{2}-\d{2}$/);
    }
  });
});
