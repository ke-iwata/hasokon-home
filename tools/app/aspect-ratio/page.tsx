import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = 'アスペクト比 計算機｜16:9などの比率とリサイズ後のサイズ';
const description =
  '幅と高さ(px)を入れるだけで、アスペクト比（16:9・4:3など）を最簡分数で計算。よく使う比率との一致判定、比率を保ったままのサイズ変換、CSSのaspect-ratioコピー用コードにも対応した無料ツールです。';

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
        幅と高さ(px)を入れるだけで、アスペクト比を最簡分数（16:9など）で計算します。比率を保ったままのサイズ変換や、CSSのコピー用コードにも対応しています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>アスペクト比とは</h2>
      <p>
        アスペクト比は、画面や画像の「幅と高さの比率」のことです。例えば1920x1080の動画は、両方を120で割ると16:9になります。同じ16:9なら1280x720でも3840x2160（4K）でも見た目の縦横バランスは同じで、画質（解像度）だけが変わります。動画編集・サムネイル作成・Webデザインでは、この比率を揃えることで黒帯や意図しないトリミングを防げます。
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
