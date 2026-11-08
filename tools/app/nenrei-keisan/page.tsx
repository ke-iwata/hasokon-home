import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  ageForBirthYear,
  ERAS,
  gradeRangeLabel,
  gyakubikiTable,
  GYAKUBIKI_MAX_AGE,
  warekiTable,
} from '@/lib/nenrei';
import Calculator from './Calculator';
import { baseYear, description, faq, grade18, title } from './copy';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nenrei-keisan/` },
  robots: robotsFor('nenrei-keisan'),
};

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

/** 生まれ年から、基準年の満年齢を表すセルの文言を作る */
function ageCell(year: number): string {
  const age = ageForBirthYear(year, baseYear);
  if (!age) return '—';
  if (age.before === null) return `0歳（${baseYear}年生まれ）`;
  return `${age.after}歳（誕生日前は${age.before}歳）`;
}

/** 早見表は元号ごとに1つの表にする。改元年は両方の元号に現れる */
function WarekiTable({ era }: { era: string }) {
  const rows = warekiTable(era);
  return (
    <table>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
        {era}の西暦・和暦・年齢（{baseYear}年基準）
      </caption>
      <thead>
        <tr>
          <th scope="col">和暦</th>
          <th scope="col">西暦</th>
          <th scope="col">{baseYear}年の年齢</th>
          <th scope="col">干支</th>
          <th scope="col">備考</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.year}年</td>
            <td>{ageCell(row.year)}</td>
            <td>{row.eto}</td>
            <td>{row.note ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 「◯歳は何年生まれ？」の逆引き早見表（0〜100歳） */
function GyakubikiTable() {
  return (
    <table>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
        年齢から生まれ年を引く（{baseYear}年基準）
      </caption>
      <thead>
        <tr>
          <th scope="col">年齢</th>
          <th scope="col">
            {baseYear}年の誕生日を迎えた人
          </th>
          <th scope="col">
            {baseYear}年の誕生日がまだの人
          </th>
        </tr>
      </thead>
      <tbody>
        {gyakubikiTable(baseYear).map((row) => (
          <tr key={row.age}>
            <th scope="row">{row.age}歳</th>
            <td>
              {row.bornAfter}年{row.bornAfterWareki && `（${row.bornAfterWareki}）`}生まれ
            </td>
            <td>
              {row.bornBefore}年{row.bornBeforeWareki && `（${row.bornBeforeWareki}）`}生まれ
            </td>
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

      <h1>年齢計算・年齢早見表【{baseYear}年版】</h1>
      <p className="lead">
        生年月日を入れるだけで、今日時点の満年齢と「満何歳何ヶ月」、和暦表記が分かります。西暦でも和暦（明治・大正・昭和・平成・令和）でも入力でき、誕生日までの日数・干支・入学卒業年の目安もまとめて表示します。下には
        <a href="#hayamihyo">{baseYear}年版の年齢早見表</a>と
        <a href="#gyakubiki">「◯歳は何年生まれ？」の逆引き早見表</a>
        も置いています。基準日を変えれば「あの日に何歳だったか」も計算できます。
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

      <h2>満何歳何ヶ月の数え方</h2>
      <p>
        保育園・幼稚園の申込書や母子健康手帳、健診の案内では「満◯歳◯ヶ月」「生後◯ヶ月」を書く欄があります。月の数え方は満年齢と同じで、
        <strong>生まれた日と同じ日（応当日）を迎えるたびに1ヶ月増え、まだ迎えていない月は数えません</strong>
        。5月15日生まれの人が8月10日時点なら、8月15日をまだ迎えていないので「2ヶ月と26日」です。
      </p>
      <p>
        応当日が存在しない月もあります。1月31日生まれの人の1ヶ月後は、2月31日が無いので民法143条2項ただし書きにより2月の末日（2月28日）の終了時に満了し、3月1日から1ヶ月になります。2月29日生まれが平年は3月1日に年をとるのと同じ考え方です。上の計算機は満年齢の下に「満◯歳◯ヶ月（◯日）」を表示し、2歳未満のときは「生後◯ヶ月」も併記します。
      </p>

      <h2 id="hayamihyo">年齢早見表【{baseYear}年版】（西暦・和暦・年齢）</h2>
      <p>
        明治から令和までの、西暦・和暦・
        <strong>{baseYear}年時点の満年齢</strong>
        の対応表です。年齢の列は「{baseYear}
        年の誕生日を迎えたあとの満年齢」を主に置き、誕生日がまだの人の年齢をかっこで併記しています（満年齢は誕生日で変わるため、1つの生まれ年に答えが2つあります）。
        {baseYear}年より後に生まれる年は「—」です。
      </p>
      <p>
        改元のあった年は両方の元号に現れます（備考欄に「◯月◯日まで」「◯月◯日から」と記載）。干支は暦年（1月1日〜12月31日）を単位に十干十二支で示しています。特定の日付時点の年齢が要るときは、ページ上部の計算機で基準日を変えてください。
      </p>
      <div className="note">
        明治元年〜明治5年の月日は旧暦（太陰太陽暦）です。日本がグレゴリオ暦（新暦）に切り替えたのは明治6年1月1日（1873年1月1日）で、それ以前は和暦の月日と西暦の月日が対応しません。表の年の対応は目安としてご利用ください。
      </div>
      {[...ERAS].reverse().map((era) => (
        <WarekiTable key={era.name} era={era.name} />
      ))}

      <h2 id="gyakubiki">◯歳は何年生まれ？（逆引き早見表・{baseYear}年基準）</h2>
      <p>
        年齢から生まれ年を引く表です。0歳から{GYAKUBIKI_MAX_AGE}
        歳まで、{baseYear}年に誕生日を迎えたあとの人と、まだの人の2列に分けています。
      </p>
      <p>
        学年で数えたいときは1つずれることがあります。たとえば
        {baseYear}年度に18歳になる学年は「{gradeRangeLabel(grade18)}」（
        {grade18.cohortYear}年度生まれ）で、{grade18.from.year}年生まれと{grade18.to.year}
        年生まれの両方を含みます。年齢の要件が年度で決まる手続き（受験・免許・各種手当など）では、生まれ年ではなく生年月日で確認してください。
      </p>
      <GyakubikiTable />

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
          {f.q === '満年齢と数え年の違いは何ですか？' && (
            <>
              <PublicToolLink slug="shichigosan">
                <p>
                  七五三の年は数え年・満年齢の両方で
                  <ToolLink slug="shichigosan">七五三 早見表</ToolLink>で調べられます。
                </p>
              </PublicToolLink>
              <PublicToolLink slug="yakudoshi">
                <p>
                  厄年や還暦などの年は
                  <ToolLink slug="yakudoshi">厄年・長寿祝い 早見表</ToolLink>で調べられます。
                </p>
              </PublicToolLink>
            </>
          )}
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
