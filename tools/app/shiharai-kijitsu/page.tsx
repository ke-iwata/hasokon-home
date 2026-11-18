import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { formatJa, parseDate, weekdayLabel, type DateParts } from '@/lib/date-parts';
import {
  DATA_CHECKED_AT,
  END_OF_MONTH,
  lateInterest,
  legalDueDate,
  reductionInterest,
  saiitakuDueDate,
  worstCaseDays,
} from '@/lib/shiharai-kijitsu';
import Calculator from './Calculator';

// 仕様書の title から末尾の「｜hasokon」だけ外している（ほかのページと同じく layout の template が '%s' のため）
const title = '支払期日 60日 計算機｜取適法・下請法の遅延利息14.6%も';
const description =
  '納品日（受領日）と「○日締め・翌月○日払い」から、取適法（旧下請法）・フリーランス法の支払期日（受領日から60日目）、その支払条件で最も遅く払われる日が60日を超えるか、遅れたときの遅延利息（年14.6%）を日付と金額で出します。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['取適法 60日 計算', '支払サイト 60日', '下請法 遅延利息 計算', '月末締め翌月末払い 60日'],
  alternates: { canonical: `${SITE_URL}/shiharai-kijitsu/` },
  robots: robotsFor('shiharai-kijitsu'),
};

// 本文の例はロジックから出す（手で日付・額を書かない）
const d = (iso: string) => parseDate(iso) as DateParts;
const md = (p: DateParts) => `${p.month}月${p.day}日`;
const wd = (p: DateParts) => `${formatJa(p)}（${weekdayLabel(p)}）`;
const EX_RECEIVED = d('2027-01-10');
const EX_DUE = legalDueDate(EX_RECEIVED);
const EX_LATE = lateInterest(1_000_000, EX_RECEIVED, d('2027-03-31'));
const EX_MONTHLY = worstCaseDays(END_OF_MONTH, 1, END_OF_MONTH, 2027);
const EX_JUL = EX_MONTHLY[6];
const EX_JAN = EX_MONTHLY[0];
// 再委託：受領日 1/10・元委託支払期日 3/1 → 3/30（受領日から60日目の 3/10 より遅い）
const EX_MOTO_DUE = d('2027-03-01');
const EX_SAIITAKU = saiitakuDueDate(EX_MOTO_DUE);
// 減額：1/10 受領・2/20 に 30,000円減額・3/31 に減額分を支払い
const EX_REDUCTION = reductionInterest(30_000, EX_RECEIVED, d('2027-02-20'), d('2027-03-31'));
const EX_NEXT_NEXT = worstCaseDays(END_OF_MONTH, 2, END_OF_MONTH, 2027)[0];

const faq = [
  {
    q: '月末締め翌月末払いは違反ですか？',
    a: `条文の「受領日から起算して60日」で数えると、月初に納品した分は、大の月を含む月で61〜62日になります（2027年7月1日納品なら8月31日払いで${EX_JUL.maxDays}日）。2月を挟む1月納品は${EX_JAN.maxDays}日で60日以内です。旧下請法の運用では、月単位の締切制度は「60日」を「2か月」と読み替える扱いがあったとされますが、取適法での扱いはこのページでは一次資料で確かめられていません。個別の扱いは公正取引委員会・中小企業庁の相談窓口で確かめてください。`,
  },
  {
    q: '月末締め翌々月末払いは？',
    a: `締め期間の初日に納品した分は約90日（2027年1月1日納品なら3月31日払いで${EX_NEXT_NEXT.maxDays}日）になり、60日を超えます。`,
  },
  {
    q: '検査に時間がかかる場合はどこから数えますか？',
    a: '取適法第3条第1項は「検査をするかどうかを問わず」受領した日から起算すると定めています。検査が終わった日ではなく、物を受け取った日（役務なら提供を受けた日）から数えます。',
  },
  {
    q: '2025年に発注して2026年に納品した分は？',
    a: '改正法の附則で、新しい規定は施行日（2026年1月1日）以後にした製造委託等に適用されます。2025年中の発注は旧下請法の対象ですが、支払期日の60日と遅延利息の年14.6%は同じです。',
  },
  {
    q: 'フリーランスへの発注は？',
    a: 'フリーランス法（特定受託事業者に係る取引の適正化等に関する法律）第4条で、受領日から60日以内に報酬の支払期日を定めます。再委託で、元委託者の名前と元委託の支払期日などを明示されているときは、受領日からではなく元委託の支払期日から30日以内です（第4条第3項）。取適法と違い、遅延利息の規定はありません。発注側の資本金が1千万円以下で取適法の対象にならなくても、従業員を使っている発注者なら60日ルール（再委託は元委託の支払期日から30日）はかかります。',
  },
  {
    q: '振込手数料や協賛金を差し引かれた分にも遅延利息はつきますか？',
    a: `取適法第6条第2項で、中小受託事業者の責めに帰すべき理由がないのに代金の額を減じたときは、減じた日と受領日から60日を経過した日のいずれか遅い日から、減じた額を支払う日まで、年14.6%の遅延利息を払うと定めています。${md(EX_RECEIVED)}に受領し、2月20日に30,000円を差し引かれ、3月31日にその分が払われたなら、${md(EX_REDUCTION.fromDate)}からの${EX_REDUCTION.days}日分で${EX_REDUCTION.interest.toLocaleString('ja-JP')}円です。振込手数料や協賛金などの差し引きが減額に当たるかどうかは、契約の内容と公正取引委員会の運用で決まるので、このページでは判断しません。公正取引委員会・中小企業庁の相談窓口で確かめてください。`,
  },
  {
    q: '手形で払ってもいいですか？',
    a: '取適法第5条第1項第2号で、手形の交付や、支払期日までに満額の現金に引き換えることが難しい支払手段（電子記録債権・ファクタリングなど）の使用は、支払遅延に含まれます。期日内に交付しても支払遅延になります。',
  },
  {
    q: '契約で決めた遅延損害金とは別ですか？',
    a: '別の制度です。取適法の遅延利息（年14.6%）は、受領日から60日を経過した日から数える法律上のものです。契約で決めた遅延損害金や、民法の法定利率（年3%）による遅延損害金は、契約の支払期日から数えます。このページでは取適法の遅延利息だけを計算します。',
  },
];

