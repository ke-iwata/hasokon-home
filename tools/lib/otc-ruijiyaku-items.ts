/**
 * OTC類似薬「特別の料金」の対象成分（77成分）
 *
 * 仕様: docs/features/otc-ruijiyaku-tokubetsu-futan.md
 *
 * **計算（`otc-ruijiyaku.ts`）から独立した純データにしてある。**
 * 将来この早見表だけを別ページに切り出せるよう、税率や負担割合の数値は持たない。
 *
 * ■ 出どころ（全件・一次情報から機械的に写した）
 * 厚生労働省 第213回 社会保障審議会医療保険部会（2026-08-27）資料1
 * https://www.mhlw.go.jp/content/12401000/001742888.pdf の4頁
 * 「別途の負担の対象となる医療用医薬品の成分一覧（77成分）」の表を、
 * pdf.js の `getTextContent()` でテキスト層から抽出して転記した（2026-09-21）。
 * **`name`（有効成分）と `use`（用途）は、この表の文字列そのまま**で、
 * 言い換えも要約もしていない。原典の但し書きは次のとおり。
 *
 * - 「OTC医薬品と成分・投与経路が同一で、一日最大用量が異ならない医療用医薬品を機械的に選定。」
 * - 「令和7年12月25日に医療保険部会で公表した成分一覧から、薬価収載される医薬品の入れ替え、
 *   OTC医薬品の販売状況を踏まえポリエンホスファチジルコリンを削除、ラメルテオンを追加している。」
 * - 「令和8年8月1日時点」
 *
 * ■ 成分が載っている＝必ず対象、ではない
 * 同じ成分でも、**OTC医薬品に無い効能効果で処方された場合は対象外**になる
 * （原典7〜8頁「医療用医薬品とＯＴＣ医薬品との効能・効果の違い」）。
 * 例：ヘパリン類似物質は、肥厚性瘢痕・ケロイドの治療と予防、皮脂欠乏症などでは対象、
 * 血栓性静脈炎・血行障害に基づく疼痛と炎症性疾患・筋性斜頸（乳児期）では対象外。
 * **この軸は成分名だけでは決まらない**ので、早見表は「対象になりうる成分の一覧」であって
 * 「対象と確定した処方の一覧」ではない、と画面で断ること。
 *
 * ■ 品目名（商品名）は載せない
 * 対象は「成分」で押さえる。品目名は先発品の商品名を含むうえ、
 * 薬価改定（2027年4月）で中身が動くので、成分名の早見表に留める。
 * **`keywords` にも商品名を入れない**（画面に出ないから良い、とすると
 * 冒頭のこの約束が形骸化する）。検索は有効成分名・原典の用途・日常の言い方で引く。
 *
 * 【データ更新箇所】告示・省令で成分一覧が差し替わったら `ITEMS` と
 * `TOTAL_PRODUCTS` / `TOTAL_AS_OF` / `ITEMS_CHECKED_AT` を直す。
 * 品目数は**必ず取得時点とセットで書く**（2025-12 の政府決定時は「約1,100品目」で、
 * いまの 1,042品目とは別の時点の数字）。
 */

/** 成分一覧を原典と突き合わせた日 'YYYY-MM-DD' */
export const ITEMS_CHECKED_AT = '2026-09-21';

/** 厚労省「成分ごとの対象品目一覧」の成分数 */
export const TOTAL_INGREDIENTS = 77;

/** 同・品目数 */
export const TOTAL_PRODUCTS = 1042;

/** 上の2つが「いつ時点」の数字か。品目数は時点とセットでしか意味を持たない */
export const TOTAL_AS_OF = '2026-08';

/** 表示用：「77成分・1,042品目」 */
export const TOTAL_LABEL = `${TOTAL_INGREDIENTS}成分・${TOTAL_PRODUCTS.toLocaleString('ja-JP')}品目`;

