/**
 * 収入印紙（印紙税）計算機
 *
 * 仕様: docs/features/inshi-zei-keisan.md
 *
 * 領収書（第17号の1）・不動産の売買契約書（第1号の1）・工事の請負契約書（第2号のうち建設工事）・
 * 請負契約書（第2号。建設工事以外）の金額・作成日・通数から、貼る印紙の額を出す。
 * 2027-03-31 で切れる軽減措置（租税特別措置法91条）は**作成日で**出し分ける。
 *
 * ■ 一次確認（2026-11-11。国税庁タックスアンサーの本文と表を1行ずつ突き合わせた）
 * - No.7140 印紙税額の一覧表（その1）第1号〜第4号：第1号・第2号の本則
 * - No.7141 印紙税額の一覧表（その2）第5号〜第20号：第17号の1（売上代金の受取書）・第7号 4,000円
 * - No.7102 請負に関する契約書：第2号の本則（第1号と 500万円以下の区切りが違う）・基本契約は第7号になりうる
 * - No.7105 金銭又は有価証券の受取書、領収書：5万円未満は非課税・営業に関しないものは非課税
 * - No.7108 不動産の譲渡、建設工事の請負に関する契約書に係る印紙税の軽減措置：
 *   平成26年4月1日〜令和9年3月31日に作成されるもの。不動産は10万円超、建設工事は100万円超が対象
 * - No.7124 消費税額等が区分記載された契約書等の記載金額：第1号・第2号・第17号は税抜で判定
 *   （免税事業者は区分記載しても税込で判定）
 * - No.7125 営業に関しない受取書：営利法人は営業。個人の医師・弁護士など・店舗を持たない農林漁業者の
 *   自己生産物の販売・私的な日常生活は営業に当たらない
 * - 印紙税法20条（過怠税）：納付しなかった額の3倍（1項）、自主申出は1.1倍（2項）、
 *   消印しない印紙は額面と同額（3項）、1,000円未満は1,000円（4項）
 *
 * 金額は円の整数で比べる。境目は表のとおり「未満」「以下」「超」。
 *
 * 【データ更新箇所】冒頭の定数（HONSOKU_*・KEIGEN_TABLES・DATA_CHECKED_AT・TAIKO_STATUS）。
 * 令和9年度税制改正大綱（2026-12 中旬の見込み）で延長が決まったら KEIGEN_TABLES の `to` を
 * 書き換え、TAIKO_STATUS を直す。廃止・縮小なら新しい表を足す。
 */

/** 'YYYY-MM-DD' */
export type Ymd = string;

/** データ全体の最終確認日 */
export const DATA_CHECKED_AT: Ymd = '2026-11-11';

// ---------------------------------------------------------------- 表

/** 金額の区切り。記載金額 ≤ upTo の最初の行が当たる。最後の行は upTo: null（それを超えるもの） */
export interface Bracket {
  upTo: number | null;
  tax: number;
}

/** 本則の表。記載金額が exemptBelow 未満なら非課税 */
export interface HonsokuTable {
  /** この額「未満」は非課税 */
  exemptBelow: number;
  brackets: readonly Bracket[];
}

const MAN = 10_000;
const OKU = 100_000_000;

// 【データ更新箇所】
/** 第17号の1 売上代金の受取書（No.7141） */
export const HONSOKU_RYOSHUSHO: HonsokuTable = {
  exemptBelow: 5 * MAN,
  brackets: [
    { upTo: 100 * MAN, tax: 200 },
    { upTo: 200 * MAN, tax: 400 },
    { upTo: 300 * MAN, tax: 600 },
    { upTo: 500 * MAN, tax: 1_000 },
    { upTo: 1_000 * MAN, tax: 2_000 },
    { upTo: 2_000 * MAN, tax: 4_000 },
    { upTo: 3_000 * MAN, tax: 6_000 },
    { upTo: 5_000 * MAN, tax: 10_000 },
    { upTo: 1 * OKU, tax: 20_000 },
    { upTo: 2 * OKU, tax: 40_000 },
    { upTo: 3 * OKU, tax: 60_000 },
    { upTo: 5 * OKU, tax: 100_000 },
    { upTo: 10 * OKU, tax: 150_000 },
    { upTo: null, tax: 200_000 },
  ],
};

