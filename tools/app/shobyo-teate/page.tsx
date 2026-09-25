import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { kenpoDailyAmount, SHORT_TENURE_CAP } from '@/lib/kenpo-daily-amount';
import { shobyoHayamihyo } from '@/lib/shobyo-teate';
import Calculator from './Calculator';

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

// 本文とFAQの金額は計算機と同じ関数から出す（手で書くと料率・上限の改定で本文だけ古くなる）
const example = kenpoDailyAmount(300_000);
const cappedDaily = kenpoDailyAmount(SHORT_TENURE_CAP).dailyAmount;
const hayamihyo = shobyoHayamihyo();

const title = '傷病手当金 計算機｜月収からいくらもらえるかを自動計算';
const description =
  '病気やケガで会社を休んだときにもらえる傷病手当金を計算。月収と休んだ日数を入れるだけで、日額（標準報酬日額×2/3）・待期3日を除いた支給日数・支給総額・月額の目安がわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shobyo-teate/` },
  robots: robotsFor('shobyo-teate'),
};

const faq = [
  {
    q: '傷病手当金はいつからもらえますか？',
    a: '連続して3日間休んだあと（待期期間）、4日目以降の仕事に就けなかった日から支給されます。待期の3日間には土日祝日や有給休暇を使った日も含まれます。飛び飛びの欠勤では待期が完成しないため、まず「連続3日」休むことが条件です。',
  },
  {
    q: '傷病手当金はいくらもらえますか？',
    a: `給与のおよそ3分の2です。たとえば標準報酬月額${man(example.standardMonthly)}なら日額${yen(example.dailyAmount)}、30日分で${yen(example.dailyAmount * 30)}が目安です。式と月収別の早見表は、このページの「1日あたりの支給額の計算のしかた」にまとめています。`,
  },
  {
    q: '傷病手当金はいつまでもらえますか？',
    a: '支給開始日から通算して1年6ヶ月です。2022年1月の改正で「支給開始から暦の上で1年6ヶ月」ではなく「通算1年6ヶ月」に変わったため、途中で復職して再び休んだ場合は、復職していた期間は数えずに支給を受けられます。',
  },
  {
    q: '入社して1年経っていない場合はどうなりますか？',
    a: `日額に上限がかかり、協会けんぽでは${yen(cappedDaily)}で頭打ちになります（給与が低い方は影響しません）。比べ方は「1日あたりの支給額の計算のしかた」を、計算機ではチェックボックスで反映できます。`,
  },
  {
    q: '退職して任意継続にしたあと、新しく病気になった場合ももらえますか？',
    a: '任意継続被保険者の期間中に新しく始まった病気やケガには、傷病手当金は支給されません。任意継続中に受け取れるのは、在職中から受けていた傷病手当金を「資格喪失後の継続給付」として引き続き受ける場合に限られます。',
  },
];

