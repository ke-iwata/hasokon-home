/**
 * 宿泊税 計算機のロジック（純関数のみ。DOM/React に依存しない）
 *
 * 仕様: docs/features/shukuhakuzei-keisan.md
 *
 * 宿泊税は地方税法 731 条以下の法定外目的税で、税率・免税点・課税免除は自治体の条例が決める。
 * 形が自治体ごとにばらばらなので、**税率表を自治体ごとのデータ（`AREAS`）で持ち**、
 * 計算は 2 つの型（料金の区分ごとの定額／定率）だけで行う。改正のたびに `periods` に 1 行足す。
 *
 * - 税額は「1 人 1 泊」ごと。連泊は**1 泊ごとにその宿泊日の税率**を当てる
 *   （東京の 2027-03-31 から 2 泊は「定額 1 泊＋定率 1 泊」）
 * - 「宿泊料金」は素泊まりの料金（食事代・消費税等を含めない）とする自治体が多い。定義は自治体に従う
 */

// ────────────────────────────────────────────────────────────
// 【データ更新箇所】税率表・確認日・公開前の確認事項
// ────────────────────────────────────────────────────────────

/**
 * 税率表を一次情報と突き合わせた最終確認日（'YYYY-MM-DD'）。
 * **確認しただけで数値が変わらなくても更新する。** テストは形式だけを見る
 * （日付の古さで CI を落とすと時限式になるため。見直しは仕様書の「見直しの時期」で運用する）
 */
export const DATA_CHECKED_AT = '2026-10-13';

/**
 * 東京都の 2027-04-01 からの 3% の端数処理（宿泊料金・税額の切り捨て単位）と上限の有無を、
 * 改正条例か主税局「宿泊税の手引き（改正条例対応版）」で確認したか。
 *
 * 2026-10-13 時点で主税局のページ・報道発表には書かれていない。確認できるまで
 * `TOKYO_2027` の `floorUnit` / `taxFloorUnit` / `cap` は仮置き（1 円単位・上限なし）で、
 * **`stage` を `public` に上げない**（`tests/shukuhakuzei.test.ts` が落とす）
 */
export const TOKYO_RATE_DETAILS_CONFIRMED = false;

/**
 * 沖縄県の「県＋市町村」の併課（石垣市・宮古島市ほか）の内訳を、県・市町村の条例か県の手引きで
 * 確認したか（併課する市町村の一覧・合計が 2%・上限 2,000 円のままか・市町村ごとの課税免除）。
 * 確認できるまで **`stage` を `public` に上げない**（`tests/shukuhakuzei.test.ts` が落とす）
 */
export const OKINAWA_SPLIT_CONFIRMED = false;

/** 税率の型 */
export type Rule =
  /** まだ課税していない（沖縄の施行前など） */
  | { kind: 'none' }
  /** 料金の区分ごとの定額（京都市・大阪府・東京都の現行）。tiers は from の昇順 */
  | { kind: 'flat-tiers'; exemptBelow: number; tiers: { from: number; tax: number }[] }
  /**
   * 定率（沖縄県・東京都の改正後）。
   * 料金を floorUnit 円未満で切り捨て → ratePercent% → 税額を taxFloorUnit 円未満で切り捨て → 上限 cap。
   * 率は浮動小数の誤差を避けるため百分率の整数で持つ
   */
  | {
      kind: 'rate';
      exemptBelow: number;
      ratePercent: number;
      floorUnit: number;
      taxFloorUnit: number;
      cap: number | null;
      /** 端数処理・上限が一次情報で未確認の仮置きか（画面に注記を出す） */
      provisional?: boolean;
    };

export interface Period {
  /** この税率が当たる最初の宿泊日（'YYYY-MM-DD'） */
  from: string;
  /** 最後の宿泊日（'YYYY-MM-DD'）。null は改正の予定なし */
  to: string | null;
  rule: Rule;
  /** 一次情報の URL（kind: 'none' では空文字） */
  source: string;
}

export interface Area {
  id: AreaId;
  name: string;
  /** 宿泊日の昇順。隙間なく並べる */
  periods: Period[];
  /** 課税免除の注記（自治体ごと 1 行） */
  exemptions: string[];
  /** 画面に出す補足（沖縄の併課など） */
  notes: string[];
  /** 県＋市町村の二重課税の内訳。v1 では使わない（福岡・北海道ほかは v2） */
  parts?: { name: string; periods: Period[] }[];
}

export type AreaId = 'tokyo' | 'okinawa' | 'kyoto' | 'osaka';