// 【データ更新箇所】
/** 第1号 不動産の譲渡に関する契約書 本則（No.7140） */
export const HONSOKU_DAI1GO: HonsokuTable = {
  exemptBelow: 1 * MAN,
  brackets: [
    { upTo: 10 * MAN, tax: 200 },
    { upTo: 50 * MAN, tax: 400 },
    { upTo: 100 * MAN, tax: 1_000 },
    { upTo: 500 * MAN, tax: 2_000 },
    { upTo: 1_000 * MAN, tax: 10_000 },
    { upTo: 5_000 * MAN, tax: 20_000 },
    { upTo: 1 * OKU, tax: 60_000 },
    { upTo: 5 * OKU, tax: 100_000 },
    { upTo: 10 * OKU, tax: 200_000 },
    { upTo: 50 * OKU, tax: 400_000 },
    { upTo: null, tax: 600_000 },
  ],
};

// 【データ更新箇所】
/**
 * 第2号 請負に関する契約書 本則（No.7102・7140）。
 * **第1号と 500万円以下の区切りが違う**（100万・200万・300万・500万）ので、表を1本にまとめない
 */
export const HONSOKU_DAI2GO: HonsokuTable = {
  exemptBelow: 1 * MAN,
  brackets: [
    { upTo: 100 * MAN, tax: 200 },
    { upTo: 200 * MAN, tax: 400 },
    { upTo: 300 * MAN, tax: 1_000 },
    { upTo: 500 * MAN, tax: 2_000 },
    { upTo: 1_000 * MAN, tax: 10_000 },
    { upTo: 5_000 * MAN, tax: 20_000 },
    { upTo: 1 * OKU, tax: 60_000 },
    { upTo: 5 * OKU, tax: 100_000 },
    { upTo: 10 * OKU, tax: 200_000 },
    { upTo: 50 * OKU, tax: 400_000 },
    { upTo: null, tax: 600_000 },
  ],
};

/** 金額の記載のない契約書・受取書（各号の「記載のないもの」） */
export const KISAI_NASHI_TAX = 200;

/** 継続的取引の基本となる契約書（第7号）。v1 では計算せず、案内に出すだけ（No.7141） */
export const DAI7GO_TAX = 4_000;

/** 軽減措置の表。作成日が from〜to（両端を含む）で、記載金額が over を「超える」ときに当たる */
export interface KeigenTable {
  doc: 'fudosan' | 'kensetsu';
  from: Ymd;
  to: Ymd;
  /** この額を「超える」ものが対象（以下は本則） */
  over: number;
  brackets: readonly Bracket[];
}

// 【データ更新箇所】
/**
 * 軽減措置（租税特別措置法91条・No.7108）。
 * 大綱で延長が決まったら `to` を書き換える。廃止なら行を消さずに `to` のまま（過去の作成日の答えが要る）
 */
export const KEIGEN_TABLES: readonly KeigenTable[] = [
  {
    doc: 'fudosan',
    from: '2014-04-01',
    to: '2027-03-31',
    over: 10 * MAN,
    brackets: [
      { upTo: 50 * MAN, tax: 200 },
      { upTo: 100 * MAN, tax: 500 },
      { upTo: 500 * MAN, tax: 1_000 },
      { upTo: 1_000 * MAN, tax: 5_000 },
      { upTo: 5_000 * MAN, tax: 10_000 },
      { upTo: 1 * OKU, tax: 30_000 },
      { upTo: 5 * OKU, tax: 60_000 },
      { upTo: 10 * OKU, tax: 160_000 },
      { upTo: 50 * OKU, tax: 320_000 },
      { upTo: null, tax: 480_000 },
    ],
  },
  {
    doc: 'kensetsu',
    from: '2014-04-01',
    to: '2027-03-31',
    over: 100 * MAN,
    brackets: [
      { upTo: 200 * MAN, tax: 200 },
      { upTo: 300 * MAN, tax: 500 },
      { upTo: 500 * MAN, tax: 1_000 },
      { upTo: 1_000 * MAN, tax: 5_000 },
      { upTo: 5_000 * MAN, tax: 10_000 },
      { upTo: 1 * OKU, tax: 30_000 },
      { upTo: 5 * OKU, tax: 60_000 },
      { upTo: 10 * OKU, tax: 160_000 },
      { upTo: 50 * OKU, tax: 320_000 },
      { upTo: null, tax: 480_000 },
    ],
  },
];

