import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { DISCLAIMER, formatMonths, formatYen as yen, KOJO_RESIDENT_CAP, kojoLimitRange } from '@/lib/loan-hensai';
import { SOURCE_NTA_NEW, SOURCE_NTA_EXISTING } from '@/lib/jutaku-loan-kojo';
import Calculator from './Calculator';
import { EXAMPLE } from './tables';

const title =
  'ローン返済シミュレーション｜毎月の返済額・総返済額・年末残高（元利均等／元金均等・繰上返済・金利上昇）';
const description =
  '借入額・返済期間・金利から、毎月の返済額・総返済額・利息の合計・年末残高を計算。元利均等と元金均等の比較、ボーナス払い、繰上返済（期間短縮／返済額軽減）、変動金利の5年ルール・125%ルールで金利が上がったときの返済額と払いきれない利息まで出します。年末残高から住宅ローン控除の目安も。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/loan-hensai/` },
  robots: robotsFor('loan-hensai'),
};

const SOURCE_RULE = {
  label: '住宅金融支援機構【フラット35】「金利のタイプとは？」',
  url: 'https://www.flat35.com/hajimete/atoz/01.html',
};

const limits = kojoLimitRange();
const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;

const faq = [
  {
    q: '3,000万円・35年・金利1%だと毎月いくら？',
    a: `元利均等なら毎月${yen(EXAMPLE.ganriMonthly)}（円未満切り捨て。最終回で端数を精算）で、35年間の利息の合計は${yen(EXAMPLE.ganriTotalInterest)}です。元金均等なら初回が${yen(EXAMPLE.gankinFirst)}で、そこから毎月少しずつ下がります。金融機関の端数の処理によって数円ずれることがあります。`,
  },
  {
    q: '元金均等のほうが得ですか？',
    a: `同じ借入額・金利・期間なら、元金を早く減らす元金均等のほうが利息の合計は少なくなります（3,000万円・35年・1%で元利均等${yen(EXAMPLE.ganriTotalInterest)}に対し元金均等${yen(EXAMPLE.gankinTotalInterest)}）。そのかわり返済の初めの額が大きくなります。どちらが合うかは家計の事情によるので、このツールでは両方の数字を並べるだけにしています。元金均等を扱っていない金融機関もあります。`,
  },
  {
    q: '繰上返済は期間短縮と返済額軽減のどちらが利息が減りますか？',
    a: `同じ時期に同じ額を返すなら、期間短縮のほうが利息は多く減ります。3,000万円・35年・1%で10年目の終わりに100万円を繰上返済すると、期間短縮は${formatMonths(EXAMPLE.shorten.monthsShortened)}短くなって利息が${yen(EXAMPLE.shorten.interestSaved)}減り、返済額軽減は毎月${yen(EXAMPLE.reduce.paymentDrop)}下がって利息が${yen(EXAMPLE.reduce.interestSaved)}減ります。手数料は含めていません。`,
  },
  {
    q: '金利が1%上がると返済額はいくら増えますか？',
    a: `3,000万円・35年で、最初から金利が1%ではなく2%なら、毎月${yen(EXAMPLE.ganriMonthly)}が${yen(EXAMPLE.plus1Monthly)}になります（${yen(EXAMPLE.plus1Monthly - EXAMPLE.ganriMonthly)}増）。借りたあとに変動金利が上がる場合は、5年ルール・125%ルールのある商品だと、返済額はすぐには変わらず5年ごとに見直され、前回の1.25倍までしか上がりません。上がり幅を入れると、見直しごとの返済額と最終回の額が分かります。`,
  },
];

