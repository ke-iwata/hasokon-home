/**
 * 自動車の税金 計算機（令和8年度改正対応）
 *
 * 仕様: docs/features/jidosha-zei-keisan.md
 *
 * 排気量・初度登録（軽は最初の検査）の年月・車両重量から、毎年5月の自動車税／軽自動車税（種別割）・
 * 13年超の重課が始まる年度・車検ごとの自動車重量税・買う／手放すときの月割を出す。
 * 純関数のみ（DOM/React に依存しない）。
 *
 * 一次確認（2026-11-04。e-Gov 法令API で現行条文を引いた）:
 * - 地方税法（325AC0000000226）
 *   - 154条1項1号ロ：自家用乗用の種別割（2019-10-01 以後に初回新規登録）。5項：諸元による区分は道府県が定める
 *     （電気自動車は道府県の条例で「総排気量1リットル以下」の区分。例：京都府の税率表
 *     「総排気量1リットル以下又は電気を動力源とするもの」）
 *   - 155条（賦課期日4月1日）・157条（月割。1項：取得の翌月から／2項：消滅した月まで／
 *     4項：所有者の変更は「年度の末日に変更があつたものとみなす」＝名義変更では月割にならない）
 *   - 附則12条の3 1項：重課の開始は「初回新規登録を受けた日から起算して十四年（軽油は十二年）を
 *     経過した日の属する年度」。対象はガソリン・LPG が平成27年3月31日まで、軽油その他が
 *     平成29年3月31日までの初回新規登録。電気・天然ガス・メタノール・ガソリンのハイブリッドは除く
 *     （宮城県の案内はプラグインハイブリッドも除くと明記）
 *   - 附則12条の3 2項：電気自動車・PHEV が令和7年4月1日〜令和10年3月31日に初回新規登録 →
 *     翌年度分だけ概ね75%軽減（グリーン化特例）
 *   - 附則12条の4：2019-09-30 までに初回新規登録した自家用乗用の税率（1項）と重課後の額（3項）
 *   - 448条1項2号ハ(1)(ii)：軽四輪・乗用・自家用 10,800円。平成26年改正法附則15条：
 *     平成27年3月31日以前に最初の車両番号指定 7,200円
 *   - 附則30条1項：軽の重課は「初回車両番号指定を受けた月から起算して十四年を経過した月の属する年度」
 *     から 12,900円（平成28年改正法附則14条2項：2003-10-14 前の指定は「その年の12月」から数える）。
 *     2項：電気軽自動車は翌年度分だけ 2,700円
 * - 自動車重量税法（346AC0000000089）7条1項：本則（乗用 0.5t ごとに 3年 7,500円・2年 5,000円、軽は1両）
 * - 租税特別措置法（332AC0000000026）
 *   - 90条の11：当分の間税率（自家用乗用 3年 12,300円・2年 8,200円／0.5t、軽 9,900円・6,600円）
 *   - 90条の11の3：13年経過（2年 11,400円／0.5t、軽 8,200円）。90条の11の2：18年経過（12,600円、軽 8,800円）。
 *     起点は「初めて登録を受けた日の属する月から起算して十三年（十八年）を経過する月の前月の初日以後」
 *     ＝初度登録から 12年11か月（17年11か月）の月から。軽は初度検査の年から13年（18年）たった年の12月から
 *     （日本自動車検査登録情報協会の案内）
 *   - 90条の12：エコカー減税。令和8年5月1日〜令和10年4月30日の新規検査で 免税・本則の25%・50%・75%。
 *     6項：100円未満の端数は切り捨て。5項：免税を受けた電気自動車等（ガソリン車は燃費基準125%以上）は
 *     初回の継続車検も免税
 * - 環境省「令和8年度税制改正における自動車関係諸税（車体課税）の結果について」（2026-02-19）：
 *   環境性能割の廃止（2026-03-31）、エコカー減税の2段階の基準引上げ、EV・PHEV の新しい負担
 *   （2028-05-01 以後の車検から。額は令和9年度改正で決まる）
 */

/** 確認日。出典の表示に使う */
export const DATA_CHECKED_AT = '2026-11-04';