/** 軽減措置の期限（画面の文言用）。KEIGEN_TABLES の最後の `to` */
export const KEIGEN_TO: Ymd = KEIGEN_TABLES.reduce((m, t) => (t.to > m ? t.to : m), '');

/** 本則が切り替わった日より前の作成日は扱わない（それより前は旧の軽減措置があった） */
export const MIN_DATE: Ymd = '2014-04-01';

// 【データ更新箇所】
/**
 * 令和9年度税制改正大綱の状況。
 * - 'pending'：大綱の前（国土交通省が延長を要望している段階）
 * - 'extended'：大綱で延長が決まった（法律の成立前。「〜予定」と書く）
 * - 'enacted'：延長の法律が成立した
 * - 'ended'：延長しないことが決まった
 */
export const TAIKO_STATUS: 'pending' | 'extended' | 'enacted' | 'ended' = 'pending';

// ---------------------------------------------------------------- 過怠税

/** 過怠税の倍率（印紙税法20条1項・2項）。10倍した整数で持つ */
export const KATAIZEI_TIMES10 = 30;
export const KATAIZEI_JISHU_TIMES10 = 11;
/** 過怠税の最低額（20条4項） */
export const KATAIZEI_MIN = 1_000;

/** 1通ぶんの過怠税（貼り忘れ・自主申出）。印紙税が0円なら0円 */
export function kataizei(tax: number): { kaihatsu: number; jishu: number } {
  if (tax <= 0) return { kaihatsu: 0, jishu: 0 };
  return {
    kaihatsu: Math.max(KATAIZEI_MIN, (tax * KATAIZEI_TIMES10) / 10),
    jishu: Math.max(KATAIZEI_MIN, (tax * KATAIZEI_JISHU_TIMES10) / 10),
  };
}

// ---------------------------------------------------------------- 入力

export type DocKind = 'ryoshusho' | 'fudosan' | 'kensetsu' | 'ukeoi';

export const DOC_LABEL: Record<DocKind, string> = {
  ryoshusho: '領収書・レシート',
  fudosan: '不動産の売買契約書',
  kensetsu: '工事の請負契約書',
  ukeoi: '請負契約書（工事以外）',
};

export const DOC_GO: Record<DocKind, string> = {
  ryoshusho: '第17号の1 売上代金の受取書',
  fudosan: '第1号の1 不動産の譲渡に関する契約書',
  kensetsu: '第2号 請負に関する契約書（建設工事）',
  ukeoi: '第2号 請負に関する契約書',
};

/** 請負（工事以外）の契約の中身 */
export type UkeoiNature =
  /** 成果物の完成に対して払う（請負） */
  | 'kansei'
  /** 作業時間・期間に対して払う（準委任） */
  | 'jun-inin'
  /** 継続して取引する基本契約（第7号になりうる） */
  | 'kihon';

/** 消費税の書き方 */
export type TaxWriting =
  /** 税込金額だけ書く */
  | 'komi'
  /** 税抜金額と消費税額を分けて書く（または税込と消費税額） */
  | 'bunri';

export type Medium = 'kami' | 'denshi';

