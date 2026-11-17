import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { DATA_CHECKED_AT, calcMenkyo, formatJaWithWeekday, parseDate } from '@/lib/menkyo-koshin';
import Calculator from './Calculator';

const title = '運転免許の更新期間 計算｜いつからいつまで・土日年末年始の延長・高齢者講習';
const description =
  '生年月日と免許証の期限を入れると、更新できる期間（誕生日の1か月前〜）・土日祝や年末年始（12/29〜1/3は1/4まで）で延びる最終日・70歳以上の高齢者講習を受けられる期間・次の有効期限を、道路交通法の条文どおりに日付で出します。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['免許更新 いつから', '免許更新 期間 計算', '免許更新 年末年始', '免許 有効期限 土日', '高齢者講習 いつから'],
  alternates: { canonical: `${SITE_URL}/menkyo-koshin/` },
  robots: robotsFor('menkyo-koshin'),
};

/** 本文の例はロジックから出す（手で日付を書かない）。仕様書「確かめること」の5ケース */
const EXAMPLES = [
  ['1980-09-27', '2026-10-27', '平日（警察の案内の例）'],
  ['1975-11-29', '2026-12-29', '年末年始（12/29〜1/3）'],
  ['1990-01-01', '2026-02-01', '日曜'],
  ['1984-02-29', '2026-03-28', '2月29日生まれ・土日'],
  ['1956-04-05', '2026-05-05', '祝日と振替休日'],
].map(([birth, expiry, note]) => ({ birth, note, r: calcMenkyo({ birth, expiry, term: 'five' })! }));

/** 「年齢の数え方」の具体例（70歳前後の3人） */
const AGE_EXAMPLES = ['1957-03-10', '1956-03-10', '1955-03-10'].map((birth) => ({
  birth,
  r: calcMenkyo({ birth, expiry: '2027-04-10', term: 'five' })!,
}));

const faq = [
  {
    q: '免許の更新はいつからいつまでですか？',
    a: '有効期限の直前の誕生日の1か月前から、有効期限（誕生日の1か月後の日）までです（道路交通法第101条1項）。たとえば9月27日生まれなら8月27日から10月27日までです。',
  },
  {
    q: '最終日が土日・祝日・年末年始ならどうなりますか？',
    a: '有効期限の日が土曜・日曜・祝日（振替休日を含む）・12月29日〜1月3日に当たるときは、その翌日（連休なら休みが明けた日）まで延びます（第95条の6第3項・施行令第33条の8）。12月29日〜1月3日に期限が来る人は1月4日までです。ただし延びた日に窓口が開いているかは都道府県で違うので、住所地の警察で確かめてください。',
  },
  {
    q: '誕生日の前に更新すると損ですか？',
    a: '損しません。更新期間内なら、誕生日の前に更新しても後に更新しても、次の有効期限は同じ日になります（第95条の6の表の備考三）。年齢も誕生日の前日の年齢で数えます。',
  },
  {
    q: '70歳・75歳になる年の更新は何が違いますか？',
    a: '更新期間が満了する日に70歳以上なら高齢者講習、75歳以上なら認知機能検査を、満了する日前6か月以内に受けます（第101条の4）。年齢は更新した日ではなく満了する日で判定するので、70歳の誕生日が更新期間に入る人も講習の対象です。一方、次の有効期間の年数は更新日（誕生日の前日）の年齢で決まるので、その人は5年になります。',
  },
  {
    q: 'マイナ免許証の有効期限はどこで見ますか？',
    a: 'マイナポータルの「運転免許情報」や、警察庁の免許情報の読み取りアプリで確かめられます。有効期間の数え方は免許証と同じなので、その日付をこの計算機に入れてください。',
  },
  {
    q: 'うっかり期限が切れたらどうなりますか？',
    a: '免許は効力を失い、運転すると無免許運転です。失効した日から6か月以内なら、学科・技能試験の免除を受けて取り直せます（第97条の2第1項第3号）。海外旅行・災害・入院などやむを得ない理由があったときは、失効から3年以内で、その事情がやんでから1か月以内です。',
  },
];

