/**
 * 酒税改正 早見表・負担額計算のデータとロジック
 *
 * 仕様: docs/features/shuzei-kaisei-hayamihyo.md
 *
 * 平成29年度の税制改正で決まった「酒税の税率構造の見直し」の**最終段階**が
 * 2026年（令和8年）10月1日に施行される。2020年10月・2023年10月に続く3段階目で、
 * これで発泡性酒類の税率が本則に揃う。
 *
 * ■ このツールの肝は「上がるものと下がるものが同時にある」こと
 * ビール系飲料（ビール・発泡酒・新ジャンル）は 1kl あたり 155,000円 に**一本化**される。
 * 一本化なので、いま高いビールは**下がり**、いま安い発泡酒・第三のビールは**上がる**。
 * チューハイ等（その他の発泡性酒類）は 80,000円 → 100,000円 の引き上げ。
 * したがって「買いだめすべきか」の答えが種類ごとに逆になる。
 * 合計の増減が**プラスにもマイナスにもなる**ことを、そのまま見せるのがこのツールの役目
 * （片方だけを見せると「酒が値上がりする」「酒が安くなる」のどちらの誤解も作ってしまう）。
 *
 * ■ 扱うのは酒税の額だけ。小売価格は扱わない
 * 店頭価格は各社の改定発表しだいで、酒税の増減がそのまま価格に乗るとは限らない
 * （原材料費・物流費の改定と同時に発表されることも多い）。このファイルは
 * **1本あたりの酒税がいくら変わるか**だけを計算する。価格の目安を添えるときは、
 * 酒税は消費税の課税対象に含まれるので `withConsumptionTax()` を通すこと。
 *
 * ■ 一次情報（2026-08-19 取得）
 * - 国税庁「酒税率一覧表（令和5年10月1日〜令和8年9月30日）」
 *   https://www.nta.go.jp/taxes/sake/qa/01/03.pdf
 *   → 現行の税率（ビール181,000円・発泡酒134,250円/155,000円・その他の発泡性酒類80,000円）
 * - 国税庁「発泡性酒類の段階的な税率変更に係る品目及び税率適用区分の表示方法の手引き」
 *   https://www.nta.go.jp/taxes/sake/pdf/0023008-027.pdf
 *   → 3段階すべての税率（〜令和5年9月／令和5年10月〜令和8年9月／令和8年10月〜）と、
 *     その他の発泡性酒類のアルコール分の上限が 10度未満 → 11度未満 になること
 * - 財務省「酒税に関する資料」
 *   https://www.mof.go.jp/tax_policy/summary/consumption/d08.htm
 *   → ビール系飲料155,000円（350ml換算54.25円）・その他の発泡性酒類100,000円（同35円）への一本化
 *
 * 【データ更新箇所】税率が変わったら STAGES に段階を1つ足し、CATEGORIES の
 * `ratesPerKl` に同じ StageId の行を足す（型が全段階を要求するので書き忘れると落ちる）。
 * **確認したら数値が変わらなくても DATA_CHECKED_AT を必ず更新する**
 * （「確認済みで変化なし」と「確認していない」を区別するため）。
 */

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-08-19';

