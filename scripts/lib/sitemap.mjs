// サイトマップから計測対象のURLを集める。
//
// XMLパーサは入れていない。相手は自分たちで生成しているサイトマップだけで、
// 必要なのは <loc> と <lastmod> の中身だけ。このリポジトリはビルド工程を持たない方針なので、
// 依存を1つも増やさずに済むほうを選んでいる。

const LOC_PATTERN = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/g;
const LASTMOD_PATTERN = /<lastmod>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/lastmod>/;
// <urlset> や <urlset ...> に当たらないよう、<url の次が空白か > のときだけ拾う
const URL_BLOCK_PATTERN = /<url[\s>][\s\S]*?<\/url>/g;

const XML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, (match) => XML_ENTITIES[match]);
}

/** <loc> の中身を出現順に返す。空要素は落とす。 */
export function parseLocs(xml) {
  const locs = [];
  LOC_PATTERN.lastIndex = 0;
  let match;
  while ((match = LOC_PATTERN.exec(xml)) !== null) {
    const value = decodeEntities(match[1].trim());
    if (value) locs.push(value);
  }
  return locs;
}

/**
 * <url> ごとに `{ loc, lastmod }` を出現順に返す。<lastmod> が無ければ `lastmod` は null。
 *
 * IndexNow の差分送信（docs/features/indexnow.md）が「lastmod が動いたURLだけ」を
 * 選ぶために使う。<url> で囲まれていない断片を渡されたときは、
 * parseLocs() と同じく <loc> だけを拾う（lastmod は null）。
 */
export function parseEntries(xml) {
  const blocks = xml.match(URL_BLOCK_PATTERN);
  if (!blocks) return parseLocs(xml).map((loc) => ({ loc, lastmod: null }));

  const entries = [];
  for (const block of blocks) {
    const [loc] = parseLocs(block);
    if (!loc) continue;
    const match = LASTMOD_PATTERN.exec(block);
    const lastmod = match ? decodeEntities(match[1].trim()) : '';
    entries.push({ loc, lastmod: lastmod || null });
  }
  return entries;
}

/** sitemapindex（サイトマップの一覧）か、urlset（URLの一覧）かを見分ける。 */
export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/.test(xml);
}

/**
 * サイトマップを再帰的にたどって、重複を除いたURLの一覧を返す。
 *
 * @param {string} entryUrl 起点。通常は https://hasokon.com/sitemap.xml
 * @param {(url: string) => Promise<string>} fetchText URLを本文の文字列にする関数
 * @param {{ maxDepth?: number }} [options] 入れ子の深さの上限（循環参照よけ）
 * @returns {Promise<{
 *   urls: string[],
 *   entries: {loc: string, lastmod: string|null}[],
 *   sitemaps: string[],
 *   errors: {sitemap: string, message: string}[],
 * }>} `entries` は `urls` と同じ順・同じ件数で、<lastmod> が付いたもの
 */
export async function collectUrls(entryUrl, fetchText, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const urls = [];
  const entries = [];
  const seenUrls = new Set();
  const sitemaps = [];
  const seenSitemaps = new Set();
  const errors = [];

  const queue = [{ url: entryUrl, depth: 0 }];

  while (queue.length > 0) {
    const { url, depth } = queue.shift();
    if (seenSitemaps.has(url)) continue;
    seenSitemaps.add(url);

    let xml;
    try {
      xml = await fetchText(url);
    } catch (error) {
      errors.push({ sitemap: url, message: error.message });
      continue;
    }
    sitemaps.push(url);

    if (isSitemapIndex(xml)) {
      if (depth >= maxDepth) {
        errors.push({ sitemap: url, message: `入れ子が深すぎます（上限 ${maxDepth}）` });
        continue;
      }
      for (const loc of parseLocs(xml)) {
        if (!seenSitemaps.has(loc)) queue.push({ url: loc, depth: depth + 1 });
      }
      continue;
    }

    for (const entry of parseEntries(xml)) {
      if (seenUrls.has(entry.loc)) continue;
      seenUrls.add(entry.loc);
      urls.push(entry.loc);
      entries.push(entry);
    }
  }

  return { urls, entries, sitemaps, errors };
}
