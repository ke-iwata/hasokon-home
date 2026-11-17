import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { HIGHLIGHT_LIMIT, MATCH_TIMEOUT_MS, MAX_TEXT_CHARS } from '@/lib/regex-check';
import { DIALECT_CHECKED_AT, DIALECT_ROWS, REGEX_PARTS, REGEX_SOURCES } from '@/lib/regex-parts';
import Checker from './Checker';

// 仕様: docs/features/seiki-hyogen-checker.md

const title = '正規表現チェッカー｜当たった箇所の色分け・置換をその場で（ひらがな・カタカナ・Excel・スプレッドシート対応・送信なし）';
const description =
  'パターンと文章を貼るだけで、当たった箇所の色分け・グループの中身・置換の結果をその場で。ひらがな・カタカナ・漢字・郵便番号の部品、Excel（REGEXTEST）・Googleスプレッドシート（REGEXMATCH）で動かない書き方の注意つき。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/seiki-hyogen/` },
  robots: robotsFor('seiki-hyogen'),
};

const nf = new Intl.NumberFormat('ja-JP');

const part = (id: string) => REGEX_PARTS.find((p) => p.id === id)!.pattern;

const faq = [
  {
    q: 'ひらがなだけかを判定するには？',
    a: `^${part('hiragana')}+$ を u フラグつきで使います。よく見かける [ぁ-ん] は ゔ・ゕ・ゖ が範囲の外にあるので落ちます。長音「ー」はひらがなではなく共通の文字なので、「らーめん」も通したいときは ^[${part('hiragana')}ー]+$ と足します。`,
  },
  {
    q: '\\d が全角数字に当たらないのはなぜ？',
    a: 'JavaScript の \\d は、u フラグを付けても ASCII の 0〜9 だけに当たります（ECMA-262 の決まり）。全角数字は [０-９] と書くか、半角・全角の両方なら [0-9０-９] と書きます。一方 \\s は全角スペースにも当たるので、半角スペースだけに絞りたいときは「 」そのものか [ 　] の形にします。',
  },
  {
    q: 'Excel で正規表現を使うには？',
    a: 'Microsoft 365 の Excel には REGEXTEST（当たるか）・REGEXEXTRACT（取り出す）・REGEXREPLACE（置き換える）があり、PCRE2 の書き方で動きます。大文字小文字を区別しないときは、REGEXTEST の 3 つめの引数に 1 を入れるか、式の先頭に (?i) を付けます。置換では $1・$2 でグループを参照します（例：=REGEXREPLACE(A1,"(\\w+),\\s(\\w+)","$2 $1")）。上の「使う先」で Excel を選ぶと、そのまま貼れる式を出します。',
  },
  {
    q: 'スプレッドシートで後読みが使えない',
    a: 'Google スプレッドシートの REGEXMATCH・REGEXEXTRACT・REGEXREPLACE は RE2 という書き方で動き、後読み (?<=…)・先読み (?=…)・後方参照 \\1 を使えません（どれも時間が読めなくなる書き方なので、RE2 は持たない決まりです）。後読みで「円の前の数字」を取るような式は、(\\d+)円 のようにグループで囲んで REGEXEXTRACT で取り出す形に書き直します。',
  },
  {
    q: 'メールアドレスを正規表現で厳密に判定できる？',
    a: 'できません。メールアドレスの決まり（RFC 5322）は引用符やコメントまで含み、正規表現 1 本には収まりません。このツールの「メールアドレス（ざっくり）」は「@ の前後に空白の無い文字があり、後ろに . がある」形を見るだけです。本当に届くかは、確認のメールを送って確かめるのが確実です。',
  },
];

const trail = breadcrumbFor('seiki-hyogen');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: '正規表現チェッカー', slug: 'seiki-hyogen', description }),
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

