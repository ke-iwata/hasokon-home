/**
 * 最低賃金 早見表・チェッカーのデータとロジック（令和8年度改定対応）
 *
 * 仕様: docs/features/saitei-chingin-checker.md
 *
 * 地域別最低賃金は都道府県ごとに額も発効日も違い、毎年10月前後に改定される。
 * 「自分の県はいくらか」「いまの時給は下回っていないか」「時給が上がると
 * 年収の壁にどれだけ近づくか」の3つを1ページで引けるようにするのがこのツール。
 *
 * ■ 令和8年度改定の流れ（このツールが扱う状態）
 * 1. **目安**（令和8年7月28日・中央最低賃金審議会の答申）
 *    ランクごとの引上げ額の目安が示される。Aランク54円・Bランク56円・Cランク56円。
 *    目安どおりなら全国加重平均は 1,121円 → 1,176円（+55円）
 * 2. **答申**（8〜9月・各都道府県の地方最低賃金審議会）
 *    県ごとの金額と効力発生予定日が決まる。**目安を上回る県がある**ので、
 *    目安から機械的に足した額を確定額として見せてはいけない
 * 3. **発効**（10月〜）異議申出の手続と官報公示を経て実際に効力が生じる
 *
 * そのため各県の令和8年度額は「目安ベースの見込み」か「答申済み」かを
 * `RevisionStatus` で必ず区別する。答申が確認できた県だけ `answered` を持たせ、
 * 持たない県は目安から計算した**見込み**として表示する（断定しない）。
 *
 * ■ 出典は各エントリの必須フィールド
 * 現行額は `source`、答申額は `answered.source` に一次情報のURLを持たせている
 * （厚生労働省または各都道府県労働局）。UIはこのURLを根拠リンクとして出すので、
 * **出典を確認せずにエントリを足さないこと**。tests/saitei-chingin.test.ts が
 * 出典の欠落を落とす。
 *
 * ■ 一次情報（2026-08-19 取得）
 * - 厚生労働省「地域別最低賃金の全国一覧」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
 *   → PDF「令和７年度地域別最低賃金全国一覧」の表を47件そのまま写したものが
 *     `currentYen` / `currentEffectiveOn`（全国加重平均1,121円もこの表）
 * - 厚生労働省「令和８年度地域別最低賃金額改定の目安について」（令和8年7月28日）
 *   https://www.mhlw.go.jp/stf/newpage_74920.html
 *   → `rank` とランク別目安額 `MEYASU_BY_RANK`、目安どおりの全国加重平均1,176円
 * - 各都道府県労働局の答申の報道発表 → `answered.source`（県ごとに異なる）
 *
 * 【データ更新箇所】県の答申が出たら PREFECTURES の該当エントリに `answered` を足し、
 * 発効したら `answered.effectiveOn` を過ぎるので表示は自動で「発効済み」に変わる。
 * 翌年度の改定では `currentYen` / `currentEffectiveOn` を新しい額に置き換え、
 * `answered` を全件外して `MEYASU_BY_RANK` を新しい目安に入れ替える。
 * **確認したら数値が変わらなくても DATA_CHECKED_AT を必ず更新する**
 * （「確認済みで変化なし」と「確認していない」を区別するため）。
 */
import { evaluateKabe, nextWall, type KabeResult } from './nenshu-kabe';

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-08-19';

/** 現行（改定前）の年度。表の見出しに使う */
export const CURRENT_FY_LABEL = '令和7年度';

/** 改定後の年度。表の見出しに使う */
export const REVISED_FY_LABEL = '令和8年度';

/** 中央最低賃金審議会が令和8年度の目安を答申した日 */
export const MEYASU_ANSWERED_ON = '2026-07-28';

/**
 * 目安制度のランク。地域の経済実態に応じて47都道府県を3つに分けたもので、
 * ランクごとに引上げ額の目安が示される。
 */
export type Rank = 'A' | 'B' | 'C';

/**
 * 令和8年度のランク別引上げ額の目安（円）。
 * 【データ更新箇所】毎年7月末の中央最低賃金審議会の答申で入れ替わる。
 */
export const MEYASU_BY_RANK: Record<Rank, number> = { A: 54, B: 56, C: 56 };

/** 全国加重平均（円）。目安どおりに改定された場合の値を meyasu に持つ */
export const NATIONAL_AVERAGE = { current: 1121, meyasu: 1176 } as const;

