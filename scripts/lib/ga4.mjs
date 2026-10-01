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
 * 着地ページが空／`(not set)` のセッション＝**page_view の無い「幽霊セッション」**。
 *
 * 仕様: docs/features/web-vitals-phantom-sessions.md の C
 *
 * GA4 のセッションが 30 分無操作で切れたあとに、タブを閉じるときの `web_vitals`・
 * `user_engagement` が飛ぶと、page_view の無い新しいセッションが立つ。着地ページは空、
 * 参照元も無いのでチャネルは `Unassigned` になる。`web_vitals` を入れた 2026-09-28 に
 * 1 日 1〜4 件から 42 件に跳ね、セッション数とチャネル表を水増しした。
 */
export const PHANTOM_LANDING_PAGES = Object.freeze(['', '(not set)']);

/**
 * 幽霊セッションが全体の何 % を超えたら警告するか。
 *
 * **暫定の閾値。** 09-02〜09-27 は 3〜15%、09-28 は 56%。
 * セッションのタイムアウト延長（仕様書 A）のあとに下がった実測で見直す。
 */
export const PHANTOM_WARN_PERCENT = 10;

/** 幽霊セッションが入るチャネル。チャネル表のこの行に「うち page_view 無し」を添える */
export const UNASSIGNED_CHANNEL = 'Unassigned';

/**
 * 着地ページが空のセッションを、チャネル別に数えるリクエスト本文。
 * 期間は直近ぶんだけ（割合の分母はチャネル別の current 合計を使う）。
 */
