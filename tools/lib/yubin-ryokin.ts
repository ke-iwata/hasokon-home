/**
 * 郵便料金 計算機（はがき・封書・定形外・速達・書留）のロジック。純関数のみ。
 *
 * 仕様: docs/features/yubin-ryokin-keisan.md
 *
 * - 大きさ（長さ・幅・厚さ）と重さから、定形・定形外（規格内・規格外）を判定して料金を出す
 * - 料金表は「いつから」つきで持つ（`RATE_TABLES`）。値上げの認可が出たら表を1つ足すだけで、
 *   施行日の前は「◯年◯月◯日から◯円になります」が出て、施行日からは新しい額に切り替わる
 * - 年賀状の帯は `NENGA_SCHEDULES` の定数から組み立てる（報道発表に書いてあることだけを書く）
 *
 * 長さは 0.1mm（cm × 100）、重さは 0.1g（g × 10）の整数に直して比べる。
 * 小数のまま比べると 23.5 や 50.1 の境目で二進小数の誤差が出るため。
 */

// ---------------------------------------------------------------- 日付

/** 'YYYY-MM-DD' */
export type Ymd = string;

/**
 * 日本の暦日での「今日」（'YYYY-MM-DD'）。端末の時刻設定に任せると日付の境目で 1 日ずれるので、
 * `lib/toshi-iwai.ts` と同じく Asia/Tokyo で取り出す。`asOf` と年賀状の帯はすべてこの日付で判定する
 */
