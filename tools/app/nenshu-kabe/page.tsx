import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = '年収の壁 計算機【2026年】106万円の壁撤廃・週20時間の壁に対応';
const description =
  '2026年10月1日、106万円の壁（賃金要件）が撤廃され「週20時間の壁」に変わります。年収と立場を入れるだけで、あなたに関係する年収の壁（119万・130万・136万・159万・169万・178万円）と社会保険に加入するかどうかを、施行日を踏まえて判定します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nenshu-kabe/` },
  robots: robotsFor('nenshu-kabe'),
};

const faq = [
  {
    q: '2026年の「年収の壁」は何が変わりましたか？',
    a: '税制改正により、所得税がかかり始めるライン（基礎控除・給与所得控除の合計）が引き上げられ、いわゆる103万円の壁は2025年に160万円、2026年からは178万円に変わりました。住民税の壁も110万円から119万円に、配偶者控除は136万円、配偶者特別控除の減額開始は169万円に引き上げられています。',
  },
  {
    q: 'いちばん影響が大きい壁はどれですか？',
    a: '社会保険の扶養から外れる130万円の壁（19〜22歳の学生は150万円）です。超えると自分で国民年金・国民健康保険等に加入する必要があり、年十数万円以上の負担が発生します。税金の壁は「超えた分にだけ」課税されるため影響は小さめです。',
  },
  {
    q: '106万円の壁はなくなったのですか？',
    a: 'はい。2026年10月1日に社会保険の加入要件から賃金要件（月8.8万円＝年収106万円相当）が撤廃されました。以降は「従業員51人以上の勤務先」で「週20時間以上」働いているかだけで加入が決まるため、106万円という金額の壁はなくなり、代わりにいわゆる「週20時間の壁」に変わりました。2026年9月30日までは従来どおり106万円が壁として機能します。この計算機は施行日をまたぐと自動的に判定を切り替えます。',
  },
  {
    q: '「週20時間の壁」とは何ですか？',
    a: '賃金要件の撤廃後、勤務先の社会保険に加入するかどうかを分けるのが週の所定労働時間20時間になったことを指す言い方です。従業員51人以上の勤務先で週20時間以上働くと、年収がいくらであっても厚生年金・健康保険に加入し、保険料が天引きされます。手取りを抑えたい場合に調整すべきは年収ではなく週の所定労働時間です。ただし昼間部の学生は適用除外で、週20時間以上働いても加入しません（夜間部・定時制・通信制、休学中の方は対象です）。なお企業規模の要件も2027年10月から段階的に縮小され、2035年10月に撤廃される予定です。',
  },
  {
    q: '130万円の壁の判定方法が変わったと聞きました',
    a: 'はい。2026年4月から、扶養認定の年収判定は残業代を含まない契約上の収入（基本給ベース）で行われるようになりました。突発的な残業で一時的に130万円を超えても、直ちに扶養から外れない運用になっています。',
  },
];

const trail = breadcrumbFor('nenshu-kabe');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '年収の壁 計算機',
      url: `${SITE_URL}/nenshu-kabe/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('nenshu-kabe'),
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

      <h1>年収の壁 計算機（2026年版）</h1>
      <p className="lead">
        年収と立場を入れるだけで、あなたに関係する「年収の壁」と超えたときに何が起きるかを判定します。
        2025〜2026年の税制改正・年金制度改正に対応済みで、
        2026年10月1日の<strong>106万円の壁（賃金要件）撤廃</strong>＝「週20時間の壁」への切り替わりも、
        施行日を境に自動で反映されます。
      </p>

      {/*
        基準日はビルド時刻ではなく「画面を開いた日」で評価する（lib/nenshu-kabe.ts 参照）。
        静的書き出しなのでサーバ描画とハイドレーションの食い違いを避けるため、
        ビルド時刻を初期値として渡し、マウント後に現在日へ差し替える
      */}
      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>2026年の年収の壁 早見表</h2>
      <table>
        <thead>
          <tr>
            <th>壁</th>
            <th>種類</th>
            <th>何が起きる？</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>106万円</td>
            <td>社会保険</td>
            <td style={{ textAlign: 'left' }}>
              勤務先の社保に加入（51人以上・週20h以上）。
              <strong>2026年9月30日まで</strong>。賃金要件は10月1日に撤廃
            </td>
          </tr>
          <tr>
            <td>週20時間</td>
            <td>社会保険</td>
            <td style={{ textAlign: 'left' }}>
              <strong>2026年10月1日から</strong>。従業員51人以上の勤務先で週20時間以上働くと、
              年収に関係なく勤務先の社保に加入（＝「週20時間の壁」）。昼間部の学生は適用除外
            </td>
          </tr>
          <tr>
            <td>119万円</td>
            <td>税金</td>
            <td style={{ textAlign: 'left' }}>住民税がかかり始める</td>
          </tr>
          <tr>
            <td>130万円</td>
            <td>社会保険</td>
            <td style={{ textAlign: 'left' }}>
              家族の扶養から外れる（最重要）。学生（19〜22歳）は150万円
            </td>
          </tr>
          <tr>
            <td>136万円</td>
            <td>税金</td>
            <td style={{ textAlign: 'left' }}>
              配偶者控除→配偶者特別控除へ移行／扶養控除の対象外に
            </td>
          </tr>
          <tr>
            <td>159万円</td>
            <td>税金</td>
            <td style={{ textAlign: 'left' }}>（学生）親の特定親族特別控除が減り始める</td>
          </tr>
          <tr>
            <td>169万円</td>
            <td>税金</td>
            <td style={{ textAlign: 'left' }}>配偶者特別控除が減り始める（207万円で消失）</td>
          </tr>
          <tr>
            <td>178万円</td>
            <td>税金</td>
            <td style={{ textAlign: 'left' }}>所得税がかかり始める</td>
          </tr>
        </tbody>
      </table>
      <div className="note">
        本ページは令和8年度税制改正（所得税法等の一部を改正する法律・令和8年法律第12号）および年金制度改正法（2025年6月成立）にもとづきます。社会保険の賃金要件（月8.8万円）の撤廃は2026年10月1日施行で、この計算機は施行日を境に判定を自動で切り替えます（表示は端末の日付にもとづきます）。企業規模の要件（従業員51人以上）は2027年10月から段階的に縮小され2035年10月に撤廃される予定ですが、本ツールはまだ現行の51人以上で判定します。金額は令和8年分（2026年1月〜12月の収入）に適用されるもので、給与所得控除74万円・基礎控除104万円を前提としています。住民税は前年の所得に課税されるため、2026年の収入は2027年度の住民税に反映されます。社会保険の扶養認定は加入する健康保険組合ごとに運用が異なる場合があります。正確な判定は勤務先・保険者にご確認ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="nenshu-kabe" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>
      </p>

      <ToolMeta slug="nenshu-kabe" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「No.1199 基礎控除」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1177.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「No.1177 特定親族特別控除」
        </a>
        ／
        <a
          href="https://www.mhlw.go.jp/tekiyoukakudai/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「社会保険適用拡大特設サイト」
        </a>
        ／所得税法等の一部を改正する法律（令和8年法律第12号）にもとづき作成。
      </ToolMeta>
    </>
  );
}
