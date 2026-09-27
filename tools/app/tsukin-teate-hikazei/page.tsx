import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { DATA_CHECKED_AT, PARKING_CAP, TOTAL_CAP } from '@/lib/tsukin-teate';
import Calculator from './Calculator';
import { AFTER_MAX, BEFORE_MAX, CASE_A, CASE_Q4_2, DISTANCE_ROWS, PARKING_EXAMPLES } from './tables';

const title =
  '通勤手当 非課税限度額チェッカー（2026年4月改正対応）｜距離と駐車場代からいくらまで非課税か';
const description =
  '片道の通勤距離と支給額から、通勤手当のうち非課税になる額と課税される額を計算します。令和8年4月の改正（片道65km以上の4区分の新設・勤務先や駅周辺の駐車場代を月5,000円まで加算）に対応。定期代との併用と150,000円の上限、駐車場料金の月額換算（3か月・年払い・回数券・コインパーキング）も国税庁Q&Aのとおりに計算します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tsukin-teate-hikazei/` },
  robots: robotsFor('tsukin-teate-hikazei'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

const faq = [
  {
    q: '令和8年1〜3月分の通勤手当にも新しい限度額が使えますか？',
    a: '使えません。改正後の限度額が適用されるのは、令和8年4月1日以後に支払われるべき通勤手当です。支給日が決まっていればその支給日で判定します。4月以後に1〜3月分の差額をさかのぼって追加支給しても、その差額には改正後の限度額は適用されません（国税庁Q&A Q1-2）。',
  },
  {
    q: '自宅近くの月極駐車場の料金も非課税になりますか？',
    a: 'なりません。加算の対象になる駐車場等は、勤務先の周辺か、通勤で使う駅・停留所・フェリー乗り場・空港などの周辺にあるものに限られます。自宅付近の駐車場はこれに当たりません（Q2-1・Q2-4）。',
  },
  {
    q: '自転車やバイクの駐輪場代も加算できますか？',
    a: `できます。「駐車場等」には通勤に使う自転車やバイクの駐輪場も含まれます（Q2-2）。複数の駐車場等を使っている場合は、料金の合計に対して上限${yen(PARKING_CAP)}です（Q2-3）。`,
  },
  {
    q: '会社が駐車場を借りてくれていて、自分は払っていません。どうなりますか？',
    a: `会社が従業員に代わって契約・負担している駐車場代は、その額の通勤手当を支給したのと同じに扱います。たとえば片道50kmで距離に応じた手当${yen(CASE_Q4_2.distanceAllowance)}に加えて会社が駐車場代${yen(CASE_Q4_2.companyPaidParking)}を負担していれば、支給額は${yen(CASE_Q4_2.distanceAllowance + CASE_Q4_2.companyPaidParking)}、限度額は${yen(CASE_Q4_2.result.distanceLimit)}＋${yen(CASE_Q4_2.result.parkingAddition)}＝${yen(CASE_Q4_2.result.limit)}で、${yen(CASE_Q4_2.result.taxableMonthly)}が課税になります（Q4-2）。`,
  },
  {
    q: '限度額より少ない額しか支給されていなければ、全額非課税ですか？',
    a: 'はい。支給額が非課税限度額以下なら全額非課税です。距離に応じた手当と駐車場代の手当を分けずに支給していても、合計で限度額と比べます（Q&A ケースB・D）。',
  },
  {
    q: '通勤手当は社会保険料の計算に入りますか？',
    a: '入ります。健康保険・厚生年金の「報酬」には通勤手当が全額含まれ、所得税で非課税かどうかは関係ありません。定期代6か月分をまとめて支給される場合も、1か月あたりに割って標準報酬月額の算定に入ります。',
  },
  {
    q: '非課税の通勤手当は年収の壁に入りますか？',
    a: '税の壁（令和8年分は住民税の119万円・所得税の178万円など）には入りません。非課税分は給与収入に入らないので、限度額を超えて課税された分だけが判定に乗ります。一方、社会保険の130万円の壁（扶養認定）は、通勤手当を含めた収入で判定するのが通例です。106万円の壁は2026年10月1日に撤廃され、「週20時間の壁」に変わります。壁ごとの判定は年収の壁 計算機で確かめられます。',
  },
  {
    q: '新幹線や特急の料金も非課税になりますか？',
    a: '経済的かつ合理的な経路・方法で通勤した場合の運賃等であれば、新幹線や特急の料金も含まれます。ただしグリーン料金は含まれません。どの経路が合理的かは個別の事情で決まるため、この計算機では判定せず、入力された運賃をそのまま使います。',
  },
];

const trail = breadcrumbFor('tsukin-teate-hikazei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '通勤手当 非課税限度額チェッカー',
      url: `${SITE_URL}/tsukin-teate-hikazei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('tsukin-teate-hikazei'),
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

      <h1>通勤手当 非課税限度額チェッカー</h1>
      <p className="lead">
        片道の通勤距離と会社から出ている通勤手当の額を入れると、そのうち所得税がかからない額と、給与として課税される額を出します。2026年4月の改正で増えた片道65km以上の区分と、勤務先や駅の周辺の駐車場代（月{yen(PARKING_CAP)}まで）の加算に対応しています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>2026年4月の改正で変わったこと</h2>
      <p>
        令和8年度の税制改正で、マイカー・自転車などの交通用具で通勤する人の通勤手当の非課税限度額が、
        <strong>令和8年4月1日以後に支払われるべき通勤手当</strong>から次のように変わりました。
      </p>
      <ul>
        <li>
          片道55km以上は一律{yen(BEFORE_MAX)}だったのが、<strong>65km以上に4つの区分</strong>ができ、最高{yen(AFTER_MAX)}になった
        </li>
        <li>
          勤務先や駅の周辺の駐車場・駐輪場の料金（1か月あたり<strong>上限{yen(PARKING_CAP)}</strong>
          ）を、距離区分の限度額に<strong>加算できる</strong>ようになった（片道2km未満の人は除く）
        </li>
      </ul>
      <p>交通機関の運賃（定期代）の上限{yen(TOTAL_CAP)}と、2km〜55km未満の区分の額は変わっていません。</p>

      <h2>交通用具の距離区分（改正前と改正後）</h2>
      <table>
        <thead>
          <tr>
            <th>片道の通勤距離</th>
            <th>改正後（2026年4月〜）</th>
            <th>改正前</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>2km未満</td>
            <td>全額課税</td>
            <td>全額課税</td>
          </tr>
          {DISTANCE_ROWS.map((row) => (
            <tr key={row.label}>
              <td style={{ textAlign: 'left' }}>
                {row.changed ? <strong>{row.label}</strong> : row.label}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {row.changed ? <strong>{yen(row.after)}</strong> : yen(row.after)}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{yen(row.before)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        区分の境目ちょうどの距離は上の区分に入ります（「以上・未満」の区切り）。太字が改正で分かれた区分で、改正前は55km以上がすべて{yen(BEFORE_MAX)}でした。
      </p>

      <h2>非課税限度額の計算式</h2>
      <table>
        <thead>
          <tr>
            <th>通勤の手段</th>
            <th>1か月あたりの非課税限度額</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>マイカー・自転車などだけ</td>
            <td style={{ textAlign: 'left' }}>距離区分の額 ＋ 駐車場等の料金（上限{yen(PARKING_CAP)}）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>電車・バス・有料道路だけ</td>
            <td style={{ textAlign: 'left' }}>合理的な運賃等の額（上限{yen(TOTAL_CAP)}）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>併用</td>
            <td style={{ textAlign: 'left' }}>
              運賃等 ＋ 距離区分の額 ＋ 駐車場等の料金（上限{yen(PARKING_CAP)}）の合計（上限{yen(TOTAL_CAP)}）
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        支給額がこの限度額を超えた分だけが課税されます。たとえば国税庁Q&Aのケースでは、片道{CASE_A.input.distanceKm}km（{yen(CASE_A.result.distanceLimit)}）で1か月{yen(CASE_A.result.parkingMonthly)}の駐車場を使い、合計{yen(CASE_A.input.allowance)}を受け取っている人の限度額は{yen(CASE_A.result.distanceLimit)}＋{yen(CASE_A.result.parkingAddition)}＝{yen(CASE_A.result.limit)}で、<strong>{yen(CASE_A.result.taxableMonthly)}が課税</strong>になります。併用で交通用具を使う区間が片道2km未満の人は、運賃等だけで判定します。
      </p>

      <h2>駐車場料金の月額への直し方</h2>
      <p>
        加算する駐車場代は1か月あたりの額で、消費税込みです。料金の決まり方ごとに次のように直します（国税庁Q&A Q3-3の例）。
      </p>
      <table>
        <thead>
          <tr>
            <th>区分・料金</th>
            <th>計算</th>
            <th>1か月あたり</th>
          </tr>
        </thead>
        <tbody>
          {PARKING_EXAMPLES.map((e) => (
            <tr key={`${e.rule}${e.case}`}>
              <td style={{ textAlign: 'left' }}>
                {e.rule}
                <br />
                <span style={{ color: 'var(--muted)' }}>{e.case}</span>
              </td>
              <td style={{ textAlign: 'left' }}>{e.formula}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{yen(e.monthly)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        加算できるのは換算した額のうち{yen(PARKING_CAP)}までです。コインパーキングの例（{yen(PARKING_EXAMPLES[5].monthly)}）や7日単位の例（{yen(PARKING_EXAMPLES[6].monthly)}）のように高額でも、限度額に足せるのは{yen(PARKING_CAP)}です。
      </p>

      <h2>通勤手当の扱いは4つの制度で違う</h2>
      <table>
        <thead>
          <tr>
            <th>制度</th>
            <th>通勤手当の扱い</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>所得税・住民税</td>
            <td style={{ textAlign: 'left' }}>
              限度額までは非課税。超えた分は給与収入に入る（所得税法9条1項5号）→{' '}
              <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>社会保険（健康保険・厚生年金）</td>
            <td style={{ textAlign: 'left' }}>
              <strong>全額</strong>が報酬に入り、標準報酬月額の算定に含まれる →{' '}
              <Link href="/tedori-keisan/">手取り計算機</Link>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>残業代（割増賃金）</td>
            <td style={{ textAlign: 'left' }}>
              算定基礎から除外できる7つの賃金の1つ（距離や実費に応じた支給に限る。一律支給は除外できない）→{' '}
              <Link href="/zangyodai-keisan/">残業代計算機</Link>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>最低賃金</td>
            <td style={{ textAlign: 'left' }}>
              対象賃金から除外する（最低賃金法4条3項）→{' '}
              <Link href="/saitei-chingin/">最低賃金 早見表・チェッカー</Link>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        「所得税では非課税なのに社会保険料は上がる」のは、この違いのためです。定期代が高い人ほど、手取りの計算で差が出ます。
      </p>

      <div className="note">
        この計算機は所得税法上の非課税限度額を出す目安です。実際の課税は、勤務先の給与規程と通勤経路の届出にもとづいて勤務先が判断します。税額そのもの（所得税・住民税）は他の所得で決まるため出していません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="tsukin-teate-hikazei" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/nenshu-kabe/">年収の壁 計算機</Link>／
        <Link href="/tedori-keisan/">手取り計算機</Link>／
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>／
        <Link href="/zangyodai-keisan/">残業代計算機</Link>
      </p>

      <ToolMeta slug="tsukin-teate-hikazei" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/users/gensen/2026tsukin/index.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「通勤手当の非課税限度額の改正について」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/users/gensen/2026tsukin/pdf/01.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「通勤手当の非課税限度額の改正に関するＱ＆Ａ」（令和8年4月・PDF）
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/340AC0000000033"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          所得税法（9条1項5号）
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/340CO0000000096"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          所得税法施行令（20条の2）
        </a>
        にもとづき作成（{DATA_CHECKED_AT.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')}確認）。
      </ToolMeta>
    </>
  );
}
