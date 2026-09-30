import type { ComponentType, ReactNode } from 'react';
import {
  BombIcon,
  CardsIcon,
  ClubIcon,
  CrownIcon,
  DiceFiveIcon,
  GridFourIcon,
  GridNineIcon,
  KeyboardIcon,
  RacquetIcon,
  SpadeIcon,
  SquaresFourIcon,
  StarIcon,
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
 * 二角取り（同じ印の牌2枚を「曲がり角のある線」でつなぐ）。**自前で描いている。**
 *
 * 麻雀ソリティア（TilesIcon）と客層が重なるので、一覧で並んだときに紛れないよう
 * **2枚を折れ線でつなぐ**形にした。このゲームの核は「経路がつながるかどうか」なので、
 * それを描く。線は始点→上→右→終点の**2曲がり**にして、遊び方がひとめで伝わる。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function TilesPathIcon({ size = 26 }: IconProps) {
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
      {/* 2枚の牌（左下と右上）。中央のドットが「同じ絵柄」の目印 */}
      <rect x="28" y="140" width="72" height="88" rx="12" />
      <circle cx="64" cy="184" r="12" fill="currentColor" stroke="none" />
      <rect x="156" y="28" width="72" height="88" rx="12" />
      <circle cx="192" cy="72" r="12" fill="currentColor" stroke="none" />
      {/* 2枚をつなぐ折れ線（2曲がり）。実線で「経路が立った」感じを出す */}
      <polyline points="64,140 64,72 156,72" />
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
 * ブラックジャック（札の枠に「21」）。**これも自前で描いている。**
 *
 * 七並べの SevensIcon・スピードの SpeedBoltIcon と同じ枠で、中身を「21」にした。
 * 同名の漫画を連想させる絵（人物・配色）は使わない約束なので、札そのものの型に留める
 * （docs/features/game-blackjack.md）。
 *
 * 線の太さ（viewBox 256 に対して 16）は Phosphor の regular に合わせてある。
 */
function Cards21Icon({ size = 26 }: IconProps) {
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
      <path d="M84 104c0-16 10-26 24-26s24 10 24 24c0 20-48 44-48 74h48" />
      <path d="M156 94l16-16v98" />
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
 * ゴルフソリティア。カップに立てた旗と、寄せた球。
 *
 * トランプの形（CardsIcon）にすると一覧にある他5本のソリティアと見分けが付かず、
 * 三角の系統（PyramidIcon / TriPeaksIcon）も既に2本ある。
 * 「残り札の少なさを競う＝ゴルフ」という名前の由来がそのまま絵になるので、
 * ここだけジャンルではなく名前のほうを描いている。
 * home/index.html にも同じ形を置く（座標を見比べられるように数値で持つ）
 */
function GolfIcon({ size = 26 }: IconProps) {
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
      {/* 地面 */}
      <path d="M24 208 H232" />
      {/* 旗竿と旗 */}
      <path d="M148 208 V40" />
      <path d="M148 48 L212 76 L148 104 Z" />
      {/* 球 */}
      <circle cx="68" cy="188" r="20" />
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

/**
 * ボルダリング合体パズル。**箱に落ちた大小のホールド**を多角形で描く。
 *
 * Phosphor に「箱の中で大きさが増えていく丸」に当たるアイコンが無い
 * （果物系は Orange/Cherries しか無く、どれも「合体して育つ」が伝わらない）。
 * 大中小の丸を箱に入れることで、一覧に並んでいるほかの丸系
 * （リバーシの石・2048の格子）と見分けが付く。
 *
 * **顔つきの果物にはしない**（同系ゲームの商品の意匠を避ける。
 * docs/features/game-bouldering-merge.md の「名称・権利の注意」）。
 * 線の太さは Phosphor の regular（viewBox 256 に対して 16）に合わせる
 */
function BoulderingMergeIcon({ size = 26 }: IconProps) {
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
      {/* 箱。上は開いている（落とし口） */}
      <path d="M40 40 V216 H216 V40" />
      {/* 大中小の多角形。**丸ではなく角のある形**にして、
          当たり判定が形に沿っていること（このゲームの肝）を絵でも出す */}
      <path d="M74 200 L64 148 L104 126 L142 152 L128 200 Z" />
      <path d="M150 200 L146 160 L188 152 L196 200 Z" />
      <path d="M112 106 L92 78 L124 62 L146 86 Z" />
    </svg>
  );
}

/**
 * 箱入り娘。**4×5の枡に2×2の駒が入っている**ところを描く。
 *
 * Phosphor には「箱の中で駒を滑らせる」に当たるアイコンが無く、近い格子系
 * （SquaresFour・GridFour・GridNine）は既に2048・ナンプレ・ブロックパズルで
 * 使っているので、縦長の枠と大きな駒で見分けが付くよう自前で描いている。
 * 線の太さは Phosphor の regular（viewBox 256 に対して 16）に合わせる
 */
function SlidingBlocksIcon({ size = 26 }: IconProps) {
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
      {/* 盤（縦長の箱）。下の中央が出口なので、そこだけ線を切る */}
      <path d="M48 24 H208 V232 H160 M96 232 H48 V24" />
      {/* 大きな駒（2×2）と、脇の縦長の駒 */}
      <rect x="88" y="56" width="80" height="80" />
      <path d="M88 168 H168" />
    </svg>
  );
}

function HitofudePathIcon({ size = 26 }: IconProps) {
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
      {/* 3×3 の盤を蛇行して通る 1 本の道。始点と終点に番号の丸 */}
      <path d="M64 64 H192 V128 H64 V192 H192" />
      <circle cx="64" cy="64" r="20" fill="currentColor" />
      <circle cx="192" cy="192" r="20" fill="currentColor" />
    </svg>
  );
}

/**
 * マッチ3パズル。**同じ丸が2つ並び、3つ目が1段下にずれている**。上向きの矢印で
 * 「入れ替えるとそろう」一歩手前を表す。盤の格子（GridFour など）はすでに3つあるので、
 * 格子は描かずに図形だけで見分ける。線の太さは Phosphor の regular に合わせて 16
 */
function Match3Icon({ size = 26 }: IconProps) {
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
      <circle cx="52" cy="88" r="30" />
      <circle cx="204" cy="88" r="30" />
      <circle cx="128" cy="184" r="30" fill="currentColor" />
      <polyline points="108,92 128,72 148,92" />
      <line x1="128" y1="72" x2="128" y2="128" />
    </svg>
  );
}

