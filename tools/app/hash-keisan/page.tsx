import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { hashBytes, toHex, toSri } from '@/lib/hash/digest';
import Calculator from './Calculator';

// 仕様: docs/features/hash-keisan.md

const title = 'ハッシュ値 計算｜SHA-256・MD5・SHA-1をファイルも文字列も（一致の確認・送信なし）';
const description =
  '文字列やファイルの SHA-256・SHA-1・MD5・SHA-384・SHA-512 をまとめて計算。配布元の値や SHA256SUMS を貼ると一致を判定し、合わないときは末尾の改行・CRLF・BOM・Shift_JIS のどれが原因かを教えます。何GBのファイルでもブラウザの中だけで計算し、送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hash-keisan/` },
  robots: robotsFor('hash-keisan'),
};

/**
 * 速さの目安（FAQ「何GBまで」）。
 * 2026-11-20 に headless Chromium（クラウドの開発環境・Linux）で、このページに 1GB のファイルを選んで
 * 5種そろうまでを測った値（53.6 秒）。
 * テスト環境で Chrome・Edge・iPhone Safari の実測が取れたら差し替える（仕様「確かめること」）
 */
const SPEED_NOTE = 'パソコンの Chrome では、1GB のファイルで5種そろうまで約 55 秒でした（当サイトの開発環境での実測）';

// 本文の例は lib の関数で作る（手で書いた値が間違っていないように）
const enc = new TextEncoder();
const HELLO = toHex(hashBytes('sha256', enc.encode('hello')));
const HELLO_LF = toHex(hashBytes('sha256', enc.encode('hello\n')));
const SRI_EXAMPLE = toSri(hashBytes('sha384', enc.encode('alert("hasokon");')));

const faq = [
  {
    q: 'MD5 は元の文字列に戻せますか？',
    a: '戻せません。ハッシュ値は暗号化ではなく、元のデータを要約した「指紋」なので、計算式を逆にたどって元に戻すことはできません。ただし、短いパスワードやよくある言葉は、総当たりや「よくある言葉とハッシュ値の対応表」で推測されることがあります。MD5 から元に戻せるとうたうサイトは、この対応表を引いているだけです。',
  },
  {
    q: 'パスワードの保存に SHA-256 を使ってよいですか？',
    a: 'そのまま使うのはやめてください。SHA-256 は速く計算できるように作られているので、漏れたときに総当たりで推測されやすくなります。パスワードの保存には bcrypt・Argon2 などの「わざと遅くした」ハッシュとソルト（1件ごとの乱数）を使います。強いパスワードそのものを作るなら パスワード生成 へ。',
  },
  {
    q: 'ファイルはサーバーに送られますか？',
    a: '送りません。ファイルも文字列も、この端末のブラウザの中だけで計算します。保存もしません（閉じると消えます）。ページを開いたあとは、通信を切っても計算できます。',
  },
  {
    q: '同じ文字列なのに、ほかのサイトやコマンドと値が違います',
    a: '見た目が同じでも、末尾の改行・改行コード（LF と CRLF）・BOM・文字コード（UTF-8 と Shift_JIS）・前後の空白が違うと、値はまったく別になります。いちばん多いのは echo で作った値で、echo は末尾に改行を足します。上の「比べる値」に相手の値を貼ると、どれを変えれば一致するかを自動で試して教えます。',
  },
  {
    q: '何GBまで計算できますか？',
    a: `上限は設けていません。ファイル全体をメモリに読まず 4MB ずつ読みながら計算するので、数GB の ISO や動画でもブラウザが落ちにくくなっています。速さは端末によりますが、${SPEED_NOTE}。スマホでは時間がかかるので、途中で「中止」もできます。`,
  },
];

const trail = breadcrumbFor('hash-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'ハッシュ値 計算（SHA-256・MD5）', slug: 'hash-keisan', description }),
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
  wordBreak: 'break-all',
  fontSize: '0.85rem',
};

