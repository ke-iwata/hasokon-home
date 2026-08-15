/**
 * 花札48枚の定義（月・種別・名前）
 *
 * 仕様: docs/features/game-hanafuda-koikoi.md
 *
 * 花札のルールも伝統的な絵柄（松に鶴・芒に月など）もパブリックドメインで、
 * 権利者がいない。**特定メーカーの製品の絵柄は模写せず、絵は自前のSVGで
 * 描き起こす**（`app/_hanafuda/CardFace.tsx`）。名称も一般名称の
 * 「花札 こいこい」だけを使う（games/CLAUDE.md の名称の約束）。
 *
 * ## なぜ札のデータだけ別ファイルなのか
 *
 * 48枚の表は**ロジック（`lib/hanafuda.ts`）と絵（`app/_hanafuda/`）の両方**から
 * 参照される。ロジック側に置くと絵のコンポーネントがゲームの状態機械ごと
 * 読み込むことになるので、動かない事実だけをここに切り出してある。
 * 将来の花合わせ・八八に転用するときも、この表と絵だけを持っていけばよい
 * （仕様書の「札コンポーネントは転用可能に作る」）。
 *
 * ## 札のID
 *
 * `'{月}-{通し番号}'`（例: `'3-1'` は桜に幕）。**番号は種別の強い順**に
 * 振ってある（光→タネ→短冊→カス）ので、同じ月の中では ID の昇順が
 * そのまま「良い札の順」になる。取り札を並べるときにこれを使う。
 */

/** 札の種別 */
export type HanafudaKind = 'hikari' | 'tane' | 'tanzaku' | 'kasu';

/** 短冊の種類。赤短・青短の役はこれで判定する */
export type RibbonKind = 'aka' | 'ao' | 'plain';

export interface HanafudaCard {
  /** `'{月}-{通し番号}'` */
  id: string;
  /** 1〜12 */
  month: number;
  kind: HanafudaKind;
  /** 一般的な呼び名（読み上げ・取り札の説明に使う） */
  name: string;
  /** 短冊札だけが持つ。`aka` は詩の書かれた赤短、`ao` は青短、`plain` は無地の赤 */
  ribbon?: RibbonKind;
}

/** 月ごとの草木。表示にも読み上げにも使う */
export const MONTH_PLANTS: readonly string[] = [
  '',
  '松',
  '梅',
  '桜',
  '藤',
  '菖蒲',
  '牡丹',
  '萩',
  '芒',
  '菊',
  '紅葉',
  '柳',
  '桐',
];

/**
 * 48枚。12ヶ月 × 4枚で、内訳は 光5・タネ9・短冊10・カス24。
 * この内訳は `tests/hanafuda.test.ts` が数えて見張っている。
 */
