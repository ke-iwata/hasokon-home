import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_HOSTS,
  LEGACY_HOSTS,
  UNKNOWN_COVERAGE,
  classify,
  formatReport,
  groupByCoverageState,
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

// docs/features/google-index-recovery.md「計測値（2026-09-16 取得）」より。
// プロパティの言語設定によって coverageState は英語で返ってくることがある
// （2026-08-10 の計測は日本語だった）。両方そのまま数える、が仕様。
const TOP = inspection({
  verdict: 'PASS',
  coverageState: 'Submitted and indexed',
  googleCanonical: 'https://hasokon.com/',
  userCanonical: 'https://hasokon.com/',
  lastCrawlTime: '2026-09-13T00:00:00Z',
});

// クロールはされているが登録されていない。Googleが正規URLを選んでいないので googleCanonical は無い
const CRAWLED_NOT_INDEXED = inspection({
  verdict: 'NEUTRAL',
  coverageState: 'Crawled - currently not indexed',
  lastCrawlTime: '2026-09-15T00:00:00Z',
});

const UNKNOWN_TO_GOOGLE = inspection({
  verdict: 'NEUTRAL',
  coverageState: 'URL is unknown to Google',
});

describe('groupByCoverageState', () => {
  it('coverageState ごとに件数とURLをまとめる', () => {
    const groups = groupByCoverageState([
      classify('https://hasokon.com/', TOP),
      classify('https://hasokon.com/tools/saitei-chingin/', CRAWLED_NOT_INDEXED),
      classify('https://hasokon.com/tools/tabako-zei-neage/', CRAWLED_NOT_INDEXED),
      classify('https://hasokon.com/learn/toshi/', UNKNOWN_TO_GOOGLE),
    ]);

    assert.deepEqual(groups, [
      {
        state: 'Crawled - currently not indexed',
        count: 2,
        urls: [
          'https://hasokon.com/tools/saitei-chingin/',
          'https://hasokon.com/tools/tabako-zei-neage/',
        ],
      },
      { state: 'Submitted and indexed', count: 1, urls: ['https://hasokon.com/'] },
      { state: 'URL is unknown to Google', count: 1, urls: ['https://hasokon.com/learn/toshi/'] },
    ]);
  });

  it('「クロール済みで未登録」と「Googleが知らない」を同じ数に潰さない', () => {
    // 3件ともこれまでの区分では unindexed にまとまってしまい、
    // 復旧しているのか後退しているのかが読めなかった（仕様書の A はここが出発点）
    const rows = [
      classify('https://hasokon.com/tools/saitei-chingin/', CRAWLED_NOT_INDEXED),
      classify('https://hasokon.com/learn/toshi/', UNKNOWN_TO_GOOGLE),
      classify('https://hasokon.com/games/', GAMES_INDEX),
    ];
    assert.equal(summarize(rows).counts.unindexed, 3);
    assert.equal(groupByCoverageState(rows).length, 3);
  });

  it('Googleが返した文字列をそのまま使う（訳したり束ねたりしない）', () => {
    // 日本語プロパティの「検出 - インデックス未登録」と
    // 英語の "Crawled - currently not indexed" は別の状態。混ぜない
    const groups = groupByCoverageState([
      classify('https://hasokon.com/games/', GAMES_INDEX),
      classify('https://hasokon.com/tools/saitei-chingin/', CRAWLED_NOT_INDEXED),
    ]);
    assert.deepEqual(
      groups.map((group) => group.state).sort(),
      ['Crawled - currently not indexed', '検出 - インデックス未登録'],
    );
  });

  it('coverageState が無い行はまとめ先に入れる', () => {
    const groups = groupByCoverageState([
      classify('https://hasokon.com/', null, { error: 'HTTP 403' }),
      classify('https://hasokon.com/games/2048/', inspection({})),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].state, UNKNOWN_COVERAGE);
    assert.equal(groups[0].count, 2);
  });

  it('件数の多い順、同数なら状態名の順で並べる（実行ごとに並びが変わらない）', () => {
    const groups = groupByCoverageState([
      classify('https://hasokon.com/learn/toshi/', UNKNOWN_TO_GOOGLE),
      classify('https://hasokon.com/', TOP),
      classify('https://hasokon.com/tools/saitei-chingin/', CRAWLED_NOT_INDEXED),
      classify('https://hasokon.com/tools/tabako-zei-neage/', CRAWLED_NOT_INDEXED),
    ]);
    assert.deepEqual(groups.map((group) => [group.state, group.count]), [
      ['Crawled - currently not indexed', 2],
      ['Submitted and indexed', 1],
      ['URL is unknown to Google', 1],
    ]);
  });

  it('空でも落ちない', () => {
    assert.deepEqual(groupByCoverageState([]), []);
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

  it('coverageState 別の内訳も返す', () => {
    const groups = summarize(rows).coverageByState;

    // 先頭は必ず件数の多いもの。同数どうしの並びは照合順序に任せているので、
    // ここでは件数だけを突き合わせる
    assert.equal(groups[0].state, UNKNOWN_COVERAGE);
    assert.equal(groups[0].count, 2);
    assert.deepEqual(
      Object.fromEntries(groups.map((group) => [group.state, group.count])),
      {
        [UNKNOWN_COVERAGE]: 2,
        '重複。Googleが別のページを正規に選択': 1,
        '送信して登録されました': 1,
        '検出 - インデックス未登録': 1,
      },
    );
  });

  it('空でも落ちない', () => {
    const summary = summarize([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.complete, true);
    assert.deepEqual(summary.coverageByState, []);
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

  it('coverageState 別の件数とURLを出す', () => {
    const report = formatReport(
      summarize([
        classify('https://hasokon.com/', TOP),
        classify('https://hasokon.com/tools/saitei-chingin/', CRAWLED_NOT_INDEXED),
        classify('https://hasokon.com/learn/toshi/', UNKNOWN_TO_GOOGLE),
      ]),
    );

    assert.match(report, /Google側の状態 \(coverageState\) 別:/);
    assert.match(report, /Submitted and indexed: 1/);
    assert.match(report, /Crawled - currently not indexed: 1/);
    assert.match(report, /URL is unknown to Google: 1/);
    // どのURLがどの状態かまで出す。Search Console の画面と突き合わせるため
    assert.match(report, /Crawled - currently not indexed: 1\n\s+https:\/\/hasokon\.com\/tools\/saitei-chingin\//);
  });
});
