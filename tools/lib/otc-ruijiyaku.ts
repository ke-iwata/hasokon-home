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
 * ■ 消費税は「かかる」と原典に書いてある（推測ではない）
 * 第213回 資料1（`001742888.pdf`）3頁に
 * 「※選定療養に係る『特別の料金』には別途消費税がかかっている。」とあり、
 * 同19頁の負担額の試算表にも「注 実際の負担額は各医薬品の薬価や
 * **特別の料金への消費税**などにより異なる場合がある。」とある。
 * よって `afterWithTax` を「窓口で払う額」として出す。**税抜の額を主に出すと、
 * 実際より安く見せることになる**（計算機として、いちばん避けたい向きの誤差）。
 * なお原典19頁の試算表そのものは税を含まない 47.5% で作られている
 * （360円→570円・540円→855円がちょうど 1.5833倍）ので、比較できるよう
 * 税抜の額（`after`）も併せて持つ。
 *
 * ■ 確定していないもの（告示・省令待ち）
 * 中間とりまとめ（2026-08-06）までの内容で、告示・省令はまだ出ていない。
 * 次の3つは**このファイルの中で「未確認」と印を付けて1か所にまとめてある**
 * （`UNCONFIRMED`）。告示が出たら、ここと `DATA_CHECKED_AT` を直す。
 *   1. 施行日（「令和9年3月施行を想定」までしか公表されていない。日は `ENFORCEMENT_FROM` の暫定値）
 *   2. 円未満の端数処理（薬剤料は10円単位なので 1/4 で 2.5円が出る）
 *   3. 経過措置がどの薬効分類まで及ぶか（原典の概要と詳細で読みが分かれる。`TRANSITION_NOTE`）
 *
 * ■ このツールが出すのは「薬剤料の分」だけ
 * 実際の窓口では調剤技術料・薬学管理料などが加わり、一部負担金は
 * 明細の合計に対して10円未満を四捨五入する。薬剤料だけを取り出して
 * 10円単位に丸めると実際とずれるので、ここでは丸めない。
 *
 * ■ 一次情報（2026-09-21 に本文を読んで確認）
 * PDFは pdf.js の `getTextContent()` でテキスト層を読める（画像ではない）。
 * 除外の類型・成分一覧・消費税の注は、いずれも下記PDFの本文にある。
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
export const DATA_CHECKED_AT = '2026-09-21';

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
 *
 * **消費税はここに無い。**原典に「特別の料金には別途消費税がかかっている」と
 * 明記があるので、確認済みの事実として `afterWithTax` を主に出している
 * （残る不確かさは税率が10%のままかどうかだけで、それは `CONSUMPTION_TAX_RATE` の話）。
 */
export const UNCONFIRMED = {
  /** 施行日の「日」（「令和9年3月施行を想定」までしか公表されていない） */
  enforcementDay: true,
  /** 円未満の端数処理 */
  rounding: true,
  /** 経過措置がどの薬効分類まで及ぶか */
  transitionScope: true,
} as const;

/**
 * 「特別の料金」に乗る消費税の税率。
 *
 * 原典（第213回 資料1・3頁）に「※選定療養に係る『特別の料金』には別途消費税が
 * かかっている。」と明記されている。**かかるかどうかは確定した事実**で、
 * 残る不確かさは税率が10%のままかどうかだけ。
 *
 * 【データ更新箇所】消費税率が変わったらここを直す。
 */
export const CONSUMPTION_TAX_RATE = 0.1;

/**
 * 円未満の端数処理（暫定）。
 *
 * 薬剤料は10円単位なので、1/4 を取ると 2.5円 のような端数が出る
 * （25点＝250円 → 62.5円）。**告示で決まるまでの暫定として四捨五入**にしている
 * （`UNCONFIRMED.rounding`）。
 *
 * 切り捨てにしていたのを四捨五入に変えた理由は、**切り捨てが必ず
 * 「実際より安い額」の側に倒れる**ため。告示が切り上げ・四捨五入のどちらでも、
 * 四捨五入なら誤差は片側に寄らない。
 * 先行例（長期収載品の選定療養）は点数の段階で四捨五入してから10円を掛け、
 * さらに消費税を掛ける形だが、**その丸め方が一部保険外療養にも及ぶとは
 * 原典に書かれていない**ので、そこまでは寄せていない。
 */
