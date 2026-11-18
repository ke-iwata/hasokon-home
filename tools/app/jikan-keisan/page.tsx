import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import Calculator from './Calculator';
import {
  BREAK_EXAMPLES,
  EXCEL_WRAP,
  HAYAMI_15,
  HAYAMI_5,
  LATE_EXAMPLE,
  NIGHT_EXAMPLE,
  ROUNDING_EXAMPLES,
  SEVEN_TWENTY,
  SEVEN_TWENTY_4,
} from './tables';

// 仕様: docs/features/jikan-keisan.md
const title = '時間計算 — 勤務時間・時間の足し算・10進数変換（日またぎ・休憩・深夜にも対応）';
const description =
  '出勤・退勤・休憩から実働時間を計算。日またぎ（夜勤）・深夜22〜5時・8時間超・休憩の不足の印つきで、Excelの列を貼れば月の合計（24時間超も）まで。1:30＋0:50のような時間の足し算・引き算、7:45⇔7.75時間の換算、同じ計算のExcelの式も。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['時間計算', '勤務時間 計算', '時間 足し算', '時間 10進数 変換', 'エクセル 時間 合計 24時間以上', '夜勤 時間 計算'],
  alternates: { canonical: `${SITE_URL}/jikan-keisan/` },
  robots: robotsFor('jikan-keisan'),
};

const R = Object.fromEntries(ROUNDING_EXAMPLES.map((r) => [r.before, r.after]));

const faq = [
  {
    q: '夜勤（日をまたぐ勤務）はどう計算しますか？',
    a: `退勤の時刻が出勤より前なら、翌日の退勤として計算します。22:00〜翌7:00・休憩60分なら、拘束${NIGHT_EXAMPLE.span}・実働${NIGHT_EXAMPLE.work}です。退勤を 26:00 のような25時表記で入れても同じ結果になります（17:00〜26:00 と 17:00〜2:00 はどちらも実働${LATE_EXAMPLE}）。`,
  },
  {
    q: '休憩が45分と60分になる境目は？',
    a: '労働基準法34条は、労働時間（休憩を除いた実働）が6時間を超えると45分以上、8時間を超えると1時間以上の休憩を求めています。「超える」なので、実働ちょうど6時間なら休憩なしでも、ちょうど8時間なら45分でも足ります。このツールは実働で判定して、足りないかもしれない日に印を付けます。',
  },
  {
    q: '1日ごとに15分単位で切り捨てるのは違法ですか？',
    a: '労働時間は1分単位で数えるのが原則で、毎日の端数を切り捨てて賃金を払わないと、賃金の全額払い（労基法24条）にぶつかります。通達（昭和63年3月14日 基発第150号）が事務の簡便のために認めているのは、1か月の時間外・休日・深夜業それぞれの合計の30分未満の切り捨て・30分以上の切り上げだけです。このツールも丸めは月の合計にだけ選べるようにしています。',
  },
  {
    q: 'Excel で24時間を超えた合計を出すには？',
    a: `合計のセルの表示形式を、ユーザー定義で [h]:mm にします。ふつうの h:mm のままだと、Excel は24時間ごとに日に繰り上げて表示するので、23:30 と 1:00 の合計が ${EXCEL_WRAP.wrapped} に見えます（中身は${EXCEL_WRAP.sum}）。`,
  },
  {
    q: '10進数にすると割り切れない（7:20 など）ときは？',
    a: `7:20 は ${SEVEN_TWENTY_4}… 時間で割り切れません。このツールは時間を秒の整数で持ち、表示のときだけ小数第2位で丸めて ${SEVEN_TWENTY} と出します。時給を掛けるときは丸めた ${SEVEN_TWENTY} ではなく 7:20（440分）のまま掛けると、端数のずれが出ません。`,
  },
  {
    q: '入力した時刻はどこかに送られますか？',
    a: '送りません。計算はすべてこのページの中（ブラウザ）で行い、通信もしません。URLにも端末にも残さないので、ページを閉じると入力は消えます。共用のパソコンでも他の人に勤怠が見えることはありません。',
  },
];

