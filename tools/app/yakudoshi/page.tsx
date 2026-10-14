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
  chojuTable,
  taiyakuBirthYears,
  YAKU_NOTE,
  YAKUDOSHI_YEAR,
  yakudoshiDescription,
  yakudoshiTable,
  yearWithWareki,
  type Sex,
} from '@/lib/toshi-iwai';
import Calculator from './Calculator';

/**
 * title・description・早見表の年。**定数の年だけで作る**（ビルド日・アクセス日では変えない）。
 * 年の切り替えは `lib/toshi-iwai.ts` の `YAKUDOSHI_YEAR` の 1 行（10 月に翌年へ）。
 */
const year = YAKUDOSHI_YEAR;
const taiyaku = taiyakuBirthYears(year);
const choju = chojuTable(year);
const kanreki = choju.find((r) => r.choju.name === '還暦');

const title = `厄年 早見表 ${year}｜前厄・本厄・後厄は何年生まれ？還暦・古希など長寿祝いも計算`;
const description = yakudoshiDescription(year);

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/yakudoshi/` },
  robots: robotsFor('yakudoshi'),
};

const faq = [
  {
    q: '厄年の区切りは1月1日ですか？節分（立春）ですか？',
    a: '数え年は1月1日に1歳ずつ増えるので、このツールは1月1日で年を区切っています。ただし、旧暦の考え方から立春（節分の翌日）を1年の始まりとする寺社もあり、その場合は1月1日から節分までに生まれた人の数え方が1年ずれることがあります。区切りの日付は寺社によって違うため、このツールは立春区切りの計算をしていません。お参りする寺社が立春で区切っているかどうかは、その寺社に確認してください。',
  },
  {
    q: '女性の61歳は厄年ですか？',
    a: '一般には女性の本厄は数え年で19歳・33歳・37歳とされますが、61歳を含める寺社もあります。このツールでは既定では含めず、「女性の61歳も含める」にチェックを入れると、数え61歳を本厄、その前後を前厄・後厄として表示します。男性の61歳は一般的な本厄に含まれます。',
  },
  {
    q: '還暦は数え61歳と満60歳のどちらですか？',
    a: `同じ年です。還暦は生まれた年の干支（十干十二支）が60年で一巡して戻ることを祝うもので、数え年では61歳、満年齢では60歳（その年の誕生日で60歳）にあたり、どちらで数えても同じ年になります。${year}年の還暦は${kanreki?.manBirthYear}年生まれの人です。古希（70歳）・喜寿（77歳）・米寿（88歳）などは、もともと数え年で祝うのが伝統ですが、満年齢で祝うことも多いので、このツールは両方の年を出しています。緑寿（66歳）は満年齢で祝うのが一般的なので満年齢の年だけを出します。`,
  },
];

const trail = breadcrumbFor('yakudoshi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '厄年・長寿祝い 早見表',
      url: `${SITE_URL}/yakudoshi/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('yakudoshi'),
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

const SEX_LABELS: Record<Sex, string> = { male: '男性', female: '女性' };

