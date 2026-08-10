// サイトマップから計測対象のURLを集める。
//
// XMLパーサは入れていない。相手は自分たちで生成しているサイトマップだけで、
// 必要なのは <loc> の中身だけ。このリポジトリはビルド工程を持たない方針なので、
// 依存を1つも増やさずに済むほうを選んでいる。

const LOC_PATTERN = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/g;

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
 * @returns {Promise<{ urls: string[], sitemaps: string[], errors: {sitemap: string, message: string}[] }>}
 */
export async function collectUrls(entryUrl, fetchText, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const urls = [];
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

    const locs = parseLocs(xml);
    if (isSitemapIndex(xml)) {
      if (depth >= maxDepth) {
        errors.push({ sitemap: url, message: `入れ子が深すぎます（上限 ${maxDepth}）` });
        continue;
      }
      for (const loc of locs) {
        if (!seenSitemaps.has(loc)) queue.push({ url: loc, depth: depth + 1 });
      }
      continue;
    }

    for (const loc of locs) {
      if (seenUrls.has(loc)) continue;
      seenUrls.add(loc);
      urls.push(loc);
    }
  }

  return { urls, sitemaps, errors };
}
