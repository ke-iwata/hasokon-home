/**
 * 年収の壁 判定ロジック（2026年版）
 *
 * 令和8年度税制改正（所得税法等の一部を改正する法律・令和8年法律第12号。
 * 2026年3月31日成立公布、令和8年分以後の所得税に適用）および
 * 年金制度改正法（2025年成立）にもとづく。
 *
 * 令和8年分の基礎控除は本則62万円 + 特例加算42万円 = 104万円、
 * 給与所得控除の最低保障額は74万円。各壁はこの2つの組み合わせで決まる。
 *
 * - 所得税の壁: 178万円（給与所得控除74万円 + 基礎控除104万円）
 * - 住民税の壁: 119万円（給与所得控除74万円 + 非課税限度額45万円）。
 *   2026年の収入＝2027年度の住民税から。住民税の基礎控除43万円は
 *   課税所得の計算に使うもので、非課税ラインの算定には使わない
 * - 社会保険 106万円の壁: 51人以上・週20時間以上。賃金要件は2026年10月1日に撤廃され、
 *   以降は「金額の壁」ではなくなる（WALL_DEFS の effectiveUntil で自動的に消える）
 * - 社会保険 130万円の壁: 扶養認定基準（19〜22歳の学生は150万円）。
 *   2026年4月から残業代を含まず基本給ベースで判定
 * - 配偶者控除136万円（=74+62） / 配偶者特別控除169万円（=74+95）で減額開始・207万円（=74+133）で消失
 * - 特定親族特別控除（19〜22歳）: 159万円（=74+85）まで満額63万円・197万円（=74+123）で消失
 * - 勤労学生控除: 163万円（=74+89）
 *
 * 【データ更新箇所】税制改正があったら WALL_DEFS の金額・説明を更新する。
 * 施行日つきの改正は effectiveFrom / effectiveUntil に暦日を入れれば、
 * その日を境に自動で切り替わる（運営者が手で切り替える運用にはしない）
 */

/** 立場 */
export type Position =
  | 'spouse' // 配偶者の扶養内で働く（パート等）
  | 'student' // 親の扶養内・19〜22歳の学生
  | 'dependent' // 親の扶養内・その他
  | 'none'; // 扶養に入っていない

export interface KabeInput {
  /** 年収（額面・円） */
  income: number;
  position: Position;
  /** 勤務先の従業員数が51人以上 */
  size51: boolean;
  /** 週の所定労働時間が20時間以上 */
  hours20: boolean;
  /**
   * 判定の基準日。省略時は実行時の現在日。
   * 静的書き出しのサイトなので、ビルド時刻で固定すると施行日をまたいでも
   * 古い判定のままになる。画面を開いた日で評価されるようにしてある。
   */
  asOf?: Date;
}

export interface KabeResult {
  /** 壁の金額（円） */
  amount: number;
  /** 壁の名前 例: 「119万円の壁」 */
  label: string;
  category: '税金' | '社会保険';
  /** 超えたら何が起きるか */
  effect: string;
  /** 補足 */
  note?: string;
  /** 現在の年収で超えているか */
  over: boolean;
  /** 壁までの残り（超過している場合は超過額・円） */
  diff: number;
  /** 影響の大きさ（UI強調用）: high=手取りが大きく減る */
  impact: 'high' | 'mid' | 'low';
}

interface WallDef {
  amount: number;
  label: string;
  category: '税金' | '社会保険';
  effect: string;
  note?: string;
  impact: 'high' | 'mid' | 'low';
  /**
   * 金額ちょうどをこの壁の「超えた側」に含めるか。
   * 社会保険の扶養条件は「130万円未満」なので、ちょうど130万円は扶養から外れる（true）。
   * 税金の壁は超えた分にだけ課税されるため、ちょうどの年収は課税されない（false）。
   */
  inclusive: boolean;
  /** この壁が存在し始める暦日 'YYYY-MM-DD'（この日を含む）。省略は「ずっと前から」 */
  effectiveFrom?: string;
  /** この壁が無くなる暦日 'YYYY-MM-DD'（この日を含まない）。省略は「ずっと」 */
  effectiveUntil?: string;
  /** この壁が該当するか */
  applies: (input: KabeInput) => boolean;
}

const M = 10_000;

/**
 * 短時間労働者の社会保険加入における賃金要件（月額8.8万円＝年収106万円相当）が
 * 撤廃される日。年金制度改正法（2025年6月成立）による。
 * この日以降は「週20時間以上 かつ 従業員51人以上」だけで加入が決まり、金額の壁は無くなる。
 */
export const WAGE_REQUIREMENT_ABOLISHED_ON = '2026-10-01';

