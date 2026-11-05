import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  FUEL_PRICES,
  ZANTEI_TAX,
  calcTrip,
  formatDateJa,
  formatLiters,
  formatYen,
  highOctaneGap,
  zanteiTaxPerLiter,
} from '@/lib/gasoline-dai';
import Calculator from './Calculator';

// 「【2026年12月の値上げ対応】」の括弧は、補助の縮小の日程を経済産業省・資源エネルギー庁の
// 一次情報で確かめられた場合だけ付ける（仕様書「registry・SEO」。2026-11-04 時点では未確認）
const title = 'ガソリン代 計算機｜距離と燃費から往復・割り勘・月の燃料費';
const description =
  '距離と燃費からガソリン代を計算。往復・高速代込みの割り勘（運転者を除く切り替えつき）、毎月・1年の燃料費も出せます。単価は資源エネルギー庁の全国平均（日付つき）を初期値に、単価が上がったら月いくら増えるか、暫定税率の分の税が年何円相当かも分かります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/gasoline-dai/` },
  robots: robotsFor('gasoline-dai'),
};

const ASOF = formatDateJa(FUEL_PRICES.asOf);

/** 本文の例（額を手で書かないため lib で出す） */
const EXAMPLE = (() => {
  const r = calcTrip({
    distanceKm: '120',
    roundTrip: true,
    kmPerLiter: '15',
    pricePerLiter: String(FUEL_PRICES.regular),
    extraYen: '',
    people: 1,
    driverExempt: false,
  });
  if (!r.ok) throw new Error('example');
  return r;
})();

const faq = [
  {
    q: 'ガソリン代の割り勘で、運転した人も払うべきですか？',
    a: '決まりはありません。よくある分け方は「全員で等分する」と「運転した人は払わない（ほかの人で等分する）」の2つです。運転する人が車を出し、運転の手間も負っているので後者にすることも多いです。この計算機は「運転する人は払わない」の切り替えで両方の額を出せます。1円未満は切り上げるので、集めすぎた数円は幹事の手元に残ります。',
  },
  {
    q: '12月からガソリンは値上がりしますか？',
    a: `いまは「中東情勢を踏まえた緊急的激変緩和措置」（2026年3月19日から）の補助で、レギュラーの全国平均を170円程度に抑えています。補助は段階的に縮小される見込みで、縮小されるとその分だけ店頭価格が上がります。日程と基準価格は資源エネルギー庁の発表を確認してください。この計算機の「毎月・1年」で、単価が何円上がると月いくら増えるかを出せます。`,
  },
  {
    q: '暫定税率が廃止されたのに、ガソリンは安くなっていないのはなぜですか？',
    a: `ガソリンの暫定税率（揮発油税・地方揮発油税のうち${ZANTEI_TAX.gasolinePerLiter}円/L）は${formatDateJa(ZANTEI_TAX.gasolineAbolishedOn)}に廃止されました。廃止の前から補助金を段階的に増やして同じ額を先に下げていたため、廃止の日に一気には下がりませんでした（資源エネルギー庁の説明）。いまは補助で全国平均を目標の価格に抑えているので、店頭価格は廃止の有無ではなく目標の価格で決まっています。この計算機の「暫定税率の分の税」は、あなたの給油量にかかっていたはずの税の額（消費税込みで${zanteiTaxPerLiter('regular')}円/L）で、店頭価格がその額だけ下がったという意味ではありません。`,
  },
  {
    q: '軽油の暫定税率はいつ廃止されましたか？',
    a: `軽油引取税のうち${ZANTEI_TAX.dieselPerLiter}円/Lが${formatDateJa(ZANTEI_TAX.dieselAbolishedOn)}に廃止されました。軽油引取税は区分して受け取る場合は消費税の課税標準に含まれないので、消費税込みでも${ZANTEI_TAX.dieselPerLiter}円/Lです（ガソリンは揮発油税に消費税がかかるため${zanteiTaxPerLiter('regular')}円/L）。`,
  },
  {
    q: 'ハイオクとレギュラーの差はいくらですか？',
    a: `${ASOF}時点の全国平均で、レギュラー${FUEL_PRICES.regular}円/L・ハイオク${FUEL_PRICES.highOctane}円/Lで、差は${highOctaneGap()}円/Lです（資源エネルギー庁 石油製品価格調査）。ハイオク指定の車にレギュラーを入れるのは避けてください。`,
  },
];

