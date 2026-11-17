import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { bytesToBase64, encodeText } from '@/lib/base64';
import Converter from './Converter';

// 仕様: docs/features/base64-henkan.md

const title = 'Base64 エンコード・デコード｜日本語も文字化けせずに戻す（Shift_JIS・メール件名対応・送信なし）';
const description =
  'Base64を貼るだけで向きを自動判定し、日本語も文字化けさせずに戻します。UTF-8・Shift_JIS・ISO-2022-JPを自動判別、メールの件名の=?ISO-2022-JP?B?…?=、URL用のbase64url、data:画像のプレビューとファイル化まで。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/base64/` },
  robots: robotsFor('base64'),
};

// 本文の例は lib の関数で作る（手で書いた Base64 が間違っていないように）
const A = encodeText('あ').output;
const HASOKON = encodeText('hasokon').output;
const STD = bytesToBase64([0xfb, 0xff]);
const URLSAFE = bytesToBase64([0xfb, 0xff], 'base64url');

const faq = [
  {
    q: 'Base64 をデコードしたら日本語が文字化けする',
    a: `元の文字が、どの文字コードでバイト列にされたかが合っていないのが原因です。今はほとんど UTF-8 ですが、古いシステムやメールでは Shift_JIS・ISO-2022-JP（JIS）が残っています。ブラウザの atob() は1バイトを1文字として読むので、UTF-8 の日本語でもそのままでは化けます。このツールはバイト列に戻してから文字コードを自動で判別し、使った文字コードを画面に出します。合っていなければ手で切り替えられます。`,
  },
  {
    q: 'メールの件名が =?ISO-2022-JP?B?…?= になっていて読めない',
    a: 'メールの件名や差出人に日本語を入れるための「MIME エンコード」（RFC 2047 の encoded-word）です。=?文字コード?B?Base64?= か =?文字コード?Q?…?= の形で、メールソフトが読み取れないと記号のまま見えます。件名の行をそのまま上の入力欄に貼れば、ISO-2022-JP・UTF-8・Shift_JIS のどれでもほどいて読めます。いくつかに分かれていても、まとめて1行に戻します。',
  },
  {
    q: 'Base64 は暗号化ですか？',
    a: '暗号化ではありません。決まった表で文字に置き換えているだけなので、誰でも元に戻せます。パスワードや個人情報を「Base64 にしたから安全」とはなりません。パスワードの保存や受け渡しに使わないでください（強いパスワードを作るなら パスワード生成 へ）。',
  },
  {
    q: 'JWT の中身を見ても安全ですか？',
    a: 'このツールは JWT（ログインのトークンなど）をブラウザの中だけで読み、どこにも送らないので、見るだけなら安全です。ただし署名は検証していません。中身が読めても、本物のトークンとは限りません。また、トークンは認証情報そのものなので、他人やチャット・ほかのサイトに貼らないでください。',
  },
];

const trail = breadcrumbFor('base64');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'Base64 エンコード・デコード', slug: 'base64', description }),
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

const ext = { target: '_blank', rel: 'nofollow noopener noreferrer' } as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>Base64 エンコード・デコード</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>この画面の中だけで変換し、どこにも送りません。</strong>
        Base64 を貼るだけで向きを自動で判定し、日本語も文字化けさせずに戻します。Shift_JIS・ISO-2022-JP の古いデータやメールの件名（=?…?B?…?=）、URL 用の base64url、data: の画像にも対応しています。
      </p>

      <Converter />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>Base64 の文字列を入力欄に貼ります。すぐに変換され、デコードかエンコードかは自動で決まります（「Base64 として読みました」のように、判定を画面に出します）。</li>
        <li>デコードした結果の上に、使った文字コードが出ます。文字化けしているときは「文字コードを変える」で切り替えてください。</li>
        <li>日本語やふつうの文字を貼るとエンコードします。標準の Base64・base64url・76 文字の折り返しから選べます。</li>
        <li>画像や PDF を Base64 にしたいときは「ファイルを選ぶ」から選びます（5MB まで）。Base64 と、HTML・CSS に貼れる data: URI の両方を出します。</li>
      </ol>

      <h2>Base64 とは</h2>
      <p>
        Base64 は、画像やバイナリのデータ、日本語などを、英数字と「+ /」の 64 種類の文字だけで書く方法です（RFC 4648）。3 バイトずつ区切って 6 ビットずつ 4 文字に置き換えるので、<strong>大きさは元の約 4/3 倍</strong>になります。3 バイトに足りない端は「=」で埋めます。
      </p>
      <table>
        <thead>
          <tr>
            <th>元</th>
            <th>Base64</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>あ（UTF-8 の 3 バイト）</td>
            <td style={{ textAlign: 'left' }}>
              <code style={codeStyle}>{A}</code>
            </td>
          </tr>
          <tr>
            <td>hasokon（7 バイト）</td>
            <td style={{ textAlign: 'left' }}>
              <code style={codeStyle}>{HASOKON}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        日本語を Base64 にするときは、まず文字をバイト列にします。今はほぼ UTF-8 ですが、同じ「あ」でも Shift_JIS や ISO-2022-JP では別のバイト列になり、別の Base64 になります。デコードで文字化けするのは、この文字コードが合っていないときです。
      </p>

      <h2>base64url との違い</h2>
      <p>
        標準の Base64 の「+」「/」「=」は、URL の中では別の意味を持ちます。そこで URL やファイル名、JWT（ログインのトークン）では、「+」を「-」、「/」を「_」に置き換え、末尾の「=」を付けない base64url を使います。たとえば同じ 2 バイトが、標準では <code style={codeStyle}>{STD}</code>、base64url では <code style={codeStyle}>{URLSAFE}</code> です。このツールはどちらも自動で見分けて読みます。
      </p>

      <h2>メールの件名の =?…?= と JWT</h2>
      <p>
        メールの件名や差出人の名前は、日本語を <code style={codeStyle}>=?ISO-2022-JP?B?GyRCJCIbKEI=?=</code> のように書きます（MIME の encoded-word。RFC 2047）。上の入力欄に件名をそのまま貼れば、日本語に戻ります。
      </p>
      <p>
        JWT（RFC 7519）を貼ると、ヘッダーとペイロードを読みやすい JSON にし、有効期限（exp）などの時刻を日本時間に直して並べます。<strong>署名は検証していません。</strong>中身が読めても本物のトークンとは限らないので、扱いには注意してください。時刻の変換は <Link href="/unix-jikan/">UNIX時間 変換</Link>、JSON は <Link href="/json-seikei/">JSON 整形</Link> でも見られます。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>
            {f.a.includes('パスワード生成') ? (
              <>
                {f.a.split('パスワード生成')[0]}
                <Link href="/password/">パスワード生成</Link>
                {f.a.split('パスワード生成')[1]}
              </>
            ) : (
              f.a
            )}
          </p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="base64" />

      <ToolMeta slug="base64">
        Base64・base64url は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc4648" {...ext}>
          RFC 4648
        </a>
        、76 文字の折り返しは{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc2045" {...ext}>
          RFC 2045
        </a>
        、メールの件名の encoded-word は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc2047" {...ext}>
          RFC 2047
        </a>
        、JWT は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc7519" {...ext}>
          RFC 7519
        </a>
        、文字コードの変換は{' '}
        <a href="https://encoding.spec.whatwg.org/" {...ext}>
          WHATWG Encoding Standard
        </a>
        （ブラウザ標準の TextDecoder）にもとづいて当サイトが実装しました（外部のサービスやライブラリは使っていません）。
      </ToolMeta>
    </>
  );
}
