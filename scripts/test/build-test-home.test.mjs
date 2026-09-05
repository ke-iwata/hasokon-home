import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildTestHome } from '../build-test-home.mjs';
import { loadRegistries, readRepoFile, unreleasedEntries } from '../lib/registry.mjs';

/**
 * テスト環境向けのトップの一覧のテスト。
 *
 * 仕様: docs/features/test-home-unreleased.md
 *
 * 見張っているのは2つ。
 *
 * 1. **本番のHTMLに未公開のものが混ざっていないこと。** 未公開ページは `noindex`
 *    なので、本番のトップからリンクすると feature-flags の建て付けと食い違う。
 *    差し込みはデプロイ時にテスト環境向けだけで走るが、うっかり
 *    `home/index.html` に commit してしまう事故をここで止める
 * 2. **テスト環境向けの差し込みが registry と食い違わないこと。** 件数のずれは
 *    `.quicknav` の数字にも出るので、そこまで合っているかを見る
 */

const INDEX_HTML = readRepoFile('home/index.html');
const UNRELEASED = unreleasedEntries();

/** カードの枚数（公開中・未公開・アプリを合わせた数） */
function countCards(html) {
  return (html.match(/class="card"|class="card card-unreleased"|class="app-card"/g) || []).length;
}

describe('本番の home/index.html', () => {
  it('テスト環境向けの差し込みが commit されていない', () => {
    assert.ok(
      !INDEX_HTML.includes('data-testenv-only'),
      'home/index.html にテスト環境向けの差し込みが入っている。' +
        'これは deploy.yml がテスト環境に配るときだけ足すもので、commit してはいけない',
    );
    assert.ok(!INDEX_HTML.includes('badge-unreleased'));
    assert.ok(!INDEX_HTML.includes('testenv-banner'));
  });

  it('未公開ページ（noindex）へのリンクを持たない', () => {
    // 本番のトップから noindex のページへリンクすると、
    // 「一覧・sitemap から外す」という feature-flags の建て付けが崩れる
    for (const entry of UNRELEASED) {
      const href = `/${entry.kind}/${entry.slug}/`;
      assert.ok(
        !INDEX_HTML.includes(`href="${href}"`),
        `本番のトップが未公開ページにリンクしている: ${href}（stage: ${entry.stage}）`,
      );
    }
  });
});

describe('buildTestHome — テスト環境向けの差し込み', () => {
  const built = buildTestHome(INDEX_HTML);

  it('公開前のものが1つ残らずカードになる', () => {
    assert.ok(UNRELEASED.length > 0, '公開前のものが1つも無い（このテストが何も見張らなくなる）');
    for (const entry of UNRELEASED) {
      const href = `/${entry.kind}/${entry.slug}/`;
      assert.ok(built.includes(`href="${href}"`), `一覧に出ていない: ${href}`);
    }
    assert.equal((built.match(/class="card card-unreleased"/g) || []).length, UNRELEASED.length);
  });

  it('公開中のものは1枚も増減しない', () => {
    assert.equal(countCards(built), countCards(INDEX_HTML) + UNRELEASED.length);
  });

  it('どのカードにも「本番未公開」の印と stage が付く', () => {
    const cards = built.match(/<a class="card card-unreleased"[\s\S]*?<\/a>/g) || [];
    assert.equal(cards.length, UNRELEASED.length);
    for (const card of cards) {
      assert.match(card, /badge-unreleased">本番未公開</, `印が無いカードがある: ${card}`);
      assert.match(card, /data-stage="(preview|wip)"/, `stage が無いカードがある: ${card}`);
    }
  });

  it('テスト環境であることの帯が出る', () => {
    assert.ok(built.includes('class="testenv-banner"'));
    assert.ok(built.includes('ここはテスト環境です'));
  });

  it('`.quicknav` の件数が実際のカードの枚数と合う', () => {
    const nav = built.match(/<nav class="quicknav"[\s\S]*?<\/nav>/);
    assert.ok(nav, '分類への近道が無い');

    const re = /<a href="#([^"]+)">[^<]*<b>(\d+)<\/b><\/a>/g;
    let m;
    let checked = 0;
    while ((m = re.exec(nav[0])) !== null) {
      const [, id, shown] = m;
      const open = built.indexOf(`<section id="${id}">`);
      const next = built.indexOf('<section ', open + 1);
      const block = built.slice(open, next < 0 ? built.indexOf('</main>', open) : next);
      assert.equal(
        Number(shown),
        countCards(block),
        `#${id} の件数が一覧と合っていない（表示 ${shown}）`,
      );
      checked += 1;
    }
    assert.ok(checked >= 4, `分類が ${checked} 個しか読めなかった`);
  });

  it('2回かけても二重に増えない', () => {
    assert.equal(buildTestHome(built), built);
  });

  it('説明はカード1枚に収まる長さに詰める', () => {
    // registry の説明文をそのまま出すと、そのカードだけ背が高くなって
    // 一覧の並びが崩れる（公開中のカードの説明はだいたい30文字前後）
    // 見るのは差し込んだカードだけ。公開中のカードの説明は手書きなので対象外
    for (const card of built.match(/<a class="card card-unreleased"[\s\S]*?<\/a>/g) || []) {
      const text = (card.match(/<span class="card-desc">([^<]*)<\/span>/) ?? ['', ''])[1];
      assert.ok(text.length > 0, `説明が空のカードがある: ${card}`);
      assert.ok(text.length <= 50, `カードの説明が長すぎる（${text.length}文字）: ${text}`);
    }
  });
});

describe('registry の読み取り', () => {
  it('tools と games を両方読めている', () => {
    const all = loadRegistries();
    assert.ok(
      all.filter((e) => e.kind === 'tools').length >= 30,
      'tools のエントリが少なすぎる（registry.ts の書き方が変わった可能性）',
    );
    assert.ok(all.filter((e) => e.kind === 'games').length >= 20, 'games のエントリが少なすぎる');
    for (const e of all) {
      assert.match(e.stage, /^(public|preview|wip)$/, `知らない stage: ${e.slug} → ${e.stage}`);
    }
  });
});
