/**
 * 高額療養費 自己負担限度額 計算ロジック
 *
 * 1か月（同一暦月）の医療費の自己負担には上限（自己負担限度額）があり、
 * 窓口で払った額が上限を超えると、超えた分が高額療養費として払い戻される。
 * その「今月いくらまでか」「いくら戻るか」を出す。
 *
 * ■ 2段階の制度改正
 * | 施行 | 内容 |
 * |---|---|
 * | 令和8年8月1日（診療分から） | 月額上限の引上げ・**年単位の上限額（年間上限）の新設** |
 * | 令和9年8月1日（診療分から） | 70歳未満の所得区分を13区分に細分化し、月額上限を再度見直し |
 *
 * **限度額は「診療を受けた月」で決まる。**2026年7月以前の診療分には旧限度額が
 * 適用されるので、改正後の額だけを出すと7月に受診した人が誤った額を見る。
 * LIMIT_TABLES を施行月つきで持ち、診療月から適用する表を選んでいる。
 * 令和9年8月の第2段階も、確定した数値を LIMIT_TABLES に1つ足すだけで切り替わる
 * （運営者が手で切り替える運用にはしない。lib/nenshu-kabe.ts と同じ考え方）。
 *
 * ■ 年間上限（令和8年8月〜）
 * 月単位の限度額に届かない月が続く長期療養者にも配慮するために新設された。
 * 対象期間は **8月から翌年7月まで**の12か月で、累計の自己負担がその年の
 * 年間上限に達したあとは、それ以上の支払いが不要になる。
 *
 * ■ 多数回該当
 * 直近12か月に高額療養費の支給を3回以上受けていると、4回目からは
 * 限度額が下がる。今回の改正では**多数回該当の金額は据え置き**
 * （70歳以上の住民税非課税区分に新たに設定された分を除く）。
 *
 * ■ 一次情報（2026-08-13 取得）
 * - 厚生労働省「高額療養費制度を利用される皆さまへ」（ページ更新日 2026年7月31日）
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/kougakuiryou/index.html
 * - 同ページの「高額療養費制度の見直しについて（令和8年8月診療分から）」
 *   https://www.mhlw.go.jp/content/001726232.pdf
 *   （「患者負担割合及び高額療養費自己負担限度額（令和８年８月～令和９年７月）」の表、
 *   および「高額療養費制度の見直しについて」の現行／R8.8～／R9.8～ 対照表）
 * - 全国健康保険協会「高額な医療費を支払ったとき（高額療養費）」
 *   https://www.kyoukaikenpo.or.jp/g3/cat310/sb3030/sbb3037/
 *
 * ■ このツールで計算しないもの（意図的に持たない）
 * - 世帯合算（同一世帯・同一月の21,000円以上の自己負担の合算）。入力が人数分に増える
 * - 保険適用外の費用（差額ベッド代・先進医療・入院時の食事療養費）。高額療養費の対象外
 * - 限度額適用認定証・マイナ保険証の手続き（加入している保険者ごとに運用が違う）
 * - 医療費控除（確定申告）との比較。別制度
 * - 令和9年8月からの13区分。数値は上記PDFで確認できるが、施行前のため入れていない
 *
 * 【データ更新箇所】限度額が改定されたら LIMIT_TABLES に施行月つきの表を1つ足す。
 * 既存の表は消さない（過去の診療月の計算に使うため）
 */

/** 年齢区分。70歳を境に限度額の表が変わる */
export type AgeGroup = 'under70' | 'over70';

/** 窓口負担割合（％）。義務教育就学前は2割だが、このツールでは扱わない */
export type CopayPercent = 30 | 20 | 10;

/** 1つの所得区分の限度額 */
export interface LimitDef {
  /** 月単位の限度額の定額部分（円） */
  base: number;
  /**
   * 1%加算の基準額（円）。医療費（10割）がこの額を超えた分の1%が base に加算される。
   * 定額のみの区分では持たない
   */
  onePercentOver?: number;
  /** 多数回該当（4か月目以降）の限度額（円）。適用の無い区分では持たない */
  multi?: number;
  /** 年単位の上限額（円）。令和8年8月より前は制度自体が無いので持たない */
  annual?: number;
  /**
   * 年収約200万円以下（健保：標準報酬月額15万円以下）と確認できた場合の年間上限（円）。
   * 厚労省資料の※5・※6。令和9年8月以降に償還払いで精算される
   */
  annualLowIncome?: number;
  /** 70歳以上の外来（個人ごと）の限度額＝外来特例（円）。70歳未満には無い */
  outpatient?: number;
  /** 外来（個人ごと）の年間上限（円） */
  outpatientAnnual?: number;
}

