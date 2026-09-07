import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('fukuri');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="fukuri" sources={['fsa-guide', 'fsa-basic', 'bogle-common-sense']}>
      <p>
        複利は「利息にも利息がつく」ことです。説明としてはこれで終わりなのですが、
        効き方が直感から外れているので、多くの人が桁を見誤ります。
        この章では、その外れ方を数字で確かめます。
      </p>

      <h2>単利と複利で、何がどれだけ違うのか</h2>

      <p>
        <span className="term">単利</span>は元本にだけ利息がつきます。
        <span className="term">複利</span>は、ついた利息を元本に組み入れて、
        次の年はその合計に利息がつきます。
        年利3%で100万円を置いた場合、1年目はどちらも3万円で同じです。差が出るのは先です。
      </p>

      <figure className="table-figure">
        <figcaption>元本100万円・年利3%（税・手数料は考えない）</figcaption>
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>経過年数</th>
              <th>単利</th>
              <th>複利</th>
              <th>差</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1年</td>
              <td className="num">103.0万円</td>
              <td className="num">103.0万円</td>
              <td className="num">0.0万円</td>
            </tr>
            <tr>
              <td>10年</td>
              <td className="num">130.0万円</td>
              <td className="num">134.4万円</td>
              <td className="num">4.4万円</td>
            </tr>
            <tr>
              <td>20年</td>
              <td className="num">160.0万円</td>
              <td className="num">180.6万円</td>
              <td className="num">20.6万円</td>
            </tr>
            <tr>
              <td>30年</td>
              <td className="num">190.0万円</td>
              <td className="num">242.7万円</td>
              <td className="num">52.7万円</td>
            </tr>
            <tr>
              <td>40年</td>
              <td className="num">220.0万円</td>
              <td className="num">326.2万円</td>
              <td className="num">106.2万円</td>
            </tr>
          </tbody>
          </table>
        </div>
      </figure>

      <p>
        注目すべきは、<strong>差そのものが加速している</strong>ことです。
        10年目まででついた差は4.4万円ですが、30年目から40年目までの10年間だけで
        53.5万円ぶん開きます。同じ「10年」でも、後ろの10年のほうがはるかに重い。
        これが「時間を味方につける」と言われることの中身です。
      </p>

      <h2>72の法則</h2>

      <p>
        元本が2倍になるまでの年数は、<strong>72 ÷ 年利（%）</strong>でおおよそ求まります。
        年利3%なら72 ÷ 3 = 24年、年利6%なら12年です。
        暗算で桁感をつかむための近似で、年利が数%〜10%程度の範囲でよく合います。
      </p>

      <div className="example">
        <strong>使いどころ</strong>
        年利4.8%なら72 ÷ 4.8 = 15年で2倍。30年ならそれが2回起きるので約4倍です
        （正確に計算すると4.08倍）。「30年で4倍にしたい」という目標が、
        年利4.8%を30年続けるという意味だと分かれば、
        それが現実的かどうかを第2部の各資産の性質と突き合わせて判断できます。
      </div>

      <h2>複利は逆にも効く（コストと税）</h2>

      <p>
        ここがこの章の要点です。複利は増えるほうにだけ働くものではありません。
        毎年差し引かれるコストも、同じ仕組みで複利的に効きます。
      </p>

      <p>
        投資信託の<span className="term">信託報酬</span>は、
        保有している間ずっと純資産から日割りで差し引かれます。
        リターンが年5%でも信託報酬が年1.5%なら、手元に残るのは実質3.5%です。
        この1.5ポイントの差が、20年でどうなるかを見ます。
      </p>

      <figure className="table-figure">
        <figcaption>元本100万円・投資対象そのもののリターンは年5%で共通。差は信託報酬だけ</figcaption>
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>信託報酬</th>
              <th>実質利回り</th>
              <th>20年後</th>
              <th>30年後</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>年0.1%</td>
              <td className="num">4.9%</td>
              <td className="num">260.3万円</td>
              <td className="num">420.0万円</td>
            </tr>
            <tr>
              <td>年0.5%</td>
              <td className="num">4.5%</td>
              <td className="num">241.2万円</td>
              <td className="num">374.5万円</td>
            </tr>
            <tr>
              <td>年1.5%</td>
              <td className="num">3.5%</td>
              <td className="num">199.0万円</td>
              <td className="num">280.7万円</td>
            </tr>
          </tbody>
          </table>
        </div>
      </figure>

      <p>
        年0.1%と年1.5%の差は、1年で見れば1.4ポイントにすぎません。
        それが30年後には139万円の差になります。元本と同じ規模です。
      </p>

      <p className="note">
        <strong>リターンは不確実ですが、コストは確実です。</strong>
        年5%になるかどうかは誰にも分かりませんが、信託報酬1.5%は
        運用がうまくいってもいかなくても必ず引かれます。
        だからコストは、投資判断のなかで数少ない「事前に確実に分かる変数」になります。
        この観点は第1部5章「コスト」で詳しく扱います。
      </p>

      <h2>積み立てた場合はどうなるか</h2>

      <p>
        一括ではなく毎月一定額を積み立てる場合、後から入れたお金ほど
        複利が効く期間が短くなります。同じ総額でも、早く入れたお金のほうが働きます。
      </p>

      <figure className="table-figure">
        <figcaption>毎月3万円を年利5%で積み立てた場合（税・手数料は考えない）</figcaption>
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>期間</th>
              <th>積み立てた元本</th>
              <th>評価額</th>
              <th>うち運用益</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>10年</td>
              <td className="num">360万円</td>
              <td className="num">465.8万円</td>
              <td className="num">105.8万円</td>
            </tr>
            <tr>
              <td>20年</td>
              <td className="num">720万円</td>
              <td className="num">1,233.1万円</td>
              <td className="num">513.1万円</td>
            </tr>
            <tr>
              <td>30年</td>
              <td className="num">1,080万円</td>
              <td className="num">2,496.8万円</td>
              <td className="num">1,416.8万円</td>
            </tr>
          </tbody>
          </table>
        </div>
      </figure>

      <p>
        30年続けると、評価額のうち元本は43%で、残りの57%は運用益です。
        20年では運用益は42%、10年では23%。
        <strong>後半になるほど運用益の比率が上がる</strong>のが複利の形です。
      </p>

      <h2>この章で注意しておくこと</h2>

      <ul>
        <li>
          <strong>ここに出した数字は「年利が一定だったら」という仮定の計算です。</strong>
          現実の株式や投資信託の価格は毎年上下し、一定の利回りで増えることはありません。
          複利の効き方を理解するための道具として見てください
        </li>
        <li>
          <strong>過去の平均リターンは将来を約束しません。</strong>
          年5%という数字も、そうなると決まっているものではありません
        </li>
        <li>
          税を考えていません。課税口座では利益に約20%かかるため、
          そのぶん複利の効きは落ちます。だから制度（NISA・iDeCo）で
          器を選ぶ話が第3部に出てきます
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>複利は、差そのものが年々加速する。後ろの10年ほど重い</li>
        <li>2倍になる年数は「72 ÷ 年利(%)」でおおよそ分かる</li>
        <li>
          コストも同じ仕組みで複利的に効く。信託報酬0.1%と1.5%の差は、
          30年で元本と同じ規模になる
        </li>
        <li>リターンは不確実だが、コストは確実に引かれる</li>
      </ul>
    </Chapter>
  );
}
