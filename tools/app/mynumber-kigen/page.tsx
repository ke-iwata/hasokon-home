import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { DATA_CHECKED_AT, calcMynumber, formatJaWithWeekday } from '@/lib/mynumber-kigen';
import Calculator from './Calculator';

const title = 'マイナンバーカード・電子証明書の有効期限チェッカー｜いつまで・いつから更新できる';
const description =
  '生年月日とカード表面の有効期限を入れると、カード本体（10回目の誕生日）と電子証明書（5回目の誕生日）の期限、更新できる日（3か月前から）、通知書が届く目安を日付で出します。電子証明書が切れたあとのマイナ保険証の3か月の猶予がいつまでかも。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['マイナンバーカード 有効期限 いつまで', '電子証明書 有効期限 確認', 'マイナンバーカード 更新 いつから'],
  alternates: { canonical: `${SITE_URL}/mynumber-kigen/` },
  robots: robotsFor('mynumber-kigen'),
};

// 本文の例はロジックから出す（手で日付を書かない）
const EX = calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14' })!;

const faq = [
  {
    q: '電子証明書の有効期限はどこに書いてありますか？',
    a: 'カード表面の、カード本体の有効期限の近くにある欄に、交付のときに窓口で記入されます。空欄のままだったり、読めなくなっていたりすることがあります。マイナポータルにログインしても確かめられます。このページでは、交付時に18歳以上だった人は「カード本体の期限の5年前の同じ誕生日」として出しています。',
  },
  {
    q: '有効期限通知書が届きません。',
    a: '通知書は有効期限の2〜3か月前を目途に、J-LIS（地方公共団体情報システム機構）から住民票の住所へ送られます。届いていなくても、期限の3か月前からは市区町村の窓口で更新できます。',
  },
  {
    q: '引っ越した直後に通知書が届きました。',
    a: '通知書は住民票の住所に送られるので、転居の届出をしていれば新しい住所に届きます。更新の手続きは、いまお住まいの市区町村の窓口でします。',
  },
  {
    q: '更新に手数料はかかりますか？',
    a: '有効期限による更新の手数料は無料です。紛失などでカードを作り直す場合は手数料がかかります。',
  },
  {
    q: '暗証番号を忘れました。',
    a: '暗証番号は市区町村の窓口で再設定できます。更新の手続きでも暗証番号を使うので、忘れている場合は窓口で申し出てください。',
  },
  {
    q: '子どものカードに署名用電子証明書がありません。',
    a: '15歳未満の子どものカードには、署名用電子証明書（実印に相当するもの）は原則発行されません。利用者証明用電子証明書は、法定代理人が暗証番号を設定して発行されます。',
  },
];

