import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import RouletteApp from '@/app/_roulette/RouletteApp';
import { SITE_URL } from '@/lib/registry';
import { TOOLS } from '@/lib/roulette/tools';

const title = 'ルーレット｜好きな項目を入れて回せる無料ルーレット';
const description =
  '項目を入れて回すだけの無料ルーレット。ランチ・当番・順番決めに。名簿の貼り付けや「1〜30」の範囲指定に対応し、当たった項目を除いて回せば順番決めもできます。登録不要でブラウザだけで動きます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/roulette/` },
};

const faq = [
  {
    q: '項目はいくつまで入れられますか？',
    a: '上限はありません。数が多いときは、回すたびに一部を並べて表示します。抽選はいつでも全項目から行われ、どれも同じ確率で選ばれます。',
  },
  {
    q: '入力した項目は保存されますか？',
    a: 'お使いのブラウザ（ローカルストレージ）に保存され、次に開いたときも残ります。サーバーには送信していません。',
  },
  {
    q: '同じ人が続けて当たらないようにできますか？',
    a: '結果画面の「これを除いてまわす」を使うと、当たった項目を候補から外して次を回せます。これを繰り返せば全員が一度ずつ当たり、そのまま順番決めにもなります。抽選そのものは毎回すべての項目から等しい確率で行われます。',
  },
  {
    q: '名簿をまとめて入力できますか？',
    a: 'できます。改行・カンマ・タブのいずれで区切られていても自動で判別します。「1〜30」のように書けば連番として展開されます。同じ名前が混ざっている場合は警告を出し、ワンタップでまとめられます。',
  },
  {
    q: '絵柄は変えられますか？',
    a: 'はい。項目の左にある絵柄をタップすると一覧が出て、好きなものに変えられます。何も選ばなければ、項目名から自動で選ばれます。',
  },
  {
    q: '同じ項目を友だちと共有できますか？',
    a: '「リンクをコピー」を押すと、項目を含んだURLが作られます。相手がそのリンクを開くと、同じ項目のルーレットが表示されます。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'ルーレット',
      url: `${SITE_URL}/roulette/`,
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

      <h1>ルーレット</h1>
      <p className="lead">
        項目を入れて回すだけ。ランチ、当番、順番決めに。
        登録不要で、入れた内容はこの端末に保存されます。
      </p>

      <RouletteApp />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>
          <strong>項目を入れる</strong> — 決めたい選択肢を入力します。名簿の貼り付け（改行・カンマ区切り）や、
          「1〜30」のような範囲指定もそのまま使えます。よく使う顔ぶれは「リストを保存」しておくと、次回から選ぶだけです。
        </li>
        <li>
          <strong>回す</strong> — 「回す」を押すとルーレット画面になります。中央のボタン、またはスペースキーで回せます。
        </li>
        <li>
          <strong>決める</strong> — 止まった項目が結果です。「これを除いてまわす」を使えば、勝ち抜き形式の抽選もできます。
        </li>
      </ol>

      <h2>こんなときに</h2>
      <ul>
        <li>
          <strong>お昼ごはんを決める</strong> — 候補の店やメニューを入れておけば、迷う時間がなくなります。
        </li>
        <li>
          <strong>当番・担当を決める</strong> — 掃除当番や発表の順番など、角が立ちにくい決め方です。
        </li>
        <li>
          <strong>くじ引き・罰ゲーム</strong> — 飲み会やゲームの罰ゲーム決めに。結果はその場で全員が見られます。
        </li>
        <li>
          <strong>順番決め</strong> — 「これを除いてまわす」を繰り返すと、全員の並び順が決まります。
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

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        ほかのツール：
        {TOOLS.map((t, i) => (
          <span key={t.id}>
            {i > 0 && '／'}
            <Link href={`/${t.id}/`}>{t.name}</Link>
          </span>
        ))}
      </p>
    </>
  );
}