const TOKYO_SOURCE = 'https://www.tax.metro.tokyo.lg.jp/kazei/leisure/shuk/2';
const OKINAWA_SOURCE =
  'https://www.pref.okinawa.jp/kurashikankyo/zeikin/1003660/1036559/1041134.html';
// 総務大臣同意の報道発表 PDF は 2026-10-19 に 404。税率表と施行日（令和8年3月1日）が載る本ページにした
const KYOTO_SOURCE = 'https://www.city.kyoto.lg.jp/gyozai/page/0000236942.html';
const OSAKA_SOURCE = 'https://www.pref.osaka.lg.jp/o050040/zei/alacarte/shukuhakuzei-kaisei.html';

/** 東京都 2027-04-01 からの定率。端数処理・上限は TOKYO_RATE_DETAILS_CONFIRMED を見ること */
const TOKYO_2027: Rule = {
  kind: 'rate',
  exemptBelow: 13_000,
  ratePercent: 3,
  floorUnit: 1,
  taxFloorUnit: 1,
  cap: null,
  provisional: !TOKYO_RATE_DETAILS_CONFIRMED,
};

export const AREAS: Area[] = [
  {
    id: 'tokyo',
    name: '東京都',
    periods: [
      {
        from: '2002-10-01',
        to: '2027-03-31',
        rule: {
          kind: 'flat-tiers',
          exemptBelow: 10_000,
          tiers: [
            { from: 10_000, tax: 100 },
            { from: 15_000, tax: 200 },
          ],
        },
        source: TOKYO_SOURCE,
      },
      { from: '2027-04-01', to: null, rule: TOKYO_2027, source: TOKYO_SOURCE },
    ],
    exemptions: [
      '2027年4月1日の宿泊分から、簡易宿所・民泊（新法民泊・特区民泊）も対象になります。',
    ],
    notes: [],
  },
  {
    id: 'okinawa',
    name: '沖縄県',
    periods: [
      { from: '2000-01-01', to: '2027-01-31', rule: { kind: 'none' }, source: '' },
      {
        from: '2027-02-01',
        to: null,
        rule: {
          kind: 'rate',
          exemptBelow: 0,
          ratePercent: 2,
          floorUnit: 1_000,
          taxFloorUnit: 1,
          cap: 2_000,
        },
        source: OKINAWA_SOURCE,
      },
    ],
    exemptions: ['修学旅行・部活動の大会参加などは課税免除です（証明書が必要）。'],
    notes: ['石垣市・宮古島市などでは県分と市町村分に分かれます（合計は同じとみられます）。'],
  },
  {
    id: 'kyoto',
    name: '京都市',
    periods: [
      {
        from: '2026-03-01',
        to: null,
        rule: {
          kind: 'flat-tiers',
          exemptBelow: 0,
          tiers: [
            { from: 0, tax: 200 },
            { from: 6_000, tax: 400 },
            { from: 20_000, tax: 1_000 },
            { from: 50_000, tax: 4_000 },
            { from: 100_000, tax: 10_000 },
          ],
        },
        source: KYOTO_SOURCE,
      },
    ],
    exemptions: ['修学旅行などの学校行事で泊まる児童・生徒と引率者は課税免除です。'],
    notes: [],
  },
  {
    id: 'osaka',
    name: '大阪府',
    periods: [
      {
        from: '2025-09-01',
        to: null,
        rule: {
          kind: 'flat-tiers',
          exemptBelow: 5_000,
          tiers: [
            { from: 5_000, tax: 200 },
            { from: 15_000, tax: 400 },
            { from: 20_000, tax: 500 },
          ],
        },
        source: OSAKA_SOURCE,
      },
    ],
    exemptions: ['修学旅行生等は課税免除です。'],
    notes: [],
  },
];

export const DEFAULT_AREA: AreaId = 'tokyo';

/** 連泊として入れられる泊数の上限（1 か月） */
export const MAX_NIGHTS = 30;
/** 人数の上限 */
export const MAX_PEOPLE = 50;

// ────────────────────────────────────────────────────────────
// 計算
// ────────────────────────────────────────────────────────────

export function areaById(id: AreaId): Area {
  const area = AREAS.find((a) => a.id === id);
  if (!area) throw new Error(`unknown area: ${id}`);
  return area;
}

/** その宿泊日に当たる期間。データの範囲外なら null */
export function periodAt(area: Area, stayDate: string): Period | null {
  return (
    area.periods.find((p) => p.from <= stayDate && (p.to === null || stayDate <= p.to)) ?? null
  );
}

/** 境目・上限についての 1 行（値付けをすすめる書き方はしない） */
export type Note =
  | { kind: 'exempt-below'; threshold: number }
  | { kind: 'cap'; cap: number }
  | { kind: 'not-yet'; from: string };

