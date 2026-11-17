import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { formatPercent, hensachi, roundTo, summarize, upperPercent } from '@/lib/hensachi';
import Calculator from './Calculator';

// 仕様書の title から末尾の「｜hasokon」だけ外している（layout の template が付けるため）
const title = '偏差値 計算｜平均点と標準偏差から・上位何%か・必要な点数も';
const description =
  '点数・平均点・標準偏差から偏差値と上位何%（正規分布の目安）を、目標の偏差値から必要な点数を計算。クラスや部活の点数を貼り付ければ、平均・母標準偏差（STDEV.P）・全員の偏差値と順位を一度に出します。点数は端末の外に送りません。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['偏差値 計算', '偏差値 求め方', '標準偏差 計算', '偏差値 上位 何パーセント', '共通テスト 偏差値'],
  alternates: { canonical: `${SITE_URL}/hensachi/` },
  robots: robotsFor('hensachi'),
};

// 本文の例はロジックから出す（手で数字を書かない）
const f1 = (x: number) => roundTo(x, 1).toFixed(1);
const f2 = (x: number) => roundTo(x, 2).toFixed(2);
const EX_SCORES = [50, 60, 70, 80, 90];
const EX = summarize(EX_SCORES.map((score) => ({ label: null, score })))!;
const EX_TOP = EX_SCORES[EX_SCORES.length - 1];
const EX_POP = hensachi(EX_TOP, EX.mean, EX.sd)!;
const EX_SAMPLE = hensachi(EX_TOP, EX.mean, EX.sampleSd!)!;
const up = (t: number) => formatPercent(upperPercent(t));

const faq = [
  {
    q: '平均点しか分からないときは？',
    a: '偏差値は「平均との差」を「ばらつき（標準偏差）」で割って出すので、平均点だけでは出せません。同じ平均との差10点でも、ばらつきが小さい試験なら偏差値は高く、大きい試験なら低くなります。標準偏差が公表されていなければ、全員の点数を貼り付けて出すか、平均との差だけを目安にしてください。',
  },
  {
    q: '偏差値 60 は上位何%？',
    a: `点数の分布を正規分布とみなすと、偏差値60は上位${up(60)}（およそ6人に1人）です。65なら${up(65)}、70なら${up(70)}、55なら${up(55)}、50はちょうど真ん中の${up(50)}です。実際の試験は正規分布ではないので、目安として使ってください。`,
  },
  {
    q: '共通テストの偏差値は？',
    a: '大学入試センターが例年2月上旬に出す最終の「平均点等一覧」には、科目ごとの平均点と標準偏差が載ります。その2つと自分の得点を入れれば、受験者全体の中での偏差値を出せます。試験の数日後の中間集計で標準偏差が分からない段階では、偏差値は出せません。',
  },
  {
    q: '模試ごとに偏差値が違うのは？',
    a: '偏差値は「その試験を受けた人の中での位置」なので、受けている人の集団が違えば同じ実力でも値が変わります。受験者の層が高い模試ほど偏差値は低めに出ます。違う模試の偏差値どうしを比べることはできません。',
  },
  {
    q: '偏差値が 100 を超えることは？',
    a: 'あります。母標準偏差を使うと、偏差値のいちばん大きい値は 50＋10×√(人数−1) なので、受験者が27人以上で1人だけ飛び抜けて高いときに100を超えます。26人以下では100を超えません（1人100点・25人0点でちょうど100.0）。',
  },
  {
    q: 'Excel で出すには？',
    a: '偏差値は =STANDARDIZE(得点, AVERAGE(範囲), STDEV.P(範囲))*10+50 で出せます。標準偏差は STDEV.P（n で割る母標準偏差）を使います。STDEV.S（n−1 で割る）を使うと、人数が少ないときに偏差値が50に寄って小さく出ます。',
  },
  {
    q: 'タイムを分:秒で貼り付けられますか？',
    a: '1:02.3 のような分:秒の書式は読めません。62.3 のように秒に直して貼り付け、「小さいほど良い記録」に印を付けてください。',
  },
];

