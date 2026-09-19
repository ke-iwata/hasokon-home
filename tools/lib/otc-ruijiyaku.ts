/**
 * OTC類似薬「特別の料金」の自己負担 計算ロジック
 *
 * 仕様: docs/features/otc-ruijiyaku-tokubetsu-futan.md
 *
 * 2026-05-29 成立の「健康保険法等の一部を改正する法律」（令和8年法律第31号）で、
 * 市販薬（OTC）と同じ成分の処方薬に **「特別の料金」** が新設される。実施は 2027年3月。
 *
 * ■ 「保険が効かなくなる」のではない
 * これは**一部を保険外併用療養にする**仕組みで、対象医薬品の
 * **薬剤料の4分の1だけ**が保険外の「特別の料金」になり、
 * **残りの4分の3には通常どおり保険給付が残る**。
 * ネット上の解説には「全額自費」「保険適用外」と書くものがあるが誤り。
 * このファイルとUIでは「保険適用外」「全額自費」という言い方をしない。
 *
 *   改正後の窓口（薬剤料の分）= 薬剤料 × 1/4 ＋ 薬剤料 × 3/4 × 窓口負担割合
 *
 * 3割負担なら 25% ＋ 75%×30% ＝ **47.5%**（従来 30%）。2割は 40%、1割は 32.5%。
 *
 * ■ 「かかるかどうか」を金額より先に出す
 * 除外（6類型）に当たる人と、経過措置の品目（湿布・皮膚保湿剤。2029年3月まで対象外）は
 * **1円も増えない**。もっとも検索される湿布・保湿剤で「＋175円」と出してしまうと、
 * このツールがネット上の誤りを増やす側に回る。`calculate()` は金額より先に
 * `charged` と `reasons` を返し、UIはその順に出すこと。
 *
 * ■ 確定していないもの（告示・省令待ち）
 * 中間とりまとめ（2026-08-06）までの内容で、告示・省令はまだ出ていない。
 * 次の3つは**このファイルの中で「未確認」と印を付けて1か所にまとめてある**
 * （`UNCONFIRMED`）。告示が出たら、ここと `DATA_CHECKED_AT` を直す。
 *   1. 施行日（「2027年3月」までしか公表されていない。日は `ENFORCEMENT_FROM` の暫定値）
 *   2. 消費税が上乗せされるか（保険外の料金なので乗るとされるが条文で未確認）
 *   3. 円未満の端数処理（薬剤料は10円単位なので 1/4 で 2.5円が出る）
 *
 * ■ このツールが出すのは「薬剤料の分」だけ
 * 実際の窓口では調剤技術料・薬学管理料などが加わり、一部負担金は
 * 明細の合計に対して10円未満を四捨五入する。薬剤料だけを取り出して
 * 10円単位に丸めると実際とずれるので、ここでは丸めない。
 *
 * ■ 一次情報（2026-09-19 取得）
 * - 厚生労働省「『ＯＴＣ類似薬の保険給付の見直しの実施に向けた中間とりまとめ』について」
 *   https://www.mhlw.go.jp/stf/index_00157.html （中間とりまとめ本体の掲載ページ）
 * - 第213回 社会保障審議会医療保険部会（2026-08-27）資料1
 *   https://www.mhlw.go.jp/content/12401000/001742888.pdf
 * - 第214回 社会保障審議会医療保険部会（2026-09-03）資料2
 *   https://www.mhlw.go.jp/content/12401000/001744962.pdf
 * - 厚生労働省「健康保険法等の一部を改正する法律（令和8年法律第31号）」成立資料
 *   https://www.mhlw.go.jp/content/12401000/001712849.pdf
 *
 * 【データ更新箇所】告示・省令が出たら `UNCONFIRMED` の3点と `EXCLUSIONS` の文言を
 * 条文どおりに直し、`DATA_CHECKED_AT` を進める。
 * **確認して変わらなくても `DATA_CHECKED_AT` は必ず進める**
 * （「確認済みで変化なし」と「確認していない」を区別するため）。
 */

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-09-19';

