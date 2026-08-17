'use client';

import { useId } from 'react';
import { isRed, RANK_LABEL, SUIT_SYMBOL, type Card, type Rank, type Suit } from '@/lib/cards';

/**
 * トランプ1枚の描画（ソリティア・スパイダー共通）。
 *
 * 絵柄はすべてSVGで自前描画する。画像アセットを持たないので
 * どの解像度でもシャープに出て、転送量も増えない。
 * スート記号をUnicode文字にするとiOSで絵文字として描画され
 * 色指定が効かないことがあるため、パスで描く。
 */

const RED = '#dc2626';
const BLACK = '#1e293b';

/** スートの形。100×100のviewBox想定で中心(50,50)に描くパス */
const SUIT_PATH: Record<Suit, string> = {
  heart:
    'M50 88 C22 62 10 46 10 32 C10 18 21 8 33 8 C40 8 47 12 50 19 C53 12 60 8 67 8 C79 8 90 18 90 32 C90 46 78 62 50 88 Z',
  diamond: 'M50 6 L82 50 L50 94 L18 50 Z',
  spade:
    'M50 6 C30 30 12 40 12 55 C12 66 20 74 30 74 C36 74 42 71 46 66 C45 75 41 82 35 88 L65 88 C59 82 55 75 54 66 C58 71 64 74 70 74 C80 74 88 66 88 55 C88 40 70 30 50 6 Z',
  club:
    'M43 88 C46 79 47 71 47 64 L53 64 C53 71 54 79 57 88 Z',
};

/** クラブは円3つ＋茎で構成する（パス1本では形が崩れるため） */
function SuitShape({ suit }: { suit: Suit }) {
  const fill = isRed(suit) ? RED : BLACK;
  if (suit === 'club') {
    return (
      <g fill={fill}>
        <circle cx="50" cy="26" r="19" />
        <circle cx="29" cy="55" r="19" />
        <circle cx="71" cy="55" r="19" />
        <path d={SUIT_PATH.club} />
      </g>
    );
  }
  return <path d={SUIT_PATH[suit]} fill={fill} />;
}

/** 指定位置にスートを描く。sizeは100×140のviewBox上の一辺 */
function Pip({
  suit,
  x,
  y,
  size,
  flip = false,
}: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  flip?: boolean;
}) {
  const s = size / 100;
  return (
    <g
      transform={`translate(${x} ${y}) ${flip ? 'rotate(180)' : ''} scale(${s}) translate(-50 -50)`}
    >
      <SuitShape suit={suit} />
    </g>
  );
}

/**
 * 数札のピップ配置（本物のトランプと同じレイアウト）。
 * [x, y, 上下反転] のリスト。下半分のピップは反転させる
 */
const L = 30;
const C = 50;
const R = 70;
const PIP_LAYOUT: Record<number, [number, number, boolean][]> = {
  2: [[C, 36, false], [C, 104, true]],
  3: [[C, 36, false], [C, 70, false], [C, 104, true]],
  4: [[L, 36, false], [R, 36, false], [L, 104, true], [R, 104, true]],
  5: [[L, 36, false], [R, 36, false], [C, 70, false], [L, 104, true], [R, 104, true]],
  6: [[L, 36, false], [R, 36, false], [L, 70, false], [R, 70, false], [L, 104, true], [R, 104, true]],
  7: [
    [L, 36, false], [R, 36, false], [C, 53, false],
    [L, 70, false], [R, 70, false],
    [L, 104, true], [R, 104, true],
  ],
  8: [
    [L, 36, false], [R, 36, false], [C, 53, false],
    [L, 70, false], [R, 70, false], [C, 87, true],
    [L, 104, true], [R, 104, true],
  ],
  9: [
    [L, 36, false], [R, 36, false],
    [L, 59, false], [R, 59, false], [C, 70, false],
    [L, 81, true], [R, 81, true],
    [L, 104, true], [R, 104, true],
  ],
  10: [
    [L, 36, false], [R, 36, false], [C, 47, false],
    [L, 59, false], [R, 59, false],
    [L, 81, true], [R, 81, true], [C, 93, true],
    [L, 104, true], [R, 104, true],
  ],
};

/** 角のインデックス（数字＋スート）。回転して右下にも置く */
function CornerIndex({ rank, suit }: { rank: Rank; suit: Suit }) {
  const color = isRed(suit) ? RED : BLACK;
  const label = RANK_LABEL[rank];
  return (
    <g>
      <text
        x={rank === 10 ? 3 : 5}
        y="18"
        fontSize="19"
        fontWeight="800"
        fill={color}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing={rank === 10 ? '-2' : '0'}
      >
        {label}
      </text>
      <Pip suit={suit} x={11.5} y={29} size={13} />
    </g>
  );
}

const COURT_NAME: Record<number, string> = { 11: 'jack', 12: 'queen', 13: 'king' };

/**
 * 絵札（J・Q・K）は古典的な英国式パターンの絵柄を使う。
 * 出典: vector-playing-cards（Byron Knoll作・パブリックドメイン）の
 * 枠内の人物画を切り出してwebp化したもの（public/cards/）。
 * 権利表記は不要だが、由来をここに記録しておく
 */
