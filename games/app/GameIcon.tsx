import {
  BombIcon,
  CardsIcon,
  ClubIcon,
  GridNineIcon,
  RacquetIcon,
  SpadeIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react/dist/ssr';

/**
 * ゲームのアイコン。
 *
 * registry の `icon`（Phosphor のアイコン名）から実体を引く。
 * 使うものだけを明示的に import している（ライブラリには3000個あるため）。
 *
 * 絵文字をやめた理由は tools 側と同じ。端末ごとに絵柄も色も変わり、
 * iOSでは常にカラー絵文字として描画されるのでサイトの配色に馴染まない。
 *
 * import 元が `/dist/ssr` なのは通常のエントリが 'use client' 付きのため。
 * 名前に `Icon` が付くほうを使う（素の `Spade` などは非推奨エイリアス）。
 */

type PhosphorIcon = typeof CardsIcon;

const ICONS: Record<string, PhosphorIcon> = {
  Cards: CardsIcon,
  Spade: SpadeIcon,
  Club: ClubIcon,
  Bomb: BombIcon,
  SquaresFour: SquaresFourIcon,
  GridNine: GridNineIcon,
  Racquet: RacquetIcon,
};

export default function GameIcon({ name, size = 26 }: { name: string; size?: number }) {
  const Cmp = ICONS[name];
  // 名前を間違えても落とさない。アイコンが出ないだけで済ませる
  if (!Cmp) return null;
  return <Cmp size={size} weight="regular" aria-hidden="true" />;
}
