import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = '画像リサイズ・圧縮｜アップロード不要・ブラウザ内で完結する無料ツール';
const description =
  '写真のサイズ変更とファイルサイズの圧縮ができる無料ツール。画像はどこにもアップロードされず、お使いのブラウザの中だけで処理されます。幅・パーセント・長辺での指定、「300KB以下」のような目標ファイルサイズ指定、JPEG・PNG・WebPの相互変換に対応。作り直しの過程でEXIF（位置情報・撮影日時）も取り除かれます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/gazo-resize/` },
  robots: robotsFor('gazo-resize'),
};

const faq = [
  {
    q: '画像はサーバーにアップロードされますか？',
    a: 'されません。画像の読み込み・縮小・書き出しはすべてお使いのブラウザ内（JavaScriptとCanvas）で行われ、当サイトのサーバーには何も送られません。このサイトは静的なファイルだけで動いており、ファイルを受け取る仕組みそのものを持っていません。読み込み後に通信を切っても処理は最後まで動きます。履歴書の証明写真や免許証の写しなど、人に預けたくない画像でも安心して使えます。',
  },
  {
    q: 'リサイズすると位置情報（EXIF）は消えますか？',
    a: '消えます。このツールはCanvasで画像を描き直して保存するため、元のファイルに付いていたEXIF（GPSの位置情報・撮影日時・カメラの機種・レンズ情報）は出力に引き継がれません。SNSやフリマアプリに写真を上げる前に自宅の位置情報を落としたい、という用途にそのまま使えます。ただし撮影時の「向き」の情報だけは読み取って、縦で撮った写真が横倒しにならないように反映してから消しています。',
  },
  {
    q: '「300KB以下」のようにファイルサイズを指定できますか？',
    a: 'できます。「軽くし方」で「ファイルサイズで指定」を選び、目標のKB数を入れてください。指定したサイズに収まる範囲で、いちばん高い画質を自動で探します（画質を変えながら数回書き出して二分探索するので、画質指定より少し時間がかかります）。応募書類や申請フォームで「2MB以内」「500KB以下」と指定されているときに便利です。いちばん低い画質でも届かない場合はその旨を表示するので、幅や長辺を小さくしてから再度お試しください。',
  },
  {
    q: '複数の画像をまとめて処理できますか？',
    a: 'できます。ドラッグ&ドロップかファイル選択で最大20枚まで同時に読み込め、同じ設定でまとめて処理します。処理は1枚ずつ順番に行われます（大きな写真を同時に展開すると端末のメモリを使い切るため）。終わったら「すべて保存」で連続してダウンロードできます。ZIPにはまとめていません（圧縮ライブラリを読み込むぶんページが重くなるため）。',
  },
  {
    q: 'JPEG・PNG・WebPはどれを選べばいいですか？',
    a: '写真ならJPEGかWebPです。JPEGはどこでも開けて添付ファイルとして無難、WebPは同じ見た目でJPEGより2〜3割軽くなるのでWebサイトに載せる画像に向いています。PNGはロスレス（劣化しない）ですが写真では重くなりやすく、スクリーンショット・図・透過が必要な画像に向いています。透過のあるPNGをJPEGにすると透明部分は黒く塗られるため、透過を残したいときはPNGかWebPを選んでください。',
  },
  {
    q: 'iPhoneのHEIC（.heic）写真は使えますか？',
    a: '初版では対応していません。HEICを表示できるブラウザが限られており、対応するにはwasm（WebAssembly）のデコーダを読み込む必要があって、ページが数MB重くなってしまうためです。iPhoneをお使いの場合は、「設定 → カメラ → フォーマット」で「互換性優先」を選ぶとJPEGで撮影されます。撮影済みの写真は、共有メニューから「ファイルに保存」やメール添付にするとJPEGに変換されることがあります。',
  },
  {
    q: '縮小した画像がぼやける・ざらつくのですが。',
    a: '一度に大きく縮めると、間引かれた画素の情報が捨てられてジャギー（階段状のギザギザ）やモアレが出ます。このツールは大きく縮めるときに半分ずつ段階的に縮小してから目標サイズに合わせているので、この現象は起きにくくなっています。それでも粗く見える場合は、画質の指定を上げる（80〜90）か、目標ファイルサイズを大きめにしてください。ファイルサイズを小さくしすぎると、輪郭のまわりにモヤ（ブロックノイズ）が出ます。',
  },
  {
    q: '元の画像より大きくできますか？',
    a: 'できません（意図的にそうしています）。引き伸ばしても情報が増えるわけではなく、輪郭がぼやけた画像になるだけだからです。パーセントで100を超える値や、元より大きい幅を指定した場合は、元のサイズのまま処理します。印刷用に大きな画像が必要なときは、元データを大きなサイズで撮り直す・書き出し直すのが確実です。',
  },
  {
    q: '処理した画像はサイトに残りますか？',
    a: '残りません。結果はブラウザのメモリ上にあるだけで、当サイトはlocalStorageにもCookieにも画像を保存しません。ページを閉じるか「クリア」を押した時点で消えるので、必要な画像は先に保存してください。',
  },
];