/** 画面で並べるまとまり。**原典の「用途」をこちらでまとめたもの**（用途の原文は `use`） */
export type ItemCategory =
  | 'itami'
  | 'allergy'
  | 'hifu'
  | 'steroid'
  | 'kansen'
  | 'icho'
  | 'nodo'
  | 'me'
  | 'kuchi'
  | 'sonota';

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  itami: '痛み・熱・かぜ',
  allergy: 'アレルギー・鼻',
  hifu: '皮膚（保湿・保護）',
  steroid: 'ステロイド',
  kansen: '消毒・水虫・感染',
  icho: '胃腸・便通',
  nodo: 'のど・たん',
  me: '目',
  kuchi: '口内炎',
  sonota: 'その他',
};

/** 並び順（画面の見出しの順）。検索が集まる痛み・皮膚を上に置く */
export const ITEM_CATEGORIES: ItemCategory[] = [
  'itami',
  'hifu',
  'allergy',
  'steroid',
  'icho',
  'kansen',
  'nodo',
  'me',
  'kuchi',
  'sonota',
];

/**
 * 令和10年度末（2029-03-31）までの経過措置が**名指ししている薬効分類**。
 *
 * 原典12頁は経過措置の対象を「鎮痛消炎剤」「皮膚保湿剤・皮膚保護剤・角化症治療剤」と
 * 薬効分類で書いている。成分一覧の「用途」の列とは粒度が違うので、
 * **文字列がそのまま一致するものだけ**をここに置く（推測で広げない）。
 *
 * **これは「この成分なら必ず対象外」という意味ではない。**
 * 経過措置は外用薬の長期使用の枠の中にあり、ジクロフェナクナトリウム・
 * ロキソプロフェンナトリウム水和物のように**内服と外用の両方がある成分**は、
 * 用途の列（「非ステロイド性抗炎症薬（NSAIDs）」など）からは外用かどうかが分からない。
 * 最終的な判定は利用者の入力（湿布・塗り薬か）に委ねること。
 */
export const TRANSITION_NAMED_USES: string[] = ['鎮痛消炎剤', '皮膚保護剤', '血行促進・皮膚保湿剤'];

export interface OtcItem {
  /** 原典の表の No（1〜77） */
  no: number;
  /** 有効成分。**原典の文字列そのまま** */
  name: string;
  /** 用途。**原典の文字列そのまま** */
  use: string;
  /** 画面のまとまり（こちらでまとめたもの） */
  category: ItemCategory;
  /** 検索用の言い換え。**商品名は入れない** */
  keywords: string[];
}

