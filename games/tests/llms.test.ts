import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildLlmsTxt } from '@/lib/llms';
import { games, publicGames, SITE_URL } from '@/lib/registry';

/**
 * `/games/llms.txt`（AIアシスタント向けのゲームの一覧）のテスト。
 *
 * 仕様: docs/features/ai-assistant-channel.md の B-1 / B-2 / B-3
 *
 * **見張りの本体は「公開前のものが混ざらないこと」。**
 * `stage` が `public` 以外のゲームはページに `noindex` が付くが、
 * **llms.txt は robots と別経路なので止まらない**。ここで漏らすと、
 * 作りかけのゲームがそのままAIアシスタントに配られる。
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
    expect(lines[0]).toBe('# 無料ミニゲーム集（hasokon.com/games/）');
    expect(lines.slice(1, 4).some((l) => l.startsWith('> '))).toBe(true);
    expect(lines.filter((l) => l.startsWith('## ')).length).toBeGreaterThanOrEqual(2);
    expect(TXT.endsWith('\n')).toBe(true);
    expect(TXT).not.toMatch(/\n\n\n/);
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
});

describe('公開前のゲームを出さない（stage）', () => {
  it('出ているゲームは publicGames と過不足なく一致する', () => {
    const listed = LINKS.map((l) => l.url).filter((url) => url.startsWith(`${SITE_URL}/`));
    const expected = publicGames.map((g) => `${SITE_URL}/${g.slug}/`);
    // 問い合わせ先はサイト全体で `/tools/contact/` に寄せてある（home/index.html と同じ）
    expect(new Set(listed)).toEqual(new Set([...expected, `${SITE_URL}/`]));
  });

  it('wip / preview のゲームが1件も混ざっていない', () => {
    const unreleased = games.filter((g) => g.stage !== 'public');
    // 見張りが空振りしていないこと。公開前が0件になったら、
    // このテストは何も確かめていないので気づけるようにしておく
    expect(unreleased.length, '公開前のゲームが0件（このテストは素通りしている）').toBeGreaterThan(
      0,
    );
    for (const g of unreleased) {
      expect(TXT.includes(`/${g.slug}/`), `公開前のゲームが llms.txt に出ている: ${g.slug}`).toBe(
        false,
      );
      expect(TXT.includes(g.name), `公開前のゲーム名が llms.txt に出ている: ${g.name}`).toBe(false);
    }
  });

  it('生成は publicGames を通している（registry を直に filter しない）', () => {
    // CLAUDE.md の約束。読み手が `games` を舐める形に書き換えたら落とす
    expect(libSrc).toMatch(/import \{[^}]*publicGames/s);
    expect(libSrc).not.toMatch(/\bgames\.filter\b/);
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

describe('ルール・設定の手がかり（keywords）', () => {
  it('公開中のゲームはすべて keywords を持つ', () => {
    for (const g of publicGames) {
      expect(g.keywords?.length ?? 0, `${g.slug} に keywords が無い`).toBeGreaterThan(0);
    }
  });

  it('keywords はページ本文にある語だけ（新しい説明を書かない）', () => {
    // 仕様書 B-1 の「その語を出すだけでよい（新しい文章は書かない）」。
    // ページに無い機能を llms.txt で約束してしまうのを機械で止める
    for (const g of publicGames) {
      const src = readFileSync(`${appDir}${g.slug}/page.tsx`, 'utf8');
      for (const word of g.keywords ?? []) {
        expect(src.includes(word), `${g.slug} のページに「${word}」が無い`).toBe(true);
      }
    }
  });

  it('大富豪の行にローカルルールが並ぶ（AI経由の流入1位）', () => {
    const line = TXT.split('\n').find((l) => l.includes('/games/daifugo/'));
    expect(line).toBeDefined();
    for (const word of ['8切り', '革命', '都落ち']) {
      expect(line!.includes(word), `大富豪の行に「${word}」が無い`).toBe(true);
    }
  });
});

describe('最終更新日（B-3）', () => {
  it('ゲームの行には registry の updatedAt が入る', () => {
    for (const g of publicGames) {
      const line = TXT.split('\n').find((l) => l.includes(`${SITE_URL}/${g.slug}/`));
      expect(line, `${g.slug} の行が無い`).toBeDefined();
      expect(line!.includes(`最終更新 ${g.updatedAt}`), `${g.slug} の最終更新日が違う`).toBe(true);
    }
  });

  it('日付は registry の形（YYYY-MM-DD）でだけ出る', () => {
    for (const stamp of TXT.match(/最終更新 [^）]*/g) ?? []) {
      expect(stamp).toMatch(/^最終更新 \d{4}-\d{2}-\d{2}$/);
    }
  });
});
