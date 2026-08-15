/**
 * 防災備蓄 計算ロジック（家族構成から必要量を出す）
 *
 * 仕様: docs/features/bosai-bichiku-keisan.md
 *
 * ■ このツールが答えること
 * 「うちは何人だから、水は何リットル、カセットボンベは何本いるのか」だけ。
 * 家族の人数と備蓄日数を入れたら即答する軽さを差別化点にしているので、
 * 質問を多段にしない（東京備蓄ナビは良質だが設問が長い）。
 *
 * ■ 数値の性格が2種類ある。混ぜないこと
 * ここで持っている係数には**一次資料に明記された値**と、
 * **一次資料の考え方から当サイトが置いた目安**の2種類がある。
 * 表示のときに出典を出し分けられるよう、`StockItem.basis` で区別している。
 *
 *   'official' … 官公庁の資料に数値そのものが書かれているもの
 *   'derived'  … 体格・月齢・体重で変わるため、当サイトが代表値を置いたもの
 *
 * `derived` を `official` と同じ顔で見せると、「国が10枚と言っている」のような
 * 誤解が生まれる。画面では必ず根拠の一文を添えて出すこと。
 *
 * ■ 一次情報（2026-08-15 取得）
 * - 農林水産省「災害時に備えた食品ストックガイド」
 *   https://www.maff.go.jp/j/zyukyu/foodstock/guidebook.html
 *   - (1) 備蓄の必要性: 「最低3日分～1週間分×人数分の食品の家庭備蓄が望ましい」
 *     https://www.maff.go.jp/j/zyukyu/foodstock/chapter01.html
 *   - (7) 熱源を確保しよう: 「1人／1週間当たり、カセットボンベ約6本の備蓄が必要となります」
 *     https://www.maff.go.jp/j/zyukyu/foodstock/chapter07.html
 * - 農林水産省 aff 2016年9月号「特集1 非常食(2)」
 *   https://www.maff.go.jp/j/pr/aff/1609/spe1_02.html
 *   - 「1人当たり1日1リットルの水が必要です。調理などに使用する水を含めると、
 *     3リットル程度あれば安心です」
 *   - 「2キログラムの米が1袋と、水と熱源があれば、（1食=0.5合=75グラムとした場合）
 *     約27食分になります」
 * - 東京都「東京備蓄ナビ」（東京都防災ホームページ）
 *   https://www.bousai.metro.tokyo.lg.jp/kyojyo/1001855/1013810.html
 *   - 3人（大人2人＋幼児1人）1週間分の提示例に「簡易トイレ105回分」があり、
 *     105 ÷ 3人 ÷ 7日 = 1人1日5回。トイレの回数の目安として採用した
 *
 * 【データ更新箇所】係数を直すのは `STOCK_ITEMS` の `perPersonPerDay` /
 * `perPetPerDay` / `perHousehold` だけ。出典が変わったら `source` も一緒に直す。
 * 備蓄日数の選択肢は `STOCK_DAYS_OPTIONS`。
 *
 * ■ やらないこと（仕様書の「やらないこと」より）
 * - 防災用品の商品リンク・アフィリエイト
 * - 避難所・ハザードマップなど位置情報を伴うもの
 * - 医薬品や持病者向けの個別の助言（常備薬は「かかりつけ医に相談」とだけ書く）
 */

/**
 * 数える人の区分。
 * 乳幼児を子どもから分けているのは、主食を食べずミルクとおむつが要るため
 * （同じ「子ども」に混ぜると必要量が両方とも狂う）。
 */
export type PersonType = 'adult' | 'senior' | 'child' | 'infant';

/** ペットの区分。1日あたりの食事量と飲水量が大きく違うので犬と猫を分ける */
export type PetType = 'dog' | 'cat';

/** 品目の分類。画面ではこの単位でまとめて見せる */
export type StockCategory = 'water' | 'food' | 'heat' | 'toilet' | 'baby' | 'care' | 'pet';

/**
 * 係数の根拠の種類。
 * 'official' は一次資料に数値が書かれているもの、
 * 'derived' は資料の考え方から当サイトが代表値を置いたもの。
 */
