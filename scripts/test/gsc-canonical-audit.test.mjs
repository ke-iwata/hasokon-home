// スクリプト全体の振る舞い。とくに終了コードは
// 「0 なら統合完了」という約束で使うので、ここで固定しておく。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EXIT_COMPLETE, EXIT_FAILED, EXIT_INCOMPLETE, main } from '../gsc-canonical-audit.mjs';

const INDEX_XML = `<sitemapindex>
  <sitemap><loc>https://hasokon.com/sitemap-home.xml</loc></sitemap>
  <sitemap><loc>https://hasokon.com/tools/sitemap.xml</loc></sitemap>
</sitemapindex>`;

const SITEMAPS = {
  'https://hasokon.com/sitemap.xml': INDEX_XML,
  'https://hasokon.com/sitemap-home.xml': '<urlset><url><loc>https://hasokon.com/</loc></url></urlset>',
  'https://hasokon.com/tools/sitemap.xml':
    '<urlset><url><loc>https://hasokon.com/tools/nenshu-kabe/</loc></url></urlset>',
};

const CANONICALS = {
  'https://hasokon.com/': 'https://hasokon.com/',
  'https://hasokon.com/tools/nenshu-kabe/': 'https://tool.hasokon.com/nenshu-kabe/',
};

/** 出力を溜め、全部を差し替えた deps を作る。 */
function harness(overrides = {}) {
  const stdout = [];
  const stderr = [];
  const written = [];

  const deps = {
    env: { GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}' },
    fetchText: async (url) => {
      if (!(url in SITEMAPS)) throw new Error('HTTP 404');
      return SITEMAPS[url];
    },
    getAccessToken: async () => 'ya29.test',
    inspect: async ({ url }) => ({
      ok: true,
      body: { inspectionResult: { indexStatusResult: { googleCanonical: CANONICALS[url] } } },
    }),
    writeSnapshot: async (path, text) => void written.push({ path, text }),
    now: () => '2026-08-10T00:00:00.000Z',
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    ...overrides,
  };

  return { deps, stdout, stderr, written, out: () => stdout.join('\n') };
}

describe('main', () => {
  it('--help は説明を出して 0', async () => {
    const h = harness();
    assert.equal(await main(['--help'], h.deps), EXIT_COMPLETE);
    assert.match(h.out(), /使い方/);
  });

  it('知らないオプションは 2 で終わる', async () => {
    const h = harness();
    assert.equal(await main(['--nope'], h.deps), EXIT_FAILED);
    assert.match(h.stderr.join('\n'), /知らないオプション/);
  });

  it('--dry-run はAPIを叩かず、対象URLだけ出して 0', async () => {
    let inspected = 0;
    const h = harness({ inspect: async () => void (inspected += 1) });

    assert.equal(await main(['--dry-run'], h.deps), EXIT_COMPLETE);
    assert.equal(inspected, 0);
    assert.deepEqual(h.stdout, ['https://hasokon.com/', 'https://hasokon.com/tools/nenshu-kabe/']);
  });

  it('サイトマップからURLが取れなければ 2', async () => {
    const h = harness({
      fetchText: async () => {
        throw new Error('HTTP 500');
      },
    });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.match(h.stderr.join('\n'), /対象URLが1件も取れませんでした/);
  });

  it('旧サブドメインが残っていれば 1 で終わる', async () => {
    const h = harness();

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.out(), /統合は未完了。残り 1 件/);
    assert.match(h.out(), /https:\/\/tool\.hasokon\.com\/nenshu-kabe\//);
  });

  it('全部が新URLを指していれば 0 で終わる', async () => {
    const h = harness({
      inspect: async ({ url }) => ({
        ok: true,
        body: { inspectionResult: { indexStatusResult: { googleCanonical: url } } },
      }),
    });

    assert.equal(await main([], h.deps), EXIT_COMPLETE);
    assert.match(h.out(), /統合完了/);
  });

  it('検査に失敗したURLがあれば、完了扱いにせず 1', async () => {
    const h = harness({ inspect: async () => ({ ok: false, error: 'HTTP 403' }) });

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.out(), /検査に失敗したURL:/);
  });

  it('サービスアカウントが無ければ 2（APIは叩かない）', async () => {
    let inspected = 0;
    const h = harness({ env: {}, inspect: async () => void (inspected += 1) });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.equal(inspected, 0);
    assert.match(h.stderr.join('\n'), /GOOGLE_SERVICE_ACCOUNT_JSON/);
  });

  it('トークンが取れなければ 2', async () => {
    const h = harness({
      getAccessToken: async () => {
        throw new Error('HTTP 401: invalid_grant');
      },
    });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.match(h.stderr.join('\n'), /認証に失敗.*invalid_grant/s);
  });

  it('--out に計測日つきのJSONを書き出す', async () => {
    const h = harness();

    await main(['--out', 'baseline.json'], h.deps);

    assert.equal(h.written.length, 1);
    assert.equal(h.written[0].path, 'baseline.json');

    const snapshot = JSON.parse(h.written[0].text);
    assert.equal(snapshot.measuredAt, '2026-08-10T00:00:00.000Z');
    assert.equal(snapshot.siteUrl, 'https://hasokon.com/');
    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.counts.legacy, 1);
    assert.deepEqual(snapshot.legacyByHost, { 'tool.hasokon.com': 1 });
    assert.equal(snapshot.rows.length, 2);
  });

  it('--out を指定しなければ何も書かない', async () => {
    const h = harness();
    await main([], h.deps);
    assert.equal(h.written.length, 0);
  });

  it('--site-url で検査するプロパティを差し替えられる', async () => {
    const seen = [];
    const h = harness({
      inspect: async (params) => {
        seen.push(params.siteUrl);
        return { ok: true, body: { inspectionResult: { indexStatusResult: {} } } };
      },
    });

    await main(['--site-url', 'https://test.hasokon.com/'], h.deps);
    assert.deepEqual(new Set(seen), new Set(['https://test.hasokon.com/']));
  });

  it('取得したトークンを検査リクエストに渡す', async () => {
    const seen = [];
    const h = harness({
      getAccessToken: async () => 'ya29.specific',
      inspect: async (params) => {
        seen.push(params.accessToken);
        return { ok: true, body: { inspectionResult: { indexStatusResult: {} } } };
      },
    });

    await main([], h.deps);
    assert.deepEqual(new Set(seen), new Set(['ya29.specific']));
  });
});