export function roundYen(value: number): number {
  return Math.round(value);
}

/**
 * 経過措置（令和10年度末まで）の読みについての但し書き。
 *
 * 原典7頁の概要は「一定の重症患者への長期使用の実態を踏まえ、**湿布・皮膚保湿剤等は
 * 別途の負担の対象外とする**令和10年度末までの経過措置を講じて」と、
 * 分類まるごとが対象外に読める書き方をしている。
 * 一方で原典12頁の表は、経過措置を**外用薬の「長期使用」の枠の中**に置き、
 * 鎮痛消炎剤は「慢性かつ重度の疾患であることが客観的に把握でき、医師が年間を通じた
 * 疼痛管理として継続使用が医療上必要と判断する場合に限る」、
 * 皮膚保湿剤・皮膚保護剤・角化症治療剤は「症状または疾患活動性が十分に改善せず、
 * 免疫抑制剤等による全身療法を併用した治療歴がある場合であって、医師が毎日使用する
 * ことを指示して処方する場合に限る」と条件を付けている。
 *
 * **どちらの読みかで答えが変わる**ので、画面では断定せず両方を示す
 * （`UNCONFIRMED.transitionScope`）。
 */
export const TRANSITION_NOTE =
  '経過措置がどこまで及ぶかは、原典のなかでも書き方が分かれています。概要（7頁）は「湿布・皮膚保湿剤等は対象外」と分類ごと読める書き方ですが、詳細（12頁）は外用薬の「長期使用」の枠に置いたうえで、慢性かつ重度の疾患であることなどの条件を付けています。告示で確定するまでは、条件に当たらない場合に「特別の料金」がかかる可能性が残ります。';

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
export type ExclusionId =
  | 'kounou'
  | 'child'
  | 'cancer'
  | 'nanbyo'
  | 'kouhi'
  | 'seikatsuhogo'
  | 'admission'
  | 'procedure'
  | 'long-term'
  | 'pregnancy';

export interface ExclusionDef {
  id: ExclusionId;
  /** チェックボックスの文言 */
  label: string;
  /** 「かかりません」と出すときの根拠の文 */
  reason: string;
  /** 補足（日数の条件など）。原典の書きぶりに合わせる */
  note?: string;
}

/**
 * 「特別の料金」がかからない者・療養。
 *
 * **原典（第213回 資料1）9頁「別途の負担を求めない者と療養の範囲」の表と、
 * 7頁・12頁・15頁の整理から写した。**当初の実装は5類型しか持っておらず、
 * 生活保護受給者・妊婦等・効能効果の違いが抜けていた。
 *
 * 原典は「こども／がん患者／難病患者／国の公費負担医療の対象者／入院患者／
 * 処置等の一環で行われる処方／低所得者」を表で挙げ、これに
 * 「医師が対象医薬品の長期使用等が医療上必要と考える方」（12頁）と
 * 「OTC添付文書に『服用しない』と記載されている妊婦・妊娠している可能性が
 * ある女性・授乳婦」（15頁）が加わる。さらに前提として、
 * 「OTC医薬品が対応していない効能効果での処方」は対象外（7〜8頁）。
 *
 * **「低所得者」は生活保護受給者のこと。**2025-12 の政府決定では「低所得者」と
 * しか書かれていなかったが、原典9頁の表は「低所得者 ・生活保護受給者」と
 * 範囲まで書いている（第214回 資料2も「『低所得者』として別途の負担の対象外と
 * するのは、生活保護受給者とすると国会の法案審議で議論が行われている」）。
 * ただし第214回の部会では「生活保護受給者以外の低所得者についても…負担能力に
 * 配慮すべき」という意見が出ており、**範囲が広がる可能性は残っている**。
 *
 * 【データ更新箇所】告示が出たら文言と日数の条件を条文どおりに直す。
 */
