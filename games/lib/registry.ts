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

export const SITE_URL = 'https://game.hasokon.com';
export const SITE_NAME = '無料ミニゲーム集';
export const COPYRIGHT_HOLDER = 'hasokon tools';
export const SITE_UPDATED_AT = '2026-08-04';

export const games: GameDef[] = [
  {
    slug: 'nanpre',
    icon: '🔢',
    name: 'ナンプレ',
    description: '定番の数字パズル。かんたん・ふつう・むずかしいの3段階。答えは必ず1通りです。',
    ready: true,
    updatedAt: '2026-08-04',
  },
  {
    slug: 'reversi',
    icon: '⚫',
    name: 'リバーシ',
    description: 'コンピュータと対戦できるリバーシ。挟んで返して、角を取ったほうが勝ち。',
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
