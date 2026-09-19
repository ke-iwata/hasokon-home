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
//
// 統合そのものは済んだが、統合先が Google に登録されないままになっている。
// 仕様: docs/features/google-index-recovery.md
// こちらを追うために coverageState 別の内訳も出す（.github/workflows/gsc-audit.yml で週1回）。
//
// あわせて「そのサイトマップを Google が読んだか」も数える。
// 仕様: docs/features/sitemap-discovery-audit.md
// index に並べただけの子が読まれないことがあり（2026-09-19 時点の /learn/sitemap.xml）、
// URL検査の結果だけ見ていても気づけなかった。

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { classify, formatReport, summarize } from './lib/canonical.mjs';
import { DEFAULTS, parseArgs, usage } from './lib/cli.mjs';
import { READONLY_SCOPE, fetchAccessToken, parseServiceAccount } from './lib/google-auth.mjs';
import { getSitemap, inspectUrl, mapWithConcurrency, toSitemapStatus } from './lib/search-console.mjs';
import { collectUrls } from './lib/sitemap.mjs';

/** 終了コード。--help の説明と揃えてある。 */
export const EXIT_COMPLETE = 0;
export const EXIT_INCOMPLETE = 1;
export const EXIT_FAILED = 2;

/**
 * 最終ダウンロードが何日より古いと知らせるか。
 * index 経由の子は個別送信の子より読まれにくい、という傾向を見張るためのもの
 * （docs/features/sitemap-discovery-audit.md「背景と根拠」2）。
 */
export const STALE_DAYS = 14;

/** lastDownloaded が STALE_DAYS より古いか。読まれた日が無い・読めないときは false。 */
export function isStale(lastDownloaded, nowIso, days = STALE_DAYS) {
  if (!lastDownloaded) return false;
  const at = Date.parse(lastDownloaded);
  const now = Date.parse(nowIso);
  if (Number.isNaN(at) || Number.isNaN(now)) return false;
  return now - at > days * 24 * 60 * 60 * 1000;
}

/** 状態1行ぶんの表示。標準エラーに1本1行で出す。 */
export function formatSitemapStatus(status, nowIso) {
  if (!status.known) {
    return `${status.path}：Google は知らない（送信済みでも既知でもない）`;
  }
  if (!status.lastDownloaded) {
    return `${status.path}：登録はあるが、まだ一度も読まれていない`;
  }
  const count = (value) => (value === null ? '—' : String(value));
  const stale = isStale(status.lastDownloaded, nowIso) ? `（${STALE_DAYS}日より古い）` : '';
  return `${status.path}：読まれた日 ${status.lastDownloaded}${stale} / 送信 ${count(status.submitted)} / 登録 ${count(status.indexed)}`;
}

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
 *   getSitemap?: (params: object) => Promise<{ok: boolean, body?: object, notFound?: boolean, error?: string}>,
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
  const fetchSitemapStatus = deps.getSitemap ?? getSitemap;
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

  // 「Google がこのサイトマップを読んだか」を先に見る。
  // URL検査より件数が少なく、権限が足りなければここで分かるので、90件の検査を無駄にしない。
  const measuredAt = now();
  log('サイトマップが読まれたかを見ます（Sitemaps API）…');
  const sitemapStatuses = [];
  for (const path of sitemaps) {
    const result = await fetchSitemapStatus({ siteUrl: options.siteUrl, feedpath: path, accessToken });
    // 404 は「送信済みでも既知でもない」という答えなので、known: false に落として続ける。
    // それ以外の失敗（401/403/5xx）は再試行しても駄目だったということなので実行できていない
    if (!result.ok && !result.notFound) {
      log(`  サイトマップの状態を取れません: ${path}（${result.error}）`);
      log('サービスアカウントに Search Console の権限があるか確認してください。');
      return EXIT_FAILED;
    }
    const status = toSitemapStatus(path, result);
    sitemapStatuses.push(status);
    log(`  ${formatSitemapStatus(status, measuredAt)}`);
  }

  // 読まれていない／久しく読まれていない子は「未完了」と同じ扱いで知らせる。
  // gsc-audit.yml は終了コード1では落ちないので、気づける場所はこのログと --out のJSON
  const unreadSitemaps = sitemapStatuses.filter(
    (status) => !status.known || !status.lastDownloaded || isStale(status.lastDownloaded, measuredAt),
  );
  if (unreadSitemaps.length > 0) {
    log(`  読まれていない／${STALE_DAYS}日より古いサイトマップ: ${unreadSitemaps.length} 本`);
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
      measuredAt,
      sitemap: options.sitemap,
      siteUrl: options.siteUrl,
      total: summary.total,
      counts: summary.counts,
      legacyByHost: summary.legacyByHost,
      // 週ごとに並べて「登録が増えているか」を見るのはここ
      // （docs/features/google-index-recovery.md「A. 監査スクリプトの内訳出力」）
      coverageByState: summary.coverageByState,
      // 「index の子が Google に読まれているか」を週ごとに並べて見るのはここ
      // （docs/features/sitemap-discovery-audit.md「B」）
      sitemaps: sitemapStatuses,
      rows,
    };
    await writeSnapshot(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);
    log(`結果を書き出しました: ${options.out}`);
  }

  // 統合の報告は「完了」なのに 1 で終わる組み合わせがあるので、理由をログに残す
  if (summary.complete && unreadSitemaps.length > 0) {
    log(
      `統合は完了していますが、読まれていない／${STALE_DAYS}日より古いサイトマップが ` +
        `${unreadSitemaps.length} 本あるので終了コード 1 にします。`,
    );
  }

  return summary.complete && unreadSitemaps.length === 0 ? EXIT_COMPLETE : EXIT_INCOMPLETE;
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
