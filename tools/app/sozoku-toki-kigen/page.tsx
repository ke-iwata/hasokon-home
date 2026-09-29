import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  DATA_CHECKED_AT,
  MENZEI_DEADLINE,
  formatJaWithWeekday,
  otherDeadlines,
  taxDueDate,
  tokiDeadline,
} from '@/lib/sozoku-toki-kigen';
import Calculator from './Calculator';

const title = '相続登記の期限チェッカー｜2027年3月31日の経過措置・過料・相続の手続き期限';
const description =
  '相続登記は2024年4月1日から義務になり、それより前に相続した不動産も2027年3月31日が期限です。死亡日と知った日を入れると、相続登記の期限と残り日数、遺産分割後の期限、過料の手続きの流れを表示。相続放棄（3か月）・準確定申告（4か月）・相続税申告（10か月）の期限も日付で出します。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['相続登記 いつまで', '相続登記 義務化 期限', '相続登記 過料', '相続 期限 一覧'],
  alternates: { canonical: `${SITE_URL}/sozoku-toki-kigen/` },
  robots: robotsFor('sozoku-toki-kigen'),
};

/** '2026-09-27' → '2026年9月27日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

// 本文の例はロジックから出す（手で日付を書かない）
const EX_OLD = tokiDeadline('2023-06-01');
const EX_NEW = tokiDeadline('2024-04-01');
const EX_DIV = tokiDeadline('2026-01-15', { on: '2026-10-01', registeredFirst: true });
const EX_NTA = otherDeadlines('2026-01-10');
const EX_NTA_JUN = taxDueDate(EX_NTA.junKakutei);

const faq = [
  {
    q: '2024年4月より前に亡くなった親の家も、相続登記の義務がありますか？',
    a: `あります。義務化は施行日（2024年4月1日）より前の相続にも適用され、その場合の期限は「知った日」か施行日の遅いほうから3年、つまり${ja(EX_OLD.deadline)}です（民法等の一部を改正する法律 附則5条6項・法務省Q&A）。何十年も前の相続で登記が亡くなった人の名義のままになっている不動産も対象です。`,
  },
  {
    q: '遺産分割がまとまらず、期限に間に合いそうにありません。',
    a: '「相続人申告登記」という手続きがあります。登記名義人が亡くなったことと、自分がその相続人であることを法務局の登記官に申し出るもので、相続人のうち1人が単独で、遺産分割の前でもできます。期限内に申し出れば、申し出た人は相続登記の義務を果たしたものとみなされます（不動産登記法76条の3）。その後の遺産分割で不動産を取得したら、分割の日から3年以内にその内容で登記します。',
  },
  {
    q: '期限を過ぎたら、すぐに過料になりますか？',
    a: '法務省の説明では、登記官が義務違反を知ったときは、まず登記をするよう催告書を送ります。催告書の期限内に登記がされなかった場合に、登記官が裁判所へ通知し、10万円以下の範囲で過料を科するかどうかは裁判所が決めます。「正当な理由」がある場合は通知されません。どの事情が正当な理由に当たるかはこのページでは判定しないので、心配な場合は法務局の相談窓口に確認してください。',
  },
  {
    q: '遺産分割の日から3年は、いつでも使えますか？',
    a: `先に法定相続分での相続登記、または相続人申告登記をした人が、その後の遺産分割で不動産を取得した場合の期限です（不動産登記法76条の2第2項・76条の3第4項）。たとえば2026年10月1日に分割が成立したら${ja(EX_DIV.divisionDeadline!)}までです。先に登記も申出もしていない人が遺産分割で取得した場合は、分割の内容で登記する期限は「知った日から3年」（経過措置なら2027年3月31日）のままで、分割の日から数え直しにはなりません。`,
  },
  {
    q: '相続放棄や相続税の期限はいつから数えますか？',
    a: `相続放棄・限定承認は相続の開始を知った時から3か月（民法915条）、準確定申告は知った日の翌日から4か月（所得税法125条）、相続税の申告は知った日の翌日から10か月（相続税法27条）です。書き方は違いますが、どれも結果は「知った日と同じ日付」の応当日になります。国税庁の例では1月10日に亡くなった場合、準確定申告は5月10日、相続税は11月10日です。ただし2026年は5月10日が日曜日なので、準確定申告の期限は翌開庁日の${formatJaWithWeekday(EX_NTA_JUN.due)}になります。`,
  },
];

const trail = breadcrumbFor('sozoku-toki-kigen');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '相続登記の期限チェッカー',
      url: `${SITE_URL}/sozoku-toki-kigen/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('sozoku-toki-kigen'),
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

const EGOV = [
  ['https://laws.e-gov.go.jp/law/416AC0000000123#Mp-Ch_4-Se_3-Ss_1-At_76_2', '不動産登記法 76条の2'],
  ['https://laws.e-gov.go.jp/law/129AC0000000089#Mp-Pa_5-Ch_4-Se_1-At_915', '民法 915条'],
  ['https://laws.e-gov.go.jp/law/340AC0000000033#Mp-Pa_2-Ch_5-Se_2-At_125', '所得税法 125条'],
  ['https://laws.e-gov.go.jp/law/325AC0000000073#Mp-Ch_4-At_27', '相続税法 27条'],
] as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>相続登記の期限チェッカー</h1>
      <p className="lead">
        相続登記は2024年4月1日から義務になりました。<strong>それより前に相続した不動産も、期限は2027年3月31日</strong>
        です。死亡日と、不動産を相続したことを知った日を入れると、相続登記の期限と残り日数を日付で出します。
        相続放棄・準確定申告・相続税申告の期限も同じ画面で並べます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>相続登記の義務化：知った日から3年</h2>
      <p>
        2024年4月1日に施行された不動産登記法76条の2により、相続（遺言による取得を含む）で不動産を取得した人は、
        <strong>相続の開始があったことを知り、かつ、その不動産の所有権を取得したことを知った日から3年以内</strong>
        に相続登記を申請することになりました。正当な理由なく申請しないと、10万円以下の過料の対象になります（同法164条1項）。
      </p>
      <p>
        期限は「知った日」と同じ日付の3年後です。たとえば2024年4月1日に知った場合は{ja(EX_NEW.deadline)}です。
      </p>

      <h2>2024年4月より前の相続は、2027年3月31日が期限（経過措置）</h2>
      <p>
        義務化は施行日より前の相続にも適用されます。この場合は「知った日」を「知った日か施行日（2024年4月1日）の遅いほう」に
        読み替えるので、<strong>施行日より前に知った相続はすべて{ja(EX_OLD.deadline)}が期限</strong>です
        （民法等の一部を改正する法律〔令和3年法律第24号〕附則5条6項）。何世代も前の名義のままになっている土地や、
        亡くなった親の名義のままの実家も対象です。
      </p>
      <p>
        施行日より前に遺産分割が成立していた場合も、分割の日が施行日に読み替えられるので、分割の内容で登記する期限は同じく
        {ja(EX_OLD.deadline)}です。
      </p>

      <h2>遺産分割がまとまらないときの相続人申告登記</h2>
      <p>
        遺産分割の話し合いが長引いても、期限は延びません。そのときに使えるのが<strong>相続人申告登記</strong>です。
        登記名義人が亡くなったことと、自分がその相続人であることを登記官に申し出る手続きで、相続人が1人で、
        遺産分割の前でもできます。期限内に申し出れば、<strong>申し出た人については</strong>相続登記の義務を果たしたものとみなされます
        （不動産登記法76条の3第1項・第2項）。ほかの相続人の分はそれぞれが申し出ます。
      </p>
      <p>
        申出をした人（または法定相続分で相続登記をした人）が、その後の遺産分割で不動産を取得したときは、
        <strong>分割の日から3年以内</strong>に分割の内容で登記を申請します（76条の3第4項・76条の2第2項）。
        上のチェッカーでは、遺産分割の成立日を入れて「はい」を選ぶとこの期限が出ます。
      </p>

      <h2>期限を過ぎたときの手続きの流れ</h2>
      <p>法務省の相続登記の申請義務化Q&Aでは、過料までの流れを次の順で説明しています。</p>
      <ol>
        <li>登記官が、相続登記の申請義務に違反した人を知る</li>
        <li>登記官が、相当の期間を定めて登記を申請するよう催告書を送る</li>
        <li>催告書の期限内に申請がなく、正当な理由も無い場合に、登記官が裁判所へ通知する</li>
        <li>裁判所が、10万円以下の範囲で過料を科するかどうかを決める</li>
      </ol>
      <p>
        「正当な理由」に当たるかどうかは個別の事情で判断されるので、このページでは判定しません。
        期限が近い・過ぎている場合は、不動産の所在地を管轄する法務局の相談窓口か、司法書士に相談してください。
      </p>
      <p>
        登録免許税は、価額が100万円以下の土地の相続登記などが{ja(MENZEI_DEADLINE)}まで免税です（租税特別措置法84条の2の3）。
      </p>

      <h2>同じ死亡日から決まる、ほかの3つの期限</h2>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>手続き</th>
            <th>期限</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>相続放棄・限定承認（家庭裁判所）</td>
            <td>知った時から3か月</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>準確定申告（亡くなった人の所得税）</td>
            <td>知った日の翌日から4か月</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>相続税の申告・納付</td>
            <td>知った日の翌日から10か月</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>相続登記</td>
            <td>知った日から3年（経過措置は2027年3月31日）</td>
          </tr>
        </tbody>
      </table>
      <p>
        「知った時から」と「知った日の翌日から」は書き方が違いますが、どちらも期限は<strong>知った日と同じ日付</strong>の応当日です。
        国税庁の例では1月10日に亡くなった場合、準確定申告は5月10日、相続税は11月10日です。応当日が無い月（2月29日の3年後など）は
        その月の末日です（民法143条2項）。
      </p>
      <p>
        税の期限が土日祝・年末年始（12月29日〜1月3日）に当たると、翌開庁日に延びます（国税通則法10条2項）。
        2026年1月10日に亡くなった場合、準確定申告の額面の期限{formatJaWithWeekday(EX_NTA.junKakutei)}は日曜日なので、
        期限は{formatJaWithWeekday(EX_NTA_JUN.due)}です。相続登記と相続放棄の期限が土日祝に当たる場合の扱いは、
        法務局・家庭裁判所に確認してください。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="sozoku-toki-kigen" />

      <PublicToolLink slug="zoyozei-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          生前の贈与が相続税に足し戻されるか：<ToolLink slug="zoyozei-keisan">贈与税 計算機・生前贈与加算チェッカー</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="nissu-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ほかの日付を数える：<ToolLink slug="nissu-keisan">日数計算・期日計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="taishokukin-tedori">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          退職金の税金：<ToolLink slug="taishokukin-tedori">退職金 手取り計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="sozoku-toki-kigen" ymyl="legal">
        出典：
        <a href="https://www.moj.go.jp/MINJI/minji05_00565.html" target="_blank" rel="nofollow noopener noreferrer">
          法務省「相続登記の申請義務化に関するQ&A」
        </a>
        ／
        {EGOV.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '・'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        （e-Gov 法令検索）。経過措置は民法等の一部を改正する法律（令和3年法律第24号）附則5条6項、
        税の期限の繰り下げは国税通則法10条2項、登録免許税の免税は租税特別措置法84条の2の3にもとづく。
        条文の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