/** 1 人 1 泊の税額（規則だけで決まる部分）。料金は 1 円以上の整数を前提にする */
export function taxByRule(rule: Rule, price: number): { tax: number; note: Note | null } {
  switch (rule.kind) {
    case 'none':
      return { tax: 0, note: null };
    case 'flat-tiers': {
      if (price < rule.exemptBelow) {
        return { tax: 0, note: { kind: 'exempt-below', threshold: rule.exemptBelow } };
      }
      let tax = 0;
      for (const t of rule.tiers) if (price >= t.from) tax = t.tax;
      return { tax, note: null };
    }
    case 'rate': {
      if (price < rule.exemptBelow) {
        return { tax: 0, note: { kind: 'exempt-below', threshold: rule.exemptBelow } };
      }
      const base = Math.floor(price / rule.floorUnit) * rule.floorUnit;
      const raw = Math.floor((base * rule.ratePercent) / 100 / rule.taxFloorUnit) * rule.taxFloorUnit;
      if (rule.cap !== null && raw >= rule.cap) {
        return { tax: rule.cap, note: { kind: 'cap', cap: rule.cap } };
      }
      return { tax: raw, note: null };
    }
  }
}

/** 施行前（kind: 'none'）の期間なら、課税が始まる日 */
function nextTaxedFrom(area: Area, period: Period): string | null {
  if (period.rule.kind !== 'none') return null;
  const i = area.periods.indexOf(period);
  return area.periods.slice(i + 1).find((p) => p.rule.kind !== 'none')?.from ?? null;
}

/** 1 人 1 泊の税額。宿泊日がデータの範囲外なら null */
export function taxPerNight(
  area: Area,
  price: number,
  stayDate: string,
): { tax: number; period: Period; note: Note | null } | null {
  const period = periodAt(area, stayDate);
  if (!period) return null;
  const { tax, note } = taxByRule(period.rule, price);
  const from = nextTaxedFrom(area, period);
  return { tax, period, note: from ? { kind: 'not-yet', from } : note };
}

/** 'YYYY-MM-DD' に n 日足す（UTC で計算するのでタイムゾーンでずれない） */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' の形で、実在する日付か */
export function isYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return addDaysYmd(s, 0) === s;
}

export interface Input {
  area: AreaId;
  /** 1 人 1 泊の料金（素泊まり。円） */
  price: number;
  people: number;
  nights: number;
  /** チェックイン日（1 泊目の宿泊日） */
  checkIn: string;
}

export interface NightRow {
  date: string;
  /** 1 人あたりの税額 */
  tax: number;
  period: Period;
}

export type Breakdown =
  | { ok: false; error: string }
  | {
      ok: true;
      nights: NightRow[];
      /** 1 人あたりの合計（全泊） */
      perPerson: number;
      /** 全員・全泊の合計 */
      total: number;
      /** 全泊で 1 人 1 泊の税額が同じなら、その額。違えば null */
      uniformPerNight: number | null;
      /** 1 泊目の境目・上限の注記 */
      note: Note | null;
    };

/** 入力の誤り。無ければ null */
export function validate(area: Area, input: Omit<Input, 'area'>): string | null {
  const { price, people, nights, checkIn } = input;
  if (!Number.isFinite(price) || price <= 0) return '1人1泊の料金は1円以上で入れてください。';
  if (!Number.isInteger(price)) return '料金は1円単位の整数で入れてください。';
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) {
    return `人数は1〜${MAX_PEOPLE}人で入れてください。`;
  }
  if (!Number.isInteger(nights) || nights < 1 || nights > MAX_NIGHTS) {
    return `泊数は1〜${MAX_NIGHTS}泊で入れてください。`;
  }
  if (!isYmd(checkIn)) return '泊まる日を入れてください。';
  const first = area.periods[0].from;
  if (checkIn < first) {
    return `${area.name}の税率は${formatYmdJa(first)}以降の宿泊分にだけ対応しています。`;
  }
  return null;
}

/** 人数・泊数ぶんの合計。連泊は 1 泊ごとにその宿泊日の税率を当てる */
export function totalTax(
  area: Area,
  price: number,
  people: number,
  checkIn: string,
  nights: number,
): Breakdown {
  const error = validate(area, { price, people, nights, checkIn });
  if (error) return { ok: false, error };
  const rows: NightRow[] = [];
  let note: Note | null = null;
  for (let i = 0; i < nights; i++) {
    const date = addDaysYmd(checkIn, i);
    const r = taxPerNight(area, price, date);
    if (!r) return { ok: false, error: '泊まる日がデータの範囲外です。' };
    if (i === 0) note = r.note;
    rows.push({ date, tax: r.tax, period: r.period });
  }
  const perPerson = rows.reduce((s, r) => s + r.tax, 0);
  const uniform = rows.every((r) => r.tax === rows[0].tax) ? rows[0].tax : null;
  return { ok: true, nights: rows, perPerson, total: perPerson * people, uniformPerNight: uniform, note };
}