/** 成分の一覧（原典の表の全77件） */
export const ITEMS: OtcItem[] = [
  { no: 1, name: 'アシクロビル', use: '抗ウイルス薬', category: 'kansen', keywords: ['抗ウイルス薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 2, name: 'アシタザノラスト水和物', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 3, name: 'アスコルビン酸', use: 'ビタミン剤', category: 'sonota', keywords: ['ビタミン剤'] },
  { no: 4, name: 'アンモニア水', use: '鎮痛鎮痒収斂消炎剤', category: 'itami', keywords: ['鎮痛鎮痒収斂消炎剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 5, name: 'イソコナゾール硝酸塩', use: '抗真菌薬', category: 'kansen', keywords: ['抗真菌薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 6, name: 'イソプロパノール', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 7, name: 'イトプリド塩酸塩', use: '胃薬', category: 'icho', keywords: ['胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 8, name: 'イブプロフェン', use: '非ステロイド性抗炎症薬（NSAIDs）', category: 'itami', keywords: ['非ステロイド性抗炎症薬（NSAIDs）', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 9, name: 'イブプロフェンピコノール', use: '非ステロイド系消炎鎮痛剤', category: 'itami', keywords: ['非ステロイド系消炎鎮痛剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 10, name: 'インドメタシン', use: '鎮痛消炎剤', category: 'itami', keywords: ['鎮痛消炎剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 11, name: 'エタノール', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 12, name: 'エピナスチン塩酸塩', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 13, name: 'Ｌ－カルボシステイン', use: '去痰薬', category: 'nodo', keywords: ['去痰薬', 'たん', '去痰', 'せき', '咳'] },
  { no: 14, name: '塩酸テトラヒドロゾリン・プレドニゾロン', use: '点鼻用血管収縮剤', category: 'allergy', keywords: ['点鼻用血管収縮剤', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 15, name: 'オキシコナゾール硝酸塩', use: '抗真菌薬', category: 'kansen', keywords: ['抗真菌薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 16, name: 'オキシテトラサイクリン塩酸塩・ヒドロコルチゾン', use: '抗生物質・副腎皮質ホルモン配合剤', category: 'kansen', keywords: ['抗生物質・副腎皮質ホルモン配合剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 17, name: 'オキシドール', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 18, name: 'オリブ油', use: '皮膚保護剤', category: 'hifu', keywords: ['皮膚保護剤', '保湿', 'ほしつ', '乾燥肌', 'かんそうはだ', 'ひび', 'あかぎれ', '塗り薬'] },
  { no: 19, name: '希ヨードチンキ', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 20, name: 'クロトリマゾール', use: '抗真菌薬', category: 'kansen', keywords: ['抗真菌薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 21, name: 'クロラムフェニコール', use: '抗生物質', category: 'kansen', keywords: ['抗生物質', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 22, name: 'クロラムフェニコール・フラジオマイシン硫酸塩・プレドニゾロン', use: '抗生物質', category: 'kansen', keywords: ['抗生物質', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 23, name: 'クロルヘキシジングルコン酸塩', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 24, name: 'ケトチフェンフマル酸塩', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 25, name: 'サリチルアミド・アセトアミノフェン・無水カフェイン・プロメタジンメチレンジサリチル酸塩', use: '総合感冒剤', category: 'itami', keywords: ['総合感冒剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 26, name: 'サリチル酸', use: '寄生性皮膚疾患剤', category: 'hifu', keywords: ['寄生性皮膚疾患剤', '保湿', 'ほしつ', '乾燥肌', 'かんそうはだ', 'ひび', 'あかぎれ', '塗り薬'] },
  { no: 27, name: 'サリチル酸メチル・dl-カンフル・トウガラシエキス', use: '鎮痛消炎剤', category: 'itami', keywords: ['鎮痛消炎剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 28, name: 'サリチル酸メチル・l-メントール・dl-カンフル', use: '鎮痛消炎剤', category: 'itami', keywords: ['鎮痛消炎剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 29, name: 'サリチル酸メチル・l-メントール・dl-カンフル・グリチルレチン酸', use: '鎮痛消炎剤', category: 'itami', keywords: ['鎮痛消炎剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 30, name: '酸化マグネシウム', use: '制酸・緩下剤', category: 'icho', keywords: ['制酸・緩下剤', '胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 31, name: '酸化亜鉛', use: '収れん・消炎・保護剤', category: 'hifu', keywords: ['収れん・消炎・保護剤', '保湿', 'ほしつ', '乾燥肌', 'かんそうはだ', 'ひび', 'あかぎれ', '塗り薬'] },
  { no: 32, name: '次亜塩素酸ナトリウム', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 33, name: 'ジクロフェナクナトリウム', use: '非ステロイド性抗炎症薬（NSAIDs）', category: 'itami', keywords: ['非ステロイド性抗炎症薬（NSAIDs）', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 34, name: '消毒用エタノール', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 35, name: '静脈血管叢エキス', use: '痔治療薬', category: 'sonota', keywords: ['痔治療薬'] },
  { no: 36, name: '精製水', use: '溶解剤', category: 'sonota', keywords: ['溶解剤'] },
  { no: 37, name: '炭酸水素ナトリウム', use: '胃腸薬', category: 'icho', keywords: ['胃腸薬', '胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 38, name: '沈降炭酸カルシウム・コレカルシフェロール・炭酸マグネシウム', use: 'カルシウム配合剤', category: 'sonota', keywords: ['カルシウム配合剤'] },
  { no: 39, name: 'チンク油', use: '消炎薬', category: 'itami', keywords: ['消炎薬', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 40, name: 'デキサメタゾン', use: 'ステロイド', category: 'steroid', keywords: ['ステロイド', '塗り薬', '湿疹', 'しっしん', 'かゆみ'] },
  { no: 41, name: 'テルビナフィン塩酸塩', use: '抗真菌薬', category: 'kansen', keywords: ['抗真菌薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 42, name: 'トコフェロール酢酸エステル', use: 'ビタミン剤', category: 'sonota', keywords: ['ビタミン剤'] },
  { no: 43, name: 'トリアムシノロンアセトニド', use: '口内炎・舌炎薬', category: 'kuchi', keywords: ['口内炎・舌炎薬', '口内炎', 'こうないえん'] },
  { no: 44, name: '尿素', use: '皮膚軟化剤', category: 'hifu', keywords: ['皮膚軟化剤', '保湿', 'ほしつ', '乾燥肌', 'かんそうはだ', 'ひび', 'あかぎれ', '塗り薬'] },
  { no: 45, name: '白色ワセリン', use: '軟膏基剤', category: 'hifu', keywords: ['軟膏基剤', '保湿', 'ほしつ', '乾燥肌', 'かんそうはだ', 'ひび', 'あかぎれ', '塗り薬'] },
  { no: 46, name: 'ハチミツ', use: '矯味剤', category: 'sonota', keywords: ['矯味剤'] },
  { no: 47, name: 'ピコスルファートナトリウム水和物', use: '緩下剤', category: 'icho', keywords: ['緩下剤', '胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 48, name: 'ビサコジル', use: '便秘薬', category: 'icho', keywords: ['便秘薬', '胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 49, name: 'ビダラビン', use: '抗ウイルス薬', category: 'kansen', keywords: ['抗ウイルス薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 50, name: 'ヒドロコルチゾン酪酸エステル', use: 'ステロイド', category: 'steroid', keywords: ['ステロイド', '塗り薬', '湿疹', 'しっしん', 'かゆみ'] },
  { no: 51, name: 'フェキソフェナジン塩酸塩', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 52, name: 'フェキソフェナジン塩酸塩・塩酸プソイドエフェドリン', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 53, name: 'フェルビナク', use: '非ステロイド性抗炎症薬（NSAIDs）', category: 'itami', keywords: ['非ステロイド性抗炎症薬（NSAIDs）', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 54, name: 'ブテナフィン塩酸塩', use: '抗真菌薬', category: 'kansen', keywords: ['抗真菌薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 55, name: '複方ヨード・グリセリン', use: '口腔用殺菌消毒剤', category: 'kansen', keywords: ['口腔用殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 56, name: 'ブドウ酒', use: '滋養強壮薬', category: 'sonota', keywords: ['滋養強壮薬'] },
  { no: 57, name: 'フラボキサート塩酸塩', use: '頻尿・残尿感薬', category: 'sonota', keywords: ['頻尿・残尿感薬'] },
  { no: 58, name: 'フルチカゾンプロピオン酸エステル', use: 'ステロイド', category: 'steroid', keywords: ['ステロイド', '塗り薬', '湿疹', 'しっしん', 'かゆみ'] },
  { no: 59, name: 'プレドニゾロン吉草酸エステル酢酸エステル', use: 'ステロイド', category: 'steroid', keywords: ['ステロイド', '塗り薬', '湿疹', 'しっしん', 'かゆみ'] },
  { no: 60, name: 'ベタメタゾン吉草酸エステル', use: 'ステロイド', category: 'steroid', keywords: ['ステロイド', '塗り薬', '湿疹', 'しっしん', 'かゆみ'] },
  { no: 61, name: 'ベタメタゾン吉草酸エステル・フラジオマイシン硫酸塩', use: 'ステロイド', category: 'steroid', keywords: ['ステロイド', '塗り薬', '湿疹', 'しっしん', 'かゆみ'] },
  { no: 62, name: 'ヘパリン類似物質', use: '血行促進・皮膚保湿剤', category: 'hifu', keywords: ['血行促進・皮膚保湿剤', '保湿', 'ほしつ', '乾燥肌', 'かんそうはだ', 'ひび', 'あかぎれ', '塗り薬'] },
  { no: 63, name: 'ベポタスチンベシル酸塩', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 64, name: 'ペミロラストカリウム', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 65, name: 'ベルベリン塩化物水和物・ゲンノショウコエキス', use: '止瀉剤', category: 'icho', keywords: ['止瀉剤', '胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 66, name: 'ベンザルコニウム塩化物', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 67, name: 'ホウ砂', use: '眼科用剤', category: 'me', keywords: ['眼科用剤', '目薬', 'めぐすり', '洗眼'] },
  { no: 68, name: 'ホウ酸', use: '眼洗浄・消毒薬', category: 'me', keywords: ['眼洗浄・消毒薬', '目薬', 'めぐすり', '洗眼'] },
  { no: 69, name: 'ポビドンヨード', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 70, name: 'マルツエキス', use: '乳幼児用便秘薬', category: 'icho', keywords: ['乳幼児用便秘薬', '胃薬', 'いぐすり', '胃痛', '胸やけ', '便秘', 'べんぴ', '下痢', 'げり'] },
  { no: 71, name: 'ミコナゾール硝酸塩', use: '抗真菌薬', category: 'kansen', keywords: ['抗真菌薬', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 72, name: '無水エタノール', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 73, name: 'モメタゾンフランカルボン酸エステル水和物', use: 'アレルギー性鼻炎治療薬', category: 'allergy', keywords: ['アレルギー性鼻炎治療薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
  { no: 74, name: 'ヨウ素', use: '殺菌消毒剤', category: 'kansen', keywords: ['殺菌消毒剤', '消毒', 'しょうどく', '水虫', 'みずむし', 'うがい', '傷'] },
  { no: 75, name: 'ラメルテオン', use: '睡眠導入剤', category: 'sonota', keywords: ['睡眠導入剤'] },
  { no: 76, name: 'ロキソプロフェンナトリウム水和物', use: '解熱消炎鎮痛剤', category: 'itami', keywords: ['解熱消炎鎮痛剤', 'いたみどめ', '痛み止め', '解熱', '熱さまし', '湿布', 'しっぷ', '肩こり', '腰痛', 'かぜ', '風邪'] },
  { no: 77, name: 'ロラタジン', use: '抗アレルギー薬', category: 'allergy', keywords: ['抗アレルギー薬', '花粉症', 'かふんしょう', 'アレルギー', '鼻炎', 'びえん', '鼻みず'] },
];

/** 載せている成分の件数（原典の77件と一致すること。テストが見張る） */
export const ITEM_COUNT = ITEMS.length;

/**
 * その成分の「用途」が、経過措置の名指しする薬効分類と一致するか。
 * 一致しない＝経過措置に当たらない、ではない（上の `TRANSITION_NAMED_USES` の注を参照）。
 */
export function isTransitionNamed(item: OtcItem): boolean {
  return TRANSITION_NAMED_USES.includes(item.use);
}

/** 検索用に正規化する（全角空白・大文字小文字・前後の空白を吸収する） */
function normalize(text: string): string {
  return text.replace(/[\s　]+/g, '').toLowerCase();
}

/** 成分名・用途・言い換えでしぼり込む。空の検索語は全件を返す */
export function searchItems(query: string): OtcItem[] {
  const q = normalize(query);
  if (q === '') return ITEMS;
  return ITEMS.filter(
    (item) =>
      normalize(item.name).includes(q) ||
      normalize(item.use).includes(q) ||
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