export function phantomSessionRequest(days = WINDOW_DAYS) {
  return {
    dateRanges: [dateRanges(days)[0]],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      filter: {
        fieldName: 'landingPage',
        inListFilter: { values: [...PHANTOM_LANDING_PAGES] },
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  };
}

/**
 * 幽霊セッションの数・全体に占める割合・`Unassigned` に入った分・警告するか。
 *
 * @param {Array<{ sessions: number, sessionDefaultChannelGroup?: string }>} rows `phantomSessionRequest` の応答を `parseRows` に通したもの
 * @param {number} totalSessions 直近の全セッション（チャネル別の current の合計）
 */
export function summarizePhantom(rows, totalSessions, options = {}) {
  const warnPercent = options.warnPercent ?? PHANTOM_WARN_PERCENT;
  let sessions = 0;
  let unassigned = 0;
  for (const row of rows) {
    sessions += row.sessions;
    if ((row.sessionDefaultChannelGroup || UNASSIGNED_CHANNEL) === UNASSIGNED_CHANNEL) {
      unassigned += row.sessions;
    }
  }
  /** 全体に占める割合（%、小数1桁）。0除算は 0 にする */
  const share = totalSessions === 0 ? 0 : Math.round((sessions / totalSessions) * 1000) / 10;
  return { sessions, unassigned, share, warnPercent, warn: share > warnPercent };
}

/**
 * 参照元ホスト × `sessionSource` × チャネルのリクエスト本文。
 *
 * 仕様: docs/features/yahoo-ai-search-referral.md の A
 *
 * Yahoo! JAPAN 検索の AI 回答からの流入は `search.yahoo.co.jp` の参照で `utm_source=openai&utm_medium=organic`
 * が付き、GA4 は Organic Search に入れる（AI Assistant に出ない）。チャネル表だけでは
 * 「Bing が伸びた」と読み違えるので、**参照元のホスト**を並べて見る。
 *
 * `pageReferrer` はイベント単位の次元なので、`session_start` に絞って
 * 「セッションの最初の 1 件」だけを数える（件数がセッション数になる）。
 */
export function referrerRequest(days = WINDOW_DAYS) {
  return {
    dateRanges: [dateRanges(days)[0]],
    dimensions: [
      { name: 'pageReferrer' },
      { name: 'sessionSource' },
      { name: 'sessionDefaultChannelGroup' },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { matchType: 'EXACT', value: 'session_start' },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 500,
  };
}

/** 参照元の表に出す行数 */
export const REFERRER_TOP = 10;

/**
 * `pageReferrer`（URL）をホスト名に丸める。空は `(none)`。
 * URL として読めない値（`(not set)` など）はそのまま返す。
 */
export function referrerHost(ref) {
  const value = (ref ?? '').trim();
  if (value === '') return '(none)';
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

/**
 * 参照元ホスト × `sessionSource` × チャネルの上位 n 件。
 * 同じホストでもパスが違う参照（`/games/daifugo/` と `/tools/` など）を 1 行にまとめる。
 *
 * @param {Array<{ sessions: number, pageReferrer?: string, sessionSource?: string, sessionDefaultChannelGroup?: string }>} rows
 */
export function summarizeReferrers(rows, limit = REFERRER_TOP) {
  const totals = new Map();
  for (const row of rows) {
    const host = referrerHost(row.pageReferrer);
    const source = row.sessionSource || '(direct)';
    const channel = row.sessionDefaultChannelGroup || '(not set)';
    const key = JSON.stringify([host, source, channel]);
    totals.set(key, (totals.get(key) ?? 0) + row.sessions);
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, sessions]) => {
      const [host, source, channel] = JSON.parse(key);
      return { host, source, channel, sessions };
    });
}

/**
 * AI 経由の内訳に使う `sessionSource`。
 *
 * - `chatgpt.com`：ChatGPT 本体（`utm_source=chatgpt.com`）
 * - `openai`：Yahoo! JAPAN 検索の AI 回答。OpenAI API の Web 検索が出典 URL に付ける。
 *   `utm_medium=organic` が付くので GA4 は Organic Search に入れる
 */
export const CHATGPT_SOURCE = 'chatgpt.com';
export const YAHOO_AI_SOURCE = 'openai';

/** 読み方の注記。週次の表に固定で 1 行出す */
export const AI_SOURCE_NOTE =
  '`openai` は Yahoo! JAPAN 検索の AI 回答（OpenAI API 経由）。ChatGPT 本体は `chatgpt.com`';

/**
 * AI 経由の合計と内訳（期間 1 本ぶん）。
 * ChatGPT・Yahoo! AI はチャネルを問わず参照元で数え、
 * それ以外は AI Assistant チャネルに入ったものだけを「その他」に足す（二重に数えない）。
 */
function aiBreakdown(rows) {
  let chatgpt = 0;
  let yahoo = 0;
  let other = 0;
  for (const row of rows) {
    if (row.sessionSource === CHATGPT_SOURCE) chatgpt += row.sessions;
    else if (row.sessionSource === YAHOO_AI_SOURCE) yahoo += row.sessions;
    else if (row.sessionDefaultChannelGroup === AI_CHANNEL) other += row.sessions;
  }
  return { total: chatgpt + yahoo + other, chatgpt, yahoo, other };
}

/**
 * **判断に使う値。** AI Assistant チャネル単独ではなく、Yahoo! AI（`openai`）を足した合計。
 *
 * 仕様: docs/features/yahoo-ai-search-referral.md の A
 *
 * @param {ReturnType<typeof parseRows>} channelRows `channelRequest` の応答（期間 2 本）
 */
export function summarizeAiTraffic(channelRows) {
  const current = aiBreakdown(channelRows.filter((row) => !isPrevious(row)));
  const previous = aiBreakdown(channelRows.filter((row) => isPrevious(row)));
  return { current, previous, delta: current.total - previous.total };
}

/**
 * 参照元が確定していない `sessionSource`。GA4 は直近 24〜48 時間の参照元を後から埋めるので、
 * 前日分がこの値のまま Cross-network / Unassigned に出る。
 */
export const UNRESOLVED_SOURCES = Object.freeze(['(data not available)', '(not set)']);

/** 参照元が未確定のセッションが全体の何 % を超えたら警告するか（仕様書 B） */
export const UNRESOLVED_WARN_PERCENT = 10;

/**
 * 直近ぶんで、参照元が未確定のセッションの数・割合・警告するか。
 *
 * 仕様: docs/features/yahoo-ai-search-referral.md の B
 */
export function summarizeUnresolved(channelRows, options = {}) {
  const warnPercent = options.warnPercent ?? UNRESOLVED_WARN_PERCENT;
  let sessions = 0;
  let total = 0;
  for (const row of channelRows) {
    if (isPrevious(row)) continue;
    total += row.sessions;
    if (UNRESOLVED_SOURCES.includes(row.sessionSource)) sessions += row.sessions;
  }
  const share = total === 0 ? 0 : Math.round((sessions / total) * 1000) / 10;
  return { sessions, share, warnPercent, warn: share > warnPercent };
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

/**
 * 前の28日ぶんの行か。`dateRange` 次元は期間を2つ渡したときだけ付く。
 *
 * **`dateRanges()` の `name` を変えたら、ここも直すこと。**
 * 一致しなかった行は current 側に寄るので、**黙って直近28日に混ざる**
 * （落ちないので気づけない）。
 */
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
 * **判断に使うのは AI 経由の合計（`aiTraffic`）の増減**で、他のチャネルは分母として添える。
 * 2026-10 までは AI Assistant チャネル単独だったが、Yahoo! JAPAN 検索の AI 回答（`openai`）が
 * Organic Search に入るので合計に替えた（docs/features/yahoo-ai-search-referral.md）。
 * `sessionSource: google` を「Google 検索が効いている」根拠にしないこと
 * （Search Console の表示回数と食い違う。仕様書の「背景と根拠」）。
 */
export function summarize(channelRows, landingRows, options = {}) {
  const days = options.days ?? WINDOW_DAYS;
  const phantomRows = options.phantomRows ?? [];
  const referrerRows = options.referrerRows ?? [];
  const totals = summarizeChannels(channelRows);
  const current = totals.current.get(AI_CHANNEL) ?? 0;
  const previous = totals.previous.get(AI_CHANNEL) ?? 0;
  const allCurrent = [...totals.current.values()].reduce((a, b) => a + b, 0);

  return {
    days,
    ai: { current, previous, delta: current - previous },
    aiTraffic: summarizeAiTraffic(channelRows),
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
    phantom: summarizePhantom(phantomRows, allCurrent),
    referrers: summarizeReferrers(referrerRows),
    unresolved: summarizeUnresolved(channelRows),
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
    `AI Assistant: ${current} セッション（チャネル単独・直近${summary.days}日・前の${summary.days}日は ${previous}・${sign}）` +
    `／全体の ${summary.aiShare}%` +
    (top === '' ? '' : `／上位: ${top}`)
  );
}

/**
 * 判断に使う 1 行（AI 経由の合計と内訳・前期比）。
 *
 * 仕様: docs/features/yahoo-ai-search-referral.md の A
 */
export function formatAiTrafficLine(summary) {
  const { current, previous, delta } = summary.aiTraffic;
  const sign = delta > 0 ? `+${delta}` : String(delta);
  return (
    `AI 経由: 合計 ${current.total}（ChatGPT 直接 ${current.chatgpt}・Yahoo! AI ${current.yahoo}・` +
    `その他の AI Assistant ${current.other}）` +
    `／直近${summary.days}日・前の${summary.days}日は ${previous.total}・${sign}`
  );
}

/** 内訳（チャネル別・参照元）。1行目のあとにログへ流す */
export function formatReport(summary) {
  const lines = [];
  if (summary.aiTraffic) lines.push(formatAiTrafficLine(summary));
  lines.push(formatSummaryLine(summary));
  lines.push(`  読み方: ${AI_SOURCE_NOTE}`);
  lines.push(`  チャネル別（直近${summary.days}日 / 前の${summary.days}日）:`);
  for (const c of summary.channels) {
    // Unassigned が跳ねた週は、まず幽霊セッションを疑う（web-vitals-phantom-sessions.md の E）
    const note =
      c.channel === UNASSIGNED_CHANNEL && summary.phantom
        ? `（うち page_view 無し ${summary.phantom.unassigned}）`
        : '';
    lines.push(`    ${c.channel}: ${c.sessions} / ${c.previous}${note}`);
  }
  if (summary.sources.length > 0) {
    lines.push('  参照元（上位）:');
    for (const s of summary.sources) lines.push(`    ${s.source}: ${s.sessions}`);
  }
  if (summary.referrers && summary.referrers.length > 0) {
    lines.push(`  参照元ホスト × sessionSource（直近${summary.days}日・上位${summary.referrers.length}）:`);
    for (const r of summary.referrers) {
      lines.push(`    ${r.host} / ${r.source} / ${r.channel}: ${r.sessions}`);
    }
  }
  if (summary.phantom) lines.push(formatPhantomLine(summary.phantom, summary.days));
  if (summary.unresolved) lines.push(formatUnresolvedLine(summary.unresolved, summary.days));
  return lines.join('\n');
}

/** 幽霊セッションの1行。閾値を超えたら先頭に印を付ける */
export function formatPhantomLine(phantom, days = WINDOW_DAYS) {
  const mark = phantom.warn ? `⚠ ${phantom.warnPercent}% 超え: ` : '';
  return (
    `  ${mark}page_view の無いセッション（着地ページ空）: ${phantom.sessions}` +
    `（直近${days}日・全体の ${phantom.share}%・うち Unassigned ${phantom.unassigned}）`
  );
}

/** 参照元が未確定のセッションの1行。閾値を超えたら先頭に印を付ける */
export function formatUnresolvedLine(unresolved, days = WINDOW_DAYS) {
  const mark = unresolved.warn ? `⚠ ${unresolved.warnPercent}% 超え: ` : '';
  return (
    `  ${mark}参照元が未確定のセッション（${UNRESOLVED_SOURCES.join('・')}）: ${unresolved.sessions}` +
    `（直近${days}日・全体の ${unresolved.share}%）`
  );
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
