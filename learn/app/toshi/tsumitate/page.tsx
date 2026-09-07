import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Bars, Legend } from '../../_chapter/Figure';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import { averageCostPerUnit, mean } from '@/lib/calc';

const chapter = chapterBySlug('tsumitate');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/** 毎月1万円ずつ4回買ったときの価格。図と本文の両方でこれを使う */
const PRICES = [1000, 800, 1250, 1000];
const EACH = 10000;
const dca = averageCostPerUnit(PRICES, EACH);
const simple = mean(PRICES);
const yen = (n: number) => Math.round(n * 100) / 100;

export default function Page() {
  return (
    <Chapter slug="tsumitate" sources={['fsa-basic', 'fsa-guide', 'jsda-study']}>
      <p>
        毎月一定額を買い続ける方法を<span className="term">ドルコスト平均法</span>といいます。
        広く勧められる方法ですが、<strong>効く理由と、効かない場面</strong>を
        分けて理解しておかないと、期待の置き方を間違えます。
      </p>

      <h2>なぜ平均取得単価が下がるのか</h2>

      <p>
        <strong>金額を固定すると、安いときに多く、高いときに少なく買うことになります。</strong>
        これは意思ではなく算数として自動的にそうなります。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>回</th>
              <th>価格</th>
              <th>投じた額</th>
              <th>買えた口数</th>
            </tr>
          </thead>
          <tbody>
            {PRICES.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}回目</td>
                <td className="num">{p.toLocaleString('ja-JP')}円</td>
                <td className="num">{EACH.toLocaleString('ja-JP')}円</td>
                <td className="num">{yen(EACH / p)}口</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Figure
        title={`毎回1万円ずつ4回買うと平均取得単価は${yen(dca)}円になり、価格の単純平均${yen(simple)}円より低くなる`}
        caption="同じ価格の並びでも、金額を固定すると単純平均より安く買えます。ただし「必ず得をする」という意味ではありません（後述）。"
      >
        <Bars
          unit="円"
          decimals={2}
          max={1300}
          rows={[
            {
              label: '毎回1万円',
              parts: [{ name: '平均取得単価', value: dca, tone: 'accent' as const }],
            },
            {
              label: '価格の平均',
              parts: [{ name: '単純平均', value: simple, tone: 'muted' as const }],
            },
          ]}
        />
        <Legend
          variant="swatch"
          items={[
            { name: 'ドルコスト平均法の取得単価', tone: 'accent' },
            { name: '価格の単純平均', tone: 'muted' },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>これは数学的に必ず成り立ちます。</strong>
        金額を固定した場合の平均取得単価は調和平均になり、
        <strong>価格が変動する限り、必ず単純平均より低くなります</strong>
        （すべて同じ価格のときだけ一致）。
        ここまでは疑いようがありません。
      </p>

      <h2>ただし「単純平均に勝つ」は比較として不適切</h2>

      <p>
        よくある誤解がここです。
        <strong>比べるべき相手は「価格の単純平均」ではありません。</strong>
        現実の選択肢は次の2つです。
      </p>

      <ul>
        <li>いま手元にある資金を<strong>一括で投じる</strong></li>
        <li>手元にある資金を<strong>分割して投じる</strong>（現金のまま待つ期間ができる）</li>
      </ul>

      <p>
        この比較では、<strong>ドルコスト平均法が不利になることのほうが多くなります</strong>。
        理由は単純で、<strong>まだ投じていないお金は運用に回っていない</strong>からです。
        市場が長期的に上昇するなら、早く入れたほうが有利になります。
      </p>

      <div className="example">
        <strong>2つの状況を分けて考える</strong>
        <strong>毎月の収入から積み立てる場合</strong>——
        そもそも一括投資という選択肢がありません。
        手元にないお金は投じられないので、この比較は成立しません。
        <strong>この場合、ドルコスト平均法は唯一の方法であって、劣った方法ではありません。</strong>
        <br />
        <strong>まとまった資金がすでにある場合</strong>——
        ここではじめて一括か分割かの選択が生じます。
        期待値では一括が有利になりやすい一方、
        <strong>直後に大きく下げたときの後悔は分割のほうが小さい</strong>。
        これは損得ではなく、続けられるかどうかの問題です。
      </div>

      <h2>時間分散が効く場面と効かない場面</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>価格の動き</th>
              <th>ドルコスト平均法は</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>下がってから戻る</td>
              <td>
                <strong>有利</strong>。安いところで多く買える
              </td>
            </tr>
            <tr>
              <td>上がり続ける</td>
              <td>
                <strong>不利</strong>。一括で買ったほうが良かったことになる
              </td>
            </tr>
            <tr>
              <td>上がってから下がる</td>
              <td>
                <strong>不利</strong>。高いところで買い続けたことになる
              </td>
            </tr>
            <tr>
              <td>下がり続ける</td>
              <td>損は小さくなるが、それでも損</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>どれになるかは事前に分かりません。</strong>
        分かるなら分散する必要がありません。
        ドルコスト平均法の価値は「有利になる」ことではなく、
        <strong>どれになるか分からない状況で、判断を挟まずに続けられる</strong>ことです。
      </p>

      <h2>積立の本当の効き目——続けられること</h2>

      <p>
        第1部2章で「下落に耐えられるかは、下落してみるまで分からない」と書きました。
        積立の最大の利点は数字ではなく、<strong>行動の側</strong>にあります。
      </p>

      <ul>
        <li>
          <strong>買うタイミングを毎回考えなくてよい。</strong>
          考える回数が減れば、間違える回数も減ります
        </li>
        <li>
          <strong>下げ相場で買い続けられる。</strong>
          自動化していないと、下がっているときに買うのは心理的に難しい
        </li>
        <li>
          <strong>手元の資金を一度に失う恐怖がない。</strong>
          結果として、市場に居続けられます
        </li>
      </ul>

      <h2>実務の設定</h2>

      <ul>
        <li>
          <strong>証券会社の自動積立を使う。</strong>手で毎月買うと必ず途切れます
        </li>
        <li>
          <strong>NISAのつみたて投資枠は積立でしか買えません</strong>（第3部18章）
        </li>
        <li>
          <strong>ボーナス設定</strong>——年に数回、増額できる仕組みがあります。
          年間枠を使い切りたい場合に使えます
        </li>
        <li>
          <strong>金額は下げてもよいので止めない。</strong>
          止めると再開の判断が必要になり、たいてい再開しません
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>金額を固定すると、安いときに多く買えるので取得単価は単純平均より必ず下がる</li>
        <li>ただし比べる相手は単純平均ではなく「一括投資」。期待値では一括が有利になりやすい</li>
        <li>毎月の収入から積み立てる場合、そもそも一括という選択肢がない</li>
        <li>有利になるかは値動き次第で、事前には分からない</li>
        <li>本当の効き目は、判断を挟まずに続けられること</li>
        <li>自動積立にする。金額は下げてよいが止めない</li>
      </ul>
    </Chapter>
  );
}
