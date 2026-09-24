// home/sitemap-home.xml の <lastmod> が、そのHTMLの最終変更日より古くないか。
//
// 仕様: docs/features/sitemap-lastmod-guardrail.md の「A」
//
// `scripts/indexnow-submit.mjs` は前回と今回のサイトマップを <loc> ＋ <lastmod> で
// 突き合わせ、**新規か lastmod が動いたURLだけ**を Bing へ送ります。
// home/ にはビルド工程が無いので lastmod は人が手で上げる約束ですが、
// 据え置いても何も落ちませんでした。実際 #243（2026-09-19、トップにツール6本の
// カードを追加）は lastmod が 2026-09-09 のままで、**差分に入らず通知されていません**。
// その再発をここで止めます。
//
// 対象は sitemap-home.xml に載っている **HTMLページだけ**です。
// find.js / analytics.js / BingSiteAuth.xml などの同梱アセットや、
// サイトマップに載せていない 404.html は対象外（仕様書の「やらないこと」）。
//
// 整形だけの変更でも `git log` の日付は動くので、このテストは
// 「中身は変わっていないのに lastmod を上げろ」と言うことがあります。
// **それは許容する**（空振りの送信が最大3URL増えるだけ）と決めてあります（A-3）。
// 内容ハッシュで判定する仕組みを作り込まないこと。

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseEntries } from '../lib/sitemap.mjs';

const root = new URL('../../', import.meta.url);
const repoPath = (path) => fileURLToPath(new URL(path, root));

const SITE = 'https://hasokon.com/';

const git = (...args) => execFileSync('git', args, { cwd: repoPath('.'), encoding: 'utf8' }).trim();

/** 浅いクローンか。depth 1 では「tipコミットが全ファイルを作成した」ことになる。 */
function isShallowRepository() {
  return git('rev-parse', '--is-shallow-repository') === 'true';
}

/**
 * ファイルの最終変更日（yyyy-mm-dd）。履歴に無ければ空文字。
 *
 * **%ad（author date）を使う。%cd にはしない。** squash マージでは committer date が
 * マージ日に動くので、「PR作成日に lastmod を上げた → 翌日マージ」で誤検知して落ちる。
 * author date は squash でも残るので、起票日に書いておけば数日後のマージでも通る。
 *
 * `--date=short` は**コミットに記録された author のタイムゾーンで**日付を出す
 * （このリポジトリは +0900。`--date=short-local` にすると閲覧側のTZになる）。
 * つまり lastmod を書くときと同じ JST の日付が出るので、**CI のTZに依存しない**。
 * 仕様書 A-2 は「CI は UTC なので安全側に倒れる」と書いているが、
 * そもそもずれない（`short-local` にしない限り）。
 */
function lastChangedAt(file) {
  return git('log', '-1', '--format=%ad', '--date=short', '--', file);
}

/** sitemap-home.xml の <loc> を、リポジトリ内のファイルパスに直す。`/` はトップ。 */
function fileForLoc(loc) {
  assert.ok(loc.startsWith(SITE), `hasokon.com のURLではありません: ${loc}`);
  const path = loc.slice(SITE.length);
  return `home/${path === '' ? 'index.html' : path}`;
}

/**
 * lastmod が据え置かれているURLだけを返す純粋関数。
 *
 * `changedAt(loc)` は yyyy-mm-dd を返す。どちらもISOの日付なので文字列比較でよい。
 * lastmod が無いURLも「比較できない」ので据え置き扱いにする。
 */
function staleEntries(entries, changedAt) {
  return entries
    .map((entry) => ({ ...entry, changedAt: changedAt(entry.loc) }))
    .filter((entry) => !entry.lastmod || entry.changedAt > entry.lastmod);
}

