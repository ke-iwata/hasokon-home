import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { LOOKUP_16_9, LOOKUP_COMPACT } from '@/lib/aspect-ratio';
import Calculator from './Calculator';

const title = 'アスペクト比 計算機・早見表｜16:9のサイズ変換と一覧';
const description =
  '幅と高さ(px)からアスペクト比（16:9・4:3など）を最簡分数で計算。16:9・9:16の幅から高さを引く逆引き早見表（16:9のサイズ一覧）、比率を保ったままのサイズ変換、4:3から16:9への変換のやり方、CSSのaspect-ratioコピー用コードに対応した無料ツールです。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/aspect-ratio/` },
};

const faq = [
  {
    q: '16:9と16:10は何が違いますか？',
    a: '16:9（1920x1080など）はテレビ・YouTube・多くのノートPCで使われる標準的な比率です。16:10（1920x1200など）はそれより縦に少し長く、作業領域を広く取れるためPCモニターで採用されることがあります。動画コンテンツは16:9が主流なので、16:10の画面で全画面再生すると上下に黒帯が出ます。',
  },
  {
    q: 'SNSに投稿する画像・動画の推奨サイズは？',
    a: 'YouTubeは16:9（1920x1080）、TikTok・YouTubeショート・Instagramリールは9:16（1080x1920）、Instagramフィードは1:1（1080x1080）または縦長4:5（1080x1350）、X（旧Twitter）は16:9が無難です。プラットフォームの仕様は変わることがあるため、最新の公式ヘルプも確認してください。',
  },
  {
    q: 'CSSでアスペクト比を指定するには？',
    a: 'aspect-ratioプロパティを使い、「aspect-ratio: 16 / 9;」のように書きます。幅だけ指定すれば高さが自動で決まるため、レスポンシブな動画埋め込みやカードのサムネイルに便利です。主要ブラウザすべてでサポートされています。',
  },
  {
    q: '「近い比率」と表示されるのはなぜですか？',
    a: '入力したサイズの比が、よく使う比率と完全には一致しないためです。例えば1919x1080は16:9とわずかにずれています。スクリーンショットの端が1px欠けた場合などによく起こります。表示されるずれ（%）が小さければ、実用上はその比率として扱って問題ありません。',
  },
  {
    q: 'アスペクト比と解像度はどう違いますか？',
    a: 'アスペクト比は「形（縦横の比率）」、解像度は「ピクセルの総数（細かさ）」です。1920x1080と1280x720はどちらも同じ16:9で、形は同じまま解像度だけが違います。画面にきれいに収まるかどうかはアスペクト比で決まり、拡大したときの精細さは解像度で決まる、と分けて考えると整理しやすくなります。',
  },
  {
    q: '16:9で幅1280pxのとき高さは？',
    a: '720pxです。16:9の高さは「幅×9÷16」で求められるので、1280×9÷16＝720となります。同じ式で幅1920なら1080、幅3840なら2160です。9:16（縦動画）は縦横が入れ替わるだけなので、幅720pxなら高さ1280pxになります。よく使う幅の一覧は、このページの「16:9・9:16の逆引き早見表」にまとめてあります。',
  },
  {
    q: '1920x1080はなぜ16:9なのですか？',
    a: '1920と1080の最大公約数が120で、両方を120で割ると16と9になるからです（1920÷120＝16、1080÷120＝9）。同じように1280x720は40で割ると16:9、3840x2160は240で割ると16:9になります。アスペクト比は「約分した後の形」なので、解像度が違っても約分の結果が同じなら同じ比率です。',
  },
  {
    q: '4:3の画像を16:9にするには？',
    a: '比率そのものを変えるので、必ず「どこかを削る」か「どこかを足す」ことになります。方法は3つで、上下を切り落とすトリミング（画質は落ちないが被写体の頭や足元が切れる）、左右に余白（黒帯・ぼかし背景）を足すパディング（全体を残せるが余白が目立つ）、縦横を独立して引き伸ばす方法（人物や文字が横に伸びて見えるため実務では非推奨）です。写真は基本トリミング、資料やスクリーンショットは余白を足す方が安全です。なお同じ比率のままサイズだけ変えたい場合は、このページの計算機の「この比率のままサイズを変えると？」を使ってください。',
  },
  {
    q: 'A4など印刷用紙のアスペクト比は？',
    a: 'A判・B判の用紙はすべて1:√2（約1:1.414）で、長辺を半分に折っても同じ比率になるのが特徴です。デジカメ写真の3:2や画面の16:9とは比率が合わないため、写真をA4いっぱいに印刷すると端が切れるか余白が出ます。フチなし印刷では用紙の比率に合わせて事前にトリミングしておくと仕上がりを調整できます。',
  },
];