/**
 * 【データ更新箇所】EV・PHEV の車検時の新しい負担（2028-05-01 施行）の額が決まったか。
 * 令和9年度税制改正大綱（2026年12月中旬）と改正法の成立を確かめてから true にし、
 * `EV_SURCHARGE_PER_UNIT` に額を入れる。false の間は額を出さず「未定」を返す。
 */
export const EV_SURCHARGE_DECIDED = false;
/** 【データ更新箇所】EV・PHEV の新しい負担の額（2年あたり・0.5t ごと）。決まるまで null */
export const EV_SURCHARGE_PER_UNIT: number | null = null;
/** EV・PHEV の新しい負担がかかり始める日（この日以後に受ける車検から） */
export const EV_SURCHARGE_FROM = '2028-05-01';

/** 環境性能割が廃止された日（この日の前日までの取得に課税） */
export const KANKYO_SEINOWARI_ABOLISHED = '2026-04-01';

/** 2019-10-01 の税率引下げ（附則12条の4「特定日」） */
export const RATE_CUT_DATE = '2019-10';
/** 軽の 10,800円 が始まった最初の検査の月（平成26年改正法附則15条） */
export const KEI_NEW_RATE_FROM = '2015-04';

export type CarKind = 'futsu' | 'kei';
export type Power = 'gasoline' | 'diesel' | 'hybrid' | 'ev' | 'phev';

export const CAR_KINDS: { id: CarKind; label: string }[] = [
  { id: 'futsu', label: '登録車（普通・小型の乗用車・自家用）' },
  { id: 'kei', label: '軽自動車（四輪・乗用・自家用）' },
];

export const POWERS: { id: Power; label: string; kei: boolean }[] = [
  { id: 'gasoline', label: 'ガソリン・LPG', kei: true },
  { id: 'diesel', label: 'ディーゼル（軽油）', kei: false },
  { id: 'hybrid', label: 'ハイブリッド（ガソリン）', kei: true },
  { id: 'ev', label: '電気自動車（EV）・燃料電池車（FCV）', kei: true },
  { id: 'phev', label: 'プラグインハイブリッド（PHEV）', kei: false },
];

export interface DisplacementClass {
  /** 0〜9 */
  id: number;
  label: string;
  /** 2019-09-30 までに初回新規登録（附則12条の4 1項） */
  before2019: number;
  /** 2019-10-01 以後に初回新規登録（154条1項1号ロ） */
  from2019: number;
  /** 2019-09-30 までの登録車の重課後（附則12条の4 3項） */
  jukaBefore2019: number;
  /** グリーン化特例（翌年度分）の額（附則12条の3 2項。2019-10 以後の税率に対して） */
  green: number;
}

/** 【データ更新箇所】自家用乗用車の種別割（年額） */
export const DISPLACEMENT_CLASSES: DisplacementClass[] = [
  { id: 0, label: '1.0L以下', before2019: 29500, from2019: 25000, jukaBefore2019: 33900, green: 6500 },
  { id: 1, label: '1.0L超〜1.5L', before2019: 34500, from2019: 30500, jukaBefore2019: 39600, green: 8000 },
  { id: 2, label: '1.5L超〜2.0L', before2019: 39500, from2019: 36000, jukaBefore2019: 45400, green: 9000 },
  { id: 3, label: '2.0L超〜2.5L', before2019: 45000, from2019: 43500, jukaBefore2019: 51700, green: 11000 },
  { id: 4, label: '2.5L超〜3.0L', before2019: 51000, from2019: 50000, jukaBefore2019: 58600, green: 12500 },
  { id: 5, label: '3.0L超〜3.5L', before2019: 58000, from2019: 57000, jukaBefore2019: 66700, green: 14500 },
  { id: 6, label: '3.5L超〜4.0L', before2019: 66500, from2019: 65500, jukaBefore2019: 76400, green: 16500 },
  { id: 7, label: '4.0L超〜4.5L', before2019: 76500, from2019: 75500, jukaBefore2019: 87900, green: 19000 },
  { id: 8, label: '4.5L超〜6.0L', before2019: 88000, from2019: 87000, jukaBefore2019: 101200, green: 22000 },
  { id: 9, label: '6.0L超', before2019: 111000, from2019: 110000, jukaBefore2019: 127600, green: 27500 },
];

