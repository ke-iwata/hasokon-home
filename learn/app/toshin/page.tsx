import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { Flow } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('toshin');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="toshin" sources={['toushin-basic', 'fsa-basic', 'jsda-study']}>
      <p>
        投資信託は、<strong>多くの人からお金を集めて、まとめて運用する箱</strong>です。
        1万円でも数百の銘柄に分散できるのが最大の利点で、
        第1部4章で見た分散を、個人が現実的に実行できる形にしたものです。
      </p>

      <h2>お金の流れと登場人物</h2>

      <Figure
        title="投資家が販売会社を通じて投資信託を買い、運用会社が運用の指図をし、信託銀行が資産を分別して保管する三者の仕組み"
        caption="運用する人と資産を持つ人が分かれています。この分業が、次に見る「破綻しても資産が守られる」仕組みの理由です。"
      >
        <Flow
          steps={[
            { label: '販売会社', sub: '窓口。買付・解約を受ける' },
            { label: '運用会社', sub: '何を買うかを決める' },
            { label: '信託銀行', sub: '資産を分別して保管' },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>分別管理は投資信託の重要な性質です。</strong>
        信託銀行は投資信託の資産を自社の資産と分けて管理する義務があります。
        そのため、販売会社・運用会社・信託銀行のいずれかが破綻しても、
        <strong>投資信託の資産そのものは守られます</strong>。
        ただし<strong>値下がりによる損失は別</strong>で、これは誰も補償しません。
      </p>

      <h2>基準価額</h2>

      <p>
        投資信託の値段が<span className="term">基準価額</span>で、
        ふつう1万口あたりで表示されます。
      </p>

      <div className="example">
        <strong>基準価額の決まり方</strong>
        （ファンドが持つ資産の時価 − 費用）÷ 総口数
        <br />
        <strong>1日1回だけ算出されます。</strong>株式のように刻々と動く値段ではありません。
        だから注文するときは<strong>いくらで買えるか分からない状態で注文します</strong>
        （ブラインド方式）。何時までに注文すればその日の基準価額か、は商品ごとに決まっています。
      </div>

      <p>
        <strong>基準価額が低い＝割安、ではありません。</strong>
        基準価額は運用の期間や分配の履歴で決まる数字で、
        1万円のファンドと3万円のファンドを比べても、割安・割高の判断にはなりません。
        比べるべきは中身とコストです。
      </p>

      <h2>分配金の罠</h2>

      <p>
        ここが投資信託でいちばん誤解の多いところです。
        <strong>分配金は、儲かったから出るとは限りません。</strong>
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>普通分配金</th>
              <th>元本払戻金（特別分配金）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>中身</th>
              <td>運用で増えた分からの分配</td>
              <td>
                <strong>自分が出したお金が戻ってきているだけ</strong>
              </td>
            </tr>
            <tr>
              <th>課税</th>
              <td>課税される</td>
              <td>課税されない（利益ではないため）</td>
            </tr>
            <tr>
              <th>取得価額</th>
              <td>変わらない</td>
              <td>その分だけ下がる</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Figure
        title="毎月分配型で受け取る分配金のうち、運用で増えた分を超える部分は元本払戻金であり、自分が出したお金が戻っているだけになる"
        caption="左が運用で増えた分、右が元本の払い戻しです。右の部分は「儲け」ではありません。"
      >
        <Bars
          unit="円"
          decimals={0}
          max={100}
          rows={[
            {
              label: '運用好調',
              parts: [
                { name: '普通分配金', value: 80, tone: 'accent' },
                { name: '元本払戻金', value: 0, tone: 'muted' },
              ],
            },
            {
              label: '運用不調',
              parts: [
                { name: '普通分配金', value: 20, tone: 'accent' },
                { name: '元本払戻金', value: 60, tone: 'muted' },
              ],
            },
          ]}
        />
        <Legend
          variant="swatch"
          items={[
            { name: '普通分配金（運用で増えた分）', tone: 'accent' },
            { name: '元本払戻金（自分の元本が戻っただけ）', tone: 'muted' },
          ]}
        />
      </Figure>

      <p>
        <strong>分配金が出ると基準価額はその分下がります。</strong>
        ファンドの資産から払い出しているので当然です。
        「毎月お金がもらえてお得」に見えるのは、
        自分の資産を取り崩しているだけの場合があります。
      </p>

      <p className="note">
        <strong>分配金を出さないことは、悪いことではありません。</strong>
        分配せずに再投資すれば、その分が複利で働きます（第1部3章）。
        受け取るたびに課税される普通分配金と違い、
        <strong>売るまで課税が繰り延べられる</strong>という利点もあります。
        「分配金が多い＝良いファンド」ではありません。
      </p>

      <h2>目論見書で見るところ</h2>

      <ul>
        <li>
          <strong>何に投資するか</strong>——対象資産・地域・指数に連動するかどうか
        </li>
        <li>
          <strong>コスト</strong>——購入時手数料・信託報酬・信託財産留保額（第1部5章）
        </li>
        <li>
          <strong>分配方針</strong>——毎月分配か、分配を抑えるか
        </li>
        <li>
          <strong>純資産総額</strong>——極端に小さいと、
          運用が続けられず<strong>繰上償還</strong>（満期前の終了）になることがあります
        </li>
        <li>
          <strong>為替ヘッジの有無</strong>——外貨建て資産の場合。
          ヘッジありは為替の影響を抑える代わりにコストがかかります
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>投資信託は少額で分散できる箱。運用会社と信託銀行が分業している</li>
        <li>分別管理により、関係会社が破綻しても資産は守られる（値下がりは別）</li>
        <li>基準価額は1日1回。低いから割安ということはない</li>
        <li>分配金には元本払戻金が含まれることがある。儲けとは限らない</li>
        <li>分配金が出ると基準価額は下がる。分配しないほうが複利は効く</li>
        <li>純資産総額が小さいと繰上償還のことがある</li>
      </ul>
    </Chapter>
  );
}
