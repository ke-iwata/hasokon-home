/**
 * カリキュラム（章の定義）
 *
 * **この学習セクションの単一の情報源**。目次・sitemap・前後ナビ・パンくずは
 * すべてここから作られる。仕様は
 * [docs/features/learn-toshi.md](../../docs/features/learn-toshi.md)。
 *
 * tools / games の `lib/registry.ts` と同じ役割で、`stage` の意味も同じ
 * （[docs/features/feature-flags.md](../../docs/features/feature-flags.md)）。
 */

/** 公開の段階。tools / games の registry と同じ意味 */
export type Stage = 'wip' | 'preview' | 'public';

/** 部（第1部〜第5部） */
export type PartId = 'basics' | 'assets' | 'system' | 'practice' | 'shikaku';

/**
 * 内容がどれくらいの速さで古びるか。**年1回の点検対象を機械的に出すための印**。
 *
 * このサイトは「記事を書き続けない」方針（tools/docs/CONCEPT.md）で作られている。
 * 学習セクションをその方針に載せるために、古びる章と古びない章を分けて持つ。
 */
export type Volatility =
  /** 原理。古びない（複利・分散・リスクとリターン） */
  | 'stable'
  /** 制度・税制。**年1回の点検が要る**（NISA・iDeCo・税率） */
  | 'annual'
  /** 相場環境や手数料水準に触れる。数年に一度は見直す */
  | 'slow';

export interface ChapterDef {
  /** URLパス（先頭・末尾スラッシュなし） */
  slug: string;
  /** 章タイトル（目次・パンくず・前後ナビに使う） */
  title: string;
  /** 目次カードと meta description に使う短い説明 */
  description: string;
  part: PartId;
  /**
   * 公開の段階。
   * `wip` は**まだ本文を書いていない**章にも使う（目次に出るがリンクしない）。
   */
  stage: Stage;
  volatility: Volatility;
  /**
   * 内容を最後に更新した日（'YYYY-MM-DD'）。sitemap の lastmod に使う。
   * ビルド日ではなく実際に中身を変えた日を入れること。
   */
  updatedAt?: string;
  /**
   * 対応する資格の範囲。運営者の「資格につながるくらいの内容も欲しい」への対応で、
   * 第5部（資格で体系化する）から逆引きできるようにするための印。
   */
  shikaku?: readonly ('gaimuin2' | 'fp3' | 'fp2')[];
  /**
   * 関連する hasokon.com のツール（`/tools/{slug}/`）。
   * 学習セクションでは計算機を作らず、既存のツールへ渡す。
   */
  tools?: readonly string[];
}

export interface PartDef {
  id: PartId;
  /** 「第1部」などの番号ラベル */
  label: string;
  title: string;
  /** 目次でその部の狙いを説明する1〜2文 */
  lead: string;
}

export const SITE_URL = 'https://hasokon.com/learn';
export const SITE_NAME = '投資の教科書';
export const COPYRIGHT_HOLDER = 'hasokon';
/** 固定ページ（トップ）の最終更新日 */
export const SITE_UPDATED_AT = '2026-09-07';

export const OGP_IMAGE = {
  url: `${SITE_URL}/ogp.png`,
  width: 1200,
  height: 630,
  alt: SITE_NAME,
} as const;

export const parts: PartDef[] = [
  {
    id: 'basics',
    label: '第1部',
    title: '基礎（原理）',
    lead: 'どの商品を選ぶかの前に効く、古びない原理から始めます。ここを飛ばすと、あとの章がぜんぶ暗記になります。',
  },
  {
    id: 'assets',
    label: '第2部',
    title: '資産クラス別',
    lead: '株式・債券から暗号資産・デリバティブまで、何がリターンの源泉で、どこにリスクがあるのかを商品ごとに見ます。',
  },
  {
    id: 'system',
    label: '第3部',
    title: '制度と税金',
    lead: 'NISA・iDeCo・特定口座・20.315%。同じ商品でも、どの器で持つかで手取りが変わります。',
  },
  {
    id: 'practice',
    label: '第4部',
    title: '実践',
    lead: '口座を開くところから、注文の出し方、積立、デイトレード、リバランス、取り崩しまで。このセクションの主軸です。',
  },
  {
    id: 'shikaku',
    label: '第5部',
    title: '資格につなげる',
    lead: 'ここまでの内容が、証券外務員やFPの出題範囲とどう重なるかを地図にします。',
  },
];

/**
 * 全35章。
 *
 * **`stage: 'wip'` は本文がまだ無い章**で、目次には出るがリンクしない
 * （tools の `ready: false` と同じ扱い）。書いたら `preview` に上げる。
 *
 * 順番がそのまま学習の順路であり、前後ナビ（次の章へ）の順番でもある。
 */
