import { faceById } from '@/lib/mahjong-tiles';

/**
 * 牌の絵柄（SVG）。
 *
 * 仕様: docs/features/game-mahjong-solitaire.md
 *
 * **絵文字や画像ではなく自前のSVGで描く。** 絵文字は端末ごとに絵柄も色も変わり、
 * サイトの配色に馴染まない（app/GameIcon.tsx に同じ判断が書いてある）。
 * 麻雀牌の意匠そのものは伝統的なもので権利者がいないので、自分で描く分には問題がない。
 *
 * 42種を1つずつ手で描くと量が多いので、**規則で作れるものは規則で作る**。
 * 筒子は円の配置、索子は竹の配置をそれぞれ表で持ち、
 * 萬子・字牌・花牌・季節牌は文字を1〜2字置くだけにしている。
 *
 * 牌の地は明暗どちらのテーマでも象牙色のまま（本物の牌がそうなので、
 * ダークモードで牌を黒くすると麻雀牌に見えなくなる）。よって色は直に書く。
 */

/** 絵柄の描画領域。牌の縦横比（40:54）に合わせてある */
const W = 40;
const H = 54;

const INK = '#1f1a17';
const RED = '#b3261e';
const GREEN = '#1a6b3c';
const BLUE = '#1c4f9c';

/** 和文は明朝系のほうが牌らしく見える。無ければ serif に落ちる */
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

/** 単位（0〜1）の位置を描画領域の座標に直す。左右・上下に少し余白を残す */
function px(u: number): number {
  return 5 + u * (W - 10);
}
function py(u: number): number {
  return 6 + u * (H - 12);
}

/**
 * 筒子の円の並び。数ごとに位置（0〜1）と半径の倍率を持つ。
 * 1筒だけ大きな円1つ、3筒は斜め、7筒は上3つ＋下4つという伝統的な並びに寄せている。
 */
const PIN_SPOTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.24],
    [0.5, 0.76],
  ],
  3: [
    [0.2, 0.16],
    [0.5, 0.5],
    [0.8, 0.84],
  ],
  4: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  5: [
    [0.22, 0.2],
    [0.78, 0.2],
    [0.5, 0.5],
    [0.22, 0.8],
    [0.78, 0.8],
  ],
  6: [
    [0.26, 0.15],
    [0.74, 0.15],
    [0.26, 0.5],
    [0.74, 0.5],
    [0.26, 0.85],
    [0.74, 0.85],
  ],
  7: [
    [0.2, 0.12],
    [0.5, 0.12],
    [0.8, 0.12],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.85],
    [0.72, 0.85],
  ],
  8: [
    [0.28, 0.11],
    [0.72, 0.11],
    [0.28, 0.37],
    [0.72, 0.37],
    [0.28, 0.63],
    [0.72, 0.63],
    [0.28, 0.89],
    [0.72, 0.89],
  ],
  9: [
    [0.16, 0.13],
    [0.5, 0.13],
    [0.84, 0.13],
    [0.16, 0.5],
    [0.5, 0.5],
    [0.84, 0.5],
    [0.16, 0.87],
    [0.5, 0.87],
    [0.84, 0.87],
  ],
};

/** 円の大きさ。数が増えるほど小さくする */
function pinRadius(rank: number): number {
  if (rank === 1) return 11;
  if (rank === 2) return 8;
  if (rank <= 5) return 6;
  if (rank <= 7) return 5.2;
  return 4.6;
}

/** 筒子は青と赤を交互にすると、数を数えなくても見分けやすい */
function pinColor(rank: number, index: number): string {
  if (rank === 1) return BLUE;
  return index % 2 === 0 ? BLUE : GREEN;
}

