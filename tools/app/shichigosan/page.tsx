import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  SHICHIGOSAN_YEAR,
  shichigosanDescription,
  shichigosanTable,
  shichigosanWeekday,
  yearWithWareki,
} from '@/lib/toshi-iwai';
import Calculator from './Calculator';

/**
 * title・description・早見表の年。**定数の年だけで作る**（ビルド日・アクセス日では変えない）。
 * 年の切り替えは `lib/toshi-iwai.ts` の `SHICHIGOSAN_YEAR` の 1 行（11-16 以降に翌年へ）。
 * マウント後に変わるのは Calculator の「基準の年」の既定値だけ。
 */
const year = SHICHIGOSAN_YEAR;
const table = shichigosanTable(year);
const [row3, row5, row7] = table;

const title = `七五三はいつ？${year}年は何年生まれ｜数え年・満年齢の早見表と計算`;
const description = shichigosanDescription(year);

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shichigosan/` },
  robots: robotsFor('shichigosan'),
};

const faq = [
  {
    q: '七五三は数え年と満年齢のどちらで祝いますか？',
    a: `どちらで祝っても差し支えないとされ、決まりはありません。もともとは数え年（生まれた年を1歳とし、1月1日ごとに1歳ずつ加える数え方）で祝うのが慣習でしたが、いまは満年齢で祝う家庭も多くあります。${year}年の3歳の七五三なら、数え年では${row3.kazoeBirthYear}年生まれ、満年齢では${row3.manBirthYear}年生まれの子が当たります。兄弟姉妹の年回りや、写真撮影・着物の大きさ、子どもの体力を見て決める家庭が多いようです。このツールは両方の年を並べて出し、どちらが正しいとは決めていません。`,
  },
  {
    q: '早生まれの子の七五三はいつになりますか？',
    a: `早生まれ（1月1日〜4月1日生まれ）の子は、同じ学年のお友だちの多く（4月2日〜12月31日生まれ）より1年遅れて満年齢に達します。そのため満年齢で祝うと、同じ学年の子より1年遅い七五三になります。学年で揃えたいときは、満年齢で祝う年の前年（数え年で祝う年と同じ年）にする家庭もあります。このツールに生年月日を入れると、早生まれのときだけ「同じ学年のお友だちと揃えるなら◯年」を表示します。生まれ年だけの入力では早生まれを判定できないので表示しません。`,
  },
  {
    q: '男の子は何歳、女の子は何歳で祝いますか？',
    a: '一般的には、男の子は3歳と5歳、女の子は3歳と7歳で祝います。3歳は男女とも、5歳は男の子、7歳は女の子です。ただし、男の子の3歳を祝うかどうかは地域や家庭によって違い、5歳だけ祝う地域もあります。日にちは11月15日が目安ですが、いまは10月から11月の都合のよい休日にお参りする家庭が多く、日付にこだわる必要はありません。',
  },
];

const trail = breadcrumbFor('shichigosan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '七五三はいつ？早見表・計算',
      url: `${SITE_URL}/shichigosan/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shichigosan'),
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

      <h1>七五三はいつ？{year}年は何年生まれ</h1>
      <p className="lead">
        <strong>
          {year}年の七五三は、数え年なら{row3.kazoeBirthYear}年・{row5.kazoeBirthYear}年・
          {row7.kazoeBirthYear}年生まれ、満年齢なら{row3.manBirthYear}年・{row5.manBirthYear}年・
          {row7.manBirthYear}年生まれ
        </strong>
        （3歳・5歳・7歳の順）。子どもの生年月日を入れると、数え年と満年齢のそれぞれで七五三の年と、その年の11月15日の曜日が分かります。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2 id="hayamihyo">{year}年の七五三 早見表</h2>
      <p>
        {year}年11月15日は{shichigosanWeekday(year)}
        曜日です。数え年は「その年 − 生まれ年 ＋ 1」、満年齢は「その年の誕生日を迎えたあとの年齢」で数えています。
      </p>
      <table>
        <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
          {year}年に七五三を祝う子の生まれ年
        </caption>
        <thead>
          <tr>
            <th scope="col">年齢</th>
            <th scope="col">数え年なら</th>
            <th scope="col">満年齢なら</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r) => (
            <tr key={r.age}>
              <th scope="row">
                {r.age}歳{r.age === 5 ? '（男の子）' : r.age === 7 ? '（女の子）' : '（男女）'}
              </th>
              <td>{yearWithWareki(r.kazoeBirthYear)}生まれ</td>
              <td>{yearWithWareki(r.manBirthYear)}生まれ</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>数え年と満年齢の数え方</h2>
      <p>
        <strong>数え年</strong>
        は、生まれた年を1歳とし、1月1日が来るたびに全員が1歳ずつ増える数え方です。誕生日に関係なく「その年 − 生まれ年 ＋
        1」で決まるので、同じ年に生まれた子は同じ年に七五三を迎えます。
        <strong>満年齢</strong>
        は、生まれた日を0歳とし、誕生日ごとに1歳ずつ増える、ふだん使っている数え方です。このページの「満年齢なら」の年は、その年の誕生日で3歳・5歳・7歳になる年を指します。11月15日より後に誕生日がある子は、七五三の日にはまだその年齢になっていません。
      </p>
      <p>
        たとえば{row3.manBirthYear}年5月生まれの子は、数え年なら{row3.manBirthYear + 2}年に3歳、満年齢なら
        {row3.manBirthYear + 3}
        年に3歳です。数え年で祝うほうが1年早くなります。誕生日ごとの満年齢や和暦は
        <Link href="/nenrei-keisan/">年齢計算</Link>でも確かめられます。
      </p>

      <h2>早生まれの子と学年</h2>
      <p>
        1月1日から4月1日までに生まれた子（早生まれ）は、同じ暦年の4月2日以降に生まれた子より1学年上になります。同じ学年の多くの子が満3歳になる年に、早生まれの子はまだ満2歳です。そのため、満年齢で祝うと同じ学年のお友だちより1年遅れ、数え年で祝うと同じ学年の多くの子の満年齢の年と揃います。上の計算機は、早生まれのときだけ「同じ学年のお友だちと揃えるなら◯年」を足して表示します。
      </p>

      <PublicToolLink slug="yakudoshi">
        <p>
          厄年や還暦・古希などの長寿祝いの年は
          <ToolLink slug="yakudoshi">厄年・長寿祝い 早見表</ToolLink>で調べられます。
        </p>
      </PublicToolLink>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shichigosan" />

      <ToolMeta slug="shichigosan">
        七五三の年齢と時期は
        <a
          href="https://www.jinjahoncho.or.jp/omairi/shichigosan/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          神社本庁「七五三」
        </a>
        を、早生まれ・学年の扱いは
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=322AC0000000026"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          学校教育法17条
        </a>
        を参照しています。年齢の数え方や祝う時期は地域・家庭によって異なります。お参りの時期や作法は、お参りする寺社に確認してください。
      </ToolMeta>
    </>
  );
}