/** 領収書の発行者 */
export type Issuer =
  /** 会社（営利法人）。常に営業に関する */
  | 'hojin'
  /** 個人事業主（商売・小売・フリーランスなど） */
  | 'kojin-jigyo'
  /** 個人の医師・弁護士・税理士などの士業、店舗を持たない農林漁業者の自己生産物の販売 */
  | 'kojin-shigyo'
  /** 個人の私的な売買（フリマ・不用品） */
  | 'kojin-shiteki';

export const ISSUER_LABEL: Record<Issuer, string> = {
  hojin: '会社（株式会社・合同会社などの営利法人）',
  'kojin-jigyo': '個人事業主（商売・小売・フリーランスなど）',
  'kojin-shigyo':
    '個人の医師・歯科医師・弁護士・税理士・司法書士などの士業、店舗を持たない農業・林業・漁業の人が自分の生産物を売るとき',
  'kojin-shiteki': '個人の私的な売買（フリマ・不用品の売却など）',
};

/** 営業に関しない（＝領収書が非課税になる）発行者か。法人は必ず false */
export function isEigyogai(issuer: Issuer): boolean {
  return issuer === 'kojin-shigyo' || issuer === 'kojin-shiteki';
}

export interface InshiInput {
  doc: DocKind;
  /** 記載金額（円・整数）。null は「金額の記載がない」。bunri のときは税抜金額 */
  amount: number | null;
  taxWriting: TaxWriting;
  medium: Medium;
  /** 契約書の作成日。領収書では使わない */
  date: Ymd;
  /** 契約書の通数（1以上）。領収書は1として扱う */
  copies: number;
  /** 領収書の発行者 */
  issuer: Issuer;
  /** 請負（工事以外）の中身 */
  ukeoiNature: UkeoiNature;
}

export const DEFAULT_COPIES = 2;
export const MAX_COPIES = 99;

// ---------------------------------------------------------------- 結果

export type Basis =
  /** 軽減措置の額 */
  | 'keigen'
  /** 本則の額 */
  | 'honsoku'
  /** 金額の記載なし（200円） */
  | 'kisai-nashi';

export type ZeroReason =
  /** 電子文書（課税文書の作成に当たらない） */
  | 'denshi'
  /** 領収書で営業に関しない */
  | 'eigyogai'
  /** 記載金額が非課税の範囲 */
  | 'hikazei';

export type Result =
  | {
      kind: 'taishogai';
      /** jun-inin・kihon：請負でない／第7号の可能性。kako：2014-03-31 以前の作成日 */
      reason: 'jun-inin' | 'kihon' | 'kako';
      reasons: string[];
    }
  | {
      kind: 'zero';
      reason: ZeroReason;
      reasons: string[];
    }
  | {
      kind: 'tax';
      basis: Basis;
      /** 1通あたり */
      perCopy: number;
      copies: number;
      total: number;
      /** 同じ金額の本則の1通あたり（軽減措置が当たっているときの比較用） */
      honsokuPerCopy: number;
      /**
       * 軽減措置の期間外で本則になったが、期間内なら軽減が当たった額（延長されたら戻る額）。
       * 当たらない金額・文書なら null
       */
      keigenIfExtended: number | null;
      /** 当たった軽減措置の期限（basis が keigen のとき） */
      keigenTo: Ymd | null;
      reasons: string[];
    };

// ---------------------------------------------------------------- 判定

/** 表を引く。記載金額 ≤ upTo の最初の行 */
export function lookup(brackets: readonly Bracket[], amount: number): number {
  for (const b of brackets) {
    if (b.upTo === null || amount <= b.upTo) return b.tax;
  }
  // 最後の行は upTo: null なので来ない
  throw new Error('bracket table must end with upTo: null');
}

/** 本則の額。非課税の範囲なら 0 */
export function honsokuTax(table: HonsokuTable, amount: number): number {
  if (amount < table.exemptBelow) return 0;
  return lookup(table.brackets, amount);
}

