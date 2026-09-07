import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { Flow } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';
import { driftOf } from '@/lib/calc';

const chapter = chapterBySlug('rebalance');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

/** 株式50・債券50で始めて、株式が5割上がり債券が動かなかった場合 */
const TARGET = [50, 50];
const START = [500, 500];
const AFTER = [750, 500];
const drift = driftOf(AFTER, TARGET);
const ratio = (v: number, list: number[]) =>
  Math.round((v / list.reduce((s, x) => s + x, 0)) * 1000) / 10;

export default function Page() {
  return (
    <Chapter slug="rebalance" sources={['gpif-portfolio', 'fsa-basic', 'nta-1463']}>
      <p>
        前章で決めた配分は、<strong>放っておくと必ず崩れます</strong>。
        よく上がった資産の比率が勝手に大きくなるからです。
        元の比率に戻す作業が<span className="term">リバランス</span>です。
      </p>

      <h2>なぜ勝手に崩れるのか</h2>

      <Figure
        title={`株式50%・債券50%で始めて株式だけが5割上がると、比率は株式${ratio(AFTER[0], AFTER)}%・債券${ratio(AFTER[1], AFTER)}%になり、決めた配分より株式に偏る`}
        caption="何もしていないのに、株式の比率が上がっています。つまり、取っているリスクが当初より大きくなっています。"
      >
        <Bars
          unit="万円"
          decimals={0}
          max={1300}
          rows={[
            {
              label: '当初',
              parts: [
                { name: '株式', value: START[0], tone: 'accent' as const },
                { name: '債券', value: START[1], tone: 'muted' as const },
              ],
            },
            {
              label: '上昇後',
              parts: [
                { name: '株式', value: AFTER[0], tone: 'accent' as const },
                { name: '債券', value: AFTER[1], tone: 'muted' as const },
              ],
            },
          ]}
        />
        <Legend
          variant="swatch"
          items={[
            { name: '株式', tone: 'accent' },
            { name: '債券', tone: 'muted' },
          ]}
        />
      </Figure>

      <p>
        当初の株式50%が{ratio(AFTER[0], AFTER)}%になりました。
        目標からのずれは<strong>+{Math.round(drift[0] * 10) / 10}ポイント</strong>です。
        <strong>放置すると、決めたはずのリスクより大きなリスクを取っていることになります。</strong>
        第1部2章のとおり、比率がそのまま下落幅を決めるからです。
      </p>

      <h2>リバランスがやっていること</h2>

      <Figure
        title="リバランスは、比率が増えた資産を売り、減った資産を買い足して、決めた配分に戻す作業"
        caption="結果として「上がったものを売り、下がったものを買う」ことになります。感情に逆らう動きなので、ルールにしておく必要があります。"
      >
        <Flow
          steps={[
            { label: '比率が崩れる', sub: '上がった資産が増える' },
            { label: '増えた分を売る', sub: '減った資産を買う' },
            { label: '元の配分に戻る', sub: 'リスクの大きさも戻る' },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>リバランスは「儲けるため」ではなく「リスクを一定に保つため」の作業です。</strong>
        結果的にリターンが改善することもありますが、それは副産物です。
        目的を取り違えると、
        「上がっている資産を売るのはもったいない」という判断で止まってしまいます。
      </p>

      <h2>いつやるか</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>方法</th>
              <th>やり方</th>
              <th>特徴</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>期間で決める</td>
              <td>年1回など、決めた時期に見直す</td>
              <td>忘れない。相場を見て判断しなくて済む</td>
            </tr>
            <tr>
              <td>乖離で決める</td>
              <td>目標から±5ポイント以上ずれたら戻す</td>
              <td>必要なときだけ動く。取引回数が減る</td>
            </tr>
            <tr>
              <td>併用</td>
              <td>年1回確認し、乖離が閾値を超えていたら実行</td>
              <td>実務的にはこれが扱いやすい</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>頻度を上げるほど良い、ということはありません。</strong>
        取引のたびにコストと税がかかるので、
        <strong>やりすぎるとリバランスの効果をコストが上回ります</strong>。
        年1回程度で十分とされることが多いのは、このためです。
      </p>

      <h2>税とコストを抑える</h2>

      <p>
        リバランスの最大の障害が<strong>売却時の課税</strong>です。
        値上がりした資産を売れば、利益に20.315%かかります（第3部21章）。
      </p>

      <ul>
        <li>
          <strong>売らずに、買い増しで調整する。</strong>
          積立を続けているなら、
          <strong>比率が下がった資産を多めに買う</strong>だけで近づきます。
          これが最もコストが低い方法です
        </li>
        <li>
          <strong>新規の入金で調整する。</strong>ボーナスなどのまとまった資金を、
          足りない側に入れる
        </li>
        <li>
          <strong>NISA口座の中で調整する。</strong>
          売っても課税されません。ただし<strong>売却しても枠の復活は翌年</strong>で、
          その年の投資枠を使ってしまう点に注意（第3部18章）
        </li>
        <li>
          <strong>iDeCoの中で調整する（スイッチング）。</strong>
          運用商品の預け替えができ、<strong>課税されません</strong>（第3部19章）。
          リバランスの場としては最も条件が良い
        </li>
      </ul>

      <p className="note">
        <strong>課税口座での売却は最後の手段にする</strong>のが実務です。
        買い増しで調整できる間は、売らないほうが有利になります。
      </p>

      <h2>やらないほうがよい場合</h2>

      <ul>
        <li>
          <strong>ずれが小さいとき。</strong>
          数ポイントのずれのために取引コストと税を払う意味は薄い
        </li>
        <li>
          <strong>資産全体が小さいとき。</strong>
          最低売買単位や手数料の影響が相対的に大きくなります
        </li>
        <li>
          <strong>バランスファンドを持っているとき。</strong>
          ファンド内で自動的に調整されます（前章）
        </li>
      </ul>

      <h2>配分そのものを変えるのは別の作業</h2>

      <p>
        リバランス（決めた比率に戻す）と、
        <strong>配分の変更（決めた比率そのものを変える）</strong>は別です。
        混同すると、相場が下がったときに
        「リバランスのつもりで」株式比率を下げてしまうことが起きます。
      </p>

      <ul>
        <li>
          <strong>変えてよい理由</strong>——年齢が上がった、
          使う時期が近づいた、収入が変わった、家族構成が変わった
        </li>
        <li>
          <strong>変えるべきでない理由</strong>——相場が下がった、上がった、
          ニュースを見て不安になった
        </li>
      </ul>

      <p>
        前章で「配分を決めた理由を書き留める」と書いたのは、
        この区別をするためです。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>配分は放っておくと必ず崩れる。上がった資産の比率が増える</li>
        <li>放置は、決めたより大きなリスクを取っている状態</li>
        <li>リバランスの目的はリスクを一定に保つこと。儲けるためではない</li>
        <li>年1回、または乖離が閾値を超えたら。頻度を上げすぎない</li>
        <li>売らずに買い増しで調整するのがいちばんコストが低い</li>
        <li>iDeCoのスイッチングは非課税。リバランスの場として条件が良い</li>
        <li>リバランスと配分の変更は別の作業。相場を理由に配分を変えない</li>
      </ul>
    </Chapter>
  );
}
