import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { OrderBook } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('ita');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="ita" sources={['jpx-tosho', 'jpx-tick', 'jsda-study']}>
      <p>
        第4部24章で注文の種類を見ました。この章では、
        その注文が並んでいる<strong>板</strong>そのものを読みます。
        <strong>板から何が分かり、何が分からないか</strong>を切り分けるのが目的です。
      </p>

      <h2>板の構造</h2>

      <Figure
        title="板は値段を中央に、左に売り注文の株数、右に買い注文の株数が並ぶ。売りの最安値と買いの最高値の間が売買が成立していない範囲になる"
        caption="いちばん安い売り（ここでは1,010円）といちばん高い買い（1,000円）の差がスプレッドです。この10円の間には注文がありません。"
      >
        <OrderBook
          rows={[
            { price: 1030, sell: 800 },
            { price: 1020, sell: 500 },
            { price: 1010, sell: 200 },
            { price: 1000, buy: 300 },
            { price: 990, buy: 600 },
            { price: 980, buy: 900 },
          ]}
        />
      </Figure>

      <ul>
        <li>
          <strong>最良売り気配</strong>——いちばん安い売り注文。
          いま成行で買えば、まずここから約定します
        </li>
        <li>
          <strong>最良買い気配</strong>——いちばん高い買い注文。
          いま成行で売れば、まずここに当たります
        </li>
        <li>
          <strong>スプレッド</strong>——その差。
          <strong>買ってすぐ売ると、この分だけ損になります</strong>
        </li>
      </ul>

      <h2>板が厚い・薄い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>板が厚い</th>
              <th>板が薄い</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>各値段の株数</th>
              <td>多い</td>
              <td>少ない</td>
            </tr>
            <tr>
              <th>スプレッド</th>
              <td>狭い</td>
              <td>広い</td>
            </tr>
            <tr>
              <th>成行の滑り</th>
              <td>小さい</td>
              <td>
                <strong>大きい</strong>
              </td>
            </tr>
            <tr>
              <th>売りたいとき</th>
              <td>すぐ売れる</td>
              <td>値段を下げないと売れない</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>板の薄さは、売るときに効いてきます。</strong>
        買うのは待てば済みますが、
        売りたい理由があるときは待てないことが多い。
        取引が少ない銘柄やETF（第2部10章）を持つときは、
        <strong>出口の値段が想定より不利になる</strong>ことを織り込んでおく必要があります。
      </p>

      <h2>板で分からないこと</h2>

      <p className="note">
        <strong>板は「いま出ている注文」しか映しません。</strong>
        これが最大の限界です。
      </p>

      <ul>
        <li>
          <strong>成行注文は板に見えません。</strong>
          寄り付き前を除き、成行はすぐ約定するので板には並びません
        </li>
        <li>
          <strong>注文は取り消せます。</strong>
          いま見えている厚い買い注文が、次の瞬間に消えることがあります
        </li>
        <li>
          <strong>隠された注文があります。</strong>
          大口の注文を分割して出す手法があり、
          板に見える数量が実際の需要とは限りません
        </li>
        <li>
          <strong>見せ板</strong>——約定させる意思のない注文を出して
          板を厚く見せる行為は、<strong>相場操縦として禁止されています</strong>。
          禁止されているということは、行われることがあるという意味でもあります
        </li>
      </ul>

      <p>
        <strong>「板が厚いから下がらない」という読み方は成り立ちません。</strong>
        板は現時点のスナップショットであって、将来の需給ではありません。
      </p>

      <h2>歩み値</h2>

      <p>
        <span className="term">歩み値</span>は、
        実際に約定した値段と数量が時刻順に並んだものです。
        板が「これから」なのに対して、歩み値は<strong>「実際に起きたこと」</strong>です。
      </p>

      <ul>
        <li>
          板の注文は取り消せますが、<strong>歩み値は取り消せません</strong>。
          その意味で板より確かな情報です
        </li>
        <li>
          売り気配・買い気配のどちら側で約定したかを見ると、
          買いと売りのどちらが押しているかの手がかりになります
        </li>
        <li>
          ただし<strong>1回の約定の意味は事後にしか分かりません</strong>。
          大口の買いが入っても、それが上昇の始まりか終わりかは判断できません
        </li>
      </ul>

      <h2>寄り付きと引け——板寄せ</h2>

      <p>
        取引開始時（寄り付き）と終了時（引け）は、
        通常の連続的な売買（ザラバ）と違う方式で値段が決まります。
      </p>

      <ul>
        <li>
          注文を積み上げて、<strong>いちばん多く約定する値段を1つ決めます</strong>
          （板寄せ方式）
        </li>
        <li>
          この時間帯は板に<strong>予想される約定価格</strong>が表示されますが、
          注文の追加・取消で刻々と変わります
        </li>
        <li>
          <strong>寄り付きの成行は特に滑りやすい</strong>。
          夜間のニュースが反映されるため、前日終値から離れた値段で始まることがあります
          （第4部24章）
        </li>
      </ul>

      <h2>板を見ることの位置づけ</h2>

      <p>
        <strong>長期の積立では、板を見る必要はほとんどありません。</strong>
        投資信託は板そのものが存在しませんし（第2部9章）、
        月に一度買うだけなら数円の差は誤差です。
      </p>

      <p>
        板が効くのは、<strong>まとまった金額を一度に売買するとき</strong>と、
        <strong>取引の少ない銘柄を扱うとき</strong>です。
        自分の注文が板を動かしてしまう規模かどうか、が分かれ目になります。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>板は値段ごとの注文の並び。最良気配の差がスプレッド</li>
        <li>薄い板は売るときに効く。出口の値段が不利になる</li>
        <li>板はいま出ている注文だけ。成行は見えず、注文は取り消せる</li>
        <li>見せ板は相場操縦として禁止されている</li>
        <li>歩み値は実際に起きた約定。板より確かだが、意味は事後にしか分からない</li>
        <li>長期の積立なら板を見る必要はほぼない</li>
      </ul>
    </Chapter>
  );
}