const trail = breadcrumbFor('gazo-resize');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({
      name: '画像リサイズ・圧縮',
      slug: 'gazo-resize',
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

      <h1>画像リサイズ・圧縮</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        写真の大きさを変えて、ファイルサイズを軽くします。
        <strong>画像はアップロードされません</strong>
        。読み込みから書き出しまですべてお使いのブラウザの中で行われ、当サイトのサーバーには何も送られません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>アップロードしないとはどういうことか</h2>
      <p>
        画像のリサイズサイトの多くは、選んだファイルをいったんサーバーへ送り、向こう側で処理した結果を返しています。手軽な代わりに、
        <strong>その画像は他人の管理する場所を一度通る</strong>
        ことになります。履歴書に貼る証明写真、子どもの写真、免許証や保険証の写し、社内資料のスクリーンショット——
        送りたくない画像ほど、リサイズが必要になる場面は多いはずです。
      </p>
      <p>
        このツールはブラウザの
        <code>Canvas</code>
        で画像を描き直しているだけなので、そもそも送信する処理がありません。当サイトは静的なファイルだけで配信されており、ファイルを受け取る仕組み自体を持っていません。確かめたい場合は、ページを開いたあとに機内モードにするかWi-Fiを切って操作してみてください。そのまま最後まで処理できます。
      </p>
      <div className="note">
        同じ考え方で作っているツールに
        <Link href="/qr-code/">QRコード作成</Link>と<Link href="/password/">パスワード生成</Link>
        があります。どちらも入力した内容は端末から出ません。
      </div>

      <h2>SNSに上げる前に位置情報（EXIF）を消す</h2>
      <p>
        スマートフォンで撮った写真には、撮影した場所の緯度経度・撮影日時・カメラの機種などがEXIFとして埋め込まれています。自宅やよく行く場所で撮った写真をそのまま公開すると、
        <strong>撮影場所が特定できてしまう</strong>
        ことがあります。SNSの多くは投稿時にEXIFを削除しますが、フリマアプリの商品写真、掲示板への添付、メールでの送付など、そのまま渡ってしまう経路も残っています。
      </p>
      <table>
        <thead>
          <tr>
            <th>EXIFの項目</th>
            <th>このツールを通したあと</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GPS（撮影場所の緯度経度）</td>
            <td>残らない</td>
          </tr>
          <tr>
            <td>撮影日時</td>
            <td>残らない</td>
          </tr>
          <tr>
            <td>カメラ・レンズの機種、撮影設定</td>
            <td>残らない</td>
          </tr>
          <tr>
            <td>回転の向き（Orientation）</td>
            <td>読み取って画像そのものに反映してから消す</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        Canvasで描き直した画像には、元のファイルのメタデータが引き継がれません。「消す機能」を別に用意しているのではなく、
        <strong>作り直すと結果として消える</strong>
        という仕組みです。向きだけは消えると縦の写真が横倒しになるため、先に読み取って画像の画素そのものを回してから書き出しています。
      </p>

      <h2>用途別・大きさの目安</h2>
      <p>
        迷ったら「長辺で指定」が扱いやすいです。縦の写真と横の写真が混ざっていても、長いほうの辺が揃うので見た目の大きさが揃います。
      </p>
      <table>
        <thead>
          <tr>
            <th>使う場面</th>
            <th>長辺の目安</th>
            <th>形式</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ブログ・サイトの本文に載せる</td>
            <td>1,200〜1,600px</td>
            <td>WebP（またはJPEG）</td>
          </tr>
          <tr>
            <td>SNSへの投稿</td>
            <td>1,080〜2,048px</td>
            <td>JPEG</td>
          </tr>
          <tr>
            <td>メール・チャットへの添付</td>
            <td>1,024〜1,600px</td>
            <td>JPEG</td>
          </tr>
          <tr>
            <td>フリマアプリの商品写真</td>
            <td>1,200px前後</td>
            <td>JPEG</td>
          </tr>
          <tr>
            <td>申請フォーム（サイズ制限つき）</td>
            <td>指定に合わせる</td>
            <td>JPEG＋目標サイズ指定</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        画面に表示するだけなら、実際の表示幅の2倍程度あれば足ります（高精細ディスプレイの分）。それ以上大きくしても見た目は変わらず、表示が遅くなるだけです。縦横比そのものを調べたいときは
        <Link href="/aspect-ratio/">アスペクト比計算機</Link>
        が使えます。
      </p>

      <h2>形式の選び方</h2>
      <table>
        <thead>
          <tr>
            <th>形式</th>
            <th>向いているもの</th>
            <th>透過</th>
            <th>特徴</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>JPEG</td>
            <td>写真</td>
            <td>不可</td>
            <td>どの環境でも開ける。画質を落とすほど軽くなる（元には戻せない）</td>
          </tr>
          <tr>
            <td>PNG</td>
            <td>スクリーンショット・図・イラスト</td>
            <td>可</td>
            <td>劣化しない代わりに、写真では重くなりやすい</td>
          </tr>
          <tr>
            <td>WebP</td>
            <td>Webサイトに載せる画像</td>
            <td>可</td>
            <td>同じ見た目でJPEGより2〜3割軽い。主要ブラウザは対応済み</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>
          <strong>透過のあるPNGをJPEGにすると、透明部分は黒く塗られます。</strong>
          透過を残したいときはPNGかWebPを選んでください
        </li>
        <li>
          <strong>一度JPEGで落とした画質は戻りません。</strong>
          元のファイルは残しておき、加工は複製に対して行うのが安全です
        </li>
        <li>
          PNGを選んだときは画質の指定が効きません（ロスレスのため）。PNGを軽くしたい場合は、寸法を小さくするかJPEG・WebPへ変換してください
        </li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="gazo-resize" />

      <p style={{ fontSize: '0.9rem' }}>
        関連ツール：
        <Link href="/aspect-ratio/">アスペクト比計算機</Link>
        （縦横比とリサイズ後のサイズを計算します）／
        <Link href="/qr-code/">QRコード作成</Link>
        （入力内容を送信せずにQRコードを作ります）
      </p>

      <ToolMeta slug="gazo-resize">
        画像の縮小・書き出しはブラウザの Canvas API（
        <a
          href="https://html.spec.whatwg.org/multipage/canvas.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          HTML Living Standard
        </a>
        ）で行っており、外部のサービスやライブラリは使っていません（画像はサーバーに送信されません）。EXIFの回転向きの読み取りは Exif 2.32（
        <a
          href="https://www.cipa.jp/std/documents/download_j.html?DC-008-Translation-2019-J"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          CIPA DC-008
        </a>
        ）の Orientation タグにもとづいています。書き出せる形式・画質の扱いはブラウザの実装に依存します。
      </ToolMeta>
    </>
  );
}
