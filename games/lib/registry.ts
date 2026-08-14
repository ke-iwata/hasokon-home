/**
 * ゲームレジストリ
 * ここに追加すると、トップページの一覧と sitemap に自動反映される。
 */
export interface GameDef {
  slug: string;
  name: string;
  description: string;
  icon: string;
  ready: boolean;
  /** 内容を最後に更新した日（sitemap の lastmod。ビルド日ではない） */
  updatedAt: string;
}

// basePath込みのサイトURL。canonical・sitemap・JSON-LDはすべてここから作られる
export const SITE_URL = 'https://hasokon.com/games';
export const SITE_NAME = '無料ミニゲーム集';
export const COPYRIGHT_HOLDER = 'hasokon tools';
export const SITE_UPDATED_AT = '2026-08-04';

/**
 * SNS共有時のサムネイル（OGP画像）。
 *
 * 仕様: docs/features/ogp-image.md（案B・全ページ共通の1枚）
 *
 * 実体は `public/ogp.png`。basePath（/games）が付いて
 * https://hasokon.com/games/ogp.png で配信される。
 * 画像は design/ogp/gen-ogp.mjs で生成しており、直接編集しない
 * （tools と地の色を反転させて、ツールとゲームを見分けられるようにしている）。
 *
 * - **URLは絶対URLにすること。** 相対パスを解決できないクローラーが多い
 * - サイズは 1200×630 固定（X の summary_large_image の前提）
 */
export const OGP_IMAGE = {
  url: `${SITE_URL}/ogp.png`,
  width: 1200,
  height: 630,
  alt: SITE_NAME,
} as const;

export const games: GameDef[] = [
  {
    slug: 'solitaire',
    icon: 'Cards',
    name: 'ソリティア',
    description: '定番のクロンダイク。タップで自動移動の簡単操作。もどす機能つき。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'spider',
    icon: 'Spade',
    name: 'スパイダーソリティア',
    description: '1スート〜4スートの3段階。KからAまで揃えて8組完成を目指します。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'freecell',
    icon: 'Club',
    name: 'フリーセル',
    description: '全部の札が最初から見えている実力型のトランプパズル。まとめて移動にも対応。',
    ready: true,
    updatedAt: '2026-08-11',
  },
  {
    slug: 'minesweeper',
    icon: 'Bomb',
    name: 'マインスイーパー',
    description: '数字をヒントに地雷を避ける定番パズル。初手は必ず安全。初級〜上級。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: '2048',
    icon: 'SquaresFour',
    name: '2048',
    description: 'スワイプで同じ数字を合体させて2048を目指すパズル。ベストスコア保存。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'nanpre',
    icon: 'GridNine',
    name: 'ナンプレ',
    description: '定番の数字パズル。かんたん・ふつう・むずかしいの3段階。答えは必ず1通りです。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'nonogram',
    icon: 'GridFour',
    name: 'ノノグラム',
    description: '数字をヒントにマスを塗ると絵が出るパズル。5×5〜15×15の全30問。答えは必ず1通りです。',
    ready: true,
    updatedAt: '2026-08-11',
  },
  {
    slug: 'reversi',
    icon: 'Stones',
    name: 'リバーシ',
    description: '挟んで裏返す定番の対戦ゲーム。CPUは かんたん・ふつう・つよい の3段階。先手・後手も選べます。',
    ready: true,
    updatedAt: '2026-08-12',
  },
  {
    // 「五目並べ」は伝統ゲームの一般名称で商標の問題は無い。競技ルールの
    // 「連珠」は禁じ手を実装していないので名乗らない
    // （docs/features/game-gomoku.md の「権利関係」）
    slug: 'gomoku',
    icon: 'FiveInARow',
    name: '五目並べ',
    description:
      '13×13の盤に先に5つ並べたほうが勝ちの定番ボードゲーム。CPUは かんたん・ふつう・つよい の3段階。禁じ手なし。',
    ready: true,
    updatedAt: '2026-08-14',
  },
  {
    // 「上海」はサン電子（サンソフト）が国内で商標を保有しているため名前に使わない。
    // 一般名称の「麻雀ソリティア」で統一する
    // （docs/features/game-mahjong-solitaire.md の「権利関係の確認」）
    slug: 'mahjong-solitaire',
    icon: 'Tiles',
    name: '麻雀ソリティア',
    description:
      '亀の形に積んだ144枚から同じ絵柄を2つずつ消す絵合わせパズル。必ず最後まで消せる盤面を配ります。',
    ready: true,
    updatedAt: '2026-08-13',
  },
  {
    slug: 'breakout',
    icon: 'Racquet',
    name: 'ブロック崩し',
    description: 'マウスやタッチで操作する定番アクション。面が進むごとに速くなります。',
    ready: true,
    updatedAt: '2026-08-04',
  },
];
