/**
 * 住宅ローン控除（住宅借入金等特別控除）の計算ロジック
 *
 * 仕様: docs/features/jutaku-loan-kojo.md
 *
 * 令和8年度税制改正（所得税法等の一部を改正する法律・令和8年法律第12号）で、
 * 住宅ローン控除の**適用期限が5年延長**され、**令和12年（2030年）12月31日までに
 * 入居した人**まで対象になった。あわせて
 *   [1] 既存住宅（中古）のうち省エネ性能の高いものの借入限度額の引上げ
 *   [2] 子育て世帯・若者夫婦世帯への上乗せ措置の対象の拡充（既存住宅にも及ぶ）
 *   [3] 既存住宅の認定住宅等の控除期間を10年から13年に拡充
 *   [4] 床面積要件の緩和（新築・既存とも40㎡以上）
 * が行われた。
 *
 * ■ このツールの対象は令和8年〜令和12年入居に絞ってある
 * 令和7年以前を入れると限度額テーブルが令和4年改正分まで遡り、確認すべき
 * 組み合わせが跳ね上がる（仕様書「初版の範囲」）。令和7年以前は `MOVE_IN_YEARS`
 * に無く、`calculate()` は `out-of-range` を返す。
 * ただし**改正前後の比較**のためだけに、令和7年入居の限度額を
 * `LIMITS_R7`（表示専用）として持っている。これは下記の一次資料の同じ表の
 * 「令和6年・令和7年」「令和4年から令和7年」の行を写したもので、推測ではない。
 *
 * ■ 「控除額」と「実際に戻る額」は別物
 * 住宅ローン控除は**税額控除**なので、そもそも納めた税金より多くは戻らない。
 * まず所得税から引き、引ききれなかった分だけを住民税から引ける（住民税側には
 * 上限がある）。「年末残高の0.7%がまるまる戻る」と思っている人が多く、
 * ここが誤解の最頻出点なので、`KojoResult` は `annualCredit`（控除額）と
 * `refund`（実際に戻る額）を必ず分けて返す。
 *
 * ■ 住民税側は新規に書かない
 * 住民税からの控除限度額（課税総所得金額等×5%・上限97,500円）と
 * 「所得税→住民税」の適用順は `lib/furusato-nozei.ts` に既にあり、
 * `lib/nenmatsu-chosei.ts` もそこから import している。改正で動く数字を
 * 3ファイルに散らさないため、ここでも import する（仕様書「やらないこと」）。
 * 一次確認の結果、**率も上限額も令和8年度改正で動いていない**ので、
 * `HousingLoanTier` の `rate5`（令和4年1月〜令和12年12月入居）をそのまま使う。
 *
 * ■ 一次情報（2026-09-24 に本文を読んで確認）
 * 出典は国税庁・国土交通省・財務省の一次資料に限る（税理士法人・住宅メーカーの
 * 解説は `Source` に入れない）。借入限度額は、下記タックスアンサーが
 * 「各年の控除額の計算（控除限度額）」として載せている**年あたりの控除限度額**を
 * 控除率0.7%で割り戻したもの（例：31.5万円 ÷ 0.007 ＝ 4,500万円）。
 * - 国税庁 No.1211-1 住宅の新築等をし、令和4年以降に居住の用に供した場合
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm
 * - 国税庁 No.1211-2 買取再販住宅を取得し、令和4年以降に居住の用に供した場合
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-2.htm
 * - 国税庁 No.1211-3 中古住宅を取得し、令和4年以降に居住の用に供した場合
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-3.htm
 * - 国土交通省「住宅ローン減税」
 *   https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000017.html
 * - 財務省「令和8年度税制改正の大綱の概要」
 *   https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_gaiyou.htm
 *
 * 【データ更新箇所】税制改正で限度額・控除期間・控除率・要件が動いたら
 * `LIMITS` / `LIMITS_R7` / `CREDIT_RATE` / `INCOME_LIMIT*` / `FLOOR_AREA*` を直し、
 * `DATA_CHECKED_AT` を進める。**確認して変わらなくても `DATA_CHECKED_AT` は
 * 必ず進める**（「確認済みで変化なし」と「確認していない」を区別するため）。
 */

import {
  applyHousingLoan,
  housingLoanResidentCap,
  type HousingLoanResult,
} from '@/lib/furusato-nozei';

