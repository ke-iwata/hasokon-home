export interface Theme {
  id: string
  label: string
  /** 共有画像などで使う代表色（ページの配色はサイト共通トークンで固定） */
  accent: string
  /** カルーセルのカードに順番に使う色 */
  cards: string[]
}

export const THEMES: Theme[] = [
  {
    id: 'pop',
    label: 'ポップ',
    accent: '#3f6fd8',
    cards: [
      '#3f6fd8',
      '#e4572e',
      '#22a699',
      '#f2b705',
      '#8a5cf0',
      '#e05780',
      '#2f9e44',
      '#f07a1b',
      '#0f8bb5',
      '#c2417c',
    ],
  },
  {
    id: 'pastel',
    label: 'パステル',
    accent: '#b07fd4',
    cards: [
      '#b58bd6',
      '#7fb8dd',
      '#7fcfc0',
      '#f0b1c4',
      '#f5cd79',
      '#a3c98f',
      '#e79aa8',
      '#8fb0e0',
      '#d3a4e0',
      '#8dcbd6',
    ],
  },
  {
    id: 'vivid',
    label: 'ビビッド',
    accent: '#ff5d73',
    cards: [
      '#ff5d73',
      '#ffb020',
      '#25d0a4',
      '#3aa0ff',
      '#b06cff',
      '#ff7a3d',
      '#00c2c7',
      '#ff4fa3',
      '#7ed321',
      '#f5d020',
    ],
  },
  {
    id: 'warm',
    label: 'あたたか',
    accent: '#e8664a',
    cards: [
      '#e8664a',
      '#f2a355',
      '#d9a441',
      '#c98a5b',
      '#d9776f',
      '#b9765f',
      '#e5a06e',
      '#c76a54',
      '#caa06b',
      '#dd8b6a',
    ],
  },
]

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