function TargetNumberIcon({ size = 26 }: IconProps) {
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
      {/* 上に目標の枠、下に 2 段 × 3 の数のタイル */}
      <rect x="64" y="32" width="128" height="64" rx="12" />
      <rect x="40" y="128" width="48" height="40" rx="8" />
      <rect x="104" y="128" width="48" height="40" rx="8" />
      <rect x="168" y="128" width="48" height="40" rx="8" />
      <rect x="40" y="184" width="48" height="40" rx="8" />
      <rect x="104" y="184" width="48" height="40" rx="8" />
      <rect x="168" y="184" width="48" height="40" rx="8" />
    </svg>
  );
}

/* =====================================================================
 * 一覧カードの絵（盤面）
 *
 * 60px のタイルに 40px で描く。**ゲームは盤面をそのまま描く**
 * （抽象化しない。札は札の形、盤は盤の目）。遊ぶ人は盤面を見に来ているので、
 * それがいちばん速く伝わる。仕様は docs/features/card-illustrations.md。
 *
 * 色は3つだけ使う。線と塗りは currentColor（タイルの --tile-ink）、淡い面は
 * その薄め、抜きはタイルの地色（--tile-bg）。**生のカラーコードは書かない**
 * （明暗テーマに追随させるため。tests/game-art.test.ts が見張る）。
 *
 * ここに無い名前は、上の線画アイコン（ICONS）にフォールバックする。
 * 公開前のゲームは `public` にするPRで盤面を描く。
 * ===================================================================== */

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const F = { fill: 'currentColor', fillOpacity: 0.2 } as const;
const SOLID = { fill: 'currentColor' } as const;
const CUT = { style: { fill: 'var(--tile-bg, var(--accent-soft))' } } as const;
const CUT_S = {
  fill: 'none',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style: { stroke: 'var(--tile-bg, var(--accent-soft))' },
} as const;
const DIGIT = { fontFamily: 'system-ui, sans-serif', fontWeight: 700, textAnchor: 'middle' } as const;

