/**
 * カリキュラム（分野と章の定義）
 *
 * **この学習セクションの単一の情報源**。一覧・目次・sitemap・前後ナビ・パンくずは
 * すべてここから作られる。仕様は
 * [docs/features/learn-toshi.md](../../docs/features/learn-toshi.md)。
 *
 * tools / games の `lib/registry.ts` と同じ役割で、`stage` の意味も同じ
 * （[docs/features/feature-flags.md](../../docs/features/feature-flags.md)）。
 *
 * ## URLの形
 *
 * ```
 * /learn/                  分野の一覧（学ぶ）
 * /learn/{subject}/        その分野の目次        例: /learn/toshi/
 * /learn/{subject}/{slug}/ 章                    例: /learn/toshi/fukuri/
 * ```
 *
 * **1段目に分野を挟んであるのは、学習セクションを投資に限定しないため。**
 * 分野を足すときは `subjects` に1件足し、その分野の `parts` と `chapters` を書く。
 * **URLの組み立ては `chapterPath()` / `subjectPath()` を通すこと**（各ページで
 * 文字列を継ぎ足さない。パスの形を変えるときに追い切れなくなる）。
 */

/** 公開の段階。tools / games の registry と同じ意味 */
export type Stage = 'wip' | 'preview' | 'public';

/** 分野。いまは投資だけだが、増やせる形にしてある */
export interface SubjectDef {
  /** URLパス（`/learn/{slug}/`）。先頭・末尾スラッシュなし */
  slug: string;
  /** 分野名（一覧・パンくず・タイトルに使う） */
  name: string;
  /** 一覧カードと meta description に使う短い説明 */
  description: string;
  /** 一覧に添える1〜2文。何がどの順で並ぶか */
  lead: string;
  stage: Stage;
  updatedAt?: string;
}

/**
 * 分野の一覧。
 *
 * **一覧を出すときは `publicSubjects` を通すこと。**
 * `subjects` を直に `filter` しない（書き忘れが公開事故になる。
 * tools / games の `publicTools` / `publicGames` と同じ約束）。
 */
export const subjects: SubjectDef[] = [
  {
    slug: 'toshi',
    name: '投資の教科書',
    description:
      '株式・債券から暗号資産・デイトレードまで、投資を体系的に学べる全35章。出典つき。',
    lead: '原理 → 資産クラス別 → 制度と税金 → 実践 → 資格の順に、全35章。記述の根拠は各章の末尾に一次資料へのリンクつきで並べています。',
    stage: 'public',
    updatedAt: '2026-09-07',
  },
];

/** 部（第1部〜第5部）。分野ごとに持つ */
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
  /** 属する分野の slug（`subjects` のもの） */
  subject: string;
  /** URLパス（先頭・末尾スラッシュなし）。分野の中で一意 */
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
  /** 属する分野の slug */
  subject: string;
  id: PartId;
  /** 「第1部」などの番号ラベル */
  label: string;
  title: string;
  /** 目次でその部の狙いを説明する1〜2文 */
  lead: string;
}

export const SITE_URL = 'https://hasokon.com/learn';
/**
 * セクションの名前。**分野の名前ではない。**
 *
 * `/learn/` は分野の入口なので、ここは「学ぶ」。
 * 「投資の教科書」は分野（`subjects`）の名前で、1段下にある。
 * ここを分野名にすると、パンくずが「学ぶ ＞ 投資の教科書」ではなく
 * 「投資の教科書 ＞ 投資の教科書」になる（実際に一度そうなった）。
 */
