// Bing Webmaster Tools API を叩いて、検索パフォーマンス（表示回数・クリック・検索語）を取る部分。
//
// 仕様: docs/features/bing-search-performance-audit.md の「B」
//
// Search Console の表示が 28 日で 1 回しかない（2026-09-28）一方、Organic Search の
// 約 9 割は Bing から来ている。**「どの語で・どのページが」出ているかの実測値は
// Bing にしかない**ので、週次監査に足して毎週残す。
//
// API キーは URL のクエリ（`apikey=`）に載る。**ログにもエラー文にも --dry-run にも出さない**
// （redactKey() を通す）。このリポジトリは public で、Actions のログは誰でも読める。

import { backoffDelay, isRetryable } from './search-console.mjs';

/** JSON エンドポイント。`/<メソッド>?siteUrl=…&apikey=…` で GET する */
export const API_ENDPOINT = 'https://ssl.bing.com/webmaster/api.svc/json';

/** Bing に登録した表記。末尾スラッシュまで一致しないと空の配列が返る */
export const DEFAULT_SITE_URL = 'https://hasokon.com/';

/**
 * 検索語は表示回数 5 回以上のものだけを残す。
 * 検索語には人名など個人に関わる語がまれに混ざる（養育費・相続まわりで特に）。
 * それより細かい行は表にも JSON にも残さない（仕様書の A・やらないこと）
 */
export const MIN_IMPRESSIONS = 5;

/** 表に出す上位の件数（クエリ・ページとも） */
export const TOP_N = 20;

/** 叩く順番。サイト全体 → 検索語 → ページ */
export const METHODS = Object.freeze(['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats']);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * API の URL を組み立てる。
 *
 * @param {string} method
 * @param {string} siteUrl
 * @param {string} apiKey
 * @param {Record<string, string>} [extra] `GetPageQueryStats` の `page` など
 */
export function endpointUrl(method, siteUrl, apiKey, extra = {}) {
  const params = new URLSearchParams({ siteUrl, ...extra, apikey: apiKey });
  return `${API_ENDPOINT}/${method}?${params.toString()}`;
}

/**
 * 文字列からキーを伏せる。`apikey=` の値と、キーそのもの（生・エンコード済み）の両方。
 *
 * @param {string} message
 * @param {string} [apiKey]
 */
