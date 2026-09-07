import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('fudosan');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

/** 自己資金1,000万円で、借入を足して物件を買った場合の総投資額 */
const OWN = 1000;
const CASES = [
  { label: '借入なし', loan: 0 },
  { label: '借入1倍', loan: 1000 },
  { label: '借入3倍', loan: 3000 },
];
/** 物件価格が1割下がったときの自己資金の目減り率 */
const FALL = 0.1;

export default function Page() {
  return (
    <Chapter slug="fudosan" sources={['mlit-fudosan', 'fsa-basic', 'toushin-reit']}>
      <p>
        現物の不動産投資は、これまでの章の資産と運用の性格が違います。
        <strong>金融商品を買うというより、事業を始めることに近い</strong>からです。
        物件を選び、資金を借り、人に貸し、修繕し、いずれ売る。
        REIT（第2部11章）が「不動産に投資する」ものだとすれば、
        現物は「不動産業をやる」ものです。
      </p>

      <h2>収益の2つの出どころ</h2>

      <ul>
        <li>
          <strong>インカムゲイン</strong>——家賃収入から、
          ローン返済・管理費・修繕費・税金・保険を引いた残り
        </li>
        <li>
          <strong>キャピタルゲイン</strong>——売却時に、
          買った値段（＋諸費用）より高く売れた分
        </li>
      </ul>

      <p>
        表面利回り（年間家賃 ÷ 物件価格）はよく使われますが、
        <strong>ここから引かれるものが多すぎて、そのままでは判断に使えません</strong>。
        管理費・修繕積立金・固定資産税・保険料・管理会社への手数料・
        空室期間・原状回復費・仲介手数料を引いたあとが実際の手残りです。
      </p>

      <h2>レバレッジ——現物の最大の特徴</h2>

      <p>
        現物不動産が他の資産と大きく違うのは、
        <strong>個人でもローンを組んで、自己資金の何倍もの資産を持てる</strong>点です。
        これは増える側にも減る側にも効きます。
      </p>

      <Figure
        title="自己資金1,000万円に借入を足すと、借入なしなら1,000万円、1倍なら2,000万円、3倍なら4,000万円の物件を持てる。物件が1割下がると自己資金はそれぞれ10%・20%・40%目減りする"
        caption="持てる資産は増えますが、価格が下がったときに自己資金が削られる速さも同じ倍率で上がります。"
      >
        <Bars
          unit="万円"
          decimals={0}
          max={4200}
          rows={CASES.map((c) => ({
            label: c.label,
            parts: [
              { name: '自己資金', value: OWN, tone: 'accent' as const },
              { name: '借入', value: c.loan, tone: 'muted' as const },
            ],
          }))}
        />
        <Legend
          variant="swatch"
          items={[
            { name: '自己資金', tone: 'accent' },
            { name: '借入', tone: 'muted' },
          ]}
        />
      </Figure>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>借入</th>
              <th>物件価格</th>
              <th>1割下落したときの自己資金の目減り</th>
            </tr>
          </thead>
          <tbody>
            {CASES.map((c) => {
              const total = OWN + c.loan;
              const loss = total * FALL;
              return (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="num">{total.toLocaleString('ja-JP')}万円</td>
                  <td className="num">
                    −{loss.toLocaleString('ja-JP')}万円（{Math.round((loss / OWN) * 100)}%）
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>借入が3倍なら、物件が1割下がるだけで自己資金は4割減ります。</strong>
        しかもローンの残債は減りません。
        物件価格が残債を下回ると、<strong>売っても借金が残る</strong>状態になります。
        これは第2部7章で見た「株式の損失は投資額が上限」とは違う世界です。
      </p>

      <h2>現物固有のリスク</h2>

      <ul>
        <li>
          <strong>空室。</strong>1室だけ持っている場合、入居率は0%か100%しかありません。
          分散が効かない典型です（第1部4章）
        </li>
        <li>
          <strong>流動性がない。</strong>売りたいときにすぐ売れません。
          買い手を探し、価格交渉をし、決済まで数ヶ月かかることがあります
        </li>
        <li>
          <strong>修繕。</strong>給湯器・エアコン・屋根・外壁。
          突発的に数十万円単位の支出が発生します
        </li>
        <li>
          <strong>金利上昇。</strong>変動金利で借りている場合、返済額が増えます
        </li>
        <li>
          <strong>災害。</strong>1物件に集中しているので、被災が直撃します
        </li>
        <li>
          <strong>手間。</strong>入居者対応・管理会社とのやりとり・確定申告
        </li>
      </ul>

      <h2>税金</h2>

      <ul>
        <li>
          <strong>家賃収入</strong>——不動産所得。総合課税で、他の所得と合算されます
        </li>
        <li>
          <strong>減価償却</strong>——建物部分を耐用年数で費用計上します。
          現金は出ていかないのに費用になるため、帳簿上の利益を圧縮できます。
          ただし<strong>売却時の取得費が下がるので、売却益が増えます</strong>。
          税が消えるのではなく、先送りされる面があります
        </li>
        <li>
          <strong>売却益</strong>——譲渡所得。
          <strong>保有5年以下（短期）と5年超（長期）で税率が大きく変わります</strong>
        </li>
      </ul>

      <p className="note">
        <strong>「不動産で節税」という勧誘には注意が必要です。</strong>
        赤字を給与所得と損益通算して所得税を減らす、という説明がありますが、
        <strong>それは実際に赤字が出ているということ</strong>です。
        節税額より赤字額のほうが大きければ、単に損をしています。
        金融庁・消費者庁が投資用不動産の勧誘について注意喚起を出しています。
      </p>

      <h2>REITとの使い分け</h2>

      <p>
        第2部11章の表を逆から見ると、現物を選ぶ理由がはっきりします。
      </p>

      <ul>
        <li>
          <strong>レバレッジをかけたい</strong>——REITでは個人はできません
        </li>
        <li>
          <strong>自分で価値を上げたい</strong>——
          リフォームや運営の工夫が結果に反映されます。これは事業の側面です
        </li>
        <li>
          <strong>相続対策</strong>——現物不動産は相続税評価額が時価より低くなることがあります
        </li>
      </ul>

      <p>
        逆に、<strong>ただ「不動産に投資したい」だけならREITのほうが素直</strong>です。
        少額で、複数物件に分散され、いつでも売れて、手間がかかりません。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>現物不動産は金融商品というより事業に近い</li>
        <li>表面利回りから引かれるものが多い。手残りで判断する</li>
        <li>レバレッジは増減の両方に効く。借入3倍なら1割下落で自己資金は4割減る</li>
        <li>売っても借金が残ることがある。株式の現物とは違う</li>
        <li>1物件では空室リスクの分散が効かない。流動性も低い</li>
        <li>減価償却は税を消すのではなく、売却時に持ち越す面がある</li>
        <li>手間とレバレッジと相続を求めないなら、REITのほうが素直</li>
      </ul>
    </Chapter>
  );
}
