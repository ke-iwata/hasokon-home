import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { formatJa, parseDate, weekdayLabel, type DateParts } from '@/lib/date-parts';
import {
  HOLIDAY_FIRST_YEAR,
  HOLIDAY_LAST_YEAR,
  HOLIDAY_UPDATED_AT,
  holidaysIn,
} from '@/lib/nissu-keisan';
import Calculator from './Calculator';

const title = '日数計算・期日計算｜何日後・営業日を数える';
const description =
  '2つの日付のあいだの日数を計算し、「◯日後・◯営業日後はいつか」も求められます。初日を含む・含まないの切り替え、週数・月数の内訳、曜日つき。営業日は土日と国民の祝日（振替休日・国民の休日を含む）を除いて数えます。登録不要・無料。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nissu-keisan/` },
};

const faq = [
  {
    q: '「初日を含む」と「含まない」はどちらを選べばよいですか？',
    a: '目的によって変わります。契約や法令で定められた期間は、民法140条の「初日不算入の原則」により、期間の初日を数えず翌日から数えるのが原則です（「申込みの日から7日以内」なら翌日が1日目）。一方、イベントの日程や旅行の宿泊数のように「その日も含めて何日間か」を数えたいときは初日を含めます。このツールは両方を同時に表示するので、必要なほうを読み取ってください。なお民法140条には、期間が午前0時から始まるときは初日も算入するというただし書きがあり、実際の期限の判断は契約書や案内の文言に従ってください。',
  },
  {
    q: '「3日後」は起算日を数えますか？',
    a: '数えません。このツールの期日計算は、起算日の翌日を1日目として数えます。2026年8月15日の3日後は8月18日です。同じく「3営業日後」は、起算日の次の営業日を1営業日目として3つ目の営業日を返します。起算日そのものが土日や祝日であっても起算日は動かさず、そこから先の最初の営業日を1営業日目として数えます。',
  },
  {
    q: '営業日はどこまで考慮していますか？',
    a: '土曜・日曜と、国民の祝日（祝日法にもとづく祝日、および振替休日・国民の休日）を除いて数えています。会社ごとの年末年始休業・お盆休み・創立記念日といった独自の休業日は含みません。たとえば12月30日は、多くの企業が休みでもこのツールでは営業日として数えます。金融機関の休業日（土日祝と12月31日〜1月3日）とも異なるので、振込や手形の期日を確かめるときは各機関の案内をご確認ください。',
  },
  {
    q: '祝日のデータはいつのものですか？',
    a: `内閣府「国民の祝日について」で公開されている一覧にもとづき、${HOLIDAY_FIRST_YEAR}年1月1日から${HOLIDAY_LAST_YEAR}年12月31日までを収録しています（最終確認日は下部の「このページについて」に記載）。祝日は毎年2月ごろに翌年分が官報で公示され、春分の日・秋分の日は国立天文台の暦要項で確定します。まだ公示されていない年を式で推測すると営業日計算が静かに1日ずれるため、収録範囲を外れる日付が指定されたときは概算せず「祝日データの範囲外」と表示します。`,
  },
  {
    q: '「1か月後」は何日後のことですか？',
    a: '日数では決まりません。民法143条は、月で定めた期間は暦にしたがって計算し、起算日に応当する日の前日に満了すると定めています。つまり1月15日の1か月後は2月15日で、日数でいえば平年は31日後、うるう年も31日後ですが、2月15日から1か月後は3月15日（28日後または29日後）です。応当する日がない場合（1月31日の1か月後など）は、その月の末日が応当日として扱われるので、平年なら2月28日、うるう年なら2月29日になります。このツールの「月で数えると」の表示も同じ考え方です。',
  },
  {
    q: 'うるう年はどう扱っていますか？',
    a: 'グレゴリオ暦の規則どおりに扱っています。4で割り切れる年はうるう年、ただし100で割り切れる年は平年、400で割り切れる年はうるう年です（2000年はうるう年、2100年は平年）。日数の計算は暦日をそのまま数えるので、2月29日をまたぐ期間には自動的に1日多く含まれます。たとえば2024年2月1日から3月1日までは29日、2026年の同じ期間は28日です。',
  },
  {
    q: '振替休日と国民の休日は何が違いますか？',
    a: '振替休日は、祝日が日曜と重なったときに、その後の最も近い「祝日でない日」を休日とするものです（祝日法3条2項）。5月3日の憲法記念日が日曜のときは、5月4日・5月5日も祝日なので、振替休日は5月6日になります。国民の休日は、前日と翌日の両方が祝日である平日を休日とするものです（同3条3項）。たとえば2026年は敬老の日が9月21日、秋分の日が9月23日なので、あいだの9月22日が国民の休日となり、5連休になります。このツールはどちらも休日として扱い、営業日から除きます。',
  },
  {
    q: '和暦（昭和・平成・令和）で入力できますか？',
    a: 'このツールは西暦での入力に対応しています。和暦から西暦への変換が必要なときは、同じサイトの「年齢計算・西暦和暦変換」をお使いください。生年月日などを和暦で入れて西暦に直せるので、変換した日付をこのページに入力すれば日数を数えられます。',
  },
];

