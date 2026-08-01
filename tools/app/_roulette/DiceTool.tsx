'use client'

import { useRef, useState } from 'react'
import type { Theme } from '@/lib/roulette/themes'
import { shareCard } from '@/lib/roulette/resultImage'
import DiceBowl from './DiceBowl'

/** 選べる個数。細かく入力させるより選ぶほうが早い */
const COUNTS = Array.from({ length: 10 }, (_, i) => i + 1)
/** 選べる面の数。実際に売られているサイコロに合わせる */
const FACE_OPTIONS = [6, 8, 10, 12]
/**
 * 転がるアニメーションの長さ。
 * CSSの die-roll（0.85s）に少し余裕を足す。
 * 短いと動いている途中で結果が出てしまう
 */
const ROLL_MS = 980

interface Props {
  theme: Theme
}

type Kind = 'dice' | 'range'

export default function DiceTool({ theme }: Props) {
  const [kind, setKind] = useState<Kind>('dice')
  const [count, setCount] = useState(2)
  const [faces, setFaces] = useState(6)
  const [min, setMin] = useState(1)
  const [max, setMax] = useState(100)
  const [values, setValues] = useState<number[]>([])
  const [rolling, setRolling] = useState(false)
  // 振った回数。立体サイコロはこれを見て回転量を増やす
  const [spin, setSpin] = useState(0)
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

    // 出目を先に決めてしまい、その面が上を向くまで転がす。
    // 途中で値を差し替えると動きと噛み合わないため
    if (kind === 'dice') {
      setValues(rollOnce())
      setSpin((n) => n + 1)
      timers.current.push(window.setTimeout(() => setRolling(false), ROLL_MS))
      return
    }

    // 範囲から選ぶときは数字を切り替えて抽選している感じを出す
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
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="num-field">
              面の数
              <select value={faces} onChange={(e) => setFaces(Number(e.target.value))}>
                {FACE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
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
            <DiceBowl values={values} faces={faces} spin={spin} />
            {values.length > 1 && !rolling && <p className="dice-total">合計 {total}</p>}
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
