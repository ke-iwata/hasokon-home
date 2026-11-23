/**
 * ページ下部の関連ツールの並びを決める（純関数）。
 *
 * 仕様: docs/features/related-tools-topical.md
 *
 * 1. registry の `related`（手書きの「次に使うもの」）を書いた順に先頭へ
 * 2. 足りないぶんを同じカテゴリ → 他のカテゴリの順で、registry の並びのまま埋める
 *
 * どちらも `publicTools` から引くので、公開前（wip / preview）のツールは出ない。
 * 埋め草を作るときは先に出したものを除き、**同じ slug を2回出さない**。
 */
import { publicTools, tools, type ToolDef } from '@/lib/registry';

/** カードがどこから来たか。GA4 の related_click の link_source にそのまま入る */
export type RelatedLinkSource = 'related' | 'category';

export interface RelatedEntry {
  tool: ToolDef;
  source: RelatedLinkSource;
}

/**
 * @param current 今いるページの slug（自分自身は出さない）
 * @param limit 出す最大件数
 * @param all registry 全体（テスト用に差し替えられる）
 */
export function pickRelatedTools(
  current: string,
  limit = 6,
  all: readonly ToolDef[] = tools,
): RelatedEntry[] {
  const published = all === tools ? publicTools : all.filter((t) => t.stage === 'public');
  const self = all.find((t) => t.slug === current);
  const used = new Set<string>([current]);
  const list: RelatedEntry[] = [];

  for (const slug of self?.related ?? []) {
    const t = published.find((p) => p.slug === slug);
    if (!t || used.has(t.slug)) continue;
    used.add(t.slug);
    list.push({ tool: t, source: 'related' });
  }

  // 同じカテゴリを優先し、足りなければ他のカテゴリで埋める。
  // 件数の少ないカテゴリでも、リンクが2〜3本で終わらないようにするため
  const rest = published.filter((t) => !used.has(t.slug));
  const fill = [
    ...rest.filter((t) => t.category === self?.category),
    ...rest.filter((t) => t.category !== self?.category),
  ];
  for (const t of fill) list.push({ tool: t, source: 'category' });

  return list.slice(0, limit);
}

/** 見出し。`related` が1本でも出ていれば「あわせて確認したいツール」 */
export function relatedHeading(current: string, entries: readonly RelatedEntry[]): string {
  if (entries.some((e) => e.source === 'related')) return 'あわせて確認したいツール';
  const self = tools.find((t) => t.slug === current);
  return self ? `${self.category}の他のツール` : '他のツール';
}
