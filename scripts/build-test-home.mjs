#!/usr/bin/env node
/**
 * テスト環境向けに `home/index.html` を書き換える。**本番では走らせない。**
 *
 * ## なぜ必要か
 *
 * `tools` / `games` は `lib/registry.ts` の `stage` で公開を切り替えられる
 * （docs/features/feature-flags.md）。しかし **`home/` にはビルド工程が無く、
 * S3バケット直下にそのまま同期される**ので、`stage` が効かない。
 * そのため一覧は手書きで、公開前のものは載っていない。
 *
 * 結果として、運営者がテスト環境で公開前のものを見るには**URLを直接打つ**しかなく、
 * 何が未公開のまま溜まっているのかもトップからは分からなかった。
 * このスクリプトは**テスト環境へ配るときだけ**、公開前のものを一覧に足して
 * 「本番未公開」の印を付ける。
 *
 * ## 本番のHTMLは1バイトも変わらない
 *
 * `.github/workflows/deploy.yml` の、**テスト環境に配るときだけ**通る枝で走る。
 * リポジトリの `home/index.html` そのものは公開中のものだけを載せた状態のままで、
 * タグ（本番）のデプロイはこのスクリプトを通らない。
 * 未公開ページは `noindex` だが、**本番のトップから未公開ページへリンクを張らない**
 * ことも同時に守れる。
 *
 * ## 使い方
 *
 *   node scripts/build-test-home.mjs [--file home/index.html]
 *
 * 同じファイルに2回かけても二重に増えない（差し込み済みなら何もしない）。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { unreleasedEntries } from './lib/registry.mjs';

/** 差し込み済みかどうかの目印。二重に足さないために見る */
const MARKER = 'data-testenv-only';

/**
 * ツールの分類から、トップのどの節に入れるかを決める。
 * 節の見出しは `home/index.html` の `<section id="...">` に対応している
 */
const SECTION_OF_CATEGORY = {
  'お金・社会保険': 'money',
  '生活・健康': 'life',
  '計算・変換': 'life',
  '決める・選ぶ': 'decide',
};

/**
 * 未公開のカードに付けるアイコン（フラスコ）。
 *
 * **公開中のカードとわざと違う絵柄にしている。** 一覧に混ざったときに、
 * 印を読まなくても「これは試験中のもの」と分かるようにするため。
 * 他のカードと同じ 256 の座標・線の太さに合わせてある
 */
const FLASK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 256"' +
  ' fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round"' +
  ' stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M100 32 V100 L44 196 A16 16 0 0 0 58 220 H198 A16 16 0 0 0 212 196 L156 100 V32"></path>' +
  '<path d="M88 32 H168"></path><path d="M72 156 H184"></path></svg>';

/**
 * カードの説明。**registry の説明文をそのまま出さない。**
 *
 * registry の `description` はツールのページ用に書かれた長い文で、そのまま出すと
 * カード1枚だけ背が高くなり、一覧の並びが崩れる（公開中のカードの説明は
 * だいたい30文字前後）。最初の1文だけを採り、それでも長ければ切る
 */
const MAX_DESC = 46;
function shortDescription(text) {
  const first = String(text ?? '').split('。')[0];
  if (!first) return '';
  const trimmed = first.length > MAX_DESC ? `${first.slice(0, MAX_DESC)}…` : first;
  return trimmed.endsWith('…') ? trimmed : `${trimmed}。`;
}

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 未公開のカード1枚 */
function cardHtml(entry) {
  const href = `/${entry.kind}/${entry.slug}/`;
  // 印の文字は find.js の絞り込みの対象にもなる（カードの textContent を見ている）。
  // 「未公開」と打てば未公開のものだけに絞れる
  return [
    `          <a class="card card-unreleased" ${MARKER} data-stage="${escapeHtml(entry.stage)}"`,
    `            href="${escapeHtml(href)}"`,
    `            title="stage: ${escapeHtml(entry.stage)}（本番には出していません）">`,
    `            <span class="card-icon">${FLASK_ICON}</span>`,
    `            <span class="card-name">${escapeHtml(entry.name)}` +
      `<span class="badge-unreleased">本番未公開</span></span>`,
    `            <span class="card-desc">${escapeHtml(shortDescription(entry.description))}</span>`,
    '          </a>',
  ].join('\n');
}

