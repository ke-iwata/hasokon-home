import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = '残業代（割増賃金）計算機｜月給から時給換算して法定どおりに計算';
const description =
  '月給と今月の残業時間から、法定どおりの残業代を計算します。1時間あたりの賃金の出しかた（算定基礎から除外できる手当）・月60時間超の5割増・深夜25%・法定休日35%の内訳まで表示。時給換算が最低賃金を下回っていないかも同じ画面で判定できます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/zangyodai-keisan/` },
  robots: robotsFor('zangyodai-keisan'),
};

const faq = [
  {
    q: '所定労働時間が7時間の会社で8時間働いたら、残業代は出ますか？',
    a: '所定7時間を超えた8時間目は「法定内残業」と呼ばれ、労働基準法上の割増（25%）は不要です。ただし働いた時間の賃金そのものは払われるので、1時間あたりの賃金×1.00が支払われます。就業規則で法定内残業にも割増を付けると定めている会社では、そちらが優先します。8時間を超えた分からが法定の時間外労働（25%以上）です。',
  },
  {
    q: '土曜出勤は休日労働になりますか？',
    a: '週休2日の会社の土曜は多くの場合「法定外休日」で、法定休日（週1日または4週4日）ではありません。法定外休日の労働は休日労働（35%）ではなく、週40時間を超えた分が時間外労働（25%以上）として扱われます。35%になるのは、就業規則などで定められた法定休日に働いたときです。どちらが法定休日かは就業規則で確認してください。',
  },
  {
    q: '固定残業代（みなし残業）を超えた分はもらえますか？',
    a: 'もらえます。固定残業代は「あらかじめ決まった時間分の割増賃金を先払いしている」ものなので、実際の残業がその時間数を超えれば、超えた分の割増賃金を別に受け取れます。また、固定残業代の額はその時間数を法定の割増率（1時間あたりの賃金×1.25）で払える額である必要があります。足りていなければ差額の支払いを求められます。',
  },
  {
    q: '深夜残業の割増率は何%ですか？',
    a: '深夜（22時〜5時）の割増は25%以上で、他の割増に加算されます。時間外労働と重なれば25%＋25%で50%、月60時間を超える時間外と重なれば50%＋25%で75%、法定休日労働と重なれば35%＋25%で60%です。所定労働時間内の深夜勤務（夜勤など）は、1.0の部分が月給に含まれているため、割増分の25%だけが加算されます。',
  },
  {
    q: '残業代の時効は何年ですか？',
    a: '賃金請求権の消滅時効は当分の間3年です（労働基準法115条・143条3項）。2020年4月1日以降に支払期日が来た賃金が対象で、それより前は2年でした。時効は賃金の支払日ごとに進むため、古い月の分から順に請求できなくなります。請求を考えている場合は早めに労働基準監督署や弁護士にご相談ください。',
  },
  {
    q: '管理職には残業代が出ないのですか？',
    a: '「管理職」だから出ない、ということはありません。残業代（時間外・休日の割増賃金）の適用が除外されるのは労働基準法41条2号の「監督若しくは管理の地位にある者（管理監督者）」で、経営者と一体的な立場か、出退勤の裁量があるか、地位にふさわしい待遇かなどから実態で判断されます。役職名だけでは決まりません。なお管理監督者にあたる場合でも深夜の割増（25%）は支払われます。該当するかどうかの判断はここでは断定できないため、労働基準監督署や弁護士にご確認ください。',
  },
];

