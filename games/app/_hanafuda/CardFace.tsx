'use client';

/**
 * 花札48枚の絵柄（SVG）。
 *
 * 仕様: docs/features/game-hanafuda-koikoi.md
 *
 * **絵文字や画像ではなく自前のSVGで描く。** 麻雀ソリティアの牌
 * （app/mahjong-solitaire/TileFace.tsx）と同じ判断で、絵文字は端末ごとに
 * 絵柄も色も変わり、サイトの配色に馴染まない。
 *
 * 伝統的な意匠（松に鶴・芒に月など）そのものはパブリックドメインだが、
 * **特定メーカーの製品の絵柄は模写しない**（仕様書の「権利リスクがない」）。
 * ここにあるのは意匠を単純化したオリジナルのフラットデザインで、
 * 小さく並べても月が見分けられることを最優先にしている。
 *
 * ## 描き方の約束
 *
 * - 1枚は 60×100 の viewBox（本物の花札のおよその縦横比）
 * - **「月の草木」＋「その札の主役」の2層**で組み立てる。48枚を1枚ずつ
 *   描くと量が多いので、月ごとの背景（`MonthPlant`）を12種だけ描いて、
 *   光・タネ・短冊の主役をその上に重ねる。カスは背景だけで済む
 * - 短冊は3種（赤短・青短・無地の赤）の使い回し
 * - 地の色は明暗どちらのテーマでも生成り色のまま（本物の札がそうで、
 *   ダークモードで黒くすると花札に見えなくなる）。よって色は直に書く
 * - **月数の数字を右上に併記できる**（`showMonth`）。伝統的な札には無いが、
 *   初めて触る人は草木で月を見分けられないため（仕様書の初心者導線）
 *
 * ## 将来の転用
 *
 * 花合わせ・八八に持っていけるよう、ここはゲームの状態を一切知らない。
 * 受け取るのは札のID（`lib/hanafuda-cards.ts`）だけ。
 */

import { cardLabel, cardOf } from '@/lib/hanafuda-cards';

const W = 60;
const H = 100;

// 地と枠
const PAPER = '#f7f0dd';
const EDGE = '#2b2420';
const INK = '#3a322c';

// 草木・主役の色
const PINE = '#1f6b3b';
const PINE_DARK = '#13502b';
const LEAF = '#2f7d4f';
const LEAF_DARK = '#1f5c3a';
const PLUM = '#d94f7f';
const SAKURA = '#f2a8c2';
const RED = '#c1272d';
const RED_BRIGHT = '#e0392b';
const PURPLE = '#6b4b9a';
const PURPLE_DARK = '#4c3373';
const BLUE = '#3f6fb5';
const GOLD = '#e0a92b';
const GOLD_LIGHT = '#f2cf6a';
const BROWN = '#7a4a26';
const BROWN_DARK = '#5a3418';
const HILL = '#4a3f2f';
const WHITE = '#fbfaf3';

/** 和文は明朝系のほうが札らしく見える。無ければ serif に落ちる */
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

// ---------------------------------------------------------------- 部品

/** 5弁の花（梅・桜で使い回す） */
function Blossom({
  cx,
  cy,
  r,
  fill,
  core = GOLD,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  core?: string;
}) {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        return (
          <circle
            key={i}
            cx={cx + Math.cos(a) * r * 0.72}
            cy={cy + Math.sin(a) * r * 0.72}
            r={r * 0.54}
            fill={fill}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.3} fill={core} />
    </g>
  );
}

/**
 * 小鳥（鶯・不如帰・雁・燕で使い回す）。
 * 体・頭・くちばし・尾・翼の5つだけで作る。向きは `flip` で左右に振る。
 */
