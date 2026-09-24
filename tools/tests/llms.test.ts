import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildLlmsTxt } from '@/lib/llms';
import { categories, publicTools, SITE_URL, tools } from '@/lib/registry';

/**
 * `/tools/llms.txt`（AIアシスタント向けのツールの一覧）のテスト。
 *
 * 仕様: docs/features/ai-assistant-channel.md の B-2 / B-3
 *
 * **見張りの本体は「公開前のものが混ざらないこと」。**
 * `stage` が `public` 以外のツールはページに `noindex` が付くが、
 * **llms.txt は robots と別経路なので止まらない**。ここで漏らすと、
 * 作りかけのツールがそのままAIアシスタントに配られる。
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
    expect(lines[0]).toBe('# 無料計算ツール集（hasokon.com/tools/）');
    expect(lines.slice(1, 4).some((l) => l.startsWith('> '))).toBe(true);
    expect(TXT.endsWith('\n')).toBe(true);
    expect(TXT).not.toMatch(/\n\n\n/);
  });

  it('セクションは registry の分類（categories）と揃っている', () => {
    const headings = TXT.split('\n')
      .filter((l) => l.startsWith('## '))
      .map((l) => l.slice(3));
    expect(headings).toEqual([...categories, 'サイト情報']);
  });

  it('すべて絶対URL・末尾スラッシュつき（canonical と同じ表記）', () => {
    for (const { url } of LINKS) {
      expect(url.startsWith('https://hasokon.com/'), `絶対URLで書くこと: ${url}`).toBe(true);
      if (/\.\w+$/.test(url)) continue; // llms.txt のような実ファイル
      expect(url.endsWith('/'), `末尾スラッシュが要る: ${url}`).toBe(true);
    }
  });

  it('すべての行に1行説明がついている', () => {
    // AIはリンク文字列だけでなく説明文を根拠に引用先を選ぶ。ここが本体
    for (const { label, description } of LINKS) {
      expect(description.length, `「${label}」に説明がない`).toBeGreaterThan(0);
    }
  });

  it('同じURLが二度出てこない', () => {
    const urls = LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('リンク文字列が registry の名前と一致する', () => {
    const names = new Map(publicTools.map((t) => [`${SITE_URL}/${t.slug}/`, t.name]));
    for (const { label, url } of LINKS) {
      const name = names.get(url);
      if (!name) continue; // 固定ページは registry に無い
      expect(label, `${url} の表記が registry とずれている`).toBe(name);
    }
  });
});

describe('公開前のツールを出さない（stage）', () => {
  it('出ているツールは publicTools と過不足なく一致する', () => {
    const listed = LINKS.map((l) => l.url).filter((url) => url.startsWith(`${SITE_URL}/`));
    const expected = publicTools.map((t) => `${SITE_URL}/${t.slug}/`);
    expect(new Set(listed)).toEqual(new Set([...expected, `${SITE_URL}/`, `${SITE_URL}/contact/`]));
  });

  it('wip / preview のツールが1件も混ざっていない', () => {
    const unreleased = tools.filter((t) => t.stage !== 'public');
    // 見張りが空振りしていないこと。公開前が0件になったら、
    // このテストは何も確かめていないので気づけるようにしておく
    expect(unreleased.length, '公開前のツールが0件（このテストは素通りしている）').toBeGreaterThan(
      0,
    );
    for (const t of unreleased) {
      expect(TXT.includes(`/${t.slug}/`), `公開前のツールが llms.txt に出ている: ${t.slug}`).toBe(
        false,
      );
      expect(TXT.includes(t.name), `公開前のツール名が llms.txt に出ている: ${t.name}`).toBe(false);
    }
  });

  it('生成は publicTools を通している（registry を直に filter しない）', () => {
    // CLAUDE.md の約束。読み手が `tools` を舐める形に書き換えたら落とす
    expect(libSrc).toMatch(/import \{[^}]*publicTools/s);
    expect(libSrc).not.toMatch(/\btools\.filter\b/);
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
  it('ツールの行には registry の updatedAt が入る', () => {
    for (const t of publicTools) {
      const line = TXT.split('\n').find((l) => l.includes(`${SITE_URL}/${t.slug}/`));
      expect(line, `${t.slug} の行が無い`).toBeDefined();
      expect(line!.includes(`最終更新 ${t.updatedAt}`), `${t.slug} の最終更新日が違う`).toBe(true);
    }
  });

  it('日付は registry の形（YYYY-MM-DD）でだけ出る', () => {
    for (const stamp of TXT.match(/最終更新 [^）]*/g) ?? []) {
      expect(stamp).toMatch(/^最終更新 \d{4}-\d{2}-\d{2}$/);
    }
  });
});