/** 【データ更新箇所】軽四輪・乗用・自家用の軽自動車税（種別割） */
export const KEI_RATES = {
  /** 2015-04-01 以後に最初の車両番号指定（448条） */
  standard: 10800,
  /** 2015-03-31 以前（平成26年改正法附則15条） */
  old: 7200,
  /** 13年超（附則30条1項） */
  juka: 12900,
  /** 電気軽自動車の翌年度分（附則30条2項） */
  green: 2700,
} as const;

/** 重課の対象になる初回新規登録の末日（附則12条の3 1項）。これより後は現行の条文の対象外 */
export const JUKA_STATUTORY_UNTIL: Record<'gasoline' | 'diesel', string> = {
  gasoline: '2015-03',
  diesel: '2017-03',
};

/** グリーン化特例（翌年度分の軽課）の対象になる初回新規登録の期間（附則12条の3 2項・30条2項） */
export const GREEN_PERIOD = { from: '2025-04', to: '2028-03' } as const;

/** 令和10年度以後に新規登録する EV・FCV は重量に応じた課税方式になる（税率は令和9年度改正で決まる） */
export const EV_NEW_REGIME_FROM = '2028-04';

/**
 * 【データ更新箇所】自動車重量税（自家用乗用は 0.5t ごと、軽は1両あたり）。
 * 本則は自動車重量税法7条、それ以外は租税特別措置法90条の11〜90条の11の3。
 */
export const JURYO_RATES = {
  futsu: { honsoku3: 7500, honsoku2: 5000, normal3: 12300, normal2: 8200, over13: 11400, over18: 12600 },
  kei: { honsoku3: 7500, honsoku2: 5000, normal3: 9900, normal2: 6600, over13: 8200, over18: 8800 },
} as const;

/** 車両重量の区分（0.5t ごと）。units は 0.5t の個数 */
export const WEIGHT_CLASSES: { units: number; label: string }[] = [
  { units: 1, label: '0.5t以下' },
  { units: 2, label: '0.5t超〜1.0t' },
  { units: 3, label: '1.0t超〜1.5t' },
  { units: 4, label: '1.5t超〜2.0t' },
  { units: 5, label: '2.0t超〜2.5t' },
  { units: 6, label: '2.5t超〜3.0t' },
];

/** エコカー減税の区分（新車の新規検査で使う。継続車検は本則税率か免税かだけが効く） */
export type EcoClass = 'unknown' | 'none' | 'exempt' | 'cut75' | 'cut50' | 'cut25' | 'honsoku';

export const ECO_CLASSES: { id: EcoClass; label: string }[] = [
  { id: 'unknown', label: 'わからない（エコカー外として計算）' },
  { id: 'exempt', label: '免税' },
  { id: 'cut75', label: '▲75%' },
  { id: 'cut50', label: '▲50%' },
  { id: 'cut25', label: '▲25%' },
  { id: 'honsoku', label: '本則税率' },
  { id: 'none', label: '対象外' },
];

export interface EcoPeriod {
  id: 'r7' | 'r8a' | 'r8b';
  from: string;
  /** この日を含む */
  to: string;
  label: string;
  /** 区分ごとの基準（2030年度燃費基準の達成率）。null はその区分が無い */
  criteria: Record<'exempt' | 'cut75' | 'cut50' | 'cut25' | 'honsoku', string | null>;
}

/** 【データ更新箇所】エコカー減税（重量税・乗用車）の期間と基準（環境省資料4ページ・租特法90条の12） */
export const ECO_PERIODS: EcoPeriod[] = [
  {
    id: 'r7',
    from: '2025-05-01',
    to: '2026-04-30',
    label: '2025年5月〜2026年4月',
    criteria: {
      exempt: '電気自動車等・2030年度基準100%以上',
      cut75: null,
      cut50: '90%以上',
      cut25: '80%以上',
      honsoku: '75%以上',
    },
  },
  {
    id: 'r8a',
    from: '2026-05-01',
    to: '2027-04-30',
    label: '2026年5月〜2027年4月',
    criteria: {
      exempt: '電気自動車等・2030年度基準105%以上',
      cut75: '100%以上',
      cut50: '95%以上',
      cut25: '80%以上',
      honsoku: null,
    },
  },
  {
    id: 'r8b',
    from: '2027-05-01',
    to: '2028-04-30',
    label: '2027年5月〜2028年4月',
    criteria: {
      exempt: '電気自動車等・2030年度基準105%以上',
      cut75: '100%以上',
      cut50: '95%以上',
      cut25: '85%以上',
      honsoku: '80%以上',
    },
  },
];