function Bird({
  x,
  y,
  s = 1,
  body,
  wing,
  beak = GOLD,
  flip = false,
  tail = 'short',
}: {
  x: number;
  y: number;
  s?: number;
  body: string;
  wing: string;
  beak?: string;
  flip?: boolean;
  tail?: 'short' | 'fork';
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {tail === 'fork' ? (
        <path d="M4 0 L16 -6 L11 0 L16 6 Z" fill={body} />
      ) : (
        <path d="M4 0 L15 -4 L14 3 Z" fill={body} />
      )}
      <ellipse cx="0" cy="0" rx="8" ry="5.5" fill={body} />
      <circle cx="-7" cy="-3.5" r="3.6" fill={body} />
      <path d="M-10 -3.5 L-15 -2 L-10 -0.6 Z" fill={beak} />
      <path d="M1 -2 C-2 -7 -8 -6 -6 -1 C-4 2 0 2 1 -2 Z" fill={wing} />
      <circle cx="-8" cy="-4.2" r="0.8" fill={EDGE} />
    </g>
  );
}

/** 短冊。赤短だけ詩を思わせる筆跡（線）を入れる */
function Tanzaku({ kind }: { kind: 'aka' | 'ao' | 'plain' }) {
  const fill = kind === 'ao' ? BLUE : '#d6564d';
  return (
    <g transform="translate(33 22) rotate(9)">
      <rect x="0" y="0" width="14" height="52" rx="2.5" fill={fill} stroke={EDGE} strokeWidth="1" />
      <rect x="2.5" y="2.5" width="9" height="47" rx="1.5" fill="none" stroke={WHITE} strokeWidth="0.7" opacity="0.6" />
      {kind === 'aka' &&
        [10, 20, 30, 40].map((y) => (
          <g key={y} stroke={WHITE} strokeWidth="1.2" strokeLinecap="round" opacity="0.92">
            <path d={`M4.5 ${y} h5`} />
            <path d={`M7 ${y + 2.5} v3`} />
          </g>
        ))}
    </g>
  );
}

// ---------------------------------------------------------------- 月ごとの草木

function Pine() {
  return (
    <g>
      <path d="M16 92 C18 72 22 56 29 42" stroke={BROWN_DARK} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M24 60 L38 52" stroke={BROWN_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 24 L14 46 H46 Z" fill={PINE_DARK} />
      <path d="M30 36 L16 56 H44 Z" fill={PINE} />
      <path d="M42 52 L33 66 H51 Z" fill={PINE_DARK} />
      <path d="M18 62 L10 76 H26 Z" fill={PINE} />
    </g>
  );
}

function Plum() {
  return (
    <g>
      <path d="M8 88 C20 72 26 56 34 34" stroke={EDGE} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M22 62 L44 54" stroke={EDGE} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M28 46 L12 40" stroke={EDGE} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <Blossom cx={36} cy={30} r={9} fill={PLUM} />
      <Blossom cx={46} cy={52} r={7.5} fill={PLUM} />
      <Blossom cx={13} cy={38} r={7} fill={WHITE} core={PLUM} />
      <Blossom cx={22} cy={74} r={6.5} fill={PLUM} />
    </g>
  );
}