const trail = breadcrumbFor('zangyodai-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '残業代（割増賃金）計算機',
      url: `${SITE_URL}/zangyodai-keisan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('zangyodai-keisan'),
      publisher: PUBLISHER_REF,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      description,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbList(trail),
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>残業代（割増賃金）計算機</h1>
      <p className="lead">
        月給と今月の残業時間から、労働基準法どおりの残業代を計算します。月給を1時間あたりの賃金に換算するところから出すので、「自分の時給はいくらか」「その時給は最低賃金を下回っていないか」も同じ画面で分かります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>残業代の計算式（割増率の表）</h2>
      <p>
        残業代は<strong>1時間あたりの賃金 × 割増率 × 時間数</strong>で計算します。割増率は労働基準法37条と割増賃金令が定める<strong>最低限度</strong>で、就業規則がこれを上回っていればそちらが優先します。
      </p>
      <table>
        <thead>
          <tr>
            <th>種類</th>
            <th>割増率</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>法定内残業（所定〜1日8時間）</td>
            <td>1.00（割増なし）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>時間外労働（1日8時間・週40時間超）</td>
            <td>1.25</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>時間外労働のうち月60時間を超えた分</td>
            <td>1.50</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>法定休日の労働（何時間でも）</td>
            <td>1.35</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>深夜（22〜5時）の加算</td>
            <td>＋0.25</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>時間外＋深夜／月60時間超＋深夜／法定休日＋深夜</td>
            <td>1.50／1.75／1.60</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>法定休日の労働は、8時間を超えても1.35のままです。</strong>
        休日労働には「時間外」という概念がなく、1.25を重ねることはありません。重なるのは深夜だけで、その場合は1.60になります。深夜と重なったときの率（時間外は5割以上、うち月60時間超は7割5分以上、休日は6割以上）は労働基準法施行規則20条が定めています。
      </p>

      <h2>1時間あたりの賃金の出しかた（除外できる手当の7つ）</h2>
      <p>
        月給制の1時間あたりの賃金は、労働基準法施行規則19条1項4号のとおり
        <strong>月給 ÷ 1か月平均所定労働時間</strong>で出します。1か月平均所定労働時間は
        <strong>年間所定労働日数 × 1日の所定労働時間 ÷ 12</strong>です。年間245日・1日8時間なら163.3時間なので、月給30万円の人の1時間あたりの賃金は約1,836円になります。「基本給 ÷ 160」のような概算とは結果が変わります。
      </p>
      <p>
        このとき月給から除外できる手当は、施行規則21条が挙げる次の7つ<strong>だけ</strong>です（限定列挙）。
      </p>
      <ul>
        <li>家族手当</li>
        <li>通勤手当</li>
        <li>別居手当</li>
        <li>子女教育手当</li>
        <li>住宅手当</li>
        <li>臨時に支払われた賃金</li>
        <li>1か月を超える期間ごとに支払われる賃金（賞与など）</li>
      </ul>
      <p>
        <strong>名前が同じでも、一律に支給されている手当は除外できません。</strong>
        たとえば全員に一律1万円を出している「住宅手当」は、家賃や住宅費に応じた額ではないので算定基礎に含めます。役職手当・資格手当・皆勤手当などは、そもそも上の7つに入らないので除外できません。
      </p>
      <p>
        なお<strong>最低賃金と比べるときは除外の範囲が違います</strong>。最低賃金の対象になる賃金からは、精皆勤手当・通勤手当・家族手当・臨時の賃金・賞与・割増賃金を除きます（最低賃金法4条3項、同法施行規則1条）。割増賃金では算定基礎に含める精皆勤手当が、最低賃金では除かれ、割増賃金では除ける住宅手当が最低賃金には含まれる——ちょうど逆になる点に注意してください。
      </p>

      <h2>法定内残業と時間外労働の違い</h2>
      <p>
        労働基準法が割増賃金を義務づけているのは、<strong>法定労働時間（1日8時間・週40時間）を超えた分</strong>です。所定労働時間が7時間の会社で8時間目まで働いた1時間は、所定を超えてはいますが法定は超えていないので「法定内残業」といい、割増は不要で1時間あたりの賃金がそのまま（×1.00）支払われます。
      </p>
      <p>
        同じ考え方で、<strong>週休2日の会社の土曜出勤は「休日労働」ではありません</strong>。法定休日は週1日（または4週4日）なので、もう1日の休み（法定外休日）に働いた分は時間外労働として週40時間超の判定に入ります。35%の割増になるのは法定休日に働いたときだけです。
      </p>

      <h2>月60時間を超えると50%（2023年4月から中小企業も）</h2>
      <p>
        1か月の時間外労働が60時間を超えた部分は、割増率が50%以上になります（労働基準法37条1項ただし書）。以前は中小企業への適用が猶予されていましたが、
        <strong>2023年4月1日から企業規模にかかわらず適用されています</strong>。
      </p>
      <p>
        60時間の算定に入るのは<strong>時間外労働だけ</strong>で、法定休日の労働は含めません。深夜と重なった場合は、50%に深夜の25%が加わって75%になります。
      </p>

      <h2>端数処理で認められていること・いないこと</h2>
      <p>
        賃金は全額払いが原則なので、端数を切り捨てるのは原則として認められません。ただし事務の簡便のため、次の丸め方は違法としない取扱いが示されています（昭和63年3月14日 基発第150号）。
      </p>
      <ul>
        <li>
          1か月の時間外労働・休日労働・深夜労働の
          <strong>各時間数の合計</strong>に1時間未満の端数があるとき、30分未満を切り捨て、30分以上を1時間に切り上げる
        </li>
        <li>1時間あたりの賃金額・割増賃金額の円未満を、50銭未満は切り捨て、50銭以上は1円に切り上げる</li>
        <li>1か月の割増賃金の総額に円未満の端数があるときも同じ扱いにする</li>
      </ul>
      <p>
        <strong>1日ごとに15分未満・30分未満を切り捨てるのは認められていません。</strong>
        丸めてよいのは「1か月の合計」に対してだけです。この計算機では、既定を「法令どおり（丸めない）」にして、円未満は切り上げて表示しています。簡便法に切り替えると上の3つを順に当てた額が出ます。
      </p>

      <div className="note">
        この計算機は労働基準法の<strong>最低限度</strong>で計算する目安です。管理監督者・変形労働時間制・フレックスタイム制・事業場外みなし労働時間制・裁量労働制は計算の前提が違うため対応していません。日給制・年俸制・歩合給（出来高払）も対象外です。未払いがあると思われる場合の請求額（遅延損害金・付加金など）は個別の事情によるため、労働基準監督署か弁護士にご相談ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="zangyodai-keisan" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/saitei-chingin/">最低賃金 早見表・チェッカー</Link>／
        <Link href="/tedori-keisan/">手取り計算機</Link>／
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>／
        <Link href="/hatarakizon/">社会保険の働き損 計算機</Link>
      </p>

      <ToolMeta slug="zangyodai-keisan" ymyl="legal">
        出典：
        <a
          href="https://laws.e-gov.go.jp/law/322AC0000000049"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          労働基準法（e-Gov法令検索）
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/322M40000100023"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          労働基準法施行規則（19条・20条・21条）
        </a>
        ／
        <a
          href="https://jsite.mhlw.go.jp/tokyo-roudoukyoku/content/contents/000501860.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省・東京労働局「しっかりマスター 労働基準法 割増賃金編」（PDF）
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/406CO0000000005"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          割増賃金に係る率の最低限度を定める政令（平成6年政令第5号）
        </a>
        ／
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000148322.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「月60時間を超える時間外労働の割増賃金率引上げ」
        </a>
        にもとづき作成。端数処理は昭和63年3月14日 基発第150号によります。
      </ToolMeta>
    </>
  );
}
