'use client'

import type { Item } from '@/lib/roulette/types'
import { DRAW_MODES, eligible, tally, type DrawMode, type DrawRecord } from '@/lib/roulette/draw'

interface Props {
  items: Item[]
  history: DrawRecord[]
  mode: DrawMode
  onChangeMode: (m: DrawMode) => void
  onClearHistory: () => void
}

export default function DrawPanel({
  items,
  history,
  mode,
  onChangeMode,
  onClearHistory,
}: Props) {
  const note = DRAW_MODES.find((m) => m.id === mode)?.note
  const pool = eligible(items, history, mode)
  const counts = tally(items, history)
  const drawn = counts.reduce((sum, c) => sum + c.count, 0)

  return (
    <section className="draw-panel" aria-labelledby="draw-title">
      <div className="panel-head">
        <h2 id="draw-title">決め方</h2>
        {drawn > 0 && <span className="count">これまで {drawn} 回</span>}
      </div>

      <div className="mode-row" role="group" aria-label="抽選の方式">
        {DRAW_MODES.map((m) => (
          <button
            key={m.id}
            className={`mode ${m.id === mode ? 'active' : ''}`}
            aria-pressed={m.id === mode}
            onClick={() => onChangeMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mode-note">{note}</p>

      {mode !== 'random' && items.length > 0 && (
        <p className="mode-note pool">
          次に選ばれる候補: {pool.length} / {items.length} 件
        </p>
      )}

      {drawn > 0 && (
        <>
          <div className="tally">
            {counts.map((c) => (
              <span
                key={c.text}
                className={`tally-item ${c.count === 0 ? 'zero' : ''}`}
                title={`${c.text}: ${c.count}回`}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.text}
                <em>{c.count}</em>
              </span>
            ))}
          </div>

          <div className="history">
            <span className="presets-label">最近の結果</span>
            <ol className="history-list">
              {history.slice(0, 5).map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  <span aria-hidden>{h.emoji}</span>
                  {h.text}
                </li>
              ))}
            </ol>
            <button className="mini-btn" onClick={onClearHistory}>
              履歴を消す
            </button>
          </div>
        </>
      )}
    </section>
  )
}
