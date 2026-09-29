#!/usr/bin/env node
// Bing の検索パフォーマンス（表示回数・クリック・検索語・ページ）を週 1 回残す。
//
// 仕様: docs/features/bing-search-performance-audit.md の「A」
//
//   node scripts/bing-search-stats.mjs --site https://hasokon.com/ --out bing-2026-10-05.json
//
// 2026-09-28 の計測で、Search Console は 4 プロパティ合計で 28 日に表示 1 回、
// GA4 の Organic Search 358 セッションのうち 319 が bing だった。**流入の実測値は
// Bing にしかない**が、画面作業のままでは誰も取りに行かない。これはそれを API に置き換える。
//
// API キー（`BING_WEBMASTER_API_KEY`）は URL のクエリに載る。**ログ・エラー文・
// --dry-run のどこにも出さない**（lib の redactKey() を通す）。
// 検索語は表示 5 回以上・上位 20 件だけを出し、JSON にもそれ以外は残さない
// （このリポジトリは public で、Actions のログと artifact は誰でも見られる）。

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  callApi,
  DEFAULT_SITE_URL,
  endpointUrl,
  formatReport,
  METHODS,
  MIN_IMPRESSIONS,
  parseRows,
  redactKey,
  summarize,
  TOP_N,
} from './lib/bing-webmaster.mjs';

/** 終了コード。--help の説明と揃えてある。 */
export const EXIT_OK = 0;
export const EXIT_FAILED = 2;

export const DEFAULTS = Object.freeze({
  siteUrl: DEFAULT_SITE_URL,
  out: null,
  dryRun: false,
  help: false,
});

/** メソッド名 → 集計側の名前 */
const SECTIONS = Object.freeze({
  GetRankAndTrafficStats: 'traffic',
  GetQueryStats: 'queries',
  GetPageStats: 'pages',
});

const USAGE = `使い方: node scripts/bing-search-stats.mjs [オプション]

Bing Webmaster Tools API で、サイト全体の表示回数・クリック（直近7日・28日）、
上位の検索語、上位のページを取って Markdown の表で出す。
検索語は表示 ${MIN_IMPRESSIONS} 回以上のものを上位 ${TOP_N} 件まで（それより細かい行は --out にも残さない）。
仕様: docs/features/bing-search-performance-audit.md

オプション:
  --site <url>      Bing に登録したサイトの表記（既定: ${DEFAULTS.siteUrl}。末尾スラッシュまで一致させる）
  --out <path>      結果をJSONで保存する。週ごとに並べて見るためのもの
  --dry-run         APIを叩かず、投げるURLだけ出す（キーは伏せる）
  --help            この説明を出す

環境変数:
  BING_WEBMASTER_API_KEY  Bing Webmaster Tools の API キー（設定 → API アクセスで発行）

終了コード:
  0  計測できた／--dry-run が成功
  2  実行できなかった（キーが無い・APIの失敗など）`;

export function usage() {
  return USAGE;
}

/** @param {string[]} argv 実行ファイル名を除いた引数 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg !== '--site' && arg !== '--out') {
      throw new Error(`知らないオプションです: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} には値が必要です`);
    }
    i += 1;
    if (arg === '--site') {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error('--site は https:// から始まるURLにしてください');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('--site は https:// から始まるURLにしてください');
      }
      options.siteUrl = value;
    } else {
      options.out = value;
    }
  }

  return options;
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   call?: (params: object) => Promise<{ok: boolean, body?: object, error?: string}>,
 *   writeSnapshot?: (path: string, text: string) => Promise<void>,
 *   now?: () => string,
 *   stdout?: (line: string) => void,
 *   stderr?: (line: string) => void,
 * }} [deps] テストから差し替えるための入り口
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const call = deps.call ?? callApi;
  const writeSnapshot = deps.writeSnapshot ?? ((path, text) => writeFile(path, text, 'utf8'));
  const now = deps.now ?? (() => new Date().toISOString());
  const out = deps.stdout ?? ((line) => console.log(line));
  const log = deps.stderr ?? ((line) => console.error(line));

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
    return EXIT_OK;
  }

  const apiKey = (env.BING_WEBMASTER_API_KEY ?? '').trim();

  if (options.dryRun) {
    // キーが無くても URL の形は見られるようにする。あっても必ず伏せる
    const urls = METHODS.map((method) => redactKey(endpointUrl(method, options.siteUrl, apiKey || '***'), apiKey));
    out(JSON.stringify(urls, null, 2));
    return EXIT_OK;
  }

  if (!apiKey) {
    log('環境変数 BING_WEBMASTER_API_KEY が空です。');
    log('Bing Webmaster Tools の「設定 → API アクセス」で発行したキーを設定してください。');
    return EXIT_FAILED;
  }

  const measuredAt = now();
  const fetched = { traffic: null, queries: null, pages: null };
  const errors = {};
  for (const method of METHODS) {
    const section = SECTIONS[method];
    const result = await call({ method, siteUrl: options.siteUrl, apiKey });
    if (result.ok) {
      fetched[section] = parseRows(result.body);
    } else {
      // callApi() は伏せ字済みだが、差し替えられた実装でも漏らさないよう、ここでも通す
      errors[section] = redactKey(result.error ?? 'unknown', apiKey);
      log(`Bing の集計を取れません（${method}）: ${errors[section]}`);
    }
  }

  const summary = summarize(fetched, { siteUrl: options.siteUrl, nowIso: measuredAt });
  out(formatReport(summary, errors));

  const failed = Object.keys(errors).length > 0;
  if (failed) {
    log('API キーの期限・サイトの表記（末尾スラッシュ）を確認してください。docs/features/bing-search-performance-audit.md を参照');
  }

  if (options.out) {
    const snapshot = {
      // 実行日時は結果の意味に効くので必ず残す（docs/README.md の「数字を根拠にする」）
      measuredAt,
      siteUrl: options.siteUrl,
      minImpressions: MIN_IMPRESSIONS,
      topN: TOP_N,
      // null は「取れなかった」、空の配列は「0 件」
      traffic: summary.traffic,
      queries: summary.queries,
      pages: summary.pages,
      errors,
    };
    await writeSnapshot(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);
    log(`結果を書き出しました: ${options.out}`);
  }

  return failed ? EXIT_FAILED : EXIT_OK;
}

// テストから import しても走らないように、直接実行のときだけ動かす
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(redactKey(error?.stack ?? String(error), process.env.BING_WEBMASTER_API_KEY));
      process.exitCode = EXIT_FAILED;
    },
  );
}
