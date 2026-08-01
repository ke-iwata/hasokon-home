'use client'

import { useEffect, useMemo } from 'react'

interface Props {
  winner: string
  emoji?: string
  /** 結果を画像にして共有する */
  onShareImage?: () => void
  onAgain: () => void
  onRemoveAndAgain: () => void
  onClose: () => void
}

const CONFETTI_COLORS = [
  '#e8664a',
  '#f2a355',
  '#e9c46a',
  '#d9776f',
  '#c98a5b',
  '#f0b27a',
]

export default function ResultOverlay({
  winner,
  emoji,
  onShareImage,
  onAgain,
  onRemoveAndAgain,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 紙吹雪。位置と色は開いたときに1度だけ決める
  const confetti = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.7,
        duration: 1.9 + Math.random() * 1.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tilt: Math.random() * 360,
        wide: Math.random() > 0.5,
      })),
    [],
  )

  return (
    <div className="overlay" onClick={onClose}>
      <div className="confetti" aria-hidden>
        {confetti.map((c, i) => (
          <span
            key={i}
            style={{
              left: `${c.left}%`,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.tilt}deg)`,
              width: c.wide ? 10 : 6,
              height: c.wide ? 6 : 12,
            }}
          />
        ))}
      </div>

      <div className="result" onClick={(e) => e.stopPropagation()} role="dialog" aria-live="polite">
        <p className="result-lead">結果</p>
        {emoji && (
          <p className="result-emoji" aria-hidden>
            {emoji}
          </p>
        )}
        <p className="result-name">{winner}</p>
        <div className="result-actions">
          <button className="btn btn-primary" onClick={onAgain}>
            もう一度まわす
          </button>
          <button className="btn btn-outline" onClick={onRemoveAndAgain}>
            これを除いてまわす
          </button>
        </div>
        {onShareImage && (
          <button className="btn btn-ghost share-image" onClick={onShareImage}>
            画像にして共有
          </button>
        )}
        <button className="btn btn-ghost result-close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
