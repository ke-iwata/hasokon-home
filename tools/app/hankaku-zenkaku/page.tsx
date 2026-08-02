import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import RelatedTools from '@/app/RelatedTools';
import Converter from './Converter';

const title = '半角⇔全角 変換ツール｜英数字・カタカナ・記号をまとめて変換';
const description =
  '半角と全角をまとめて相互変換できる無料ツール。英数字・カタカナ・記号・スペースを種類ごとに選んで変換できます。半角カナの濁点（ｶﾞ→ガ）にも対応。入力内容は送信されません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hankaku-zenkaku/` },
};

const faq = [
  {
    q: '半角と全角の違いは何ですか？',
    a: '文字が占める幅の違いです。もともと1バイトで表せる文字を「半角」、漢字と同じ幅を持つ2バイトの文字を「全角」と呼んでいました。現在はUnicodeで別々の文字として扱われるため、見た目が似ていても「A」（半角）と「Ａ」（全角）はコンピュータ上ではまったく別の文字です。検索や名寄せで一致しない原因になります。',
  },
  {
    q: '半角カナの濁点（ｶﾞ）はどうなりますか？',
    a: '全角に変換すると「ガ」1文字にまとまり、半角に変換すると「ｶ」＋「ﾞ」の2文字に分かれます。半角カナでは濁点が独立した1文字として扱われるためで、変換すると文字数が変わります。このツールでは変換前後の文字数を表示しているので確認できます。',
  },
  {
    q: '英数字だけを半角にして、カタカナは全角のまま残せますか？',
    a: 'できます。「変換する文字の種類」でカタカナのチェックを外してください。住所や氏名の入力欄では「英数字は半角・カナは全角」と指定されることが多いため、種類ごとに選べるようにしています。',
  },
  {
    q: 'ひらがなや漢字は変換されますか？',
    a: '変換されません。ひらがなと漢字には対応する半角文字が存在しないためです。同様に「ヰ」「ヱ」「ヵ」「ヶ」も半角がないため、そのまま残ります。',
  },
  {
    q: '入力した文字列はどこかに送信されますか？',
    a: '送信されません。変換はすべてお使いのブラウザ内（JavaScript）で行われ、サーバーには何も送られません。氏名や住所などを貼り付けても外部に出ることはありません。',
  },
  {
    q: 'ハイフンに見える記号が変換されないのはなぜですか？',
    a: '「−」（U+2212 マイナス記号）や「―」（ダッシュ）など、見た目がハイフンに似ていてもASCIIの「-」に対応しない文字は変換しません。住所表記などで意図せず別の文字に置き換わるのを避けるためです。全角ハイフン「－」（U+FF0D）は半角の「-」に変換されます。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '半角⇔全角 変換ツール',
      url: `${SITE_URL}/hankaku-zenkaku/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
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

      <h1>半角⇔全角 変換ツール</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        半角と全角をまとめて相互変換します。
        <strong>英数字・カタカナ・記号・スペースを種類ごとに選べる</strong>
        ので、「英数字だけ半角にしたい」といった指定にも対応できます。
      </p>

      <Converter />

      <AdUnit position="below-tool" />

      <h2>変換の対応表</h2>
      <p>このツールが変換する文字は次のとおりです。</p>
      <table>
        <thead>
          <tr>
            <th>種類</th>
            <th>半角</th>
            <th>全角</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>数字</td>
            <td>0123456789</td>
            <td>０１２３４５６７８９</td>
          </tr>
          <tr>
            <td>英字</td>
            <td>ABC / abc</td>
            <td>ＡＢＣ / ａｂｃ</td>
          </tr>
          <tr>
            <td>カタカナ</td>
            <td>ｱｲｳ ｶﾞｷﾞ ﾊﾟﾋﾟ</td>
            <td>アイウ ガギ パピ</td>
          </tr>
          <tr>
            <td>記号</td>
            <td>{'! " # $ % & ( ) - / : ? @ [ ] ^ _ { } ~'}</td>
            <td>{'！＂＃＄％＆（）－／：？＠［］＾＿｛｝～'}</td>
          </tr>
          <tr>
            <td>スペース</td>
            <td>半角スペース</td>
            <td>全角スペース（U+3000）</td>
          </tr>
        </tbody>
      </table>
      <div className="note">
        ひらがな・漢字、および半角が存在しないカタカナ（ヰ・ヱ・ヵ・ヶ）は変換されません。「−」（マイナス記号）や「―」（ダッシュ）のように、ハイフンに似ていてもASCIIに対応がない文字もそのまま残します。住所表記などが意図せず変わるのを避けるためです。
      </div>

      <h2>こんなときに使います</h2>
      <ul>
        <li>
          <strong>申請フォームの入力規則に合わせる</strong> —
          「英数字は半角、カナは全角」といった指定に一括で揃えられます
        </li>
        <li>
          <strong>CSVやExcelのデータを名寄せする</strong> —
          全角と半角が混ざっていると別データとして扱われるため、取り込み前に統一します
        </li>
        <li>
          <strong>半角カナを全角に直す</strong> —
          古い基幹システムから出力したデータや、FAX・帳票の文字起こしでよく発生します
        </li>
        <li>
          <strong>文字数制限を確認する</strong> —
          「全角2文字・半角1文字」で数えるフォーム向けに、変換前後の内訳を表示しています
        </li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hankaku-zenkaku" />

      <p style={{ fontSize: '0.9rem' }}>
        関連ツール：
        <Link href="/hebon-romaji/">ヘボン式ローマ字変換</Link>
        （ふりがなをパスポート表記のローマ字に変換します）
      </p>
    </>
  );
}
