#!/usr/bin/env node
// 旧サブドメインからの検索インデックス統合が、どこまで進んだかを数える。
//
// 仕様: docs/features/search-index-consolidation.md
// 「googleCanonical が旧サブドメインを指すURLの件数が0になったら統合完了」を、
// サイトマップに載っている全URLに対して機械的に判定する。
//
//   node scripts/gsc-canonical-audit.mjs --out baseline-2026-08-10.json
//
// アドレス変更ツールの実施前にベースラインとして1回、
// 実施の1週間後・4週間後にもう一度回して、legacy の件数の減りを見る。

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { classify, formatReport, summarize } from './lib/canonical.mjs';
import { DEFAULTS, parseArgs, usage } from './lib/cli.mjs';
import { READONLY_SCOPE, fetchAccessToken, parseServiceAccount } from './lib/google-auth.mjs';
import { inspectUrl, mapWithConcurrency } from './lib/search-console.mjs';
import { collectUrls } from './lib/sitemap.mjs';

/** 終了コード。--help の説明と揃えてある。 */
export const EXIT_COMPLETE = 0;
export const EXIT_INCOMPLETE = 1;
export const EXIT_FAILED = 2;

async function fetchTextOverHttp(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'hasokon-gsc-canonical-audit' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetchText?: (url: string) => Promise<string>,
 *   getAccessToken?: (sa: object) => Promise<string>,
 *   inspect?: (params: object) => Promise<{ok: boolean, body?: object, error?: string}>,
 *   writeSnapshot?: (path: string, text: string) => Promise<void>,
 *   now?: () => string,
 *   stdout?: (line: string) => void,
 *   stderr?: (line: string) => void,
 * }} [deps] テストから差し替えるための入り口
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const fetchText = deps.fetchText ?? fetchTextOverHttp;
  const inspect = deps.inspect ?? inspectUrl;
  const writeSnapshot = deps.writeSnapshot ?? ((path, text) => writeFile(path, text, 'utf8'));
  const now = deps.now ?? (() => new Date().toISOString());
  const out = deps.stdout ?? ((line) => console.log(line));
  const log = deps.stderr ?? ((line) => console.error(line));
  const getAccessToken =
    deps.getAccessToken ??
    (async (sa) => (await fetchAccessToken(sa, { scope: READONLY_SCOPE })).accessToken);

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    log(error.message);
    log('');
    log(usage());
    return EXIT_FAILED;
  }

  if (options.help) {
    out(usage());
    return EXIT_COMPLETE;
  }

  log(`サイトマップを読みます: ${options.sitemap}`);
  const { urls, sitemaps, errors: sitemapErrors } = await collectUrls(options.sitemap, fetchText);

  for (const failure of sitemapErrors) {
    log(`  サイトマップを読めません: ${failure.sitemap}（${failure.message}）`);
  }
  if (urls.length === 0) {
    log('対象URLが1件も取れませんでした。サイトマップのURLを確認してください。');
    return EXIT_FAILED;
  }
  log(`  サイトマップ ${sitemaps.length} 本 / URL ${urls.length} 件`);

  if (options.dryRun) {
    for (const url of urls) out(url);
    return EXIT_COMPLETE;
  }

  let accessToken;
  try {
    const serviceAccount = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '');
    accessToken = await getAccessToken(serviceAccount);
  } catch (error) {
    log(`認証に失敗: ${error.message}`);
    log('環境変数 GOOGLE_SERVICE_ACCOUNT_JSON に、権限のあるサービスアカウントを設定してください。');
    return EXIT_FAILED;
  }

  log(`URL検査APIにかけます（同時 ${options.concurrency} 件）…`);
  let done = 0;
  const rows = await mapWithConcurrency(urls, options.concurrency, async (url) => {
    const result = await inspect({ url, siteUrl: options.siteUrl, accessToken });
    done += 1;
    if (done % 10 === 0 || done === urls.length) log(`  ${done}/${urls.length}`);
    return result.ok ? classify(url, result.body) : classify(url, null, { error: result.error });
  });

  const summary = summarize(rows);
  out(formatReport(summary));

  if (options.out) {
    const snapshot = {
      // 実行日時は結果の意味に効くので必ず残す（docs/README.md の「数字を根拠にする」）
      measuredAt: now(),
      sitemap: options.sitemap,
      siteUrl: options.siteUrl,
      total: summary.total,
      counts: summary.counts,
      legacyByHost: summary.legacyByHost,
      rows,
    };
    await writeSnapshot(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);
    log(`結果を書き出しました: ${options.out}`);
  }

  return summary.complete ? EXIT_COMPLETE : EXIT_INCOMPLETE;
}

// テストから import しても走らないように、直接実行のときだけ動かす
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = EXIT_FAILED;
    },
  );
}

export { DEFAULTS };
