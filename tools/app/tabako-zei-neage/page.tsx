import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  DATA_CHECKED_AT,
  HEATED_ALIGNED_FROM,
  HEATED_GRAM_PER_STICK,
  HEATED_STEP1_FROM,
  PHASES,
  SAMPLE_PRICES,
  SOURCE_MOF_QA,
  SOURCE_MOF_TABAKO,
  SOURCE_NTA_HEATED,
  formatDate,
  formatYen,
  formatYenDecimal,
  priceTimeline,
  taxPerThousand,
  taxTimeline,
} from '@/lib/tabako-zei';
import Calculator from './Calculator';

const title = 'たばこ値上げ早見表・負担額計算｜2026年10月・2027年4月からの増税で1箱いくら？';
const description =
  'たばこ税は2027年4月から毎年4月に1本0.5円ずつ3回に分けて上がります（1箱20本で1回あたり税込11円、3回で33円）。加熱式たばこは2026年10月に紙巻と同じ課税へ揃います。銘柄の価格を入れると2029年4月までの想定価格が分かり、1日の本数から月間・年間の負担額と増える分、買わなくなった場合に浮く額まで計算できます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tabako-zei-neage/` },
  robots: robotsFor('tabako-zei-neage'),
};

/** 静的HTMLに焼き込む早見表。現行を起点にするので、開いた日に依存しない */
const timeline = taxTimeline();
const lastPoint = timeline[timeline.length - 1];
const currentRates = PHASES[0].rates;

