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
    // learn（投資の教科書）の章は name ではなく title で持っている
    title: pick(/title:\s*'([^']+)'/),
    // learn の章だけが持つ、属する分野の slug
    subject: pick(/subject:\s*'([^']+)'/),
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
    // 表示名は tools / games が `name`、learn の章が `title`。どちらか一方があればよい
    if (!e.slug || !(e.name || e.title) || !e.stage) {
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

/**
 * learn（投資の教科書）の章を読む。
 *
 * **`loadRegistries()` には混ぜない。** あちらは
 * `scripts/build-test-home.mjs` がテスト環境の一覧を作るのに使っていて、
 * ツール・ゲームの `category` を前提にしている。章には category が無いので、
 * 混ぜるとその組み立てが壊れる。読みたい側（llms.txt のテスト）から直接呼ぶ。
 *
 * 表示名は `title`。`name` に読み替えて、ツール・ゲームと同じ形で返す。
 *
 * **URLは `/learn/{subject}/{slug}/` の3階層**（分野を1段挟んである）。
 * `path` にその相対パスを入れて返すので、呼ぶ側で組み立てない。
 */
export function loadChapters() {
  return parseRegistry(readRepoFile('learn/lib/curriculum.ts'), 'chapters', 30).map((e) => ({
    ...e,
    name: e.title,
    kind: 'learn',
    path: `learn/${e.subject}/${e.slug}/`,
  }));
}

/** learn の分野（`/learn/{slug}/`）。章とは別に一覧・sitemap に出る */
export function loadSubjects() {
  return parseRegistry(readRepoFile('learn/lib/curriculum.ts'), 'subjects', 1).map((e) => ({
    ...e,
    kind: 'learn-subject',
    path: `learn/${e.slug}/`,
  }));
}

/** 本番に出していないもの（`stage` が `public` 以外）。テスト環境の一覧に足す対象 */
export function unreleasedEntries() {
  return loadRegistries().filter((e) => e.stage !== 'public');
}
