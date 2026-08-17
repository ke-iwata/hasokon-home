import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = '文字数カウント｜スペース・改行の有無／原稿用紙換算・目標文字数つき';
const description =
  '貼り付けた文章の文字数をその場でカウントする無料ツール。スペース・改行を含む数と含まない数を同時に表示し、行数・段落数・全角半角の内訳・UTF-8バイト数・400字詰め原稿用紙の枚数も出します。目標文字数を入れると残りと達成率が分かります。入力内容は送信されません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/mojisu-count/` },
};

const faq = [
  {
    q: 'スペースや改行は1文字として数えられますか？',
    a: '両方の数え方を同時に表示しています。上段が「スペース・改行を含む」文字数、下段が「スペース・改行を含まない」文字数です。含まない数では、半角スペース・タブ・改行のほかに全角スペース（U+3000）も除いています。日本語の文章では字下げに全角スペースを使うことが多く、それを1文字として数えると期待とずれるためです。',
  },
  {
    q: '絵文字や環境依存の漢字は何文字になりますか？',
    a: '1文字として数えます。絵文字や「𩸽」のような一部の漢字は、コンピュータ内部では2つの単位（サロゲートペア）で表されるため、単純なプログラムでは2文字と数えられてしまいます。このツールはコードポイント単位で数えるので、見た目どおり1文字になります。ただし「か」＋濁点のように分解して入力された文字や、肌の色を指定した絵文字などは、組み合わせている数だけ数えます。',
  },
  {
    q: 'Wordの文字数と数が合わないのはなぜですか？',
    a: 'Wordは「文字数（スペースを含めない）」「文字数（スペースを含める）」を独自の基準で数えており、脚注・テキストボックス・図の中の文字を含めるかどうかの設定もあります。改行や段落記号の扱いも異なります。このツールは「入力欄に貼り付けた文字そのもの」をコードポイント単位で数えるため、Wordの表示と数文字ずれることがあります。提出先の指定がWordの文字数である場合は、最後にWord側で確認してください。',
  },
  {
    q: '原稿用紙の枚数はどう計算していますか？',
    a: '改行を除いた文字数を400で割り、小数第1位まで表示しています（400字詰め＝20字×20行の原稿用紙）。実際の原稿用紙では、段落の終わりで行末の升目が空いたり、句読点が行頭に来ないよう調整したりするため、厳密な枚数は少し増えます。このツールは升目のシミュレーションはせず「だいたい何枚か」の目安として出しています。',
  },
  {
    q: 'X（旧Twitter）の文字数制限と数が合いません。',
    a: 'Xは「半角文字は0.5文字、全角文字は1文字」として数え、URLは実際の長さに関係なく固定の文字数として扱います。このツールの文字数は半角も全角も1文字として数えるため、同じ文章でも数が一致しません。全角・半角の内訳を表示しているので、半角の文字数を半分にして足せばXの数え方に近い値を出せます。',
  },
  {
    q: 'バイト数は何に使いますか？',
    a: 'データベースの桁数制限やファイルサイズの見積もりに使います。表示しているのはUTF-8でのバイト数で、半角英数字は1バイト、ひらがな・漢字は3バイト、絵文字は4バイトです。改行はLF（1バイト）に統一して数えています。Shift_JISやEUC-JPでのバイト数とは異なります。',
  },
  {
    q: '入力した文章はどこかに送信されますか？',
    a: '送信されません。数える処理はすべてお使いのブラウザ内（JavaScript）で行われ、サーバーには何も送られません。このサイトは静的なファイルだけで動いており、文章を受け取る仕組みそのものを持っていません。未公開の原稿や個人情報を含む文章でも、外部に出ることはありません。',
  },
];

