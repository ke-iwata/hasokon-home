/**
 * 参考文献のマスター
 *
 * **この学習セクションの単一の情報源のひとつ**（もう1つは curriculum.ts）。
 * 仕様は [docs/features/learn-toshi.md](../../docs/features/learn-toshi.md)。
 *
 * ## なぜIDで持つのか
 *
 * 「参考文献はちゃんと明示して」が要望の核なので、**出典を後付けの飾りにしない**。
 * 章は本文中で `ref('fsa-nisa')` のようにIDで参照し、ページ下部の一覧は
 * 参照されたIDから自動生成する。手書きの一覧を置かないことで、
 *
 * - **存在しないIDを参照したらビルドが落ちる**（静的書き出しなので必ず気づく）
 * - **1件も参照していない章はテストが落ちる**（出典なしの章を作れない）
 * - 同じ文献を複数の章で使っても、URLと確認日が1か所にしかない
 *
 * ## 足すときの約束
 *
 * - **一次資料を優先する。** 官公庁・業界団体・取引所・法令。解説記事は使わない
 * - `checkedAt` は**実際にそのURLを開いて内容を確かめた日**を入れる。
 *   ビルド日ではない。ここが古いものは年1回の点検で見直す
 * - URLは**そのページを名指しできる深さ**まで書く。トップページで済ませない
 *   （ただしサイト改装で消えやすい深いURLしかない場合は、安定した階層に留める）
 * - 学術・書籍は「原理の裏付けが要るところ」にだけ使う。権威づけの飾りに使わない
 */

/** 文献の種別。参考文献リストの並び順（一次資料を先に）にも使う */
export type SourceKind =
  /** 法令そのもの */
  | 'law'
  /** 官公庁（金融庁・国税庁・財務省など） */
  | 'gov'
  /** 業界団体・取引所（日本証券業協会・投資信託協会・JPX など） */
  | 'org'
  /** 学術論文 */
  | 'paper'
  /** 書籍 */
  | 'book';

export interface Source {
  /** 本文から参照するID。安易に変えない（章の本文が指している） */
  id: string;
  /** 文献のタイトル */
  title: string;
  /** 発行元。書籍・論文は著者を `author` に分ける */
  publisher: string;
  /** 著者（論文・書籍のみ） */
  author?: string;
  /** 発行年（分かるもののみ） */
  year?: number;
  kind: SourceKind;
  /** URL（オンラインで参照できるもののみ） */
  url?: string;
  /**
   * 内容を実際に確認した日（'YYYY-MM-DD'）。
   * 制度は変わるので、この日付が古い文献は年1回の点検対象になる。
   */
  checkedAt: string;
}

/** 種別の表示名。参考文献リストのラベルに使う */
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  law: '法令',
  gov: '官公庁',
  org: '業界団体・取引所',
  paper: '論文',
  book: '書籍',
};

/**
 * 参考文献の一覧。
 *
 * 【データ更新箇所】制度の改正があったときは、該当する文献の `checkedAt` を
 * 開き直した日に更新する。URLが変わっていたら差し替える。
 */
