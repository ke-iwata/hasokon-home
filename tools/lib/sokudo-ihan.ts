/**
 * 速度違反の反則金・点数 早見表（生活道路30km/h対応）
 *
 * 仕様: docs/features/sokudo-ihan-hansokukin.md
 *
 * 道路の種類・出した速度・車の種類から、その道の制限速度・超過速度・反則金（または赤切符）・
 * 違反点数を出す。純関数のみ（DOM/React に依存しない）。
 *
 * 出典（すべて 2026-10-17 確認）:
 * - 道路交通法施行令 11 条（一般道路の法定速度。2026-09-01 から中央線等の無い一般道路は 30km/h）
 * - 道路交通法施行令 27 条（高速自動車国道の本線車道の法定速度。100／90／80km/h）
 * - 道路交通法施行令 別表第二（違反点数）・別表第六（反則金の額と車両の区分）
 * - 道路標識、区画線及び道路標示に関する命令 別表第一「最高速度」（標識の速度は原付には
 *   施行令の 30km/h を超えて及ばない）
 * - 警察庁「生活道路における自動車の法定速度の引下げ」・警視庁「反則行為の種別及び反則金一覧表」
 *   「交通違反の点数一覧表」（別表の写し。値が別表と一致することを確かめた）
 */

/** 確認日。出典の表示に使う */
export const DATA_CHECKED_AT = '2026-10-17';

/** 中央線等の無い一般道路の法定速度が 60→30km/h になった日（施行令 11 条の改正） */
export const SEIKATSU_SWITCH_DATE = '2026-09-01';

/** 大型貨物・特定中型貨物の高速道路の法定速度が 80→90km/h になった日（施行令 27 条の改正） */
export const HEAVY_CARGO_SWITCH_DATE = '2024-04-01';

/** 前歴が無い人が免許停止（30日）の対象になる累積点数 */
export const SUSPENSION_POINTS = 6;

/** 道路の種類（仕様書の ①〜⑥） */
export type RoadId =
  /** ① 標識で最高速度の指定がある */
  | 'sign'
  /** ② 中央線・車線区分の白線がある一般道路 */
  | 'center-line'
  /** ③ 中央分離帯等で上下が分かれた一般道路 */
  | 'divided'
  /** ④ 中央線の無い一般道路（生活道路） */
  | 'seikatsu'
  /** ⑤ 高速自動車国道（本線・標識なし） */
  | 'expressway'
  /** ⑥ 自動車専用道路（首都高など・標識なし） */
  | 'motorway';

/** 車の種類（施行令 別表第六 備考三の区分。反則金の列を決める） */
export type VehicleId = 'large' | 'ordinary' | 'motorcycle' | 'moped';

/** 高速自動車国道での区分（施行令 27 条） */
export type ExpresswayClass =
  /** 乗用・下記以外（100km/h） */
  | 'standard'
  /** 大型貨物・特定中型貨物（90km/h。2024-03-31 までは 80km/h） */
  | 'heavy-cargo'
  /** 三輪・大型特殊・けん引している（80km/h。施行令 27 条 1 項 3 号「前二号に掲げる自動車以外」） */
  | 'tow';

/** 反則区分。30〜39km/h 超過で一般道路と高速道路（高速自動車国道等）の扱いが分かれる */
export type Area = 'general' | 'expressway';

export interface RoadDef {
  id: RoadId;
  label: string;
  /** 選んだときに下に出す 1 行の説明 */
  hint: string;
}

