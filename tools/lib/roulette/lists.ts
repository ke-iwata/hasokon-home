// 名前を付けて保存した項目リスト。
// 「2年3組の名簿」「昼メシ候補」のように使い回せるようにする。

import type { Item } from './types'

export interface SavedList {
  id: string
  name: string
  items: Item[]
  updatedAt: number
}

export const LISTS_KEY = 'roulette:lists'

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** 同名のリストがあれば上書き、なければ追加。更新順に並べ替える */
export function upsertList(
  lists: SavedList[],
  name: string,
  items: Item[],
): SavedList[] {
  const trimmed = name.trim()
  const existing = lists.find((l) => l.name === trimmed)
  const entry: SavedList = {
    id: existing?.id ?? newId(),
    name: trimmed,
    items,
    updatedAt: Date.now(),
  }
  const rest = lists.filter((l) => l.id !== entry.id)
  return [entry, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 保存名の候補(先頭の項目からそれらしい名前を作る) */
export function suggestName(items: Item[]): string {
  if (!items.length) return ''
  const head = items
    .slice(0, 2)
    .map((i) => i.text)
    .join('・')
  return items.length > 2 ? `${head} ほか${items.length - 2}件` : head
}