const trail = breadcrumbFor('jikan-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '時間計算（勤務時間・時間の足し算・10進数変換）',
      url: `${SITE_URL}/jikan-keisan/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('jikan-keisan'),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>時間計算（勤務時間・時間の足し算・10進数変換）</h1>
      <p className="lead">
        出勤・退勤・休憩から実働時間を出します。日またぎ（夜勤）・深夜 22〜5 時の時間・8時間を超えた時間・休憩の不足の印つきで、
        Excel やスプレッドシートの列を貼れば月の合計（168:45 のように24時間を超えて）まで。1:30＋0:50 のような時間の足し算・引き算と、
        7:45 ⇔ 7.75 時間の換算もできます。入力はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>日またぎ（夜勤）の計算</h2>
      <p>
        退勤の時刻が出勤と同じか前なら、翌日の退勤とみなします。22:00〜翌7:00・休憩60分なら、拘束 {NIGHT_EXAMPLE.span}・実働{' '}
        {NIGHT_EXAMPLE.work} です。シフト表でよく使う 26:00 のような「25時表記」（29:59 まで）もそのまま入れられ、17:00〜26:00 と
        17:00〜2:00 は同じ実働 {LATE_EXAMPLE} になります。36時間を超える勤務は1行では受け付けないので、日を分けて入れてください。
      </p>

      <h2>休憩は何分必要か（労基法34条）</h2>
      <p>
        労働基準法34条1項は「労働時間が六時間を超える場合においては少くとも四十五分、八時間を超える場合においては少くとも一時間」の休憩を求めています。
        ここでいう労働時間は、32条と同じく<strong>休憩を除いた実働</strong>です。「超える」なので、ちょうど6時間・ちょうど8時間は下の段の側に入ります。
      </p>
      <table>
        <thead>
          <tr>
            <th>勤務</th>
            <th>実働</th>
            <th>34条の休憩</th>
          </tr>
        </thead>
        <tbody>
          {BREAK_EXAMPLES.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td>{b.work}</td>
              <td>{b.short ? `足りないかも（${b.required}）` : b.required}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        印は法定の最低限の目安です。休憩を労働時間の途中に与えているか、一斉に与えているかまでは見ていません。
        変形労働時間制・フレックスタイム制・管理監督者かどうかも判断しません。
      </p>

      <h2>深夜は22時から5時（労基法37条）</h2>
      <p>
        労働基準法37条4項の深夜は午後10時から午前5時までです（厚生労働大臣が認める地域・期間は午後11時から午前6時）。
        このツールは勤務の時間帯と前日・当日・翌日の 22:00〜翌5:00 の重なりで数えます。休憩を<strong>いつ取ったか</strong>は聞かないので、
        深夜の実働は「休憩を全部深夜帯に取った（少ないほう）〜 全部深夜帯の外で取った（多いほう）」の幅で出します。22:00〜翌7:00・休憩60分なら、
        深夜帯にかかる拘束 {NIGHT_EXAMPLE.nightSpan} のうち、深夜の実働は {NIGHT_EXAMPLE.nightMin}〜{NIGHT_EXAMPLE.nightMax} です。
        深夜の割増（2割5分以上）の額は
        <PublicToolLink slug="zangyodai-keisan">
          {' '}<ToolLink slug="zangyodai-keisan">残業代の計算機</ToolLink>{' '}
        </PublicToolLink>
        で出せます。
      </p>

      <h2>端数はどう丸めるのか</h2>
      <p>
        労働時間は1分単位で数えるのが原則です。通達（昭和63年3月14日 基発第150号）が認めているのは、
        <strong>1か月の時間外労働・休日労働・深夜業それぞれの時間数の合計</strong>について、30分未満を切り捨て・30分以上を1時間に切り上げる扱いだけです
        （{ROUNDING_EXAMPLES.map((r) => `${r.before} → ${r.after}`).join('、')}。秒は分に切り捨ててから判定します）。
        ふつうの実働の合計や1日ごとの値を丸めてよいという定めではなく、毎日15分単位で切り捨てて払わないと賃金の全額払い（労基法24条）にぶつかります。
        そのためこのツールは、丸めを「8時間を超えた時間」と「深夜」の月の合計にだけ選べるようにし、実働の合計・時給の額は丸めません。
      </p>
      <p>
        時給 × 実働の額は円未満も小数第2位まで出し、四捨五入した額を目安として添えます。基発第150号の (2)(3) は1時間あたりの賃金額・割増賃金額と、
        1か月の割増賃金の総額の端数についての定めで、ふつうの賃金の円未満を切り捨てて払ってよいという定めではありません。実際の支払いは就業規則・賃金規程によります。
      </p>

      <h2>Excel で時間を足すと24時間を超えたところで戻る理由</h2>
      <p>
        Excel の時刻は「1日＝1」の小数です（12:00 は 0.5）。表示形式 h:mm は24時間ごとに日に繰り上げて残りだけを見せるので、
        23:30 と 1:00 の合計 {EXCEL_WRAP.sum} が {EXCEL_WRAP.wrapped} に見えます。合計のセルの表示形式をユーザー定義で <code>[h]:mm</code> にすると、
        24時間を超えてもそのまま表示されます。10進数の時間にするには、24を掛けて表示形式を「数値」にします（<code>=(MOD(B2-A2,1)-C2)*24</code>）。
        <code>MOD(B2-A2,1)</code> は日またぎで退勤が出勤より小さくなっても、翌日として差を出すための書き方です。
        休憩を 60 のように分で入れているなら、<code>C2</code> を <code>C2/1440</code>（1日＝1440分）に直さないとマイナスになります。
      </p>

      <h2>15分＝0.25時間の早見表</h2>
      <table>
        <thead>
          <tr>
            <th>時:分</th>
            <th>10進数の時間</th>
          </tr>
        </thead>
        <tbody>
          {HAYAMI_15.map((r) => (
            <tr key={r.hm}>
              <td>{r.hm}</td>
              <td>{r.decimal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>5分刻み（小数第2位で四捨五入。5分・10分・20分などは割り切れません）：</p>
      <table>
        <thead>
          <tr>
            <th>時:分</th>
            <th>10進数の時間</th>
          </tr>
        </thead>
        <tbody>
          {HAYAMI_5.map((r) => (
            <tr key={r.hm}>
              <td>{r.hm}</td>
              <td>{r.decimal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="jikan-keisan" />

      <PublicToolLink slug="zangyodai-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          時間を出したら次は額：<ToolLink slug="zangyodai-keisan">残業代の計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="saitei-chingin">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          時給は足りているか：<ToolLink slug="saitei-chingin">最低賃金 早見表・チェッカー</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="nissu-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          日付の計算：<ToolLink slug="nissu-keisan">日数計算・期日計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="unix-jikan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Excel のシリアル値を日時に：<ToolLink slug="unix-jikan">UNIX時間・Excelシリアル値 変換</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="jikan-keisan" ymyl="legal">
        出典：
        <a href="https://laws.e-gov.go.jp/law/322AC0000000049" target="_blank" rel="nofollow noopener noreferrer">
          労働基準法（昭和22年法律第49号）第32条・第34条・第37条
        </a>
        （e-Gov 法令検索。2026年11月18日に本文を確認）／
        <a href="https://jsite.mhlw.go.jp/aichi-roudoukyoku/var/rev0/0119/6636/hasuutoriatukai.pdf" target="_blank" rel="nofollow noopener noreferrer">
          愛知労働局「賃金計算の端数の取扱い」（昭和63年3月14日 基発第150号）
        </a>
        ／
        <a href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/index.html" target="_blank" rel="nofollow noopener noreferrer">
          厚生労働省「労働時間・休日」
        </a>
        。休憩・深夜・8時間の印は法定の目安で、変形労働時間制・フレックスタイム制・管理監督者・36協定は判断しません。割増賃金は計算しません。
      </ToolMeta>
    </>
  );
}