const faq = [
  {
    q: 'たばこはいつから、いくら値上げになりますか？',
    a: `たばこ税は${formatDate(PHASES[1].effectiveFrom)}・${formatDate(
      PHASES[2].effectiveFrom,
    )}・${formatDate(
      PHASES[3].effectiveFrom,
    )}の3回に分けて、国たばこ税が1本あたり0.5円ずつ引き上げられます。1箱20本なら1回あたり10円（税抜）で、増税分にも消費税がかかるため小売価格では11円ぶんにあたります。3回すべてが終わると1箱あたり30円（税込33円）の増税です。これとは別に、加熱式たばこは${formatDate(
      HEATED_STEP1_FROM,
    )}と${formatDate(
      HEATED_ALIGNED_FROM,
    )}の2段階で紙巻たばことの税負担差を解消する見直しがあります。ただし実際の小売価格はメーカーの申請にもとづく財務大臣の認可で決まるため、増税額がそのまま値上げ額になるとは限りません。`,
  },
  {
    q: 'なぜ上がるのですか？',
    a: '防衛力強化の財源を確保するための税制措置（令和7年度税制改正）によるものです。たばこ税のほか法人税・所得税にも措置が入っており、たばこ税については加熱式たばこの課税方式の適正化を先に行ったうえで、2027年4月から3段階で税率を引き上げる形になっています。健康増進を目的とした値上げではなく、財源確保が目的である点が過去の増税と異なります。',
  },
  {
    q: '加熱式たばこはどうなりますか？',
    a: `加熱式たばこは、紙巻たばことの税負担の差を解消するため、課税方式（紙巻たばこへの本数の換算方法）が${formatDate(
      HEATED_STEP1_FROM,
    )}と${formatDate(
      HEATED_ALIGNED_FROM,
    )}の2段階で見直されます。${formatDate(
      HEATED_ALIGNED_FROM,
    )}以降は、スティック型は葉たばこ等の重量${HEATED_GRAM_PER_STICK}gごとに紙巻たばこ1本へ換算され、1本あたりの重量が${HEATED_GRAM_PER_STICK}g以下の製品には最低課税が働いてスティック1本が紙巻たばこ1本として扱われます。市販のスティックはおおむねこの範囲に入るため、20本入り1箱の税額は紙巻たばこ1箱と同じ${formatYenDecimal(
      timeline[0].perPack,
    )}になります。上がり幅は製品ごとの重量と定価で決まるので、このページでは加熱式の見直しぶんの値上げ額は出していません。`,
  },
  {
    q: '小売価格はいつ決まるのですか？',
    a: 'たばこの小売定価は、製造たばこの製造者・特定販売業者が財務大臣に申請し、認可を受けて決まります（たばこ事業法）。増税の施行日に合わせて申請・認可が行われるのが通例で、各社の発表は施行の数か月前になることが多いです。したがって「増税額 = 値上げ額」とは限らず、端数の調整などで実際の価格は前後します。このページの想定価格は、増税分がそのまま価格に乗ったと仮定した目安です。',
  },
  {
    q: '1箱580円のうち、税金はいくらですか？',
    a: `たばこ税は本数にかかる従量税なので、銘柄の価格にかかわらず1箱20本あたり${formatYenDecimal(
      timeline[0].perPack,
    )}（国たばこ税・たばこ特別税・道府県たばこ税・市町村たばこ税の合計）です。これに消費税が加わるため、580円の銘柄なら消費税は約52.7円で、合計約357.6円、価格の約6割が税金という計算になります。高い銘柄でもたばこ税の額は同じなので、価格が上がるほど税の占める割合は下がります。`,
  },
  {
    q: '税率が上がるのは国のたばこ税だけですか？',
    a: `はい。今回の引き上げの対象は国たばこ税で、1,000本あたり6,802円から500円ずつ3回上がって8,302円になります。たばこ特別税（820円）・道府県たばこ税（1,070円）・市町村たばこ税（6,552円）は据え置きです。1,000本あたりの合計は${taxPerThousand(
      currentRates,
    ).toLocaleString('ja-JP')}円から${taxPerThousand(PHASES[3].rates).toLocaleString(
      'ja-JP',
    )}円になります。`,
  },
  {
    q: '手持品課税とは何ですか？',
    a: '税率が上がる日をまたいで一定数量以上のたばこを在庫として持っている小売店などに、差額分の税が課される仕組みです。過去の増税では2万本（1,000箱）以上の在庫を持つ販売業者が対象でした。買い置きした個人の消費者が対象になるものではありませんが、施行日前後は在庫の入れ替えで一時的に品薄になることがあります。',
  },
  {
    q: 'このページの金額をそのまま信じても大丈夫ですか？',
    a: `税率と施行日は財務省・国税庁の資料にもとづいていますが、小売価格は認可制のため、このページの想定価格は確定した金額ではありません。負担額の計算も、1日の本数がずっと一定であると仮定した概算です。正確な税率・施行日は財務省および国税庁の公表資料で、銘柄ごとの価格は各社の発表でご確認ください（データ最終更新日：${formatDate(
      DATA_CHECKED_AT,
    )}）。`,
  },
];

