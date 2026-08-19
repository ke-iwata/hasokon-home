import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  COMPARISON_JO,
  HYOJI_SQM_PER_JO,
  JO_LOOKUP,
  STANDARD_ROWS,
  TSUBO_LOOKUP,
  convertArea,
  formatArea,
} from '@/lib/tsubo-heibei';
import Calculator from './Calculator';

const title = '坪・平米・畳 変換｜1坪は何㎡？広さの換算早見表';
const description =
  '坪・平米（㎡）・畳をまとめて相互変換できる広さの換算ツール。1坪＝3.31㎡（400/121㎡）を丸めずに計算し、30坪は何平米・6畳は何平米といった逆引き早見表も置いています。畳は京間・中京間・江戸間・団地間と不動産広告の1.62㎡換算を切り替えられます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tsubo-heibei/` },
  robots: robotsFor('tsubo-heibei'),
};

/** 本文で何度も出てくる代表値は、表と同じ関数から引いて書く */
const oneTsubo = formatArea(convertArea(1, 'tsubo')?.sqm as number);
const sixJo = formatArea(convertArea(COMPARISON_JO, 'jo')?.sqm as number);
const thirtyTsubo = convertArea(30, 'tsubo');

const faq = [
  {
    q: '1坪は何平米ですか？',
    a: `1坪は約${oneTsubo}平方メートルです。正確には400/121㎡（3.3057851…㎡）で、割り切れない数値です。1坪は1間（けん）四方の面積で、1間＝6尺＝20/11メートルなので、その2乗が400/121㎡になります。逆に1平方メートルは0.3025坪ちょうどで、こちらは割り切れます（100㎡＝30.25坪）。`,
  },
  {
    q: '1坪は何畳ですか？',
    a: '不動産広告と同じ1畳＝1.62㎡で換算すると1坪は約2.04畳で、ほぼ「1坪＝2畳」です。実際の畳で計算すると、京間（1畳約1.82㎡）なら約1.81畳、江戸間（1畳約1.55㎡）なら約2.13畳、団地間（1畳約1.45㎡）なら約2.29畳になります。「1坪＝2畳」は覚えやすい目安ですが、畳の規格によって1割前後の幅があります。',
  },
  {
    q: '30坪は何平米・何畳ですか？',
    a: `30坪は${formatArea(thirtyTsubo?.sqm as number)}㎡で、1畳＝1.62㎡で換算すると約${formatArea(thirtyTsubo?.jo as number)}畳です。戸建ての延床面積でよく出てくる広さで、100㎡弱と覚えておくとイメージしやすくなります。ほかの坪数はこのページの逆引き早見表から引けます。`,
  },
  {
    q: '6畳は何平米ですか？',
    a: `不動産広告の表記（1畳＝1.62㎡）で計算すると6畳は${sixJo}㎡、約${formatArea(convertArea(COMPARISON_JO, 'jo')?.tsubo as number)}坪です。実際の畳を敷いた6畳間は規格で変わり、京間なら約10.94㎡、中京間なら約9.94㎡、江戸間なら約9.29㎡、団地間なら約8.67㎡です。同じ「6畳」でも京間と団地間では2㎡以上、およそ1.5畳ぶんの差があります。`,
  },
  {
    q: '畳の広さは全国で同じではないのですか？',
    a: '同じではありません。関西を中心に使われる京間（本間）は1畳が約1.82㎡と最も大きく、愛知・岐阜・三重などの中京間は約1.66㎡、関東で広く使われる江戸間は約1.55㎡、公団住宅やアパートに多い団地間は約1.45㎡です。引っ越しで「同じ6畳なのに家具が入らない」ということが起きるのは、この規格の違いが理由です。',
  },
  {
    q: '不動産広告の「◯畳」はどの畳ですか？',
    a: '不動産の表示に関する公正競争規約施行規則で、居室の広さを畳数で表示するときは「畳1枚あたり1.62㎡以上」でなければならないと定められています。つまり広告の畳数は、部屋の面積を1.62㎡で割った数値以下になります。1.62㎡は中京間（約1.66㎡）よりわずかに小さく江戸間（約1.55㎡）より大きい値なので、江戸間や団地間の実際の部屋では、畳の枚数より広告の畳数のほうが少なくなることがあります。',
  },
  {
    q: '「帖」と「畳」は違うものですか？',
    a: '広さの単位としては同じです。畳を敷いていないフローリングの部屋やLDKでは、畳の枚数と紛らわしくないように「帖」と書き分けることが多いだけで、換算は変わりません（どちらも広告では1帖＝1.62㎡以上）。このページの計算機でも同じものとして扱っています。',
  },
  {
    q: 'マンションの専有面積が資料によって違うのはなぜですか？',
    a: '面積の測り方が2通りあるためです。広告やパンフレットは壁の中心線で囲まれた面積（壁芯面積）、登記簿は壁の内側で測った面積（内法面積）で、同じ部屋でも内法のほうが数㎡小さくなります。住宅ローン控除など制度の要件は登記簿上の面積で判断されることがあるので、契約前に登記簿の数値も確認してください。',
  },
  {
    q: '坪単価はどう計算しますか？',
    a: '土地や建物の価格を坪数で割ると坪単価になります。㎡単価から坪単価にしたいときは3.3058倍（400/121倍）、坪単価から㎡単価にしたいときは0.3025倍します。たとえば㎡単価30万円なら坪単価は約99.2万円です。広告では㎡単価と坪単価が混在するので、比較するときは単位を揃えてください。',
  },
];

