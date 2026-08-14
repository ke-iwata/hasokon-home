import type { ComponentType } from 'react';
import {
  BombIcon,
  CardsIcon,
  ClubIcon,
  GridFourIcon,
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

interface IconProps {
  size?: number;
  weight?: 'regular';
}

/**
 * リバーシの石（白石と黒石）。**これだけ自前で描いている。**
 *
 * Phosphor に「盤に置く白黒の石」に当たるアイコンが無い。近いのは CircleHalf
 * （明るさ調整に見える）・YinYang（太極図に見える）・Checkerboard（一覧に
 * グリッド系のアイコンが既に3つあり紛れる）で、どれもゲームの中身を指さない。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてあるので、
 * 並べたときに他のアイコンと重さが揃う。
 */
function StonesIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      aria-hidden="true"
    >
      <circle cx="88" cy="128" r="48" />
      <circle cx="168" cy="128" r="48" fill="currentColor" />
    </svg>
  );
}

/**
 * 麻雀ソリティアの牌（同じ印の2枚）。**リバーシの石と同じく自前で描いている。**
 *
 * Phosphor に麻雀牌に当たるアイコンが無く、近いのは Dominoes（点の数が違う別の遊び）
 * だけで、絵合わせであることが伝わらない。**同じ印の牌が2枚**という形にして、
 * 一覧の中で「絵合わせのゲーム」だと分かるようにした。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function TilesIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      aria-hidden="true"
    >
      <rect x="28" y="44" width="84" height="120" rx="14" />
      <circle cx="70" cy="104" r="16" fill="currentColor" stroke="none" />
      <rect x="144" y="92" width="84" height="120" rx="14" />
      <circle cx="186" cy="152" r="16" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * ブロックパズルのピース（L字に並んだ3つのブロック）。**これも自前で描いている。**
 *
 * Phosphor の PuzzlePiece はジグソーパズルの1ピースの形で、このゲームの
 * 「四角いブロックを置く」遊びを指さない。グリッド系（GridFour・GridNine・
 * SquaresFour）は既にノノグラム・ナンプレ・2048で使っていて紛れる。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function BlocksIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      aria-hidden="true"
    >
      <rect x="40" y="40" width="72" height="72" rx="12" />
      <rect x="40" y="144" width="72" height="72" rx="12" />
      <rect x="144" y="144" width="72" height="72" rx="12" />
    </svg>
  );
}

const ICONS: Record<string, ComponentType<IconProps>> = {
  Cards: CardsIcon,
  Spade: SpadeIcon,
  Club: ClubIcon,
  Bomb: BombIcon,
  SquaresFour: SquaresFourIcon,
  GridNine: GridNineIcon,
  GridFour: GridFourIcon,
  Racquet: RacquetIcon,
  Stones: StonesIcon,
  Tiles: TilesIcon,
  Blocks: BlocksIcon,
};

export default function GameIcon({ name, size = 26 }: { name: string; size?: number }) {
  const Cmp = ICONS[name];
  // 名前を間違えても落とさない。アイコンが出ないだけで済ませる
  if (!Cmp) return null;
  return <Cmp size={size} weight="regular" aria-hidden="true" />;
}
