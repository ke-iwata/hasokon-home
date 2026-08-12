import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Timer from './Timer';
import { SITE_URL } from '@/lib/registry';

const title = 'インターバルタイマー｜タバタ・HIIT対応の無料トレーニングタイマー';
const description =
  'トレーニング用のインターバルタイマー。タバタ式（20秒+10秒×8）やHIITのプリセット付きで、準備・運動・休憩・セット数を自由に設定できます。残り3秒からのビープ音つき。登録もアプリも不要でブラウザからすぐ使えます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/interval-timer/` },
};

const faq = [
  {
    q: 'タバタ式とは何ですか？',
    a: '「20秒の高強度運動 + 10秒の休憩」を8セット、合計4分間行うトレーニング方法です。立命館大学の田畑泉教授の研究に由来し、短時間で有酸素性・無酸素性の両方に効果があるとされています。このタイマーではプリセットの「タバタ式」を押すだけで設定できます。',
  },
  {
    q: '音が鳴りません',
    a: 'iPhoneでは本体横のサイレントスイッチがオンになっているとブラウザの音は鳴りません。スイッチを解除するか、音量ボタンで音量が上がっているか確認してください。タイマー右下の🔊ボタンがミュート（🔇）になっている場合も鳴りません。',
  },
  {
    q: 'トレーニング中に画面が消えてしまいます',
    a: 'このタイマーは実行中に画面がスリープしないようブラウザに要求します（Wake Lock対応ブラウザのみ）。それでも消える場合は、端末の画面自動ロックの時間を一時的に延ばしてください。バックグラウンドに回った場合も、経過時間は実際の時刻から計算しているのでタイマーはズレません。',
  },
  {
    q: '休憩なしの設定はできますか？',
    a: 'できます。休憩を0秒にすると、トレーニング時間だけがセット数ぶん連続するタイマーになります。準備時間も0秒にすれば、スタートと同時に1セット目が始まります。',
  },
];

const trail = breadcrumbFor('interval-timer');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'インターバルタイマー',
      url: `${SITE_URL}/interval-timer/`,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('interval-timer'),
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

      <h1>インターバルタイマー</h1>
      <p className="lead">
        トレーニングの「運動と休憩の繰り返し」を音で知らせるタイマー。
        タバタ式・HIITのプリセット付きで、秒数とセット数は自由に変えられます。
      </p>

      <Timer />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>プリセット（タバタ式・HIIT 30-30・筋トレ休憩）を選ぶか、準備・トレーニング・休憩・セット数を入力する</li>
        <li>「スタート」を押すと準備時間のカウントダウンから始まる</li>
        <li>フェーズの切り替わりは画面の色とビープ音で分かる（残り3秒から予告音）</li>
        <li>最後のセットはトレーニングで終わり、終了音が鳴る</li>
      </ol>
      <p>
        経過時間は端末の時計から計算しているので、他のアプリを見て戻ってきても
        タイマーはズレません。設定を変えたいときは「リセット」で入力欄に戻ります。
      </p>

      <h2>よくあるプロトコルの目安</h2>
      <p>
        <strong>タバタ式（20秒+10秒×8）</strong>は合計4分の高強度トレーニング。
        バーピーやスクワットジャンプなど全力で動ける種目に向いています。
        <strong>HIIT 30-30</strong>は運動と休憩が同じ長さで、初めての人でも続けやすい設定です。
        <strong>筋トレ休憩（40秒+90秒×5）</strong>は、筋トレのセット間休憩を
        測りたいときに。休憩時間は種目や重量に合わせて調整してください。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="interval-timer" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/dice/">サイコロ</Link>
        ／
        <Link href="/roulette/">ルーレット</Link>
      </p>

      <ToolMeta slug="interval-timer" />
    </>
  );
}
