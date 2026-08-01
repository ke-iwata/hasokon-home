'use client'

import { useRef, useState } from 'react'
import type { Theme } from '@/lib/roulette/themes'
import { shareCard } from '@/lib/roulette/resultImage'

interface Props {
  theme: Theme
}

type Kind = 'dice' | 'range'

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
}

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = PIPS[value] ?? PIPS[1]
  return (
    <div className={`die ${rolling ? 'rolling' : ''}`} aria-label={`${value}`}>
      {value <= 6 ? (
        <svg viewBox="0 0 3 3">
          {pips.map(([x, y], i) => (
            <circle key={i} cx={x + 0.5} cy={y + 0.5} r="0.32" />
          ))}
        </svg>
      ) : (
        <span className="die-num">{value}</span>
      )}
    </div>
  )
}

export default function DiceTool({ theme }: Props) {
  const [kind, setKind] = useState<Kind>('dice')
  const [count, setCount] = useState(2)
  const [faces, setFaces] = useState(6)
  const [min, setMin] = useState(1)
  const [max, setMax] = useState(100)
  const [values, setValues] = useState<number[]>([])
  const [rolling, setRolling] = useState(false)
  const timers = useRef<number[]>([])

  const rollOnce = () =>
    kind === 'dice'
      ? Array.from({ length: Math.min(Math.max(1, count), 10) }, () =>
          Math.floor(Math.random() * Math.max(2, faces)) + 1,
        )
      : [Math.floor(Math.random() * (Math.max(min, max) - Math.min(min, max) + 1)) + Math.min(min, max)]

  const roll = () => {
    if (rolling) return
    setRolling(true)
    timers.current.forEach(clearTimeout)
    timers.current = []
    // 転がっている見た目を作るため、短い間隔で値を差し替える
    for (let i = 0; i < 8; i++) {
      timers.current.push(window.setTimeout(() => setValues(rollOnce()), i * 70))
    }
    timers.current.push(
      window.setTimeout(() => {
        setValues(rollOnce())
        setRolling(false)
      }, 8 * 70 + 120),
    )
  }

  const total = values.reduce((a, b) => a + b, 0)

  const onShare = () =>
    shareCard(
      {
        heading: kind === 'dice' ? 'サイコロ' : `${Math.min(min, max)}〜${Math.max(min, max)} の抽選`,
        main: kind === 'dice' && values.length > 1 ? `合計 ${total}` : String(values[0] ?? ''),
        emoji: '🎲',
        accent: theme.vars['--accent'],
      },
      'dice.png',
    )

  return (
    <section className="tool">
      <div className="tool-controls">
        <div className="seg" role="group" aria-label="種類">
          <button
            className={`mode ${kind === 'dice' ? 'active' : ''}`}
            onClick={() => setKind('dice')}
            aria-pressed={kind === 'dice'}
          >
            サイコロ
          </button>
          <button
            className={`mode ${kind === 'range' ? 'active' : ''}`}
            onClick={() => setKind('range')}
            aria-pressed={kind === 'range'}
          >
            範囲から選ぶ
          </button>
        </div>

        {kind === 'dice' ? (
          <>
            <label className="num-field">
              個数
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <label className="num-field">
              面の数
              <input
                type="number"
                min={2}
                max={100}
                value={faces}
                onChange={(e) => setFaces(Number(e.target.value))}
              />
            </label>
          </>
        ) : (
          <>
            <label className="num-field">
              最小
              <input
                type="number"
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
              />
            </label>
            <label className="num-field">
              最大
              <input
                type="number"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            </label>
          </>
        )}
      </div>

      <div className="dice-stage">
        {values.length === 0 ? (
          <p className="mode-note">下のボタンで振ります</p>
        ) : kind === 'dice' ? (
          <>
            <div className="dice-row">
              {values.map((v, i) => (
                <Die key={i} value={v} rolling={rolling} />
              ))}
            </div>
            {values.length > 1 && <p className="dice-total">合計 {total}</p>}
          </>
        ) : (
          <p className={`range-value ${rolling ? 'rolling' : ''}`}>{values[0]}</p>
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