const trail = breadcrumbFor('loan-hensai');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'ローン返済シミュレーション',
      url: `${SITE_URL}/loan-hensai/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('loan-hensai'),
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
  const review = EXAMPLE.rise3Review;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>ローン返済シミュレーション</h1>
      <p className="lead">
        借入額・返済期間・金利から、<strong>毎月の返済額・総返済額・利息の合計・年末残高</strong>を出します。
        <strong>元利均等と元金均等の比較</strong>、繰上返済、変動金利の<strong>5年ルール・125%ルールで払いきれない利息</strong>
        まで、特定の商品に寄らずに計算します。
      </p>

      <Calculator />

      <p className="note">{DISCLAIMER}</p>

      <AdUnit position="below-tool" />

      <h2>元利均等と元金均等の違い</h2>
      <p>
        <strong>元利均等</strong>は、毎月の返済額（元金＋利息）が同じになる返し方です。初めのうちは返済額の多くが利息で、
        元金はゆっくり減ります。毎月の返済額は「借入額 × 月利 ÷（1 −（1 ＋ 月利）^−返済回数）」で、月利は年利の12分の1です。
      </p>
      <p>
        <strong>元金均等</strong>は、毎月返す元金を同じにして、その月の残高にかかる利息を上乗せする返し方です。
        初回がいちばん高く、残高が減るにつれて返済額も下がります。3,000万円・35年・1%なら、元利均等は毎月
        {yen(EXAMPLE.ganriMonthly)}、元金均等は初回{yen(EXAMPLE.gankinFirst)}で、利息の合計は元利均等
        {yen(EXAMPLE.ganriTotalInterest)}・元金均等{yen(EXAMPLE.gankinTotalInterest)}です。
      </p>
      <p>
        このツールの端数は、<strong>毎月の利息を円未満切り捨て、返済額も円未満切り捨て、最終回で残りを精算</strong>
        しています。金融機関によって端数の処理が違い、数円ずれることがあります。
      </p>

      <h2>繰上返済の2つの型（期間短縮と返済額軽減）</h2>
      <p>
        繰上返済は、毎月の返済とは別にまとまった額を元金に充てることです。返したあとの扱いが2つあります。
      </p>
      <ul>
        <li>
          <strong>期間短縮</strong>：毎月の返済額はそのままで、返済の終わりが早まる。3,000万円・35年・1%で10年目の終わりに100万円なら、
          {formatMonths(EXAMPLE.shorten.monthsShortened)}短くなり、利息が{yen(EXAMPLE.shorten.interestSaved)}減ります。
        </li>
        <li>
          <strong>返済額軽減</strong>：返済の終わりはそのままで、毎月の返済額が下がる。同じ条件で毎月
          {yen(EXAMPLE.reduce.paymentDrop)}下がり、利息は{yen(EXAMPLE.reduce.interestSaved)}減ります。
        </li>
      </ul>
      <p>
        利息の減り方は期間短縮のほうが大きくなりますが、手元に残すお金や住宅ローン控除の期間との兼ね合いもあり、
        どちらが良いかは人によって違います。このツールは繰上返済の手数料を含めていません。
      </p>

      <h2>変動金利の5年ルールと125%ルール</h2>
      <p>
        変動金利型の住宅ローンでは、金利は半年ごとに見直されても、<strong>毎月の返済額は5年ごとにしか見直さない</strong>
        （5年ルール）、見直し後の返済額は<strong>前回の1.25倍まで</strong>（125%ルール）という約定が多くの金融機関の
        元利均等で採られています。これは法令ではなく金融機関の約定で、<strong>採っていない商品もあります</strong>
        。借りている（借りる）ローンの約定を確かめてください。
      </p>
      <p>
        返済額が据え置かれるあいだに金利が上がると、返済額のうち利息の割合が増え、元金が減りにくくなります。
        利息が返済額を上回ると、払いきれない利息（未払利息）が翌月以降に持ち越されます。未払利息は免除されるものではなく、
        最後は<strong>最終回にまとめて払う</strong>ことになります。
      </p>
      <p>
        たとえば3,000万円・35年・1%で借り、61回目から金利が3%になると、61回目の見直しで引き直した額は
        {yen(review?.computed ?? 0)}ですが、上限の{yen(review?.cap ?? 0)}で頭打ちになります。このツールでは見直しは
        61・121・181…回目に行い、返済額はまず未払利息、次にその月の利息、残りを元金に充てる順で計算しています。
        最終回の額（この例では{yen(EXAMPLE.rise3Final)}）を必ず表示するので、払いきれない利息が残るかどうかが分かります。
        ボーナス払いの分にも、月の分とは別に同じルールを当てています。元金均等には5年ルール・125%ルールが無く、
        金利が変わった月から利息だけが変わります。
      </p>

      <h2>年末残高と住宅ローン控除</h2>
      <p>
        住宅ローン控除（住宅借入金等特別控除）は、<strong>年末のローン残高 × 0.7%</strong>を上限に、所得税（引ききれなければ住民税）から差し引かれる制度です。
        控除を計算するときに要る「年末残高」を、このツールの年末残高の表で年ごとに出せます。
      </p>
      <p>
        ただし年末残高 × 0.7%は<strong>上限の目安</strong>です。実際の控除は、借入限度額（新築・中古や省エネ性能の区分で
        {man(limits.min)}〜{man(limits.max)}）、控除期間（{limits.years.join('年または')}年）、その年に納めた所得税と住民税の額
        （住民税からの控除は上限{man(KOJO_RESIDENT_CAP)}）で頭打ちになります。自動車ローンや教育ローンは対象ではありません。
        <PublicToolLink slug="jutaku-loan-kojo">
          実際に戻る額は<ToolLink slug="jutaku-loan-kojo">住宅ローン控除 計算機</ToolLink>で確かめられます。
        </PublicToolLink>
      </p>
      <p>
        自動車ローン・教育ローン・カードローンなども、金利と回数が決まっていれば計算のしかたは同じです。
        借入額・期間・金利を入れれば、毎月の返済額と利息の合計が出ます（年末残高の控除の列は無視してください）。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="loan-hensai" />

      <ToolMeta slug="loan-hensai" ymyl>
        出典：
        <a href={SOURCE_RULE.url} target="_blank" rel="nofollow noopener noreferrer">
          {SOURCE_RULE.label}
        </a>
        （変動型の5年ごとの返済額の見直し・1.25倍の上限・未払利息）／
        <a href={SOURCE_NTA_NEW.url} target="_blank" rel="nofollow noopener noreferrer">
          {SOURCE_NTA_NEW.label}
        </a>
        ／
        <a href={SOURCE_NTA_EXISTING.url} target="_blank" rel="nofollow noopener noreferrer">
          {SOURCE_NTA_EXISTING.label}
        </a>
        にもとづき作成。返済額の計算は一般的な元利均等・元金均等の式によります。
      </ToolMeta>
    </>
  );
}
