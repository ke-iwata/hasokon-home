import {
  datesOfMonth,
  formatHm,
  HATSUHINODE_YEAR,
  hatsuhinodeRanking,
  solsticeDate,
  sunTimes,
} from '@/lib/hinode';
import { findCapital, PREFECTURE_CAPITALS } from '@/lib/prefecture-capitals';

/**
 * 日の出・日の入り 計算機の title・description・FAQ。
 *
 * **年はすべて `HATSUHINODE_YEAR` から組み立てる**（文面に年を直書きしない。仕様書「年の定数」）。
 * 時刻・地点名も lib の計算から出す（起票時の試算を書き写さない）。
 * page.tsx は Next.js の都合で metadata 以外を export できないので、テストから読めるようここに置く。
 *
 * 仕様: docs/features/hinode-hinoiri-keisan.md
 */

const Y = HATSUHINODE_YEAR;

export const title = `日の出・日の入り 計算｜初日の出${Y}の時刻・47都道府県・冬至と夏至`;

export const description = `地点と日付を選ぶと、日の出・日の入り・南中・昼の長さを分単位で計算。${Y}年の初日の出の時刻を47都道府県で早い順に並べ、冬至・夏至とも比べられます。国立天文台と同じ定義（太陽の上辺が地平線に接する時刻）で、位置情報は使わずブラウザ内で計算します。`;

/** 初日の出の一覧（HATSUHINODE_YEAR。都道府県庁47地点） */
export const RANKING = hatsuhinodeRanking(PREFECTURE_CAPITALS, Y);
const first = RANKING[0];
const last = RANKING[RANKING.length - 1];

const tokyo = findCapital('東京都')!;
const sapporo = findCapital('北海道')!;
const at = (p: { lat: number; lon: number }, date: string) => sunTimes({ lat: p.lat, lon: p.lon, date });

/** 東京の初日の出と、経度が東京より東なのに遅い札幌（緯度の効き） */
export const TOKYO_HATSU = at(tokyo, `${Y}-01-01`).sunrise!;
export const SAPPORO_HATSU = at(sapporo, `${Y}-01-01`).sunrise!;

/** 冬至の前後で、東京の日の入りが最も早い日・日の出が最も遅い日（均時差の FAQ） */
const winter = solsticeDate(Y - 1, 'winter');
const around = [
  ...datesOfMonth(Y - 1, 11),
  ...datesOfMonth(Y - 1, 12),
  ...datesOfMonth(Y, 1),
].map((date) => ({ date, ...at(tokyo, date) }));
// 分に丸めて同じ時刻が続く日は、その期間の真ん中ではなく最初の日を出す
const earliestSet = around.reduce((a, b) => (Math.round(b.sunset!) < Math.round(a.sunset!) ? b : a));
const latestRise = around.reduce((a, b) => (Math.round(b.sunrise!) > Math.round(a.sunrise!) ? b : a));
const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

export const EQUATION_OF_TIME_EXAMPLE = {
  winter,
  earliestSet: { date: earliestSet.date, time: earliestSet.sunset! },
  latestRise: { date: latestRise.date, time: latestRise.sunrise! },
};

export const faq: { q: string; a: string }[] = [
  {
    q: `${Y}年の初日の出は何時？`,
    a: `都道府県庁の位置・海抜0mで計算すると、最も早いのは${first.place.pref}（${first.place.city}）の${formatHm(first.sunrise)}、最も遅いのは${last.place.pref}（${last.place.city}）の${formatHm(last.sunrise)}です。東京都（新宿区）は${formatHm(TOKYO_HATSU)}です。日の出の早い・遅いは東西（経度）だけでなく南北（緯度）でも決まり、冬は北ほど日の出が遅いので、東京より東にある北海道（札幌市）は${formatHm(SAPPORO_HATSU)}と東京より遅くなります。`,
  },
  {
    q: '冬至なのに日の入りが一番早い日ではないのはなぜ？',
    a: `昼が最も短いのは冬至（${md(winter)}）ですが、太陽が真南に来る時刻（南中）が12月から1月にかけて毎日少しずつ遅くなる（均時差）ため、日の出・日の入りの時刻全体が後ろにずれていきます。そのため東京では日の入りが最も早いのは${md(earliestSet.date)}ごろ（${formatHm(earliestSet.sunset!)}）、日の出が最も遅いのは${md(latestRise.date)}ごろ（${formatHm(latestRise.sunrise!)}）で、どちらも冬至の日ではありません。`,
  },
  {
    q: '計算の時刻と実際に見える時刻が違うのはなぜ？',
    a: 'この計算は海抜0mで、地平線（水平線）がさえぎるものなく見通せる場所での時刻です。東に山やビルがあると、太陽がその上に出るまで数分〜十数分遅れます。山頂や高層階など高い場所では地平線が下がるので早くなります。雲や霞で見えない日もあります。',
  },
  {
    q: '国立天文台の時刻と違う？',
    a: '日の出・日の入りを「太陽の上辺が地平線に接する時刻」とする定義は国立天文台と同じで、同じ地点なら差はおおむね1分以内です（秒を四捨五入するときの丸めの差）。このツールは都道府県庁の位置で計算しているので、国立天文台「各地のこよみ」の計算地点と緯度・経度が少し違う県では、1〜2分ずれることがあります。',
  },
  {
    q: '位置情報は送られる？',
    a: '送りません。このツールは位置情報（GPS）を使わず、選んだ都道府県か入力した緯度・経度だけで計算します。計算はすべてお使いのブラウザの中で行い、地点や日付をサーバーに送ることはありません。',
  },
];