/** 未公開のカードだけに効くCSSと、テスト環境であることの帯 */
const STYLE_HTML = `
    <!-- テスト環境向けの追加分（scripts/build-test-home.mjs が差し込む）。
         本番のHTMLにはこのブロックごと入らない -->
    <style ${MARKER}>
      /* **サイトのアクセント（緑）を使わない。** 緑は「公開中のもの」の色として
         一覧じゅうに出ているので、印に流用すると warning に見えない。
         明暗どちらのテーマでも読めるよう、専用に持つ */
      :root {
        --testenv-fg: #9a3412;
        --testenv-bg: #fff7ed;
        --testenv-line: #fdba74;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --testenv-fg: #fdba74;
          --testenv-bg: #2a1a0f;
          --testenv-line: #7c3d12;
        }
      }

      .card-unreleased {
        border-style: dashed;
        border-color: var(--testenv-line);
      }

      .badge-unreleased {
        display: inline-block;
        margin-inline-start: 6px;
        padding: 1px 6px;
        border-radius: var(--radius-pill);
        background: var(--testenv-bg);
        color: var(--testenv-fg);
        font-size: 0.72rem;
        font-weight: 700;
        /* 名前の行に収める。カードの高さを他と揃えるため */
        vertical-align: middle;
        white-space: nowrap;
      }

      .testenv-banner {
        margin: 0 0 20px;
        padding: 12px 16px;
        border: 1px dashed var(--testenv-line);
        border-radius: var(--radius);
        background: var(--testenv-bg);
        color: var(--text);
        font-size: 0.9rem;
        line-height: 1.7;
      }
    </style>`;

const BANNER_HTML = `
      <p class="testenv-banner" ${MARKER}>
        <strong>ここはテスト環境です。</strong>
        本番（hasokon.com）にまだ出していないものも、
        <span class="badge-unreleased">本番未公開</span> を付けて一覧に混ぜています。
        絞り込みに「未公開」と打つと、それだけを並べられます。
      </p>`;

/** `<section id="...">` の中の最後の `</a>` の直後に差し込む位置を探す */
function insertPositionOfSection(html, id) {
  const open = html.indexOf(`<section id="${id}">`);
  if (open < 0) throw new Error(`節が見つからない: ${id}`);
  const gridEnd = html.indexOf('</div>', html.indexOf('<div class="grid">', open));
  if (gridEnd < 0) throw new Error(`節の一覧の終わりが見つからない: ${id}`);
  // 最後のカードの `</a>` の直後に入れる。`</div>` の直前に入れると、
  // そこに残っている字下げのぶんだけ1枚目がずれる
  const lastCard = html.lastIndexOf('</a>', gridEnd);
  if (lastCard < 0) throw new Error(`節にカードが1枚も無い: ${id}`);
  return lastCard + '</a>'.length;
}

/** `.quicknav` の件数を、実際のカードの枚数に合わせて数え直す */
function syncNavCounts(html) {
  return html.replace(
    /<a href="#([^"]+)">([^<]*)<b>(\d+)<\/b><\/a>/g,
    (whole, id, label) => {
      const open = html.indexOf(`<section id="${id}">`);
      if (open < 0) return whole;
      const nextSection = html.indexOf('<section ', open + 1);
      const block = html.slice(open, nextSection < 0 ? html.indexOf('</main>', open) : nextSection);
      const count = (block.match(/class="card"|class="card card-unreleased"|class="app-card"/g) || [])
        .length;
      return `<a href="#${id}">${label}<b>${count}</b></a>`;
    },
  );
}

export function buildTestHome(html, entries = unreleasedEntries()) {
  if (html.includes(MARKER)) return html; // 差し込み済み

  // 節ごとにまとめる。ゲームは分類を持たないので games の節へ
  const bySection = new Map();
  for (const entry of entries) {
    const id = entry.kind === 'games' ? 'games' : SECTION_OF_CATEGORY[entry.category];
    if (!id) throw new Error(`入れる節が決められない: ${entry.slug}（${entry.category}）`);
    if (!bySection.has(id)) bySection.set(id, []);
    bySection.get(id).push(entry);
  }

  // **後ろの節から差し込む。** 前から入れると、入れたぶんだけ後ろの位置がずれる
  const targets = [...bySection.keys()]
    .map((id) => ({ id, at: insertPositionOfSection(html, id) }))
    .sort((a, b) => b.at - a.at);

  let out = html;
  for (const { id, at } of targets) {
    const cards = bySection.get(id).map(cardHtml).join('\n');
    out = `${out.slice(0, at)}\n${cards}${out.slice(at)}`;
  }

  // 帯とCSSを足す
  const navEnd = out.indexOf('</nav>');
  if (navEnd < 0) throw new Error('分類への近道（.quicknav）が見つからない');
  out = `${out.slice(0, navEnd + '</nav>'.length)}\n${BANNER_HTML}${out.slice(navEnd + '</nav>'.length)}`;

  const headEnd = out.indexOf('</head>');
  if (headEnd < 0) throw new Error('</head> が見つからない');
  out = `${out.slice(0, headEnd)}${STYLE_HTML}\n  ${out.slice(headEnd)}`;

  return syncNavCounts(out);
}

// CLIとして呼ばれたときだけ書き込む
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const flag = process.argv.indexOf('--file');
  const file = flag >= 0 ? process.argv[flag + 1] : 'home/index.html';
  const before = readFileSync(file, 'utf8');
  const after = buildTestHome(before);
  if (after === before) {
    console.log(`変更なし（差し込み済み）: ${file}`);
  } else {
    writeFileSync(file, after);
    const n = unreleasedEntries().length;
    console.log(`テスト環境向けに書き換えた: ${file}（本番未公開 ${n} 件を一覧に追加）`);
  }
}