function CourtFace({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <image
      href={`/games/cards/${COURT_NAME[rank]}_${suit}.webp`}
      x="17"
      y="17"
      width="66"
      height="106"
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

/** 表面のSVG */
function FaceSvg({ card }: { card: Card }) {
  const { rank, suit } = card;
  return (
    <svg viewBox="0 0 100 140" aria-hidden="true">
      <CornerIndex rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <CornerIndex rank={rank} suit={suit} />
      </g>
      {rank === 1 && <Pip suit={suit} x={C} y={70} size={38} />}
      {rank >= 2 && rank <= 10 &&
        PIP_LAYOUT[rank].map(([x, y, flip], i) => (
          <Pip key={i} suit={suit} x={x} y={y} size={16} flip={flip} />
        ))}
      {rank >= 11 && <CourtFace rank={rank} suit={suit} />}
    </svg>
  );
}

/**
 * ジョーカーの表面。**大富豪だけが使う**（ソリティア系のデックには入っていない）。
 *
 * 絵札のような人物画は持たない（`public/cards/` にジョーカーの画は無い）ので、
 * 星と "JOKER" の文字だけで描く。赤系にしてあるのは、手札に混ざったときに
 * 数札とひと目で見分けられるようにするため。
 */
const JOKER_STAR =
  'M50 40 L57.1 60.3 L78.5 60.7 L61.4 73.7 L67.6 94.3 L50 82 L32.4 94.3 L38.6 73.7 L21.5 60.7 L43 60.3 Z';

function JokerLabel() {
  return (
    <text
      x="6"
      y="17"
      fontSize="13"
      fontWeight="800"
      fill={RED}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      letterSpacing="-0.5"
    >
      JOKER
    </text>
  );
}

function JokerSvg() {
  return (
    <svg viewBox="0 0 100 140" aria-hidden="true">
      <JokerLabel />
      <g transform="rotate(180 50 70)">
        <JokerLabel />
      </g>
      <path d={JOKER_STAR} fill={RED} />
    </svg>
  );
}

/** ジョーカー1枚。`CardView` と同じ見た目・同じ操作で使える */
export function JokerView({
  selected = false,
  onClick,
  style,
}: {
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`playing-card${selected ? ' selected' : ''}`}
      onClick={onClick}
      style={style}
      aria-label="ジョーカー"
    >
      <JokerSvg />
    </button>
  );
}

/** 裏面のSVG。紺地に斜め格子と二重枠 */
function BackSvg() {
  const pid = useId();
  return (
    <svg viewBox="0 0 100 140" aria-hidden="true">
      <defs>
        <pattern id={pid} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H9M0 4.5H9" stroke="#bfdbfe" strokeWidth="1" opacity="0.35" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="97" height="137" rx="5" fill="#1d4ed8" />
      <rect x="6" y="6" width="88" height="128" rx="3" fill="#1e40af" />
      <rect x="6" y="6" width="88" height="128" rx="3" fill={`url(#${pid})`} />
      <rect x="6" y="6" width="88" height="128" rx="3" fill="none" stroke="#93c5fd" strokeWidth="1" opacity="0.7" />
      <g transform="translate(50 70) rotate(45)">
        <rect x="-16" y="-16" width="32" height="32" fill="#1d4ed8" stroke="#bfdbfe" strokeWidth="1.2" />
        <rect x="-11" y="-11" width="22" height="22" fill="none" stroke="#bfdbfe" strokeWidth="0.8" opacity="0.8" />
      </g>
    </svg>
  );
}

export function CardView({
  card,
  selected = false,
  onClick,
  style,
  className = '',
  labelSuffix = '',
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  /** ゲームごとの追加の状態（ピラミッドの `covered` / `hinted` / `shake` など） */
  className?: string;
  /** 読み上げに足す補足（ピラミッドの「いまは取れません」など） */
  labelSuffix?: string;
}) {
  const extra = className ? ` ${className}` : '';
  if (!card.faceUp) {
    return (
      <button
        type="button"
        className={`playing-card back${extra}`}
        onClick={onClick}
        style={style}
        aria-label="裏向きの札"
      >
        <BackSvg />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`playing-card${selected ? ' selected' : ''}${extra}`}
      onClick={onClick}
      style={style}
      aria-label={`${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}${labelSuffix}`}
    >
      <FaceSvg card={card} />
    </button>
  );
}

/** 空きスロット（組札の空き・空列の表示） */
export function EmptySlot({
  label = '',
  onClick,
}: {
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="playing-card empty" onClick={onClick} aria-label="空き">
      {label}
    </button>
  );
}

/**
 * 縦に重ねる列の、カードごとの負のマージン。
 * 直前の札が表なら多めに（数字が見える幅）、裏なら細く見せる。
 * %はコンテナ幅基準なので、画面幅が変わっても比率が保たれる。
 */
export function stackMargin(index: number, prevFaceUp: boolean | undefined): React.CSSProperties {
  if (index === 0) return {};
  return { marginTop: prevFaceUp ? '-106%' : '-127%' };
}