/** 所得区分の定義 */
export interface BracketDef {
  /** 表をまたいで同じ区分を指すID（改正前後の比較に使う） */
  id: string;
  ageGroup: AgeGroup;
  /** 区分名 例:「区分ウ」「現役並みI」 */
  name: string;
  /** 標準報酬月額・課税所得などの判定基準 */
  standard: string;
  /** 年収の目安。標準報酬月額を即答できる人は少ないので必ず併記する */
  incomeGuide: string;
  /** 既定の窓口負担割合 */
  copayPercent: CopayPercent;
  limit: LimitDef;
}

/** 施行月つきの限度額表 */
export interface LimitTable {
  /** 適用が始まる診療月（'YYYY-MM'）。この月の診療分から */
  effectiveFrom: string;
  /** 画面に出す表示名 */
  label: string;
  brackets: BracketDef[];
}

/**
 * 限度額表。**施行月の新しい順に並べる**（適用表の検索がこの順序に依存する）。
 *
 * 【データ更新箇所】令和9年8月の13区分が確定したら、ここに1つ足す
 */
export const LIMIT_TABLES: readonly LimitTable[] = [
  {
    effectiveFrom: '2026-08',
    label: '令和8年8月〜（改正後）',
    brackets: [
      {
        id: 'u70-a',
        ageGroup: 'under70',
        name: '区分ア',
        standard: '標準報酬月額83万円以上／旧ただし書き所得901万円超',
        incomeGuide: '年収 約1,160万円〜',
        copayPercent: 30,
        limit: { base: 270_300, onePercentOver: 901_000, multi: 140_100, annual: 1_680_000 },
      },
      {
        id: 'u70-b',
        ageGroup: 'under70',
        name: '区分イ',
        standard: '標準報酬月額53万〜79万円／旧ただし書き所得600万〜901万円',
        incomeGuide: '年収 約770万〜約1,160万円',
        copayPercent: 30,
        limit: { base: 179_100, onePercentOver: 597_000, multi: 93_000, annual: 1_110_000 },
      },
      {
        id: 'u70-c',
        ageGroup: 'under70',
        name: '区分ウ',
        standard: '標準報酬月額28万〜50万円／旧ただし書き所得210万〜600万円',
        incomeGuide: '年収 約370万〜約770万円',
        copayPercent: 30,
        limit: { base: 85_800, onePercentOver: 286_000, multi: 44_400, annual: 530_000 },
      },
      {
        id: 'u70-d',
        ageGroup: 'under70',
        name: '区分エ',
        standard: '標準報酬月額26万円以下／旧ただし書き所得210万円以下',
        incomeGuide: '〜年収 約370万円',
        copayPercent: 30,
        limit: { base: 61_500, multi: 44_400, annual: 530_000, annualLowIncome: 410_000 },
      },
      {
        id: 'u70-e',
        ageGroup: 'under70',
        name: '区分オ',
        standard: '住民税非課税',
        incomeGuide: '住民税非課税世帯',
        copayPercent: 30,
        limit: { base: 36_900, multi: 24_600, annual: 290_000 },
      },
      {
        id: 'o70-geneki3',
        ageGroup: 'over70',
        name: '現役並みIII',
        standard: '標準報酬月額83万円以上／課税所得690万円以上',
        incomeGuide: '年収 約1,160万円〜',
        copayPercent: 30,
        limit: { base: 270_300, onePercentOver: 901_000, multi: 140_100, annual: 1_680_000 },
      },
      {
        id: 'o70-geneki2',
        ageGroup: 'over70',
        name: '現役並みII',
        standard: '標準報酬月額53万〜79万円／課税所得380万円以上',
        incomeGuide: '年収 約770万〜約1,160万円',
        copayPercent: 30,
        limit: { base: 179_100, onePercentOver: 597_000, multi: 93_000, annual: 1_110_000 },
      },
      {
        id: 'o70-geneki1',
        ageGroup: 'over70',
        name: '現役並みI',
        standard: '標準報酬月額28万〜50万円／課税所得145万円以上',
        incomeGuide: '年収 約370万〜約770万円',
        copayPercent: 30,
        limit: { base: 85_800, onePercentOver: 286_000, multi: 44_400, annual: 530_000 },
      },
      {
        id: 'o70-ippan',
        ageGroup: 'over70',
        name: '一般',
        standard: '標準報酬月額26万円以下／課税所得145万円未満',
        incomeGuide: '〜年収 約370万円',
        copayPercent: 20,
        limit: {
          base: 61_500,
          multi: 44_400,
          annual: 530_000,
          annualLowIncome: 410_000,
          outpatient: 22_000,
          outpatientAnnual: 216_000,
        },
      },
      {
        id: 'o70-hikazei2',
        ageGroup: 'over70',
        name: '住民税非課税（低所得II）',
        standard: '世帯全員が住民税非課税',
        incomeGuide: '住民税非課税世帯',
        copayPercent: 20,
        limit: {
          base: 25_700,
          multi: 24_600,
          annual: 290_000,
          outpatient: 11_000,
          outpatientAnnual: 96_000,
        },
      },
      {
        id: 'o70-hikazei1',
        ageGroup: 'over70',
        name: '住民税非課税・所得が一定以下（低所得I）',
        standard: '世帯全員が住民税非課税で、年金収入80万円以下など',
        incomeGuide: '住民税非課税世帯（所得が一定以下）',
        copayPercent: 10,
        limit: { base: 15_700, annual: 180_000, outpatient: 8_000 },
      },
    ],
  },
  {
    // 平成30年8月から令和8年7月診療分まで使われていた表
    effectiveFrom: '2018-08',
    label: '〜令和8年7月（改正前）',
    brackets: [
      {
        id: 'u70-a',
        ageGroup: 'under70',
        name: '区分ア',
        standard: '標準報酬月額83万円以上／旧ただし書き所得901万円超',
        incomeGuide: '年収 約1,160万円〜',
        copayPercent: 30,
        limit: { base: 252_600, onePercentOver: 842_000, multi: 140_100 },
      },
      {
        id: 'u70-b',
        ageGroup: 'under70',
        name: '区分イ',
        standard: '標準報酬月額53万〜79万円／旧ただし書き所得600万〜901万円',
        incomeGuide: '年収 約770万〜約1,160万円',
        copayPercent: 30,
        limit: { base: 167_400, onePercentOver: 558_000, multi: 93_000 },
      },
      {
        id: 'u70-c',
        ageGroup: 'under70',
        name: '区分ウ',
        standard: '標準報酬月額28万〜50万円／旧ただし書き所得210万〜600万円',
        incomeGuide: '年収 約370万〜約770万円',
        copayPercent: 30,
        limit: { base: 80_100, onePercentOver: 267_000, multi: 44_400 },
      },
      {
        id: 'u70-d',
        ageGroup: 'under70',
        name: '区分エ',
        standard: '標準報酬月額26万円以下／旧ただし書き所得210万円以下',
        incomeGuide: '〜年収 約370万円',
        copayPercent: 30,
        limit: { base: 57_600, multi: 44_400 },
      },
      {
        id: 'u70-e',
        ageGroup: 'under70',
        name: '区分オ',
        standard: '住民税非課税',
        incomeGuide: '住民税非課税世帯',
        copayPercent: 30,
        limit: { base: 35_400, multi: 24_600 },
      },
      {
        id: 'o70-geneki3',
        ageGroup: 'over70',
        name: '現役並みIII',
        standard: '標準報酬月額83万円以上／課税所得690万円以上',
        incomeGuide: '年収 約1,160万円〜',
        copayPercent: 30,
        limit: { base: 252_600, onePercentOver: 842_000, multi: 140_100 },
      },
      {
        id: 'o70-geneki2',
        ageGroup: 'over70',
        name: '現役並みII',
        standard: '標準報酬月額53万〜79万円／課税所得380万円以上',
        incomeGuide: '年収 約770万〜約1,160万円',
        copayPercent: 30,
        limit: { base: 167_400, onePercentOver: 558_000, multi: 93_000 },
      },
      {
        id: 'o70-geneki1',
        ageGroup: 'over70',
        name: '現役並みI',
        standard: '標準報酬月額28万〜50万円／課税所得145万円以上',
        incomeGuide: '年収 約370万〜約770万円',
        copayPercent: 30,
        limit: { base: 80_100, onePercentOver: 267_000, multi: 44_400 },
      },
      {
        id: 'o70-ippan',
        ageGroup: 'over70',
        name: '一般',
        standard: '標準報酬月額26万円以下／課税所得145万円未満',
        incomeGuide: '〜年収 約370万円',
        copayPercent: 20,
        limit: { base: 57_600, multi: 44_400, outpatient: 18_000, outpatientAnnual: 144_000 },
      },
      {
        id: 'o70-hikazei2',
        ageGroup: 'over70',
        name: '住民税非課税（低所得II）',
        standard: '世帯全員が住民税非課税',
        incomeGuide: '住民税非課税世帯',
        copayPercent: 20,
        limit: { base: 24_600, outpatient: 8_000 },
      },
      {
        id: 'o70-hikazei1',
        ageGroup: 'over70',
        name: '住民税非課税・所得が一定以下（低所得I）',
        standard: '世帯全員が住民税非課税で、年金収入80万円以下など',
        incomeGuide: '住民税非課税世帯（所得が一定以下）',
        copayPercent: 10,
        limit: { base: 15_000, outpatient: 8_000 },
      },
    ],
  },
];