export function honsokuTableFor(doc: DocKind): HonsokuTable {
  if (doc === 'ryoshusho') return HONSOKU_RYOSHUSHO;
  if (doc === 'fudosan') return HONSOKU_DAI1GO;
  return HONSOKU_DAI2GO;
}

/** その作成日に効いている軽減措置の表（無ければ null） */
export function keigenTableAt(doc: DocKind, date: Ymd): KeigenTable | null {
  return KEIGEN_TABLES.find((t) => t.doc === doc && t.from <= date && date <= t.to) ?? null;
}

/** 日付に関係なく、その文書の（最後の）軽減措置の表 */
function latestKeigenTable(doc: DocKind): KeigenTable | null {
  const ts = KEIGEN_TABLES.filter((t) => t.doc === doc);
  return ts.length ? ts.reduce((a, b) => (b.to > a.to ? b : a)) : null;
}

/** '2027-03-31' → '2027年3月31日' */
export function formatDate(ymd: Ymd): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 1,000円以上は「1万円」「2,000円」のように。印紙の額面は万の位で切れるので万で読む */
export function formatYen(n: number): string {
  if (n >= MAN && n % MAN === 0) return `${(n / MAN).toLocaleString('ja-JP')}万円`;
  return `${n.toLocaleString('ja-JP')}円`;
}

/** 記載金額の表示用（12,345,678円のように円で） */
export function formatAmount(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

/**
 * 金額の入力を読む。カンマ・空白・「円」・全角数字を受け付ける。
 * 空欄は undefined（未入力）、読めない値・負の値・小数は NaN
 */
export function parseYen(text: string): number | undefined {
  const s = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、\s円]/g, '');
  if (s === '') return undefined;
  if (!/^\d+$/.test(s)) return Number.NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

/**
 * 印紙の額を判定する。判定の順番（＝画面の「なぜこの額か」の順）は仕様書のとおり：
 * 1. 電子文書 → 0円
 * 2. 請負（工事以外）で成果物に払う契約ではない → 対象外（額を出さない）
 * 3. 領収書で営業に関しない → 0円（法人は必ず課税側）
 * 4. 記載金額が非課税の範囲 → 0円
 * 5. 契約書で作成日が軽減措置の期間内・対象金額 → 軽減後の額
 * 6. それ以外 → 本則の額
 */
