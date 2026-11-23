import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';
import { GRAY_ON_WHITE, MID_GRAY, NEAREST_777 } from './tables';

// 仕様: docs/features/color-code-contrast.md

const title = 'カラーコード変換・コントラスト比チェッカー｜HEX・RGB・HSL・CMYK、WCAG 2.2 の AA／AAA 判定（送信なし）';
const description =
  'HEX・RGB・HSL・CMYKを貼るだけで形式を自動判定して相互変換。文字色と背景色のコントラスト比をWCAG 2.2のAA／AAAで判定し、落ちたら色相を保って合格する一番近い色を出します。色の見え方の近似、JIS慣用色名・CSSの色名も。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  // クエリ（?c= / ?fg=&bg=）の組み合わせは無数にあるので、canonical はクエリなしに固定する
  alternates: { canonical: `${SITE_URL}/color-code/` },
  robots: robotsFor('color-code'),
};

const faq = [
  {
    q: 'CMYK に変換した色が、印刷すると画面と違って見えます',
    a: 'このツールの CMYK は、ICC プロファイル（紙やインクの特性）を使わない簡易変換です。同じ CMYK の値でも、紙・インク・印刷機で色が変わります。印刷所に入稿する色は、印刷所が指定する方法（カラープロファイル・色見本）で決めてください。',
  },
  {
    q: '透明度つきの色のコントラスト比は？',
    a: '画面に見えるのは、透明な文字色が背景色と混ざった色です。このツールは文字色を背景色に重ねた色で比を出します（背景色にも透明度があるときは、白い地に重ねます）。実際のページで背景色の下にさらに画像や別の色があるときは、その色を背景色に入れて測ってください。',
  },
  {
    q: 'JIS X 8341-3 と WCAG の関係は？',
    a: 'JIS X 8341-3:2016 は、WCAG 2.0 と同じ内容の日本の規格です。コントラストの基準（達成基準 1.4.3）は、通常の文字で 4.5:1 以上と同じです。自治体のサイトは、総務省の「みんなの公共サイト運用ガイドライン」で適合レベル AA を目標にしています。WCAG 2.1・2.2 で足された基準（アイコン・ボタンの枠の 3:1 など、1.4.11）は、JIS X 8341-3:2016 にはまだ入っていません。',
  },
  {
    q: 'ロゴや写真の中の文字も対象ですか？',
    a: 'ロゴ・商標の文字は、コントラストの基準の対象外です。写真の中の文字・飾りの文字（意味を伝えない装飾）も対象外とされています。一方、画像にした見出しやボタンの文字（文字画像）は、通常の文字と同じ基準が要ります。',
  },
  {
    q: 'この判定で「法的に適合した」と言えますか？',
    a: '言えません。コントラスト比は、アクセシビリティの点検項目の1つにすぎず、ほかにも代替テキスト・キーボード操作・見出しの構造など多くの基準があります。このツールは点検の目安です。なお、WCAG 3 で検討中の APCA という別の計算方法がありますが、まだ草案なので、このツールは WCAG 2.2 の比だけで判定しています。',
  },
];

const trail = breadcrumbFor('color-code');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'カラーコード変換・コントラスト比チェッカー', slug: 'color-code', description }),
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