const trail = breadcrumbFor('tabako-zei-neage');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'たばこ値上げ早見表・負担額計算',
      url: `${SITE_URL}/tabako-zei-neage/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('tabako-zei-neage'),
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

      <h1>たばこ値上げ早見表・負担額計算</h1>
      <p className="lead">
        たばこ税は{formatDate(PHASES[1].effectiveFrom)}から毎年4月に1本0.5円ずつ、3回に分けて上がります（1箱20本なら1回あたり税込11円）。加熱式たばこは
        {formatDate(HEATED_ALIGNED_FROM)}
        に紙巻たばこと同じ課税へ揃います。いつ・いくら上がるのかと、あなたの吸う量だと負担がどれだけ増えるのかを計算します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>いつ・いくら上がるのか（早見表）</h2>
      <p>
        引き上げの対象は<strong>国たばこ税</strong>で、1,000本あたり500円（1本あたり0.5円）ずつ3回上がります。たばこ特別税・道府県たばこ税・市町村たばこ税は据え置きです。たばこ税は本数にかかる<strong>従量税</strong>なので、銘柄の価格にかかわらず1箱あたりの税額は同じです。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>時期</th>
              <th>国たばこ税（1,000本）</th>
              <th>税額の合計（1,000本）</th>
              <th>1箱20本のたばこ税</th>
              <th>現行との差（税込）</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((point) => (
              <tr key={point.phase.id}>
                <th scope="row">
                  {point.phase.label}
                  {point.phase.id !== 'current' && (
                    <span className="chip">{formatDate(point.phase.effectiveFrom)}</span>
                  )}
                </th>
                <td>{point.phase.rates.national.toLocaleString('ja-JP')}円</td>
                <td>{point.perThousand.toLocaleString('ja-JP')}円</td>
                <td>{formatYenDecimal(point.perPack)}</td>
                <td>
                  {point.risePerPackWithTax > 0
                    ? `+${formatYenDecimal(point.risePerPackWithTax)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        出典：
        <a href={SOURCE_MOF_TABAKO.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF_TABAKO.label}
        </a>
        （税率と引き上げスケジュール）。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </p>

      <h2>価格帯別の想定小売価格</h2>
      <p>
        増税分をそのまま小売価格に乗せた場合の想定です。たばこ税は消費税の課税対象に含まれるため、1箱10円の増税は小売価格では
        <strong>11円</strong>ぶんにあたります。3回すべてで<strong>1箱33円</strong>の上昇です。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>いまの価格</th>
              {timeline.slice(1).map((point) => (
                <th key={point.phase.id}>{point.phase.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_PRICES.map((price) => {
              const rows = priceTimeline({ basePrice: price });
              return (
                <tr key={price}>
                  <th scope="row">{formatYen(price)}</th>
                  {rows.slice(1).map((row) => (
                    <td key={row.phase.id}>{formatYen(row.priceYen ?? price)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        <strong>実際の小売定価はこの表のとおりになるとは限りません。</strong>
        たばこの小売定価は、製造者・特定販売業者が財務大臣に申請して認可を受ける仕組み（たばこ事業法）で決まります。端数の調整などで前後するため、確定した価格は各社の発表でご確認ください。
      </p>

      <h2>加熱式たばこの課税方式の見直し</h2>
      <p>
        加熱式たばこには、上の税率引き上げとは<strong>別の改正</strong>があります。紙巻たばことの税負担の差を解消するため、紙巻たばこへの
        <strong>本数の換算方法</strong>が{formatDate(HEATED_STEP1_FROM)}と
        {formatDate(HEATED_ALIGNED_FROM)}の2段階で見直されます（消費者への影響に配慮した激変緩和のため2段階になっています）。
      </p>
      <ul>
        <li>
          <strong>{formatDate(HEATED_ALIGNED_FROM)}以降はスティック1本が紙巻1本相当</strong> —
          スティック型は葉たばこ等の重量{HEATED_GRAM_PER_STICK}
          gごとに紙巻たばこ1本へ換算され、1本あたりの重量が{HEATED_GRAM_PER_STICK}
          g以下の製品には最低課税が働きます。市販のスティックはおおむねこの範囲なので、20本入り1箱の税額は紙巻たばこ1箱と同じ
          {formatYenDecimal(timeline[0].perPack)}になります
        </li>
        <li>
          <strong>上がり幅は製品ごとに違う</strong> —
          見直し前の加熱式の税額は、製品の重量と小売定価から決まる移行措置の計算によります。銘柄を特定せずに「1箱いくら上がる」とは言えないため、このページでは加熱式の見直しぶんの値上げ額は出していません
        </li>
        <li>
          <strong>{formatDate(PHASES[1].effectiveFrom)}以降の引き上げは紙巻と共通</strong> —
          課税方式が揃ったあとは、紙巻たばこと同じ税率表で1本0.5円ずつ3回上がります
        </li>
      </ul>
      <p className="note">
        出典：
        <a href={SOURCE_NTA_HEATED.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_HEATED.label}
        </a>
      </p>

      <h2>1箱の値段のうち、税金はいくらか</h2>
      <p>
        たばこにかかる税は4つあり、合計で1,000本あたり
        {taxPerThousand(currentRates).toLocaleString('ja-JP')}円、1箱20本なら
        {formatYenDecimal(timeline[0].perPack)}です。これに消費税が加わります。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>税目</th>
              <th>1,000本あたり</th>
              <th>1箱20本あたり</th>
              <th>今回の改正</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">国たばこ税</th>
              <td>{currentRates.national.toLocaleString('ja-JP')}円</td>
              <td>{formatYenDecimal((currentRates.national * 20) / 1000)}</td>
              <td>3回で+1,500円（1本+1.5円）</td>
            </tr>
            <tr>
              <th scope="row">たばこ特別税</th>
              <td>{currentRates.special.toLocaleString('ja-JP')}円</td>
              <td>{formatYenDecimal((currentRates.special * 20) / 1000)}</td>
              <td>据え置き</td>
            </tr>
            <tr>
              <th scope="row">道府県たばこ税</th>
              <td>{currentRates.prefectural.toLocaleString('ja-JP')}円</td>
              <td>{formatYenDecimal((currentRates.prefectural * 20) / 1000)}</td>
              <td>据え置き</td>
            </tr>
            <tr>
              <th scope="row">市町村たばこ税</th>
              <td>{currentRates.municipal.toLocaleString('ja-JP')}円</td>
              <td>{formatYenDecimal((currentRates.municipal * 20) / 1000)}</td>
              <td>据え置き</td>
            </tr>
            <tr>
              <th scope="row">合計</th>
              <td>{taxPerThousand(currentRates).toLocaleString('ja-JP')}円</td>
              <td>{formatYenDecimal(timeline[0].perPack)}</td>
              <td>
                3回で+{formatYenDecimal(lastPoint.risePerPack)}
                （1箱20本・税抜）
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        たばこ税は<strong>従量税</strong>（本数に対して課される税）なので、580円の銘柄でも650円の銘柄でも1箱あたりの税額は同じです。そのぶん、安い銘柄ほど価格に占める税の割合が高くなります。消費税は税込価格の10/110で、580円の銘柄なら約52.7円。たばこ税と合わせると価格のおよそ6割が税金という計算になります。
      </p>
      <p className="note">
        出典：
        <a href={SOURCE_MOF_QA.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF_QA.label}
        </a>
        、
        <a href={SOURCE_MOF_TABAKO.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF_TABAKO.label}
        </a>
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>銘柄ごとの価格</strong> —
          銘柄は数百あり、価格も各社の申請と認可で個別に決まります。代表的な価格帯を例示し、自分の銘柄の価格は入力してもらう形にしています
        </li>
        <li>
          <strong>加熱式の見直しぶんの値上げ額</strong> —
          {formatDate(HEATED_ALIGNED_FROM)}
          より前の加熱式の税額は製品の重量と定価で決まるため、一律の金額を出せません
        </li>
        <li>
          <strong>市区町村ごとの内訳</strong> —
          市町村たばこ税の税率は全国一律（標準税率）です。どの自治体に納められるかは扱わず、税額の合計だけを示します
        </li>
        <li>
          <strong>葉巻たばこ・パイプたばこなど</strong> —
          紙巻たばこと加熱式たばこ（スティック型）だけを扱います。葉巻たばこには重量による本数換算の特例があります
        </li>
      </ul>

      <h2>家計の負担を別の面から見る</h2>
      <p>
        たばこの支出は年単位で見ると大きな金額になります。
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>で手取りの見通しを、
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>
        で今年戻ってくる額を確認しておくと、家計全体の見通しが立てやすくなります。
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

      <RelatedTools current="tabako-zei-neage" />

      <ToolMeta slug="tabako-zei-neage" ymyl>
        税率と施行日は
        <a href={SOURCE_MOF_TABAKO.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF_TABAKO.label}
        </a>
        および
        <a href={SOURCE_NTA_HEATED.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_HEATED.label}
        </a>
        にもとづきます。<strong>小売価格は財務大臣の認可制で決まるため、このページの想定価格は確定した金額ではありません。</strong>
        銘柄ごとの価格は各社の発表でご確認ください。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
