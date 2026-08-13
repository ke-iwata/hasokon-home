/**
 * 麻雀ソリティアで使う牌（絵柄）の定義
 *
 * 仕様: docs/features/game-mahjong-solitaire.md
 *
 * 牌は「数牌（萬子・筒子・索子 各9種）＋字牌（風牌4種・三元牌3種）」の34種を
 * 4枚ずつ＝136枚と、**花牌4種・季節牌4種を1枚ずつ＝8枚**の、合わせて144枚。
 * 亀（Turtle）レイアウトは144マスなので、この枚数でちょうど埋まる。
 *
 * 仕様書は本文で「136枚」と書いているが、同じ仕様書が
 * 「花牌（春夏秋冬）・季節牌は同じ組の中ならどれとでも合う」という伝統ルールと、
 * 「牌のSVG…花牌は4種」を同時に求めている。花牌・季節牌を入れずに136枚にすると
 * このルールが実装対象を失い、亀レイアウト（144マス）にも8マス足りない。
 * **34種×4枚＝136枚という不変条件はそのまま守り、花牌・季節牌8枚を足して144枚**
 * にするのがいちばん矛盾が少ないと判断した（tests/mahjong-solitaire.test.ts が
 * 両方を見張っている）。
 *
 * ※ このジャンルの日本での通称「上海」はサン電子（サンソフト）の登録商標なので、
 *   ゲーム名にもコードの識別子にも使わない。牌の意匠そのものは伝統的なもので
 *   権利者がいないため、自前のSVGで描く分には問題がない。
 */

export type TileSuit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower' | 'season';

export interface TileFace {
  /** 一意なID。盤面はこのIDの配列で持つ */
  id: string;
  suit: TileSuit;
  /**
   * 合わせ判定に使う組。
   * 通常の34種は id と同じ（＝まったく同じ絵柄どうしでしか合わない）。
   * 花牌・季節牌だけが 'flower' / 'season' を共有し、組の中ならどれとでも合う。
   */
  group: string;
  /** 読み上げ（aria-label）に使う名前 */
  name: string;
  /** 数牌の数（1〜9）。字牌・花牌・季節牌は持たない */
  rank?: number;
  /** 牌に描く文字。数牌は図形で描くので持たない（白は「枠だけ」なので空文字） */
  glyph?: string;
}

/** 通常牌の枚数。34種すべてこの枚数入る */
export const COPIES = 4;

/** 萬子の数を表す漢数字。牌に描く文字として使う */
const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

function numbered(prefix: string, suit: TileSuit, suffix: string): TileFace[] {
  return KANJI.map((kanji, i) => ({
    id: `${prefix}${i + 1}`,
    suit,
    group: `${prefix}${i + 1}`,
    name: `${kanji}${suffix}`,
    rank: i + 1,
  }));
}

/** 萬子（1〜9）。漢数字＋「萬」を書く */
export const MAN: TileFace[] = numbered('m', 'man', '萬');

/** 筒子（1〜9）。円をその数だけ並べる */
export const PIN: TileFace[] = numbered('p', 'pin', '筒');

/** 索子（1〜9）。竹をその数だけ並べる */
export const SOU: TileFace[] = numbered('s', 'sou', '索');

/** 風牌（東南西北） */
export const WINDS: TileFace[] = [
  { id: 'we', suit: 'wind', group: 'we', name: '東', glyph: '東' },
  { id: 'ws', suit: 'wind', group: 'ws', name: '南', glyph: '南' },
  { id: 'ww', suit: 'wind', group: 'ww', name: '西', glyph: '西' },
  { id: 'wn', suit: 'wind', group: 'wn', name: '北', glyph: '北' },
];

/**
 * 三元牌（白・發・中）。
 * 白は伝統的に「文字が無く枠だけ」なので glyph は空文字にしてある。
 */
export const DRAGONS: TileFace[] = [
  { id: 'dh', suit: 'dragon', group: 'dh', name: '白', glyph: '' },
  { id: 'dg', suit: 'dragon', group: 'dg', name: '發', glyph: '發' },
  { id: 'dc', suit: 'dragon', group: 'dc', name: '中', glyph: '中' },
];

/** 花牌（梅・蘭・菊・竹）。4枚すべて絵柄が違うが、組の中でならどれとでも合う */
export const FLOWERS: TileFace[] = [
  { id: 'f-plum', suit: 'flower', group: 'flower', name: '花牌・梅', glyph: '梅' },
  { id: 'f-orchid', suit: 'flower', group: 'flower', name: '花牌・蘭', glyph: '蘭' },
  { id: 'f-chrys', suit: 'flower', group: 'flower', name: '花牌・菊', glyph: '菊' },
  { id: 'f-bamboo', suit: 'flower', group: 'flower', name: '花牌・竹', glyph: '竹' },
];

/** 季節牌（春・夏・秋・冬）。花牌と同じ扱いだが、組は別なので花牌とは合わない */
export const SEASONS: TileFace[] = [
  { id: 'k-spring', suit: 'season', group: 'season', name: '季節牌・春', glyph: '春' },
  { id: 'k-summer', suit: 'season', group: 'season', name: '季節牌・夏', glyph: '夏' },
  { id: 'k-autumn', suit: 'season', group: 'season', name: '季節牌・秋', glyph: '秋' },
  { id: 'k-winter', suit: 'season', group: 'season', name: '季節牌・冬', glyph: '冬' },
];

/** 4枚ずつ入る34種（数牌27＋字牌7） */
export const STANDARD_FACES: TileFace[] = [...MAN, ...PIN, ...SOU, ...WINDS, ...DRAGONS];

/** 1枚ずつ入る8種（花牌4＋季節牌4） */
export const BONUS_FACES: TileFace[] = [...FLOWERS, ...SEASONS];

/** 絵柄の全種類（34＋8＝42種） */
export const TILE_FACES: TileFace[] = [...STANDARD_FACES, ...BONUS_FACES];

const BY_ID = new Map(TILE_FACES.map((f) => [f.id, f]));

/**
 * IDから絵柄を引く。
 * 知らないIDは投げる。盤面データが壊れたまま描画に進むと
 * 「絵の無い牌」が出て遊べなくなるため、そこで止める。
 */
export function faceById(id: string): TileFace {
  const face = BY_ID.get(id);
  if (!face) throw new Error(`知らない牌のIDです: ${id}`);
  return face;
}

/** 2枚が合うか。花牌・季節牌だけが「組の中ならどれとでも合う」 */
export function facesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return faceById(a).group === faceById(b).group;
}

/**
 * 場に出る144枚の絵柄ID。34種×4枚＋花牌4枚＋季節牌4枚。
 * 並びは固定（配る側でシャッフルする）。
 */
export const TILE_MULTISET: string[] = [
  ...STANDARD_FACES.flatMap((f) => Array<string>(COPIES).fill(f.id)),
  ...BONUS_FACES.map((f) => f.id),
];

/** 牌の総数（＝亀レイアウトのマス数） */
export const TILE_COUNT = TILE_MULTISET.length;
