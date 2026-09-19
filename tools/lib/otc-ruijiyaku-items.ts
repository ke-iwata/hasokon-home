/**
 * OTC類似薬「特別の料金」の対象成分 早見表のデータ
 *
 * 仕様: docs/features/otc-ruijiyaku-tokubetsu-futan.md
 *
 * **計算（`otc-ruijiyaku.ts`）から独立した純データにしてある。**
 * 将来この早見表だけを別ページに切り出せるよう、税率や負担割合の数値は持たない。
 *
 * ■ いまは「全部」ではない（ここが一番の注意点）
 * 厚生労働省の対象品目一覧は **77成分・1,042品目**（2026年8月時点）だが、
 * 公表されているPDFは画像埋め込みでテキストを取り出せず、成分名の全件を
 * 一次情報から写せていない。そこで**中間とりまとめとその報道で成分名が
 * はっきり確認できたものだけ**を載せ、`ITEMS_ARE_PARTIAL` を立てている。
 * UIは「全77成分のうち◯成分を載せています」と必ず断ること
 * （`tests/otc-ruijiyaku.test.ts` が、件数を77と偽らないことを見張っている）。
 *
 * 告示と対象品目一覧の機械可読版が出たら、`ITEMS` を全件に差し替えて
 * `ITEMS_ARE_PARTIAL` を false にする。
 *
 * ■ 品目名（商品名）は載せない
 * 対象は「成分」で押さえる。品目名は先発品の商品名を含むうえ、
 * 薬価改定（2027年4月）で中身が動くので、成分名の早見表に留める。
 *
 * 【データ更新箇所】`ITEMS` / `TOTAL_INGREDIENTS` / `TOTAL_PRODUCTS` / `TOTAL_AS_OF`。
 * 品目数は**必ず取得時点とセットで書く**（2025-12 の政府決定時は「約1,100品目」で、
 * いまの 1,042品目とは別の時点の数字）。
 */

/** 成分名を突き合わせた日 'YYYY-MM-DD' */
export const ITEMS_CHECKED_AT = '2026-09-19';

/** 厚労省「成分ごとの対象品目一覧」の成分数 */
export const TOTAL_INGREDIENTS = 77;

/** 同・品目数 */
export const TOTAL_PRODUCTS = 1042;

/** 上の2つが「いつ時点」の数字か。品目数は時点とセットでしか意味を持たない */
export const TOTAL_AS_OF = '2026-08';

/** 表示用：「77成分・1,042品目（2026年8月時点）」 */
export const TOTAL_LABEL = `${TOTAL_INGREDIENTS}成分・${TOTAL_PRODUCTS.toLocaleString('ja-JP')}品目`;

/**
 * `ITEMS` が対象成分の全件かどうか。
 * **true のあいだ、UIは「全部です」と読める書き方をしてはいけない。**
 */
export const ITEMS_ARE_PARTIAL = true;

/** 画面で並べるまとまり（薬の種類） */
export type ItemCategory =
  | 'genetsu'
  | 'shippu'
  | 'allergy'
  | 'hoshitsu'
  | 'steroid'
  | 'shinkin'
  | 'igusuri'
  | 'benpi'
  | 'kyotan';

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  genetsu: '解熱鎮痛（飲み薬）',
  shippu: '湿布・塗り薬（外用鎮痛消炎剤）',
  allergy: '抗アレルギー（飲み薬）',
  hoshitsu: '皮膚の保湿剤',
  steroid: 'ステロイドの塗り薬',
  shinkin: '水虫などの抗真菌薬',
  igusuri: '胃薬',
  benpi: '便秘薬',
  kyotan: '去痰薬・せき止め',
};

/** 並び順（画面の見出しの順）。検索が集まる経過措置の2つを上に置く */
export const ITEM_CATEGORIES: ItemCategory[] = [
  'shippu',
  'hoshitsu',
  'genetsu',
  'allergy',
  'steroid',
  'shinkin',
  'igusuri',
  'benpi',
  'kyotan',
];

