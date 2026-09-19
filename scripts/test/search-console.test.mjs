import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INSPECTION_ENDPOINT,
  SITEMAPS_ENDPOINT,
  backoffDelay,
  getSitemap,
  inspectUrl,
  isRetryable,
  listSitemaps,
  mapWithConcurrency,
  sitemapsUrl,
  toSitemapStatus,
} from '../lib/search-console.mjs';

const PARAMS = {
  url: 'https://hasokon.com/tools/nenshu-kabe/',
  siteUrl: 'https://hasokon.com/',
  accessToken: 'ya29.test',
};

/** 待たずに済むよう sleep を差し替え、待ち時間だけ記録する */
function fakeSleep() {
  const waited = [];
  return { waited, sleep: async (ms) => void waited.push(ms) };
}

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const errorResponse = (status, text = 'error') => ({ ok: false, status, text: async () => text });

describe('backoffDelay', () => {
  it('回を追うごとに倍にする', () => {
    assert.deepEqual([0, 1, 2, 3].map((n) => backoffDelay(n, 1000)), [1000, 2000, 4000, 8000]);
  });
});

describe('isRetryable', () => {
  it('429 と 5xx は投げ直す', () => {
    assert.equal(isRetryable(429), true);
    assert.equal(isRetryable(500), true);
    assert.equal(isRetryable(503), true);
  });

  it('4xx（429以外）は投げ直さない', () => {
    assert.equal(isRetryable(400), false);
    assert.equal(isRetryable(403), false);
    assert.equal(isRetryable(404), false);
  });
});

describe('inspectUrl', () => {
  it('URL検査APIに正しい形で投げる', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => {
      seen.url = url;
      seen.init = init;
      return jsonResponse({ inspectionResult: { indexStatusResult: { verdict: 'PASS' } } });
    };

    const result = await inspectUrl(PARAMS, { fetchImpl });

    assert.equal(result.ok, true);
    assert.equal(result.body.inspectionResult.indexStatusResult.verdict, 'PASS');
    assert.equal(seen.url, INSPECTION_ENDPOINT);
    assert.equal(seen.init.headers.authorization, 'Bearer ya29.test');
    assert.deepEqual(JSON.parse(seen.init.body), {
      inspectionUrl: PARAMS.url,
      siteUrl: PARAMS.siteUrl,
    });
  });

  it('429 は待ってから投げ直す', async () => {
    const { waited, sleep } = fakeSleep();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls < 3 ? errorResponse(429, 'rate limit') : jsonResponse({ inspectionResult: {} });
    };

    const result = await inspectUrl(PARAMS, { fetchImpl, sleep, baseDelayMs: 10 });

    assert.equal(result.ok, true);
    assert.equal(calls, 3);
    assert.deepEqual(waited, [10, 20]);
  });

  it('403 は投げ直さない（権限が無いのは待っても直らない）', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return errorResponse(403, 'permission denied');
    };

    const result = await inspectUrl(PARAMS, { fetchImpl, sleep: async () => {} });

    assert.equal(result.ok, false);
    assert.equal(calls, 1);
    assert.match(result.error, /HTTP 403.*permission denied/s);
  });

  it('投げ直しの上限まで来たら諦めて理由を返す', async () => {
    const { waited, sleep } = fakeSleep();
    const fetchImpl = async () => errorResponse(500, 'boom');

    const result = await inspectUrl(PARAMS, { fetchImpl, sleep, maxAttempts: 3, baseDelayMs: 10 });

    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 500/);
    assert.equal(waited.length, 2); // 3回投げて、間の待ちは2回
  });

  it('通信そのものが失敗しても投げ直す', async () => {
    const { sleep } = fakeSleep();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) throw new Error('ECONNRESET');
      return jsonResponse({ inspectionResult: {} });
    };

    const result = await inspectUrl(PARAMS, { fetchImpl, sleep, baseDelayMs: 10 });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  });

  it('通信が最後まで失敗したらメッセージを返す', async () => {
    const { sleep } = fakeSleep();
    const fetchImpl = async () => {
      throw new Error('ECONNRESET');
    };

    const result = await inspectUrl(PARAMS, { fetchImpl, sleep, maxAttempts: 2, baseDelayMs: 10 });

    assert.equal(result.ok, false);
    assert.match(result.error, /通信に失敗.*ECONNRESET/);
  });
});

describe('mapWithConcurrency', () => {
  it('入力と同じ並びで結果を返す', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (item) => item * 10);
    assert.deepEqual(results, [10, 20, 30, 40, 50]);
  });

  it('同時に走る数が上限を超えない', async () => {
    let running = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return item;
    });

    assert.ok(peak <= 4, `同時実行が ${peak} 件まで増えました`);
    assert.equal(peak, 4);
  });

  it('件数が上限より少なくても動く', async () => {
    assert.deepEqual(await mapWithConcurrency([1], 8, async (item) => item), [1]);
  });

  it('空の入力なら空を返す', async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  });

  it('同時実行数が不正なら落とす', async () => {
    await assert.rejects(() => mapWithConcurrency([1], 0, async () => 1), /1以上の整数/);
    await assert.rejects(() => mapWithConcurrency([1], 1.5, async () => 1), /1以上の整数/);
  });
});

// Sitemaps API（docs/features/sitemap-discovery-audit.md の「B」）
// 「Google がそのサイトマップを読んだか」を見るための2関数。

const SITE = { siteUrl: 'https://hasokon.com/', accessToken: 'ya29.test' };