/** 年間上限の対象期間が始まる月（8月から翌年7月まで） */
export const ANNUAL_PERIOD_START_MONTH = 8;

/** 多数回該当になる直近12か月の該当回数（この回数に達していると次回から適用） */
export const MULTI_THRESHOLD_COUNT = 3;

export interface KogakuInput {
  ageGroup: AgeGroup;
  /** 所得区分のID（BracketDef.id） */
  bracketId: string;
  /** 1か月・同一医療機関の医療費（10割・円） */
  medicalCost: number;
  /** 直近12か月に高額療養費の支給を受けた回数。3回以上で今回が多数回該当になる */
  pastCount: number;
  /**
   * 診療月（'YYYY-MM'）。省略時は実行時の当月。
   * 静的書き出しのサイトなので、ビルド時刻で固定すると施行月をまたいでも
   * 古い限度額のままになる。画面を開いた月で評価されるようにしてある
   */
  treatmentMonth?: string;
  /** 70歳以上で、外来のみ（入院なし）か。外来特例（個人ごとの限度額）を使う */
  outpatientOnly?: boolean;
  /** 窓口負担割合（％）。省略時は所得区分の既定値 */
  copayPercent?: CopayPercent;
  /** 年間上限の対象期間のうち、この月より前にすでに支払った自己負担の累計（円） */
  annualPaidBefore?: number;
  /** 年収約200万円以下（標準報酬月額15万円以下）と確認できた場合。年間上限が下がる */
  lowIncomeConfirmed?: boolean;
}

