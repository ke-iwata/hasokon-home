import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';
import { drawdownOf } from '@/lib/calc';

const chapter = chapterBySlug('risk-return');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

/** 値動きする資産の比率と、その資産が3割下がったときの全体の下落 */
const RISKY_FALL = 0.3;
const RATIOS = [0.2, 0.5, 0.8, 1];

export default function Page() {
  return (
    <Chapter slug="risk-return" sources={['fsa-basic', 'jsda-study', 'fsa-guide']}>
      <p>
        投資の話で「リスク」という言葉が出てきたとき、
        日常語の「危険」で読むと必ず混乱します。
        <strong>投資でいうリスクは、損失のことではなく振れ幅のこと</strong>です。
        ここを取り違えると、以降の章の言葉がすべてずれます。
      </p>

      <h2>リスク＝振れ幅</h2>

      <p>
        <span className="term">リスク</span>は、リターンがどれくらいばらつくかを表します。
        上にも下にも振れることを指すので、<strong>大きく儲かる可能性もリスクの一部</strong>です。
        数値としては<span className="term">標準偏差</span>で測ります。
      </p>

      <div className="example">
        <strong>同じ「期待リターン5%」でも中身が違う</strong>
        Aは毎年きっちり5%増える。Bは +25% の年と −15% の年が半々。
        平均するとどちらも5%ですが、<strong>持っている間の経験がまったく違います</strong>。
        Bのほうがリスクが大きい、というのがこの言葉の使い方です。
        <br />
        そしてBには、<strong>取り崩したい年がたまたま −15% の年だった</strong>
        という問題がついて回ります。
      </div>

      <p className="note">
        <strong>「リスクが高い＝リターンも高い」ではありません。</strong>
        正しくは「高いリターンを期待するなら、高いリスクを引き受けるしかない」です。
        逆は成り立ちません。<strong>リスクだけ高くてリターンが低いものは、いくらでもあります。</strong>
        リスクを取れば報われる、という読み替えが、いちばん損につながります。
      </p>

      <h2>どれだけ減りうるかは、比率で決まる</h2>

      <p>
        自分がどれだけのリスクを取っているかは、
        <strong>値動きする資産を全体の何割持っているか</strong>でおおよそ決まります。
        持っている商品の名前より、この比率のほうがはるかに効きます。
      </p>

      <Figure
        title={`資産1,000万円のうち値動きする資産の比率が2割・5割・8割・10割のとき、その資産が3割下がると全体はそれぞれ60万円・150万円・240万円・300万円減る`}
        caption="同じ「3割下落」でも、持っている比率で痛みがまったく違います。商品を選ぶ前に、この比率を決めるのが順番です。"
      >
        <Bars
          unit="万円の下落"
          max={320}
          rows={RATIOS.map((r) => ({
            label: `${r * 100}%`,
            parts: [
              { name: '下落額', value: drawdownOf(r, RISKY_FALL) * 1000, tone: 'accent' as const },
            ],
          }))}
        />
        <Legend
          variant="swatch"
          items={[{ name: '資産1,000万円のうち、減る額', tone: 'accent' }]}
        />
      </Figure>

      <p>
        3割の下落は、株式市場では珍しいことではありません。
        <strong>「何%減っても、売らずに待てるか」</strong>——
        これがリスク許容度の実際の中身です。
        年齢や性格ではなく、金額で考えるほうが当てになります。
      </p>

      <h2>リスク許容度は何で決まるか</h2>

      <ul>
        <li>
          <strong>いつ使うお金か。</strong>いちばん効きます。
          30年後に使うお金なら、途中の下落は待てます。3年後に使うお金は待てません
        </li>
        <li>
          <strong>減っても生活が壊れないか。</strong>前章の「増やすお金」に収まっているか
        </li>
        <li>
          <strong>減ったときに判断を誤らないか。</strong>
          これは事前には分かりません。分からない前提で、比率を控えめにしておくのが安全側です
        </li>
      </ul>

      <p className="note">
        <strong>下落に耐えられるかは、下落してみるまで本当には分かりません。</strong>
        だから最初は「これくらいなら平気」と思う比率より少なめから始めて、
        一度下げ相場を経験してから増やすほうが、順序として安全です。
      </p>

      <h2>減った分を取り戻すには、より大きく上げる必要がある</h2>

      <p>
        直感に反する算数がひとつあります。
        <strong>50%下がったものが元に戻るには、100%上がる必要があります。</strong>
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>下落率</th>
              <th>元に戻すのに必要な上昇率</th>
            </tr>
          </thead>
          <tbody>
            {[0.1, 0.2, 0.3, 0.5, 0.7].map((d) => (
              <tr key={d}>
                <td className="num">−{Math.round(d * 100)}%</td>
                <td className="num">+{Math.round((1 / (1 - d) - 1) * 1000) / 10}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        下落が深くなるほど、回復に必要な上昇は急に大きくなります。
        <strong>大きく減らさないことが、大きく増やすことと同じくらい効く</strong>のはこのためです。
        リスクを抑える話が、ただの臆病ではないのはここに理由があります。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>投資のリスクは損失ではなく振れ幅。上振れもリスクのうち</li>
        <li>「リスクが高ければリターンも高い」は逆向きには成り立たない</li>
        <li>どれだけ減りうるかは、値動きする資産の比率でほぼ決まる</li>
        <li>リスク許容度は「いつ使うお金か」がいちばん効く</li>
        <li>50%の下落を取り戻すには100%の上昇が要る。減らさないことの価値は大きい</li>
      </ul>
    </Chapter>
  );
}
