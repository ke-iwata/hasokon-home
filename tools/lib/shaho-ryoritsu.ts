/**
 * 社会保険料率（本人負担・労使折半後）
 *
 * 年収ベースの概算にも、標準報酬月額ベースの厳密な計算にも使う「率そのもの」だけを置く。
 * lib/hatarakizon.ts（等級ベース）と lib/furusato-nozei.ts（年収ベースの概算）の両方から
 * 参照され、**同じ年収なら同じ料率で引かれる**ことを保証する。
 *
 * ■ なぜ独立したファイルなのか
 * lib/hatarakizon.ts は lib/furusato-nozei.ts から計算式を import している。
 * 逆向き（furusato-nozei → hatarakizon）の import を足すと循環になるので、
 * **料率だけを葉のモジュールに出して両方がここを見る**形にしている。
 * このファイルが import してよいのは lib/kosodate-shienkin.ts だけ
 * （あちらは lib/shaho-grades.ts しか import しない葉なので循環しない）。
 *
 * ■ 一次情報（毎年3〜4月に見る。年度で変わる料率はここが唯一の置き場所）
 *
 * | 料率 | 改定時期 | 一次情報 |
 * |---|---|---|
 * | 健康保険（協会けんぽ全国平均）・介護 | 3月分（4月納付分）から | 全国健康保険協会「令和◯年度の都道府県毎の保険料率」 |
 * | 子ども・子育て支援金 | 4月分から | こども家庭庁（lib/kosodate-shienkin.ts の FISCAL_YEARS） |
 * | 雇用保険（労働者負担） | 4月1日から | 厚生労働省「令和◯年度の雇用保険料率」 |
 * | 厚生年金 | 18.3%で固定（平成29年9月〜） | 日本年金機構 |
 *
 * - 全国健康保険協会「令和8年度の都道府県毎の保険料率」
 *   https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
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
 * 令和8年4月1日〜令和9年3月31日は **5/1,000**（一般の事業の雇用保険料率 13.5/1,000 の
 * うち労働者負担分。事業主負担は 8.5/1,000）。令和7年度の 5.5/1,000 から 0.5/1,000 下がった。
 * 厚生労働省「令和8年4月1日から令和9年3月31日までの雇用保険料率」
 * https://www.mhlw.go.jp/content/001692566.pdf
 *
 * 【データ更新箇所】毎年4月1日に改定される。上記PDFの「一般の事業」の①労働者負担を見る
 */
export const EMPLOYMENT_RATE = 0.005;
