import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { commonRows } from '@/lib/cron/build';
import { DOW_NUMBER_TABLE, GITHUB_SCHEDULE_DOC } from '@/lib/cron/check';
import { DOW_JA } from '@/lib/cron/describe';
import Calculator from './Calculator';

// 仕様: docs/features/cron-shiki-checker.md

const title = 'cron 式 チェッカー｜次回実行日時を日本時間で確認・GitHub Actions の timezone と UTC 変換';
const description =
  'cron 式を貼ると、意味を日本語で表示し、次の実行日時を日本時間と UTC で10件並べます。GitHub Actions の timezone 指定・EventBridge の UTC 変換・Quartz と Spring の曜日の違い・日と曜日の OR 条件・祝日にかかる回のチェックも。入力はブラウザの外に送りません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/cron-shiki/` },
  robots: robotsFor('cron-shiki'),
};

// 本文の例は lib で読み下す（手で書いた説明が式とずれないように）
const COMMON = commonRows();

const faq = [
  {
    q: 'GitHub Actions の schedule を日本時間で動かすには？',
    a: '2026年3月から、on.schedule の各項目に timezone: "Asia/Tokyo" を cron: の隣に書けるようになりました。書けば式は日本時間のまま読まれます。書かなければ従来どおり UTC なので、日本時間の朝9時は「0 0 * * *」（UTC の0時）と書きます。timezone に未対応の GitHub Enterprise Server や、既存のワークフローを変えたくないときは、上の「UTC に直す」の式を使ってください。',
  },
  {
    q: '「0 9 1 * 1」は毎月1日の月曜だけですか？',
    a: 'いいえ。crontab（Vixie cron）では、日と曜日の両方を指定すると「どちらかに当てはまれば動く」（OR）になります。この式は毎月1日と、毎週月曜の両方で動きます。どちらかのフィールドが * で始まる（*/2 なども含む）ときだけ、両方に当てはまる日（AND）になります。',
  },
  {
    q: '祝日を除いて平日だけ動かせますか？',
    a: 'cron の式だけでは書けません。「1-5」は月〜金なので、祝日の月曜にも動きます。式は平日のまま動かし、スクリプトの最初で今日が祝日かを判定して終了するのが一般的です。このツールでは、次の実行日時のうち祝日・年末年始にかかる回に印を付けるので、止めたい回があるかを確かめられます。',
  },
  {
    q: 'Quartz と Spring で同じ式なのに曜日がずれます',
    a: '曜日の数字の読みが違うためです。Quartz（と AWS）は 1 が日曜〜7 が土曜、Spring と crontab は 0（と 7）が日曜・1 が月曜です。「0 15 10 ? * 6#3」は Quartz なら第3金曜、Spring なら第3土曜になります。MON・FRI のように名前で書けば、どちらでも同じ意味になります。',
  },
  {
    q: '入力した式は送信されますか？',
    a: '送信されません。式の解析も次回実行の計算も、お使いのブラウザの中だけで行います。共有用に URL のうしろ（?q=…）に式が付きますが、これはブラウザの中で読むだけで、サーバーには送られません（このページは静的なファイルです）。日本時間は UTC に9時間を足して計算していて、パソコンのタイムゾーン設定には左右されません。',
  },
];

const trail = breadcrumbFor('cron-shiki');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'cron 式 チェッカー（次回実行・日本時間）', slug: 'cron-shiki', description }),
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

const preStyle: React.CSSProperties = { ...codeStyle, whiteSpace: 'pre-wrap', padding: 8, background: 'var(--surface)', borderRadius: 6 };

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 6px' };
const td: React.CSSProperties = { padding: '4px 6px', borderTop: '1px solid var(--border)', verticalAlign: 'top' };

const ext = { target: '_blank', rel: 'nofollow noopener noreferrer' } as const;

