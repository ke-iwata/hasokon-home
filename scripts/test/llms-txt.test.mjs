import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * llms.txt（AIアシスタント向けのサイト案内）のテスト。
 *
 * 仕様: docs/features/llms-txt.md
 *
 * 見張っているのは**リンク切れと載せ忘れ**。llms.txt は手書きの静的ファイルで、
 * ビルド工程もリンクチェックも通らないため、ツールを増やしたときの追記漏れや
 * slug変更による死んだリンクを機械で拾える場所がここしかない。
 * 判定の基準は tools / games の registry（一覧・sitemap と同じ単一の情報源）。
 */

const repoRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');
const exists = (path) => existsSync(fileURLToPath(new URL(path, repoRoot)));

const LLMS_TXT = read('home/llms.txt');
const ORIGIN = 'https://hasokon.com';

// ---------------------------------------------------------------- registry

/**
 * registry.ts の配列（tools / games）から slug・name・stage を読み取る。
 *
 * TypeScript をそのまま import できないので字面から拾っている。
 * 書き方を変えて読めなくなったら「エントリが少なすぎる」で落ちるようにしてある
 * （黙って0件になり、テストが何も見張らなくなるのを防ぐため）。
 */
function parseRegistry(source, arrayName) {
  const open = source.indexOf(`export const ${arrayName}`);
  assert.ok(open >= 0, `${arrayName} の定義が見つからない`);
  const body = source.slice(open, source.indexOf('\n];', open));

  return body
    .split(/\n  \{\n/)
    .slice(1)
    .map((chunk) => {
      const block = chunk.split(/\n  \},?/)[0];
      const pick = (re) => (block.match(re) ?? [])[1];
      return {
        slug: pick(/slug:\s*'([^']+)'/),
        name: pick(/name:\s*'([^']+)'/),
        // 公開の段階（docs/features/feature-flags.md）。
        // `public` 以外は llms.txt に載せない
        stage: (block.match(/stage:\s*'([^']+)'/) ?? [])[1],
      };
    });
}

const TOOLS = parseRegistry(read('tools/lib/registry.ts'), 'tools');
const GAMES = parseRegistry(read('games/lib/registry.ts'), 'games');

/** 公開中のページ（URL → 表示名）。llms.txt に載っていなければならないもの */
const PUBLISHED = new Map([
  ...TOOLS.filter((t) => t.stage === 'public').map((t) => [`${ORIGIN}/tools/${t.slug}/`, t.name]),
  ...GAMES.filter((g) => g.stage === 'public').map((g) => [`${ORIGIN}/games/${g.slug}/`, g.name]),
]);

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
 * home/ は素のHTML、tools/games は Next.js の app ディレクトリ。
 */
function sourceOf(url) {
  const path = url.slice(ORIGIN.length);
  if (path === '/') return 'home/index.html';
  if (/^\/[\w.-]+\.html$/.test(path)) return `home${path}`;

  const m = /^\/(tools|games)\/(.*)$/.exec(path);
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
    assert.ok(
      LLMS_TXT.split('\n').filter((l) => l.startsWith('## ')).length >= 2,
      'ツールとゲームのセクションが要る',
    );
    assert.ok(LLMS_TXT.endsWith('\n'), '末尾は改行で終わる');
  });

  it('リンクを1本以上読み取れている', () => {
    // 書式を変えて正規表現が空振りしたら、以降のテストが素通りしてしまう
    assert.ok(LINKS.length >= PUBLISHED.size, `リンクが少なすぎる（${LINKS.length}件）`);
  });

  it('すべてのURLが hasokon.com の絶対URL', () => {
    // 相対パスを解決できないクローラーがいる。canonical とも表記を揃える
    for (const { url } of LINKS) {
      assert.ok(url.startsWith(`${ORIGIN}/`), `絶対URLで書くこと: ${url}`);
    }
  });

  it('ページのURLは末尾スラッシュつき（canonical と同じ表記）', () => {
    for (const { url } of LINKS) {
      if (/\.\w+$/.test(url)) continue; // privacy.html のような実ファイル
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
  it('すべて実在するページを指している', () => {
    for (const { url } of LINKS) {
      const src = sourceOf(url);
      assert.ok(src, `どのページか解決できないURL: ${url}`);
      assert.ok(exists(src), `リンク切れ: ${url}（${src} が無い）`);
    }
  });

  it('公開前・削除済みのツールやゲームを載せていない', () => {
    const published = new Set(
      [...TOOLS, ...GAMES].filter((e) => e.stage === 'public').map((e) => e.slug),
    );
    for (const { url } of LINKS) {
      const m = /\/(?:tools|games)\/([^/]+)\/$/.exec(url);
      if (!m) continue;
      if (['about', 'privacy', 'contact'].includes(m[1])) continue; // 固定ページ
      assert.ok(published.has(m[1]), `registry に公開中のエントリが無い: ${url}`);
    }
  });
});

describe('llms.txt と registry の同期', () => {
  it('レジストリを読めている（書式を変えたら parseRegistry も直す）', () => {
    assert.ok(TOOLS.length >= 15, `ツールの読み取り件数が不自然: ${TOOLS.length}`);
    assert.ok(GAMES.length >= 8, `ゲームの読み取り件数が不自然: ${GAMES.length}`);
    for (const e of [...TOOLS, ...GAMES]) {
      assert.ok(e.slug && e.name, `slug/name を読めていないエントリがある: ${JSON.stringify(e)}`);
    }
  });

  it('公開中のツール・ゲームがすべて載っている', () => {
    const listed = new Set(LINKS.map((l) => l.url));
    for (const [url, name] of PUBLISHED) {
      assert.ok(listed.has(url), `「${name}」が llms.txt に無い（増やしたら1行足すこと）: ${url}`);
    }
  });

  it('リンク文字列がレジストリの名前と一致する', () => {
    // 改名したときに llms.txt だけ古い名前で残るのを防ぐ
    for (const { label, url } of LINKS) {
      const name = PUBLISHED.get(url);
      if (!name) continue; // 固定ページはレジストリに無い
      assert.equal(label, name, `${url} の表記がレジストリとずれている`);
    }
  });
});