/** その年の厄年の早見表（男女それぞれ） */
function YakuTable({ sex }: { sex: Sex }) {
  const rows = yakudoshiTable(year, sex);
  const honAges = [...new Set(rows.map((r) => r.honAge))];
  return (
    <table>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
        {year}年の厄年（{SEX_LABELS[sex]}・数え年）
      </caption>
      <thead>
        <tr>
          <th scope="col">本厄の年齢</th>
          <th scope="col">前厄</th>
          <th scope="col">本厄</th>
          <th scope="col">後厄</th>
        </tr>
      </thead>
      <tbody>
        {honAges.map((honAge) => {
          const cell = (kind: 'mae' | 'hon' | 'ato') => {
            const r = rows.find((x) => x.honAge === honAge && x.kind === kind);
            return r ? `${yearWithWareki(r.birthYear)}生まれ（数え${r.age}）` : '—';
          };
          const isTaiyaku = rows.some((r) => r.honAge === honAge && r.taiyaku);
          return (
            <tr key={honAge}>
              <th scope="row">
                {honAge}歳{isTaiyaku && '（大厄）'}
              </th>
              <td>{cell('mae')}</td>
              <td style={{ fontWeight: isTaiyaku ? 700 : 400 }}>{cell('hon')}</td>
              <td>{cell('ato')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>厄年 早見表 {year}（前厄・本厄・後厄と長寿祝い）</h1>
      <p className="lead">
        <strong>
          {year}年の大厄（本厄）は、男性{taiyaku.male}年生まれ（数え42歳）・女性{taiyaku.female}
          年生まれ（数え33歳）
        </strong>
        。生年月日（または生まれ年）を入れると、前厄・本厄・後厄の年を一生分の表で出し、還暦・古希・喜寿・米寿などの長寿祝いの年も数え年・満年齢の両方で表示します。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2 id="yakudoshi-hayamihyo">{year}年の厄年 早見表</h2>
      <p>
        一般的な本厄は、男性が数え年で25歳・42歳・61歳、女性が19歳・33歳・37歳で、その前の年を前厄、後の年を後厄と呼びます。男性42歳・女性33歳は大厄とされます。数え年は「その年
        − 生まれ年 ＋ 1」で、誕生日に関係なく生まれ年だけで決まります。家族の厄年も探せるよう、男女とも載せています。
      </p>
      <YakuTable sex="male" />
      <YakuTable sex="female" />
      <p className="note">{YAKU_NOTE}</p>

      <h2 id="choju-hayamihyo">{year}年の長寿祝い 早見表</h2>
      <p>
        還暦は数え61歳・満60歳で、どちらで数えても同じ年です。古希から百寿までは数え年で祝うのが伝統で、満年齢で祝うことも多いので両方を載せています。緑寿は満66歳で祝うのが一般的なので、満年齢だけです。
      </p>
      <table>
        <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
          {year}年に長寿祝いを迎える人の生まれ年
        </caption>
        <thead>
          <tr>
            <th scope="col">祝い（年齢）</th>
            <th scope="col">数え年なら</th>
            <th scope="col">満年齢なら</th>
          </tr>
        </thead>
        <tbody>
          {choju.map((r) => (
            <tr key={r.choju.name}>
              <th scope="row">
                {r.choju.name}（{r.choju.reading}）{r.choju.age}歳
                {r.choju.manAge !== r.choju.age && `・満${r.choju.manAge}歳`}
              </th>
              <td>{r.kazoeBirthYear === null ? '—（満年齢で祝う）' : `${yearWithWareki(r.kazoeBirthYear)}生まれ`}</td>
              <td>{yearWithWareki(r.manBirthYear)}生まれ</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>数え年で厄年を数えるときの注意</h2>
      <p>
        厄年は満年齢ではなく数え年で数えるのが一般的です。数え年は生まれた年を1歳とし、1月1日ごとに1歳ずつ増えるので、満年齢より1〜2歳多くなります。たとえば{taiyaku.male}
        年生まれの男性は、{year}年の誕生日で満{year - taiyaku.male}歳ですが、数え年では{year}
        年の1年間ずっと42歳です。地域によっては年齢や区切りの日（1月1日か立春か）が異なるため、このページの表は一般的な数え方による目安です。
      </p>
      <p>
        満年齢や和暦は<Link href="/nenrei-keisan/">年齢計算</Link>で調べられます。
      </p>
      <PublicToolLink slug="shichigosan">
        <p>
          七五三の年は<ToolLink slug="shichigosan">七五三 早見表</ToolLink>で調べられます。
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

      <RelatedTools current="yakudoshi" />

      <ToolMeta slug="yakudoshi">
        厄年の年齢（男性25・42・61歳、女性19・33・37歳、大厄は男性42歳・女性33歳）と数え年の数え方は
        <a
          href="https://www.jinjahoncho.or.jp/omairi/yakubarai/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          神社本庁「厄祓い」
        </a>
        と
        <a
          href="https://crd.ndl.go.jp/reference/detail?page=ref_view&id=1000287211"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国立国会図書館 レファレンス協同データベース「日本の厄年・大厄にあたる年齢について知りたい」
        </a>
        を、長寿祝いの年齢は
        <a
          href="https://www.jinjahoncho.or.jp/omairi/choju/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          神社本庁「長寿祝い」
        </a>
        と
        <a
          href="https://crd.ndl.go.jp/reference/detail?page=ref_view&id=1000265191"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同データベース「年祝い（喜寿、白寿など）について詳しく知りたい」
        </a>
        を参照しています（厄年の年齢・区切りは寺社・地域によって異なります）。
      </ToolMeta>
    </>
  );
}
