import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadChapters, loadSubjects, parseRegistry, readRepoFile } from '../lib/registry.mjs';

/**
 * llms.txt（AIアシスタント向けのサイト案内）のテスト。
 *
 * 仕様: docs/features/llms-txt.md
 *       docs/features/ai-assistant-channel.md の B（セクション別への分割）
 *
 * **2026-09-24 に役目が変わった。** それまでは「手書きの `home/llms.txt` と
 * registry の食い違い（載せ忘れ・死んだリンク）」を検知していたが、
 * 個々のツール・ゲーム・章の行は各アプリが registry / curriculum から
 * **生成する**ようになった（`{tools,games,learn}/lib/llms.ts`）。
 * 載せ忘れはもう起きえないので、守りは検知側から生成側へ移してある
 * （`{tools,games,learn}/tests/llms.test.ts`）。
 *
 * ここで見張るのは **`home/llms.txt` が入口だけの案内板であり続けること**：
 *
 * - 個々のツール・ゲーム・章の行を持たない（持つと二重管理になり、
 *   `home/` にはビルド工程が無いので必ず腐る）
 * - 子ファイル3本（/tools/・/games/・/learn/ の llms.txt）を指している
 * - 日付を持たない（仕様書 B-3。手書きの日付は据え置かれて嘘になる）
 */

const repoRoot = new URL('../../', import.meta.url);
const read = readRepoFile;
const exists = (path) => existsSync(fileURLToPath(new URL(path, repoRoot)));

const LLMS_TXT = read('home/llms.txt');
const ORIGIN = 'https://hasokon.com';

/** 子ファイル。各アプリが `app/llms.txt/route.ts` で生成して配る */
const CHILDREN = [
  { url: `${ORIGIN}/tools/llms.txt`, source: 'tools/app/llms.txt/route.ts', lib: 'tools/lib/llms.ts' },
  { url: `${ORIGIN}/games/llms.txt`, source: 'games/app/llms.txt/route.ts', lib: 'games/lib/llms.ts' },
  { url: `${ORIGIN}/learn/llms.txt`, source: 'learn/app/llms.txt/route.ts', lib: 'learn/lib/llms.ts' },
];

// ---------------------------------------------------------------- registry

const TOOLS = parseRegistry(read('tools/lib/registry.ts'), 'tools');
const GAMES = parseRegistry(read('games/lib/registry.ts'), 'games');
const CHAPTERS = loadChapters();
const SUBJECTS = loadSubjects();

// ---------------------------------------------------------------- llms.txt

/** `- [名前](URL): 説明` の行をすべて拾う */
function linkLines() {
  const out = [];
  for (const line of LLMS_TXT.split('\n')) {
    if (!line.startsWith('- ')) continue;
    const m = /^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/.exec(line);
    assert.ok(m, `箇条書きの書式が違う（"- [名前](URL): 説明" で書くこと）: ${line}`);
    out.push({ label: m[1], url: m[2], description: (m[3] ?? '').trim() });
  }
  return out;
}

const LINKS = linkLines();

/**
 * URLに対応する実ファイル。存在しなければリンク切れ。
 * home/ は素のHTML、tools / games / learn は Next.js の app ディレクトリ。
 */
function sourceOf(url) {
  const path = url.slice(ORIGIN.length);
  if (path === '/') return 'home/index.html';
  if (/^\/[\w.-]+\.html$/.test(path)) return `home${path}`;

  const child = CHILDREN.find((c) => c.url === url);
  if (child) return child.source;

  const m = /^\/(tools|games|learn)\/(.*)$/.exec(path);
  if (!m) return null;
  return `${m[1]}/app/${m[2]}page.tsx`;
}

// ---------------------------------------------------------------- テスト

describe('llms.txt の形式', () => {
  it('llmstxt.org の形（H1 → 要約の引用 → セクション別のリンク集）になっている', () => {
    const lines = LLMS_TXT.split('\n');
    assert.equal(lines[0], '# hasokon.com', '1行目はサイト名のH1');
    assert.ok(
      lines.slice(1, 4).some((l) => l.startsWith('> ')),
      'H1の直後にサイトの要約（引用ブロック）が要る',
    );
    assert.ok(LLMS_TXT.endsWith('\n'), '末尾は改行で終わる');
  });

  it('セクションは ツール / ゲーム / 学ぶ と Optional', () => {
    // 子ファイルは `## Optional` から指さない。llmstxt.org の Optional は
    // 「短い文脈が必要なら飛ばしてよい」という意味で、そこに置くと
    // いちばん読ませたいものを自分で降格させることになる（仕様書 B-2b）
    const headings = LLMS_TXT.split('\n')
      .filter((l) => l.startsWith('## '))
      .map((l) => l.slice(3));
    assert.deepEqual(headings, ['ツール', 'ゲーム', '学ぶ', 'Optional']);
  });

  it('Optional にあるのは副次的なものだけ（運営者情報・プライバシー・問い合わせ）', () => {
    const optional = LLMS_TXT.slice(LLMS_TXT.indexOf('## Optional'));
    for (const child of CHILDREN) {
      assert.ok(!optional.includes(child.url), `子ファイルが Optional にある: ${child.url}`);
    }
  });

  it('すべてのURLが hasokon.com の絶対URL', () => {
    // 相対パスを解決できないクローラーがいる。canonical とも表記を揃える
    for (const { url } of LINKS) {
      assert.ok(url.startsWith(`${ORIGIN}/`), `絶対URLで書くこと: ${url}`);
    }
  });

  it('ページのURLは末尾スラッシュつき（canonical と同じ表記）', () => {
    for (const { url } of LINKS) {
      if (/\.\w+$/.test(url)) continue; // privacy.html・llms.txt のような実ファイル
      assert.ok(url.endsWith('/'), `末尾スラッシュが要る: ${url}`);
    }
  });

  it('すべてのリンクに1行説明がついている', () => {
    // AIはリンク文字列だけでなく説明文を根拠に引用先を選ぶ。ここが本体
    for (const { label, description } of LINKS) {
      assert.ok(description.length > 0, `「${label}」に説明がない`);
    }
  });

  it('同じURLが二度出てこない', () => {
    const seen = new Set();
    for (const { url } of LINKS) {
      assert.ok(!seen.has(url), `URLが重複している: ${url}`);
      seen.add(url);
    }
  });
});

