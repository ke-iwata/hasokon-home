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
 * 3. **決定・公示**（8月末〜9月）意見の要旨の公示から15日の異議申出（第11条）を経て
 *    労働局長が改正を決定し（第12条）、決定した事項を公示する（第14条第1項）。
 *    ここで効力発生日が確定する
 * 4. **発効**（10月〜）公示の日から30日を経過した日、または決定が別に定めた日に
 *    効力が生じる（第14条第2項）
 *
 * `RevisionStatus` は 3. を独立した状態にせず `'答申'` に含める。
 * 決定公示の確認が取れているのは一部の県だけで、状態として出すと
 * 「確認できていない県＝まだ決まっていない」と読めてしまうため
 * （決定の段階を見せるかは別提案。docs/features/saitei-chingin-r8-hakko-mae-mente.md）。
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
 * ■ 一次情報（2026-09-09 取得）
 * - 厚生労働省「地域別最低賃金の全国一覧」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
 *   → PDF「令和７年度地域別最低賃金全国一覧」の表を47件そのまま写したものが
 *     `currentYen` / `currentEffectiveOn`（全国加重平均1,121円もこの表）
 * - 厚生労働省「令和８年度地域別最低賃金額改定の目安について」（令和8年7月28日）
 *   https://www.mhlw.go.jp/stf/newpage_74920.html
 *   → `rank` とランク別目安額 `MEYASU_BY_RANK`、目安どおりの全国加重平均1,176円
 * - 各都道府県労働局の答申の報道発表 → `answered.source`（県ごとに異なる）
 *
 * ■ 一次情報（2026-09-16 取得・10月発効前のメンテ）
 * - 厚生労働省「（別紙）令和８年度地域別最低賃金額答申状況」
 *   https://www.mhlw.go.jp/content/11302000/001745621.pdf
 *   → `plannedEffectiveOn`（労働局の決定公示がまだ確認できない県の「発効日（予定）」）と
 *     答申ベースの全国加重平均 `NATIONAL_AVERAGE.answered`
 * - 各都道府県労働局の**決定・公示**の発表 → `effectiveOn` / `source`
 *
 * 【データ更新箇所】県の答申が出たら PREFECTURES の該当エントリに `answered` を足し、
 * 決定公示が出たら `effectiveOn` を入れて `source` を決定公示のページへ差し替える
 * （`plannedEffectiveOn` は消す）。発効したら `answered.effectiveOn` を過ぎるので
 * 表示は自動で「発効済み」に変わる。
 * 翌年度の改定では `currentYen` / `currentEffectiveOn` を新しい額に置き換え、
 * `answered` を全件外して `MEYASU_BY_RANK` を新しい目安に入れ替える。
 * **確認したら数値が変わらなくても DATA_CHECKED_AT を必ず更新する**
 * （「確認済みで変化なし」と「確認していない」を区別するため）。
 */
import { evaluateKabe, nextWall, type KabeResult } from './nenshu-kabe';

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-09-16';

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

/**
 * 全国加重平均（円）。
 *
 * - `meyasu`: 目安どおりに改定された場合の値（+55円）
 * - `answered`: 47都道府県の**答申額**で計算し直した実績値（+56円）。
 *   目安を上回る答申を出した県があるため目安より1円高い。
 *   出典は厚労省「（別紙）令和８年度地域別最低賃金額答申状況」
 *
 * 【データ更新箇所】翌年度の目安が出たら `current` を今年度の答申ベースに繰り上げ、
 * `meyasu` を新しい目安に入れ替え、`answered` は答申がそろうまで外す。
 */
export const NATIONAL_AVERAGE = { current: 1121, meyasu: 1176, answered: 1177 } as const;

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

/**
 * 厚生労働省「（別紙）令和８年度地域別最低賃金額答申状況」。
 * 全県の「発効日（予定）」と答申ベースの全国加重平均が載っている一覧表で、
 * `plannedEffectiveOn` と `NATIONAL_AVERAGE.answered` の出典。
 *
 * **これは「予定」であって決定ではない**（異議申出で動く余地がある）ので、
 * ここから `effectiveOn` を埋めてはいけない。
 */