const trail = breadcrumbFor('hensachi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '偏差値 計算機（点数を貼り付けて全員分も）',
      url: `${SITE_URL}/hensachi/`,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('hensachi'),
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

const TABLE_T = [70, 65, 60, 55, 50, 45, 40];

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>偏差値 計算機（点数を貼り付けて全員分も）</h1>
      <p className="lead">
        点数・平均点・標準偏差の3つから偏差値と「上位何%くらいか」を、逆に目標の偏差値から必要な点数を出します。
        クラスや部活の点数を貼り付ければ、平均・標準偏差・全員の偏差値と順位を一度に。計算はすべてブラウザの中で行い、点数はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>計算のしかた</h2>
      <h3>偏差値の式</h3>
      <p>
        <strong>偏差値 ＝ 50 ＋ 10 ×（得点 − 平均点）÷ 標準偏差</strong>
        。平均点ちょうどなら50、平均より標準偏差1つ分高ければ60、2つ分高ければ70です。
        目標の偏差値に必要な点数は、この式を逆にして <strong>平均点 ＋ 標準偏差 ×（目標の偏差値 − 50）÷ 10</strong> で出し、
        1点刻みで切り上げます（72.1点必要なら72点では届かないので73点）。
      </p>
      <h3>標準偏差は「n で割る」ほう（母標準偏差）</h3>
      <p>
        標準偏差は、各人の「平均との差」を2乗して平均し、その平方根をとったものです。偏差値には、人数 n で割る<strong>母標準偏差</strong>
        （表計算ソフトの STDEV.P）を使います。n−1 で割る標本標準偏差（STDEV.S）と取り違えやすいので注意してください。
      </p>
      <p>
        たとえば {EX_SCORES.join('・')} 点の{EX.count}人なら、平均は{EX.mean}点、母標準偏差は{f2(EX.sd)}で、{EX_TOP}点の偏差値は
        <strong>{f1(EX_POP)}</strong>です。標本標準偏差（{f2(EX.sampleSd!)}）で割ると{f1(EX_SAMPLE)}になり、{f1(EX_POP - EX_SAMPLE)}ずれます。
        人数が少ないほどこの差は大きくなります。
      </p>
      <h3>「上位何%」は正規分布とみなしたときの目安</h3>
      <p>
        点数の分布が正規分布（左右対称の釣り鐘の形）だとすると、偏差値から上位何%かが決まります。
        ただし実際の試験は満点や0点で打ち切られたり、得意・不得意で山が2つになったりするので、ぴったりにはなりません。
        人数が少ない（30人未満）ときは特にずれやすくなります。
      </p>
      <table>
        <thead>
          <tr>
            <th>偏差値</th>
            <th>上位の目安</th>
          </tr>
        </thead>
        <tbody>
          {TABLE_T.map((t) => (
            <tr key={t}>
              <td>{t}</td>
              <td>{up(t)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hensachi" />

      <PublicToolLink slug="waribiki-percent">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ほかの「%」の計算：<ToolLink slug="waribiki-percent">割引・パーセント計算</ToolLink>
        </p>
      </PublicToolLink>

      <PublicToolLink slug="nenrei-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          学年を確かめる：<ToolLink slug="nenrei-keisan">年齢計算・西暦和暦変換（学年の早見つき）</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="hensachi">
        出典：
        <a href="https://www.dnc.ac.jp/kyotsu/" target="_blank" rel="nofollow noopener noreferrer">
          大学入試センター「大学入学共通テスト」（実施結果の概要・平均点等一覧）
        </a>
        ／上側確率の計算：M. Abramowitz &amp; I. A. Stegun, <i>Handbook of Mathematical Functions</i>, 7.1.26（誤差 1.5×10⁻⁷ 以下）。
        偏差値・標準偏差の式はどの教科書でも同じ定義です。志望校の合格可能性や大学の偏差値、共通テストの得点調整は扱いません。
      </ToolMeta>
    </>
  );
}
