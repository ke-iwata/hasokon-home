import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_HOSTS,
  LEGACY_HOSTS,
  classify,
  formatReport,
  hostOf,
  isLegacyUrl,
  summarize,
} from '../lib/canonical.mjs';

/** URL検査APIのレスポンスの形。仕様書に載っている実測値をそのまま使っている。 */
const inspection = (indexStatusResult) => ({ inspectionResult: { indexStatusResult } });

// 仕様書「URL Inspection API による個別ページの状態（2026-08-10取得）」より
const NENSHU_KABE = inspection({
  verdict: 'NEUTRAL',
  coverageState: '重複。Googleが別のページを正規に選択',
  googleCanonical: 'https://tool.hasokon.com/nenshu-kabe/',
  userCanonical: 'https://hasokon.com/tools/nenshu-kabe/',
  lastCrawlTime: '2026-08-07T00:00:00Z',
});

const FURUSATO = inspection({
  verdict: 'PASS',
  coverageState: '送信して登録されました',
  googleCanonical: 'https://hasokon.com/tools/furusato-nozei/',
  userCanonical: 'https://hasokon.com/tools/furusato-nozei/',
  lastCrawlTime: '2026-08-09T00:00:00Z',
});

const GAMES_INDEX = inspection({
  verdict: 'NEUTRAL',
  coverageState: '検出 - インデックス未登録',
});

describe('hostOf', () => {
  it('ホスト名を小文字で返す', () => {
    assert.equal(hostOf('https://Tool.Hasokon.com/nenshu-kabe/'), 'tool.hasokon.com');
  });

  it('URLとして読めなければ null', () => {
    assert.equal(hostOf('not a url'), null);
    assert.equal(hostOf(''), null);
  });
});

describe('isLegacyUrl', () => {
  for (const host of LEGACY_HOSTS) {
    it(`${host} は旧サブドメイン`, () => {
      assert.equal(isLegacyUrl(`https://${host}/whatever/`), true);
    });
  }

  for (const host of CANONICAL_HOSTS) {
    it(`${host} は旧サブドメインではない`, () => {
      assert.equal(isLegacyUrl(`https://${host}/tools/`), false);
    });
  }

  it('紛らわしいホスト名を旧サブドメイン扱いしない', () => {
    // 後方一致で判定していると、こういうものを取り違える
    assert.equal(isLegacyUrl('https://tool.hasokon.com.example.net/'), false);
    assert.equal(isLegacyUrl('https://eviltool.hasokon.com/'), false);
  });
});

describe('classify', () => {
  it('旧サブドメインが正規URLなら legacy', () => {
    const row = classify('https://hasokon.com/tools/nenshu-kabe/', NENSHU_KABE);
    assert.equal(row.status, 'legacy');
    assert.equal(row.googleCanonical, 'https://tool.hasokon.com/nenshu-kabe/');
    assert.equal(row.lastCrawlTime, '2026-08-07T00:00:00Z');
  });

  it('新URLが正規URLなら consolidated', () => {
    assert.equal(classify('https://hasokon.com/tools/furusato-nozei/', FURUSATO).status, 'consolidated');
  });

  it('googleCanonical が無ければ unindexed', () => {
    const row = classify('https://hasokon.com/games/', GAMES_INDEX);
    assert.equal(row.status, 'unindexed');
    assert.equal(row.googleCanonical, null);
    assert.equal(row.coverageState, '検出 - インデックス未登録');
  });

  it('indexStatusResult ごと無くても落ちない', () => {
    assert.equal(classify('https://hasokon.com/', { inspectionResult: {} }).status, 'unindexed');
  });

  it('想定外のホストが正規URLなら foreign', () => {
    const row = classify(
      'https://hasokon.com/tools/roulette/',
      inspection({ googleCanonical: 'https://example.com/roulette/' }),
    );
    assert.equal(row.status, 'foreign');
  });

  it('検査に失敗したら error', () => {
    const row = classify('https://hasokon.com/', null, { error: 'HTTP 403' });
    assert.equal(row.status, 'error');
    assert.equal(row.error, 'HTTP 403');
    assert.equal(row.googleCanonical, null);
  });
});

describe('summarize', () => {
  const rows = [
    classify('https://hasokon.com/tools/nenshu-kabe/', NENSHU_KABE),
    classify(
      'https://hasokon.com/games/minesweeper/',
      inspection({ googleCanonical: 'https://game.hasokon.com/minesweeper/' }),
    ),
    classify('https://hasokon.com/tools/furusato-nozei/', FURUSATO),
    classify('https://hasokon.com/games/', GAMES_INDEX),
    classify('https://hasokon.com/games/2048/', null, { error: 'HTTP 500' }),
  ];

  it('区分ごとに数える', () => {
    const summary = summarize(rows);
    assert.equal(summary.total, 5);
    assert.equal(summary.counts.legacy, 2);
    assert.equal(summary.counts.consolidated, 1);
    assert.equal(summary.counts.unindexed, 1);
    assert.equal(summary.counts.error, 1);
    assert.equal(summary.counts.foreign, 0);
  });

  it('旧サブドメイン別の件数を出す', () => {
    assert.deepEqual(summarize(rows).legacyByHost, {
      'tool.hasokon.com': 1,
      'game.hasokon.com': 1,
    });
  });

  it('legacy が残っていれば未完了', () => {
    assert.equal(summarize(rows).complete, false);
  });

  it('legacy が0でも検査に失敗したURLがあれば完了と言わない', () => {
    const summary = summarize([
      classify('https://hasokon.com/tools/furusato-nozei/', FURUSATO),
      classify('https://hasokon.com/games/2048/', null, { error: 'HTTP 500' }),
    ]);
    assert.equal(summary.counts.legacy, 0);
    assert.equal(summary.complete, false);
  });

  it('legacy が0で失敗も無ければ統合完了', () => {
    const summary = summarize([
      classify('https://hasokon.com/tools/furusato-nozei/', FURUSATO),
      classify('https://hasokon.com/games/', GAMES_INDEX),
    ]);
    assert.equal(summary.complete, true);
  });

  it('空でも落ちない', () => {
    const summary = summarize([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.complete, true);
  });
});

describe('formatReport', () => {
  it('残っているURLと移転先を並べる', () => {
    const report = formatReport(summarize([classify('https://hasokon.com/tools/nenshu-kabe/', NENSHU_KABE)]));
    assert.match(report, /検査したURL: 1 件/);
    assert.match(report, /https:\/\/hasokon\.com\/tools\/nenshu-kabe\//);
    assert.match(report, /https:\/\/tool\.hasokon\.com\/nenshu-kabe\//);
    assert.match(report, /統合は未完了。残り 1 件/);
  });

  it('完了したときは完了と言う', () => {
    const report = formatReport(summarize([classify('https://hasokon.com/tools/furusato-nozei/', FURUSATO)]));
    assert.match(report, /統合完了/);
  });

  it('検査に失敗したURLを理由つきで出す', () => {
    const report = formatReport(summarize([classify('https://hasokon.com/', null, { error: 'HTTP 403' })]));
    assert.match(report, /検査に失敗したURL:/);
    assert.match(report, /HTTP 403/);
  });
});
