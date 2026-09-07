import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Legend, LineChart } from '../../_chapter/Figure';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import { manText, purchasingPower, series } from '@/lib/calc';

const chapter = chapterBySlug('toshi-towa');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/** 購買力の図。いまの100万円が、物価上昇のもとで何年後にいくらぶんになるか */
const AMOUNT = 100;
const SPAN = 30;
const RATES = [0.01, 0.02, 0.03];

export default function Page() {
  return (
    <Chapter slug="toshi-towa" sources={['fsa-guide', 'fsa-basic', 'stat-cpi', 'boj-price']}>
      <p>
        投資の話はたいてい「何を買うか」から始まりますが、
        その前に片づけておくことがあります。
        <strong>なぜお金を置いておくだけでは足りないのか</strong>という前提です。
        ここが分かっていないと、あとの章がぜんぶ暗記になります。
      </p>

      <h2>貯蓄と投資の違い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>貯蓄（預金）</th>
              <th>投資</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>元本</th>
              <td>減らない（預金保険の範囲内）</td>
              <td>減ることがある</td>
            </tr>
            <tr>
              <th>増え方</th>
              <td>あらかじめ決まっている</td>
              <td>やってみるまで分からない</td>
            </tr>
            <tr>
              <th>引き出し</th>
              <td>いつでも、額が確定している</td>
              <td>いつでも売れるが、いくらで売れるかは相場しだい</td>
            </tr>
            <tr>
              <th>向いているお金</th>
              <td>使う予定が決まっているお金</td>
              <td>当分使う予定のないお金</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>どちらが優れているという話ではありません。</strong>
        目的が違う道具です。来月の家賃を投資に回してはいけないし、
        30年後まで使わないお金をすべて預金に置くのも、次に見る理由で問題があります。
      </p>

      <h2>「何もしない」ことのリスク</h2>

      <p>
        預金は元本が減りません。ただし<strong>金額が減らないことと、
        買えるものが減らないことは別</strong>です。
        物価が上がれば、同じ100万円で買えるものは年を追うごとに少なくなります。
        これを<span className="term">購買力</span>といいます。
      </p>

      <Figure
        title={`物価が年1%・2%・3%で上がり続けたとき、いまの100万円で買えるものが30年後にはそれぞれ${manText(purchasingPower(AMOUNT, 0.01, SPAN))}万円ぶん・${manText(purchasingPower(AMOUNT, 0.02, SPAN))}万円ぶん・${manText(purchasingPower(AMOUNT, 0.03, SPAN))}万円ぶんに減る`}
        caption="金額は100万円のままでも、買えるものは減っていきます。預金の金利がこの下がり方に追いつかなければ、実質的には目減りしています。"
      >
        <LineChart
          xMax={SPAN}
          yMax={110}
          yTop="100万円ぶん"
          xLabel="年"
          xTicks={[0, 10, 20, 30]}
          series={RATES.map((r, i) => ({
            name: `物価が年${r * 100}%上がる場合`,
            tone: (['muted', 'accent', 'soft'] as const)[i],
            points: series(SPAN, (y) => purchasingPower(AMOUNT, r, y)),
            endLabel: `${manText(purchasingPower(AMOUNT, r, SPAN))}万`,
          }))}
        />
        <Legend
          items={[
            { name: '年1%', tone: 'muted' },
            { name: '年2%', tone: 'accent' },
            { name: '年3%', tone: 'soft' },
          ]}
        />
      </Figure>

      <p>
        日本銀行は<strong>物価上昇率2%</strong>を目標に掲げています。
        仮にこれが実現し続けると、いまの100万円は
        30年後には{manText(purchasingPower(AMOUNT, 0.02, SPAN))}万円ぶんの買い物しかできません。
        <strong>元本は1円も減っていないのに、です。</strong>
      </p>

      <p className="note">
        <strong>物価が必ず上がると決まっているわけではありません。</strong>
        日本は長くほとんど物価が上がらない時期を経験しており、
        その間は預金で置いておくことが不利ではありませんでした。
        ここで言えるのは「金額が減らない＝損をしない、ではない」という一点です。
        実際の物価は総務省の消費者物価指数（末尾の参考文献）で確かめられます。
      </p>

      <h2>お金を3つに分ける</h2>

      <p>
        投資を始める前にやることは、商品選びではなく<strong>お金の仕分け</strong>です。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>区分</th>
              <th>中身</th>
              <th>置き場所</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>使うお金</td>
              <td>生活費、当面の支払い</td>
              <td>普通預金</td>
            </tr>
            <tr>
              <td>備えるお金</td>
              <td>失業・病気・修理など、いつ要るか分からない分</td>
              <td>すぐ動かせる預金</td>
            </tr>
            <tr>
              <td>増やすお金</td>
              <td>当分使う予定がなく、減っても生活が壊れない分</td>
              <td>ここではじめて投資の対象になる</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>順番が逆になると、いちばん悪い形で失敗します。</strong>
        生活費まで投資に回すと、価格が下がっている最中に生活のために売ることになります。
        売りたくないときに売らされるのが、投資でいちばん避けたい状況です。
        「備えるお金」をどれだけ持つかは、収入の安定度や家族構成で変わります。
      </p>

      <h2>リターンの正体</h2>

      <p>
        投資でお金が増えるのは、値段が上がるからではありません。
        値段が上がるのは結果で、もとをたどると<strong>誰かが価値を生んでいる</strong>からです。
      </p>

      <ul>
        <li>
          <strong>株式</strong>——会社が事業で利益を上げる。その一部が配当になり、
          企業価値の増加が株価に表れる
        </li>
        <li>
          <strong>債券</strong>——お金を貸した相手が利息を払う
        </li>
        <li>
          <strong>不動産</strong>——貸した相手が家賃を払う
        </li>
      </ul>

      <p>
        いずれも<strong>お金の出し手が誰かにお金を使わせ、その見返りを受け取る</strong>
        という形をしています。この源泉が説明できないものは、
        値上がりの理由が「あとから来る人がもっと高く買うから」しかありません。
        暗号資産やコモディティがこの点で株式や債券と性質が違うことは、第2部で扱います。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>貯蓄と投資は優劣ではなく用途が違う道具</li>
        <li>金額が減らないことと、買えるものが減らないことは別</li>
        <li>物価が年2%で上がり続けると、100万円の購買力は30年で
          {manText(purchasingPower(AMOUNT, 0.02, SPAN))}万円ぶんになる</li>
        <li>投資に回してよいのは「使うお金」「備えるお金」を分けた残り</li>
        <li>リターンの源泉が説明できるかどうかで、商品の性質が分かれる</li>
      </ul>
    </Chapter>
  );
}