/** 改正前後の比較 */
export interface KogakuComparison {
  /** 比較相手の表の名前 */
  tableLabel: string;
  /** 比較相手が、適用される表より前の制度か後の制度か */
  direction: 'before' | 'after';
  /** 同じ条件での月単位の限度額（円） */
  monthlyLimit: number;
  /** 適用される限度額との差（適用 − 比較相手。プラスなら今のほうが高い） */
  diff: number;
  /** 比較相手の年間上限（円）。制度が無ければ null */
  annualLimit: number | null;
}

export interface KogakuResult {
  /** 適用した限度額表の名前 */
  tableLabel: string;
  /** 適用した限度額表の施行月（'YYYY-MM'） */
  tableEffectiveFrom: string;
  /** 判定に使った診療月（'YYYY-MM'） */
  treatmentMonth: string;
  /** 適用した所得区分 */
  bracket: BracketDef;
  /** 窓口負担割合（％） */
  copayPercent: CopayPercent;
  /** 高額療養費が無かった場合に窓口で払う額（円） */
  copay: number;
  /** 今月の自己負担限度額（円） */
  monthlyLimit: number;
  /** 多数回該当が適用されたか */
  multiApplied: boolean;
  /** 多数回該当（4か月目以降）の限度額（円）。適用の無い区分は null */
  multiLimit: number | null;
  /** 外来特例（個人ごとの限度額）を使ったか */
  outpatientApplied: boolean;
  /** 実際に払う額（円）。月額上限と年間上限の両方を適用したあとの額 */
  payment: number;
  /** 高額療養費として戻る額（円）＝ 窓口負担 − 実際に払う額 */
  refund: number;
  /** 年間上限（円）。制度が無い診療月では null */
  annualLimit: number | null;
  /** 年間上限の対象期間の表示（例:「2026年8月〜2027年7月」） */
  annualPeriodLabel: string;
  /** この月より前の累計自己負担（円） */
  annualPaidBefore: number;
  /** この月を含めた累計自己負担（円） */
  annualPaidTotal: number;
  /** 年間上限までの残り（円）。制度が無ければ null */
  annualRemaining: number | null;
  /** 年間上限に達したことで、この月にさらに軽くなった額（円） */
  annualReduction: number;
  /** 年間上限に達しているか */
  annualCapReached: boolean;
  /** 改正前後の比較。比較相手が無ければ null */
  comparison: KogakuComparison | null;
}

