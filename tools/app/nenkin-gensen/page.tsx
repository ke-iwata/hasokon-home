import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { LAW } from '@/lib/nenkin-gensen';
import Calculator from './Calculator';

// 「非課税」とは書かない。源泉徴収されなくなるだけで、他の所得があれば確定申告で税がかかる人もいる
const title = '年金の所得税（源泉徴収）計算機｜2026年12月の精算でいくら戻る？214万円未満は天引きなしに';
const description =
  '年金から引かれる所得税を、2026年2〜10月・12月の精算・2027年以後の3つで計算。令和8年度改正で、12月の年金支払時に改正後の控除で1年分が計算し直され、取りすぎた分は12月の所得税から差し引かれて足りなければ還付。2027年からは年金214万円未満（65歳未満164万円未満）なら源泉徴収されません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nenkin-gensen/` },
  robots: robotsFor('nenkin-gensen'),
};

const faq = [
  {
    q: '12月の年金の所得税が0円（または少ない）のはなぜ？',
    a: '令和8年度の税制改正（基礎控除の引上げ）が2026年12月1日に施行され、2026年分の所得税にさかのぼって適用されるためです。2〜10月の年金は改正前の控除で源泉徴収されていたので、12月の支払時に日本年金機構が改正後の控除で1年分（6回分）を計算し直し、すでに引いた5回分との差を精算します。取りすぎた分が12月分の所得税より大きければ、12月の所得税は0円になり、差額が戻ります。',
  },
  {
    q: '戻ったお金はいつ・どこに振り込まれますか？',
    a: '原則として12月の年金（2026年12月15日の支払）と一緒に、年金の振込口座に入ります。別の手続きは要りません。明細（支払通知書）では「源泉徴収税額」の欄が小さく、または0円になり、そのぶん振込額が増えます。12月に年金の支払が無かった方は、確定申告で精算できます。',
  },
  {
    q: '扶養親族等申告書を出し忘れたらどうなりますか？',
    a: '基礎控除は引かれますが、配偶者控除・扶養控除・障害者控除などの人的控除が引かれなくなり、その分だけ多く源泉徴収されます。税率（5.105%）は出した場合と同じです。配偶者や扶養親族がいない方は、出さなくても税額は変わりません。出し忘れて多く引かれた分は確定申告で取り戻せます。令和9年分の申告書は2026年10月から順次送られていて、65歳以上は年金148万円以上・65歳未満は98万円以上の方が送付の対象に広がりました（住民税の控除のための提出が加わったため）。',
  },
  {
    q: '住民税も変わりますか？',
    a: '住民税は年金からの所得税の源泉徴収とは別に、市区町村が前年の所得から計算します。今回の所得税の精算で住民税が戻ることはありません。扶養親族等申告書が住民税の控除にも使われるようになったので、配偶者・扶養親族がいる方は申告書を出しておくと住民税の計算にも反映されます。',
  },
  {
    q: '確定申告は必要ですか？',
    a: '年金収入が400万円以下で、年金以外の所得が20万円以下なら、所得税の確定申告は原則不要です（確定申告不要制度）。ただし、2026年分で新たに扶養の要件（合計所得62万円以下）を満たした配偶者・扶養親族がいる場合は、その控除は12月の精算に入らないので、原則として確定申告が必要です。医療費控除などを受けたい方も確定申告で税金が戻ります。本ツールは要否の判定はしません。',
  },
];

