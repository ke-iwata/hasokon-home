import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { kenpoDailyAmount, SHORT_TENURE_CAP } from '@/lib/kenpo-daily-amount';
import Calculator from './Calculator';
import { CAPPED_DAILY_AMOUNT, DAILY_ROWS, GRADE_GAP } from './tables';

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
    a: 'おおむね給与の3分の2です。式と月収別の早見表は本ページの「1日あたりの支給額の計算のしかた」「月収別の支給額の早見表」でご確認ください。',
  },
  {
    q: '傷病手当金はいつまでもらえますか？',
    a: '支給開始日から通算して1年6ヶ月です。2022年1月の改正で「支給開始から暦の上で1年6ヶ月」ではなく「通算1年6ヶ月」に変わったため、途中で復職して再び休んだ場合は、復職していた期間は数えずに支給を受けられます。',
  },
  {
    q: '入社して1年経っていない場合はどうなりますか？',
    a: '被保険者期間が12ヶ月に満たないと日額に上限がつきます。比べ方と上限額は「1日あたりの支給額の計算のしかた」に書いています。本ツールではチェックボックスでこの上限を反映できます。',
  },
  {
    q: '任意継続被保険者の期間中にもらえますか？',
    a: '退職後に任意継続被保険者になった場合、その資格にもとづいて新しく傷病手当金を受けることはできません。ただし退職前から受けていた傷病手当金を「資格喪失後の継続給付」として受け続けられる場合があり、任意継続に加入したかどうかで継続給付の可否が変わることはありません。条件は「退職後も受け取れる条件（継続給付）」をご確認ください。',
  },
];

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

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
      <p>
        支給額の出し方は次の「1日あたりの支給額の計算のしかた」で、月収別の目安は「月収別の支給額の早見表」で確認できます。
      </p>

      <h2>1日あたりの支給額の計算のしかた</h2>
      <p>
        傷病手当金は1日単位で支給されます。日額は
        <strong>支給開始日以前の継続した12ヶ月間の各月の標準報酬月額の平均</strong>
        をもとに、次の順で計算します（<a href="https://laws.e-gov.go.jp/law/211AC0000000070" target="_blank" rel="nofollow noopener noreferrer">
          健康保険法
        </a> 99条）。
      </p>
      <p
        style={{
          textAlign: 'center',
          fontWeight: 600,
          background: 'var(--accent-soft)',
          padding: 12,
          borderRadius: 10,
        }}
      >
        12ヶ月の標準報酬月額の平均 ÷ 30 ＝ 標準報酬日額（10円未満四捨五入）
        <br />
        標準報酬日額 × 2/3 ＝ 1日あたりの支給額（1円未満四捨五入）
      </p>
      <p>
        月収ではなく<strong>標準報酬月額</strong>で計算するのがポイントです。標準報酬月額は
        報酬月額を等級表のきりのよい額に当てはめたものなので、
        <strong>月収をそのまま「× 2/3 ÷ 30」で暗算した額とは数百円ずれることがあります</strong>。
        たとえば月収{yen(GRADE_GAP.income)}は標準報酬月額{yen(GRADE_GAP.standardMonthly)}
        の等級に上がるため、暗算の{yen(GRADE_GAP.naiveDaily)}に対して実際の日額は
        {yen(GRADE_GAP.actualDaily)}です。上の式にあてはめると、標準報酬月額{yen(300_000)}なら
        標準報酬日額は{yen(kenpoDailyAmount(300_000).standardDaily)}、日額は
        {yen(kenpoDailyAmount(300_000).dailyAmount)}です。
        <strong>ずれるのは等級に当てはめる段階</strong>で、÷30 と ×2/3
        の四捨五入そのものによる差は、出ても数円にとどまります。
      </p>
      <p>
        <strong>加入して12ヶ月たっていない場合は、日額に上限がつきます。</strong>
        支給開始日以前の被保険者期間が12ヶ月に満たないときは、
      </p>
      <ul>
        <li>その期間の各月の標準報酬月額の平均</li>
        <li>全被保険者の標準報酬月額の平均額（{yen(SHORT_TENURE_CAP)}）</li>
      </ul>
      <p>
        の<strong>低いほう</strong>を使って計算します。上限側が使われると日額は
        {yen(CAPPED_DAILY_AMOUNT)}
        で頭打ちになるため、給与が高い方でも転職・入社から1年以内はこの額を超えません。該当する方は計算機のチェックボックスをオンにしてください。
      </p>
      <div className="note">
        {yen(SHORT_TENURE_CAP)}
        は、協会けんぽで<strong>支給開始日が2025年（令和7年）4月1日以降</strong>
        の場合の額です（それ以前は{yen(300_000)}
        ）。健康保険組合では別の額が定められている場合があります。
      </div>

      <h2>月収別の支給額の早見表</h2>
      <p>
        標準報酬月額ごとの日額と、30日休んだ場合の目安です。上の式をそのまま通した額なので、
        計算機に同じ標準報酬月額を入れた結果と一致します。額の根拠は<a href="https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/" target="_blank" rel="nofollow noopener noreferrer">
          協会けんぽ
        </a>の算定方法です。
      </p>
      <table>
        <thead>
          <tr>
            <th>標準報酬月額</th>
            <th>1日あたり</th>
            <th>30日分の目安</th>
          </tr>
        </thead>
        <tbody>
          {DAILY_ROWS.map((r) => (
            <tr key={r.standardMonthly}>
              <td>{yen(r.standardMonthly)}</td>
              <td>{yen(r.dailyAmount)}</td>
              <td>{yen(r.monthly30)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        被保険者期間が12ヶ月未満の場合は、上の表のうち{yen(SHORT_TENURE_CAP)}
        を超える行は使えず、日額は{yen(CAPPED_DAILY_AMOUNT)}
        が上限になります。実際の支給は暦日単位なので、「30日分」は1ヶ月の目安として見てください。
      </div>

      <h2>支給期間は「通算」1年6ヶ月</h2>
      <p>
        支給期間は支給開始日から<strong>通算1年6ヶ月</strong>です。2022年1月の制度改正で、それまでの「支給開始から暦の上で1年6ヶ月」から「支給された期間を通算して1年6ヶ月」に変わりました。これにより、がん治療などで入退院を繰り返す場合でも、復職して給与が出ていた期間は支給期間にカウントされず、実際に休んだ期間の合計で1年6ヶ月分まで受け取れます。
      </p>

      <h2>給与が出た日・ほかの給付を受けている日の扱い</h2>
      <p>
        傷病手当金は「給与が支払われないこと」が条件なので、
        <strong>まず支給されない日・減る日を押さえる</strong>のが早いです。次の日は支給されません（<a href="https://laws.e-gov.go.jp/law/211AC0000000070" target="_blank" rel="nofollow noopener noreferrer">
          健康保険法
        </a> 108条、<a href="https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/" target="_blank" rel="nofollow noopener noreferrer">
          協会けんぽ「傷病手当金」
        </a>）。
      </p>
      <ul>
        <li>
          <strong>有給休暇を使った日・給与が支払われた日</strong> —
          支給されません。ただし支払われた給与が日額より少ないときは、その差額が支給されます
        </li>
        <li>
          <strong>出産手当金を受けられる期間</strong> —
          出産手当金が優先します。出産手当金の額が傷病手当金より少ないときは差額が支給されます
        </li>
        <li>
          <strong>同じ病気・ケガで障害厚生年金を受けている</strong> —
          支給されません。年金を日額に換算した額が傷病手当金の日額より少ないときは差額が支給されます
        </li>
        <li>
          <strong>退職後の継続給付中に老齢（退職）年金を受けている</strong> —
          同じく支給されず、日額換算が少ないときだけ差額が支給されます
        </li>
      </ul>
      <p>
        待期の3日間は「給与が支払われないこと」を問わないので、
        <strong>有給休暇を充てても待期は完成します</strong>。給与が出るかどうかが効いてくるのは4日目以降です。
      </p>

      <h2>退職後も受け取れる条件（継続給付）</h2>
      <p>
        退職して健康保険の資格を失っても、次の条件をすべて満たせば、受けていた傷病手当金を
        <strong>資格喪失後の継続給付</strong>として受け続けられます（<a href="https://laws.e-gov.go.jp/law/211AC0000000070" target="_blank" rel="nofollow noopener noreferrer">
          健康保険法
        </a> 104条）。
      </p>
      <ul>
        <li>資格喪失日の前日まで、継続して1年以上被保険者だったこと（任意継続被保険者の期間は含みません）</li>
        <li>資格喪失日の前日に、傷病手当金を受けていた（または受けられる状態だった）こと</li>
        <li>資格喪失後も、同じ病気・ケガで働けない状態が続いていること</li>
      </ul>
      <p>
        期間は在職中と通算して1年6ヶ月までです。いったん働ける状態になると、その後に同じ病気で再び働けなくなっても継続給付は再開しません（在職中の「通算」とはここが違います）。
        なお、退職後に任意継続被保険者になっても、その資格で新しく傷病手当金を受けることはできません。
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
        と、
        <a
          href="https://laws.e-gov.go.jp/law/211AC0000000070"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          健康保険法（e-Gov 法令検索）
        </a>
        の99条（支給額）・104条（資格喪失後の継続給付）・108条（報酬等との調整）にもとづき作成。端数処理は協会けんぽの算定方法によります。
      </ToolMeta>
    </>
  );
}
