/**
 * たばこ値上げ早見表・負担額計算のデータとロジック
 *
 * 仕様: docs/features/tabako-zei-neage.md
 *
 * 防衛力強化の財源確保のための税制措置（令和7年度税制改正）で、たばこ税は
 * **施行日が確定した状態で**段階的に上がる。「いつ・いくら上がるのか」と
 * 「自分の吸う量だといくら増えるのか」を1ページで引けるようにするのがこのツール。
 *
 * ■ 2つの改正が同時に走っていることに注意
 * 1. **加熱式たばこの課税方式の見直し**（令和8年4月1日・令和8年10月1日の2段階）
 *    紙巻たばことの税負担差を解消するための「換算方法」の見直しであって、
 *    税率そのものの引き上げではない。上がり幅は製品の重量・定価で決まるため、
 *    **1箱いくら上がるかを一律には出せない**（このファイルでも金額を持たない）
 * 2. **たばこ税率の引き上げ**（令和9年4月1日から毎年4月1日・3段階）
 *    国たばこ税を1本あたり0.5円（1,000本あたり500円）ずつ引き上げる。
 *    こちらは紙巻・加熱式に共通で、1箱20本なら1回あたり10円（税抜）増える
 *
 * ■ 小売価格は「税額 + α」でしか予測できない
 * たばこの小売定価はメーカーの申請にもとづく財務大臣の認可制なので、増税分が
 * そのまま価格に乗るとは限らない（端数の調整や便乗値上げの有無で変わる）。
 * このファイルが出す将来の価格は **「増税分をそのまま転嫁したと仮定した想定額」**
 * であって、確定した価格ではない。UIは必ず「想定」と添えて表示すること。
 *
 * ■ 一次情報（2026-08-15 取得）
 * - 財務省「たばこ税等に関する資料」
 *   https://www.mof.go.jp/tax_policy/summary/consumption/d09.htm
 *   → 「令和９年４月、令和10年４月及び令和11年４月にそれぞれ0.5円／１本ずつ
 *     ３段階で引き上げる」（PHASES の国たばこ税の刻み）
 * - 国税庁「加熱式たばこに係る課税方式の見直しについて（令和８年４月１日〜）」
 *   https://www.nta.go.jp/information/other/data/r08/tabacco/03.htm
 *   → 令和8年4月1日・同年10月1日の2段階での換算方法の見直し。令和8年10月1日以降は
 *     スティック型は葉たばこ等の重量0.35gごとに紙巻たばこ1本へ換算する
 * - 財務省「たばこにはどれくらいの税金がかかっているのですか？」
 *   https://www.mof.go.jp/tax_information/qanda011.html
 *   → 1箱あたりの税負担の考え方（たばこ税等 + 消費税）
 *
 * 【データ更新箇所】税率が変わったら PHASES に1つフェーズを足す（施行日の昇順）。
 * 引き上げの対象は国たばこ税で、地方たばこ税・たばこ特別税は据え置かれている。
 * **確認したら数値が変わらなくても DATA_CHECKED_AT を必ず更新する**
 * （「確認済みで変化なし」と「確認していない」を区別するため）。
 */

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-08-15';

