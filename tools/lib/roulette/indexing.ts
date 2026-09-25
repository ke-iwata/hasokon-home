import type { Metadata } from 'next';

/**
 * 用途別ルーレット（/r/<slug>/）と使い方の記事（/guide/<slug>/）の robots。
 *
 * 同じルーレットアプリに 1,200 字前後の本文を足した近い作りのページが 16 本あり、
 * Google のサイト単位の品質判定（2026-08 以降、登録がトップ 1 件まで落ちた）を
 * 下げうる。直近 28 日の Google 表示 0・Bing 着地もほぼ無いので、
 * **サイト全体の登録が戻るまで noindex にしてサイトマップから外す**。
 * ページは残し、ルーレット本体からのリンクもそのまま（follow は残す）。
 *
 * 戻すかどうかは登録が戻ったときの登録数で決め、判断は
 * docs/features/google-index-recovery.md の「経過」に残す（提案 B）。
 */
export const THIN_PAGE_ROBOTS = { index: false, follow: true } satisfies Metadata['robots'];
