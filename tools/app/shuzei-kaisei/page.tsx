import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  ADVICE_LABEL,
  CATEGORIES,
  DATA_CHECKED_AT,
  LIQUEUR_RATE_PER_KL,
  MINOR_DRINKING_NOTE,
  OTHER_SPARKLING_ABV_LIMIT_AFTER,
  OTHER_SPARKLING_ABV_LIMIT_BEFORE,
  REVISION_DATE,
  STAGES,
  adviceFor,
  comparisons,
  formatDate,
  formatDiff,
  formatYenDecimal,
  history,
  taxFor,
  withConsumptionTax,
  SOURCE_MOF_SHUZEI,
  SOURCE_NTA_RATES,
  SOURCE_NTA_STAGES,
} from '@/lib/shuzei-kaisei';
import Calculator from './Calculator';

const title =
  '酒税改正 早見表・負担額計算｜2026年10月からビール減税・第三のビール／チューハイ増税';
const description =
  '2026年10月1日にビール系飲料の酒税が1klあたり155,000円へ一本化されます。350mlあたりビールは9.10円の減税、発泡酒・第三のビールは7.26円の増税、チューハイ等は7.00円の増税。週に飲む本数を入れると年間・月間の負担がいくら変わるかが分かり、9月中に買うと得なもの・待つと得なものも仕分けます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shuzei-kaisei/` },
  robots: robotsFor('shuzei-kaisei'),
};

/**
 * 静的HTMLに焼き込む早見表。
 * 改正前後の2つの段階を比べるだけなので、開いた日に依存しない。
 */
const rows350 = comparisons(350);
const rows500 = comparisons(500);
const historyRows = history(350);
const beer = rows350.find((r) => r.category.id === 'beer')!;
const happoshuLow = rows350.find((r) => r.category.id === 'happoshu-low')!;
const otherSparkling = rows350.find((r) => r.category.id === 'other-sparkling')!;

const faq = [
  {
    q: '酒税はいつ、どのように変わりますか？',
    a: `${formatDate(
      REVISION_DATE,
    )}に、ビール系飲料（ビール・発泡酒・第三のビール）の酒税が1klあたり155,000円に一本化され、チューハイ等の「その他の発泡性酒類」は80,000円から100,000円に引き上げられます。350ml換算では、ビールが63.35円から54.25円へ${formatDiff(
      beer.diff,
    )}、発泡酒（麦芽比率25%未満）と第三のビールが46.99円から54.25円へ${formatDiff(
      happoshuLow.diff,
    )}、チューハイ等が28円から35円へ${formatDiff(
      otherSparkling.diff,
    )}です。これは2017年（平成29年度）の税制改正で決まった段階的な見直しの3回目・最終段階で、2020年10月・2023年10月に続くものです。`,
  },
  {
    q: 'なぜビールだけ安くなるのですか？',
    a: 'ビール系飲料の税率を「一本化」する改正だからです。改正前はビールが1klあたり181,000円、第三のビールが134,250円と大きな差があり、税の差が商品開発をゆがめている（税率の低い区分に合わせた商品が作られる）と指摘されていました。そこで中間の155,000円に揃えることになり、高いほうのビールは下がり、安いほうの発泡酒・第三のビールは上がります。値下げのための改正ではなく、区分による差をなくすための改正です。',
  },
  {
    q: 'ワイン・日本酒・ウイスキーの税金も変わりますか？',
    a: '今回は変わりません。清酒・果実酒（ワイン）などの醸造酒類は、同じ平成29年度改正のなかで2023年10月に1klあたり100,000円へ一本化する作業がすでに完了しています（清酒は120,000円から引き下げ、果実酒は80,000円から引き上げ）。蒸留酒類（焼酎・ウイスキーなど）や混成酒類は今回の見直しの対象外です。2026年10月に動くのは発泡性酒類だけです。',
  },
  {
    q: '店頭の価格はいくら変わりますか？',
    a: `確定していません。このページが計算しているのは酒税の額だけで、店頭価格は各メーカー・小売の改定発表によって決まります。酒税は消費税の課税対象に含まれるので、酒税の増減がそのまま価格に乗るとすれば、350mlのチューハイなら${formatYenDecimal(
      withConsumptionTax(otherSparkling.diff),
    )}の値上がり、350mlのビールなら${formatYenDecimal(
      Math.abs(withConsumptionTax(beer.diff)),
    )}の値下がりが目安です。ただし実際には原材料費・物流費の改定と同時に発表されることが多く、酒税の増減と一致しないことがあります。`,
  },
  {
    q: '9月のうちに買いだめしたほうが得ですか？',
    a: `種類によって答えが逆になります。${formatDate(
      REVISION_DATE,
    )}から酒税が上がる発泡酒（麦芽比率25%未満）・第三のビール・チューハイ等は、施行前に買っておくほうが酒税のぶんだけ得です。逆にビールは下がるので、急いで買う理由はありません。ただし酒類には賞味期限（ビール類は製造から9か月〜1年が目安）があり、価格改定の直前は品薄になることもあります。飲みきれる量にとどめてください。${MINOR_DRINKING_NOTE}`,
  },
  {
    q: '発泡酒と第三のビールは、いま税額が違うのですか？',
    a: '同じです。第三のビール（新ジャンル）という税率区分は2023年10月になくなり、発泡酒に統合されました。したがって現在は、発泡酒（麦芽比率25%未満）も第三のビールも1klあたり134,250円（350mlで46.99円）で同じです。ラベルの品目表示が「発泡酒」に変わった商品が多いのはこのためです。2026年10月には、これらもビールと同じ155,000円になります。',
  },
  {
    q: 'ストロング系チューハイ（アルコール分9%など）はどうなりますか？',
    a: `アルコール分によって扱いが分かれます。${formatDate(
      REVISION_DATE,
    )}から「その他の発泡性酒類」の税率を適用できるアルコール分の上限が${OTHER_SPARKLING_ABV_LIMIT_BEFORE}度未満から${OTHER_SPARKLING_ABV_LIMIT_AFTER}度未満に広がります。アルコール分${OTHER_SPARKLING_ABV_LIMIT_BEFORE}度未満のチューハイは28円から35円へ増税ですが、いままでリキュール（1klあたり${LIQUEUR_RATE_PER_KL.toLocaleString(
      'ja-JP',
    )}円・350mlで${formatYenDecimal(
      taxFor(LIQUEUR_RATE_PER_KL, 350),
    )}）として課税されていたアルコール分${OTHER_SPARKLING_ABV_LIMIT_BEFORE}度以上${OTHER_SPARKLING_ABV_LIMIT_AFTER}度未満のものは、その他の発泡性酒類に移って35円になります。この計算機は${OTHER_SPARKLING_ABV_LIMIT_BEFORE}度未満のものを前提にしています。`,
  },
  {
    q: 'ノンアルコールビールは対象ですか？',
    a: 'いいえ。酒税がかかるのはアルコール分1度以上の飲料（酒類）です。ノンアルコールビールはそもそも酒類ではないので酒税がかからず、今回の改正の影響も受けません。',
  },
  {
    q: 'この計算をそのまま信じて大丈夫ですか？',
    a: `税率と施行日は国税庁・財務省の公表資料にもとづいていますが、負担額の計算は飲む量がずっと一定であると仮定した概算です。また計算しているのは酒税の額だけで、店頭価格の改定額ではありません。正確な税率は国税庁の酒税率一覧表で、価格は各社の発表でご確認ください（データ最終更新日：${formatDate(
      DATA_CHECKED_AT,
    )}）。`,
  },
];

