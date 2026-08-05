'use client';

import { isRed, RANK_LABEL, SUIT_SYMBOL, type Card } from '@/lib/cards';

/**
 * トランプ1枚の描画（ソリティア・スパイダー共通）。
 * 絵柄はUnicodeのスート記号と数字だけの自前デザイン。
 */
export function CardView({
  card,
  selected = false,
  onClick,
  style,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  if (!card.faceUp) {
    return (
      <button
        type="button"
        className="playing-card back"
        onClick={onClick}
        style={style}
        aria-label="裏向きの札"
      />
    );
  }
  const cls = ['playing-card', isRed(card.suit) ? 'red' : '', selected ? 'selected' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      style={style}
      aria-label={`${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`}
    >
      <span>
        {RANK_LABEL[card.rank]}
        {SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

/** 空きスロット（组札の空き・空列の表示） */
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
  return { marginTop: prevFaceUp ? '-112%' : '-130%' };
}
