/**
 * チェスの駒の絵（6 種 × 2 色）。
 *
 * 仕様: docs/features/game-chess.md の着手条件 2。
 * **自作の SVG**：丸・台形・折れ線だけで組んだ簡単な形で、他サイト・オープンソースの駒のセットは写していない。
 * Unicode のチェス記号（♔〜♟）は使わない（端末で形と色が揃わない）。
 *
 * 形は 100×100 の箱に描く。呼ぶ側が `translate` と `scale(0.01)` で盤のマス（1×1）に置く。
 * 色は `app/globals.css` の `.ch-pc-w` / `.ch-pc-b` が持つ（ここに色を直書きしない）。
 */

import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from '@/lib/chess';

/** 台座（全駒共通） */
const BASE = 'M22 88 H78 V82 Q78 75 70 75 H30 Q22 75 22 82 Z';

function Shape({ kind }: { kind: number }) {
  switch (kind) {
    case PAWN:
      return (
        <>
          <path d="M35 75 L43 52 H57 L65 75 Z" />
          <ellipse cx="50" cy="52" rx="14" ry="4.5" />
          <circle cx="50" cy="37" r="12" />
        </>
      );
    case KNIGHT:
      return (
        <>
          <path d="M30 75 Q30 57 45 47 Q38 47 31 53 Q24 56 21 48 Q28 35 37 27 L37 15 L46 23 Q67 22 71 46 Q75 62 71 75 Z" />
          <circle className="ch-pc-detail-fill" cx="40" cy="33" r="2.6" />
        </>
      );
    case BISHOP:
      return (
        <>
          <path d="M36 75 L44 57 H56 L64 75 Z" />
          <path d="M50 17 Q71 37 60 57 H40 Q29 37 50 17 Z" />
          <circle cx="50" cy="13" r="5" />
          <path className="ch-pc-detail" d="M55 30 L46 43" />
        </>
      );
    case ROOK:
      return (
        <>
          <path d="M32 75 L35 41 H65 L68 75 Z" />
          <path d="M28 41 V21 H38 V29 H45 V21 H55 V29 H62 V21 H72 V41 Z" />
          <path className="ch-pc-detail" d="M36 48 H64" />
        </>
      );
    case QUEEN:
      return (
        <>
          <path d="M30 75 L24 34 L38 52 L37 27 L46 50 L50 22 L54 50 L63 27 L62 52 L76 34 L70 75 Z" />
          <circle cx="24" cy="30" r="4.5" />
          <circle cx="37" cy="23" r="4.5" />
          <circle cx="50" cy="18" r="4.5" />
          <circle cx="63" cy="23" r="4.5" />
          <circle cx="76" cy="30" r="4.5" />
          <path className="ch-pc-detail" d="M33 66 H67" />
        </>
      );
    case KING:
    default:
      return (
        <>
          <path d="M30 75 Q20 45 37 44 Q46 44 50 54 Q54 44 63 44 Q80 45 70 75 Z" />
          <path d="M46 10 H54 V19 H62 V27 H54 V46 H46 V27 H38 V19 H46 Z" />
          <path className="ch-pc-detail" d="M33 66 H67" />
        </>
      );
  }
}

/** 駒 1 つ。`piece` は符号つき（白が正） */
export function PieceShape({ piece }: { piece: number }) {
  return (
    <g className={`ch-pc ${piece > 0 ? 'ch-pc-w' : 'ch-pc-b'}`}>
      <path d={BASE} />
      <Shape kind={Math.abs(piece)} />
    </g>
  );
}

/** 盤の外で使う小さな駒（取った駒の列・本文の図） */
export function PieceIcon({ piece, size = 18, title }: { piece: number; size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <PieceShape piece={piece} />
    </svg>
  );
}

export const PIECE_NAME: Record<number, string> = {
  [PAWN]: 'ポーン',
  [KNIGHT]: 'ナイト',
  [BISHOP]: 'ビショップ',
  [ROOK]: 'ルーク',
  [QUEEN]: 'クイーン',
  [KING]: 'キング',
};