const trail = breadcrumbFor('gasoline-dai');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'ガソリン代 計算機',
      url: `${SITE_URL}/gasoline-dai/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('gasoline-dai'),
      publisher: PUBLISHER_REF,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      description,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbList(trail),
  ],
};

const SOURCES = [
  {
    label: '資源エネルギー庁「中東情勢を踏まえた緊急的激変緩和措置」',
    url: 'https://nenryo-teigakuhikisage.go.jp/',
  },
  {
    label: '同「ガソリン全国平均価格の推移」',
    url: 'https://nenryo-teigakuhikisage.go.jp/current_graph.pdf',
  },
  {
    label: '資源エネルギー庁「燃料油の『緊急的激変緩和措置』」',
    url: 'https://www.enecho.meti.go.jp/about/special/johoteikyo/fuel_price_shien_2026.html',
  },
  {
    label: '資源エネルギー庁 エネこれ「ガソリンの暫定税率（当分の間税率）の廃止でガソリン代はどうなるの？」',
    url: 'https://www.enecho.meti.go.jp/about/special/johoteikyo/zanteizeiritsu.html',
  },
  { label: '資源エネルギー庁「石油製品価格調査」', url: FUEL_PRICES.sourceUrl },
  {
    label: '国税庁 消費税法基本通達 10-1-11',
    url: 'https://www.nta.go.jp/law/tsutatsu/kihon/shohi/10/01.htm',
  },
];

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>ガソリン代 計算機</h1>
      <p className="lead">
        距離と燃費から、1回のドライブのガソリン代と割り勘の1人分、毎月・1年の燃料費を計算します。
        単価の初期値は資源エネルギー庁の全国平均（{ASOF}時点）で、自分で書き換えられます。入力した値はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>ガソリン代の計算のしかた</h2>
      <p>
        <strong>ガソリン代 ＝ 走る距離 ÷ 燃費 × 単価</strong>
        です。たとえば片道120km（往復{EXAMPLE.km}km）を燃費15km/Lの車で走り、単価が{FUEL_PRICES.regular}円/Lなら、
        給油量は{formatLiters(EXAMPLE.liters)}Lでガソリン代は{formatYen(EXAMPLE.fuelYen)}円です。
        金額は丸める前の給油量から出し、1円未満を四捨五入しています。割り勘の1人分は、集める側が足りなくならないよう1円未満を切り上げます。
      </p>

      <h2>実燃費はカタログより悪い</h2>
      <p>
        カタログのWLTCモードの燃費に対して、実際に走ったときの燃費は冬場・渋滞・短い距離の繰り返し・エアコンの使用で2〜3割ほど悪くなるのが目安です。
        自分の車の実燃費は「満タン法」で測れます：満タンにしてトリップメーターを0にし、次に満タンにしたときの走行距離を給油量で割ります
        （400km走って25L入ったなら16km/L）。
      </p>

      <h2>単価の初期値について</h2>
      <p>
        初期値は資源エネルギー庁「石油製品価格調査」の{ASOF}（月曜）時点の全国平均で、レギュラー{FUEL_PRICES.regular}円/L・ハイオク
        {FUEL_PRICES.highOctane}円/L・軽油{FUEL_PRICES.diesel}円/Lです。調査は毎週月曜の価格を水曜に公表していますが、このページの値は月に1回更新します。
        地域や店で価格は違うので、給油した店の単価があれば書き換えてください。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p>
        飲み会などで傾斜をつけて分けるなら<Link href="/warikan/">割り勘計算機</Link>、家の冷暖房の費用は
        <Link href="/aircon-denkidai/">エアコン電気代 計算機</Link>で計算できます。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="gasoline-dai" />

      <ToolMeta slug="gasoline-dai" ymyl>
        出典：
        {SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '／'}
            <a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
              {s.label}
            </a>
          </span>
        ))}
        にもとづき作成。単価は{ASOF}時点の全国平均です。
      </ToolMeta>
    </>
  );
}