const ext = { target: '_blank', rel: 'nofollow noopener noreferrer' } as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>ハッシュ値 計算（SHA-256・MD5）</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>この画面の中だけで計算し、どこにも送りません。</strong>
        文字列やファイルの SHA-256・SHA-1・MD5・SHA-384・SHA-512 をまとめて出します。配布元が載せている値や SHA256SUMS を貼ると一致を判定し、合わないときは改行・BOM・文字コードのどれが原因かを教えます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>ハッシュ値とは</h2>
      <p>
        ハッシュ値は、データから決まった手順で作る短い「指紋」です。1文字でも1バイトでも違えば、まったく別の値になります。逆に、同じデータからは必ず同じ値が出ます。そのため、ダウンロードしたファイルが配布元のものと同じか（途中で壊れていないか・すり替えられていないか）を、ファイルそのものを比べずに確かめられます。
      </p>
      <p>
        たとえば「hello」の SHA-256 は <code style={codeStyle}>{HELLO}</code> ですが、末尾に改行が1つ付いた「hello↵」は <code style={codeStyle}>{HELLO_LF}</code> になります。
      </p>

      <h2>ダウンロードしたファイルの確かめ方</h2>
      <ol>
        <li>配布元のページで、ファイルの SHA-256 の値（SHA256SUMS などのファイルのこともあります）を探してコピーします。</li>
        <li>上の「ファイル」タブで、ダウンロードしたファイルを選びます。</li>
        <li>「比べる値」に 1. の値を貼ります。一致すれば緑で「一致しました」と出ます。SHA256SUMS の中身をそのまま貼ると、ファイル名で突き合わせてファイルごとに ✓／✗ を出します。</li>
      </ol>
      <p>
        MD5・SHA-1 は、わざと同じ値になる別のファイルを作る方法（衝突）が見つかっています。改ざんを確かめたいときは SHA-256 以上を使ってください。
      </p>

      <h2>値が合わないときの原因5つ</h2>
      <ol>
        <li>
          <strong>末尾の改行</strong>：コマンドの <code style={codeStyle}>echo</code> は末尾に改行を足します。<code style={codeStyle}>echo -n</code>（PowerShell は <code style={codeStyle}>-NoNewline</code>）で改行なしになります。
        </li>
        <li>
          <strong>改行コード</strong>：Windows は CRLF、Mac・Linux は LF。同じ文章でも改行の数だけバイトが違います。
        </li>
        <li>
          <strong>BOM</strong>：メモ帳などが UTF-8 の先頭に付ける見えない3バイト（EF BB BF）です。
        </li>
        <li>
          <strong>文字コード</strong>：日本語は UTF-8 と Shift_JIS でバイト列が違います。古いシステムやExcelの CSV は Shift_JIS のことがあります。
        </li>
        <li>
          <strong>前後の空白</strong>：コピーのときに付いた空白やタブ。
        </li>
      </ol>
      <p>
        文字列タブで「比べる値」を貼って一致しなかったときは、この5つを組み合わせて自動で試し、「末尾に改行を1つ足すと一致します」のように教えます。ファイルの場合は中身そのものが違うので、ダウンロードのやり直しか、版（バージョン）の違いを確かめてください。
      </p>

      <h2>SRI（integrity 属性）の書き方</h2>
      <p>
        CDN から読み込む JavaScript や CSS が書き換えられていないかをブラウザに確かめさせるのが、Subresource Integrity（SRI）です。ファイルの SHA-384 を Base64 にして「sha384-」を付けた値を、integrity 属性に書きます。上の結果の「SRI」の行が、そのまま貼れる形です。
      </p>
      <p>
        <code style={codeStyle}>{`<script src="https://example.com/app.js" integrity="${SRI_EXAMPLE}" crossorigin="anonymous"></script>`}</code>
      </p>
      <p>
        Base64 そのものの変換は <Link href="/base64/">Base64 エンコード・デコード</Link>、URL の % の形は <Link href="/url-decode/">URL デコード・エンコード</Link> で見られます。
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

      <RelatedTools current="hash-keisan" />

      <ToolMeta slug="hash-keisan">
        SHA-1・SHA-256・SHA-384・SHA-512 は{' '}
        <a href="https://csrc.nist.gov/pubs/fips/180-4/upd1/final" {...ext}>
          NIST FIPS 180-4
        </a>
        、MD5 は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc1321" {...ext}>
          RFC 1321
        </a>
        （安全性は{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc6151" {...ext}>
          RFC 6151
        </a>
        ・{' '}
        <a href="https://www.rfc-editor.org/rfc/rfc6194" {...ext}>
          RFC 6194
        </a>
        ）、SRI は{' '}
        <a href="https://www.w3.org/TR/SRI/" {...ext}>
          W3C Subresource Integrity
        </a>
        、Windows のコマンドは{' '}
        <a href="https://learn.microsoft.com/ja-jp/powershell/module/microsoft.powershell.utility/get-filehash" {...ext}>
          Microsoft Learn Get-FileHash
        </a>
        にもとづいて当サイトが実装しました（外部のサービスやライブラリは使っていません）。
      </ToolMeta>
    </>
  );
}
