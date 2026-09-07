import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure from '../../_chapter/Figure';
import { Flow } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('hoken-nenkin');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="hoken-nenkin" sources={['seiho-guide', 'fsa-basic', 'jsda-study']}>
      <p>
        変額保険や個人年金保険のように、
        <strong>保障と運用を1つの契約にまとめた商品</strong>があります。
        便利に見えますが、まとめることで見えなくなるものがあります。
        この章では、その中身の分け方を扱います。
      </p>

      <h2>保険料は3つに分かれている</h2>

      <Figure
        title="払い込んだ保険料は、保障のための費用、保険会社の運営に充てる費用、そして運用に回る部分の3つに分かれる。運用に回るのは全額ではない"
        caption="投資商品との比較で見落とされるのがここです。払った額の全部が運用されるわけではありません。"
      >
        <Flow
          steps={[
            { label: '保障の費用', sub: '死亡保障などの対価' },
            { label: '運営の費用', sub: '保険会社の経費' },
            { label: '運用に回る分', sub: 'ここだけが増減する' },
          ]}
        />
      </Figure>

      <p>
        <strong>「10年で払込総額を超えました」と言われても、
        比較対象が何かを確かめる必要があります。</strong>
        同じ額を保障のない投資商品に入れていたらどうだったか、
        というのが本来の比較です。
      </p>

      <h2>まとめることの損得</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>まとめる（変額保険など）</th>
              <th>分ける（掛け捨て保険＋投資）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>コスト</th>
              <td>保障の費用と運用の費用が一体で見えにくい</td>
              <td>それぞれ比較できる</td>
            </tr>
            <tr>
              <th>見直し</th>
              <td>片方だけ変えにくい</td>
              <td>保障だけ、運用だけを変えられる</td>
            </tr>
            <tr>
              <th>途中解約</th>
              <td>
                <strong>解約控除で元本割れしやすい</strong>
              </td>
              <td>投資部分はいつでも売れる</td>
            </tr>
            <tr>
              <th>税制優遇</th>
              <td>生命保険料控除</td>
              <td>NISA・iDeCo（第3部）</td>
            </tr>
            <tr>
              <th>手間</th>
              <td>1つで済む</td>
              <td>2つ管理する</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>どちらが正しいという話ではありません。</strong>
        ただし「まとめると得」という説明には根拠が要ります。
        比べるときは<strong>保障の中身を揃えたうえで、
        総コストと手残りで比べる</strong>こと。
        「保険で運用もできてお得」という言い方は、この比較を飛ばしています。
      </p>

      <h2>主な商品の性質</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>中身</th>
              <th>注意点</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>定期保険（掛け捨て）</td>
              <td>保障のみ。貯まらない</td>
              <td>保障だけを安く買う形。運用は別で行う</td>
            </tr>
            <tr>
              <td>終身保険</td>
              <td>保障＋積立</td>
              <td>途中解約で元本割れしやすい</td>
            </tr>
            <tr>
              <td>変額保険</td>
              <td>保障＋投資信託のような運用</td>
              <td>
                <strong>運用成果で保険金や解約返戻金が変動する</strong>。コストが二重
              </td>
            </tr>
            <tr>
              <td>個人年金保険</td>
              <td>将来の年金を積み立てる</td>
              <td>予定利率が低い時期の契約は増えにくい</td>
            </tr>
            <tr>
              <td>外貨建て保険</td>
              <td>外貨で運用</td>
              <td>
                <strong>為替リスク＋為替手数料</strong>（第2部13章）。
                「円建てより利率が高い」のは通貨が違うため
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>解約控除——途中でやめると引かれる</h2>

      <p>
        貯蓄性のある保険には、契約から一定期間内に解約すると
        <strong>解約控除</strong>が差し引かれるものが多くあります。
        保険会社が契約時にかけた費用を回収する仕組みです。
      </p>

      <p>
        結果として、<strong>数年で解約すると払込総額を大きく下回ります</strong>。
        「長く続ける前提でないと成り立たない設計」だということです。
        続けられるかどうかを、契約前に見積もる必要があります。
      </p>

      <h2>税制優遇の比較</h2>

      <ul>
        <li>
          <strong>生命保険料控除</strong>——払った保険料の一部が所得控除になります。
          ただし<strong>控除額には上限があり</strong>、
          すでに他の保険で枠を使い切っていれば追加の効果はありません
        </li>
        <li>
          <strong>iDeCo</strong>——掛金が<strong>全額</strong>所得控除（第3部19章）。
          控除の効率はこちらが上です
        </li>
        <li>
          <strong>NISA</strong>——控除はありませんが、運用益が非課税（第3部18章）
        </li>
      </ul>

      <p>
        <strong>「保険で節税」を検討するなら、
        先にiDeCoとNISAの枠が空いているかを確認するのが順番です。</strong>
        枠が余っているのに保険の控除から埋めるのは、効率が良くありません。
      </p>

      <h2>保険が向いている場面</h2>

      <p>
        投資商品と比べる文脈が続きましたが、
        <strong>保険にしかできないこと</strong>もあります。
      </p>

      <ul>
        <li>
          <strong>いま亡くなったら困る額を、いますぐ用意する。</strong>
          積立では時間がかかりますが、保険なら契約直後から保障が出ます。
          小さな子どもがいる家庭の死亡保障はこの典型です
        </li>
        <li>
          <strong>相続の際に、現金で受け取れる形にしておく。</strong>
          死亡保険金には非課税枠（500万円 × 法定相続人の数）があります
        </li>
      </ul>

      <p>
        いずれも<strong>「保障」の機能</strong>です。
        運用の器としての比較と、保障の必要性の判断は、分けて考えます。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>保険料は保障の費用・運営の費用・運用に回る分に分かれる。全額は運用されない</li>
        <li>保障と運用をまとめると、コストが見えにくく、片方だけの見直しがしにくい</li>
        <li>比べるときは保障の中身を揃えて、総コストと手残りで</li>
        <li>解約控除があるため、途中でやめると大きく元本割れしやすい</li>
        <li>節税目的なら、先にiDeCo・NISAの枠を確認するのが順番</li>
        <li>「いますぐ保障が要る」場面は保険にしかできない</li>
      </ul>
    </Chapter>
  );
}
