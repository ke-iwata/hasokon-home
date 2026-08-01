'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Item } from '@/lib/roulette/types'
import type { Theme } from '@/lib/roulette/themes'
import { shareCard } from '@/lib/roulette/resultImage'

interface Props {
  items: Item[]
  theme: Theme
}

/** 1試合。null は不戦勝(相手なし) */
interface Match {
  round: number
  index: number
  a: string | null
  b: string | null
}

function shuffle<T>(list: T[]): T[] {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** 参加者数以上で最小の2の累乗 */
function bracketSize(n: number) {
  let size = 2
  while (size < n) size *= 2
  return size
}

export default function TournamentTool({ items, theme }: Props) {
  const [seed, setSeed] = useState(0)
  // 勝者の記録: `${round}-${index}` → 名前
  const [winners, setWinners] = useState<Record<string, string>>({})

  const entrants = useMemo(
    () => shuffle(items.map((i) => i.text)),
    [items, seed],
  )

  // 参加者が変わったら勝ち上がりを消す(古い名前が残って表に紛れ込むため)
  useEffect(() => {
    setWinners({})
  }, [items])

  const size = bracketSize(Math.max(entrants.length, 2))
  const rounds = Math.log2(size)

  // 1回戦の組。空き枠は null(不戦勝)
  const first: Match[] = useMemo(() => {
    // まず各試合に1人ずつ置き、余った人を後ろの試合から折り返して入れる。
    // 前から順に詰めると誰もいない試合ができてしまうため。
    const slots: (string | null)[] = Array(size).fill(null)
    const half = size / 2
    entrants.forEach((name, i) => {
      if (i < half) slots[i * 2] = name
      else slots[(size - 1 - i) * 2 + 1] = name
    })
    const out: Match[] = []
    for (let i = 0; i < size / 2; i++) {
      out.push({ round: 0, index: i, a: slots[i * 2], b: slots[i * 2 + 1] })
    }
    return out
  }, [entrants, size])

  /** その試合の勝者(不戦勝は自動、それ以外は選択済みなら記録から) */
  const winnerOf = (m: Match): string | null => {
    if (m.a && !m.b) return m.a
    if (!m.a && m.b) return m.b
    return winners[`${m.round}-${m.index}`] ?? null
  }

  // 各ラウンドの試合を積み上げる
  const bracket: Match[][] = useMemo(() => {
    const all: Match[][] = [first]
    for (let r = 1; r < rounds; r++) {
      const prev = all[r - 1]
      const cur: Match[] = []
      for (let i = 0; i < prev.length / 2; i++) {
        cur.push({
          round: r,
          index: i,
          a: winnerOf(prev[i * 2]),
          b: winnerOf(prev[i * 2 + 1]),
        })
      }
      all.push(cur)
    }
    return all
    // winners が変わると勝ち上がりも変わる
  }, [first, rounds, winners])

  const champion = rounds > 0 ? winnerOf(bracket[rounds - 1][0]) : null

  const choose = (m: Match, name: string | null) => {
    if (!name || !m.a || !m.b) return
    setWinners((w) => ({ ...w, [`${m.round}-${m.index}`]: name }))
  }

  const reset = () => {
    setSeed((s) => s + 1)
    setWinners({})
  }

  const onShare = () =>
    shareCard(
      {
        heading: champion ? '優勝' : 'トーナメント表',
        main: champion ?? '',
        emoji: champion ? '🏆' : undefined,
        accent: theme.vars['--accent'],
        lines: champion
          ? undefined
          : first.map(
              (m) => `${m.a ?? '—'} vs ${m.b ?? '(不戦勝)'}`,
            ),
      },
      'tournament.png',
    )

  if (items.length < 2) {
    return (
      <section className="tool">
        <p className="mode-note">参加者を2人以上入れてください。</p>
      </section>
    )
  }

  return (
    <section className="tool">
      <p className="mode-note">
        {entrants.length}人 / {size}枠。勝った方をタップすると勝ち上がります。
        {size > entrants.length && ` ${size - entrants.length}人が1回戦不戦勝です。`}
      </p>

      <div className="bracket">
        {bracket.map((round, r) => (
          <div className="bracket-round" key={r}>
            <p className="round-label">
              {r === rounds - 1
                ? '決勝'
                : r === rounds - 2
                  ? '準決勝'
                  : `${r + 1}回戦`}
            </p>
            {round.map((m) => {
              const w = winnerOf(m)
              return (
                <div className="match" key={m.index}>
                  {[m.a, m.b].map((name, side) => (
                    <button
                      key={side}
                      className={`slot ${w === name && name ? 'won' : ''} ${!name ? 'empty' : ''}`}
                      onClick={() => choose(m, name)}
                      disabled={!name || !m.a || !m.b}
                      style={
                        w === name && name
                          ? { borderColor: theme.vars['--accent'] }
                          : undefined
                      }
                    >
                      {name ?? '—'}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {champion && (
        <p className="champion">
          🏆 優勝: <strong>{champion}</strong>
        </p>
      )}

      <div className="share-row">
        <button className="btn btn-outline" onClick={onShare}>
          画像にして共有
        </button>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          印刷する
        </button>
        <button className="btn btn-ghost" onClick={reset}>
          組み直す
        </button>
      </div>
    </section>
  )
}