export type StockBasis = 'official' | 'derived';

/** 人数・日数の上限。桁を打ち間違えたときに現実離れした結果を出さないための歯止め */
export const MAX_PEOPLE_PER_TYPE = 20;
export const MAX_PETS_PER_TYPE = 20;
export const MAX_DAYS = 30;

/**
 * 備蓄日数の選択肢。
 * 農水省ガイドの「最低3日分～1週間分」に合わせて3日と7日の2択にしている。
 * 7日が大規模災害向けの推奨であることは画面側で注記する。
 */
export const STOCK_DAYS_OPTIONS = [3, 7] as const;

/** 既定の備蓄日数。まず3日を満たしてから7日へ、という順に案内したいので3日 */
export const DEFAULT_DAYS = 3;

/** 米1食分のグラム数（0.5合）。主食の食数を「米なら何kg」に読み替えるのに使う */
export const RICE_GRAMS_PER_MEAL = 75;

/** 市販の飲料水ボトルの容量（L）。必要リットル数を買い物の本数に直すのに使う */
export const WATER_BOTTLE_LITERS = 2;

/** 飲料水の箱売りの本数（2Lボトル）。「何箱買えばよいか」を出すのに使う */
export const WATER_BOTTLES_PER_CASE = 6;

/** 端数の丸め方。個数は切り上げ、リットルは0.1刻みで切り上げる */
type Rounding = 'ceil' | 'tenth';

export interface StockItem {
  id: string;
  /** 品目名（画面・印刷用チェックリストにそのまま出す） */
  name: string;
  /** 数量の単位（「L」「食」「本」など） */
  unit: string;
  category: StockCategory;
  /** 1人1日あたりの必要量。区分が無ければその人は必要としない品目 */
  perPersonPerDay?: Partial<Record<PersonType, number>>;
  /** ペット1匹1日あたりの必要量 */
  perPetPerDay?: Partial<Record<PetType, number>>;
  /** 日数にも人数にも比例しない、世帯にいくつあればよいもの（カセットコンロなど） */
  perHousehold?: number;
  /** 人数に比例するが日数には比例しないもの（常備薬・お薬手帳など） */
  perPersonFixed?: Partial<Record<PersonType, number>>;
  rounding: Rounding;
  basis: StockBasis;
  /** 数値の根拠。画面に必ず添えて出す（derived を official に見せないため） */
  source: string;
  /** 買い方・使い方の補足 */
  note?: string;
}

/**
 * 品目と係数の一覧。
 *
 * 【データ更新箇所】ここだけを直せば計算・画面・印刷リストのすべてに反映される。
 *
 * 子ども・乳幼児の係数（basis: 'derived'）は、一次資料が「1人あたり」としか
 * 書いていないため当サイトが置いた代表値。大人を1として、子どもは体格に応じて
 * 概ね2/3、乳幼児は主食をミルク・離乳食に置き換える、という考え方で組んでいる。
 */