export const chapters: ChapterDef[] = [
  // ---- 第1部 基礎（原理・古びない） ----
  {
    slug: 'toshi-towa',
    title: '投資とは何か',
    description: '貯蓄との違い、インフレがなぜ「何もしないリスク」になるのか。',
    part: 'basics',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp3'],
  },
  {
    slug: 'risk-return',
    title: 'リスクとリターン',
    description: '投資の「リスク」は損失ではなく振れ幅。標準偏差で測るとはどういうことか。',
    part: 'basics',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3', 'fp2'],
  },
  {
    slug: 'fukuri',
    title: '複利と時間',
    description:
      '複利がなぜ「時間を味方につける」と言われるのか、72の法則と、コストが複利で効く逆側まで。',
    part: 'basics',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp3'],
  },
  {
    slug: 'bunsan',
    title: '分散投資',
    description: '相関とは何か。GPIFの基本ポートフォリオを例に、分散が効く仕組みを見る。',
    part: 'basics',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp2'],
  },
  {
    slug: 'cost',
    title: 'コスト',
    description: '信託報酬・売買手数料・スプレッド。リターンは不確実だが、コストは確実なマイナス。',
    part: 'basics',
    stage: 'preview',
    volatility: 'slow',
    updatedAt: '2026-09-07',
  },
  {
    slug: 'index-active',
    title: '効率的市場仮説とインデックス／アクティブ',
    description: '「市場に勝つ」が難しいとされる理由と、その主張がどこまで成り立つのか。',
    part: 'basics',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },

  // ---- 第2部 資産クラス別 ----
  {
    slug: 'kabushiki',
    title: '株式',
    description:
      '株式のリターンはどこから来るのか。値上がり益と配当、株主の権利、そして価格が動く理由。',
    part: 'assets',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3'],
  },
  {
    slug: 'saiken',
    title: '債券',
    description: '金利が上がると債券価格が下がる理由、デュレーション、信用リスク、個人向け国債。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2', 'fp3', 'fp2'],
  },
  {
    slug: 'toshin',
    title: '投資信託',
    description: '基準価額の仕組みと、分配金が「儲け」とは限らない話（元本払戻金）。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2', 'fp3'],
  },
  {
    slug: 'etf',
    title: 'ETF',
    description: '上場している投資信託。投資信託との違いと、基準価額からの乖離。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2'],
  },
  {
    slug: 'reit',
    title: 'REIT（不動産投信）',
    description: '不動産を小口で持つ仕組み。分配金の源泉と、金利との関係。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2'],
  },
  {
    slug: 'gold',
    title: '金・コモディティ',
    description: '利息を生まない資産をなぜ持つのか。インフレヘッジという言葉の中身。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'gaika-fx',
    title: '外貨・FX',
    description: '為替リスクとは何か。レバレッジがなぜ「損失が入金額を超える」ことになるのか。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'ango-shisan',
    title: '暗号資産',
    description:
      'ビットコインなどの位置づけ、価格の源泉、取引所の破綻リスク、そして日本での税の重さ。',
    part: 'assets',
    stage: 'wip',
    volatility: 'slow',
  },
  {
    slug: 'fudosan',
    title: '不動産（現物）',
    description: '実物の不動産投資。レバレッジ・流動性・空室リスクと、REITとの違い。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['fp2'],
  },
  {
    slug: 'hoken-nenkin',
    title: '保険・年金商品',
    description: '変額保険・個人年金保険。保障と運用を1つにまとめることの損得。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['fp3', 'fp2'],
  },
  {
    slug: 'derivative',
    title: 'デリバティブ（先物・オプション）',
    description: '先物とオプションの仕組み。ヘッジの道具が投機の道具にもなる理由。',
    part: 'assets',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2'],
  },

  // ---- 第3部 制度と税金（年1回の点検対象） ----
  {
    slug: 'nisa',
    title: 'NISA',
    description:
      'つみたて投資枠と成長投資枠、生涯で1,800万円の非課税保有限度額、売却したら枠は復活する話。',
    part: 'system',
    stage: 'preview',
    volatility: 'annual',
    updatedAt: '2026-09-07',
    shikaku: ['fp3', 'fp2'],
  },
  {
    slug: 'ideco',
    title: 'iDeCo',
    description: '掛金が全額所得控除になる仕組みと、2026年12月施行の合算ルール。',
    part: 'system',
    stage: 'wip',
    volatility: 'annual',
    shikaku: ['fp3', 'fp2'],
    tools: ['ideco'],
  },
  {
    slug: 'tokutei-koza',
    title: '特定口座・一般口座',
    description: '源泉徴収ありとなしで何が変わるか。確定申告が要る場合・したほうがいい場合。',
    part: 'system',
    stage: 'wip',
    volatility: 'annual',
    shikaku: ['fp3'],
  },
  {
    slug: 'zeikin',
    title: '税金（20.315%・損益通算・繰越控除）',
    description: '譲渡益と配当にかかる税、損を出した年にやっておくこと、3年間の繰越控除。',
    part: 'system',
    stage: 'wip',
    volatility: 'annual',
    shikaku: ['gaimuin2', 'fp3', 'fp2'],
  },
  {
    slug: 'ango-zeikin',
    title: '暗号資産の税金',
    description: '雑所得・総合課税で、株式とはまったく違う扱いになる。損益通算も繰越もできない。',
    part: 'system',
    stage: 'wip',
    volatility: 'annual',
  },

  // ---- 第4部 実践（主軸） ----
  {
    slug: 'koza-kaisetsu',
    title: '証券会社の選び方・口座開設',
    description: '何を基準に選ぶか、口座開設で聞かれること、開設までの流れ。',
    part: 'practice',
    stage: 'wip',
    volatility: 'slow',
  },
  {
    slug: 'chumon',
    title: '注文の出し方',
    description:
      '成行・指値・逆指値の違いと使い分け。呼値の単位、板の見方、注文が約定する順番まで。',
    part: 'practice',
    stage: 'preview',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },
  {
    slug: 'ita',
    title: '板・歩み値の読み方',
    description: '板から何が分かり、何が分からないか。見せ板という言葉の意味。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2'],
  },
  {
    slug: 'tsumitate',
    title: '積立とドルコスト平均法',
    description: 'ドルコスト平均法が効く場面と、効かない場面。一括投資との比較。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'asset-allocation',
    title: 'アセットアロケーション',
    description: 'リターンの大半を決めるのは商品選びではなく配分。自分の配分をどう決めるか。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['fp2'],
  },
  {
    slug: 'rebalance',
    title: 'リバランス',
    description: '崩れた配分を戻す作業。いつ、どうやるか。税とコストをどう抑えるか。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'day-trade',
    title: '短期売買（デイトレード・スイング）',
    description:
      '実際の手順と、手数料・税・時間というコスト。研究が示す勝率の現実まで含めて扱う。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'technical',
    title: 'テクニカル分析',
    description: '移動平均・出来高・オシレーター。何を見ているのか、どこに限界があるのか。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'shinyo',
    title: '信用取引とレバレッジ',
    description: '委託保証金、追証、逆日歩。損失が元本を超えるとはどういうことか。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
    shikaku: ['gaimuin2'],
  },
  {
    slug: 'risk-kanri',
    title: 'リスク管理と損切り',
    description: '1回の取引でいくらまで失ってよいかから、持つ量を決める（ポジションサイジング）。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'deguchi',
    title: '出口戦略（取り崩し）',
    description: '貯めたあとどう使うか。4%ルールの出どころと、そのまま当てはめられない理由。',
    part: 'practice',
    stage: 'wip',
    volatility: 'stable',
  },
  {
    slug: 'sagi',
    title: 'やってはいけないこと・詐欺の見分け方',
    description: '無登録業者の見分け方、SNS型投資詐欺の型、金融庁の警告リストの引き方。',
    part: 'practice',
    stage: 'wip',
    volatility: 'slow',
  },

  // ---- 第5部 資格 ----
  {
    slug: 'shikaku',
    title: '資格で体系化する',
    description: '証券外務員二種・FP3級／2級の出題範囲と、この教科書の章の対応表。',
    part: 'shikaku',
    stage: 'wip',
    volatility: 'annual',
  },
];

