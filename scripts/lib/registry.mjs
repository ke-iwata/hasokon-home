import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * tools / games の `lib/registry.ts` を読むための共通の入り口。
 *
 * registry はツール・ゲームの**単一の情報源**（各 CLAUDE.md）だが、
 * `home/` と `scripts/` は素のJSなので TypeScript をそのまま import できない。
 * そのため字面から拾っている。**同じ読み取りを2か所に書かない**ために
 * ここに集約してある（`scripts/test/llms-txt.test.mjs` と
 * `scripts/build-test-home.mjs` が使う）。
 *
 * 書き方を変えて読めなくなったときは、黙って0件になるのではなく
 * 例外で落ちる。0件になると、これを使う側のテストが
 * 「何も見張っていないのに通る」状態になるため。
 */

const repoRoot = new URL('../../', import.meta.url);

/** リポジトリ直下からの相対パスで読む */
export function readRepoFile(path) {
  return readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');
}

/** registry の1エントリから読み取る項目 */
function entryOf(block) {
  const pick = (re) => (block.match(re) ?? [])[1];
  return {
    slug: pick(/slug:\s*'([^']+)'/),
    name: pick(/name:\s*'([^']+)'/),
    description: pick(/description:\s*'([^']*)'/),
    // ツールだけが持つ分類。ゲームには無い
    category: pick(/category:\s*'([^']+)'/),
    // 公開の段階（docs/features/feature-flags.md）。
    // `public` 以外は一覧・sitemap・llms.txt に出さない
    stage: pick(/stage:\s*'([^']+)'/),
  };
}

/**
 * `export const <arrayName>` の配列からエントリを読み取る。
 *
 * @param source registry.ts の中身
 * @param arrayName 配列の名前（`tools` / `games`）
 * @param minEntries これを下回ったら読み取りが壊れたとみなして落とす
 */
export function parseRegistry(source, arrayName, minEntries = 10) {
  const open = source.indexOf(`export const ${arrayName}`);
  if (open < 0) throw new Error(`${arrayName} の定義が見つからない`);
  const body = source.slice(open, source.indexOf('\n];', open));

  const entries = body
    .split(/\n  \{\n/)
    .slice(1)
    .map((chunk) => entryOf(chunk.split(/\n  \},?/)[0]));

  if (entries.length < minEntries) {
    throw new Error(
      `${arrayName} を ${entries.length} 件しか読めなかった（registry.ts の書き方が変わった可能性）`,
    );
  }
  for (const e of entries) {
    if (!e.slug || !e.name || !e.stage) {
      throw new Error(`${arrayName} のエントリを読み切れない: ${JSON.stringify(e)}`);
    }
  }
  return entries;
}

/** tools と games の registry をまとめて読む。`kind` で区別できるようにしておく */
export function loadRegistries() {
  return [
    ...parseRegistry(readRepoFile('tools/lib/registry.ts'), 'tools').map((e) => ({
      ...e,
      kind: 'tools',
    })),
    ...parseRegistry(readRepoFile('games/lib/registry.ts'), 'games').map((e) => ({
      ...e,
      kind: 'games',
    })),
  ];
}

/** 本番に出していないもの（`stage` が `public` 以外）。テスト環境の一覧に足す対象 */
export function unreleasedEntries() {
  return loadRegistries().filter((e) => e.stage !== 'public');
}
