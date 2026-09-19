/**
 * 軽減税率チェッカーの判定データ（これは 8% か 10% か）
 *
 * 仕様: docs/features/shohizei-keisan-shokuryohin-1percent.md
 *
 * **A（税込⇔税抜）・C（1%の軽減額）から独立した純データにしてある。**
 * 将来この判定だけを別ページに切り出せるよう、`shohizei.ts` を import しない
 * （税率の数値を持たず、`ItemRate` という区分だけを持つ）。
 *
 * 【データ更新箇所】
 * 出典は国税庁「消費税の軽減税率制度に関するQ&A（個別事例編）」
 * https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/qa_03.htm
 * （**令和8年4月改訂版**。2026-09-18 に一括ダウンロードPDFの目次・本文と
 * 1件ずつ突き合わせて `qa` の番号と結論を確認した）。
 * Q&A が改訂されると設問番号がずれることがあるので、改訂のたびに
 * `QA_REVISION` を直し、番号を突き合わせ直すこと。
 *
 * **判定を断言しない。** ここに無い品目は「国税庁のQ&Aで確認してください」へ
 * 誘導する（個別事例の最終的な判断は税務署が行う）。
 */

/** 突き合わせた Q&A の改訂版 */
export const QA_REVISION = '令和8年4月改訂';

/** 突き合わせた日 */
export const ITEMS_CHECKED_AT = '2026-09-18';

/**
 * 適用される税率の区分。
 *
 * `'non-taxable'` は非課税（消費税がかからない）で、10%とは別物。
 * `'depends'` は「意思確認・設備の有無などで分かれる」もので、
 * どちらか一方に丸めると嘘になるため独立した区分にしてある。
 */
export type ItemRate = 'reduced' | 'standard' | 'non-taxable' | 'depends';

export const ITEM_RATE_LABEL: Record<ItemRate, string> = {
  reduced: '8%',
  standard: '10%',
  'non-taxable': '非課税',
  depends: '場合による',
};

/** 画面で種類ごとに並べるためのまとまり */
export type ItemCategory = 'sake' | 'gaishoku' | 'drink' | 'other';

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  sake: '酒類・調味料',
  gaishoku: '外食・持ち帰り',
  drink: '飲料',
  other: 'その他の食品・新聞',
};

/** 並び順（画面の見出しの順） */
export const ITEM_CATEGORIES: ItemCategory[] = ['gaishoku', 'sake', 'drink', 'other'];

/**
 * 8% の根拠が「飲食料品」なのか「新聞」なのか。
 *
 * **2027年4月の1%の当たり方がここで分かれる。** 報道では定期購読の新聞は
 * 8%のままとされているが、法案の条文で確認するまで表に書かない
 * （`rate2027For()` が `'newspaper-unconfirmed'` を返す）。
 */
export type ItemScope = 'food' | 'newspaper';

export interface ShohizeiItem {
  id: string;
  /** 日常の言い方での品目・場面 */
  label: string;
  /** 検索用のキーワード（ひらがな・カタカナ・言い換えを含める） */
  keywords: string[];
  category: ItemCategory;
  rate: ItemRate;
  /** そうなる理由。1〜2文で */
  reason: string;
  /** 国税庁 Q&A（個別事例編）の設問番号。**全件必須**（テストが空を落とす） */
  qa: number;
  scope: ItemScope;
  /** 例外・注意点 */
  note?: string;
}