describe('sitemapsUrl', () => {
  it('siteUrl を丸ごとエンコードして一覧のURLを作る', () => {
    assert.equal(
      sitemapsUrl('https://hasokon.com/'),
      `${SITEMAPS_ENDPOINT}/https%3A%2F%2Fhasokon.com%2F/sitemaps`,
    );
  });

  it('feedpath も丸ごとエンコードする（スラッシュを残すとパスとして切られる）', () => {
    assert.equal(
      sitemapsUrl('https://hasokon.com/', 'https://hasokon.com/learn/sitemap.xml'),
      `${SITEMAPS_ENDPOINT}/https%3A%2F%2Fhasokon.com%2F/sitemaps/https%3A%2F%2Fhasokon.com%2Flearn%2Fsitemap.xml`,
    );
  });
});

describe('listSitemaps', () => {
  it('GET で一覧を取り、sitemap 配列を返す', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => {
      seen.url = url;
      seen.init = init;
      return jsonResponse({ sitemap: [{ path: 'https://hasokon.com/sitemap.xml' }] });
    };

    const result = await listSitemaps(SITE, { fetchImpl });

    assert.equal(result.ok, true);
    assert.deepEqual(result.sitemaps, [{ path: 'https://hasokon.com/sitemap.xml' }]);
    assert.equal(seen.url, sitemapsUrl(SITE.siteUrl));
    assert.equal(seen.init.method, 'GET');
    assert.equal(seen.init.headers.authorization, 'Bearer ya29.test');
  });

  it('1本も登録が無ければ空配列（キーごと返らないことがある）', async () => {
    const result = await listSitemaps(SITE, { fetchImpl: async () => jsonResponse({}) });
    assert.deepEqual(result.sitemaps, []);
  });

  it('5xx は投げ直す', async () => {
    const { waited, sleep } = fakeSleep();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls < 3 ? errorResponse(503) : jsonResponse({ sitemap: [] });
    };

    const result = await listSitemaps(SITE, { fetchImpl, sleep, baseDelayMs: 1000 });

    assert.equal(result.ok, true);
    assert.equal(calls, 3);
    assert.deepEqual(waited, [1000, 2000]);
  });
});

describe('getSitemap', () => {
  const params = { ...SITE, feedpath: 'https://hasokon.com/learn/sitemap.xml' };

  it('1本ぶんのURLを GET する', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => {
      seen.url = url;
      seen.init = init;
      return jsonResponse({ lastDownloaded: '2026-09-08T19:37:21.507Z' });
    };

    const result = await getSitemap(params, { fetchImpl });

    assert.equal(result.ok, true);
    assert.equal(result.body.lastDownloaded, '2026-09-08T19:37:21.507Z');
    assert.equal(seen.url, sitemapsUrl(SITE.siteUrl, params.feedpath));
    assert.equal(seen.init.headers.authorization, 'Bearer ya29.test');
  });

  it('404 は notFound として即返す（投げ直さない）', async () => {
    const { waited, sleep } = fakeSleep();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return errorResponse(404, 'notFound');
    };

    const result = await getSitemap(params, { fetchImpl, sleep });

    assert.equal(result.ok, false);
    assert.equal(result.notFound, true);
    assert.equal(result.status, 404);
    assert.equal(calls, 1, '404 で投げ直しています');
    assert.deepEqual(waited, []);
  });

  it('403 は失敗として返す（notFound ではない）', async () => {
    const result = await getSitemap(params, { fetchImpl: async () => errorResponse(403, 'forbidden') });

    assert.equal(result.ok, false);
    assert.equal(result.notFound, false);
    assert.match(result.error, /HTTP 403/);
  });

  it('通信そのものが失敗しても notFound にはしない', async () => {
    const { sleep } = fakeSleep();
    const fetchImpl = async () => {
      throw new Error('ECONNRESET');
    };

    const result = await getSitemap(params, { fetchImpl, sleep });

    assert.equal(result.ok, false);
    assert.equal(result.notFound, false);
    assert.match(result.error, /ECONNRESET/);
  });
});

describe('toSitemapStatus', () => {
  it('contents の submitted / indexed を数値にして合計する', () => {
    const status = toSitemapStatus('https://hasokon.com/tools/sitemap.xml', {
      ok: true,
      body: {
        lastDownloaded: '2026-09-13T00:00:00.000Z',
        contents: [
          { type: 'web', submitted: '56', indexed: '0' },
          { type: 'image', submitted: '4', indexed: '1' },
        ],
      },
    });

    assert.deepEqual(status, {
      path: 'https://hasokon.com/tools/sitemap.xml',
      known: true,
      lastDownloaded: '2026-09-13T00:00:00.000Z',
      submitted: 60,
      indexed: 1,
    });
  });

  it('index のように contents が無ければ件数は null', () => {
    const status = toSitemapStatus('https://hasokon.com/sitemap.xml', {
      ok: true,
      body: { lastDownloaded: '2026-09-14T00:00:00.000Z', isSitemapsIndex: true },
    });

    assert.equal(status.known, true);
    assert.equal(status.submitted, null);
    assert.equal(status.indexed, null);
  });

  it('一度も読まれていなければ lastDownloaded は null', () => {
    const status = toSitemapStatus('x', { ok: true, body: { contents: [] } });
    assert.equal(status.known, true);
    assert.equal(status.lastDownloaded, null);
  });

  it('取れなかったものは known: false（404 も通信失敗も同じ形にそろえる）', () => {
    assert.deepEqual(toSitemapStatus('https://hasokon.com/learn/sitemap.xml', { ok: false, notFound: true }), {
      path: 'https://hasokon.com/learn/sitemap.xml',
      known: false,
      lastDownloaded: null,
      submitted: null,
      indexed: null,
    });
  });
});
