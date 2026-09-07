import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Legend, LineChart } from '../../_chapter/Figure';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import { manText, withdrawSeries } from '@/lib/calc';

const chapter = chapterBySlug('deguchi');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/** 3,000万円を、年4%取り崩しながら運用した場合。運用利回りを3通りで比べる */
const START = 3000;
const SPAN = 30;
const RETURNS = [0.05, 0.03, 0.01];
const toPoints = (r: number) =>
  withdrawSeries(START, r, 0.04, SPAN).map((value, year) => ({ year, value }));

export default function Page() {
  return (
    <Chapter slug="deguchi" sources={['bengen-1994', 'fsa-basic', 'nta-1463']}>
      <p>
        ここまでの章はすべて「貯める側」の話でした。
        <strong>使う段になると、必要な考え方が変わります。</strong>
        貯める時期は下落を待てましたが、
        取り崩す時期は<strong>下がっている最中にも売らなければならない</strong>からです。
      </p>

      <h2>4%ルールの出どころ</h2>

      <p>
        「資産の4%ずつ取り崩せば長く保つ」という目安がよく紹介されます。
        出どころは1994年にベンゲンが発表した研究で、
        <strong>米国の過去データで、30年間資産が尽きなかった引き出し率</strong>
        を調べたものです。
      </p>

      <p className="note">
        <strong>そのまま日本に当てはめられません。</strong>
        前提が違います。
        <strong>米国の株式・債券の過去のリターン</strong>にもとづくこと、
        <strong>米国のインフレ率</strong>で調整していること、
        <strong>税や社会保険料を考慮していない</strong>こと、
        そして<strong>30年という期間を区切っている</strong>こと。
        目安として桁感をつかむには有用ですが、計算式として使うものではありません。
      </p>

      <h2>取り崩しの効き方</h2>

      <Figure
        title={`3,000万円を毎年4%（120万円）ずつ取り崩した場合、運用利回りが年5%なら30年後に${manText(withdrawSeries(START, 0.05, 0.04, SPAN)[SPAN])}万円、3%なら${manText(withdrawSeries(START, 0.03, 0.04, SPAN)[SPAN])}万円、1%なら${manText(withdrawSeries(START, 0.01, 0.04, SPAN)[SPAN])}万円になる`}
        caption="引き出す額が同じでも、運用利回りで結果がまったく変わります。利回りが引き出し率を下回ると、資産は減っていきます。"
      >
        <LineChart
          xMax={SPAN}
          yMax={4800}
          yTop="4,800万円"
          xLabel="年"
          xTicks={[0, 10, 20, 30]}
          series={RETURNS.map((r, i) => ({
            name: `年${r * 100}%`,
            tone: (['accent', 'soft', 'muted'] as const)[i],
            points: toPoints(r),
            endLabel: `${manText(withdrawSeries(START, r, 0.04, SPAN)[SPAN])}万`,
          }))}
        />
        <Legend
          items={[
            { name: '運用利回り 年5%', tone: 'accent' },
            { name: '年3%', tone: 'soft' },
            { name: '年1%', tone: 'muted' },
          ]}
        />
      </Figure>

      <p>
        <strong>この図は利回りが毎年一定という前提です。</strong>
        現実には上下します。そして次に見るとおり、
        <strong>同じ平均利回りでも、順番によって結果が変わります</strong>。
      </p>

      <h2>収益率配列リスク——取り崩し期に固有の問題</h2>

      <div className="example">
        <strong>順番で結果が変わる</strong>
        取り崩している最中に、<strong>最初の数年で大きく下落する</strong>と、
        資産が減った状態から定額を引き出すことになります。
        <strong>売る口数が増えるので、回復局面で戻る土台が減っています。</strong>
        <br />
        逆に、最初の数年が好調なら、
        あとで下落しても余裕を持って耐えられます。
        <br />
        <strong>平均リターンが同じでも、下落が前半に来るか後半に来るかで結末が変わる。</strong>
        これは貯める時期には起きない問題です（積み立て中はむしろ前半の下落が有利になる）。
      </div>

      <h2>対策</h2>

      <ul>
        <li>
          <strong>定率で取り崩す。</strong>
          定額（毎年120万円）ではなく定率（毎年残高の4%）にすると、
          <strong>下がった年は引き出し額も減ります</strong>。
          資産は長く保ちますが、生活費が変動するのが難点です
        </li>
        <li>
          <strong>数年分の現金を別に持つ。</strong>
          下落局面ではその現金から使い、
          <strong>下がっている資産を売らずに済ませます</strong>。
          回復してから売って現金を補充します
        </li>
        <li>
          <strong>取り崩し開始時に、値動きする資産の比率を下げておく</strong>（第4部27章）。
          使う時期が近いお金のリスクを下げるのは、第1部1章からの一貫した原則です
        </li>
        <li>
          <strong>使う額そのものを調整できる余地を持っておく。</strong>
          支出に固定費以外の余地があれば、悪い年に減らせます
        </li>
      </ul>

      <h2>どの口座から取り崩すか</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>口座</th>
              <th>売却時の課税</th>
              <th>考え方</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>課税口座</td>
              <td>利益に20.315%</td>
              <td>含み益の小さいものから売ると税を抑えやすい</td>
            </tr>
            <tr>
              <td>NISA</td>
              <td>
                <strong>非課税</strong>
              </td>
              <td>
                非課税の枠を長く使いたいなら、
                <strong>最後に回す</strong>という考え方もある
              </td>
            </tr>
            <tr>
              <td>iDeCo</td>
              <td>受取時に退職所得・雑所得</td>
              <td>
                受け取り方（一時金・年金）で税額が変わる（第3部19章）
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>iDeCoは受け取り方を選ぶ段階で、実質的な手取りが変わります。</strong>
        会社の退職金と受け取る年が重なると、
        退職所得控除の枠を分け合うことになります。
        受け取りが近づいたら、必ず個別に確認してください。
      </p>

      <h2>公的年金との組み合わせ</h2>

      <p>
        取り崩しの計画は、<strong>公的年金がいくら入るかを前提に立てます</strong>。
        年金が生活費の大部分を賄うなら、
        資産から取り崩す額は小さくて済み、その分リスクも取れます。
      </p>

      <ul>
        <li>
          <strong>受給の繰下げ</strong>で年金額を増やすと、
          資産から取り崩す期間は延びますが、その後の必要額が減ります
        </li>
        <li>
          <strong>働きながら受け取る場合</strong>、
          在職老齢年金の仕組みで支給が停止されることがあります。
          当サイトの<a href="/tools/zaishoku-rorei-nenkin/">在職老齢年金 計算機</a>で試せます
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>取り崩し期は、下がっている最中にも売らなければならない</li>
        <li>4%ルールは米国の過去データにもとづく目安。税もインフレ前提も日本とは違う</li>
        <li>同じ平均リターンでも、下落が前半に来ると結果が悪くなる（収益率配列リスク）</li>
        <li>定率取り崩し、数年分の現金、比率の引き下げが対策になる</li>
        <li>どの口座から売るかで手取りが変わる。iDeCoは受け取り方で税額が変わる</li>
        <li>計画は公的年金を前提に立てる</li>
      </ul>
    </Chapter>
  );
}