const trail = breadcrumbFor('tsubo-heibei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '坪・平米・畳 変換',
      url: `${SITE_URL}/tsubo-heibei/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('tsubo-heibei'),
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

      <h1>坪・平米・畳 変換</h1>
      <p className="lead">
        坪・平米（㎡）・畳のどれかに入れるだけで、残りの2つに換算します。1坪＝{oneTsubo}
        ㎡（400/121㎡）を丸めずに計算し、畳は京間・中京間・江戸間・団地間と不動産広告の1.62㎡換算を切り替えられます。
        <a href="#gyakubiki">30坪は何平米・6畳は何平米の逆引き早見表</a>も下に置いています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>坪・平米・畳の換算のしくみ</h2>
      <p>
        1坪は1間（けん）四方の面積です。1間は6尺で、1尺は10/33メートルなので、1間は20/11メートル。その2乗が
        <strong>400/121㎡（＝{oneTsubo}㎡）</strong>
        で、これが1坪の面積です。割り切れない数値なので、途中で3.31のような丸めた値を使うと、坪数が大きいほど誤差が広がります。この計算機は分数のまま計算し、表示するときだけ小数第2位に丸めています。
      </p>
      <table>
        <thead>
          <tr>
            <th>変換</th>
            <th>かける数</th>
            <th>例</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>坪 → ㎡</td>
            <td>× 400/121（約3.3058）</td>
            <td>30坪 ＝ {formatArea(thirtyTsubo?.sqm as number)}㎡</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>㎡ → 坪</td>
            <td>× 121/400（0.3025ちょうど）</td>
            <td>100㎡ ＝ 30.25坪</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>畳 → ㎡</td>
            <td>× 1.62（不動産広告の換算）</td>
            <td>
              {COMPARISON_JO}畳 ＝ {sixJo}㎡
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>㎡ → 畳</td>
            <td>÷ 1.62（不動産広告の換算）</td>
            <td>
              20㎡ ＝ {formatArea(convertArea(20, 'sqm')?.jo as number)}畳
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        なお、取引や証明に使える法定計量単位は平方メートルで、坪・畳は法律上の単位ではありません。登記簿や契約書の面積が㎡で書かれているのはこのためです。坪・畳は日常の目安として使い、正式な数値は㎡で確認してください。
      </p>

      <h2>畳の広さは1つではない（規格ごとの比較）</h2>
      <p>
        畳は地域や建物の種類によって1枚の大きさが違います。同じ「{COMPARISON_JO}
        畳」でも、下の表のとおり実際の面積は2㎡以上ちがうことがあります。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>規格</th>
              <th>畳1枚の寸法</th>
              <th>1畳の面積</th>
              <th>{COMPARISON_JO}畳の面積</th>
              <th>{COMPARISON_JO}畳の坪数</th>
            </tr>
          </thead>
          <tbody>
            {STANDARD_ROWS.map((row) => (
              <tr key={row.standard.id}>
                <th scope="row" style={{ fontWeight: 600, textAlign: 'left' }}>
                  {row.standard.label}
                  <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                    {row.standard.note}
                  </span>
                </th>
                <td>
                  {row.standard.size
                    ? `${row.standard.size.longMm.toLocaleString('ja-JP')} × ${row.standard.size.shortMm.toLocaleString('ja-JP')}mm`
                    : '定めなし'}
                </td>
                <td>{formatArea(row.sqmPerJo)}㎡</td>
                <td>{formatArea(row.sqm)}㎡</td>
                <td>{formatArea(row.tsubo)}坪</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        不動産広告の「◯畳」は、不動産の表示に関する公正競争規約施行規則で
        <strong>畳1枚あたり{HYOJI_SQM_PER_JO}㎡以上</strong>
        と定められています。部屋の面積を1.62㎡で割った数値以下しか表示できない、という意味です。1.62㎡は江戸間や団地間の畳より大きいので、実際に敷いてある畳の枚数より広告の畳数のほうが少なくなることがあります。この計算機の既定も、広告に合わせて1.62㎡にしています。
      </div>

      <h2 id="gyakubiki">坪 → 平米・畳の逆引き早見表</h2>
      <p>
        「◯坪は何平米？」を引くための表です。畳数は不動産広告と同じ1畳＝
        {HYOJI_SQM_PER_JO}㎡で換算しています。値は計算機と同じ式から作っているので、表と計算結果が食い違うことはありません。
      </p>
      <table>
        <thead>
          <tr>
            <th>坪</th>
            <th>平米（㎡）</th>
            <th>畳（1.62㎡換算）</th>
          </tr>
        </thead>
        <tbody>
          {TSUBO_LOOKUP.map((row) => (
            <tr key={row.tsubo}>
              <th scope="row">{formatArea(row.tsubo, 0)}坪</th>
              <td>{formatArea(row.sqm)}㎡</td>
              <td>{formatArea(row.jo)}畳</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>畳 → 平米・坪の逆引き早見表</h3>
      <p>
        間取り図に出てくる畳数を平米と坪に直した表です。こちらも1畳＝{HYOJI_SQM_PER_JO}
        ㎡（不動産広告の換算）で計算しています。実際に畳が敷いてある部屋は、上の規格ごとの比較表と計算機の切り替えを使ってください。
      </p>
      <table>
        <thead>
          <tr>
            <th>畳（帖）</th>
            <th>平米（㎡）</th>
            <th>坪</th>
          </tr>
        </thead>
        <tbody>
          {JO_LOOKUP.map((row) => (
            <tr key={row.jo}>
              <th scope="row">{formatArea(row.jo, 1)}畳</th>
              <td>{formatArea(row.sqm)}㎡</td>
              <td>{formatArea(row.tsubo)}坪</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>広さの目安（何坪でどれくらい？）</h2>
      <p>
        数字だけではイメージしにくいので、住まい探しでよく出てくる広さを並べておきます。地域・築年数・間取りで幅があるので、あくまで感覚をつかむための目安です。
      </p>
      <table>
        <thead>
          <tr>
            <th>よくある広さ</th>
            <th>平米（㎡）</th>
            <th>坪</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>ワンルーム・1K（一人暮らし）</td>
            <td>20〜25㎡</td>
            <td>約6〜7.6坪</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>1LDK・2K（二人暮らし）</td>
            <td>40〜50㎡</td>
            <td>約12〜15坪</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>3LDKのファミリー向けマンション</td>
            <td>65〜80㎡</td>
            <td>約20〜24坪</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>戸建ての延床面積（4人家族の標準的な例）</td>
            <td>100〜115㎡</td>
            <td>約30〜35坪</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>駐車場1台分（2.5m × 5m）</td>
            <td>12.5㎡</td>
            <td>約3.8坪</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>テニスコート1面（ダブルス・10.97m × 23.77m）</td>
            <td>約260.7㎡</td>
            <td>約78.9坪</td>
          </tr>
        </tbody>
      </table>
      <p>
        部屋の広さが決まると、次に気になるのは冷暖房です。エアコンの畳数の目安と電気代は
        <Link href="/aircon-denkidai/">エアコン電気代 計算機</Link>
        で計算できます。図面や写真の縦横比を整えたいときは
        <Link href="/aspect-ratio/">アスペクト比計算機</Link>もどうぞ。
      </p>

      <h2>使うときの注意点</h2>
      <p>
        広告に出ている面積が壁の中心線で測った<strong>壁芯（へきしん）面積</strong>
        なのに対し、登記簿の面積は壁の内側で測った<strong>内法（うちのり）面積</strong>
        です。同じ部屋でも内法のほうが数㎡小さくなるため、資料によって専有面積が違って見えることがあります。制度の要件（住宅ローン控除など）で面積が使われるときは、どちらの面積で判定されるかを必ず確認してください。
      </p>
      <p>
        また、バルコニーやロフトは専有面積に含まれないのが一般的で、「同じ70㎡」でも実際の使い勝手は間取りによって変わります。数値の比較と合わせて、内見での確認をおすすめします。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="tsubo-heibei" />

      <ToolMeta slug="tsubo-heibei">
        1坪＝400/121㎡は、1尺＝10/33メートル・1間＝6尺・1坪＝1間四方という尺貫法の定義から導いています。面積の法定計量単位は平方メートルで（
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=404AC0000000051"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          計量法
        </a>
        ）、坪・畳は取引・証明には使えません。畳数の表示が「畳1枚あたり1.62㎡以上」と定められているのは、不動産公正取引協議会連合会「
        <a
          href="https://www.rftc.jp/koseikyosokiyaku/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          不動産の表示に関する公正競争規約・同施行規則
        </a>
        」です。京間・中京間・江戸間・団地間の寸法は、各規格で一般に使われている畳1枚の寸法（京間 1,910×955mm ほか）にもとづく目安で、実際の畳は製造時の調整で数mm前後します。
      </ToolMeta>
    </>
  );
}
