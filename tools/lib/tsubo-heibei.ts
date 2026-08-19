/**
 * 坪・平米・畳の換算ロジック
 *
 * 仕様: docs/features/tsubo-heibei-jo-henkan.md
 *
 * 1坪 = 400/121 ㎡ は尺貫法の定義（1尺 = 10/33 m、1間 = 6尺、1坪 = 1間四方）から
 * 厳密に導ける。**分数のまま定数に持ち、丸めるのは表示のときだけ**にしてある。
 * 途中で 3.31 や 3.3058 のような丸めた値を使うと、100坪では㎡が数cm〜数十cmずれ、
 * 早見表と計算機の答えが食い違う。
 *
 * 畳は1枚の大きさが地域・規格で違う（京間・中京間・江戸間・団地間）。
 * 不動産広告の「◯畳」は、不動産の表示に関する公正競争規約施行規則で
 * 「畳1枚あたり1.62㎡以上」と定められた換算で書かれているので、既定はこれにしている。
 *
 * すべて純関数で、DOM・React には依存しない。
 * 無効な入力（負の数・非有限数）は null を返す。
 */

/* ===================================================================
   【データ更新箇所】
   ここの定数だけが換算の根拠。畳の規格の寸法を直すときは
   TATAMI_SIZES を直し、出典（page.tsx の ToolMeta）も一緒に見直すこと。
   尺貫法の定義（400/121）は法令が変わらない限り動かない。
   =================================================================== */

/** 1坪の平方メートル数の分子（1間 = 20/11 m の2乗 → 400/121 ㎡） */
export const TSUBO_SQM_NUMERATOR = 400;

/** 1坪の平方メートル数の分母 */
export const TSUBO_SQM_DENOMINATOR = 121;

/**
 * 1坪の面積(㎡)。400/121 ＝ 3.30578512…
 * 表示のために丸めた値をここに書かないこと（丸めは formatArea が行う）
 */
export const SQM_PER_TSUBO = TSUBO_SQM_NUMERATOR / TSUBO_SQM_DENOMINATOR;

/**
 * 1㎡の坪数。121/400 ＝ 0.3025（割り切れる）。
 * 「100㎡ = 30.25坪」がちょうどになるのはこのため。
 */
export const TSUBO_PER_SQM = TSUBO_SQM_DENOMINATOR / TSUBO_SQM_NUMERATOR;

/** 1尺(m)。1坪の導出根拠として持っておく（10/33 m） */
export const METER_PER_SHAKU = 10 / 33;

/** 1間(m)。6尺 ＝ 20/11 m */
export const METER_PER_KEN = METER_PER_SHAKU * 6;

/** 畳の規格 */
export type TatamiStandardId = 'hyoji' | 'kyoma' | 'chukyoma' | 'edoma' | 'danchima';

/**
 * 畳1枚の寸法。**ミリメートルの整数で持つ。**
 * メートルの小数（1.7 × 0.85）で掛けると二進小数の誤差が出て、
 * 団地間の 1.445㎡ が 1.4449999… になり、表示で1.44㎡に落ちる。
 */
export interface TatamiSize {
  /** 長辺(mm) */
  longMm: number;
  /** 短辺(mm)。畳は長辺の半分 */
  shortMm: number;
}

/**
 * 規格ごとの畳1枚の寸法(mm)。
 * 不動産表示（hyoji）は面積の下限が定められているだけで寸法の定めがないため持たない。
 */
export const TATAMI_SIZES: Record<Exclude<TatamiStandardId, 'hyoji'>, TatamiSize> = {
  kyoma: { longMm: 1910, shortMm: 955 },
  chukyoma: { longMm: 1820, shortMm: 910 },
  edoma: { longMm: 1760, shortMm: 880 },
  danchima: { longMm: 1700, shortMm: 850 },
};

/**
 * 不動産広告の「◯畳」に使われる1畳あたりの面積(㎡)。
 * 不動産の表示に関する公正競争規約施行規則が「畳1枚あたりの面積は1.62㎡以上」と
 * 定めており、広告はこの換算で書かれている（下限なので、実際の畳より狭いことはない）。
 */
export const HYOJI_SQM_PER_JO = 1.62;