export const SOURCES: { label: string; url: string }[] = [
  {
    label: '環境省「令和8年度税制改正における自動車関係諸税（車体課税）の結果について」',
    url: 'https://www.env.go.jp/content/000382905.pdf',
  },
  {
    label: '総務省「2019年10月1日、自動車の税が大きく変わります」',
    url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/131410.html',
  },
  { label: '宮城県「自動車税のグリーン化（重課・軽課）について」', url: 'https://www.pref.miyagi.jp/soshiki/zeimu/car-green.html' },
  { label: 'e-Gov 法令検索「地方税法」', url: 'https://laws.e-gov.go.jp/law/325AC0000000226' },
  { label: 'e-Gov 法令検索「自動車重量税法」', url: 'https://laws.e-gov.go.jp/law/346AC0000000089' },
  { label: 'e-Gov 法令検索「租税特別措置法」', url: 'https://laws.e-gov.go.jp/law/332AC0000000026' },
];

// ───────────────────────── 年月の部品 ─────────────────────────

/** 'YYYY-MM' → 通し月（年×12＋月−1）。不正なら NaN */
export function ymIndex(ym: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return Number.NaN;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return Number.NaN;
  return Number(m[1]) * 12 + month - 1;
}

/** 通し月 → 'YYYY-MM' */
export function ymFromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** 'YYYY-MM' か 'YYYY-MM-DD' の属する年度（4月〜3月） */
export function fiscalYearOf(ymOrDate: string): number {
  const i = ymIndex(ymOrDate);
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return m >= 4 ? y : y - 1;
}

/** 年度 → 「令和8年度」 */
export function reiwaLabel(fiscalYear: number): string {
  const r = fiscalYear - 2018;
  return r === 1 ? '令和元年度' : `令和${r}年度`;
}

/** 年度 → 「令和8年度（2026年5月の通知）」 */
export function fiscalYearLabel(fiscalYear: number): string {
  return `${reiwaLabel(fiscalYear)}（${fiscalYear}年5月の通知）`;
}

export function formatYen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

/** 'YYYY-MM' → 「2026年5月」 */
export function ymLabel(ym: string): string {
  const i = ymIndex(ym);
  return `${Math.floor(i / 12)}年${(i % 12) + 1}月`;
}

const floor100 = (n: number) => Math.floor(n / 100) * 100;

// ───────────────────────── 種別割 ─────────────────────────

export interface CarInput {
  kind: CarKind;
  power: Power;
  /** 0〜9（DISPLACEMENT_CLASSES の id）。EV・FCV と軽は使わない */
  displacementClass: number;
  /** 初度登録（軽は最初の検査）の年月 'YYYY-MM' */
  firstRegistered: string;
}

export type JukaStart =
  /** 重課の対象にならない動力（ハイブリッド・EV・PHEV） */
  | { kind: 'exempt' }
  | {
      kind: 'start';
      /** 重課が始まる年度 */
      fiscalYear: number;
      /** 現行の条文が対象にしている登録日か（false は「延長されれば」の見込み） */
      statutory: boolean;
      /** 重課後の額。条文に額が無い（2019-10 以後の登録車）ときは null */
      yen: number | null;
      /** 重課前の額 */
      standardYen: number;
      /** 目安の「13年」「11年」 */
      years: number;
    };

function isEv(power: Power): boolean {
  return power === 'ev';
}

/** 登録車の基本の税率（重課・軽課の前） */
function futsuBaseRate(car: CarInput): number {
  const cls = DISPLACEMENT_CLASSES[isEv(car.power) ? 0 : car.displacementClass];
  return ymIndex(car.firstRegistered) < ymIndex(RATE_CUT_DATE) ? cls.before2019 : cls.from2019;
}

function keiBaseRate(car: CarInput): number {
  return ymIndex(car.firstRegistered) < ymIndex(KEI_NEW_RATE_FROM) ? KEI_RATES.old : KEI_RATES.standard;
}