/** さいころの5の目 */
function FivePips({ x, y, s, cut }: { x: number; y: number; s: number; cut?: boolean }) {
  const p = cut ? CUT : SOLID;
  const a = s * 0.27;
  const b = s * 0.73;
  return (
    <>
      <circle cx={x + a} cy={y + a} r={s * 0.1} {...p} />
      <circle cx={x + b} cy={y + a} r={s * 0.1} {...p} />
      <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.1} {...p} />
      <circle cx={x + a} cy={y + b} r={s * 0.1} {...p} />
      <circle cx={x + b} cy={y + b} r={s * 0.1} {...p} />
    </>
  );
}

const BOARD: Record<string, ReactNode> = {
  // ソリティア：扇に開いた札
  Cards: (
    <>
      <g transform="rotate(-14 17 34)">
        <rect x="6" y="18" width="22" height="32" rx="4" {...F} />
        <rect x="6" y="18" width="22" height="32" rx="4" {...S} />
      </g>
      <rect x="21" y="14" width="22" height="32" rx="4" {...F} />
      <rect x="21" y="14" width="22" height="32" rx="4" {...S} />
      <g transform="rotate(12 46 28)">
        <rect x="35" y="12" width="22" height="32" rx="4" {...SOLID} />
        <path d="M46 21l5 7-5 7-5-7z" {...CUT} />
      </g>
    </>
  ),
  // スパイダー：縦に重なった2列
  Spade: (
    <>
      {[8, 14, 20].map((y) => (
        <g key={`a${y}`}>
          <rect x="7" y={y} width="22" height="26" rx="3" {...F} />
          <rect x="7" y={y} width="22" height="26" rx="3" {...S} strokeWidth={2.4} />
        </g>
      ))}
      <rect x="7" y="26" width="22" height="30" rx="3" {...SOLID} />
      <path
        d="M18 33c-4 4-8 6-8 10a4 4 0 0 0 7 2.6L16 50h4l-1-4.4A4 4 0 0 0 26 43c0-4-4-6-8-10z"
        {...CUT}
      />
      {[8, 14].map((y) => (
        <g key={`b${y}`}>
          <rect x="35" y={y} width="22" height="26" rx="3" {...F} />
          <rect x="35" y={y} width="22" height="26" rx="3" {...S} strokeWidth={2.4} />
        </g>
      ))}
      <rect x="35" y="20" width="22" height="30" rx="3" {...F} />
      <rect x="35" y="20" width="22" height="30" rx="3" {...S} />
    </>
  ),
  // フリーセル：上に空きマス4つ、下に札
  Club: (
    <>
      {[4, 18, 32, 46].map((x) => (
        <rect key={x} x={x} y="5" width="13" height="16" rx="2.5" {...S} strokeWidth={2.2} strokeDasharray="3 3" />
      ))}
      <rect x="9" y="27" width="20" height="30" rx="3" {...SOLID} />
      <circle cx="19" cy="37" r="3.4" {...CUT} />
      <circle cx="15" cy="42.5" r="3.4" {...CUT} />
      <circle cx="23" cy="42.5" r="3.4" {...CUT} />
      <rect x="17.8" y="42" width="2.4" height="8" rx="1" {...CUT} />
      <rect x="35" y="27" width="20" height="30" rx="3" {...F} />
      <rect x="35" y="27" width="20" height="30" rx="3" {...S} />
    </>
  ),
  // ピラミッド：札を三角に積む
  Pyramid: (
    <>
      {[
        [19, 18],
        [33, 18],
        [12, 28],
        [26, 28],
        [40, 28],
        [5, 38],
        [19, 38],
        [33, 38],
        [47, 38],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="12" height="17" rx="2" {...F} />
          <rect x={x} y={y} width="12" height="17" rx="2" {...S} strokeWidth={2.2} />
        </g>
      ))}
      <rect x="26" y="7" width="12" height="17" rx="2" {...SOLID} />
    </>
  ),
  // トライピークス：山が3つ
  TriPeaks: (
    <>
      {[12, 32, 52].map((cx) => (
        <g key={cx}>
          <rect x={cx - 10} y="21" width="9" height="13" rx="1.8" {...F} />
          <rect x={cx - 10} y="21" width="9" height="13" rx="1.8" {...S} strokeWidth={2} />
          <rect x={cx + 1} y="21" width="9" height="13" rx="1.8" {...F} />
          <rect x={cx + 1} y="21" width="9" height="13" rx="1.8" {...S} strokeWidth={2} />
          <rect x={cx - 4.5} y="10" width="9" height="13" rx="1.8" {...SOLID} />
        </g>
      ))}
      <rect x="26" y="42" width="12" height="17" rx="2" {...SOLID} />
      <rect x="12" y="42" width="12" height="17" rx="2" {...S} strokeWidth={2.2} strokeDasharray="3 3" />
    </>
  ),
  // ゴルフ：旗と札
  Golf: (
    <>
      <ellipse cx="42" cy="51" rx="15" ry="5" {...F} />
      <ellipse cx="42" cy="51" rx="15" ry="5" {...S} />
      <path d="M42 8v43" {...S} />
      <path d="M42 9 L58 16 L42 23z" {...SOLID} />
      <rect x="6" y="20" width="20" height="30" rx="3" {...F} />
      <rect x="6" y="20" width="20" height="30" rx="3" {...S} />
      <circle cx="16" cy="35" r="4" {...SOLID} />
    </>
  ),
  // マインスイーパー：盤と地雷
  Bomb: (
    <>
      <rect x="7" y="7" width="50" height="50" rx="5" {...F} />
      <path d="M23.7 7v50 M40.3 7v50 M7 23.7h50 M7 40.3h50" {...S} strokeWidth={2} strokeOpacity={0.5} />
      <rect x="7" y="7" width="50" height="50" rx="5" {...S} />
      <circle cx="32" cy="32" r="6.5" {...SOLID} />
      <path d="M32 22v4 M32 38v4 M22 32h4 M38 32h4" {...S} />
      <rect x="40.3" y="7" width="16.7" height="16.7" rx="0" {...SOLID} />
      <text x="48.6" y="20" fontSize="12" {...DIGIT} {...CUT}>1</text>
    </>
  ),
  // 2048：数字のタイル
  SquaresFour: (
    <>
      <rect x="7" y="7" width="23" height="23" rx="4" {...F} />
      <rect x="34" y="7" width="23" height="23" rx="4" {...SOLID} fillOpacity={0.35} />
      <rect x="7" y="34" width="23" height="23" rx="4" {...SOLID} fillOpacity={0.55} />
      <rect x="34" y="34" width="23" height="23" rx="4" {...SOLID} />
      <text x="18.5" y="23" fontSize="13" {...DIGIT} {...SOLID}>2</text>
      <text x="45.5" y="23" fontSize="13" {...DIGIT} {...SOLID}>4</text>
      <text x="18.5" y="50" fontSize="13" {...DIGIT} {...CUT}>8</text>
      <text x="45.5" y="50" fontSize="12" {...DIGIT} {...CUT}>16</text>
    </>
  ),
  // ナンプレ：3×3の枠と数字
  GridNine: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="4" {...F} />
      <path d="M23.3 6v52 M40.7 6v52 M6 23.3h52 M6 40.7h52" {...S} strokeWidth={2.2} />
      <rect x="6" y="6" width="52" height="52" rx="4" {...S} />
      <rect x="40.7" y="6" width="17.3" height="17.3" {...SOLID} />
      <text x="14.7" y="19.5" fontSize="12" {...DIGIT} {...SOLID}>5</text>
      <text x="32" y="37" fontSize="12" {...DIGIT} {...SOLID}>3</text>
      <text x="14.7" y="54.3" fontSize="12" {...DIGIT} {...SOLID}>9</text>
      <text x="49.3" y="19.5" fontSize="12" {...DIGIT} {...CUT}>7</text>
    </>
  ),
  // ノノグラム：塗ったマスで絵が出る
  GridFour: (
    <>
      <rect x="18" y="18" width="40" height="40" rx="3" {...F} />
      {[
        [28, 18],
        [38, 18],
        [18, 28],
        [28, 28],
        [38, 28],
        [48, 28],
        [28, 38],
        [38, 38],
        [28, 48],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" {...SOLID} />
      ))}
      <path d="M28 18v40 M38 18v40 M48 18v40 M18 28h40 M18 38h40 M18 48h40" {...S} strokeWidth={1.4} strokeOpacity={0.45} />
      <rect x="18" y="18" width="40" height="40" rx="3" {...S} />
      <path d="M31 7v7 M41 7v7 M7 31h7 M7 41h7" {...S} strokeWidth={3.4} />
    </>
  ),
  // 数字つなぎ一筆書き：マス目の盤と、1から9まで渦を巻く1本の道。
  // 往復する道（M16 16 H48 V32 H16 V48 H48）は数字の「2」に見えたので、盤の線を引いて渦にした
  HitofudePath: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="4" {...F} />
      <path d="M23.3 6v52 M40.7 6v52 M6 23.3h52 M6 40.7h52" {...S} strokeWidth={1.6} strokeOpacity={0.45} />
      <path d="M14.7 14.7 V49.3 H49.3 V14.7 H32 V32" {...S} strokeWidth={5} />
      <circle cx="14.7" cy="14.7" r="7" {...SOLID} />
      <circle cx="32" cy="32" r="7" {...SOLID} />
      <text x="14.7" y="18.9" fontSize="11" {...DIGIT} {...CUT}>1</text>
      <text x="32" y="36.2" fontSize="11" {...DIGIT} {...CUT}>9</text>
    </>
  ),
  // リバーシ：盤と白黒の石
  Stones: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="4" {...F} />
      <path d="M19 6v52 M32 6v52 M45 6v52 M6 19h52 M6 32h52 M6 45h52" {...S} strokeWidth={1.6} strokeOpacity={0.5} />
      <rect x="6" y="6" width="52" height="52" rx="4" {...S} />
      <circle cx="25.5" cy="25.5" r="5.4" {...SOLID} />
      <circle cx="38.5" cy="38.5" r="5.4" {...SOLID} />
      <circle cx="38.5" cy="25.5" r="5.4" {...CUT} />
      <circle cx="38.5" cy="25.5" r="5.4" {...S} strokeWidth={2.4} />
      <circle cx="25.5" cy="38.5" r="5.4" {...CUT} />
      <circle cx="25.5" cy="38.5" r="5.4" {...S} strokeWidth={2.4} />
    </>
  ),
  // 五目並べ：斜めに5つ並んだ石
  FiveInARow: (
    <>
      <path
        d="M10 6v52 M21 6v52 M32 6v52 M43 6v52 M54 6v52 M6 10h52 M6 21h52 M6 32h52 M6 43h52 M6 54h52"
        {...S}
        strokeWidth={1.6}
        strokeOpacity={0.45}
      />
      {[10, 21, 32, 43, 54].map((v) => (
        <circle key={v} cx={v} cy={64 - v} r="4.8" {...SOLID} />
      ))}
      <circle cx="21" cy="21" r="4.8" {...CUT} />
      <circle cx="21" cy="21" r="4.8" {...S} strokeWidth={2.2} />
      <circle cx="43" cy="43" r="4.8" {...CUT} />
      <circle cx="43" cy="43" r="4.8" {...S} strokeWidth={2.2} />
    </>
  ),
  // 大富豪：王冠と手札
  Crown: (
    <>
      <g transform="rotate(-12 22 44)">
        <rect x="12" y="30" width="20" height="28" rx="3" {...F} />
        <rect x="12" y="30" width="20" height="28" rx="3" {...S} />
      </g>
      <g transform="rotate(12 42 44)">
        <rect x="32" y="30" width="20" height="28" rx="3" {...F} />
        <rect x="32" y="30" width="20" height="28" rx="3" {...S} />
      </g>
      <path d="M10 12 l9 11 l13-15 l13 15 l9-11 l-4 22 H14z" {...SOLID} />
      <circle cx="32" cy="7" r="3" {...SOLID} />
    </>
  ),
  // 七並べ：7を真ん中に並べる
  Sevens: (
    <>
      <rect x="3" y="18" width="18" height="27" rx="3" {...F} />
      <rect x="3" y="18" width="18" height="27" rx="3" {...S} />
      <rect x="43" y="18" width="18" height="27" rx="3" {...F} />
      <rect x="43" y="18" width="18" height="27" rx="3" {...S} />
      <rect x="22" y="12" width="20" height="30" rx="3" {...SOLID} />
      <text x="32" y="34" fontSize="18" {...DIGIT} {...CUT}>7</text>
      <path d="M26 48h12 M26 53h12" {...S} strokeOpacity={0.5} />
    </>
  ),
  // 神経衰弱：伏せた札と、そろった2枚
  MemoryPair: (
    <>
      {[
        [6, 9, false],
        [25, 9, true],
        [44, 9, true],
        [6, 34, true],
        [25, 34, true],
        [44, 34, false],
      ].map(([x, y, down]) =>
        down ? (
          <g key={`${x}-${y}`}>
            <rect x={x as number} y={y as number} width="14" height="21" rx="2.5" {...F} />
            <rect x={x as number} y={y as number} width="14" height="21" rx="2.5" {...S} strokeWidth={2.2} />
          </g>
        ) : (
          <g key={`${x}-${y}`}>
            <rect x={x as number} y={y as number} width="14" height="21" rx="2.5" {...SOLID} />
            <path
              d={`M${(x as number) + 7} ${(y as number) + 15.5}l-4.6-4.4a2.8 2.8 0 0 1 4.6-3.4 2.8 2.8 0 0 1 4.6 3.4z`}
              {...CUT}
            />
          </g>
        ),
      )}
    </>
  ),
  // スピード：2枚の札と稲妻
  SpeedBolt: (
    <>
      <g transform="rotate(-10 15 32)">
        <rect x="4" y="16" width="20" height="30" rx="3" {...F} />
        <rect x="4" y="16" width="20" height="30" rx="3" {...S} />
      </g>
      <g transform="rotate(10 49 32)">
        <rect x="40" y="16" width="20" height="30" rx="3" {...SOLID} />
      </g>
      <path d="M36 6 L24 33 h9 L28 58 L42 27 h-9 z" {...SOLID} />
      <path d="M36 6 L24 33 h9 L28 58 L42 27 h-9 z" {...CUT_S} strokeWidth={2} />
    </>
  ),
  // 花札：芒に月
  Hanafuda: (
    <>
      <rect x="15" y="5" width="34" height="54" rx="3" {...F} />
      <circle cx="32" cy="24" r="11" {...SOLID} />
      <path d="M15 59 V45 C23 36 41 36 49 45 V59z" {...SOLID} />
      <path d="M24 56 l-3-8 M32 56 v-10 M40 56 l3-8" {...CUT_S} strokeWidth={2.4} />
      <rect x="15" y="5" width="34" height="54" rx="3" {...S} />
    </>
  ),
  // 麻雀ソリティア：積まれた牌
  Tiles: (
    <>
      <rect x="19" y="10" width="22" height="30" rx="3" {...SOLID} fillOpacity={0.4} />
      <rect x="17" y="7" width="22" height="30" rx="3" {...F} />
      <rect x="17" y="7" width="22" height="30" rx="3" {...S} />
      <rect x="10" y="26" width="22" height="30" rx="3" {...SOLID} fillOpacity={0.4} />
      <rect x="8" y="23" width="22" height="30" rx="3" {...F} />
      <rect x="8" y="23" width="22" height="30" rx="3" {...S} />
      <path d="M19 30v16" {...S} />
      <rect x="35" y="26" width="22" height="30" rx="3" {...SOLID} fillOpacity={0.4} />
      <rect x="33" y="23" width="22" height="30" rx="3" {...SOLID} />
      <circle cx="44" cy="32" r="3.2" {...CUT} />
      <circle cx="44" cy="44" r="3.2" {...CUT} />
    </>
  ),
  // ブロックパズル：落ちてくる形と、そろいかけの段
  Blocks: (
    <>
      <rect x="22" y="6" width="10" height="10" {...SOLID} />
      <rect x="32" y="6" width="10" height="10" {...SOLID} />
      <rect x="42" y="6" width="10" height="10" {...SOLID} />
      <rect x="32" y="16" width="10" height="10" {...SOLID} />
      {[
        [7, 37],
        [17, 37],
        [47, 37],
        [7, 47],
        [17, 47],
        [27, 47],
        [47, 47],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="10" height="10" {...F} />
          <rect x={x} y={y} width="10" height="10" {...S} strokeWidth={2} />
        </g>
      ))}
      <rect x="37" y="47" width="10" height="10" {...S} strokeWidth={2} strokeDasharray="2.5 2.5" />
    </>
  ),
  // 色水ソート：層になった試験管
  Tubes: (
    <>
      {[
        [5, [0.2, 0.55, 1]],
        [25, [0, 1, 0.55]],
        [45, [1, 1, 1]],
      ].map(([x, layers]) => {
        const xx = x as number;
        const [top, mid, bottom] = layers as number[];
        return (
          <g key={xx}>
            {top > 0 && <rect x={xx} y="16" width="14" height="10" {...SOLID} fillOpacity={top} />}
            {mid > 0 && <rect x={xx} y="26" width="14" height="10" {...SOLID} fillOpacity={mid} />}
            <path d={`M${xx} 36 v8 a7 7 0 0 0 14 0 v-8z`} {...SOLID} fillOpacity={bottom} />
            <path d={`M${xx} 10 v34 a7 7 0 0 0 14 0 V10`} {...S} />
            <path d={`M${xx - 2} 10 h18`} {...S} />
          </g>
        );
      })}
    </>
  ),
  // ブロック崩し：ブロックの列と球とバー
  Racquet: (
    <>
      {[6, 20, 34, 48].map((x) => (
        <rect key={`t${x}`} x={x} y="7" width="11" height="7" rx="1.5" {...SOLID} />
      ))}
      {[6, 34, 48].map((x) => (
        <g key={`m${x}`}>
          <rect x={x} y="17" width="11" height="7" rx="1.5" {...F} />
          <rect x={x} y="17" width="11" height="7" rx="1.5" {...S} strokeWidth={2} />
        </g>
      ))}
      <path d="M28 49 L37 37 L46 25" {...S} strokeWidth={2.2} strokeDasharray="3 4" strokeOpacity={0.7} />
      <circle cx="37" cy="37" r="4" {...SOLID} />
      <rect x="16" y="51" width="26" height="6" rx="3" {...SOLID} />
    </>
  ),
  // スネーク：うねる体と餌。直角の折り返しにしない（数字の「2.」に見える。SnakeIcon のコメント参照）
  Snake: (
    <>
      <path d="M8 38 C14 22 22 22 28 38 S42 54 46 40" fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={10} strokeLinecap="round" />
      <path d="M8 38 C14 22 22 22 28 38 S42 54 46 40" {...S} strokeWidth={4} />
      <circle cx="48.5" cy="33" r="7" {...SOLID} />
      <circle cx="50.5" cy="30.5" r="1.8" {...CUT} />
      <circle cx="52" cy="14" r="4.5" {...SOLID} />
      <path d="M52 9.5 v-3" {...S} strokeWidth={2.4} />
    </>
  ),
  // ヨット：得点表と、そろった5の目
  DiceFive: (
    <>
      <rect x="5" y="7" width="22" height="30" rx="3" {...F} />
      <rect x="5" y="7" width="22" height="30" rx="3" {...S} />
      <path d="M10 15h12 M10 22h12 M10 29h8" {...S} strokeWidth={2.4} />
      <rect x="32" y="9" width="25" height="25" rx="5" {...SOLID} />
      <FivePips x={32} y={9} s={25} cut />
      <rect x="15" y="35" width="23" height="23" rx="5" {...F} />
      <rect x="15" y="35" width="23" height="23" rx="5" {...S} />
      <FivePips x={15} y={35} s={23} />
    </>
  ),
};

