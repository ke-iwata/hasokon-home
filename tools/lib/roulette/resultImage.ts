// 結果を画像(PNG)にして共有できるようにする。
// canvas に直接描くので外部ライブラリは不要。

export interface ShareCard {
  /** 見出し(例: 罰ゲームルーレット) */
  heading: string
  /** 大きく出す文字(例: 一発ギャグ) */
  main: string
  emoji?: string
  /** 補足の行(グループ分けの結果など) */
  lines?: string[]
  accent: string
}

const W = 1200
const H = 630

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 幅に収まるようフォントサイズを詰める */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  maxWidth: number,
  weight = '800',
) {
  let size = max
  const family = "'Hiragino Sans','Noto Sans JP',system-ui,sans-serif"
  do {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 4
  } while (size > 24)
  return size
}

export function drawShareCard(card: ShareCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // 背景
  ctx.fillStyle = '#f4f7fb'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = card.accent
  ctx.globalAlpha = 0.1
  ctx.beginPath()
  ctx.arc(W - 90, 70, 190, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(80, H - 60, 150, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // 見出し
  ctx.textAlign = 'center'
  ctx.fillStyle = '#7d879b'
  ctx.font = "600 30px 'Hiragino Sans','Noto Sans JP',system-ui,sans-serif"
  ctx.fillText(card.heading, W / 2, 92)

  const hasLines = !!card.lines?.length

  if (!hasLines) {
    // 単一の結果を大きく出す
    if (card.emoji) {
      ctx.font = '120px system-ui'
      ctx.fillText(card.emoji, W / 2, 290)
    }
    const size = fitFont(ctx, card.main, 92, W - 180)
    ctx.fillStyle = card.accent
    ctx.font = `800 ${size}px 'Hiragino Sans','Noto Sans JP',system-ui,sans-serif`
    ctx.fillText(card.main, W / 2, card.emoji ? 420 : 360)
  } else {
    // 複数行(グループ分けなど)をカードに並べる
    const lines = card.lines!.slice(0, 8)
    const cols = lines.length > 4 ? 2 : 1
    const rows = Math.ceil(lines.length / cols)
    const boxW = cols === 1 ? W - 240 : (W - 260) / 2
    const boxH = Math.min(78, (H - 260) / rows)
    const startY = 140

    ctx.textAlign = 'left'
    lines.forEach((line, i) => {
      const col = cols === 1 ? 0 : i % cols
      const row = cols === 1 ? i : Math.floor(i / cols)
      const x = cols === 1 ? 120 : 110 + col * (boxW + 40)
      const y = startY + row * (boxH + 14)

      ctx.fillStyle = '#ffffff'
      roundRect(ctx, x, y, boxW, boxH, 16)
      ctx.fill()
      ctx.strokeStyle = '#e2e8f2'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#2c3444'
      const size = fitFont(ctx, line, 30, boxW - 44, '700')
      ctx.font = `700 ${size}px 'Hiragino Sans','Noto Sans JP',system-ui,sans-serif`
      ctx.fillText(line, x + 22, y + boxH / 2 + size / 3)
    })
    ctx.textAlign = 'center'
  }

  // フッター
  ctx.fillStyle = '#a8b0c2'
  ctx.font = "500 26px 'Hiragino Sans','Noto Sans JP',system-ui,sans-serif"
  ctx.fillText('hasokon.com', W / 2, H - 46)

  return canvas
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, ng) =>
    canvas.toBlob((b) => (b ? ok(b) : ng(new Error('failed'))), 'image/png'),
  )
}

/** 共有シートを開く。使えない環境ではダウンロードにする */
export async function shareCard(card: ShareCard, fileName = 'result.png') {
  const canvas = drawShareCard(card)
  const blob = await toBlob(canvas)
  const file = new File([blob], fileName, { type: 'image/png' })

  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean
    share?: (d: ShareData) => Promise<void>
  }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: card.main })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}

/** URLを共有する(画像なし)。使えなければクリップボードへ */
export async function shareLink(title: string, url: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
  if (nav.share) {
    try {
      await nav.share({ title, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