/** 種別割の重課が始まる年度（附則12条の3 1項・附則30条1項） */
export function jukaStartFiscalYear(car: CarInput): JukaStart {
  const reg = car.firstRegistered;
  if (car.kind === 'kei') {
    if (car.power !== 'gasoline') return { kind: 'exempt' };
    // 「初回車両番号指定を受けた月から起算して十四年を経過した月の属する年度」。
    // 2003-10-14 前の指定は「その年の十二月」から数える（平成28年改正法附則14条2項）。
    // 2003-10 は日が分からないので、14日以後の指定として扱う
    const i = ymIndex(reg);
    const start = ymIndex(reg) < ymIndex('2003-10') ? Math.floor(i / 12) * 12 + 11 : i;
    return {
      kind: 'start',
      fiscalYear: fiscalYearOf(ymFromIndex(start + 14 * 12)),
      statutory: true,
      yen: KEI_RATES.juka,
      standardYen: keiBaseRate(car),
      years: 13,
    };
  }
  if (car.power === 'hybrid' || car.power === 'ev' || car.power === 'phev') return { kind: 'exempt' };
  const fuel = car.power === 'diesel' ? 'diesel' : 'gasoline';
  // 「初回新規登録を受けた日から起算して十四年（軽油は十二年）を経過した日の属する年度」
  // ＝ 登録の年度 ＋14（＋12）。日がどこでも年度は変わらない
  const add = fuel === 'diesel' ? 12 : 14;
  const before2019 = ymIndex(reg) < ymIndex(RATE_CUT_DATE);
  return {
    kind: 'start',
    fiscalYear: fiscalYearOf(reg) + add,
    statutory: ymIndex(reg) <= ymIndex(JUKA_STATUTORY_UNTIL[fuel]),
    yen: before2019 ? DISPLACEMENT_CLASSES[car.displacementClass].jukaBefore2019 : null,
    standardYen: futsuBaseRate(car),
    years: fuel === 'diesel' ? 11 : 13,
  };
}

export type ShubetsuStatus =
  /** 登録した年度。4月1日の所有者ではないので通知は来ない（登録車は登録時に月割で納める） */
  | 'first-year'
  /** まだ登録していない年度 */
  | 'not-registered'
  | 'standard'
  /** 重課（条文どおり） */
  | 'juka'
  /** 重課の見込み（現行の条文の対象の登録日より後。延長されれば） */
  | 'juka-projected'
  /** 重課の見込みだが、条文に額が無い（2019-10 以後の登録車） */
  | 'juka-undetermined'
  /** グリーン化特例（翌年度分の軽課） */
  | 'green'
  /** 令和10年度以後に新規登録する EV・FCV。税率は令和9年度改正で決まる */
  | 'undecided';

export interface ShubetsuResult {
  status: ShubetsuStatus;
  /** その年度の通知の額。'first-year' 'not-registered' 'undecided' は null */
  yen: number | null;
  /** 重課・軽課の前の額 */
  standardYen: number;
  /** 令和10年度以後は「重量と環境性能に応じた仕組み」に見直される予定（令和9年度改正で結論） */
  mayChange: boolean;
}

/** その年度の自動車税／軽自動車税（種別割） */
export function shubetsuwari(car: CarInput, fiscalYear: number): ShubetsuResult {
  const regFy = fiscalYearOf(car.firstRegistered);
  const standardYen = car.kind === 'kei' ? keiBaseRate(car) : futsuBaseRate(car);
  const mayChange = car.kind === 'futsu' && fiscalYear >= 2028;
  const base = { standardYen, mayChange };
  if (fiscalYear < regFy) return { ...base, status: 'not-registered', yen: null };
  if (car.kind === 'futsu' && isEv(car.power) && ymIndex(car.firstRegistered) >= ymIndex(EV_NEW_REGIME_FROM)) {
    return { ...base, status: 'undecided', yen: null };
  }
  if (fiscalYear === regFy) return { ...base, status: 'first-year', yen: null };

  const inGreen =
    (car.power === 'ev' || (car.kind === 'futsu' && car.power === 'phev')) &&
    ymIndex(car.firstRegistered) >= ymIndex(GREEN_PERIOD.from) &&
    ymIndex(car.firstRegistered) <= ymIndex(GREEN_PERIOD.to) &&
    fiscalYear === regFy + 1;
  if (inGreen) {
    const yen =
      car.kind === 'kei'
        ? KEI_RATES.green
        : DISPLACEMENT_CLASSES[isEv(car.power) ? 0 : car.displacementClass].green;
    return { ...base, status: 'green', yen };
  }

  const juka = jukaStartFiscalYear(car);
  if (juka.kind === 'start' && fiscalYear >= juka.fiscalYear) {
    if (juka.yen === null) return { ...base, status: 'juka-undetermined', yen: standardYen };
    return { ...base, status: juka.statutory ? 'juka' : 'juka-projected', yen: juka.yen };
  }
  return { ...base, status: 'standard', yen: standardYen };
}

