import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { MAX_INPUT_BYTES, formatBytes } from '@/lib/json-seikei';
import Calculator from './Calculator';
import { ERROR_EXAMPLES, ZENKAKU_EXAMPLE } from './tables';

// 仕様: docs/features/json-seikei.md

const title = 'JSON 整形・チェック（オンライン）｜エラーの行と原因を日本語で表示';
const description =
  'JSONを貼るだけで整形・圧縮・構文チェック。エラーは行と原因を日本語で表示し、全角スペースや全角の引用符の混入も見つけて直します。送信・保存はしません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/json-seikei/` },
  robots: robotsFor('json-seikei'),
};

const faq = [
  {
    q: 'JSON にコメントは書けますか？',
    a: '書けません。JSON の仕様（RFC 8259・ECMA-404）には // や /* */ のコメントがありません。説明を残したいときは "_comment": "…" のようなキーを1つ足すのが一般的です。設定ファイルでコメントを使いたいなら、JSON ではなく JSONC や YAML など、コメントを許す形式を選んでください。',
  },
  {
    q: '最後の要素のあとにカンマを付けてもいいですか？',
    a: '付けられません。{"a": 1, "b": 2,} のように閉じかっこの直前にカンマがあると、JSON としては誤りです。JavaScript のコードでは許されるので混同しやすいところです。このツールはカンマの位置を指して「最後の要素のあとにカンマがあります」と出します。',
  },
  {
    q: "' と \" の違いは何ですか？",
    a: "JSON の文字列とキーは \" （半角のダブルクォーテーション）で囲む決まりで、' （シングルクォーテーション）は使えません。Python の辞書を print した結果や、JavaScript のオブジェクトをそのまま貼ると ' になっていることがあります。全角の “ ” も使えません（このツールの「全角を直す」で半角の \" に直せます）。",
  },
  {
    q: '大きいファイルも扱えますか？',
    a: `${formatBytes(MAX_INPUT_BYTES)} まで扱えます。それより大きいとブラウザが固まるおそれがあるので処理しません。200KB を超えると入力欄の色付けをやめ、全角の位置は一覧で出します。2MB を超えると、入力が止まってから少し待って処理します。`,
  },
  {
    q: '入力したデータは送信されますか？',
    a: '送信されません。整形・チェックはお使いのブラウザの中（JavaScript）だけで行い、入力した JSON をサーバーに送る処理はこのページにありません。保存もしないので、タブを閉じると消えます。社内の API の応答や個人情報を含むデータを貼っても外に出ません。確かめたい場合は、ページを開いたあとに通信を切ってから貼ってみてください。そのまま動きます。',
  },
];