export function todayInTokyo(now: Date = new Date()): Ymd {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function ymdToUtc(ymd: Ymd): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** a から b までの日数（b − a）。暦日で数える */
export function daysBetween(a: Ymd, b: Ymd): number {
  return Math.round((ymdToUtc(b) - ymdToUtc(a)) / 86_400_000);
}

/** ymd の n 日後 */
export function addDays(ymd: Ymd, n: number): Ymd {
  return new Date(ymdToUtc(ymd) + n * 86_400_000).toISOString().slice(0, 10);
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** '2026-12-20' → '12月20日（日）' */
export function formatMonthDay(ymd: Ymd): string {
  const [, m, d] = ymd.split('-').map(Number);
  const w = WEEKDAYS[new Date(ymdToUtc(ymd)).getUTCDay()];
  return `${m}月${d}日（${w}）`;
}

/** '2027-10-01' → '2027年10月1日' */
export function formatFullDate(ymd: Ymd): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

// ---------------------------------------------------------------- 入力の読み取り

/** 全角の数字・小数点・カンマを半角に直して数値にする。空・数値でなければ null */
export function parseDecimal(text: string): number | null {
  const half = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[,，、\s]/g, '');
  if (half === '' || !/^\d*\.?\d+$|^\d+\.$/.test(half)) return null;
  const n = Number(half);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- 料金表【データ更新箇所】

/** 重さの段（「以内」。境目ちょうどは下の段） */
export interface WeightStep {
  /** この重さ（g）まで */
  upTo: number;
  fee: number;
}

/**
 * 日付つきの料金表。**基本料金・オプションの加算額・レターパックを 1 つの表に入れる**
 * （値上げのときに基本料金だけが差し替わり、加算額やレターパックが古いまま残るのを防ぐ）
 */
export interface RateTable {
  /** この表を使い始める日 */
  effectiveFrom: Ymd;
  /** 定形郵便物（50g まで） */
  teikei: number;
  /** 定形外（規格内） */
  kikakunai: WeightStep[];
  /** 定形外（規格外） */
  kikakugai: WeightStep[];
  /** 通常はがき */
  hagaki: number;
  /** 往復はがき */
  ofukuHagaki: number;
  /** 速達の加算（重さの段） */
  sokutatsu: WeightStep[];
  /** 特定記録の加算 */
  tokuteiKiroku: number;
  /** 簡易書留の加算（損害要償額 `kaniMaxSongai` まで） */
  kaniKakitome: number;
  kaniMaxSongai: number;
  /** 一般書留：`baseCovers` 円までは `base`、以後 `stepYen` 円ごとに `stepFee`、上限 `max` 円 */
  ippanKakitome: { base: number; baseCovers: number; stepYen: number; stepFee: number; max: number };
  /** 現金書留（入力のオプションには出さない。表として載せておくだけ。仕様の「やらないこと」） */
  genkinKakitome: { base: number; baseCovers: number; stepYen: number; stepFee: number; max: number };
  /** 配達証明（差出時。一般書留とした郵便物に限る） */
  haitatsuShomei: number;
  letterPackPlus: number;
  letterPackLight: number;
}

/**
 * 【データ更新箇所】料金表。effectiveFrom の昇順に並べる。
 *
 * 出典（2026-10-21 確認、2026-11-02 再確認）:
 * - 日本郵便「手紙・はがき」料金表 https://www.post.japanpost.jp/send/domestic/charge/list/one_two.html
 * - 日本郵便「オプションサービス」料金表 https://www.post.japanpost.jp/send/domestic/charge/list/option.html
 * - 日本郵便「レターパック」 https://www.post.japanpost.jp/service/send/domestic/mail/letterpack/
 *
 * 次の値上げ（改正郵便法（令和8年法律第42号、2026年12月1日施行）により、定形郵便の上限料金は
 * 日本郵便が定めて総務大臣の認可を受ける仕組みになる。施行前は省令で定める）は
 * **額・時期とも決まっていない**。認可・発表が出たら、新しい表を `effectiveFrom` つきで末尾に足す。
 * 足したら `tests/post-effective-copy.test.ts` にその `effectiveFrom` を登録する（仕様の「ビルド時に焼き込まれる文面」）
 */
export const RATE_TABLES: readonly RateTable[] = [
  {
    effectiveFrom: '2024-10-01',
    teikei: 110,
    kikakunai: [
      { upTo: 50, fee: 140 },
      { upTo: 100, fee: 180 },
      { upTo: 150, fee: 270 },
      { upTo: 250, fee: 320 },
      { upTo: 500, fee: 510 },
      { upTo: 1000, fee: 750 },
    ],
    kikakugai: [
      { upTo: 50, fee: 260 },
      { upTo: 100, fee: 290 },
      { upTo: 150, fee: 390 },
      { upTo: 250, fee: 450 },
      { upTo: 500, fee: 660 },
      { upTo: 1000, fee: 920 },
      { upTo: 2000, fee: 1350 },
      { upTo: 4000, fee: 1750 },
    ],
    hagaki: 85,
    ofukuHagaki: 170,
    sokutatsu: [
      { upTo: 250, fee: 300 },
      { upTo: 1000, fee: 400 },
      { upTo: 4000, fee: 690 },
    ],
    tokuteiKiroku: 210,
    kaniKakitome: 350,
    kaniMaxSongai: 50_000,
    ippanKakitome: { base: 480, baseCovers: 100_000, stepYen: 50_000, stepFee: 23, max: 5_000_000 },
    genkinKakitome: { base: 480, baseCovers: 10_000, stepYen: 5_000, stepFee: 11, max: 500_000 },
    haitatsuShomei: 350,
    letterPackPlus: 600,
    letterPackLight: 430,
  },
];

/** asOf 以前で最新の表 */
export function rateTableAt(asOf: Ymd, tables: readonly RateTable[] = RATE_TABLES): RateTable {
  let found = tables[0];
  for (const t of tables) if (t.effectiveFrom <= asOf) found = t;
  return found;
}

/** asOf より後に始まる最初の表（未来の表が入っていなければ null） */
export function nextRateTable(asOf: Ymd, tables: readonly RateTable[] = RATE_TABLES): RateTable | null {
  return tables.find((t) => t.effectiveFrom > asOf) ?? null;
}

// ---------------------------------------------------------------- 大きさの規格【データ更新箇所】

/**
 * 大きさ・重さの規格（cm・g）。
 * 出典: 日本郵便「手紙・はがき」料金表（上記）と「手紙（第一種郵便物）」
 * https://www.post.japanpost.jp/service/send/domestic/mail/letter/ （最大・最小の図。2026-10-24 確認）
 */
export const LIMITS = {
  /** 郵便物ぜんたいの最小（定形の下限と同じ）。これに足りないものは定形外にもならない */
  min: { long: 14, short: 9 },
  teikei: { longMax: 23.5, shortMax: 12, thickMax: 1, weightMax: 50 },
  kikakunai: { longMax: 34, shortMax: 25, thickMax: 3, weightMax: 1000 },
  kikakugai: { longMax: 60, sumMax: 90, weightMax: 4000 },
  /** 筒形の最小（初版は判定しない。最小に足りないときに添えるだけ） */
  tube: { diameter: 3, length: 14 },
  /** あて名札の特例（6cm×12cm 以上の厚紙か布のあて名札） */
  tagSpecial: { short: 6, long: 12 },
} as const;

/**
 * 通常はがきの規格。外れたら封書として判定する。
 * 出典: 日本郵便「はがき」 https://www.post.japanpost.jp/service/send/domestic/mail/postcard/
 * （重さ 2〜6g は本文、大きさは最大・最小の図。2026-11-02 確認）
 */
export const HAGAKI_SPEC = { longMin: 14, longMax: 15.4, shortMin: 9, shortMax: 10.7, weightMin: 2, weightMax: 6 } as const;

/**
 * レターパックの封筒の大きさ（cm）。プラス・ライトとも 340mm×248mm（A4ファイルサイズ）・4kg 以内。
 * ライトだけ厚さ 3cm 以内。出典: 日本郵便「レターパック」（上記。2026-11-02 確認）
 */
export const LETTER_PACK = { long: 34, short: 24.8, weightMax: 4000, lightThickMax: 3 } as const;

/** ゆうパックの案内（送れないと出したときのリンク先） */
export const YU_PACK_URL = 'https://www.post.japanpost.jp/service/yu_pack/';

// ---------------------------------------------------------------- よく使う封筒【データ更新箇所】

export interface EnvelopePreset {
  name: string;
  /** 用途の目安 */
  note: string;
  /** cm（大きいほうを length） */
  length: number;
  width: number;
}

/**
 * よく使う封筒（JIS S 5502）。寸法は日本郵便「JIS S5502:2010「封筒」に適合する封筒の条件」の
 * 呼称と寸法の表から写した（https://www.post.japanpost.jp/service/create/guideline/jis_envelope.html 2026-11-02 確認）
 */
export const ENVELOPE_PRESETS: readonly EnvelopePreset[] = [
  { name: '長形3号', note: 'A4三つ折り', length: 23.5, width: 12 },
  { name: '長形4号', note: 'B5四つ折り', length: 20.5, width: 9 },
  { name: '長形40号', note: 'A4四つ折り', length: 22.5, width: 9 },
  { name: '洋形2号', note: 'カード・招待状', length: 16.2, width: 11.4 },
  { name: '角形3号', note: 'B5', length: 27.7, width: 21.6 },
  { name: '角形2号', note: 'A4', length: 33.2, width: 24 },
];

// ---------------------------------------------------------------- 切手【データ更新箇所】

/**
 * 今売られている普通切手の額面。差額の組み合わせはこの額面だけで組む。
 * 出典: 日本郵便「切手」 https://www.post.japanpost.jp/enjoy/culture/stamp/ の普通切手（2026-11-02 確認。在庫は局による）
 */
export const CURRENT_STAMPS: readonly number[] = [
  1, 2, 5, 10, 16, 20, 22, 26, 30, 40, 50, 85, 100, 110, 120, 140, 180, 270, 300, 350, 500,
];

/** 手持ちの欄に並べる旧料金の切手（2024-09-30 で販売を終えた額面ほか。郵便には今も使える） */
export const OLD_STAMPS: readonly number[] = [84, 63, 94, 82, 62, 52, 41];

/** 手持ちの欄に並べる額面（旧料金の切手を先に、続けて今売られている額面を小さい順） */
export const HOLDING_STAMPS: readonly number[] = [
  ...OLD_STAMPS,
  ...CURRENT_STAMPS.filter((v) => !OLD_STAMPS.includes(v)),
];

/**
 * 金額 amount を、denoms の額面で枚数がいちばん少なく作る組み合わせ（動的計画法）。
 * 返り値は額面の大きい順の [額面, 枚数]。作れなければ null（1 円切手があるので実際には作れる）
 */
export function fewestStamps(amount: number, denoms: readonly number[] = CURRENT_STAMPS): [number, number][] | null {
  if (!Number.isInteger(amount) || amount < 0) return null;
  if (amount === 0) return [];
  const INF = Number.MAX_SAFE_INTEGER;
  const count = new Array<number>(amount + 1).fill(INF);
  const last = new Array<number>(amount + 1).fill(0);
  count[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const d of denoms) {
      if (d <= a && count[a - d] + 1 < count[a]) {
        count[a] = count[a - d] + 1;
        last[a] = d;
      }
    }
  }
  if (count[amount] === INF) return null;
  const used = new Map<number, number>();
  for (let a = amount; a > 0; a -= last[a]) used.set(last[a], (used.get(last[a]) ?? 0) + 1);
  return [...used.entries()].sort((x, y) => y[0] - x[0]);
}

export type StampResult =
  | { kind: 'none' }
  | { kind: 'short'; held: number; shortBy: number; combo: [number, number][] }
  | { kind: 'exact'; held: number }
  | { kind: 'over'; held: number; overBy: number };

/** 手持ちの切手（額面 → 枚数）と料金を比べる */
export function compareStamps(holdings: Record<number, number>, fee: number): StampResult {
  const held = Object.entries(holdings).reduce((s, [v, n]) => s + Number(v) * Math.max(0, Math.floor(n)), 0);
  if (held === 0) return { kind: 'none' };
  if (held < fee) return { kind: 'short', held, shortBy: fee - held, combo: fewestStamps(fee - held) ?? [] };
  if (held === fee) return { kind: 'exact', held };
  return { kind: 'over', held, overBy: held - fee };
}

/** [[20,1],[5,1]] → '20円1枚＋5円1枚' */
export function formatCombo(combo: [number, number][]): string {
  return combo.map(([v, n]) => `${v}円${n}枚`).join('＋');
}

/** 手持ちの切手の書き出し（'84円切手1枚' / '84円切手1枚と10円切手2枚'） */
export function formatHoldings(holdings: Record<number, number>): string {
  const items = Object.entries(holdings)
    .filter(([, n]) => n > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([v, n]) => `${v}円切手${n}枚`);
  return items.join('と');
}

// ---------------------------------------------------------------- 区分の判定

export type Category = 'teikei' | 'kikakunai' | 'kikakugai';

export const CATEGORY_LABELS: Record<Category, string> = {
  teikei: '定形',
  kikakunai: '定形外（規格内）',
  kikakugai: '定形外（規格外）',
};

export interface Size {
  /** cm。長さと幅は入れる順を問わない（大きいほうを長辺にする） */
  length: number;
  width: number;
  thickness: number;
  /** g */
  weight: number;
}

type Dim = 'length' | 'width' | 'thickness' | 'weight';

export type Classification =
  | { kind: Category }
  /** 最小（14×9cm）に足りない。missing は足りない辺 */
  | { kind: 'too-small'; missing: ('length' | 'width')[] }
  /** 規格外の上限を超える。over は超えた条件 */
  | { kind: 'too-large'; over: ('long' | 'sum' | 'weight')[] };

const L = (cm: number) => Math.round(cm * 100); // 0.1mm
const W = (g: number) => Math.round(g * 10); // 0.1g

function normalize(size: Size) {
  const long = Math.max(size.length, size.width);
  const short = Math.min(size.length, size.width);
  return { long, short, thickness: size.thickness, weight: size.weight };
}

/** 定形を外れている条件（長さ・幅・厚さ・重さの順） */
function teikeiFailures(size: Size): Dim[] {
  const s = normalize(size);
  const t = LIMITS.teikei;
  const out: Dim[] = [];
  if (L(s.long) > L(t.longMax)) out.push('length');
  if (L(s.short) > L(t.shortMax)) out.push('width');
  if (L(s.thickness) > L(t.thickMax)) out.push('thickness');
  if (W(s.weight) > W(t.weightMax)) out.push('weight');
  return out;
}

/** 規格内を外れている条件（長さ・幅・厚さ・重さの順） */
function kikakunaiFailures(size: Size): Dim[] {
  const s = normalize(size);
  const k = LIMITS.kikakunai;
  const out: Dim[] = [];
  if (L(s.long) > L(k.longMax)) out.push('length');
  if (L(s.short) > L(k.shortMax)) out.push('width');
  if (L(s.thickness) > L(k.thickMax)) out.push('thickness');
  if (W(s.weight) > W(k.weightMax)) out.push('weight');
  return out;
}

/** 大きさと重さから区分を判定する。最小に足りないかを先に見る */
export function classify(size: Size): Classification {
  const s = normalize(size);
  const missing: ('length' | 'width')[] = [];
  if (L(s.long) < L(LIMITS.min.long)) missing.push('length');
  if (L(s.short) < L(LIMITS.min.short)) missing.push('width');
  if (missing.length > 0) return { kind: 'too-small', missing };

  if (teikeiFailures(size).length === 0) return { kind: 'teikei' };
  if (kikakunaiFailures(size).length === 0) return { kind: 'kikakunai' };

  const g = LIMITS.kikakugai;
  const over: ('long' | 'sum' | 'weight')[] = [];
  if (L(s.long) > L(g.longMax)) over.push('long');
  if (L(s.long) + L(s.short) + L(s.thickness) > L(g.sumMax)) over.push('sum');
  if (W(s.weight) > W(g.weightMax)) over.push('weight');
  if (over.length > 0) return { kind: 'too-large', over };
  return { kind: 'kikakugai' };
}

/** 重さの段を引く（境目ちょうどは下の段）。段の外なら null */
export function stepFor(steps: readonly WeightStep[], weight: number): WeightStep | null {
  return steps.find((s) => W(weight) <= W(s.upTo)) ?? null;
}

/** 区分と重さの基本料金。段の外なら null */
export function baseFee(category: Category, weight: number, table: RateTable): { fee: number; upTo: number } | null {
  if (category === 'teikei') return W(weight) <= W(LIMITS.teikei.weightMax) ? { fee: table.teikei, upTo: 50 } : null;
  const step = stepFor(category === 'kikakunai' ? table.kikakunai : table.kikakugai, weight);
  return step ? { fee: step.fee, upTo: step.upTo } : null;
}

/** '100g' / '1kg' */
export function formatWeight(g: number): string {
  return g >= 1000 && g % 1000 === 0 ? `${g / 1000}kg` : `${g.toLocaleString('ja-JP')}g`;
}

function fmtCm(cm: number): string {
  return `${Math.round(cm * 100) / 100}cm`;
}

function fmtG(g: number): string {
  return `${(Math.round(g * 10) / 10).toLocaleString('ja-JP')}g`;
}

/** 0.1 単位で丸めた数の表記（小数点以下が 0 なら整数） */
function fmtTenth(n: number): string {
  return String(Math.round(n * 10) / 10);
}

const DIM_LABELS: Record<Dim, string> = { length: '長さ', width: '幅', thickness: '厚さ', weight: '重さ' };
const DIM_LESS: Record<Dim, string> = { length: '短ければ', width: '狭ければ', thickness: '薄ければ', weight: '軽ければ' };

/** 「A・BとC」の形でつなぐ */
function joinJa(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('・')}と${items[items.length - 1]}`;
}

/**
 * 区分の理由：1 段安い区分に入るには何が足りないか（1 行）。定形なら null。
 * - 外れている条件が 1 つ → 「あと◯mm 薄ければ◯円」つき
 * - 2 つ以上 → 条件を「長さ・幅・厚さ・重さ」の順に並べた 1 行で、「あと◯」は出さない
 */
export function categoryReason(size: Size, category: Category, table: RateTable): string | null {
  if (category === 'teikei') return null;
  const s = normalize(size);
  const value: Record<Dim, number> = { length: s.long, width: s.short, thickness: s.thickness, weight: s.weight };
  const target: Category = category === 'kikakunai' ? 'teikei' : 'kikakunai';
  const lim =
    target === 'teikei'
      ? { length: LIMITS.teikei.longMax, width: LIMITS.teikei.shortMax, thickness: LIMITS.teikei.thickMax, weight: LIMITS.teikei.weightMax }
      : { length: LIMITS.kikakunai.longMax, width: LIMITS.kikakunai.shortMax, thickness: LIMITS.kikakunai.thickMax, weight: LIMITS.kikakunai.weightMax };
  const failures = target === 'teikei' ? teikeiFailures(size) : kikakunaiFailures(size);
  const targetLabel = target === 'teikei' ? '定形' : '規格内';
  const show = (d: Dim, n: number) => (d === 'weight' ? fmtG(n) : fmtCm(n));

  if (failures.length === 1) {
    const d = failures[0];
    const head = `${DIM_LABELS[d]}が${show(d, lim[d])}を超えるので${targetLabel}ではありません`;
    const diff = value[d] - lim[d];
    const amount = d === 'weight' ? `${fmtTenth(diff)}g` : `${fmtTenth(diff * 10)}mm`;
    // 1 つ直したときの料金：定形なら定形の額、規格内なら同じ重さの段（重さを直すなら 1kg の段）
    const fixedWeight = d === 'weight' ? lim.weight : s.weight;
    const fee = baseFee(target, fixedWeight, table)?.fee;
    return fee === undefined ? head : `${head}（あと${amount}${DIM_LESS[d]}${fee.toLocaleString('ja-JP')}円）`;
  }
  const items = failures.map((d) => `${DIM_LABELS[d]}（${show(d, value[d])}）`);
  const limits = failures.map((d) => show(d, lim[d]));
  return `${joinJa(items)}が${targetLabel}の上限（${limits.join('・')}）を超えているので${targetLabel}ではありません`;
}

// ---------------------------------------------------------------- オプション

export type Record_ = 'none' | 'tokutei' | 'kani' | 'ippan';

export interface Options {
  sokutatsu: boolean;
  /** 特定記録・簡易書留・一般書留はどれか 1 つ */
  record: Record_;
  /** 損害要償額（円）。簡易書留・一般書留のとき。未入力は null（簡易書留は 5 万円まで、一般書留は 10 万円までとして扱う） */
  songai: number | null;
  /** 配達証明。一般書留のときだけ足す */
  haitatsuShomei: boolean;
}

export const NO_OPTIONS: Options = { sokutatsu: false, record: 'none', songai: null, haitatsuShomei: false };

export interface FeeLine {
  label: string;
  amount: number;
}

export type OptionResult =
  | { ok: true; lines: FeeLine[] }
  | { ok: false; reason: 'kani-over'; message: string }
  | { ok: false; reason: 'ippan-over'; message: string }
  | { ok: false; reason: 'sokutatsu-over'; message: string };

/** 一般書留の加算額（損害要償額に応じて）。上限超えは null */
export function ippanKakitomeFee(songai: number | null, table: RateTable): number | null {
  const r = table.ippanKakitome;
  const v = songai ?? r.baseCovers;
  if (v > r.max) return null;
  if (v <= r.baseCovers) return r.base;
  return r.base + Math.ceil((v - r.baseCovers) / r.stepYen) * r.stepFee;
}

/** オプションの加算額。重さは速達の段に使う */
export function optionLines(options: Options, weight: number, table: RateTable): OptionResult {
  const lines: FeeLine[] = [];
  if (options.sokutatsu) {
    const step = stepFor(table.sokutatsu, weight);
    if (!step) return { ok: false, reason: 'sokutatsu-over', message: '速達は4kgまでです。' };
    lines.push({ label: '速達', amount: step.fee });
  }
  if (options.record === 'tokutei') lines.push({ label: '特定記録', amount: table.tokuteiKiroku });
  if (options.record === 'kani') {
    if (options.songai !== null && options.songai > table.kaniMaxSongai) {
      return {
        ok: false,
        reason: 'kani-over',
        message: `簡易書留は${(table.kaniMaxSongai / 10_000).toLocaleString('ja-JP')}万円まで。${(table.kaniMaxSongai / 10_000).toLocaleString('ja-JP')}万円を超えるなら一般書留にしてください。`,
      };
    }
    lines.push({ label: '簡易書留', amount: table.kaniKakitome });
  }
  if (options.record === 'ippan') {
    const fee = ippanKakitomeFee(options.songai, table);
    if (fee === null) {
      return {
        ok: false,
        reason: 'ippan-over',
        message: `一般書留の損害要償額は${(table.ippanKakitome.max / 10_000).toLocaleString('ja-JP')}万円までです。それを超える額では送れません。`,
      };
    }
    lines.push({ label: '一般書留', amount: fee });
    if (options.haitatsuShomei) lines.push({ label: '配達証明', amount: table.haitatsuShomei });
  }
  return { ok: true, lines };
}

// ---------------------------------------------------------------- 料金（まとめ）

export type Kind = 'envelope' | 'hagaki' | 'ofuku';

export interface Input {
  kind: Kind;
  size: Size;
  options: Options;
}

export type FeeResult =
  | {
      ok: true;
      /** はがきの規格を外れて封書として判定したとき true */
      hagakiOutOfSpec: boolean;
      category: Category | 'hagaki' | 'ofuku';
      /** 見出しの区分（「定形外（規格内）・100gまで」） */
      label: string;
      base: number;
      options: FeeLine[];
      total: number;
      /** 区分の理由（1 段安い区分に何が足りないか） */
      reason: string | null;
    }
  | { ok: false; reason: 'too-small'; hagakiOutOfSpec: boolean; message: string; notes: string[] }
  | { ok: false; reason: 'too-large'; hagakiOutOfSpec: boolean; message: string }
  | { ok: false; reason: 'option'; hagakiOutOfSpec: boolean; option: OptionResult & { ok: false } };

/** 通常はがきの規格に入るか（厚さは見ない） */
export function isHagakiSize(size: Size): boolean {
  const s = normalize(size);
  const h = HAGAKI_SPEC;
  return (
    L(s.long) >= L(h.longMin) &&
    L(s.long) <= L(h.longMax) &&
    L(s.short) >= L(h.shortMin) &&
    L(s.short) <= L(h.shortMax) &&
    W(s.weight) >= W(h.weightMin) &&
    W(s.weight) <= W(h.weightMax)
  );
}

const MISSING_LABEL: Record<'length' | 'width', string> = { length: '長さが14cm', width: '幅が9cm' };

/** 料金を出す。`asOf` 以前で最新の表を使う */
export function computeFee(input: Input, asOf: Ymd, tables: readonly RateTable[] = RATE_TABLES): FeeResult {
  const table = rateTableAt(asOf, tables);
  const { size, options } = input;

  if (input.kind === 'ofuku' || (input.kind === 'hagaki' && isHagakiSize(size))) {
    const base = input.kind === 'ofuku' ? table.ofukuHagaki : table.hagaki;
    const opt = optionLines(options, size.weight, table);
    if (!opt.ok) return { ok: false, reason: 'option', hagakiOutOfSpec: false, option: opt };
    const extra = opt.lines.reduce((s, l) => s + l.amount, 0);
    return {
      ok: true,
      hagakiOutOfSpec: false,
      category: input.kind,
      label: input.kind === 'ofuku' ? '往復はがき' : '通常はがき',
      base,
      options: opt.lines,
      total: base + extra,
      reason: null,
    };
  }

  const hagakiOutOfSpec = input.kind === 'hagaki';
  const c = classify(size);
  if (c.kind === 'too-small') {
    const what = c.missing.length === 2 ? '長さ（14cm）と幅（9cm）が' : `${MISSING_LABEL[c.missing[0]]}に`;
    return {
      ok: false,
      reason: 'too-small',
      hagakiOutOfSpec,
      message: `${what}足りないので、郵便では送れません（最小は14×9cm）`,
      notes: [
        `特例：${LIMITS.tagSpecial.short}cm×${LIMITS.tagSpecial.long}cm以上の厚紙か布のあて名札を付ければ出せます（このツールでは料金を計算しません）。`,
        `筒形のものは直径${LIMITS.tube.diameter}cm・長さ${LIMITS.tube.length}cm以上なら送れます。`,
      ],
    };
  }
  if (c.kind === 'too-large') {
    const labels = { long: '長辺が60cm', sum: '3辺の合計が90cm', weight: '重さが4kg' };
    return {
      ok: false,
      reason: 'too-large',
      hagakiOutOfSpec,
      message: `${joinJa(c.over.map((o) => labels[o]))}を超えるので、郵便（定形外）では送れません。ゆうパックで送れます。`,
    };
  }
  const fee = baseFee(c.kind, size.weight, table)!;
  const opt = optionLines(options, size.weight, table);
  if (!opt.ok) return { ok: false, reason: 'option', hagakiOutOfSpec, option: opt };
  const extra = opt.lines.reduce((s, l) => s + l.amount, 0);
  return {
    ok: true,
    hagakiOutOfSpec,
    category: c.kind,
    label: `${CATEGORY_LABELS[c.kind]}・${formatWeight(fee.upTo)}まで`,
    base: fee.fee,
    options: opt.lines,
    total: fee.fee + extra,
    reason: categoryReason(size, c.kind, table),
  };
}

/**
 * 未来の表が入っていれば「◯年◯月◯日から◯円になります」の 1 行。無ければ null。
 * 文言は表から組み立てる（手で書かない）
 */
export function upcomingNotice(input: Input, asOf: Ymd, tables: readonly RateTable[] = RATE_TABLES): string | null {
  const next = nextRateTable(asOf, tables);
  if (!next) return null;
  const r = computeFee(input, next.effectiveFrom, tables);
  if (!r.ok) return null;
  return `${formatFullDate(next.effectiveFrom)}から${r.total.toLocaleString('ja-JP')}円になります`;
}

// ---------------------------------------------------------------- ほかの送り方（レターパック）

export interface Alternative {
  name: string;
  price: number;
  delivery: string;
  cheaperBy: number;
}

/**
 * 大きさ・重さがレターパックに入り、基本料金がその額を超えるなら、安くなる送り方を返す。
 * **比べるのは日本郵便の商品だけ**（他社の宅配便の名前は出さない）
 */
export function cheaperAlternatives(size: Size, base: number, table: RateTable): Alternative[] {
  const s = normalize(size);
  const fits = L(s.long) <= L(LETTER_PACK.long) && L(s.short) <= L(LETTER_PACK.short) && W(s.weight) <= W(LETTER_PACK.weightMax);
  if (!fits) return [];
  const out: Alternative[] = [];
  if (L(s.thickness) <= L(LETTER_PACK.lightThickMax) && base > table.letterPackLight) {
    out.push({ name: 'レターパックライト', price: table.letterPackLight, delivery: '郵便受けに配達', cheaperBy: base - table.letterPackLight });
  }
  if (base > table.letterPackPlus) {
    out.push({ name: 'レターパックプラス', price: table.letterPackPlus, delivery: '対面で配達', cheaperBy: base - table.letterPackPlus });
  }
  return out;
}

// ---------------------------------------------------------------- 年賀状の帯【データ更新箇所】

export interface NengaSchedule {
  /** 何年用か（2027 年用なら 2027） */
  year: number;
  /** 年賀はがきの販売開始 */
  saleFrom: Ymd;
  /** 年賀状の引受開始 */
  acceptFrom: Ymd;
  /** 元日に届けるための差出日の目安 */
  newYearBy: Ymd;
  /** 年賀はがきの販売終了 */
  saleTo: Ymd;
}

/**
 * 2027（令和9）年用。出典: 日本郵便 報道発表（2026-08-31）「2027（令和9）年用年賀はがきの発行・販売等」
 * https://files.japanpost.jp/assets/34d9d11432734cfaa759e78fe395b688/159168aef19d465baf3350d358e46fa9/20260831_02_06.pdf
 * （引受開始は従前の 12-15 から 12-20 に、元日に届ける目安は 12-25 から 12-27 に繰り下げ）
 */
export const NENGA_2027: NengaSchedule = {
  year: 2027,
  saleFrom: '2026-11-02',
  acceptFrom: '2026-12-20',
  newYearBy: '2026-12-27',
  saleTo: '2027-01-15',
};

/**
 * 【データ更新箇所】毎年 8 月末の日本郵便の発表を見て、翌年用（`NENGA_{YYYY}`）を足し、ここに並べる。
 * 足し忘れたまま 11-01 を迎えると `tests/yubin-ryokin.test.ts` が落ちる
 */
export const NENGA_SCHEDULES: readonly NengaSchedule[] = [NENGA_2027];

/** 帯を出し始める日（年賀状の前年の 11-01） */
export function nengaShowFrom(s: NengaSchedule): Ymd {
  return `${s.year - 1}-11-01`;
}

/** today に帯を出す年の定数。表示期間（11-01〜saleTo）の外、または定数が無ければ null */
export function nengaScheduleFor(today: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): NengaSchedule | null {
  return schedules.find((s) => nengaShowFrom(s) <= today && today <= s.saleTo) ?? null;
}

export type NengaStage = 'before-accept' | 'accepting' | 'after-new-year-by' | 'new-year';

export interface NengaBanner {
  stage: NengaStage;
  year: number;
  /** 本文。strong は太字にする部分 */
  parts: { text: string; strong?: boolean }[];
  /** 残り日数の 1 行（出さない段階は null） */
  countdown: string | null;
}

function remain(today: Ymd, target: Ymd, what: string): string {
  const n = daysBetween(today, target);
  return n === 0 ? `${what}は今日まで` : `${what}まであと${n}日`;
}

/**
 * 年賀状の帯。報道発表に書いてあることだけを書く（「◯日に届きます」「まだ間に合います」は書かない）。
 * 「残り」は今日を含めず、当日は「今日まで」
 */
export function nengaBanner(today: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): NengaBanner | null {
  const s = nengaScheduleFor(today, schedules);
  if (!s) return null;
  const accept = formatMonthDay(s.acceptFrom);
  const by = formatMonthDay(s.newYearBy);
  const dayBefore = formatMonthDay(addDays(s.acceptFrom, -1));
  const jan3 = formatMonthDay(`${s.year}-01-03`);
  const sanganichi = `三が日の年賀状の配達は元日と${jan3}です。`;

  if (today < s.acceptFrom) {
    const parts: NengaBanner['parts'] = [];
    if (today < s.saleFrom) parts.push({ text: `年賀はがきの販売は${formatMonthDay(s.saleFrom)}から。` });
    parts.push(
      { text: `年賀状の受付は${accept}から。` },
      { text: `元日に届けるには${by}まで`, strong: true },
      { text: `に出してください。${dayBefore}以前に出した年賀状は、ふつうの郵便として年内に届きます。` },
    );
    return { stage: 'before-accept', year: s.year, parts, countdown: remain(today, s.acceptFrom, '受付開始') };
  }
  if (today <= s.newYearBy) {
    return {
      stage: 'accepting',
      year: s.year,
      parts: [
        { text: '年賀状の受付が始まっています。' },
        { text: `元日に届けるには${by}まで`, strong: true },
        { text: 'に出してください。' },
      ],
      countdown: remain(today, s.newYearBy, '元日に届ける目安'),
    };
  }
  if (today < `${s.year}-01-01`) {
    return {
      stage: 'after-new-year-by',
      year: s.year,
      parts: [{ text: `元日に届けるための差出の目安（${by.replace(/（.）$/, '')}）は過ぎました。${sanganichi}` }],
      countdown: null,
    };
  }
  const parts: NengaBanner['parts'] = [{ text: `年賀はがきの販売は${formatMonthDay(s.saleTo)}まで。` }];
  if (today <= `${s.year}-01-03`) parts.push({ text: sanganichi });
  return { stage: 'new-year', year: s.year, parts, countdown: remain(today, s.saleTo, '販売終了') };
}

/** 帯の本文をつないだ文字列（テスト・JSON-LD 用） */
export function bannerText(b: NengaBanner): string {
  return b.parts.map((p) => p.text).join('');
}

/**
 * 翌年用の定数の足し忘れ。today が YYYY-11-01 以降で `NENGA_{YYYY+1}` が無ければ、
 * 何をすればよいかの文面を返す（無ければ null）。落ち始める日は帯を出し始める日（11-01）と同じ
 */
export function missingNengaSchedule(today: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string | null {
  const y = Number(today.slice(0, 4));
  if (today < `${y}-11-01`) return null;
  const want = y + 1;
  if (schedules.some((s) => s.year === want)) return null;
  return (
    `\`NENGA_${want}\` がありません。8 月末の日本郵便の発表（${want} 年用年賀はがきの発行・販売等）を見て ` +
    `\`NENGA_${want}\` を \`tools/lib/yubin-ryokin.ts\` に足す。仕様：docs/features/yubin-ryokin-keisan.md#年賀状の帯季節の表示`
  );
}

