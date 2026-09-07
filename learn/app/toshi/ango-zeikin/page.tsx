import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure from '../../_chapter/Figure';
import { Timeline } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('ango-zeikin');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="ango-zeikin" sources={['nta-1524', 'nta-1463', 'fsa-crypto']}>
      <p>
        暗号資産の税は、株式とは<strong>まったく別の仕組み</strong>です。
        章を分けているのは、株式の感覚で処理すると
        申告漏れや想定外の納税額につながるからです。
        金額が大きくなってから気づくと手遅れになります。
      </p>

      <p className="note">
        <strong>制度は改正で変わります。</strong>
        この章は2026年9月時点の内容です。
        暗号資産の税制は見直しの議論が続いている領域なので、
        実際の申告の前に国税庁の情報（末尾の参考文献）を必ず確かめてください。
      </p>

      <h2>株式との違い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>上場株式</th>
              <th>暗号資産（個人・原則）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>所得区分</th>
              <td>譲渡所得</td>
              <td>
                <strong>雑所得</strong>
              </td>
            </tr>
            <tr>
              <th>課税方式</th>
              <td>申告分離課税</td>
              <td>
                <strong>総合課税</strong>
              </td>
            </tr>
            <tr>
              <th>税率</th>
              <td>20.315%で固定</td>
              <td>
                <strong>他の所得と合算して累進</strong>
              </td>
            </tr>
            <tr>
              <th>損益通算</th>
              <td>株式等の中で可能</td>
              <td>
                <strong>給与や株式とはできない</strong>
              </td>
            </tr>
            <tr>
              <th>繰越控除</th>
              <td>3年間</td>
              <td>
                <strong>できない</strong>
              </td>
            </tr>
            <tr>
              <th>NISA</th>
              <td>使える</td>
              <td>
                <strong>使えない</strong>
              </td>
            </tr>
            <tr>
              <th>源泉徴収</th>
              <td>特定口座なら自動</td>
              <td>
                <strong>ない。自分で計算して申告する</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>総合課税だと何が起きるか</h2>

      <p>
        総合課税は、<strong>給与など他の所得と合算した金額に累進税率をかける</strong>
        方式です。所得税は課税所得が大きいほど税率が上がり、
        <strong>住民税10%と合わせると最大で約55%</strong>になります。
      </p>

      <div className="example">
        <strong>同じ利益でも税額が変わる</strong>
        暗号資産で300万円の利益が出たとします。
        <br />
        株式なら、他の所得がいくらであっても20.315%です。
        <br />
        暗号資産では、<strong>給与所得が高い人ほど税率が上がります</strong>。
        同じ300万円の利益でも、人によって納税額がまったく違います。
        <br />
        自分の税率は、課税所得（給与所得控除や各種控除を引いたあと）で決まります。
      </div>

      <h2>売っていなくても課税されることがある</h2>

      <p>
        ここがいちばん見落とされます。
        <strong>円に戻していなくても、損益が実現したものとして扱われる場面</strong>
        があります。
      </p>

      <Figure
        title="暗号資産で課税されるのは円に換えたときだけでなく、暗号資産どうしを交換したとき、暗号資産で商品を買ったとき、マイニングなどで取得したときも含まれる"
        caption="「円に戻していないから関係ない」は誤りです。交換や決済のたびに損益を計算する必要があります。"
      >
        <Timeline
          items={[
            { date: '①', label: '円に換える', sub: '課税される', mark: 'ng' },
            { date: '②', label: '別の暗号資産に交換', sub: 'これも課税', mark: 'ng' },
            { date: '③', label: '商品を買う', sub: 'これも課税', mark: 'ng' },
          ]}
        />
      </Figure>

      <ul>
        <li>
          <strong>暗号資産どうしの交換。</strong>
          ビットコインを別の暗号資産に交換した時点で、
          ビットコインを売って買い直したものとして損益が出ます
        </li>
        <li>
          <strong>暗号資産での決済。</strong>商品やサービスの支払いに使った場合も同じです
        </li>
        <li>
          <strong>マイニング・ステーキング等での取得。</strong>
          取得した時点の時価が所得になります
        </li>
      </ul>

      <p className="note">
        <strong>取引のたびに記録を残してください。</strong>
        交換を繰り返していると、あとから取得価額を再現するのが極めて困難になります。
        取引所が廃業していたり、履歴のダウンロード期限が過ぎていたりすると、
        <strong>正確な計算ができなくなります</strong>。
        日付・数量・時価・手数料を、その都度残しておくのが唯一の対策です。
      </p>

      <h2>取得価額の計算方法</h2>

      <p>
        同じ暗号資産を複数回に分けて買った場合、
        売ったときの原価をどう計算するかを決める必要があります。
      </p>

      <ul>
        <li>
          <strong>総平均法</strong>——年間の取得総額を総数量で割る。
          届出をしない場合、個人はこちらが法定の方法です
        </li>
        <li>
          <strong>移動平均法</strong>——取得のたびに平均単価を計算し直す。
          選ぶには届出が必要です
        </li>
      </ul>

      <p>
        <strong>いったん選んだ方法は継続して使います。</strong>
        年ごとに有利なほうへ変えることはできません。
      </p>

      <h2>会社員が注意すること</h2>

      <ul>
        <li>
          <strong>給与以外の所得が年20万円以下なら、所得税の確定申告は不要</strong>
          という仕組みがあります（第3部20章と同じ話）。
          ただし<strong>住民税の申告は別途必要</strong>です
        </li>
        <li>
          <strong>他に確定申告をするなら、20万円以下でも含める必要があります</strong>
        </li>
        <li>
          <strong>損失は切り捨てになります。</strong>
          株式のように繰り越せないので、
          「今年は損だから来年の利益と相殺しよう」ができません
        </li>
      </ul>

      <h2>納税資金の問題</h2>

      <p>
        暗号資産で特に起きやすい事故があります。
      </p>

      <div className="example">
        <strong>利益が出た年と、価格が下がった年がずれる</strong>
        年内に大きな利益が出て、その利益を暗号資産のまま持ち続けたとします。
        <br />
        年が明けて価格が大きく下がったあとに、
        <strong>前年の利益に対する納税義務がやってきます</strong>。
        資産は減っているのに、税額は前年の利益で計算されたままです。
        <br />
        <strong>利益が出た時点で、納税分を円で確保しておく</strong>のが対策です。
      </div>

      <h2>まとめ</h2>

      <ul>
        <li>暗号資産は雑所得・総合課税。株式の20.315%とはまったく別</li>
        <li>他の所得と合算した累進税率で、住民税と合わせ最大約55%</li>
        <li>株式・給与とは損益通算できず、繰越控除もできない。NISAも使えない</li>
        <li>円に戻していなくても、暗号資産どうしの交換や決済で課税される</li>
        <li>取引のたびに記録を残す。あとから再現するのは非常に難しい</li>
        <li>利益が出た年に、納税分を円で確保しておく</li>
      </ul>
    </Chapter>
  );
}