const trail = breadcrumbFor('nenkin-gensen');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '年金の源泉徴収税額 計算機',
      url: `${SITE_URL}/nenkin-gensen/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('nenkin-gensen'),
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

      <h1>年金の源泉徴収税額 計算機</h1>
      <p className="lead">
        2か月ごとの年金から引かれる所得税を、<strong>2026年2〜10月・12月の精算・2027年以後</strong>
        の3つで出します。令和8年度改正で、<strong>12月の年金では1年分の所得税が計算し直され</strong>
        、取りすぎた分が12月の所得税から差し引かれます（足りなければ戻ります）。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>12月の年金で所得税が精算される理由</h2>
      <p>
        {LAW}で所得税の基礎控除が引き上げられました。改正は<strong>2026年12月1日に施行</strong>
        され、2026年分の所得税にさかのぼって適用されます。ところが2〜10月の年金はすでに
        <strong>改正前の控除</strong>で源泉徴収されています。そこで日本年金機構は、
        <strong>12月の年金支払時に改正後の控除で1年分（6回分）の税額を計算し直し、すでに引いた5回分との差を精算</strong>
        します。
      </p>
      <ul>
        <li>12月の所得税 ＝ 改正後の控除で計算した6回分 − 2〜10月に引いた5回分</li>
        <li>マイナスになれば、12月の所得税は0円で、その分が年金と一緒に戻る</li>
      </ul>
      <p>
        年金の源泉徴収で引かれる控除は「基礎的控除額」（公的年金等控除と基礎控除をまとめた月割の額）です。
        65歳以上なら、2〜10月は<strong>月割額×25%＋105,000円（最低175,000円）</strong>
        （年金242万円超は＋100,000円・最低165,000円）、12月の精算では
        <strong>月割額×25%＋110,000円（最低180,000円）</strong>
        です。65歳未満は最低額がそれぞれ130,000円（213万円超は125,000円）と140,000円になります。
        精算時の額は年金額で分かれません。
      </p>

      <h2>2027年からの1回あたりの所得税と214万円の線</h2>
      <p>
        2027年（令和9年）以後の各回は、12月の精算と同じ<strong>月割額×25%＋110,000円</strong>
        （最低 65歳以上180,000円・65歳未満140,000円）で計算されます。税率は5.105%のままです（2027年から
        復興特別所得税が1.1%に下がり、防衛特別所得税1%が加わりますが、合計は変わりません）。
      </p>
      <p>
        源泉徴収の対象にならない年金額も、65歳以上は<strong>205万円未満 → 214万円未満</strong>、
        65歳未満は<strong>155万円未満 → 164万円未満</strong>に上がります。この線より下なら、2027年からは年金から所得税が引かれません。
        ただし<strong>税金がかからなくなるという意味ではありません</strong>。年金以外の所得がある方は、確定申告で税額が出ることがあります。
      </p>

      <h2>扶養親族等申告書の送付対象が広がった</h2>
      <p>
        令和9年分の「扶養親族等申告書」は2026年10月から順次送られています。今回から住民税の控除を受けるための提出も加わったので、
        送付の対象が<strong>65歳以上は年金148万円以上、65歳未満は98万円以上</strong>の方に広がりました。
        出さないと、源泉徴収で配偶者控除や扶養控除などが引かれず、その分だけ多く引かれます（基礎控除は引かれます）。
        扶養親族の所得要件は合計所得<strong>58万円以下 → 62万円以下</strong>になりました。
      </p>

      <h2>確定申告が要る場合</h2>
      <ul>
        <li>
          2026年分で<strong>新たに扶養の要件（62万円以下）を満たした</strong>配偶者・扶養親族がいる（12月の精算には入らないので、原則として確定申告が必要）
        </li>
        <li>医療費控除などを受けたい</li>
        <li>年金以外の所得が20万円を超える、年金収入が400万円を超える</li>
        <li>12月に年金の支払が無く、精算が行われなかった（確定申告で精算できる）</li>
      </ul>
      <p>
        住民税は市区町村が別に計算するので、本ツールでは扱いません。
        <PublicToolLink slug="zaishoku-rorei-nenkin">
          働きながら年金を受け取っている方は、<ToolLink slug="zaishoku-rorei-nenkin">在職老齢年金 計算機</ToolLink>
          で支給停止の額も確かめられます。
        </PublicToolLink>
        <PublicToolLink slug="nenkin-shien-kyufukin">
          年金が少ない方は<ToolLink slug="nenkin-shien-kyufukin">年金生活者支援給付金 計算機</ToolLink>
          で給付の対象かを確かめられます。
        </PublicToolLink>
      </p>

      <div className="note">
        本ツールは日本年金機構が支払う老齢年金1つ分の源泉徴収を目安として計算します。企業年金・個人年金（iDeCoの年金受取など）は支払者ごとに別の計算で、対象外です。
        「２階部分のみ」の年金（基礎年金が無い方）は2〜10月の式が変わる線が163万円になりますが、本ツールは242万円（65歳未満213万円）で計算します。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="nenkin-gensen" />

      <ToolMeta slug="nenkin-gensen" ymyl>
        出典：
        <a
          href="https://www.nenkin.go.jp/oshirase/taisetu/kojin/2026/202606/0617.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「令和8年度税制改正による公的年金等に係る主な改正事項」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/section/faq/jukyu/jukyushatodoke/rourei/fuyoushinkoku/teishutsu/20141022-08.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「扶養親族等申告書を提出しなかった場合はどうなるのですか。」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/section/faq/jukyu/jukyushatodoke/rourei/fuyoushinkoku/shotokuzei/20141022-04.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「申告書を提出した場合の源泉徴収税額は、どのように計算するのですか。」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/users/gensen/2026kiso/index.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
        </a>
        （同ページの「令和8年4月 源泉所得税の改正のあらまし」と「基礎控除の引上げ等関係 Q&amp;A」Q5-1）／{LAW}
        にもとづき作成。
      </ToolMeta>
    </>
  );
}
