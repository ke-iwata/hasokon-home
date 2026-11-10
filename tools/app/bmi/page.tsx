import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  CHILD_COEFFICIENTS,
  CHILD_MAX_AGE,
  CHILD_MIN_AGE,
  DATA_CHECKED_AT,
  formatTenths,
  JASSO_CLASSES,
  STANDARD_BMI,
  TARGET_BMI_BANDS,
  targetBandRangeLabel,
} from '@/lib/bmi';
import Calculator from './Calculator';
import { QUICK_TABLE } from './tables';

const title = 'BMI 計算・適正体重｜標準体重と普通体重の幅・年代別の目標';
const description =
  '身長と体重から BMI と日本肥満学会の判定（低体重・普通体重・肥満1〜4度）を計算。標準体重（BMI 22）と普通体重に入る体重の幅も出します。年齢を入れると「日本人の食事摂取基準（2025年版）」の年代別の目標 BMI で見直し、5〜17歳は学校健診の肥満度で判定。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/bmi/` },
  robots: robotsFor('bmi'),
};

/** '2026-11-10' → '2026年11月10日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const kg = (tenths: number) => `${formatTenths(tenths)}kg`;

/** JASSO の区分の範囲の書き方（表用） */
function jassoRange(i: number): string {
  const c = JASSO_CLASSES[i];
  const next = JASSO_CLASSES[i + 1];
  const from = formatTenths(c.fromTenths).replace(/\.0$/, '');
  if (i === 0) return `${formatTenths(next.fromTenths)} 未満`;
  if (!next) return `${from} 以上`;
  return `${from} 以上 ${formatTenths(next.fromTenths).replace(/\.0$/, '')} 未満`;
}

const faq = [
  {
    q: 'BMI 22 が理想の体重なのですか？',
    a: `BMI ${STANDARD_BMI} は、日本肥満学会が「標準体重」の計算に使っている値です。20〜60歳ほどの人の健康診断のデータで、高血圧や脂質異常などの病気が最も少なかった BMI が 22 前後だったことから決められました。ただし、これは集団の統計から出した目安で、誰にとっても 22 がいちばん良いという意味ではありません。厚生労働省の「日本人の食事摂取基準（2025年版）」は、目標とする BMI を 1つの点ではなく幅で示していて、年代が上がるほど下限が高くなります（18〜49歳 18.5〜24.9、50〜64歳 20.0〜24.9、65歳以上 21.5〜24.9）。`,
  },
  {
    q: '何歳から BMI を使うのですか？',
    a: `大人の BMI の判定（日本肥満学会の区分）と食事摂取基準の目標 BMI は、18歳以上が対象です。${CHILD_MIN_AGE}〜${CHILD_MAX_AGE}歳の子どもは、成長の途中で身長と体重の釣り合いが年齢ごとに変わるため、学校健診では BMI ではなく「肥満度」（性別・年齢別・身長別の標準体重と比べて何%重いか軽いか）で判定します。この計算機も、年齢に${CHILD_MIN_AGE}〜${CHILD_MAX_AGE}歳を入れると肥満度で判定します。0〜4歳の乳幼児は別の基準があるため、この計算機では判定しません。`,
  },
  {
    q: 'BMI が普通体重なのに、体脂肪が多いことはありますか？',
    a: 'あります。BMI は身長と体重だけから出すので、体重のうち筋肉と脂肪の割合を区別しません。筋肉の量が少なく脂肪が多い人は、BMI が普通体重の範囲でも体脂肪率が高いことがあります。逆に、筋肉の多いスポーツ選手は BMI が 25 以上でも脂肪は多くないことがあります。お腹まわりにつく内臓脂肪は、健康診断の腹囲の測定などで別に確かめられています。',
  },
  {
    q: '「肥満」と「肥満症」は何が違うのですか？',
    a: '日本肥満学会では、BMI 25 以上を「肥満」としています。これは体格の区分です。「肥満症」は、肥満に加えて、肥満が原因または関係する健康障害（糖尿病・高血圧・脂質異常など）があるか、内臓脂肪が多く健康障害が起きやすい状態で、医学的に減量が必要とされる病気を指します。肥満症かどうかは医師が診断するもので、この計算機の判定は体格の目安にとどまります。',
  },
];