// ───────────────────────── 重量税 ─────────────────────────

export interface JuryoInput extends CarInput {
  /** 0.5t の個数（WEIGHT_CLASSES の units）。軽は使わない */
  weightUnits: number;
  ecoClass: EcoClass;
}

/** 電気自動車等（EV・FCV・PHEV）。継続車検は本則税率で、経年の重課もない（租特法90条の11 の「免税対象車等」） */
function isDenkiTo(power: Power): boolean {
  return power === 'ev' || power === 'phev';
}

/** 継続車検の月の一覧（初回は登録から3年、以後2年ごと）。from 以後の count 回 */
export function inspectionMonths(firstRegistered: string, fromYm: string, count: number): string[] {
  const reg = ymIndex(firstRegistered);
  const from = ymIndex(fromYm);
  const out: string[] = [];
  let i = reg + 36;
  while (i < from) i += 24;
  for (let k = 0; k < count; k++, i += 24) out.push(ymFromIndex(i));
  return out;
}

export type AgeBand = 'under13' | 'over13' | 'over18';

/** 車検の月の経年の区分（租特法90条の11の2・90条の11の3） */
export function ageBandAt(kind: CarKind, firstRegistered: string, inspectionYm: string): AgeBand {
  const reg = ymIndex(firstRegistered);
  const at = ymIndex(inspectionYm);
  if (kind === 'kei') {
    // 軽は初度検査の「年」で数え、13年（18年）たった年の12月から
    const y = Math.floor(reg / 12);
    if (at >= (y + 18) * 12 + 11) return 'over18';
    if (at >= (y + 13) * 12 + 11) return 'over13';
    return 'under13';
  }
  // 「十三年を経過する月の前月の初日以後」＝登録から 12年11か月の月から
  if (at >= reg + 18 * 12 - 1) return 'over18';
  if (at >= reg + 13 * 12 - 1) return 'over13';
  return 'under13';
}

/** 経年の重課が始まる車検の月（13年・18年）。登録車は 12年11か月・17年11か月の月 */
export function ageBandStart(kind: CarKind, firstRegistered: string, band: 'over13' | 'over18'): string {
  const reg = ymIndex(firstRegistered);
  const years = band === 'over13' ? 13 : 18;
  if (kind === 'kei') return ymFromIndex((Math.floor(reg / 12) + years) * 12 + 11);
  return ymFromIndex(reg + years * 12 - 1);
}

export type EvSurcharge =
  /** かからない（EV・PHEV 以外、または施行前の車検） */
  | 'none'
  /** 既販車の施行後最初の継続車検なので免除 */
  | 'exempt-first'
  /** かかるが額は未定（令和9年度改正で決まる） */
  | 'undecided'
  /** 額が決まった */
  | 'decided';

export interface JuryoResult {
  /** 車検の月 'YYYY-MM' */
  inspection: string;
  /** 2年分の額（EV の新しい負担は含まない） */
  yen: number;
  /** どの税率か */
  rate: 'exempt' | 'honsoku' | 'normal' | 'over13' | 'over18';
  ageBand: AgeBand;
  /** エコカーかどうかが分からず、エコカー外として計算した */
  assumedNonEco: boolean;
  /** ガソリン車で「免税」を選んだ人の初回の継続車検。燃費基準125%以上なら免税（ここでは本則で出す） */
  maybeExempt125: boolean;
  evSurcharge: EvSurcharge;
  /** EV の新しい負担の額（決まったときだけ） */
  evSurchargeYen: number | null;
}

