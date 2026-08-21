/**
 * インボイス 納税額 比較計算機（2割特例 終了後）のデータとロジック
 *
 * 仕様: docs/features/invoice-2wari-tokurei-shuryo.md
 *
 * ■ このツールが答える問い
 * 「2割特例が使えなくなったら、次はどれが一番安いのか」。
 * インボイス登録で免税事業者から課税事業者になった小規模事業者が、
 * **2割特例 / 3割特例 / 簡易課税 / 本則課税**のどれを選ぶといくら納めるのかを、
 * 同じ売上高で並べて比べる。
 *
 * ■ 年で選択肢そのものが変わる（個人事業者＝暦年が前提）
 * - 令和8年分（2026年）  … 2割特例が使える**最後の年**
 * - 令和9年・10年分（2027・2028年） … 個人事業者に限り**3割特例**が使える
 * - 令和11年分（2029年）以降 … 特例は無く、簡易課税か本則課税
 * 法人は3割特例を使えない（令和8年9月30日の属する課税期間で2割特例が終わる）。
 * 初版は個人事業者（暦年）だけを対象にしている。
 *
 * ■ このツールの差別化の中心は「簡易課税の届出期限」
 * 納税額を見て簡易課税が有利と分かっても、**届出が間に合わなければ選べない**。
 * しかも2割特例・3割特例からの移行には**特則**があり、原則の
 * 「適用したい課税期間の初日の前日まで」より大幅に遅くてよい。
 * 原則だけを見た人は「もう手遅れ」と誤解して1年損をするので、
 * `kaniDeadline()` は原則と特則の両方を必ず返す。
 *
 * ■ 前提（結果に必ず明記すること）
 * - 売上はすべて**標準税率10%**として計算する。8%（軽減税率）の売上があると
 *   売上税額の時点でずれるので、画面で必ず断る（入力は増やさない）
 * - 端数処理は円未満切捨てのみ。実際の申告では国税分（7.8%）と地方消費税分（2.2%）に
 *   分けて百円未満切捨てなどの処理が入るため、数百円ずれることがある
 * - 「一番安い」は「一番いい」ではない。簡易課税は2年縛り、本則課税は帳簿・
 *   適格請求書の保存が要件で事務負担が重い（`TRADE_OFFS`）
 *
 * ■ 一次情報（2026-08-21 取得。すべて国税庁）
 * - 国税庁「インボイス制度に関する令和8年度税制改正について（2つのポイント）」（令和8年4月）
 *   https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice-review/pdf/0026002-095.pdf
 *   → 3割特例の創設（個人事業者・令和9年分と令和10年分・売上税額の3割）、
 *     2割特例は令和8年9月30日までの日の属する課税期間で終了、
 *     簡易課税制度選択届出書の提出期限の特例の見直し、7・5・3割控除
 * - 国税庁 インボイスQ&A 問117（令和8年4月改訂）
 *   https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/117.pdf
 *   → 届出期限の特則の本文と根拠条文（28年改正法附則51の2⑥、51の3⑤）
 * - 国税庁 インボイスQ&A 問115-2（令和8年4月追加）
 *   https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/115-2.pdf
 *   → 3割特例を適用できない課税期間（28年改正法附則51の3①、消法9①ほか）
 * - 国税庁 インボイスQ&A 問117-3（令和8年4月追加）
 *   https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/117-3.pdf
 *   → 3割特例より簡易課税が安くなる場合・業種別のみなし仕入率の表・簡易課税の2年縛り
 * - 国税庁 インボイスQ&A 凡例
 *   https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/01-01.pdf
 *   → 「28年改正法」＝所得税法等の一部を改正する法律（**平成28年法律第15号**）
 * - 令和8年度税制改正は 所得税法等の一部を改正する法律（**令和8年法律第12号**）による
 *   （当サイトの年収の壁・ふるさと納税と同じ改正法）
 *
 * 【データ更新箇所】特例の年・割合が変わったら YEARS と SPECIAL_RATES、
 * みなし仕入率が変わったら BUSINESS_TYPES、経過措置の控除割合が変わったら
 * PURCHASE_TRANSITION。**確認したら数値が変わらなくても DATA_CHECKED_AT を必ず更新する**
 * （「確認済みで変化なし」と「確認していない」を区別するため）。
 */

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-08-21';

