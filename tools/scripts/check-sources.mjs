#!/usr/bin/env node
/**
 * 最低賃金チェッカーの出典URLの生存確認。
 *
 * 仕様: docs/features/saitei-chingin-r8-hakko-mae-mente.md
 *
 * 労働局のPDFは差し替えでURLが変わりやすく、実際に3件（広島・徳島・山梨）が
 * 404になっていた。いちばん見られているページの根拠リンクが切れているのは
 * 信頼性に直結するので、年1回の改定作業の前と、答申・決定公示を入れたあとに**手で**回す。
 *
 *   node scripts/check-sources.mjs
 *
 * **CIには入れない。** 外部サイトの都合（メンテ・レート制限）でCIが落ちるのを避けるため。
 * 200以外が1件でもあれば終了コード1で終わるので、手元での確認には使える。
 *
 * lib/saitei-chingin.ts を import せずに正規表現で URL を拾っているのは、
 * .mjs から TypeScript を読むための仕掛け（ローダー・拡張子の解決）を
 * 持ち込まずに単体で動かすため。URL は必ず `url: '...'` の形で書かれている。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../lib/saitei-chingin.ts', import.meta.url));

/** 同時に投げる本数。相手は官公庁のサイトなので控えめにする */
const CONCURRENCY = 4;
const TIMEOUT_MS = 20_000;

/**
 * `label: '...'` と `url: '...'` の組を上から順に拾う。
 * label が直前に無い URL（想定していない書き方）は URL 自体を見出しにする。
 */
function extractSources(text) {
  const found = new Map();
  let label = '(no label)';
  const re = /(?:label:\s*\n?\s*'((?:[^'\\]|\\.)*)'|url:\s*'((?:[^'\\]|\\.)*)')/g;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) label = m[1];
    else if (!found.has(m[2])) found.set(m[2], label);
  }
  return [...found].map(([url, name]) => ({ url, label: name }));
}

/**
 * HEAD で試し、403/405 が返ったら GET で試し直す。
 * jsite.mhlw.go.jp には HEAD を弾くページがある。
 */
async function statusOf(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (method === 'GET' || ![403, 405].includes(res.status)) return res.status;
    } catch (e) {
      if (method === 'GET') return `ERR ${e.message}`;
    }
  }
  return 'ERR';
}

const list = extractSources(await readFile(SOURCE, 'utf8'));
const results = [];
for (let i = 0; i < list.length; i += CONCURRENCY) {
  const batch = list.slice(i, i + CONCURRENCY);
  const statuses = await Promise.all(batch.map((t) => statusOf(t.url)));
  batch.forEach((t, j) => results.push({ ...t, status: statuses[j] }));
}

const bad = results.filter((r) => r.status !== 200);
for (const r of bad) console.log(`${r.status}\t${r.label}\n\t${r.url}`);
console.log(`\n${results.length}件を確認、200以外 ${bad.length}件`);
process.exit(bad.length === 0 ? 0 : 1);