const FIELDS_5 = [
  { n: '①', name: '分', range: '0〜59', ex: '30' },
  { n: '②', name: '時', range: '0〜23', ex: '9' },
  { n: '③', name: '日', range: '1〜31', ex: '*' },
  { n: '④', name: '月', range: '1〜12（JAN〜DEC）', ex: '*' },
  { n: '⑤', name: '曜日', range: '0〜7（0 と 7 が日曜。SUN〜SAT）', ex: '1-5' },
];

const DIALECT_ROWS = [
  { name: 'Linux crontab・GitHub Actions・Kubernetes', fields: '5（分 時 日 月 曜日）', special: '* , - /', both: '両方指定で OR', tz: 'サーバー／UTC（timezone で指定可）／spec.timeZone' },
  { name: 'AWS EventBridge（ルール・Scheduler）', fields: '6（分 時 日 月 曜日 年）', special: '* , - / ? L W #', both: '片方を ? にする', tz: 'ルールは UTC 固定・Scheduler は指定可' },
  { name: 'Quartz', fields: '6〜7（秒 分 時 日 月 曜日 ［年］）', special: '* , - / ? L W #', both: '片方を ? にする', tz: 'JVM・スケジューラーの設定' },
  { name: 'Spring（CronExpression）', fields: '6（秒 分 時 日 月 曜日）', special: '* , - / ? L W #', both: '両方指定で AND', tz: 'JVM・@Scheduled の zone' },
];

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>cron 式 チェッカー（次回実行・日本時間）</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        cron 式を貼ると、意味を日本語で読み、次の実行日時を<strong>日本時間と UTC で10件</strong>並べます。crontab・GitHub Actions・AWS EventBridge・Kubernetes・Quartz・Spring の方言を自動で見分け、GitHub Actions の timezone や UTC に直した式もそのまま貼れる形で出します。式はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>cron 式の書き方（5 フィールド）</h2>
      <p>Linux の crontab・GitHub Actions・Kubernetes の CronJob は、空白で区切った5つのフィールドで書きます。例の「30 9 * * 1-5」は「月曜〜金曜の 9:30」です。</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th style={th}>位置</th>
              <th style={th}>意味</th>
              <th style={th}>書ける値</th>
              <th style={th}>例</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS_5.map((f) => (
              <tr key={f.n}>
                <td style={td}>{f.n}</td>
                <td style={td}>{f.name}</td>
                <td style={td}>{f.range}</td>
                <td style={{ ...td, ...codeStyle }}>{f.ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <code style={codeStyle}>*</code> はすべて、<code style={codeStyle}>,</code> は並べる（1,15）、<code style={codeStyle}>-</code> は範囲（1-5）、<code style={codeStyle}>/</code> は間隔（*/15 は 0・15・30・45）です。
      </p>

      <h2>よく使う cron 式</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th style={th}>式</th>
              <th style={th}>意味</th>
            </tr>
          </thead>
          <tbody>
            {COMMON.map((r) => (
              <tr key={r.expression}>
                <td style={{ ...td, ...codeStyle, whiteSpace: 'nowrap' }}>{r.expression}</td>
                <td style={td}>{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>方言の違い</h2>
      <p>同じ見た目の式でも、どこに書くかで意味が変わります。特に<strong>秒の有無</strong>・<strong>日と曜日を両方書いたときの扱い</strong>・<strong>曜日の数字</strong>が違います。</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th style={th}>方言</th>
              <th style={th}>フィールド</th>
              <th style={th}>記号</th>
              <th style={th}>日と曜日</th>
              <th style={th}>タイムゾーン</th>
            </tr>
          </thead>
          <tbody>
            {DIALECT_ROWS.map((r) => (
              <tr key={r.name}>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.fields}</td>
                <td style={{ ...td, ...codeStyle }}>{r.special}</td>
                <td style={td}>{r.both}</td>
                <td style={td}>{r.tz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>曜日の数字の対応：</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th style={th}>方言</th>
              {DOW_JA.map((d) => (
                <th key={d} style={th}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW_NUMBER_TABLE.map((row) => (
              <tr key={row.dialect}>
                <td style={td}>{row.dialect}</td>
                {row.values.map((v, i) => (
                  <td key={i} style={{ ...td, ...codeStyle }}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>GitHub Actions で日本時間に動かす方法</h2>
      <p>2026年3月から、schedule の各項目に timezone を書けるようになりました。式は日本時間のまま書けます。</p>
      <pre style={preStyle}>{'on:\n  schedule:\n    - cron: "30 9 * * 1-5"\n      timezone: "Asia/Tokyo"'}</pre>
      <p>
        timezone を書かなければ UTC です。既存のワークフローや timezone に未対応の GitHub Enterprise Server では、日本時間から9時間引いた UTC の式を書きます。日本時間の 0:00〜8:59 は UTC では前日なので、曜日も1つ前にずらします（平日 8:00 は「0 23 * * 0-4」）。毎月1日の 8:30 のように前月の末日に当たる式は、crontab の書き方では1行で表せません。
      </p>
      <p>
        schedule は最短5分ごとで、混雑する時間（毎時0分など）は遅れたり飛ばされたりすることがあります（
        <a href={GITHUB_SCHEDULE_DOC} {...ext}>GitHub Docs</a>）。
      </p>

      <h2>AWS EventBridge のルールと Scheduler の違い</h2>
      <p>
        どちらも <code style={codeStyle}>cron(分 時 日 月 曜日 年)</code> の6フィールドで、日か曜日のどちらかを <code style={codeStyle}>?</code> にします。違いはタイムゾーンで、<strong>EventBridge のルールは UTC 固定</strong>、<strong>EventBridge Scheduler は ScheduleExpressionTimezone で指定できます</strong>。日本時間で動かしたいなら、Scheduler に <code style={codeStyle}>Asia/Tokyo</code> を指定するのが簡単です。ルールのまま使うなら、UTC に直した式を書きます（毎月1日の日本時間 8:30 は <code style={codeStyle}>cron(30 23 L * ? *)</code>）。
      </p>

      <h2>祝日を除きたいとき</h2>
      <p>
        cron は祝日を知らないので、「平日の 9 時」を <code style={codeStyle}>0 9 * * 1-5</code> で書くと祝日にも動きます。祝日を除く式は書けないため、式は平日のまま動かし、スクリプトの最初で祝日かを判定して何もせずに終える、という回避策が一般的です。上の次回実行の一覧では、祝日と年末年始（12/29〜1/3）にかかる回に印を付けています。
      </p>
      <PublicToolLink slug="nissu-keisan">
        <p>
          営業日を数えるなら <ToolLink slug="nissu-keisan">日数計算</ToolLink> も使えます。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="unix-jikan">
        <p>
          ログに出た UNIX時間を日本時間に直すなら <ToolLink slug="unix-jikan">UNIX時間・Excelシリアル値 変換</ToolLink>。
        </p>
      </PublicToolLink>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="cron-shiki" />

      <ToolMeta slug="cron-shiki">
        crontab は{' '}
        <a href="https://man7.org/linux/man-pages/man5/crontab.5.html" {...ext}>crontab(5)</a>
        、GitHub Actions は{' '}
        <a href={GITHUB_SCHEDULE_DOC} {...ext}>GitHub Docs（schedule）</a>と{' '}
        <a href="https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/" {...ext}>GitHub Changelog 2026-03-19</a>
        、AWS は{' '}
        <a href="https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html" {...ext}>EventBridge のルールのスケジュール式</a>と{' '}
        <a href="https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html" {...ext}>EventBridge Scheduler のスケジュールの種類</a>
        、Kubernetes は{' '}
        <a href="https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/" {...ext}>CronJob</a>
        、Quartz は{' '}
        <a href="https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html" {...ext}>CronTrigger Tutorial</a>
        、Spring は{' '}
        <a href="https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/scheduling/support/CronExpression.html" {...ext}>CronExpression</a>
        にもとづいて当サイトが実装しました（外部のライブラリは使っていません）。祝日は内閣府「国民の祝日」の表（日数計算と共通）を使っています。
      </ToolMeta>
    </>
  );
}