/**
 * 改正の前後の 1 行に使う値。
 * - 宿泊日より後に改正がある → `after`（施行後なら◯円）
 * - 宿泊日が改正後で、前の期間がある → `before`（前日までの宿泊なら◯円）
 * - 改正の予定も前の期間も無い自治体（京都市・大阪府）→ null（2 行目を出さない）
 */
export type Revision =
  | { kind: 'after'; from: string; tax: number; diff: number; newlyIntroduced: boolean }
  | { kind: 'before'; until: string; tax: number; diff: number; newlyIntroduced: boolean };

export function revisionCompare(area: Area, price: number, stayDate: string): Revision | null {
  const now = taxPerNight(area, price, stayDate);
  if (!now) return null;
  const i = area.periods.indexOf(now.period);
  const next = area.periods[i + 1];
  if (next) {
    const tax = taxByRule(next.rule, price).tax;
    return {
      kind: 'after',
      from: next.from,
      tax,
      diff: tax - now.tax,
      newlyIntroduced: now.period.rule.kind === 'none',
    };
  }
  const prev = area.periods[i - 1];
  if (prev && prev.to) {
    const tax = taxByRule(prev.rule, price).tax;
    return {
      kind: 'before',
      until: prev.to,
      tax,
      diff: now.tax - tax,
      newlyIntroduced: prev.rule.kind === 'none',
    };
  }
  return null;
}

/** 料金ごとの早見表。行は境目の料金と代表的な料金、列は改正の前後（最大 2 期間） */
export interface QuickTable {
  columns: Period[];
  rows: { price: number; taxes: number[] }[];
}

const SAMPLE_PRICES = [5_000, 10_000, 20_000, 30_000, 50_000];

export function quickTable(area: Area): QuickTable {
  const columns = area.periods.slice(-2);
  const prices = new Set<number>(SAMPLE_PRICES);
  for (const p of columns) {
    const r = p.rule;
    if (r.kind === 'none') continue;
    if (r.exemptBelow > 0) {
      prices.add(r.exemptBelow - 1);
      prices.add(r.exemptBelow);
    }
    if (r.kind === 'flat-tiers') {
      for (const t of r.tiers) {
        if (t.from > 0) {
          prices.add(t.from - 1);
          prices.add(t.from);
        }
      }
    } else if (r.cap !== null) {
      // 上限に届く最初の料金（料金の切り捨て単位にそろえる）
      prices.add(Math.ceil((r.cap * 100) / r.ratePercent / r.floorUnit) * r.floorUnit);
    }
  }
  const rows = [...prices]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
    .map((price) => ({ price, taxes: columns.map((c) => taxByRule(c.rule, price).tax) }));
  return { columns, rows };
}

/** 規則の説明（本文の税率表に使う。額を手で書かないため） */
export function describeRule(rule: Rule): string {
  switch (rule.kind) {
    case 'none':
      return '課税なし';
    case 'flat-tiers': {
      const parts: string[] = [];
      if (rule.exemptBelow > 0) parts.push(`${yen(rule.exemptBelow)}未満 非課税`);
      rule.tiers.forEach((t, i) => {
        const next = rule.tiers[i + 1];
        const range =
          next === undefined
            ? `${yen(t.from)}以上`
            : t.from === 0
              ? `${yen(next.from)}未満`
              : `${yen(t.from)}以上${yen(next.from)}未満`;
        parts.push(`${range} ${yen(t.tax)}`);
      });
      return parts.join('／');
    }
    case 'rate': {
      const parts: string[] = [];
      if (rule.exemptBelow > 0) parts.push(`${yen(rule.exemptBelow)}未満 非課税`);
      const floor = rule.floorUnit > 1 ? `（料金の${yen(rule.floorUnit)}未満切り捨て）` : '';
      parts.push(`宿泊料金の${rule.ratePercent}%${floor}`);
      if (rule.cap !== null) parts.push(`上限${yen(rule.cap)}`);
      return parts.join('／');
    }
  }
}

export function yen(v: number): string {
  return `${v.toLocaleString('ja-JP')}円`;
}

/** '2027-04-01' → '2027年4月1日' */
export function formatYmdJa(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 日本時間の今日（'YYYY-MM-DD'） */
export function todayInJapan(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
