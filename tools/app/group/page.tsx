import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'グループ分けツール｜班分け・チーム分けをランダムに';
const description =
  '名前を入れるだけで、班分け・チーム分けをランダムに作れる無料ツール。人数を揃えて自動で振り分けます。登録不要・アプリ不要でスマホからも使えます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/group/` },
};

const faq = [
  {
    q: '何人まで分けられますか？',
    a: '人数の上限は設けていません。グループ数は2〜99の範囲で指定でき、「1組の人数」で指定する場合は1人以上の好きな人数を設定できます。クラスの席替えや班分け程度の人数（30〜40人）でも問題なく使えます。',
  },
  {
    q: '分け方は本当にランダムですか？',
    a: '全員の並び順をシャッフルしてから先頭のグループへ順に配る方式で、誰がどのグループに入るかは毎回同じ確率です。名前の入力順や五十音順が結果に影響することはありません。',
  },
  {
    q: '特定の2人を同じグループ（別のグループ）にできますか？',
    a: '条件を指定する機能はありません。どうしても外せない組み合わせがある場合は、先にその人たちのグループを決めておき、残りのメンバーだけを入力してツールで分ける、という運用が確実です。分けたあとに手作業で1組だけ入れ替える場合は、全員の前でルールを説明してから行うと不公平感が出にくくなります。',
  },
  {
    q: 'メンバーを書き換えたら結果が消えました',
    a: '仕様です。名簿を変更すると、削除した人が前の結果に残ったままになってしまうため、結果はいったんリセットされます。「分ける」を押し直せば新しい名簿で結果が作れます。',
  },
  {
    q: '結果を配布・掲示するには？',
    a: '結果の下にある「画像にして共有」でグループ分けの一覧を画像にしてチャットに送れます。「印刷する」ボタンを使えば、教室や職場に掲示する紙としてそのまま印刷できます。',
  },
  {
    q: '入力した名前はどこかに送信されますか？',
    a: '送信されません。名簿の処理はすべてお使いのブラウザの中だけで行われ、入力内容が外部のサーバーに送られることはありません。入力した名簿はこの端末のブラウザ内に保存され、次に開いたときにも残ります。',
  },
];

const trail = breadcrumbFor('group');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'グループ分け',
      url: `${SITE_URL}/group/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('group'),
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

      <h1>グループ分け</h1>
      <p className="lead">名前を入れて、いくつのグループに分けるかを決めるだけ。人数は自動で均等に振り分けます。</p>

      <ToolClient tool="group" />

      <AdUnit position="below-tool" />

      <h2>人数が割り切れないときは</h2>
      <p>
        端数は先頭のグループから1人ずつ多く配ります。たとえば10人を3グループなら、4人・3人・3人になります。どのグループが多くなるかを含めてランダムなので、手作業の班分けで起こりがちな「最後に余った人を先生が適当に押し込む」気まずさがありません。
      </p>
      <p>
        「1組の人数」で指定することもできます。5人ずつと決めれば、必要なグループ数が自動で決まります。班の定員が先に決まっているグループワークや、車・テーブルの定員に合わせて分けたいときはこちらが便利です。
      </p>
      <h2>席替え・チーム分けをスムーズに進めるコツ</h2>
      <p>
        名簿の入力は「まとめて入力」を使うと速く済みます。1行に1人ずつ、またはカンマ区切りで貼り付ければ一度に登録でき、「1〜30」のように書けば出席番号の一覧をまとめて作れます。よく使う名簿は「リストを保存」で名前を付けて端末に保存しておくと、次回からワンタップで呼び出せるので、毎週の班替えやクラス替え後の席替えでも入力し直す必要がありません。
      </p>
      <p>
        当日の欠席者は、名簿のチップに付いている×を押して外すだけです。分けた結果は「画像にして共有」でグループ表を画像として配れるほか、「印刷する」でそのまま紙に出せるので、教室の掲示や職場の共有にも使えます。
      </p>
      <h2>納得感のある分け方にするために</h2>
      <p>
        画面を全員が見える場所に出してから作ると、結果が受け入れられやすくなります。分け方は全員をシャッフルして順に配るだけなので、特定の人が有利になる仕組みはありません。
      </p>
      <p>
        気に入らない結果が出たら「もう一度分ける」で作り直せます。ただし、やり直しを繰り返すと公平さの根拠が薄れるので、回数を先に決めておくのがおすすめです。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="group" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/dice/">サイコロ</Link>
      </p>

      <ToolMeta slug="group" />
    </>
  );
}
