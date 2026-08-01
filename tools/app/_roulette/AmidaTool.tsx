'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Item } from '@/lib/roulette/types'
import type { Theme } from '@/lib/roulette/themes'
import { shareCard } from '@/lib/roulette/resultImage'

interface Props {
  /** 参加者(縦線) */
  items: Item[]
  theme: Theme
}

/** 横棒: row 段目の col 列と col+1 列をつなぐ */
interface Rung {
  row: number
  col: number
}

const ROWS = 12
const COL_W = 74
const ROW_H = 26
const TOP = 44
const BOTTOM = 44

/** 隣り合う横棒が重ならないように、段ごとにランダムで橋をかける */
function buildRungs(cols: number): Rung[] {
  const rungs: Rung[] = []
  for (let row = 0; row < ROWS; row++) {
    let col = 0
    while (col < cols - 1) {
      if (Math.random() < 0.45) {
        rungs.push({ row, col })
        col += 2 // 隣接した横棒を作らない
      } else {
        col += 1
      }
    }
  }
  return rungs
}

/** ある列から下までたどって、どの列に着くか */
function trace(start: number, rungs: Rung[], cols: number) {
  const path: { row: number; col: number }[] = [{ row: -1, col: start }]
  let col = start
  for (let row = 0; row < ROWS; row++) {
    const left = rungs.find((r) => r.row === row && r.col === col - 1)
    const right = rungs.find((r) => r.row === row && r.col === col)
    if (right) col += 1
    else if (left) col -= 1
    path.push({ row, col })
  }
  return { end: Math.min(col, cols - 1), path }
}

export default function AmidaTool({ items, theme }: Props) {
  const [prizeText, setPrizeText] = useState('当たり\nはずれ\nはずれ\nはずれ')
  const [seed, setSeed] = useState(0)
  const [revealed, setRevealed] = useState<number[]>([])
  const [active, setActive] = useState<number | null>(null)
  // React 19 の useRef は初期値が必須（18では省略できた）
  const activeTimer = useRef<number | undefined>(undefined)

  // 参加者が変わると列の対応がずれるので、開いた結果は消す
  useEffect(() => {
    setRevealed([])
    setActive(null)
  }, [items])

  const names = items
  const prizes = useMemo(
    () =>
      prizeText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [prizeText],
  )

  const cols = names.length
  const rungs = useMemo(() => (cols >= 2 ? buildRungs(cols) : []), [cols, seed])

  /** 下端に並ぶ結果。足りない分は空欄にする(繰り返すと当たりが増えてしまう) */
  const slots = useMemo(
    () =>
      Array.from({ length: cols }, (_, i) =>
        prizes.length ? (prizes[i] ?? '') : `${i + 1}番`,
      ),
    [prizes, cols],
  )

  const results = useMemo(() => {
    if (cols < 2) return []
    return names.map((_, i) => {
      const { end } = trace(i, rungs, cols)
      return slots[end] ?? ''
    })
  }, [names, rungs, slots, cols])

  const width = Math.max(cols, 2) * COL_W
  const height = TOP + ROWS * ROW_H + BOTTOM

  const pick = (i: number) => {
    setActive(i)
    setRevealed((r) => (r.includes(i) ? r : [...r, i]))
    // 続けて別の人を選んでも、前のタイマーで線が消えないようにする
    window.clearTimeout(activeTimer.current)
    activeTimer.current = window.setTimeout(() => setActive(null), 1800)
  }

  const reset = () => {
    setSeed((s) => s + 1)
    setRevealed([])
    setActive(null)
  }

  const onShare = () =>
    shareCard(
      {
        heading: 'あみだくじの結果',
        main: '',
        accent: theme.vars['--accent'],
        lines: names.map((n, i) => `${n.text} → ${results[i] ?? ''}`),
      },
      'amida.png',
    )

  if (cols < 2) {
    return (
      <section className="tool">
        <p className="mode-note">参加者を2人以上入れてください。</p>
      </section>
    )
  }

  const tracePath = active !== null ? trace(active, rungs, cols).path : null

  return (
    <section className="tool">
      <label className="prize-field">
        当たり・結果(1行に1つ)
        <textarea
          rows={4}
          value={prizeText}
          onChange={(e) => setPrizeText(e.target.value)}
          placeholder={'当たり\nはずれ\nはずれ'}
        />
        {prizes.length > 0 && prizes.length !== cols && (
          <span className="prize-hint">
            {prizes.length < cols
              ? `参加者${cols}人に対して${prizes.length}行です。残り${cols - prizes.length}人は空欄になります。`
              : `参加者${cols}人に対して${prizes.length}行です。${prizes.length - cols}行は使われません。`}
          </span>
        )}
      </label>

      <div className="amida-wrap">
        {/* 列が増えても潰さない。入りきらない分は横スクロールさせる */}
        <svg
          className="amida"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
        >
          {/* 縦線 */}
          {names.map((_, i) => (
            <line
              key={i}
              x1={COL_W * i + COL_W / 2}
              y1={TOP}
              x2={COL_W * i + COL_W / 2}
              y2={TOP + ROWS * ROW_H}
              stroke="var(--line)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}

          {/* 横棒 */}
          {rungs.map((r, i) => (
            <line
              key={i}
              x1={COL_W * r.col + COL_W / 2}
              y1={TOP + r.row * ROW_H + ROW_H / 2}
              x2={COL_W * (r.col + 1) + COL_W / 2}
              y2={TOP + r.row * ROW_H + ROW_H / 2}
              stroke="var(--line)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}

          {/* たどっている線 */}
          {tracePath && (
            <polyline
              className="amida-trace"
              points={tracePath
                .map((p, idx) => {
                  const x = COL_W * p.col + COL_W / 2
                  const y =
                    p.row < 0 ? TOP : TOP + p.row * ROW_H + ROW_H / 2
                  const prev = tracePath[idx - 1]
                  // 横移動は同じ高さで折れるので、点を2つ打つ
                  return prev && prev.col !== p.col
                    ? `${COL_W * prev.col + COL_W / 2},${y} ${x},${y}`
                    : `${x},${y}`
                })
                .join(' ')}
              fill="none"
              stroke={theme.vars['--accent']}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* 名前と結果 */}
          {names.map((n, i) => (
            <text
              key={`n${i}`}
              x={COL_W * i + COL_W / 2}
              y={TOP - 16}
              className="amida-label"
            >
              {n.text.length > 4 ? `${n.text.slice(0, 4)}…` : n.text}
            </text>
          ))}
          {names.map((_, i) => (
            <text
              key={`r${i}`}
              x={COL_W * i + COL_W / 2}
              y={TOP + ROWS * ROW_H + 28}
              className="amida-label result"
            >
              {slots[i]}
            </text>
          ))}
        </svg>
      </div>

      <div className="amida-picks">
        {names.map((n, i) => (
          <button
            key={n.id}
            className={`amida-pick ${revealed.includes(i) ? 'done' : ''}`}
            onClick={() => pick(i)}
          >
            <span aria-hidden>{n.emoji}</span>
            {n.text}
            {revealed.includes(i) && <em>{results[i]}</em>}
          </button>
        ))}
      </div>

      <div className="share-row">
        <button
          className="btn btn-outline"
          onClick={() => setRevealed(names.map((_, i) => i))}
        >
          すべて表示
        </button>
        <button className="btn btn-ghost" onClick={reset}>
          作り直す
        </button>
        {revealed.length > 0 && (
          <button className="btn btn-ghost" onClick={onShare}>
            画像にして共有
          </button>
        )}
      </div>
    </section>
  )
}