export function judge(input: InshiInput): Result {
  const { doc, amount, taxWriting, medium } = input;
  const isContract = doc !== 'ryoshusho';
  const reasons: string[] = [];

  // 1. 電子文書
  if (medium === 'denshi') {
    reasons.push(
      'PDF・メール・電子契約サービスで交わす電子文書は、印紙税の「課税文書の作成」に当たらないので印紙は要りません',
    );
    return { kind: 'zero', reason: 'denshi', reasons };
  }
  reasons.push('紙で作って相手に渡す文書なので、印紙税の対象です');

  // 2. 請負（工事以外）の中身
  if (doc === 'ukeoi' && input.ukeoiNature !== 'kansei') {
    if (input.ukeoiNature === 'jun-inin') {
      reasons.push(
        '作業時間や期間に対して払う契約（準委任）は、第2号の「請負」に当たりません。この計算機の対象外です',
      );
      return { kind: 'taishogai', reason: 'jun-inin', reasons };
    }
    reasons.push(
      `継続して取引する基本契約は、第7号「継続的取引の基本となる契約書」（1通 ${formatYen(DAI7GO_TAX)}）に当たる場合があります。この計算機の対象外です`,
    );
    return { kind: 'taishogai', reason: 'kihon', reasons };
  }

  // 契約書の作成日の範囲
  if (isContract && input.date < MIN_DATE) {
    reasons.push(
      `${formatDate(MIN_DATE)}より前に作成した契約書は、いまと違う税額表（旧の軽減措置）だったため計算しません`,
    );
    return { kind: 'taishogai', reason: 'kako', reasons };
  }

  // 3. 領収書で営業に関しない
  if (doc === 'ryoshusho') {
    if (isEigyogai(input.issuer)) {
      reasons.push(
        input.issuer === 'kojin-shiteki'
          ? '個人の私的な売買（商売ではないもの）の領収書は「営業に関しない受取書」なので非課税です'
          : '個人の医師・士業や、店舗を持たない農林漁業者の自己生産物の販売は「営業」に当たらないので、領収書は非課税です',
      );
      return { kind: 'zero', reason: 'eigyogai', reasons };
    }
    reasons.push(
      input.issuer === 'hojin'
        ? '会社（営利法人）の領収書は、常に「営業に関する」受取書です'
        : '個人事業主の商売の領収書は「営業に関する」受取書です',
    );
  }

  const copies = isContract ? Math.min(MAX_COPIES, Math.max(1, Math.floor(input.copies))) : 1;
  const honsoku = honsokuTableFor(doc);

  // 金額の記載なし
  if (amount === null) {
    reasons.push(`金額の記載がない${isContract ? '契約書' : '領収書'}は、1通 ${formatYen(KISAI_NASHI_TAX)}です`);
    return {
      kind: 'tax',
      basis: 'kisai-nashi',
      perCopy: KISAI_NASHI_TAX,
      copies,
      total: KISAI_NASHI_TAX * copies,
      honsokuPerCopy: KISAI_NASHI_TAX,
      keigenIfExtended: null,
      keigenTo: null,
      reasons,
    };
  }

  reasons.push(
    taxWriting === 'bunri'
      ? `消費税を分けて書いているので、税抜の ${formatAmount(amount)} で判定します`
      : `税込金額だけを書いているので、その ${formatAmount(amount)} で判定します`,
  );

  // 4. 非課税の範囲
  if (amount < honsoku.exemptBelow) {
    reasons.push(`記載金額が ${formatYen(honsoku.exemptBelow)}未満なので非課税です`);
    return { kind: 'zero', reason: 'hikazei', reasons };
  }

  const honsokuPerCopy = honsokuTax(honsoku, amount);

  // 5. 軽減措置
  const keigen = isContract ? keigenTableAt(doc, input.date) : null;
  if (keigen && amount > keigen.over) {
    const perCopy = lookup(keigen.brackets, amount);
    reasons.push(
      `作成日（${formatDate(input.date)}）が軽減措置の期間（${formatDate(keigen.to)}まで）に入り、金額が ${formatYen(keigen.over)}を超えるので、軽減後の 1通 ${formatYen(perCopy)}です（本則は ${formatYen(honsokuPerCopy)}）`,
    );
    return {
      kind: 'tax',
      basis: 'keigen',
      perCopy,
      copies,
      total: perCopy * copies,
      honsokuPerCopy,
      keigenIfExtended: null,
      keigenTo: keigen.to,
      reasons,
    };
  }

  // 6. 本則
  let keigenIfExtended: number | null = null;
  if (doc === 'fudosan' || doc === 'kensetsu') {
    const latest = latestKeigenTable(doc);
    if (keigen && amount <= keigen.over) {
      reasons.push(
        `軽減措置は ${formatYen(keigen.over)}を超えるものが対象なので、この金額は本則の 1通 ${formatYen(honsokuPerCopy)}です`,
      );
    } else if (latest && input.date > latest.to) {
      if (amount > latest.over) keigenIfExtended = lookup(latest.brackets, amount);
      reasons.push(
        `作成日（${formatDate(input.date)}）が軽減措置の期限（${formatDate(latest.to)}）より後なので、本則の 1通 ${formatYen(honsokuPerCopy)}です` +
          (keigenIfExtended !== null && TAIKO_STATUS === 'pending'
            ? `。延長が決まれば軽減後の ${formatYen(keigenIfExtended)}に戻ります`
            : ''),
      );
    } else {
      reasons.push(`本則の 1通 ${formatYen(honsokuPerCopy)}です`);
    }
  } else {
    reasons.push(
      doc === 'ukeoi'
        ? `工事以外の請負は軽減措置の対象外なので、本則の 1通 ${formatYen(honsokuPerCopy)}です`
        : `記載金額から 1通 ${formatYen(honsokuPerCopy)}です`,
    );
  }

  return {
    kind: 'tax',
    basis: 'honsoku',
    perCopy: honsokuPerCopy,
    copies,
    total: honsokuPerCopy * copies,
    honsokuPerCopy,
    keigenIfExtended,
    keigenTo: null,
    reasons,
  };
}