const mark = (pass: boolean) => (pass ? '○ 合格' : '× 不合格');

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>カラーコード変換・コントラスト比チェッカー</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>入れた色はこのブラウザの中だけで計算し、どこにも送りません。</strong>
        HEX・RGB・HSL・CMYK・色の名前を貼るだけで形式を自動で判定して相互に変換し、文字色と背景色のコントラスト比を WCAG 2.2 の AA／AAA で判定します。基準に届かないときは、色相を変えずに明るさだけ動かして合格する一番近い色を出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>コントラスト比とは</h2>
      <p>
        文字色と背景色の明るさの差を、1:1（同じ色）から 21:1（黒と白）までの数で表したものです。Web のアクセシビリティの国際的な指針 WCAG（W3C）が決めた計算で、色を「相対輝度」という明るさの値にしてから、明るいほうに 0.05 を足したものを、暗いほうに 0.05 を足したもので割ります。
      </p>
      <p>
        同じ灰色でも、1段の差で合否が分かれることがあります。白い背景に対する灰色の比は次のとおりです（このツールで計算した値）。
      </p>
      <table>
        <thead>
          <tr>
            <th>文字色</th>
            <th>比</th>
            <th>通常の文字 AA</th>
            <th>通常の文字 AAA</th>
            <th>大きな文字 AA</th>
          </tr>
        </thead>
        <tbody>
          {GRAY_ON_WHITE.map((row) => (
            <tr key={row.fg}>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.fg}</code>
              </td>
              <td>{row.ratio} : 1</td>
              <td>{mark(row.normalAA)}</td>
              <td>{mark(row.normalAAA)}</td>
              <td>{mark(row.largeAA)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <code style={codeStyle}>#777777</code> は 4.5 にわずかに届かず、色相を保って一番近い合格の色は <code style={codeStyle}>{NEAREST_777}</code> です。判定は表示を丸める前の値で行うので、4.499 を「4.50」と表示して合格にすることはありません。
      </p>

      <h2>AA と AAA の違い</h2>
      <p>
        WCAG の達成基準には、A・AA・AAA の3つの適合レベルがあります。コントラストでは、AA（達成基準 1.4.3）が通常の文字で 4.5 以上、AAA（1.4.6）が 7 以上です。多くの企業・自治体のサイトは AA を目標にしています。AAA は、すべてのページで満たすのが難しい場合があるとされ、サイト全体の目標にすることは求められていません。
      </p>
      <p>
        文字以外の部品（アイコン・入力欄やボタンの枠・グラフの線など、見分けるのに要るもの）は、WCAG 2.1 から加わった 1.4.11 で、隣り合う色と 3 以上が求められます。
      </p>
      <p>
        どちらか一方の明るさを動かすだけでは届かない組み合わせもあります。たとえば背景が <code style={codeStyle}>{MID_GRAY.bg}</code> だと、文字を白にしても {MID_GRAY.white}、黒にしても {MID_GRAY.black} で、AAA の 7 には文字色をどう変えても届きません{MID_GRAY.reachable ? '' : '（このツールは「背景色側を変えてください」と出します）'}。
      </p>

      <h2>「大きな文字」の 24px・18.66px はどこから来たか</h2>
      <p>
        WCAG は「大きな文字」を、18 ポイント以上、または太字で 14 ポイント以上と決めています。1 ポイントは 1/72 インチ、CSS の 1px は 1/96 インチなので、18pt × 96 ÷ 72 = 24px、14pt × 96 ÷ 72 ≒ 18.66px になります。大きな文字は形が見分けやすいので、基準がゆるく（AA で 3、AAA で 4.5）なっています。
      </p>
      <p>
        ただし、日本語の漢字は画数が多く、同じ大きさでも英字より細かいので、見出し以外はなるべく通常の文字の基準（4.5）で考えるのが安全です。
      </p>

      <h2>使い方</h2>
      <ol>
        <li>「色の変換」に色を貼ると、形式（HEX・RGB・HSL・CMYK・色の名前）を自動で判定し、HEX・RGB・HSL・HSV・CMYK・oklch() に変換します。それぞれの右の「コピー」でコピーできます。</li>
        <li>「コントラスト比」に文字色と背景色を入れると、比と AA／AAA の判定、見本の文が出ます。「⇅ 入れ替え」で文字色と背景色を入れ替えます。</li>
        <li>基準に届かないときは、判定表の下に「合格する一番近い色」が文字色側・背景色側それぞれ出ます。「この色に替える」でその色になります。</li>
        <li>アドレスバーの URL（<code style={codeStyle}>?fg=1a1a1a&amp;bg=ffffff</code> の形）をそのまま共有・ブックマークできます。URL には色の値だけが入り、どこにも送られません。</li>
      </ol>
      <p>
        対応ブラウザ（Chrome・Edge など）では「スポイト」で画面上の色を拾えます。HSL は内部では丸めずに計算し、表示だけを小数1桁に丸めています。画像のサイズや縦横比は <Link href="/aspect-ratio/">縦横比 計算</Link>、<Link href="/gazo-resize/">画像リサイズ・圧縮</Link> で調べられます。
      </p>

      <h2>色の見え方のちがい（近似）</h2>
      <p>
        色の感じ方には個人差があり、赤と緑、青と黄などが見分けにくい人もいます。このツールは、P型（1型2色覚）・D型（2型2色覚）・T型（3型2色覚）とモノクロでの見え方を、研究で使われている近似式（Brettel・Viénot らの方法）で並べます。シミュレーションは目安で、見え方には個人差があります。診断ではありません。色だけで情報を伝えず、文字や記号を添えるのが基本です（WCAG 1.4.1）。
      </p>

      <h2>近い色の名前について</h2>
      <p>
        CSS の色名（CSS Color Module Level 4 の 148 色）と、JIS 慣用色名（JIS Z 8102:2001「物体色の色名」の慣用色名）から、色差（CIEDE2000）が小さい3つを出します。JIS 慣用色名は規格ではマンセル値で決められていて、画面の色（sRGB）の値は決められていません。このツールの値は、マンセル値から Munsell Renotation Data（RIT Munsell Color Science Laboratory）を使って換算した近似です。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="color-code" />

      <ToolMeta slug="color-code">
        コントラスト比と判定の基準は{' '}
        <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="nofollow noopener noreferrer">
          WCAG 2.2（W3C 勧告）
        </a>
        （達成基準 1.4.3・1.4.6・1.4.11）、色の変換と色名は{' '}
        <a href="https://www.w3.org/TR/css-color-4/" target="_blank" rel="nofollow noopener noreferrer">
          CSS Color Module Level 4
        </a>
        、JIS 慣用色名の名前とマンセル値は JIS Z 8102:2001「物体色の色名」、その sRGB の近似値は{' '}
        <a href="https://www.rit-mcsl.org/MunsellRenotation/real.dat" target="_blank" rel="nofollow noopener noreferrer">
          Munsell Renotation Data（RIT Munsell Color Science Laboratory）
        </a>
        からの換算、色の見え方は Brettel, Viénot &amp; Mollon (1997)・Viénot, Brettel &amp; Mollon (1999) の方法、色差は CIEDE2000 にもとづいて当サイトが実装しました（外部のサービスやライブラリは使っていません）。日本の規格との関係は JIS X 8341-3:2016 と総務省「みんなの公共サイト運用ガイドライン」によります。
      </ToolMeta>
    </>
  );
}
