import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { ToolLink } from '@/app/PublicToolLink';
import {
  AREAS,
  DATA_CHECKED_AT,
  areaById,
  describeRule,
  formatYmdJa,
  taxPerNight,
  yen,
} from '@/lib/shukuhakuzei';
import Calculator from './Calculator';

const title = '宿泊税 計算｜東京は2027年4月から3%・沖縄は2月から2%、1泊いくら？';
const description =
  '泊まる場所と1人1泊の料金を入れると宿泊税がいくらかを計算。東京都の2027年4月からの3%（13,000円未満は非課税）、沖縄県の2%（上限2,000円）、京都市・大阪府に対応し、改正前との差も出します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shukuhakuzei/` },
  robots: robotsFor('shukuhakuzei'),
};

const tokyo = areaById('tokyo');
/** 東京の改正前後の例（本文に額を手で書かないため lib から作る） */
const tokyoExamples = [9_000, 12_000, 13_000, 20_000, 50_000].map((price) => {
  const before = taxPerNight(tokyo, price, '2027-03-31')!.tax;
  const after = taxPerNight(tokyo, price, '2027-04-01')!.tax;
  return { price, before, after, diff: after - before };
});
const tokyoMidBand = tokyoExamples.find((e) => e.price === 12_000)!;
const tokyo3Percent = (p: number) => taxPerNight(tokyo, p, '2027-04-01')!.tax;

const faq = [
  {
    q: '宿泊税は誰が払いますか？',
    a: '宿泊する人が払います。ホテル・旅館などの宿が宿泊料金と一緒に預かり、自治体に納めます（特別徴収）。東京都では2027年4月1日の宿泊分から、簡易宿所や民泊（新法民泊・特区民泊）も預かる側になります。',
  },
  {
    q: '予約サイトで事前に払ったら、現地でも払いますか？',
    a: '宿泊税を予約時の支払いに含めるかどうかは、宿と予約の方法によって違います。予約時に含まれていなければ、宿で別に払います。同じ泊の宿泊税を二重に払うものではないので、予約の明細に宿泊税が含まれているかを確かめてください。',
  },
  {
    q: '2027年3月31日から4月1日の連泊（東京）はどう計算しますか？',
    a: `1泊ごとに、その泊の宿泊日の税率を当てます。3月31日の泊は改正前の定額、4月1日の泊は改正後の3%です。1人1泊20,000円なら ${yen(taxPerNight(tokyo, 20_000, '2027-03-31')!.tax)} ＋ ${yen(tokyo3Percent(20_000))} ＝ ${yen(taxPerNight(tokyo, 20_000, '2027-03-31')!.tax + tokyo3Percent(20_000))} です。`,
  },
  {
    q: '子どもも宿泊税を払いますか？',
    a: '料金を払って泊まる人は、年齢にかかわらず対象になるのが原則です。修学旅行などの学校行事は、沖縄県・京都市・大阪府では課税免除の規定があります（証明書などが必要）。沖縄県では、料金なしで大人と同じ寝具を使う子どもは課税されません。',
  },
];