/** 畳の規格の定義 */
export interface TatamiStandard {
  id: TatamiStandardId;
  /** セレクトや表に出す名前 */
  label: string;
  /** どこで使われる規格か（1行の説明） */
  note: string;
  /** 畳1枚の面積(㎡)。丸めない */
  sqm: number;
  /** 畳1枚の寸法(mm)。不動産表示は寸法の定めがないので持たない */
  size?: TatamiSize;
}

/** 寸法(mm)から1枚の面積(㎡)を出す。整数どうしの掛け算にしてから㎡へ落とす */
export function sqmOfSize(size: TatamiSize): number {
  return (size.longMm * size.shortMm) / 1_000_000;
}

function fromSize(
  id: Exclude<TatamiStandardId, 'hyoji'>,
  label: string,
  note: string,
): TatamiStandard {
  const size = TATAMI_SIZES[id];
  return { id, label, note, sqm: sqmOfSize(size), size };
}

/**
 * 畳の規格の一覧（セレクトの並び順）。
 * 先頭が既定＝不動産広告と同じ換算。実際の畳の規格はそのあとに広い順で並べる。
 */
export const TATAMI_STANDARDS: TatamiStandard[] = [
  {
    id: 'hyoji',
    label: '不動産表示（1.62㎡）',
    note: '不動産広告の「◯畳」。公正競争規約施行規則が定める1畳あたりの下限',
    sqm: HYOJI_SQM_PER_JO,
  },
  fromSize('kyoma', '京間（本間）', '関西・中国・四国・九州に多い、いちばん大きい畳'),
  fromSize('chukyoma', '中京間（三六間）', '愛知・岐阜・三重や東北・北陸の一部'),
  fromSize('edoma', '江戸間（五八間）', '関東・全国の戸建てで広く使われる'),
  fromSize('danchima', '団地間（五六間）', '公団住宅・アパート・マンションに多い、いちばん小さい畳'),
];

/** 既定の畳規格。不動産広告と同じ換算にしておく */
export const DEFAULT_TATAMI_ID: TatamiStandardId = 'hyoji';

/**
 * 規格の定義を引く。未知のIDは投げる（静的書き出しなのでビルドで気づける）。
 * 既定へ黙って落とすと、規格を切り替えたつもりで別の数値が出続けることになる。
 */
export function tatamiStandard(id: TatamiStandardId): TatamiStandard {
  const found = TATAMI_STANDARDS.find((s) => s.id === id);
  if (!found) throw new Error(`畳の規格が見つかりません: ${id}`);
  return found;
}