/**
 * 経過措置（令和10年度末＝2029年3月末まで対象外）に当たるまとまり。
 *
 * 湿布（外用鎮痛消炎剤）と皮膚保湿剤。**もっとも検索されるのがこの2つ**で、
 * 「湿布も1.5倍」と書く解説が多いため、ここを取り違えないこと。
 */
export const TRANSITION_CATEGORIES: ItemCategory[] = ['shippu', 'hoshitsu'];

/** そのまとまりが経過措置に当たるか */
export function isTransitionCategory(category: ItemCategory): boolean {
  return TRANSITION_CATEGORIES.includes(category);
}

export interface OtcItem {
  id: string;
  /** 成分名（一般名）。商品名は載せない */
  name: string;
  /** 検索用の言い換え（ひらがな・カタカナ・日常の言い方） */
  keywords: string[];
  category: ItemCategory;
  /**
   * 経過措置で2029年3月末まで対象外か。
   * `category` から決まるが、**画面が読む値をデータ側に持たせてある**
   * （テストが `TRANSITION_CATEGORIES` との食い違いを落とす）。
   */
  transition: boolean;
  /** 市販薬でいうとどれか。商品名は出さず、売り場の言い方で書く */
  otcNote?: string;
}

/**
 * 成分の一覧（**全77成分のうち、一次情報・報道で名前が確認できた分**）。
 *
 * ここに無い成分が対象外とは限らない。UIは必ずそう断ること。
 */