/** 一次情報へのリンク */
export interface Source {
  /** 出典の名前。UIには「出典：〇〇」と出す */
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

/** 厚労省「中間とりまとめ」の掲載ページ。仕組み・除外・経過措置の出典 */
export const SOURCE_MHLW_TORIMATOME: Source = {
  label: '厚生労働省「ＯＴＣ類似薬の保険給付の見直しの実施に向けた中間とりまとめ」',
  url: 'https://www.mhlw.go.jp/stf/index_00157.html',
  checkedAt: DATA_CHECKED_AT,
};

/** 第213回 社会保障審議会医療保険部会（2026-08-27）資料1 */
export const SOURCE_MHLW_213: Source = {
  label: '厚生労働省 第213回 社会保障審議会医療保険部会 資料1（2026年8月27日）',
  url: 'https://www.mhlw.go.jp/content/12401000/001742888.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 第214回 社会保障審議会医療保険部会（2026-09-03）資料2 */
export const SOURCE_MHLW_214: Source = {
  label: '厚生労働省 第214回 社会保障審議会医療保険部会 資料2（2026年9月3日）',
  url: 'https://www.mhlw.go.jp/content/12401000/001744962.pdf',
  checkedAt: DATA_CHECKED_AT,
};

/** 健康保険法等の一部を改正する法律（令和8年法律第31号）の成立資料 */
export const SOURCE_MHLW_LAW: Source = {
  label: '厚生労働省「健康保険法等の一部を改正する法律（令和8年法律第31号）」',
  url: 'https://www.mhlw.go.jp/content/12401000/001712849.pdf',
  checkedAt: DATA_CHECKED_AT,
};

export const SOURCES: Source[] = [
  SOURCE_MHLW_TORIMATOME,
  SOURCE_MHLW_213,
  SOURCE_MHLW_214,
  SOURCE_MHLW_LAW,
];

/* ===================================================================
   制度の数値
   =================================================================== */

/** 診療報酬・調剤報酬の1点あたりの金額（円）。健康保険法76条2項の告示による */
export const YEN_PER_POINT = 10;

/** 「特別の料金」になる割合（薬剤料の4分の1） */
export const SPECIAL_CHARGE_RATIO = 0.25;

/** 保険給付が残る割合（薬剤料の4分の3） */
export const INSURED_RATIO = 1 - SPECIAL_CHARGE_RATIO;

/**
 * 実施の開始日。
 *
 * **公表されているのは「2027年3月（令和8年度中）」までで、日は決まっていない。**
 * 月初を暫定値に置いている（告示が出たら日ごと差し替える）。
 * ツールは「2027年3月より前の処方か」を見るだけなので、
 * 月内のどの日でも判定は変わらない。
 */
export const ENFORCEMENT_FROM = '2027-03-01';

/** 実施時期の表示。日が決まっていないので「2027年3月」と書く */
export const ENFORCEMENT_LABEL = '2027年3月';

/**
 * 経過措置の終わり。
 *
 * 湿布（外用鎮痛消炎剤）・皮膚保湿剤等は、一定の重症患者の長期使用の実態を踏まえ、
 * **令和10年度末（2029-03-31）まで「特別の料金」の対象外**。
 * 検索がもっとも集まるのがこの2つなので、UIでは最上位に出す。
 */
export const TRANSITION_UNTIL = '2029-03-31';

/** 経過措置の表示 */
export const TRANSITION_LABEL = '2029年3月末';

/**
 * 告示・省令で確かめる必要が残っている点。
 *
 * **UIはここを根拠に注意書きを出す。** ばらばらに文章へ埋め込むと、
 * 告示が出たときに直し漏れる。
 */
export const UNCONFIRMED = {
  /** 施行日（「2027年3月」までしか公表されていない） */
  enforcementDay: true,
  /** 消費税が上乗せされるか */
  consumptionTax: true,
  /** 円未満の端数処理 */
  rounding: true,
} as const;

/**
 * 「特別の料金」に乗る消費税の税率（暫定）。
 *
 * 保険外の料金なので課税されるという解説が多いが、**条文で確認できていない**
 * （`UNCONFIRMED.consumptionTax`）。UIでは本体と分けて表示し、
 * 「上乗せされる見込み」と添えること。
 */
export const CONSUMPTION_TAX_RATE = 0.1;

/**
 * 円未満の端数処理（暫定）。
 *
 * 薬剤料は10円単位なので、1/4 を取ると 2.5円 のような端数が出る
 * （25点＝250円 → 62.5円）。**告示で決まるまでの暫定として切り捨てにしている**
 * （`UNCONFIRMED.rounding`）。特別の料金と保険分の窓口負担をそれぞれ切り捨てる。
 */
export function roundYen(value: number): number {
  return Math.floor(value);
}

/** 窓口負担割合（％） */
export type CopayPercent = 30 | 20 | 10;

export interface CopayOption {
  value: CopayPercent;
  /** 「3割」 */
  label: string;
  /** 誰が当たるか（一言） */
  who: string;
}

/**
 * 窓口負担割合の選択肢。
 *
 * 未就学児は2割だが「18歳の年度末まで」が除外なので、
 * 2割・1割はおもに70歳以上の人が選ぶことになる。
 */
export const COPAY_OPTIONS: CopayOption[] = [
  { value: 30, label: '3割', who: '70歳未満、または現役並み所得の人' },
  { value: 20, label: '2割', who: '70〜74歳（現役並み所得を除く）、一定以上所得の後期高齢者' },
  { value: 10, label: '1割', who: '75歳以上（一定以上所得・現役並み所得を除く）' },
];

/* ===================================================================
   除外（中間とりまとめの類型）
   =================================================================== */

/** 除外の類型のID */
export type ExclusionId = 'child' | 'kouhi' | 'admission' | 'procedure' | 'long-term';

export interface ExclusionDef {
  id: ExclusionId;
  /** チェックボックスの文言 */
  label: string;
  /** 「かかりません」と出すときの根拠の文 */
  reason: string;
  /** 補足（日数の条件など） */
  note?: string;
}

/**
 * 「特別の料金」がかからない類型。
 *
 * **「低所得者」のチェックは置かない。** 2025-12 の政府決定には挙がっていたが、
 * 中間とりまとめの類型には独立して出てこない（公費負担医療に吸収されたとみられる）。
 * 告示で独立の類型が立ったらここに1つ足す。
 *
 * 【データ更新箇所】告示が出たら文言と日数の条件を条文どおりに直す。
 */
export const EXCLUSIONS: ExclusionDef[] = [
  {
    id: 'child',
    label: '18歳の年度末まで（18歳に達した日以後の最初の3月31日まで）',
    reason: '18歳の年度末までの人は「特別の料金」の対象外です',
    note: '年齢で切るのではなく年度で切るため、高校3年生の3月までは対象外になります。',
  },
  {
    id: 'kouhi',
    label: 'がん・難病・公費負担医療の対象となる慢性疾患の治療に関わる処方',
    reason: 'がん・難病・公費負担医療の対象となる患者への処方は「特別の料金」の対象外です',
    note: '配慮が必要な慢性疾患は、公費負担医療の対象かどうかで線を引くとされています。',
  },
  {
    id: 'admission',
    label: '入院中の処方・退院時の処方',
    reason: '入院中・退院時の処方は「特別の料金」の対象外です',
  },
  {
    id: 'procedure',
    label: '処置・手術等の一環としての処方（14日分まで）',
    reason: '処置・手術等の一環としての処方（14日分まで）は「特別の料金」の対象外です',
    note: '14日分を超える部分は対象になります。',
  },
  {
    id: 'long-term',
    label: '医師が長期の使用を医療上必要と認めた場合（内服は年におおむね50週、外用は通年）',
    reason: '医師が長期の使用を医療上必要と認めた場合は「特別の料金」の対象外です',
    note: '内服は年間の処方日数がおおむね50週、外用は通年の使用が確認できる場合とされています。',
  },
];

/** IDから定義を引く */
export function exclusionById(id: ExclusionId): ExclusionDef | undefined {
  return EXCLUSIONS.find((e) => e.id === id);
}

/* ===================================================================
   判定と計算
   =================================================================== */

/** かからない理由。`'before-enforcement'` と `'transition'` は除外の類型ではない */
export type ExemptReason = 'before-enforcement' | 'transition' | ExclusionId;

export interface CalcInput {
  /** 薬剤料の点数（1点＝10円）。調剤明細書・領収証の「薬剤料 ○○点」 */
  points: number;
  copayPercent: CopayPercent;
  /** チェックの付いた除外の類型 */
  exclusions?: ExclusionId[];
  /** 湿布（外用鎮痛消炎剤）・皮膚保湿剤など、経過措置の品目か */
  transitionItem?: boolean;
  /** 処方を受ける日 'YYYY-MM-DD' */
  prescribedOn: string;
  /** 1年に何回この処方を受けるか（年間の負担増に使う）。省略時は年間を出さない */
  timesPerYear?: number;
}

export interface CalcResult {
  /** 入力の点数（切り捨て後） */
  points: number;
  /** 薬剤料（円） */
  drugCost: number;
  /** 「特別の料金」がかかるか。**UIはこれを金額より先に出す** */
  charged: boolean;
  /**
   * かからない理由。`charged` が false のときだけ入る。
   * **先頭が主たる理由**（施行前 → 経過措置 → 除外の類型の順）。
   */
  reasons: ExemptReason[];
  /** 従来の窓口負担（薬剤料の分・円） */
  before: number;
  /** 特別の料金（本体・円） */
  specialCharge: number;
  /** 特別の料金にかかる消費税（円。上乗せされる見込みの額） */
  consumptionTax: number;
  /** 保険がきく4分の3の分の窓口負担（円） */
  insuredCopay: number;
  /** 改正後の窓口負担（消費税を含まない・円） */
  after: number;
  /** 改正後の窓口負担（消費税を含む・円） */
  afterWithTax: number;
  /** 増える額（消費税を含まない・円） */
  increase: number;
  /** 増える額（消費税を含む・円） */
  increaseWithTax: number;
  /** 薬剤料に対する実質の負担率（3割なら 0.475） */
  effectiveRate: number;
  /** 1年で増える額（消費税を含まない・円）。`timesPerYear` が無ければ null */
  yearlyIncrease: number | null;
  /** 1年で増える額（消費税を含む・円）。`timesPerYear` が無ければ null */
  yearlyIncreaseWithTax: number | null;
}

/** 円 → 点数。10円未満は切り捨てる（点数は整数なので端数を持てない） */
export function yenToPoints(yen: number): number | null {
  if (!Number.isFinite(yen) || yen < 0) return null;
  return Math.floor(yen / YEN_PER_POINT);
}

/** 点数 → 円 */
export function pointsToYen(points: number): number {
  return points * YEN_PER_POINT;
}

/**
 * 薬剤料に対する実質の負担率。
 * 特別の料金（25%・全額負担）＋ 残り75%への窓口負担割合。
 * 消費税は含まない（乗るかどうかが未確認のため）。
 */
export function effectiveBurdenRate(copayPercent: CopayPercent): number {
  return SPECIAL_CHARGE_RATIO + INSURED_RATIO * (copayPercent / 100);
}

/** 施行日（2027年3月）以後の処方か */
export function isOnOrAfterEnforcement(isoDate: string): boolean {
  return isoDate >= ENFORCEMENT_FROM;
}

/** 経過措置の期間内か（2029年3月末まで） */
export function isWithinTransition(isoDate: string): boolean {
  return isoDate <= TRANSITION_UNTIL;
}

/**
 * 「特別の料金」がかかるかを判定する。
 *
 * 返すのは**当てはまる理由すべて**で、先頭が主たる理由。
 * 施行前 → 経過措置 → 除外の類型、の順に並べる
 * （もっとも検索される湿布・保湿剤で、経過措置が埋もれないようにするため）。
 */
export function exemptReasons(input: {
  exclusions?: ExclusionId[];
  transitionItem?: boolean;
  prescribedOn: string;
}): ExemptReason[] {
  const reasons: ExemptReason[] = [];
  if (!isOnOrAfterEnforcement(input.prescribedOn)) reasons.push('before-enforcement');
  if (input.transitionItem && isWithinTransition(input.prescribedOn)) reasons.push('transition');
  // EXCLUSIONS の並び順で出す（チェックを付けた順に左右されないようにするため）
  for (const def of EXCLUSIONS) {
    if (input.exclusions?.includes(def.id)) reasons.push(def.id);
  }
  return reasons;
}

/**
 * 窓口で払う額（薬剤料の分）を計算する。
 *
 * 入力が数として読めないときは null（UIは「入れてください」を出す）。
 */
export function calculate(input: CalcInput): CalcResult | null {
  if (!Number.isFinite(input.points) || input.points < 0) return null;
  const points = Math.floor(input.points);
  const drugCost = pointsToYen(points);
  const copay = input.copayPercent / 100;

  const reasons = exemptReasons(input);
  const charged = reasons.length === 0;

  const before = roundYen(drugCost * copay);

  const specialCharge = charged ? roundYen(drugCost * SPECIAL_CHARGE_RATIO) : 0;
  const consumptionTax = charged ? roundYen(drugCost * SPECIAL_CHARGE_RATIO * CONSUMPTION_TAX_RATE) : 0;
  const insuredCopay = charged
    ? roundYen(drugCost * INSURED_RATIO * copay)
    : before;

  const after = specialCharge + insuredCopay;
  const afterWithTax = after + consumptionTax;
  const increase = after - before;
  const increaseWithTax = afterWithTax - before;

  const times =
    input.timesPerYear !== undefined &&
    Number.isFinite(input.timesPerYear) &&
    input.timesPerYear > 0
      ? Math.floor(input.timesPerYear)
      : null;

  return {
    points,
    drugCost,
    charged,
    reasons,
    before,
    specialCharge,
    consumptionTax,
    insuredCopay,
    after,
    afterWithTax,
    increase,
    increaseWithTax,
    effectiveRate: effectiveBurdenRate(input.copayPercent),
    yearlyIncrease: times === null ? null : increase * times,
    yearlyIncreaseWithTax: times === null ? null : increaseWithTax * times,
  };
}

/**
 * 「かかりません」と出すときの文。
 * `reasons` の先頭（主たる理由）から作る。
 */
export function exemptMessage(reason: ExemptReason): string {
  if (reason === 'before-enforcement') {
    return `${ENFORCEMENT_LABEL}より前の処方なので、「特別の料金」はかかりません`;
  }
  if (reason === 'transition') {
    return `湿布・皮膚保湿剤などは経過措置で、${TRANSITION_LABEL}までは「特別の料金」はかかりません`;
  }
  return exclusionById(reason)?.reason ?? '「特別の料金」はかかりません';
}

/* ===================================================================
   早見表
   =================================================================== */

/** 早見表に並べる薬剤料の点数 */
export const LOOKUP_POINTS = [50, 100, 200, 300, 500, 1000, 2000] as const;

export interface LookupRow {
  points: number;
  drugCost: number;
  /** 負担割合ごとの before / after / increase */
  cells: { copayPercent: CopayPercent; before: number; after: number; increase: number }[];
}

/**
 * 点数 × 負担割合の早見表。
 * 除外にも経過措置にも当たらず、施行後に処方された場合の額。
 */
export const LOOKUP_TABLE: LookupRow[] = LOOKUP_POINTS.map((points) => {
  const cells = COPAY_OPTIONS.map((option) => {
    const r = calculate({
      points,
      copayPercent: option.value,
      prescribedOn: ENFORCEMENT_FROM,
    })!;
    return {
      copayPercent: option.value,
      before: r.before,
      after: r.after,
      increase: r.increase,
    };
  });
  return { points, drugCost: pointsToYen(points), cells };
});

/* ===================================================================
   表示ヘルパ
   =================================================================== */

/** 円表示（3桁区切り＋「円」） */
export function formatYen(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

/** '2027-03-01' → '2027年3月1日' */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 割合をパーセント表記にする（既定は小数1桁） */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** 'YYYY-MM-DD'（ローカル時刻）。既定値の「今日」に使う */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
