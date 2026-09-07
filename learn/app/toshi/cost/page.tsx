import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { LineChart, Legend } from '../../_chapter/Figure';
import { Flow } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import { compound, manText, netRate, series } from '@/lib/calc';

const chapter = chapterBySlug('cost');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

const GROSS = 0.05;
const SPAN = 30;
/** 積立を止めても信託報酬は引かれ続ける、という点を見せるための比較 */
const FEES = [0.002, 0.01];

export default function Page() {
  return (
    <Chapter slug="cost" sources={['toushin-basic', 'fsa-guide', 'fsa-basic', 'jsda-study']}>
      <p>
        リターンは不確実ですが、<strong>コストは確実に引かれます</strong>。
        投資判断のなかで、事前に確実に分かる数少ない変数がこれです。
        第1部3章「複利と時間」で、コストが複利で効く側面を見ました。
        この章では、そもそも何がいつ引かれるのかを整理します。
      </p>

      <h2>いつ引かれるかで3つに分かれる</h2>

      <Figure
        title="投資信託のコストは、買うとき・持っている間・売るときの3つのタイミングで引かれる。持っている間に引かれる信託報酬が、長期ではいちばん効く"
        caption="効き方が違います。買うときと売るときは1回きりですが、持っている間のコストは毎日引かれ続けます。"
      >
        <Flow
          steps={[
            { label: '買うとき', sub: '購入時手数料' },
            { label: '持っている間', sub: '信託報酬（毎日）' },
            { label: '売るとき', sub: '信託財産留保額' },
          ]}
        />
      </Figure>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>コスト</th>
              <th>いつ</th>
              <th>中身</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>購入時手数料</td>
              <td>買うとき1回</td>
              <td>販売会社に払う。かからない商品も多い</td>
            </tr>
            <tr>
              <td>
                <strong>信託報酬</strong>
              </td>
              <td>
                <strong>毎日</strong>
              </td>
              <td>
                運用・管理の対価。純資産から日割りで差し引かれるので、
                <strong>自分で払う実感がない</strong>
              </td>
            </tr>
            <tr>
              <td>信託財産留保額</td>
              <td>売るとき1回</td>
              <td>解約に伴う費用を、残る人に転嫁しないための調整。無い商品もある</td>
            </tr>
            <tr>
              <td>売買委託手数料など</td>
              <td>その都度</td>
              <td>
                ファンドが中で株を売買するときの費用。
                <strong>信託報酬には含まれない</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>「信託報酬＝全部のコスト」ではありません。</strong>
        ファンドが中で売買する際の手数料などは信託報酬に含まれず、別途かかります。
        これらを含めた実際の負担は、運用報告書に記載される
        <strong>実質的なコスト</strong>で確かめられます。
        目論見書の信託報酬だけを見て比べると、実際の差が読めないことがあります。
      </p>

      <h2>信託報酬が特別なのは「毎日」だから</h2>

      <p>
        購入時手数料3%は痛いですが、1回きりです。
        信託報酬1%は小さく見えますが、<strong>持っている限り毎年引かれます</strong>。
        3年持てば購入時手数料を追い抜き、30年持てば桁が変わります。
      </p>

      <Figure
        title={`投資対象のリターンが年5%のとき、信託報酬0.2%と1.0%では30年後の金額が${manText(compound(100, netRate(GROSS, 0.002), SPAN))}万円と${manText(compound(100, netRate(GROSS, 0.01), SPAN))}万円に分かれる`}
        caption="年0.8ポイントの差です。1年では気づかない大きさが、持ち続けるほど開いていきます。"
      >
        <LineChart
          xMax={SPAN}
          yMax={420}
          yTop="420万円"
          xLabel="年"
          xTicks={[0, 10, 20, 30]}
          series={FEES.map((fee, i) => ({
            name: `信託報酬${fee * 100}%`,
            tone: (['accent', 'muted'] as const)[i],
            points: series(SPAN, (y) => compound(100, netRate(GROSS, fee), y)),
            endLabel: `${manText(compound(100, netRate(GROSS, fee), SPAN))}万`,
          }))}
        />
        <Legend
          items={[
            { name: '信託報酬 0.2%', tone: 'accent' },
            { name: '信託報酬 1.0%', tone: 'muted' },
          ]}
        />
      </Figure>

      <h2>投資信託以外のコスト</h2>

      <ul>
        <li>
          <strong>株式の売買手数料</strong>——1回ごと。
          頻繁に売買するほど積み上がります（第4部29章の短期売買で効いてきます）
        </li>
        <li>
          <strong>スプレッド</strong>——買値と売値の差。手数料と書かれていなくても、
          買った瞬間に含み損から始まるという形で負担しています。
          外貨や暗号資産で大きくなりがちです
        </li>
        <li>
          <strong>為替手数料</strong>——外貨建ての資産を買うとき。往復でかかります
        </li>
        <li>
          <strong>税金</strong>——利益の20.315%。厳密にはコストではありませんが、
          手元に残る額を減らすという意味では同じ働きをします（第3部21章）
        </li>
      </ul>

      <h2>コストを下げることの位置づけ</h2>

      <p>
        コストを下げても、リターンが上がるわけではありません。
        <strong>引かれる分が減るだけ</strong>です。それでも重視されるのは、
        投資で自分の意思で確実に動かせる数少ないものだからです。
      </p>

      <ul>
        <li>市場がどう動くか——選べない</li>
        <li>どの商品が勝つか——事前には分からない</li>
        <li>
          <strong>どれだけコストを払うか——選べる</strong>
        </li>
      </ul>

      <p className="note">
        <strong>ただし、安いことだけを基準にしないでください。</strong>
        コストが低くても中身が自分の目的に合っていなければ意味がありません。
        順番は「何に投資するかを決める」→「その中でコストを比べる」です。
        逆にすると、目的に合わない商品を安いという理由で選ぶことになります。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>コストは買うとき・持っている間・売るときに分かれる</li>
        <li>信託報酬は毎日引かれるので、長期ではいちばん効く</li>
        <li>信託報酬に含まれない費用もある。実質的なコストは運用報告書で確かめる</li>
        <li>スプレッドや為替手数料は「手数料」と書かれていなくても負担している</li>
        <li>コストは投資で自分が確実に選べる数少ない変数。ただし目的が先</li>
      </ul>
    </Chapter>
  );
}