const trail = breadcrumbFor('mojisu-count');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({
      name: '文字数カウント',
      slug: 'mojisu-count',
      description,
    }),
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

      <h1>文字数カウント</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        貼り付けた文章の文字数をその場で数えます。
        <strong>スペース・改行を含む数と含まない数を同時に表示</strong>
        し、行数・段落数・全角半角の内訳・バイト数・400字詰め原稿用紙の枚数もまとめて出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>数え方の約束</h2>
      <p>
        文字数の数え方はツールによって少しずつ違います。このツールが何をどう数えているかを先に示します。
      </p>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>数え方</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>文字数</td>
            <td>コードポイント単位（絵文字・環境依存の漢字も1文字）</td>
          </tr>
          <tr>
            <td>スペース</td>
            <td>「含む」では1文字。「含まない」では半角・全角・タブすべて除く</td>
          </tr>
          <tr>
            <td>改行</td>
            <td>CR / LF / CRLF を1文字に統一してから数える</td>
          </tr>
          <tr>
            <td>行数</td>
            <td>空行も1行。末尾の改行は行数を増やさない</td>
          </tr>
          <tr>
            <td>段落数</td>
            <td>空行（空白だけの行を含む）で区切られたかたまりの数</td>
          </tr>
          <tr>
            <td>全角・半角</td>
            <td>表示幅にもとづく判定（半角カナは半角、絵文字は全角）</td>
          </tr>
          <tr>
            <td>バイト数</td>
            <td>UTF-8。半角英数字1・かな漢字3・絵文字4バイト</td>
          </tr>
          <tr>
            <td>原稿用紙</td>
            <td>改行を除いた文字数 ÷ 400（升目の空きは考えない）</td>
          </tr>
        </tbody>
      </table>
      <div className="note">
        Windowsで作ったテキストの改行（CRLF）は、素朴に数えると1つの改行が2文字になります。このツールは改行コードを統一してから数えるので、貼り付け元による差は出ません。
      </div>

      <h2>こんなときに使います</h2>
      <ul>
        <li>
          <strong>エントリーシート・小論文の字数を合わせる</strong> —
          目標文字数を入れると、残り何文字かと達成率が出ます
        </li>
        <li>
          <strong>レポートを原稿用紙の枚数で確認する</strong> —
          「2000字はだいたい5枚」という換算をその場で確認できます
        </li>
        <li>
          <strong>ブログ・Web記事の分量を管理する</strong> —
          行数・段落数も出るので、1段落が長くなりすぎていないかを見られます
        </li>
        <li>
          <strong>入力欄の文字数制限に収める</strong> —
          全角・半角の内訳とバイト数の両方が分かるため、「全角100文字まで」「200バイトまで」のどちらの指定にも対応できます
        </li>
      </ul>

      <h2>文字数の目安</h2>
      <p>
        400字詰め原稿用紙での枚数と、よく指定される文字数の対応です。分量の見当をつけるときに使ってください。
      </p>
      <table>
        <thead>
          <tr>
            <th>文字数</th>
            <th>原稿用紙</th>
            <th>よくある用途</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>400字</td>
            <td>1枚</td>
            <td>短い感想文・要約</td>
          </tr>
          <tr>
            <td>800字</td>
            <td>2枚</td>
            <td>小論文・作文の定番の指定</td>
          </tr>
          <tr>
            <td>1200字</td>
            <td>3枚</td>
            <td>読書感想文（中学・高校）</td>
          </tr>
          <tr>
            <td>2000字</td>
            <td>5枚</td>
            <td>大学のレポート</td>
          </tr>
          <tr>
            <td>4000字</td>
            <td>10枚</td>
            <td>ゼミのレポート・長文記事</td>
          </tr>
        </tbody>
      </table>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="mojisu-count" />

      <p style={{ fontSize: '0.9rem' }}>
        関連ツール：
        <Link href="/hankaku-zenkaku/">半角⇔全角 変換</Link>
        （全角と半角を種類ごとにまとめて変換します）／
        <Link href="/hebon-romaji/">ヘボン式ローマ字変換</Link>
        （ふりがなをパスポート表記のローマ字に変換します）
      </p>

      <ToolMeta slug="mojisu-count" />
    </>
  );
}
