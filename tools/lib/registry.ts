/**
 * ツールレジストリ
 * ここに追加すると、トップページの一覧と sitemap に自動反映される。
 */
export type ToolCategory = 'お金・社会保険' | '生活・健康' | '計算・変換' | '決める・選ぶ';

/**
 * 公開の段階。**機能を本番リリースから外すための唯一の切り替え**。
 *
 * 仕様は [docs/features/feature-flags.md](../../docs/features/feature-flags.md)。
 * ここを `public` 以外にすると、一覧・「関連」・sitemap・llms.txt から外れ、
 * ページには `noindex` が付く。**ただしページ自体は建って配られる**ので、
 * URLを知っていれば見える（秘密にはできない）。
 *
 * ファイルごと本番に置きたくない場合は仕様書の「レベル2」が要る（未実装）。
 */
export type Stage =
  /** 作りかけ。手元で見るだけ */
  | 'wip'
  /** テスト環境で見てもらう段階。まだ公開しない */
  | 'preview'
  /** 公開中 */
  | 'public';

export interface ToolDef {
  /** URLパス（先頭・末尾スラッシュなし） */
  slug: string;
  /** ツール名（一覧・タイトルに使用） */
  name: string;
  /** 一覧カードと meta description に使う短い説明 */
  description: string;
  category: ToolCategory;
  /**
   * アイコン名。Phosphor Icons のコンポーネント名をそのまま書く。
   * 実際の描画は app/ToolIcon.tsx が名前から解決する。
   * 絵文字は端末ごとに絵柄も色も変わり、サイトの配色に馴染まないので使わない。
   */
  icon: string;
  /** 公開の段階。`public` 以外は一覧にも sitemap にも出さない */
  stage: Stage;
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

/**
 * SNS共有時のサムネイル（OGP画像）。
 *
 * 仕様: docs/features/ogp-image.md（案B・全ページ共通の1枚）
 *
 * 実体は `public/ogp.png`。basePath（/tools）が付いて
 * https://hasokon.com/tools/ogp.png で配信される。
 * 画像は design/ogp/gen-ogp.mjs で生成しており、直接編集しない。
 *
 * - **URLは絶対URLにすること。** 相対パスを解決できないクローラーが多い
 * - サイズは 1200×630 固定（X の summary_large_image の前提）
 */
export const OGP_IMAGE = {
  url: `${SITE_URL}/ogp.png`,
  width: 1200,
  height: 630,
  alt: SITE_NAME,
} as const;

export const tools: ToolDef[] = [
  {
    slug: 'roulette',
    icon: 'Target',
    name: 'ルーレット',
    description:
      '項目を入れて回すだけ。ランチ・当番・順番決めに。当たった項目を除いて回せば順番決めにも使えます。',
    category: '決める・選ぶ',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'group',
    icon: 'UsersThree',
    name: 'グループ分け',
    description: '名前を入れるだけで班分け・チーム分けをランダムに作成。人数は自動で均等に振り分けます。',
    category: '決める・選ぶ',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'dice',
    icon: 'DiceFive',
    name: 'サイコロ',
    description: 'サイコロをブラウザで。1〜10個まで同時に振れて、合計も出ます。',
    category: '決める・選ぶ',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'kosodate-shienkin',
    icon: 'Baby',
    name: '子ども・子育て支援金 計算機',
    description:
      '「独身税」とも呼ばれる子ども・子育て支援金の給与天引き額を計算。2026〜2028年度対応。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-07-01',
  },
  {
    slug: 'furusato-nozei',
    icon: 'Gift',
    name: 'ふるさと納税 控除額計算機',
    description:
      '自己負担2,000円で寄付できる上限額と、所得税・住民税それぞれからいくら控除されるかを内訳まで計算。住宅ローン控除との併用にも対応。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-21',
  },
  {
    slug: 'nenmatsu-chosei',
    icon: 'HandCoins',
    name: '年末調整 還付金 計算機',
    description:
      '年末調整でいくら戻るかを計算。給与明細の源泉徴収税額を入れるだけで差額が出ます。令和8年分の基礎控除104万円・給与所得控除74万円への引き上げで、令和7年分よりいくら軽くなったかも表示します。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-12',
  },
  {
    slug: 'zaishoku-rorei-nenkin',
    icon: 'PiggyBank',
    name: '在職老齢年金 計算機',
    description:
      '働きながら年金をもらうと、いくら止まるかを計算。令和8年4月から基準額が月51万円→65万円に引き上げられました（「62万円」ではありません）。改正前との差額と、あといくら稼げるかも出ます。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    slug: 'ideco',
    icon: 'Coins',
    name: 'iDeCo 拠出限度額・節税額 計算機',
    description:
      '2026年12月の改正でiDeCoの上限は会社員なら月6.2万円へ。ただし「6.2万円 − 事業主掛金」があなたの上限です。勤め先の事業主掛金を入れて、上限と年間の節税額、70歳までの累計を計算します。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    slug: 'koko-jugyoryo',
    icon: 'GraduationCap',
    name: '高校授業料 実質負担 計算機',
    description:
      '「高校無償化」でも結局いくら払うのかを計算。2026年4月に所得制限が撤廃され私立は年45万7,200円まで支援されますが、超過分と対象外の入学金・制服・教材は残ります。公立と比べた3年間の総額が出ます。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-14',
  },
  {
    slug: 'yoikuhi-keisan',
    icon: 'HandHeart',
    name: '養育費 計算ツール',
    description:
      '裁判所の標準算定方式で養育費の月額の目安と算定表のレンジを計算。2026年4月施行の改正民法で新設された法定養育費（子1人あたり月2万円）と、先取特権の上限（子1人あたり月8万円）にも対応しています。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'tabako-zei-neage',
    icon: 'Cigarette',
    name: 'たばこ値上げ早見表・負担額計算',
    description:
      'たばこ税は2027年4月から毎年4月に1本0.5円ずつ、3回に分けて上がります（1箱20本で1回あたり税込11円）。銘柄の価格を入れると2029年4月までの想定価格が分かり、1日の本数から月間・年間の負担額と増える分、買わなくなった場合に浮く額まで計算できます。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-15',
  },
  {
    slug: 'shuzei-kaisei',
    icon: 'BeerStein',
    name: '酒税改正 早見表・負担額計算',
    description:
      '2026年10月1日にビール系飲料の酒税が1klあたり155,000円に一本化されます。ビールは350mlで9.10円の減税、発泡酒・第三のビールは7.26円、チューハイ等は7.00円の増税。週に飲む本数を入れると、年間の負担がいくら増える（減る）かと、9月中に買うと得なものが分かります。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-19',
  },
  {
    slug: 'nenshu-kabe',
    icon: 'Wall',
    name: '年収の壁 計算機',
    description:
      '119万・130万・178万…あなたに関係する「年収の壁」と影響を判定。2026年10月の106万円の壁撤廃（週20時間の壁）に対応。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-11',
  },
  {
    slug: 'invoice-nozeigaku',
    icon: 'Receipt',
    name: 'インボイス 納税額 比較計算機',
    description:
      '2割特例が終わったあと、3割特例・簡易課税・本則課税のどれが一番安いかを1画面で比較。簡易課税の届出期限（原則と、2割特例からの移行の特則）と業種別みなし仕入率の早見表つき。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-21',
  },
  {
    slug: 'hatarakizon',
    icon: 'Scales',
    name: '社会保険 損得計算機',
    description:
      '社会保険に加入すると手取りがいくら減り、いくら稼げば取り戻せるかを計算。働き損ゾーンと損益分岐点、増える厚生年金まで金額で出します。2026年10月の賃金要件撤廃に対応。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    slug: 'shitsugyo-hoken',
    icon: 'Briefcase',
    name: '失業保険（基本手当）計算機',
    description:
      '退職したら失業保険がいくら・いつからもらえるかを計算。令和8年8月1日改定の日額（上限7,450〜9,110円）に対応し、基本手当日額・所定給付日数・総額に加えて、待期7日と給付制限を踏まえた支給開始日まで出します。自己都合の給付制限は2ヶ月ではなく原則1ヶ月です。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-19',
  },
  {
    slug: 'shobyo-teate',
    icon: 'FirstAidKit',
    name: '傷病手当金 計算機',
    description: '病気やケガで休職したときにもらえる傷病手当金の日額・総額を計算。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    slug: 'kogaku-ryoyohi',
    icon: 'Hospital',
    name: '高額療養費 自己負担限度額 計算機',
    description:
      '医療費が高額になったとき、1か月の自己負担がいくらまでで済むかを計算。2026年8月の改正後の限度額と、新設された年間上限（8月〜翌年7月）に対応。改正前の額と並べて表示します。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    slug: 'iryohi-kojo',
    icon: 'Receipt',
    name: '医療費控除・セルフメディケーション税制 計算機',
    description:
      '1年間に払った医療費から、控除額と実際に戻る額（所得税の還付＋翌年の住民税の軽減）を計算。セルフメディケーション税制と並べて、どちらが得かも判定します。医療費が10万円以下でも控除できる場合に対応。',
    category: 'お金・社会保険',
    stage: 'wip',
    updatedAt: '2026-08-31',
  },
  {
    slug: 'saitei-chingin',
    icon: 'CurrencyJpy',
    name: '最低賃金 早見表・チェッカー',
    description:
      '都道府県を選ぶと、いまの最低賃金と2026年10月改定後の額・引上げ幅が分かります。自分の時給が下回っていないかの判定と、時給×労働時間からの月収・年収換算、年収の壁までの余裕も表示します。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-31',
  },
  {
    slug: 'jitensha-hansokukin',
    icon: 'Bicycle',
    name: '自転車の反則金（青切符）早見表・チェッカー',
    description:
      '2026年4月から自転車も青切符の対象に。イヤホン・傘さし・歩道通行など日常の行為を選ぶと、該当する違反名・反則金・青切符か赤切符かが分かります。警察庁の公式一覧にもとづく全65項目の早見表つき。',
    category: 'お金・社会保険',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'bosai-bichiku-keisan',
    icon: 'Package',
    name: '防災備蓄 計算ツール',
    description:
      '家族の人数を入れるだけで、水・食料・カセットボンベ・簡易トイレの必要量が出ます。3日分と7日分を切り替えでき、乳幼児のミルク・おむつ、ペットのフードにも対応。そのまま印刷できる買い物チェックリストつき。',
    category: '生活・健康',
    stage: 'public',
    updatedAt: '2026-08-15',
  },
  {
    slug: 'interval-timer',
    icon: 'Timer',
    name: 'インターバルタイマー',
    description:
      'トレーニング用のインターバルタイマー。タバタ式・HIITのプリセット付きで、運動・休憩・セット数を自由に設定。ビープ音で切り替えを知らせます。',
    category: '生活・健康',
    stage: 'public',
    updatedAt: '2026-08-11',
  },
  {
    slug: 'sleep-cycle',
    icon: 'MoonStars',
    name: '睡眠サイクル計算機',
    description:
      '起床時刻から逆算して、スッキリ起きられる就寝時刻を90分サイクルで提案。仮眠・昼寝の時間も計算。',
    category: '生活・健康',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    slug: 'aircon-denkidai',
    icon: 'Snowflake',
    name: 'エアコン電気代 計算機',
    description: 'エアコンの消費電力と使用時間から、1日・1ヶ月の電気代を計算。',
    category: '生活・健康',
    stage: 'public',
    updatedAt: '2026-07-01',
  },
  {
    slug: 'warikan',
    icon: 'Receipt',
    name: '割り勘計算機',
    description: '飲み会の合計金額と人数から一人あたりの支払額を計算。傾斜配分にも対応。',
    category: '生活・健康',
    stage: 'public',
    updatedAt: '2026-07-01',
  },
  {
    slug: 'waribiki-percent',
    icon: 'Percent',
    name: '割引・パーセント計算',
    description:
      '「30%オフはいくら？」「割引率は何%？」を、税込／税抜と端数の丸め方（切り捨て・四捨五入・切り上げ）を選んで計算。二重割引（30%オフからさらに20%オフ）や、〇%オフ早見表つき。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-20',
  },
  {
    slug: 'nenrei-keisan',
    icon: 'CalendarDots',
    name: '年齢計算・西暦和暦変換',
    description:
      '生年月日から満年齢と満何歳何ヶ月を計算。年齢早見表・「◯歳は何年生まれ」の逆引き、西暦⇔和暦（明治〜令和）の変換、誕生日までの日数・干支・学年の目安つき。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-18',
  },
  {
    slug: 'nissu-keisan',
    icon: 'CalendarCheck',
    name: '日数計算・期日計算',
    description:
      '2つの日付のあいだの日数を計算。初日を含む・含まないの両方を表示し、「◯日後」「◯営業日後」の期日計算にも対応。土日と祝日を除いて数えます。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'mojisu-count',
    icon: 'Article',
    name: '文字数カウント',
    description:
      '文字数をその場でカウント。スペース・改行の有無、行数・段落数、原稿用紙換算、目標文字数に対応。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-17',
  },
  {
    slug: 'qr-code',
    icon: 'QrCode',
    name: 'QRコード作成',
    description:
      'URL・テキスト・Wi-Fi設定のQRコードをその場で作成。生成はブラウザ内で完結し、期限のない静的QRをPNG・SVGで保存できます。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-18',
  },
  {
    slug: 'password',
    icon: 'Key',
    name: 'パスワード生成',
    description:
      '安全なパスワードを10件まとめて作成。生成はブラウザ内で完結し、送信も保存もしません。強さの目安と、覚えやすいパスフレーズにも対応。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-18',
  },
  {
    slug: 'hebon-romaji',
    icon: 'Translate',
    name: 'ヘボン式ローマ字変換',
    description: '氏名のふりがなをパスポート表記のヘボン式ローマ字に変換。五十音の一覧表つき。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-14',
  },
  {
    slug: 'hankaku-zenkaku',
    icon: 'TextAa',
    name: '半角⇔全角 変換',
    description:
      '半角と全角をまとめて相互変換。英数字・カタカナ・記号・スペースを種類ごとに選べます。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-02',
  },
  {
    slug: 'gazo-resize',
    icon: 'Image',
    name: '画像リサイズ・圧縮',
    description:
      '写真のサイズ変更とファイルサイズの圧縮を、アップロードなしで。処理はブラウザ内で完結し、位置情報（EXIF）も残りません。「300KB以下」のような目標サイズ指定とJPEG・PNG・WebPの変換に対応。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-19',
  },
  {
    slug: 'tsubo-heibei',
    icon: 'Ruler',
    name: '坪・平米・畳 変換',
    description:
      '坪・平米（㎡）・畳をまとめて相互変換。1坪＝400/121㎡を丸めずに計算し、30坪は何平米・6畳は何平米の逆引き早見表つき。畳は京間・中京間・江戸間・団地間と不動産広告の1.62㎡換算を切り替えられます。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-19',
  },
  {
    slug: 'aspect-ratio',
    icon: 'Crop',
    name: 'アスペクト比計算機',
    description:
      '幅と高さから縦横比を計算。16:9の逆引き早見表やリサイズ後のサイズ算出、CSSコピーにも対応。',
    category: '計算・変換',
    stage: 'public',
    updatedAt: '2026-08-17',
  },
];

export const categories: ToolCategory[] = [
  'お金・社会保険',
  '生活・健康',
  '決める・選ぶ',
  '計算・変換',
];

/**
 * 公開中のツールだけ。**一覧・関連ツール・sitemap はすべてここを通す。**
 * `tools` を直に filter しないこと（見落としが公開事故になる）
 */
export const publicTools = tools.filter((t) => t.stage === 'public');

/**
 * `stage` から検索避けを決める規則。**`robotsFor` と分けてあるのは、
 * registry の中身に関係なく規則そのものをテストできるようにするため**
 * （いま全部 `public` なので、規則を registry 越しにしか見られないと
 * 「非公開なら noindex」の確認が書けない）。
 */
export function robotsForStage(stage: Stage): { index: false; follow: false } | undefined {
  return stage === 'public' ? undefined : { index: false, follow: false };
}

/**
 * ページの検索避け。公開前のものは `noindex` にする。
 *
 * 一覧にも sitemap にも出していなくても、URLは配られている。
 * 誰かが共有すれば拾われうるので、ページ側でも断っておく。
 * 各 `page.tsx` の `metadata` に `robots: robotsFor('<slug>')` を書く
 * （書き忘れは `tests/stage.test.ts` が落とす）。
 *
 * registry に無い slug は `undefined`（＝既定のまま）。ここで noindex にすると、
 * registry に載せない特設ページまで巻き込んで検索から消える
 */
export function robotsFor(slug: string): { index: false; follow: false } | undefined {
  const found = tools.find((x) => x.slug === slug);
  return found ? robotsForStage(found.stage) : undefined;
}
