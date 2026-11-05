import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';
import { EXAMPLES, Y2038_EXAMPLE } from './tables';

// 仕様: docs/features/unix-jikan-excel-serial.md

const title = 'UNIX時間 変換｜エポック秒・ミリ秒⇔日本時間（和暦つき）・Excelシリアル値も';
const description =
  '10桁・13桁のUNIX時間（エポック秒・ミリ秒）やExcelのシリアル値を貼るだけで日本時間・和暦・曜日に変換。日時からの逆変換、ログ中の時刻のまとめ変換も。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/unix-jikan/` },
  robots: robotsFor('unix-jikan'),
};

const faq = [
  {
    q: 'UNIX時間（エポック秒）とは？ なぜ 1970 年から数えるのですか？',
    a: '1970年1月1日 0時0分0秒（UTC）からの経過秒数で表した時刻です。UNIX という OS が作られた頃に、きりのよい直近の年として 1970 年が起点に選ばれ、そのまま多くのプログラミング言語やデータベースが使うようになりました。タイムゾーンに関係なく世界中で同じ数字になるので、サーバーのログや API でよく使われます。',
  },
  {
    q: '10 桁と 13 桁の違いは何ですか？',
    a: '10 桁は秒、13 桁はミリ秒（1000 分の 1 秒）です。JavaScript の Date.now() や Java の System.currentTimeMillis() は 13 桁のミリ秒を返し、PHP の time() や多くのデータベースは 10 桁の秒を使います。16 桁はマイクロ秒、19 桁はナノ秒です。このツールは桁数で自動で読み分け、読み方を画面に出します。違っていればボタンで切り替えられます。',
  },
  {
    q: 'Excel で日付が「46331」のような数字になったのはなぜ？ 戻し方は？',
    a: 'Excel は日付を 1900年1月1日を 1 とする通し番号（シリアル値）で持っていて、セルの書式が「標準」や「数値」になると、その番号がそのまま見えます。CSV を開いたときや、別のブックから値だけ貼り付けたときによく起きます。戻すには、セルを選んで右クリック →「セルの書式設定」→「日付」を選びます。46331 は 2026年11月5日、小数の .5 は正午（12:00）です。',
  },
  {
    q: 'Excel のシリアル値の「1900年2月29日」問題とは？',
    a: '1900 年は実際にはうるう年ではありませんが、Excel は昔の表計算ソフト Lotus 1-2-3 との互換のため、1900 年をうるう年として扱っています。そのためシリアル値 60 が存在しない「1900年2月29日」になり、それより前（1〜59）は 1 日ずれます。1900年3月1日以降（61 以上）は正しい日付になるので、ふだんの業務では気にしなくて構いません。このツールは 60 を「Excel だけにある日付」と表示し、1〜59 も Excel と同じ日付を出します。',
  },
  {
    q: '2038年問題とは？',
    a: `UNIX時間を 32 ビットの符号付き整数で持っているプログラムでは、${Y2038_EXAMPLE.seconds}（${Y2038_EXAMPLE.jst} 日本時間）が表せる最後の秒で、その 1 秒後に数字があふれて 1901 年 12 月に戻ってしまいます。いまの多くの環境は 64 ビットで持っているので問題になりませんが、古い組み込み機器やファイル形式では今も残っています。`,
  },
  {
    q: 'うるう秒は数えるのですか？',
    a: '数えません。UNIX時間は POSIX の定義で「1 日 = 86400 秒」として数えるので、うるう秒（23:59:60）は含まれません。うるう秒が入った日も、UNIX時間の上では 86400 秒で次の日になります。このツールも同じ定義で計算しています。',
  },
  {
    q: '入力した数字やログは送信されますか？',
    a: '送信されません。変換はお使いのブラウザの中（JavaScript）だけで行い、入力した数字・ログをサーバーに送る処理はこのページにありません。保存もしないので、タブを閉じると消えます。日本時間は UTC に 9 時間を足して計算していて、お使いのパソコンのタイムゾーン設定には左右されません。',
  },
];

