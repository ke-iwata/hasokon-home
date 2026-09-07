import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';
import { drawdownOf } from '@/lib/calc';

const chapter = chapterBySlug('asset-allocation');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

/** 株式比率と、株式が4割下がったときの全体の下落率 */
const CRASH = 0.4;
const MIXES = [20, 40, 60, 80, 100];

export default function Page() {
  return (
    <Chapter
      slug="asset-allocation"
      sources={['gpif-portfolio', 'markowitz-1952', 'fsa-basic', 'jsda-study']}
    >
      <p>
        <span className="term">アセットアロケーション</span>は、
        資産を種類ごとにどの比率で持つかを決めることです。
        商品選びより先に決めるべきもので、
        <strong>結果に効く度合いもこちらのほうが大きい</strong>とされています。
      </p>

      <h2>なぜ商品選びより先なのか</h2>

      <p>
        第1部2章で見たとおり、<strong>どれだけ減りうるかは、
        値動きする資産をどれだけ持っているかでほぼ決まります</strong>。
        同じ株式ファンドを選んでも、資産の2割で持つのと10割で持つのとでは、
        経験することがまったく違います。
      </p>

      <Figure
        title="株式が4割下落したとき、株式比率が20%なら全体は8%、40%なら16%、60%なら24%、80%なら32%、100%なら40%下がる"
        caption="どのファンドを選ぶかではなく、何%持つかがこの数字を決めます。ここを先に決めるのが順番です。"
      >
        <Bars
          unit="%下落"
          decimals={0}
          max={42}
          rows={MIXES.map((m) => ({
            label: `株式${m}%`,
            parts: [
              { name: '全体の下落', value: drawdownOf(m / 100, CRASH) * 100, tone: 'accent' as const },
            ],
          }))}
        />
        <Legend
          variant="swatch"
          items={[{ name: '株式が4割下がったときの、資産全体の下落率', tone: 'accent' }]}
        />
      </Figure>

      <h2>決め方——目的から逆算する</h2>

      <p>
        配分を決める手順は、次の順番になります。
        <strong>「何%が正解か」を探すのではなく、自分の条件から出す</strong>のが要点です。
      </p>

      <ol>
        <li>
          <strong>いつ使うお金かを確定する。</strong>
          期間が短いほど、値動きする資産の比率は下げます。
          3年以内に使うお金は、そもそも投資に回さない（第1部1章）
        </li>
        <li>
          <strong>いくらまでの下落なら耐えられるかを、金額で決める。</strong>
          「2割まで」ではなく「200万円まで」と考えるほうが現実的です
        </li>
        <li>
          <strong>そこから株式比率を逆算する。</strong>
          上の図のとおり、株式比率 × 想定下落率 が全体の下落幅の目安になります
        </li>
        <li>
          <strong>残りを何で持つかを決める。</strong>
          債券・現金・その他（第2部）
        </li>
      </ol>

      <div className="example">
        <strong>逆算の例</strong>
        資産1,000万円のうち、<strong>下落は最大300万円まで</strong>としたい。
        株式が4割下がる場面を想定するなら、
        <br />
        300万円 ÷ 1,000万円 ÷ 0.4 ＝ <strong>株式比率75%まで</strong>
        <br />
        これが「正解」ではなく、<strong>自分の条件から出た上限</strong>です。
        想定する下落率を5割にすればもっと下がります。
      </div>

      <h2>年齢で決める目安について</h2>

      <p>
        「100 − 年齢％を株式に」という目安がよく紹介されます。
        分かりやすい一方、<strong>年齢だけでは決まらない</strong>ことも確かです。
      </p>

      <ul>
        <li>
          <strong>収入の安定度</strong>——公務員と自営業では、
          同じ年齢でも取れるリスクが違います
        </li>
        <li>
          <strong>他の資産</strong>——持ち家や退職金の見込みがあるか
        </li>
        <li>
          <strong>その資金の用途</strong>——老後資金と、使途未定の余剰資金では違います
        </li>
      </ul>

      <p>
        目安は出発点として使い、
        <strong>上の逆算で自分の数字に直す</strong>のが実務的です。
      </p>

      <h2>細かく分けすぎない</h2>

      <p>
        第1部4章の「分散のやりすぎ」がここにも当てはまります。
      </p>

      <ul>
        <li>
          資産クラスを増やすほど、<strong>リバランスの手間とコストが増えます</strong>（次章）
        </li>
        <li>
          中身が重なっていれば、分けた意味がありません。
          複数のファンドを持っていても組入銘柄が同じなら1つと変わらない
        </li>
        <li>
          <strong>まず「値動きする資産／しない資産」の2つに分けるだけでも、
          リスクの大枠は決まります</strong>
        </li>
      </ul>

      <h2>バランスファンドという選択肢</h2>

      <p>
        あらかじめ複数の資産を組み合わせた投資信託があります。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>自分で組む</th>
              <th>バランスファンド</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>配分の自由度</th>
              <td>高い</td>
              <td>決まっている</td>
            </tr>
            <tr>
              <th>リバランス</th>
              <td>自分でやる</td>
              <td>
                <strong>自動</strong>
              </td>
            </tr>
            <tr>
              <th>リバランス時の課税</th>
              <td>売却益に課税される</td>
              <td>
                <strong>ファンド内なので個人には課税されない</strong>
              </td>
            </tr>
            <tr>
              <th>コスト</th>
              <td>個別に選べる</td>
              <td>やや高めになることが多い</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>リバランスの課税がない点は、見落とされがちですが実質的です。</strong>
        自分で組むと、比率を戻すたびに売却益へ課税されます（次章）。
        バランスファンドはファンドの中で調整するので、
        <strong>個人の課税が起きません</strong>。
        コストの差と、この税の繰り延べを合わせて比べる必要があります。
      </p>

      <h2>決めたら書き留める</h2>

      <p>
        配分は<strong>決めた理由ごと記録しておく</strong>ことをおすすめします。
        相場が動いたときに、
        「なぜこの比率にしたか」を思い出せないと、
        その場の感情で変えてしまいます。
        次章のリバランスは、この記録があってはじめて機能します。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>配分は商品選びより先。減りうる幅は比率でほぼ決まる</li>
        <li>「いくらまでの下落に耐えるか」を金額で決め、そこから比率を逆算する</li>
        <li>年齢の目安は出発点。収入の安定度や他の資産で変わる</li>
        <li>細かく分けすぎない。まず値動きする／しないの2つで大枠が決まる</li>
        <li>バランスファンドはリバランス時に個人へ課税されない利点がある</li>
        <li>決めた比率と理由を書き留めておく</li>
      </ul>
    </Chapter>
  );
}
