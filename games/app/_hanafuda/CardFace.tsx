'use client';

/**
 * 花札48枚の絵柄。
 *
 * 仕様: docs/features/game-hanafuda-koikoi.md
 *
 * ## 絵柄の出どころ（権利）
 *
 * `public/hanafuda/{id}.webp` の48枚＋裏面は、Louie Mantia 氏が伝統的な意匠を
 * 描き起こして **CC BY-SA 4.0** で公開しているセット（Wikimedia Commons の
 * 「SVG Hanafuda with green plants」）を、配信用に縮小（250px幅・WebP化）
 * したもの。絵柄そのものには手を入れていない。
 *
 * - 出典: https://commons.wikimedia.org/wiki/Category:SVG_Hanafuda_with_green_plants
 * - 作者: Louie Mantia — https://commons.wikimedia.org/wiki/User:Louiemantia
 * - ライセンス: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/deed.ja
 *
 * **帰属表示（クレジット）はゲームページ（app/hanafuda-koikoi/page.tsx）に
 * 出している。画像を差し替えるときは、クレジットも一緒に更新すること。**
 * 絵柄に手を入れない（改変すると改変版にも同ライセンスでの公開義務が生じる。
 * 縮小・形式変換は改変にあたらない。月数のバッジは画像をいじらず、
 * HTMLのオーバーレイで重ねている）。
 *
 * 当初は自前のフラットデザインSVGで48枚を描き起こしたが（git履歴にある）、
 * 見た目の質で置き換えた。ライセンスの義務（帰属表示・継承）は上記の通り
 * 明確で、Wikipedia の本文と同じ標準的なフリーライセンス。
 *
 * ## 将来の転用
 *
 * 花合わせ・八八に持っていけるよう、ここはゲームの状態を一切知らない。
 * 受け取るのは札のID（`lib/hanafuda-cards.ts`）だけ。
 */

import { cardLabel, cardOf } from '@/lib/hanafuda-cards';

/** basePath（/games）は `<img>` には自動で付かないので、自分で書く */
const CARD_DIR = '/games/hanafuda';

/** 右上の月数。伝統的な札には無いが、初めての人が月を見分けられるように出す */
function MonthBadge({ month }: { month: number }) {
  return (
    <span className="hf-month" aria-hidden>
      {month}
    </span>
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
  return (
    <>
      {/* alt は空でよい。読み上げ用の名前は外側の HanafudaCardView が持つ */}
      <img src={`${CARD_DIR}/${id}.webp`} alt="" draggable={false} />
      {showMonth && <MonthBadge month={card.month} />}
    </>
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
      <img src={`${CARD_DIR}/back.webp`} alt="" draggable={false} />
    </span>
  );
}