export const sources: Source[] = [
  // ---- 官公庁 ----
  {
    id: 'fsa-guide',
    title: '基礎から学べる金融ガイド',
    publisher: '金融庁',
    kind: 'gov',
    url: 'https://www.fsa.go.jp/teach/kyouzai.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'fsa-basic',
    title: '投資の基本',
    publisher: '金融庁',
    kind: 'gov',
    url: 'https://www.fsa.go.jp/policy/nisa2/knowledge/basic/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'fsa-nisa',
    title: 'NISAを知る（NISA特設ウェブサイト）',
    publisher: '金融庁',
    kind: 'gov',
    url: 'https://www.fsa.go.jp/policy/nisa2/about/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'fsa-warning',
    title: '無登録で金融商品取引業を行う者の名称等について',
    publisher: '金融庁',
    kind: 'gov',
    url: 'https://www.fsa.go.jp/ordinary/mutouroku/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'nta-1463',
    title: 'No.1463 株式等を譲渡したときの課税（申告分離課税）',
    publisher: '国税庁 タックスアンサー',
    kind: 'gov',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1463.htm',
    checkedAt: '2026-09-07',
  },
  {
    id: 'nta-1476',
    title: 'No.1476 特定口座制度',
    publisher: '国税庁 タックスアンサー',
    kind: 'gov',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1476.htm',
    checkedAt: '2026-09-07',
  },
  {
    id: 'stat-cpi',
    title: '消費者物価指数（CPI）',
    publisher: '総務省統計局',
    kind: 'gov',
    url: 'https://www.stat.go.jp/data/cpi/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'boj-price',
    title: '「物価安定の目標」と「量的・質的金融緩和」',
    publisher: '日本銀行',
    kind: 'gov',
    url: 'https://www.boj.or.jp/mopo/outline/qqe.htm',
    checkedAt: '2026-09-07',
  },
  {
    id: 'mof-jgb',
    title: '個人向け国債',
    publisher: '財務省',
    kind: 'gov',
    url: 'https://www.mof.go.jp/jgbs/individual/kojin_kokusai/',
    checkedAt: '2026-09-07',
  },

  {
    id: 'ideco-official',
    title: 'iDeCo（個人型確定拠出年金）の概要',
    publisher: '国民年金基金連合会 iDeCo公式サイト',
    kind: 'org',
    url: 'https://www.ideco-koushiki.jp/guide/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'nta-1474',
    title: 'No.1474 上場株式等に係る譲渡損失の損益通算及び繰越控除',
    publisher: '国税庁 タックスアンサー',
    kind: 'gov',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1474.htm',
    checkedAt: '2026-09-07',
  },
  {
    id: 'nta-1330',
    title: 'No.1330 配当金を受け取ったとき（配当所得）',
    publisher: '国税庁 タックスアンサー',
    kind: 'gov',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1330.htm',
    checkedAt: '2026-09-07',
  },
  {
    id: 'mof-boei',
    title: '防衛力強化に係る財源確保のための税制措置',
    publisher: '財務省',
    kind: 'gov',
    url: 'https://www.mof.go.jp/tax_policy/summary/other/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'nta-1524',
    title: 'No.1524 暗号資産を売却または使用した場合の課税関係',
    publisher: '国税庁 タックスアンサー',
    kind: 'gov',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1524.htm',
    checkedAt: '2026-09-07',
  },
  {
    id: 'fsa-crypto',
    title: '暗号資産（仮想通貨）に関する注意喚起',
    publisher: '金融庁',
    kind: 'gov',
    url: 'https://www.fsa.go.jp/policy/virtual_currency/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'nca-toshi',
    title: '投資・もうけ話のトラブル（消費者トラブル情報）',
    publisher: '独立行政法人 国民生活センター',
    kind: 'gov',
    url: 'https://www.kokusen.go.jp/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'mlit-fudosan',
    title: '不動産価格指数・土地総合情報システム',
    publisher: '国土交通省',
    kind: 'gov',
    url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000085.html',
    checkedAt: '2026-09-07',
  },

  // ---- 業界団体・取引所 ----
  {
    id: 'jsda-study',
    title: '投資の時間（投資教育コンテンツ）',
    publisher: '日本証券業協会',
    kind: 'org',
    url: 'https://www.jsda.or.jp/jikan/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'jsda-gaimuin',
    title: '外務員資格試験',
    publisher: '日本証券業協会',
    kind: 'org',
    url: 'https://www.jsda.or.jp/gaimuin/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'toushin-basic',
    title: '投資信託を学ぼう',
    publisher: '一般社団法人 投資信託協会',
    kind: 'org',
    url: 'https://www.toushin.or.jp/investmenttrust/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'jpx-tosho',
    title: '東証マーケット情報・株式売買制度',
    publisher: '株式会社日本取引所グループ（JPX）',
    kind: 'org',
    url: 'https://www.jpx.co.jp/equities/trading/domestic/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'jpx-tick',
    title: '呼値の単位',
    publisher: '株式会社日本取引所グループ（JPX）',
    kind: 'org',
    url: 'https://www.jpx.co.jp/equities/trading/domestic/07.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'jpx-margin',
    title: '信用取引の制度概要',
    publisher: '株式会社日本取引所グループ（JPX）',
    kind: 'org',
    url: 'https://www.jpx.co.jp/equities/trading/margin/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'jpx-derivative',
    title: 'デリバティブ（先物・オプション）市場の商品概要',
    publisher: '株式会社日本取引所グループ（JPX）',
    kind: 'org',
    url: 'https://www.jpx.co.jp/derivatives/products/index.html',
    checkedAt: '2026-09-07',
  },
  {
    id: 'toushin-reit',
    title: 'J-REITの仕組み',
    publisher: '一般社団法人 投資信託協会',
    kind: 'org',
    url: 'https://www.toushin.or.jp/reit/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'seiho-guide',
    title: '生命保険の種類と仕組み',
    publisher: '公益財団法人 生命保険文化センター',
    kind: 'org',
    url: 'https://www.jili.or.jp/lifeplan/lifesecurity/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'ffaj-fx',
    title: '店頭FX取引の仕組みとリスク',
    publisher: '一般社団法人 金融先物取引業協会',
    kind: 'org',
    url: 'https://www.ffaj.or.jp/',
    checkedAt: '2026-09-07',
  },
  {
    id: 'gpif-portfolio',
    title: '基本ポートフォリオの考え方',
    publisher: '年金積立金管理運用独立行政法人（GPIF）',
    kind: 'org',
    url: 'https://www.gpif.go.jp/gpif/portfolio.html',
    checkedAt: '2026-09-07',
  },

  // ---- 論文 ----
  {
    id: 'sharpe-1991',
    title: 'The Arithmetic of Active Management, Financial Analysts Journal, 47(1), 7-9',
    publisher: 'Financial Analysts Journal',
    author: 'Sharpe, W. F.',
    year: 1991,
    kind: 'paper',
    checkedAt: '2026-09-07',
  },
  {
    id: 'markowitz-1952',
    title: 'Portfolio Selection, The Journal of Finance, 7(1), 77-91',
    publisher: 'The Journal of Finance',
    author: 'Markowitz, H.',
    year: 1952,
    kind: 'paper',
    checkedAt: '2026-09-07',
  },
  {
    id: 'barber-odean-2000',
    title:
      'Trading Is Hazardous to Your Wealth: The Common Stock Investment Performance of Individual Investors, The Journal of Finance, 55(2), 773-806',
    publisher: 'The Journal of Finance',
    author: 'Barber, B. M. and Odean, T.',
    year: 2000,
    kind: 'paper',
    checkedAt: '2026-09-07',
  },
  {
    id: 'barber-2014-daytrade',
    title: 'Do Day Traders Rationally Learn About Their Ability?',
    publisher: 'SSRN Working Paper',
    author: 'Barber, B. M., Lee, Y.-T., Liu, Y.-J. and Odean, T.',
    year: 2014,
    kind: 'paper',
    checkedAt: '2026-09-07',
  },
  {
    id: 'bengen-1994',
    title: 'Determining Withdrawal Rates Using Historical Data, Journal of Financial Planning, 7(4), 171-180',
    publisher: 'Journal of Financial Planning',
    author: 'Bengen, W. P.',
    year: 1994,
    kind: 'paper',
    checkedAt: '2026-09-07',
  },

  // ---- 書籍 ----
  {
    id: 'malkiel-random-walk',
    title: 'ウォール街のランダム・ウォーカー（原題: A Random Walk Down Wall Street）',
    publisher: '日本経済新聞出版',
    author: 'バートン・マルキール',
    kind: 'book',
    checkedAt: '2026-09-07',
  },
  {
    id: 'bogle-common-sense',
    title: 'インデックス投資は勝者のゲーム（原題: The Little Book of Common Sense Investing）',
    publisher: 'パンローリング',
    author: 'ジョン・C・ボーグル',
    kind: 'book',
    checkedAt: '2026-09-07',
  },
];

const byId = new Map(sources.map((s) => [s.id, s]));

/**
 * IDから文献を引く。
 *
 * **未登録のIDは投げる。** 静的書き出しなので `npm run build` で必ず落ちる。
 * 黙って空の脚注になると「出典を明示する」という約束が静かに破れるため。
 */
export function sourceById(id: string): Source {
  const found = byId.get(id);
  if (!found) {
    throw new Error(`参考文献が見つかりません: ${id}（lib/sources.ts に未登録）`);
  }
  return found;
}

/** 一覧に出す順番。一次資料（法令→官公庁→業界団体）を先に、学術・書籍を後に */
const KIND_ORDER: SourceKind[] = ['law', 'gov', 'org', 'paper', 'book'];

/**
 * 章が参照しているIDの配列から、表示用の文献リストを作る。
 * 重複は取り除き、種別の順に並べる（本文に出てきた順ではない）。
 */
export function resolveSources(ids: readonly string[]): Source[] {
  const unique = [...new Set(ids)];
  return unique
    .map(sourceById)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
