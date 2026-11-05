/**
 * ガソリン代 計算機の計算ロジック（純関数のみ）。
 *
 * 仕様: docs/features/gasoline-dai-keisan.md
 *
 * - 1回のドライブ：距離 ÷ 燃費 × 単価 ＋ 高速代など、を人数で割る（1円未満は切り上げ）
 * - 毎月・1年：毎月の走行距離から月額・年額、単価が上がったときの差、
 *   暫定税率（当分の間税率）の分の税が年何円相当か
 *
 * 補助の縮小の日程・基準価格は**ここに持たない**（政策が週単位で動くため。本文の FAQ だけに書く）。
 */

// ============================================================
// 【データ更新箇所】単価の既定値（月1回、registry の updatedAt と一緒に更新する）
// ============================================================

/**
 * 全国平均の店頭価格（円/L・消費税込み）。資源エネルギー庁 石油製品価格調査の同じ週の値。
 *
 * 2026-10-26（月）調査・2026-10-28（水）公表：レギュラー 170.1・ハイオク 181.0・軽油 159.7。
 * **`public` にする PR で最新の週の値に更新すること**（仕様書「単価の持ち方」）。
 */
export const FUEL_PRICES = {
  asOf: '2026-10-26',
  regular: 170.1,
  highOctane: 181.0,
  diesel: 159.7,
  source: '資源エネルギー庁 石油製品価格調査',
  sourceUrl: 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html',
} as const;

/**
 * 暫定税率（当分の間税率）の分の税（円/L）。
 *
 * - ガソリン（揮発油税・地方揮発油税）：25.1 円/L。2025-12-31 に廃止
 * - 軽油（軽油引取税）：17.1 円/L。2026-04-01 に廃止
 *
 * 揮発油税は店頭価格に含まれて消費税（10%）の課税標準になるので、消費税込みでは 25.1 × 1.1 ＝ 27.61 円/L。
 * 軽油引取税は区分して受け取る場合は消費税の課税標準に含まれない（消費税法基本通達 10-1-11）ので 17.1 円/L のまま。
 * 出典：資源エネルギー庁 エネこれ「ガソリンの暫定税率（当分の間税率）の廃止でガソリン代はどうなるの？」
 */
export const ZANTEI_TAX = {
  gasolinePerLiter: 25.1,
  dieselPerLiter: 17.1,
  consumptionTaxRate: 0.1,
  gasolineAbolishedOn: '2025-12-31',
  dieselAbolishedOn: '2026-04-01',
} as const;

/** 単価が上がったときの差の幅（円/L）。既定は報道の 12 月の縮小幅 */
export const PRICE_RISE = { default: 5, min: 1, max: 20 } as const;

// ============================================================

export type FuelType = 'regular' | 'highOctane' | 'diesel';

export const FUEL_LABELS: Record<FuelType, string> = {
  regular: 'レギュラー',
  highOctane: 'ハイオク',
  diesel: '軽油',
};

/** 油種の既定の単価 */
export function defaultPrice(fuel: FuelType): number {
  return FUEL_PRICES[fuel];
}

/** 暫定税率の分の税（消費税込み・円/L）。ハイオクはガソリンと同じ */
export function zanteiTaxPerLiter(fuel: FuelType): number {
  if (fuel === 'diesel') return ZANTEI_TAX.dieselPerLiter;
  // 浮動小数の誤差（25.1 × 1.1 ＝ 27.610000000000003）を落とす
  return Math.round(ZANTEI_TAX.gasolinePerLiter * (1 + ZANTEI_TAX.consumptionTaxRate) * 100) / 100;
}

/** '2026-10-26' → '2026年10月26日' */
export function formatDateJa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 1,234 円 の形（数字の区切りだけ。単位は呼び出し側） */
export function formatYen(yen: number): string {
  return Math.round(yen).toLocaleString('ja-JP');
}

/** 給油量の表示（小数1桁・四捨五入）。金額の計算には使わない */
export function formatLiters(liters: number): string {
  return (Math.round(liters * 10) / 10).toFixed(1);
}

/**
 * 入力欄に打たれた文字列を受け付けるか。距離・燃費は**小数1桁まで**
 * （100.2 km は丸めずに受け、100.25 は入力できない）。空欄は受け付ける。
 */
export function acceptsOneDecimal(text: string): boolean {
  return /^\d*(\.\d?)?$/.test(text);
}

