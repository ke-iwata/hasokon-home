'use client'

import { useMemo, useState } from 'react'
import type { Item } from '@/lib/roulette/types'
import { EMOJI_CHOICES, guessEmoji } from '@/lib/roulette/emoji'
import { dedupe, findDuplicates, parseItems } from '@/lib/roulette/parse'
import { suggestName, upsertList, type SavedList } from '@/lib/roulette/lists'

interface Props {
  items: Item[]
  onChange: (items: Item[]) => void
  lists: SavedList[]
  onChangeLists: (lists: SavedList[]) => void
  /** 出すサンプルの種類。省略時は選択肢向け */
  samples?: SampleKind
}

/**
 * サンプルは用途によって中身を変える。
 * グループ分けで「ラーメン・カレー…」を班に分けても意味がないため、
 * 人を分ける道具では名簿風のサンプルを出す。
 */
export type SampleKind = 'choices' | 'people'

const NAMES = [
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡辺',
  '山本',
  '中村',
  '小林',
  '加藤',
  '吉田',
  '山田',
]

const SAMPLES: Record<SampleKind, { label: string; items: string[] }[]> = {
  // 何かひとつを選ぶ道具（ルーレットなど）
  choices: [
    { label: 'はい / いいえ', items: ['はい', 'いいえ'] },
    {
      label: 'ランチ',
      items: ['ラーメン', 'カレー', '寿司', 'そば', 'パスタ', '中華', '弁当'],
    },
    {
      label: '今日の家事',
      items: ['皿洗い', '洗濯', '掃除', 'ゴミ出し', '風呂そうじ', '買い物'],
    },
    { label: '1〜10', items: Array.from({ length: 10 }, (_, i) => String(i + 1)) },
  ],
  // 人を分ける道具（グループ分けなど）
  people: [
    { label: '6人', items: NAMES.slice(0, 6) },
    { label: '12人', items: NAMES },
    {
      label: '出席番号 1〜30',
      items: Array.from({ length: 30 }, (_, i) => String(i + 1)),
    },
  ],
}

export function makeItem(text: string): Item {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    emoji: guessEmoji(text),
  }
}

export default function ItemEditor({
  items,
  onChange,
  lists,
  onChangeLists,
  samples = 'choices',
}: Props) {
  const [draft, setDraft] = useState('')
  const [bulk, setBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [picking, setPicking] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')

  const duplicates = useMemo(
    () => findDuplicates(items.map((i) => i.text)),
    [items],
  )

  /** 入力欄からの追加。複数行や「1〜30」もそのまま解釈する */
  const add = () => {
    const names = parseItems(draft)
    if (!names.length) return
    onChange([...items, ...names.map(makeItem)])
    setDraft('')
  }

  const applyBulk = () => {
    const names = parseItems(bulkText)
    if (names.length) onChange(names.map(makeItem))
    setBulk(false)
  }

  const shuffle = () => {
    const next = [...items]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    onChange(next)
  }

  const save = () => {
    const name = saveName.trim()
    if (!name || !items.length) return
    onChangeLists(upsertList(lists, name, items))
    setSaving(false)
    setSaveName('')
  }

  return (
    <section className="editor" aria-labelledby="editor-title">
      <div className="panel-head">
        <h2 id="editor-title">項目を入れる</h2>
        <span className="count">{items.length} 個</span>
      </div>

      {bulk ? (
        <div className="bulk">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={9}
            placeholder={'1行に1項目。カンマ区切りの貼り付けや\n「1〜30」のような範囲指定もそのまま使えます'}
            aria-label="項目をまとめて入力"
          />
          <div className="row">
            <button className="btn btn-primary" onClick={applyBulk}>
              この内容にする
            </button>
            <button className="btn btn-ghost" onClick={() => setBulk(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="add-row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="項目を入力して Enter(1〜30 でまとめて追加)"
              aria-label="追加する項目"
            />
            <button className="btn btn-primary" onClick={add} disabled={!draft.trim()}>
              追加
            </button>
          </div>

          {duplicates.size > 0 && (
            <div className="notice">
              <span>
                同じ項目が {duplicates.size} 種類あります(当たりやすくなります)
              </span>
              <button
                className="mini-btn"
                onClick={() => onChange(dedupe(items, (i) => i.text))}
              >
                1つにまとめる
              </button>
            </div>
          )}

          <ul className="chips">
            {items.map((item, i) => (
              <li key={item.id} className="chip">
                <button
                  className="chip-emoji"
                  onClick={() => setPicking(picking === item.id ? null : item.id)}
                  aria-label={`${item.text} の絵柄を変える`}
                  title="絵柄を変える"
                >
                  {item.emoji}
                </button>
                <span className="chip-text">{item.text}</span>
                <button
                  className="chip-remove"
                  onClick={() => onChange(items.filter((_, x) => x !== i))}
                  aria-label={`${item.text} を削除`}
                >
                  ×
                </button>

                {picking === item.id && (
                  <div className="emoji-pop">
                    {EMOJI_CHOICES.map((e) => (
                      <button
                        key={e}
                        className="emoji-opt"
                        onClick={() => {
                          onChange(
                            items.map((x) =>
                              x.id === item.id ? { ...x, emoji: e } : x,
                            ),
                          )
                          setPicking(null)
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {items.length === 0 && (
              <li className="chips-empty">
                まだ項目がありません。
                <br />
                上の入力欄から追加するか、下のサンプルを選んでください。
              </li>
            )}
          </ul>

          <div className="row tools">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setBulkText(items.map((x) => x.text).join('\n'))
                setBulk(true)
              }}
            >
              まとめて入力
            </button>
            <button className="btn btn-ghost" onClick={shuffle} disabled={items.length < 2}>
              並べ替え
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSaveName(saveName || suggestName(items))
                setSaving(true)
              }}
              disabled={!items.length}
            >
              リストを保存
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => onChange([])}
              disabled={!items.length}
            >
              全部消す
            </button>
          </div>

          {saving && (
            <div className="save-row">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="リスト名(例: 2年3組の名簿)"
                aria-label="保存するリスト名"
                autoFocus
              />
              <button className="btn btn-primary" onClick={save} disabled={!saveName.trim()}>
                保存
              </button>
              <button className="btn btn-ghost" onClick={() => setSaving(false)}>
                やめる
              </button>
            </div>
          )}

          {lists.length > 0 && (
            <div className="saved">
              <span className="presets-label">保存したリスト</span>
              <div className="saved-items">
                {lists.map((l) => (
                  <span key={l.id} className="saved-chip">
                    <button
                      className="saved-load"
                      onClick={() => onChange(l.items.map((i) => ({ ...i, id: makeItem(i.text).id })))}
                      title={`${l.items.length}件を読み込む`}
                    >
                      {l.name}
                      <em>{l.items.length}</em>
                    </button>
                    <button
                      className="saved-remove"
                      onClick={() => onChangeLists(lists.filter((x) => x.id !== l.id))}
                      aria-label={`${l.name} を削除`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="presets">
            <span className="presets-label">サンプル</span>
            {SAMPLES[samples].map((p) => (
              <button
                key={p.label}
                className="preset"
                onClick={() => onChange(p.items.map(makeItem))}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
