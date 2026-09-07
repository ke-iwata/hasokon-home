import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Ladder } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('ango-shisan');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="ango-shisan" sources={['fsa-crypto', 'nta-1524', 'fsa-warning', 'fsa-basic']}>
      <p>
        暗号資産は、この教科書で扱う資産のなかで
        <strong>制度上の位置づけが最も違います</strong>。
        「株式と同じように投資できるもの」と考えると、
        税金でも保護の仕組みでも想定と食い違います。
        ここでは値上がりの見通しではなく、性質と制度を扱います。
      </p>

      <h2>法律上は「金融商品」ではない</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>株式・投資信託</th>
              <th>暗号資産</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>根拠法</th>
              <td>金融商品取引法</td>
              <td>
                <strong>資金決済法</strong>（一部は金商法）
              </td>
            </tr>
            <tr>
              <th>分別管理</th>
              <td>信託銀行が分別保管</td>
              <td>交換業者に分別管理義務あり</td>
            </tr>
            <tr>
              <th>投資者保護基金</th>
              <td>
                <strong>あり</strong>（証券会社の破綻時、1,000万円まで補償）
              </td>
              <td>
                <strong>ない</strong>
              </td>
            </tr>
            <tr>
              <th>預金保険</th>
              <td>—</td>
              <td>
                <strong>ない</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>暗号資産は「通貨」ではありません。</strong>
        法定通貨（円・ドル）ではなく、
        価値を裏付けるものも発行主体の保証もありません。
        金融庁は暗号資産について繰り返し注意喚起を出しています（末尾の参考文献）。
      </p>

      <h2>価格の源泉</h2>

      <p>
        第1部1章で見た「リターンの源泉」を当てはめると、位置がはっきりします。
      </p>

      <Figure
        title="株式は利益、債券は利息、不動産は賃料という生み出すものがあるが、暗号資産は金と同じく何も生まず、他の人がいくらで買うかだけで値段が決まる"
        caption="金（第2部12章）と同じ列に入ります。ただし金には数千年の実物需要の歴史があり、その点も違います。"
      >
        <Ladder
          steps={[
            { label: '株式・債券・不動産', sub: '利益・利息・賃料が生まれる' },
            { label: '金・コモディティ', sub: '何も生まないが、実物としての用途がある' },
            {
              label: '暗号資産',
              sub: '何も生まない。値段は需給だけで決まる',
              strong: true,
            },
          ]}
        />
      </Figure>

      <p>
        <strong>これは「価値がない」という意味ではありません。</strong>
        送金や決済の仕組みとしての有用性を評価する立場はあります。
        ここで言えるのは、<strong>株式のように
        「利益の何倍か」で高い安いを判断する物差しがない</strong>ということです。
      </p>

      <h2>固有のリスク</h2>

      <ul>
        <li>
          <strong>価格変動が大きい。</strong>1日で数十%動くことがあります
        </li>
        <li>
          <strong>取引所の破綻・ハッキング。</strong>
          過去に国内外で流出事件が複数起きています。
          投資者保護基金がないため、戻ってこないことがあります
        </li>
        <li>
          <strong>秘密鍵の紛失。</strong>自分で保管する場合、
          鍵を失うと誰にも復元できません。銀行のような再発行の仕組みがありません
        </li>
        <li>
          <strong>詐欺の温床になりやすい。</strong>
          「必ず儲かる」「元本保証」をうたう勧誘が多く、
          無登録業者による被害が続いています（第4部34章）
        </li>
        <li>
          <strong>制度が変わりうる。</strong>各国の規制方針が定まっておらず、
          規制の変更が価格に直接効きます
        </li>
      </ul>

      <h2>税金が株式とまったく違う</h2>

      <p>
        ここが実務的にいちばん効きます。詳しくは第3部22章で扱いますが、要点だけ。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>株式</th>
              <th>暗号資産（個人・原則）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>所得区分</th>
              <td>譲渡所得（申告分離）</td>
              <td>
                <strong>雑所得（総合課税）</strong>
              </td>
            </tr>
            <tr>
              <th>税率</th>
              <td>20.315%で固定</td>
              <td>
                <strong>他の所得と合算して累進</strong>。住民税と合わせ最大約55%
              </td>
            </tr>
            <tr>
              <th>損益通算</th>
              <td>株式等の中で可能</td>
              <td>
                <strong>給与や株式とは通算できない</strong>
              </td>
            </tr>
            <tr>
              <th>繰越控除</th>
              <td>3年間できる</td>
              <td>
                <strong>できない</strong>
              </td>
            </tr>
            <tr>
              <th>NISA</th>
              <td>使える</td>
              <td>
                <strong>使えない</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>売っていなくても課税されることがあります。</strong>
        暗号資産どうしの交換や、暗号資産で物を買った場合も、
        その時点で損益が実現したものとして扱われます。
        「円に戻していないから関係ない」は誤りです。
        取引のたびに記録が要るので、<strong>後から計算するのが非常に大変になります</strong>。
      </p>

      <h2>持つと決めるなら</h2>

      <p>
        買うべきかどうかはこの教科書では書きません（免責のとおりです）。
        判断する場合に、事実として押さえておくべき点だけ挙げます。
      </p>

      <ul>
        <li>
          <strong>金融庁に登録された暗号資産交換業者か</strong>を確認する。
          無登録業者の一覧は金融庁が公表しています
        </li>
        <li>
          <strong>全額失っても生活が変わらない額に収める。</strong>
          第1部2章のリスク許容度の話が、他のどの資産よりも強く当てはまります
        </li>
        <li>
          <strong>取引の記録を都度残す。</strong>税の計算に必要になります
        </li>
        <li>
          <strong>レバレッジ取引は別物として扱う。</strong>
          国内では個人は最大2倍に制限されていますが、
          損失が入金額を超える仕組みは変わりません
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>暗号資産は金融商品取引法ではなく資金決済法が主な根拠。投資者保護基金がない</li>
        <li>何も生まないので、値段は需給だけで決まる</li>
        <li>取引所の破綻・鍵の紛失・詐欺という、他の資産にないリスクがある</li>
        <li>税は雑所得・総合課税で最大約55%。損益通算も繰越もできず、NISAも使えない</li>
        <li>暗号資産どうしの交換でも課税される。記録は都度残す</li>
      </ul>
    </Chapter>
  );
}