export const SITE_NAME = '学ぶ';
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
    subject: 'toshi',
    id: 'basics',
    label: '第1部',
    title: '基礎（原理）',
    lead: 'どの商品を選ぶかの前に効く、古びない原理から始めます。ここを飛ばすと、あとの章がぜんぶ暗記になります。',
  },
  {
    subject: 'toshi',
    id: 'assets',
    label: '第2部',
    title: '資産クラス別',
    lead: '株式・債券から暗号資産・デリバティブまで、何がリターンの源泉で、どこにリスクがあるのかを商品ごとに見ます。',
  },
  {
    subject: 'toshi',
    id: 'system',
    label: '第3部',
    title: '制度と税金',
    lead: 'NISA・iDeCo・特定口座・20.315%。同じ商品でも、どの器で持つかで手取りが変わります。',
  },
  {
    subject: 'toshi',
    id: 'practice',
    label: '第4部',
    title: '実践',
    lead: '口座を開くところから、注文の出し方、積立、デイトレード、リバランス、取り崩しまで。このセクションの主軸です。',
  },
  {
    subject: 'toshi',
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
    subject: 'toshi',
    slug: 'toshi-towa',
    title: '投資とは何か',
    description: '貯蓄との違い、インフレがなぜ「何もしないリスク」になるのか。',
    part: 'basics',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp3'],
  },
  {
    subject: 'toshi',
    slug: 'risk-return',
    title: 'リスクとリターン',
    description: '投資の「リスク」は損失ではなく振れ幅。標準偏差で測るとはどういうことか。',
    part: 'basics',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3', 'fp2'],
  },
  {
    subject: 'toshi',
    slug: 'fukuri',
    title: '複利と時間',
    description:
      '複利がなぜ「時間を味方につける」と言われるのか、72の法則と、コストが複利で効く逆側まで。',
    part: 'basics',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp3'],
  },
  {
    subject: 'toshi',
    slug: 'bunsan',
    title: '分散投資',
    description: '相関とは何か。GPIFの基本ポートフォリオを例に、分散が効く仕組みを見る。',
    part: 'basics',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp2'],
  },
  {
    subject: 'toshi',
    slug: 'cost',
    title: 'コスト',
    description: '信託報酬・売買手数料・スプレッド。リターンは不確実だが、コストは確実なマイナス。',
    part: 'basics',
    stage: 'public',
    volatility: 'slow',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'index-active',
    title: '効率的市場仮説とインデックス／アクティブ',
    description: '「市場に勝つ」が難しいとされる理由と、その主張がどこまで成り立つのか。',
    part: 'basics',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },

  // ---- 第2部 資産クラス別 ----
  {
    subject: 'toshi',
    slug: 'kabushiki',
    title: '株式',
    description:
      '株式のリターンはどこから来るのか。値上がり益と配当、株主の権利、そして価格が動く理由。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3'],
  },
  {
    subject: 'toshi',
    slug: 'saiken',
    title: '債券',
    description: '金利が上がると債券価格が下がる理由、デュレーション、信用リスク、個人向け国債。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3', 'fp2'],
  },
  {
    subject: 'toshi',
    slug: 'toshin',
    title: '投資信託',
    description: '基準価額の仕組みと、分配金が「儲け」とは限らない話（元本払戻金）。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3'],
  },
  {
    subject: 'toshi',
    slug: 'etf',
    title: 'ETF',
    description: '上場している投資信託。投資信託との違いと、基準価額からの乖離。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },
  {
    subject: 'toshi',
    slug: 'reit',
    title: 'REIT（不動産投信）',
    description: '不動産を小口で持つ仕組み。分配金の源泉と、金利との関係。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },
  {
    subject: 'toshi',
    slug: 'gold',
    title: '金・コモディティ',
    description: '利息を生まない資産をなぜ持つのか。インフレヘッジという言葉の中身。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'gaika-fx',
    title: '外貨・FX',
    description: '為替リスクとは何か。レバレッジがなぜ「損失が入金額を超える」ことになるのか。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'ango-shisan',
    title: '暗号資産',
    description:
      'ビットコインなどの位置づけ、価格の源泉、取引所の破綻リスク、そして日本での税の重さ。',
    part: 'assets',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-08',
  },
  {
    subject: 'toshi',
    slug: 'ango-shurui',
    title: '暗号資産の種類と特徴',
    description:
      '何千種類もあるものを4つの型で分ける。供給の決まり方、発行主体の有無、ステーブルコインが別枠な理由。',
    part: 'assets',
    stage: 'public',
    volatility: 'slow',
    updatedAt: '2026-09-08',
  },
  {
    subject: 'toshi',
    slug: 'fudosan',
    title: '不動産（現物）',
    description: '実物の不動産投資。レバレッジ・流動性・空室リスクと、REITとの違い。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp2'],
  },
  {
    subject: 'toshi',
    slug: 'hoken-nenkin',
    title: '保険・年金商品',
    description: '変額保険・個人年金保険。保障と運用を1つにまとめることの損得。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp3', 'fp2'],
  },
  {
    subject: 'toshi',
    slug: 'derivative',
    title: 'デリバティブ（先物・オプション）',
    description: '先物とオプションの仕組み。ヘッジの道具が投機の道具にもなる理由。',
    part: 'assets',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },

  // ---- 第3部 制度と税金（年1回の点検対象） ----
  {
    subject: 'toshi',
    slug: 'nisa',
    title: 'NISA',
    description:
      'つみたて投資枠と成長投資枠、生涯で1,800万円の非課税保有限度額、売却したら枠は復活する話。',
    part: 'system',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-07',
    shikaku: ['fp3', 'fp2'],
  },
  {
    subject: 'toshi',
    slug: 'ideco',
    title: 'iDeCo',
    description: '掛金が全額所得控除になる仕組みと、2026年12月施行の合算ルール。',
    part: 'system',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-07',
    shikaku: ['fp3', 'fp2'],
    tools: ['ideco'],
  },
  {
    subject: 'toshi',
    slug: 'tokutei-koza',
    title: '特定口座・一般口座',
    description: '源泉徴収ありとなしで何が変わるか。確定申告が要る場合・したほうがいい場合。',
    part: 'system',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-07',
    shikaku: ['fp3'],
  },
  {
    subject: 'toshi',
    slug: 'zeikin',
    title: '税金（20.315%・損益通算・繰越控除）',
    description: '譲渡益と配当にかかる税、損を出した年にやっておくこと、3年間の繰越控除。',
    part: 'system',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2', 'fp3', 'fp2'],
  },
  {
    subject: 'toshi',
    slug: 'ango-zeikin',
    title: '暗号資産の税金',
    description:
      '雑所得・総合課税で、株式とはまったく違う扱いになる。20%分離課税への改正と、まだ適用が始まっていないこと。',
    part: 'system',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-08',
  },

  // ---- 第4部 実践（主軸） ----
  {
    subject: 'toshi',
    slug: 'koza-kaisetsu',
    title: '証券会社の選び方・口座開設',
    description: '何を基準に選ぶか、口座開設で聞かれること、開設までの流れ。',
    part: 'practice',
    stage: 'public',
    volatility: 'slow',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'chumon',
    title: '注文の出し方',
    description:
      '成行・指値・逆指値の違いと使い分け。呼値の単位、板の見方、注文が約定する順番まで。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },
  {
    subject: 'toshi',
    slug: 'ita',
    title: '板・歩み値の読み方',
    description: '板から何が分かり、何が分からないか。見せ板という言葉の意味。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },
  {
    subject: 'toshi',
    slug: 'tsumitate',
    title: '積立とドルコスト平均法',
    description: 'ドルコスト平均法が効く場面と、効かない場面。一括投資との比較。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'asset-allocation',
    title: 'アセットアロケーション',
    description: 'リターンの大半を決めるのは商品選びではなく配分。自分の配分をどう決めるか。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['fp2'],
  },
  {
    subject: 'toshi',
    slug: 'rebalance',
    title: 'リバランス',
    description: '崩れた配分を戻す作業。いつ、どうやるか。税とコストをどう抑えるか。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'day-trade',
    title: '短期売買（デイトレード・スイング）',
    description:
      '実際の手順と、手数料・税・時間というコスト。研究が示す勝率の現実まで含めて扱う。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'saitei-torihiki',
    title: '裁定取引（アービトラージ）',
    description:
      '価格差を取る考え方と、その差が手数料・送金時間・板の厚み・税で消えていく過程を数える。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-08',
  },
  {
    subject: 'toshi',
    slug: 'technical',
    title: 'テクニカル分析',
    description: '移動平均・出来高・オシレーター。何を見ているのか、どこに限界があるのか。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'shinyo',
    title: '信用取引とレバレッジ',
    description: '委託保証金、追証、逆日歩。損失が元本を超えるとはどういうことか。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
    shikaku: ['gaimuin2'],
  },
  {
    subject: 'toshi',
    slug: 'risk-kanri',
    title: 'リスク管理と損切り',
    description: '1回の取引でいくらまで失ってよいかから、持つ量を決める（ポジションサイジング）。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'deguchi',
    title: '出口戦略（取り崩し）',
    description: '貯めたあとどう使うか。4%ルールの出どころと、そのまま当てはめられない理由。',
    part: 'practice',
    stage: 'public',
    volatility: 'stable',
    updatedAt: '2026-09-07',
  },
  {
    subject: 'toshi',
    slug: 'sagi',
    title: 'やってはいけないこと・詐欺の見分け方',
    description: '無登録業者の見分け方、SNS型投資詐欺の型、金融庁の警告リストの引き方。',
    part: 'practice',
    stage: 'public',
    volatility: 'slow',
    updatedAt: '2026-09-07',
  },

  // ---- 第5部 資格 ----
  {
    subject: 'toshi',
    slug: 'shikaku',
    title: '資格で体系化する',
    description: '証券外務員二種・FP3級／2級の出題範囲と、この教科書の章の対応表。',
    part: 'shikaku',
    stage: 'public',
    volatility: 'annual',
    updatedAt: '2026-09-07',
  },
];

/**
 * 一覧・sitemap に出してよい分野。
 * **一覧を出すときは必ずこれを通すこと**（`subjects` を直に `filter` しない）。
 */
export const publicSubjects = subjects.filter((s) => s.stage === 'public');

/** slug から分野を引く。未登録は投げる（静的書き出しなのでビルドで落ちる） */
export function subjectBySlug(slug: string): SubjectDef {
  const found = subjects.find((s) => s.slug === slug);
  if (!found) {
    throw new Error(`分野が見つかりません: ${slug}（lib/curriculum.ts に未登録）`);
  }
  return found;
}

/**
 * URLの組み立て。**パスを文字列で継ぎ足さず、必ずここを通すこと。**
 * 分野を1段挟む形にしたときに、各ページで組み立てていると追い切れなくなる。
 */

/** 分野の目次への `<Link href>`（例: `/toshi/`） */
export function subjectPath(subject: string): string {
  return `/${subject}/`;
}

/** 分野の目次の絶対URL（canonical・sitemap 用） */
export function subjectUrl(subject: string): string {
  return `${SITE_URL}/${subject}/`;
}

/** 章への `<Link href>`（例: `/toshi/fukuri/`） */
export function chapterPath(chapter: Pick<ChapterDef, 'subject' | 'slug'>): string {
  return `/${chapter.subject}/${chapter.slug}/`;
}

/** 章の絶対URL（canonical・sitemap 用） */
export function chapterUrl(chapter: Pick<ChapterDef, 'subject' | 'slug'>): string {
  return `${SITE_URL}/${chapter.subject}/${chapter.slug}/`;
}

/** その分野の章（カリキュラムの順番のまま） */
export function chaptersOfSubject(subject: string): ChapterDef[] {
  return chapters.filter((c) => c.subject === subject);
}

/** その分野の部（カリキュラムの順番のまま） */
export function partsOfSubject(subject: string): PartDef[] {
  return parts.filter((p) => p.subject === subject);
}

/**
 * 目次・sitemap に出してよい章。
 *
 * **一覧を出すときは必ずこれを通すこと。**`chapters` を直に `filter` しない
 * （書き忘れが公開事故になる。tools / games の `publicTools` / `publicGames` と同じ約束）。
 */
export const publicChapters = chapters.filter((c) => c.stage === 'public');

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

/**
 * 部に属する章を、カリキュラムの順番のまま返す。
 * 部のIDは分野をまたいで同じ値を使えるので、分野も指定する。
 */
export function chaptersOfPart(part: PartId, subject = 'toshi'): ChapterDef[] {
  return chapters.filter((c) => c.part === part && c.subject === subject);
}

/**
 * 前後の章。**本文のある章だけをたどる**（`wip` は飛ばす）。
 * 目次でリンクしない章へ、前後ナビからだけ入れてしまうのを防ぐため。
 */
export function neighborsOf(slug: string): { prev?: ChapterDef; next?: ChapterDef } {
  const here = chapters.find((c) => c.slug === slug);
  if (!here) return {};
  // **前後は同じ分野の中で閉じる。** 分野をまたいで「次の章」へ送らない
  const list = writtenChapters.filter((c) => c.subject === here.subject);
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