// ---------------------------------------------------------------- ビルド時に焼き込む文面

/** title。額は asOf の表から入れる（手で書かない） */
export function pageTitle(asOf: Ymd, tables: readonly RateTable[] = RATE_TABLES): string {
  const t = rateTableAt(asOf, tables);
  return `郵便料金 計算｜はがき${t.hagaki}円・定形${t.teikei}円・定形外・速達・書留、古い切手の差額も`;
}

/** description の年賀の部分。ビルド日が表示期間（11-01〜saleTo）の外なら空 */
export function nengaDescriptionPart(asOf: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string {
  const s = nengaScheduleFor(asOf, schedules);
  if (!s) return '';
  const md = (ymd: Ymd) => formatMonthDay(ymd).replace(/（.）$/, '');
  return `${s.year}年用年賀状の受付開始（${md(s.acceptFrom)}）と元日配達の期限（${md(s.newYearBy)}）つき。`;
}

/** description。年賀の部分は期間内だけ入れる */
export function pageDescription(asOf: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string {
  return (
    '封筒の大きさと重さから定形・定形外（規格内・規格外）を判定し、郵便料金を計算。' +
    '速達・書留・特定記録の加算、手持ちの84円・63円切手にあと何円足すか、レターパックのほうが安いかも表示。' +
    nengaDescriptionPart(asOf, schedules) +
    '登録不要・無料。'
  );
}

/** FAQ「年賀状はいつから受け付け？元日に届く期限は？」の答え。期間外は日付を書かない */
export function nengaFaqAnswer(asOf: Ymd, schedules: readonly NengaSchedule[] = NENGA_SCHEDULES): string {
  const s = nengaScheduleFor(asOf, schedules);
  if (!s) return '毎年8月末に日本郵便が発表します。発表が出たらこのページに載せます。';
  return (
    `${s.year}年用の年賀状の受付は${formatFullDate(s.acceptFrom)}（${formatMonthDay(s.acceptFrom).slice(-2, -1)}）からです。` +
    `元日に届けるには${formatMonthDay(s.newYearBy)}までに出してください。` +
    `${formatMonthDay(addDays(s.acceptFrom, -1))}以前に出した年賀状は、ふつうの郵便として年内に届きます。` +
    `どちらも前の年より遅くなりました（従前は受付が12月15日から、元日に届ける目安が12月25日まで）。` +
    `年賀はがきの販売は${formatMonthDay(s.saleFrom)}から${formatFullDate(s.saleTo)}までです。`
  );
}

/**
 * 定形外の各区分で、レターパックのほうが安くなり始める重さ（直前の段の上限 g）。
 * 本文・FAQ の「◯g を超えるならレターパックのほうが安い」を表から組み立てる
 */
export function letterPackThreshold(steps: readonly WeightStep[], price: number): { overWeight: number; fee: number } | null {
  const i = steps.findIndex((s) => s.fee > price);
  if (i <= 0) return null;
  return { overWeight: steps[i - 1].upTo, fee: steps[i].fee };
}
