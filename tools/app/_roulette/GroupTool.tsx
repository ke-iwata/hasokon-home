'use client'

import { useEffect, useState } from 'react'
import type { Item } from '@/lib/roulette/types'
import type { Theme } from '@/lib/roulette/themes'
import { shareCard } from '@/lib/roulette/resultImage'
import { trackToolUse } from '@/lib/analytics'

interface Props {
  items: Item[]
  theme: Theme
}

type SplitBy = 'count' | 'size'

function shuffle<T>(list: T[]): T[] {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** 端数は先頭のグループから1人ずつ多く配る */
function split(items: Item[], groups: number): Item[][] {
  const shuffled = shuffle(items)
  const out: Item[][] = Array.from({ length: groups }, () => [])
  const base = Math.floor(items.length / groups)
  const extra = items.length % groups
  let at = 0
  for (let g = 0; g < groups; g++) {
    const take = base + (g < extra ? 1 : 0)
    out[g] = shuffled.slice(at, at + take)
    at += take
  }
  return out
}

export default function GroupTool({ items, theme }: Props) {
  const [by, setBy] = useState<SplitBy>('count')
  const [groups, setGroups] = useState(2)
  const [perGroup, setPerGroup] = useState(4)
  const [result, setResult] = useState<Item[][] | null>(null)
  const [shared, setShared] = useState('')

  // メンバーが変わったら前の分け結果は消す(消えた人が結果に残るため)
  useEffect(() => {
    setResult(null)
  }, [items])

  const ready = items.length >= 2
  const actualGroups =
    by === 'count'
      ? Math.min(Math.max(2, groups), Math.max(2, items.length))
      : Math.max(1, Math.ceil(items.length / Math.max(1, perGroup)))

  const run = () => {
    if (!ready) return
    setResult(split(items, actualGroups))
    trackToolUse('group', 'split')
  }

  const onShare = async () => {
    if (!result) return
    const r = await shareCard(
      {
        heading: 'グループ分け',
        main: '',
        accent: theme.accent,
        lines: result.map(
          (g, i) => `${i + 1}班: ${g.map((x) => x.text).join('、')}`,
        ),
      },
      'groups.png',
    )
    setShared(r === 'downloaded' ? '画像を保存しました' : '')
    setTimeout(() => setShared(''), 2500)
  }

  return (
    <section className="tool">
      <div className="tool-controls">
        <div className="seg" role="group" aria-label="分け方">
          <button
            className={`mode ${by === 'count' ? 'active' : ''}`}
            onClick={() => setBy('count')}
            aria-pressed={by === 'count'}
          >
            グループ数で
          </button>
          <button
            className={`mode ${by === 'size' ? 'active' : ''}`}
            onClick={() => setBy('size')}
            aria-pressed={by === 'size'}
          >
            1組の人数で
          </button>
        </div>

        <label className="num-field">
          {by === 'count' ? 'グループ数' : '1組の人数'}
          <input
            type="number"
            min={by === 'count' ? 2 : 1}
            max={99}
            value={by === 'count' ? groups : perGroup}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (by === 'count') setGroups(v)
              else setPerGroup(v)
            }}
          />
        </label>

        <p className="mode-note">
          {ready
            ? `${items.length}人を ${actualGroups} グループに分けます`
            : '2人以上入れると分けられます'}
        </p>
      </div>

      <button className="btn btn-primary btn-go" onClick={run} disabled={!ready}>
        {result ? 'もう一度分ける' : '分ける'}
      </button>

      {result && (
        <>
          <div className="groups">
            {result.map((g, i) => (
              <div
                key={i}
                className="group-card"
                style={{ borderTopColor: theme.cards[i % theme.cards.length] }}
              >
                <h3>
                  {i + 1}班
                  <span>{g.length}人</span>
                </h3>
                <ul>
                  {g.map((m) => (
                    <li key={m.id}>
                      <span aria-hidden>{m.emoji}</span>
                      {m.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="share-row">
            <button className="btn btn-outline" onClick={onShare}>
              画像にして共有
            </button>
            <button className="btn btn-ghost" onClick={() => window.print()}>
              印刷する
            </button>
            {shared && <span className="share-note">{shared}</span>}
          </div>
        </>
      )}
    </section>
  )
}
