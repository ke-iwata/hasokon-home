import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { TRACKING_PARAMS, encodeLine } from '@/lib/url-decode';
import Calculator from './Calculator';
import { CHARSET_EXAMPLES, TROUBLE_EXAMPLES } from './tables';

// 仕様: docs/features/url-decode-encode.md

const title = 'URLデコード・エンコード｜文字化けした%E3…を日本語に戻す（Shift_JIS対応・送信なし）';
const description =
  '%E3%81%82のような文字化けしたURLを貼るだけで日本語に戻します。Shift_JIS・EUC-JPの古いURLも自動判別、クエリを表に分解、utm_やfbclidを外した共有用URL、日本語ドメイン(xn--)の変換。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/url-decode/` },
  robots: robotsFor('url-decode'),
};

const A = encodeLine('あ').text;

const faq = [
  {
    q: `${A} のような文字を日本語に戻すには？`,
    a: `上の入力欄に貼るだけで戻ります。${A} は「あ」を UTF-8 の3バイトで書いたもので、日本語はたいてい1文字が %XX の3つ分（9文字）になります。URL の一部だけでも、URL まるごとでも、複数行をまとめて貼っても変換できます。`,
  },
  {
    q: 'デコードしても文字化けが直らないのはなぜ？',
    a: 'よくある原因は3つです。(1) Shift_JIS や EUC-JP で書かれた古いサイト・掲示板・自治体サイトの URL を UTF-8 として読んでいる。(2) 2回エンコードされていて、%25E3… のように % 自体が %25 になっている。(3) コピーのときに末尾が欠けて、文字の途中で切れている。このツールは文字コードを自動で判別し、2回エンコードされていれば「もう1回デコード」を出し、途中で切れた位置に印を付けます。',
  },
  {
    q: '+ と %20 の違いは？',
    a: 'どちらも空白を表しますが、+ を空白として扱うのはフォーム送信のクエリ（? より後ろ）だけの約束です。パスの + はただの + なので、このツールは自動のとき ? より前の + を残し、後ろの + を空白に戻します。設定で切り替えられます。',
  },
  {
    q: 'utm_source や fbclid は消しても大丈夫？',
    a: 'どこから来たかを数えるための印で、ページの中身は変わりません。外すと共有先で URL が短く見え、誰がどこから共有したかが相手のサイトに伝わりにくくなります。ただし、サイトによっては外すと動かないパラメータもあるので、このツールは外すものを表で選べるようにしています（id・q・page などページを動かすものは最初から外しません）。',
  },
  {
    q: 'xn-- で始まるドメインは何？',
    a: '日本語ドメインを英数字で書いたもの（Punycode）です。たとえば「日本語.jp」は xn--wgv71a119e.jp になります。このツールは xn-- を日本語に戻して並べます。1つのラベルの中にキリル文字の а のような見た目の似た別の文字が混ざっていると注意を出します。ただし、注意が出ないことは本物のサイトである保証ではありません（全部を別の文字で書いたドメインは見分けられません）。',
  },
];

