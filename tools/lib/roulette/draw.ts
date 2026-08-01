// 抽選のしかたと、その履歴。
// 履歴を踏まえて「同じ項目ばかり当たらない」ようにできるのがこのサービスの肝。

import type { Item } from './types'

export type DrawMode = 'random' | 'noRepeat' | 'avoidRecent'

export interface DrawRecord {
  /** 当たった項目名(項目を編集しても履歴が残るよう名前で持つ) */
  text: string
  emoji: string
  at: number
}

export const DRAW_MODES: { id: DrawMode; label: string; note: string }[] = [
  {
    id: 'random',
    label: '毎回ランダム',
    note: '前の結果に関係なく、いつも同じ確率で選びます',
  },
  {
    id: 'noRepeat',
    label: '全員に一巡',
    note: 'すべての項目が一度ずつ当たるまで、同じものは出ません',
  },
  {
    id: 'avoidRecent',
    label: '直近は避ける',
    note: '最近当たった項目は選ばれにくくします',
  },
]

/** 直近何回ぶんを「最近」とみなすか(項目数に応じて決める) */
function recentWindow(total: number) {
  return Math.max(1, Math.floor(total / 3))
}

/**
 * 抽選する。履歴と方式に応じて候補を絞ってから選ぶ。
 * 候補が尽きる場合は全項目に戻す(必ず1つ返す)。
 */
export function pickWinner(
  items: Item[],
  history: DrawRecord[],
  mode: DrawMode,
): Item {
  const pool = eligible(items, history, mode)
  return pool[Math.floor(Math.random() * pool.length)]
}

/** その方式で今回の対象になる項目 */
export function eligible(
  items: Item[],
  history: DrawRecord[],
  mode: DrawMode,
): Item[] {
  if (items.length === 0) return items
  if (mode === 'random') return items

  if (mode === 'noRepeat') {
    // 古い順にたどり、一巡し終えるたびに数え直す。
    // 最後に残った drawn が「いまの周回ですでに出た項目」になる。
    const names = new Set(items.map((i) => i.text))
    const drawn = new Set<string>()
    for (let k = history.length - 1; k >= 0; k--) {
      const rec = history[k]
      if (!names.has(rec.text)) continue
      if (drawn.size >= names.size) drawn.clear() // 前の周回が終わっていた
      drawn.add(rec.text)
    }
    if (drawn.size >= names.size) drawn.clear()
    const rest = items.filter((i) => !drawn.has(i.text))
    return rest.length ? rest : items
  }

  // avoidRecent: 直近ぶんを除外する
  const window = recentWindow(items.length)
  const recent = new Set(history.slice(0, window).map((r) => r.text))
  const rest = items.filter((i) => !recent.has(i.text))
  return rest.length ? rest : items
}

/** 項目ごとの当選回数(多い順) */
export function tally(
  items: Item[],
  history: DrawRecord[],
): { text: string; emoji: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const rec of history) counts.set(rec.text, (counts.get(rec.text) ?? 0) + 1)
  return items
    .map((i) => ({ text: i.text, emoji: i.emoji, count: counts.get(i.text) ?? 0 }))
    .sort((a, b) => b.count - a.count)
}

export const HISTORY_LIMIT = 100

export function addRecord(history: DrawRecord[], item: Item): DrawRecord[] {
  return [
    { text: item.text, emoji: item.emoji, at: Date.now() },
    ...history,
  ].slice(0, HISTORY_LIMIT)
}
