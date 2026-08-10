import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = 'ヘボン式ローマ字変換｜パスポート表記の氏名を自動変換';
const description =
  '氏名（ひらがな・カタカナ）を入力するだけで、パスポート申請用のヘボン式ローマ字表記に変換。撥音（ん→M/N）・促音（っ）・長音（さいとう→SAITO）のルールに対応し、OH表記（長音氏名表記）の代替案も表示します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hebon-romaji/` },
};

const faq = [
  {
    q: 'ヘボン式と訓令式は何が違いますか？',
    a: 'ヘボン式は英語の発音に近い表記（し=SHI、ち=CHI、つ=TSU、ふ=FU）、訓令式は日本語の五十音の規則性を重視した表記（し=SI、ち=TI、つ=TU、ふ=HU）です。パスポートの氏名は原則ヘボン式で表記すると定められているため、小学校で習う訓令式のままでは申請できません。',
  },
  {
    q: '「さいとう」の「う」はなぜ書かないのですか？',
    a: 'パスポートのヘボン式では、「おう」「おお」などの長音（のばす音）のO・Uは表記しないルールになっているためです。さいとう→SAITO、おおの→ONO、こうた→KOTAとなります。同様に「ゆうき」の「うう」もYUKIとUを1つしか書きません。一方「にいがた」のII、「えいた」のEIはそのまま表記します。',
  },
  {
    q: 'OH表記（長音氏名表記）とは何ですか？',
    a: '氏名に「おう」「おお」の長音が含まれる場合に限り、Oの代わりにOHと表記できる特例です（おおの→OHNO、さいとう→SAITOH）。海外でONOが「オノ」と短く読まれるのを避けたい場合などに、パスポート申請時に選択できます。',
  },
  {
    q: '一度決めたローマ字表記は変えられますか？',
    a: '原則として変更できません。パスポートの氏名表記は航空券やビザ、海外の銀行口座など各種書類と一致している必要があるため、一度登録した表記（OH表記を含む）の変更は、婚姻などの特別な理由がない限り認められません。最初の申請時に慎重に選ぶ必要があります。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'ヘボン式ローマ字変換',
      url: `${SITE_URL}/hebon-romaji/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('hebon-romaji'),
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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>ヘボン式ローマ字変換（パスポート表記）</h1>
      <p className="lead">
        姓・名をひらがなまたはカタカナで入力すると、パスポート申請で使うヘボン式ローマ字（大文字）に変換します。撥音「ん」・促音「っ」・長音の表記ルールに対応しています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>パスポートのヘボン式ローマ字とは</h2>
      <p>
        パスポートの氏名は、戸籍のふりがなをヘボン式ローマ字で表記するのが原則です。ヘボン式は英語の発音に近づけた表記法で、「し=SHI」「ち=CHI」「つ=TSU」「ふ=FU」「じ=JI」のように書きます。学校で習う訓令式（し=SI、ち=TI）とは異なるため、注意が必要です。
      </p>

      <h2>間違えやすい表記ルール</h2>
      <table>
        <thead>
          <tr>
            <th>ルール</th>
            <th>例</th>
            <th style={{ textAlign: 'center' }}>表記</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>長音「おう」「おお」のU/Oは書かない</td>
            <td style={{ textAlign: 'left' }}>さいとう／おおの</td>
            <td style={{ textAlign: 'left' }}>SAITO／ONO</td>
          </tr>
          <tr>
            <td>長音「うう」のUは1つ</td>
            <td style={{ textAlign: 'left' }}>ゆうき</td>
            <td style={{ textAlign: 'left' }}>YUKI</td>
          </tr>
          <tr>
            <td>「いい」「えい」はそのまま</td>
            <td style={{ textAlign: 'left' }}>にいがた／えいた</td>
            <td style={{ textAlign: 'left' }}>NIIGATA／EITA</td>
          </tr>
          <tr>
            <td>B・M・Pの前の「ん」はM</td>
            <td style={{ textAlign: 'left' }}>なんば／ほんま</td>
            <td style={{ textAlign: 'left' }}>NAMBA／HOMMA</td>
          </tr>
          <tr>
            <td>促音「っ」は子音を重ねる</td>
            <td style={{ textAlign: 'left' }}>はっとり</td>
            <td style={{ textAlign: 'left' }}>HATTORI</td>
          </tr>
          <tr>
            <td>CH音の前の「っ」はT</td>
            <td style={{ textAlign: 'left' }}>はっちょう</td>
            <td style={{ textAlign: 'left' }}>HATCHO</td>
          </tr>
        </tbody>
      </table>

      <h2>OH表記（長音氏名表記）は慎重に</h2>
      <p>
        「おう」「おお」の長音を含む氏名は、申請時にO表記（ONO）かOH表記（OHNO）かを選べます。ただし、一度パスポートに記載した表記はその後の申請でも引き継がれ、原則として変更できません。クレジットカードや航空券のマイレージ登録など、他の名義表記との統一も考えて選びましょう。
      </p>

      <div className="note">
        本ツールは一般的なパスポート用ヘボン式ローマ字のルールにもとづく参考表示です。非ヘボン式表記（例: 外国式の綴り）を希望する場合や表記に迷う場合など、正式な確認は各都道府県のパスポート申請窓口へお問い合わせください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hebon-romaji" />

      <ToolMeta slug="hebon-romaji">
        パスポート用ヘボン式ローマ字の表記ルールにもとづく参考表示です。パスポートは各都道府県が発給しており、綴りの一覧は
        <a
          href="https://www.pref.osaka.lg.jp/o070140/passport/top/romaji.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          大阪府「ヘボン式ローマ字」
        </a>
        などで公開されています。非ヘボン式表記を希望する場合など、正式な確認は申請窓口へお問い合わせください。
      </ToolMeta>
    </>
  );
}