const trail = breadcrumbFor('mynumber-kigen');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'マイナンバーカード・電子証明書の有効期限チェッカー',
      url: `${SITE_URL}/mynumber-kigen/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('mynumber-kigen'),
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

/** '2026-10-03' → '2026年10月3日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const SOURCES = [
  ['https://www.kojinbango-card.go.jp/220401_2/', 'J-LIS マイナンバーカード総合サイト「有効期限について」'],
  ['https://www.kojinbango-card.go.jp/faq_expiration5/', 'J-LIS よくある質問（有効期限）'],
  ['https://www.kojinbango-card.go.jp/faq_certificate7/', 'J-LIS よくある質問（15歳未満の電子証明書）'],
  ['https://digital-agency-news.digital.go.jp/articles/2025-08-07-2', 'デジタル庁ニュース（更新の集中・期限切れで使えなくなるもの）'],
  [
    'https://www.mhlw.go.jp/content/12400000/001459106.pdf',
    '厚生労働省「マイナ保険証利用時には電子証明書の有効期限をご確認ください」（令和8年8月時点）',
  ],
] as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>マイナンバーカード・電子証明書の有効期限チェッカー</h1>
      <p className="lead">
        マイナンバーカードには<strong>カード本体</strong>と<strong>電子証明書</strong>の2つの有効期限があり、電子証明書のほうが先に切れます。
        生年月日とカード表面の有効期限を入れると、2つの期限と残り日数、更新できる日、通知書が届く目安を日付で出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>カード本体と電子証明書の有効期限</h2>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>もの</th>
            <th style={{ textAlign: 'left' }}>有効期限</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>カード本体（交付時18歳以上）</td>
            <td style={{ textAlign: 'left' }}>交付から10回目の誕生日まで</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>カード本体（交付時18歳未満）</td>
            <td style={{ textAlign: 'left' }}>交付から5回目の誕生日まで</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>電子証明書（署名用・利用者証明用）</td>
            <td style={{ textAlign: 'left' }}>年齢にかかわらず、交付から5回目の誕生日まで</td>
          </tr>
        </tbody>
      </table>
      <p>
        成年年齢が18歳に引き下げられる前（2022年3月31日まで）に申請した20歳未満の人は、カード本体も5回目の誕生日までです。
        交付時に18歳以上だった人の電子証明書は、カード本体の期限の<strong>5年前の同じ誕生日</strong>に切れます。たとえばカード表面の期限が
        {ja(EX.card.expiry)}なら、電子証明書は{formatJaWithWeekday(EX.cert.expiry)}までです。
      </p>
      <p>
        カード表面に印字されているのはカード本体の有効期限で、交付日は印字されていません。電子証明書の期限は交付のときに窓口で記入される欄で、
        空欄のことも多いので、このページでは生年月日とカード本体の期限から割り出しています。
      </p>

      <h2>更新の手順：期限の3か月前から窓口で</h2>
      <ol>
        <li>
          有効期限の2〜3か月前を目途に、J-LIS から「有効期限通知書」が封筒で届きます（上の例なら電子証明書は{EX.cert.notice}ごろ）。
        </li>
        <li>
          有効期限の<strong>3か月前</strong>から更新できます（上の例なら{ja(EX.cert.renewFrom)}から）。通知書が届いていなくても更新できます。
        </li>
        <li>
          電子証明書の更新は、カードを持ってお住まいの市区町村の窓口でします（オンラインではできません）。カード本体は、通知書の申請書でスマホなどから申請し、交付のときに窓口で受け取ります。
        </li>
      </ol>
      <p>有効期限による更新の手数料は無料です。</p>

      <h2>電子証明書が切れると止まるもの</h2>
      <p>
        電子証明書が切れると、マイナ保険証・コンビニでの住民票などの交付・e-Tax などのオンライン申請・マイナポータルへのログイン・
        民間サービスの本人確認が使えなくなります。カード本体が切れると、本人確認書類としても使えません。
      </p>
      <p>
        ただし<strong>マイナ保険証は、電子証明書の有効期限満了日が属する月の末日から3か月間</strong>は引き続き受診に使えます（厚生労働省）。
        上の例なら{formatJaWithWeekday(EX.cert.hokenGraceEnd)}までです。この間は保険資格の情報だけが医療機関に渡り、診療情報・薬剤情報の提供はできません。
        3か月を過ぎるとマイナ保険証としては使えなくなり、有効な健康保険証が無く再発行もしていない人には資格確認書が交付されます。
      </p>

      <h2>2025年度から更新が集中している理由</h2>
      <p>
        マイナポイントの時期（2020〜2021年）に交付されたカードの電子証明書が5回目の誕生日を迎え、交付が始まった2016年のカード本体が10回目の誕生日を迎えるためです。
        デジタル庁によると、2025年度の更新は電子証明書が約1,600万人、カード本体が約1,200万人と見込まれています。
        窓口が混み合うので、3か月前になったら早めに手続きするのがおすすめです。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        スマホ用電子証明書（スマートフォンのマイナンバーカード機能）は、カードの電子証明書を更新したあとに再設定が要るかどうかを、デジタル庁の案内で確かめてください。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="mynumber-kigen" />

      <PublicToolLink slug="nenrei-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ◯回目の誕生日・満年齢を数える：<ToolLink slug="nenrei-keisan">年齢計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="nissu-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ほかの日付を数える：<ToolLink slug="nissu-keisan">日数計算・期日計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="nenmatsu-chosei">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          マイナポータル連携でも使う：<ToolLink slug="nenmatsu-chosei">年末調整 還付金 計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="mynumber-kigen" ymyl="legal">
        出典：
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '／'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        。このページは制度の説明と日付の計算までで、更新手続きの代行・申請書の作成は扱いません。
        2月29日生まれの平年の期限と、18歳の誕生日の前後に交付されたカードの扱いは、番号利用法施行令・公的個人認証法施行令の原文で確定していません
        （満年齢の数え方は年齢計算と同じ「誕生日の当日から新しい年齢」で出しています）。カード表面の印字を優先してください。
        一次情報の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
