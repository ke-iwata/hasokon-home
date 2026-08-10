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

export const games: GameDef[] = [
  {
    slug: 'solitaire',
    icon: '🃏',
    name: 'ソリティア',
    description: '定番のクロンダイク。タップで自動移動の簡単操作。もどす機能つき。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'spider',
    icon: '🕷️',
    name: 'スパイダーソリティア',
    description: '1スート〜4スートの3段階。KからAまで揃えて8組完成を目指します。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'minesweeper',
    icon: '💣',
    name: 'マインスイーパー',
    description: '数字をヒントに地雷を避ける定番パズル。初手は必ず安全。初級〜上級。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: '2048',
    icon: '🔢',
    name: '2048',
    description: 'スワイプで同じ数字を合体させて2048を目指すパズル。ベストスコア保存。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'nanpre',
    icon: '✏️',
    name: 'ナンプレ',
    description: '定番の数字パズル。かんたん・ふつう・むずかしいの3段階。答えは必ず1通りです。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'breakout',
    icon: '🧱',
    name: 'ブロック崩し',
    description: 'マウスやタッチで操作する定番アクション。面が進むごとに速くなります。',
    ready: true,
    updatedAt: '2026-08-04',
  },
];