function Sakura() {
  return (
    <g>
      <path d="M6 92 C18 78 24 62 30 40" stroke={BROWN_DARK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
      <path d="M20 68 L46 60" stroke={BROWN_DARK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <Blossom cx={30} cy={34} r={9.5} fill={SAKURA} />
      <Blossom cx={46} cy={48} r={8} fill={SAKURA} />
      <Blossom cx={16} cy={52} r={7.5} fill={SAKURA} />
      <Blossom cx={42} cy={72} r={7} fill={SAKURA} />
      <Blossom cx={22} cy={82} r={6} fill={SAKURA} />
    </g>
  );
}

function Wisteria() {
  return (
    <g>
      <path d="M6 16 C22 12 40 14 54 20" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 房は4段まで。6段にすると札の下半分まで埋まって、不如帰（4-1）が
          房の中に隠れてしまう */}
      {[
        [15, 20, 0.95],
        [31, 22, 1.05],
        [47, 24, 0.85],
      ].map(([x, y, k], i) => (
        <g key={i}>
          {[0, 1, 2, 3].map((r) => (
            <g key={r}>
              <circle
                cx={(x as number) - 3.6 * (k as number)}
                cy={(y as number) + 9 * (k as number) * r + 8}
                r={4 * (k as number)}
                fill={PURPLE}
              />
              <circle
                cx={(x as number) + 3.6 * (k as number)}
                cy={(y as number) + 9 * (k as number) * r + 12}
                r={3.4 * (k as number)}
                fill={PURPLE_DARK}
              />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function Iris() {
  return (
    <g>
      {[10, 18, 46, 52].map((x, i) => (
        <path
          key={x}
          d={`M${x} 96 C${x + (i % 2 ? 6 : -6)} 66 ${x + (i % 2 ? 4 : -4)} 44 ${x + (i % 2 ? -2 : 2)} 24`}
          stroke={LEAF}
          strokeWidth="3.4"
          fill="none"
          strokeLinecap="round"
        />
      ))}
      <path d="M30 96 V40" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <g transform="translate(30 34)">
        <path d="M0 0 C-13 2 -14 16 -3 14 C-1 12 -1 4 0 0 Z" fill={PURPLE} />
        <path d="M0 0 C13 2 14 16 3 14 C1 12 1 4 0 0 Z" fill={PURPLE} />
        <path d="M0 2 C-4 12 -3 20 0 22 C3 20 4 12 0 2 Z" fill={PURPLE_DARK} />
        <path d="M0 0 C-6 -8 -3 -18 0 -20 C3 -18 6 -8 0 0 Z" fill={PURPLE} />
        <circle cx="0" cy="4" r="2.6" fill={GOLD_LIGHT} />
      </g>
    </g>
  );
}

function Peony() {
  return (
    <g>
      <path d="M12 96 C16 74 20 60 26 48" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M20 70 C10 66 8 56 16 54 C22 53 24 62 20 70 Z" fill={LEAF} />
      <path d="M40 74 C50 70 52 60 44 58 C38 57 36 66 40 74 Z" fill={LEAF} />
      <g transform="translate(31 34)">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-13"
            rx="7.5"
            ry="11"
            fill={i % 2 ? '#b02049' : '#cf2b58'}
            transform={`rotate(${i * 45})`}
          />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse key={`in${i}`} cx="0" cy="-6" rx="4.6" ry="6.5" fill="#e05c86" transform={`rotate(${i * 72 + 20})`} />
        ))}
        <circle cx="0" cy="0" r="3.4" fill={GOLD} />
      </g>
    </g>
  );
}

function BushClover() {
  return (
    <g>
      {[
        [14, 'M14 96 C6 72 10 46 22 28'],
        [30, 'M30 96 C28 70 30 44 34 24'],
        [46, 'M46 96 C54 72 50 48 40 30'],
      ].map(([, d], i) => (
        <path key={i} d={d as string} stroke={LEAF_DARK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      ))}
      {[
        [14, 40],
        [20, 56],
        [12, 70],
        [30, 36],
        [33, 52],
        [29, 68],
        [45, 44],
        [42, 60],
        [48, 74],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx="5" ry="3.4" fill="#c2437c" transform={`rotate(${i % 2 ? 22 : -22} ${x} ${y})`} />
          <ellipse cx={x + 2} cy={y + 3} rx="3.4" ry="2.4" fill="#8f2f5e" />
        </g>
      ))}
    </g>
  );
}

/**
 * 芒（すすき）。黒い丘と銀色の穂。
 *
 * 丘は札の下3分の1に留める。丘を高くすると穂が地の色に埋もれて、
 * 8月のカス2枚が「茶色いだけの札」になってしまう（実際に一度そうなった）。
 * 穂は丘の上へ大きくはみ出させ、明るい銀色で描く。
 */
function Susuki() {
  return (
    <g>
      <path d="M0 74 C14 58 46 58 60 74 V100 H0 Z" fill={HILL} />
      {[7, 17, 27, 37, 47, 55].map((x, i) => {
        const lean = i % 2 ? 1 : -1;
        const top = 30 + (i % 3) * 7;
        return (
          <g key={x}>
            <path
              d={`M${x} 94 C${x + lean * 9} 74 ${x + lean * 7} 56 ${x + lean * 3} ${top}`}
              stroke="#b9ad86"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M${x + lean * 3} ${top} c${lean * 5} -3 ${lean * 7} -7 ${lean * 7} -11`}
              stroke="#e4dcbe"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

function Chrysanthemum() {
  return (
    <g>
      <path d="M30 96 V52" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 72 C18 70 14 60 22 58 C28 57 30 66 30 72 Z" fill={LEAF} />
      <path d="M30 80 C42 78 46 68 38 66 C32 65 30 74 30 80 Z" fill={LEAF} />
      <g transform="translate(30 36)">
        {Array.from({ length: 14 }, (_, i) => (
          <ellipse key={i} cx="0" cy="-13" rx="3.6" ry="9" fill={i % 2 ? GOLD : GOLD_LIGHT} transform={`rotate(${(i * 360) / 14})`} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse key={`in${i}`} cx="0" cy="-6" rx="3" ry="5.4" fill="#f6e08e" transform={`rotate(${i * 45 + 22})`} />
        ))}
        <circle cx="0" cy="0" r="3.2" fill="#b07a15" />
      </g>
    </g>
  );
}

/** 紅葉の葉。20×20の枠に収まる形で描き、置き場所は呼び出し側で決める */
const MAPLE = 'M10 0 L12.6 6.4 L18.6 4.2 L15.2 10 L20 12.4 L13.6 13.2 L15.8 19.6 L10 15.6 L4.2 19.6 L6.4 13.2 L0 12.4 L4.8 10 L1.4 4.2 L7.4 6.4 Z';

function MapleLeaf({ x, y, s = 1, rotate = 0, fill = '#c62c2c' }: { x: number; y: number; s?: number; rotate?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s}) translate(-10 -10)`}>
      <path d={MAPLE} fill={fill} />
    </g>
  );
}

function Momiji() {
  return (
    <g>
      <path d="M10 96 C18 74 22 56 30 34" stroke={BROWN_DARK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M22 62 L46 56" stroke={BROWN_DARK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <MapleLeaf x={30} y={26} s={1.15} rotate={-12} />
      <MapleLeaf x={46} y={46} s={0.95} rotate={22} fill="#dd5a1f" />
      <MapleLeaf x={15} y={48} s={0.85} rotate={-30} fill="#e08a1e" />
      <MapleLeaf x={44} y={76} s={0.8} rotate={14} />
    </g>
  );
}

function Willow() {
  return (
    <g>
      <path d="M4 10 C20 6 40 8 56 14" stroke={BROWN_DARK} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      {[10, 20, 30, 40, 50].map((x, i) => (
        <g key={x}>
          <path
            d={`M${x} 12 C${x + (i % 2 ? 7 : -7)} 34 ${x + (i % 2 ? -5 : 5)} 58 ${x + (i % 2 ? 3 : -3)} 82`}
            stroke={LEAF}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {[26, 44, 62].map((y) => (
            <ellipse key={y} cx={x + (i % 2 ? 3 : -3)} cy={y} rx="3.4" ry="1.8" fill={LEAF_DARK} transform={`rotate(${i % 2 ? 30 : -30} ${x} ${y})`} />
          ))}
        </g>
      ))}
    </g>
  );
}

function Paulownia() {
  return (
    <g>
      <path d="M30 96 V56" stroke={BROWN_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 74 C12 72 6 56 18 52 C28 49 32 64 30 74 Z" fill={LEAF_DARK} />
      <path d="M30 82 C48 80 54 64 42 60 C32 57 28 72 30 82 Z" fill={LEAF} />
      {[
        [17, 26, 1],
        [31, 18, 1.15],
        [45, 28, 0.95],
      ].map(([x, y, k], i) => (
        <g key={i}>
          {[0, 1, 2].map((r) => (
            <ellipse
              key={r}
              cx={(x as number) + (r - 1) * 4.6 * (k as number)}
              cy={(y as number) + Math.abs(r - 1) * 3}
              rx={3.4 * (k as number)}
              ry={6.4 * (k as number)}
              fill={r === 1 ? PURPLE : PURPLE_DARK}
            />
          ))}
          <path d={`M${x} ${(y as number) + 8} v10`} stroke={LEAF_DARK} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

const MONTH_PLANT: Record<number, () => React.ReactElement> = {
  1: Pine,
  2: Plum,
  3: Sakura,
  4: Wisteria,
  5: Iris,
  6: Peony,
  7: BushClover,
  8: Susuki,
  9: Chrysanthemum,
  10: Momiji,
  11: Willow,
  12: Paulownia,
};

// ---------------------------------------------------------------- 主役（光・タネ）

/** 松に鶴。朝日と、赤い頭・黒い風切りの鶴 */
function Crane() {
  return (
    <g>
      <circle cx="41" cy="26" r="14" fill={RED_BRIGHT} opacity="0.9" />
      <g transform="translate(30 62)">
        <ellipse cx="0" cy="0" rx="15" ry="9" fill={WHITE} stroke={EDGE} strokeWidth="0.8" />
        <path d="M12 -2 C20 -4 24 2 20 8 L10 6 Z" fill={EDGE} />
        <path d="M-6 -6 C-10 -20 -4 -28 2 -28" stroke={WHITE} strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M-6 -6 C-10 -20 -4 -28 2 -28" stroke={EDGE} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" />
        <circle cx="3" cy="-29" r="4.6" fill={WHITE} stroke={EDGE} strokeWidth="0.8" />
        <path d="M1 -33 C3 -36 6 -35 6 -32 Z" fill={RED} />
        <path d="M7 -29 L13 -28 L7 -27 Z" fill={EDGE} />
        <path d="M-4 -2 C-10 -10 -18 -8 -14 -1 C-10 4 -4 3 -4 -2 Z" fill="#e7e2d2" />
        <path d="M-6 8 v6 M4 8 v6" stroke={EDGE} strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** 桜に幕。赤白の幔幕を上に張る */
function Curtain() {
  return (
    <g>
      <path d="M4 14 h52 v18 l-6.5 7 l-6.5 -7 l-6.5 7 l-6.5 -7 l-6.5 7 l-6.5 -7 l-6.5 7 l-6.5 -7 Z" fill={RED} stroke={EDGE} strokeWidth="1" />
      <path d="M4 20 h52 v5 h-52 Z" fill={WHITE} opacity="0.92" />
      <path d="M4 12 h52 v4 h-52 Z" fill={EDGE} opacity="0.75" />
    </g>
  );
}

/** 芒に月。大きな月を丘の上に */
function Moon() {
  return <circle cx="30" cy="30" r="16" fill="#e8a33a" stroke="#c98422" strokeWidth="1.2" />;
}

/** 柳に小野道風。傘・人影・雨 */
function RainMan() {
  return (
    <g>
      {[8, 16, 24, 44, 52].map((x, i) => (
        <path key={x} d={`M${x} ${6 + i * 3} l-3 22`} stroke="#7e93ab" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      ))}
      <g transform="translate(30 58)">
        <path d="M-16 -8 C-16 -22 16 -22 16 -8 Z" fill={EDGE} />
        <path d="M-16 -8 h32" stroke={BROWN} strokeWidth="1.6" />
        <path d="M0 -8 v10" stroke={BROWN} strokeWidth="1.8" />
        <path d="M-7 4 C-7 -2 7 -2 7 4 L9 26 H-9 Z" fill="#3c4a5c" />
        <circle cx="0" cy="0" r="4.4" fill="#e8d7b8" stroke={EDGE} strokeWidth="0.7" />
      </g>
      <path d="M0 92 C14 84 46 84 60 92 V100 H0 Z" fill="#7e93ab" opacity="0.5" />
    </g>
  );
}

/**
 * 桐に鳳凰。金の尾を長く引く霊鳥。
 *
 * 尾を3本に分けて右下へ流すのが要。丸い体だけだと家禽に見えてしまう
 * （最初はそう見えた）ので、体より長い尾を必ず出す。
 */
function Phoenix() {
  return (
    <g transform="translate(28 58)">
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M6 1 C${17 + i * 3} ${5 + i * 4} ${21 + i * 4} ${20 + i * 6} ${11 + i * 7} ${31 + i * 5}`}
          stroke={i % 2 ? GOLD : GOLD_LIGHT}
          strokeWidth="3.2"
          fill="none"
          strokeLinecap="round"
        />
      ))}
      <ellipse cx="0" cy="0" rx="11" ry="8" fill={GOLD} stroke="#b8860b" strokeWidth="0.8" />
      <path d="M-2 -3 C-10 -15 -20 -10 -14 -1 C-9 4 -2 2 -2 -3 Z" fill={GOLD_LIGHT} stroke="#b8860b" strokeWidth="0.7" />
      <path d="M-7 -5 C-11 -14 -9 -20 -6 -22" stroke={GOLD} strokeWidth="4.6" fill="none" strokeLinecap="round" />
      <circle cx="-5" cy="-24" r="4.6" fill={GOLD_LIGHT} stroke="#b8860b" strokeWidth="0.8" />
      <path d="M-7 -29 C-5 -34 -1 -33 -2 -28 Z" fill={RED} />
      <path d="M-1 -24 L5 -23 L-1 -21 Z" fill={RED} />
      <circle cx="-6" cy="-25" r="0.9" fill={EDGE} />
    </g>
  );
}

/** 菊に盃。朱塗りの盃 */
function SakeCup() {
  return (
    <g transform="translate(30 72)">
      <path d="M-14 -8 C-14 4 14 4 14 -8 Z" fill={RED} stroke={EDGE} strokeWidth="1" />
      <path d="M-14 -8 h28" stroke="#8f1c1c" strokeWidth="1.4" />
      <path d="M0 4 v5" stroke={RED} strokeWidth="3" />
      <path d="M-8 10 h16" stroke={RED} strokeWidth="3" strokeLinecap="round" />
      <text x="0" y="-1" fontSize="8" fill={GOLD_LIGHT} fontFamily={SERIF} textAnchor="middle">
        壽
      </text>
    </g>
  );
}

/** 菖蒲に八橋。渡された板橋 */
function Bridge() {
  return (
    <g>
      <path d="M2 78 L26 66 L34 72 L58 60" stroke="#8a4b2a" strokeWidth="6" fill="none" strokeLinejoin="round" />
      <path d="M2 78 L26 66 L34 72 L58 60" stroke="#c07a45" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
      <path d="M10 76 v10 M28 68 v10 M48 64 v10" stroke="#8a4b2a" strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

/** 牡丹に蝶。2羽の蝶 */
function Butterfly({ x, y, s = 1, rotate = 0 }: { x: number; y: number; s?: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`}>
      <path d="M0 0 C-12 -12 -16 -2 -8 4 C-4 6 -1 4 0 0 Z" fill={GOLD} stroke={EDGE} strokeWidth="0.7" />
      <path d="M0 0 C12 -12 16 -2 8 4 C4 6 1 4 0 0 Z" fill={GOLD} stroke={EDGE} strokeWidth="0.7" />
      <path d="M0 0 C-9 8 -4 12 0 7 Z" fill="#d98f1d" stroke={EDGE} strokeWidth="0.6" />
      <path d="M0 0 C9 8 4 12 0 7 Z" fill="#d98f1d" stroke={EDGE} strokeWidth="0.6" />
      <ellipse cx="0" cy="1" rx="1.4" ry="5" fill={EDGE} />
      <path d="M-1 -4 C-3 -8 -5 -9 -6 -9 M1 -4 C3 -8 5 -9 6 -9" stroke={EDGE} strokeWidth="0.7" fill="none" />
    </g>
  );
}

function Butterflies() {
  return (
    <g>
      <Butterfly x={17} y={70} s={1} rotate={-18} />
      <Butterfly x={43} y={56} s={0.85} rotate={22} />
    </g>
  );
}

/** 萩に猪 */
function Boar() {
  return (
    <g transform="translate(30 74)">
      <ellipse cx="0" cy="0" rx="18" ry="11" fill="#4a4a52" />
      <path d="M-14 -4 C-24 -8 -26 2 -18 6 Z" fill="#3b3b43" />
      <path d="M-22 3 L-27 3 L-23 6 Z" fill={WHITE} />
      <path d="M-16 -8 L-12 -14 L-8 -7 Z" fill="#3b3b43" />
      <circle cx="-15" cy="-3" r="1" fill={WHITE} />
      <path d="M-8 10 v7 M0 11 v6 M9 10 v7 M15 8 v7" stroke="#3b3b43" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 -6 C22 -10 24 -2 17 -1 Z" fill="#5a5a63" />
      <path d="M-6 -8 C0 -14 8 -12 12 -6" stroke="#6e6e78" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** 紅葉に鹿。首を巡らせた鹿 */
function Deer() {
  return (
    <g transform="translate(31 74)">
      <ellipse cx="0" cy="0" rx="17" ry="10" fill="#a9713c" />
      {[
        [-9, 8],
        [-2, 9],
        [7, 8],
        [13, 6],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} v9`} stroke="#8c5a2c" strokeWidth="2.8" strokeLinecap="round" />
      ))}
      <path d="M12 -6 C20 -12 24 -20 22 -24" stroke="#a9713c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <ellipse cx="23" cy="-26" rx="5.4" ry="4" fill="#bb8248" transform="rotate(-24 23 -26)" />
      <path d="M25 -30 C27 -37 31 -38 32 -36 M25 -30 C22 -36 19 -37 18 -35" stroke="#7a4a26" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M31 -36 l3 -3 M19 -35 l-3 -3" stroke="#7a4a26" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="24" cy="-27" r="0.9" fill={EDGE} />
      {[
        [-8, -3],
        [-1, -5],
        [5, -2],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#f0dcc0" />
      ))}
    </g>
  );
}

/** 柳のカス（雷）。稲妻と黒雲 */
function Thunder() {
  return (
    <g>
      <path d="M0 24 C10 12 24 12 32 22 C42 16 56 22 60 32 V0 H0 Z" fill="#3d3a44" opacity="0.85" />
      <path d="M34 26 L18 56 H30 L20 84 L44 48 H31 L42 26 Z" fill={GOLD} stroke="#a8761a" strokeWidth="1" />
    </g>
  );
}

// ---------------------------------------------------------------- 1枚ぶんの絵

/** その札だけの主役。無い札（カス）は null */
function Feature({ id }: { id: string }): React.ReactElement | null {
  switch (id) {
    case '1-1':
      return <Crane />;
    case '2-1':
      return <Bird x={38} y={62} s={1.05} body="#6e7f3a" wing="#4f5c26" />;
    case '3-1':
      return <Curtain />;
    case '4-1':
      return <Bird x={38} y={66} s={1} body="#3c4a5c" wing="#27313f" flip />;
    case '5-1':
      return <Bridge />;
    case '6-1':
      return <Butterflies />;
    case '7-1':
      return <Boar />;
    case '8-1':
      return <Moon />;
    case '8-2':
      return (
        <g>
          <circle cx="42" cy="24" r="11" fill={RED_BRIGHT} opacity="0.85" />
          <Bird x={18} y={30} s={0.72} body="#2f3a48" wing="#1e2733" />
          <Bird x={34} y={44} s={0.62} body="#2f3a48" wing="#1e2733" />
          <Bird x={16} y={54} s={0.55} body="#2f3a48" wing="#1e2733" />
        </g>
      );
    case '9-1':
      return <SakeCup />;
    case '10-1':
      return <Deer />;
    case '11-1':
      return <RainMan />;
    case '11-2':
      return <Bird x={34} y={62} s={1.05} body="#2b3440" wing="#c1272d" tail="fork" flip />;
    case '11-4':
      return <Thunder />;
    case '12-1':
      return <Phoenix />;
    default:
      return null;
  }
}

/** 右上の月数。伝統的な札には無いが、初めての人が月を見分けられるように出す */
function MonthBadge({ month }: { month: number }) {
  return (
    <g>
      <rect x="40" y="4" width="16" height="13" rx="3" fill={EDGE} opacity="0.82" />
      <text x="48" y="14" fontSize="9.5" fill={PAPER} fontFamily={SERIF} textAnchor="middle">
        {month}
      </text>
    </g>
  );
}

/**
 * 花札1枚の表面。
 *
 * @param id 札のID（`lib/hanafuda-cards.ts`）
 * @param showMonth 右上に月数を出すか
 */
export function HanafudaFace({ id, showMonth = true }: { id: string; showMonth?: boolean }) {
  const card = cardOf(id);
  const Plant = MONTH_PLANT[card.month];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x="0.75" y="0.75" width={W - 1.5} height={H - 1.5} rx="5" fill={PAPER} stroke={EDGE} strokeWidth="1.5" />
      {/* 草木は札の外にはみ出させないので、枠の内側で切り取る */}
      <clipPath id={`hf-clip-${id}`}>
        <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="4" />
      </clipPath>
      <g clipPath={`url(#hf-clip-${id})`}>
        <Plant />
        <Feature id={id} />
        {card.ribbon && <Tanzaku kind={card.ribbon} />}
        {showMonth && <MonthBadge month={card.month} />}
      </g>
    </svg>
  );
}

/** 裏面。無地の濃い赤に細い枠（本物の花札と同じ考え方） */
function BackSvg() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x="0.75" y="0.75" width={W - 1.5} height={H - 1.5} rx="5" fill="#7f1d1d" stroke={EDGE} strokeWidth="1.5" />
      <rect x="5" y="5" width={W - 10} height={H - 10} rx="3" fill="none" stroke="#fca5a5" strokeWidth="0.8" opacity="0.6" />
      <circle cx={W / 2} cy={H / 2} r="9" fill="none" stroke="#fca5a5" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/**
 * 操作できる札1枚。
 *
 * `onClick` を渡さないときは `<button disabled>` ではなく `<span>` で描く。
 * 場に並ぶ札の多くは「見せるだけ」で、押せない `<button>` が並ぶと
 * キーボードでの読み進みが長くなるため。
 */
export function HanafudaCardView({
  id,
  selected = false,
  highlight = false,
  dim = false,
  showMonth = true,
  onClick,
  title,
}: {
  id: string;
  selected?: boolean;
  highlight?: boolean;
  dim?: boolean;
  showMonth?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const className = [
    'hf-card',
    selected ? 'selected' : '',
    highlight ? 'target' : '',
    dim ? 'dim' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = cardLabel(id);
  if (!onClick) {
    return (
      <span className={className} role="img" aria-label={label} title={title ?? label}>
        <HanafudaFace id={id} showMonth={showMonth} />
      </span>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={title ?? label}>
      <HanafudaFace id={id} showMonth={showMonth} />
    </button>
  );
}

/** 裏向きの札（山札の見せ札） */
export function HanafudaBack() {
  return (
    <span className="hf-card back" role="img" aria-label="裏向きの札">
      <BackSvg />
    </span>
  );
}
