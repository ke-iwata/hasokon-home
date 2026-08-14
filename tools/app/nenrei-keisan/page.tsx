import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { ERAS, warekiTable } from '@/lib/nenrei';
import Calculator from './Calculator';

const title = '年齢計算・西暦和暦変換｜満年齢と昭和・平成・令和の早見表';
const description =
  '生年月日から満年齢を計算。西暦と和暦（明治・大正・昭和・平成・令和）を相互に変換でき、「昭和45年生まれは何歳」「令和8年は西暦何年」がすぐ分かります。誕生日までの日数・干支・入学卒業年の目安つき。早見表も掲載した無料ツールです。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nenrei-keisan/` },
};

const faq = [
  {
    q: '満年齢と数え年の違いは何ですか？',
    a: '満年齢は生まれた日を0歳とし、誕生日が来るたびに1歳ずつ増える数え方で、現在の日本では法律上も日常でも満年齢を使います。一方の数え年は、生まれた時点を1歳とし、以後は誕生日ではなく1月1日に全員が1歳ずつ増える数え方です。そのため数え年は、誕生日を迎える前なら満年齢＋2歳、迎えた後なら満年齢＋1歳になります。七五三や厄年、年忌法要など一部の慣習では今も数え年が使われることがありますが、このツールが出すのは満年齢です。',
  },
  {
    q: '法律上、年齢はいつ増えるのですか？',
    a: '「年齢計算ニ関スル法律」は、年齢を出生の日から起算すると定めています。民法143条により1年の期間は「応当日の前日の終了時」に満了するため、法律上は誕生日の前日が終わる瞬間（24時）に1つ年をとります。日常的な感覚では「誕生日当日に1歳増える」と考えて差し支えなく、このツールも誕生日当日から新しい年齢を表示します。前日か当日かが実際に効いてくるのは、4月1日生まれの学年や、年度末に年齢の要件が関わる手続きの場面です。',
  },
  {
    q: 'なぜ4月1日生まれは早生まれ（1つ上の学年）になるのですか？',
    a: '学校教育法17条は「満6歳に達した日の翌日以後における最初の学年の初め」から小学校に就学すると定めています。年齢は誕生日の前日の終了時に増えるので、4月1日生まれの人は3月31日に満6歳に達し、その翌日である4月1日から始まる学年に入ります。4月2日生まれの人は4月1日に満6歳となり、就学は翌年の4月です。この1日の差で学年が分かれるため、同じ学年になるのは「4月2日生まれ〜翌年4月1日生まれ」の範囲です。',
  },
  {
    q: '2月29日生まれの人は、平年には何日に年をとりますか？',
    a: '平年には2月29日が存在しないため、民法143条2項ただし書きにより期間はその月の末日（2月28日）の終了時に満了します。つまり2月28日が終わる瞬間に年齢が増えるので、日付でいえば3月1日から新しい年齢になります。このツールも同じ考え方で、平年は2月28日時点ではまだ増えず、3月1日に増えるものとして計算しています。なお、年齢に達した日を2月28日とする扱いをする制度もあるため、期限が関わる手続きでは窓口に確認してください。',
  },
  {
    q: '令和8年は西暦何年ですか？',
    a: '2026年です。令和は2019年5月1日から始まり、令和元年が2019年にあたるので「西暦 ＝ 令和の年 + 2018」で換算できます。同じように、平成は「西暦 ＝ 平成の年 + 1988」、昭和は「西暦 ＝ 昭和の年 + 1925」、大正は「＋1911」、明治は「＋1867」です。ただし改元のあった年は元号が2つにまたがるので、月日まで確認する必要があります。',
  },
  {
    q: '昭和64年や平成31年はいつまでですか？',
    a: '昭和64年は1989年1月1日から1月7日までの7日間で、1月8日からは平成元年になります。平成31年は2019年1月1日から4月30日までで、5月1日からは令和元年です。同じ西暦年に2つの元号が存在するため、書類の年月日を和暦で書くときは月日まで見て判断してください。このツールの変換では、たとえば「昭和64年1月8日」のように存在しない日付を入力すると、その旨を表示します。',
  },
  {
    q: '干支（えと）は西暦の何年から数えるのですか？',
    a: 'このツールでは、暦年（1月1日から12月31日まで）を単位として、西暦年から十二支を求めています。西暦年を12で割った余りが4なら子、5なら丑…という対応で、2026年は午年です。あわせて十干（甲・乙・丙…）と組み合わせた60年周期の干支（2026年なら丙午）も表示しています。なお、占いの流派によっては立春を境に切り替える数え方もありますが、このツールは採用していません。',
  },
  {
    q: '明治より前の和暦には対応していますか？',
    a: '対応していません。日本が現在のグレゴリオ暦（新暦）を採用したのは明治6年1月1日（1873年1月1日）からで、それ以前の和暦の月日は旧暦（太陰太陽暦）にもとづくため、西暦の月日と機械的に対応させられないためです。このツールは明治以降を対象とし、明治元年〜明治5年については年の対応のみを示したうえで、月日が旧暦である旨の注記を出します。',
  },
];

