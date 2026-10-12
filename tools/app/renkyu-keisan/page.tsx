import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { formatJa, parseDate, type DateParts } from '@/lib/date-parts';
import { HOLIDAY_LAST_YEAR, HOLIDAY_UPDATED_AT } from '@/lib/nissu-keisan';
import { formatLeaveDays, formatMd } from '@/lib/renkyu-keisan';
import Calculator from './Calculator';
import { EXAMPLE_ROWS, seasonCaption } from './tables';

const title = '連休計算機｜有給を何日使えば何連休？2026年末年始・2027年GWの最適な休み方';
const description =
  '使える有給の日数を入れると、土日・祝日・年末年始休暇をつないで最も長い連休になる日を計算。2026〜27 年の年末年始は有給 1 日で 9 連休、2027 年 GW は有給 1 日で 7 連休、3 日で 11 連休になる取り方がわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/renkyu-keisan/` },
  robots: robotsFor('renkyu-keisan'),
};

const holidayCheckedAt = formatJa(parseDate(HOLIDAY_UPDATED_AT) as DateParts);

const faq = [
  {
    q: '振替休日・国民の休日はどう決まりますか？',
    a: '振替休日は、国民の祝日が日曜と重なったとき、その日の後の最も近い「国民の祝日でない日」を休日にするものです（国民の祝日に関する法律3条2項）。2026年は5月3日の憲法記念日が日曜で、5月4日・5日も祝日なので、振替休日は5月6日（水）になりました。国民の休日は、前日と翌日の両方が国民の祝日である日を休日にするものです（同3条3項）。2026年は敬老の日（9月21日）と秋分の日（9月23日）に挟まれた9月22日が国民の休日です。このツールはどちらも祝日として扱い、内閣府が公表している一覧の日付をそのまま使っています。',
  },
  {
    q: '会社の年末年始休暇が12月30日からの場合は？',
    a: '入力欄の「年末年始休暇」で「12/30〜1/3」を選んでください。12月29日が平日なら、その日も有給を使う日として数え直します。年末年始の休みは法律で決まったものではなく、就業規則や会社のカレンダーで決まります。休みが無い職場は「なし」を選ぶと、元日（1月1日）と土日だけで計算します。',
  },
  {
    q: `${HOLIDAY_LAST_YEAR + 1}年の祝日はいつ分かりますか？`,
    a: `春分の日と秋分の日は、前の年の2月に官報に載る国立天文台の暦要項で確定します。${HOLIDAY_LAST_YEAR + 1}年分は${HOLIDAY_LAST_YEAR}年2月ごろに確定する見込みです。それまでは${HOLIDAY_LAST_YEAR}年12月31日で計算を打ち切り、年末年始だけは日付が法律で決まっている元日を使って${HOLIDAY_LAST_YEAR + 1}年1月3日まで見ています。確定したら、このサイトの日数計算と同じ祝日の表に足します。`,
  },
];

const trail = breadcrumbFor('renkyu-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '連休計算機',
      url: `${SITE_URL}/renkyu-keisan/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('renkyu-keisan'),
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

      <h1>連休計算機（有給をどこで使うと何連休？）</h1>
      <p className="lead">
        使える有給の日数を入れると、土日・祝日（振替休日・国民の休日を含む）・会社の年末年始休暇をつないで、いちばん長い連休になる日を時期ごとに出します。2026〜27年の年末年始は有給1日で9連休、2027年のGWは有給1日で7連休になります。逆に「この期間を休むには有給が何日要るか」も引けます。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>2026〜2027年の連休の例</h2>
      <p>
        土日休み・年末年始休暇12月29日〜1月3日の職場で、有給を使う日数ごとに最も長くなる取り方です（上の計算機の結果をそのまま載せています）。
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">時期</th>
            <th scope="col">有給</th>
            <th scope="col">連休</th>
            <th scope="col">有給を使う日</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_ROWS.map((row) => (
            <tr key={`${row.year}-${row.season}-${row.leave}`}>
              <th scope="row">{seasonCaption(row)}</th>
              <td>{row.leave}日</td>
              <td>
                {row.plans.map((p) => (
                  <div key={`${formatMd(p.start)}-${formatMd(p.end)}`}>
                    {formatMd(p.start)}〜{formatMd(p.end)}の{p.days}連休
                  </div>
                ))}
              </td>
              <td>
                {row.plans.map((p) => (
                  <div key={`${formatMd(p.start)}-${formatMd(p.end)}`}>{formatLeaveDays(p.leaveDays)}</div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        同じ長さになる取り方が複数あるときは、すべて並べています。{HOLIDAY_LAST_YEAR + 1}
        年の祝日は未確定のため、{HOLIDAY_LAST_YEAR}-{String(HOLIDAY_LAST_YEAR + 1).slice(2)}
        年の年末年始は元日以外の祝日を入れずに数えています。
      </p>

      <h2>連休の数え方</h2>
      <p>
        休みの日（休みの曜日・国民の祝日・会社の休み）が続く塊のあいだにある平日に有給を入れると、塊どうしがつながって長い連休になります。この計算機は、有給を入れる日の組み合わせを1年分すべて試し、
        <strong>有給の日数ごとに最も長くなる取り方</strong>
        を時期（年末年始・GW・お盆・シルバーウィーク・祝日の連休）ごとに残しています。カードは「連休の日数 ÷ 有給の日数」が大きい順、つまり有給1日あたりで長く休める順に並びます。
      </p>
      <p>
        祝日は、国民の祝日に関する法律2条の祝日に加えて、日曜と重なったときの
        <strong>振替休日</strong>（3条2項）と、祝日に挟まれた平日である
        <strong>国民の休日</strong>
        （3条3項）を含みます。どちらも内閣府が公表している一覧の日付をそのまま使っています。
      </p>

      <h2>有給休暇の取り方の決まり</h2>
      <p>
        年次有給休暇は、労働者が請求する時季に与えるのが原則です（労働基準法39条5項）。ただし請求された時季に与えると事業の正常な運営を妨げる場合、会社は他の時季に変えることができます（同項ただし書き。時季変更権）。この計算機が出すのは「有給を使えば◯連休になる日」までで、その日に必ず取れることまでは示していません。
      </p>
      <p>
        年10日以上の有給が付与される人には、そのうち
        <strong>年5日を会社が時季を指定して取らせる義務</strong>
        があります（39条7項。2019年4月から）。労使協定で有給の一部を会社のカレンダーで決める計画的付与（39条6項）がある職場では、年末年始や夏季の休みに有給が充てられていることがあります。
      </p>
      <div className="note">
        年末年始・夏季の休みは会社ごとに違います。就業規則・会社のカレンダーで確認してください。祝日は{HOLIDAY_LAST_YEAR}
        年12月31日までが確定しており、{holidayCheckedAt}に内閣府の一覧と突き合わせています。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="renkyu-keisan" />

      <ToolMeta slug="renkyu-keisan" ymyl="legal">
        祝日は
        <a
          href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          内閣府「国民の祝日について」
        </a>
        の一覧（{holidayCheckedAt}時点で確認）、祝日・振替休日・国民の休日の定めは
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=323AC1000000178"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国民の祝日に関する法律
        </a>
        、年次有給休暇の時季指定・時季変更・計画的付与・年5日の取得義務は
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=322AC0000000049"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          労働基準法39条
        </a>
        にもとづいています。会社の年末年始・夏季の休みは職場の慣行で、法定ではありません。
      </ToolMeta>
    </>
  );
}
