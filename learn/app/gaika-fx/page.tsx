import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('gaika-fx');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

/** レバレッジ倍率と、必要証拠金に対して何%の変動で全額を失うか */
const LEVERAGES = [1, 5, 10, 25];

export default function Page() {
  return (
    <Chapter slug="gaika-fx" sources={['ffaj-fx', 'fsa-basic', 'jsda-study']}>
      <p>
        外貨に関わる話は2つに分けて考える必要があります。
        <strong>為替リスク</strong>（外貨建ての資産を持つと必ずついてくるもの）と、
        <strong>FX</strong>（為替そのものを対象にした、レバレッジのかかる取引）です。
        前者はほぼ全員に関係し、後者は性質がまったく違います。
      </p>

      <h2>為替リスクは、外国の資産を持つ全員に効く</h2>

      <p>
        外国株式の投資信託を持っているなら、
        すでに為替リスクを取っています。意識していなくてもです。
      </p>

      <div className="example">
        <strong>資産が上がったのに、円では減る</strong>
        1ドル150円のときに、10,000ドルの外国株を買ったとします（150万円）。
        <br />
        1年後、株価が10%上がって11,000ドルになりました。
        しかし為替が1ドル130円になっていたら、円では 11,000 × 130 = 143万円。
        <strong>ドルでは1割増えているのに、円では7万円の損</strong>です。
      </div>

      <p>
        <strong>円高は外貨建て資産にとって逆風、円安は追い風</strong>になります。
        外国の資産を持つとは、その国の資産と為替の両方に賭けているということです。
      </p>

      <h2>為替ヘッジ</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>ヘッジあり</th>
              <th>ヘッジなし</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>為替の影響</th>
              <td>抑えられる</td>
              <td>そのまま受ける</td>
            </tr>
            <tr>
              <th>コスト</th>
              <td>
                <strong>ヘッジコストがかかる</strong>
              </td>
              <td>かからない</td>
            </tr>
            <tr>
              <th>円安のとき</th>
              <td>恩恵を受けられない</td>
              <td>恩恵を受ける</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>ヘッジコストは、2国間の金利差でおおむね決まります。</strong>
        相手国の金利が日本より高いと、その差の分だけコストがかかります。
        金利差が大きい時期にはヘッジコストも大きくなり、
        <strong>為替リスクを消す代わりにリターンが目に見えて削られます</strong>。
        「ヘッジありのほうが安全だから良い」と単純には言えません。
      </p>

      <h2>FXは性質が違う</h2>

      <p>
        FX（外国為替証拠金取引）は、証拠金を預けて
        <strong>その何倍もの金額の為替取引をする</strong>仕組みです。
        国内の個人向けでは<strong>最大25倍</strong>までと定められています。
      </p>

      <Figure
        title="レバレッジ1倍なら為替が100%動かないと証拠金は失われないが、5倍では20%、10倍では10%、25倍ではわずか4%の変動で証拠金が全額失われる"
        caption="倍率が上がるほど、耐えられる変動幅は小さくなります。25倍だと、為替が4%動くだけで預けた額が消えます。"
      >
        <Bars
          unit="%"
          decimals={0}
          max={100}
          rows={LEVERAGES.map((l) => ({
            label: `${l}倍`,
            parts: [{ name: '耐えられる変動', value: 100 / l, tone: 'accent' as const }],
          }))}
        />
        <Legend
          variant="swatch"
          items={[{ name: 'この幅だけ為替が逆に動くと、証拠金を失う', tone: 'accent' }]}
        />
      </Figure>

      <p>
        <strong>為替が1日で2〜3%動くことは珍しくありません。</strong>
        25倍のレバレッジでは、この程度の動きで証拠金の大半が失われます。
      </p>

      <h2>損失が入金額を超える</h2>

      <p>
        株式（現物）の損失は投資した額が上限でした（第2部7章）。
        <strong>FXにはこの上限がありません。</strong>
      </p>

      <ul>
        <li>
          <strong>ロスカット</strong>——損失が一定以上になると強制的に決済される仕組みがあります。
          これが働けば、損失は限定されます
        </li>
        <li>
          <strong>ただし、働かないことがあります。</strong>
          相場が急変して値段が飛ぶと（窓を開ける）、
          ロスカットの水準を超えた値段で決済されます。
          この場合<strong>証拠金を超える損失が発生し、追加で支払う義務が生じます</strong>
        </li>
      </ul>

      <p className="note">
        実際に、主要な通貨で1日に十数%動いた事例があり、
        多数の口座で証拠金を超える損失が発生しています。
        <strong>「ロスカットがあるから入金額以上は損しない」は誤りです。</strong>
      </p>

      <h2>スワップポイント</h2>

      <p>
        2国間の金利差から生じる調整額が<span className="term">スワップポイント</span>です。
        金利の高い通貨を買って低い通貨を売れば受け取れ、逆なら支払います。
      </p>

      <p>
        <strong>「毎日スワップがもらえる」を収益の柱にするのは危険です。</strong>
        受け取れる額は、その通貨が抱えるリスク（インフレ・信用不安）の対価であり、
        <strong>通貨自体の下落でスワップの累計を一気に失うことがあります</strong>。
        高金利通貨が長期的に下落してきた例は珍しくありません。
      </p>

      <h2>税金</h2>

      <ul>
        <li>
          <strong>店頭FX・取引所FXの利益</strong>——申告分離課税20.315%。
          損失は<strong>先物取引に係る雑所得等</strong>の中で通算でき、3年間繰り越せます
        </li>
        <li>
          <strong>株式の損益とは通算できません</strong>（区分が違うため）
        </li>
        <li>
          <strong>外貨預金の為替差益</strong>——雑所得（総合課税）。FXとは扱いが違います
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>外国の資産を持つと、必ず為替リスクがついてくる</li>
        <li>資産が上がっても、円高で円換算では減ることがある</li>
        <li>為替ヘッジはコストがかかる。金利差が大きいほど重い</li>
        <li>FXのレバレッジ25倍では、為替が4%動くと証拠金を失う</li>
        <li>ロスカットは万能ではない。証拠金を超える損失が出ることがある</li>
        <li>スワップポイントはリスクの対価。通貨の下落で一気に失うことがある</li>
      </ul>
    </Chapter>
  );
}