/** 【データ更新箇所】道路の種類 */
export const ROADS: RoadDef[] = [
  {
    id: 'seikatsu',
    label: '中央線の無い一般道路（生活道路）',
    hint: '中央線も車線の白線も無く、速度の標識も無い一般道路。2026年9月1日から30km/h（それまでは60km/h）。',
  },
  {
    id: 'center-line',
    label: '中央線・車線区分の白線がある一般道路',
    hint: '中央線や車線の境の白線があり、速度の標識が無い一般道路。60km/hのまま。',
  },
  {
    id: 'divided',
    label: '中央分離帯などで上下が分かれた一般道路',
    hint: '中央分離帯や柵で上り・下りが分かれていて、速度の標識が無い一般道路。60km/hのまま。',
  },
  {
    id: 'sign',
    label: '標識で最高速度の指定がある道路',
    hint: '速度の標識・路面の数字がある道路は、その速度です（2026年9月の引下げの前後で変わりません）。',
  },
  {
    id: 'expressway',
    label: '高速自動車国道（東名・名神など。標識なし）',
    hint: '高速自動車国道の本線で、速度の標識が無いとき。車の区分で100・90・80km/h。標識があれば「標識で最高速度の指定がある道路」へ。',
  },
  {
    id: 'motorway',
    label: '自動車専用道路（首都高・都市高速など。標識なし）',
    hint: '首都高・都市高速など。標識が無ければ60km/h。標識があれば「標識で最高速度の指定がある道路」へ。',
  },
];

export interface VehicleDef {
  id: VehicleId;
  label: string;
  /** 別表第六 備考三 の中身 */
  includes: string;
}

/** 【データ更新箇所】車の種類（施行令 別表第六 備考三） */
export const VEHICLES: VehicleDef[] = [
  { id: 'ordinary', label: '普通車', includes: '普通自動車（軽自動車を含む）' },
  { id: 'large', label: '大型車', includes: '大型・中型・準中型自動車、大型特殊自動車' },
  { id: 'motorcycle', label: '二輪車', includes: '大型自動二輪車・普通自動二輪車' },
  { id: 'moped', label: '原付車・小型特殊車', includes: '原動機付自転車・小型特殊自動車' },
];

export interface ExpresswayClassDef {
  id: ExpresswayClass;
  label: string;
  /** 大型車のときだけ選べる区分か */
  largeOnly: boolean;
}

export const EXPRESSWAY_CLASSES: ExpresswayClassDef[] = [
  { id: 'standard', label: '乗用車・下記以外（100km/h）', largeOnly: false },
  {
    id: 'heavy-cargo',
    label: '大型貨物・特定中型貨物（90km/h）',
    largeOnly: true,
  },
  { id: 'tow', label: '三輪・大型特殊・ほかの車をけん引している（80km/h）', largeOnly: false },
];

export function roadById(id: RoadId): RoadDef {
  return ROADS.find((r) => r.id === id)!;
}

export function vehicleById(id: VehicleId): VehicleDef {
  return VEHICLES.find((v) => v.id === id)!;
}

/** 'YYYY-MM-DD' として読めるか */
function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * 高速道路（高速自動車国道・自動車専用道路）を通るか。
 * ① 標識ありのときは「標識のある道路の区分」の入力で決まる。
 */
function onExpressway(road: RoadId, signArea: Area): boolean {
  return road === 'expressway' || road === 'motorway' || (road === 'sign' && signArea === 'expressway');
}

/**
 * 通れない組み合わせか。原付・小型特殊自動車は高速自動車国道・自動車専用道路を通行できない。
 * `speedLimit` より先に判定する（判定しないと 30km/h で計算されてしまうため）。
 */
export function isNotAllowed(road: RoadId, vehicle: VehicleId, signArea: Area): boolean {
  return vehicle === 'moped' && onExpressway(road, signArea);
}

/**
 * 反則区分。制限速度とは別に決める。
 * ⑥ 自動車専用道路は標識なしで 60km/h だが、反則区分は高速道路（道路交通法の「高速自動車国道等」）。
 */
export function violationArea(road: RoadId, signArea: Area): Area {
  return onExpressway(road, signArea) ? 'expressway' : 'general';
}

