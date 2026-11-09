import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';
import { BINGO_TABLE, TABLE_TRIALS, rowFor } from './tables';

// 仕様: docs/features/bingo-chusenki.md

const title = 'ビンゴ抽選機とビンゴカード印刷｜忘年会・新年会に使える無料ツール（登録不要）';
const description =
  'ビンゴの番号を重複なく引いてプロジェクターに大きく映せる無料の抽選機。番号つきのビンゴカードをA4に4枚ずつ印刷でき、カード番号を入れると本当にビンゴかをその場で確かめられます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/bingo/` },
  robots: robotsFor('bingo'),
};

const r1 = rowFor(1);
const r30 = rowFor(30);
const r50 = rowFor(50);
const r100 = rowFor(100);

const faq = [
  {
    q: '出る番号に偏りはありませんか？',
    a: 'まだ出ていない番号の中から、どれも同じ確率で1つを選んでいます。乱数はブラウザの暗号用の乱数（crypto.getRandomValues）を使い、割り算の余りで起きる小さな偏りも、端の値を捨てて引き直す方法で消しています。一度出た番号は二度と出ません。',
  },
  {
    q: '途中でページを閉じてしまったら？',
    a: '出た番号の順番は、このブラウザの中（localStorage）に自動で残しています。同じパソコンの同じブラウザで開き直すと「続きから引く」を選べます。プライベートブラウズなど保存が使えない環境では残りませんが、抽選そのものは使えます。',
  },
  {
    q: '別のパソコンでカードを作ったときは？',
    a: 'カードは「合言葉」と「カード番号」だけで決まります。抽選するパソコンの「合言葉」欄に、カードの右上に印字された6文字の合言葉を入れれば、どのカードも同じ並びで呼び出して確かめられます。カードの中身はどこにも送らず、保存もしていません。',
  },
  {
    q: '印刷するとずれる・2ページ目にはみ出します',
    a: '印刷の設定で用紙を A4・縦、倍率を「100%」（または「既定」）にし、「ページに合わせる」を外してください。余白は「既定」のままで1ページに4枚が収まります。PDF にしたいときは、印刷先で「PDF に保存」を選びます。',
  },
  {
    q: '1〜75 以外の範囲でもできますか？',
    a: '「1〜◯まで」を 10〜99 の範囲で変えられます（子ども会の 1〜30 など）。ただしカードの列分け（B は 1〜15 など）は 1〜75 の決まりなので、範囲を変えたときはカードの作成と確かめは使えず、番号は「B-7」ではなく数字だけで表示します。',
  },
  {
    q: 'カードが足りなくなったら？',
    a: '同じ合言葉のまま、「何番から」に続きの番号を入れて作ります。たとえば30枚配ったあとに10枚足すなら、31番から10枚です。カードは番号ごとに決まるので、すでに配ったカードの並びは変わりません。',
  },
];

const trail = breadcrumbFor('bingo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'ビンゴ抽選機・ビンゴカード', slug: 'bingo', description }),
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

      <h1>ビンゴ抽選機・ビンゴカード</h1>
      <p className="lead">
        忘年会・新年会のビンゴ大会に。1〜75 の番号を重複なく引いてパソコンやプロジェクターに大きく映し、番号つきのカードを A4 に4枚ずつ印刷できます。「ビンゴ！」の申告は、カード番号を入れればその場で確かめられます。登録・インストール不要で、番号もカードもどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>
          <strong>カードを刷る</strong>：下の「カードを作って印刷する」に参加人数を入れて「作る」を押し、印刷します。A4 1枚に4枚ずつ、切り取り線つきで出ます。
        </li>
        <li>
          <strong>映して引く</strong>：パソコンをプロジェクターやテレビにつなぎ、「全画面」にして「引く」（Space キーでも引けます）。出た番号は盤面に色が付きます。
        </li>
        <li>
          <strong>申告をカード番号で確かめる</strong>：「ビンゴ！」と手が挙がったら、カード右上の番号を「カード番号を確かめる」に入れます。揃っている列と、景品を渡したカードの一覧が出ます。
        </li>
      </ol>

      <h2>何個目でビンゴが出る？</h2>
      <p>
        標準のカード（5×5・中央は FREE・縦横斜めの12列）で、何個目の番号でビンゴが出るかを {TABLE_TRIALS.toLocaleString()} 回ずつシミュレーションした中央値です。参加者が多いほど最初のビンゴは早く出ます。1人で遊ぶと、最初のビンゴはだいたい {r1.firstMedian} 個目です。
      </p>
      <table>
        <thead>
          <tr>
            <th>参加人数（カード枚数）</th>
            <th>最初のビンゴ</th>
            <th>10 人目のビンゴ</th>
          </tr>
        </thead>
        <tbody>
          {BINGO_TABLE.map((row) => (
            <tr key={row.cards}>
              <td>{row.cards} 枚</td>
              <td>{row.firstMedian} 個目</td>
              <td>{row.tenthMedian === null ? '—' : `${row.tenthMedian} 個目`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">中央値は「半分の回はこれより早く、半分の回はこれより遅い」という真ん中の値です。実際の会では前後に数個ずつぶれます。</p>

      <h2>景品の数と引く数の目安</h2>
      <p>
        景品が10個なら、10人目のビンゴが出るまでが大会の長さです。上の表から、30人で景品10個ならだいたい {r30.tenthMedian} 個目（中央値）まで引けば10人目のビンゴが出ます。50人なら1人目は {r50.firstMedian} 個目前後、10人目は {r50.tenthMedian} 個目前後です。100人の大きな会では、最初のビンゴが {r100.firstMedian} 個目ごろに出ます。
      </p>
      <p>
        番号は全部で75個なので、30人・景品10個の会なら全体の半分ほどを引いたところで景品が出そろう計算です。1個引くのに何秒かけるかで、だいたいの所要時間が見積もれます。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="bingo" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>／<Link href="/dice/">サイコロ</Link>／
        <Link href="/group/">グループ分け</Link>／<Link href="/warikan/">割り勘</Link>（宴会のあとの精算に）
      </p>

      <ToolMeta slug="bingo">
        乱数はブラウザ標準の{' '}
        <a
          href="https://developer.mozilla.org/ja/docs/Web/API/Crypto/getRandomValues"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          crypto.getRandomValues()
        </a>
        、全画面表示は{' '}
        <a href="https://developer.mozilla.org/ja/docs/Web/API/Fullscreen_API" target="_blank" rel="nofollow noopener noreferrer">
          Fullscreen API
        </a>
        を使っています。目安の表は、このページのプログラムで標準のカードを使ったシミュレーションから出しています。
      </ToolMeta>
    </>
  );
}
