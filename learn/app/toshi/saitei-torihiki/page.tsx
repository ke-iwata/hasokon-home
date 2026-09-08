import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Bars, Legend } from '../../_chapter/Figure';
import { Flow, Timeline } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';
import { afterTax, arbitrageNet, arbitrageSteps } from '@/lib/calc';

const chapter = chapterBySlug('saitei-torihiki');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/**
 * 「A取引所で1%安く買えるように見える」場面。
 * **数字は1か所（ここ）から出して、表も図も本文もこれを読む。**
 * 手打ちすると片方だけ直す事故が起きる（learn/CLAUDE.md）。
 */
const GAP = 1.0;
const COSTS = [
  { label: '買うときの手数料', percent: 0.1 },
  { label: '売るときの手数料', percent: 0.1 },
  { label: '送金の手数料', percent: 0.05 },
  { label: '板が薄いぶんの滑り（往復）', percent: 0.4 },
];
const STEPS = arbitrageSteps(GAP, COSTS);
const NET = arbitrageNet(GAP, COSTS);
/** 所得の多い人だと、住民税と合わせて55%に近づく（第3部22章） */
const TAX_RATE = 43;
const NET_AFTER_TAX = afterTax(NET, TAX_RATE);

const pct = (v: number) => `${v.toFixed(2)}%`;

