// ルーレット以外の「決め方」。それぞれ専用ページを持つ。
// 中身は src/data/tools.json にあり、ページ生成スクリプトも同じファイルを読む。

import TOOLS_DATA from './tools.json'

export type ToolId = 'group' | 'dice'

export interface ToolMeta {
  id: ToolId
  path: string
  name: string
  emoji: string
  title: string
  description: string
  lead: string
  /** ページ下部に置く説明(見出しと本文) */
  sections: { h: string; p: string[] }[]
}

export const TOOLS = TOOLS_DATA as ToolMeta[]

export function toolById(id: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.id === id)
}
