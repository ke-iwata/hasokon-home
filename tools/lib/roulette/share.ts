// 項目を URL のハッシュに載せて共有できるようにする。
// 日本語をそのまま base64 に通せないので UTF-8 バイト列を経由する。

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeItems(items: { text: string; emoji: string }[]): string {
  // 区切りに使うタブ・改行が項目名に混ざっていたら空白に潰す
  const clean = (s: string) => s.replace(/[\t\n\r]+/g, ' ')
  return toBase64Url(items.map((i) => `${clean(i.emoji)}\t${clean(i.text)}`).join('\n'))
}

export function decodeItems(
  encoded: string,
): { text: string; emoji?: string }[] | null {
  try {
    return fromBase64Url(encoded)
      .split('\n')
      .map((line) => {
        const [a, b] = line.split('\t')
        return b === undefined
          ? { text: a.trim() }
          : { emoji: a.trim(), text: b.trim() }
      })
      .filter((x) => x.text)
  } catch {
    return null
  }
}

/** 現在のURLのハッシュから項目を読む(#i=...) */
export function itemsFromHash(): { text: string; emoji?: string }[] | null {
  const m = location.hash.match(/[#&]i=([^&]+)/)
  if (!m) return null
  const items = decodeItems(m[1])
  return items && items.length >= 2 ? items : null
}

export function shareUrl(items: { text: string; emoji: string }[]): string {
  const base = location.href.split('#')[0]
  return `${base}#i=${encodeItems(items)}`
}
