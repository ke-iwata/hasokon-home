#!/usr/bin/env node
// AIアシスタント経由の流入が、週ごとにどう動いているかを数える。
//
// 仕様: docs/features/ai-assistant-channel.md の「A. 週次レポートに AI チャネルを足す」
//
//   node scripts/ga4-ai-channel.mjs --out ga4-ai-2026-09-29.json
//
// 2026-09-24 の計測で、AI Assistant チャネルが 1 → 68 セッションに増えていた
// （直近28日で2番目に大きいチャネル・全体の約17%）。**落ちているチャネルの
// 立て直しではなく、いま伸びているチャネルへの投資**なので、
// 同じ仕様書の B（llms.txt をセクション別に生成する）を入れる前に、
// **毎週の数字が残る場所**を先に作る。これが無いと効いたかが分からない。
//
// 認証は Search Console 監査（scripts/gsc-canonical-audit.mjs）と同じ
// サービスアカウント。`analytics.readonly` を既に持っているので、
// 新しい権限もスコープの追加も要らない。
//
// **`sessionSource: google` を「Google 検索が回復した」と読まないこと。**
// Search Console の表示回数がほぼゼロなのと食い違っており、
// Discover やアプリ内ブラウザが混ざっているとみられる（仕様書の「背景と根拠」）。

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  channelRequest,
  formatReport,
  landingPageRequest,
  parseRows,
  runReport,
  summarize,
  WINDOW_DAYS,
} from './lib/ga4.mjs';
import { ANALYTICS_READONLY_SCOPE, fetchAccessToken, parseServiceAccount } from './lib/google-auth.mjs';

/** 終了コード。--help の説明と揃えてある。 */
export const EXIT_OK = 0;
export const EXIT_FAILED = 2;

/** GA4 のプロパティ。仕様書の計測もこれで取っている */
export const DEFAULT_PROPERTY_ID = '548154955';

export const DEFAULTS = Object.freeze({
  propertyId: DEFAULT_PROPERTY_ID,
  days: WINDOW_DAYS,
  out: null,
  dryRun: false,
  help: false,
});

const USAGE = `使い方: node scripts/ga4-ai-channel.mjs [オプション]

GA4 Data API で、チャネル別（sessionDefaultChannelGroup × sessionSource）の
セッションと、AI Assistant に絞ったランディングページの上位を数える。
直近28日と、その前の28日を並べて出す。
仕様: docs/features/ai-assistant-channel.md

オプション:
  --property <id>   GA4 のプロパティID（既定: ${DEFAULTS.propertyId}）
  --days <n>        集計する日数（既定: ${DEFAULTS.days}）
  --out <path>      結果をJSONで保存する。週ごとに並べて見るためのもの
  --dry-run         APIを叩かず、投げるリクエストだけ出す
  --help            この説明を出す

環境変数:
  GOOGLE_SERVICE_ACCOUNT_JSON  サービスアカウントのJSON（生でもbase64でも可）

終了コード:
  0  計測できた／--dry-run が成功
  2  実行できなかった（認証・APIの失敗など）`;

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
    if (arg !== '--property' && arg !== '--days' && arg !== '--out') {
      throw new Error(`知らないオプションです: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} には値が必要です`);
    }
    i += 1;
    if (arg === '--days') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--days は1以上の整数にしてください');
      }
      options.days = parsed;
    } else {
      options[arg === '--property' ? 'propertyId' : 'out'] = value;
    }
  }

  return options;
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   getAccessToken?: (sa: object) => Promise<string>,
 *   report?: (params: object) => Promise<{ok: boolean, body?: object, error?: string}>,
 *   writeSnapshot?: (path: string, text: string) => Promise<void>,
 *   now?: () => string,
 *   stdout?: (line: string) => void,
 *   stderr?: (line: string) => void,
 * }} [deps] テストから差し替えるための入り口
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const report = deps.report ?? runReport;
  const writeSnapshot = deps.writeSnapshot ?? ((path, text) => writeFile(path, text, 'utf8'));
  const now = deps.now ?? (() => new Date().toISOString());
  const out = deps.stdout ?? ((line) => console.log(line));
  const log = deps.stderr ?? ((line) => console.error(line));
  const getAccessToken =
    deps.getAccessToken ??
    (async (sa) => (await fetchAccessToken(sa, { scope: ANALYTICS_READONLY_SCOPE })).accessToken);

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

  const requests = {
    channels: channelRequest(options.days),
    landings: landingPageRequest(options.days),
  };

  if (options.dryRun) {
    out(JSON.stringify(requests, null, 2));
    return EXIT_OK;
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

  const measuredAt = now();
  const fetched = {};
  for (const [name, body] of Object.entries(requests)) {
    const result = await report({ propertyId: options.propertyId, accessToken, body });
    if (!result.ok) {
      log(`GA4 の集計を取れません（${name}）: ${result.error}`);
      log('サービスアカウントが GA4 プロパティの閲覧権限を持っているか確認してください。');
      return EXIT_FAILED;
    }
    fetched[name] = parseRows(result.body);
  }

  const summary = summarize(fetched.channels, fetched.landings, { days: options.days });
  out(formatReport(summary));

  if (options.out) {
    const snapshot = {
      // 実行日時は結果の意味に効くので必ず残す（docs/README.md の「数字を根拠にする」）
      measuredAt,
      propertyId: options.propertyId,
      days: options.days,
      ai: summary.ai,
      aiShare: summary.aiShare,
      channels: summary.channels,
      sources: summary.sources,
      landings: summary.landings,
    };
    await writeSnapshot(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);
    log(`結果を書き出しました: ${options.out}`);
  }

  return EXIT_OK;
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