const trail = breadcrumbFor('json-seikei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'JSON 整形・チェック', slug: 'json-seikei', description }),
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

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  // 改行は残しつつ、狭い画面では途中で折り返す（表が 360px からはみ出さないように）
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontSize: '0.85rem',
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>JSON 整形・チェック</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>貼った JSON はこのページの中だけで処理し、どこにも送りません。</strong>
        整形・1行に圧縮・キーの並べ替えと構文チェックができ、エラーは「何行目の何文字目で、たぶんこれが原因」と日本語で示します。Excel やチャットから貼ると混ざる全角スペース・全角の引用符も見つけて直します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>JSON を入力欄に貼り付けます（ファイルを選ぶ・ドラッグ＆ドロップでも読み込めます）。</li>
        <li>
          すぐに判定が出ます。緑なら正しい JSON、赤なら誤りのある行と原因の見当が出ます。全角の記号が混ざっているときは「全角を直す」を押してください。
        </li>
        <li>「整形」「1行に圧縮」「キーを並べ替え」を選び、「コピー」で結果を持ち出します。</li>
      </ol>
      <p>
        整形しても<strong>データの中身は変えません</strong>。大きな整数の ID（12345678901234567890）や 1.0・1e3 のような数の書き方、文字列の {'\\u00e9'} のようなエスケープ、同じキーが2回ある場合の両方の値を、元の書き方のまま出力します。JavaScript の JSON.parse と JSON.stringify で整形すると、これらは黙って変わってしまいます。
      </p>

      <h2>よくあるエラーと直し方</h2>
      <p>
        JSON のエラーで「Unexpected token」としか出ないとき、原因はほとんどが次のどれかです。パーサーは<strong>間違えた場所ではなく、間違いに気づいた場所</strong>を返すので、カンマ忘れは1行下を指されます。このツールは、気づいた場所に加えて原因の見当と、直すべき行を示します。
      </p>
      <table>
        <thead>
          <tr>
            <th>よくある誤り</th>
            <th>誤りの例</th>
            <th>このツールの表示</th>
            <th>直した形</th>
          </tr>
        </thead>
        <tbody>
          {ERROR_EXAMPLES.map((row) => (
            <tr key={row.situation}>
              <td style={{ textAlign: 'left' }}>{row.situation}</td>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.input}</code>
              </td>
              <td style={{ textAlign: 'left' }}>
                {row.where}：{row.hint}
              </td>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.fixed}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        <li>
          <strong>同じキーが2回ある</strong> — {'{"a": 1, "a": 2}'} は構文としては正しいのでエラーにはしませんが、注意として行を示します。RFC 8259 はキーを重複させないよう求めていて（SHOULD）、多くのプログラムは後ろの値だけを使います。
        </li>
        <li>
          <strong>先頭の BOM</strong> — Windows のメモ帳などで保存したファイルの先頭に付く見えない文字（U+FEFF）です。このツールは黙って取り除き、そのことを1行だけ知らせます。
        </li>
        <li>
          <strong>精度が落ちる数</strong> — 9007199254740991 を超える整数や有効桁 17 桁を超える小数は、JavaScript で読むと丸められます。このツールは書き方を変えずに出力し、注意を出します。
        </li>
      </ul>

      <h2>Excel・Word・チャットから貼ったときの全角の混入</h2>
      <p>
        Excel のセルや Word の文書、チャットのメッセージから JSON をコピーすると、<strong>全角スペース（U+3000）・全角の引用符（“ ”）・全角コロン（：）・全角カンマ（，）・読点（、）</strong>が混ざることがあります。日本語入力をオンにしたまま記号を打ったときや、Word の「入力オートフォーマット」で引用符が置き換わったときに起きます。画面では半角とほとんど見分けがつかず、JSON.parse は「Unexpected token」としか言いません。
      </p>
      <p>
        このツールは混ざった文字に下線と薄い背景を付け、行番号の横に「全角」の印を出します。「全角を直す」を押すと、文字列の外にあるものだけをまとめて半角に直します（{ZENKAKU_EXAMPLE.count} か所を直した例）。
      </p>
      <table>
        <tbody>
          <tr>
            <th>直す前</th>
            <td style={{ textAlign: 'left' }}>
              <code style={codeStyle}>{ZENKAKU_EXAMPLE.input}</code>
            </td>
          </tr>
          <tr>
            <th>直したあと</th>
            <td style={{ textAlign: 'left' }}>
              <code style={codeStyle}>{ZENKAKU_EXAMPLE.fixed}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>文字列の中身は変えません。</strong>"東京都　港区" の全角スペースや、"“至急”と連絡" の中の引用符はデータの一部なので、そのまま残します。全角の数字（１２３）と全角のマイナス（－・−）は、数値の位置にあるときだけ半角に直します。長音の「ー」はマイナスと見た目が似ていますが別の文字なので、直さずに「長音の ー が入っています」とだけ知らせます。直したあとは「元に戻す」で貼った直後の状態に戻せます。
      </p>
      <p>
        全角・半角の文字そのものをまとめて変換したいときは、<Link href="/hankaku-zenkaku/">半角⇔全角 変換</Link>を使ってください（こちらは JSON の構造を見ずに、すべての文字を変換します）。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="json-seikei" />

      <ToolMeta slug="json-seikei">
        JSON の文法は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc8259" target="_blank" rel="nofollow noopener noreferrer">
          RFC 8259「The JavaScript Object Notation (JSON) Data Interchange Format」
        </a>
        と{' '}
        <a
          href="https://ecma-international.org/publications-and-standards/standards/ecma-404/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          ECMA-404 The JSON data interchange syntax
        </a>
        にもとづいて当サイトが実装しました（外部のサービスやライブラリは使っていません）。
      </ToolMeta>
    </>
  );
}
