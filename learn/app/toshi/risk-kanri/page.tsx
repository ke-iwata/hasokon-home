import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Bars, Legend } from '../../_chapter/Figure';
import { Flow } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import { positionSize } from '@/lib/calc';

const chapter = chapterBySlug('risk-kanri');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

const CAPITAL = 1000;
const RISK = 0.01;
const STOPS = [0.05, 0.1, 0.2];

export default function Page() {
  return (
    <Chapter slug="risk-kanri" sources={['fsa-basic', 'jsda-study', 'barber-odean-2000']}>
      <p>
        投資で退場する原因は、読みが外れることではありません。
        <strong>1回の失敗で立て直せない額を失うこと</strong>です。
        読みは外れて当たり前なので、
        <strong>外れたときにいくら失うかを先に決めておく</strong>のがこの章です。
      </p>

      <h2>順番を逆にしない</h2>

      <Figure
        title="正しい順番は、1回で失ってよい額を決め、どこで損切りするかを決め、そこから持てる量を計算する。金額を先に決めると、1回の損失が想定を超える"
        caption="多くの人は「いくら買うか」から入ります。そこから始めると、損切りの位置が「いくら失うか」を勝手に決めてしまいます。"
      >
        <Flow
          steps={[
            { label: '① 失ってよい額', sub: '資産の何%か' },
            { label: '② 損切りの位置', sub: '何%下で切るか' },
            { label: '③ 持てる量', sub: '①÷②で決まる' },
          ]}
        />
      </Figure>

      <div className="example">
        <strong>計算のしかた</strong>
        資産{CAPITAL.toLocaleString('ja-JP')}万円、1回の取引で失ってよいのは
        <strong>{RISK * 100}%＝{CAPITAL * RISK}万円</strong>と決めたとします。
        <br />
        10%下がったところで損切りするなら、持てる量は
        <br />
        {CAPITAL * RISK}万円 ÷ 0.10 ＝
        <strong>{positionSize(CAPITAL, RISK, 0.1).toLocaleString('ja-JP')}万円分</strong>
        <br />
        損切りを浅く（5%）すれば多く持てますが、
        <strong>浅い損切りは、通常の値動きで引っかかりやすくなります</strong>。
      </div>

      <Figure
        title={`資産1,000万円で1回に1%まで失うと決めた場合、損切りが5%なら${positionSize(CAPITAL, RISK, 0.05)}万円、10%なら${positionSize(CAPITAL, RISK, 0.1)}万円、20%なら${positionSize(CAPITAL, RISK, 0.2)}万円まで持てる`}
        caption="損切りを深くするほど、持てる量は小さくなります。どちらが良いという話ではなく、この2つは連動しているという関係です。"
      >
        <Bars
          unit="万円まで"
          decimals={0}
          max={220}
          rows={STOPS.map((st) => ({
            label: `${st * 100}%で損切り`,
            parts: [
              { name: '持てる量', value: positionSize(CAPITAL, RISK, st), tone: 'accent' as const },
            ],
          }))}
        />
        <Legend variant="swatch" items={[{ name: '持てる金額の上限', tone: 'accent' }]} />
      </Figure>

      <h2>なぜ1回あたりを小さくするのか</h2>

      <p>
        第1部2章で見た算数がここで効きます。
        <strong>大きく減らすほど、取り戻すのに必要な上昇が急に大きくなります。</strong>
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>連敗数</th>
              <th>1回2%ずつ失う</th>
              <th>1回10%ずつ失う</th>
            </tr>
          </thead>
          <tbody>
            {[5, 10, 20].map((n) => (
              <tr key={n}>
                <td>{n}連敗</td>
                <td className="num">残り{Math.round((1 - 0.02) ** n * 1000) / 10}%</td>
                <td className="num">残り{Math.round((1 - 0.1) ** n * 1000) / 10}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        <strong>連敗は必ず起きます。</strong>
        1回あたりを小さく保っていれば、連敗しても資産はほとんど残ります。
        大きく張っていると、同じ連敗で市場から退場します。
        <strong>読みの精度ではなく、この設計が生死を分けます。</strong>
      </p>

      <h2>損切りが難しい理由</h2>

      <p className="note">
        <strong>損切りは、決めることより実行することのほうが難しい。</strong>
        含み損を確定させると「自分が間違っていた」ことが確定するため、
        先送りしたくなります。
        「まだ下がっただけで、売らなければ損ではない」という考え方は、
        <strong>いま同じ値段でこれを買うか</strong>と問い直すと崩れます。
        買わないなら、持ち続ける理由も同じだけありません。
      </p>

      <ul>
        <li>
          <strong>逆指値を入れておく</strong>（第4部24章）。
          発動を自分の意思から切り離せます
        </li>
        <li>
          <strong>入る前に書き留める。</strong>
          どこで切るかを、買う前に決めて記録します。
          持ってから考えると、必ず甘くなります
        </li>
        <li>
          <strong>損切りをずらさない。</strong>
          第4部29章で挙げたとおり、これが破綻の最短経路です
        </li>
      </ul>

      <h2>長期の積立にも当てはまること</h2>

      <p>
        ここまで短期売買を前提に書きましたが、
        <strong>長期投資でも中身は同じ</strong>です。
        違うのは「損切り」ではなく「配分」で管理する点だけです。
      </p>

      <ul>
        <li>
          <strong>1回の下落で失ってよい額</strong>を決め、
          そこから<strong>値動きする資産の比率</strong>を逆算する（第4部27章）
        </li>
        <li>
          <strong>個別株に集中しない。</strong>1社の失敗が全体に効かないようにする（第1部4章）
        </li>
        <li>
          <strong>レバレッジをかけない。</strong>
          耐える時間を確保するのが長期投資の前提なので、
          期限や強制決済のある仕組みは相性が悪い（第4部31章）
        </li>
      </ul>

      <h2>やってはいけないこと</h2>

      <ul>
        <li>
          <strong>損失を取り返そうとして量を増やす。</strong>
          リスク管理の設計が壊れます
        </li>
        <li>
          <strong>下がったから買い増す（ナンピン）を無計画にやる。</strong>
          あらかじめ計画された分割購入と、
          損を認めたくない買い増しは別物です
        </li>
        <li>
          <strong>1つの銘柄・1つの資産に集中する。</strong>
          読みが当たっている間は最も効率的で、外れた1回で終わります
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>退場の原因は読み違いではなく、1回で立て直せない額を失うこと</li>
        <li>順番は「失ってよい額 → 損切りの位置 → 持てる量」。逆にしない</li>
        <li>損切りを浅くすれば多く持てるが、通常の値動きで引っかかる</li>
        <li>1回あたりを小さく保てば、連敗しても資産は残る</li>
        <li>損切りは逆指値で自分の意思から切り離す</li>
        <li>長期投資では「損切り」ではなく「配分」で同じことをする</li>
      </ul>
    </Chapter>
  );
}