export const HANAFUDA_DECK: readonly HanafudaCard[] = [
  // 1月 松
  { id: '1-1', month: 1, kind: 'hikari', name: '松に鶴' },
  { id: '1-2', month: 1, kind: 'tanzaku', name: '松に赤短', ribbon: 'aka' },
  { id: '1-3', month: 1, kind: 'kasu', name: '松のカス' },
  { id: '1-4', month: 1, kind: 'kasu', name: '松のカス' },
  // 2月 梅
  { id: '2-1', month: 2, kind: 'tane', name: '梅に鶯' },
  { id: '2-2', month: 2, kind: 'tanzaku', name: '梅に赤短', ribbon: 'aka' },
  { id: '2-3', month: 2, kind: 'kasu', name: '梅のカス' },
  { id: '2-4', month: 2, kind: 'kasu', name: '梅のカス' },
  // 3月 桜
  { id: '3-1', month: 3, kind: 'hikari', name: '桜に幕' },
  { id: '3-2', month: 3, kind: 'tanzaku', name: '桜に赤短', ribbon: 'aka' },
  { id: '3-3', month: 3, kind: 'kasu', name: '桜のカス' },
  { id: '3-4', month: 3, kind: 'kasu', name: '桜のカス' },
  // 4月 藤
  { id: '4-1', month: 4, kind: 'tane', name: '藤に不如帰' },
  { id: '4-2', month: 4, kind: 'tanzaku', name: '藤の短冊', ribbon: 'plain' },
  { id: '4-3', month: 4, kind: 'kasu', name: '藤のカス' },
  { id: '4-4', month: 4, kind: 'kasu', name: '藤のカス' },
  // 5月 菖蒲
  { id: '5-1', month: 5, kind: 'tane', name: '菖蒲に八橋' },
  { id: '5-2', month: 5, kind: 'tanzaku', name: '菖蒲の短冊', ribbon: 'plain' },
  { id: '5-3', month: 5, kind: 'kasu', name: '菖蒲のカス' },
  { id: '5-4', month: 5, kind: 'kasu', name: '菖蒲のカス' },
  // 6月 牡丹
  { id: '6-1', month: 6, kind: 'tane', name: '牡丹に蝶' },
  { id: '6-2', month: 6, kind: 'tanzaku', name: '牡丹に青短', ribbon: 'ao' },
  { id: '6-3', month: 6, kind: 'kasu', name: '牡丹のカス' },
  { id: '6-4', month: 6, kind: 'kasu', name: '牡丹のカス' },
  // 7月 萩
  { id: '7-1', month: 7, kind: 'tane', name: '萩に猪' },
  { id: '7-2', month: 7, kind: 'tanzaku', name: '萩の短冊', ribbon: 'plain' },
  { id: '7-3', month: 7, kind: 'kasu', name: '萩のカス' },
  { id: '7-4', month: 7, kind: 'kasu', name: '萩のカス' },
  // 8月 芒
  { id: '8-1', month: 8, kind: 'hikari', name: '芒に月' },
  { id: '8-2', month: 8, kind: 'tane', name: '芒に雁' },
  { id: '8-3', month: 8, kind: 'kasu', name: '芒のカス' },
  { id: '8-4', month: 8, kind: 'kasu', name: '芒のカス' },
  // 9月 菊
  { id: '9-1', month: 9, kind: 'tane', name: '菊に盃' },
  { id: '9-2', month: 9, kind: 'tanzaku', name: '菊に青短', ribbon: 'ao' },
  { id: '9-3', month: 9, kind: 'kasu', name: '菊のカス' },
  { id: '9-4', month: 9, kind: 'kasu', name: '菊のカス' },
  // 10月 紅葉
  { id: '10-1', month: 10, kind: 'tane', name: '紅葉に鹿' },
  { id: '10-2', month: 10, kind: 'tanzaku', name: '紅葉に青短', ribbon: 'ao' },
  { id: '10-3', month: 10, kind: 'kasu', name: '紅葉のカス' },
  { id: '10-4', month: 10, kind: 'kasu', name: '紅葉のカス' },
  // 11月 柳（雨）。光が「雨」なので四光の扱いが他と違う
  { id: '11-1', month: 11, kind: 'hikari', name: '柳に小野道風' },
  { id: '11-2', month: 11, kind: 'tane', name: '柳に燕' },
  { id: '11-3', month: 11, kind: 'tanzaku', name: '柳の短冊', ribbon: 'plain' },
  { id: '11-4', month: 11, kind: 'kasu', name: '柳のカス' },
  // 12月 桐。カスが3枚ある唯一の月
  { id: '12-1', month: 12, kind: 'hikari', name: '桐に鳳凰' },
  { id: '12-2', month: 12, kind: 'kasu', name: '桐のカス' },
  { id: '12-3', month: 12, kind: 'kasu', name: '桐のカス' },
  { id: '12-4', month: 12, kind: 'kasu', name: '桐のカス' },
];

/** IDから札を引く表 */
const BY_ID = new Map(HANAFUDA_DECK.map((card) => [card.id, card]));

/**
 * IDから札を引く。未知のIDは投げる。
 *
 * 局面は札そのものではなく**IDの配列**で持っている（構造的な同値比較が
 * そのまま使えて、テストが書きやすいため）。画面もロジックもここを通す。
 */
export function cardOf(id: string): HanafudaCard {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`花札に無いIDです: ${id}`);
  return card;
}

/** 複数まとめて引く */
export function cardsOf(ids: readonly string[]): HanafudaCard[] {
  return ids.map(cardOf);
}

/** 種別の表示名 */
export const KIND_LABELS: Record<HanafudaKind, string> = {
  hikari: '光',
  tane: 'タネ',
  tanzaku: '短冊',
  kasu: 'カス',
};

/** 取り札を並べる順（光→タネ→短冊→カス）。同じ種別の中は月の順 */
export const KIND_ORDER: Record<HanafudaKind, number> = {
  hikari: 0,
  tane: 1,
  tanzaku: 2,
  kasu: 3,
};

/**
 * 取り札の並べ替え。**種類別に自動整列する**（仕様書の初心者導線）。
 * 何を集めているのかが並びだけで分かるようにするのが目的。
 */
export function sortForDisplay(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const x = cardOf(a);
    const y = cardOf(b);
    if (KIND_ORDER[x.kind] !== KIND_ORDER[y.kind]) return KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
    if (x.month !== y.month) return x.month - y.month;
    return x.id.localeCompare(y.id);
  });
}

/** 手札を並べる順。月ごとにまとまっていれば合わせ札を探しやすい */
export function sortHand(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const x = cardOf(a);
    const y = cardOf(b);
    if (x.month !== y.month) return x.month - y.month;
    return KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
  });
}

/** 読み上げ・aria-label 用の表示名（「3月 桜に幕（光）」） */
export function cardLabel(id: string): string {
  const card = cardOf(id);
  return `${card.month}月 ${card.name}（${KIND_LABELS[card.kind]}）`;
}