export const SOURCE_MHLW_BESSHI: Source = {
  label: '厚生労働省「（別紙）令和８年度地域別最低賃金額答申状況」',
  url: 'https://www.mhlw.go.jp/content/11302000/001745621.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 地方最低賃金審議会の答申。金額が確定に近づいた県だけが持つ */
export interface Answered {
  /** 答申された時間額（円） */
  yen: number;
  /** 答申された日 'YYYY-MM-DD'。労働局の発表に日付が無ければ持たない */
  answeredOn?: string;
  /**
   * 効力発生（発効）日 'YYYY-MM-DD'。
   * **決定公示で確認した日付だけを入れる。予定は `plannedEffectiveOn`**。
   * 答申の発表時点で日付を示していない労働局があるので任意で、
   * **推測で埋めないこと**（10月1日と決め打ちすると県によって外れる）。
   * 労働局が決定公示や県の最低賃金ページで日付を示したら、そこで初めて入れる。
   */
  effectiveOn?: string;
  /**
   * 厚労省の別紙が示す「発効日（予定）」'YYYY-MM-DD'。
   * **`effectiveOn` が無い県だけが持つ**（決定が確認できたら `effectiveOn` に移す）。
   * UIには「◯月◯日 発効予定」と**予定である旨を添えて**出す。
   * これだけでは `'発効済み'` に切り替えない（異議申出で動く余地があるため）。
   * 出典は `SOURCE_MHLW_BESSHI`。
   */
  plannedEffectiveOn?: string;
  /**
   * 答申（決定公示が出た県は決定公示）の出典。必須。
   * 労働局のPDFは差し替えでURLが変わりやすいので、
   * **PDF直リンクではなく報道発表のHTMLページを選ぶ**
   */
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
 * （2026-09-09 の第4次追補で47都道府県すべてがそろった。令和8年度は
 * 沖縄の 2026-09-03 答申が最後で、以後は発効日が来るのを待つだけになる）。
 * なお `revisionOf()` は `answered` を持たない県を「目安」として扱うので、
 * 全件そろった今も**目安の分岐を消してはいけない**（翌年度の改定でまた全件が
 * 未答申に戻る。UIの状態表示もこの分岐の上に載っている）。
 *
 * `effectiveOn` は労働局が日付を示しているものだけに入れる。答申文が
 * 「効力発生の日 法定どおり」とだけ書く県や、「最短で」「早ければ」10月◯日と
 * 条件付きで書く県は**持たせない**。決め打ちして実際とずれるより安全側に倒す
 * （Answered.effectiveOn のコメント参照）。
 *
 * 2026-09-16 の発効前メンテで、答申時に日付が無かった11県のうち9県は
 * 労働局の**決定公示・県の最低賃金ページ**で発効日を確認できたので `effectiveOn` を入れ、
 * 出典もそのページへ差し替えた。まだ確認できない宮崎・鹿児島は、厚労省の別紙が示す
 * 「発効日（予定）」を `plannedEffectiveOn` として持たせている（`'発効済み'` にはしない）。
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
  {
    code: 2,
    name: '青森',
    rank: 'C',
    currentYen: 1029,
    currentEffectiveOn: '2025-11-21',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1090,
      answeredOn: '2026-08-26',
      effectiveOn: '2026-10-29',
      source: {
        label: '青森労働局「青森県最低賃金を時間額１，０９０円に」',
        url: 'https://jsite.mhlw.go.jp/aomori-roudoukyoku/content/contents/002788111.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 3,
    name: '岩手',
    rank: 'C',
    currentYen: 1031,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1090,
      answeredOn: '2026-08-31',
      effectiveOn: '2026-12-01',
      source: {
        label: '岩手労働局「令和８年度岩手県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/iwate-roudoukyoku/content/contents/002798636.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
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
  {
    code: 6,
    name: '山形',
    rank: 'C',
    currentYen: 1032,
    currentEffectiveOn: '2025-12-23',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1092,
      answeredOn: '2026-08-27',
      effectiveOn: '2026-10-30',
      source: {
        label: '山形労働局「山形県最低賃金を60円引上げ、時間額1,092円に」',
        url: 'https://jsite.mhlw.go.jp/yamagata-roudoukyoku/toushinn-20260827.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 7,
    name: '福島',
    rank: 'B',
    currentYen: 1033,
    currentEffectiveOn: '2026-01-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1094,
      answeredOn: '2026-08-20',
      effectiveOn: '2026-10-16',
      source: {
        label: '福島労働局「福島県最低賃金（時間額）を1,094円（＋61円）に引上げ」',
        url: 'https://jsite.mhlw.go.jp/fukushima-roudoukyoku/content/contents/002783612.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 8,
    name: '茨城',
    rank: 'B',
    currentYen: 1074,
    currentEffectiveOn: '2025-10-12',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1136,
      answeredOn: '2026-08-24',
      effectiveOn: '2026-10-18',
      source: {
        label: '茨城労働局「令和8年度茨城県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/ibaraki-roudoukyoku/content/contents/chingin_press_R080824_toushin1136yen.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
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
      // 答申文の「効力発生の日」は「法定どおり」だったが、改正決定の報道発表で
      // 10月3日と示された
      effectiveOn: '2026-10-03',
      source: {
        label: '群馬労働局「「群馬県最低賃金」は10月3日から時間額1,120円に引き上げ」',
        url: 'https://jsite.mhlw.go.jp/gunma-roudoukyoku/newpage_01031.html',
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
      effectiveOn: '2026-10-01',
      source: {
        label:
          '千葉労働局「千葉県最低賃金を時間額「1,195円」に引き上げ－効力発生日は令和8年10月1日－」',
        url: 'https://jsite.mhlw.go.jp/chiba-roudoukyoku/news_topics/_20260901_chingin_00003.html',
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
      effectiveOn: '2026-10-01',
      source: {
        label: '東京労働局「東京都最低賃金を1,280円に引上げます」（決定・官報公示）',
        url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/news_topics/houdou/20260901chinginka_00001.html',
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
      // 答申時は「早ければ」の条件付きだったが、改正決定の告知で10月1日と確定した
      effectiveOn: '2026-10-01',
      source: {
        label:
          '新潟労働局「新潟県最低賃金を時間額1,108円に改正 令和8年10月1日から適用となります」',
        url: 'https://jsite.mhlw.go.jp/niigata-roudoukyoku/sintyaku_01097.html',
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
      // 答申時は「早ければ10月1日から」の条件付きだったが、改正の告知で10月1日と確定した
      effectiveOn: '2026-10-01',
      source: {
        label: '富山労働局「富山県最低賃金を改正します～10月1日から時間額1,119円に～」',
        url: 'https://jsite.mhlw.go.jp/toyama-roudoukyoku/news_topics/saichinshin_R0809_00008.html',
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
  {
    code: 19,
    name: '山梨',
    rank: 'B',
    currentYen: 1052,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1113,
      answeredOn: '2026-08-28',
      effectiveOn: '2026-11-01',
      source: {
        // 公示PDFの直リンクが404になったため、その公示PDFを別添に持つ報道発表ページへ差し替え
        label: '山梨労働局「山梨県最低賃金は61円の引上げ ～山梨地方最低賃金審議会が答申～」',
        url: 'https://jsite.mhlw.go.jp/yamanashi-roudoukyoku/news_topics/houdou/houdouR080828.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
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
      // 9/1に改正決定の報道発表があり、労働局の「岐阜県の最低賃金」が
      // 改正発効日を令和8年10月1日と示している（公示日は本文に無い）
      effectiveOn: '2026-10-01',
      source: {
        label: '岐阜労働局「岐阜県の最低賃金」（改正発効日 令和8年10月1日）',
        url: 'https://jsite.mhlw.go.jp/gifu-roudoukyoku/roudoukyoku/gyoumu_naiyou/roudou_kijyun/chingin/sangyoubetu_itiran/sangyoubetu_itiran_00005.html',
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
  {
    code: 26,
    name: '京都',
    rank: 'B',
    currentYen: 1122,
    currentEffectiveOn: '2025-11-21',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1180,
      answeredOn: '2026-08-20',
      effectiveOn: '2026-11-16',
      source: {
        label: '京都労働局「京都府最低賃金が時間額1,180円（58円引上げ）へ」',
        url: 'https://jsite.mhlw.go.jp/kyoto-roudoukyoku/news_topics/houdou/_00279.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
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
      // 8/21に「答申どおり決定することが適当」との答申（異議申出の手続）を経て、
      // 労働局の改正告知が10月1日発効と示している（公示日は本文に無い）
      effectiveOn: '2026-10-01',
      source: {
        label: '大阪労働局「大阪府最低賃金は、令和8年10月1日から時間額1,231円に改正されます。」',
        url: 'https://jsite.mhlw.go.jp/osaka-roudoukyoku/saichin2026kaisei.html',
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
      // 答申時は日付が無かったが、9/3の改定の告知で10月3日と示された（公示日は本文に無い）
      effectiveOn: '2026-10-03',
      source: {
        label: '和歌山労働局「和歌山県最低賃金が10月3日から時間額1,101円に改定されます。」',
        url: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00914.html',
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
    // これは最低賃金法第11条第1項の「意見の要旨の公示」にあたる一次情報なので、出典にする
    answered: {
      yen: 1141,
      answeredOn: '2026-08-17',
      effectiveOn: '2026-10-11',
      source: {
        // 公示PDFの直リンクが404になったため、報道発表ページへ差し替え
        label:
          '広島労働局「広島県最低賃金は56円（5.2％）引き上げて「時間額1,141円」に －広島地方最低賃金審議会が答申－」',
        url: 'https://jsite.mhlw.go.jp/hiroshima-roudoukyoku/news_topics/houdou_newpage_00512.html',
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
  {
    code: 36,
    name: '徳島',
    rank: 'B',
    currentYen: 1046,
    currentEffectiveOn: '2026-01-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1103,
      answeredOn: '2026-08-24',
      effectiveOn: '2026-11-01',
      source: {
        // 公示PDFの直リンクが404になったため、その答申文・公示を別添に持つ報道発表ページへ差し替え
        label: '徳島労働局「徳島県最低賃金の引上げが答申されました」',
        url: 'https://jsite.mhlw.go.jp/tokushima-roudoukyoku/newpage_02189.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
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
      // 「本日9月1日官報公示を行った。効力発生日は、令和8年10月1日である」と明記されている
      effectiveOn: '2026-10-01',
      source: {
        label:
          '香川労働局「香川県最低賃金を時間額 1,092円に引き上げます－発効日は令和8年10月1日です－」',
        url: 'https://jsite.mhlw.go.jp/kagawa-roudoukyoku/news_topics/newpage_01015.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 38,
    name: '愛媛',
    rank: 'B',
    currentYen: 1033,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1093,
      answeredOn: '2026-08-21',
      effectiveOn: '2026-11-01',
      source: {
        label: '愛媛労働局「愛媛県最低賃金 時間額１，０９３円を答申」',
        url: 'https://jsite.mhlw.go.jp/ehime-roudoukyoku/content/contents/002785788.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 39,
    name: '高知',
    rank: 'C',
    currentYen: 1023,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1086,
      answeredOn: '2026-08-28',
      effectiveOn: '2026-10-29',
      source: {
        label: '高知労働局「令和8年度高知県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/kochi-roudoukyoku/content/contents/002796924.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
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
  {
    code: 41,
    name: '佐賀',
    rank: 'C',
    currentYen: 1030,
    currentEffectiveOn: '2025-11-21',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1095,
      answeredOn: '2026-09-01',
      effectiveOn: '2026-11-15',
      source: {
        label: '佐賀労働局「佐賀県最低賃金が令和8年11月15日から1,095円に」',
        url: 'https://jsite.mhlw.go.jp/saga-roudoukyoku/newpage_03466.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 42,
    name: '長崎',
    rank: 'C',
    currentYen: 1031,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1087,
      answeredOn: '2026-08-28',
      effectiveOn: '2026-11-02',
      source: {
        label: '長崎労働局「「長崎県最低賃金」の改正決定の答申について」',
        url: 'https://jsite.mhlw.go.jp/nagasaki-roudoukyoku/content/contents/press-26082803.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 43,
    name: '熊本',
    rank: 'C',
    currentYen: 1034,
    currentEffectiveOn: '2026-01-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      // 報道発表は「時間額１，０９２円」「令和８年１２月１日発効」＝現行1,034円から+58円。
      // 集計サイト経由のリードは +62円としていたが、一次情報の +58円を採る
      yen: 1092,
      answeredOn: '2026-09-01',
      effectiveOn: '2026-12-01',
      source: {
        label: '熊本労働局「令和８年度熊本県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/kumamoto-roudoukyoku/content/contents/002801916.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 44,
    name: '大分',
    rank: 'C',
    currentYen: 1035,
    currentEffectiveOn: '2026-01-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1096,
      answeredOn: '2026-08-28',
      effectiveOn: '2026-11-01',
      source: {
        label: '大分労働局「大分県最低賃金改正を「時間額1,096円」で答申」',
        url: 'https://jsite.mhlw.go.jp/oita-roudoukyoku/content/contents/002798644.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 45,
    name: '宮崎',
    rank: 'C',
    currentYen: 1023,
    currentEffectiveOn: '2025-11-16',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1085,
      answeredOn: '2026-08-25',
      // 報道発表が「10月下旬（最短で10月24日）に発効される見込み」と条件付きで、
      // 2026-09-16 時点で労働局の決定公示を確認できていない。
      // 厚労省の別紙が示す「発効日（予定）」だけを持たせる（'発効済み' にはしない）
      plannedEffectiveOn: '2026-10-24',
      source: {
        label: '宮崎労働局「令和8年度宮崎県最低賃金の改正答申について」',
        url: 'https://jsite.mhlw.go.jp/miyazaki-roudoukyoku/content/contents/002795889.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 46,
    name: '鹿児島',
    rank: 'C',
    currentYen: 1026,
    currentEffectiveOn: '2025-11-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1090,
      answeredOn: '2026-08-26',
      // 労働局の発表（フォトレポート）に発効日の記載が無く、公示PDFは画像で読めない。
      // 2026-09-16 時点でも決定公示を確認できていないので、
      // 厚労省の別紙が示す「発効日（予定）」だけを持たせる（'発効済み' にはしない）
      plannedEffectiveOn: '2026-10-25',
      source: {
        label: '鹿児島労働局「令和8年度第3回鹿児島地方最低賃金審議会が開催されました」',
        url: 'https://jsite.mhlw.go.jp/kagoshima-roudoukyoku/home/photoreport_2026-0827-4.html',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
  {
    code: 47,
    name: '沖縄',
    rank: 'C',
    currentYen: 1023,
    currentEffectiveOn: '2025-12-01',
    source: SOURCE_MHLW_LIST,
    answered: {
      yen: 1086,
      answeredOn: '2026-09-03',
      effectiveOn: '2026-12-02',
      source: {
        label: '沖縄労働局「令和8年度沖縄県最低賃金の改正答申について～時間額63円引上げ1,086円へ～」',
        url: 'https://jsite.mhlw.go.jp/okinawa-roudoukyoku/content/contents/002806175.pdf',
        checkedAt: DATA_CHECKED_AT,
      },
    },
  },
];

/**
 * 令和8年度額の確からしさ。
 *
 * - `目安`: 答申がまだなので、ランク別の目安額を足した**見込み**
 * - `答申`: 地方最低賃金審議会が金額を答申済み（発効前）。決定・公示が済んだ県もここに入る
 * - `発効済み`: 効力発生日を過ぎている
 *
 * **決定・公示を独立した状態にしていない。** 決定公示を確認できているのは一部の県だけで、
 * 状態として出すと「確認できていない県＝まだ決まっていない」と読めてしまう
 * （経緯は docs/features/saitei-chingin-r8-hakko-mae-mente.md）。
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
  /** 発効日 'YYYY-MM-DD'。決定公示で確認できていなければ持たない */
  effectiveOn?: string;
  /**
   * 厚労省の別紙が示す「発効日（予定）」'YYYY-MM-DD'。
   * `effectiveOn` が無いときだけ入る。**あくまで予定**なので、
   * UIは「◯月◯日 発効予定」と予定である旨を添えて出すこと
   */
  plannedEffectiveOn?: string;
  /**
   * 予定日を過ぎたのに決定公示をまだ反映できていない状態。
   * `plannedEffectiveOn` があり、その日以後に評価したときだけ true。
   *
   * **true のときUIは日付を出さない。** 「10月24日 発効予定」を10月30日に出し続けると、
   * 発効済みかもしれない県を「これから」と読ませることになる。
   * 代わりに「予定日を過ぎています。労働局の公示をご確認ください」と出す。
   *
   * 予定日当日から true にするのは、当日には発効している可能性があり、
   * 「発効予定」と言い切れなくなるため（安全側に倒す）。
   */
  plannedDatePassed: boolean;
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
    return {
      status: '目安',
      yen,
      raise,
      raisePercent,
      plannedDatePassed: false,
      source: SOURCE_MHLW_MEYASU,
    };
  }

  const effective = answered.effectiveOn !== undefined && toYmd(asOf) >= answered.effectiveOn;

  // plannedEffectiveOn は「予定」なので、日が過ぎても '発効済み' にはしない
  // （異議申出で動く余地がある。推測で埋めないのと同じ理由）。
  // 代わりに plannedDatePassed を立てて、UIから予定日を引っ込める
  const planned = answered.effectiveOn === undefined ? answered.plannedEffectiveOn : undefined;

  return {
    status: effective ? '発効済み' : '答申',
    yen,
    raise,
    raisePercent,
    effectiveOn: answered.effectiveOn,
    plannedEffectiveOn: planned,
    plannedDatePassed: planned !== undefined && toYmd(asOf) >= planned,
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
