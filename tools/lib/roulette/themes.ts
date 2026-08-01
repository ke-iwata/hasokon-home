export interface Theme {
  id: string
  label: string
  /** ページ全体の色 */
  vars: Record<string, string>
  /** カルーセルのカードに順番に使う色 */
  cards: string[]
}

export const THEMES: Theme[] = [
  {
    id: 'pop',
    label: 'ポップ',
    vars: {
      '--bg': '#f4f7fb',
      '--surface': '#ffffff',
      '--line': '#e2e8f2',
      '--text': '#2c3444',
      '--muted': '#7d879b',
      '--accent': '#3f6fd8',
      '--accent-soft': '#e8eefc',
      '--stage': '#eef2f9',
    },
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
    vars: {
      '--bg': '#fbf7fb',
      '--surface': '#ffffff',
      '--line': '#eee3ee',
      '--text': '#4b4356',
      '--muted': '#948aa1',
      '--accent': '#b07fd4',
      '--accent-soft': '#f5edfb',
      '--stage': '#f6eff8',
    },
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
    vars: {
      '--bg': '#111524',
      '--surface': '#1b2033',
      '--line': '#2c3350',
      '--text': '#eef1fa',
      '--muted': '#98a1bd',
      '--accent': '#ff5d73',
      '--accent-soft': '#2a2136',
      '--stage': '#0d1120',
    },
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
    vars: {
      '--bg': '#fdf6ec',
      '--surface': '#ffffff',
      '--line': '#ecdfcd',
      '--text': '#4a3b32',
      '--muted': '#96877a',
      '--accent': '#e8664a',
      '--accent-soft': '#fdece7',
      '--stage': '#f7ece0',
    },
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
