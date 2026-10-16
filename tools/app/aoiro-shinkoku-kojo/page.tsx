import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  DEDUCTION_R8,
  DEDUCTION_R9,
  FORM_PAGE,
  SOURCES,
  incomeForTaxable,
  taxDiff,
} from '@/lib/aoiro-shinkoku-kojo';
import Calculator from './Calculator';

const title =
  '青色申告特別控除 判定（令和9年分から）｜書面申告は55万円→10万円に。e-Taxで65万円・優良な電子帳簿で75万円';
const description =
  '2027年分（令和9年分）から青色申告特別控除が変わります。書面申告は複式簿記でも上限10万円、e-Taxで65万円、優良な電子帳簿かデジタルシームレス保存で75万円、簡易簿記で前々年の収入1,000万円超は0円。帳簿と申告の方法から控除額と令和8年分との差・税額の目安を判定します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/aoiro-shinkoku-kojo/` },
  robots: robotsFor('aoiro-shinkoku-kojo'),
};

const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;
const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

/**
 * 書面申告の55万円 → 10万円で増える税額の例（本文に額を手で書かないため lib で出す）。
 * 令和9年分の課税所得が260万円（10%の帯）・500万円（20%の帯）で、令和8年分も同じ帯に収まる人
 */
const paperLoss = (taxableR9: number) =>
  taxDiff(
    incomeForTaxable(taxableR9, DEDUCTION_R9.basic),
    0,
    DEDUCTION_R8.paper,
    DEDUCTION_R9.basic,
  ).total;
const PAPER_LOSS_10 = paperLoss(2_600_000);
const PAPER_LOSS_20 = paperLoss(5_000_000);

const faq = [
  {
    q: '55万円の青色申告特別控除は廃止されるのですか？',
    a: `「書面申告で${man(DEDUCTION_R8.paper)}」という区分がなくなります。令和9年分（2027年分）からは、複式簿記で記帳していても書面で申告すると上限は${man(DEDUCTION_R9.basic)}です。期限内に e-Tax で送信すれば${man(DEDUCTION_R9.etax)}、さらに優良な電子帳簿かデジタルシームレス保存の要件を満たせば${man(DEDUCTION_R9.top)}です。`,
  },
  {
    q: 'いつの申告から変わりますか？',
    a: '2027年1月〜12月の所得を申告する令和9年分（確定申告は2028年2〜3月）からです。2027年2〜3月に申告する令和8年分（2026年分）は、これまでどおり書面申告でも55万円を受けられます。住民税は前年の所得で計算するので、令和10年度（2028年度）分から同じ額が効きます。',
  },
  {
    q: '優良な電子帳簿は年の途中から始めても75万円になりますか？',
    a: 'なりません。優良な電子帳簿で75万円を受けるには、その年の仕訳帳・総勘定元帳を課税期間の最初（1月1日）から要件を満たして付けている必要があります。2027年分で受けるなら、2026年のうちに帳簿の付け方を決めてください。届出書はその年分の確定申告期限までに出します。',
  },
  {
    q: 'すでに優良な電子帳簿で65万円を受けています。届出書を出し直す必要はありますか？',
    a: 'ありません。国税庁のリーフレットでは、すでに「優良な電子帳簿の保存」で65万円の控除を受けている方は、改めて届出書を出す必要はないとされています。e-Tax で期限内に申告すれば、令和9年分から75万円の区分になります。',
  },
  {
    q: '簡易簿記で10万円の控除を受けています。何が変わりますか？',
    a: '事業所得か事業的規模の不動産所得があり、どちらかの前々年分の収入金額（売上）が1,000万円を超える年は、10万円の控除が受けられなくなります（0円）。令和9年分なら2025年分の収入で判定します。1,000万円ちょうどは「超える」に当たりません。複式簿記で記帳して期限内に e-Tax で申告すれば、65万円か75万円になります。',
  },
  {
    q: '不動産所得が業務的規模（5棟10室に満たない）でも0円になりますか？',
    a: 'なりません。0円になるのは「事業」として行われている不動産所得と事業所得で、業務的規模の不動産所得は前々年の収入が1,000万円を超えても最大10万円のままです。ただし業務的規模は複式簿記に移っても最大10万円で、65万円・75万円にはなりません。',
  },
  {
    q: '国民健康保険料や個人事業税にも影響しますか？',
    a: '国民健康保険料は所得をもとに計算するので、控除が減ると上がることがありますが、計算方法は自治体ごとに違うため本ツールでは出していません。個人事業税は青色申告特別控除が差し引かれない税なので、控除額が変わっても影響しません。',
  },
];