const trail = breadcrumbFor('shuzei-kaisei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '酒税改正 早見表・負担額計算',
      url: `${SITE_URL}/shuzei-kaisei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shuzei-kaisei'),
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

      <h1>酒税改正 早見表・負担額計算</h1>
      <p className="lead">
        {formatDate(REVISION_DATE)}
        にビール系飲料の酒税が1klあたり155,000円へ一本化されます。350mlあたりビールは
        <strong>{formatDiff(beer.diff)}の減税</strong>、発泡酒・第三のビールは
        <strong>{formatDiff(happoshuLow.diff)}</strong>、チューハイ等は
        <strong>{formatDiff(otherSparkling.diff)}</strong>
        の増税です。何がいくら変わるのかと、あなたの飲み方だと年間の負担がどう変わるのかを計算します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>何が、いくら変わるのか（早見表）</h2>
      <p>
        酒税は<strong>容量にかかる従量税</strong>
        なので、値段が高い銘柄でも安い銘柄でも、同じ容量なら税額は同じです。
        {formatDate(REVISION_DATE)}を境に、350ml・500mlの1本あたりの酒税は次のように変わります。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>種類</th>
              <th>350ml（改正前）</th>
              <th>350ml（10月〜）</th>
              <th>増減</th>
              <th>500ml（改正前）</th>
              <th>500ml（10月〜）</th>
              <th>増減</th>
            </tr>
          </thead>
          <tbody>
            {rows350.map((row, i) => {
              const large = rows500[i];
              return (
                <tr key={row.category.id}>
                  <th scope="row">
                    {row.category.label}
                    <span className="chip">{ADVICE_LABEL[adviceFor(row.category)]}</span>
                  </th>
                  <td>{formatYenDecimal(row.before)}</td>
                  <td>{formatYenDecimal(row.after)}</td>
                  <td>
                    <strong>{formatDiff(row.diff)}</strong>
                  </td>
                  <td>{formatYenDecimal(large.before)}</td>
                  <td>{formatYenDecimal(large.after)}</td>
                  <td>
                    <strong>{formatDiff(large.diff)}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        出典：
        <a href={SOURCE_NTA_RATES.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_RATES.label}
        </a>
        、
        <a href={SOURCE_MOF_SHUZEI.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF_SHUZEI.label}
        </a>
        。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </p>

      <h2>これは「段階的見直し」の3回目・最終段階</h2>
      <p>
        今回の改正は、2017年（平成29年度）の税制改正で決まった<strong>税率構造の見直し</strong>
        の最後の1回です。急な変更を避けるために10年近くかけて3段階で実施されてきました。350mlあたりの酒税の推移は次のとおりです。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>種類（350ml）</th>
              {STAGES.map((stage) => (
                <th key={stage.id}>{stage.label}</th>
              ))}
              <th>通算</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.map((row) => (
              <tr key={row.category.id}>
                <th scope="row">{row.category.label}</th>
                {row.taxes.map(({ stage, tax }) => (
                  <td key={stage.id}>{formatYenDecimal(tax)}</td>
                ))}
                <td>
                  <strong>{formatDiff(row.totalDiff)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        {STAGES.filter((s) => s.effectiveFrom).map((stage) => (
          <li key={stage.id}>
            <strong>{formatDate(stage.effectiveFrom as string)}</strong> — {stage.note}
          </li>
        ))}
      </ul>
      <p className="note">
        出典：
        <a href={SOURCE_NTA_STAGES.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_STAGES.label}
        </a>
        （3ページの税率表）
      </p>

      <h2>種類ごとに何が起きるのか</h2>
      <ul>
        {CATEGORIES.map((category) => (
          <li key={category.id}>
            <strong>{category.label}</strong> — {category.note}
          </li>
        ))}
      </ul>
      <p>
        なお、{formatDate(REVISION_DATE)}からは「その他の発泡性酒類」の税率を適用できる
        <strong>アルコール分の上限</strong>も{OTHER_SPARKLING_ABV_LIMIT_BEFORE}度未満から
        {OTHER_SPARKLING_ABV_LIMIT_AFTER}
        度未満に広がります。これまでリキュール（1klあたり
        {LIQUEUR_RATE_PER_KL.toLocaleString('ja-JP')}円・350mlで
        {formatYenDecimal(taxFor(LIQUEUR_RATE_PER_KL, 350))}）として課税されていたアルコール分
        {OTHER_SPARKLING_ABV_LIMIT_BEFORE}度以上{OTHER_SPARKLING_ABV_LIMIT_AFTER}
        度未満の商品は、こちらに移って350mlあたり35円になります。同じ「チューハイ」でも、アルコール分によって増税と減税に分かれます。
      </p>

      <h2>買いだめの判断は種類で逆になる</h2>
      <p>
        増税される発泡酒（麦芽比率25%未満）・第三のビール・チューハイ等は
        <strong>施行前に買うほうが酒税のぶんだけ得</strong>で、減税されるビールは
        <strong>施行後のほうが得</strong>
        です。ただし酒税の増減がそのまま店頭価格に反映されるとは限らず、酒類には賞味期限（ビール類は製造から9か月〜1年が目安）もあります。飲みきれる量にとどめてください。
        {MINOR_DRINKING_NOTE}
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>銘柄ごとの価格</strong> —
          店頭価格は各社の改定発表で決まり、原材料費・物流費の改定と同時に見直されることも多いため、酒税の増減だけを計算しています
        </li>
        <li>
          <strong>清酒・ワイン・ウイスキーなどの税率</strong> —
          {formatDate(REVISION_DATE)}
          の改正の対象外です（醸造酒類の一本化は2023年10月に完了しています）
        </li>
        <li>
          <strong>飲酒の健康影響</strong> —
          事実としての税額の提示にとどめています。{MINOR_DRINKING_NOTE}
        </li>
        <li>
          <strong>酒税以外の税・手持品課税</strong> —
          消費税は税額の目安として掛け算に使うだけで、内訳としては扱いません
        </li>
      </ul>

      <h2>2026年10月に変わるものを、まとめて確認する</h2>
      <p>
        同じ{formatDate(REVISION_DATE)}には
        <Link href="/tabako-zei-neage/">たばこの課税方式の見直し</Link>
        （加熱式たばこ）や、
        <Link href="/saitei-chingin/">最低賃金の改定</Link>、
        <Link href="/nenshu-kabe/">106万円の壁の撤廃</Link>
        もあります。家計に効くものをまとめて確認しておくと見通しが立てやすくなります。
      </p>

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

      <RelatedTools current="shuzei-kaisei" />

      <ToolMeta slug="shuzei-kaisei" ymyl>
        税率と施行日は
        <a href={SOURCE_NTA_RATES.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_RATES.label}
        </a>
        、
        <a href={SOURCE_NTA_STAGES.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_STAGES.label}
        </a>
        および
        <a href={SOURCE_MOF_SHUZEI.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF_SHUZEI.label}
        </a>
        にもとづきます。
        <strong>
          計算しているのは酒税の額だけで、店頭価格の改定額ではありません。
        </strong>
        価格は各社の発表でご確認ください。{MINOR_DRINKING_NOTE}データ最終更新日：
        {formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
