import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Flow } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('koza-kaisetsu');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="koza-kaisetsu" sources={['fsa-basic', 'jsda-study', 'fsa-warning']}>
      <p>
        ここから実践編です。まず口座を開くところから。
        <strong>具体的な証券会社名はこの教科書では挙げません</strong>が、
        何を基準に比べればよいかは書けます。
      </p>

      <h2>最初に確認すること——登録業者かどうか</h2>

      <p>
        比較の前に、<strong>金融商品取引業者として登録されているか</strong>を確かめます。
        これは好みの問題ではなく、安全の前提です。
      </p>

      <ul>
        <li>
          金融庁が<strong>免許・許可・登録等を受けている業者の一覧</strong>を公表しています
        </li>
        <li>
          同時に<strong>無登録で金融商品取引業を行う者の名称</strong>も公表しています。
          ここに載っている先とは取引しないでください
        </li>
        <li>
          SNSやマッチングアプリで勧誘された取引所・アプリは、
          <strong>まずこの2つを確認する</strong>（第4部34章）
        </li>
      </ul>

      <h2>比べる観点</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>観点</th>
              <th>見るところ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>手数料</td>
              <td>
                株式の売買手数料、投資信託の購入時手数料、
                <strong>外国株なら為替手数料</strong>
              </td>
            </tr>
            <tr>
              <td>取扱商品</td>
              <td>買いたいものがあるか。外国株・ETF・債券の品揃えは差が出やすい</td>
            </tr>
            <tr>
              <td>NISAの対応</td>
              <td>つみたて投資枠の対象商品数、クレジットカード積立の可否</td>
            </tr>
            <tr>
              <td>iDeCoの運営管理手数料</td>
              <td>
                <strong>ここは金融機関で差がある</strong>（第3部19章）
              </td>
            </tr>
            <tr>
              <td>使い勝手</td>
              <td>アプリの見やすさ、注文の出しやすさ、約定通知</td>
            </tr>
            <tr>
              <td>入出金</td>
              <td>提携銀行、即時入金の可否、出金手数料</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>NISA口座は1人1つ、金融機関の変更は年単位です</strong>（第3部18章）。
        特定口座は複数の証券会社に持てますが、
        NISAはどこか1社を選ぶことになります。
        <strong>NISAで買いたい商品を扱っているか</strong>が、実質的にいちばん効く基準です。
      </p>

      <h2>開設の流れ</h2>

      <Figure
        title="口座開設は、申し込み、本人確認書類とマイナンバーの提出、審査、口座開設完了の順に進む。オンラインなら数日で終わることが多い"
        caption="マイナンバーの提出は法律上必須です。用意しておくと途中で止まりません。"
      >
        <Flow
          steps={[
            { label: '申し込み', sub: '氏名・住所・職業など' },
            { label: '本人確認', sub: '書類とマイナンバー' },
            { label: '審査', sub: '数日かかる' },
            { label: '開設完了', sub: 'ログイン情報が届く' },
          ]}
        />
      </Figure>

      <h2>申し込みで聞かれること</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>項目</th>
              <th>意味</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>口座の種類</strong>
              </td>
              <td>
                特定口座（源泉徴収あり）が無難（第3部20章）
              </td>
            </tr>
            <tr>
              <td>
                <strong>NISA口座を同時に開くか</strong>
              </td>
              <td>開くなら同時申込が楽。あとからでも開ける</td>
            </tr>
            <tr>
              <td>投資経験・年収・資産</td>
              <td>
                適合性の原則にもとづく確認。
                <strong>正確に答える</strong>（虚偽の申告は自分の保護を外すことになる）
              </td>
            </tr>
            <tr>
              <td>インサイダー登録</td>
              <td>上場企業に勤めている場合など。該当するなら必ず申告する</td>
            </tr>
            <tr>
              <td>配当金の受取方法</td>
              <td>
                <strong>NISAで配当を非課税にするには「株式数比例配分方式」が必要</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>配当金の受取方法は見落としやすい設定です。</strong>
        NISA口座で株やETFを持っていても、
        受取方法が「配当金領収証方式」などになっていると、
        <strong>配当が課税されてしまいます</strong>。
        証券口座で受け取る「株式数比例配分方式」を選んでおく必要があります。
      </p>

      <h2>最初にやること・やらないこと</h2>

      <ul>
        <li>
          <strong>やること：</strong>少額で1回、実際に買って売ってみる。
          注文画面の見え方、約定の確認、手数料の引かれ方を、
          金額が小さいうちに把握しておく
        </li>
        <li>
          <strong>やらないこと：</strong>いきなり全額を入れる。
          第1部2章のとおり、下落に耐えられるかは経験するまで分かりません
        </li>
        <li>
          <strong>やらないこと：</strong>開設直後に届く「おすすめ」をそのまま買う。
          手数料の高い商品が案内されることがあります
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>まず金融庁の登録業者かを確認する。無登録業者の一覧も公表されている</li>
        <li>手数料・取扱商品・NISA対応・iDeCoの手数料・使い勝手で比べる</li>
        <li>NISAは1人1口座なので、買いたい商品を扱っているかが効く</li>
        <li>口座の種類は特定口座（源泉徴収あり）が無難</li>
        <li>配当金の受取方法を株式数比例配分方式にしないと、NISAでも配当が課税される</li>
        <li>最初は少額で一往復して、画面と手数料を把握する</li>
      </ul>
    </Chapter>
  );
}