/** 単価（円/L）・金額の入力。単価は小数1桁、金額は整数 */
export function acceptsPrice(text: string): boolean {
  return acceptsOneDecimal(text);
}
export function acceptsInteger(text: string): boolean {
  return /^\d*$/.test(text);
}

/** 空欄は null、数として読めなければ NaN */
function toNumber(text: string): number | null {
  if (text.trim() === '') return null;
  return Number(text);
}

/**
 * 単価の横に出す日付。単価が既定値のままなら「◯年◯月◯日時点の全国平均（資源エネルギー庁）」、
 * 書き換えたら null（日付の表示を消す。利用者の単価に日付を付けると嘘になるため）。
 */
export function priceAsOfLabel(fuel: FuelType, priceText: string): string | null {
  const n = toNumber(priceText);
  if (n === null || n !== defaultPrice(fuel)) return null;
  return `${formatDateJa(FUEL_PRICES.asOf)}時点の全国平均（${FUEL_PRICES.source}）`;
}

export type Invalid = { ok: false; problems: string[] };

/** 必須の数の欄を読む。欠け・不正は problems に欄の名前つきで足す */
function readPositive(
  text: string,
  name: string,
  problems: string[],
  { allowZero = false }: { allowZero?: boolean } = {},
): number {
  const n = toNumber(text);
  if (n === null) {
    problems.push(`${name}を入れてください`);
    return NaN;
  }
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) {
    problems.push(`${name}は${allowZero ? '0以上' : '0より大きい数'}で入れてください`);
    return NaN;
  }
  return n;
}

// ------------------------------------------------------------
// 1回のドライブ
// ------------------------------------------------------------

export type TripInput = {
  /** 片道の距離（km）。文字列のまま受ける（空欄を見分けるため） */
  distanceKm: string;
  roundTrip: boolean;
  kmPerLiter: string;
  pricePerLiter: string;
  /** 高速代・駐車場代など（円）。空欄は 0 */
  extraYen: string;
  people: number;
  /** 運転する人は払わない（2人以上のときだけ効く） */
  driverExempt: boolean;
};

export type TripResult = {
  ok: true;
  /** 走る距離（往復ならここで2倍） */
  km: number;
  /** 給油量（丸める前） */
  liters: number;
  /** ガソリン代（1円未満四捨五入） */
  fuelYen: number;
  extraYen: number;
  totalYen: number;
  people: number;
  /** 割る人数（運転者を除くなら people − 1） */
  payers: number;
  /** 1人分（1円未満切り上げ） */
  perPersonYen: number;
  /** 切り上げで集めすぎる額（幹事に残る分） */
  overCollectedYen: number;
};

export function calcTrip(input: TripInput): TripResult | Invalid {
  const problems: string[] = [];
  const oneWay = readPositive(input.distanceKm, '距離', problems);
  const kmPerLiter = readPositive(input.kmPerLiter, '燃費', problems);
  const price = readPositive(input.pricePerLiter, '単価', problems);
  const extra = input.extraYen.trim() === '' ? 0 : readPositive(input.extraYen, '高速代・駐車場代など', problems, { allowZero: true });
  const people = Math.floor(input.people);
  if (!Number.isFinite(people) || people < 1) problems.push('人数は1人以上で入れてください');
  if (problems.length > 0) return { ok: false, problems };

  const km = input.roundTrip ? oneWay * 2 : oneWay;
  const liters = km / kmPerLiter;
  const fuelYen = Math.round(liters * price);
  const extraYen = Math.round(extra);
  const totalYen = fuelYen + extraYen;
  const payers = people >= 2 && input.driverExempt ? people - 1 : people;
  const perPersonYen = Math.ceil(totalYen / payers);
  return {
    ok: true,
    km,
    liters,
    fuelYen,
    extraYen,
    totalYen,
    people,
    payers,
    perPersonYen,
    overCollectedYen: perPersonYen * payers - totalYen,
  };
}

/** 小数1桁まで、余計な .0 を付けない（240 → '240'、100.2 → '100.2'） */
function fmtNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * 割り勘の連絡用の文。
 * 例：「往復 240 km・燃費 15 km/L・170.1 円/L → ガソリン代 2,722 円＋高速代など 3,000 円＝5,722 円、4 人で 1 人 1,431 円」
 */