describe('staleEntries', () => {
  const entries = [
    { loc: `${SITE}`, lastmod: '2026-09-19' },
    { loc: `${SITE}privacy.html`, lastmod: '2026-08-19' },
  ];

  it('変更日が lastmod より新しいURLだけを返す', () => {
    const changedAt = (loc) => (loc === SITE ? '2026-09-19' : '2026-09-17');
    assert.deepEqual(staleEntries(entries, changedAt), [
      { loc: `${SITE}privacy.html`, lastmod: '2026-08-19', changedAt: '2026-09-17' },
    ]);
  });

  it('同じ日なら据え置きではない', () => {
    assert.deepEqual(staleEntries([{ loc: SITE, lastmod: '2026-09-19' }], () => '2026-09-19'), []);
  });

  it('lastmod のほうが新しいのは通す（先に上げてからHTMLを直しても落とさない）', () => {
    assert.deepEqual(staleEntries([{ loc: SITE, lastmod: '2026-09-30' }], () => '2026-09-19'), []);
  });

  it('月・年をまたいでも文字列比較で正しい', () => {
    assert.deepEqual(
      staleEntries([{ loc: SITE, lastmod: '2026-09-30' }], () => '2026-10-01').map((e) => e.loc),
      [SITE],
    );
  });

  it('lastmod が無いURLは据え置き扱い', () => {
    assert.deepEqual(
      staleEntries([{ loc: SITE, lastmod: null }], () => '2026-09-19').map((e) => e.loc),
      [SITE],
    );
  });
});

describe('fileForLoc', () => {
  it('トップは home/index.html', () => {
    assert.equal(fileForLoc(SITE), 'home/index.html');
  });

  it('その他のページはファイル名そのまま', () => {
    assert.equal(fileForLoc(`${SITE}privacy.html`), 'home/privacy.html');
  });

  it('hasokon.com 以外は受け付けない', () => {
    assert.throws(() => fileForLoc('https://example.com/'));
  });
});

describe('home/sitemap-home.xml の lastmod（実物）', () => {
  const entries = parseEntries(readFileSync(repoPath('home/sitemap-home.xml'), 'utf8'));

  it('URLが載っている（このテストが何も見張らなくなるのを防ぐ）', () => {
    assert.ok(entries.length >= 3, `sitemap-home.xml のURLが少なすぎます: ${entries.length} 件`);
  });

  it('lastmod はすべて yyyy-mm-dd（この書式を前提に文字列比較している）', () => {
    for (const entry of entries) {
      assert.match(entry.lastmod ?? '', /^\d{4}-\d{2}-\d{2}$/, `lastmod がありません: ${entry.loc}`);
    }
  });

  it('履歴を全部持っている（浅いクローンでは判定できないので落とす）', () => {
    // 黙って飛ばさない。飛ばすと「ガードレールが効いていない」のか
    // 「守られている」のか区別がつかず、再発を止められなくなる（A-1）。
    assert.equal(
      isShallowRepository(),
      false,
      '浅いクローンなので lastmod の据え置きを判定できません。' +
        'CI なら actions/checkout に fetch-depth: 0 を、手元なら git fetch --unshallow を。',
    );
  });

  it('各URLに対応するHTMLがある', () => {
    for (const entry of entries) {
      const file = fileForLoc(entry.loc);
      assert.ok(
        existsSync(repoPath(file)),
        `${entry.loc} に対応するファイルが見つかりません: ${file}。` +
          'HTML以外のURLを載せたなら、このテストの fileForLoc を直すこと',
      );
    }
  });

  it('HTMLの最終変更日より古い lastmod が無い', () => {
    assert.equal(isShallowRepository(), false, '浅いクローンでは判定できません（上のテスト参照）');

    const changedAt = (loc) => {
      const file = fileForLoc(loc);
      const date = lastChangedAt(file);
      assert.notEqual(date, '', `${file} が git の履歴にありません（commit してから再実行してください）`);
      return date;
    };

    const stale = staleEntries(entries, changedAt);
    assert.deepEqual(
      stale,
      [],
      stale
        .map(
          (entry) =>
            `${entry.loc} は ${entry.changedAt} に変わっているのに lastmod が ${entry.lastmod} のまま。` +
            `home/sitemap-home.xml の lastmod を ${entry.changedAt} に上げてください` +
            '（据え置くと IndexNow の差分に入らず、Bing に更新が通知されません）',
        )
        .join('\n'),
    );
  });
});
