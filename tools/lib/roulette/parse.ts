// 貼り付けや入力された文字列を項目の配列に変換する。
// 名簿のコピペ(改行・カンマ・タブ区切り)と「1〜30」のような連番指定に対応する。

const SEPARATORS = /[\n\r\t,、,]+/

/** 「1〜30」「1-30」「1..30」などを数値の範囲として解釈する */
export function parseRange(text: string): string[] | null {
  const m = text
    .trim()
    .match(/^(-?\d+)\s*(?:〜|～|~|-|–|—|\.\.|to|から)\s*(-?\d+)$/i)
  if (!m) return null

  const from = Number(m[1])
  const to = Number(m[2])
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  // 極端な範囲は展開しない(誤入力で固まるのを防ぐ)
  if (Math.abs(to - from) > 200) return null

  const step = from <= to ? 1 : -1
  const out: string[] = []
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(String(i))
  return out
}

/**
 * まとめて入力された文字列を項目名の配列にする。
 * 区切り文字は自動判別し、行頭の番号や記号(「1. 」「・」など)は取り除く。
 */
export function parseItems(text: string): string[] {
  const out: string[] = []
  for (const chunk of text.split(SEPARATORS)) {
    const cleaned = chunk
      .trim()
      // 「1. 」「1) 」「・」「- 」などの行頭装飾を落とす
      .replace(/^(?:[0-9０-９]+\s*[.)．)]\s*|[・\-–—*•]\s+)/, '')
      .trim()
    if (!cleaned) continue

    const range = parseRange(cleaned)
    if (range) out.push(...range)
    else out.push(cleaned)
  }
  return out
}

/** 重複している項目名と、その出現回数 */
export function findDuplicates(names: string[]): Map<string, number> {
  const count = new Map<string, number>()
  for (const n of names) count.set(n, (count.get(n) ?? 0) + 1)
  return new Map([...count].filter(([, c]) => c > 1))
}

/** 重複を1つずつに畳む(最初の出現順を保つ) */
export function dedupe<T>(list: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  return list.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