export function tripCopyText(input: TripInput, r: TripResult): string {
  const price = Number(input.pricePerLiter);
  const head = `${input.roundTrip ? '往復' : '片道'} ${fmtNum(r.km)} km・燃費 ${fmtNum(Number(input.kmPerLiter))} km/L・${fmtNum(price)} 円/L`;
  const money =
    r.extraYen > 0
      ? `ガソリン代 ${formatYen(r.fuelYen)} 円＋高速代など ${formatYen(r.extraYen)} 円＝${formatYen(r.totalYen)} 円`
      : `ガソリン代 ${formatYen(r.fuelYen)} 円`;
  if (r.people < 2) return `${head} → ${money}`;
  const who = r.payers === r.people ? `${r.people} 人` : `${r.people} 人（運転する人を除く ${r.payers} 人）`;
  return `${head} → ${money}、${who}で 1 人 ${formatYen(r.perPersonYen)} 円`;
}

// ------------------------------------------------------------
// 毎月・1年
// ------------------------------------------------------------

export type MonthlyInput = {
  monthlyKm: string;
  kmPerLiter: string;
  pricePerLiter: string;
  fuel: FuelType;
  /** 単価の上がり幅（円/L）。PRICE_RISE.min〜max */
  priceRise: number;
};

export type MonthlyResult = {
  ok: true;
  fuel: FuelType;
  litersPerMonth: number;
  litersPerYear: number;
  /** 月額（1円未満四捨五入） */
  monthYen: number;
  /** 年額 ＝ 月額 × 12 */
  yearYen: number;
  priceRise: number;
  /** 単価が priceRise 円/L 上がったときの月の差 */
  riseMonthYen: number;
  riseYearYen: number;
  /** 暫定税率の分の税（消費税込み）の単価（円/L） */
  zanteiPerLiter: number;
  /** 年間給油量 × その額。**税額として◯円相当**で、店頭価格の値下がりではない */
  zanteiYearYen: number;
};

export function calcMonthly(input: MonthlyInput): MonthlyResult | Invalid {
  const problems: string[] = [];
  const monthlyKm = readPositive(input.monthlyKm, '毎月の走行距離', problems);
  const kmPerLiter = readPositive(input.kmPerLiter, '燃費', problems);
  const price = readPositive(input.pricePerLiter, '単価', problems);
  if (problems.length > 0) return { ok: false, problems };

  const rise = Math.min(PRICE_RISE.max, Math.max(PRICE_RISE.min, Math.round(input.priceRise)));
  const litersPerMonth = monthlyKm / kmPerLiter;
  const litersPerYear = litersPerMonth * 12;
  const monthYen = Math.round(litersPerMonth * price);
  const riseMonthYen = Math.round(litersPerMonth * rise);
  const zanteiPerLiter = zanteiTaxPerLiter(input.fuel);
  return {
    ok: true,
    fuel: input.fuel,
    litersPerMonth,
    litersPerYear,
    monthYen,
    yearYen: monthYen * 12,
    priceRise: rise,
    riseMonthYen,
    riseYearYen: riseMonthYen * 12,
    zanteiPerLiter,
    zanteiYearYen: Math.round(litersPerYear * zanteiPerLiter),
  };
}

/** 暫定税率の行のすぐ下に必ず出す注記（「軽くなった」とは書かない。仕様書「結果の出し方」） */
export const ZANTEI_NOTE =
  '店頭価格がこの額だけ下がったとは限りません（廃止の前後で補助の額が変わったため）。';

/**
 * 毎月・1年の結果の下に出す行（画面とテストで同じ文を使う）。
 * 注記（note）のある行は最後に置く。画面は注記を `</dl>` のすぐ後ろに出すので、その直上の行の注記になる
 */
export function monthlyDetailLines(r: MonthlyResult): { label: string; value: string; note?: string }[] {
  return [
    {
      label: `単価が ＋${r.priceRise} 円/L なら`,
      value: `月 ＋${formatYen(r.riseMonthYen)} 円・年 ＋${formatYen(r.riseYearYen)} 円`,
    },
    {
      // 軽油引取税には消費税がかからないので、軽油のときに「消費税込み」と書かない（#459 のレビュー）
      label: r.fuel === 'diesel'
        ? `暫定税率の分の税（${r.zanteiPerLiter} 円/L・消費税はかからない）`
        : `暫定税率の分の税（消費税込み・${r.zanteiPerLiter} 円/L）`,
      value: `年 ${formatYen(r.zanteiYearYen)} 円相当`,
      note: ZANTEI_NOTE,
    },
  ];
}

/** ハイオクとレギュラーの全国平均の差（FAQ 用） */
export function highOctaneGap(): number {
  return Math.round((FUEL_PRICES.highOctane - FUEL_PRICES.regular) * 10) / 10;
}