const trail = breadcrumbFor('nissu-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '日数計算・期日計算',
      url: `${SITE_URL}/nissu-keisan/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('nissu-keisan'),
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

/** 収録している年の祝日一覧。日付・曜日つきで出す */
function HolidayTable({ year }: { year: number }) {
  const rows = holidaysIn(year);
  return (
    <table>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
        {year}年の国民の祝日（{rows.length}日）
      </caption>
      <thead>
        <tr>
          <th scope="col">日付</th>
          <th scope="col">曜日</th>
          <th scope="col">名称</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const parts = parseDate(h.date) as DateParts;
          return (
            <tr key={h.date}>
              <th scope="row">
                {parts.month}月{parts.day}日
              </th>
              <td>{weekdayLabel(parts)}</td>
              <td>{h.name}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 祝日を収録している年（新しい年を先に見せる） */
const HOLIDAY_YEARS = Array.from(
  { length: HOLIDAY_LAST_YEAR - HOLIDAY_FIRST_YEAR + 1 },
  (_, i) => HOLIDAY_LAST_YEAR - i
);

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>日数計算・期日計算</h1>
      <p className="lead">
        2つの日付を入れると、そのあいだの日数が出ます。初日を含む・含まないの両方を並べて表示し、週数・月数・年月日の内訳と曜日も分かります。「◯日後」「◯営業日後」を求める期日計算にも切り替えられ、営業日は土日と国民の祝日を除いて数えます。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>初日を含むか、含まないか</h2>
      <p>
        日数の数え方は「初日を含むかどうか」で1日ずれます。契約や法令で定められた期間は、
        <strong>民法140条の初日不算入の原則</strong>
        により、期間の初日を算入せず翌日から数えるのが原則です。「通知を受けた日から14日以内」であれば、通知の翌日が1日目になります。
      </p>
      <p>
        一方、旅行の日程や「何日間のイベントか」を数えるときは初日も含めます。同じ「8月1日から8月15日まで」でも、初日を含まなければ14日、含めれば15日です。上の計算機は両方を同時に出すので、必要なほうを読み取ってください。なお民法140条には、期間が午前0時から始まるときは初日も算入するというただし書きがあります。実際の期限は契約書や案内の文言が優先されます。
      </p>

      <h2>「1か月後」は日数では決まらない</h2>
      <p>
        民法143条は、週・月・年で定めた期間は暦にしたがって計算し、
        <strong>起算日に応当する日の前日に満了する</strong>
        と定めています。つまり「1か月後」は30日後でも31日後でもなく、翌月の同じ日付です。
      </p>
      <p>
        応当する日が無い場合は、その月の末日が応当日になります。1月31日の1か月後は、平年なら2月28日、うるう年なら2月29日です。この計算機の「月で数えると」もこの規則にそろえてあるので、1月31日から3月1日までは「1か月と1日」と表示されます。
      </p>

      <h2>営業日の数え方</h2>
      <p>
        このツールの営業日は、<strong>土曜・日曜と国民の祝日を除いた日</strong>
        です。祝日には、祝日法2条の祝日に加えて、日曜と重なったときの
        <strong>振替休日</strong>（3条2項）と、祝日に挟まれた平日である
        <strong>国民の休日</strong>（3条3項）も含みます。
      </p>
      <p>
        含まないのは、会社ごとの年末年始休業・お盆休み・創立記念日などの独自の休業日です。12月30日は多くの企業が休みでも、このツールでは営業日として数えます。金融機関の休業日（土日祝と12月31日〜1月3日）とも異なるため、振込や手形の期日は各機関の案内で確かめてください。
      </p>
      <div className="note">
        祝日データは{HOLIDAY_FIRST_YEAR}年1月1日〜{HOLIDAY_LAST_YEAR}
        年12月31日を収録しています。祝日は毎年2月ごろに翌年分が官報で公示されるため、それより先の年は持っていません。範囲を外れる日付で営業日を数えようとしたときは、概算せずに「祝日データの範囲外」と表示します。
      </div>

      <h2>収録している祝日の一覧</h2>
      <p>
        内閣府「国民の祝日について」で公開されている一覧にもとづきます（振替休日・国民の休日を含む）。
      </p>
      {HOLIDAY_YEARS.map((year) => (
        <HolidayTable key={year} year={year} />
      ))}

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="nissu-keisan" />

      <ToolMeta slug="nissu-keisan" ymyl="legal">
        祝日は
        <a
          href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          内閣府「国民の祝日について」
        </a>
        の一覧（{formatJa(parseDate(HOLIDAY_UPDATED_AT) as DateParts)}時点で確認）、期間の数え方は
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=129AC0000000089"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          民法140条〜143条
        </a>
        、祝日・振替休日・国民の休日の定めは
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=323AC1000000178"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国民の祝日に関する法律
        </a>
        にもとづいています。営業日には会社ごとの休業日を含みません。
      </ToolMeta>
    </>
  );
}