const trail = breadcrumbFor('aoiro-shinkoku-kojo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '青色申告特別控除 判定（令和9年分から）',
      url: `${SITE_URL}/aoiro-shinkoku-kojo/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('aoiro-shinkoku-kojo'),
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

      <h1>青色申告特別控除 判定（令和9年分から）</h1>
      <p className="lead">
        2027年分（令和9年分）から、<strong>書面申告の青色申告特別控除は複式簿記でも上限10万円</strong>になります。
        e-Tax で65万円、優良な電子帳簿かデジタルシームレス保存で75万円です。帳簿の付け方と申告の方法を選ぶと、
        令和9年分の控除額と、令和8年分（今年）との差、税額の目安を判定します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>令和9年分からの4つの区分</h2>
      <p>
        令和8年度税制改正（所得税法等の一部を改正する法律・<strong>令和8年法律第12号</strong>）で
        租税特別措置法25条の2が改められ、令和9年分以後の所得税から次の区分になります（附則33条）。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>令和9年分以後</th>
              <th>要件</th>
              <th>令和8年分まで</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{man(DEDUCTION_R9.top)}</strong>
              </td>
              <td style={{ textAlign: 'left' }}>
                65万円の要件に加えて、優良な電子帳簿の保存（仕訳帳・総勘定元帳を1月1日から）か、デジタルシームレス保存。届出書を確定申告期限まで
              </td>
              <td>なし（優良な電子帳簿は65万円の要件の1つ）</td>
            </tr>
            <tr>
              <td>
                <strong>{man(DEDUCTION_R9.etax)}</strong>
              </td>
              <td style={{ textAlign: 'left' }}>
                複式簿記で記帳し、確定申告書と青色申告決算書（貸借対照表を含む）を期限内に e-Tax で送信
              </td>
              <td>{man(DEDUCTION_R8.etax)}（e-Tax か優良な電子帳簿）</td>
            </tr>
            <tr>
              <td>
                <strong>{man(DEDUCTION_R9.basic)}</strong>
              </td>
              <td style={{ textAlign: 'left' }}>
                上のどれにも当たらない青色申告（複式簿記の書面申告・期限後申告、簡易簿記、現金主義の特例、業務的規模の不動産所得）
              </td>
              <td>
                複式簿記の書面申告は{man(DEDUCTION_R8.paper)}、ほかは{man(DEDUCTION_R8.basic)}
              </td>
            </tr>
            <tr>
              <td>
                <strong>0円</strong>
              </td>
              <td style={{ textAlign: 'left' }}>
                簡易簿記などで、事業所得か事業的規模の不動産所得の<strong>どちらかの前々年分の収入金額が1,000万円超</strong>
              </td>
              <td>{man(DEDUCTION_R8.basic)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        どの区分でも、控除できるのは青色申告特別控除を引く前の所得（不動産所得と事業所得の合計）までです。
        両方の所得がある場合は、不動産所得から先に差し引きます。
      </p>

      <h2>何もしないと控除が45万円減る人</h2>
      <p>
        いちばん影響が大きいのは、<strong>複式簿記で記帳して書面で申告している人</strong>です。
        令和8年分までは書面でも55万円でしたが、令和9年分からは10万円になり、控除が45万円減ります。
        所得税（復興特別所得税を含む）と住民税を合わせると、所得税の税率が10%の帯の人で約{yen(PAPER_LOSS_10)}、
        20%の帯の人で約{yen(PAPER_LOSS_20)}、税額が増える目安です（控除の差で帯をまたがない場合）。
        期限内に e-Tax で送信すれば65万円となり、令和8年分の55万円より10万円増えます。
      </p>

      <h2>簡易簿記で前々年の収入が1,000万円を超える人は0円</h2>
      <p>
        簡易簿記で10万円の控除を受けている人のうち、<strong>前々年分の事業・不動産の収入金額（売上）が1,000万円を超える</strong>
        年は、控除が受けられなくなります。判定は所得ではなく収入で、事業と不動産の両方がある人は合計ではなく
        <strong>どちらか一方</strong>で見ます。業務的規模の不動産所得はこの判定に入らず、10万円のままです。
        現金主義による所得計算の特例を受けている人も、10万円のままです。
      </p>

      <h2>75万円を受けるなら、帳簿の付け方を年内に決める</h2>
      <p>
        優良な電子帳簿で75万円を受けるには、その年の仕訳帳・総勘定元帳を<strong>課税期間の最初（1月1日）から</strong>
        要件を満たして付けている必要があります。2027年分で75万円を受けるなら、2026年12月31日までに決めてください。
        デジタルシームレス保存は、国税庁長官が定める基準に適合するシステムで電子取引のデータを送受信・保存する方法です。
        どちらも届出書を確定申告期限までに税務署へ出します。届出書の名称は令和9年3月頃に「65万」から「75万」に変わる予定なので、
        様式は
        <a href={FORM_PAGE.url} target="_blank" rel="nofollow noopener noreferrer">
          {FORM_PAGE.label}
        </a>
        で確かめてください。法的要件を満たした会計ソフトを探すときは、国税庁の資料が案内している「JIIMA 認証情報リスト」が目安になります。
      </p>

      <PublicToolLink slug="invoice-nozeigaku">
        <p>
          インボイスの2割特例が終わったあとの消費税は
          <ToolLink slug="invoice-nozeigaku">インボイス 納税額 計算機</ToolLink>
          で比べられます。
        </p>
      </PublicToolLink>

      <div className="note">
        本ツールの判定と税額は目安です。控除額は帳簿の内容・届出の状況・申告の時期で変わります。
        節税になるかの判断や申告の内容は、税務署か税理士に確認してください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="aoiro-shinkoku-kojo" />

      <ToolMeta slug="aoiro-shinkoku-kojo" ymyl>
        出典：
        {SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '／'}
            <a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
              {s.label}
            </a>
          </span>
        ))}
        にもとづき作成。新しい区分は令和9年分（2027年）以後の所得税と、令和10年度（2028年度）以後の住民税に適用されます。
      </ToolMeta>
    </>
  );
}
