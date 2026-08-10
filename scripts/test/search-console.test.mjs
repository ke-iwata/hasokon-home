import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INSPECTION_ENDPOINT,
  backoffDelay,
  inspectUrl,
  isRetryable,
  mapWithConcurrency,
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