/** 継続車検の重量税（2年分） */
export function juryozei(car: JuryoInput, inspectionYm: string): JuryoResult {
  const table = JURYO_RATES[car.kind];
  const units = car.kind === 'kei' ? 1 : car.weightUnits;
  const ageBand = ageBandAt(car.kind, car.firstRegistered, inspectionYm);
  const firstContinuing = ymIndex(inspectionYm) === ymIndex(car.firstRegistered) + 36;
  const denki = isDenkiTo(car.power);
  const eco = denki || (car.ecoClass !== 'unknown' && car.ecoClass !== 'none');

  let rate: JuryoResult['rate'];
  if (denki && firstContinuing) rate = 'exempt';
  else if (eco) rate = 'honsoku';
  else if (ageBand === 'over18') rate = 'over18';
  else if (ageBand === 'over13') rate = 'over13';
  else rate = 'normal';

  const perUnit = {
    exempt: 0,
    honsoku: table.honsoku2,
    normal: table.normal2,
    over13: table.over13,
    over18: table.over18,
  }[rate];

  let evSurcharge: EvSurcharge = 'none';
  if (denki && ymIndex(inspectionYm) >= ymIndex(EV_SURCHARGE_FROM)) {
    const soldBefore = ymIndex(car.firstRegistered) < ymIndex(EV_SURCHARGE_FROM);
    const first = inspectionMonths(car.firstRegistered, EV_SURCHARGE_FROM, 1)[0];
    if (soldBefore && first === inspectionYm) evSurcharge = 'exempt-first';
    else evSurcharge = EV_SURCHARGE_DECIDED ? 'decided' : 'undecided';
  }
  const evSurchargeYen =
    evSurcharge === 'decided' && EV_SURCHARGE_PER_UNIT !== null ? EV_SURCHARGE_PER_UNIT * units : null;

  return {
    inspection: inspectionYm,
    yen: perUnit * units,
    rate,
    ageBand,
    assumedNonEco: !denki && car.ecoClass === 'unknown',
    maybeExempt125: !denki && car.ecoClass === 'exempt' && firstContinuing,
    evSurcharge,
    evSurchargeYen,
  };
}

/** 新車登録の日が入るエコカー減税の期間。期間外なら null（日付は文字列で比べる） */
export function ecoPeriodOn(date: string): EcoPeriod | null {
  return ECO_PERIODS.find((p) => date >= p.from && date <= p.to) ?? null;
}

export interface ShinshaJuryo {
  /** 3年分の額 */
  yen: number;
  period: EcoPeriod | null;
  /** 選んだ区分がその期間に無かった（エコカー外として計算） */
  classUnavailable: boolean;
  appliedClass: EcoClass;
}

/** 新車を買うときの重量税（3年分。租特法90条の12。▲は本則に掛けて100円未満切捨て） */
export function shinshaJuryozei(car: JuryoInput, registeredOn: string): ShinshaJuryo {
  const table = JURYO_RATES[car.kind];
  const units = car.kind === 'kei' ? 1 : car.weightUnits;
  const period = ecoPeriodOn(registeredOn);
  let cls: EcoClass = isDenkiTo(car.power) ? 'exempt' : car.ecoClass;
  let classUnavailable = false;
  if (cls !== 'unknown' && cls !== 'none') {
    if (period === null || period.criteria[cls] === null) {
      classUnavailable = true;
      cls = 'none';
    }
  }
  const honsoku = table.honsoku3 * units;
  const yen = {
    unknown: table.normal3 * units,
    none: table.normal3 * units,
    exempt: 0,
    cut75: floor100(honsoku * 0.25),
    cut50: floor100(honsoku * 0.5),
    cut25: floor100(honsoku * 0.75),
    honsoku,
  }[cls];
  return { yen, period, classUnavailable, appliedClass: cls };
}

// ───────────────────────── 月割・環境性能割 ─────────────────────────

/**
 * 登録車を買ったとき（新規登録・移転で4月1日の所有者でない）の月割。登録の翌月から3月まで（157条1項）。
 * 確定金額の100円未満は切り捨て（地方税法20条の4の2第3項）
 */
export function proratedOnAcquire(annual: number, registeredYm: string): { months: number; yen: number } {
  const m = (ymIndex(registeredYm) % 12) + 1;
  // 翌月から3月まで。3月に登録すると0か月
  const months = m >= 4 ? 15 - m : 3 - m;
  return { months, yen: floor100((annual * months) / 12) };
}

/**
 * 抹消登録（廃車・輸出）したときの還付の目安。4月から抹消した月までが課税（157条2項）で、
 * 残りの月の分が戻る。名義変更（売却・譲渡）では戻らない（157条4項）
 */
