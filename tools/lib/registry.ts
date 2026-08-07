/**
 * ツールレジストリ
 * ここに追加すると、トップページの一覧と sitemap に自動反映される。
 */
export type ToolCategory = 'お金・社会保険' | '生活・健康' | '計算・変換' | '決める・選ぶ';

export interface ToolDef {
  /** URLパス（先頭・末尾スラッシュなし） */
  slug: string;
  /** ツール名（一覧・タイトルに使用） */
  name: string;
  /** 一覧カードと meta description に使う短い説明 */
  description: string;
  category: ToolCategory;
  /** 一覧カードのアイコン（絵文字） */
  icon: string;
  /** 実装済みフラグ。false のツールは一覧に「準備中」と表示しリンクしない */
  ready: boolean;
  /**
   * 内容を最後に更新した日（'YYYY-MM-DD'）。sitemap の lastmod に使う。
   * ビルド日時ではなく実際に中身を変えた日を入れること。
   * 毎ビルド現在時刻にすると全ページが「更新された」ことになり lastmod が信用されなくなる。
   */
  updatedAt: string;
}

// basePath込みのサイトURL。canonical・sitemap・JSON-LDはすべてここから作られる
export const SITE_URL = 'https://hasokon.com/tools';

/** サイト名。ヘッダー・ページタイトル・OGPに表示される */
export const SITE_NAME = '無料計算ツール集';

/** 著作権表記に使う名称。表示名とは別に権利の帰属先を明示するためのもの */
export const COPYRIGHT_HOLDER = 'hasokon tools';

/** 固定ページ（トップ・プライバシー・お問い合わせ）の最終更新日 */
export const SITE_UPDATED_AT = '2026-08-02';

export const tools: ToolDef[] = [
  {
    slug: 'roulette',
    icon: '🎯',
    name: 'ルーレット',
    description:
      '項目を入れて回すだけ。ランチ・当番・順番決めに。当たった項目を除いて回せば順番決めにも使えます。',
    category: '決める・選ぶ',
    ready: true,
    updatedAt: '2026-08-01',
  },
  {
    slug: 'group',
    icon: '👥',
    name: 'グループ分け',
    description: '名前を入れるだけで班分け・チーム分けをランダムに作成。人数は自動で均等に振り分けます。',
    category: '決める・選ぶ',
    ready: true,
    updatedAt: '2026-08-01',
  },
  {
    slug: 'dice',
    icon: '🎲',
    name: 'サイコロ',
    description: 'サイコロをブラウザで。1〜10個まで同時に振れて、合計も出ます。',
    category: '決める・選ぶ',
    ready: true,
    updatedAt: '2026-08-01',
  },
  {
    slug: 'kosodate-shienkin',
    icon: '👶',
    name: '子ども・子育て支援金 計算機',
    description:
      '「独身税」とも呼ばれる子ども・子育て支援金の給与天引き額を計算。2026〜2028年度対応。',
    category: 'お金・社会保険',
    ready: true,
    updatedAt: '2026-07-01',
  },
  {
    slug: 'furusato-nozei',
    icon: '🎁',
    name: 'ふるさと納税 控除額計算機',
    description:
      '自己負担2,000円で寄付できる上限額と、所得税・住民税それぞれからいくら控除されるかを内訳まで計算。住宅ローン控除との併用にも対応。',
    category: 'お金・社会保険',
    ready: true,
    updatedAt: '2026-08-03',
  },
  {
    slug: 'nenshu-kabe',
    icon: '🧱',
    name: '年収の壁 計算機',
    description:
      '106万・119万・130万・178万…あなたに関係する「年収の壁」と影響を判定。2026年改正対応。',
    category: 'お金・社会保険',
    ready: true,
    updatedAt: '2026-08-01',
  },
  {
    slug: 'shobyo-teate',
    icon: '🏥',
    name: '傷病手当金 計算機',
    description: '病気やケガで休職したときにもらえる傷病手当金の日額・総額を計算。',
    category: 'お金・社会保険',
    ready: true,
    updatedAt: '2026-08-01',
  },
  {
    slug: 'sleep-cycle',
    icon: '😴',
    name: '睡眠サイクル計算機',
    description: '起床時刻から逆算して、スッキリ起きられる就寝時刻を90分サイクルで提案。',
    category: '生活・健康',
    ready: true,
    updatedAt: '2026-07-01',
  },
  {
    slug: 'aircon-denkidai',
    icon: '❄️',
    name: 'エアコン電気代 計算機',
    description: 'エアコンの消費電力と使用時間から、1日・1ヶ月の電気代を計算。',
    category: '生活・健康',
    ready: true,
    updatedAt: '2026-07-01',
  },
  {
    slug: 'warikan',
    icon: '🍻',
    name: '割り勘計算機',
    description: '飲み会の合計金額と人数から一人あたりの支払額を計算。傾斜配分にも対応。',
    category: '生活・健康',
    ready: true,
    updatedAt: '2026-07-01',
  },
  {
    slug: 'hebon-romaji',
    icon: '🔤',
    name: 'ヘボン式ローマ字変換',
    description: '氏名のふりがなをパスポート表記のヘボン式ローマ字に変換。',
    category: '計算・変換',
    ready: true,
    updatedAt: '2026-07-01',
  },
  {
    slug: 'hankaku-zenkaku',
    icon: '🔡',
    name: '半角⇔全角 変換',
    description:
      '半角と全角をまとめて相互変換。英数字・カタカナ・記号・スペースを種類ごとに選べます。',
    category: '計算・変換',
    ready: true,
    updatedAt: '2026-08-02',
  },
  {
    slug: 'aspect-ratio',
    icon: '📐',
    name: 'アスペクト比計算機',
    description: '幅と高さから縦横比を計算。リサイズ後のサイズ算出やCSSコピーにも対応。',
    category: '計算・変換',
    ready: true,
    updatedAt: '2026-07-01',
  },
];

export const categories: ToolCategory[] = [
  'お金・社会保険',
  '生活・健康',
  '決める・選ぶ',
  '計算・変換',
];