const trail = breadcrumbFor('shukuhakuzei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '宿泊税 計算機',
      url: `${SITE_URL}/shukuhakuzei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shukuhakuzei'),
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

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>宿泊税 計算機</h1>
      <p className="lead">
        泊まる場所と1人1泊の料金から、宿泊税がいくらかを出します。
        <strong>東京都は2027年4月から宿泊料金の3%（13,000円未満は非課税）</strong>、
        <strong>沖縄県は2027年2月から2%（上限2,000円）</strong>。改正前との差も並べます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>自治体ごとの税率（1人1泊）</h2>
      <table>
        <thead>
          <tr>
            <th>自治体</th>
            <th>宿泊日</th>
            <th>税額</th>
          </tr>
        </thead>
        <tbody>
          {AREAS.flatMap((a) =>
            a.periods
              .filter((p) => p.rule.kind !== 'none')
              .map((p) => (
                <tr key={`${a.id}-${p.from}`}>
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{a.name}</td>
                  <td style={{ textAlign: 'left' }}>
                    {p.to ? `〜${formatYmdJa(p.to)}` : `${formatYmdJa(p.from)}〜`}
                  </td>
                  <td style={{ textAlign: 'left' }}>{describeRule(p.rule)}</td>
                </tr>
              )),
          )}
        </tbody>
      </table>
      <p>
        税率は{formatYmdJa(DATA_CHECKED_AT)}時点で各自治体の公表資料と照らし合わせたものです。
        沖縄県は2027年2月1日の宿泊分から（1月31日から2月1日にかけての宿泊は対象外）。
        石垣市・宮古島市などでは県分と市町村分に分かれますが、宿泊者が払う合計は同じとみられます。
      </p>

      <h2>東京の10,000〜12,999円の宿泊は、改正で安くなる</h2>
      <p>
        東京都の宿泊税は、2027年3月31日の宿泊分までは1人1泊10,000円以上で100円・15,000円以上で200円の定額です。
        2027年4月1日の宿泊分から<strong>宿泊料金の3%</strong>に変わり、非課税の線が10,000円未満から
        <strong>13,000円未満</strong>に上がります。そのため、
        <strong>
          1人1泊{yen(tokyoMidBand.price)}の宿泊は{yen(tokyoMidBand.before)}から{yen(tokyoMidBand.after)}
          に下がります
        </strong>
        。一方、13,000円以上は3%になるので、高い部屋ほど上がり幅が大きくなります。
      </p>
      <table>
        <thead>
          <tr>
            <th>1人1泊の料金</th>
            <th>〜2027/3/31</th>
            <th>2027/4/1〜</th>
            <th>差</th>
          </tr>
        </thead>
        <tbody>
          {tokyoExamples.map((e) => (
            <tr key={e.price}>
              <td style={{ textAlign: 'left' }}>{yen(e.price)}</td>
              <td>{yen(e.before)}</td>
              <td>{yen(e.after)}</td>
              <td>{e.diff === 0 ? '—' : e.diff > 0 ? `+${yen(e.diff)}` : `−${yen(-e.diff)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        東京都の3%の端数処理（料金・税額の切り捨ての単位）と上限の有無は、主税局の案内にまだ書かれていません。
        ここでは1円未満切り捨て・上限なしで計算しています。
      </p>

      <h2>「宿泊料金」に含めるもの</h2>
      <p>
        宿泊税の「宿泊料金」は、素泊まりの料金（食事代や消費税等を含めない額）とする自治体が多くあります（沖縄県・京都市・大阪府の案内）。
        朝食付きのプランなら、食事の分を除いた額を入れてください。東京都の改正後の定義は条例で確かめているところです。
      </p>

      <h2>民泊・簡易宿所も対象になる（東京）</h2>
      <p>
        東京都では2027年4月1日の宿泊分から、ホテル・旅館に加えて簡易宿所と民泊（新法民泊・特区民泊）も対象になります。
        運営者は宿泊者から宿泊税を預かって都に納める側（特別徴収義務者）になります。1泊あたりの預かる額はこの計算機で出せますが、
        申告の手続きは都の案内に従ってください。
      </p>

      <h2>関連する計算機</h2>
      <p>
        旅行の費用の精算には<ToolLink slug="warikan">割り勘 計算</ToolLink>、税込・税抜の計算には
        <ToolLink slug="shohizei-keisan">消費税 計算</ToolLink>、改正の前後を並べる計算機には
        <ToolLink slug="tabako-zei-neage">たばこ税 値上げ 計算</ToolLink>もあります。
      </p>

      <div className="note">
        本ツールは宿泊税の一般的な計算の目安です。課税免除・宿泊料金の範囲は自治体の条例と案内に従います。
        出張の宿泊税を経費にできるかなど、税務の扱いはこのページでは扱いません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shukuhakuzei" />

      <ToolMeta slug="shukuhakuzei" ymyl>
        出典：
        <a
          href="https://www.metro.tokyo.lg.jp/information/press/2026/06/2026063004"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          東京都 報道発表（2026年6月30日）
        </a>
        ／
        <a
          href="https://www.tax.metro.tokyo.lg.jp/kazei/leisure/shuk/2"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          東京都主税局「宿泊税」
        </a>
        ／
        <a
          href="https://www.pref.okinawa.jp/kurashikankyo/zeikin/1003660/1036559/1041134.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          沖縄県「宿泊税」
        </a>
        ／
        <a
          href="https://www.city.kyoto.lg.jp/gyozai/page/0000236942.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          京都市「宿泊税について」
        </a>
        ／
        <a
          href="https://www.pref.osaka.lg.jp/o050040/zei/alacarte/shukuhakuzei-kaisei.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          大阪府「宿泊税の改正」
        </a>
        ／地方税法731条以下にもとづき作成（税率の確認日 {formatYmdJa(DATA_CHECKED_AT)}）。
      </ToolMeta>
    </>
  );
}
