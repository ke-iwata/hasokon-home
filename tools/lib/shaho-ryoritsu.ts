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
 * 本文に出す料率の文字列（「4.95%」など）。
 *
 * **本文の数字をここから出すためのもの。** 定数だけ直して説明文を直し忘れると、
 * 画面上は「雇用保険0.55%で概算します」と書いてあるのに計算は0.5%、という
 * 食い違いが起きる（2026-09-19に、実際に本番で起きていたのを見つけた）。
 */
export function ratePercent(rate: number): string {
  // 料率は小数第2位までで表せる範囲しか使わない（4.95% / 9.15% / 0.5%）
  return `${Number((rate * 100).toFixed(2))}%`;
}
