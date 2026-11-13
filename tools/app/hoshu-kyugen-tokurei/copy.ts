import {
  deductedIn,
  evaluate,
  MIN_BASE_DAYS,
  MIN_BASE_DAYS_SHORT,
  ymJa,
  type TokureiInput,
} from '@/lib/hoshu-kyugen-tokurei';

/**
 * 報酬急減の特例改定ページの title・description・本文の例・FAQ。
 *
 * 本文の額は**すべて lib の計算から出す**（手で書かない。料率を更新したら例も追随する）。
 * page.tsx は Next.js の都合で metadata 以外を export できないので、テストから読めるようここに置く。
 *
 * 仕様: docs/features/hoshu-kyugen-tokurei.md
 */

export const title =
  '報酬急減の特例改定 判定・保険料計算機（2027年1月〜）｜時短・残業減で翌月から標準報酬月額を下げられるか';

export const description =
  '療養・育児・介護のための時短や残業の抑制で給料が下がったとき、2027年1月から使える「翌月から標準報酬月額を下げる特例」に当たるかを判定。いつから・毎月いくら保険料が下がるか、引き換えに年金・傷病手当金・出産手当金がどれだけ減るか（3歳未満の子は養育特例で年金を守れる）まで出します。';

/** 本文の例（仕様書「例」）：東京都・協会けんぽ・35歳、従前30万、残業の抑制で 2027-01 の報酬が22万 */
export const EXAMPLE_INPUT: TokureiInput = {
  reason: 'ryoyo-honnin',
  formerStandard: 300_000,
  firstMonthPay: 220_000,
  firstMonth: '2027-01',
  baseDays: 20,
  shortTime: false,
  lastsThreeMonths: true,
  retiresNextMonth: false,
  insuredUnder3Months: false,
  adjustment: 'zangyo',
  age: 35,
  prefecture: '東京都',
  tokureiMonths: 12,
};

export const EXAMPLE = evaluate(EXAMPLE_INPUT);
export const EXAMPLE_JITAN = evaluate({ ...EXAMPLE_INPUT, adjustment: 'jitan' });

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

const ex = EXAMPLE;
const exPensionDiff = ex.firstRow.before.pension - ex.firstRow.after.pension;

export const faq = [
  {
    q: '残業が減っただけでも対象になりますか？',
    a: `なります。療養・育児・介護と仕事を両立するための「時間外労働の抑制」も就労調整に含まれ、固定的賃金（基本給・手当の単価）が変わらなくても、報酬の総額が従前より2等級以上下がり3か月以上続く見込みなら対象になりえます。通常の随時改定は固定的賃金が変わらないと起きないので、残業が減っただけの場合にいちばん差が出ます（例：初月${ymJa(EXAMPLE_INPUT.firstMonth)}なら、9月の定時決定を待つより${ex.accel.months.length}か月早く下がります）。`,
  },
  {
    q: 'いつから保険料が下がりますか？給与明細に出るのはいつですか？',
    a: `報酬が減った初月の翌月分の標準報酬月額から改定されます。初月が${ymJa(EXAMPLE_INPUT.firstMonth)}なら${ymJa(ex.accel.tokureiFrom)}分からで、保険料を翌月の給与から引く会社（多くの会社）では${ymJa(deductedIn(ex.accel.tokureiFrom))}の給与明細から下がります。時短などで固定的賃金が変わった場合の通常の随時改定（${ymJa(EXAMPLE_JITAN.accel.normalFrom)}分から）より${EXAMPLE_JITAN.accel.months.length}か月早まります。`,
  },
  {
    q: '同意しないとどうなりますか？',
    a: '特例は本人の書面の同意が要件なので、同意しなければ特例の改定はされず、通常どおり随時改定（固定的賃金が変わって2等級以上下がったとき、4か月目から）か定時決定（9月分から）を待つことになります。保険料は高いままですが、その分の年金・傷病手当金・出産手当金は減りません。',
  },
  {
    q: '将来の年金はいくら減りますか？ 減らさない方法はありますか？',
    a: `老齢厚生年金の報酬比例部分が「下がった標準報酬月額の差 × 5.481/1000 × 月数」だけ減ります。例（従前30万円→22万円、12か月）なら年 約${yen(ex.pensionLoss.withoutIkuji)}が生涯毎年です。3歳未満の子を育てている場合は、「養育期間の標準報酬月額の特例」の申出書を事業主を通して出せば、年金は子の養育を始めた前月の標準報酬月額で計算されるので、保険料だけ下げて年金を守れます（守られるのは厚生年金だけです）。`,
  },
  {
    q: '傷病手当金・出産手当金はいくら減りますか？',
    a: `どちらも支給開始日以前12か月の標準報酬月額の平均で日額が決まるので、特例で下がった月が平均に入るほど減ります。例（従前30万円→22万円）で12か月とも下がった後なら、日額は${yen(ex.allowance.without)}から${yen(ex.allowance.with)}になります。`,
  },
  {
    q: '家族の通院の付き添いで時短にした場合も対象ですか？',
    a: '対象になりえます。通知は「療養」に本人の治療等だけでなく、家族の治療等に伴う看護を含めています。ほかの要件（2等級以上の低下・3か月以上続く見込み・書面の同意など）は同じです。',
  },
  {
    q: '2026年12月から時短にしていた場合は使えますか？',
    a: '特例の適用は2027年1月1日からです。このツールは「報酬減となった初月」が2027年1月以降のときだけ対象として判定します。2026年中に始めた就労調整について、2027年1月以降の月を初月として届け出られるかは、日本年金機構の案内が出るまで年金事務所に確認してください。',
  },
  {
    q: '育児時短就業給付（2025年4月〜）と一緒に使えますか？',
    a: '別の制度なので両方使えます。育児時短就業給付は雇用保険から時短中の賃金の10%（上限あり）が出る給付で、特例改定は健康保険・厚生年金の保険料の話です。給付の額は育児時短就業給付の計算機で確かめられます。',
  },
];

/** 本文「通常の随時改定との違い」の行 */
export const COMPARE_ROWS = [
  {
    item: '固定的賃金の変動',
    tokurei: '要らない（残業の抑制だけでもよい）',
    zuiji: '要る（基本給・手当の単価が変わったとき）',
  },
  { item: '使う報酬', tokurei: '報酬減となった初月の1か月', zuiji: '変動月から3か月の平均' },
  { item: '改定される月', tokurei: '初月の翌月から', zuiji: '変動月から4か月目' },
  {
    item: '支払基礎日数',
    tokurei: `初月が${MIN_BASE_DAYS}日以上（短時間労働者は${MIN_BASE_DAYS_SHORT}日以上）`,
    zuiji: `3か月とも${MIN_BASE_DAYS}日以上`,
  },
  { item: '本人の同意', tokurei: '書面の同意が要る', zuiji: '要らない' },
  { item: '理由', tokurei: '療養・育児（就学前）・介護のための就労調整', zuiji: '問わない' },
];

export { exPensionDiff };
