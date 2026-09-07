import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Bars, Legend } from '../../_chapter/Figure';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('shinyo');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/** 自己資金100万円に対して、株価が3割下がったときの損失 */
const OWN = 100;
const LEVERAGES = [1, 2, 3];
const FALL = 0.3;

export default function Page() {
  return (
    <Chapter slug="shinyo" sources={['jpx-margin', 'jsda-study', 'nta-1463']}>
      <p>
        信用取引は、<strong>証券会社に保証金を預けて、
        その何倍かの金額を売買する</strong>仕組みです。
        現物取引と違い、<strong>損失が預けた額を超えることがあります</strong>。
        ここが決定的な違いです。
      </p>

      <h2>2つの方向</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>信用買い</th>
              <th>信用売り（空売り）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>やること</th>
              <td>お金を借りて買う</td>
              <td>
                <strong>株を借りて売る</strong>
              </td>
            </tr>
            <tr>
              <th>儲かる場面</th>
              <td>値上がり</td>
              <td>値下がり</td>
            </tr>
            <tr>
              <th>損失の上限</th>
              <td>株価が0になるまで</td>
              <td>
                <strong>理論上、上限がない</strong>
              </td>
            </tr>
            <tr>
              <th>コスト</th>
              <td>金利</td>
              <td>貸株料、逆日歩</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>空売りの損失に上限がないのは、株価に上限がないからです。</strong>
        買いなら株価が0になっても損は投資額まで。
        売りは株価が2倍になれば損も投資額と同じ、10倍になればその9倍です。
        第2部17章のオプション売りと同じ非対称性がここにもあります。
      </p>

      <h2>レバレッジの効き方</h2>

      <Figure
        title="自己資金100万円で、レバレッジ1倍なら株価が3割下がると30万円の損だが、2倍なら60万円、3倍なら90万円の損になる"
        caption="同じ「3割下落」でも、倍率の分だけ自己資金が削られます。3倍なら、自己資金がほぼ消えます。"
      >
        <Bars
          unit="万円の損失"
          decimals={0}
          max={100}
          rows={LEVERAGES.map((l) => ({
            label: `${l}倍`,
            parts: [{ name: '損失', value: OWN * l * FALL, tone: 'accent' as const }],
          }))}
        />
        <Legend
          variant="swatch"
          items={[{ name: '自己資金100万円のうち失われる額', tone: 'accent' }]}
        />
      </Figure>

      <h2>追証——いちばん危険な瞬間</h2>

      <p>
        保証金は、建玉に対して一定の割合（委託保証金率）を保つ必要があります。
        損失で保証金の比率が最低ラインを下回ると、
        <strong>追加で差し入れる義務</strong>が生じます。これが<span className="term">追証</span>です。
      </p>

      <ul>
        <li>
          <strong>期限までに入れられなければ、強制的に決済されます。</strong>
          自分の意思とは関係なく、その時点の価格で損が確定します
        </li>
        <li>
          <strong>いちばん下がったところで決済されることになりがちです。</strong>
          追証が発生するのは大きく下げた局面なので、構造的にそうなります
        </li>
        <li>
          <strong>それでも足りなければ、不足分を支払う義務が残ります。</strong>
          預けた額を超える損失とは、この状態のことです
        </li>
      </ul>

      <h2>空売り固有のリスク</h2>

      <ul>
        <li>
          <strong>逆日歩（品貸料）</strong>——
          株を借りたい人が多いのに貸株が足りないと、
          <strong>追加のコストが発生します</strong>。
          金額は事前に確定せず、後から決まります。
          日数分かかるため、持ち続けるほど積み上がります
        </li>
        <li>
          <strong>踏み上げ</strong>——
          株価が上がって空売りしていた人が買い戻すと、
          その買いがさらに株価を押し上げます。
          損失が加速する形になります
        </li>
        <li>
          <strong>権利処理</strong>——
          配当や株主優待の権利日をまたぐと、
          <strong>配当相当額を支払う</strong>必要があります
        </li>
      </ul>

      <h2>期限がある</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>制度信用</th>
              <th>一般信用</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>期限</th>
              <td>
                <strong>原則6か月</strong>
              </td>
              <td>証券会社が定める（無期限のものもある）</td>
            </tr>
            <tr>
              <th>対象銘柄</th>
              <td>取引所が選定</td>
              <td>証券会社が決める</td>
            </tr>
            <tr>
              <th>逆日歩</th>
              <td>発生する</td>
              <td>発生しない（代わりに貸株料が高め）</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>期限があるということは、待てないということです。</strong>
        現物なら「下がったが、いつか戻るまで持つ」が選べます。
        信用取引では期限までに決済しなければならず、
        <strong>「待つ」という選択肢が制度的に消えます</strong>。
      </p>

      <h2>使われ方</h2>

      <ul>
        <li>
          <strong>つなぎ売り</strong>——
          現物を持ったまま同じ銘柄を空売りして、価格変動を打ち消す使い方。
          株主優待の権利取りなどで使われます
        </li>
        <li>
          <strong>下落局面での利益</strong>——現物では下がると損しかしませんが、
          空売りなら利益にできます
        </li>
        <li>
          <strong>資金効率</strong>——手元資金以上の取引ができます。
          これは利点であると同時に、上で見たリスクそのものです
        </li>
      </ul>

      <h2>税金</h2>

      <p>
        信用取引の損益は<strong>上場株式等の譲渡所得</strong>として
        申告分離課税20.315%です。現物株の損益と通算でき、
        繰越控除も使えます（第3部21章）。
        <strong>NISA口座では信用取引はできません</strong>。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>信用取引は保証金の何倍かを売買する仕組み。損失が預けた額を超えることがある</li>
        <li>空売りの損失には理論上の上限がない</li>
        <li>追証は下げ局面で発生する。強制決済でいちばん悪い値段になりがち</li>
        <li>逆日歩は事前に金額が確定しない</li>
        <li>期限があるので「待つ」という選択肢が消える</li>
        <li>損益は現物株と通算でき、繰り越せる。NISAでは使えない</li>
      </ul>
    </Chapter>
  );
}
