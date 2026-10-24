import { games, publicGames, SITE_NAME } from './registry';

/**
 * 一覧ページ（/games/）の title・description。
 *
 * 仕様: docs/features/ichiran-page-title-refresh.md
 *
 * - **名前は slug で持ち、文字列は registry から組み立てる。**
 *   見出しに名前を挙げたゲームが `wip` / `preview` に戻ると、一覧に無いものを
 *   約束することになる（`tests/hub-metadata.test.ts` が「すべて public か」を見張る）
 * - **本数は `publicGames` から出す。** 6本時代の文言が27本になっても据え置かれていた
 */

/** title に名前を挙げるゲーム。Bing の着地・滞在の実績と、検索量の大きい定番から */
export const HUB_TITLE_GAMES = ['solitaire', 'reversi', 'daifugo', 'nanpre'] as const;

/**
 * description の例示。`label` は表示用の短い名前（無ければ registry の `name`）。
 * `heading` があるグループは「見出し（A・B・C）」の形で出す
 */
export const HUB_DESCRIPTION_GROUPS: {
  heading?: string;
  items: { slug: string; label?: string }[];
}[] = [
  {
    heading: 'ソリティア',
    items: [
      { slug: 'solitaire', label: 'クロンダイク' },
      { slug: 'spider', label: 'スパイダー' },
      { slug: 'freecell' },
    ],
  },
  { items: [{ slug: 'reversi' }, { slug: 'gomoku' }] },
  {
    items: [{ slug: 'daifugo' }, { slug: 'shichinarabe' }, { slug: 'hanafuda-koikoi', label: '花札こいこい' }],
  },
  { items: [{ slug: 'nanpre' }, { slug: 'nonogram' }] },
  { items: [{ slug: 'minesweeper' }, { slug: '2048' }] },
];

/** 名前を挙げたゲームの slug をすべて（テスト用） */
export const HUB_NAMED_GAMES: string[] = [
  ...HUB_TITLE_GAMES,
  ...HUB_DESCRIPTION_GROUPS.flatMap((g) => g.items.map((i) => i.slug)),
];

function nameOf(slug: string): string {
  const found = games.find((g) => g.slug === slug);
  // 存在しない slug はビルドで落とす（黙って空文字を出さない）
  if (!found) throw new Error(`hub-metadata: registry に無い slug: ${slug}`);
  return found.name;
}

export const HUB_TITLE = `${SITE_NAME}｜${HUB_TITLE_GAMES.map(nameOf).join('・')}`;

const examples = HUB_DESCRIPTION_GROUPS.map((g) => {
  const names = g.items.map((i) => i.label ?? nameOf(i.slug)).join('・');
  return g.heading ? `${g.heading}（${names}）` : names;
}).join('、');

export const HUB_DESCRIPTION = `インストール不要・登録不要で遊べる無料ミニゲーム${publicGames.length}本。${examples}など。CPU対戦つき、スマホ対応。`;
