import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Timeline } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('etf');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="etf" sources={['jpx-tosho', 'toushin-basic', 'jsda-study']}>
      <p>
        ETF（上場投資信託）は、<strong>取引所に上場している投資信託</strong>です。
        中身は前章の投資信託と同じ「箱」ですが、
        売買のしかたが株式と同じになることで、性質がいくつか変わります。
      </p>

      <h2>投資信託との違い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>投資信託</th>
              <th>ETF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>値段</th>
              <td>基準価額（1日1回）</td>
              <td>市場価格（取引時間中つねに動く）</td>
            </tr>
            <tr>
              <th>買い方</th>
              <td>金額指定ができる（1万円分など）</td>
              <td>
                <strong>口数で買う</strong>。株式と同じ
              </td>
            </tr>
            <tr>
              <th>注文</th>
              <td>いくらで買えるか分からない（ブラインド方式）</td>
              <td>
                <strong>成行・指値が使える</strong>（第4部24章）
              </td>
            </tr>
            <tr>
              <th>コスト</th>
              <td>信託報酬</td>
              <td>信託報酬＋売買手数料＋スプレッド</td>
            </tr>
            <tr>
              <th>分配金</th>
              <td>自動で再投資する商品がある</td>
              <td>
                <strong>自動再投資できない</strong>（現金で受け取り、自分で買い直す）
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>積立にはETFより投資信託が向いていることが多いです。</strong>
        毎月3万円と決めても、ETFは口数で買うので端数が出ますし、
        分配金が出るたびに自分で買い直す必要があります。
        逆に、まとまった額を自分のタイミングで買うならETFの機動性が生きます。
        <strong>どちらが優れているかではなく、買い方に合うかどうか</strong>です。
      </p>

      <h2>乖離——市場価格と基準価額のずれ</h2>

      <p>
        ETFにも中身の資産から計算される基準価額があります。
        ところが市場価格は<strong>売りたい人と買いたい人の需給で決まる</strong>ので、
        両者はぴったり一致しません。このずれを<span className="term">乖離</span>といいます。
      </p>

      <div className="example">
        <strong>なぜ乖離は小さく保たれるのか</strong>
        市場価格が基準価額より高くなりすぎると、
        指定参加者と呼ばれる業者が「中身を買ってETFを作り、市場で売る」ことで儲かります。
        安くなりすぎれば逆をします。
        <strong>この裁定取引が働くので、通常は乖離が小さく収まります。</strong>
        <br />
        逆に言えば、<strong>裁定が働きにくい状況では乖離が広がります</strong>。
      </div>

      <ul>
        <li>
          <strong>市場が急変しているとき</strong>——裁定が追いつかない
        </li>
        <li>
          <strong>取引が少ないETF</strong>——そもそも売買が成立しにくい
        </li>
        <li>
          <strong>海外資産のETFで、現地市場が閉まっているとき</strong>——
          中身の値段が動かないのに、日本の取引時間中に市場価格だけが動く
        </li>
      </ul>

      <p>
        <strong>取引が少ないETFは、板が薄いという形でも効いてきます。</strong>
        買値と売値の差（スプレッド）が広がり、
        成行注文を出すと思ったより不利な値段で約定します
        （第4部24章の「成行が滑る」話がそのまま当てはまります）。
      </p>

      <h2>国内ETFと海外ETF</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>国内ETF</th>
              <th>海外ETF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>取引時間</th>
              <td>東証の取引時間</td>
              <td>現地市場の時間（日本の夜間が多い）</td>
            </tr>
            <tr>
              <th>通貨</th>
              <td>円</td>
              <td>外貨。為替手数料がかかる</td>
            </tr>
            <tr>
              <th>分配金の課税</th>
              <td>20.315%</td>
              <td>
                <strong>現地でも課税される</strong>ことがある（二重課税）
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        海外ETFの分配金は、現地で源泉徴収されたうえで日本でも課税されることがあります。
        確定申告で<strong>外国税額控除</strong>を使えば一部を取り戻せますが、
        手間がかかります（第3部21章）。
      </p>

      <h2>分配金の再投資</h2>

      <Figure
        title="ETFは分配金が現金で入るため、再投資するには自分で買い直す必要がある。買い直すまでの間、その分は運用に回っていない"
        caption="投資信託の自動再投資と違い、手を動かすまで待ち時間ができます。少額だと1口ぶんに満たず買い直せないこともあります。"
      >
        <Timeline
          items={[
            { date: '①', label: '分配金が入る', sub: '現金で受け取る', mark: 'plain' },
            { date: '②', label: '運用に回らない', sub: '買い直すまで待ち', mark: 'ng' },
            { date: '③', label: '自分で買い直す', sub: 'ここで再投資', mark: 'ok' },
          ]}
        />
      </Figure>

      <p>
        第1部3章で見たとおり、複利は「増えた分がさらに働く」ことで効きます。
        <strong>受け取った分配金が現金のまま置かれている期間は、その分が働いていません。</strong>
        長期の積立なら、この手間の差は無視できない大きさになりえます。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>ETFは上場した投資信託。売買は株式と同じ（成行・指値が使える）</li>
        <li>市場価格と基準価額はずれる（乖離）。裁定が働きにくい場面で広がる</li>
        <li>取引が少ないETFはスプレッドが広く、成行で不利になりやすい</li>
        <li>分配金は自動再投資できない。買い直すまで運用に回らない</li>
        <li>海外ETFは為替手数料と、現地・日本の二重課税に注意</li>
        <li>積立なら投資信託、まとまった額を自分の判断で買うならETFが向きやすい</li>
      </ul>
    </Chapter>
  );
}