/** 一次情報へのリンク */
export interface Source {
  /** 出典の名前（例: '厚生労働省'）。UIには「出典：〇〇（YYYY-MM-DD確認）」と出す */
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

/** 厚生労働省「地域別最低賃金の全国一覧」。現行額と発効日の出典 */
export const SOURCE_MHLW_LIST: Source = {
  label: '厚生労働省「地域別最低賃金の全国一覧」',
  url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/',
  checkedAt: DATA_CHECKED_AT,
};

/** 厚生労働省「令和８年度地域別最低賃金額改定の目安について」。ランクと目安額の出典 */
export const SOURCE_MHLW_MEYASU: Source = {
  label: '厚生労働省「令和８年度地域別最低賃金額改定の目安について」',
  url: 'https://www.mhlw.go.jp/stf/newpage_74920.html',
  checkedAt: DATA_CHECKED_AT,
};

/** 地方最低賃金審議会の答申。金額が確定に近づいた県だけが持つ */
export interface Answered {
  /** 答申された時間額（円） */
  yen: number;
  /** 答申された日 'YYYY-MM-DD'。労働局の発表に日付が無ければ持たない */
  answeredOn?: string;
  /**
   * 効力発生（発効）予定日 'YYYY-MM-DD'。
   * 答申の発表時点で日付を示していない労働局があるので任意。
   * **推測で埋めないこと**（10月1日と決め打ちすると県によって外れる）
   */
  effectiveOn?: string;
  /** 答申の出典（都道府県労働局の報道発表など）。必須 */
  source: Source;
}

/** 早見表の1行にあたる都道府県 */
export interface Prefecture {
  /** JISの都道府県コード（1〜47）。並び順の基準にもする */
  code: number;
  name: string;
  rank: Rank;
  /** 現行（令和7年度）の地域別最低賃金の時間額（円） */
  currentYen: number;
  /** 現行額の発効日 'YYYY-MM-DD' */
  currentEffectiveOn: string;
  /** 現行額の出典。必須 */
  source: Source;
  /** 令和8年度の答申。まだ答申が確認できていない県は持たない */
  answered?: Answered;
}

/**
 * 47都道府県のデータ。
 *
 * `currentYen` / `currentEffectiveOn` は厚労省「令和７年度地域別最低賃金全国一覧」、
 * `rank` は厚労省「令和８年度地域別最低賃金額改定の目安について」から。
 * `answered` は都道府県労働局の報道発表で確認できたものだけを入れている
 * （2026-08-19 時点で30都道府県。残りは目安ベースの見込み表示になる）。
 *
 * `effectiveOn` は労働局が日付を示しているものだけに入れる。答申文が
 * 「効力発生の日 法定どおり」とだけ書く県（群馬・岡山の答申文など）や、
 * 「最短で」「早ければ」10月◯日と条件付きで書く県（岐阜・富山・新潟）は
 * **持たせない**。持たせないと発効日が来ても status は '答申' のままになるが、
 * 決め打ちして実際とずれるより安全側に倒す（Answered.effectiveOn のコメント参照）。
 */
export const PREFECTURES: Prefecture[] = [
  {
    code: 1,
    name: '北海道',
    rank: 'B',
    currentYen: 1075,
    currentEffectiveOn: '2025-10-04',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1131,
      effectiveOn: '2026-10-01',
      source: {
        label: '北海道労働局「令和８年度北海道最低賃金額の改正を答申」',
        url: 'https://jsite.mhlw.go.jp/hokkaido-roudoukyoku/content/contents/002762932.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 2, name: '青森', rank: 'C', currentYen: 1029, currentEffectiveOn: '2025-11-21', source: SOURCE_MHLW_LIST },
  { code: 3, name: '岩手', rank: 'C', currentYen: 1031, currentEffectiveOn: '2025-12-01', source: SOURCE_MHLW_LIST },
  {
    code: 4,
    name: '宮城',
    rank: 'B',
    currentYen: 1038,
    currentEffectiveOn: '2025-10-04',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1098,
      answeredOn: '2026-08-05',
      effectiveOn: '2026-10-01',
      source: {
        label: '宮城労働局「令和８年度宮城県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/miyagi-roudoukyoku/content/contents/002764301.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 5,
    name: '秋田',
    rank: 'C',
    currentYen: 1031,
    currentEffectiveOn: '2026-03-31',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1090,
      answeredOn: '2026-08-18',
      effectiveOn: '2026-10-14',
      source: {
        label: '秋田労働局「秋田県最低賃金を時間額1,090円に」',
        url: 'https://jsite.mhlw.go.jp/akita-roudoukyoku/content/contents/002779440.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 6, name: '山形', rank: 'C', currentYen: 1032, currentEffectiveOn: '2025-12-23', source: SOURCE_MHLW_LIST },
  { code: 7, name: '福島', rank: 'B', currentYen: 1033, currentEffectiveOn: '2026-01-01', source: SOURCE_MHLW_LIST },
  { code: 8, name: '茨城', rank: 'B', currentYen: 1074, currentEffectiveOn: '2025-10-12', source: SOURCE_MHLW_LIST },
  {
    code: 9,
    name: '栃木',
    rank: 'B',
    currentYen: 1068,
    currentEffectiveOn: '2025-10-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1125,
      answeredOn: '2026-08-05',
      effectiveOn: '2026-10-01',
      source: {
        label: '栃木労働局「令和８年度栃木県最低賃金の改定を答申」',
        url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/content/contents/002764774.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 10,
    name: '群馬',
    rank: 'B',
    currentYen: 1063,
    currentEffectiveOn: '2026-03-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1120,
      answeredOn: '2026-08-06',
      // 答申文の「効力発生の日」が「法定どおり」で、日付が示されていない
      source: {
        label: '群馬労働局「群馬県最低賃金の改正決定の答申を受けました」',
        url: 'https://jsite.mhlw.go.jp/gunma-roudoukyoku/newpage_01009.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 11,
    name: '埼玉',
    rank: 'A',
    currentYen: 1141,
    currentEffectiveOn: '2025-11-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1196,
      answeredOn: '2026-08-05',
      effectiveOn: '2026-10-01',
      source: {
        label: '埼玉労働局「埼玉県最低賃金の改正を答申」',
        url: 'https://jsite.mhlw.go.jp/saitama-roudoukyoku/content/contents/002766352.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 12,
    name: '千葉',
    rank: 'A',
    currentYen: 1140,
    currentEffectiveOn: '2025-10-03',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1195,
      answeredOn: '2026-08-05',
      source: {
        label: '千葉労働局「千葉県最低賃金の55円の引上げを答申」',
        url: 'https://jsite.mhlw.go.jp/chiba-roudoukyoku/news_topics/_20260805_chingin_00001.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 13,
    name: '東京',
    rank: 'A',
    currentYen: 1226,
    currentEffectiveOn: '2025-10-03',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1280,
      answeredOn: '2026-08-05',
      source: {
        label: '東京労働局「東京都最低賃金の54円引上げを答申」',
        url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/news_topics/houdou/20260805chinginka_0001.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 14,
    name: '神奈川',
    rank: 'A',
    currentYen: 1225,
    currentEffectiveOn: '2025-10-04',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1279,
      answeredOn: '2026-08-04',
      effectiveOn: '2026-10-01',
      source: {
        label: '神奈川労働局「神奈川県最低賃金額54円の引上げへ」',
        url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/home/houdou/20260804_00001.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 15,
    name: '新潟',
    rank: 'B',
    currentYen: 1050,
    currentEffectiveOn: '2025-10-02',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1108,
      answeredOn: '2026-08-05',
      // 報道発表は「早ければ令和8年10月1日から適用」と条件付きなので日付は持たせない
      source: {
        label: '新潟労働局「令和８年度新潟県最低賃金の改正決定について」',
        url: 'https://jsite.mhlw.go.jp/niigata-roudoukyoku/content/contents/R080806_4_08saichin.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 16,
    name: '富山',
    rank: 'B',
    currentYen: 1062,
    currentEffectiveOn: '2025-10-12',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1119,
      answeredOn: '2026-08-05',
      // 労働局の告知は「早ければ10月1日から」と条件付きなので日付は持たせない
      source: {
        label: '富山労働局「富山県最低賃金 時間額1,119円と答申されました」',
        url: 'https://jsite.mhlw.go.jp/toyama-roudoukyoku/news_topics/oshirase/_120032/R08saichin_toushin_00007.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 17,
    name: '石川',
    rank: 'B',
    currentYen: 1054,
    currentEffectiveOn: '2025-10-08',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1113,
      answeredOn: '2026-08-07',
      effectiveOn: '2026-10-03',
      source: {
        label: '石川労働局「令和８年度石川県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/ishikawa-roudoukyoku/content/contents/002767504.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 18,
    name: '福井',
    rank: 'B',
    currentYen: 1053,
    currentEffectiveOn: '2025-10-08',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1112,
      answeredOn: '2026-08-10',
      effectiveOn: '2026-10-04',
      source: {
        label: '福井労働局「時給１，１１２円を答申」',
        url: 'https://jsite.mhlw.go.jp/fukui-roudoukyoku/content/contents/002765836.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 19, name: '山梨', rank: 'B', currentYen: 1052, currentEffectiveOn: '2025-12-01', source: SOURCE_MHLW_LIST },
  {
    code: 20,
    name: '長野',
    rank: 'B',
    currentYen: 1061,
    currentEffectiveOn: '2025-10-03',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1117,
      answeredOn: '2026-08-06',
      effectiveOn: '2026-10-02',
      source: {
        label: '長野労働局「長野県最低賃金 時間額1117円を答申」',
        url: 'https://jsite.mhlw.go.jp/nagano-roudoukyoku/content/contents/002765894.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 21,
    name: '岐阜',
    rank: 'B',
    currentYen: 1065,
    currentEffectiveOn: '2025-10-18',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1121,
      answeredOn: '2026-08-05',
      // 報道発表は「最短で令和8年10月1日から」と条件付きなので日付は持たせない
      source: {
        label: '岐阜労働局「岐阜県最低賃金を1,121円に」',
        url: 'https://jsite.mhlw.go.jp/gifu-roudoukyoku/content/contents/002764173.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 22,
    name: '静岡',
    rank: 'B',
    currentYen: 1097,
    currentEffectiveOn: '2025-11-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1154,
      answeredOn: '2026-08-12',
      effectiveOn: '2026-10-15',
      source: {
        label: '静岡労働局「令和8年度静岡県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/shizuoka-roudoukyoku/news_topics/newpage_00035.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 23,
    name: '愛知',
    rank: 'A',
    currentYen: 1140,
    currentEffectiveOn: '2025-10-18',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1195,
      answeredOn: '2026-08-05',
      effectiveOn: '2026-10-01',
      source: {
        label: '愛知労働局「最低賃金・家内労働関係のお知らせ」',
        url: 'https://jsite.mhlw.go.jp/aichi-roudoukyoku/jirei_toukei/chingin_kanairoudou/oshirase.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 24,
    name: '三重',
    rank: 'B',
    currentYen: 1087,
    currentEffectiveOn: '2025-11-21',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1143,
      answeredOn: '2026-08-05',
      effectiveOn: '2026-10-01',
      source: {
        label: '三重労働局「三重県最低賃金 令和8年10月1日から、時間額1,143円を答申」',
        url: 'https://jsite.mhlw.go.jp/mie-roudoukyoku/news_topics/houdou/chingin_shingikai_20260805_001_00002.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 25,
    name: '滋賀',
    rank: 'B',
    currentYen: 1080,
    currentEffectiveOn: '2025-10-05',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1136,
      answeredOn: '2026-08-07',
      effectiveOn: '2026-10-03',
      source: {
        label: '滋賀労働局「滋賀県最低賃金の改正決定の答申について」',
        url: 'https://jsite.mhlw.go.jp/shiga-roudoukyoku/content/contents/002767709.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 26, name: '京都', rank: 'B', currentYen: 1122, currentEffectiveOn: '2025-11-21', source: SOURCE_MHLW_LIST },
  {
    code: 27,
    name: '大阪',
    rank: 'A',
    currentYen: 1177,
    currentEffectiveOn: '2025-10-16',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1231,
      answeredOn: '2026-08-07',
      source: {
        label: '大阪労働局「大阪府最低賃金の改正決定について答申を行いました」',
        url: 'https://jsite.mhlw.go.jp/osaka-roudoukyoku/2026_saichin_372.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 28,
    name: '兵庫',
    rank: 'B',
    currentYen: 1116,
    currentEffectiveOn: '2025-10-04',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1172,
      answeredOn: '2026-08-04',
      effectiveOn: '2026-10-01',
      source: {
        label: '兵庫労働局「兵庫県最低賃金 時間額56円引上げを答申」',
        url: 'https://jsite.mhlw.go.jp/hyogo-roudoukyoku/home/sintyaku_itiran/news_topics/houdou/20260805-1_00001.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 29,
    name: '奈良',
    rank: 'B',
    currentYen: 1051,
    currentEffectiveOn: '2025-11-16',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1107,
      answeredOn: '2026-08-10',
      effectiveOn: '2026-10-04',
      source: {
        label: '奈良労働局「令和８年度奈良県最低賃金の改正決定について（答申）」',
        url: 'https://jsite.mhlw.go.jp/nara-roudoukyoku/content/contents/002769907.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 30,
    name: '和歌山',
    rank: 'B',
    currentYen: 1045,
    currentEffectiveOn: '2025-11-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1101,
      answeredOn: '2026-08-07',
      // 報道発表に効力発生予定日の記載が無い
      source: {
        label: '和歌山労働局「令和８年度和歌山県最低賃金の改正決定の答申について」',
        url: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/content/contents/002769441.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 31,
    name: '鳥取',
    rank: 'C',
    currentYen: 1030,
    currentEffectiveOn: '2025-10-04',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1090,
      answeredOn: '2026-08-07',
      effectiveOn: '2026-10-03',
      source: {
        label: '鳥取労働局「令和8年度鳥取県最低賃金の答申について」',
        url: 'https://jsite.mhlw.go.jp/tottori-roudoukyoku/newpage_02554.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 32,
    name: '島根',
    rank: 'B',
    currentYen: 1033,
    currentEffectiveOn: '2025-11-17',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1092,
      answeredOn: '2026-08-14',
      effectiveOn: '2026-10-10',
      source: {
        label: '島根労働局「島根県最低賃金 59円の引上げ 時間額1,092円に」',
        url: 'https://jsite.mhlw.go.jp/shimane-roudoukyoku/saichin1092.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 33,
    name: '岡山',
    rank: 'B',
    currentYen: 1047,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1104,
      answeredOn: '2026-08-06',
      effectiveOn: '2026-10-02',
      source: {
        label: '岡山労働局「岡山県最低賃金57円引上げを答申」',
        url: 'https://jsite.mhlw.go.jp/okayama-roudoukyoku/newpage_502shimonn_00010.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 34,
    name: '広島',
    rank: 'B',
    currentYen: 1085,
    currentEffectiveOn: '2025-11-01',
    source: SOURCE_MHLW_LIST,
    // 広島労働局は報道発表ではなく異議申出のための公示で額と発効日を示している。
    // 公示は最低賃金法11条・12条にもとづく一次情報なので、これを出典にする
    answered: {
      yen: 1141,
      answeredOn: '2026-08-17',
      effectiveOn: '2026-10-11',
      source: {
        label: '広島労働局「広島県最低賃金改正決定に係る関係者からの意見に関する公示」',
        url: 'https://jsite.mhlw.go.jp/hiroshima-roudoukyoku/content/contents/002778056.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 35,
    name: '山口',
    rank: 'B',
    currentYen: 1043,
    currentEffectiveOn: '2025-10-16',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1101,
      answeredOn: '2026-08-12',
      effectiveOn: '2026-10-08',
      source: {
        label: '山口労働局「山口県最低賃金を58円引き上げ、時間額1,101円に」',
        url: 'https://jsite.mhlw.go.jp/yamaguchi-roudoukyoku/content/contents/002773410.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 36, name: '徳島', rank: 'B', currentYen: 1046, currentEffectiveOn: '2026-01-01', source: SOURCE_MHLW_LIST },
  {
    code: 37,
    name: '香川',
    rank: 'B',
    currentYen: 1036,
    currentEffectiveOn: '2025-10-18',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1092,
      answeredOn: '2026-08-05',
      // 発表資料に効力発生予定日の記載が無い
      source: {
        label: '香川労働局「令和８年度香川県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/kagawa-roudoukyoku/content/contents/002764393.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 38, name: '愛媛', rank: 'B', currentYen: 1033, currentEffectiveOn: '2025-12-01', source: SOURCE_MHLW_LIST },
  { code: 39, name: '高知', rank: 'C', currentYen: 1023, currentEffectiveOn: '2025-12-01', source: SOURCE_MHLW_LIST },
  {
    code: 40,
    name: '福岡',
    rank: 'B',
    currentYen: 1057,
    currentEffectiveOn: '2025-11-16',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1114,
      answeredOn: '2026-08-10',
      effectiveOn: '2026-10-04',
      source: {
        label: '福岡労働局「令和8年度の福岡県最低賃金の改正決定について答申が行われました」',
        url: 'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/photoreport/03192.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  { code: 41, name: '佐賀', rank: 'C', currentYen: 1030, currentEffectiveOn: '2025-11-21', source: SOURCE_MHLW_LIST },
  { code: 42, name: '長崎', rank: 'C', currentYen: 1031, currentEffectiveOn: '2025-12-01', source: SOURCE_MHLW_LIST },
  { code: 43, name: '熊本', rank: 'C', currentYen: 1034, currentEffectiveOn: '2026-01-01', source: SOURCE_MHLW_LIST },
  { code: 44, name: '大分', rank: 'C', currentYen: 1035, currentEffectiveOn: '2026-01-01', source: SOURCE_MHLW_LIST },
  { code: 45, name: '宮崎', rank: 'C', currentYen: 1023, currentEffectiveOn: '2025-11-16', source: SOURCE_MHLW_LIST },
  { code: 46, name: '鹿児島', rank: 'C', currentYen: 1026, currentEffectiveOn: '2025-11-01', source: SOURCE_MHLW_LIST },
  { code: 47, name: '沖縄', rank: 'C', currentYen: 1023, currentEffectiveOn: '2025-12-01', source: SOURCE_MHLW_LIST },
];

/**
 * 令和8年度額の確からしさ。
 *
 * - `目安`: 答申がまだなので、ランク別の目安額を足した**見込み**
 * - `答申`: 地方最低賃金審議会が金額を答申済み（発効前）
 * - `発効済み`: 答申の効力発生日を過ぎている
 */
export type RevisionStatus = '目安' | '答申' | '発効済み';

/** 令和8年度の改定の状態 */
export interface Revision {
  status: RevisionStatus;
  /** 令和8年度の時間額（円）。status が '目安' のときは見込みの額 */
  yen: number;
  /** 現行額からの引上げ額（円） */
  raise: number;
  /** 引上げ率（％・小数第1位まで） */
  raisePercent: number;
  /** 発効（予定）日 'YYYY-MM-DD'。未公表なら持たない */
  effectiveOn?: string;
  /** 答申日 'YYYY-MM-DD'。答申前・未公表なら持たない */
  answeredOn?: string;
  /** この金額の根拠。目安なら厚労省の目安、答申済みなら労働局の発表 */
  source: Source;
}

/** 'YYYY-MM-DD' に揃える。Date の比較は文字列でできる形にしてから行う */
function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 令和8年度の改定内容を返す。
 *
 * 答申が確認できていない県は「現行額 + ランク別の目安額」を**見込み**として返す。
 * 目安を上回る答申を出す県があるため、この値を確定額として見せてはいけない
 * （UI は status を必ず添えて表示する）。
 *
 * @param asOf 判定の基準日。省略時は現在日。静的書き出しなのでビルド時刻で固定しない
 */
export function revisionOf(pref: Prefecture, asOf: Date = new Date()): Revision {
  const answered = pref.answered;
  const yen = answered ? answered.yen : pref.currentYen + MEYASU_BY_RANK[pref.rank];
  const raise = yen - pref.currentYen;
  const raisePercent = Math.round((raise / pref.currentYen) * 1000) / 10;

  if (!answered) {
    return { status: '目安', yen, raise, raisePercent, source: SOURCE_MHLW_MEYASU };
  }

  const effective =
    answered.effectiveOn !== undefined && toYmd(asOf) >= answered.effectiveOn;

  return {
    status: effective ? '発効済み' : '答申',
    yen,
    raise,
    raisePercent,
    effectiveOn: answered.effectiveOn,
    answeredOn: answered.answeredOn,
    source: answered.source,
  };
}

/** 都道府県コードから引く。未登録のコードは undefined */
export function prefectureByCode(code: number): Prefecture | undefined {
  return PREFECTURES.find((p) => p.code === code);
}

/**
 * 都道府県名から引く。'東京都' のような表記ゆれも受ける。
 * 「北海道」は末尾の「道」を落とすと引けなくなるので、先に完全一致を試す。
 */
export function prefectureByName(name: string): Prefecture | undefined {
  const exact = PREFECTURES.find((p) => p.name === name);
  if (exact) return exact;
  const normalized = name.replace(/[都道府県]$/, '');
  return PREFECTURES.find((p) => p.name === normalized);
}

/** 時給が最低賃金を満たしているかの判定（1つの金額に対して） */
export interface WageVerdict {
  /** 比較した最低賃金（円） */
  minimumYen: number;
  /** 時給が最低賃金以上か。最低賃金は「以上」であればよい（同額はセーフ） */
  meets: boolean;
  /** 不足額（円）。満たしていれば 0、上回っていれば余裕額は surplus 側に出る */
  shortfall: number;
  /** 上回っている額（円）。不足していれば 0 */
  surplus: number;
}

/** 時給チェックの結果 */
export interface WageCheck {
  prefecture: Prefecture;
  /** 入力された時給（円） */
  hourlyYen: number;
  /** 現行（令和7年度）の最低賃金との比較 */
  current: WageVerdict;
  /** 令和8年度の改定額との比較。改定額は revision.status で確からしさが分かる */
  revised: WageVerdict;
  revision: Revision;
}

function verdict(hourlyYen: number, minimumYen: number): WageVerdict {
  const diff = hourlyYen - minimumYen;
  return {
    minimumYen,
    // 最低賃金法は「最低賃金額以上の賃金を支払わなければならない」なので同額はセーフ
    meets: diff >= 0,
    shortfall: diff < 0 ? -diff : 0,
    surplus: diff > 0 ? diff : 0,
  };
}

/**
 * 時給が最低賃金を下回っていないかを、現行額と令和8年度額の両方で判定する。
 *
 * 端数のある時給（1,050.5円など）も入力され得るが、最低賃金の比較は
 * 実際の時間給と最低賃金額をそのまま比べるので、丸めずに扱う。
 */
export function checkWage(
  pref: Prefecture,
  hourlyYen: number,
  asOf: Date = new Date(),
): WageCheck {
  const revision = revisionOf(pref, asOf);
  return {
    prefecture: pref,
    hourlyYen,
    current: verdict(hourlyYen, pref.currentYen),
    revised: verdict(hourlyYen, revision.yen),
    revision,
  };
}

/** 年間の週数。月収は「週の労働時間 × 52週 ÷ 12か月」で均した概算にする */
export const WEEKS_PER_YEAR = 52;

/** 月収・年収の概算 */
export interface Income {
  /** 月収（円・概算） */
  monthly: number;
  /** 年収（円・概算） */
  annual: number;
}

/**
 * 時給と週の労働時間から月収・年収を概算する。
 *
 * 月ごとの日数の違いをならすため、年間52週として計算し12で割る。
 * 賞与・残業代・交通費は含まない（時給制の働き方を前提にした概算）。
 */
export function estimateIncome(hourlyYen: number, hoursPerWeek: number): Income {
  const annual = Math.round(Math.max(0, hourlyYen) * Math.max(0, hoursPerWeek) * WEEKS_PER_YEAR);
  return { monthly: Math.round(annual / 12), annual };
}

/** 年収の壁を引くときの働き方の条件 */
export interface WallOptions {
  /**
   * 週の所定労働時間。20時間以上だと勤務先の社会保険の加入要件にかかり、
   * 加入する人は家族の扶養から外れるので130万円の壁には到達しない。
   */
  hoursPerWeek: number;
  /** 勤務先の従業員数が51人以上か。分からない人が多いので既定は false */
  size51?: boolean;
  /** 判定の基準日。省略時は現在日 */
  asOf?: Date;
}

/**
 * 年収から「年収の壁」の判定を引く。
 *
 * 壁の金額・施行日・適用条件は lib/nenshu-kabe.ts が単一の情報源なので、
 * ここでは持たない（106万円の壁は2026年10月1日の賃金要件撤廃で自動的に消える）。
 * 時給で働く人の入口として、配偶者の扶養内で働くケース（position: 'spouse'）で評価する。
 * 立場ごとの細かい判定は年収の壁ツールに任せ、ここは「次の壁までいくら」を出すだけにする。
 */
export function wallsFor(annualYen: number, options: WallOptions): KabeResult[] {
  return evaluateKabe({
    income: annualYen,
    position: 'spouse',
    size51: options.size51 ?? false,
    hours20: options.hoursPerWeek >= 20,
    asOf: options.asOf,
  });
}

/** 次に到達する年収の壁（未到達のうち最も近いもの）。無ければ undefined */
export function nextWallFor(annualYen: number, options: WallOptions): KabeResult | undefined {
  return nextWall(wallsFor(annualYen, options));
}

/** 1,234 → '1,234円' */
export function formatYen(yen: number): string {
  return `${Math.round(yen).toLocaleString('ja-JP')}円`;
}

/** '2026-10-01' → '2026年10月1日' */
export function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}