/** 早見表の1行（作成日の2列で出す） */
export interface QuickRow {
  doc: DocKind;
  amount: number;
  before: number;
  after: number;
}

/** 早見表に出す、よく検索される金額 */
export const QUICK_AMOUNTS: readonly { doc: DocKind; amount: number }[] = [
  { doc: 'ryoshusho', amount: 5 * MAN },
  { doc: 'ryoshusho', amount: 10 * MAN },
  { doc: 'ryoshusho', amount: 100 * MAN },
  { doc: 'fudosan', amount: 1_000 * MAN },
  { doc: 'fudosan', amount: 3_000 * MAN },
  { doc: 'fudosan', amount: 5_000 * MAN },
  { doc: 'kensetsu', amount: 500 * MAN },
  { doc: 'kensetsu', amount: 1_000 * MAN },
];

/** 期限の前日と翌日 */
export const QUICK_BEFORE: Ymd = KEIGEN_TO;
export const QUICK_AFTER: Ymd = nextDay(KEIGEN_TO);

/** 翌日（'2027-03-31' → '2027-04-01'） */
export function nextDay(ymd: Ymd): Ymd {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

const QUICK_BASE: Omit<InshiInput, 'doc' | 'amount' | 'date'> = {
  taxWriting: 'komi',
  medium: 'kami',
  copies: 1,
  issuer: 'hojin',
  ukeoiNature: 'kansei',
};

function perCopyOf(r: Result): number {
  return r.kind === 'tax' ? r.perCopy : 0;
}

export function quickTable(): QuickRow[] {
  return QUICK_AMOUNTS.map(({ doc, amount }) => ({
    doc,
    amount,
    before: perCopyOf(judge({ ...QUICK_BASE, doc, amount, date: QUICK_BEFORE })),
    after: perCopyOf(judge({ ...QUICK_BASE, doc, amount, date: QUICK_AFTER })),
  }));
}

/** 「日本の暦日での今日」。端末のタイムゾーンに任せると日付の境目でずれる */
export function todayInTokyo(now: Date = new Date()): Ymd {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// ---------------------------------------------------------------- 出典

export const SOURCES = {
  ichiran1: {
    label: '国税庁 No.7140 印紙税額の一覧表（その1）第1号文書から第4号文書まで',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7140.htm',
  },
  ichiran2: {
    label: '国税庁 No.7141 印紙税額の一覧表（その2）第5号文書から第20号文書まで',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7141.htm',
  },
  keigen: {
    label: '国税庁 No.7108 不動産の譲渡、建設工事の請負に関する契約書に係る印紙税の軽減措置',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7108.htm',
  },
  ukeoi: {
    label: '国税庁 No.7102 請負に関する契約書',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7102.htm',
  },
  ryoshusho: {
    label: '国税庁 No.7105 金銭又は有価証券の受取書、領収書',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7105.htm',
  },
  shohizei: {
    label: '国税庁 No.7124 消費税額等が区分記載された契約書等の記載金額',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7124.htm',
  },
  eigyogai: {
    label: '国税庁 No.7125 営業に関しない受取書',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7125.htm',
  },
  tebiki: {
    label: '国税庁「印紙税の手引」',
    url: 'https://www.nta.go.jp/publication/pamph/inshi/tebiki/pdf/00.pdf',
  },
  yobo: {
    label: '財務省 令和9年度税制改正要望（国土交通省）印紙税の特例措置の延長',
    url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2027/request/mlit/09y_mlit_k_10.pdf',
  },
} as const;