/**
 * その道の制限速度（km/h）。決まらないとき（原付の高速道路・大型車で高速道路での区分が未選択・
 * 標識の速度が未入力）は null。
 *
 * 1. ① 標識あり → 標識の速度（原付は施行令の 30km/h を超えない。標識令 別表第一）
 * 2. 原付車 → 30km/h（施行令 11 条。もとから 30）
 * 3. ⑤ 高速自動車国道 → 高速道路での区分（施行令 27 条）
 * 4. ⑥ 自動車専用道路 → 60km/h（施行令 11 条 1 号ロ）
 * 5. ② ③ → 60km/h
 * 6. ④ → 2026-09-01 以後は 30km/h、それより前は 60km/h
 */
export function speedLimit(
  road: RoadId,
  vehicle: VehicleId,
  expresswayClass: ExpresswayClass | null,
  date: string,
  signKmh?: number
): number | null {
  if (road === 'sign') {
    if (signKmh === undefined || !Number.isInteger(signKmh) || signKmh <= 0) return null;
    return vehicle === 'moped' ? Math.min(signKmh, 30) : signKmh;
  }
  if (vehicle === 'moped') return road === 'expressway' || road === 'motorway' ? null : 30;
  if (road === 'expressway') {
    if (expresswayClass === null) return null;
    if (expresswayClass === 'standard') return 100;
    if (expresswayClass === 'tow') return 80;
    return date < HEAVY_CARGO_SWITCH_DATE ? 80 : 90;
  }
  if (road === 'seikatsu') return date < SEIKATSU_SWITCH_DATE ? 60 : 30;
  return 60;
}

/** 反則金の区分（施行令 別表第六 の速度超過の行） */
export interface FineBand {
  label: string;
  /** 超過速度の下限（以上） */
  from: number;
  /** 超過速度の上限（未満） */
  to: number;
  /** 高速自動車国道等だけの区分か */
  expresswayOnly: boolean;
  yen: Record<VehicleId, number>;
}

/** 【データ更新箇所】反則金（施行令 別表第六。単位：円） */
export const FINE_BANDS: FineBand[] = [
  {
    label: '15km/h未満',
    from: 0,
    to: 15,
    expresswayOnly: false,
    yen: { large: 12_000, ordinary: 9_000, motorcycle: 7_000, moped: 6_000 },
  },
  {
    label: '15以上20未満',
    from: 15,
    to: 20,
    expresswayOnly: false,
    yen: { large: 15_000, ordinary: 12_000, motorcycle: 9_000, moped: 7_000 },
  },
  {
    label: '20以上25未満',
    from: 20,
    to: 25,
    expresswayOnly: false,
    yen: { large: 20_000, ordinary: 15_000, motorcycle: 12_000, moped: 10_000 },
  },
  {
    label: '25以上30未満',
    from: 25,
    to: 30,
    expresswayOnly: false,
    yen: { large: 25_000, ordinary: 18_000, motorcycle: 15_000, moped: 12_000 },
  },
  {
    label: '高速道路 30以上35未満',
    from: 30,
    to: 35,
    expresswayOnly: true,
    yen: { large: 30_000, ordinary: 25_000, motorcycle: 20_000, moped: 15_000 },
  },
  {
    label: '高速道路 35以上40未満',
    from: 35,
    to: 40,
    expresswayOnly: true,
    yen: { large: 40_000, ordinary: 35_000, motorcycle: 30_000, moped: 20_000 },
  },
];

/**
 * 反則金（円）。反則金の対象外（赤切符）なら null。
 * 一般道路で 30km/h 以上・高速道路で 40km/h 以上の超過は反則金の対象外。
 * `excess` は 1 以上（0 以下は速度超過ではないので呼ばない）。
 */
export function fineFor(vehicle: VehicleId, area: Area, excess: number): number | null {
  const band = FINE_BANDS.find(
    (b) => excess >= b.from && excess < b.to && (!b.expresswayOnly || area === 'expressway')
  );
  return band ? band.yen[vehicle] : null;
}

