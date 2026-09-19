/**
 * 社会保険料率（本人負担・労使折半後）の一次情報。
 *
 * **このファイルが料率の唯一の定義**で、他のファイルは必ずここから import する。
 * 同じ数字を2か所に置くと、片方だけが取り残される（実際、2026-08-13 に
 * 健康保険・介護・支援金を令和8年度へ更新したとき、同じファイルにあった
 * 雇用保険料率だけが令和7年度のまま残り、6ツールの社保概算が年度をまたいで
 * 混在していた。docs/features/shaho-gaisan-r8-koyo-hoken-ryoritsu.md）。
 *
 * **葉のモジュールとして保つこと。** import してよいのは `@/lib/kosodate-shienkin`
 * （さらに `@/lib/shaho-grades` しか import しない葉）だけ。ここに計算ロジックを
 * 足すと、`hatarakizon.ts` ⇄ `furusato-nozei.ts` の循環 import が復活する。
 *
 * ■ 年度で変わる料率と、毎年3〜4月に見る一次情報
 *
 * | 料率 | 改定時期 | 一次情報 |
 * |---|---|---|
 * | 健康保険（協会けんぽ全国平均）・介護 | 3月分（4月納付分）から | 協会けんぽ「令和◯年度の都道府県毎の保険料率」 |
 * | 子ども・子育て支援金 | 4月分から | こども家庭庁（`kosodate-shienkin.ts` の `FISCAL_YEARS`） |
 * | 雇用保険（労働者負担） | 4月1日から | 厚生労働省「令和◯年度の雇用保険料率」 |
 * | 厚生年金 | 18.3% で固定（平成29年9月〜） | 日本年金機構 |
 *
 * ■ 一次情報（URL）
 * - 全国健康保険協会「令和8年度の都道府県毎の保険料率」
 *   https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
 *   （全国平均9.9%・介護保険料率1.62%。令和8年3月分＝4月納付分から適用）
 * - こども家庭庁「子ども・子育て支援金制度について」
 *   https://www.cfa.go.jp/policies/kodomokosodateshienkinseido
 * - 厚生労働省「令和8年4月1日から令和9年3月31日までの雇用保険料率」
 *   https://www.mhlw.go.jp/content/001692566.pdf
 * - 日本年金機構「厚生年金保険の保険料」
 *   https://www.nenkin.go.jp/service/kounen/hokenryo/
 */

import { FISCAL_YEARS } from '@/lib/kosodate-shienkin';

/** 健康保険料率（本人負担・労使折半後）。協会けんぽの全国平均 9.9%（令和8年度）の半分 */
export const HEALTH_RATE = 0.0495;

/** 介護保険料率（本人負担・労使折半後）。全国一律1.62%（令和8年度）の半分。40〜64歳のみ */
export const KAIGO_RATE = 0.0081;

/**
 * 子ども・子育て支援金率（本人負担・労使折半後）。令和8年4月分から健康保険料に加算される。
 *
 * 手取りは「いまいくら引かれるか」なので、`見込み`・`政府試算` は使わず `確定` の
 * 最新年度だけを見る。lib/kosodate-shienkin.ts に令和9年度の確定値が入った時点で、
 * こちらは何も触らずに追随する。
 */
export const SHIENKIN_RATE = latestConfirmedShienkinRate() / 2;

function latestConfirmedShienkinRate(): number {
  const confirmed = FISCAL_YEARS.filter((y) => y.status === '確定');
  if (confirmed.length === 0) {
    // 確定値が1つも無い形に FISCAL_YEARS が変わったら、黙って0にせず気づけるようにする
    throw new Error('kosodate-shienkin の FISCAL_YEARS に確定した支援金率がありません');
  }
  return confirmed.reduce((a, b) => (b.fiscalYear > a.fiscalYear ? b : a)).rate;
}

/** 厚生年金保険料率（本人負担・労使折半後）。18.3%の半分 */
export const PENSION_RATE = 0.0915;