export function refundOnDeregister(annual: number, deregisteredYm: string): { months: number; yen: number } {
  const m = (ymIndex(deregisteredYm) % 12) + 1;
  const taxedMonths = m >= 4 ? m - 3 : m + 9;
  const taxed = floor100((annual * taxedMonths) / 12);
  return { months: 12 - taxedMonths, yen: annual - taxed };
}

/** 環境性能割（2026-03-31 で廃止）の税率の幅。自家用の登録車 0〜3%、軽 0〜2% */
export function kankyoSeinowariRange(kind: CarKind, price: number): { maxRate: number; maxYen: number } {
  const maxRate = kind === 'kei' ? 2 : 3;
  // 税額は課税標準（1,000円未満切捨て）×税率の100円未満切捨て。ここでは目安
  const base = Math.floor(price / 1000) * 1000;
  return { maxRate, maxYen: floor100((base * maxRate) / 100) };
}

// ───────────────────────── まとめ ─────────────────────────

export interface Summary {
  fiscalYear: number;
  shubetsu: ShubetsuResult;
  juka: JukaStart;
  next: JuryoResult;
  /** 1年あたり（種別割＋次の車検の重量税÷2）。種別割が出せないときは null */
  perYear: number | null;
  /** 重課まであと何年度か（すでに重課・対象外は null） */
  yearsToJuka: number | null;
}

export type SummaryResult =
  | { kind: 'ok'; summary: Summary }
  | { kind: 'error'; error: 'registered' | 'future' | 'displacement' | 'weight' };

/** 入力の検査とまとめ。asOf は 'YYYY-MM-DD'（開いた日） */
export function summarize(car: JuryoInput, asOf: string): SummaryResult {
  if (Number.isNaN(ymIndex(car.firstRegistered)) || ymIndex(car.firstRegistered) < ymIndex('1970-01')) {
    return { kind: 'error', error: 'registered' };
  }
  if (ymIndex(car.firstRegistered) > ymIndex(asOf)) return { kind: 'error', error: 'future' };
  if (
    car.kind === 'futsu' &&
    !isEv(car.power) &&
    !DISPLACEMENT_CLASSES.some((c) => c.id === car.displacementClass)
  ) {
    return { kind: 'error', error: 'displacement' };
  }
  if (car.kind === 'futsu' && !WEIGHT_CLASSES.some((w) => w.units === car.weightUnits)) {
    return { kind: 'error', error: 'weight' };
  }
  const fiscalYear = fiscalYearOf(asOf);
  const shubetsu = shubetsuwari(car, fiscalYear);
  const juka = jukaStartFiscalYear(car);
  const next = juryozei(car, inspectionMonths(car.firstRegistered, asOf, 1)[0]);
  // 登録した年度は通知が来ないので、来年度の額で「1年あたり」を出す
  const yearly =
    shubetsu.status === 'first-year' ? shubetsuwari(car, fiscalYear + 1).yen : shubetsu.yen;
  const perYear = yearly === null ? null : yearly + Math.round(next.yen / 2);
  const yearsToJuka =
    juka.kind === 'start' && juka.fiscalYear > fiscalYear ? juka.fiscalYear - fiscalYear : null;
  return { kind: 'ok', summary: { fiscalYear, shubetsu, juka, next, perYear, yearsToJuka } };
}

export interface TimelineRow {
  fiscalYear: number;
  shubetsu: ShubetsuResult;
  /** その年度に来る継続車検 */
  inspections: JuryoResult[];
}

/** 今年度から years 年度分の推移 */
export function timeline(car: JuryoInput, fromFiscalYear: number, years = 10): TimelineRow[] {
  const startYm = `${fromFiscalYear}-04`;
  const all = inspectionMonths(car.firstRegistered, startYm, Math.ceil(years / 2) + 1);
  const rows: TimelineRow[] = [];
  for (let k = 0; k < years; k++) {
    const fy = fromFiscalYear + k;
    rows.push({
      fiscalYear: fy,
      shubetsu: shubetsuwari(car, fy),
      inspections: all.filter((ym) => fiscalYearOf(ym) === fy).map((ym) => juryozei(car, ym)),
    });
  }
  return rows;
}
