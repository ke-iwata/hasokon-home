import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  HIGH_RATE_DAYS,
  LIMIT_LABEL,
  SHUSSHOGO_CAP,
  SHUSSHOGO_FLOOR,
  SHUSSHOGO_MAX_DAYS,
  SHUSSHOGO_MIN_LEAVE_DAYS,
  SHUSSHOGO_WEEKS_DEFAULT,
  SHUSSHOGO_WEEKS_POSTPARTUM,
  UNIT_CAP_EARLY,
  UNIT_CAP_LATE,
  UNIT_FLOOR_EARLY,
  UNIT_FLOOR_LATE,
  WAGE_DAILY_MAX,
  WAGE_DAILY_MIN,
  WAGE_MONTHLY_DAYS,
} from '@/lib/ikuji-kyugyo';
import Calculator from './Calculator';

/**
 * **タイトル・description に無条件の「手取り10割」と書かない。**
 * 80%になるのは対象期間内の最大28日だけで、そのあとは67%・50%に戻る。
 * 期待して開いた人が届かなかったときの失望は、そのままサイトの信用に効く
 * （仕様書「表示・注意書き」の約束）。
 */
const title = '育児休業給付金 計算機｜育休でいくらもらえるかを月ごとの推移で';
const description =
  '育児休業給付金がいくらもらえるかを、支給単位期間（原則30日）ごとの推移で計算。出生後休業支援給付（+13%）を満たす場合の最初の最大28日は80%、そのあと67%、通算181日目以降は50%という段差まで出します。令和8年8月1日改定の休業開始時賃金日額の上限16,540円・下限3,203円に対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/ikuji-kyugyo-kyufu/` },
  robots: robotsFor('ikuji-kyugyo-kyufu'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

const faq = [
  {
    q: '育児休業給付金はいくらもらえますか？',
    a: '「休業開始時賃金日額 × 支給日数 × 給付率」です。賃金日額は休業開始前6ヶ月の賃金総額（額面・賞与を除く）を180で割った額で、支給日数は原則30日。給付率は育児休業の開始から通算180日目までが67%、181日目以降は50%です。さらに要件を満たすと、最大28日間だけ出生後休業支援給付金の13%が上乗せされて80%になります。令和8年8月1日からの賃金日額の上限は16,540円で、支給日数30日の支給上限額は67%で332,454円、50%で248,100円です。',
  },
  {
    q: '「育休は手取り10割」というのは本当ですか？',
    a: '条件つきで、期間も限られます。80%（育児休業給付金67% + 出生後休業支援給付金13%）になるのは、出生後休業支援給付の対象期間内の最大28日だけです。29日目からは67%、育休開始から通算181日目以降は50%に戻ります。「実質10割」と言われるのは、育休中は健康保険・厚生年金の保険料が申出により免除され、給付そのものが非課税だからです。ただし住民税は前年の所得をもとに課税されるため休業中も納める必要があり、前年に収入があった人はその分だけ10割には届きません。また賃金日額には上限（16,540円）があるので、給与が高い人ほど額面に対する割合は小さくなります。',
  },
  {
    q: '出生後休業支援給付金の対象になるのは誰ですか？',
    a: '対象期間内に、原則として両親がともに14日以上の育児休業（出生時育児休業給付金または育児休業給付金が支給される休業）を取ることが要件です。配偶者がいない、配偶者が無業者、自営業者やフリーランスなど雇用される労働者でない、配偶者が産後休業中といった場合は、本人の休業だけで要件を満たします。対象期間は、産後休業をしない親（父など）は「子の出生日（出産予定日のうち遅い日）から8週間を経過する日の翌日」まで、産後休業をする親（出産した本人）は同じ起算日から16週間を経過する日の翌日までです。要件を満たすかどうかはハローワークが決定するので、必ずハローワークまたは勤務先で確認してください。',
  },
  {
    q: 'いつ振り込まれますか？',
    a: '育児休業給付金は原則2ヶ月分ずつ、支給単位期間ごとにまとめて申請します。事業主が支給申請書を提出し、ハローワークの支給決定後におおむね1週間程度で振り込まれます。初回は受給資格確認と同時に申請するため、育休に入ってから最初の入金までは2〜3ヶ月ほど空くのが普通です。出生後休業支援給付金は、原則として育児休業給付金（または出生時育児休業給付金）と同じ申請書で一体的に申請します。',
  },
  {
    q: '保育所に入れなくて延長したら給付はどうなりますか？',
    a: '保育所に入所できないなどの理由があれば、支給対象期間を子が1歳6ヶ月・最長2歳まで延長できます。延長中も給付率は50%のままで、67%には戻りません。延長には入所保留通知書などの確認書類が必要で、市区町村への申込みの時期にも条件があります。この計算機は延長を扱っていないので、延長後の月額は50%の期間と同じ額とみてください。',
  },
  {
    q: '育休を2回に分けて取ったらどうなりますか？',
    a: '育児休業は同一の子について2回まで分割して取得でき、支給単位期間はそれぞれの休業ごとに数えます（後の休業も、その休業開始日から起算した1ヶ月ごとになります）。給付率67%の180日は通算なので、分割しても合計で180日を超えた分は50%です。この計算機は連続して取る前提で計算しているため、分割する場合はそれぞれの期間を別々に入れて足してください。',
  },
  {
    q: '産後パパ育休（出生時育児休業給付金）との関係は？',
    a: '産後パパ育休は、子の出生後8週間以内に最大28日まで取れる休業で、給付は「出生時育児休業給付金」という別の給付です。ただし給付率は育児休業給付金と同じ67%で、支給された日数は育児休業給付金の67%の上限である180日にも通算されます。金額の見え方が変わらないため、この計算機では区別せずに計算しています（申請の区分と申請期限は別なので、手続きは勤務先とハローワークにご確認ください）。',
  },
  {
    q: '育休中に働いて給料をもらったら減りますか？',
    a: '一支給単位期間の就業が10日（10日を超える場合は80時間）以下であることが支給の要件です。事業主から賃金が支払われた場合、その額が「賃金日額×休業期間の日数」の13%以下なら減額されず、13%超〜80%未満なら「80%との差額」が育児休業給付金の額になり、80%以上だと支給されません。出生後休業支援給付金のほうは、育児休業給付金が支給される限り減額されません。この計算機は給与が支払われない前提で計算しています。',
  },
];

const trail = breadcrumbFor('ikuji-kyugyo-kyufu');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '育児休業給付金 計算機',
      url: `${SITE_URL}/ikuji-kyugyo-kyufu/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('ikuji-kyugyo-kyufu'),
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

      <h1>育児休業給付金 計算機</h1>
      <p className="lead">
        育休でいくらもらえるかを、<strong>支給単位期間（原則30日）ごとの推移</strong>で計算します。
        出生後休業支援給付の要件を満たす場合の最初の最大{SHUSSHOGO_MAX_DAYS}日は80%、
        そのあとは67%、育休開始から通算{HIGH_RATE_DAYS}日を超えると50%——
        この段差がいつ来ていくらになるかまで出します。金額は
        <strong>{LIMIT_LABEL}</strong>の上限額に対応しています。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>「手取り10割」は最大{SHUSSHOGO_MAX_DAYS}日間の話です</h2>
      <p>
        2025年4月に始まった<strong>出生後休業支援給付金</strong>は、育児休業給付金の67%に
        13%を上乗せして<strong>80%</strong>にする給付です。育休中は健康保険・厚生年金の保険料が
        申出により免除され、給付そのものも非課税なので、「手取りで実質10割」と言われます。
        ただし、そうなる期間と条件は限られています。
      </p>
      <ul>
        <li>
          80%になるのは<strong>対象期間内の最大{SHUSSHOGO_MAX_DAYS}日だけ</strong>。
          {SHUSSHOGO_MAX_DAYS}日を過ぎると67%に戻ります
        </li>
        <li>育休開始から通算{HIGH_RATE_DAYS}日を超えると<strong>50%</strong>になります</li>
        <li>
          原則として<strong>両親がともに{SHUSSHOGO_MIN_LEAVE_DAYS}日以上</strong>
          の育児休業を取ることが要件です（配偶者が無業・自営業・産後休業中などの場合は本人だけでよい）
        </li>
        <li>
          <strong>住民税は前年の所得をもとに休業中も課税されます。</strong>
          前年に収入があった人は、その分だけ10割には届きません
        </li>
        <li>
          賃金日額には上限（{yen(WAGE_DAILY_MAX)}）があるので、
          給与が高い人ほど額面に対する割合は小さくなります
        </li>
      </ul>

      <h2>給付率は80% → 67% → 50%と下がります</h2>
      <table>
        <thead>
          <tr>
            <th>時期</th>
            <th>給付率</th>
            <th>内訳</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>対象期間内の最大{SHUSSHOGO_MAX_DAYS}日</td>
            <td>
              <strong>80%</strong>
            </td>
            <td>育児休業給付金67% ＋ 出生後休業支援給付金13%</td>
          </tr>
          <tr>
            <td>通算{HIGH_RATE_DAYS}日目まで</td>
            <td>
              <strong>67%</strong>
            </td>
            <td>育児休業給付金のみ（産後パパ育休の日数も通算されます）</td>
          </tr>
          <tr>
            <td>通算{HIGH_RATE_DAYS + 1}日目以降</td>
            <td>
              <strong>50%</strong>
            </td>
            <td>育児休業給付金のみ（延長しても50%のままです）</td>
          </tr>
        </tbody>
      </table>

      <h2>出生後休業支援給付の対象期間は、父と母で違います</h2>
      <p>
        13%が上乗せされる日は、休業ならいつでもよいわけではなく
        <strong>対象期間の中の休業</strong>に限られます。この対象期間の長さが、
        <strong>産後休業をするかどうかで変わります。</strong>
      </p>
      <ul>
        <li>
          <strong>産後休業をしない親（父など）</strong>
          … 子の出生日（出産予定日のうち遅い日）から起算して
          {SHUSSHOGO_WEEKS_DEFAULT}週間を経過する日の翌日まで
        </li>
        <li>
          <strong>産後休業をする親（出産した本人）</strong>
          … 同じ起算日から{SHUSSHOGO_WEEKS_POSTPARTUM}週間を経過する日の翌日まで
        </li>
      </ul>
      <p>
        出産した本人は産後休業（出生日の翌日から8週間）の間はそもそも育児休業ではないため、
        対象期間が8週間だと1日も重なりません。母の対象期間が
        {SHUSSHOGO_WEEKS_POSTPARTUM}週間まで伸びているのはこのためです。
        計算機では選んだ立場に応じてこの違いを反映しています。
      </p>

      <h2>{LIMIT_LABEL}の上限額・下限額</h2>
      <p>
        休業開始時賃金日額には上限額と下限額があり、<strong>毎年8月1日に改定</strong>されます。
        これは<Link href="/shitsugyo-hoken/">失業保険（基本手当）</Link>
        の賃金日額の表とは<strong>別の表</strong>で、年齢による区分もありません。
      </p>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>上限</th>
            <th>下限</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>休業開始時賃金日額</td>
            <td>{yen(WAGE_DAILY_MAX)}</td>
            <td>{yen(WAGE_DAILY_MIN)}</td>
          </tr>
          <tr>
            <td>（賃金月額として）</td>
            <td>{yen(WAGE_DAILY_MAX * WAGE_MONTHLY_DAYS)}</td>
            <td>{yen(WAGE_DAILY_MIN * WAGE_MONTHLY_DAYS)}</td>
          </tr>
          <tr>
            <td>支給日数30日・給付率67%</td>
            <td>
              <strong>{yen(UNIT_CAP_EARLY)}</strong>
            </td>
            <td>{yen(UNIT_FLOOR_EARLY)}</td>
          </tr>
          <tr>
            <td>支給日数30日・給付率50%</td>
            <td>
              <strong>{yen(UNIT_CAP_LATE)}</strong>
            </td>
            <td>{yen(UNIT_FLOOR_LATE)}</td>
          </tr>
          <tr>
            <td>出生後休業支援給付金（{SHUSSHOGO_MAX_DAYS}日・13%）</td>
            <td>
              <strong>{yen(SHUSSHOGO_CAP)}</strong>
            </td>
            <td>{yen(SHUSSHOGO_FLOOR)}</td>
          </tr>
        </tbody>
      </table>

      <h2>支給単位期間は暦月ではありません</h2>
      <p>
        育児休業給付金は「支給単位期間」ごとに計算されます。支給単位期間とは
        <strong>育児休業を開始した日から起算した1ヶ月ごとの期間</strong>
        （休業開始日または応当日から翌月の応当日の前日まで）で、
        <strong>給与の暦月とはずれます</strong>。たとえば2月4日に育休を始めた人の区切りは、
        2月4日〜3月3日、3月4日〜4月3日……となります。
      </p>
      <p>
        支給日数は<strong>原則30日</strong>です。暦のうえで28日しかない期間でも31日ある期間でも
        30日として計算し、休業終了日を含む期間だけ終了日までの日数になります。
        80%・67%・50%の段差はすべて日数で決まるので、この計算機も暦月ではなく
        支給単位期間ごとに金額を出しています。
      </p>

      <h2>もらえる人の条件</h2>
      <ul>
        <li>
          <strong>雇用保険の被保険者であること。</strong>
          自営業・フリーランス・雇用保険に入っていない人は対象外です
        </li>
        <li>
          休業開始日前2年間に、賃金支払基礎日数が11日以上ある（ない場合は賃金の支払いの
          基礎となった時間数が80時間以上の）完全月が<strong>12ヶ月以上</strong>あること
        </li>
        <li>一支給単位期間中の就業日数が10日（10日を超える場合は80時間）以下であること</li>
        <li>
          有期雇用の場合、子が1歳6ヶ月に達する日までに労働契約の期間が満了することが
          明らかでないこと
        </li>
      </ul>

      <div className="note">
        受給資格の有無、出生後休業支援給付の要件を満たすかどうかは
        <strong>ハローワークが決定します</strong>。この計算機は受給できる前提での金額の目安を
        出すもので、資格の判定はしません。手続きは原則として勤務先（事業主）が行います。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="ikuji-kyugyo-kyufu" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/shitsugyo-hoken/">失業保険（基本手当）計算機</Link>／
        <Link href="/shobyo-teate/">傷病手当金 計算機</Link>／
        <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>／
        <Link href="/yoikuhi-keisan/">養育費 計算機</Link>
      </p>

      <ToolMeta slug="ikuji-kyugyo-kyufu" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/content/11600000/001461102.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省・都道府県労働局・ハローワーク「育児休業等給付の内容と支給申請手続」（2026年8月1日改訂版）
        </a>
        、
        <a
          href="https://www.mhlw.go.jp/content/001728499.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「令和8年8月1日から支給限度額が変更になります」
        </a>
        、
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「育児休業等給付について」
        </a>
        にもとづき作成（2026年9月10日確認）。休業開始時賃金日額の上限額・下限額と支給上限額は
        毎年8月1日に改定されます。
      </ToolMeta>
    </>
  );
}
