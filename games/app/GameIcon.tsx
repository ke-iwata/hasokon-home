import type { ComponentType } from 'react';
import {
  BombIcon,
  CardsIcon,
  ClubIcon,
  CrownIcon,
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
 * 五目並べ（斜めに並んだ石）。**リバーシ・麻雀ソリティアと同じく自前で描いている。**
 *
 * リバーシの StonesIcon（白石と黒石が横に2つ）と紛れないよう、
 * **斜めに3つ並べた**形にした。並べるゲームであることが小さいサイズでも伝わる。
 * 最後の1つだけ白抜きにしてあるのは「あと1つで揃う」を表すため。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function FiveInARowIcon({ size = 26 }: IconProps) {
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
      <circle cx="60" cy="196" r="32" fill="currentColor" />
      <circle cx="128" cy="128" r="32" fill="currentColor" />
      <circle cx="196" cy="60" r="32" />
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

/**
 * 七並べ（カードに「7」）。**これも自前で描いている。**
 *
 * Phosphor のトランプ系は Cards / Spade / Club / Diamond / Heart で、
 * どれも既にソリティア・スパイダー・フリーセルで使っているか、
 * 「7を並べる」という遊びの中身を指さない。数字の7そのものを描くのが
 * いちばん短く伝わるので、カードの枠と「7」の2本線で作る。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function SevensIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="52" y="32" width="152" height="192" rx="20" />
      <path d="M96 80h64l-40 96" />
    </svg>
  );
}

/**
 * 神経衰弱（裏向きの札と表向きの札）。**これも自前で描いている。**
 *
 * 麻雀ソリティアの TilesIcon（同じ印の牌が2枚）と紛れないよう、
 * **裏向きの札と表向きの札を1枚ずつ**並べた。「めくって合わせる」ことが
 * 小さいサイズでも伝わり、絵合わせ（麻雀ソリティア）とも区別できる。
 * 裏の二重枠は app/_cards/CardView.tsx の裏面（BackSvg）と同じ意匠。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function MemoryPairIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="24" y="52" width="92" height="152" rx="16" />
      <rect x="48" y="80" width="44" height="96" rx="8" />
      <rect x="140" y="52" width="92" height="152" rx="16" />
      <circle cx="186" cy="128" r="20" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * スピード（カードに稲妻）。**これも自前で描いている。**
 *
 * 七並べの SevensIcon（カードに「7」）と枠は同じだが、中身を稲妻にして
 * 「速さを競うカードゲーム」であることを出した。Phosphor の Lightning 単体だと
 * トランプの面だと分からず、電気・通知系のアイコンに見えてしまう。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function SpeedBoltIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="52" y="32" width="152" height="192" rx="20" />
      <path d="M140 68l-44 62h64l-44 58" />
    </svg>
  );
}

/**
 * 花札 こいこい（縦長の札に5弁の花）。**これも自前で描いている。**
 *
 * Phosphor に花札を指すアイコンは無い。Flower は園芸・自然の意味に寄っていて
 * カードゲームに見えず、トランプ系のアイコン（Cards・Spade）と並べると
 * 別ジャンルに見えてしまう。**縦長で細い札**の形そのものが花札の特徴なので、
 * トランプより細い枠に花を1つ入れて描いた。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function HanafudaIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="72" y="24" width="112" height="208" rx="18" />
      {/* 中心(128,128)から半径34で5等分した位置。home/index.html にも同じ形を
          置いているので、座標は計算式ではなく数値で持つ（両方を見比べられるように） */}
      {[
        [128, 94],
        [160.3, 117.5],
        [148, 155.5],
        [108, 155.5],
        [95.7, 117.5],
      ].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r={20} strokeWidth={14} />
      ))}
    </svg>
  );
}

/**
 * ピンボール。台の枠と、下向きに開いた2本のフリッパー、その上の球。
 * home/index.html にも同じ形を置いてある（座標を見比べられるように数値で持つ）
 */
function PinballIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="40" y="24" width="176" height="208" rx="24" />
      <circle cx="128" cy="96" r="26" fill="currentColor" stroke="none" />
      <path d="M72 168 L108 196" />
      <path d="M184 168 L148 196" />
    </svg>
  );
}

/**
 * ピラミッドソリティア。三角形を2本の横線で3段に割った形。
 *
 * 札を三角に並べた形も試したが、22pxだと1枚が5px弱になって潰れた。
 * 段のある三角のほうが小さくても「ピラミッド」と読める。
 * home/index.html にも同じ形を置いてある（座標を見比べられるように数値で持つ）
 */
function PyramidIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M128 32 L228 216 L28 216 Z" />
      <path d="M76 128 H180" />
      <path d="M52 172 H204" />
    </svg>
  );
}

/**
 * トライピークス。3つの山（ピーク）を1本の折れ線で描いた形。
 *
 * ピラミッド（PyramidIcon）と同じ三角の系統だが、**山が3つ並ぶ**ことで
 * 見分けが付く。札を積んだ形は22pxでは潰れるので、輪郭だけにしてある。
 * home/index.html にも同じ形を置いてある（座標を見比べられるように数値で持つ）
 */
function TriPeaksIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 200 L56 96 L92 200 L128 96 L164 200 L200 96 L236 200" />
      <path d="M20 200 H236" />
    </svg>
  );
}

/**
 * スネーク。うねる体と、目のある頭。
 *
 * **直角の折り返しで描かないこと。** 盤の上の軌跡として
 * `M40 56 H152 V124 H40 V192 H140` のように描いたところ、22pxでも200pxでも
 * **数字の「2.」にしか見えなかった**（運営者からの指摘）。カードが20枚並ぶ一覧では
 * 通し番号と誤解されうる。曲線のうねりなら他の19本のどれとも紛れない。
 *
 * 目は**塗りの穴**（`fillRule="evenodd"` の内側の輪）で開けている。
 * 背景色を塗ると明暗どちらかのテーマで消えるが、穴なら地の色がそのまま出る。
 * home/index.html にも同じ形を置いてある（座標を見比べられるように数値で持つ）
 */
function SnakeIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={22}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M28 164 C 56 112 84 112 112 164 S 168 216 196 164" />
      <path
        fillRule="evenodd"
        fill="currentColor"
        stroke="none"
        d="M212 96 a32 32 0 1 0 0.1 0 Z M222 109 a9 9 0 1 1 -0.1 0 Z"
      />
    </svg>
  );
}

/**
 * 色水ソート。色水の量が違う試験管3本。
 *
 * 底の丸みは `app/color-sort/Game.tsx` の試験管と同じ「半円の底」で、
 * 一覧に並んだときにゲーム画面と同じものだと分かるようにしている。
 * 中身は塗り（`currentColor`）で、量を変えて「並べ替える途中」を表す。
 * 上は開いたまま閉じない（閉じると3本の縦棒に見えて他のアイコンと紛れる）。
 */
function TubesIcon({ size = 26 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* [左端, 色水の水面] の順。座標は計算式ではなく数値で持つ（絵を見比べられるように） */}
      {[
        [40, 108],
        [108, 152],
        [176, 76],
      ].map(([x, fill]) => (
        <g key={x}>
          <path d={`M${x} 40 V176 A20 20 0 0 0 ${x + 40} 176 V40`} />
          <path
            d={`M${x} ${fill} V176 A20 20 0 0 0 ${x + 40} 176 V${fill} Z`}
            fill="currentColor"
            stroke="none"
          />
        </g>
      ))}
    </svg>
  );
}

const ICONS: Record<string, ComponentType<IconProps>> = {
  Cards: CardsIcon,
  Crown: CrownIcon,
  Spade: SpadeIcon,
  Club: ClubIcon,
  Bomb: BombIcon,
  SquaresFour: SquaresFourIcon,
  GridNine: GridNineIcon,
  GridFour: GridFourIcon,
  Racquet: RacquetIcon,
  Stones: StonesIcon,
  Tiles: TilesIcon,
  FiveInARow: FiveInARowIcon,
  Blocks: BlocksIcon,
  Sevens: SevensIcon,
  MemoryPair: MemoryPairIcon,
  SpeedBolt: SpeedBoltIcon,
  Hanafuda: HanafudaIcon,
  Pinball: PinballIcon,
  Pyramid: PyramidIcon,
  TriPeaks: TriPeaksIcon,
  Snake: SnakeIcon,
  Tubes: TubesIcon,
};

export default function GameIcon({ name, size = 26 }: { name: string; size?: number }) {
  const Cmp = ICONS[name];
  // 名前を間違えても落とさない。アイコンが出ないだけで済ませる
  if (!Cmp) return null;
  return <Cmp size={size} weight="regular" aria-hidden="true" />;
}
