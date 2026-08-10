'use client'

import { useRef, useState } from 'react'
import type { Theme } from '@/lib/roulette/themes'
import { shareCard } from '@/lib/roulette/resultImage'
import Dice3D from './Dice3D'
import { trackToolUse } from '@/lib/analytics'

interface Props {
  theme: Theme
}

/** サイコロの面の数。立方体なので6で固定 */
const FACES = 6
/** 選べる個数。細かく入力させるより選ぶほうが早い */
const COUNTS = Array.from({ length: 10 }, (_, i) => i + 1)

/**
 * 転がるアニメーションの長さ。
 * CSSの die-roll（0.78s）に少し余裕を足す。
 * 短いと動いている途中で結果が出てしまう
 */
const ROLL_MS = 880

export default function DiceTool({ theme }: Props) {
  const [count, setCount] = useState(2)
  const [values, setValues] = useState<number[]>([])
  const [rolling, setRolling] = useState(false)
  // 振った回数。これが変わるとサイコロが転がり直す
  const [spin, setSpin] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  const roll = () => {
    if (rolling) return
    setRolling(true)
    trackToolUse('dice', 'roll')
    clearTimeout(timer.current)

    // 出目を先に決めてしまい、その面が手前に来るまで転がす。
    // 途中で値を差し替えると動きと噛み合わないため
    setValues(Array.from({ length: count }, () => Math.floor(Math.random() * FACES) + 1))
    setSpin((n) => n + 1)
    timer.current = window.setTimeout(() => setRolling(false), ROLL_MS)
  }

  const total = values.reduce((a, b) => a + b, 0)

  const onShare = () =>
    shareCard(
      {
        heading: 'サイコロ',
        main: values.length > 1 ? `合計 ${total}` : String(values[0] ?? ''),
        emoji: '🎲',
        accent: theme.vars['--accent'],
      },
      'dice.png',
    )

  return (
    <section className="tool">
      <div className="tool-controls">
        <div className="count-picker" role="group" aria-label="サイコロの個数">
          <span className="count-label">個数</span>
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`count-btn ${n === count ? 'active' : ''}`}
              onClick={() => setCount(n)}
              aria-pressed={n === count}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="dice-stage">
        {values.length === 0 ? (
          <p className="mode-note">下のボタンで振ります</p>
        ) : (
          <>
            <Dice3D values={values} spin={spin} rolling={rolling} />
            {values.length > 1 && !rolling && <p className="dice-total">合計 {total}</p>}
          </>
        )}
      </div>

      <button className="btn btn-primary btn-go" onClick={roll} disabled={rolling}>
        {rolling ? '…' : values.length ? 'もう一度振る' : '振る'}
      </button>

      {values.length > 0 && !rolling && (
        <div className="share-row">
          <button className="btn btn-outline" onClick={onShare}>
            画像にして共有
          </button>
        </div>
      )}
    </section>
  )
}