/** データ全体の最終確認日 'YYYY-MM-DD'。ページに「データ最終更新日」として表示する */
export const DATA_CHECKED_AT = '2026-09-24';

/** 一次情報へのリンク */
export interface Source {
  /** 出典の名前。UIには「出典：〇〇」と出す */
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

export const SOURCE_NTA_NEW: Source = {
  label: '国税庁 タックスアンサー No.1211-1 住宅の新築等をし、令和4年以降に居住の用に供した場合',
  url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm',
  checkedAt: DATA_CHECKED_AT,
};

export const SOURCE_NTA_RESALE: Source = {
  label: '国税庁 タックスアンサー No.1211-2 買取再販住宅を取得し、令和4年以降に居住の用に供した場合',
  url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-2.htm',
  checkedAt: DATA_CHECKED_AT,
};

export const SOURCE_NTA_EXISTING: Source = {
  label: '国税庁 タックスアンサー No.1211-3 中古住宅を取得し、令和4年以降に居住の用に供した場合',
  url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-3.htm',
  checkedAt: DATA_CHECKED_AT,
};

export const SOURCE_MLIT: Source = {
  label: '国土交通省「住宅ローン減税」',
  url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000017.html',
  checkedAt: DATA_CHECKED_AT,
};

export const SOURCE_MOF: Source = {
  label: '財務省「令和8年度税制改正の大綱の概要」',
  url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_gaiyou.htm',
  checkedAt: DATA_CHECKED_AT,
};

export const SOURCES: Source[] = [
  SOURCE_NTA_NEW,
  SOURCE_NTA_RESALE,
  SOURCE_NTA_EXISTING,
  SOURCE_MLIT,
  SOURCE_MOF,
];

/* ===================================================================
   制度の数値
   =================================================================== */

/** 控除率。年末残高等にこの率を掛けたものが各年の控除額（令和4年入居分から0.7%） */
export const CREDIT_RATE = 0.007;

/** 合計所得金額の上限（原則）。これを超える年は、その年だけ控除を受けられない */
export const INCOME_LIMIT = 20_000_000;

/** 合計所得金額の上限（床面積40㎡以上50㎡未満の場合） */
export const INCOME_LIMIT_SMALL = 10_000_000;

/** 床面積の下限（原則） */
export const FLOOR_AREA_MIN = 50;

/** 床面積の下限（緩和後。40㎡以上50㎡未満は合計所得金額1,000万円以下が条件） */
export const FLOOR_AREA_MIN_RELAXED = 40;

/** 改正後の入居期限（西暦）。令和12年12月31日まで */
export const MOVE_IN_YEAR_LAST = 2030;

/** このツールが計算する入居年（令和8年〜令和12年）。仕様書「初版の範囲」 */
export const MOVE_IN_YEARS = [2026, 2027, 2028, 2029, 2030] as const;
export type MoveInYear = (typeof MOVE_IN_YEARS)[number];

/** 改正前の比較に使う入居年（令和7年）。**計算の入力には使わない** */
export const COMPARE_YEAR = 2025;

/** 住宅の種類 */
export type HouseKind =
  /** 新築・建築後使用されたことのない住宅の取得 */
  | 'new'
  /** 買取再販住宅（宅建業者が特定増改築等をした既存住宅を2年以内に取得） */
  | 'resale'
  /** 既存住宅（中古。買取再販以外） */
  | 'existing';

export const HOUSE_KINDS: { value: HouseKind; label: string; note: string }[] = [
  { value: 'new', label: '新築', note: '新築した住宅、または建築後だれも住んでいない住宅を買った場合' },
  {
    value: 'resale',
    label: '買取再販',
    note: '宅地建物取引業者がリフォームした中古住宅を、その業者の取得から2年以内に買った場合',
  },
  { value: 'existing', label: '既存（中古）', note: '上記以外の中古住宅。耐震基準に適合するものに限る' },
];

/** 省エネの区分（国税庁のいう「認定住宅等」の内訳と、それ以外） */
export type EcoGrade =
  /** 認定長期優良住宅・認定低炭素住宅 */
  | 'certified'
  /** ZEH水準省エネ住宅 */
  | 'zeh'
  /** 省エネ基準適合住宅 */
  | 'energy'
  /** その他の住宅（認定住宅等に当たらないもの） */
  | 'other';

export const ECO_GRADES: { value: EcoGrade; label: string; note: string }[] = [
  {
    value: 'certified',
    label: '認定長期優良住宅・認定低炭素住宅',
    note: '長期優良住宅の認定、または低炭素建築物の認定を受けた住宅',
  },
  {
    value: 'zeh',
    label: 'ZEH水準省エネ住宅',
    note: '断熱等性能等級5以上かつ一次エネルギー消費量等級6以上',
  },
  {
    value: 'energy',
    label: '省エネ基準適合住宅',
    note: '断熱等性能等級4以上かつ一次エネルギー消費量等級4以上',
  },
  { value: 'other', label: 'その他（省エネ基準を満たさない）', note: '上の3つのいずれにも当たらない住宅' },
];

/** 「認定住宅等」（＝認定住宅・ZEH水準省エネ住宅・省エネ基準適合住宅）か */
export function isCertifiedClass(grade: EcoGrade): boolean {
  return grade !== 'other';
}

/**
 * 借入限度額と控除期間の1行。
 *
 * `limit` は借入限度額（円）、`years` は控除期間（年）。
 * `limitTokurei` は特例対象個人（子育て世帯・若者夫婦世帯）の上乗せ後の借入限度額。
 * 上乗せが無い区分では `limit` と同じ値を入れてある。
 * `years` が 0 の区分は、その年に入居しても控除を受けられない。
 */
export interface LimitRow {
  limit: number;
  limitTokurei: number;
  years: number;
}

const OKU = 10_000; // 「万円」を円に直すための係数（読みやすさのため）
const man = (v: number) => v * OKU;

/**
 * 令和8年〜令和12年入居の借入限度額・控除期間。
 *
 * 出典は住宅の種類ごとに別のタックスアンサー（No.1211-1 / -2 / -3）。
 * 年で中身が変わるのは**新築の省エネ基準適合住宅だけ**（令和10年入居から対象外）
 * なので、年をキーに持つのはその区分に限り、他は年によらず同じ行を返す。
 *
 * 【データ更新箇所】限度額・控除期間が動いたらここ。
 */
const LIMITS: Record<HouseKind, Record<EcoGrade, (year: MoveInYear) => LimitRow>> = {
  // 新築等（国税庁 No.1211-1）
  new: {
    certified: () => ({ limit: man(4500), limitTokurei: man(5000), years: 13 }),
    zeh: () => ({ limit: man(3500), limitTokurei: man(4500), years: 13 }),
    // 令和8年・令和9年は2,000万円（特例対象個人3,000万円）。
    // 令和10年以降の入居は対象外（経過措置は calculate() 側で足す）
    energy: (year) =>
      year <= 2027
        ? { limit: man(2000), limitTokurei: man(3000), years: 13 }
        : { limit: 0, limitTokurei: 0, years: 0 },
    // 令和6年入居以降、新築の「その他の住宅」は対象外（経過措置のみ）
    other: () => ({ limit: 0, limitTokurei: 0, years: 0 }),
  },
  // 買取再販住宅（国税庁 No.1211-2）
  resale: {
    certified: () => ({ limit: man(4500), limitTokurei: man(5000), years: 13 }),
    zeh: () => ({ limit: man(3500), limitTokurei: man(4500), years: 13 }),
    energy: () => ({ limit: man(2000), limitTokurei: man(3000), years: 13 }),
    // 「その他の住宅」に特例対象個人の上乗せは無い
    other: () => ({ limit: man(2000), limitTokurei: man(2000), years: 10 }),
  },
  // 既存住宅（国税庁 No.1211-3）。令和8年度改正で限度額の引上げ・控除期間13年への拡充・
  // 特例対象個人の上乗せが入ったのがこの表
  existing: {
    certified: () => ({ limit: man(3500), limitTokurei: man(4500), years: 13 }),
    zeh: () => ({ limit: man(3500), limitTokurei: man(4500), years: 13 }),
    energy: () => ({ limit: man(2000), limitTokurei: man(3000), years: 13 }),
    other: () => ({ limit: man(2000), limitTokurei: man(2000), years: 10 }),
  },
};

/**
 * 令和7年入居の借入限度額・控除期間（**改正前後の比較にだけ使う表示専用のデータ**）。
 *
 * 出典は `LIMITS` と同じ3本のタックスアンサーの「令和6年・令和7年」
 * （既存住宅は「令和4年から令和7年」）の行。
 * このツールは令和7年以前入居の計算をしないので、`calculate()` からは参照しない。
 */
const LIMITS_R7: Record<HouseKind, Record<EcoGrade, LimitRow>> = {
  new: {
    certified: { limit: man(4500), limitTokurei: man(5000), years: 13 },
    zeh: { limit: man(3500), limitTokurei: man(4500), years: 13 },
    energy: { limit: man(3000), limitTokurei: man(4000), years: 13 },
    other: { limit: 0, limitTokurei: 0, years: 0 },
  },
  resale: {
    certified: { limit: man(4500), limitTokurei: man(5000), years: 13 },
    zeh: { limit: man(3500), limitTokurei: man(4500), years: 13 },
    energy: { limit: man(3000), limitTokurei: man(4000), years: 13 },
    other: { limit: man(2000), limitTokurei: man(2000), years: 10 },
  },
  existing: {
    // 令和7年以前の既存住宅は、認定住宅等なら一律3,000万円・10年。上乗せは無かった
    certified: { limit: man(3000), limitTokurei: man(3000), years: 10 },
    zeh: { limit: man(3000), limitTokurei: man(3000), years: 10 },
    energy: { limit: man(3000), limitTokurei: man(3000), years: 10 },
    other: { limit: man(2000), limitTokurei: man(2000), years: 10 },
  },
};

/**
 * 建築確認の時期による経過措置に当たる場合の行（借入限度額2,000万円・控除期間10年）。
 *
 * - 新築の省エネ基準適合住宅：令和9年12月31日までに建築確認を受けたもの、
 *   または令和10年6月30日までに建築されたもの（No.1211-1 注2）
 * - 新築のその他の住宅：令和5年12月31日までに建築確認を受けたもの、
 *   または令和6年6月30日までに建築されたもの（No.1211-1 注1）
 *
 * **どちらも特例対象個人の上乗せは無い**（原典の注に上乗せの記載が無いため）。
 */
const TRANSITIONAL_ROW: LimitRow = { limit: man(2000), limitTokurei: man(2000), years: 10 };

/** 経過措置が使えるのは新築の省エネ基準適合住宅・その他の住宅だけ */
export function transitionalApplies(kind: HouseKind, grade: EcoGrade): boolean {
  return kind === 'new' && (grade === 'energy' || grade === 'other');
}

/** 経過措置の条件の説明（UIのチェックボックスの文言に使う） */
export function transitionalLabel(grade: EcoGrade): string {
  return grade === 'energy'
    ? '令和9年12月31日までに建築確認を受けた、または令和10年6月30日までに建築された'
    : '令和5年12月31日までに建築確認を受けた、または令和6年6月30日までに建築された';
}

/**
 * 災害レッドゾーンの新築住宅が対象外になる入居年（西暦）。
 * 国土交通省「入居日が令和10年以降の場合、土砂災害等の災害レッドゾーンの新築住宅は
 * 適用対象外（建替え・既存住宅・リフォームは適用対象）」。
 */
export const RED_ZONE_FROM_YEAR = 2028;

/* ===================================================================
   判定と計算
   =================================================================== */

/** 適用を受けられない理由 */
export type IneligibleReason =
  /** 入居年がこのツールの対象外（令和7年以前・令和13年以降） */
  | 'out-of-range'
  /** 合計所得金額が2,000万円を超える */
  | 'income-over'
  /** 床面積40㎡以上50㎡未満で、合計所得金額が1,000万円を超える */
  | 'income-over-small'
  /** 床面積が40㎡未満 */
  | 'floor-area'
  /** その区分・その入居年は控除期間が0年（制度の対象外） */
  | 'no-period'
  /** 令和10年以降入居で、災害レッドゾーンの新築住宅 */
  | 'red-zone';

export const INELIGIBLE_MESSAGE: Record<IneligibleReason, string> = {
  'out-of-range':
    'このツールが計算するのは令和8年（2026年）から令和12年（2030年）までに入居した場合です',
  'income-over': `その年の合計所得金額が${INCOME_LIMIT / 10_000}万円を超える年は、その年だけ控除を受けられません`,
  'income-over-small': `床面積が40㎡以上50㎡未満の住宅は、その年の合計所得金額が${INCOME_LIMIT_SMALL / 10_000}万円以下であることが条件です`,
  'floor-area': '床面積が40㎡未満の住宅は対象外です',
  'no-period': 'その入居年・その省エネ区分の住宅は、住宅ローン控除の対象になりません',
  'red-zone':
    '令和10年以降に入居する新築住宅は、災害レッドゾーン（土砂災害特別警戒区域など）にあると対象外です（特定建替えを除く）',
};

export interface KojoInput {
  /** 入居（予定）年（西暦） */
  year: number;
  kind: HouseKind;
  grade: EcoGrade;
  /** 特例対象個人（子育て世帯・若者夫婦世帯）に当たるか */
  tokurei: boolean;
  /** 床面積（㎡） */
  floorArea: number;
  /** その年の合計所得金額（円） */
  totalIncome: number;
  /** 年末の住宅ローン残高（円） */
  balance: number;
  /** 建築確認の時期による経過措置に当たるか */
  transitional?: boolean;
  /** 災害レッドゾーンにある新築住宅か（特定建替えを除く） */
  redZone?: boolean;
  /** その年の所得税額（源泉徴収税額）。null なら「実際に戻る額」を出さない */
  incomeTax?: number | null;
  /** 所得税の課税総所得金額等。null なら住民税側の限度額を上限額で見積もる */
  taxableIncomeTax?: number | null;
}

export interface KojoResult {
  /** 控除を受けられるか */
  eligible: boolean;
  /** 受けられない理由（`eligible` が false のときだけ中身がある） */
  reasons: IneligibleReason[];
  /** 借入限度額（上乗せ・経過措置を反映したあとの値） */
  limit: number;
  /** 上乗せ前の借入限度額。上乗せが効いていなければ `limit` と同じ */
  limitBase: number;
  /** 特例対象個人の上乗せが効いたか */
  tokureiApplied: boolean;
  /** 特例対象個人だが、40㎡以上50㎡未満のため上乗せが効かなかったか */
  tokureiBlockedBySmallArea: boolean;
  /** 建築確認の時期による経過措置で救われたか */
  transitionalApplied: boolean;
  /** 控除期間（年） */
  years: number;
  /** 借入限度額で頭打ちにしたあとの年末残高等 */
  cappedBalance: number;
  /** 年末残高が借入限度額を超えて頭打ちになったか */
  cappedByLimit: boolean;
  /** 入力した年末残高での、その年の控除額（100円未満切捨て） */
  annualCredit: number;
  /** 残高が借入限度額以上のときの、1年あたりの控除額（＝年間の上限） */
  annualCap: number;
  /** 控除期間を通じた控除額の上限（`annualCap` × `years`） */
  maxTotal: number;
  /** 実際に戻る額の内訳。所得税額が未入力なら null */
  refund: HousingLoanResult | null;
  /** 住民税側の控除限度額 */
  residentCap: number;
  /** 課税総所得金額等が未入力で、住民税側の限度額を上限額と仮定したか */
  residentCapAssumed: boolean;
}

/** 控除額は100円未満を切り捨てる（国税庁「100円未満の端数金額は切り捨てます」） */
export function floorTo100(v: number): number {
  return Math.max(0, Math.floor(v / 100) * 100);
}

/**
 * 住民税側の控除限度額が上限（97,500円）に張り付く課税総所得金額等。
 * 97,500 ÷ 5% ＝ 1,950,000円。課税総所得金額等が未入力のときの説明に使う。
 */
export const RESIDENT_CAP_FULL_AT = 1_950_000;

/** 住民税側の控除限度額の上限（課税総所得金額等が `RESIDENT_CAP_FULL_AT` 以上のとき） */
export const RESIDENT_CAP_MAX = housingLoanResidentCap(RESIDENT_CAP_FULL_AT, 'rate5');

/**
 * その入居年・住宅の種類・省エネ区分の借入限度額と控除期間を返す。
 *
 * `transitional` が true でも、経過措置の無い区分（買取再販・既存、
 * および新築の認定住宅等・ZEH水準）では無視する。
 */
export function limitRow(
  kind: HouseKind,
  grade: EcoGrade,
  year: MoveInYear,
  transitional = false,
): { row: LimitRow; transitionalApplied: boolean } {
  const base = LIMITS[kind][grade](year);
  if (!transitional || !transitionalApplies(kind, grade)) {
    return { row: base, transitionalApplied: false };
  }
  // 経過措置は「対象外（0年）」を救うためのもの。
  // 令和8年・令和9年の省エネ基準適合住宅のように、本則のほうが有利なときは本則を使う
  if (base.years > 0 && base.limit >= TRANSITIONAL_ROW.limit) {
    return { row: base, transitionalApplied: false };
  }
  return { row: TRANSITIONAL_ROW, transitionalApplied: true };
}

/** 令和7年入居（改正前）の借入限度額と控除期間。**比較の表示にだけ使う** */
export function limitRowR7(kind: HouseKind, grade: EcoGrade): LimitRow {
  return LIMITS_R7[kind][grade];
}

/** 入居年がこのツールの計算対象（令和8年〜令和12年）か */
export function isSupportedYear(year: number): year is MoveInYear {
  return (MOVE_IN_YEARS as readonly number[]).includes(year);
}

/**
 * 住宅ローン控除の計算。
 *
 * **「適用できるか」を金額より先に決める。** 所得要件・床面積要件・入居年・
 * 災害レッドゾーンのどれかで外れる人に金額を出すと、このツールが誤解を増やす側に回る。
 * `eligible` が false のときは `annualCredit` も `refund` も 0 / null になる。
 *
 * 入力が数値として読めない（NaN）ときは null を返す。
 */
export function calculate(input: KojoInput): KojoResult | null {
  const {
    year,
    kind,
    grade,
    tokurei,
    floorArea,
    totalIncome,
    balance,
    transitional = false,
    redZone = false,
    incomeTax = null,
    taxableIncomeTax = null,
  } = input;

  if (!Number.isFinite(floorArea) || !Number.isFinite(totalIncome) || !Number.isFinite(balance)) {
    return null;
  }
  if (floorArea < 0 || totalIncome < 0 || balance < 0) return null;

  const residentCapAssumed = taxableIncomeTax === null || !Number.isFinite(taxableIncomeTax);
  const residentCap = residentCapAssumed
    ? RESIDENT_CAP_MAX
    : housingLoanResidentCap(taxableIncomeTax as number, 'rate5');

  const empty = (reasons: IneligibleReason[]): KojoResult => ({
    eligible: false,
    reasons,
    limit: 0,
    limitBase: 0,
    tokureiApplied: false,
    tokureiBlockedBySmallArea: false,
    transitionalApplied: false,
    years: 0,
    cappedBalance: 0,
    cappedByLimit: false,
    annualCredit: 0,
    annualCap: 0,
    maxTotal: 0,
    refund: null,
    residentCap,
    residentCapAssumed,
  });

  if (!isSupportedYear(year)) return empty(['out-of-range']);

  /** 床面積が40㎡以上50㎡未満（小規模居住用家屋）か */
  const small = floorArea >= FLOOR_AREA_MIN_RELAXED && floorArea < FLOOR_AREA_MIN;

  const reasons: IneligibleReason[] = [];
  if (floorArea < FLOOR_AREA_MIN_RELAXED) reasons.push('floor-area');
  if (totalIncome > INCOME_LIMIT) reasons.push('income-over');
  else if (small && totalIncome > INCOME_LIMIT_SMALL) reasons.push('income-over-small');
  if (redZone && kind === 'new' && year >= RED_ZONE_FROM_YEAR) reasons.push('red-zone');

  const { row, transitionalApplied } = limitRow(kind, grade, year, transitional);
  if (row.years === 0) reasons.push('no-period');

  if (reasons.length > 0) return empty(reasons);

  /**
   * 特例対象個人の上乗せ。
   * **令和8年1月1日以降に「特例認定住宅等」（40㎡以上50㎡未満の認定住宅等）に
   * 居住した場合は上乗せを適用できない**（国税庁 No.1211-1 ほかの注記）。
   * 経過措置の行には上乗せが無いので、そちらでも効かない。
   */
  const tokureiBlockedBySmallArea = tokurei && small && isCertifiedClass(grade);
  const tokureiApplied =
    tokurei && !tokureiBlockedBySmallArea && row.limitTokurei > row.limit;

  const limit = tokureiApplied ? row.limitTokurei : row.limit;
  const cappedBalance = Math.min(balance, limit);
  const annualCredit = floorTo100(cappedBalance * CREDIT_RATE);
  const annualCap = floorTo100(limit * CREDIT_RATE);

  const refund =
    incomeTax === null || !Number.isFinite(incomeTax)
      ? null
      : applyHousingLoan({
          credit: annualCredit,
          incomeTax: Math.max(0, incomeTax as number),
          // `applyHousingLoan` は課税総所得金額等から住民税側の限度額を出す。
          // 未入力のときは上限に張り付く額を渡して、上限いっぱいで見積もる
          taxableIncomeTax: residentCapAssumed
            ? RESIDENT_CAP_FULL_AT
            : (taxableIncomeTax as number),
          tier: 'rate5',
        });

  return {
    eligible: true,
    reasons: [],
    limit,
    limitBase: row.limit,
    tokureiApplied,
    tokureiBlockedBySmallArea,
    transitionalApplied,
    years: row.years,
    cappedBalance,
    cappedByLimit: balance > limit,
    annualCredit,
    annualCap,
    maxTotal: annualCap * row.years,
    refund,
    residentCap,
    residentCapAssumed,
  };
}

/* ===================================================================
   早見表
   =================================================================== */

/** 早見表の1行 */
export interface HayamihyoRow {
  kind: HouseKind;
  grade: EcoGrade;
  /** 令和8年・令和9年入居 */
  early: LimitRow;
  /** 令和10年〜令和12年入居 */
  late: LimitRow;
  /** 令和7年入居（改正前） */
  before: LimitRow;
}

/**
 * 入居年 × 住宅区分 × 世帯 の早見表のもと。
 *
 * 3軸を素直に表にするとスマホで横スクロールが出るので、
 * **世帯（一般／子育て世帯・若者夫婦世帯）はUI側の切り替えにして表から外す**
 * （仕様書の出力6）。この関数は両方の額を持った行を返し、
 * どちらを見せるかは呼ぶ側が決める。
 *
 * 入居年も、実際に中身が変わるのは令和9年と令和10年の間だけなので、
 * 「令和8・9年」「令和10〜12年」の2列に畳んである。
 */
export function hayamihyo(): HayamihyoRow[] {
  const kinds: HouseKind[] = ['new', 'resale', 'existing'];
  const grades: EcoGrade[] = ['certified', 'zeh', 'energy', 'other'];
  return kinds.flatMap((kind) =>
    grades.map((grade) => ({
      kind,
      grade,
      early: LIMITS[kind][grade](2026),
      late: LIMITS[kind][grade](2030),
      before: LIMITS_R7[kind][grade],
    })),
  );
}

/** 早見表の1つのマスに出す借入限度額（世帯で切り替える） */
export function cellLimit(row: LimitRow, tokurei: boolean): number {
  return tokurei ? row.limitTokurei : row.limit;
}

/* ===================================================================
   表示用のフォーマッタ
   =================================================================== */

/**
 * 控除率のパーセント表示。
 * `CREDIT_RATE * 100` をそのまま出すと浮動小数の誤差で
 * 「0.7000000000000001%」になるので、必ずこれを通す。
 */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

/** 3桁区切りの円表示 */
export function formatYen(v: number): string {
  return `${Math.round(v).toLocaleString('ja-JP')}円`;
}

/**
 * 万円単位の表示。借入限度額は必ず万円の倍数なので割り切れる。
 * 0 は「対象外」と読ませたいので、呼ぶ側で分岐すること。
 */
export function formatMan(v: number): string {
  return `${(v / 10_000).toLocaleString('ja-JP')}万円`;
}

/** 西暦を「令和◯年（20◯◯年）」にする。令和1年＝2019年 */
export function formatEra(year: number): string {
  return `令和${year - 2018}年（${year}年）`;
}

/** 'YYYY-MM-DD' を「YYYY年M月D日」にする */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 入力欄の文字列を数値にする。全角数字・カンマ・空白を受ける。空なら NaN */
export function parseAmountInput(raw: string): number {
  const normalized = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, '')
    .replace(/[．]/g, '.');
  if (normalized === '') return Number.NaN;
  return Number(normalized);
}

/** 住宅の種類のラベル */
export function houseKindLabel(kind: HouseKind): string {
  return HOUSE_KINDS.find((k) => k.value === kind)?.label ?? '';
}

/** 省エネ区分のラベル */
export function ecoGradeLabel(grade: EcoGrade): string {
  return ECO_GRADES.find((g) => g.value === grade)?.label ?? '';
}
