import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULTS, parseArgs, usage } from '../lib/cli.mjs';

describe('parseArgs', () => {
  it('引数が無ければ既定値', () => {
    assert.deepEqual(parseArgs([]), DEFAULTS);
  });

  it('既定の対象は hasokon.com のサイトマップとプロパティ', () => {
    assert.equal(DEFAULTS.sitemap, 'https://hasokon.com/sitemap.xml');
    assert.equal(DEFAULTS.siteUrl, 'https://hasokon.com/');
  });

  it('それぞれのオプションを読む', () => {
    const options = parseArgs([
      '--sitemap',
      'https://test.hasokon.com/sitemap.xml',
      '--site-url',
      'https://test.hasokon.com/',
      '--concurrency',
      '8',
      '--out',
      'baseline.json',
    ]);

    assert.equal(options.sitemap, 'https://test.hasokon.com/sitemap.xml');
    assert.equal(options.siteUrl, 'https://test.hasokon.com/');
    assert.equal(options.concurrency, 8);
    assert.equal(options.out, 'baseline.json');
  });

  it('--dry-run と --help はフラグ', () => {
    assert.equal(parseArgs(['--dry-run']).dryRun, true);
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
  });

  it('値を取るオプションに値が無ければ落とす', () => {
    assert.throws(() => parseArgs(['--out']), /値が必要です/);
    assert.throws(() => parseArgs(['--sitemap', '--dry-run']), /値が必要です/);
  });

  it('同時実行数は1以上の整数だけ受ける', () => {
    assert.throws(() => parseArgs(['--concurrency', '0']), /1以上の整数/);
    assert.throws(() => parseArgs(['--concurrency', '2.5']), /1以上の整数/);
    assert.throws(() => parseArgs(['--concurrency', 'many']), /1以上の整数/);
  });

  it('知らないオプションは黙って無視しない', () => {
    assert.throws(() => parseArgs(['--sitemaps', 'x']), /知らないオプション/);
  });

  it('既定値を書き換えない', () => {
    parseArgs(['--concurrency', '9']);
    assert.equal(DEFAULTS.concurrency, 4);
  });
});

describe('usage', () => {
  it('仕様書への道しるべを含む', () => {
    assert.match(usage(), /docs\/features\/search-index-consolidation\.md/);
  });

  it('終了コードの意味を書いてある', () => {
    assert.match(usage(), /終了コード/);
  });

  it('必要な環境変数を書いてある', () => {
    assert.match(usage(), /GOOGLE_SERVICE_ACCOUNT_JSON/);
  });
});
