'use client'

import { useEffect, useRef, useState } from 'react'
import type { Item } from '@/lib/roulette/types'
import { CARD_COLORS } from '@/lib/roulette/colors'

interface Props {
  items: Item[]
  spinning: boolean
  /** 外(結果画面・スペースキー)から回すための合図 */
  spinSignal?: number
  onSpinStart: () => void
  onResult: (item: Item) => void
  /** 当選項目の決め方(履歴を踏まえた抽選を外から差し込む) */
  pick?: (items: Item[]) => Item
}

const CARD_W = 150
const GAP = 26
const SPIN_MS = 5200
// リングに並べる枚数の上限。多すぎるとカードが潰れるので演出用に間引く
const MAX_RING = 18

function sampleRing(items: Item[], winner?: Item): Item[] {
  if (items.length <= MAX_RING) return items
  const rest = items.filter((x) => x.id !== winner?.id)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const picked = rest.slice(0, MAX_RING - (winner ? 1 : 0))
  if (winner) picked.splice(Math.floor(Math.random() * picked.length), 0, winner)
  return picked
}

export default function Carousel({
  items,
  spinning,
  spinSignal = 0,
  onSpinStart,
  onResult,
  pick,
}: Props) {
  const [rotation, setRotation] = useState(0)
  const [ring, setRing] = useState<Item[]>(() => sampleRing(items))
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  const spinRef = useRef<() => void>(() => {})

  // 項目が変わったら並びを作り直す
  useEffect(() => {
    setRing(sampleRing(items))
    setWinnerId(null)
  }, [items])

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
    },
    [],
  )

  const n = Math.max(ring.length, 3)
  const step = 360 / n
  const radius = Math.round((CARD_W + GAP) / 2 / Math.tan(Math.PI / n))

  const spin = () => {
    if (spinning || items.length < 2) return
    onSpinStart()
    setWinnerId(null)

    // 抽選は常に全項目から。当選項目は必ずリングに入れる
    const winner = pick
      ? pick(items)
      : items[Math.floor(Math.random() * items.length)]
    let current = ring
    if (!current.some((x) => x.id === winner.id)) {
      current = sampleRing(items, winner)
      setRing(current)
    }
    const index = current.findIndex((x) => x.id === winner.id)

    // 当選カードを正面(0deg)へ。常に同じ向きに数周させる
    const desired = -index * step
    const delta = ((((desired - rotation) % 360) - 360) % 360) || -360
    const turns = 4 + Math.floor(Math.random() * 2)
    setRotation(rotation + delta - turns * 360)

    timers.current.push(
      window.setTimeout(() => setWinnerId(winner.id), SPIN_MS),
      window.setTimeout(() => onResult(winner), SPIN_MS + 800),
    )
  }

  spinRef.current = spin

  useEffect(() => {
    if (spinSignal > 0) spinRef.current()
  }, [spinSignal])

  return (
    <div className="carousel-stage">
      <div className="stage-marker" aria-hidden />

      <div className="carousel-viewport">
        <div
          className="carousel-ring"
          style={{
            transform: `translateZ(${-radius}px) rotateY(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 0.84, 0.1, 1)`
              : 'none',
          }}
        >
          {ring.map((item, i) => (
            <div
              key={item.id}
              className={`carousel-card ${winnerId === item.id ? 'winner' : ''}`}
              style={{
                transform: `rotateY(${i * step}deg) translateZ(${radius}px)`,
                background: CARD_COLORS[i % CARD_COLORS.length],
              }}
            >
              <span className="card-emoji" aria-hidden>
                {item.emoji}
              </span>
              <span className="card-label">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="btn btn-primary btn-spin"
        onClick={spin}
        disabled={spinning || items.length < 2}
      >
        {spinning ? '回転中…' : 'まわす'}
      </button>
    </div>
  )
}