/** 違反点数（基礎点数。施行令 別表第二） */
export function pointsFor(area: Area, excess: number): number {
  if (excess < 20) return 1;
  if (excess < 25) return 2;
  if (excess < 30) return 3;
  if (area === 'expressway' && excess < 40) return 3;
  if (excess < 50) return 6;
  return 12;
}

export interface JudgeInput {
  road: RoadId;
  vehicle: VehicleId;
  /** ⑤ 高速自動車国道のときの区分。大型車は既定が空（null）で、選ぶまで結果を出さない */
  expresswayClass: ExpresswayClass | null;
  /** 走った日 'YYYY-MM-DD' */
  date: string;
  /** 出した速度（km/h・整数） */
  speedKmh: number;
  /** ① のときの標識の速度 */
  signKmh?: number;
  /** ① のときの標識のある道路の区分 */
  signArea: Area;
}

/** 速度超過のときの中身 */
export interface Violation {
  excess: number;
  /** 反則金。赤切符（反則金の対象外）なら null */
  yen: number | null;
  points: number;
}

export interface Outcome {
  limit: number;
  /** 速度超過でなければ null */
  violation: Violation | null;
}

export type JudgeResult =
  | {
      kind: 'ok';
      limit: number;
      area: Area;
      /** なぜその速度か 1 行 */
      reason: string;
      violation: Violation | null;
      /** ④ 生活道路のときだけ。同じ速度で引下げ前（60km/h）だったら */
      compare: Outcome | null;
    }
  /** 原付・小型特殊 × 高速道路 */
  | { kind: 'not-allowed' }
  /** 大型車 × ⑤ で高速道路での区分が未選択 */
  | { kind: 'need-class' }
  | { kind: 'error'; error: 'speed' | 'sign' | 'date' };

export function violationOf(vehicle: VehicleId, area: Area, speedKmh: number, limit: number): Violation | null {
  const excess = speedKmh - limit;
  if (excess <= 0) return null;
  return { excess, yen: fineFor(vehicle, area, excess), points: pointsFor(area, excess) };
}

function reasonFor(input: JudgeInput, limit: number): string {
  const { road, vehicle, date } = input;
  if (road === 'sign') {
    if (vehicle === 'moped' && input.signKmh !== undefined && input.signKmh > 30) {
      return `標識は${input.signKmh}km/hですが、原付の最高速度は30km/hです（標識の速度は原付には30km/hを超えて及びません）。`;
    }
    return `標識・標示で指定された${limit}km/hです。`;
  }
  if (vehicle === 'moped') {
    return '原付（一般原動機付自転車）の法定速度は、道路の種類にかかわらず30km/hです（小型特殊自動車は自動車なので、中央線のある道などでは60km/hです）。';
  }
  switch (road) {
    case 'seikatsu':
      return date < SEIKATSU_SWITCH_DATE
        ? '中央線の無い一般道路は、2026年8月31日までは法定速度60km/hでした（9月1日から30km/h）。'
        : '中央線の無い一般道路は、2026年9月1日から法定速度30km/hです。';
    case 'center-line':
      return '中央線や車線の白線がある一般道路は、法定速度60km/hのままです。';
    case 'divided':
      return '中央分離帯などで上下が分かれた一般道路は、法定速度60km/hのままです。';
    case 'motorway':
      return '標識の無い自動車専用道路は、一般道路の法定速度60km/hです（反則金・点数は高速道路の表で決まります）。';
    case 'expressway':
      if (input.expresswayClass === 'heavy-cargo') {
        return date < HEAVY_CARGO_SWITCH_DATE
          ? '高速自動車国道の大型貨物・特定中型貨物は、2024年3月31日までは80km/hでした（4月1日から90km/h）。'
          : '高速自動車国道の大型貨物・特定中型貨物は、2024年4月1日から90km/hです。';
      }
      return input.expresswayClass === 'tow'
        ? '高速自動車国道で三輪の自動車・大型特殊自動車・ほかの車をけん引している自動車は80km/hです。'
        : '高速自動車国道の本線は、乗用車など（下記以外）100km/hです。';
  }
}