const trail = breadcrumbFor('bmi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'BMI・適正体重 計算機',
      url: `${SITE_URL}/bmi/`,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('bmi'),
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

const left = { textAlign: 'left' } as const;

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>BMI・適正体重 計算機</h1>
      <p className="lead">
        身長と体重を入れると、BMI と日本肥満学会の判定、標準体重（BMI 22）と「普通体重に入る体重の幅」が出ます。年齢を入れると年代別の目標 BMI でも見直し、5〜17歳は学校健診と同じ「肥満度」で判定します。入力した値は送信しません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>BMI の計算式</h2>
      <p>
        BMI（Body Mass Index）は<strong>体重(kg) ÷ 身長(m) ÷ 身長(m)</strong>で出します。
        身長 170cm・体重 63.6kg なら、63.6 ÷ 1.7 ÷ 1.7 ＝ 22.0 です。
        この計算機は、表示した数字と判定が食い違わないよう、BMI を小数第2位以下で切り捨てて小数1桁で表示し、
        境目の判定は丸める前の値で行っています（たとえば 24.96 は「24.9・普通体重」と出ます）。
      </p>

      <h2>日本肥満学会の判定の区分</h2>
      <table>
        <thead>
          <tr>
            <th style={left}>BMI</th>
            <th>判定</th>
          </tr>
        </thead>
        <tbody>
          {JASSO_CLASSES.map((c, i) => (
            <tr key={c.id}>
              <td style={left}>{jassoRange(i)}</td>
              <td>{c.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        日本では BMI 25 以上を「肥満」とします（WHO の基準では 30 以上）。日本人は欧米の人より、
        BMI が低いうちから糖尿病などが起きやすいことが分かっているためです。
        区分はあくまで体格の目安で、病気かどうかを決めるものではありません。
      </p>

      <h2>標準体重が BMI 22 で決まっている理由</h2>
      <p>
        標準体重は<strong>身長(m) × 身長(m) × {STANDARD_BMI}</strong>です。日本肥満学会によると、
        健康診断のデータで高血圧・脂質異常・肝機能の異常などが最も少なかったのが BMI 22 前後で、
        そこから「標準体重」の計算に 22 を使うようになりました。
        もとになったのは働く世代（おおむね 20〜60 歳）のデータなので、高齢の方にそのまま当てはめるものではない、
        というのが次の節の食事摂取基準の考え方です。
      </p>

      <h2>年代によって目標とする BMI が変わる理由</h2>
      <p>
        厚生労働省の「日本人の食事摂取基準（2025年版）」は、目標とする BMI を年代別の<strong>幅</strong>で示しています。
        亡くなる率が最も低かった BMI や、年をとってからの体の機能の低下（フレイル）との関係を踏まえ、
        年代が上がるほど下限が高くなっています。高齢になると、やせすぎによる体力の低下が問題になりやすいためです。
      </p>
      <table>
        <thead>
          <tr>
            <th style={left}>年齢</th>
            <th>目標とする BMI</th>
          </tr>
        </thead>
        <tbody>
          {TARGET_BMI_BANDS.map((b) => (
            <tr key={b.label}>
              <td style={left}>{b.label}</td>
              <td>{targetBandRangeLabel(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        食事摂取基準の注には「男女共通。あくまでも参考として使用すべきである」とあります。
        表の「24.9」は小数1桁で書いた上限で、この計算機では「25.0 未満」として判定しています。
        日本肥満学会の判定では普通体重でも、65歳以上の目標（21.5〜24.9）より低めになることがあり、
        年齢を入れるとその両方を言葉で表示します。
      </p>

      <h2>身長別の体重の早見表</h2>
      <p>
        身長ごとに、普通体重に入る体重の下限（BMI 18.5）・標準体重（BMI 22）・普通体重の上限（BMI 25 未満に収まる体重）を並べました。
        下限は切り上げ、上限は 25 未満に収まる値まで、と幅の内側に丸めているので、表の数字はどれも普通体重に入ります。
      </p>
      <table>
        <thead>
          <tr>
            <th style={left}>身長</th>
            <th>普通体重の下限（BMI 18.5）</th>
            <th>標準体重（BMI 22）</th>
            <th>普通体重の上限（BMI 25 未満）</th>
          </tr>
        </thead>
        <tbody>
          {QUICK_TABLE.map((row) => (
            <tr key={row.heightCm}>
              <td style={left}>{row.heightCm}cm</td>
              <td>{kg(row.lowerTenths)}</td>
              <td>{kg(row.standardTenths)}</td>
              <td>{kg(row.upperTenths)}まで</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>子ども（5〜17歳）は肥満度で見る</h2>
      <p>
        子どもは成長の途中で、身長に対する体重の釣り合いが年齢によって変わります。そのため学校健診では BMI を使わず、
        <strong>肥満度</strong>で判定します。
      </p>
      <ul>
        <li>身長別標準体重(kg) ＝ a × 身長(cm) − b（a・b は性別・年齢ごとの係数）</li>
        <li>肥満度(%) ＝（実測体重 − 身長別標準体重）÷ 身長別標準体重 × 100</li>
        <li>
          判定：+20%以上 軽度肥満／+30%以上 中等度肥満／+50%以上 高度肥満／−20%以下 やせ／−30%以下 高度やせ／それ以外 ふつう
        </li>
      </ul>
      <table>
        <thead>
          <tr>
            <th style={left}>年齢</th>
            <th>男子 a</th>
            <th>男子 b</th>
            <th>女子 a</th>
            <th>女子 b</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(CHILD_COEFFICIENTS.male).map((k) => {
            const age = Number(k);
            const m = CHILD_COEFFICIENTS.male[age];
            const f = CHILD_COEFFICIENTS.female[age];
            return (
              <tr key={age}>
                <td style={left}>{age}歳</td>
                <td>{m.a.toFixed(3)}</td>
                <td>{m.b.toFixed(3)}</td>
                <td>{f.a.toFixed(3)}</td>
                <td>{f.b.toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        学校健診の年齢は<strong>その年度の4月1日時点の満年齢</strong>で数えます。誕生日によっては、
        今日の満年齢と1歳ずれることがあります。0〜4歳の乳幼児は別の基準（発育曲線など）で見るため、この計算機では判定しません。
      </p>

      <h2>BMI だけでは分からないこと</h2>
      <ul>
        <li>
          <strong>筋肉と脂肪を区別しません。</strong>
          筋肉の多い人は BMI が高めに、筋肉の少ない人は低めに出ます。
        </li>
        <li>
          <strong>妊娠中には当てはまりません。</strong>
          妊娠中の体重の増え方には別の目安があり、この計算機では扱いません。かかりつけの医師・助産師にご相談ください。
        </li>
        <li>
          <strong>病気かどうかは決められません。</strong>
          判定は体格の目安です。「肥満症」かどうかは医師が判断します。
        </li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="bmi" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/sleep-cycle/">睡眠サイクル計算機</Link>／
        <Link href="/interval-timer/">インターバルタイマー</Link>／
        <Link href="/nenrei-keisan/">年齢計算</Link>
      </p>

      <ToolMeta slug="bmi">
        出典：
        <a
          href="https://www.mhlw.go.jp/stf/newpage_44138.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「日本人の食事摂取基準（2025年版）」策定検討会報告書
        </a>
        （
        <a
          href="https://www.mhlw.go.jp/content/10904750/001316461.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          「エネルギー」の章
        </a>
        の表1「目標とする BMI の範囲」）／日本肥満学会 編「肥満症診療ガイドライン 2022」（肥満度分類）／
        <a
          href="https://www.jasso.or.jp/data/message/message_0901.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本肥満学会の解説（標準体重 22 の根拠）
        </a>
        ／日本学校保健会「児童生徒等の健康診断マニュアル（平成27年度改訂）」（肥満度・身長別標準体重の係数。突き合わせに
        <a
          href="https://www.mext.go.jp/content/20210728-mxt_chousa01-000013187_3.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          文部科学省の資料
        </a>
        を使用）にもとづき作成。データの最終確認日は{ja(DATA_CHECKED_AT)}です。
        <strong>
          このページの判定は体格の目安であり、診断を行うものではありません。体調や体重のことで気になる点があるときは、医師にご相談ください。
        </strong>
      </ToolMeta>
    </>
  );
}