const trail = breadcrumbFor('nenrei-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '年齢計算・西暦和暦変換',
      url: `${SITE_URL}/nenrei-keisan/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('nenrei-keisan'),
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

/** 早見表は元号ごとに1つの表にする。改元年は両方の元号に現れる */
function WarekiTable({ era }: { era: string }) {
  const rows = warekiTable(era);
  return (
    <table>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
        {era}の西暦・和暦対応
      </caption>
      <thead>
        <tr>
          <th scope="col">和暦</th>
          <th scope="col">西暦</th>
          <th scope="col">干支</th>
          <th scope="col">備考</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.year}年</td>
            <td>{row.eto}</td>
            <td>{row.note ?? ''}</td>
          </tr>
        ))}
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

      <h1>年齢計算・西暦和暦変換</h1>
      <p className="lead">
        生年月日を入れるだけで、今日時点の満年齢と和暦表記が分かります。西暦でも和暦（明治・大正・昭和・平成・令和）でも入力でき、誕生日までの日数・干支・入学卒業年の目安もまとめて表示します。基準日を変えれば「あの日に何歳だったか」も計算できます。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>満年齢の数え方</h2>
      <p>
        満年齢は、生まれた日を0歳として誕生日ごとに1歳ずつ増える数え方です。履歴書・各種申請書で「年齢」と書かれていれば、ほぼすべて満年齢を指します。計算そのものは「基準日の年 −
        生まれた年」で、基準日がまだ誕生日を迎えていなければ1を引く、という単純なものです。
      </p>
      <p>
        法律上の扱いは少しだけ違います。「年齢計算ニ関スル法律」は年齢を出生の日から起算すると定めており、民法143条により1年の期間は応当日の前日が終わる時点（24時）で満了します。つまり
        <strong>年齢が増えるのは誕生日の前日の終了時</strong>
        です。日常的には「誕生日当日に1つ増える」と考えて問題ありませんが、4月1日生まれの学年や、年度末が関わる手続きではこの違いが結果を分けます。
      </p>

      <h2>西暦と和暦の対応（換算のしかた）</h2>
      <p>
        改元のあった年をまたがなければ、和暦と西暦は足し算・引き算だけで換算できます。
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">元号</th>
            <th scope="col">期間</th>
            <th scope="col">西暦への換算</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">令和</th>
            <td>2019年5月1日〜</td>
            <td>令和 + 2018</td>
          </tr>
          <tr>
            <th scope="row">平成</th>
            <td>1989年1月8日〜2019年4月30日</td>
            <td>平成 + 1988</td>
          </tr>
          <tr>
            <th scope="row">昭和</th>
            <td>1926年12月25日〜1989年1月7日</td>
            <td>昭和 + 1925</td>
          </tr>
          <tr>
            <th scope="row">大正</th>
            <td>1912年7月30日〜1926年12月24日</td>
            <td>大正 + 1911</td>
          </tr>
          <tr>
            <th scope="row">明治</th>
            <td>1868年1月25日〜1912年7月29日</td>
            <td>明治 + 1867</td>
          </tr>
        </tbody>
      </table>
      <p>
        注意が必要なのは改元のあった年です。たとえば1989年は1月7日までが昭和64年、1月8日からが平成元年で、
        <strong>同じ西暦年に2つの元号が存在します</strong>
        。2019年も4月30日までが平成31年、5月1日からが令和元年です。年だけで換算すると1つずれることがあるので、書類では月日まで確認してください。
      </p>

      <h2>早生まれと学年の関係</h2>
      <p>
        学校教育法17条は、小学校への就学を「満6歳に達した日の翌日以後における最初の学年の初め」からと定めています。年齢が増えるのは誕生日の前日の終了時なので、
        <strong>4月1日生まれの人は3月31日に満6歳に達し、その年の4月に入学します</strong>
        。4月2日生まれの人は4月1日に満6歳となるため、就学は翌年です。
      </p>
      <p>
        この結果、同じ学年になるのは「4月2日生まれ〜翌年4月1日生まれ」の範囲になります。1月1日から4月1日までに生まれた人がいわゆる早生まれで、同じ暦年に生まれた4月2日以降の人より1学年上になります。上の計算機では、この規則にもとづいて小学校入学から大学卒業（4年制・現役）までの年月を表示します。浪人・留年・飛び級・海外の学校を経た場合は当てはまりません。
      </p>

      <h2>西暦・和暦 早見表</h2>
      <p>
        明治から令和までの対応表です。改元のあった年は両方の元号に現れます（備考欄に「◯月◯日まで」「◯月◯日から」と記載）。干支は暦年（1月1日〜12月31日）を単位に十干十二支で示しています。
      </p>
      <div className="note">
        明治元年〜明治5年の月日は旧暦（太陰太陽暦）です。日本がグレゴリオ暦（新暦）に切り替えたのは明治6年1月1日（1873年1月1日）で、それ以前は和暦の月日と西暦の月日が対応しません。表の年の対応は目安としてご利用ください。
      </div>
      {[...ERAS].reverse().map((era) => (
        <WarekiTable key={era.name} era={era.name} />
      ))}

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="nenrei-keisan" />

      <ToolMeta slug="nenrei-keisan">
        満年齢の計算は
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=322AC1000000096"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          年齢計算ニ関スル法律
        </a>
        および
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=129AC0000000089"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          民法143条
        </a>
        、学年の目安は
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=322AC0000000026"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          学校教育法17条
        </a>
        にもとづいています。学年の目安は浪人・留年・飛び級などがない場合のものです。
      </ToolMeta>
    </>
  );
}
