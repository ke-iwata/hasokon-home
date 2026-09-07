import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Bars, Legend, LineChart } from '../../_chapter/Figure';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import {
  compound,
  exactDoublingYears,
  futureValueOfSeries,
  netRate,
  manText,
  ruleOf72,
  series,
  simple,
} from '@/lib/calc';

const chapter = chapterBySlug('fukuri');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

// ---- 本文の数字。**表も図もここから取る**（手打ちすると必ずずれる） ----

/** 単利と複利の比較。元本100万円・年利3% */
const PRINCIPAL = 100;
const RATE = 0.03;
const YEARS = [1, 10, 20, 30, 40];
const SPAN = 40;

/** 信託報酬の比較。投資対象そのもののリターンは年5%で共通 */
const GROSS = 0.05;
const FEES = [0.001, 0.005, 0.015];
const FEE_SPAN = 30;

/** 積立。毎月3万円・年利5% */
const MONTHLY = 3;
const TSUMITATE_RATE = 0.05;
const TSUMITATE_YEARS = [10, 20, 30];

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export default function Page() {
  const gap = (y: number) => compound(PRINCIPAL, RATE, y) - simple(PRINCIPAL, RATE, y);

  return (
    <Chapter slug="fukuri" sources={['fsa-guide', 'fsa-basic', 'bogle-common-sense']}>
      <p>
        複利は「利息にも利息がつく」ことです。説明としてはこれで終わりなのですが、
        効き方が直感から外れているので、多くの人が桁を見誤ります。
        この章では、その外れ方を図と数字で確かめます。
      </p>

      <h2>単利と複利で、何がどれだけ違うのか</h2>

      <p>
        <span className="term">単利</span>は元本にだけ利息がつきます。
        <span className="term">複利</span>は、ついた利息を元本に組み入れて、
        次の年はその合計に利息がつきます。
        年利3%で100万円を置いた場合、1年目はどちらも3万円で同じです。差が出るのは先です。
      </p>

      <Figure
        title={`元本100万円を年利3%で置いたときの、単利と複利の${SPAN}年間の推移。単利はまっすぐ伸びるのに対し、複利は年を追うごとに傾きが増していく`}
        caption="複利の線が「反り返っている」ことが要点です。単利はまっすぐなので、差は年々広がっていきます。"
      >
        <LineChart
          xMax={SPAN}
          yMax={340}
          yTop="340万円"
          xLabel="年"
          xTicks={[0, 10, 20, 30, 40]}
          series={[
            {
              name: '複利',
              tone: 'accent',
              points: series(SPAN, (y) => compound(PRINCIPAL, RATE, y)),
              endLabel: `${manText(compound(PRINCIPAL, RATE, SPAN))}万`,
            },
            {
              name: '単利',
              tone: 'muted',
              points: series(SPAN, (y) => simple(PRINCIPAL, RATE, y)),
              endLabel: `${manText(simple(PRINCIPAL, RATE, SPAN))}万`,
            },
          ]}
        />
        <Legend
          items={[
            { name: '複利', tone: 'accent' },
            { name: '単利', tone: 'muted' },
          ]}
        />
      </Figure>

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
              {YEARS.map((y) => (
                <tr key={y}>
                  <td>{y}年</td>
                  <td className="num">{manText(simple(PRINCIPAL, RATE, y))}万円</td>
                  <td className="num">{manText(compound(PRINCIPAL, RATE, y))}万円</td>
                  <td className="num">{manText(gap(y))}万円</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>

      <p>
        注目すべきは、<strong>差そのものが加速している</strong>ことです。
        10年目まででついた差は{manText(gap(10))}万円ですが、
        30年目から40年目までの10年間だけで {manText(gap(40) - gap(30))}万円ぶん開きます。
        同じ「10年」でも、後ろの10年のほうがはるかに重い。
        これが「時間を味方につける」と言われることの中身です。
      </p>

      <h2>72の法則</h2>

      <p>
        元本が2倍になるまでの年数は、<strong>72 ÷ 年利（%）</strong>でおおよそ求まります。
        年利3%なら72 ÷ 3 = {ruleOf72(3)}年、年利6%なら{ruleOf72(6)}年です。
        暗算で桁感をつかむための近似で、年利が数%〜10%程度の範囲でよく合います。
      </p>

      <figure className="table-figure">
        <figcaption>72の法則と、正確に計算した2倍までの年数</figcaption>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>年利</th>
                <th>72の法則</th>
                <th>正確な年数</th>
                <th>ずれ</th>
              </tr>
            </thead>
            <tbody>
              {[3, 5, 6, 10].map((p) => {
                const approx = ruleOf72(p);
                const exact = exactDoublingYears(p / 100);
                return (
                  <tr key={p}>
                    <td>{p}%</td>
                    <td className="num">{Math.round(approx * 10) / 10}年</td>
                    <td className="num">{Math.round(exact * 10) / 10}年</td>
                    <td className="num">{Math.round((approx - exact) * 10) / 10}年</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </figure>

      <div className="example">
        <strong>使いどころ</strong>
        年利4.8%なら72 ÷ 4.8 = 15年で2倍。30年ならそれが2回起きるので約4倍です
        （正確に計算すると{Math.round(compound(1, 0.048, 30) * 100) / 100}倍）。
        「30年で4倍にしたい」という目標が、年利4.8%を30年続けるという意味だと分かれば、
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
        この1.4ポイントの差が、30年でどうなるかを見ます。
      </p>

      <Figure
        title={`投資対象のリターンが年5%で同じでも、信託報酬が年0.1%・0.5%・1.5%だと30年後の金額が${manText(compound(PRINCIPAL, netRate(GROSS, 0.001), FEE_SPAN))}万円・${manText(compound(PRINCIPAL, netRate(GROSS, 0.005), FEE_SPAN))}万円・${manText(compound(PRINCIPAL, netRate(GROSS, 0.015), FEE_SPAN))}万円に分かれる`}
        caption="3本とも「同じ投資対象」です。分かれていくのは信託報酬の差だけ。年1.4ポイントの違いが、30年で元本と同じ規模の差になります。"
      >
        <LineChart
          xMax={FEE_SPAN}
          yMax={440}
          yTop="440万円"
          xLabel="年"
          xTicks={[0, 10, 20, 30]}
          series={FEES.map((fee, i) => ({
            name: `信託報酬${pct(fee)}`,
            tone: (['accent', 'soft', 'muted'] as const)[i],
            points: series(FEE_SPAN, (y) => compound(PRINCIPAL, netRate(GROSS, fee), y)),
            endLabel: `${manText(compound(PRINCIPAL, netRate(GROSS, fee), FEE_SPAN))}万`,
          }))}
        />
        <Legend
          items={FEES.map((fee, i) => ({
            name: `信託報酬 ${pct(fee)}`,
            tone: (['accent', 'soft', 'muted'] as const)[i],
          }))}
        />
      </Figure>

      <figure className="table-figure">
        <figcaption>
          元本100万円・投資対象そのもののリターンは年5%で共通。差は信託報酬だけ
        </figcaption>
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
              {FEES.map((fee) => (
                <tr key={fee}>
                  <td>年{pct(fee)}</td>
                  <td className="num">{pct(netRate(GROSS, fee))}</td>
                  <td className="num">
                    {manText(compound(PRINCIPAL, netRate(GROSS, fee), 20))}万円
                  </td>
                  <td className="num">
                    {manText(compound(PRINCIPAL, netRate(GROSS, fee), 30))}万円
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>

      <p>
        年0.1%と年1.5%の差は、1年で見れば1.4ポイントにすぎません。
        それが30年後には
        {manText(
          compound(PRINCIPAL, netRate(GROSS, 0.001), 30) -
            compound(PRINCIPAL, netRate(GROSS, 0.015), 30),
        )}
        万円の差になります。元本と同じ規模です。
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

      <Figure
        title={`毎月3万円を年利5%で積み立てたときの、元本と運用益の内訳。10年では運用益が全体の${Math.round(((futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 10) - MONTHLY * 120) / futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 10)) * 100)}%だが、30年では${Math.round(((futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 30) - MONTHLY * 360) / futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 30)) * 100)}%を占める`}
        caption="棒の左の淡い部分が自分で入れたお金、右の濃い部分が運用益です。年数が延びるほど、右側の比率が上がっていきます。"
      >
        <Bars
          max={2600}
          rows={TSUMITATE_YEARS.map((y) => {
            const principal = MONTHLY * y * 12;
            const fv = futureValueOfSeries(MONTHLY, TSUMITATE_RATE, y);
            return {
              label: `${y}年`,
              parts: [
                { name: '元本', value: principal, tone: 'muted' as const },
                { name: '運用益', value: fv - principal, tone: 'accent' as const },
              ],
            };
          })}
        />
        <Legend
          variant="swatch"
          items={[
            { name: '積み立てた元本', tone: 'muted' },
            { name: '運用益', tone: 'accent' },
          ]}
        />
      </Figure>

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
              {TSUMITATE_YEARS.map((y) => {
                const principal = MONTHLY * y * 12;
                const fv = futureValueOfSeries(MONTHLY, TSUMITATE_RATE, y);
                return (
                  <tr key={y}>
                    <td>{y}年</td>
                    <td className="num">{manText(principal)}万円</td>
                    <td className="num">{manText(fv)}万円</td>
                    <td className="num">{manText(fv - principal)}万円</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </figure>

      <p>
        30年続けると、評価額のうち元本は
        {Math.round(
          ((MONTHLY * 30 * 12) / futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 30)) * 100,
        )}
        %で、残りは運用益です。20年では運用益は
        {Math.round(
          ((futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 20) - MONTHLY * 20 * 12) /
            futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 20)) *
            100,
        )}
        %、10年では
        {Math.round(
          ((futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 10) - MONTHLY * 10 * 12) /
            futureValueOfSeries(MONTHLY, TSUMITATE_RATE, 10)) *
            100,
        )}
        %。
        <strong>後半になるほど運用益の比率が上がる</strong>のが複利の形です。
      </p>

      <h2>この章で注意しておくこと</h2>

      <ul>
        <li>
          <strong>ここに出した数字は「年利が一定だったら」という仮定の計算です。</strong>
          現実の株式や投資信託の価格は毎年上下し、一定の利回りで増えることはありません。
          上の図の線がなめらかなのは計算の都合で、実際の値動きはぎざぎざです。
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