const ext = { target: '_blank', rel: 'nofollow noopener noreferrer' } as const;
const cell = (v: string | null) => (v === null ? '×（使えない）' : v);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>正規表現チェッカー</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>パターンと文章はこのブラウザの中だけで照合し、どこにも送らず、保存もしません。</strong>
        パターンと文章を貼るだけで、当たった箇所の色分け・グループの中身・置換の結果をその場で出します。Excel・Google スプレッドシートで動かない書き方は、先に注意を出します。
      </p>

      <Checker />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>パターンを入れます（/…/gu の形で貼るとフラグも読み取ります）。日本語の部品のボタンを押すと、カーソルの位置に式を差し込みます。</li>
        <li>試す文章を貼ります。入力が止まるとすぐに照合し、当たった箇所に色を塗って件数を出します。</li>
        <li>使う先（JavaScript・Excel・スプレッドシート）を選ぶと、そこで動かない書き方の注意と、そのまま貼れる式が出ます。置換するときは「置換もする」を入れます。</li>
      </ol>

      <h2>よく使う形の早見表</h2>
      <p>どれも u フラグ（または v フラグ）を付けて使う形です。</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>探したいもの</th>
              <th>式</th>
              <th>注意</th>
            </tr>
          </thead>
          <tbody>
            {REGEX_PARTS.map((p) => (
              <tr key={p.id}>
                <td style={{ textAlign: 'left' }}>{p.label}</td>
                <td style={{ textAlign: 'left' }}>
                  <code>{p.pattern}</code>
                </td>
                <td style={{ textAlign: 'left' }}>{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>使う先の違い（JavaScript・Excel・スプレッドシート）</h2>
      <p>
        このツールの当たり方はブラウザの JavaScript の正規表現です。Excel（Microsoft 365）の REGEXTEST・REGEXEXTRACT・REGEXREPLACE は PCRE2、Google スプレッドシートの REGEXMATCH・REGEXEXTRACT・REGEXREPLACE は RE2 という別の書き方で動くので、同じ式でも動かないことがあります。違いは注意として出しますが、<strong>最後は使う先で確かめてください</strong>（{DIALECT_CHECKED_AT} 時点の各社の説明による）。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>書き方</th>
              <th>JavaScript</th>
              <th>Excel（PCRE2）</th>
              <th>スプレッドシート（RE2）</th>
            </tr>
          </thead>
          <tbody>
            {DIALECT_ROWS.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'left' }}>{r.label}</td>
                <td style={{ textAlign: 'left' }}>{r.js}</td>
                <td style={{ textAlign: 'left' }}>{cell(r.excel)}</td>
                <td style={{ textAlign: 'left' }}>{cell(r.sheets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        置換の文字列は、Excel・スプレッドシートの REGEXREPLACE でも $1・$2 でグループを参照します（Microsoft サポートの REGEXREPLACE 関数の例「$2, $1」で {DIALECT_CHECKED_AT} に確認。Google のヘルプには置換文字列の書き方の記載がありません）。JavaScript だけの $&lt;名前&gt;・$&amp;・$`・$&apos; を使うと注意を出します。
      </p>

      <h2>重いパターンは {MATCH_TIMEOUT_MS / 1000} 秒で止める</h2>
      <p>
        (a+)+$ のように「繰り返しの中に繰り返し」がある式を長い文章に当てると、試す組み合わせが爆発的に増えて、ブラウザのタブごと固まることがあります（破滅的バックトラック）。このツールは照合を画面とは別のスレッド（Web Worker）で行い、{MATCH_TIMEOUT_MS / 1000} 秒を超えたら止めて知らせます。入れ子の繰り返しは、走らせる前に字面でも見つけて注意を出します。
      </p>

      <h2>扱える大きさ</h2>
      <p>
        試す文章は {nf.format(MAX_TEXT_CHARS)} 字まで（超えたら先頭だけで試します）。当たった件数はすべて数えますが、色を塗る・一覧に出すのは最初の {nf.format(HIGHLIGHT_LIMIT)} 件までです。改行は Windows の CRLF でも LF にそろえて試します。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p>
        置換したあとの文章は<Link href="/text-hikaku/">テキスト比較</Link>で元と見比べられます。全角英数字をまとめて半角にするなら
        <Link href="/hankaku-zenkaku/">半角⇔全角 変換</Link>、文字数は<Link href="/mojisu-count/">文字数カウント</Link>が使えます。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="seiki-hyogen" />

      <ToolMeta slug="seiki-hyogen">
        出典（{DIALECT_CHECKED_AT} 取得）：
        {REGEX_SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? '・' : ''}
            <a href={s.url} {...ext}>
              {s.label}
            </a>
          </span>
        ))}
        。照合はお使いのブラウザの RegExp で行い、外部のサービスとの通信はありません。
      </ToolMeta>
    </>
  );
}
