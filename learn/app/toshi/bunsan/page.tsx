import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure, { Bars, Legend } from '../../_chapter/Figure';
import { Ladder } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('bunsan');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/**
 * GPIF（年金積立金管理運用独立行政法人）の基本ポートフォリオ。
 * 【データ更新箇所】見直しがあったら差し替える。出典は末尾の参考文献
 */
const GPIF = [
  { name: '国内債券', ratio: 25 },
  { name: '外国債券', ratio: 25 },
  { name: '国内株式', ratio: 25 },
  { name: '外国株式', ratio: 25 },
];

export default function Page() {
  return (
    <Chapter
      slug="bunsan"
      sources={['fsa-basic', 'gpif-portfolio', 'markowitz-1952', 'jsda-study']}
    >
      <p>
        「卵を一つのカゴに盛るな」は投資でいちばん有名な言い回しですが、
        なぜそれが効くのかまで説明されることは多くありません。
        <strong>分散は、リターンを下げずにリスクだけを下げられる数少ない手段</strong>です。
        効く理由と、効かない範囲を分けて押さえます。
      </p>

      <h2>なぜ分散でリスクが下がるのか</h2>

      <p>
        鍵は<span className="term">相関</span>——値動きが揃うかどうかです。
      </p>

      <ul>
        <li>
          <strong>同じ方向に動くもの（相関が高い）</strong>を並べても、分散になりません。
          同じ業種の株を10社持つのは、10社ぶんではなく実質1社ぶんに近い
        </li>
        <li>
          <strong>違う動きをするもの（相関が低い）</strong>を組み合わせると、
          片方が下がったときにもう片方が支えます。
          全体の振れ幅は、それぞれの振れ幅を単純に足したものより小さくなる
        </li>
      </ul>

      <p>
        <strong>これは気休めではなく数学的な性質です。</strong>
        相関が1未満の資産を組み合わせると、
        組み合わせ全体のリスクは各資産のリスクの加重平均より必ず小さくなります。
        マーコウィッツが1952年に定式化した内容で、
        現代の資産配分の考え方はここから来ています。
      </p>

      <h2>消せるリスクと、消せないリスク</h2>

      <Figure
        title="リスクは2つに分かれる。個別の会社の事情による部分は分散で消せるが、市場全体が下がる部分は分散では消せない"
        caption="分散で消せるのは上の段だけです。下の段は残るので、どれだけ分散しても市場全体の下落は避けられません。"
      >
        <Ladder
          steps={[
            {
              label: '個別リスク（分散で消せる）',
              sub: '不祥事・製品の失敗・経営者の交代など、その会社だけの事情',
            },
            {
              label: '市場リスク（分散では消せない）',
              sub: '景気後退・金利・戦争など、市場全体を動かすもの',
              strong: true,
            },
          ]}
        />
      </Figure>

      <p>
        銘柄を増やしていくと個別リスクは減っていきますが、
        <strong>市場リスクは何銘柄持っても残ります</strong>。
        「分散しているから下がらない」は誤りで、
        正しくは「分散しているから、1社の失敗で全部を失うことはない」です。
      </p>

      <h2>分散には4つの向きがある</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>向き</th>
              <th>中身</th>
              <th>効くもの</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>銘柄の分散</td>
              <td>1社に集中しない</td>
              <td>個別リスク</td>
            </tr>
            <tr>
              <td>資産の分散</td>
              <td>株式だけでなく債券なども持つ</td>
              <td>ひとつの資産クラス固有の下落</td>
            </tr>
            <tr>
              <td>地域の分散</td>
              <td>1つの国に集中しない</td>
              <td>その国の景気・政治・為替</td>
            </tr>
            <tr>
              <td>時間の分散</td>
              <td>買う時期を分ける</td>
              <td>高値でまとめて買ってしまうこと</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>時間の分散だけは性質が違います。</strong>
        他の3つはリスクそのものを減らしますが、時間の分散は
        「たまたま最悪の日に全額を投じてしまう」ことを避けるだけで、
        期待リターンをむしろ下げる場合があります（投資に回っていない期間ができるため）。
        詳しくは第4部26章「積立とドルコスト平均法」で扱います。
      </p>

      <h2>実例：公的年金の資産配分</h2>

      <p>
        分散の具体例として引きやすいのが、日本の公的年金を運用しているGPIFの
        <span className="term">基本ポートフォリオ</span>です。
        方針が公開されていて、誰でも中身を確かめられます。
      </p>

      <Figure
        title="GPIFの基本ポートフォリオは、国内債券・外国債券・国内株式・外国株式をそれぞれ25%ずつ持つ配分"
        caption="債券と株式で半々、国内と海外で半々。資産の分散と地域の分散を同時にかけた形です。"
      >
        <Bars
          unit="%"
          decimals={0}
          max={100}
          rows={GPIF.map((a) => ({
            label: a.name,
            parts: [{ name: a.name, value: a.ratio, tone: 'accent' as const }],
          }))}
        />
        <Legend variant="swatch" items={[{ name: '基本ポートフォリオの比率', tone: 'accent' }]} />
      </Figure>

      <p>
        <strong>これを真似すべきという話ではありません。</strong>
        GPIFは公的年金という目的と時間軸で組んでいて、個人の事情とは違います。
        ここで見てほしいのは配分そのものではなく、
        <strong>巨額の資金を長期で運用する主体が、
        4つに分けるという素朴な形を選んでいる</strong>という事実のほうです。
      </p>

      <h2>分散のやりすぎ</h2>

      <p>
        分散は無料ではありません。
      </p>

      <ul>
        <li>
          商品を増やすほど<strong>管理と把握が難しくなり</strong>、
          リバランス（第4部28章）の手間とコストが増えます
        </li>
        <li>
          中身が重なっていることがあります。
          複数の投資信託を持っていても、
          <strong>組入銘柄が同じなら分散になっていません</strong>
        </li>
        <li>
          個別リスクは、ある程度の数を超えると<strong>減り方が鈍ります</strong>。
          数を増やし続けても効果は頭打ちになる
        </li>
      </ul>

      <p>
        商品の数ではなく、<strong>中身が違う方向を向いているか</strong>で判断します。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>分散が効くのは、値動きが揃っていない（相関が低い）ものを組み合わせるから</li>
        <li>消せるのは個別リスクだけ。市場リスクは何銘柄持っても残る</li>
        <li>向きは銘柄・資産・地域・時間の4つ。時間の分散だけ性質が違う</li>
        <li>商品の数ではなく、中身が重なっていないかで判断する</li>
      </ul>
    </Chapter>
  );
}
