// Search Console の API（URL検査・サイトマップ）を叩く部分。
//
// URL検査APIには1日あたりの上限（2000件）と1分あたりの上限（600件）がある。
// 86URLなら上限には当たらないが、429 が返ることはあるので待って入れ直す。
//
// Sitemaps API は「Google がそのサイトマップを読んだか」を返す。
// 仕様: docs/features/sitemap-discovery-audit.md の「B」

export const INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
export const SITEMAPS_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites';

/** 待ち時間を指数で伸ばす。attempt は 0 始まり。 */
export function backoffDelay(attempt, baseMs = 1000) {
  return baseMs * 2 ** attempt;
}

/** もう一度投げてよいHTTPステータスか。 */
export function isRetryable(status) {
  return status === 429 || status >= 500;
}

/**
 * URLを1件検査する。失敗したら maxAttempts まで投げ直す。
 *
 * @param {{ url: string, siteUrl: string, accessToken: string }} params
 * @param {{ fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, maxAttempts?: number, baseDelayMs?: number }} [options]
 */
export async function inspectUrl(params, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError = 'unknown';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(INSPECTION_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${params.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ inspectionUrl: params.url, siteUrl: params.siteUrl }),
      });
    } catch (error) {
      lastError = `通信に失敗: ${error.message}`;
      if (attempt + 1 < maxAttempts) {
        await sleep(backoffDelay(attempt, baseDelayMs));
        continue;
      }
      break;
    }

    if (response.ok) {
      return { ok: true, body: await response.json() };
    }

    const text = await response.text();
    lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
    if (isRetryable(response.status) && attempt + 1 < maxAttempts) {
      await sleep(backoffDelay(attempt, baseDelayMs));
      continue;
    }
    break;
  }

  return { ok: false, error: lastError };
}

/** Sitemaps API のURLを組み立てる。siteUrl・feedpath とも丸ごとエンコードする。 */
export function sitemapsUrl(siteUrl, feedpath) {
  const base = `${SITEMAPS_ENDPOINT}/${encodeURIComponent(siteUrl)}/sitemaps`;
  return feedpath === undefined ? base : `${base}/${encodeURIComponent(feedpath)}`;
}

/**
 * GET を1本投げる。失敗したら maxAttempts まで投げ直す。
 *
 * 404 は投げ直さない（isRetryable() が false）。Sitemaps API の 404 は
 * 「送信済みでも既知でもないサイトマップ」という**答え**であって、待てば変わるものではない。
 */
async function getJson(url, accessToken, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError = 'unknown';
  let lastStatus = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      lastStatus = null;
      lastError = `通信に失敗: ${error.message}`;
      if (attempt + 1 < maxAttempts) {
        await sleep(backoffDelay(attempt, baseDelayMs));
        continue;
      }
      break;
    }

    if (response.ok) {
      return { ok: true, body: await response.json() };
    }

    const text = await response.text();
    lastStatus = response.status;
    lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
    if (isRetryable(response.status) && attempt + 1 < maxAttempts) {
      await sleep(backoffDelay(attempt, baseDelayMs));
      continue;
    }
    break;
  }

  return { ok: false, status: lastStatus, notFound: lastStatus === 404, error: lastError };
}

/**
 * プロパティに「送信済み」として登録されているサイトマップの一覧。
 *
 * index 経由でしか認識されていない子はここに出ないことがあるので、
 * 1本ずつの状態は getSitemap() で見る。
 *
 * @param {{ siteUrl: string, accessToken: string }} params
 * @returns {Promise<{ok: true, sitemaps: object[]} | {ok: false, status: number|null, notFound: boolean, error: string}>}
 */
export async function listSitemaps(params, options = {}) {
  const result = await getJson(sitemapsUrl(params.siteUrl), params.accessToken, options);
  if (!result.ok) return result;
  return { ok: true, sitemaps: result.body?.sitemap ?? [] };
}

/**
 * サイトマップ1本の状態。feedpath はサイトマップの絶対URL。
 *
 * 404（= 送信済みでも既知でもない）は失敗ではなく答えなので、
 * `notFound: true` を付けて返す。呼び出し側はこれを `known: false` に落とす。
 *
 * @param {{ siteUrl: string, feedpath: string, accessToken: string }} params
 * @returns {Promise<{ok: true, body: object} | {ok: false, status: number|null, notFound: boolean, error: string}>}
 */
export async function getSitemap(params, options = {}) {
  return getJson(sitemapsUrl(params.siteUrl, params.feedpath), params.accessToken, options);
}

/**
 * getSitemap() の結果を、監査のJSONに残す形にそろえる。
 *
 * Sitemaps API の submitted / indexed は int64 を文字列で返すので数値に直す。
 * contents は種類（web / image など）ごとの配列なので合計する。
 *
 * @param {string} path サイトマップのURL
 * @param {{ok: boolean, body?: object, notFound?: boolean}} result
 * @returns {{path: string, known: boolean, lastDownloaded: string|null, submitted: number|null, indexed: number|null}}
 */
export function toSitemapStatus(path, result) {
  if (!result.ok) {
    return { path, known: false, lastDownloaded: null, submitted: null, indexed: null };
  }

  const contents = Array.isArray(result.body?.contents) ? result.body.contents : [];
  const total = (key) =>
    contents.length === 0
      ? null
      : contents.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0);

  return {
    path,
    known: true,
    lastDownloaded: result.body?.lastDownloaded ?? null,
    submitted: total('submitted'),
    indexed: total('indexed'),
  };
}

/**
 * 同時実行数を絞って順に流す。結果は items と同じ並びで返す。
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit 同時に走らせる数
 * @param {(item: T, index: number) => Promise<R>} worker
 */
export async function mapWithConcurrency(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('同時実行数は1以上の整数にしてください');
  }

  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
