import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadChapters } from '../lib/registry.mjs';

/**
 * トップの回遊導線（分類への近道と絞り込み）のテスト。
 *
 * 仕様: docs/features/home-findability.md
 *
 * 見張っているのは主に**件数のずれ**。`.quicknav` の件数は手書きなので、
 * カードを増やしたときに直し忘れると、一覧と数字が食い違ったまま公開される。
 * home/ はビルド工程を持たないぶん、この種のずれを機械で拾う場所がここしかない。
 */

const repoRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');

const INDEX_HTML = read('home/index.html');

/** `<section id="...">` から次の `<section` までを分類のかたまりとして取り出す */
function sectionsOf(html) {
  const out = new Map();
  const re = /<section id="([^"]+)">([\s\S]*?)(?=<section |<\/main>)/g;
  let m;
  while ((m = re.exec(html)) !== null) out.set(m[1], m[2]);
  return out;
}

/** かたまりの中のカード数（ツール・ゲームの .card と アプリの .app-card） */
function countCards(block) {
  return (block.match(/class="card"|class="app-card"/g) || []).length;
}

const SECTIONS = sectionsOf(INDEX_HTML);

/** `.quicknav` の各リンク（飛び先のid → 表示している件数） */
function quicknavEntries() {
  const nav = INDEX_HTML.match(/<nav class="quicknav"[\s\S]*?<\/nav>/);
  assert.ok(nav, '分類への近道（.quicknav）が無い');

  const entries = [];
  const re = /<a href="#([^"]+)">([^<]*)<b>(\d+)<\/b><\/a>/g;
  let m;
  while ((m = re.exec(nav[0])) !== null) {
    entries.push({ id: m[1], label: m[2].trim(), count: Number(m[3]) });
  }
  assert.ok(entries.length > 0, '近道のリンクを読み取れない（書き方を変えたらこの正規表現も直す）');
  return entries;
}

describe('トップの分類への近道', () => {
  it('飛び先の分類がすべて実在する', () => {
    for (const { id } of quicknavEntries()) {
      assert.ok(SECTIONS.has(id), `#${id} に対応する <section id="${id}"> が無い`);
    }
  });

  it('表示している件数が実際のカード数と一致する', () => {
    for (const { id, label, count } of quicknavEntries()) {
      assert.equal(
        count,
        countCards(SECTIONS.get(id)),
        `「${label}」の件数が一覧と食い違っている（カードを増減したら近道の数字も直すこと）`,
      );
    }
  });

  it('カードを持つ分類が近道から漏れていない', () => {
    const linked = new Set(quicknavEntries().map((e) => e.id));
    for (const [id, block] of SECTIONS) {
      if (countCards(block) === 0) continue; // 「このサイトについて」は一覧ではない
      assert.ok(linked.has(id), `#${id} にカードがあるのに近道から辿れない`);
    }
  });
});

describe('トップの絞り込み', () => {
  it('index.html が find.js を読み込む', () => {
    assert.match(INDEX_HTML, /<script defer src="\/find\.js"><\/script>/);
  });

  it('404.html は find.js を読み込まない（一覧が無いページなので不要）', () => {
    assert.doesNotMatch(read('home/404.html'), /find\.js/);
  });

  it('絞り込みの対象になるカードに、探せる名前が入っている', () => {
    // .card-name / .app-name が無いと textContent に名前が乗らず、絞り込みで引けない
    for (const [id, block] of SECTIONS) {
      const cards = countCards(block);
      if (cards === 0) continue;
      const names = (block.match(/class="card-name"|class="app-name"/g) || []).length;
      assert.equal(names, cards, `#${id} に名前を持たないカードがある`);
    }
  });
});

describe('トップの読み物（投資の教科書）', () => {
  const PAGES = { 'home/index.html': INDEX_HTML, 'home/404.html': read('home/404.html') };
  const published = loadChapters().filter((c) => c.stage === 'public').length;

  it('index.html と 404.html の両方から /learn/ に行ける', () => {
    // 「index.html / 404.html のサイト一覧は両方更新する」（ルートのCLAUDE.md）
    for (const [name, html] of Object.entries(PAGES)) {
      assert.match(html, /href="\/learn\/"/, `${name} に /learn/ への導線が無い`);
    }
  });

  it('書いてある章数が curriculum.ts の公開章数と一致する', () => {
    // home/ にはビルド工程が無く、章数は手書きになる。
    // 章を増やしたら両方のHTMLの数字も直すこと
    assert.ok(published >= 30, `章の読み取り件数が不自然: ${published}`);
    for (const [name, html] of Object.entries(PAGES)) {
      const found = [...html.matchAll(/全(\d+)章/g)].map((m) => Number(m[1]));
      assert.ok(found.length > 0, `${name} に「全◯章」の表記が無い`);
      for (const n of found) {
        assert.equal(n, published, `${name} の章数が curriculum.ts とずれている`);
      }
    }
  });

  it('読み物の節はカードを持たない（近道の件数と食い違わせない）', () => {
    // 1ページ1機能の一覧ではないので、カードの並びにはしていない。
    // カードを足すなら .quicknav にも件数つきで足すこと（上のテストが見張る）
    const learn = SECTIONS.get('learn');
    assert.ok(learn, '<section id="learn"> が無い');
    assert.equal(countCards(learn), 0, '読み物の節にカードがある');
  });
});