export const STOCK_ITEMS: StockItem[] = [
  {
    id: 'water',
    name: '飲料水・調理用水',
    unit: 'L',
    category: 'water',
    // 大人・高齢者は農水省の「飲料1L＋調理を含めて3L程度」をそのまま使う
    perPersonPerDay: { adult: 3, senior: 3, child: 2, infant: 1.5 },
    rounding: 'tenth',
    basis: 'official',
    source:
      '農林水産省 aff 2016年9月号「特集1 非常食(2)」の「1人当たり1日1リットル…調理などに使用する水を含めると、3リットル程度あれば安心です」による（子ども・乳幼児の量は体格に応じた当サイトの目安）。',
    note: '半分は調理用。カセットコンロが無く加熱しない前提なら、飲料分の1人1日1Lまで減らせます。',
  },
  {
    id: 'staple',
    name: '主食（レトルトご飯・アルファ米・乾麺・パンなど）',
    unit: '食',
    category: 'food',
    // 1日3食。乳幼児はミルク・離乳食で数えるのでここでは0にしている
    perPersonPerDay: { adult: 3, senior: 3, child: 3 },
    rounding: 'ceil',
    basis: 'official',
    source:
      '農林水産省「災害時に備えた食品ストックガイド」の「最低3日分～1週間分×人数分」と、1日3食から算出。',
    note: '米で用意するなら1食75g（0.5合）。2kgの米袋1つで約27食分です。',
  },
  {
    id: 'main-dish',
    name: '主菜（肉・魚の缶詰、レトルト食品など）',
    unit: '食',
    category: 'food',
    // 1日3食のうち2食にたんぱく質のおかずを付ける想定
    perPersonPerDay: { adult: 2, senior: 2, child: 2 },
    rounding: 'ceil',
    basis: 'derived',
    source:
      '一次資料に食数の定めは無い。1日3食のうち2食にたんぱく質のおかずを付ける前提で置いた当サイトの目安。',
    note: '高齢者がいる世帯は、やわらかいものやおかゆタイプを混ぜておくと食べやすくなります。',
  },
  {
    id: 'gas-cartridge',
    name: 'カセットボンベ',
    unit: '本',
    category: 'heat',
    // 「1人／1週間当たり約6本」＝ 1人1日 6/7 本。乳幼児もミルクの調乳で湯を使う
    perPersonPerDay: { adult: 6 / 7, senior: 6 / 7, child: 6 / 7, infant: 6 / 7 },
    rounding: 'ceil',
    basis: 'official',
    source:
      '農林水産省「災害時に備えた食品ストックガイド（7）熱源を確保しよう」の「1人／1週間当たり、カセットボンベ約6本」による。',
    note: 'ボンベの使用期限は約7年、カセットコンロ本体は約10年が目安です。',
  },
  {
    id: 'gas-stove',
    name: 'カセットコンロ（本体）',
    unit: '台',
    category: 'heat',
    perHousehold: 1,
    rounding: 'ceil',
    basis: 'official',
    source:
      '農林水産省「災害時に備えた食品ストックガイド（7）熱源を確保しよう」。ボンベだけでは湯を沸かせないため本体も1台数える。',
  },
  {
    id: 'toilet',
    name: '簡易トイレ・携帯トイレ',
    unit: '回分',
    category: 'toilet',
    // 東京備蓄ナビの提示例（3人7日で105回分）から1人1日5回
    perPersonPerDay: { adult: 5, senior: 5, child: 5 },
    rounding: 'ceil',
    basis: 'official',
    source:
      '東京都「東京備蓄ナビ」の提示例（大人2人＋幼児1人・1週間で簡易トイレ105回分）から、1人1日5回として算出。',
    note: '断水中は水洗トイレを流せません。体調や不安で回数が増えることがあるので、多めに見ておくと安心です。',
  },
  {
    id: 'baby-milk',
    name: '乳児用ミルク（液体ミルク125ml換算）',
    unit: '本',
    category: 'baby',
    perPersonPerDay: { infant: 5 },
    rounding: 'ceil',
    basis: 'derived',
    source:
      '必要量は月齢と授乳量で大きく変わる。1日5回・1回125mlを代表値として置いた当サイトの目安。',
    note: '実際の1日の授乳量に置き換えてください。粉ミルクにする場合は調乳用の湯（上の飲料水とは別枠）が要ります。',
  },
  {
    id: 'baby-diaper',
    name: '紙おむつ',
    unit: '枚',
    category: 'baby',
    perPersonPerDay: { infant: 10 },
    rounding: 'ceil',
    basis: 'derived',
    source: '月齢で替える回数が変わる。1日10枚を代表値として置いた当サイトの目安。',
    note: 'おしりふきも合わせて用意を。サイズは成長で変わるので、備蓄は定期的に入れ替えてください。',
  },
  {
    id: 'medicine',
    name: '常備薬・お薬手帳の写し',
    unit: '人分',
    category: 'care',
    // 日数に比例しない。「持病のある人の分を1式ずつ」という数え方
    perPersonFixed: { senior: 1 },
    rounding: 'ceil',
    basis: 'derived',
    source: '数量の定めは無い。高齢の家族の人数ぶんを1式ずつ数える当サイトの運用。',
    note: '常備薬の備蓄日数や中断の可否は、必ずかかりつけ医・薬剤師にご相談ください。',
  },
  {
    id: 'pet-food',
    name: 'ペットフード',
    unit: 'g',
    category: 'pet',
    // 犬は中型犬（体重10kg前後）、猫は成猫の1日量を代表値にしている
    perPetPerDay: { dog: 150, cat: 60 },
    rounding: 'ceil',
    basis: 'derived',
    source:
      '体重で大きく変わる。犬は中型犬（10kg前後）、猫は成猫の1日量を代表値として置いた当サイトの目安。',
    note: 'ふだん食べているフードで用意してください。避難先で慣れない銘柄に替えると食べないことがあります。',
  },
  {
    id: 'pet-water',
    name: 'ペット用の水',
    unit: 'L',
    category: 'pet',
    perPetPerDay: { dog: 0.5, cat: 0.2 },
    rounding: 'tenth',
    basis: 'derived',
    source: '体重で変わる。犬は中型犬（10kg前後）、猫は成猫の1日の飲水量を代表値として置いた当サイトの目安。',
    note: '人の飲料水とは別に確保してください。',
  },
];