export const EXCLUSIONS: ExclusionDef[] = [
  {
    id: 'kounou',
    label: '市販薬にない効能効果での処方（医師にそう説明された場合）',
    reason: '市販薬にない効能効果での処方は「特別の料金」の対象外です',
    note: '同じ成分でも、市販薬と効能効果が対応しない使い方なら対象外です。たとえばヘパリン類似物質は、血栓性静脈炎・血行障害に基づく疼痛と炎症性疾患・筋性斜頸（乳児期）では対象外になります。処方の目的で決まるので、成分名だけでは判断できません。',
  },
  {
    id: 'child',
    label: '18歳の年度末まで（18歳に達する日以後の最初の3月31日まで）',
    reason: '18歳の年度末までの人は「特別の料金」の対象外です',
    note: '年齢で切るのではなく年度で切るため、高校3年生の3月までは対象外になります。',
  },
  {
    id: 'cancer',
    label: 'がんの治療中で、がんやその治療に関連して生じた状態への処方',
    reason: 'がんやその治療に関連して生じた状態への処方は「特別の料金」の対象外です',
    note: 'がん治療中でも、がんと関連の薄い症状（花粉症・水虫など）や、治療終了後の投薬は対象になります。',
  },
  {
    id: 'nanbyo',
    label: '指定難病の患者で、その指定難病・付随して発生する傷病への処方',
    reason: '指定難病とそれに付随する傷病への処方は「特別の料金」の対象外です',
    note: '軽症の指定難病患者も含みます。小児慢性特定疾病も同じ整理です。',
  },
  {
    id: 'kouhi',
    label: '国の公費負担医療を受けるときの処方',
    reason: '国の公費負担医療を受ける際の処方は「特別の料金」の対象外です',
    note: '公費負担と関連しない症状への処方は対象になります。',
  },
  {
    id: 'seikatsuhogo',
    label: '生活保護を受けている（医療扶助）',
    reason: '生活保護受給者は「特別の料金」の対象外です',
    note: '原典が「低所得者」として対象外にしているのは、いまのところ生活保護受給者だけです。生活保護以外の低所得の方にも配慮すべきという意見は部会で出ており、範囲が広がる可能性は残っています。',
  },
  {
    id: 'admission',
    label: '入院中の処方・退院時の処方',
    reason: '入院中・退院時の処方は「特別の料金」の対象外です',
  },
  {
    id: 'procedure',
    label: '処置・手術・検査と同じ日に新しく出た処方（14日分まで）',
    reason: '処置・手術等の一環としての処方（14日分まで）は「特別の料金」の対象外です',
    note: '処置の前から同じ薬を使っていた場合や、14日分を超える部分は対象になります。',
  },
  {
    id: 'long-term',
    label: '医師が長期の使用を医療上必要と認めた場合',
    reason: '医師が長期の使用を医療上必要と認めた場合は「特別の料金」の対象外です',
    note: '飲み薬は、6か月以上の使用実績があり、年間でおおむね50週（350日）の継続が医療上必要と医師が認めている場合です。塗り薬・貼り薬は処方日数で通年性を測れないため、慢性・反復性の疾患と診断されているか、診療ガイドラインに継続使用の根拠があるかなどで総合的に判断されます。',
  },
  {
    id: 'pregnancy',
    label: '妊娠中・妊娠の可能性がある・授乳中（対象になる成分のみ）',
    reason: '市販薬の添付文書で「服用しないこと」とされている成分では、妊娠中・妊娠の可能性がある方・授乳中の方への処方は「特別の料金」の対象外です',
    note: '市販薬の添付文書に「服用しないこと」と書かれている成分（例：イトプリド塩酸塩）が対象です。すべての成分に当てはまるわけではありません。',
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
  /**
   * 改正後の窓口負担（消費税を含む・円）。**これが「窓口で払う額」**。
   * 原典に「特別の料金には別途消費税がかかっている」と明記があるため、
   * 税を含む額を主に出す（税抜を主にすると実際より安く見せることになる）。
   */
  afterWithTax: number;
  /**
   * 改正後の窓口負担（消費税を含まない・円）。
   * 原典19頁の試算表が税抜の 47.5% で作られているので、突き合わせ用に持つ。
   */
  after: number;
  /** 増える額（消費税を含む・円）。**これが「いくら増えるか」** */
  increaseWithTax: number;
  /** 増える額（消費税を含まない・円） */
  increase: number;
  /** 薬剤料に対する実質の負担率（消費税を含む。3割なら 0.5） */
  effectiveRateWithTax: number;
  /** 同・消費税を含まない（3割なら 0.475）。原典19頁の試算表と同じ基準 */
  effectiveRate: number;
  /**
   * 施行日の「日」が未確定なため、この処方日では判定を断定できないか。
   * 2027年3月中の日付のときに true（`UNCONFIRMED.enforcementDay`）。
   */
  enforcementDayUncertain: boolean;
  /** 1年で増える額（消費税を含む・円）。`timesPerYear` が無ければ null */
  yearlyIncreaseWithTax: number | null;
  /** 1年で増える額（消費税を含まない・円）。`timesPerYear` が無ければ null */
  yearlyIncrease: number | null;
}

/**
 * 入力欄の文字列を数にする。
 *
 * **空文字・空白だけを `NaN` に倒すのが要点。** `Number('')` は `0` なので、
 * そのまま `calculate()` に渡すと「薬剤料0円で、特別の料金はかかります（＋0円）」という、
 * 何も入れていないのに答えが出ている画面になる（#240 のレビュー指摘）。
 * UIに書くと素通りしたときに気づけないので、ここに置いてテストで固定する。
 */
export function parseAmountInput(text: string): number {
  const trimmed = text.replace(/[,\s\u3000]/g, '');
  if (trimmed === '') return Number.NaN;
  return Number(trimmed);
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
 * 薬剤料に対する実質の負担率（消費税を含まない）。
 * 特別の料金（25%・全額負担）＋ 残り75%への窓口負担割合。
 * 3割なら 47.5%。**原典19頁の試算表と同じ基準**
 * （解熱鎮痛薬 360円→570円・抗アレルギー薬 540円→855円 がちょうど 1.5833倍）。
 */
export function effectiveBurdenRate(copayPercent: CopayPercent): number {
  return SPECIAL_CHARGE_RATIO + INSURED_RATIO * (copayPercent / 100);
}

/**
 * 薬剤料に対する実質の負担率（消費税を含む）。3割なら 50%。
 * 特別の料金にだけ消費税が乗り、保険がきく部分には乗らない。
 */
export function effectiveBurdenRateWithTax(copayPercent: CopayPercent): number {
  return (
    SPECIAL_CHARGE_RATIO * (1 + CONSUMPTION_TAX_RATE) + INSURED_RATIO * (copayPercent / 100)
  );
}

/**
 * 施行日の「日」が未確定なせいで、この処方日の判定を断定できないか。
 *
 * 公表されているのは「令和9年3月施行を想定」までで、日は決まっていない。
 * **2027年3月中の日付を入れた人には、告示の内容しだいで答えが変わる**
 * （仮に3月15日施行なら、3月1〜14日の処方に「かかります」と出していたことになる）。
 * 3月の外の日付（2月以前・4月以降）は、日がどこに決まっても答えが変わらない。
 */
export function isEnforcementDayUncertain(isoDate: string): boolean {
  return isoDate.slice(0, 7) === ENFORCEMENT_FROM.slice(0, 7);
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
    afterWithTax,
    after,
    increaseWithTax,
    increase,
    effectiveRateWithTax: effectiveBurdenRateWithTax(input.copayPercent),
    effectiveRate: effectiveBurdenRate(input.copayPercent),
    enforcementDayUncertain: charged && isEnforcementDayUncertain(input.prescribedOn),
    yearlyIncreaseWithTax: times === null ? null : increaseWithTax * times,
    yearlyIncrease: times === null ? null : increase * times,
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
    return `湿布・塗り薬の鎮痛消炎剤や皮膚の保湿剤・保護剤は経過措置で、${TRANSITION_LABEL}までは「特別の料金」はかかりません`;
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
  /** 負担割合ごとの before / after。after は消費税を含む（窓口で払う額） */
  cells: {
    copayPercent: CopayPercent;
    before: number;
    afterWithTax: number;
    increaseWithTax: number;
  }[];
}

/**
 * 点数 × 負担割合の早見表。
 * 除外にも経過措置にも当たらず、施行後に処方された場合の額（消費税込み）。
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
      afterWithTax: r.afterWithTax,
      increaseWithTax: r.increaseWithTax,
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
