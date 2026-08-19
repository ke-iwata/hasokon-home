/**
 * ゲームレジストリ
 * ここに追加すると、トップページの一覧と sitemap に自動反映される。
 */

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

export interface GameDef {
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** 公開の段階。`public` 以外は一覧にも sitemap にも出さない */
  stage: Stage;
  /** 内容を最後に更新した日（sitemap の lastmod。ビルド日ではない） */
  updatedAt: string;
}

// basePath込みのサイトURL。canonical・sitemap・JSON-LDはすべてここから作られる
export const SITE_URL = 'https://hasokon.com/games';
export const SITE_NAME = '無料ミニゲーム集';
export const COPYRIGHT_HOLDER = 'hasokon tools';
export const SITE_UPDATED_AT = '2026-08-04';

/**
 * SNS共有時のサムネイル（OGP画像）。
 *
 * 仕様: docs/features/ogp-image.md（案B・全ページ共通の1枚）
 *
 * 実体は `public/ogp.png`。basePath（/games）が付いて
 * https://hasokon.com/games/ogp.png で配信される。
 * 画像は design/ogp/gen-ogp.mjs で生成しており、直接編集しない
 * （tools と地の色を反転させて、ツールとゲームを見分けられるようにしている）。
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

export const games: GameDef[] = [
  {
    slug: 'solitaire',
    icon: 'Cards',
    name: 'ソリティア',
    description: '定番のクロンダイク。タップで自動移動の簡単操作。もどす機能つき。',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'spider',
    icon: 'Spade',
    name: 'スパイダーソリティア',
    description: '1スート〜4スートの3段階。KからAまで揃えて8組完成を目指します。',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'freecell',
    icon: 'Club',
    name: 'フリーセル',
    description: '全部の札が最初から見えている実力型のトランプパズル。まとめて移動にも対応。',
    stage: 'public',
    updatedAt: '2026-08-11',
  },
  {
    // 「ピラミッド」は19世紀から遊ばれている伝統的なソリティアの一般名称で、
    // ルールにも名称にも権利者はいない（クロンダイク・スパイダーと同じ扱い）
    // （docs/features/game-pyramid-solitaire.md の「権利関係は無害」）。
    // ソリティア群をまとめて見せたいので、一覧では freecell の直後に置く
    slug: 'pyramid-solitaire',
    icon: 'Pyramid',
    name: 'ピラミッドソリティア',
    description:
      '足して13になる2枚を取り除いてピラミッドを崩すソリティア。Kは1枚で取れます。タップだけの簡単操作。',
    stage: 'public',
    updatedAt: '2026-08-17',
  },
  {
    // 「トライピークス」（Tri Peaks / Three Peaks）は1989年に考案された
    // ソリティアの一般名称で、ルールにも名称にも権利者はいない
    // （docs/features/game-tripeaks.md の「権利関係は無害」）。
    // ソリティア群をまとめて見せたいので、一覧ではピラミッドの直後に置く
    slug: 'tripeaks',
    icon: 'TriPeaks',
    name: 'トライピークス',
    description:
      '捨て札と1つ違いの札を取り除いて3つの山を崩すソリティア。AはKにも2にもつながります。連鎖を伸ばすほど高得点。',
    stage: 'public',
    updatedAt: '2026-08-18',
  },
  {
    slug: 'minesweeper',
    icon: 'Bomb',
    name: 'マインスイーパー',
    description: '数字をヒントに地雷を避ける定番パズル。初手は必ず安全。初級〜上級。',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: '2048',
    icon: 'SquaresFour',
    name: '2048',
    description: 'スワイプで同じ数字を合体させて2048を目指すパズル。ベストスコア保存。',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'nanpre',
    icon: 'GridNine',
    name: 'ナンプレ',
    description: '定番の数字パズル。かんたん・ふつう・むずかしいの3段階。答えは必ず1通りです。',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    slug: 'nonogram',
    icon: 'GridFour',
    name: 'ノノグラム',
    description: '数字をヒントにマスを塗ると絵が出るパズル。5×5〜15×15の全30問。答えは必ず1通りです。',
    stage: 'public',
    updatedAt: '2026-08-11',
  },
  {
    slug: 'reversi',
    icon: 'Stones',
    name: 'リバーシ',
    description: '挟んで裏返す定番の対戦ゲーム。CPUは かんたん・ふつう・つよい の3段階。先手・後手も選べます。',
    stage: 'public',
    updatedAt: '2026-08-12',
  },
  {
    // 「五目並べ」は伝統ゲームの一般名称で商標の問題は無い。競技ルールの
    // 「連珠」は禁じ手を実装していないので名乗らない
    // （docs/features/game-gomoku.md の「権利関係」）
    slug: 'gomoku',
    icon: 'FiveInARow',
    name: '五目並べ',
    description:
      '13×13の盤に先に5つ並べたほうが勝ちの定番ボードゲーム。CPUは かんたん・ふつう・つよい の3段階。禁じ手なし。',
    stage: 'public',
    updatedAt: '2026-08-14',
  },
  {
    // 「大富豪（大貧民）」は日本の伝統的なトランプ遊びの一般名称で、ルールも名称も
    // パブリックドメイン。商標の問題は無い
    // （docs/features/game-daifugo.md の「権利面が完全にクリーン」）
    slug: 'daifugo',
    icon: 'Crown',
    name: '大富豪',
    description:
      'CPU3人と5回戦を戦うトランプの定番。8切り・革命・縛りに対応し、都落ち・11バック・スペ3返しも切り替えられます。',
    stage: 'public',
    updatedAt: '2026-08-14',
  },
  {
    // 「七並べ」（Sevens / Fan Tan）は伝統的トランプゲームの一般名称で、ルールも名称も
    // パブリックドメイン。商標の問題は無い
    // （docs/features/game-shichinarabe.md の「権利関係が無害」）
    slug: 'shichinarabe',
    icon: 'Sevens',
    name: '七並べ',
    description:
      'CPU3人と5回戦を戦うトランプの定番。パスは3回まで、4回目で失格して手札が場に開きます。トンネルも切り替え可能。',
    stage: 'public',
    updatedAt: '2026-08-14',
  },
  {
    // 「神経衰弱」（Concentration / Memory）は伝統的なトランプ遊びの一般名称で、
    // ルールも名称もパブリックドメイン。商標の問題は無い
    // （docs/features/game-shinkei-suijaku.md の「権利関係的に無害」）
    slug: 'shinkei-suijaku',
    icon: 'MemoryPair',
    name: '神経衰弱',
    description:
      'めくった2枚が同じ数字ならもらえる定番のカードゲーム。ひとりでタイムアタック、CPU対戦は強さ3段階。12〜52枚から選べます。',
    stage: 'public',
    updatedAt: '2026-08-14',
  },
  {
    // 「スピード」（Speed / Spit）は伝統的なトランプ2人遊びの一般名称で、ルールも
    // 名称もパブリックドメイン。商標の問題は無い
    // （docs/features/game-speed.md の「権利関係的に無害な題材」）
    slug: 'speed',
    icon: 'SpeedBolt',
    name: 'スピード',
    description:
      '台札と1つ違いの数字を、手番を待たずに出し合うトランプの定番。CPU対戦は反応の速さで強さ3段階。1ゲーム1〜2分。',
    stage: 'public',
    updatedAt: '2026-08-15',
  },
  {
    // 花札のルールも伝統的な絵柄（松に鶴・芒に月など）もパブリックドメインで、
    // 権利者はいない。特定メーカーの製品の絵柄は模写せず、48枚とも自前のSVGで
    // 描き起こしている。ゲーム名も一般名称の「花札 こいこい」だけを使う
    // （docs/features/game-hanafuda-koikoi.md の「権利リスクがない」）
    slug: 'hanafuda-koikoi',
    icon: 'Hanafuda',
    name: '花札 こいこい',
    description:
      '日本の伝統札で遊ぶ2人用の定番。CPU対戦は強さ3段階で、6ヶ月戦と12ヶ月戦を選べます。役の一覧と、あと何枚で役になるかの案内つき。',
    stage: 'public',
    updatedAt: '2026-08-15',
  },
  {
    // 「上海」はサン電子（サンソフト）が国内で商標を保有しているため名前に使わない。
    // 一般名称の「麻雀ソリティア」で統一する
    // （docs/features/game-mahjong-solitaire.md の「権利関係の確認」）
    slug: 'mahjong-solitaire',
    icon: 'Tiles',
    name: '麻雀ソリティア',
    description:
      '亀の形に積んだ144枚から同じ絵柄を2つずつ消す絵合わせパズル。必ず最後まで消せる盤面を配ります。',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    // 「Block Blast」「Woodoku」等は他社の固有名なので使わず、一般名詞の
    // 「ブロックパズル」で立てる（docs/features/game-block-puzzle.md の「権利関係」）
    slug: 'block-puzzle',
    icon: 'Blocks',
    name: 'ブロックパズル',
    description:
      '8×8の盤面に配られたピースを置いて、揃った行と列を消すパズル。時間制限なしでじっくり遊べます。',
    stage: 'public',
    updatedAt: '2026-08-13',
  },
  {
    // 色水を注ぎ替えて色ごとにそろえる「ウォーターソート／カラーソート」型は、
    // 同型のアプリ・ブラウザ版が多数共存しているジェネリックなルールで、
    // ルール自体に権利者はいない（docs/features/game-color-sort.md の「権利関係は無害」）。
    // 特定アプリの名称・画面・配色はなぞらず、一般記述の「色水ソート」で立てている。
    // **J-PlatPat での名称の商標確認は未了**（docs/features/game-color-sort.md の状態行）。
    // 登録が見つかったら「色水の並べ替えパズル」等に切り替える
    slug: 'color-sort',
    icon: 'Tubes',
    name: '色水ソート',
    description:
      '色水を試験管に注ぎ分けて同じ色を1本にそろえるパズル。かんたん・ふつう・むずかしいの3段階。時間制限なしでのんびり遊べます。',
    stage: 'public',
    updatedAt: '2026-08-19',
  },
  {
    slug: 'breakout',
    icon: 'Racquet',
    name: 'ブロック崩し',
    description: 'マウスやタッチで操作する定番アクション。面が進むごとに速くなります。',
    stage: 'public',
    updatedAt: '2026-08-16',
  },
  {
    // ヘビゲームは1976年の Blockade 系に始まるジャンルの通称で、ルールにも
    // 「スネーク」という一般名称にも権利者はいない（特定機種の実装名やロゴは使わない）
    // （docs/features/game-snake.md の「権利フリー」）。
    // アーケード系をまとめて見せたいので、一覧ではブロック崩しの直後に置く
    slug: 'snake',
    icon: 'Snake',
    name: 'スネーク',
    description:
      '餌を食べるほど長くなるヘビを操作する定番アーケード。壁と自分の体をよけてハイスコアを狙います。スワイプと矢印キーに対応。',
    stage: 'public',
    updatedAt: '2026-08-18',
  },
  {
    slug: 'pinball',
    icon: 'Pinball',
    name: 'ピンボール',
    description: 'フリッパーで球を打ち返す定番のアクション。バンパーと的で点を稼ぎます。',
    // 打ち出しと打ち返しの手応えを実機で確かめてから公開する。
    // 仕様書（docs/features/game-pinball.md）の状態行に公開の条件を書いてある
    stage: 'preview',
    updatedAt: '2026-08-16',
  },
];

/**
 * 公開中のゲームだけ。**一覧・「他のゲーム」・sitemap はすべてここを通す。**
 * `games` を直に filter しないこと（見落としが公開事故になる）
 */
export const publicGames = games.filter((g) => g.stage === 'public');

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
  const found = games.find((x) => x.slug === slug);
  return found ? robotsForStage(found.stage) : undefined;
}
