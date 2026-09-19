import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { HAYAMIHYO_YEARS, hayamihyo } from '@/lib/taishokukin';
import Calculator from './Calculator';

const title = '退職金の税金・手取り計算機｜iDeCoの「10年ルール」対応（2026年〜）';
const description =
  '退職金にかかる所得税・住民税と手取りを計算します。退職所得控除は「40万円 × 12年」のように式で表示。2026年からiDeCo一時金を先に受け取った場合の重複排除が5年→10年に延びた「10年ルール」と、一時金が当時の控除額に満たないときの重複期間の短縮まで計算します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/taishokukin-tedori/` },
  robots: robotsFor('taishokukin-tedori'),
};

const faq = [
  {
    q: '退職金の「10年ルール」とは何ですか？',
    a: 'iDeCo（確定拠出年金）の一時金を先に受け取り、その後に会社の退職金を受け取る場合、退職所得控除の計算で「重なっている期間」が差し引かれる仕組みのことです。令和7年度税制改正により、この重複排除の対象になる期間が「前の一時金を受けた年が前年以前4年内」から「前年以前9年内」に延びました（所得税法施行令 第70条1項2号ロ）。',
  },
  {
    q: '2025年にiDeCoの一時金を受け取りました。2026年以後に退職すると9年内で判定されますか？',
    a: 'されません。4年内のままです。条文は対象になる一時金を「令和八年一月一日以後に支払を受けたものに限り」と限定しているため、9年内で判定されるのは一時金と退職金の両方を2026年以後に受け取る場合だけです。2025年以前に受け取った一時金は、2026年以後に退職しても従来どおり前年以前4年内で判定されます。なお1〜4年前はどちらの決まりでも対象になるので、新ルールで結論が変わるのは5〜9年前のケースだけです。最初に影響が出るのは「2026年に一時金 → 2031年に退職金」の方になります。',
  },
  {
    q: '10年ルールは誰に関係しますか？',
    a: '「iDeCo等の一時金を先に受け取り、あとから会社の退職金を受け取る」順番の方だけです。iDeCoをまだ受け取っていない方、年金形式で受け取っている方には関係ありません。また、退職金を先に受け取ってiDeCoの一時金を後で受け取る逆の順番は、従来どおり19年内で判定します（本ツールは「iDeCo一時金が先」のケースだけを計算します）。同じ年に両方を受け取る場合は、重複排除ではなく通算（額も期間も合算する）という別の計算になり、本ツールでは扱っていません。',
  },
  {
    q: '重複期間の「短縮」とは何ですか？',
    a: '前に受け取った一時金の額が、その当時の退職所得控除額に満たなかった場合、「掛金期間の初日から、一時金の額に応じた年数を経過した日の前日まで」の期間が前の勤続期間とみなされるという決まりです（所得税法施行令 第70条2項）。たとえば掛金期間15年・一時金200万円なら、当時の控除額は600万円なので一時金はこれに満たず、みなされる期間は掛金開始から5年ぶん（200万円 ÷ 40万円）になります。大事なのはこれが「年数の上限」ではなく「期間」だという点です。転職前からiDeCoに入っていて掛金期間が勤続期間より前に始まっている方の場合、短縮後の期間が勤続期間とまったく重ならず、差し引きが0円になることもあります。iDeCoの一時金は掛金期間で計算した控除額より小さいことが多いため、この短縮を入れないと控除を引きすぎ、税金を実際より多く見積もることになります。',
  },
  {
    q: '勤続年数に1年未満の端数があるときはどうなりますか？',
    a: '切り上げます（所得税法施行令 第69条）。10年1か月でも10年11か月でも、どちらも11年として退職所得控除を計算します。1か月でも超えれば40万円（20年超の部分なら70万円）ぶん控除が増えるため、退職日が月をまたぐかどうかで手取りが変わることがあります。',
  },
  {
    q: '「退職所得の受給に関する申告書」を出さないとどうなりますか？',
    a: '退職金の額そのものに20.42%の所得税が源泉徴収されます。退職所得控除も2分の1課税も使われないため、多くの場合は納めすぎになり、確定申告で戻ってきます。納める税額そのものは申告書の有無で変わりませんが、いったん振り込まれる額が大きく減ります。なお20.42%は所得税だけの話で、住民税は申告書の有無にかかわらず正しい額（課税退職所得の10%）が特別徴収されます。',
  },
  {
    q: '勤続5年以下だと不利になりますか？',
    a: '2つの例外があります。役員等（法人の役員・議員・公務員など）で勤続5年以下の場合は「特定役員退職手当等」となり、2分の1課税が使えません。役員等以外で勤続5年以下の場合は「短期退職手当等」となり、退職所得控除を引いた後の額のうち300万円を超える部分について2分の1課税が使えません。300万円までは通常どおり2分の1です。',
  },
  {
    q: '退職金にも社会保険料はかかりますか？',
    a: 'かかりません。退職金（退職手当等）は健康保険・厚生年金保険の報酬にも賞与にも当たらないため、社会保険料は引かれません。引かれるのは所得税（復興特別所得税を含む）と住民税だけです。給与の手取りとは負担のしくみがまったく違います。',
  },
  {
    q: '住民税は翌年に請求されますか？',
    a: '退職所得の住民税は、ほかの所得と分けて「現年分離課税」で計算され、退職金が支払われるときにその場で特別徴収されます。給与の住民税のように翌年に後から来ることはありません。税率は市町村民税6%・道府県民税4%の合計10%です。',
  },
];