export interface BosaiBichikuInput {
  /** 大人（乳幼児・子ども・高齢者を除く人数） */
  adults?: number;
  /** 高齢者 */
  seniors?: number;
  /** 子ども（自分で食事をとる年齢。乳幼児は含めない） */
  children?: number;
  /** 乳幼児（ミルク・おむつが要る年齢） */
  infants?: number;
  dogs?: number;
  cats?: number;
  /** 備蓄日数。既定は3日 */
  days?: number;
}

/** 計算した1品目 */
export interface StockLine {
  id: string;
  name: string;
  unit: string;
  category: StockCategory;
  /** 必要量（丸め済み） */
  quantity: number;
  basis: StockBasis;
  source: string;
  note?: string;
}

export interface BosaiBichikuResult {
  /** 実際に使った備蓄日数（丸め・上限適用後） */
  days: number;
  /** 実際に使った人数の内訳（丸め・上限適用後） */
  people: Record<PersonType, number>;
  /** 実際に使ったペットの数 */
  pets: Record<PetType, number>;
  /** 人の合計（ペットを含まない） */
  totalPeople: number;
  /** 必要量が1以上になった品目だけを並べたもの */
  lines: StockLine[];
  /** 飲料水の買い方の目安。人の飲料水のみで、ペット用は含めない */
  water: {
    /** 必要リットル数 */
    liters: number;
    /** 2Lボトルの本数 */
    bottles: number;
    /** 6本入りの箱数 */
    cases: number;
  };
  /** 主食を米だけで用意した場合の重さ（kg）。0.5合＝75g換算 */
  riceKg: number;
}

/** 0以上の整数に丸める。NaN・負・小数の入力を落とし、上限で頭打ちにする */
function countOf(value: number | undefined, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value as number), 0), max);
}

/**
 * 切り上げの誤差の吸収幅。
 *
 * 0.2L × 3日 は2進小数では 0.6000000000000001 になり、そのまま切り上げると
 * 0.7L という誰も入力していない端数が出る。丸める前にこの幅だけ引いて、
 * 「計算上ちょうどの値」が1段上がらないようにしている。
 * 実際の必要量（0.1L・1本）よりはるかに小さいので、判定は変わらない。
 */
const ROUND_EPSILON = 1e-9;

/** 丸め方に従って端数を処理する。どちらも切り上げ（足りないより余るほうがよい） */
function round(value: number, rounding: Rounding): number {
  if (rounding === 'tenth') return Math.ceil(value * 10 - ROUND_EPSILON) / 10;
  return Math.ceil(value - ROUND_EPSILON);
}

