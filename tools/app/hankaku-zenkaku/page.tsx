import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Converter from './Converter';

const title = '半角⇔全角 変換ツール｜英数字・カタカナ・記号をまとめて変換';
const description =
  '半角と全角をまとめて相互変換できる無料ツール。英数字・カタカナ・記号・スペースを種類ごとに選んで変換できます。半角カナの濁点（ｶﾞ→ガ）にも対応。入力内容は送信されません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hankaku-zenkaku/` },
  robots: robotsFor('hankaku-zenkaku'),
};

const faq = [
  {
    q: '英数字だけを半角にして、カタカナは全角のまま残せますか？',
    a: 'できます。「変換する文字の種類」でカタカナのチェックを外してください。住所や氏名の入力欄では「英数字は半角・カナは全角」と指定されることが多いため、種類ごとに選べるようにしています。',
  },
  {
    q: 'ひらがなや漢字は変換されますか？',
    a: '変換されません。ひらがなと漢字には対応する半角文字が存在しないためです。同様に「ヰ」「ヱ」「ヵ」「ヶ」も半角がないため、そのまま残ります。',
  },
  {
    q: 'Excel の関数で変換するのと何が違いますか？',
    a: 'Excel の ASC 関数（全角→半角）と JIS 関数（半角→全角）は、英数字・カナ・記号をまとめて変換し、種類ごとに選ぶことはできません。このツールは英数字・カタカナ・記号・スペースを別々にオン・オフできるので、「英数字だけ半角、カナは全角のまま」のような変換が1回で済みます。',
  },
  {
    q: '入力した文字列はどこかに送信されますか？',
    a: '送信されません。変換はすべてお使いのブラウザ内（JavaScript）で行われ、サーバーには何も送られません。氏名や住所などを貼り付けても外部に出ることはありません。',
  },
];

const trail = breadcrumbFor('hankaku-zenkaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '半角⇔全角 変換ツール',
      url: `${SITE_URL}/hankaku-zenkaku/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('hankaku-zenkaku'),
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
        ひらがな・漢字、および半角が存在しないカタカナ（ヰ・ヱ・ヵ・ヶ）は変換されません。見た目が似ていても変換しない文字は、下の「変換で起きやすい失敗」にまとめています。
      </div>

      <h2>全角と半角は何が違うのか</h2>
      <p>
        見た目の幅の違いに見えますが、コンピュータの中では<strong>まったく別の文字</strong>です。
        「A」（U+0041）と「Ａ」（U+FF21）は別の番号を持つので、検索・並べ替え・名寄せでは一致しません。
      </p>
      <p>
        全角の英数字・記号と半角カナは、Unicode の「半角・全角形」（U+FF00〜U+FFEF）という区画にまとまっています。
        全角の英数字・記号は、半角の「!」（U+0021）から「~」（U+007E）までと<strong>同じ並び順</strong>で置かれているので、
        このツールは番号を一定の差だけずらして変換しています。全角スペースは別の区画の U+3000 です。
      </p>
      <p>
        このツールは<strong>英数字・カタカナ・記号・スペースの4種類</strong>を別々に変換の対象にでき、最初はすべてオンになっています。
      </p>

      <h2>変換で起きやすい失敗</h2>
      <p>見た目が同じでも別の文字、というものがいくつかあります。このツールでの扱いは次のとおりです。</p>
      <ul>
        <li>
          <strong>濁点・半濁点付きのカナは文字数が変わる</strong> — 「ガ」を半角にすると「ｶ」＋「ﾞ」の2文字、「パ」は「ﾊ」＋「ﾟ」の2文字になります。
          全角に戻すと1文字に合成されます。文字数制限のある欄では、変換後の文字数を確かめてください
        </li>
        <li>
          <strong>「〜」と「～」は別の文字</strong> — 波ダッシュ「〜」（U+301C）には半角が無いので、どちら向きでも変換しません。
          全角チルダ「～」（U+FF5E）は半角の「~」と相互に変換します
        </li>
        <li>
          <strong>円記号とバックスラッシュ</strong> — 「¥」「￥」は変換しません。
          全角の「＼」は半角の「\」と相互に変換します。環境によって「\」が円記号の形で表示されることがあるので、見た目だけで判断しないでください
        </li>
        <li>
          <strong>ハイフンの仲間</strong> — 全角ハイフン「－」（U+FF0D）は半角の「-」に、長音「ー」は半角の「ｰ」になります（カタカナをオンにしているとき）。
          マイナス記号「−」（U+2212）やハイフン「‐」（U+2010）は、住所表記が意図せず変わらないよう変換しません
        </li>
        <li>
          <strong>全角スペース</strong> — 目で見分けにくい代表です。スペースをオンにすると、全角スペースと半角スペースを相互に変換します
        </li>
      </ul>

      <h2>こんなときに使います</h2>
      <ul>
        <li>
          <strong>申請フォームの入力規則に合わせる</strong> —
          カナ氏名は「全角カタカナ」、住所の番地や電話番号は「半角数字」のように、欄ごとに指定されることがよくあります。
          カタカナだけ、英数字だけ、と種類を選んで一括で揃えられます
        </li>
        <li>
          <strong>口座名義などを半角カナにする</strong> —
          振込データなどでは、口座名義を半角カナで求められることがあります。濁点が別の1文字になる点に注意してください
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
        <Link href="/mojisu-count/">文字数カウント</Link>
        （スペース・改行の有無や原稿用紙の枚数まで数えます）／
        <Link href="/hebon-romaji/">ヘボン式ローマ字変換</Link>
        （ふりがなをパスポート表記のローマ字に変換します）
      </p>

      <ToolMeta slug="hankaku-zenkaku" />
    </>
  );
}