export const ITEMS: ShohizeiItem[] = [
  /* ---------------- 外食・持ち帰り ---------------- */
  {
    id: 'restaurant',
    label: 'レストラン・食堂の席で食べる',
    keywords: ['レストラン', 'れすとらん', '外食', 'がいしょく', '店内', '飲食店', '食堂'],
    category: 'gaishoku',
    rate: 'standard',
    reason: '飲食設備のある場所で飲食させる「食事の提供」は外食にあたり、軽減税率の対象外。',
    qa: 58,
    scope: 'food',
  },
  {
    id: 'takeout',
    label: '同じ店で持ち帰る（テイクアウト）',
    keywords: ['テイクアウト', 'ていくあうと', '持ち帰り', 'もちかえり', 'お持ち帰り'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '持ち帰り用の容器に入れ、または包装して渡すものは「飲食料品の譲渡」になる。',
    qa: 58,
    scope: 'food',
    note: '店内で食べるか持ち帰るかは、注文した時点での意思確認などで判定する。',
  },
  {
    id: 'combini-eatin',
    label: 'コンビニのイートインで食べる',
    keywords: ['コンビニ', 'こんびに', 'イートイン', 'いーといん', 'ホットスナック'],
    category: 'gaishoku',
    rate: 'standard',
    reason: 'イートインスペースで飲食させる「食事の提供」になるため対象外。',
    qa: 52,
    scope: 'food',
  },
  {
    id: 'combini-takeout',
    label: 'コンビニで買って持ち帰る',
    keywords: ['コンビニ', 'こんびに', '弁当', 'べんとう', 'おにぎり', '持ち帰り'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '持ち帰りの飲食料品の販売なので軽減税率の対象。',
    qa: 52,
    scope: 'food',
    note: '「イートインコーナーを利用する場合はお申し出ください」の掲示など、営業の実態に応じた意思確認でよいとされている。',
  },
  {
    id: 'eatin-ishikakunin',
    label: '買ったあとに気が変わってイートインで食べた',
    keywords: ['意思確認', 'いしかくにん', '気が変わった', '申し出', 'イートイン'],
    category: 'gaishoku',
    rate: 'depends',
    reason: '税率は提供した時点で判定する。購入時の意思確認の結果で決まり、あとから変わらない。',
    qa: 55,
    scope: 'food',
    note: '店側に申し出る仕組みになっている場合、申し出れば10%になる。',
  },
  {
    id: 'leftover-takeout',
    label: '飲食店で食べ残しを折り詰めにして持ち帰る',
    keywords: ['食べ残し', 'たべのこし', '折り詰め', '持ち帰り', 'ドギーバッグ'],
    category: 'gaishoku',
    rate: 'standard',
    reason:
      'その場で食べるために出された時点で「食事の提供」になっているため、あとで持ち帰っても8%にはならない。',
    qa: 59,
    scope: 'food',
  },
  {
    id: 'set-partial',
    label: 'セット商品のドリンクだけ店内で飲む',
    keywords: ['セット', 'せっと', 'ハンバーガー', 'ドリンク', '一部'],
    category: 'gaishoku',
    rate: 'standard',
    reason: '一の商品であるセットの一部を店内で飲食させるので、セット全体が「食事の提供」になる。',
    qa: 60,
    scope: 'food',
  },
  {
    id: 'kaiten-sushi-pack',
    label: '回転寿司で持ち帰り用に注文してパック詰めにする',
    keywords: ['回転寿司', 'かいてんずし', '寿司', 'すし', 'パック詰め', '持ち帰り'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: 'はじめから持ち帰り用として注文しパック詰めで売るものは「飲食料品の譲渡」。',
    qa: 61,
    scope: 'food',
    note: '店内で食べる寿司と区別せずに出されたものを、あとでパック詰めして持ち帰る場合は10%。',
  },
  {
    id: 'food-court',
    label: 'ショッピングセンターのフードコートで食べる',
    keywords: ['フードコート', 'ふーどこーと', 'ショッピングセンター', 'モール'],
    category: 'gaishoku',
    rate: 'standard',
    reason: '設備がテナントの持ち物でなくても、合意に基づいて客に使わせているなら飲食設備にあたる。',
    qa: 65,
    scope: 'food',
  },
  {
    id: 'park-bench',
    label: '移動販売車で買って公園のベンチで食べる',
    keywords: ['移動販売', 'キッチンカー', '公園', 'こうえん', 'ベンチ', '屋外'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '誰でも使える公園のベンチは飲食設備にあたらないので「飲食料品の譲渡」。',
    qa: 66,
    scope: 'food',
    note: '公園の管理者との合意でその販売店の客に使わせているベンチなら、飲食設備にあたり10%になる。',
  },
  {
    id: 'rishoku',
    label: 'カウンターだけの立ち食い・立ち飲みの店',
    keywords: ['立食', 'りっしょく', '立ち食い', '立ち飲み', 'カウンター', '椅子がない'],
    category: 'gaishoku',
    rate: 'standard',
    reason: 'カウンターだけでも飲食に使われる設備なら「飲食設備」にあたる。椅子の有無は関係ない。',
    qa: 64,
    scope: 'food',
  },
  {
    id: 'yatai',
    label: '屋台のおでん・ラーメン、フードイベント',
    keywords: ['屋台', 'やたい', 'おでん', 'ラーメン', 'フードイベント', '祭り'],
    category: 'gaishoku',
    rate: 'depends',
    reason:
      'テーブル・椅子・カウンターなどで飲食させていれば10%。飲食設備がまったく無ければ8%。',
    qa: 51,
    scope: 'food',
  },
  {
    id: 'demae',
    label: 'そばの出前・宅配ピザ',
    keywords: ['出前', 'でまえ', '宅配', 'たくはい', 'ピザ', 'デリバリー', '配達'],
    category: 'gaishoku',
    rate: 'reduced',
    reason:
      '指定された場所まで単に届けるだけなので「飲食料品の譲渡」。外食にもケータリングにも当たらない。',
    qa: 77,
    scope: 'food',
  },
  {
    id: 'catering',
    label: 'ケータリング・出張料理',
    keywords: [
      'ケータリング',
      'けーたりんぐ',
      '出張料理',
      'しゅっちょうりょうり',
      '盛り付け',
      '配膳',
    ],
    category: 'gaishoku',
    rate: 'standard',
    reason:
      '相手が指定した場所で加熱・調理・給仕などの役務を伴う提供は、軽減税率の対象から外されている。',
    qa: 75,
    scope: 'food',
    note: '自宅に来てもらう料理代行（食材持込）も、ケータリング・出張料理にあたるので10%。',
  },
  {
    id: 'school-lunch',
    label: '小中学校の学校給食',
    keywords: ['学校給食', 'がっこうきゅうしょく', '給食', 'きゅうしょく', '小学校', '中学校'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '義務教育諸学校で児童・生徒の全員に出す学校給食は、例外として軽減税率の対象。',
    qa: 81,
    scope: 'food',
  },
  {
    id: 'student-cafeteria',
    label: '大学・高校の学生食堂',
    keywords: ['学生食堂', 'がくせいしょくどう', '学食', 'がくしょく', '大学', '高校'],
    category: 'gaishoku',
    rate: 'standard',
    reason:
      '利用するかどうかを選べる学生食堂は「学校給食」に当たらず、席で飲食させる「食事の提供」になる。',
    qa: 81,
    scope: 'food',
  },
  {
    id: 'roujin-home',
    label: '有料老人ホーム・サ高住の食事',
    keywords: ['老人ホーム', 'ろうじんほーむ', '有料老人ホーム', 'サ高住', '高齢者住宅', '介護'],
    category: 'gaishoku',
    rate: 'reduced',
    reason:
      '届出のある有料老人ホーム等が入居者に出す食事は、一定の金額基準の範囲内で軽減税率の対象。',
    qa: 80,
    scope: 'food',
    note: '金額基準は令和8年6月1日から一食730円以下・1日の累計2,190円までで、超えた分は10%。',
  },
  {
    id: 'hospital-food',
    label: '入院中の病院食（入院時食事療養費）',
    keywords: ['病院食', 'びょういんしょく', '入院', 'にゅういん', '食事療養費'],
    category: 'gaishoku',
    rate: 'non-taxable',
    reason: '入院時食事療養費にかかる病院食は非課税で、そもそも消費税がかからない。',
    qa: 82,
    scope: 'food',
    note: '患者が自分で選ぶ特別メニューの特別料金は非課税にならず、10%（席で出す食事の提供）になる。',
  },
  {
    id: 'shain-shokudo',
    label: '社員食堂の食事',
    keywords: ['社員食堂', 'しゃいんしょくどう', '社食', '会社', '職員食堂'],
    category: 'gaishoku',
    rate: 'standard',
    reason: '社員食堂も、その食堂で飲食させる「食事の提供」にあたる。',
    qa: 49,
    scope: 'food',
  },
  {
    id: 'cinema-baiten',
    label: '映画館の売店で買うポップコーン・飲み物',
    keywords: ['映画館', 'えいがかん', '売店', 'ばいてん', 'ポップコーン', 'シネマ'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '売店で単に売るだけなら「飲食料品の譲渡」。',
    qa: 71,
    scope: 'food',
    note: '売店のそばの席で飲食させる場合や、座席まで注文を取って出す場合は10%。',
  },
  {
    id: 'karaoke',
    label: 'カラオケボックスの客室で注文する飲食',
    keywords: ['カラオケ', 'からおけ', 'カラオケボックス', '客室', 'ルーム'],
    category: 'gaishoku',
    rate: 'standard',
    reason: '客室のメニューから注文を受けて出す飲食は「食事の提供」。',
    qa: 70,
    scope: 'food',
  },
  {
    id: 'hotel-banquet',
    label: '旅館・ホテルの宴会場、ルームサービス',
    keywords: ['ホテル', 'ほてる', '旅館', 'りょかん', '宴会', 'ルームサービス', '会議室'],
    category: 'gaishoku',
    rate: 'standard',
    reason: '宴会場・会議室で出す食事もルームサービスも、飲食させる役務の提供にあたる。',
    qa: 72,
    scope: 'food',
  },
  {
    id: 'hotel-fridge',
    label: 'ホテル客室の冷蔵庫の飲み物（酒類以外）',
    keywords: ['ホテル', '冷蔵庫', 'れいぞうこ', 'ミニバー', '客室'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '客室の冷蔵庫の飲料を売るのは単なる販売なので「飲食料品の譲渡」。',
    qa: 73,
    scope: 'food',
    note: '酒類はそもそも軽減税率の対象外なので10%。',
  },
  {
    id: 'bbq',
    label: '手ぶらバーベキュー（施設利用料＋食材代）',
    keywords: ['バーベキュー', 'ばーべきゅー', 'BBQ', '手ぶら', 'キャンプ'],
    category: 'gaishoku',
    rate: 'standard',
    reason:
      '施設の中で飲食させるものとして食材を出しているので、食材代も含めて「食事の提供」。',
    qa: 74,
    scope: 'food',
  },
  {
    id: 'vending',
    label: '自動販売機のジュース・お菓子',
    keywords: ['自動販売機', 'じどうはんばいき', '自販機', 'じはんき', 'ジュース'],
    category: 'gaishoku',
    rate: 'reduced',
    reason: '飲食させる役務ではなく単に売っているだけなので「飲食料品の譲渡」。',
    qa: 33,
    scope: 'food',
  },
  {
    id: 'mikakugari',
    label: 'いちご狩り・果物狩りの入園料',
    keywords: ['いちご狩り', 'いちごがり', '果物狩り', 'くだものがり', '味覚狩り', '入園料'],
    category: 'gaishoku',
    rate: 'standard',
    reason: 'その場で収穫させて食べさせる役務の提供なので「飲食料品の譲渡」ではない。',
    qa: 32,
    scope: 'food',
    note: '収穫した果物に別途の代金をとる場合、その果物の販売は8%。',
  },

  /* ---------------- 酒類・調味料 ---------------- */
  {
    id: 'sake',
    label: 'ビール・チューハイ・日本酒・ワイン',
    keywords: [
      '酒',
      'さけ',
      'ビール',
      'びーる',
      'チューハイ',
      '日本酒',
      'ワイン',
      '焼酎',
      'アルコール',
    ],
    category: 'sake',
    rate: 'standard',
    reason: '酒税法に規定する酒類（アルコール分1度以上の飲料）は「飲食料品」から除かれている。',
    qa: 12,
    scope: 'food',
    note: '料理の材料にするワインなども、酒税法の酒類であれば10%（問13）。',
  },
  {
    id: 'hon-mirin',
    label: '本みりん',
    keywords: ['みりん', 'ミリン', '本みりん', '味醂', '調味料'],
    category: 'sake',
    rate: 'standard',
    reason: '酒税法に規定する「みりん」は酒類なので対象外。',
    qa: 14,
    scope: 'food',
  },
  {
    id: 'mirin-fu',
    label: 'みりん風調味料（アルコール1度未満）',
    keywords: ['みりん風', 'みりんふう', '調味料', 'ちょうみりょう'],
    category: 'sake',
    rate: 'reduced',
    reason: 'アルコール分1度未満で酒税法の酒類に当たらないため「飲食料品」になる。',
    qa: 14,
    scope: 'food',
  },
  {
    id: 'ryorishu',
    label: '料理酒（発酵調味料）',
    keywords: ['料理酒', 'りょうりしゅ', '発酵調味料', '塩'],
    category: 'sake',
    rate: 'reduced',
    reason: '塩などを加えて飲用できないようにした発酵調味料は酒類に当たらず「飲食料品」。',
    qa: 14,
    scope: 'food',
  },
  {
    id: 'non-alcohol',
    label: 'ノンアルコールビール・甘酒（1度未満）',
    keywords: ['ノンアルコール', 'のんある', 'ノンアル', '甘酒', 'あまざけ'],
    category: 'sake',
    rate: 'reduced',
    reason: '酒税法の酒類に当たらない飲料なので「飲食料品」にあたる。',
    qa: 15,
    scope: 'food',
  },
  {
    id: 'food-sake-set',
    label: '惣菜とビールをまとめて値引きするセット',
    keywords: ['セット', 'まとめ買い', '一括値引', '値引き', 'ビール'],
    category: 'sake',
    rate: 'depends',
    reason:
      '別々の商品を組み合わせただけなので一体資産にならない。惣菜は8%、ビールは10%で分けて計算する。',
    qa: 93,
    scope: 'food',
  },

  /* ---------------- 飲料 ---------------- */
  {
    id: 'mineral-water',
    label: 'ミネラルウォーター・飲料水',
    keywords: [
      'ミネラルウォーター',
      'みねらるうぉーたー',
      '水',
      'みず',
      '飲料水',
      'ペットボトル',
    ],
    category: 'drink',
    rate: 'reduced',
    reason: '人の飲用に供される飲料水は「食品」にあたる。',
    qa: 8,
    scope: 'food',
  },
  {
    id: 'tap-water',
    label: '水道水（水道料金）',
    keywords: ['水道水', 'すいどうすい', '水道料金', '上下水道'],
    category: 'drink',
    rate: 'standard',
    reason:
      '飲用の水と風呂・洗濯などの生活用水が混然一体で供給されるため、軽減税率の対象にならない。',
    qa: 8,
    scope: 'food',
    note: '水道水をペットボトルに詰めて「食品」として売る場合は8%。',
  },
  {
    id: 'eiyo-drink',
    label: '栄養ドリンク（医薬部外品）',
    keywords: ['栄養ドリンク', 'えいようどりんく', '医薬部外品', '医薬品', 'ドリンク剤'],
    category: 'drink',
    rate: 'standard',
    reason: '医薬品・医薬部外品・再生医療等製品は「食品」に含まれないため対象外。',
    qa: 23,
    scope: 'food',
    note: 'ラベルに「医薬部外品」と書かれているかどうかで分かれる。',
  },
  {
    id: 'seiryo-inryo',
    label: '清涼飲料タイプのエナジードリンク',
    keywords: ['エナジードリンク', '清涼飲料', 'せいりょういんりょう', '炭酸', 'コーラ'],
    category: 'drink',
    rate: 'reduced',
    reason: '医薬品等に当たらない飲料は「食品」にあたる。',
    qa: 23,
    scope: 'food',
  },
  {
    id: 'kenko-shokuhin',
    label: '特定保健用食品・健康食品・美容食品',
    keywords: [
      '健康食品',
      'けんこうしょくひん',
      'トクホ',
      '特定保健用食品',
      '栄養機能食品',
      'サプリ',
      '美容',
    ],
    category: 'drink',
    rate: 'reduced',
    reason: '医薬品等に当たらないものであれば「食品」にあたる。',
    qa: 24,
    scope: 'food',
  },

  /* ---------------- その他の食品・新聞 ---------------- */
  {
    id: 'supermarket-food',
    label: 'スーパーの食品・飲料（酒類以外）',
    keywords: ['スーパー', 'すーぱー', '食品', 'しょくひん', '野菜', '肉', '魚', '食料品'],
    category: 'other',
    rate: 'reduced',
    reason: '食品表示法の食品（酒類を除く）の譲渡なので軽減税率の対象。',
    qa: 1,
    scope: 'food',
  },
  {
    id: 'food-ice',
    label: '食用の氷（かき氷用・飲料用）',
    keywords: ['氷', 'こおり', 'かき氷', 'ロックアイス', '食用氷'],
    category: 'other',
    rate: 'reduced',
    reason: '人の飲食に供される食用氷は「食品」にあたる。',
    qa: 9,
    scope: 'food',
  },
  {
    id: 'dry-ice',
    label: '保冷用の氷・ドライアイス',
    keywords: ['ドライアイス', 'どらいあいす', '保冷', 'ほれい', '氷'],
    category: 'other',
    rate: 'standard',
    reason: '人の飲食に供されるものではないため「食品」に当たらない。',
    qa: 9,
    scope: 'food',
  },
  {
    id: 'pet-food',
    label: 'ペットフード・家畜の飼料',
    keywords: [
      'ペットフード',
      'ぺっとふーど',
      'ドッグフード',
      'キャットフード',
      '飼料',
      'しりょう',
      '犬',
      '猫',
    ],
    category: 'other',
    rate: 'standard',
    reason: '人の飲食に供されるものではないので「食品」に当たらない。',
    qa: 4,
    scope: 'food',
  },
  {
    id: 'shokugan',
    label: 'おもちゃ付きのお菓子（食玩）',
    keywords: ['食玩', 'しょくがん', 'おもちゃ付き', 'おまけ', '一体資産', 'お菓子'],
    category: 'other',
    rate: 'reduced',
    reason: '税抜1万円以下で、食品の占める割合が3分の2以上なら、一体資産として全体が8%。',
    qa: 84,
    scope: 'food',
    note: 'どちらかの条件を外れると全体が10%になる。',
  },
  {
    id: 'fukubukuro',
    label: '食品と食品以外が入った福袋',
    keywords: ['福袋', 'ふくぶくろ', '詰め合わせ', 'ギフト', '一体資産'],
    category: 'other',
    rate: 'depends',
    reason: '一体資産の2つの条件（税抜1万円以下・食品が3分の2以上）を満たせば8%、外れれば10%。',
    qa: 86,
    scope: 'food',
  },
  {
    id: 'hoereizai',
    label: '保冷剤をサービスで付けたケーキ',
    keywords: ['保冷剤', 'ほれいざい', 'ケーキ', 'プリン', '洋菓子'],
    category: 'other',
    rate: 'reduced',
    reason: 'サービスで付ける保冷剤は別対価ではないので、洋菓子の販売として8%。',
    qa: 31,
    scope: 'food',
    note: '保冷剤に別途の代金をとる場合、その保冷剤の分は10%。',
  },
  {
    id: 'tsuhan',
    label: 'ネットスーパー・通販で買う食品（おせちの予約など）',
    keywords: [
      '通販',
      'つうはん',
      'ネットスーパー',
      '通信販売',
      'ネット',
      'お取り寄せ',
      'おせち',
      '予約',
    ],
    category: 'other',
    rate: 'reduced',
    reason: 'インターネットなどの通信販売でも、売る商品が飲食料品なら8%。',
    qa: 34,
    scope: 'food',
  },
  {
    id: 'souryou',
    label: '通販の食品の送料（別途表示）',
    keywords: ['送料', 'そうりょう', '配送料', '運賃', '通販'],
    category: 'other',
    rate: 'standard',
    reason: '送料は飲食料品の対価ではなく役務の提供なので対象外。',
    qa: 39,
    scope: 'food',
    note: '「送料込み」で別途の送料をとらない場合は、商品が飲食料品なら全体が8%。',
  },
  {
    id: 'newspaper-teiki',
    label: '週2回以上発行の定期購読の新聞',
    keywords: ['新聞', 'しんぶん', '定期購読', 'ていきこうどく', '購読', '朝刊'],
    category: 'other',
    rate: 'reduced',
    reason: '定期購読契約に基づく、週2回以上発行される新聞の譲渡は軽減税率の対象。',
    qa: 99,
    scope: 'newspaper',
    note: '祝日や休刊日で週1回になる週があっても、通常の発行予定が週2回以上なら該当する。',
  },
  {
    id: 'newspaper-sports',
    label: '定期購読のスポーツ新聞・業界紙',
    keywords: ['スポーツ新聞', 'すぽーつしんぶん', '業界紙', '専門紙', '新聞'],
    category: 'other',
    rate: 'reduced',
    reason: 'スポーツ新聞や業界紙でも、週2回以上発行で定期購読契約に基づくなら8%。',
    qa: 97,
    scope: 'newspaper',
  },
  {
    id: 'newspaper-combini',
    label: 'コンビニ・駅で買う新聞',
    keywords: ['コンビニ', '駅', 'えき', 'キヨスク', '売店', '新聞', '1部'],
    category: 'other',
    rate: 'standard',
    reason: '定期購読契約に基づく販売ではないため軽減税率の対象にならない。',
    qa: 98,
    scope: 'newspaper',
  },
  {
    id: 'newspaper-digital',
    label: '電子版の新聞',
    keywords: ['電子版', 'でんしばん', 'デジタル', 'ネット版', '新聞', 'アプリ'],
    category: 'other',
    rate: 'standard',
    reason:
      'インターネットで配信するものは「電気通信利用役務の提供」で、新聞の譲渡に当たらない。',
    qa: 101,
    scope: 'newspaper',
    note: '紙と電子版のセット販売は、対価を分けてそれぞれの税率で計算する。',
  },
];

/** 項目数（画面のラベルに出す） */
export const ITEM_COUNT = ITEMS.length;

/**
 * 品目をしぼり込む。空文字なら全件返す。
 *
 * 部分一致を双方向に見るのは、入力が長い（「コンビニのイートインで食べたとき」）
 * ときにもキーワードが引っかかるようにするため
 * （`jitensha-hansokukin.ts` の `searchBehaviors()` と同じ作法）。
 */
export function searchItems(query: string): ShohizeiItem[] {
  const q = query.trim();
  if (q === '') return ITEMS;
  return ITEMS.filter(
    (item) =>
      item.label.includes(q) ||
      item.keywords.some((k) => k.includes(q) || q.includes(k)) ||
      item.reason.includes(q),
  );
}

/** id から引く。無い id は `undefined` */
export function findItem(id: string): ShohizeiItem | undefined {
  return ITEMS.find((item) => item.id === id);
}

export interface ItemGroup {
  category: ItemCategory;
  items: ShohizeiItem[];
}

/**
 * 種類別にまとめる。空のまとまりは返さない。
 *
 * 開いた直後から全項目を並べるため（スマホで「空の検索欄だけ」の
 * 初期画面にしない）、しぼり込み結果もこの関数を通す。
 */
export function itemGroups(items: ShohizeiItem[] = ITEMS): ItemGroup[] {
  return ITEM_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

/* ===================================================================
   2027年4月以降の税率
   =================================================================== */

/**
 * 2027年4月以降にどうなるか。
 *
 * - `'food-1percent'`: 飲食料品なので1%になる（予定）
 * - `'newspaper-unconfirmed'`: 新聞。報道では8%のままとされているが、
 *   **法案の条文で確認できていないので画面に税率を書かない**
 * - `'same'`: いまと変わらない（10%・非課税）
 * - `'depends'`: いまと同じく場合によって分かれる
 */
export type Rate2027 = 'food-1percent' | 'newspaper-unconfirmed' | 'same' | 'depends';

export const RATE_2027_LABEL: Record<Rate2027, string> = {
  'food-1percent': '1%',
  'newspaper-unconfirmed': '未確認',
  same: '変わらない',
  depends: '場合による',
};

/**
 * その品目が2027年4月以降どうなるか。
 *
 * `shown` が false（法案が成立しなかった場合）のときは `null` を返し、
 * 画面はこの列を出さない。
 */
export function rate2027For(item: ShohizeiItem, shown = true): Rate2027 | null {
  if (!shown) return null;
  if (item.rate === 'depends') return 'depends';
  if (item.rate !== 'reduced') return 'same';
  return item.scope === 'newspaper' ? 'newspaper-unconfirmed' : 'food-1percent';
}
