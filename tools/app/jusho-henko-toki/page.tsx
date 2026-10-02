import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  JUSHO_DATA_CHECKED_AT,
  JUSHO_KARYO_MAX_YEN,
  JUSHO_KEIKA_SOCHI_DEADLINE,
  SEARCH_INFO_FROM,
  TOROKU_MENKYO_PER_PROPERTY,
  earliestDeadline,
  tokiDeadline,
  torokuMenkyo,
} from '@/lib/jusho-henko-toki';
import Calculator from './Calculator';

const title = '住所変更登記の期限チェッカー｜2026年4月義務化・2年以内・2028年3月31日の経過措置';
const description =
  '不動産の住所・氏名の変更登記は2026年4月1日から義務になり、変わった日から2年以内に申請します。それより前の引っ越し・改姓で登記していないものは2028年3月31日が期限です。変わった日を入れると期限と残り日数を出し、未登記の変更が2回あるときは早いほうの期限、登録免許税の目安も表示します。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['住所変更登記 いつまで', '住所変更登記 義務化 期限', '氏名変更登記', 'スマート変更登記', '登記 引っ越し 2年'],
  alternates: { canonical: `${SITE_URL}/jusho-henko-toki/` },
  robots: robotsFor('jusho-henko-toki'),
};

/** '2026-09-27' → '2026年9月27日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};
const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

// 本文の例はロジックから出す（手で日付を書かない）
const EX_NEW = tokiDeadline('2026-04-01');
const EX_OLD = tokiDeadline('2024-06-15');
const EX_TWO = earliestDeadline(['2025-01-10', '2026-08-01']);
const EX_TWO_LATER = tokiDeadline('2026-08-01');
const EX_SAME_DAY = tokiDeadline('2026-06-20');

const faq = [
  {
    q: '引っ越しを2回しましたが、どちらも登記していません。期限はいつですか？',
    a: `変更ごとに期限が立ち、いちばん早いものが先に来ます。たとえば2025年1月10日と2026年8月1日に引っ越した場合、1回目は施行日より前の変更なので${ja(EX_TWO.deadline)}、2回目は${ja(EX_TWO_LATER.deadline)}が期限で、先に来るのは${ja(EX_TWO.deadline)}です。住所が何度か変わっている場合の申請のしかたや添付する書類（住民票の写し・戸籍の附票）は、法務局に確認してください。`,
  },
  {
    q: '結婚で姓が変わり、同じ年に引っ越しました。',
    a: `氏名の変更と住所の変更は、それぞれ変わった日から2年以内です。たとえば2026年6月20日に婚姻届を出して同じ日に転居した場合は、どちらも${ja(EX_SAME_DAY.deadline)}が期限です。日付がずれている場合は、早いほうの日付から数えた期限が先に来ます。氏名の変更には戸籍謄本などが要ります。`,
  },
  {
    q: '検索用情報の申出をしていれば、自分で登記を申請しなくていいですか？',
    a: 'いいえ。職権登記は法務局からの確認に本人が応答して初めて行われ、期限までに登記されるとは限りません。期限は把握しておき、法務局からの通知に応答してください。通知を受け取って登記を拒んだり、期限までに回答しなかったりした場合は、催告の対象になると法務省は説明しています。',
  },
  {
    q: 'マンションの場合、不動産は何個になりますか？',
    a: `建物（専有部分）1個に、敷地権の目的になっている土地の筆数を足した数です。敷地が2筆なら3個で、登録免許税は${yen(torokuMenkyo(3))}です。個数は登記事項証明書（登記簿）で確認できます。`,
  },
  {
    q: '相続登記の義務とは何が違いますか？',
    a: `相続登記は相続で不動産を取得したことを知った日から3年以内・過料は10万円以下、住所・氏名の変更登記は変わった日から2年以内・過料は${yen(JUSHO_KARYO_MAX_YEN)}以下です。経過措置の期限も、相続登記が2027年3月31日、住所・氏名の変更登記が${ja(JUSHO_KEIKA_SOCHI_DEADLINE)}と1年ずれています。相続で取得した実家の登記をするときに、自分の住所も変わっていれば両方を確認してください。`,
  },
];

const trail = breadcrumbFor('jusho-henko-toki');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '住所変更登記の期限チェッカー',
      url: `${SITE_URL}/jusho-henko-toki/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('jusho-henko-toki'),
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

const EGOV = [
  ['https://laws.e-gov.go.jp/law/416AC0000000123#Mp-Ch_4-Se_3-Ss_1-At_76_5', '不動産登記法 76条の5'],
  ['https://laws.e-gov.go.jp/law/416AC0000000123#Mp-Ch_4-Se_3-Ss_1-At_76_6', '不動産登記法 76条の6'],
  ['https://laws.e-gov.go.jp/law/416AC0000000123#Mp-Ch_6-At_164', '不動産登記法 164条'],
] as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>住所変更登記の期限チェッカー</h1>
      <p className="lead">
        不動産の住所・氏名の変更登記は2026年4月1日から義務になりました。<strong>変わった日から2年以内</strong>、
        それより前の変更で登記していないものは<strong>{ja(JUSHO_KEIKA_SOCHI_DEADLINE)}まで</strong>です。
        引っ越し・改姓の日を入れると、期限と残り日数を日付で出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>住所・氏名の変更登記の義務化：変わった日から2年</h2>
      <p>
        2026年4月1日に施行された不動産登記法76条の5により、不動産の所有者（所有権の登記名義人）は、
        <strong>氏名・名称や住所が変わった日から2年以内</strong>に変更の登記を申請することになりました。
        正当な理由なく申請しないと、{yen(JUSHO_KARYO_MAX_YEN)}以下の過料の対象になります（同法164条2項）。
      </p>
      <p>
        期限は変わった日と同じ日付の2年後です。たとえば2026年4月1日に引っ越した場合は{ja(EX_NEW.deadline)}です。
        応当日が無い月（2月29日の2年後など）はその月の末日です（民法143条2項）。
        持っている<strong>すべての不動産</strong>（土地・建物・マンションの敷地権付き区分建物）が対象で、
        管轄の法務局が複数ならそれぞれに申請します。
      </p>

      <h2>2026年4月より前の変更は、2028年3月31日が期限（経過措置）</h2>
      <p>
        施行日より前に住所や氏名が変わっていて、登記をしていないものも義務の対象です。この場合の期限は一律に
        <strong>{ja(JUSHO_KEIKA_SOCHI_DEADLINE)}</strong>です（法務省「住所等変更登記の義務化に関するQ&A」）。
        たとえば2024年6月15日に引っ越した場合も{ja(EX_OLD.deadline)}です。何年も前の引っ越しで、
        登記簿の住所が昔のままになっている人も対象です。
      </p>

      <h2>スマート変更登記（検索用情報の申出）</h2>
      <p>
        個人は<strong>検索用情報の申出</strong>（生年月日などを法務局に申し出ておく手続き）、法人は会社法人等番号の登記があれば、
        法務局が住基ネットなどで住所等の変更を確認し、<strong>本人への確認を経て</strong>職権で変更登記をします（不動産登記法76条の6）。
        {ja(SEARCH_INFO_FROM)}以後に所有権の登記（購入・相続など）をした人は、その申請と同時に申し出ています。
        それより前から持っている不動産は、別に申出をする必要があります。
      </p>
      <p>
        職権登記は、法務局からの確認の通知に本人が応答して初めて行われます。申出をしていても、期限は上のとおり把握しておき、
        通知が届いたら応答してください。
      </p>

      <h2>期限を過ぎたときの手続きの流れ</h2>
      <p>法務省の説明では、過料までの流れは相続登記と同じく次の順です。</p>
      <ol>
        <li>登記官が、変更登記の申請義務に違反した人を知る</li>
        <li>登記官が、相当の期間を定めて登記を申請するよう催告書を送る</li>
        <li>催告書の期限内に申請がなく、正当な理由も無い場合に、登記官が裁判所へ通知する</li>
        <li>裁判所が、{yen(JUSHO_KARYO_MAX_YEN)}以下の範囲で過料を科するかどうかを決める</li>
      </ol>
      <p>
        法務省は正当な理由の例として、行政区画の変更、重い病気、DV被害などで避難している場合、経済的に困窮している場合などを挙げています。
        個別の事情が当たるかどうかはこのページでは判定しないので、法務局の相談窓口に確認してください。
      </p>

      <h2>費用と持ち物の目安</h2>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>登録免許税</td>
            <td style={{ textAlign: 'left' }}>
              不動産1個につき{yen(TOROKU_MENKYO_PER_PROPERTY)}（土地1筆＋建物1棟なら{yen(torokuMenkyo(2))}）
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>必要な書類</td>
            <td style={{ textAlign: 'left' }}>
              住所：住民票の写し（住所のつながりを示すのに履歴が要る場合は戸籍の附票）。氏名：戸籍謄本と本籍入りの住民票
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>申請の方法</td>
            <td style={{ textAlign: 'left' }}>
              法務局の窓口・郵送・オンライン（登記・供託オンライン申請システム）。管轄は不動産の所在地
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>相続登記との違い</td>
            <td style={{ textAlign: 'left' }}>相続登記は3年以内・10万円以下。住所・氏名の変更登記は2年以内・5万円以下</td>
          </tr>
        </tbody>
      </table>
      <p>
        申請書の書き方は、法務局の記載例を見るか、法務局の相談窓口・司法書士に相談してください。このページでは期限と費用の目安だけを出します。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="jusho-henko-toki" />

      <PublicToolLink slug="sozoku-toki-kigen">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          相続した不動産の登記の期限：<ToolLink slug="sozoku-toki-kigen">相続登記の期限チェッカー</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="jutaku-loan-kojo">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          住宅を買った年の控除：<ToolLink slug="jutaku-loan-kojo">住宅ローン控除</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="nissu-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ほかの日付を数える：<ToolLink slug="nissu-keisan">日数計算・期日計算</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="jusho-henko-toki" ymyl="legal">
        出典：
        <a href="https://www.moj.go.jp/MINJI/minji05_00693.html" target="_blank" rel="nofollow noopener noreferrer">
          法務省「住所等変更登記の義務化について」
        </a>
        ・
        <a href="https://www.moj.go.jp/MINJI/minji05_00694.html" target="_blank" rel="nofollow noopener noreferrer">
          法務省「住所等変更登記の義務化に関するQ&A」
        </a>
        ／
        {EGOV.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '・'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        （e-Gov 法令検索）。経過措置は民法等の一部を改正する法律（令和3年法律第24号）附則、
        登録免許税は登録免許税法 別表第一にもとづく。条文と法務省の案内の最終確認日は{ja(JUSHO_DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
