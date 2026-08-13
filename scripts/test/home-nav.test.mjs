import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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