/**
 * 雇用保険料率（労働者負担・一般の事業）。標準報酬月額ではなく実際の賃金にかかる。
 *
 * 令和8年4月1日〜令和9年3月31日は **5/1,000**（事業主負担 8.5/1,000・合計 13.5/1,000）。
 * 令和7年度の 5.5/1,000 から 0.5/1,000 下がった。
 * 厚生労働省「令和8年4月1日から令和9年3月31日までの雇用保険料率」
 * https://www.mhlw.go.jp/content/001692566.pdf
 *
 * 【データ更新箇所】毎年4月1日に改定されうる。上のPDF（年度ごとに差し替わる）を正とする。
 */
export const EMPLOYMENT_RATE = 0.005;

/**
 * 保険料調整制度（2026年10月1日〜）の負担割合。
 *
 * 短時間労働者への適用拡大にあわせて新設された**通算3年の時限措置**。対象事業所が
 * 申し出ると、対象になる被保険者の厚生年金保険料・健康保険料の本人負担が
 * 労使折半（全体の50%）ではなく下表の割合になる。減った分は事業主が一時的に
 * 立て替え、3か月後の保険料から還付されるので、事業主の最終的な負担は増えない。
 *
 * ■ ここに置くのは**制度データだけ**。割合を保険料に当てはめる計算は
 * lib/hatarakizon.ts が持つ（このファイルは葉のモジュールとして保つ。冒頭の約束を参照）。
 *
 * ■ 一次情報（2026-09-19 にパンフレットで確認）
 * - 日本年金機構「保険料調整制度とは」
 *   https://www.nenkin.go.jp/service/kounen/hokenryo/hokenryochosei/gaiyo.html
 * - 同 パンフレット（令和8年10月）
 *   https://www.nenkin.go.jp/service/kounen/hokenryo/hokenryochosei/gaiyo.files/pamphlet202610.pdf
 *
 * 【データ更新箇所】割合・対象保険料はパンフレットの改訂で変わりうる。
 * 2035年10月の企業規模要件撤廃まで対象事業所が段階的に増えるので、
 * そのつど上のパンフレットを正とする。
 */
export const HOKENRYO_CHOSEI_STARTS_ON = '2026-10-01';

/** 制度を使える通算年数（事業所が利用を申し出た月から） */
export const HOKENRYO_CHOSEI_YEARS = 3;

/**
 * 本人負担の割合。`standardMax` 以下の標準報酬月額に `y12`（1〜2年目）/ `y3`（3年目）が適用される。
 *
 * 割合は**保険料の全体（労使合計）に対する本人の割合**で、折半額に対する割合ではない。
 * 折半は50%なので、88,000円・1〜2年目の25%は「本人負担がちょうど半分になる」ことを意味する。
 * 3年目は軽減幅が1〜2年目の半分になる（25% → 37.5%）。
 *
 * 標準報酬月額 126,000円（月収13万円未満）を超える人は制度の対象外。
 * 58,000〜78,000円（健康保険の1〜3等級）はパンフレットの「～88,000」の行に含まれる。
 */
export const HOKENRYO_CHOSEI_SHARES: ReadonlyArray<{
  readonly standardMax: number;
  readonly y12: number;
  readonly y3: number;
}> = [
  { standardMax: 88_000, y12: 0.25, y3: 0.375 },
  { standardMax: 98_000, y12: 0.3, y3: 0.4 },
  { standardMax: 104_000, y12: 0.36, y3: 0.43 },
  { standardMax: 110_000, y12: 0.41, y3: 0.455 },
  { standardMax: 118_000, y12: 0.45, y3: 0.475 },
  { standardMax: 126_000, y12: 0.48, y3: 0.49 },
];

/**
 * 軽減の対象になる保険料は**厚生年金保険料・健康保険料だけ**。
 *
 * パンフレット Q5 の注記が「賞与に関する保険料や、介護保険料、子ども・子育て支援金は、
 * 制度の対象外です」と明記している（2026-09-19 確認）。雇用保険料は社会保険料ではないので
 * そもそも対象外。**子ども・子育て支援金は健康保険料と一体で天引きされるが軽減されない**ので、
 * 健康保険料の割合に巻き込まないこと。
 */
export const HOKENRYO_CHOSEI_EXCLUDED_NOTE =
  '軽減されるのは厚生年金保険料と健康保険料だけです。介護保険料・子ども・子育て支援金・雇用保険料と、賞与にかかる保険料は制度の対象外です。';