describe('llms.txt のリンク先', () => {
  it('すべて実在するページ・ルートを指している', () => {
    for (const { url } of LINKS) {
      const src = sourceOf(url);
      assert.ok(src, `どのページか解決できないURL: ${url}`);
      assert.ok(exists(src), `リンク切れ: ${url}（${src} が無い）`);
    }
  });
});

describe('home/llms.txt は入口だけの案内板', () => {
  it('子ファイル3本（tools / games / learn の llms.txt）を指している', () => {
    const listed = new Set(LINKS.map((l) => l.url));
    for (const { url, lib } of CHILDREN) {
      assert.ok(listed.has(url), `子ファイルへの行が無い: ${url}`);
      assert.ok(exists(lib), `子ファイルを組み立てる ${lib} が無い`);
    }
  });

  it('個々のツール・ゲーム・章の行を持たない（生成側に任せる）', () => {
    // ここに1行ずつ書き写すと、registry と二重管理になる。
    // `home/` にはビルド工程が無いので、ずれても誰も気づけない
    const entries = [
      ...TOOLS.map((t) => ({ url: `${ORIGIN}/tools/${t.slug}/`, name: t.name })),
      ...GAMES.map((g) => ({ url: `${ORIGIN}/games/${g.slug}/`, name: g.name })),
      ...CHAPTERS.map((c) => ({ url: `${ORIGIN}/${c.path}`, name: c.name })),
    ];
    for (const { url, name } of entries) {
      assert.ok(
        !LLMS_TXT.includes(url),
        `個々のページの行が home/llms.txt にある: ${url}（${name}）。` +
          '行は各アプリの lib/llms.ts が registry から生成する',
      );
    }
  });

  it('分野（/learn/{subject}/）の行も持たない', () => {
    for (const s of SUBJECTS) {
      assert.ok(!LLMS_TXT.includes(`${ORIGIN}/${s.path}`), `分野の行がある: ${s.path}`);
    }
  });

  it('日付を持たない（手書きの日付は据え置かれて嘘になる）', () => {
    // 仕様書 B-3。`home/` にはビルド工程が無く、sitemap-home.xml の lastmod で
    // 実際に起きた腐りかた（中身を変えたのに日付が据え置き）をここでも繰り返さない
    const dates = LLMS_TXT.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    assert.deepEqual(dates, [], `home/llms.txt に日付がある: ${dates.join(' / ')}`);
    // 「最終更新日つきで並べたもの」のように、子ファイルの説明として
    // 語そのものが出るのはよい。禁じるのは日付そのもの
    assert.ok(!/最終更新\s*\d/.test(LLMS_TXT), 'home/llms.txt に最終更新日を書かない');
  });

  it('短いまま保つ（入口が長いと子ファイルを読ませる意味が無い）', () => {
    const links = LINKS.length;
    assert.ok(links <= 12, `入口にしてはリンクが多い（${links}件）。子ファイルへ移すこと`);
  });
});

describe('各アプリの llms.txt（生成側）', () => {
  it('3アプリとも静的なルートハンドラを持つ', () => {
    for (const { source } of CHILDREN) {
      assert.ok(exists(source), `${source} が無い`);
      const src = read(source);
      // 静的エクスポート（output: 'export'）なので動的関数を使えない（仕様書 B-2c）
      assert.ok(src.includes("export const dynamic = 'force-static'"), `${source} が静的でない`);
      assert.ok(/export function GET\(\)/.test(src), `${source} の GET は引数を取らない`);
    }
  });

  it('生成は public を通す（registry を直に filter しない）', () => {
    // CLAUDE.md の約束。いま公開前のものが tools 2件・games 6件あり、
    // 直に舐めるとそれがAIアシスタントに配られる
    const guards = [
      { lib: 'tools/lib/llms.ts', must: 'publicTools', mustNot: /\btools\.filter\b/ },
      { lib: 'games/lib/llms.ts', must: 'publicGames', mustNot: /\bgames\.filter\b/ },
      { lib: 'learn/lib/llms.ts', must: 'publicChapters', mustNot: /\bchapters\.filter\b/ },
    ];
    for (const { lib, must, mustNot } of guards) {
      const src = read(lib);
      assert.ok(src.includes(must), `${lib} が ${must} を通していない`);
      assert.ok(!mustNot.test(src), `${lib} が registry を直に filter している`);
    }
  });

  it('レジストリを読めている（書式を変えたら parseRegistry も直す）', () => {
    assert.ok(TOOLS.length >= 15, `ツールの読み取り件数が不自然: ${TOOLS.length}`);
    assert.ok(GAMES.length >= 8, `ゲームの読み取り件数が不自然: ${GAMES.length}`);
    assert.ok(CHAPTERS.length >= 30, `章の読み取り件数が不自然: ${CHAPTERS.length}`);
    assert.ok(SUBJECTS.length >= 1, `分野の読み取り件数が不自然: ${SUBJECTS.length}`);
    for (const e of [...TOOLS, ...GAMES, ...CHAPTERS, ...SUBJECTS]) {
      assert.ok(e.slug && e.name, `slug/name を読めていないエントリがある: ${JSON.stringify(e)}`);
    }
  });
});