const trail = breadcrumbFor('aspect-ratio');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'アスペクト比計算機',
      url: `${SITE_URL}/aspect-ratio/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('aspect-ratio'),
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

      <h1>アスペクト比計算機</h1>
      <p className="lead">
        幅と高さ(px)を入れるだけで、アスペクト比を最簡分数（16:9など）で計算します。比率を保ったままのサイズ変換やCSSのコピー用コードのほか、
        <a href="#gyakubiki">16:9・9:16の逆引き早見表</a>
        （幅から高さを引く一覧）も下に置いています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>アスペクト比とは</h2>
      <p>
        アスペクト比は、画面や画像の「幅と高さの比率」のことです。例えば1920x1080の動画は、両方を120で割ると16:9になります。同じ16:9なら1280x720でも3840x2160（4K）でも見た目の縦横バランスは同じで、画質（解像度）だけが変わります。動画編集・サムネイル作成・Webデザインでは、この比率を揃えることで黒帯や意図しないトリミングを防げます。
      </p>

      <h2 id="gyakubiki">16:9・9:16の逆引き早見表（幅から高さ）</h2>
      <p>
        「16:9で幅◯◯pxのとき高さは？」を引くための表です。高さは「幅×9÷16」で求めています。9:16（縦動画）は縦横が入れ替わるだけなので、同じ行を読み替えて使えます（16:9で1280x720なら、9:16では720x1280）。
      </p>
      <table>
        <thead>
          <tr>
            <th>幅(px)</th>
            <th>16:9の高さ(px)</th>
            <th>9:16のとき(幅x高さ)</th>
          </tr>
        </thead>
        <tbody>
          {LOOKUP_16_9.rows.map((row) => (
            <tr key={row.width}>
              <td>{row.width}</td>
              <td>
                {row.height}
                {row.exact ? '' : '（約）'}
              </td>
              <td>
                {row.height}x{row.width}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        「約」が付いている行は、幅×9÷16が割り切れず四捨五入している行です（854x480など）。動画として書き出すときは偶数に丸めてください。
      </p>

      <h3>4:3・3:2・21:9の逆引き（簡易版）</h3>
      <table>
        <thead>
          <tr>
            <th>幅(px)</th>
            {LOOKUP_COMPACT.map((table) => (
              <th key={table.label}>{table.label}の高さ(px)</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LOOKUP_COMPACT[0].rows.map((row, i) => (
            <tr key={row.width}>
              <td>{row.width}</td>
              {LOOKUP_COMPACT.map((table) => (
                <td key={table.label}>
                  {table.rows[i].height}
                  {table.rows[i].exact ? '' : '（約）'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>アスペクト比の変換のやり方（4:3を16:9にするなど）</h2>
      <p>
        比率そのものを変える「変換」は、同じ比率のままサイズを変えるのとは別物です。縦横の比が変わる以上、元の絵をそのまま収めることはできないので、次の3通りから選ぶことになります。
      </p>
      <table>
        <thead>
          <tr>
            <th>方法</th>
            <th>起きること</th>
            <th>向いている場面</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>トリミング（切り抜く）</td>
            <td style={{ textAlign: 'left' }}>
              はみ出す部分を切り落とす。4:3→16:9なら上下、16:9→4:3なら左右が切れる
            </td>
            <td style={{ textAlign: 'left' }}>写真・動画。画質は落ちない</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>パディング（余白を足す）</td>
            <td style={{ textAlign: 'left' }}>
              足りない方向に黒帯やぼかし背景を足す。元の絵は全部残る
            </td>
            <td style={{ textAlign: 'left' }}>資料・スクリーンショット・図表</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>引き伸ばし</td>
            <td style={{ textAlign: 'left' }}>
              縦横を別々に拡大するので、人物や文字が横（縦）に伸びて見える
            </td>
            <td style={{ textAlign: 'left' }}>実務では非推奨</td>
          </tr>
        </tbody>
      </table>
      <p>
        たとえば1600x1200（4:3）の画像を16:9にするなら、トリミングなら高さを1600÷16×9＝900pxに切り、パディングなら幅を1200÷9×16＝約2133pxまで広げます。変換後の比率でサイズを決め直したいときは、上の計算機に変換後の幅と高さを入れて「この比率のままサイズを変えると？」を使うと、書き出しサイズをまとめて出せます。
      </p>

      <h2>よく使うサイズ早見表</h2>
      <table>
        <thead>
          <tr>
            <th>用途</th>
            <th>比率</th>
            <th>代表的なサイズ(px)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>YouTube・フルHD動画</td>
            <td>16:9</td>
            <td>1920x1080</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>4K動画</td>
            <td>16:9</td>
            <td>3840x2160</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>TikTok・リール・ショート</td>
            <td>9:16</td>
            <td>1080x1920</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>Instagramフィード（正方形）</td>
            <td>1:1</td>
            <td>1080x1080</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>Instagramフィード（縦長）</td>
            <td>4:5</td>
            <td>1080x1350</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>デジカメ写真・プレゼン（旧）</td>
            <td>4:3</td>
            <td>1600x1200</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>一眼レフ写真・L判プリント</td>
            <td>3:2</td>
            <td>3000x2000</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>ウルトラワイドモニター</td>
            <td>21:9</td>
            <td>2560x1080</td>
          </tr>
        </tbody>
      </table>

      <div className="note">
        SNSの推奨サイズは各プラットフォームの仕様変更で変わることがあります。入稿・投稿前に各サービスの最新の公式ヘルプをご確認ください。
      </div>

      <h2>リサイズするときの注意点</h2>
      <p>
        「この比率のままサイズを変えると？」の結果は、ピクセルが整数になるよう四捨五入しています。そのため、比率によっては計算結果が元の比とごくわずかにずれることがありますが、画面表示では見分けが付かないレベルです。
      </p>
      <p>
        動画を書き出す場合は、幅・高さともに2の倍数（偶数）でないと受け付けないエンコーダーや投稿サービスが多い点に注意してください。計算結果が奇数になったときは、1px足すか引くかして偶数に丸めるのが実務的です。また、小さい画像を大きくリサイズすると引き伸ばしで画質が落ちるため、サイズ変更は原則「大きいものを小さくする」方向で行い、元データはできるだけ大きいまま保管しておくのがおすすめです。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="aspect-ratio" />

      <ToolMeta slug="aspect-ratio" />
    </>
  );
}