export function redactKey(message, apiKey) {
  let text = String(message).replace(/(apikey=)[^&\s"']+/gi, '$1***');
  if (apiKey) {
    for (const form of new Set([apiKey, encodeURIComponent(apiKey)])) {
      text = text.split(form).join('***');
    }
  }
  return text;
}

/**
 * WCF の日付（`/Date(1316156400000-0700)/`）を `YYYY-MM-DD` にする。
 * `Date.parse` では読めない。ミリ秒は UTC で、後ろの `±hhmm` は書き出した側の
 * タイムゾーンなので、それを足した暦日を返す（例の値は 2011-09-16 00:00 -07:00）。
 *
 * @param {string} value
 * @returns {string|null} 読めなければ null
 */
export function parseDotNetDate(value) {
  const match = /^\/Date\((-?\d+)([+-])?(\d{2})?(\d{2})?\)\/$/.exec(String(value ?? ''));
  if (!match) return null;
  let ms = Number(match[1]);
  if (match[2] && match[3] && match[4]) {
    const offset = (Number(match[3]) * 60 + Number(match[4])) * 60 * 1000;
    ms += match[2] === '+' ? offset : -offset;
  }
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** 応答の `d` を配列で取り出す。登録直後は空・null が正常なので、失敗扱いにしない */
export function parseRows(body) {
  return Array.isArray(body?.d) ? body.d : [];
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * `GetRankAndTrafficStats` の行を、7 日・28 日の合計にまとめる。
 *
 * **日別で返るとは決めつけない**（仕様書の申し送り）。点の間隔が 1 日なら日別として
 * 7 日と 28 日を出し、それより粗ければ週単位として 28 日だけを出す
 * （「7 日」を週の点から作らない）。期間の終わりは、`nowIso` 以前でいちばん新しい点。
 * Bing のデータは週 1 回しか更新されないので、今日を起点にすると直近が空に見える。
 *
 * @param {object[]} rows
 * @param {string} nowIso
 */
export function summarizeTraffic(rows, nowIso) {
  const today = String(nowIso).slice(0, 10);
  const byDate = new Map();
  for (const row of rows) {
    const date = parseDotNetDate(row.Date);
    if (!date || date > today) continue;
    const entry = byDate.get(date) ?? { date, impressions: 0, clicks: 0 };
    entry.impressions += toNumber(row.Impressions);
    entry.clicks += toNumber(row.Clicks);
    byDate.set(date, entry);
  }
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  let granularity = 'unknown';
  if (points.length >= 2) {
    let minGap = Infinity;
    for (let i = 1; i < points.length; i += 1) {
      minGap = Math.min(minGap, daysBetween(points[i - 1].date, points[i].date));
    }
    granularity = minGap <= 1 ? 'daily' : 'weekly';
  }

  const latest = points.at(-1)?.date ?? null;
  const window = (days) => {
    if (!latest) return { days, from: null, to: null, impressions: 0, clicks: 0, points: 0 };
    const inRange = points.filter((p) => daysBetween(p.date, latest) < days);
    return {
      days,
      from: inRange[0]?.date ?? null,
      to: latest,
      impressions: inRange.reduce((sum, p) => sum + p.impressions, 0),
      clicks: inRange.reduce((sum, p) => sum + p.clicks, 0),
      points: inRange.length,
    };
  };

  return {
    granularity,
    latest,
    // 日別と判定できたときだけ 7 日を出す
    last7: granularity === 'daily' ? window(7) : null,
    last28: window(28),
  };
}

/**
 * 同じキー（検索語・ページ）の行を足し合わせる。Bing は日付ごとに行を分けて返すことがある。
 * 平均掲載順位は表示回数で重み付けする（0 以下は「順位なし」なので数えない）。
 *
 * @param {object[]} rows
 * @param {(row: object) => string} keyOf
 */
export function aggregate(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const entry = map.get(key) ?? { key, impressions: 0, clicks: 0, posWeight: 0, posSum: 0 };
    const impressions = toNumber(row.Impressions);
    entry.impressions += impressions;
    entry.clicks += toNumber(row.Clicks);
    const position = toNumber(row.AvgImpressionPosition);
    if (position > 0 && impressions > 0) {
      entry.posSum += position * impressions;
      entry.posWeight += impressions;
    }
    map.set(key, entry);
  }
  return [...map.values()].map(({ key, impressions, clicks, posSum, posWeight }) => ({
    key,
    impressions,
    clicks,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : null,
    position: posWeight > 0 ? Math.round((posSum / posWeight) * 10) / 10 : null,
  }));
}

/** 表示回数が minImpressions 未満の検索語を落とす（個人に関わる語を残さないため） */
export function filterQueries(rows, minImpressions = MIN_IMPRESSIONS) {
  return rows.filter((row) => row.impressions >= minImpressions);
}

/** `key` の値の大きい順に n 件。同数ならキーの辞書順で固定する */
export function topN(rows, key, n = TOP_N) {
  return [...rows]
    .sort((a, b) => b[key] - a[key] || String(a.key).localeCompare(String(b.key)))
    .slice(0, n);
}

/**
 * ページの URL を `hasokon.com` からの相対パスにする（GA4 の `pagePath` と突き合わせるため）。
 * 別ホストの URL はそのまま返す。
 */
export function toRelativePath(url, siteUrl = DEFAULT_SITE_URL) {
  try {
    const page = new URL(url);
    const site = new URL(siteUrl);
    if (page.host === site.host) return `${page.pathname}${page.search}`;
  } catch {
    // URL でなければそのまま
  }
  return url;
}

/**
 * 3 本の応答を、表と JSON に使う形にまとめる。取れなかった本は null のまま渡す
 * （「0 件」と「取れなかった」を区別するため）。
 *
 * @param {{ traffic: object[]|null, queries: object[]|null, pages: object[]|null }} fetched
 * @param {{ siteUrl?: string, nowIso: string }} options
 */
export function summarize(fetched, { siteUrl = DEFAULT_SITE_URL, nowIso }) {
  const traffic = fetched.traffic === null ? null : summarizeTraffic(fetched.traffic, nowIso);
  const queries =
    fetched.queries === null
      ? null
      : topN(filterQueries(aggregate(fetched.queries, (row) => row.Query)), 'impressions', TOP_N);
  // GetPageStats はページの URL を `Query` に入れて返す（型が QueryStats と共通のため）
  const pages =
    fetched.pages === null
      ? null
      : topN(
          aggregate(fetched.pages, (row) => {
            const url = row.Page ?? row.Query;
            return url ? toRelativePath(url, siteUrl) : '';
          }),
          'impressions',
          TOP_N,
        );
  return { siteUrl, traffic, queries, pages };
}

const GRANULARITY_LABEL = { daily: '日別', weekly: '週単位', unknown: '粒度不明' };

function fmt(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function escapeCell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatStatsTable(title, rows, label, errors, note) {
  const lines = [`## ${title}`, ''];
  if (rows === null) {
    lines.push(`**取れませんでした**：${errors ?? '不明なエラー'}`);
    return lines;
  }
  if (note) lines.push(note, '');
  if (rows.length === 0) {
    lines.push('0 件（登録直後・データ更新前は 0 件が正常）');
    return lines;
  }
  lines.push(`| ${label} | 表示回数 | クリック | CTR | 平均掲載順位 |`, '|---|---|---|---|---|');
  for (const row of rows) {
    const ctr = row.ctr === null ? '-' : `${row.ctr}%`;
    lines.push(`| ${escapeCell(row.key)} | ${row.impressions} | ${row.clicks} | ${ctr} | ${fmt(row.position)} |`);
  }
  return lines;
}

/**
 * 標準出力に出す Markdown。
 *
 * @param {ReturnType<typeof summarize>} summary
 * @param {{ traffic?: string, queries?: string, pages?: string }} [errors] 取れなかった本の理由（伏せ字済み）
 */
export function formatReport(summary, errors = {}) {
  const lines = [`# Bing の検索パフォーマンス（${summary.siteUrl}）`, ''];

  lines.push('## サイト全体の表示回数とクリック', '');
  if (summary.traffic === null) {
    lines.push(`**取れませんでした**：${errors.traffic ?? '不明なエラー'}`);
  } else if (summary.traffic.latest === null) {
    lines.push('0 件（登録直後・データ更新前は 0 件が正常）');
  } else {
    const t = summary.traffic;
    lines.push(`データの粒度：${GRANULARITY_LABEL[t.granularity]}（最新の点 ${t.latest}）`, '');
    lines.push('| 期間 | 表示回数 | クリック |', '|---|---|---|');
    for (const w of [t.last7, t.last28]) {
      if (!w) continue;
      lines.push(`| 直近 ${w.days} 日（${w.from}〜${w.to}） | ${w.impressions} | ${w.clicks} |`);
    }
  }
  lines.push('');

  lines.push(
    ...formatStatsTable(
      `上位の検索語（表示 ${MIN_IMPRESSIONS} 回以上・上位 ${TOP_N} 件まで）`,
      summary.queries,
      '検索語',
      errors.queries,
      `表示 ${MIN_IMPRESSIONS} 回未満の検索語は、個人に関わる語が混ざりうるので出さない（全件は Bing Webmaster Tools の画面で見る）。`,
    ),
    '',
  );
  lines.push(...formatStatsTable(`上位のページ（上位 ${TOP_N} 件）`, summary.pages, 'ページ', errors.pages), '');

  return lines.join('\n').trimEnd();
}

/**
 * 1 本 GET する。失敗したら maxAttempts まで投げ直す（429 と 5xx と通信失敗だけ）。
 * **エラー文は必ずキーを伏せて返す。**
 *
 * @param {{ method: string, siteUrl: string, apiKey: string, extra?: Record<string, string> }} params
 * @param {{ fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, maxAttempts?: number, baseDelayMs?: number }} [options]
 * @returns {Promise<{ok: true, body: object} | {ok: false, error: string}>}
 */
export async function callApi(params, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  // 仕様書の A：各 1 回まで再試行
  const maxAttempts = options.maxAttempts ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const url = endpointUrl(params.method, params.siteUrl, params.apiKey, params.extra);

  let lastError = 'unknown';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
    } catch (error) {
      lastError = `通信に失敗: ${error.message}`;
      if (attempt + 1 < maxAttempts) {
        await sleep(backoffDelay(attempt, baseDelayMs));
        continue;
      }
      break;
    }

    if (response.ok) {
      try {
        return { ok: true, body: await response.json() };
      } catch (error) {
        lastError = `応答がJSONではありません: ${error.message}`;
        break;
      }
    }

    const text = await response.text();
    lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
    if (isRetryable(response.status) && attempt + 1 < maxAttempts) {
      await sleep(backoffDelay(attempt, baseDelayMs));
      continue;
    }
    break;
  }

  return { ok: false, error: redactKey(lastError, params.apiKey) };
}
