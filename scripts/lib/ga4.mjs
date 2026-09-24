// GA4 Data API（`runReport`）を叩いて、チャネル別のセッションを取る部分。
//
// 仕様: docs/features/ai-assistant-channel.md の「A. 週次レポートに AI チャネルを足す」
//
// **測れるようにするのが先**、という提案。llms.txt を書き換えても（同仕様書 B）、
// AI 経由の流入が動いたかどうかを毎週見られなければ、効いたかが永久に分からない。
//
// サービスアカウントは Search Console 監査で使っているものと同じで、
// `analytics.readonly` を既に持っている。**新しい権限もスコープの追加も要らない**。

import { backoffDelay, isRetryable } from './search-console.mjs';

/** GA4 Data API。プロパティIDを挟んで :runReport を呼ぶ */
export const DATA_API_ENDPOINT = 'https://analyticsdata.googleapis.com/v1beta';

/** GA4 の既定チャネルグループのうち、この提案が追っているもの */
export const AI_CHANNEL = 'AI Assistant';

/** 直近の集計期間（日）。GA4 の画面・過去の計測（仕様書の表）と揃えて28日 */
export const WINDOW_DAYS = 28;

/**
 * 集計期間。直近28日と、その前の28日を並べて「増えたか」を見る。
 *
 * `endDate: 'yesterday'` にしてあるのは、当日ぶんが確定していないため
 * （途中の数字を前週と比べると、毎週「減った」ように見える）。
 *
 * @param {number} days
 */
