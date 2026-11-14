import type { Place } from './hinode';

/**
 * 都道府県庁の緯度経度（47 地点）。日の出・日の入り 計算機が使う。
 *
 * 出典：国土地理院「地理院地図」の住所検索（https://msearch.gsi.go.jp/address-search/AddressSearch ）に
 * 各都道府県庁の庁舎の所在地を入れて得た値（世界測地系 JGD2011。2026-11-14 取得）。
 * 国土地理院は県庁の緯度経度の一覧表を公表していない（同院 FAQ は「地理院地図で庁舎の位置を調べる」と案内）ので、
 * 一覧表を写す代わりにこの方法で取った。小数第4位（約 10m）に丸めてある。
 *
 * 日の出の時刻は 1km ずれても数秒しか変わらないので、この精度で足りる。
 * 庁舎が移転したら、その県の行だけ同じ方法で取り直す。
 *
 * 仕様: docs/features/hinode-hinoiri-keisan.md
 */
export const PREFECTURE_CAPITALS: readonly Place[] = [
  { pref: '北海道', city: '札幌市', lat: 43.0644, lon: 141.3471 },
  { pref: '青森県', city: '青森市', lat: 40.8252, lon: 140.7397 },
  { pref: '岩手県', city: '盛岡市', lat: 39.7030, lon: 141.1527 },
  { pref: '宮城県', city: '仙台市', lat: 38.2685, lon: 140.8718 },
  { pref: '秋田県', city: '秋田市', lat: 39.7181, lon: 140.1026 },
  { pref: '山形県', city: '山形市', lat: 38.2403, lon: 140.3629 },
  { pref: '福島県', city: '福島市', lat: 37.7509, lon: 140.4679 },
  { pref: '茨城県', city: '水戸市', lat: 36.3407, lon: 140.4441 },
  { pref: '栃木県', city: '宇都宮市', lat: 36.5646, lon: 139.8834 },
  { pref: '群馬県', city: '前橋市', lat: 36.3912, lon: 139.0617 },
  { pref: '埼玉県', city: 'さいたま市', lat: 35.8572, lon: 139.6508 },
  { pref: '千葉県', city: '千葉市', lat: 35.6043, lon: 140.1231 },
  { pref: '東京都', city: '新宿区', lat: 35.6896, lon: 139.6918 },
  { pref: '神奈川県', city: '横浜市', lat: 35.4477, lon: 139.6426 },
  { pref: '新潟県', city: '新潟市', lat: 37.9025, lon: 139.0233 },
  { pref: '富山県', city: '富山市', lat: 36.6968, lon: 137.2110 },
  { pref: '石川県', city: '金沢市', lat: 36.5948, lon: 136.6254 },
  { pref: '福井県', city: '福井市', lat: 36.0656, lon: 136.2213 },
  { pref: '山梨県', city: '甲府市', lat: 35.6649, lon: 138.5691 },
  { pref: '長野県', city: '長野市', lat: 36.6567, lon: 138.1726 },
  { pref: '岐阜県', city: '岐阜市', lat: 35.3917, lon: 136.7227 },
  { pref: '静岡県', city: '静岡市', lat: 34.9761, lon: 138.3826 },
  { pref: '愛知県', city: '名古屋市', lat: 35.1808, lon: 136.9066 },
  { pref: '三重県', city: '津市', lat: 34.7306, lon: 136.5089 },
  { pref: '滋賀県', city: '大津市', lat: 35.0038, lon: 135.8678 },
  { pref: '京都府', city: '京都市', lat: 35.0214, lon: 135.7556 },
  { pref: '大阪府', city: '大阪市', lat: 34.6870, lon: 135.5193 },
  { pref: '兵庫県', city: '神戸市', lat: 34.6912, lon: 135.1833 },
  { pref: '奈良県', city: '奈良市', lat: 34.6851, lon: 135.8328 },
  { pref: '和歌山県', city: '和歌山市', lat: 34.2261, lon: 135.1677 },
  { pref: '鳥取県', city: '鳥取市', lat: 35.5034, lon: 134.2384 },
  { pref: '島根県', city: '松江市', lat: 35.4766, lon: 133.0487 },
  { pref: '岡山県', city: '岡山市', lat: 34.6616, lon: 133.9349 },
  { pref: '広島県', city: '広島市', lat: 34.3966, lon: 132.4583 },
  { pref: '山口県', city: '山口市', lat: 34.1860, lon: 131.4715 },
  { pref: '徳島県', city: '徳島市', lat: 34.0658, lon: 134.5596 },
  { pref: '香川県', city: '高松市', lat: 34.3402, lon: 134.0444 },
  { pref: '愛媛県', city: '松山市', lat: 33.8417, lon: 132.7661 },
  { pref: '高知県', city: '高知市', lat: 33.5614, lon: 133.5295 },
  { pref: '福岡県', city: '福岡市', lat: 33.6062, lon: 130.4180 },
  { pref: '佐賀県', city: '佐賀市', lat: 33.2499, lon: 130.2995 },
  { pref: '長崎県', city: '長崎市', lat: 32.7506, lon: 129.8681 },
  { pref: '熊本県', city: '熊本市', lat: 32.7894, lon: 130.7420 },
  { pref: '大分県', city: '大分市', lat: 33.2374, lon: 131.6120 },
  { pref: '宮崎県', city: '宮崎市', lat: 31.9108, lon: 131.4237 },
  { pref: '鹿児島県', city: '鹿児島市', lat: 31.5601, lon: 130.5582 },
  { pref: '沖縄県', city: '那覇市', lat: 26.2133, lon: 127.6796 },
];

/** 既定の地点（仕様書「入力」） */
export const DEFAULT_PREF = '東京都';

export function findCapital(pref: string): Place | undefined {
  return PREFECTURE_CAPITALS.find((p) => p.pref === pref);
}
