import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Calculator from './Calculator';

const title = 'アスペクト比計算機｜幅×高さから16:9などの比率を計算・CSSコード生成';
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
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'アスペクト比計算機',
      url: `${SITE_URL}/aspect-ratio/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />
    </>
  );
}
