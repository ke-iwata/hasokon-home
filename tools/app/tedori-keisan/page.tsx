import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { HEALTH_CAP_INCOME, PENSION_CAP_INCOME, takeHomeTable } from '@/lib/tedori-keisan';
import Calculator from './Calculator';

const title = '手取り計算機｜年収から手取りを自動計算（2026年の減税に対応）';
const description =
  '年収（額面）を入れるだけで、年間と月あたりの手取りが分かります。健康保険・厚生年金・雇用保険・所得税・住民税の内訳つき。2026年（令和8年分）の基礎控除104万円・給与所得控除74万円への引上げで手取りがいくら増えるかを併記し、年収100万〜1,000万円の早見表も掲載しています。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tedori-keisan/` },
  robots: robotsFor('tedori-keisan'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const manInt = (v: number) => `${Math.round(v / 10_000).toLocaleString('ja-JP')}万円`;

const table = takeHomeTable(false);

const faq = [
  {
    q: '手取りは額面の何割ですか？',
    a: '会社員（協会けんぽ・独身・扶養なし）の場合、おおむね額面の75〜80%です。年収が上がるほど所得税が累進で重くなるため手取りの割合は下がり、年収300万円ではおよそ80%、年収500万円で約79%、年収800万円で約74%になります。ただし厚生年金は標準報酬月額65万円で頭打ちになるため、年収760万円あたりから社会保険料の増え方はゆるやかになります。',
  },
  {
    q: '2026年（令和8年分）の改正で手取りはいくら増えますか？',
    a: '所得税の基礎控除が最大104万円（本則62万円＋令和8・9年分だけの特例加算42万円）、給与所得控除の最低保障額が74万円に上がります。増える額は年収と税率で変わり、年収300万円でおよそ8,000円、年収500万円でおよそ2万9,000円、年収600万円でおよそ3万7,000円です。合計所得489万円（給与収入およそ666万円）を超えると基礎控除が104万円から67万円に下がるため、そこを境に効果は小さくなります。このページの計算結果には、改正前の控除額で計算した場合との差を必ず併記しています。',
  },
  {
    q: '2026年中の給与明細を見ても手取りが増えていません',
    a: '正常です。令和8年度改正は令和8年12月1日施行で、国税庁は「令和8年11月までの給与等の源泉徴収事務に変更は生じません」と明記しています。源泉徴収税額表そのものの改正は令和9年1月1日施行なので、月々の天引きが変わるのは2027年1月からです。2026年分の減税は12月の年末調整でまとめて精算されて戻ります。戻る金額は年末調整 還付金 計算機で計算できます。',
  },
  {
    q: '住民税はなぜ「目安」なのですか？',
    a: '住民税は前年の所得に対して課税され、翌年6月からの給与天引きで納める仕組みだからです。このページが出しているのは「同じ年収が続いた場合」の住民税で、実際の天引き額とは1年ずれます。新社会人の1年目は住民税が引かれず（前年の所得がないため）、2年目から引かれ始めます。昇給・転職・退職があった年も実額とはずれます。なお均等割5,000円と非課税限度額、調整控除は社会保険 損得計算機と同じ計算を使っており、サイト内で違う住民税額が出ないようにしています。',
  },
  {
    q: '賞与（ボーナス）がある場合はどうなりますか？',
    a: 'このページは年間の総支給額を12分割して標準報酬月額に当てているため、賞与の社会保険料をやや多めに見積もります。実際の賞与の社会保険料は「標準賞与額」として別に計算され、厚生年金は1回150万円、健康保険は年間累計573万円という月額とは別の上限がかかるためです。ずれる向きは社会保険料の取りすぎ側なので、賞与の割合が大きい方は実際の手取りがこの結果より多くなる傾向があります。',
  },
  {
    q: '都道府県によって手取りは変わりますか？',
    a: '健康保険料率が都道府県ごとに違うため、少し変わります。このページは協会けんぽの全国平均（令和8年度9.9%）で計算しています。料率の差はおおむね±0.5%程度で、年収500万円なら年1〜2万円ほどの幅です。組合健保や公務員共済に加入している方は料率も付加給付も異なるため、給与明細でご確認ください。',
  },
  {
    q: '扶養している家族がいる場合は？',
    a: 'このページは独身・扶養なし・各種控除なしの目安です。配偶者控除・扶養控除・生命保険料控除・iDeCo（小規模企業共済等掛金控除）・住宅ローン控除などがある方は、実際の税額はこれより少なく、手取りは多くなります。控除を細かく入れて計算するには年末調整 還付金 計算機をお使いください。',
  },
];

const trail = breadcrumbFor('tedori-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '手取り計算機',
      url: `${SITE_URL}/tedori-keisan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('tedori-keisan'),
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

      <h1>手取り計算機</h1>
      <p className="lead">
        年収（額面）を入れるだけで、年間と月あたりの手取りが分かります。健康保険・厚生年金・雇用保険・所得税・住民税の内訳と、
        <strong>2026年（令和8年分）の基礎控除引上げで手取りがいくら増えるか</strong>
        を併記します。会社員（協会けんぽ）・独身・扶養なしの目安です。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>手取りはどうやって決まるのか</h2>
      <p>
        額面の年収から引かれるものは、大きく<strong>社会保険料</strong>と<strong>税金</strong>の2つです。
      </p>
      <ul>
        <li>
          <strong>健康保険料</strong> —
          標準報酬月額に料率をかけた額の半分（労使折半）を負担します。協会けんぽの全国平均は令和8年度9.9%で、都道府県ごとに少し違います。令和8年4月分からは子ども・子育て支援金が健康保険料に加算されています
        </li>
        <li>
          <strong>厚生年金保険料</strong> — 料率18.3%の半分。
          <strong>標準報酬月額65万円（32等級）で頭打ち</strong>になるため、年収
          {manInt(PENSION_CAP_INCOME)}あたりから増えません
        </li>
        <li>
          <strong>雇用保険料</strong> —
          一般の事業で労働者負担0.55%。標準報酬月額ではなく実際に支払われた賃金にかかります
        </li>
        <li>
          <strong>所得税</strong> —
          給与収入から給与所得控除・社会保険料控除・基礎控除を引いた課税所得に、5〜45%の累進税率をかけます。復興特別所得税（2.1%）が上乗せされます
        </li>
        <li>
          <strong>住民税</strong> — 所得割10%と均等割5,000円。
          <strong>前年の所得に対して</strong>翌年6月から天引きされます
        </li>
      </ul>
      <p>
        社会保険料は所得税・住民税の計算で全額が控除されるので、
        <strong>社会保険料が増えるとその分だけ税金は減ります</strong>
        。手取りは「額面 − 社会保険料 − 所得税 − 住民税」で決まります。
      </p>

      <h2>2026年（令和8年分）の改正で手取りが増える</h2>
      <p>
        所得税法等の一部を改正する法律（令和8年法律第12号）により、令和8年分から
        <strong>所得税の基礎控除が最大104万円</strong>（本則62万円 ＋
        令和8・9年分だけの特例加算42万円）、<strong>給与所得控除の最低保障額が74万円</strong>
        になりました。いわゆる「178万円の壁」への対応です。
      </p>
      <p>
        基礎控除の特例加算は<strong>合計所得金額に応じて段階的に減ります</strong>
        。合計所得489万円以下は104万円、489万円超655万円以下は67万円、655万円超は本則の62万円です。給与収入に直すとおよそ666万円と850万円が境目で、下の早見表でも改正の効果がここで小さくなっているのが見えます。
        <strong>特例加算42万円は令和8年・9年分だけの時限措置</strong>
        で、令和10年分以後は縮小されます。
      </p>
      <div className="note" style={{ lineHeight: 1.7 }}>
        <strong>この減税が月々の給与明細に現れるのは2027年1月からです。</strong>
        改正の施行日は令和8年12月1日で、国税庁は「令和8年11月までの給与等の源泉徴収事務に変更は生じません」と明記しています。源泉徴収税額表の改正は令和9年1月1日施行です。
        <strong>2026年分の減税は、12月の年末調整でまとめて精算されて戻ります</strong>
        。「手取りが増えるはずなのに明細が変わらない」と感じるのはこのためで、戻る金額は{' '}
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> で計算できます。
      </div>

      <h2>年収別の手取り早見表（2026年・令和8年分）</h2>
      <p>
        会社員（協会けんぽ・40歳未満・独身・扶養なし・賞与を年間総額に含む）の目安です。
        「改正による増分」は、令和7年分の控除額で計算した場合との差です。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>年収（額面）</th>
              <th>手取り（年間）</th>
              <th>手取り（月あたり）</th>
              <th>手取り率</th>
              <th>改正による増分</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.gross}>
                <th scope="row">{manInt(row.gross)}</th>
                <td>{yen(row.net)}</td>
                <td>{yen(row.monthlyNet)}</td>
                <td>{(row.netRate * 100).toFixed(1)}%</td>
                <td>{row.reformGain === 0 ? '—' : `+${yen(row.reformGain)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        月あたりの手取りは年間の手取りを12で割った目安です（賞与を分けていません）。住民税は「同じ年収が続いた場合」の額で、実際の天引きは前年の所得にもとづくため1年ずれます。
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>扶養・各種控除</strong> —
          配偶者控除・扶養控除・生命保険料控除・iDeCo・住宅ローン控除などは入れていません。これらがある方は実際の税額はもっと少なくなります。細かく計算するには
          <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>をお使いください
        </li>
        <li>
          <strong>都道府県別の健康保険料率</strong> —
          協会けんぽの全国平均で計算しています。組合健保・公務員共済は料率も付加給付も異なります
        </li>
        <li>
          <strong>賞与の社会保険料の別計算</strong> —
          年間の総額を12分割しているため、賞与の割合が大きい方は社会保険料を多めに見積もります（実際の手取りはこれより多くなる向き）。健康保険は年収
          {manInt(HEALTH_CAP_INCOME)}あたり（50等級・標準報酬月額139万円）で頭打ちです
        </li>
        <li>
          <strong>給与以外の所得</strong> —
          副業・不動産・株式の所得は含みません。ふるさと納税の上限を知りたい場合は
          <Link href="/furusato-nozei/">ふるさと納税 控除上限額 計算機</Link>をお使いください
        </li>
      </ul>

      <h2>関連する計算</h2>
      <ul>
        <li>
          <Link href="/nenshu-kabe/">年収の壁 計算機</Link> —
          自分に関係する壁がどこにあるかを判定します
        </li>
        <li>
          <Link href="/hatarakizon/">社会保険 損得計算機</Link> —
          社会保険に加入すると手取りがいくら減り、いくら稼げば取り戻せるかを出します（このページの手取り計算は、こちらと同じ計算を使っています）
        </li>
        <li>
          <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> —
          12月に戻ってくる金額を計算します
        </li>
        <li>
          <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link> —
          健康保険料に加算されている支援金だけの金額が分かります
        </li>
      </ul>

      <h2>よくある質問</h2>
      <dl>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 16 }}>
            <dt style={{ fontWeight: 700, marginBottom: 4 }}>{f.q}</dt>
            <dd style={{ margin: 0 }}>{f.a}</dd>
          </div>
        ))}
      </dl>

      <AdUnit position="below-faq" />

      <RelatedTools current="tedori-keisan" />

      <ToolMeta slug="tedori-keisan" ymyl>
        本ツールの金額は概算の目安であり、税額・保険料額を保証するものではありません。正確な額は給与明細・源泉徴収票と、
        <a
          href="https://www.nta.go.jp/users/gensen/2026kiso/index.htm"
          target="_blank"
          rel="noopener noreferrer"
        >
          国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
        </a>
        、
        <a
          href="https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          全国健康保険協会「令和8年度の都道府県毎の保険料率」
        </a>
        、
        <a
          href="https://www.nenkin.go.jp/service/kounen/hokenryo/"
          target="_blank"
          rel="noopener noreferrer"
        >
          日本年金機構「厚生年金保険の保険料」
        </a>
        でご確認ください。源泉徴収事務の改正時期は
        <a
          href="https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          国税庁「令和8年4月 源泉所得税の改正のあらまし」
        </a>
        によります。
      </ToolMeta>
    </>
  );
}