/** 索子の竹の並び。筒子と同じく位置だけを持つ */
const SOU_SPOTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.26],
    [0.5, 0.74],
  ],
  3: [
    [0.5, 0.16],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
  4: [
    [0.28, 0.26],
    [0.72, 0.26],
    [0.28, 0.74],
    [0.72, 0.74],
  ],
  5: [
    [0.22, 0.2],
    [0.78, 0.2],
    [0.5, 0.5],
    [0.22, 0.8],
    [0.78, 0.8],
  ],
  6: [
    [0.18, 0.26],
    [0.5, 0.26],
    [0.82, 0.26],
    [0.18, 0.74],
    [0.5, 0.74],
    [0.82, 0.74],
  ],
  7: [
    [0.5, 0.12],
    [0.18, 0.5],
    [0.5, 0.5],
    [0.82, 0.5],
    [0.18, 0.86],
    [0.5, 0.86],
    [0.82, 0.86],
  ],
  8: [
    [0.14, 0.26],
    [0.38, 0.26],
    [0.62, 0.26],
    [0.86, 0.26],
    [0.14, 0.74],
    [0.38, 0.74],
    [0.62, 0.74],
    [0.86, 0.74],
  ],
  9: [
    [0.18, 0.14],
    [0.5, 0.14],
    [0.82, 0.14],
    [0.18, 0.5],
    [0.5, 0.5],
    [0.82, 0.5],
    [0.18, 0.86],
    [0.5, 0.86],
    [0.82, 0.86],
  ],
};

/** 竹1本の大きさ（幅・高さ）。本数が多いほど細く短く */
function souSize(rank: number): [number, number] {
  if (rank === 1) return [9, 26];
  if (rank <= 3) return [7, 16];
  if (rank <= 5) return [6, 13];
  if (rank <= 7) return [5.4, 11];
  return [4.6, 11];
}

/** 竹1本。節（横の線）を1本入れると竹らしくなる */
function Bamboo({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w / 2} fill={color} />
      <rect x={x - w / 2} y={y - h * 0.08} width={w} height={Math.max(1, h * 0.16)} fill="#ffffff" opacity={0.85} />
    </g>
  );
}

/** 中央に文字を1字。字牌・花牌・季節牌はこれだけで足りる */
function Glyph({ text, color, size = 26, y = H / 2 }: { text: string; color: string; size?: number; y?: number }) {
  return (
    <text
      x={W / 2}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={SERIF}
      fontSize={size}
      fontWeight={700}
      fill={color}
    >
      {text}
    </text>
  );
}

export default function TileFace({ id }: { id: string }) {
  const face = faceById(id);

  return (
    <svg
      className="mj-face"
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {face.suit === 'man' && (
        <>
          {/* 上に漢数字、下に「萬」。萬を赤にするのは本物の牌の配色 */}
          <Glyph text={'一二三四五六七八九'[(face.rank as number) - 1]} color={INK} size={21} y={17} />
          <Glyph text="萬" color={RED} size={20} y={38} />
        </>
      )}

      {face.suit === 'pin' &&
        PIN_SPOTS[face.rank as number].map(([ux, uy], i) => {
          const r = pinRadius(face.rank as number);
          const color = pinColor(face.rank as number, i);
          return (
            <g key={i}>
              <circle cx={px(ux)} cy={py(uy)} r={r} fill={color} />
              <circle cx={px(ux)} cy={py(uy)} r={r * 0.45} fill="#fdfbf5" />
            </g>
          );
        })}

      {face.suit === 'sou' &&
        SOU_SPOTS[face.rank as number].map(([ux, uy], i) => {
          const [w, h] = souSize(face.rank as number);
          // 5索は真ん中の1本だけ赤にするのが本物の配色
          const color = face.rank === 5 && i === 2 ? RED : GREEN;
          return <Bamboo key={i} x={px(ux)} y={py(uy)} w={w} h={h} color={color} />;
        })}

      {face.suit === 'wind' && <Glyph text={face.glyph as string} color={INK} size={28} />}

      {/* 白は文字が無く枠だけ。發は緑、中は赤 */}
      {face.id === 'dh' && (
        <rect
          x={9}
          y={11}
          width={W - 18}
          height={H - 22}
          rx={3}
          fill="none"
          stroke={BLUE}
          strokeWidth={2.4}
        />
      )}
      {face.id === 'dg' && <Glyph text="發" color={GREEN} size={26} />}
      {face.id === 'dc' && <Glyph text="中" color={RED} size={28} />}

      {/* 花牌は緑、季節牌は青。組の違いが色で分かるようにしている */}
      {face.suit === 'flower' && <Glyph text={face.glyph as string} color={GREEN} size={26} />}
      {face.suit === 'season' && <Glyph text={face.glyph as string} color={BLUE} size={26} />}
    </svg>
  );
}
