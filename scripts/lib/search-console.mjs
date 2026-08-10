// Search Console の URL検査API を叩く部分。
//
// URL検査APIには1日あたりの上限（2000件）と1分あたりの上限（600件）がある。
// 86URLなら上限には当たらないが、429 が返ることはあるので待って入れ直す。

export const INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

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