const trail = breadcrumbFor('shobyo-teate');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '傷病手当金 計算機',
      url: `${SITE_URL}/shobyo-teate/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shobyo-teate'),
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

      <h1>傷病手当金 計算機</h1>
      <p className="lead">
        病気やケガで会社を休んだときにもらえる傷病手当金の目安を計算します。月収と休んだ日数を入れるだけで、日額・支給日数・支給総額がわかります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>傷病手当金とは？ 支給の条件</h2>
      <p>
        傷病手当金は、健康保険（協会けんぽ・健康保険組合）の被保険者が
        <strong>業務外</strong>の病気やケガで働けなくなったときに、生活を保障するために支給される給付です。次の条件をすべて満たすと支給されます。
      </p>
      <ul>
        <li>業務外の病気やケガの療養のため働けないこと（業務上・通勤中は労災保険の対象）</li>
        <li>連続する3日間の待期期間を含み、4日以上仕事に就けなかったこと</li>
        <li>休んだ期間について給与の支払いがないこと（一部支払いがある場合は差額支給）</li>
      </ul>

      <h2>1日あたりの支給額の計算のしかた</h2>
      <p>1日あたりの支給額は、次の2段階で決まります。</p>
      <ol>
        <li>
          <strong>標準報酬日額</strong>：支給開始日以前の継続した12ヶ月の、各月の標準報酬月額の平均 ÷
          30（10円未満を四捨五入）
        </li>
        <li>
          <strong>支給額（日額）</strong>：標準報酬日額 × 2/3（1円未満を四捨五入）
        </li>
      </ol>
      <p>
        たとえば標準報酬月額が{man(example.standardMonthly)}の月が12ヶ月続いていれば、標準報酬日額は
        {yen(example.standardDaily)}、支給額は{yen(example.dailyAmount)}です。「標準報酬月額」は実際の月給そのものではなく、
        給与を等級表にあてはめた額なので、同じ等級の範囲なら月給が多少違っても日額は同じになります。
      </p>
      <p>
        <strong>加入から12ヶ月に満たない場合</strong>は、加入してからの各月の標準報酬月額の平均と、
        全被保険者の標準報酬月額の平均額（協会けんぽで支給開始日が令和7年4月1日以降は
        {man(SHORT_TENURE_CAP)}）の<strong>低いほう</strong>を使います。上限にかかると日額は
        {yen(cappedDaily)}で頭打ちになります。健康保険組合では平均額が別に定められていることがあります。
      </p>

      <h3>月収別の早見表（加入12ヶ月以上の場合）</h3>
      <table>
        <thead>
          <tr>
            <th>標準報酬月額</th>
            <th>1日あたり</th>
            <th>30日分の目安</th>
          </tr>
        </thead>
        <tbody>
          {hayamihyo.map((row) => (
            <tr key={row.standardMonthly}>
              <th scope="row">{man(row.standardMonthly)}</th>
              <td>{yen(row.dailyAmount)}</td>
              <td>{yen(row.thirtyDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        協会けんぽの等級表と算定方法による目安です。付加給付のある健康保険組合では、これより多くなることがあります。
        加入12ヶ月未満で上限がかかる場合（令和7年4月1日以降の支給開始で{man(SHORT_TENURE_CAP)}）は、
        {man(SHORT_TENURE_CAP)}より上の行も{yen(cappedDaily)}になります。
      </p>

      <h2>支給期間は「通算」1年6ヶ月</h2>
      <p>
        支給期間は支給開始日から<strong>通算1年6ヶ月</strong>です。2022年1月の制度改正で、それまでの「支給開始から暦の上で1年6ヶ月」から「支給された期間を通算して1年6ヶ月」に変わりました。これにより、がん治療などで入退院を繰り返す場合でも、復職して給与が出ていた期間は支給期間にカウントされず、実際に休んだ期間の合計で1年6ヶ月分まで受け取れます。
      </p>

      <h2>給与が出た日・ほかの給付を受けている日の扱い</h2>
      <p>
        傷病手当金は「休んで収入が無い日」の生活を支える給付なので、同じ日にほかのお金が出るときは、
        <strong>支給されないか、差額だけ</strong>になります。
      </p>
      <ul>
        <li>
          <strong>給与（有給休暇を含む）が出た日</strong>：支給されません。給与が傷病手当金の日額より少ないときは、
          差額が支給されます。待期の3日間は給与が出ていても（有給を充てても）待期として数えます
        </li>
        <li>
          <strong>出産手当金を受けられる期間</strong>：出産手当金だけが支給されます。出産手当金のほうが少ないときは、
          傷病手当金を請求すると差額が支給されます
        </li>
        <li>
          <strong>同じ病気・ケガで障害厚生年金を受けられるとき</strong>：支給されません。年金の額（障害基礎年金も受けるときは合計額）を
          360で割った額が傷病手当金の日額より低いときは、差額が支給されます
        </li>
        <li>
          <strong>退職後の継続給付を受けている人が老齢年金を受けるようになったとき</strong>：支給されません。
          年金の額を360で割った額が傷病手当金の日額より低いときは、差額が支給されます
        </li>
      </ul>

      <h2>退職後も受け取れる条件（資格喪失後の継続給付）</h2>
      <p>退職して健康保険の被保険者でなくなっても、次の2つを両方満たせば、残りの期間の傷病手当金を受け取れます。</p>
      <ul>
        <li>
          退職日（資格を失った日の前日）までに、<strong>継続して1年以上</strong>被保険者だったこと
          （任意継続被保険者だった期間や、国民健康保険・共済組合に加入していた期間は数えません）
        </li>
        <li>退職した時点で傷病手当金を受けているか、受ける条件を満たしていること</li>
      </ul>
      <p>
        いったん働ける状態に戻ると、そのあと同じ病気で働けなくなっても、退職後の継続給付は受けられません。
        受け取れる期間は在職中から通算して1年6ヶ月までで、退職によって延びることはありません。
      </p>

      <div className="note">
        本ツールの計算は目安です。実際の支給額は支給開始日以前12ヶ月の各月の標準報酬月額の平均から算定されるため、昇給・降給があった場合は結果と異なることがあります。また、健康保険組合によっては法定の傷病手当金に上乗せされる「付加給付」がある場合があります。正確な金額は加入している健康保険にご確認ください。なお、国民健康保険（自営業・フリーランス等）には原則として傷病手当金の制度はありません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shobyo-teate" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/nenshu-kabe/">年収の壁 計算機</Link>／
        <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>
      </p>

      <ToolMeta slug="shobyo-teate" ymyl>
        出典：
        <a
          href="https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          全国健康保険協会（協会けんぽ）「病気やケガで会社を休んだとき（傷病手当金）」
        </a>
        、
        <a
          href="https://www.kyoukaikenpo.or.jp/g6/cat620/r307/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「よくあるご質問（傷病手当金）」
        </a>
        、
        <a
          href="https://www.kyoukaikenpo.or.jp/g7/cat710/sb3160/sb3180/sbb3180/1980-6174/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「任意継続被保険者の保険給付」
        </a>
        、
        <a
          href="https://laws.e-gov.go.jp/law/211AC0000000070"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          健康保険法（e-Gov法令検索）
        </a>
        にもとづき作成。端数処理は協会けんぽの算定方法によります。
      </ToolMeta>
    </>
  );
}
