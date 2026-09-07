import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure from '../../_chapter/Figure';
import { Ladder } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('gold');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="gold" sources={['fsa-basic', 'jsda-study', 'stat-cpi']}>
      <p>
        金や原油などのコモディティ（商品）は、
        これまでの章で見た資産と決定的に違う点があります。
        <strong>持っていても何も生まない</strong>ということです。
        ここを押さえないと、値上がり益への期待だけで判断することになります。
      </p>

      <h2>リターンの源泉がない</h2>

      <Figure
        title="株式は利益と配当、債券は利息、不動産は賃料という生み出すものがあるが、金には利息も配当もなく、値段が上がることでしか儲からない"
        caption="上の3つは持っているだけで何かが入ってきます。金にはそれがありません。この差が、評価のしかたを変えます。"
      >
        <Ladder
          steps={[
            { label: '株式', sub: '会社が利益を生み、配当が出る' },
            { label: '債券', sub: '貸した相手が利息を払う' },
            { label: '不動産・REIT', sub: '借りた人が賃料を払う' },
            { label: '金・コモディティ', sub: '何も生まない。保管費用がかかる', strong: true },
          ]}
        />
      </Figure>

      <p>
        株式なら「利益の何倍か」で高い安いを議論できます。債券なら利回りがあります。
        <strong>金にはこの基準がありません。</strong>
        値段を決めるのは需要と供給、つまり
        「他の人がいくらで買うか」だけです。
      </p>

      <p className="note">
        <strong>これは「金がだめだ」という意味ではありません。</strong>
        性質が違うということです。生み出さない代わりに、
        企業の業績とも金利とも直接つながっていないので、
        <strong>他の資産と違う動きをすることがあります</strong>。
        分散の材料として組み入れられるのはこの性質のためです。
      </p>

      <h2>「インフレに強い」という言葉の中身</h2>

      <p>
        金がよく「インフレヘッジ」と言われるのは、
        <strong>実物なので、通貨の価値が下がっても実物としての価値は残る</strong>
        という考え方からです。紙幣は刷れますが、金は増やせません。
      </p>

      <p>
        ただし<strong>短期的にはインフレ率と金価格が連動しないことはよくあります</strong>。
        金の価格は実質金利・為替・地政学的な状況など複数の要因で動くので、
        「物価が上がったから金も上がる」という単純な関係にはなりません。
        <strong>長い目で見た購買力の保存という文脈の話</strong>だと理解しておくのが正確です。
      </p>

      <h2>日本で金を持つと、為替が乗る</h2>

      <p>
        金の国際価格はドル建てです。<strong>円で買うと、金価格と為替の両方が効きます。</strong>
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ドル建て金価格</th>
              <th>為替</th>
              <th>円建てでは</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>上がる</td>
              <td>円安</td>
              <td className="num">大きく上がる</td>
            </tr>
            <tr>
              <td>上がる</td>
              <td>円高</td>
              <td className="num">打ち消し合う</td>
            </tr>
            <tr>
              <td>下がる</td>
              <td>円安</td>
              <td className="num">打ち消し合う</td>
            </tr>
            <tr>
              <td>下がる</td>
              <td>円高</td>
              <td className="num">大きく下がる</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        「金は上がっているのに、自分の資産は増えていない」ということが起きます。
        <strong>見ている価格がドル建てなのか円建てなのかを、必ず確かめてください。</strong>
      </p>

      <h2>持ち方によって別物になる</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>持ち方</th>
              <th>特徴</th>
              <th>注意</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>現物（地金・コイン）</td>
              <td>実物を持つ</td>
              <td>保管の手間と費用。売買のスプレッドが大きい</td>
            </tr>
            <tr>
              <td>純金積立</td>
              <td>毎月一定額を積む</td>
              <td>手数料と保管料がかかる</td>
            </tr>
            <tr>
              <td>金ETF・投資信託</td>
              <td>証券口座で売買できる</td>
              <td>信託報酬。現物と交換できないものが多い</td>
            </tr>
            <tr>
              <td>金鉱株</td>
              <td>金を採掘する会社の株式</td>
              <td>
                <strong>金そのものではない</strong>。会社の経営リスクが乗る
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>税金の扱いが持ち方で変わります。</strong>
        現物の金を売った利益は原則として<strong>譲渡所得（総合課税）</strong>で、
        保有期間5年超なら長期譲渡所得として扱いが変わります。
        一方、金ETFや投資信託は<strong>申告分離課税20.315%</strong>です。
        同じ「金に投資した」でも税率が違うので、
        実際に売る前に国税庁の情報で確かめてください。
      </p>

      <h2>コモディティ全般について</h2>

      <p>
        原油・穀物などのコモディティに投資する商品の多くは、
        現物ではなく<strong>先物</strong>を使っています（第2部17章）。
        先物には期限があるため、期限が来るたびに次の限月へ乗り換える必要があり、
        <strong>この乗り換えでコストが発生することがあります</strong>。
      </p>

      <p>
        その結果、<strong>原油価格が上がっているのに、
        原油に連動するはずの商品の価格が上がらない</strong>ということが起こりえます。
        コモディティの商品を買うときは、
        何に連動する設計なのかを目論見書で確かめる必要があります。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>金・コモディティは利息も配当も生まない。値上がりでしか儲からない</li>
        <li>だから「高い・安い」を判断する基準が、他の資産のようには存在しない</li>
        <li>他の資産と違う動きをすることがあり、分散の材料になる</li>
        <li>円で持つと為替が乗る。ドル建て価格と円建て価格は別物</li>
        <li>持ち方（現物・ETF・鉱山株）で性質も税金も変わる</li>
        <li>先物を使う商品は、乗り換えのコストで指数どおりに動かないことがある</li>
      </ul>
    </Chapter>
  );
}