/**
 * Date をローカル時刻の暦月 'YYYY-MM' にする。
 *
 * Date どうしの比較にすると `new Date('2026-08')` がUTCの深夜として解釈され、
 * 日本時間では7月31日中に切り替わってしまう。施行日は日本の暦で決まるので、
 * 閲覧者のローカル暦月の文字列で比較する（lib/nenshu-kabe.ts の toYmd と同じ考え方）。
 */
export function toYm(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 診療月に適用される限度額表。どの表よりも古い月は最も古い表を返す */
export function tableFor(month: string): LimitTable {
  return (
    LIMIT_TABLES.find((t) => month >= t.effectiveFrom) ?? LIMIT_TABLES[LIMIT_TABLES.length - 1]
  );
}

/** 診療月に適用される、その年齢区分の所得区分一覧 */
export function bracketsFor(ageGroup: AgeGroup, month: string): BracketDef[] {
  return tableFor(month).brackets.filter((b) => b.ageGroup === ageGroup);
}

/**
 * 年間上限の対象期間（8月〜翌年7月）。
 * 7月以前の診療月は前年8月始まりの期間に属する
 */
export function annualPeriodOf(month: string): { from: string; to: string; label: string } {
  const [year, m] = month.split('-').map(Number);
  const startYear = m >= ANNUAL_PERIOD_START_MONTH ? year : year - 1;
  return {
    from: `${startYear}-08`,
    to: `${startYear + 1}-07`,
    label: `${startYear}年8月〜${startYear + 1}年7月`,
  };
}

/** 1%加算を含む月単位の限度額。円未満は切り捨て */
function monthlyLimitOf(limit: LimitDef, medicalCost: number): number {
  if (limit.onePercentOver === undefined || medicalCost <= limit.onePercentOver) return limit.base;
  // ×1% は /100。0.01 を掛けると浮動小数の誤差で1円ずれることがある
  return limit.base + Math.floor((medicalCost - limit.onePercentOver) / 100);
}

/** 区分・診療内容から、その月に実際に使われる限度額を決める */
function appliedLimit(
  limit: LimitDef,
  medicalCost: number,
  multiApplied: boolean,
  outpatientApplied: boolean,
): number {
  // 外来特例（個人ごと）は多数回該当より前に効く。多数回該当は世帯単位の限度額の仕組み
  if (outpatientApplied && limit.outpatient !== undefined) return limit.outpatient;
  if (multiApplied && limit.multi !== undefined) return limit.multi;
  return monthlyLimitOf(limit, medicalCost);
}

/** 年間上限。lowIncomeConfirmed のときは※5・※6の軽減後の額を使う */
function annualLimitOf(limit: LimitDef, lowIncomeConfirmed: boolean): number | null {
  if (lowIncomeConfirmed && limit.annualLowIncome !== undefined) return limit.annualLowIncome;
  return limit.annual ?? null;
}

/**
 * 高額療養費の自己負担限度額と払い戻し額を計算する。
 *
 * 限度額は診療月で決まる。同じ入力でも診療月が2026年7月か8月かで額が変わる。
 *
 * @throws 所得区分のIDが診療月の表に無い場合（UIの選択肢と表の食い違いをビルド後に黙らせないため）
 */
export function calcKogakuRyoyohi(input: KogakuInput): KogakuResult {
  const treatmentMonth = input.treatmentMonth ?? toYm(new Date());
  const table = tableFor(treatmentMonth);
  const bracket = table.brackets.find(
    (b) => b.id === input.bracketId && b.ageGroup === input.ageGroup,
  );
  if (!bracket) {
    throw new Error(
      `所得区分が見つかりません: ${input.bracketId}（${input.ageGroup} / ${treatmentMonth}）`,
    );
  }

  const medicalCost = Math.max(0, Math.floor(input.medicalCost || 0));
  const pastCount = Math.max(0, Math.floor(input.pastCount || 0));
  const copayPercent = input.copayPercent ?? bracket.copayPercent;
  const annualPaidBefore = Math.max(0, Math.floor(input.annualPaidBefore || 0));

  const multiApplied = pastCount >= MULTI_THRESHOLD_COUNT && bracket.limit.multi !== undefined;
  const outpatientApplied = Boolean(input.outpatientOnly) && bracket.limit.outpatient !== undefined;

  const copay = Math.floor((medicalCost * copayPercent) / 100);
  const monthlyLimit = appliedLimit(bracket.limit, medicalCost, multiApplied, outpatientApplied);

  // 窓口負担が限度額に届かない月は高額療養費が発生しない（限度額まで払うわけではない）
  const afterMonthly = Math.min(copay, monthlyLimit);

  const annualLimit = outpatientApplied
    ? (bracket.limit.outpatientAnnual ?? null)
    : annualLimitOf(bracket.limit, Boolean(input.lowIncomeConfirmed));
  const annualRoom = annualLimit === null ? null : Math.max(0, annualLimit - annualPaidBefore);
  const annualReduction = annualRoom === null ? 0 : Math.max(0, afterMonthly - annualRoom);

  const payment = afterMonthly - annualReduction;
  const annualPaidTotal = annualPaidBefore + payment;

  return {
    tableLabel: table.label,
    tableEffectiveFrom: table.effectiveFrom,
    treatmentMonth,
    bracket,
    copayPercent,
    copay,
    monthlyLimit,
    multiApplied,
    multiLimit: bracket.limit.multi ?? null,
    outpatientApplied,
    payment,
    refund: copay - payment,
    annualLimit,
    annualPeriodLabel: annualPeriodOf(treatmentMonth).label,
    annualPaidBefore,
    annualPaidTotal,
    annualRemaining: annualLimit === null ? null : Math.max(0, annualLimit - annualPaidTotal),
    annualReduction,
    annualCapReached: annualLimit !== null && annualPaidTotal >= annualLimit,
    comparison: comparisonFor(table, bracket, medicalCost, multiApplied, outpatientApplied, input),
  };
}

/**
 * 改正前後の比較。適用される表の1つ前（無ければ1つ後）の表で同じ区分を引く。
 *
 * 改正前の月に受診した人には「8月からこう変わる」を、改正後の月に受診した人には
 * 「7月まではこうだった」を並べる。片方の額だけを出さないための仕組み。
 */
function comparisonFor(
  table: LimitTable,
  bracket: BracketDef,
  medicalCost: number,
  multiApplied: boolean,
  outpatientApplied: boolean,
  input: KogakuInput,
): KogakuComparison | null {
  const index = LIMIT_TABLES.indexOf(table);
  // LIMIT_TABLES は新しい順。index + 1 が1つ前の制度、index - 1 が1つ後の制度
  const older = LIMIT_TABLES[index + 1];
  const newer = index > 0 ? LIMIT_TABLES[index - 1] : undefined;
  const target = older ?? newer;
  if (!target) return null;

  const other = target.brackets.find((b) => b.id === bracket.id);
  if (!other) return null;

  const applied = appliedLimit(bracket.limit, medicalCost, multiApplied, outpatientApplied);
  const otherLimit = appliedLimit(other.limit, medicalCost, multiApplied, outpatientApplied);

  return {
    tableLabel: target.label,
    direction: older ? 'before' : 'after',
    monthlyLimit: otherLimit,
    diff: applied - otherLimit,
    annualLimit: outpatientApplied
      ? (other.limit.outpatientAnnual ?? null)
      : annualLimitOf(other.limit, Boolean(input.lowIncomeConfirmed)),
  };
}
