import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Flow } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('reit');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="reit" sources={['toushin-reit', 'jpx-tosho', 'toushin-basic']}>
      <p>
        REIT（不動産投資信託）は、<strong>不動産を小口に分けて持つ仕組み</strong>です。
        日本の上場REITはJ-REITと呼ばれ、株式と同じように取引所で売買できます。
        現物の不動産投資（第2部15章）とは、性質がかなり違います。
      </p>

      <h2>お金の流れ</h2>

      <Figure
        title="投資家がREITに出資し、REITがオフィスビルや商業施設を保有して賃料を受け取り、その大部分を分配金として投資家に配る"
        caption="リターンの源泉は賃料です。誰かが賃料を払っているから分配金が出る、という関係を押さえておくと、次の話が分かりやすくなります。"
      >
        <Flow
          steps={[
            { label: '投資家', sub: '出資する' },
            { label: 'REIT', sub: '不動産を保有・賃貸' },
            { label: 'テナント', sub: '賃料を払う' },
          ]}
        />
      </Figure>

      <h2>分配金が高めになりやすい理由</h2>

      <p>
        J-REITの分配金利回りは、株式の配当利回りより高めになる傾向があります。
        これは運用がうまいからではなく、<strong>税制の仕組み</strong>によるものです。
      </p>

      <div className="example">
        <strong>導管性の要件</strong>
        REITは、<strong>利益の90%超を分配する</strong>などの要件を満たすと、
        分配金を損金に算入でき、法人税が実質的にかかりません。
        <br />
        普通の会社なら法人税を払ったあとの利益から配当しますが、
        REITはその段階を飛ばせます。だから<strong>利益がほぼそのまま分配に回る</strong>のです。
        <br />
        裏を返すと、<strong>内部に利益を貯めて再投資する余地がほとんどありません</strong>。
        成長するには増資や借入が必要になります。
      </div>

      <h2>REITのリスク</h2>

      <ul>
        <li>
          <strong>金利上昇</strong>——REITは借入を使って物件を買っています。
          金利が上がると利払いが増え、分配金を圧迫します。
          さらに、分配金利回りの魅力が債券に比べて相対的に下がるため、
          価格も下がりやすくなります。<strong>金利に二重に効かれます</strong>
        </li>
        <li>
          <strong>空室・賃料下落</strong>——テナントが抜ければ賃料が入りません。
          用途（オフィス・商業・住宅・物流・ホテル）によって景気への反応が違います
        </li>
        <li>
          <strong>災害</strong>——保有物件が被災すると直接影響します
        </li>
        <li>
          <strong>増資による希薄化</strong>——物件を買うために新しく口数を発行すると、
          1口あたりの取り分が薄まることがあります
        </li>
      </ul>

      <p className="note">
        <strong>「REITは不動産だから株式と違う動きをする」とは限りません。</strong>
        REITは取引所で売買されるので、市場全体が売られる局面では
        株式と一緒に下がることがよくあります。
        分散のつもりで入れても、期待したほど相関が低くない場合があります
        （第1部4章）。
      </p>

      <h2>税金が株式と違う</h2>

      <p>
        J-REITの分配金には、株式の配当と違う点があります。
      </p>

      <ul>
        <li>
          税率は同じ<strong>20.315%</strong>
        </li>
        <li>
          しかし<strong>配当控除は使えません</strong>。
          REITは法人税を払っていないため、二重課税の調整が不要だからです
        </li>
        <li>
          NISAの成長投資枠では買えます（第3部18章）
        </li>
      </ul>

      <h2>現物の不動産投資との違い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>J-REIT</th>
              <th>現物不動産</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>最低金額</th>
              <td>数万円から</td>
              <td>数百万〜数千万円</td>
            </tr>
            <tr>
              <th>売却</th>
              <td>取引時間中ならすぐ売れる</td>
              <td>買い手を探す。数ヶ月かかることも</td>
            </tr>
            <tr>
              <th>分散</th>
              <td>1口で複数物件に分散される</td>
              <td>1物件に集中する</td>
            </tr>
            <tr>
              <th>手間</th>
              <td>不要</td>
              <td>管理・修繕・入居者対応</td>
            </tr>
            <tr>
              <th>レバレッジ</th>
              <td>個人ではかけない</td>
              <td>ローンでかけられる</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>まとめ</h2>

      <ul>
        <li>REITは不動産を小口で持つ仕組み。リターンの源泉は賃料</li>
        <li>分配金が高めなのは税制（導管性）のため。内部留保がほぼできない裏返し</li>
        <li>金利上昇は利払い増と価格下落の両方で効く</li>
        <li>取引所で売買されるので、株式と一緒に下がることがある</li>
        <li>配当控除は使えない</li>
        <li>現物不動産と比べ、少額・流動性・分散で有利、レバレッジは使えない</li>
      </ul>
    </Chapter>
  );
}