const trail = breadcrumbFor('url-decode');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'URLデコード・エンコード', slug: 'url-decode', description }),
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
  overflowWrap: 'anywhere',
  fontSize: '0.85rem',
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>URLデコード・エンコード</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>貼った URL・文字はこのブラウザの中だけで変換し、どこにも送らず、保存もしません。URL を開くこともありません。</strong>
        文字化けした %E3%81%82… を貼るだけで日本語に戻し、Shift_JIS・EUC-JP の古い URL も自動で判別します。クエリを表に分解し、utm_ や fbclid を外した共有用の URL も出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>URL エンコードとは</h2>
      <p>
        URL に使える文字は英数字と一部の記号だけです。そこで日本語や空白などは、文字を UTF-8 のバイト列にして、1バイトずつ % と16進数2桁で書きます。たとえば「あ」は <code style={codeStyle}>{A}</code> です。これを元の文字に戻すのがデコードです。
      </p>
      <p>同じ文字でも、文字コードが違うと %XX の並びが変わります。今のサイトはほぼ UTF-8 ですが、古い掲示板や CGI の検索では Shift_JIS・EUC-JP が残っています。</p>
      <table>
        <thead>
          <tr>
            <th>文字コード</th>
            <th>「東京」をエンコードした形</th>
          </tr>
        </thead>
        <tbody>
          {CHARSET_EXAMPLES.map((row) => (
            <tr key={row.charset}>
              <td>{row.charset}</td>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.encoded}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>使い方</h2>
      <ol>
        <li>URL や %XX の文字列を入力欄に貼ります。すぐに変換され、向き（デコード／エンコード）は自動で決まります。</li>
        <li>結果の上に、使った文字コードが出ます。決めきれないときは候補を並べるので、読める文字になっているほうを選んでください。</li>
        <li>URL を1つ貼ったときは、下にホスト・パス・クエリの表と「共有用のきれいな URL」が出ます。</li>
        <li>日本語を URL に入れたいときは、日本語を貼るとエンコードします。検索語やファイル名なら「URL の部品として」を選びます。</li>
      </ol>

      <h2>デコードしても直らないとき</h2>
      <table>
        <thead>
          <tr>
            <th>よくある原因</th>
            <th>貼った文字</th>
            <th>UTF-8 で1回戻すと</th>
            <th>このツールの結果</th>
          </tr>
        </thead>
        <tbody>
          {TROUBLE_EXAMPLES.map((row) => (
            <tr key={row.situation}>
              <td style={{ textAlign: 'left' }}>
                {row.situation}
                <br />
                <span className="hint">{row.note}</span>
              </td>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.input}</code>
              </td>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.asUtf8}</code>
              </td>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.tool}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>共有用のきれいな URL で外すもの</h2>
      <p>
        広告や SNS から開いたページの URL には、どこから来たかを数えるための印が付いています。ページの中身には関係しないので、共有するときは外しても同じページが開きます。元の URL は書き換えず、外したものは表で取り消し線にして、チェックを外せば残せます。
      </p>
      <ul>
        <li>
          <code style={codeStyle}>utm_</code> で始まるもの（utm_source・utm_medium・utm_campaign など）
        </li>
        {TRACKING_PARAMS.map((p) => (
          <li key={p.key}>
            <code style={codeStyle}>{p.key}</code> — {p.reason}
          </li>
        ))}
      </ul>
      <p>
        id・q・page など、ページを動かすのに要るものは外しません。ref・source のように、サイトによっては中身に効くものも外しません。検索結果の「ハイライトへのリンク」（#:~:text=）は残し、ハイライトする文字を表に出します。きれいにした URL は <Link href="/qr-code/">QR コード作成</Link> に貼り直せば QR コードにできます。
      </p>

      <h2>見た目の似た文字の注意</h2>
      <p>
        ラテン文字の a とキリル文字の а のように、見た目がほとんど同じ別の文字があります。これを混ぜたドメインはフィッシングで使われることがあります。このツールは、ドメインの1つのラベルに別の文字体系が混ざっていると注意を出します。日本語とラテン文字の混在（日本-shop.jp など）は普通にあるので注意しません。
      </p>
      <p>
        <strong>注意が出ないことは、本物のサイトである保証ではありません。</strong>ラベル全体を別の文字体系で書いたもの（全部キリル文字で書いたものなど）は、この方法では見分けられません。また、javascript: や data: で始まる URL は、開くとプログラムが動くので赤い印を出します（このツールは URL を開きません）。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="url-decode" />

      <ToolMeta slug="url-decode">
        %XX の書き方は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc3986" target="_blank" rel="nofollow noopener noreferrer">
          RFC 3986
        </a>
        、文字コードの変換は{' '}
        <a href="https://encoding.spec.whatwg.org/" target="_blank" rel="nofollow noopener noreferrer">
          WHATWG Encoding Standard
        </a>
        （ブラウザ標準の TextDecoder）、日本語ドメインは{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc3492" target="_blank" rel="nofollow noopener noreferrer">
          RFC 3492（Punycode）
        </a>
        にもとづいて当サイトが実装しました（外部のサービスやライブラリは使っていません）。
      </ToolMeta>
    </>
  );
}
