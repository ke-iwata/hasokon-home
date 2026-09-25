import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Converter from './Converter';
import { OPTION_SCOPES, PITFALLS } from './tables';

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
    q: '半角と全角の違いは何ですか？',
    a: 'Unicodeでは別々の文字として登録されているため、見た目が似ていても「A」と「Ａ」はまったく別の文字です。詳しくは本ページの「全角と半角は何が違うのか」をご覧ください。',
  },
  {
    q: '半角カナの濁点（ｶﾞ）はどうなりますか？',
    a: '向きによって1文字と2文字を行き来します。文字数が変わる理由と実際の挙動は「変換で起きやすい失敗」の表にまとめています。',
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
    a: 'ASCIIの「-」に対応がない別の文字だからです。どの文字が変換され、どの文字が残るかは「変換で起きやすい失敗」の表で確認できます。',
  },
  {
    q: 'ExcelのASC関数・JIS関数との違いは何ですか？',
    a: 'ExcelのASC関数は全角を半角に、JIS関数は半角を全角に変換しますが、どちらも変換できる文字すべてをまとめて処理します。このツールは英数字・カタカナ・記号・スペースを種類ごとに選べるため、「英数字だけ半角にしてカナは全角のまま残す」といった指定に1回で合わせられます。関数を入れた列を作る必要もありません。',
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

      <h2>全角と半角は何が違うのか</h2>
      <p>
        もともとは1バイトで表せる文字を「半角」、漢字と同じ幅を持つ2バイトの文字を「全角」と呼んでいました。
        いまは Unicode に
        <strong>
          半角・全角形（Halfwidth and Fullwidth Forms、U+FF00〜U+FFEF）
        </strong>
        という専用のブロックがあり、全角の英数字・記号と半角カナはここに入っています。
        つまり「Ａ」（U+FF21）と「A」（U+0041）は<strong>別の文字</strong>で、
        文字列として比較しても一致しません。CSVの名寄せや会員検索で同じ人が二重に出るのは、これが原因です。
      </p>
      <p>このツールが変換するのは、次の4種類です（いずれも既定でオンになっています）。</p>
      <ul>
        {OPTION_SCOPES.map((scope) => (
          <li key={scope.key}>
            <strong>{scope.label}</strong> — 半角 {scope.halfRange} ⇔ 全角 {scope.fullRange}
            {scope.defaultOn ? '' : '（既定ではオフ）'}
          </li>
        ))}
      </ul>
      <p>
        逆に、<strong>半角・全角形ブロックに入っていても変換しない文字があります。</strong>
        ブロックの末尾（U+FFE0〜U+FFE6）にある「￥」「￠」「￡」などは、ASCII の記号と1対1で対応しないため対象外です。ひらがな・漢字にも半角がないので変換されません。
      </p>

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

      <h2>変換で起きやすい失敗</h2>
      <p>
        見た目が似ている別の文字と、文字数が変わるカナが落とし穴になります。次の表は、実際にこのツールに1文字だけ入れた結果です。
      </p>
      <table>
        <thead>
          <tr>
            <th>文字</th>
            <th>コード位置</th>
            <th>このツールの扱い</th>
          </tr>
        </thead>
        <tbody>
          {PITFALLS.map((row) => (
            <tr key={`${row.sample}-${row.direction}`}>
              <td>
                {row.sample}（{row.name}）
              </td>
              <td>{row.sampleCode}</td>
              <td style={{ textAlign: 'left' }}>
                {row.changed ? (
                  <>
                    {row.direction === 'toHalf' ? '半角にすると' : '全角にすると'}「{row.converted}
                    」（{row.convertedCode}）
                    {row.lengthChanged
                      ? `に変わり、${[...row.sample].length}文字が${[...row.converted].length}文字になります。`
                      : 'に変わります。'}
                  </>
                ) : (
                  <>変換されず、そのまま残ります。</>
                )}
                {row.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        対策はどれも同じで、
        <strong>変換したあとに「変換されずに残った文字」を目で確かめる</strong>
        ことです。このツールは変換前後の文字数と全角・半角の内訳を出すので、
        <strong>文字数が想定と合わない＝どこかに変換されない文字が残っている</strong>
        というあたりをつけられます。カナを含む文字列で文字数が増えたときは、濁点が分かれた分だと考えてください。
      </p>

      <h2>こんなときに使います</h2>
      <ul>
        <li>
          <strong>申請フォームの入力規則に合わせる</strong> —
          「氏名のフリガナは全角カタカナ」「住所の番地は半角数字」「口座名義は半角カタカナ」のように、欄ごとに指定が違う書類でも、種類を選んで一括で揃えられます
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