const trail = breadcrumbFor('unix-jikan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'UNIX時間・Excelシリアル値 変換', slug: 'unix-jikan', description }),
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

      <h1>UNIX時間・Excelシリアル値 変換</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>入力した数字・ログはこのブラウザの中だけで計算し、どこにも送りません。</strong>
        10 桁・13 桁の UNIX時間（エポック秒・ミリ秒）や、Excel で日付が数字になった「46331」のようなシリアル値を貼るだけで、日本時間・UTC・和暦・曜日・ISO 8601 に変換します。日時から数字への逆変換と、ログを丸ごと貼って中の時刻をまとめて読む機能もあります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>上の欄に数字を貼ります。桁数から「秒」「ミリ秒」「Excel のシリアル値」などを自動で読み分け、どう読んだかを画面に出します。</li>
        <li>読み方が違うときは「ミリ秒として読む」などのボタンで切り替えます。Mac の古い Excel のファイルなら「1904 年基準として読む」を押します。</li>
        <li>日時から数字を出すときは「日時 → 数字」に日付と時刻を入れます。サーバーのログや API の応答は「ログをまとめて変換」に貼ると、中の時刻の横に日本時間が付きます。</li>
      </ol>

      <h2>桁数ごとの読み方</h2>
      <p>
        自動の判定は<strong>整数部の桁数だけ</strong>で決めます（小数点があるかどうかでは決めません）。同じ数字でもツールによって読み方が違って結果が食い違うことがあるので、このツールは読み方を必ず画面に書き、ボタンで直せるようにしています。
      </p>
      <table>
        <thead>
          <tr>
            <th>入力の例</th>
            <th>読み方</th>
            <th>日本時間</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLES.map((row) => (
            <tr key={row.input}>
              <td style={{ textAlign: 'left' }}>
                <code style={codeStyle}>{row.input}</code>
              </td>
              <td style={{ textAlign: 'left' }}>{row.unit}</td>
              <td style={{ textAlign: 'left' }}>{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        <li>整数部が 6 桁以下の正の数（999999 まで）は、Excel のシリアル値として読みます。秒として読むと 1970 年 1 月の最初の 12 日に収まり、実務で出てくることはまれだからです（秒として読んだ結果も併記します）。</li>
        <li>Python の time.time() のような「1793836800.123456」は、整数部が 10 桁なので秒として読み、ミリ秒まで表示します（それより細かい桁は切り捨て）。</li>
        <li>マイナスの値（1970 年より前）も読めます。</li>
      </ul>

      <h2>Excel のシリアル値の決まり</h2>
      <p>
        Excel（Windows 版の既定の 1900 年基準）は、1900年1月1日を 1 として日付を数えます。小数部は 1 日に対する割合で、0.5 は 12:00、0.75 は 18:00 です。シリアル値には<strong>タイムゾーンがありません</strong>。セルに見えている日時そのものなので、このツールも日本時間・UTC の区別を付けずに出します。
      </p>
      <ul>
        <li><strong>60 は存在しない 1900年2月29日</strong>です（上の「よくある質問」を参照）。1〜59 は Excel と同じ日付になるよう 1 日ずらして数えます。</li>
        <li><strong>1904 年基準</strong>は Mac の古い Excel が使っていた数え方で、1904年1月1日が 0 です。1900 年基準より 1462 小さくなります。他人から受け取ったファイルで日付が 4 年ずれるときはこれが原因です。</li>
        <li>秒は四捨五入します。Excel のシリアル値は小数なので、そのまま秒を切り捨てると 23:59:59 が 23:59:58 にずれることがあるためです。</li>
      </ul>

      <h2>日本時間の計算</h2>
      <p>
        日本時間は<strong>UTC に 9 時間を足して</strong>計算します（日本は 1952 年以降サマータイムがありません）。お使いのパソコンのタイムゾーン設定を使わないので、海外のタイムゾーンに設定したパソコンでも結果は変わりません。和暦は明治6年（1873年1月1日）以降に出します。それより前は旧暦で、月日が西暦と対応しないためです。
      </p>
      <p>
        日付の差を数えたいときは<Link href="/nissu-keisan/">日数計算</Link>、和暦と西暦の早見表は<Link href="/nenrei-keisan/">年齢計算</Link>、API の応答の JSON を読みやすくしたいときは<Link href="/json-seikei/">JSON 整形・チェック</Link>も使えます。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="unix-jikan" />

      <ToolMeta slug="unix-jikan">
        UNIX時間の定義は{' '}
        <a
          href="https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html#tag_04_19"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          POSIX「Seconds Since the Epoch」
        </a>
        、Excel の日付の扱いは{' '}
        <a
          href="https://learn.microsoft.com/ja-jp/troubleshoot/microsoft-365-apps/excel/1900-and-1904-date-system"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          Microsoft「Excel の 1900 年と 1904 年の日付システムの違い」
        </a>
        と{' '}
        <a
          href="https://learn.microsoft.com/ja-jp/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          「Excel で 1900 年がうるう年と誤って想定される」
        </a>
        にもとづいて当サイトが実装しました（外部のサービスやライブラリは使っていません）。
      </ToolMeta>
    </>
  );
}