export const ITEMS: OtcItem[] = [
  /* --- 湿布・外用鎮痛消炎剤（経過措置：2029年3月末まで対象外） --- */
  {
    id: 'diclofenac-external',
    name: 'ジクロフェナクナトリウム（外用）',
    keywords: ['じくろふぇなく', 'ジクロフェナク', '湿布', 'しっぷ', 'テープ', 'ゲル'],
    category: 'shippu',
    transition: true,
    otcNote: '市販の鎮痛消炎テープ・ゲルに同じ成分があります。',
  },
  {
    id: 'felbinac',
    name: 'フェルビナク（外用）',
    keywords: ['ふぇるびなく', 'フェルビナク', '湿布', 'しっぷ', 'パップ'],
    category: 'shippu',
    transition: true,
    otcNote: '市販の鎮痛消炎パップ剤に同じ成分があります。',
  },
  {
    id: 'indometacin-external',
    name: 'インドメタシン（外用）',
    keywords: ['いんどめたしん', 'インドメタシン', '湿布', 'しっぷ', '塗り薬'],
    category: 'shippu',
    transition: true,
    otcNote: '市販の鎮痛消炎テープ・クリームに同じ成分があります。',
  },

  /* --- 皮膚の保湿剤（経過措置：2029年3月末まで対象外） --- */
  {
    id: 'heparinoid',
    name: 'ヘパリン類似物質',
    keywords: ['へぱりん', 'ヘパリン類似物質', '保湿', 'ほしつ', '乾燥肌', 'ローション', 'クリーム'],
    category: 'hoshitsu',
    transition: true,
    otcNote: '市販の保湿ローション・クリームに同じ成分があります。',
  },
  {
    id: 'urea',
    name: '尿素',
    keywords: ['にょうそ', '尿素', '保湿', 'ほしつ', 'かかと', '乾燥'],
    category: 'hoshitsu',
    transition: true,
    otcNote: '市販の尿素配合クリームに同じ成分があります。',
  },
  {
    id: 'white-petrolatum',
    name: '白色ワセリン',
    keywords: ['わせりん', 'ワセリン', '白色ワセリン', '保湿', 'ほしつ'],
    category: 'hoshitsu',
    transition: true,
    otcNote: '市販のワセリンと同じ成分です。',
  },

  /* --- 解熱鎮痛（飲み薬） --- */
  {
    id: 'loxoprofen',
    name: 'ロキソプロフェンナトリウム（内服）',
    keywords: ['ろきそぷろふぇん', 'ロキソプロフェン', 'ロキソニン', '痛み止め', '解熱', '頭痛'],
    category: 'genetsu',
    transition: false,
    otcNote: '市販の解熱鎮痛薬に同じ成分があります。',
  },
  {
    id: 'ibuprofen',
    name: 'イブプロフェン（内服）',
    keywords: ['いぶぷろふぇん', 'イブプロフェン', '痛み止め', '解熱', '生理痛'],
    category: 'genetsu',
    transition: false,
    otcNote: '市販の解熱鎮痛薬に同じ成分があります。',
  },

  /* --- 抗アレルギー（飲み薬） --- */
  {
    id: 'fexofenadine',
    name: 'フェキソフェナジン塩酸塩',
    keywords: ['ふぇきそふぇなじん', 'フェキソフェナジン', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎'],
    category: 'allergy',
    transition: false,
    otcNote: '市販のアレルギー用鼻炎薬に同じ成分があります。',
  },
  {
    id: 'loratadine',
    name: 'ロラタジン',
    keywords: ['ろらたじん', 'ロラタジン', '花粉症', 'アレルギー', '鼻炎'],
    category: 'allergy',
    transition: false,
    otcNote: '市販のアレルギー用鼻炎薬に同じ成分があります。',
  },
  {
    id: 'epinastine',
    name: 'エピナスチン塩酸塩',
    keywords: ['えぴなすちん', 'エピナスチン', '花粉症', 'アレルギー', '鼻炎'],
    category: 'allergy',
    transition: false,
    otcNote: '市販のアレルギー用鼻炎薬に同じ成分があります。',
  },

  /* --- 便秘薬 --- */
  {
    id: 'magnesium-oxide',
    name: '酸化マグネシウム',
    keywords: ['さんかまぐねしうむ', '酸化マグネシウム', 'マグミット', '便秘', 'べんぴ', '下剤'],
    category: 'benpi',
    transition: false,
    otcNote: '市販の便秘薬に同じ成分があります。',
  },

  /* --- 去痰薬 --- */
  {
    id: 'carbocisteine',
    name: 'L-カルボシステイン',
    keywords: ['かるぼしすていん', 'カルボシステイン', 'ムコダイン', 'たん', '去痰', 'せき'],
    category: 'kyotan',
    transition: false,
    otcNote: '市販のせき・たんの薬に同じ成分があります。',
  },
];

/** 載せている成分の件数（**77ではない**。`ITEMS_ARE_PARTIAL` を参照） */
export const ITEM_COUNT = ITEMS.length;

/**
 * 一覧に名前を出せていないまとまり。
 *
 * 中間とりまとめは種類としては挙げているが、成分名を一次情報から写せていないもの。
 * UIでは「種類としては対象だが、成分名は告示の公表後に載せる」と出す。
 */
export const CATEGORIES_WITHOUT_ITEMS: ItemCategory[] = ITEM_CATEGORIES.filter(
  (c) => !ITEMS.some((item) => item.category === c),
);

/** 検索用に正規化する（全角空白・大文字小文字・前後の空白を吸収する） */
function normalize(text: string): string {
  return text.replace(/[\s　]+/g, '').toLowerCase();
}

/** 成分名・言い換えでしぼり込む。空の検索語は全件を返す */
export function searchItems(query: string): OtcItem[] {
  const q = normalize(query);
  if (q === '') return ITEMS;
  return ITEMS.filter(
    (item) =>
      normalize(item.name).includes(q) ||
      item.keywords.some((k) => normalize(k).includes(q)),
  );
}

export interface ItemGroup {
  category: ItemCategory;
  items: OtcItem[];
}

/** 画面の並び順でまとまりごとに分ける。空のまとまりは返さない */
export function itemGroups(items: OtcItem[] = ITEMS): ItemGroup[] {
  return ITEM_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}