const trail = breadcrumbFor('shiharai-kijitsu');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '支払期日・遅延利息 計算機（取適法・フリーランス法の60日ルール）',
      url: `${SITE_URL}/shiharai-kijitsu/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shiharai-kijitsu'),
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

const ja = (iso: string) => formatJa(d(iso));

const SOURCES = [
  [
    'https://laws.e-gov.go.jp/law/331AC0000000120',
    'e-Gov 法令検索「製造委託等に係る中小受託事業者に対する代金の支払の遅延等の防止に関する法律」（第2条・第3条・第5条・第6条・附則）',
  ],
  [
    'https://laws.e-gov.go.jp/law/507M60200000009',
    'e-Gov 法令検索「同法第六条第一項及び第二項の率を定める規則」（令和7年公正取引委員会規則第9号）',
  ],
  [
    'https://laws.e-gov.go.jp/law/505AC0000000025',
    'e-Gov 法令検索「特定受託事業者に係る取引の適正化等に関する法律」（第4条。第3項〜第5項の再委託を含む）',
  ],
  ['https://www.jftc.go.jp/point_kaisetsu/toriteki_siryo.pdf', '公正取引委員会「取適法 ポイント解説資料」'],
  ['https://www.jftc.go.jp/file/leaflet_shiharai.pdf', '公正取引委員会 リーフレット（支払）'],
  ['https://www.chusho.meti.go.jp/keiei/torihiki/daikin.html', '中小企業庁「取引適正化（取適法）」'],
] as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>支払期日・遅延利息 計算機（取適法・フリーランス法の60日ルール）</h1>
      <p className="lead">
        2026年1月1日、下請法は<strong>中小受託取引適正化法（取適法）</strong>に変わりました。手形払いが禁止され、
        資本金に加えて従業員の数でも対象が決まるようになり、発荷主から運送事業者への運送の委託も対象に加わりました。
        支払期日は今までどおり<strong>受領日から60日以内</strong>です。納品日と支払条件から、法律上の期日と遅延利息を日付と金額で出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>計算のしかた</h2>
      <h3>受領日を1日目として数える</h3>
      <p>
        取適法（旧下請法）第3条は、支払期日を「給付を受領した日から起算して、60日の期間内」に定めるとしています。
        受領日が1日目なので、最も遅い支払期日は<strong>受領日の59日後</strong>です。
        たとえば{wd(EX_RECEIVED)}に納品を受けたら、支払期日は{wd(EX_DUE)}までです。
      </p>
      <h3>60日を超えて定めた・定めなかったとき（みなし支払期日）</h3>
      <p>
        60日を超える支払期日を契約で決めていても、法律上は「受領日から起算して60日を経過した日の前日」（＝60日目）が支払期日とみなされます。
        支払期日を決めていなかったときは、受領した日そのものが支払期日とみなされます（第3条第2項）。
      </p>
      <h3>遅延利息は「60日を経過した日」から</h3>
      <p>
        支払いが遅れたとき、遅延利息は契約で決めた支払期日からではなく、<strong>受領日から60日を経過した日</strong>（61日目）から
        支払う日までの日数で数えます（第6条第1項）。率は年14.6%です（令和7年公正取引委員会規則第9号）。
        100万円を{md(EX_RECEIVED)}に受領して3月31日に払ったなら、{md(EX_LATE.fromDate)}から3月31日までの{EX_LATE.days}日分で
        {EX_LATE.interest.toLocaleString('ja-JP')}円です。このページは365日で日割りし、円未満を切り捨てています。
      </p>
      <h3>減額された分の遅延利息</h3>
      <p>
        責めに帰すべき理由のない減額をしたときも、減じた額に同じ年14.6%の遅延利息がかかります（第6条第2項）。
        起算日は<strong>減じた日と、受領日から60日を経過した日の遅い方</strong>です。
        {md(EX_RECEIVED)}に受領して2月20日に30,000円を減額され、3月31日にその分を払われたなら、
        {md(EX_REDUCTION.fromDate)}からの{EX_REDUCTION.days}日分で{EX_REDUCTION.interest.toLocaleString('ja-JP')}円です。
      </p>
      <h3>再委託のとき（フリーランス法）</h3>
      <p>
        フリーランスへの発注が再委託で、再委託である旨・元委託者の名前・元委託の支払期日などを発注時に明示したときは、
        報酬の支払期日は受領日からではなく<strong>元委託の支払期日から起算して30日以内</strong>です（フリーランス法第4条第3項）。
        定めなかったときは元委託の支払期日が、30日を超えて定めたときは30日目が支払期日とみなされます（第4項）。
        たとえば{md(EX_RECEIVED)}受領・元委託の支払期日{md(EX_MOTO_DUE)}なら、{wd(EX_SAIITAKU)}までで、受領日から60日目の{md(EX_DUE)}より遅くなります。
        明示の無い再委託はこの特則に当たりません。取適法には再委託の特則が無いので、取適法の対象でもある取引では受領日から60日目も守る必要があり、早いほうの日までに払えば両方を満たします。
      </p>

      <h2>取適法の対象になる取引</h2>
      <p>
        発注側（委託事業者）と受注側（中小受託事業者）の資本金、または常時使用する従業員の数で決まります。どちらかの基準に当たれば対象です。
      </p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>取引の種類</th>
            <th style={{ textAlign: 'left' }}>発注側</th>
            <th style={{ textAlign: 'left' }}>受注側</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }} rowSpan={3}>
              製造・修理・特定運送、プログラム作成・運送・倉庫保管・情報処理
            </td>
            <td style={{ textAlign: 'left' }}>資本金3億円超</td>
            <td style={{ textAlign: 'left' }}>個人・資本金3億円以下</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>資本金1千万円超〜3億円以下</td>
            <td style={{ textAlign: 'left' }}>個人・資本金1千万円以下</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>従業員300人超</td>
            <td style={{ textAlign: 'left' }}>従業員300人以下</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }} rowSpan={3}>
              それ以外の情報成果物作成・役務提供（デザイン・記事・コンサルなど）
            </td>
            <td style={{ textAlign: 'left' }}>資本金5千万円超</td>
            <td style={{ textAlign: 'left' }}>個人・資本金5千万円以下</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>資本金1千万円超〜5千万円以下</td>
            <td style={{ textAlign: 'left' }}>個人・資本金1千万円以下</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>従業員100人超</td>
            <td style={{ textAlign: 'left' }}>従業員100人以下</td>
          </tr>
        </tbody>
      </table>
      <p>
        取適法の対象にならなくても、受注側が従業員を使わない個人・一人法人（フリーランス）で、発注側が従業員を使う事業者なら、
        フリーランス法第4条の60日ルール（再委託で元委託の支払期日などを明示されているときは、元委託の支払期日から30日）がかかります（遅延利息の規定はありません）。建設工事の下請は取適法の対象外で、建設業法の別のルールです。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <h2>相談先</h2>
      <ul>
        <li>
          <a href="https://www.jftc.go.jp/" target="_blank" rel="nofollow noopener noreferrer">
            公正取引委員会（相談窓口はトップページから）
          </a>
        </li>
        <li>
          <a href="https://www.chusho.meti.go.jp/keiei/torihiki/daikin.html" target="_blank" rel="nofollow noopener noreferrer">
            中小企業庁 取引適正化
          </a>
        </li>
        <li>
          <a href="https://www.zenkyo.or.jp/kakekomi/" target="_blank" rel="nofollow noopener noreferrer">
            下請かけこみ寺（中小企業庁の事業）
          </a>
        </li>
      </ul>

      <AdUnit position="below-faq" />

      <RelatedTools current="shiharai-kijitsu" />

      <PublicToolLink slug="nissu-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ほかの日付を数える：<ToolLink slug="nissu-keisan">日数計算・期日計算</ToolLink>
        </p>
      </PublicToolLink>

      <PublicToolLink slug="inshi-zei">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          請求書・領収書の印紙を確かめる：<ToolLink slug="inshi-zei">収入印紙（印紙税）計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="shiharai-kijitsu" ymyl="legal">
        出典：
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '／'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        。このページは日付と金額の計算、条文の当てはめまでで、違反かどうかの最終的な判断（「正当な理由」や個別の契約の事情）はしません。
        月単位の締切制度の「2か月」の読み替え、支払期日が休業日のときの順延、両方の法律に当てはまるときにどちらで扱われるかは、
        取適法での扱いを一次資料で確かめられていないため、条文どおりの計算だけを出しています。一次情報の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