export const WALL_DEFS: WallDef[] = [
  {
    amount: 106 * M,
    label: '106万円の壁',
    category: '社会保険',
    effect:
      '勤務先の社会保険（厚生年金・健康保険）に加入し、保険料の天引きが始まります（目安: 年収106万円で年約16万円）。将来の年金は増えます。',
    note: '従業員51人以上かつ週20時間以上勤務の場合。賃金要件（月8.8万円）は2026年10月1日に撤廃され、以降は週20時間以上なら年収に関係なく加入対象になります（この壁は施行日に自動で表示されなくなります）。',
    impact: 'high',
    inclusive: true,
    // 賃金要件の撤廃で「106万円」という金額の壁は消える。加入するかどうかの判定は
    // evaluateShaho() が引き継ぐ
    effectiveUntil: WAGE_REQUIREMENT_ABOLISHED_ON,
    applies: (i) => i.position !== 'none' && i.size51 && i.hours20,
  },
  {
    amount: 119 * M,
    label: '119万円の壁',
    category: '税金',
    effect: '住民税（所得割）がかかり始めます。超えた分に対して約10%なので、少し超えても影響は小さめです。',
    note: '給与所得控除74万円 + 住民税の非課税限度額45万円。2026年の収入（2027年度の住民税）から。非課税限度額は自治体により若干異なる場合があります。',
    impact: 'low',
    inclusive: false,
    applies: () => true,
  },
  {
    amount: 130 * M,
    label: '130万円の壁',
    category: '社会保険',
    effect:
      '家族の社会保険の扶養から外れ、自分で国民年金・国民健康保険（または勤務先の社保）に加入する必要があります。手取りが大きく減るため最重要の壁です。',
    note: '扶養の条件は「130万円未満」のため、ちょうど130万円でも扶養から外れます。2026年4月から、残業代を含まない契約上の収入（基本給ベース）で判定されるようになりました。',
    impact: 'high',
    inclusive: true,
    // すでに勤務先の社保に加入する人は、そもそも家族の扶養に入っていないので
    // この壁には到達しない（2026年10月以降、51人以上・週20時間以上の人が該当）
    applies: (i) =>
      (i.position === 'spouse' || i.position === 'dependent') && evaluateShaho(i).kind !== 'enrolled',
  },
  {
    amount: 150 * M,
    label: '150万円の壁（学生）',
    category: '社会保険',
    effect:
      '家族の社会保険の扶養から外れ、自分で国民年金・国民健康保険に加入する必要があります。手取りが大きく減ります。',
    note: '19〜22歳の学生は一般の130万円より基準が緩和されています。条件は「150万円未満」のため、ちょうど150万円でも扶養から外れます。',
    impact: 'high',
    inclusive: true,
    // 130万円の壁と同じ理由で、勤務先の社保に加入する人には到達しない
    applies: (i) => i.position === 'student' && evaluateShaho(i).kind !== 'enrolled',
  },
  {
    amount: 136 * M,
    label: '136万円の壁（配偶者）',
    category: '税金',
    effect:
      '配偶者控除の対象から外れますが、同額の配偶者特別控除に自動移行するため、世帯の税負担はほぼ変わりません。',
    impact: 'low',
    inclusive: false,
    applies: (i) => i.position === 'spouse',
  },
  {
    amount: 136 * M,
    label: '136万円の壁（扶養）',
    category: '税金',
    effect: '親（扶養者）の扶養控除の対象から外れ、親の税負担が年8万〜30万円ほど増えます。',
    impact: 'mid',
    inclusive: false,
    applies: (i) => i.position === 'dependent',
  },
  {
    amount: 159 * M,
    label: '159万円の壁（学生）',
    category: '税金',
    effect:
      '親が受けられる特定親族特別控除（最大63万円）が満額でなくなり、段階的に減り始めます（197万円で消失）。',
    note: '19〜22歳が対象。令和7年分の「150万円」から引き上げられました。控除が完全になくなるのは197万円（配偶者特別控除の207万円とは異なります）。',
    impact: 'mid',
    inclusive: false,
    applies: (i) => i.position === 'student',
  },
  {
    amount: 163 * M,
    label: '163万円の壁（学生）',
    category: '税金',
    effect: '勤労学生控除が使えなくなり、本人の所得税・住民税が増えます。',
    note: '給与所得控除74万円 + 合計所得金額の要件89万円。',
    impact: 'low',
    inclusive: false,
    applies: (i) => i.position === 'student',
  },
  {
    amount: 169 * M,
    label: '169万円の壁（配偶者）',
    category: '税金',
    effect:
      '配偶者特別控除（38万円）が段階的に減り始めます。世帯の手取りが緩やかに減り、207万円超で控除がなくなります。',
    impact: 'mid',
    inclusive: false,
    applies: (i) => i.position === 'spouse',
  },
  {
    amount: 197 * M,
    label: '197万円の壁（学生）',
    category: '税金',
    effect: '親が受けられる特定親族特別控除が完全になくなります。',
    impact: 'low',
    inclusive: false,
    applies: (i) => i.position === 'student',
  },
  {
    amount: 178 * M,
    label: '178万円の壁',
    category: '税金',
    effect:
      '所得税がかかり始めます。超えた分に対する課税なので、少し超えても影響はごくわずかです（年収179万円で年約500円）。',
    note: '給与所得控除74万円 + 基礎控除104万円（本則62万円 + 特例加算42万円。令和8年度税制改正後）。',
    impact: 'low',
    inclusive: false,
    applies: () => true,
  },
  {
    amount: 207 * M,
    label: '207万円の壁（配偶者）',
    category: '税金',
    effect: '配偶者特別控除が完全になくなります。',
    impact: 'low',
    inclusive: false,
    applies: (i) => i.position === 'spouse',
  },
];

