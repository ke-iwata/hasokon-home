import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure from '../../_chapter/Figure';
import { Ladder } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('technical');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter
      slug="technical"
      sources={['malkiel-random-walk', 'jsda-study', 'barber-odean-2000']}
    >
      <p>
        テクニカル分析は、<strong>価格と出来高の推移から売買の判断材料を作る</strong>
        方法です。この教科書では
        <strong>「何を計算しているか」と「何を意味しないか」</strong>を扱います。
        個別の売買サインは示しません（売買時期の助言になるため）。
      </p>

      <h2>前提の違い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>ファンダメンタル分析</th>
              <th>テクニカル分析</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>見るもの</th>
              <td>業績・財務・事業環境</td>
              <td>価格・出来高の推移</td>
            </tr>
            <tr>
              <th>前提</th>
              <td>価格はいずれ企業価値に近づく</td>
              <td>
                <strong>価格の動きに繰り返す型がある</strong>
              </td>
            </tr>
            <tr>
              <th>時間軸</th>
              <td>長期</td>
              <td>短期〜中期</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>効率的市場仮説と正面から対立します</strong>（第1部6章）。
        仮説が正しければ、過去の価格から将来を読むことはできません。
        マルキールは著書でテクニカル分析に否定的な立場を取っています。
        <strong>一方で、実務では広く使われています。</strong>
        この対立が解けていないこと自体を、まず知っておいてください。
      </p>

      <h2>移動平均——何を計算しているか</h2>

      <p>
        <span className="term">移動平均</span>は、
        直近n日の終値の平均を毎日計算して線にしたものです。
        日々の細かい上下をならして、方向を見やすくします。
      </p>

      <ul>
        <li>
          <strong>短期（5日・25日など）</strong>——直近の動きに素早く反応する
        </li>
        <li>
          <strong>長期（75日・200日など）</strong>——ゆっくり動く
        </li>
      </ul>

      <p>
        <strong>移動平均は必ず遅れます。</strong>
        過去の平均なので、価格が転換したあとにしか動きません。
        「n日の平均」という定義から避けられない性質で、
        <strong>欠陥ではなく仕様</strong>です。
        だから移動平均だけで転換点を捉えることはできません。
      </p>

      <h2>出来高</h2>

      <p>
        出来高は<strong>どれだけの株数が売買されたか</strong>です。
        価格と違い、<strong>実際に起きたことの量</strong>を表します。
      </p>

      <ul>
        <li>出来高が少ないまま動いた値段は、少数の売買でついた値段です</li>
        <li>板が薄い銘柄では、小さな注文でも価格が動きます（第4部25章）</li>
        <li>
          <strong>出来高が伴わない動きは、成行で売ろうとすると滑ります。</strong>
          これは解釈ではなく、板の構造から来る事実です
        </li>
      </ul>

      <h2>オシレーター系</h2>

      <p>
        RSIやストキャスティクスなど、
        <strong>値動きの勢いを0〜100などの範囲に収めて表す</strong>指標があります。
        「買われすぎ・売られすぎ」の目安として使われます。
      </p>

      <p className="note">
        <strong>「買われすぎ」は「下がる」を意味しません。</strong>
        強いトレンドが出ているときは、
        買われすぎの状態のまま上がり続けることがあります。
        指標が示しているのは<strong>過去n日と比べた相対的な位置</strong>であって、
        将来の方向ではありません。
      </p>

      <h2>テクニカル分析の限界</h2>

      <Figure
        title="テクニカル分析には、過去のデータにしか基づかない、後知恵で当てはめてしまう、多数の指標から都合の良いものを選んでしまう、という3つの限界がある"
        caption="どれも指標そのものの欠陥ではなく、使う側で起きる問題です。だから自覚しておく以外に対処法がありません。"
      >
        <Ladder
          steps={[
            {
              label: '遅行性',
              sub: '過去の価格から計算するので、必ず後追いになる',
            },
            {
              label: '後知恵バイアス',
              sub: 'チャートを見返すと、当たった場面ばかりが目につく',
            },
            {
              label: '多重比較の罠',
              sub: '指標も期間設定も無数にある。どれかは必ず当てはまる',
              strong: true,
            },
          ]}
        />
      </Figure>

      <p>
        <strong>3つ目がいちばん厄介です。</strong>
        指標の種類とパラメータの組み合わせは事実上無限にあるので、
        <strong>過去のデータに当てはまる組み合わせは必ず見つかります</strong>。
        それが将来も働くかどうかは別の問題です。
        「過去の相場で検証したら勝てた」という話は、
        この点を確かめないと意味がありません。
      </p>

      <h2>使うなら</h2>

      <ul>
        <li>
          <strong>予測ではなく、ルール化の道具として使う。</strong>
          「この水準を割ったら切る」という<strong>損切りの基準</strong>を
          あらかじめ決めるために使うなら、判断のブレを減らせます（次章）
        </li>
        <li>
          <strong>指標を増やさない。</strong>
          複数の指標が食い違ったとき、
          都合の良いほうを採用してしまいます
        </li>
        <li>
          <strong>記録して検証する。</strong>
          第4部29章のとおり、記録がないものは検証できません
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>テクニカル分析は価格と出来高から材料を作る方法。効率的市場仮説とは対立する</li>
        <li>移動平均は定義上必ず遅れる。これは仕様であって欠陥ではない</li>
        <li>出来高が伴わない値動きは、売るときに滑る</li>
        <li>「買われすぎ」は「下がる」を意味しない。過去との相対的な位置を示すだけ</li>
        <li>指標もパラメータも無数にあるので、過去に当てはまるものは必ず見つかる</li>
        <li>予測の道具としてより、損切り基準のルール化として使うほうが確実</li>
      </ul>
    </Chapter>
  );
}