const trail = breadcrumbFor('menkyo-koshin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '運転免許の更新期間 計算機',
      url: `${SITE_URL}/menkyo-koshin/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('menkyo-koshin'),
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

/** '1980-09-27' → '1980年9月27日' */
const ja = (iso: string) => {
  const p = parseDate(iso)!;
  return `${p.year}年${p.month}月${p.day}日`;
};

const cell = { textAlign: 'left' as const, padding: '6px 6px' };

const SOURCES = [
  ['https://laws.e-gov.go.jp/law/335AC0000000105', 'e-Gov 法令検索「道路交通法」第95条の6・第97条の2・第101条・第101条の2・第101条の4・第105条'],
  ['https://laws.e-gov.go.jp/law/335CO0000000270', 'e-Gov 法令検索「道路交通法施行令」第33条の8・第37条の6の3'],
  ['https://www.pref.yamaguchi.lg.jp/uploaded/attachment/178846.pdf', '山口県警察「運転免許証の有効期間の末日が休日の場合」'],
  [
    'https://www.pref.yamanashi.jp/police/p_soumu/kouhoudayori/0811menkyokoushin.html',
    '山梨県警察「年末年始における運転免許の更新業務」',
  ],
] as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>運転免許の更新期間 計算機</h1>
      <p className="lead">
        生年月日と免許証の期限を入れると、更新できる期間・土日や年末年始で延びる最終日・70歳以上の講習を受けられる期間・次の期限を日付で出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>更新期間の計算のしかた</h2>
      <ol>
        <li>
          <strong>始まり</strong>：有効期限の直前の誕生日の<strong>1か月前の日</strong>（道路交通法第101条1項）。2月29日生まれは、うるう年でない年は2月28日を誕生日とみなします（同条2項）。
        </li>
        <li>
          <strong>終わり</strong>：免許証の有効期限（誕生日の1か月後の日）。その日が<strong>土曜・日曜・祝日・12月29日〜1月3日</strong>
          なら、そうでない日まで延びます（第95条の6第3項・施行令第33条の8）。
        </li>
      </ol>
      <p>次の有効期間の末日は、条文の表（第95条の6第1項）で決まります。</p>
      <table>
        <thead>
          <tr>
            <th style={cell}>区分</th>
            <th style={cell}>更新日の年齢</th>
            <th style={cell}>次の有効期限</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>優良・一般運転者（ゴールド・ブルー5年）</td>
            <td style={cell}>70歳未満</td>
            <td style={cell}>5回目の誕生日の1か月後</td>
          </tr>
          <tr>
            <td style={cell}>〃</td>
            <td style={cell}>70歳</td>
            <td style={cell}>4回目の誕生日の1か月後</td>
          </tr>
          <tr>
            <td style={cell}>〃</td>
            <td style={cell}>71歳以上</td>
            <td style={cell}>3回目の誕生日の1か月後</td>
          </tr>
          <tr>
            <td style={cell}>違反運転者等・初回更新（ブルー3年・グリーン）</td>
            <td style={cell}>—</td>
            <td style={cell}>3回目の誕生日の1か月後</td>
          </tr>
        </tbody>
      </table>

      <h2>年齢を見る日は2つある</h2>
      <table>
        <thead>
          <tr>
            <th style={cell}>何を決めるか</th>
            <th style={cell}>どの日の年齢で見るか</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>高齢者講習・認知機能検査が要るか</td>
            <td style={cell}>更新期間が満了する日（延長後の末日）。第101条の4</td>
          </tr>
          <tr>
            <td style={cell}>次の有効期間が何年か</td>
            <td style={cell}>更新日。ただし誕生日の当日・後に更新したら、誕生日の前日で数える（第95条の6の表の備考二・三）</td>
          </tr>
        </tbody>
      </table>
      <p>
        更新期間はいつも誕生日をまたぐので、満了する日の年齢は更新日の年齢より1つ上になります。そのため、70歳の誕生日が更新期間に入る人は
        <strong>高齢者講習は要るのに、次の有効期間は5年</strong>です。券面の期限が{ja('2027-04-10')}の3人の例：
      </p>
      <table>
        <thead>
          <tr>
            <th style={cell}>生年月日</th>
            <th style={cell}>満了日の年齢</th>
            <th style={cell}>講習</th>
            <th style={cell}>次の有効期限</th>
          </tr>
        </thead>
        <tbody>
          {AGE_EXAMPLES.map(({ birth, r }) => (
            <tr key={birth}>
              <td style={cell}>{ja(birth)}</td>
              <td style={cell}>{r.senior.ageAtEnd}歳</td>
              <td style={cell}>{r.senior.lecture ? '要' : '不要'}</td>
              <td style={cell}>
                {formatJaWithWeekday(r.next.date)}（{r.next.birthdays}回目）
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>例：曜日と祝日で最終日はこう延びる</h2>
      <table>
        <thead>
          <tr>
            <th style={cell}>生年月日</th>
            <th style={cell}>更新できる期間</th>
            <th style={cell}>ケース</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLES.map(({ birth, note, r }) => (
            <tr key={birth}>
              <td style={cell}>{ja(birth)}</td>
              <td style={cell}>
                {formatJaWithWeekday(r.window.start)}〜{formatJaWithWeekday(r.window.legalEnd)}
                {r.window.extended && `（本来は${formatJaWithWeekday(r.window.expiry)}）`}
              </td>
              <td style={cell}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        土曜・祝日・年末年始は、多くの運転免許センターや警察署で窓口が開いていません。延びた最終日に受け付けているかは、住所地の警察で確かめてください。
        災害救助法が適用された地域では、有効期間を一律に延ばす措置が出ることがあります。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="menkyo-koshin" />

      <PublicToolLink slug="mynumber-kigen">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          同じ「誕生日基準の期限」：<ToolLink slug="mynumber-kigen">マイナンバーカード・電子証明書の有効期限チェッカー</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="sokudo-ihan-hansokukin">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          道路交通法の反則金：<ToolLink slug="sokudo-ihan-hansokukin">速度違反の反則金・点数 早見表</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="jitensha-hansokukin">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          自転車の青切符：<ToolLink slug="jitensha-hansokukin">自転車の反則金 早見表・チェッカー</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="menkyo-koshin" ymyl="legal">
        出典：
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '／'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        。このページは条文から日付を出す目安で、正式な期限は免許証の券面と警察から届く更新連絡書で確かめてください。
        優良運転者になるか・運転技能検査の対象かは判定しません。高齢者講習を受けられる期間の始まり（満了する日の6か月前の応当日を含むか）は確定していないので「ごろ」として出しています。
        月末生まれで1か月前に同じ日が無いとき（3月31日生まれなど）は、その月の末日を更新期間の始まりとしています。一次情報の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