/** 盤面の絵がある icon 名（tests/game-art.test.ts が、公開中のゲームがすべて含まれるかを見る） */
export const GAME_BOARD_ICONS: readonly string[] = Object.keys(BOARD);

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
  TilesPath: TilesPathIcon,
  FiveInARow: FiveInARowIcon,
  Blocks: BlocksIcon,
  Sevens: SevensIcon,
  MemoryPair: MemoryPairIcon,
  SpeedBolt: SpeedBoltIcon,
  Cards21: Cards21Icon,
  Hanafuda: HanafudaIcon,
  Pinball: PinballIcon,
  Pyramid: PyramidIcon,
  TriPeaks: TriPeaksIcon,
  Golf: GolfIcon,
  Snake: SnakeIcon,
  Tubes: TubesIcon,
  DiceFive: DiceFiveIcon,
  BoulderingMerge: BoulderingMergeIcon,
  Keyboard: KeyboardIcon,
  SlidingBlocks: SlidingBlocksIcon,
  // 星置きパズル。猫や動物の絵柄は先行アプリの模倣に見えるので使わず、星で通す
  Star: StarIcon,
  // 数字つなぎ一筆書き。先行アプリの絵柄はなぞらず、蛇行する 1 本の道で表す
  HitofudePath: HitofudePathIcon,
  // マッチ3パズル。宝石・キャンディの絵柄は既存タイトルを連想させるので使わず、丸と矢印で表す
  Match3: Match3Icon,
  // ターゲット計算パズル。目標の枠と数のタイル（盤面の絵は `public` にするPRで描く）
  TargetNumber: TargetNumberIcon,
};

export default function GameIcon({ name, size = 26 }: { name: string; size?: number }) {
  // 盤面の絵があればそれを出す。大きさはカードの CSS（.game-card .icon svg）が決める
  const board = BOARD[name];
  if (board) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
        {board}
      </svg>
    );
  }
  const Cmp = ICONS[name];
  // 名前を間違えても落とさない。アイコンが出ないだけで済ませる
  if (!Cmp) return null;
  return <Cmp size={size} weight="regular" aria-hidden="true" />;
}