/** 一次情報へのリンク */
export interface Source {
  /** 出典の名前。UIには「出典：〇〇」と出す */
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

/** 国税庁「酒税率一覧表（令和5年10月1日〜令和8年9月30日）」。現行税率の出典 */
export const SOURCE_NTA_RATES: Source = {
  label: '国税庁「酒税率一覧表（令和５年10月１日〜令和８年９月30日）」',
  url: 'https://www.nta.go.jp/taxes/sake/qa/01/03.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 国税庁「発泡性酒類の段階的な税率変更に係る品目及び税率適用区分の表示方法の手引き」 */
export const SOURCE_NTA_STAGES: Source = {
  label:
    '国税庁「発泡性酒類の段階的な税率変更に係る品目及び税率適用区分の表示方法の手引き」（令和５年８月）',
  url: 'https://www.nta.go.jp/taxes/sake/pdf/0023008-027.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 財務省「酒税に関する資料」。改正スケジュールの全体像の出典 */
export const SOURCE_MOF_SHUZEI: Source = {
  label: '財務省「酒税に関する資料」',
  url: 'https://www.mof.go.jp/tax_policy/summary/consumption/d08.htm',
  checkedAt: DATA_CHECKED_AT,
};

/** 段階的見直しの区切り */
export type StageId = 'before-2020' | '2020-10' | '2023-10' | '2026-10';

export interface Stage {
  id: StageId;
  /**
   * 適用開始日 'YYYY-MM-DD'。見直しが始まる前の段階（before-2020）は
   * 「それ以前」なので持たない。`stageAt()` はこれを基準に選ぶ。
   */
  effectiveFrom?: string;
  /**
   * 表の見出しに使う名前。
   * **「現行」と書かないこと。** 静的書き出しなので、いつ開いても正しい表記にするため
   * 期間そのものを名前にしている
   */
  label: string;
  /** この段階で何が起きたのかの1行説明 */
  note: string;
}

/**
 * 税率が切り替わる段階。
 *
 * 【データ更新箇所】施行日の昇順を保つこと（`stageAt()` が前提にしている）。
 */
export const STAGES: Stage[] = [
  {
    id: 'before-2020',
    label: '〜2020年9月',
    note: '平成29年度改正による見直しが始まる前。ビールと第三のビールの税額が2.75倍も開いていた',
  },
  {
    id: '2020-10',
    effectiveFrom: '2020-10-01',
    label: '2020年10月〜2023年9月',
    note: '第1段階。ビールが下がり、第三のビール（新ジャンル）が上がった',
  },
  {
    id: '2023-10',
    effectiveFrom: '2023-10-01',
    label: '2023年10月〜2026年9月',
    note: '第2段階。新ジャンルという税率区分がなくなり、発泡酒に統合された。醸造酒類（清酒・果実酒）はこの段階で一本化が完了している',
  },
  {
    id: '2026-10',
    effectiveFrom: '2026-10-01',
    label: '2026年10月〜',
    note: '最終段階。ビール系飲料の税率が1klあたり155,000円に一本化され、その他の発泡性酒類は100,000円に引き上げられる',
  },
];

/** 改正の施行日 'YYYY-MM-DD'。このツールが扱う「その日」 */
export const REVISION_DATE = '2026-10-01';

/**
 * 比較の基準にする段階。
 *
 * **開いた日で切り替えない。** このツールは「2026年10月1日を境に何が変わるか」を
 * 見せるページなので、施行後に開いても同じ2つを比べたい
 * （施行後は `isRevised()` で文言だけを「変わりました」に切り替える）。
 */
export const BEFORE_STAGE_ID: StageId = '2023-10';
export const AFTER_STAGE_ID: StageId = '2026-10';

/** 酒類の区分（このツールが扱う発泡性酒類だけ） */
export type CategoryId =
  | 'beer'
  | 'happoshu-mid'
  | 'happoshu-low'
  | 'shin-genre'
  | 'other-sparkling';

export interface Category {
  id: CategoryId;
  /** 早見表の行の名前 */
  label: string;
  /**
   * 計算機の入力欄の名前。税率が同じで実質1つに束ねられる区分があるので別に持つ
   * （発泡酒（麦芽比率25%未満）と第三のビールは2023年10月に統合済み）
   */
  calcLabel?: string;
  /** 具体例。どれを選べばいいか分からない人向けの手がかり */
  example: string;
  /**
   * 1klあたりの税率（円）。**全段階を必ず埋める**（型が要求する）。
   * 段階を足したときに書き漏れるとビルドが落ちる形にしてある
   */
  ratesPerKl: Record<StageId, number>;
  /** この区分で何が起きるのかの1行説明 */
  note: string;
  /** 計算機の入力欄に出すか。税率が同じ区分は代表の1つだけを出す */
  inCalculator: boolean;
  source: Source;
}

/**
 * 発泡性酒類の税率の推移（1klあたりの円）。
 *
 * 国税庁の手引き（SOURCE_NTA_STAGES）3ページの表をそのまま写している。
 * 350ml換算は財務省・国税庁の資料の値と一致する（テストで突き合わせている）:
 * ビール 77.00 → 70.00 → 63.35 → 54.25円 ／ 新ジャンル 28.00 → 37.80 → 46.99 → 54.25円 ／
 * その他の発泡性酒類 28.00 → 28.00 → 28.00 → 35.00円。
 *
 * 【データ更新箇所】税率の改正があったらここを直す。二次情報（ニュース記事）ではなく
 * 必ず国税庁の酒税率一覧表で突き合わせること。
 */
export const CATEGORIES: Category[] = [
  {
    id: 'beer',
    label: 'ビール（発泡酒（麦芽比率50%以上）を含む）',
    example: '一般的なビール。麦芽比率50%以上の「本格系」発泡酒も同じ税率',
    ratesPerKl: {
      'before-2020': 220000,
      '2020-10': 200000,
      '2023-10': 181000,
      '2026-10': 155000,
    },
    note: '3段階すべてで下がり続けた唯一の区分。最終段階で350mlあたり9.10円の減税になる',
    inCalculator: true,
    source: SOURCE_NTA_STAGES,
  },
  {
    id: 'happoshu-mid',
    label: '発泡酒（麦芽比率25%以上50%未満）',
    example: '銘柄は多くない。缶の原材料表示で麦芽比率を確認する',
    ratesPerKl: {
      'before-2020': 178125,
      '2020-10': 167125,
      '2023-10': 155000,
      '2026-10': 155000,
    },
    note: '2023年10月にすでに155,000円へ到達しているため、2026年10月の改正では変わらない',
    inCalculator: true,
    source: SOURCE_NTA_STAGES,
  },
  {
    id: 'happoshu-low',
    label: '発泡酒（麦芽比率25%未満）',
    calcLabel: '発泡酒（麦芽比率25%未満）・第三のビール',
    example: '「発泡酒」として売られている多くの銘柄と、第三のビール（新ジャンル）',
    ratesPerKl: {
      'before-2020': 134250,
      '2020-10': 134250,
      '2023-10': 134250,
      '2026-10': 155000,
    },
    note: '2026年10月に155,000円へ引き上げ。350mlあたり7.26円の増税で、上げ幅はこのツールで最大',
    inCalculator: true,
    source: SOURCE_NTA_STAGES,
  },
  {
    id: 'shin-genre',
    label: '第三のビール（いわゆる「新ジャンル」）',
    example: '糖類・ホップ等を原料とするもの、または発泡酒にスピリッツを加えたもの',
    ratesPerKl: {
      'before-2020': 80000,
      '2020-10': 108000,
      '2023-10': 134250,
      '2026-10': 155000,
    },
    // 2023年10月に税率区分としては消滅している。行を残しているのは、
    // 「第三のビールがいちばん上がった」という段階的見直しの全体像を見せるため
    note: '2023年10月に税率区分としては発泡酒に統合済み。3段階の合計で350mlあたり26.25円上がった',
    inCalculator: false,
    source: SOURCE_NTA_STAGES,
  },
  {
    id: 'other-sparkling',
    label: 'チューハイ・サワー等（その他の発泡性酒類）',
    example: 'チューハイ・サワー・ハイボール缶など、ビール・発泡酒以外の発泡性のお酒',
    ratesPerKl: {
      'before-2020': 80000,
      '2020-10': 80000,
      '2023-10': 80000,
      '2026-10': 100000,
    },
    note: '見直しの3段階のうち、動くのは2026年10月の1回だけ。350mlあたり7.00円の増税になる',
    inCalculator: true,
    source: SOURCE_NTA_STAGES,
  },
];

/**
 * その他の発泡性酒類の税率を適用できるアルコール分の上限（度）。
 *
 * 2026年10月1日から「10度未満」→「11度未満」に広がる（国税庁の手引き3ページの注記）。
 * アルコール分10度以上11度未満のいわゆるストロング系チューハイは、いまリキュール
 * （1klあたり120,000円・350mlで42円）として課税されているが、改正後はこちらに移る。
 * つまり**同じチューハイでもアルコール分によって増税と減税が分かれる**。
 */
export const OTHER_SPARKLING_ABV_LIMIT_BEFORE = 10;
export const OTHER_SPARKLING_ABV_LIMIT_AFTER = 11;

/**
 * アルコール分13度未満のリキュールの税率（1klあたりの円）。
 * 上のアルコール分の話をするときの比較用で、このツールの計算には使わない。
 */
export const LIQUEUR_RATE_PER_KL = 120000;

/** 消費税率。酒税は消費税の課税対象に含まれるので、店頭価格の目安を出すときに使う */
export const CONSUMPTION_TAX_RATE = 0.1;

/** 早見表と計算機で扱う容量（ml）。缶の主要な2サイズ */
export const SIZES = [350, 500];

/** 1年の週数。週あたりの本数を年換算するのに使う（365日 ÷ 7日） */
export const WEEKS_PER_YEAR = 365 / 7;

/** 20歳未満の飲酒防止の注記。飲酒を勧めるページにしないための固定文 */
export const MINOR_DRINKING_NOTE = '20歳未満の飲酒は法律で禁止されています。';

// ---------------------------------------------------------------- 日付

/** 'YYYY-MM-DD' に揃える。日付の比較は文字列でできる形にしてから行う */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date でも 'YYYY-MM-DD' でも受け取れるようにする */
function ymdOf(asOf: Date | string): string {
  return typeof asOf === 'string' ? asOf : toYmd(asOf);
}

/** '2026-10-01' → '2026年10月1日' */
export function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/**
 * 基準日に適用されている段階。
 * `effectiveFrom` を持たない先頭の段階が既定になる。
 */
export function stageAt(asOf: Date | string = new Date()): Stage {
  const ymd = ymdOf(asOf);
  let current = STAGES[0];
  for (const stage of STAGES) {
    if (stage.effectiveFrom !== undefined && stage.effectiveFrom <= ymd) current = stage;
  }
  return current;
}

/** id から段階を引く。未登録なら undefined */
export function stageById(id: StageId): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

/** 基準日の時点で 2026年10月の改正が施行済みか */
export function isRevised(asOf: Date | string = new Date()): boolean {
  return ymdOf(asOf) >= REVISION_DATE;
}

/**
 * 施行日までの残り日数。施行後は0を返す（負の数を画面に出さないため）。
 * 「あと何日」は買いだめの判断に直結するので、このツールの主役の数字のひとつ。
 */
export function daysUntilRevision(asOf: Date | string = new Date()): number {
  const from = Date.parse(`${ymdOf(asOf)}T00:00:00Z`);
  const to = Date.parse(`${REVISION_DATE}T00:00:00Z`);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

// ---------------------------------------------------------------- 税額

/** 小数の桁を丸める。金額の計算で 46.98750000000001 のような値を残さないため */
function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * 容量あたりの酒税（円）。
 *
 * 酒税は容量にかかる従量税なので、値段が違っても同じ容量なら税額は同じ。
 * 1kl = 1,000,000ml。350mlのビール（181,000円/kl）なら 63.35円。
 *
 * 小数第4位まで残しているのは、134,250円/kl の350ml が 46.9875円 のように
 * 割り切れない値になるため（表示では2桁に丸める）。
 */
export function taxFor(ratePerKl: number, ml: number): number {
  return roundTo((ratePerKl * ml) / 1_000_000, 4);
}

/** 区分と段階から、その容量の酒税（円）を出す */
export function taxOf(category: Category, stageId: StageId, ml: number): number {
  return taxFor(category.ratesPerKl[stageId], ml);
}

/** 酒税の増減を店頭価格の目安に直す。酒税は消費税の課税対象なので消費税分を上乗せする */
export function withConsumptionTax(yen: number): number {
  return roundTo(yen * (1 + CONSUMPTION_TAX_RATE), 4);
}

/** 増える・減る・変わらない */
export type Direction = 'up' | 'down' | 'flat';

/** 増減の向きを判定する。丸めたあとの値で判定すること（浮動小数の誤差で flat を取り逃す） */
export function directionOf(diff: number): Direction {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'flat';
}

/** 早見表の1行（改正前後の比較） */
export interface Comparison {
  category: Category;
  ml: number;
  /** 改正前（2023年10月〜2026年9月）の酒税（円） */
  before: number;
  /** 改正後（2026年10月〜）の酒税（円） */
  after: number;
  /** 増減（円）。プラスが増税、マイナスが減税 */
  diff: number;
  direction: Direction;
}

/** 1区分ぶんの改正前後の比較 */
export function compare(category: Category, ml: number): Comparison {
  const before = taxOf(category, BEFORE_STAGE_ID, ml);
  const after = taxOf(category, AFTER_STAGE_ID, ml);
  const diff = roundTo(after - before, 4);
  return { category, ml, before, after, diff, direction: directionOf(diff) };
}

/**
 * 改正前後の早見表。
 *
 * @param ml 容量。省略時は350ml
 * @param options.calculatorOnly 計算機に出す区分だけに絞る（統合済みの区分を外す）
 */
export function comparisons(
  ml = 350,
  options: { calculatorOnly?: boolean } = {},
): Comparison[] {
  const list = options.calculatorOnly ? CATEGORIES.filter((c) => c.inCalculator) : CATEGORIES;
  return list.map((c) => compare(c, ml));
}

/** 段階的見直しの推移（1区分ぶん） */
export interface HistoryRow {
  category: Category;
  ml: number;
  /** 段階ごとの酒税（円）。STAGES と同じ順で並ぶ */
  taxes: { stage: Stage; tax: number }[];
  /** 見直し前（〜2020年9月）から最終段階までの増減（円） */
  totalDiff: number;
}

/** 2020年10月・2023年10月・2026年10月の3段階の推移。読み物としての早見表に使う */
export function history(ml = 350): HistoryRow[] {
  return CATEGORIES.map((category) => {
    const taxes = STAGES.map((stage) => ({ stage, tax: taxOf(category, stage.id, ml) }));
    return {
      category,
      ml,
      taxes,
      totalDiff: roundTo(taxes[taxes.length - 1].tax - taxes[0].tax, 4),
    };
  });
}

// ---------------------------------------------------------------- 買いだめの仕分け

/**
 * 施行日をまたぐときの得な買い方。
 *
 * - `buy-before` … 増税されるので9月中に買っておくほうが得
 * - `wait` … 減税されるので10月以降のほうが得
 * - `same` … 税額が変わらないので急ぐ必要はない
 */
export type Advice = 'buy-before' | 'wait' | 'same';

/** 増減の向きから買い方を決める。判断はここ1箇所に集約する */
export function adviceOf(direction: Direction): Advice {
  if (direction === 'up') return 'buy-before';
  if (direction === 'down') return 'wait';
  return 'same';
}

/** 区分ごとの買い方 */
export function adviceFor(category: Category): Advice {
  return adviceOf(compare(category, 350).direction);
}

/** 画面に出す短い言い方 */
export const ADVICE_LABEL: Record<Advice, string> = {
  'buy-before': '9月中に買うと得',
  wait: '10月以降が得',
  same: '急がなくてよい',
};

/** その理由の1行説明 */
export const ADVICE_NOTE: Record<Advice, string> = {
  'buy-before': '2026年10月1日から酒税が上がる区分です。',
  wait: '2026年10月1日から酒税が下がる区分です。',
  same: '2026年10月1日の改正で酒税が変わらない区分です。',
};

// ---------------------------------------------------------------- 負担額

/** 負担額計算の入力（1行 = 区分 × 容量） */
export interface DrinkInput {
  categoryId: CategoryId;
  /** 容量（ml） */
  ml: number;
  /** 週あたりの本数 */
  perWeek: number;
}

/** 負担額の内訳（入力1行ぶん） */
export interface BurdenLine {
  category: Category;
  ml: number;
  perWeek: number;
  /** 年あたりの本数（週の本数 × 52.14…）。端数を含む */
  perYear: number;
  /** 1本あたりの増減（円） */
  diffPerUnit: number;
  /** 年あたりの酒税（円・改正前） */
  annualBefore: number;
  /** 年あたりの酒税（円・改正後） */
  annualAfter: number;
  /** 年あたりの増減（円）。プラスが負担増 */
  annualDiff: number;
  /** 月あたりの増減（円）。年 ÷ 12 */
  monthlyDiff: number;
  direction: Direction;
  advice: Advice;
}

/** 負担額の合計 */
export interface Burden {
  /** 本数が0の行は含まない */
  lines: BurdenLine[];
  annualBefore: number;
  annualAfter: number;
  /** 年あたりの増減の合計（円）。**減税と増税を相殺するのでマイナスにもなる** */
  annualDiff: number;
  monthlyDiff: number;
  /** 増税になる区分だけを合計した年あたりの増加額（円・正の値） */
  annualIncrease: number;
  /** 減税になる区分だけを合計した年あたりの減少額（円・正の値） */
  annualDecrease: number;
  /** 1本も入力されていない */
  empty: boolean;
}

/**
 * 週あたりの本数から、酒税の負担が年間・月間でいくら変わるかを見積もる。
 *
 * **増税分と減税分を打ち消し合わせた合計を返す。** ビールしか飲まない人はマイナス
 * （負担減）になり、第三のビールとチューハイの人はプラスになる。
 * それがこのツールの答えなので、絶対値や「増加分だけ」に丸めてはいけない。
 * 内訳が要るときは `annualIncrease` / `annualDecrease` を使う。
 *
 * 不正な入力（負の本数・未知の区分・0以下の容量）は無視する。
 */
export function estimateBurden(inputs: DrinkInput[]): Burden {
  const lines: BurdenLine[] = [];

  for (const input of inputs) {
    const category = CATEGORIES.find((c) => c.id === input.categoryId);
    if (!category) continue;
    const ml = Number.isFinite(input.ml) ? input.ml : 0;
    const perWeek = Number.isFinite(input.perWeek) ? input.perWeek : 0;
    if (ml <= 0 || perWeek <= 0) continue;

    const perYear = perWeek * WEEKS_PER_YEAR;
    const cmp = compare(category, ml);
    const annualBefore = Math.round(cmp.before * perYear);
    const annualAfter = Math.round(cmp.after * perYear);
    // 丸めた年額の差ではなく、丸める前の1本あたりの差から出す
    // （丸め誤差が「変わらないはずの区分に1円の差」として出るのを防ぐ）
    const annualDiff = Math.round(cmp.diff * perYear);

    lines.push({
      category,
      ml,
      perWeek,
      perYear: roundTo(perYear, 1),
      diffPerUnit: cmp.diff,
      annualBefore,
      annualAfter,
      annualDiff,
      monthlyDiff: Math.round(annualDiff / 12),
      direction: cmp.direction,
      advice: adviceOf(cmp.direction),
    });
  }

  const sum = (pick: (line: BurdenLine) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);

  const annualDiff = sum((l) => l.annualDiff);

  return {
    lines,
    annualBefore: sum((l) => l.annualBefore),
    annualAfter: sum((l) => l.annualAfter),
    annualDiff,
    monthlyDiff: Math.round(annualDiff / 12),
    annualIncrease: sum((l) => (l.annualDiff > 0 ? l.annualDiff : 0)),
    annualDecrease: sum((l) => (l.annualDiff < 0 ? -l.annualDiff : 0)),
    empty: lines.length === 0,
  };
}

/**
 * 施行日の前に買っておくと得な分（年間の増税額のうち、実際に買いだめできる分ではなく
 * 「その区分の年間の増加額」）と、待つほうが得な分をまとめる。
 * 結果に添える仕分けの見出しに使う。
 */
export interface Sorting {
  /** 9月中に買っておくほうが得な区分 */
  buyBefore: BurdenLine[];
  /** 10月以降のほうが得な区分 */
  wait: BurdenLine[];
  /** 変わらない区分 */
  same: BurdenLine[];
}

/** 負担額の内訳を「買いだめすべきか」で仕分ける */
export function sortByAdvice(burden: Burden): Sorting {
  return {
    buyBefore: burden.lines.filter((l) => l.advice === 'buy-before'),
    wait: burden.lines.filter((l) => l.advice === 'wait'),
    same: burden.lines.filter((l) => l.advice === 'same'),
  };
}

// ---------------------------------------------------------------- 表示

/** 1234 → '1,234円' */
export function formatYen(yen: number): string {
  return `${Math.round(yen).toLocaleString('ja-JP')}円`;
}

/**
 * 63.35 → '63.35円'。小数のある税額をそのまま見せるための整形。
 * 末尾の0は落とす（54.20円 ではなく 54.2円 と出す）
 */
export function formatYenDecimal(yen: number, digits = 2): string {
  const fixed = yen.toFixed(digits);
  // 小数点を含むときだけ末尾を削る（digits=0 で '100' の 0 まで消さないため）
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  const [int, frac] = trimmed.split('.');
  const grouped = Number(int).toLocaleString('ja-JP');
  return `${frac ? `${grouped}.${frac}` : grouped}円`;
}

/**
 * 増減を符号つきで見せる。7.2625 → '+7.26円'、-9.1 → '▲9.1円'、0 → '±0円'。
 *
 * 減税を「-9.1円」と書くと「9.1円の値下げ」なのか「マイナスの負担増」なのか
 * 読み手が迷うので、税の資料で一般的な ▲ を使う。
 */
export function formatDiff(yen: number, digits = 2): string {
  const rounded = roundTo(yen, digits);
  if (rounded === 0) return '±0円';
  const abs = formatYenDecimal(Math.abs(rounded), digits);
  return rounded > 0 ? `+${abs}` : `▲${abs}`;
}