/** 面積として扱える値か（0以上の有限数） */
export function isValidArea(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** 坪 → ㎡ */
export function tsuboToSqm(tsubo: number): number | null {
  if (!isValidArea(tsubo)) return null;
  return (tsubo * TSUBO_SQM_NUMERATOR) / TSUBO_SQM_DENOMINATOR;
}

/** ㎡ → 坪 */
export function sqmToTsubo(sqm: number): number | null {
  if (!isValidArea(sqm)) return null;
  return (sqm * TSUBO_SQM_DENOMINATOR) / TSUBO_SQM_NUMERATOR;
}

/** 畳 → ㎡（規格を指定しないときは不動産表示の1.62㎡） */
export function joToSqm(jo: number, id: TatamiStandardId = DEFAULT_TATAMI_ID): number | null {
  if (!isValidArea(jo)) return null;
  return jo * tatamiStandard(id).sqm;
}

/** ㎡ → 畳（規格を指定しないときは不動産表示の1.62㎡） */
export function sqmToJo(sqm: number, id: TatamiStandardId = DEFAULT_TATAMI_ID): number | null {
  if (!isValidArea(sqm)) return null;
  return sqm / tatamiStandard(id).sqm;
}

/** 入力・表示に使う単位 */
export type AreaUnit = 'tsubo' | 'sqm' | 'jo';

/** 単位の表示名（見出し・ラベル・表のヘッダで共通に使う） */
export const UNIT_LABEL: Record<AreaUnit, string> = {
  tsubo: '坪',
  sqm: '㎡',
  jo: '畳',
};

/** 3単位に揃えた換算結果 */
export interface AreaConversion {
  tsubo: number;
  sqm: number;
  jo: number;
  /** 畳の換算に使った規格 */
  standard: TatamiStandard;
}

/**
 * どの単位で入れても坪・㎡・畳の3つに揃える。
 *
 * 計算機も早見表もこの1つを通すので、表と計算機の値が食い違うことはない。
 *
 * @returns 無効な入力（負・非有限数）は null
 */
export function convertArea(
  value: number,
  unit: AreaUnit,
  id: TatamiStandardId = DEFAULT_TATAMI_ID,
): AreaConversion | null {
  if (!isValidArea(value)) return null;
  const standard = tatamiStandard(id);
  const sqm =
    unit === 'sqm' ? value : unit === 'tsubo' ? (tsuboToSqm(value) as number) : value * standard.sqm;
  return {
    tsubo: (sqmToTsubo(sqm) as number),
    sqm,
    jo: sqm / standard.sqm,
    standard,
  };
}

/**
 * 桁をずらす。`value * 100` ではなく指数表記の文字列を経由するのは、
 * 二進小数の誤差で 1.445 が 144.49999… になり、四捨五入が下に落ちるため。
 */
function shiftDecimal(value: number, digits: number): number {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  return Number(`${mantissa}e${Number(exponent) + digits}`);
}

/** 表示用に丸める（既定は小数2桁・四捨五入）。計算の途中では使わない */
export function roundArea(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  return shiftDecimal(Math.round(shiftDecimal(value, digits)), -digits);
}

/**
 * 表示用の文字列（小数2桁・3桁区切り）。
 * 丸めをここに集約しているので、画面と早見表で桁の出方が揃う。
 */
export function formatArea(value: number, digits = 2): string {
  return roundArea(value, digits).toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 逆引き早見表の1行（坪・㎡・畳を併記する） */
export interface LookupRow {
  tsubo: number;
  sqm: number;
  jo: number;
}

/** 坪の逆引き早見表で並べる値（住まい探し・土地でよく引かれる坪数） */
export const TSUBO_LOOKUP_VALUES: number[] = [
  1, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100,
];

/** 畳の逆引き早見表で並べる値（間取りに出てくる畳数） */
export const JO_LOOKUP_VALUES: number[] = [4.5, 6, 8, 10, 12, 14, 16, 18, 20];

/**
 * 逆引き早見表を作る。値は `convertArea()` で求めるので、
 * 表の数字と計算機の答えがずれることはない。
 *
 * 静的な表として書き出す用途で、換算率は不変のためビルド時に1度だけ評価される。
 */
export function lookupRows(
  values: number[],
  unit: AreaUnit,
  id: TatamiStandardId = DEFAULT_TATAMI_ID,
): LookupRow[] {
  return values.map((value) => {
    const converted = convertArea(value, unit, id);
    if (converted === null) {
      throw new Error(`早見表に使えない値です: ${value}${UNIT_LABEL[unit]}`);
    }
    return { tsubo: converted.tsubo, sqm: converted.sqm, jo: converted.jo };
  });
}

/** 坪 → ㎡・畳の逆引き早見表（不動産表示の1.62㎡換算） */
export const TSUBO_LOOKUP: LookupRow[] = lookupRows(TSUBO_LOOKUP_VALUES, 'tsubo');

/** 畳 → ㎡・坪の逆引き早見表（不動産表示の1.62㎡換算） */
export const JO_LOOKUP: LookupRow[] = lookupRows(JO_LOOKUP_VALUES, 'jo');

/** 規格の比較表で使う畳数（いちばん引かれる「6畳」を基準にする） */
export const COMPARISON_JO = 6;

/** 規格ごとの比較表の1行 */
export interface StandardRow {
  standard: TatamiStandard;
  /** 1畳あたりの面積(㎡) */
  sqmPerJo: number;
  /** COMPARISON_JO 畳ぶんの面積(㎡) */
  sqm: number;
  /** COMPARISON_JO 畳ぶんの坪数 */
  tsubo: number;
}

/**
 * 「同じ6畳でも規格で広さが違う」を出すための比較表。
 * 規格の一覧をそのまま使うので、規格を足せば表にも自動で載る。
 */
export function standardRows(jo: number = COMPARISON_JO): StandardRow[] {
  return TATAMI_STANDARDS.map((standard) => {
    const converted = convertArea(jo, 'jo', standard.id);
    if (converted === null) throw new Error(`比較表に使えない値です: ${jo}畳`);
    return {
      standard,
      sqmPerJo: standard.sqm,
      sqm: converted.sqm,
      tsubo: converted.tsubo,
    };
  });
}

/** 規格ごとの比較表（6畳ぶん） */
export const STANDARD_ROWS: StandardRow[] = standardRows();