/** 一次情報へのリンク */
export interface Source {
  /** 出典の名前。UIには「出典：〇〇（YYYY-MM-DD確認）」と出す */
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

/** 財務省「たばこ税等に関する資料」。税率と引き上げスケジュールの出典 */
export const SOURCE_MOF_TABAKO: Source = {
  label: '財務省「たばこ税等に関する資料」',
  url: 'https://www.mof.go.jp/tax_policy/summary/consumption/d09.htm',
  checkedAt: DATA_CHECKED_AT,
};

/** 国税庁「加熱式たばこに係る課税方式の見直しについて（令和8年4月1日〜）」 */
export const SOURCE_NTA_HEATED: Source = {
  label: '国税庁「加熱式たばこに係る課税方式の見直しについて（令和８年４月１日〜）」',
  url: 'https://www.nta.go.jp/information/other/data/r08/tabacco/03.htm',
  checkedAt: DATA_CHECKED_AT,
};

/** 財務省「たばこにはどれくらいの税金がかかっているのですか？」 */
export const SOURCE_MOF_QA: Source = {
  label: '財務省「たばこにはどれくらいの税金がかかっているのですか？」',
  url: 'https://www.mof.go.jp/tax_information/qanda011.html',
  checkedAt: DATA_CHECKED_AT,
};

/**
 * 1,000本あたりの税率（円）。
 * たばこ税は「本数」に対してかかる従量税なので、価格が違っても1本あたりの税額は同じ。
 */
export interface TaxRates {
  /** 国たばこ税。今回の引き上げの対象はここだけ */
  national: number;
  /** たばこ特別税（旧国鉄債務等の処理のための特別税）。据え置き */
  special: number;
  /** 道府県たばこ税（東京都は都たばこ税）。据え置き */
  prefectural: number;
  /** 市町村たばこ税（東京23区は特別区たばこ税）。据え置き */
  municipal: number;
}

/** 税率が切り替わる区切り */
export interface Phase {
  /** 内部識別子。UIの key や比較に使う */
  id: string;
  /** 施行日 'YYYY-MM-DD' */
  effectiveFrom: string;
  /** 表の見出しに使う短い名前（例: '2027年4月〜'） */
  label: string;
  /** 1,000本あたりの税率 */
  rates: TaxRates;
  /** この区切りで何が変わるのかの1行説明 */
  note: string;
  /** 根拠となる一次情報 */
  source: Source;
}

/**
 * 紙巻たばこの税率の推移。
 *
 * 現行の内訳（1,000本あたり）は 国6,802円 + 特別税820円 + 道府県1,070円 + 市町村6,552円
 * ＝ 15,244円。令和9年4月から国たばこ税だけが3回にわたり500円ずつ上がるので、
 * 合計は 15,744円 → 16,244円 → 16,744円 と推移する。
 *
 * 加熱式たばこも令和8年10月1日以降は同じ税率表で課税される（紙巻たばこの本数に
 * 換算したうえで、この税率をかける）。詳しくは HEATED_ALIGNED_FROM のコメントを参照。
 *
 * 【データ更新箇所】税率改正のたびに1件足す。施行日の昇順を保つこと
 * （phaseAt が「基準日以前で最も新しいもの」を選ぶ前提になっている）。
 */
export const PHASES: Phase[] = [
  {
    id: 'current',
    effectiveFrom: '2021-10-01',
    label: '現行',
    rates: { national: 6802, special: 820, prefectural: 1070, municipal: 6552 },
    note: '2018年度の改正による3段階の引き上げが完了した状態。以後2027年3月末まで据え置き',
    source: SOURCE_MOF_TABAKO,
  },
  {
    id: '2027-04',
    effectiveFrom: '2027-04-01',
    label: '2027年4月〜',
    rates: { national: 7302, special: 820, prefectural: 1070, municipal: 6552 },
    note: '防衛財源確保のための引き上げ1回目。国たばこ税を1本あたり0.5円（1,000本あたり500円）引き上げ',
    source: SOURCE_MOF_TABAKO,
  },
  {
    id: '2028-04',
    effectiveFrom: '2028-04-01',
    label: '2028年4月〜',
    rates: { national: 7802, special: 820, prefectural: 1070, municipal: 6552 },
    note: '引き上げ2回目。1回目と同じく国たばこ税を1本あたり0.5円引き上げ',
    source: SOURCE_MOF_TABAKO,
  },
  {
    id: '2029-04',
    effectiveFrom: '2029-04-01',
    label: '2029年4月〜',
    rates: { national: 8302, special: 820, prefectural: 1070, municipal: 6552 },
    note: '引き上げ3回目（最終）。3回の合計で1本あたり1.5円、1箱20本で30円（税抜）の増税になる',
    source: SOURCE_MOF_TABAKO,
  },
];

/** 消費税率。たばこの小売価格は「本体価格（たばこ税を含む）＋消費税」で成り立っている */
export const CONSUMPTION_TAX_RATE = 0.1;

/** 1箱の本数の既定値。紙巻・加熱式スティックとも20本入りが標準 */
export const DEFAULT_STICKS_PER_PACK = 20;

/** 1年の日数。支出の年換算に使う（うるう年は考慮しない概算） */
export const DAYS_PER_YEAR = 365;

/** 加熱式たばこの課税方式見直しの第1段階（激変緩和のための移行措置が始まる日） */
export const HEATED_STEP1_FROM = '2026-04-01';

/**
 * 加熱式たばこの課税方式見直しの第2段階。
 *
 * この日以降、スティック型の加熱式たばこは葉たばこ等の重量 0.35g ごとに
 * 紙巻たばこ1本へ換算され、紙巻たばこと同じ税率表（PHASES）で課税される。
 * 1本あたりの重量が 0.35g 以下の製品には最低課税が働き、スティック1本が
 * 紙巻たばこ1本として扱われる。市販のスティックはおおむねこの範囲に入るため、
 * **20本入り1箱の税額は紙巻たばこ1箱と同額になる**というのがこのツールの前提。
 *
 * 逆にこの日より前の加熱式たばこの税額は、製品ごとの重量と小売定価から決まる
 * 移行措置の計算になるため、銘柄を特定せずに金額を出せない。
 */
export const HEATED_ALIGNED_FROM = '2026-10-01';

/** スティック型の換算基準。葉たばこ等の重量がこの値ごとに紙巻たばこ1本になる */
export const HEATED_GRAM_PER_STICK = 0.35;

/** 扱う製品の種類 */
export type ProductKind = 'paper' | 'heated';

/** 製品の種類の表示名 */
export const PRODUCT_LABEL: Record<ProductKind, string> = {
  paper: '紙巻たばこ',
  heated: '加熱式たばこ（スティック型）',
};

/** 早見表で例示する代表的な価格帯（円・税込）。仕様書の「代表価格帯 500〜650円」 */
export const SAMPLE_PRICES = [500, 550, 580, 600, 650];

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

/** '2027-04-01' → '2027年4月1日' */
export function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

// ---------------------------------------------------------------- 税額

/** 小数の桁を丸める。金額の計算で 11.000000000000002 のような値を残さないため */
function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** 1,000本あたりの税額の合計（円） */
export function taxPerThousand(rates: TaxRates): number {
  return rates.national + rates.special + rates.prefectural + rates.municipal;
}

/** 1本あたりの税額（円）。現行なら 15.244円 */
export function taxPerStick(rates: TaxRates): number {
  return roundTo(taxPerThousand(rates) / 1000, 6);
}

/** 1箱あたりのたばこ税（円・消費税を含まない）。現行の20本入りなら 304.88円 */
export function taxPerPack(rates: TaxRates, sticksPerPack: number = DEFAULT_STICKS_PER_PACK): number {
  return roundTo((taxPerThousand(rates) * sticksPerPack) / 1000, 2);
}

/**
 * 基準日に適用されている区切りを返す。
 * PHASES の最初の施行日より前の日付を渡した場合も現行（PHASES[0]）を返す
 * （このツールは過去の税率の履歴を扱わないため）。
 */
export function phaseIndexAt(asOf: Date | string = new Date()): number {
  const ymd = ymdOf(asOf);
  let index = 0;
  for (let i = 0; i < PHASES.length; i += 1) {
    if (PHASES[i].effectiveFrom <= ymd) index = i;
  }
  return index;
}

/** 基準日に適用されている区切り */
export function phaseAt(asOf: Date | string = new Date()): Phase {
  return PHASES[phaseIndexAt(asOf)];
}

/** 次にやってくる引き上げ。すべて終わっていれば undefined */
export function nextPhase(asOf: Date | string = new Date()): Phase | undefined {
  const ymd = ymdOf(asOf);
  return PHASES.find((p) => p.effectiveFrom > ymd);
}

/** id から区切りを引く。未登録なら undefined */
export function phaseById(id: string): Phase | undefined {
  return PHASES.find((p) => p.id === id);
}

// ---------------------------------------------------------------- 早見表

/** 早見表の1行 */
export interface TaxPoint {
  phase: Phase;
  /** 1,000本あたりの税額（円） */
  perThousand: number;
  /** 1本あたりの税額（円） */
  perStick: number;
  /** 1箱あたりのたばこ税（円・消費税を含まない） */
  perPack: number;
  /** 基準の区切りから見た1箱あたりの増税額（円・消費税を含まない） */
  risePerPack: number;
  /**
   * 増税分をそのまま小売価格に転嫁したときの1箱あたりの値上げ額（円・消費税込み）。
   * たばこ税は消費税の課税対象に含まれるので、増税分にも消費税がかかる
   */
  risePerPackWithTax: number;
}

/**
 * 施行日ごとの税額と、基準の区切りからの増加を並べる。
 *
 * @param sticksPerPack 1箱の本数
 * @param baseIndex 増加額の基準にする区切り（既定は現行）。ここより前の区切りは返さない
 */
export function taxTimeline(
  sticksPerPack: number = DEFAULT_STICKS_PER_PACK,
  baseIndex = 0,
): TaxPoint[] {
  const base = taxPerPack(PHASES[baseIndex].rates, sticksPerPack);
  return PHASES.slice(baseIndex).map((phase) => {
    const perPack = taxPerPack(phase.rates, sticksPerPack);
    const risePerPack = roundTo(perPack - base, 2);
    return {
      phase,
      perThousand: taxPerThousand(phase.rates),
      perStick: taxPerStick(phase.rates),
      perPack,
      risePerPack,
      risePerPackWithTax: roundTo(risePerPack * (1 + CONSUMPTION_TAX_RATE), 2),
    };
  });
}

/** 想定小売価格つきの早見表の1行 */
export interface PricePoint extends TaxPoint {
  /**
   * 増税分をそのまま転嫁したと仮定した1箱の想定小売価格（円・税込）。
   * 基準になる価格が分からないときは持たない
   */
  priceYen?: number;
}

/**
 * 「いまの価格」を起点に、各時点の想定小売価格を並べる。
 *
 * 想定価格 = 基準価格 + 増税額（税抜）×（1 + 消費税率）。
 * 実際の小売定価はメーカーの申請にもとづく財務大臣の認可で決まるため、
 * この値はあくまで**増税分がそのまま乗った場合の目安**であることを UI で明示すること。
 *
 * @param basePrice 基準になる1箱の価格（円・税込）。不明なら省略すると priceYen を持たない行が返る
 */
export function priceTimeline(options: {
  basePrice?: number;
  sticksPerPack?: number;
  baseIndex?: number;
} = {}): PricePoint[] {
  const { basePrice, sticksPerPack = DEFAULT_STICKS_PER_PACK, baseIndex = 0 } = options;
  return taxTimeline(sticksPerPack, baseIndex).map((point) => ({
    ...point,
    priceYen:
      basePrice !== undefined && basePrice > 0
        ? Math.round(basePrice + point.risePerPackWithTax)
        : undefined,
  }));
}

// ---------------------------------------------------------------- 加熱式

/** 加熱式たばこが紙巻たばこと同じ課税に揃うまでの状態 */
export interface HeatedAlignment {
  /** 課税方式の見直しが始まった日（第1段階） */
  step1From: string;
  /** 紙巻たばこと同じ課税に揃う日（第2段階） */
  alignedFrom: string;
  /** 基準日時点で揃っているか。揃っていれば紙巻と同じ税額で計算できる */
  aligned: boolean;
  /** 移行措置の期間中か（第1段階から第2段階の前日まで） */
  transitional: boolean;
}

/**
 * 加熱式たばこの課税方式見直しの進み具合を返す。
 *
 * `aligned` が false の間は、税額が製品ごとの重量・定価で決まるため
 * 「1箱いくら」を出せない。UI はこの旗を見て金額を伏せること。
 *
 * @param asOf 判定の基準日。省略時は現在日。静的書き出しなのでビルド時刻で固定しない
 */
export function heatedAlignment(asOf: Date | string = new Date()): HeatedAlignment {
  const ymd = ymdOf(asOf);
  return {
    step1From: HEATED_STEP1_FROM,
    alignedFrom: HEATED_ALIGNED_FROM,
    aligned: ymd >= HEATED_ALIGNED_FROM,
    transitional: ymd >= HEATED_STEP1_FROM && ymd < HEATED_ALIGNED_FROM,
  };
}

/**
 * 種類と基準日から1箱あたりのたばこ税を返す。
 *
 * 加熱式たばこは2026年10月1日より前は製品ごとに税額が違うので undefined を返す。
 * 「分からない」を 0 や紙巻と同額で埋めると、増税額を過大・過小に見せてしまう。
 */
export function packTaxFor(
  kind: ProductKind,
  asOf: Date | string = new Date(),
  sticksPerPack: number = DEFAULT_STICKS_PER_PACK,
): number | undefined {
  if (kind === 'heated' && !heatedAlignment(asOf).aligned) return undefined;
  return taxPerPack(phaseAt(asOf).rates, sticksPerPack);
}

// ---------------------------------------------------------------- 負担額

/** 負担額計算の入力 */
export interface SpendingInput {
  /** 1日に吸う本数 */
  sticksPerDay: number;
  /** 1箱の価格（円・税込） */
  pricePerPack: number;
  /** 1箱の本数 */
  sticksPerPack?: number;
  /** 税の内訳を出すときの税率。省略時は現行 */
  rates?: TaxRates;
}

/** 支出の見積もり。金額はすべて円 */
export interface Spending {
  /** 1日あたりの支出 */
  daily: number;
  /** 1か月あたりの支出（年間 ÷ 12） */
  monthly: number;
  /** 1年あたりの支出 */
  annual: number;
  /** 1年に吸う本数 */
  sticksPerYear: number;
  /** 1年に買う箱数（端数を含む） */
  packsPerYear: number;
  /** 年間の支出に含まれるたばこ税 */
  annualTobaccoTax: number;
  /** 年間の支出に含まれる消費税 */
  annualConsumptionTax: number;
  /** 年間の支出に占める税（たばこ税＋消費税）の割合（％・小数第1位まで） */
  taxRatioPercent: number;
}

/**
 * 1日の本数と1箱の価格から、月間・年間の支出と、そのうちの税額を見積もる。
 *
 * 箱単位ではなく本数で按分している（1日10本なら半箱ぶんの支出として数える）。
 * 実際には箱でしか買えないが、月・年で均せば本数按分のほうが実感に近いため。
 */
export function estimateSpending(input: SpendingInput): Spending {
  const sticksPerPack = Math.max(1, input.sticksPerPack ?? DEFAULT_STICKS_PER_PACK);
  const sticksPerDay = Math.max(0, input.sticksPerDay);
  const pricePerPack = Math.max(0, input.pricePerPack);
  const rates = input.rates ?? PHASES[0].rates;

  const pricePerStick = pricePerPack / sticksPerPack;
  const sticksPerYear = sticksPerDay * DAYS_PER_YEAR;
  const annualRaw = pricePerStick * sticksPerYear;

  const annualTobaccoTax = taxPerStick(rates) * sticksPerYear;
  // 税込価格の内訳なので、消費税は「税込 × 10/110」で取り出す
  const annualConsumptionTax = (annualRaw * CONSUMPTION_TAX_RATE) / (1 + CONSUMPTION_TAX_RATE);

  return {
    daily: Math.round(pricePerStick * sticksPerDay),
    monthly: Math.round(annualRaw / 12),
    annual: Math.round(annualRaw),
    sticksPerYear,
    packsPerYear: roundTo(sticksPerYear / sticksPerPack, 1),
    annualTobaccoTax: Math.round(annualTobaccoTax),
    annualConsumptionTax: Math.round(annualConsumptionTax),
    taxRatioPercent:
      annualRaw > 0
        ? roundTo(((annualTobaccoTax + annualConsumptionTax) / annualRaw) * 100, 1)
        : 0,
  };
}

/** 増税による負担増（基準の区切りから見た各時点の増加分） */
export interface Increase {
  phase: Phase;
  /** 1箱あたりの値上げ額（円・消費税込み） */
  perPack: number;
  /** 1か月あたりの増加額（円） */
  monthly: number;
  /** 1年あたりの増加額（円） */
  annual: number;
}

/**
 * 増税で支出がいくら増えるかを、施行日ごとに並べる。
 *
 * 増税分がそのまま小売価格に乗ると仮定した金額。基準の区切り自身（増加0）は返さない。
 */
export function increases(options: {
  sticksPerDay: number;
  sticksPerPack?: number;
  baseIndex?: number;
}): Increase[] {
  const { sticksPerDay, sticksPerPack = DEFAULT_STICKS_PER_PACK, baseIndex = 0 } = options;
  const sticksPerYear = Math.max(0, sticksPerDay) * DAYS_PER_YEAR;
  const perPackToPerYear = sticksPerYear / Math.max(1, sticksPerPack);

  return taxTimeline(sticksPerPack, baseIndex)
    .filter((point) => point.risePerPack > 0)
    .map((point) => {
      const annual = point.risePerPackWithTax * perPackToPerYear;
      return {
        phase: point.phase,
        perPack: point.risePerPackWithTax,
        monthly: Math.round(annual / 12),
        annual: Math.round(annual),
      };
    });
}

/** 買わなくなった場合に浮く額 */
export interface Savings {
  /** 年数 */
  years: number;
  /** 浮く額（円） */
  yen: number;
}

/** 節約額を出す年数の既定値 */
export const SAVINGS_YEARS = [1, 5, 10];

/**
 * その支出をやめた場合に浮く額。
 *
 * 値上げの影響を織り込まず、いまの年間支出をそのまま年数倍した単純な金額にしている。
 * 将来の価格は認可制で確定しないため、掛け算の前提を増やすほど数字の意味が薄れるため。
 */
export function quitSavings(annualYen: number, years: number[] = SAVINGS_YEARS): Savings[] {
  return years.map((y) => ({ years: y, yen: Math.round(Math.max(0, annualYen) * y) }));
}

// ---------------------------------------------------------------- 表示

/** 1234 → '1,234円' */
export function formatYen(yen: number): string {
  return `${Math.round(yen).toLocaleString('ja-JP')}円`;
}

/**
 * 304.88 → '304.88円'。小数のある税額をそのまま見せるための整形。
 * 末尾の 0 は落とす（310.00円 ではなく 310円 と出す）
 */
export function formatYenDecimal(yen: number, digits = 2): string {
  const fixed = yen.toFixed(digits);
  // 小数点を含むときだけ末尾を削る（digits=0 で '100' の 0 まで消さないため）
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  const [int, frac] = trimmed.split('.');
  const grouped = Number(int).toLocaleString('ja-JP');
  return `${frac ? `${grouped}.${frac}` : grouped}円`;
}
