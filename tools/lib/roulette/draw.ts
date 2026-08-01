// 抽選のしかた。
//
// 以前は「全員に一巡」「直近は避ける」といった決め方と、そのための履歴を
// 持っていたが、機能を整理して毎回ランダムのみにした。

import type { Item } from './types'

/**
 * 項目からひとつ選ぶ。どの項目も同じ確率で選ばれる。
 *
 * 呼び出し側（ルーレット）は項目が2つ以上あるときしか回せないため、
 * 空配列は想定していない。渡された場合は例外にして誤用に気づけるようにする。
 */
export function pickWinner(items: Item[]): Item {
  if (items.length === 0) {
    throw new Error('pickWinner: 項目が空です')
  }
  return items[Math.floor(Math.random() * items.length)]
}