/**
 * Date をローカル時刻の暦日 'YYYY-MM-DD' にする。
 *
 * 期間の判定を Date どうしの比較でやると、`new Date('2026-10-01')` がUTCの
 * 深夜として解釈され、日本時間では9月30日中に切り替わってしまう。
 * 施行日は「日本の暦日」で決まるので、閲覧者のローカル暦日の文字列で比較する。
 */
function toYmd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 基準日にその壁が存在するか（effectiveUntil はその日を含まない） */
function isEffective(def: WallDef, asOf: Date): boolean {
  const ymd = toYmd(asOf);
  if (def.effectiveFrom && ymd < def.effectiveFrom) return false;
  if (def.effectiveUntil && ymd >= def.effectiveUntil) return false;
  return true;
}

/**
 * 勤務先の社会保険（厚生年金・健康保険）に加入するかどうかの見込み。
 *
 * - enrolled: 年収に関係なく加入する（2026年10月1日〜。金額の壁が消えた状態）
 * - wage-gate: 賃金要件が残っており、threshold（円）を境に加入する（〜2026年9月30日）
 * - not-applicable: 加入要件（従業員51人以上・週20時間以上）を満たさない等
 */
export type ShahoStatus =
  | { kind: 'enrolled'; reason: string }
  | { kind: 'wage-gate'; threshold: number }
  | { kind: 'not-applicable'; reason: string };

export function evaluateShaho(input: KabeInput): ShahoStatus {
  if (input.position === 'none') {
    return {
      kind: 'not-applicable',
      reason: '扶養に入っていない方は、この判定（扶養から抜けるかどうか）の対象外です。',
    };
  }
  if (!(input.size51 && input.hours20)) {
    return {
      kind: 'not-applicable',
      reason:
        '勤務先の社会保険に加入するのは「従業員51人以上」かつ「週20時間以上」の両方を満たす場合です。',
    };
  }
  const asOf = input.asOf ?? new Date();
  if (toYmd(asOf) < WAGE_REQUIREMENT_ABOLISHED_ON) {
    return { kind: 'wage-gate', threshold: 106 * M };
  }
  return { kind: 'enrolled', reason: '週20時間以上・従業員51人以上のため、年収に関係なく加入' };
}

/**
 * 年収と立場から、該当する壁の一覧と判定結果を返す（金額昇順）
 *
 * 壁ちょうどの年収の扱いは壁ごとに異なる（WallDef.inclusive 参照）。
 * 社会保険の壁は「未満」が扶養条件のため、ちょうどの年収で既に超えた側になる。
 *
 * 施行日で消える壁は input.asOf（既定は現在日）で自動的に除かれる。
 */
export function evaluateKabe(input: KabeInput): KabeResult[] {
  const income = Math.max(0, input.income);
  const asOf = input.asOf ?? new Date();
  return WALL_DEFS.filter((w) => isEffective(w, asOf) && w.applies({ ...input, asOf }))
    .map((w) => ({
      amount: w.amount,
      label: w.label,
      category: w.category,
      effect: w.effect,
      note: w.note,
      impact: w.impact,
      over: w.inclusive ? income >= w.amount : income > w.amount,
      diff: Math.abs(w.amount - income),
    }))
    .sort((a, b) => a.amount - b.amount);
}

/** 次に到達する壁（未到達のうち最も近いもの） */
export function nextWall(results: KabeResult[]): KabeResult | undefined {
  return results.filter((r) => !r.over).sort((a, b) => a.diff - b.diff)[0];
}