/** 一次情報へのリンク */
export interface Source {
  /** 出典の名前。UIには「出典：〇〇」と出す */
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

/** 国税庁「インボイス制度に関する令和8年度税制改正について」（令和8年4月） */
export const SOURCE_NTA_R8_KAISEI: Source = {
  label: '国税庁「インボイス制度に関する令和８年度税制改正について」（令和８年４月）',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice-review/pdf/0026002-095.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 国税庁 インボイスQ&A 問117（簡易課税制度選択届出書の提出期限の特則） */
export const SOURCE_NTA_QA_117: Source = {
  label: '国税庁 インボイスQ&A 問117（令和８年４月改訂）',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/117.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 国税庁 インボイスQ&A 問115-2（3割特例を適用できない課税期間） */
export const SOURCE_NTA_QA_115_2: Source = {
  label: '国税庁 インボイスQ&A 問115－２（令和８年４月追加）',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/115-2.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 国税庁 インボイスQ&A 問117-3（みなし仕入率の表・3割特例と簡易課税の比較） */
export const SOURCE_NTA_QA_117_3: Source = {
  label: '国税庁 インボイスQ&A 問117－３（令和８年４月追加）',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/117-3.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 国税庁 インボイス制度特設サイト */
export const SOURCE_NTA_INVOICE: Source = {
  label: '国税庁「インボイス制度特設サイト」',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice.htm',
  checkedAt: DATA_CHECKED_AT,
};

/** 根拠法令の表記。ページ下部の出典とFAQで使う */
export const LAW_28_KAISEI = '所得税法等の一部を改正する法律（平成28年法律第15号）';
export const LAW_R8_KAISEI = '所得税法等の一部を改正する法律（令和8年法律第12号）';

/** 標準税率。初版は10%の売上だけを扱う（軽減税率8%は扱わない） */
export const CONSUMPTION_TAX_RATE = 0.1;

/** 軽減税率。計算には使わないが、扱えない旨を画面に出すために持つ */
export const REDUCED_TAX_RATE = 0.08;

/** 2割特例・3割特例の要件になる基準期間の課税売上高の上限（円） */
export const SPECIAL_SALES_LIMIT = 10_000_000;

/** 簡易課税の要件になる基準期間の課税売上高の上限（円） */
export const KANI_SALES_LIMIT = 50_000_000;

/** 簡易課税をやめられるようになるまでの継続適用年数（2年縛り） */
export const KANI_LOCK_IN_YEARS = 2;

// ---------------------------------------------------------------------------
// 業種区分（簡易課税のみなし仕入率）
// ---------------------------------------------------------------------------

export type BusinessTypeId = 'type1' | 'type2' | 'type3' | 'type4' | 'type5' | 'type6';

export interface BusinessType {
  id: BusinessTypeId;
  /** 「第１種事業」 */
  label: string;
  /** みなし仕入率（0.9 = 90%） */
  deemedRate: number;
  /** 該当する事業の説明（国税庁 問117-3 の表から） */
  description: string;
  /** 入力欄の選択肢に出す短い例 */
  example: string;
}

/**
 * 業種別のみなし仕入率。
 *
 * 【データ更新箇所】国税庁 インボイスQ&A 問117-3 の表を正とする。
 */
export const BUSINESS_TYPES: BusinessType[] = [
  {
    id: 'type1',
    label: '第１種事業',
    deemedRate: 0.9,
    description:
      '卸売業（他の者から購入した商品をその性質、形状を変更しないで他の事業者に対して販売する事業）',
    example: '卸売業',
  },
  {
    id: 'type2',
    label: '第２種事業',
    deemedRate: 0.8,
    description:
      '小売業（他の者から購入した商品をその性質、形状を変更しないで販売する事業で第１種事業以外のもの）、農業・林業・漁業（飲食料品の譲渡に係る事業）',
    example: '小売業、飲食料品の農林水産業',
  },
  {
    id: 'type3',
    label: '第３種事業',
    deemedRate: 0.7,
    description:
      '農業・林業・漁業（飲食料品の譲渡に係る事業を除く）、鉱業、建設業、製造業（製造小売業を含む）、電気業、ガス業、熱供給業および水道業',
    example: '建設業、製造業',
  },
  {
    id: 'type4',
    label: '第４種事業',
    deemedRate: 0.6,
    description:
      '第１種・第２種・第３種・第５種・第６種事業以外の事業。具体的には飲食店業など。第３種事業から除かれる加工賃その他これに類する料金を対価とする役務の提供を行う事業も第４種事業',
    example: '飲食店業、加工賃をもらう仕事',
  },
  {
    id: 'type5',
    label: '第５種事業',
    deemedRate: 0.5,
    description:
      '運輸通信業、金融・保険業、サービス業（飲食店業に該当する事業を除く）。第１種事業から第３種事業までに該当するものを除く',
    example: 'サービス業（デザイン・IT・運送など）',
  },
  {
    id: 'type6',
    label: '第６種事業',
    deemedRate: 0.4,
    description: '不動産業',
    example: '不動産業',
  },
];

export function businessTypeById(id: BusinessTypeId): BusinessType {
  const found = BUSINESS_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`業種区分が見つかりません: ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// 年（課税期間）と使える特例
// ---------------------------------------------------------------------------

/** 特例の納税額の割合（売上税額に対する割合） */
export const SPECIAL_RATES = {
  /** 2割特例。納付税額＝売上税額×20%（28年改正法附則51の2） */
  niwari: 0.2,
  /** 3割特例。納付税額＝売上税額×30%（28年改正法附則51の3） */
  sanwari: 0.3,
} as const;

export type SpecialId = keyof typeof SPECIAL_RATES;

export interface YearDef {
  /** 暦年（個人事業者は課税期間＝暦年） */
  year: number;
  /** 「令和8年分」 */
  eraLabel: string;
  /** 選択肢の表示名 */
  label: string;
  /** その年に使える特例。無ければ null */
  special: SpecialId | null;
  /** その年に何が起きるのかの1行説明 */
  note: string;
}

/**
 * 個人事業者が選ぶ「申告する年」。
 *
 * 2029年分（令和11年分）以降は特例が無く、選択肢の顔ぶれが変わらないので
 * 1行にまとめてある（`isOpenEnded` の年）。
 *
 * 【データ更新箇所】特例の年・割合が変わったらここを直す。
 */
export const YEARS: YearDef[] = [
  {
    year: 2026,
    eraLabel: '令和8年分',
    label: '2026年分（令和8年分）',
    special: 'niwari',
    note: '2割特例が使える最後の年。個人事業者の課税期間は暦年なので、令和8年9月30日をまたぐ2026年分までが対象になる',
  },
  {
    year: 2027,
    eraLabel: '令和9年分',
    label: '2027年分（令和9年分）',
    special: 'sanwari',
    note: '2割特例は終わり、個人事業者に限り3割特例が使える1年目',
  },
  {
    year: 2028,
    eraLabel: '令和10年分',
    label: '2028年分（令和10年分）',
    special: 'sanwari',
    note: '3割特例が使える最後の年',
  },
  {
    year: 2029,
    eraLabel: '令和11年分',
    label: '2029年分（令和11年分）以降',
    special: null,
    note: '特例は無くなり、簡易課税か本則課税のどちらかを選ぶ',
  },
];

/** 特例が無くなる最初の年。これ以降は年を分けても選択肢が変わらない */
export const OPEN_ENDED_YEAR = 2029;

export function yearDef(year: number): YearDef {
  const found = YEARS.find((y) => y.year === year);
  if (found) return found;
  // 2030年分以降は2029年分と同じ顔ぶれ。年の指定だけ受け入れて末尾の定義を返す
  if (year > OPEN_ENDED_YEAR) return YEARS[YEARS.length - 1];
  throw new Error(`対象外の年です: ${year}`);
}

/** 個人事業者がその年に使える特例（無ければ null） */
export function specialFor(year: number): SpecialId | null {
  return yearDef(year).special;
}

// ---------------------------------------------------------------------------
// 買手側の経過措置（7・5・3割控除）
// ---------------------------------------------------------------------------

export interface TransitionPhase {
  /** 適用が始まる日 'YYYY-MM-DD' */
  from: string;
  /** 適用が終わる日 'YYYY-MM-DD'（この日を含む） */
  until: string;
  /** 控除できる割合（0.7 = 70%） */
  rate: number;
}

/**
 * 免税事業者等からの課税仕入れについて控除できる割合（買手側の経過措置）。
 * 令和8年度税制改正で適用期限が2年延長され、80% → 70% → 50% → 30% → 0% になった。
 *
 * 【データ更新箇所】国税庁「インボイス制度に関する令和8年度税制改正について」を正とする。
 */
export const PURCHASE_TRANSITION: TransitionPhase[] = [
  { from: '2023-10-01', until: '2026-09-30', rate: 0.8 },
  { from: '2026-10-01', until: '2028-09-30', rate: 0.7 },
  { from: '2028-10-01', until: '2030-09-30', rate: 0.5 },
  { from: '2030-10-01', until: '2031-09-30', rate: 0.3 },
];

/**
 * 経過措置の控除限度額（円）。一の適格請求書発行事業者以外の者からの課税仕入れの
 * 合計額がこれを超える部分には経過措置を使えない（令和8年10月1日以後に開始する課税期間から）。
 */
export const PURCHASE_TRANSITION_CAP = 100_000_000;

/** 経過措置の控除限度額の改正前の額（円） */
export const PURCHASE_TRANSITION_CAP_BEFORE = 1_000_000_000;

// ---------------------------------------------------------------------------
// 納税額の計算
// ---------------------------------------------------------------------------

export interface InvoiceInput {
  /** 申告する年（暦年）。個人事業者を前提にしている */
  year: number;
  /** 年間の課税売上高（円） */
  sales: number;
  /** sales が税込か。false なら税抜 */
  salesIncludesTax: boolean;
  /** 業種区分（簡易課税のみなし仕入率） */
  businessType: BusinessTypeId;
  /**
   * 課税売上高に対する課税仕入れの割合（%）。
   * 本則課税の仕入税額を「売上税額 × この割合」で概算する。
   * 売上と仕入れが同じ税率（10%）である前提。
   */
  purchaseRatePercent: number;
}

export type MethodId = SpecialId | 'kani' | 'honsoku';

export interface MethodResult {
  id: MethodId;
  /** 「2割特例」「簡易課税」など */
  label: string;
  /** 納税額（円・円未満切捨て） */
  tax: number;
  /**
   * 売上税額に対する納税額の割合（0.2 = 20%）。
   * 本則課税は入力の仕入率で変わるので、その年の値。
   */
  rateOfSalesTax: number;
  /** その年に選べるか */
  available: boolean;
  /** 選べないときの理由。available が true なら undefined */
  unavailableReason?: string;
  /** 使える条件の要約（表の「使える条件」列） */
  condition: string;
}

export interface Comparison {
  /** 税抜の課税売上高（円） */
  netSales: number;
  /** 売上税額（円・円未満切捨て） */
  salesTax: number;
  /** 選べる・選べないを含む全方式。安い順ではなく定義順 */
  methods: MethodResult[];
  /** 選べるもののうち納税額が最も少ないもの。入力が0のときも先頭を返す */
  best: MethodResult;
  /** 選べるものだけを納税額の少ない順に並べたもの */
  ranked: MethodResult[];
  /**
   * 本則課税が最も安くなる課税仕入れの割合の下限（%）。
   * 本則以外でいちばん安い方式と釣り合う点。該当が無ければ null
   */
  honsokuBreakEvenPercent: number | null;
  /** 入力が空（売上高が0以下）か */
  empty: boolean;
}

/** 税込・税抜の入力から税抜の課税売上高を求める（円未満切捨て） */
export function netSalesOf(sales: number, includesTax: boolean): number {
  if (!Number.isFinite(sales) || sales <= 0) return 0;
  if (!includesTax) return Math.floor(sales);
  return Math.floor(sales / (1 + CONSUMPTION_TAX_RATE));
}

/** 税抜の課税売上高から売上税額を求める（円未満切捨て） */
export function salesTaxOf(netSales: number): number {
  if (!Number.isFinite(netSales) || netSales <= 0) return 0;
  return Math.floor(netSales * CONSUMPTION_TAX_RATE);
}

/**
 * 割合の引き算で出る2進小数の誤差を落とす。
 *
 * `1 - 0.8` は 0.19999999999999996 になるため、そのまま使うと
 * 売上税額50万円の第2種（みなし仕入率80%）の納税額が 99,999円 と1円ずれ、
 * 「2割特例と同じ20%」の比較も `<` が真になってしまう。
 * 制度の割合はどれも0.1%刻みなので、小数第4位で丸めれば足りる。
 */
function roundRate(rate: number): number {
  return Math.round(rate * 10_000) / 10_000;
}

/** 方式ごとの「売上税額に対する納税額の割合」 */
export function rateOfSalesTaxFor(
  id: MethodId,
  businessType: BusinessType,
  purchaseRate: number,
): number {
  switch (id) {
    case 'niwari':
      return SPECIAL_RATES.niwari;
    case 'sanwari':
      return SPECIAL_RATES.sanwari;
    case 'kani':
      return roundRate(1 - businessType.deemedRate);
    case 'honsoku':
      return roundRate(1 - purchaseRate);
  }
}

/** 入力の仕入割合（%）を 0〜1 に正規化する。負や不正な値は0にする */
export function normalizePurchaseRate(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return percent / 100;
}

const METHOD_LABEL: Record<MethodId, string> = {
  niwari: '2割特例',
  sanwari: '3割特例',
  kani: '簡易課税',
  honsoku: '本則課税',
};

export function methodLabel(id: MethodId): string {
  return METHOD_LABEL[id];
}

/**
 * 4つの方式の納税額を並べて比べる。
 *
 * 本則課税の納税額は「売上税額 − 仕入税額」で、仕入税額は
 * 「売上税額 × 課税仕入れの割合」で概算する（売上・仕入れとも10%の前提）。
 * 仕入れが売上を上回ると本則は還付（マイナス）になりうるので、
 * **0で丸めずマイナスのまま返す**（還付が出るのは本則だけ、という判断材料になるため）。
 */
export function compareMethods(input: InvoiceInput): Comparison {
  const netSales = netSalesOf(input.sales, input.salesIncludesTax);
  const salesTax = salesTaxOf(netSales);
  const type = businessTypeById(input.businessType);
  const purchaseRate = normalizePurchaseRate(input.purchaseRatePercent);
  const special = specialFor(input.year);
  const def = yearDef(input.year);

  const overSpecialLimit = netSales > SPECIAL_SALES_LIMIT;
  const overKaniLimit = netSales > KANI_SALES_LIMIT;

  const build = (id: MethodId): MethodResult => {
    const rate = rateOfSalesTaxFor(id, type, purchaseRate);
    const tax = Math.floor(salesTax * rate);

    let available = true;
    let unavailableReason: string | undefined;

    if (id === 'niwari' || id === 'sanwari') {
      if (special !== id) {
        available = false;
        unavailableReason =
          id === 'niwari'
            ? `${def.eraLabel}には使えません（2割特例は令和8年9月30日の属する課税期間まで＝個人事業者は2026年分が最後）`
            : `${def.eraLabel}には使えません（3割特例は個人事業者の令和9年分・令和10年分の2年間だけ）`;
      } else if (overSpecialLimit) {
        available = false;
        unavailableReason = `基準期間（前々年）の課税売上高が${formatManYen(
          SPECIAL_SALES_LIMIT,
        )}を超えると使えません`;
      }
    }

    if (id === 'kani' && overKaniLimit) {
      available = false;
      unavailableReason = `基準期間（前々年）の課税売上高が${formatManYen(
        KANI_SALES_LIMIT,
      )}を超えると使えません`;
    }

    return {
      id,
      label: METHOD_LABEL[id],
      tax,
      rateOfSalesTax: rate,
      available,
      unavailableReason,
      condition: CONDITIONS[id],
    };
  };

  const methods: MethodResult[] = (['niwari', 'sanwari', 'kani', 'honsoku'] as MethodId[]).map(
    build,
  );

  const ranked = methods.filter((m) => m.available).sort((a, b) => a.tax - b.tax);
  const best = ranked[0] ?? methods[methods.length - 1];

  // 本則以外でいちばん安い方式と釣り合う仕入割合。
  // 本則 = 売上税額 ×(1 − r) なので、r = 1 − （相手の割合）で並ぶ
  const rivals = ranked.filter((m) => m.id !== 'honsoku');
  const cheapestRivalRate = rivals.length > 0 ? Math.min(...rivals.map((m) => m.rateOfSalesTax)) : null;
  const honsokuBreakEvenPercent =
    cheapestRivalRate === null ? null : Math.round((1 - cheapestRivalRate) * 1000) / 10;

  return {
    netSales,
    salesTax,
    methods,
    best,
    ranked,
    honsokuBreakEvenPercent,
    empty: netSales <= 0,
  };
}

/** 表の「使える条件」列 */
export const CONDITIONS: Record<MethodId, string> = {
  niwari:
    'インボイス登録により免税事業者から課税事業者になった人限定。基準期間の課税売上高1,000万円以下などの要件を満たす場合の、令和8年9月30日の属する課税期間まで（個人事業者は2026年分が最後）',
  sanwari:
    '個人事業者限定。インボイス登録により課税事業者になった人で、令和9年分・令和10年分の2年間。基準期間の課税売上高1,000万円以下などの要件を満たす場合',
  kani: '基準期間（前々年）の課税売上高5,000万円以下。事前の届出が必要（期限には特則あり）。いったん選ぶと原則2年間続ける',
  honsoku: '誰でも選べる。帳簿と適格請求書（インボイス）の保存が要件',
};

// ---------------------------------------------------------------------------
// 簡易課税制度選択届出書の提出期限
// ---------------------------------------------------------------------------

export interface KaniDeadline {
  /** 簡易課税を適用したい年（暦年） */
  year: number;
  /**
   * 原則の期限 'YYYY-MM-DD'。
   * 適用を受けようとする課税期間の初日の前日＝前年12月31日（個人事業者）
   */
  principle: string;
  /** 特則を使えるか（前年に2割特例または3割特例の適用を受けたか） */
  hasSpecial: boolean;
  /** 前年に使っていた特例。特則が使えないときは null */
  previousSpecial: SpecialId | null;
  /**
   * 特則の期限 'YYYY-MM-DD'。
   * 適用したい課税期間（＝特例の適用を受けた課税期間の翌課税期間）に係る
   * 確定申告期限。土日等に当たる場合はその翌日
   */
  special: string | null;
  /** 特則で何日ぶん遅らせられるか。特則が無ければ0 */
  extraDays: number;
}

/** 'YYYY-MM-DD' → Date（UTC）。日付の計算はすべてUTCで行い時差の影響を消す */
export function parseYmd(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date（UTC） → 'YYYY-MM-DD' */
export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 提出期限が土曜・日曜・12月29〜31日に当たる場合に、その翌日へずらす。
 *
 * 国税庁 問117 の（注）2 のとおり「これらの日の翌日」になる。
 * 個人事業者の消費税の確定申告期限は3月31日で、3月31日〜4月上旬に国民の祝日は無いため
 * 祝日の判定は持たない（12月31日期限の原則のほうは12月29〜31日の判定で足りる）。
 */
export function shiftIfClosed(iso: string): string {
  let date = parseYmd(iso);
  for (let i = 0; i < 7; i += 1) {
    const day = date.getUTCDay();
    const month = date.getUTCMonth() + 1;
    const dom = date.getUTCDate();
    const closed = day === 0 || day === 6 || (month === 12 && dom >= 29);
    if (!closed) return toYmd(date);
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  return toYmd(date);
}

/**
 * 個人事業者の消費税の確定申告期限。原則はその年の翌年3月31日で、
 * 土日等に当たる場合はその翌日（問117（注）2）。
 */
export function filingDeadline(year: number): string {
  return shiftIfClosed(`${year + 1}-03-31`);
}

/**
 * 簡易課税を `year` から適用したい個人事業者の届出期限。
 *
 * - 原則：適用を受けようとする課税期間の初日の前日（＝前年12月31日）
 * - 特則：2割特例・3割特例の適用を受けた課税期間の**翌課税期間に係る確定申告期限**まで。
 *   その翌課税期間の初日の前日に提出したものとみなされる
 *   （28年改正法附則51の2⑥・51の3⑤。国税庁 問117）
 *
 * **原則の期限は「前年の大晦日」なので、原則だけを見た人は年が明けた時点で
 * 「もう手遅れ」と誤解する。** 特則があれば1年以上あとまで間に合う。
 */
export function kaniDeadline(year: number): KaniDeadline {
  // 原則の期限は前年12月31日。12月29〜31日は「これらの日の翌日」の対象なので、
  // 課税期間の末日そのものである原則の期限にはこのずらしを効かせない
  // （問117（注）3：課税期間の末日が休日等でも翌日にはならない）
  const principle = `${year - 1}-12-31`;

  const previousSpecial = specialFor(year - 1);
  const hasSpecial = previousSpecial !== null;
  const special = hasSpecial ? filingDeadline(year) : null;

  const extraDays = special
    ? Math.round((parseYmd(special).getTime() - parseYmd(principle).getTime()) / 86_400_000)
    : 0;

  return { year, principle, hasSpecial, previousSpecial, special, extraDays };
}

// ---------------------------------------------------------------------------
// 納税額以外の判断材料
// ---------------------------------------------------------------------------

export interface TradeOff {
  /** どの方式についての注意か */
  method: MethodId;
  title: string;
  body: string;
}

/**
 * 納税額だけで並べると本則課税に誘導してしまう人が出るので、
 * 結果の直下に必ず添える判断材料。
 */
export const TRADE_OFFS: TradeOff[] = [
  {
    method: 'kani',
    title: '簡易課税は原則2年間やめられない（2年縛り）',
    body: '簡易課税制度を選ぶと、事業を廃止した場合を除き、2年間継続して適用したあとでなければやめられません（適用を開始した課税期間の初日から2年を経過する日の属する課税期間の初日以後でなければ「消費税簡易課税制度選択不適用届出書」を提出できません）。翌年に売上の構成が変わっても、大きな設備投資をしても戻せません。',
  },
  {
    method: 'honsoku',
    title: '本則課税は帳簿と適格請求書の保存が要件で、事務負担が段違いに重い',
    body: '本則課税で仕入税額控除を受けるには、原則としてインボイス（適格請求書）と帳簿の保存が必要です。仕入れの1件ごとに税率区分と登録番号を確認して記帳することになります。「一番安い」が「一番いい」とは限りません。',
  },
  {
    method: 'honsoku',
    title: '還付が出るのは本則課税だけ',
    body: '多額の設備投資などで課税仕入れに係る消費税額が課税売上げに係る消費税額を上回る場合、本則課税なら還付税額が生じますが、簡易課税・2割特例・3割特例では通常、還付は生じません（国税庁 問117-3）。',
  },
  {
    method: 'sanwari',
    title: '特例は申告書への付記が要る（届出は不要）',
    body: '2割特例・3割特例は事前の届出が不要で、確定申告書にその旨を付記することで適用できます。逆に簡易課税は事前の届出が必要です。',
  },
];

// ---------------------------------------------------------------------------
// 表示のための整形
// ---------------------------------------------------------------------------

/** 12345 → '12,345円' */
export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

/**
 * 10_000_000 → '1,000万円'。
 * 制度の閾値（1,000万円・5,000万円）は一次資料でも万円単位で書かれているので、
 * 判定の説明ではこちらを使う（「10,000,000円を超えると」では条文と照合しにくい）。
 */
export function formatManYen(value: number): string {
  return `${(value / 10_000).toLocaleString('ja-JP')}万円`;
}

/** 0.2 → '20%'、0.055 → '5.5%' */
export function formatPercent(rate: number): string {
  const percent = rate * 100;
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded.toLocaleString('ja-JP')}%`;
}

/** '2026-08-21' → '2026年8月21日' */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 差額を符号つきで。0 は「変わりません」ではなく「±0円」 */
export function formatDiff(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(Math.round(value)).toLocaleString('ja-JP')}円`;
}

/**
 * 業種別の早見表の1行。売上税額100万円あたりの納税額で並べると
 * どの方式が有利かが一目で分かる。
 */
export interface HayamiRow {
  type: BusinessType;
  /** 簡易課税の納税額の割合（1 − みなし仕入率） */
  kaniRate: number;
  /** 3割特例より簡易課税のほうが安いか */
  kaniBeatsSanwari: boolean;
  /** 2割特例より簡易課税のほうが安いか */
  kaniBeatsNiwari: boolean;
}

/** 業種別みなし仕入率の早見表（静的。入力に依存しない） */
export function hayamihyo(): HayamiRow[] {
  return BUSINESS_TYPES.map((type) => {
    const kaniRate = roundRate(1 - type.deemedRate);
    return {
      type,
      kaniRate,
      kaniBeatsSanwari: kaniRate < SPECIAL_RATES.sanwari,
      kaniBeatsNiwari: kaniRate < SPECIAL_RATES.niwari,
    };
  });
}