const trail = breadcrumbFor('taishokukin-tedori');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '退職金の税金・手取り計算機',
      url: `${SITE_URL}/taishokukin-tedori/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('taishokukin-tedori'),
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

const rows = hayamihyo();
const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;
const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const subLabel = { fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 400 };

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>退職金の税金・手取り計算機</h1>
      <p className="lead">
        退職金は給与とは別の計算で税金が決まります。退職所得控除を引き、残りの2分の1に、
        ほかの所得と分けて課税されます。
        <strong>
          2026年からは、iDeCoの一時金を先に受け取った人の重複排除が「5年」から「10年」に延びました。
        </strong>
        控除の内訳を式で見せながら、手取りを計算します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2 id="hayamihyo">退職金と勤続年数の手取り早見表</h2>
      <p>
        まず規模感を知りたいときはこちらをご覧ください。
        <strong>この表は上の計算機とまったく同じロジックから作っている</strong>
        ので、表と計算結果が食い違うことはありません。
      </p>
      {/*
        6桁の金額 × 5列は390px幅で折り返す。表を nowrap にして
        外側の overflow-x で横スクロールさせる（saitei-chingin / furusato-nozei と同じ形）。
      */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>退職金（額面）</th>
              {HAYAMIHYO_YEARS.map((y) => (
                <th key={y}>
                  勤続{y}年
                  <br />
                  <span style={subLabel}>控除 {man(rows[0].cells.find((c) => c.years === y)!.deduction)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.amount}>
                <th scope="row">{man(row.amount)}</th>
                {row.cells.map((cell) => (
                  <td key={cell.years}>
                    {yen(cell.net)}
                    <br />
                    <span style={subLabel}>
                      {cell.tax === 0 ? '税金なし' : `税金 ${yen(cell.tax)}`}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        <strong>表の前提：</strong>
        一般（役員等以外）の退職、「退職所得の受給に関する申告書」を提出済み、
        iDeCo等の一時金を先に受け取っていない場合の手取りです。
        勤続年数はちょうどの年数（端数なし）で計算しています。
        <strong>退職金が控除額以下なら税金は0円</strong>になります。
      </p>

      <h2>退職金の税金はなぜ軽いのか</h2>
      <p>
        退職金には、給与には無い3つの優遇があります。長年の勤労に対する後払いの報酬であり、
        退職後の生活資金でもあることから、担税力（税を負担する力）が小さいと考えられているためです。
      </p>
      <ul>
        <li>
          <strong>退職所得控除</strong>：勤続年数に応じて差し引ける控除。勤続20年までは1年あたり40万円、
          20年を超えた部分は1年あたり70万円と、長く勤めるほど手厚くなります（最低80万円）
        </li>
        <li>
          <strong>2分の1課税</strong>：控除を引いた残りの半分だけが課税対象になります。
          何十年ぶんかの報酬が1年に集中して累進課税で重くなることを避けるための調整です
        </li>
        <li>
          <strong>分離課税</strong>：その年の給与など他の所得と合算しません。
          合算すると税率の高い帯に押し上げられてしまうためです
        </li>
      </ul>
      <p>
        <strong>社会保険料は引かれません。</strong>
        退職金は健康保険・厚生年金保険の報酬にも賞与にも当たらないためです。
        引かれるのは所得税（復興特別所得税を含む）と住民税だけで、
        <Link href="/tedori-keisan/">給与の手取り</Link>とは負担のしくみがまったく違います。
      </p>

      <h2>2026年からの「10年ルール」</h2>
      <p>
        iDeCo（個人型確定拠出年金）の老齢給付金を<strong>一時金</strong>で受け取ると、
        それも「退職手当等」として退職所得になります。会社の退職金とiDeCoの一時金を
        別々の年に受け取ると、それぞれで退職所得控除を使えてしまうため、
        <strong>掛金を払っていた期間と勤続期間が重なっている部分は控除から除く</strong>
        という調整が入ります。
      </p>
      <p>
        この調整の対象になる期間が、令和7年度税制改正で変わりました。
        従来は「前の一時金を受けた年が<strong>前年以前4年内</strong>」でしたが、
        改正後は<strong>「前年以前9年内」</strong>になります（所得税法施行令 第70条1項2号ロ）。
      </p>
      <p>
        <strong>
          ただし9年内で判定されるのは、iDeCoの一時金と退職金の「両方」を2026年以後に受け取る場合だけです。
        </strong>
        条文は対象の一時金を「令和八年一月一日<strong>以後に支払を受けたものに限り</strong>」と限定していて、
        <strong>2025年以前に受け取った一時金は、2026年以後に退職しても従来どおり4年内で判定されます</strong>
        （同号イ）。「iDeCoを先に受け取って5年空ければ控除が満額使える」という説明は、
        2026年以後に受け取る一時金には当てはまりません。すでに受け取った分には、これまでどおり当てはまります。
      </p>
      <p>
        1〜4年前はどちらの号でも対象になるため、<strong>新ルールで結論が変わるのは5〜9年前のケース</strong>です。
        つまり<strong>最初に影響が出るのは「2026年に一時金 → 2031年に退職金」</strong>の方で、
        それより前の退職では旧ルールと同じ結果になります。
      </p>
      <p>
        影響するのは<strong>「iDeCoの一時金を先に、会社の退職金を後に」受け取る順番の方だけ</strong>です。
        iDeCoをまだ受け取っていない方、年金形式で受け取っている方には関係ありません。
        逆の順番（退職金が先、iDeCoの一時金が後）は従来どおり19年内で判定します。
        こちらは計算の主体がiDeCo側になるため、本ツールでは扱っていません。
        また<strong>同じ年に両方を受け取る場合</strong>は、重複排除ではなく
        <strong>通算</strong>（額も期間も合算する）という別の計算になり、本ツールでは扱っていません。
      </p>

      <h2>重複期間は「短縮」されることがあります</h2>
      <p>
        重複排除の対象になっても、<strong>重なった期間の全部が差し引かれるとは限りません。</strong>
        前に受け取った一時金の額が、その当時の退職所得控除額に満たなかった場合、
        <strong>
          「掛金期間の初日から、一時金の額に応じた年数を経過した日の前日まで」の期間
        </strong>
        が「前の勤続期間」とみなされます（所得税法施行令 第70条2項）。その年数は次のとおりです。
      </p>
      <ul>
        <li>一時金が800万円以下：一時金 ÷ 40万円（1年未満切捨て）</li>
        <li>一時金が800万円超：（一時金 − 800万円）÷ 70万円 ＋ 20年</li>
      </ul>
      <p>
        たとえば<strong>掛金期間15年・一時金200万円</strong>の場合、当時の退職所得控除額は
        40万円 × 15年 ＝ 600万円。一時金はこれに満たないので、みなされる期間は
        <strong>掛金開始から5年ぶん</strong>（200万円 ÷ 40万円）です。
        その5年が勤続期間と重なっていれば、40万円 × 5年 ＝ 200万円が差し引かれます。
      </p>
      <p>
        <strong>ここは「年数の上限」ではなく「期間」である点が大事です。</strong>
        たとえば転職前からiDeCoに入っていて、掛金期間が勤続期間より前に始まっている方の場合、
        短縮後の期間が勤続期間とまったく重ならないことがあります。そのときの差し引きは
        <strong>0円</strong>です。「重なった年数と、みなしの年数の小さいほう」と考えると、
        重なっていない期間まで差し引くことになり、控除を削りすぎます。
      </p>
      <p>
        iDeCoの一時金は掛金期間で計算した控除額より小さいことが多く、
        <strong>この短縮を入れないと控除を引きすぎて、税金を実際より多く見積もってしまいます。</strong>
        本ツールは初版からこの短縮を計算に入れています。
      </p>

      <h2>勤続5年以下の2つの例外</h2>
      <ul>
        <li>
          <strong>特定役員退職手当等</strong>（役員等で勤続5年以下）：
          2分の1課税が使えません。役員等とは法人の役員・国会議員・地方議会議員・国家公務員・地方公務員です
        </li>
        <li>
          <strong>短期退職手当等</strong>（役員等以外で勤続5年以下）：
          退職所得控除を引いた後の額のうち<strong>300万円を超える部分</strong>について
          2分の1課税が使えません。300万円までは通常どおり2分の1です
        </li>
      </ul>

      <h2>「退職所得の受給に関する申告書」を出す・出さない</h2>
      <p>
        この申告書を勤務先に提出すると、勤務先が退職所得控除と2分の1課税を織り込んだ
        正しい税額を源泉徴収してくれます。提出しないと、
        <strong>退職金の額そのものに20.42%の所得税</strong>が源泉徴収され、
        確定申告で精算することになります。
      </p>
      <p>
        <strong>納める税額そのものは変わりません。</strong>変わるのは「いったん振り込まれる額」と
        「精算のタイミング」です。また<strong>20.42%は所得税だけの話</strong>で、
        住民税は申告書の有無にかかわらず正しい額（課税退職所得の10%）が特別徴収されます。
      </p>

      <div className="note">
        本ツールの計算は概算です。実際に源泉徴収された額は、勤務先から交付される
        <strong>退職所得の源泉徴収票</strong>でご確認ください。同じ年に複数の退職手当等を受け取る場合、
        企業型DC・中退共・小規模企業共済と通算される場合、外国税額控除がある場合などは計算が変わります。
        個別の税務については税理士にご相談ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="taishokukin-tedori" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/ideco/">iDeCo 拠出限度額 計算機</Link>／
        <Link href="/shitsugyo-hoken/">失業保険（基本手当）計算機</Link>／
        <Link href="/zaishoku-rorei-nenkin/">在職老齢年金 計算機</Link>／
        <Link href="/tedori-keisan/">手取り計算機</Link>
      </p>

      <ToolMeta slug="taishokukin-tedori" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁 タックスアンサー No.1420「退職金を受け取ったとき（退職所得）」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁 タックスアンサー No.2732「退職手当等に対する源泉徴収」
        </a>
        ／所得税法 第30条・第89条・第201条、同施行令 第69条・第70条（
        <a
          href="https://laws.e-gov.go.jp/law/340CO0000000096"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          e-Gov 法令検索
        </a>
        の現行条文で確認）、地方税法 第50条の2・第328条（退職所得の分離課税）・第20条の4の2（端数計算）
        にもとづき作成（2026年9月18日確認）。
      </ToolMeta>
    </>
  );
}