/** 1品目の必要量を出す（丸める前の生の値） */
function rawQuantity(
  item: StockItem,
  people: Record<PersonType, number>,
  pets: Record<PetType, number>,
  days: number
): number {
  let total = item.perHousehold ?? 0;

  for (const [type, count] of Object.entries(people) as [PersonType, number][]) {
    total += (item.perPersonPerDay?.[type] ?? 0) * count * days;
    total += (item.perPersonFixed?.[type] ?? 0) * count;
  }
  for (const [type, count] of Object.entries(pets) as [PetType, number][]) {
    total += (item.perPetPerDay?.[type] ?? 0) * count * days;
  }

  return total;
}

/**
 * 家族構成と備蓄日数から、品目ごとの必要量を計算する。
 *
 * 世帯にひとつあればよいもの（カセットコンロ）は、人がひとりもいなければ数えない。
 * 「0人で1台」と出ると、入力前の初期表示が意味不明になるため。
 *
 * @param input 人数・ペット・備蓄日数
 */
export function calcBosaiBichiku(input: BosaiBichikuInput): BosaiBichikuResult {
  const people: Record<PersonType, number> = {
    adult: countOf(input.adults, MAX_PEOPLE_PER_TYPE),
    senior: countOf(input.seniors, MAX_PEOPLE_PER_TYPE),
    child: countOf(input.children, MAX_PEOPLE_PER_TYPE),
    infant: countOf(input.infants, MAX_PEOPLE_PER_TYPE),
  };
  const pets: Record<PetType, number> = {
    dog: countOf(input.dogs, MAX_PETS_PER_TYPE),
    cat: countOf(input.cats, MAX_PETS_PER_TYPE),
  };
  const days = Math.max(1, countOf(input.days ?? DEFAULT_DAYS, MAX_DAYS) || DEFAULT_DAYS);

  const totalPeople = people.adult + people.senior + people.child + people.infant;
  const hasHousehold = totalPeople > 0;

  const lines: StockLine[] = [];
  for (const item of STOCK_ITEMS) {
    // 誰もいない世帯にコンロだけ1台、という結果を出さない
    if (item.perHousehold && !hasHousehold) continue;

    const quantity = round(rawQuantity(item, people, pets, days), item.rounding);
    if (quantity <= 0) continue;

    lines.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      quantity,
      basis: item.basis,
      source: item.source,
      ...(item.note ? { note: item.note } : {}),
    });
  }

  const liters = lines.find((l) => l.id === 'water')?.quantity ?? 0;
  const staple = lines.find((l) => l.id === 'staple')?.quantity ?? 0;

  return {
    days,
    people,
    pets,
    totalPeople,
    lines,
    water: {
      liters,
      bottles: Math.ceil(liters / WATER_BOTTLE_LITERS),
      cases: Math.ceil(liters / WATER_BOTTLE_LITERS / WATER_BOTTLES_PER_CASE),
    },
    riceKg: Math.ceil((staple * RICE_GRAMS_PER_MEAL) / 100) / 10,
  };
}

/** 人の区分の表示名。画面・印刷リスト・解説で同じ言い方をするために1か所に置く */
export const PERSON_LABELS: Record<PersonType, string> = {
  adult: '大人',
  senior: '高齢者',
  child: '子ども',
  infant: '乳幼児',
};

/** ペットの区分の表示名 */
export const PET_LABELS: Record<PetType, string> = {
  dog: '犬',
  cat: '猫',
};

/** 品目の分類の表示名。印刷リストの見出しに使う */
export const CATEGORY_LABELS: Record<StockCategory, string> = {
  water: '水',
  food: '食料',
  heat: '熱源',
  toilet: 'トイレ',
  baby: '乳幼児',
  care: '高齢者・持病',
  pet: 'ペット',
};

/** 分類の並び順。画面と印刷リストで順番を揃えるために配列で持つ */
export const CATEGORY_ORDER: StockCategory[] = [
  'water',
  'food',
  'heat',
  'toilet',
  'baby',
  'care',
  'pet',
];

/** 計算結果を分類ごとにまとめる（画面と印刷リストで同じ並びにするため） */
export function groupByCategory(lines: StockLine[]): { category: StockCategory; lines: StockLine[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    lines: lines.filter((l) => l.category === category),
  })).filter((g) => g.lines.length > 0);
}