/** 入力から結果を出す。判定の順は「通れない → 区分の未選択 → 制限速度」 */
export function judge(input: JudgeInput): JudgeResult {
  const { road, vehicle, signArea, date, speedKmh } = input;
  if (!isDate(date)) return { kind: 'error', error: 'date' };
  if (isNotAllowed(road, vehicle, signArea)) return { kind: 'not-allowed' };
  if (road === 'expressway' && input.expresswayClass === null) return { kind: 'need-class' };
  if (!Number.isInteger(speedKmh) || speedKmh <= 0 || speedKmh > 400) return { kind: 'error', error: 'speed' };
  const limit = speedLimit(road, vehicle, input.expresswayClass, date, input.signKmh);
  if (limit === null) return { kind: 'error', error: 'sign' };
  const area = violationArea(road, signArea);
  const compare =
    road === 'seikatsu' && vehicle !== 'moped' && limit !== 60
      ? { limit: 60, violation: violationOf(vehicle, area, speedKmh, 60) }
      : null;
  return {
    kind: 'ok',
    limit,
    area,
    reason: reasonFor(input, limit),
    violation: violationOf(vehicle, area, speedKmh, limit),
    compare,
  };
}

export interface HayamiRow {
  /** 出した速度の幅の表示（例：50〜54km/h） */
  label: string;
  /** 幅の下限の速度 */
  from: number;
  /** いま（30km/h） */
  now: Violation;
  /** 引下げ前（60km/h）。違反でなければ null */
  before: Violation | null;
  /** 幅のいちばん速い速度での引下げ前。幅の中で変わらなければ undefined（最後の行も undefined） */
  beforeAtTop?: Violation | null;
}

/**
 * 早見表：生活道路で 31〜80km/h 以上を出したときの普通車の反則金・点数。
 * 反則金・点数が変わる境目で行を切る（ページ本文に出す静的な表）。
 */
export function seikatsuHayami(vehicle: VehicleId = 'ordinary'): HayamiRow[] {
  const LIMIT = 30;
  // 超過速度の境目：1・15・20・25・30・50
  const edges = [1, 15, 20, 25, 30, 50];
  return edges.map((e, i) => {
    const from = LIMIT + e;
    const next = edges[i + 1];
    const label = next === undefined ? `${from}km/h以上` : `${from}〜${LIMIT + next - 1}km/h`;
    const before = violationOf(vehicle, 'general', from, 60);
    const atTop = next === undefined ? undefined : violationOf(vehicle, 'general', LIMIT + next - 1, 60);
    const same = atTop === undefined || (atTop?.yen === before?.yen && atTop?.points === before?.points);
    return {
      label,
      from,
      now: violationOf(vehicle, 'general', from, LIMIT)!,
      before,
      beforeAtTop: same ? undefined : atTop,
    };
  });
}

export const formatYen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

export interface Source {
  label: string;
  url: string;
}

export const SOURCES: Source[] = [
  {
    label: '警察庁「生活道路における自動車の法定速度の引下げ」',
    url: 'https://www.npa.go.jp/bureau/traffic/seikatsudouro/seikatsudoro.html',
  },
  {
    label: '警視庁「反則行為の種別及び反則金一覧表」',
    url: 'https://www.keishicho.metro.tokyo.lg.jp/smph/menkyo/torishimari/tetsuzuki/hansoku.html',
  },
  {
    label: '警視庁「交通違反の点数一覧表」',
    url: 'https://www.keishicho.metro.tokyo.lg.jp/menkyo/torishimari/gyosei/seido/tensu.html',
  },
  {
    label: 'e-Gov 法令検索「道路交通法施行令」（11条・27条・別表第二・別表第六）',
    url: 'https://laws.e-gov.go.jp/law/335CO0000000270',
  },
];
