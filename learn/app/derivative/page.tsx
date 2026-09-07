import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Ladder } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('derivative');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="derivative" sources={['jpx-derivative', 'jsda-study', 'fsa-basic']}>
      <p>
        デリバティブ（派生商品）は、
        <strong>株価や金利など他のものの値動きから価値が決まる契約</strong>です。
        もともとは値動きの影響を抑えるための道具ですが、
        同じ仕組みが投機にも使えます。この二面性が理解の要点です。
      </p>

      <h2>先物——将来の売買をいま約束する</h2>

      <div className="example">
        <strong>もとの目的</strong>
        小麦の生産者は、収穫時の価格が下がると困ります。
        パン会社は、上がると困ります。
        <strong>いまのうちに「半年後にこの値段で売買する」と約束すれば、
        両者とも価格変動を心配せずに事業を計画できます。</strong>
        <br />
        これが先物の出発点です。<strong>儲けるためではなく、
        不確実性を消すための道具</strong>でした。
      </div>

      <p>
        金融の先物も同じ形です。株価指数先物なら、
        将来のある日の指数を、いまの約定価格で売買する約束をします。
      </p>

      <ul>
        <li>
          <strong>証拠金で取引する。</strong>約定金額の全額ではなく、
          その一部を預けて取引します。つまり<strong>レバレッジがかかります</strong>
        </li>
        <li>
          <strong>期限がある。</strong>限月ごとに決済されます。
          持ち続けたければ次の限月へ乗り換える必要があり、そこでコストが出ます
          （第2部12章の「コモディティの商品が指数どおりに動かない」理由）
        </li>
        <li>
          <strong>値洗いがある。</strong>毎日の損益が証拠金に反映されます。
          足りなくなれば追加の差入れ（追証）が必要です
        </li>
      </ul>

      <h2>オプション——買う権利・売る権利</h2>

      <p>
        オプションは<strong>「買う（売る）権利」そのものを売買する</strong>契約です。
        先物との決定的な違いは、<strong>権利なので使わなくてもよい</strong>点にあります。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>コール（買う権利）</th>
              <th>プット（売る権利）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>買った人</th>
              <td>決めた値段で買える権利を得る</td>
              <td>決めた値段で売れる権利を得る</td>
            </tr>
            <tr>
              <th>得をする場面</th>
              <td>原資産が上がったとき</td>
              <td>原資産が下がったとき</td>
            </tr>
            <tr>
              <th>最大の損失</th>
              <td>支払った代金（プレミアム）まで</td>
              <td>支払った代金（プレミアム）まで</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>買い手と売り手で、リスクが対称ではない</h2>

      <p>
        オプションでいちばん重要な非対称性です。ここを見落とすと危険です。
      </p>

      <Figure
        title="オプションを買った人の損失はプレミアムまでで限定されるが、売った人の損失は理論上限りがない。受け取れるプレミアムは限定されている"
        caption="売り手は「小さな利益を何度も受け取り、まれに大きく損する」構造です。勝率が高く見えても、1回の損失で失うことがあります。"
      >
        <Ladder
          steps={[
            {
              label: 'オプションの買い手',
              sub: '損失はプレミアムまで。利益は大きくなりうる',
            },
            {
              label: 'オプションの売り手',
              sub: 'プレミアムを受け取るが、損失は理論上無限（コール売り）',
              strong: true,
            },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>「オプションの売りは勝率が高い」という説明には裏があります。</strong>
        ほとんどの回は権利が行使されずにプレミアムがそのまま利益になります。
        しかし<strong>相場が急変した1回で、それまでの利益をすべて失い、
        さらに大きな損失を負うことがあります</strong>。
        勝率と期待値は別の話です。
      </p>

      <h2>ヘッジとしての使い方</h2>

      <p>
        本来の用途はこちらです。
      </p>

      <ul>
        <li>
          <strong>持っている株の下落に備える</strong>——
          プット・オプションを買っておくと、
          下がったときに決めた値段で売れます。保険のような使い方です。
          代わりに<strong>プレミアムというコストがかかります</strong>
        </li>
        <li>
          <strong>これから買う予定の価格を固定する</strong>——先物の本来の用途
        </li>
      </ul>

      <p>
        <strong>ヘッジはタダではありません。</strong>
        リスクを減らす分、コストを払うか、上昇の一部を諦めることになります。
        「リスクだけ消せる」という説明が出てきたら、
        どこにコストが乗っているかを探してください。
      </p>

      <h2>個人が触れる場面</h2>

      <ul>
        <li>
          <strong>知らずに触れている場合があります。</strong>
          「ブル・ベア型」「レバレッジ型」の投資信託は内部で先物を使っています。
          <strong>日々のリターンの倍率を目標にする設計</strong>のため、
          <strong>長期では指数の倍率どおりにならない</strong>（減価する）ことがあります
        </li>
        <li>
          <strong>仕組債。</strong>債券にオプションを組み込んだ商品です。
          「高い利率」の裏で、実質的にオプションを売っている構造のものがあります。
          <strong>上値は限定され、下値は限定されない</strong>形になっていないかを確認します
        </li>
      </ul>

      <h2>税金</h2>

      <p>
        先物・オプション（取引所取引）の利益は
        <strong>先物取引に係る雑所得等</strong>として申告分離課税20.315%です。
        FXと同じ区分で通算でき、3年間繰り越せますが、
        <strong>株式の損益とは通算できません</strong>（第3部21章）。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>デリバティブは他のものの値動きから価値が決まる契約。出発点はリスクを消す道具</li>
        <li>先物は将来の売買の約束。証拠金取引なのでレバレッジがかかり、期限がある</li>
        <li>オプションは権利の売買。買い手の損失はプレミアムまで</li>
        <li>売り手の損失は限定されない。勝率が高く見えても期待値は別</li>
        <li>ヘッジにはコストがかかる。「リスクだけ消せる」はない</li>
        <li>レバレッジ型投信や仕組債という形で、知らずに触れていることがある</li>
      </ul>
    </Chapter>
  );
}