/**
 * 目次・sitemap に出してよい章。
 *
 * **一覧を出すときは必ずこれを通すこと。**`chapters` を直に `filter` しない
 * （書き忘れが公開事故になる。tools / games の `publicTools` / `publicGames` と同じ約束）。
 */
export const publicChapters = chapters.filter((c) => c.stage === 'public');

/**
 * セクションそのものを公開しているか。
 *
 * **目次の `robots` と sitemap は、必ずこれを見て揃えること。**
 * 別々に書くと「sitemap には出ているのに noindex」という食い違いが起きる
 * （`tests/stage.test.ts` が2つの一致を見張っている）。
 * 章を1つでも `public` にした時点で、目次も公開されるべき入口になる。
 */
export function sectionIsPublic(): boolean {
  return publicChapters.length > 0;
}

/** 本文が書かれていて、URLを開けば読める章（`wip` 以外） */
export const writtenChapters = chapters.filter((c) => c.stage !== 'wip');

/** slug から章を引く。未登録は投げる（静的書き出しなのでビルドで落ちる） */
export function chapterBySlug(slug: string): ChapterDef {
  const found = chapters.find((c) => c.slug === slug);
  if (!found) {
    throw new Error(`章が見つかりません: ${slug}（lib/curriculum.ts に未登録）`);
  }
  return found;
}

/** 部に属する章を、カリキュラムの順番のまま返す */
export function chaptersOfPart(part: PartId): ChapterDef[] {
  return chapters.filter((c) => c.part === part);
}

/**
 * 前後の章。**本文のある章だけをたどる**（`wip` は飛ばす）。
 * 目次でリンクしない章へ、前後ナビからだけ入れてしまうのを防ぐため。
 */
export function neighborsOf(slug: string): { prev?: ChapterDef; next?: ChapterDef } {
  const list = writtenChapters;
  const i = list.findIndex((c) => c.slug === slug);
  if (i < 0) return {};
  return { prev: list[i - 1], next: list[i + 1] };
}

/**
 * `robots` メタタグの値。`public` 以外は検索エンジンに出さない。
 * **全ページの `metadata` に `robots: robotsFor('<slug>')` を書くこと**
 * （書き忘れは tests/stage.test.ts が落とす）。
 */
export function robotsFor(slug: string) {
  return chapterBySlug(slug).stage === 'public' ? undefined : { index: false, follow: false };
}