export default function Page() {
  return (
    <Chapter
      slug="saitei-torihiki"
      sources={['fsa-crypto', 'fsa-warning', 'nta-crypto', 'jpx-derivative', 'fsa-kaisei-2026']}
    >
      <p>
        同じものが2つの場所で違う値段になっているなら、
        安いほうで買って高いほうで売れば差額が残る——
        これが裁定取引（アービトラージ）の考え方です。
        値上がりを当てる必要がないので、
        <strong>理屈の上ではリスクなしに見えます</strong>。
      </p>

      <p>
        暗号資産の話でよく出てくるのは、取引所が分断されていて
        価格差が目に見えるからです。この章で扱うのは
        <strong>「その差が、なぜ手元に残らないのか」</strong>のほうです。
        差の大きさより、差を削るものを数えられることが役に立ちます。
      </p>

      <h2>3つの型</h2>

      <Figure
        title="裁定取引の代表的な3つの型。取引所をまたぐもの、現物と先物の差を取るもの、3つの通貨を一周するもの"
        caption="どれも「同じものに2つの値段が付いている」ことを利用する点は同じです。"
      >
        <Flow
          steps={[
            {
              label: '取引所をまたぐ',
              sub: 'A取引所で安く買い、B取引所で高く売る',
            },
            {
              label: '現物と先物',
              sub: '先物が現物より高いとき、現物を買って先物を売る',
            },
            {
              label: '3つを一周する',
              sub: '円→A→B→円と交換して、戻ったときに増えていれば取る',
            },
          ]}
        />
      </Figure>

      <p>
        2つめは株式や商品でも古くからあるもので、
        差の正体は<strong>持ち続ける費用と金利</strong>です（第2部17章）。
        差があること自体は異常ではなく、
        <strong>費用に見合った差なら、それは価格差ではなく対価</strong>です。
      </p>

      <h2>1%の差を、順に削っていく</h2>

      <p>
        取引所をまたぐ例で数えます。
        <strong>見えている差が{pct(GAP)}</strong>あったとして、
        実際にかかるものを順に引いていきます。前提は
        「税・為替は後で考える」「注文はすべて通る」です。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>引かれるもの</th>
              <th>大きさ</th>
              <th>残り</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>見えている価格差</th>
              <td>—</td>
              <td>{pct(GAP)}</td>
            </tr>
            {STEPS.map((s) => (
              <tr key={s.label}>
                <th>{s.label}</th>
                <td>−{pct(s.percent)}</td>
                <td>{s.rest <= 0 ? <strong>{pct(s.rest)}</strong> : pct(s.rest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Figure
        title="見えている価格差1%が、往復の手数料と送金料と板の滑りで削られ、手元にはほとんど残らないことを示した棒グラフ"
        caption="いちばん大きいのは手数料ではなく、板が薄いぶんの滑りです。見えている価格で全量が約定するとはかぎりません。"
      >
        <Bars
          unit="%"
          decimals={2}
          max={GAP}
          rows={[
            {
              label: '見える差',
              parts: [{ value: GAP, tone: 'accent', name: '価格差' }],
            },
            {
              label: '手数料後',
              parts: [{ value: Math.max(STEPS[2].rest, 0), tone: 'soft', name: '手数料を引いた残り' }],
            },
            {
              label: '滑り後',
              parts: [{ value: Math.max(NET, 0), tone: 'muted', name: '手残り' }],
            },
          ]}
        />
        <Legend
          variant="swatch"
          items={[
            { name: '見えている価格差', tone: 'accent' },
            { name: '手数料を引いた残り', tone: 'soft' },
            { name: '実際の手残り', tone: 'muted' },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>この例では手残りが{pct(NET)}です。</strong>
        {NET <= 0
          ? 'つまり、差が1%見えていても赤字になります。'
          : '差の大部分が費用で消えます。'}
        数字は前提の置き方で変わりますが、
        <strong>順番に引いていくと残りが急速に小さくなる</strong>という形は変わりません。
      </p>

      <h2>削るものは、費用だけではない</h2>

      <h3>送金にかかる時間</h3>

      <p>
        取引所をまたぐには、資産を動かすか、両方にあらかじめ置いておく必要があります。
        動かす場合、<strong>着くまでの間に価格差は消えているかもしれません</strong>。
        混んでいるときほど時間がかかり、混んでいるときほど価格差は大きく出ます。
      </p>

      <Figure
        title="送金して裁定しようとすると、買った時点と売れる時点の間に時間が空き、その間に価格差が消えることがある"
        caption="価格差が大きいときは、たいてい送金も混んでいます。差が大きいほど取りやすい、とはなりません。"
      >
        <Timeline
          items={[
            { date: '0分', label: '気づく', sub: '差は1%' },
            { date: '+1分', label: '買う', sub: '資金が拘束' },
            { date: '+15分', label: '送金', sub: '混むと延びる' },
            { date: '+16分', label: '売る', sub: '差は残るか', mark: 'ng' },
          ]}
        />
      </Figure>

      <h3>出せるとはかぎらない</h3>

      <p>
        価格差が長く残っている場所には、たいてい理由があります。
        <strong>そこから資金を出せない</strong>のが典型です。
        出金の停止、通貨ごとの引き出し制限、本人確認の未了、
        その国の規制で参加できないこと。
        <strong>誰でも取れる差なら、とっくに埋まっています。</strong>
      </p>

      <h3>相手が飛ぶ危険</h3>

      <p>
        両側に資金を置いておく方法なら送金時間の問題は避けられますが、
        今度は<strong>置いた資金が置いた先の信用に晒されます</strong>。
        暗号資産の取引所には投資者保護基金がありません（第2部14章）。
        破綻や凍結が起きれば、価格差どころか元本が戻りません。
      </p>

      <h3>税が、勝ち負けを非対称にする</h3>

      <p>
        日本では、暗号資産の利益はいまのところ雑所得・総合課税です。
        <strong>暗号資産どうしの交換でも、その時点で損益が実現したものとして扱われます。</strong>
        往復すれば、その各段階が課税の対象になります。
      </p>

      <div className="table-wrap">
        <table>
          <tbody>
            <tr>
              <th>費用を引いた手残り</th>
              <td>{pct(NET)}</td>
            </tr>
            <tr>
              <th>税引き後（税率{TAX_RATE}%とした場合）</th>
              <td>
                <strong>{pct(NET_AFTER_TAX)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>勝ったときは税で削られ、負けたときは誰も補ってくれません。</strong>
        暗号資産の損は給与や株式の利益と通算できず、翌年に繰り越すこともできません。
        <strong>この扱いは改正で変わります。</strong>
        20%の申告分離課税と3年の繰越控除を導入する方針が
        令和8年度税制改正の大綱に盛り込まれましたが、
        適用が始まるのは金融商品取引法の改正法が施行された年の翌年1月1日からで、
        <strong>まだ始まっていません</strong>（第3部22章）。
      </p>

      <h2>「自動化すれば取れる」のか</h2>

      <p>
        削るものを全部数えたうえで、なお差が残る場面はあります。
        ただしそこは<strong>速さの勝負</strong>になります。
        同じ差を狙っているのは、専用の回線と機械を持ち、
        取引所に手数料を優遇されている専業の相手です。
      </p>

      <p>
        構図は第4部29章で見た短期売買の研究と同じです。
        <strong>勝つ人が実在することと、自分がその側に入れることは別</strong>です。
        自動化は費用（開発・監視・障害対応）を先に増やし、
        止まったときの損失も自動で膨らみます。
      </p>

      <h2>それでも、この考え方は役に立つ</h2>

      <p>
        自分で実行しないとしても、
        <strong>「なぜ差が埋まらないのか」を問う癖</strong>は効きます。
      </p>

      <ul>
        <li>
          <strong>うまい話を見分ける物差しになる。</strong>
          「他所より高い利回りを確実に出せる」という説明を受けたら、
          <strong>その差が埋まらない理由</strong>を聞けばよい。
          答えられないなら、埋まらないのではなく取れないのです（第4部34章）
        </li>
        <li>
          <strong>手数料の見方が変わる。</strong>
          {pct(GAP)}の差が費用で消えるということは、
          長期の運用でも同じ順序で効いているということです（第1部5章）
        </li>
        <li>
          <strong>板を見る意味が分かる。</strong>
          見えている価格は「ごく一部に付いた値段」であって、
          自分が出す量で成立する値段ではありません（第4部25章）
        </li>
      </ul>

      <p className="note">
        <strong>海外の無登録業者を使うのは、別のリスクを足す行為です。</strong>
        国内で暗号資産の取引を扱うには金融庁の登録が要り、
        無登録業者の名称は金融庁が公表しています。
        2026年に成立した改正法では、暗号資産取引にインサイダー取引規制を新設するなど
        不公正取引の規制も強められます（施行日は政令で定められます）。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>裁定取引は「同じものに2つの値段」を取る考え方。値上がりを当てる必要がない</li>
        <li>
          見えている差{pct(GAP)}は、往復の手数料・送金料・板の滑りを引くと{pct(NET)}になる。
          さらに税が乗る
        </li>
        <li>送金の時間、出金の制限、取引所の破綻という、費用に現れないものが残っている</li>
        <li>差が長く残っている場所には、たいてい「取れない理由」がある</li>
        <li>実行しなくても、「なぜ差が埋まらないのか」を問う癖は、うまい話を見分けるのに効く</li>
      </ul>
    </Chapter>
  );
}