export function dateRanges(days = WINDOW_DAYS) {
  return [
    { name: 'current', startDate: `${days}daysAgo`, endDate: 'yesterday' },
    { name: 'previous', startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` },
  ];
}

/** チャネル × 参照元のリクエスト本文。仕様書の「計測値」の表と同じ切り口 */
export function channelRequest(days = WINDOW_DAYS) {
  return {
    dateRanges: dateRanges(days),
    dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 200,
  };
}

/**
 * AI Assistant に絞ったランディングページのリクエスト本文。
 *
 * **AI に選ばれているページと、検索で読まれているページは別物**というのが
 * 仕様書のいちばん効く発見（1位が大富豪、2位がインターバルタイマー）。
 * 毎週ここを見ていないと、その前提が変わったことに気づけない。
 */
export function landingPageRequest(days = WINDOW_DAYS) {
  return {
    dateRanges: [dateRanges(days)[0]],
    dimensions: [{ name: 'landingPage' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      filter: {
        fieldName: 'sessionDefaultChannelGroup',
        stringFilter: { matchType: 'EXACT', value: AI_CHANNEL },
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 20,
  };
}

/**
 * レスポンスを `{ 次元名: 値, sessions: 数, dateRange: 名前 }` の配列にする。
 *
 * 期間を2つ渡すと GA4 が `dateRange` 次元を足して返すので、
 * **次元の位置を決め打ちせず、ヘッダーの名前で引く**。
 *
 * 行が無いときは空配列。`rows` そのものが返らないことがある（0件のとき）。
 */
export function parseRows(body) {
  const headers = (body?.dimensionHeaders ?? []).map((h) => h.name);
  return (body?.rows ?? []).map((row) => {
    const out = { sessions: Number(row?.metricValues?.[0]?.value ?? 0) };
    headers.forEach((name, i) => {
      out[name] = row?.dimensionValues?.[i]?.value ?? '';
    });
    return out;
  });
}

/** 前の28日ぶんの行か。`dateRange` 次元は期間を2つ渡したときだけ付く */
function isPrevious(row) {
  return row.dateRange === 'previous' || row.dateRange === 'date_range_1';
}

/**
 * 期間ごとのチャネル別セッション（合計）。`{ current: Map, previous: Map }`
 *
 * `dateRanges` に名前を付けてあるので GA4 は `current` / `previous` を返すが、
 * 名前を落とした呼び方（`date_range_0` / `date_range_1`）でも読めるようにしておく。
 */
export function summarizeChannels(rows) {
  const totals = { current: new Map(), previous: new Map() };
  for (const row of rows) {
    const range = isPrevious(row) ? 'previous' : 'current';
    const key = row.sessionDefaultChannelGroup || '(not set)';
    const bucket = totals[range];
    bucket.set(key, (bucket.get(key) ?? 0) + row.sessions);
  }
  return totals;
}

/** 直近28日の参照元（上位 n 件）。仕様書の `sessionSource` の表にあたる */
export function topSources(rows, limit = 5) {
  const totals = new Map();
  for (const row of rows) {
    if (isPrevious(row)) continue; // 前の28日は入れない
    const key = row.sessionSource || '(direct)';
    totals.set(key, (totals.get(key) ?? 0) + row.sessions);
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([source, sessions]) => ({ source, sessions }));
}

/** AI 経由のランディング上位 n 件 */
export function topLandings(rows, limit = 5) {
  return rows
    .map((row) => ({ page: row.landingPage || '(not set)', sessions: row.sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

/**
 * 週次のログに出す形にまとめる。
 *
 * **判断に使うのは AI Assistant の増減**で、他のチャネルは分母として添える。
 * `sessionSource: google` を「Google 検索が効いている」根拠にしないこと
 * （Search Console の表示回数と食い違う。仕様書の「背景と根拠」）。
 */
export function summarize(channelRows, landingRows, options = {}) {
  const days = options.days ?? WINDOW_DAYS;
  const totals = summarizeChannels(channelRows);
  const current = totals.current.get(AI_CHANNEL) ?? 0;
  const previous = totals.previous.get(AI_CHANNEL) ?? 0;
  const allCurrent = [...totals.current.values()].reduce((a, b) => a + b, 0);

  return {
    days,
    ai: { current, previous, delta: current - previous },
    /** 全チャネルの合計に占める割合（%、小数1桁）。0除算は 0 にする */
    aiShare: allCurrent === 0 ? 0 : Math.round((current / allCurrent) * 1000) / 10,
    channels: [...totals.current]
      .sort((a, b) => b[1] - a[1])
      .map(([channel, sessions]) => ({
        channel,
        sessions,
        previous: totals.previous.get(channel) ?? 0,
      })),
    sources: topSources(channelRows),
    landings: topLandings(landingRows),
  };
}

/** 「月曜のログに1行で出す」部分（仕様書 A）。続けて内訳を数行 */
export function formatSummaryLine(summary) {
  const { current, previous, delta } = summary.ai;
  const sign = delta > 0 ? `+${delta}` : String(delta);
  const top = summary.landings
    .slice(0, 5)
    .map((l) => `${l.page} ${l.sessions}`)
    .join(' / ');
  return (
    `AI Assistant: ${current} セッション（直近${summary.days}日・前の${summary.days}日は ${previous}・${sign}）` +
    `／全体の ${summary.aiShare}%` +
    (top === '' ? '' : `／上位: ${top}`)
  );
}

/** 内訳（チャネル別・参照元）。1行目のあとにログへ流す */
export function formatReport(summary) {
  const lines = [formatSummaryLine(summary)];
  lines.push(`  チャネル別（直近${summary.days}日 / 前の${summary.days}日）:`);
  for (const c of summary.channels) lines.push(`    ${c.channel}: ${c.sessions} / ${c.previous}`);
  if (summary.sources.length > 0) {
    lines.push('  参照元（上位）:');
    for (const s of summary.sources) lines.push(`    ${s.source}: ${s.sessions}`);
  }
  return lines.join('\n');
}

/**
 * `runReport` を1本投げる。失敗したら maxAttempts まで投げ直す
 * （待ち方は Search Console 側と同じ。429 と 5xx だけ入れ直す）。
 *
 * @param {{ propertyId: string, accessToken: string, body: object }} params
 * @param {{ fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, maxAttempts?: number, baseDelayMs?: number }} [options]
 */
export async function runReport(params, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const url = `${DATA_API_ENDPOINT}/properties/${encodeURIComponent(params.propertyId)}:runReport`;

  let lastError = 'unknown';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${params.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(params.body),
      });
    } catch (error) {
      lastError = `通信に失敗: ${error.message}`;
      if (attempt + 1 < maxAttempts) {
        await sleep(backoffDelay(attempt, baseDelayMs));
        continue;
      }
      break;
    }

    if (response.ok) return { ok: true, body: await response.json() };

    const text = await response.text();
    lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
    if (isRetryable(response.status) && attempt + 1 < maxAttempts) {
      await sleep(backoffDelay(attempt, baseDelayMs));
      continue;
    }
    break;
  }

  return { ok: false, error: lastError };
}
