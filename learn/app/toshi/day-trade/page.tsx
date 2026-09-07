import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure from '../../_chapter/Figure';
import { Flow, Ladder } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('day-trade');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter
      slug="day-trade"
      sources={['barber-odean-2000', 'barber-2014-daytrade', 'jpx-tosho', 'jsda-study']}
    >
      <p>
        短期売買は、この教科書の他の章とは前提が違います。
        長期投資が「経済が生み出す価値の分け前を待つ」ものだとすれば、
        短期売買は<strong>他の参加者との読み合いで差益を取る</strong>ものです。
        やり方と、研究が示している現実の両方を扱います。
      </p>

      <h2>時間軸で名前が変わる</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>呼び方</th>
              <th>保有期間</th>
              <th>特徴</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>スキャルピング</td>
              <td>数秒〜数分</td>
              <td>小さな値幅を多数回。手数料とスプレッドの影響が最大</td>
            </tr>
            <tr>
              <td>デイトレード</td>
              <td>その日のうちに手仕舞う</td>
              <td>翌日への持ち越しリスクがない</td>
            </tr>
            <tr>
              <td>スイングトレード</td>
              <td>数日〜数週間</td>
              <td>日中は見なくてよい。持ち越しリスクを負う</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>研究が示していること</h2>

      <p className="note">
        <strong>ここは事実として押さえておくべき部分です。</strong>
        短期売買を勧めるのも止めるのもこの教科書の役割ではありませんが、
        <strong>判断材料として、繰り返し確認されている研究結果</strong>は伝えます。
      </p>

      <ul>
        <li>
          <strong>売買が多い個人ほど成績が悪い傾向</strong>——
          バーバーとオディーンは米国の個人投資家の取引記録を分析し、
          <strong>売買回転率の高いグループほど、手数料を差し引いたあとの
          リターンが低い</strong>ことを示しました（1990年代のデータ）。
          論文の題名がそのまま結論になっています
        </li>
        <li>
          <strong>継続的に勝つ人はごく一部</strong>——
          台湾市場のデイトレーダーを長期間追跡した研究では、
          <strong>一貫して利益を出し続けられる層はごく限られる</strong>一方、
          多くは損失を出しながら取引を続けることが報告されています
        </li>
      </ul>

      <p>
        <strong>これは「勝てない」という意味ではありません。</strong>
        勝つ人は実在します。示されているのは
        <strong>平均としては負けに寄る</strong>ということと、
        <strong>取引を増やすほどコストが確実に積み上がる</strong>という関係です。
      </p>

      <h2>コストが構造的に効く</h2>

      <Figure
        title="短期売買では、売買手数料・スプレッド・税金という3つのコストが取引回数に比例して積み上がる。値幅が小さいほど、コストの比率は大きくなる"
        caption="長期投資では1回きりのコストが、短期売買では回数分かかります。値幅が小さいほど、この比率が効いてきます。"
      >
        <Flow
          steps={[
            { label: '売買手数料', sub: '往復でかかる' },
            { label: 'スプレッド', sub: '毎回負担する' },
            { label: '税金', sub: '利益が出るたび' },
          ]}
        />
      </Figure>

      <ul>
        <li>
          <strong>スプレッド</strong>——買った瞬間に含み損から始まります（第4部25章）。
          1日に何度も往復すれば、そのたびに負担します
        </li>
        <li>
          <strong>税の繰り延べが効かない</strong>——長期保有なら売るまで課税されませんが、
          短期売買は<strong>利益確定のたびに課税</strong>されます。
          複利で働くはずの資金が、その都度削られます（第1部3章）
        </li>
        <li>
          <strong>時間</strong>——値動きを見続ける時間そのものがコストです。
          損益に現れませんが、確実に消費しています
        </li>
      </ul>

      <h2>それでもやる場合の作法</h2>

      <p>
        短期売買を選ぶなら、<strong>長期投資とは別の資金・別の口座で</strong>
        管理するのが基本です。混ぜると、
        長期の資金まで短期の判断で動かしてしまいます。
      </p>

      <Figure
        title="短期売買をする場合の手順は、資金を分ける、記録を取る、損切りを先に決める、そして検証する、の4つ"
        caption="どれも取引の腕とは別のところにあります。とくに記録がないと、続けるかどうかの判断ができません。"
      >
        <Ladder
          steps={[
            { label: '① 資金を分ける', sub: '失っても生活が変わらない額に限る' },
            { label: '② 記録を取る', sub: '入った理由・出た理由・結果を毎回' },
            { label: '③ 損切りを先に決める', sub: '入る前に、どこで切るかを決める' },
            { label: '④ 検証する', sub: '記録がないと改善のしようがない', strong: true },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>記録がないものは検証できません。</strong>
        「なんとなく上手くいっている気がする」で続けると、
        負けた取引を忘れて勝った取引だけを覚えます。
        <strong>手数料と税を引いたあとの通算</strong>で見て、
        続けるかどうかを判断する必要があります。
      </p>

      <h2>やってはいけないこと</h2>

      <ul>
        <li>
          <strong>損切りをずらす。</strong>
          決めた水準で切らずに「もう少し待つ」を繰り返すと、
          小さな損が回復不能な損になります（第4部32章）
        </li>
        <li>
          <strong>取り返そうとして枚数を増やす。</strong>
          損失後にリスクを上げるのは、いちばん多い破綻の形です
        </li>
        <li>
          <strong>生活資金や借入で行う。</strong>
          期限のあるお金では、待つという選択肢が消えます
        </li>
        <li>
          <strong>SNSの推奨に乗る。</strong>
          先に買った人が煽って売り抜ける形（第4部34章）が存在します
        </li>
      </ul>

      <h2>制度上の注意</h2>

      <ul>
        <li>
          <strong>NISAは短期売買に向きません。</strong>
          売っても枠の復活は翌年で、その年の投資枠は使い切ってしまいます（第3部18章）
        </li>
        <li>
          <strong>同じ資金で1日に何度も売買すると、
          差金決済の規制に触れることがあります。</strong>
          現物取引では、同じ銘柄を同じ資金で1日に何度も回転させられません
        </li>
        <li>
          <strong>損は繰り越せますが、申告が要ります</strong>（第3部21章）
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>短期売買は他の参加者との読み合い。長期投資とは前提が違う</li>
        <li>研究では、売買回転率が高いほど手数料差引後のリターンが低い傾向が示されている</li>
        <li>継続的に勝つ層はごく一部だが、勝つ人は実在する</li>
        <li>手数料・スプレッド・税が回数分積み上がる。税の繰り延べも効かない</li>
        <li>やるなら資金と口座を分け、損切りを先に決め、記録を取って検証する</li>
        <li>NISAは短期売買に向かない（枠の復活が翌年）</li>
      </ul>
    </Chapter>
  );
}
