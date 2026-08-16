import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ナンプレ 無料｜ブラウザですぐ遊べる数字パズル';
const description =
  '無料のナンプレ（ナンバープレース）。インストール不要でブラウザからすぐ遊べます。かんたん・ふつう・むずかしいの3段階で、答えは必ず1通り。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nanpre/` },
};

const faq = [
  { q: '無料で遊べますか？', a: 'すべて無料です。会員登録もアプリのインストールも不要で、ブラウザだけで遊べます。' },
  { q: '問題は何問ありますか？', a: '「新しい問題」を押すたびにその場で生成するので、実質無制限です。生成した問題はコンピュータが検証しており、答えが必ず1通りになっています。' },
  { q: '難易度の違いは？', a: '最初から埋まっているマス（ヒント）の数です。かんたんは40個、ふつうは32個、むずかしいは26個で、ヒントが少ないほど確定できるマスを見つけるのが難しくなります。' },
  { q: '間違えるとどうなりますか？', a: '同じ行・列・3×3ブロックに同じ数字が重なると、そのマスが赤く表示されます。答えと照らし合わせているわけではなく、ルール上の矛盾を検出する仕組みなので、赤くなっていなくても間違っていることはあります。' },
  { q: 'メモ（候補の書き込み）機能はありますか？', a: '現在はありません。候補が複数あって決められないマスは保留して、先に確定できる別のマスを探すのがおすすめです。' },
  { q: '途中で保存できますか？', a: '盤面の保存機能はありません。ページを閉じると解きかけの問題はリセットされます。難易度ごとのベストタイムとクリア回数の記録は、お使いのブラウザに保存されます。' },
];

const trail = breadcrumbFor('nanpre');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ナンプレ',
      url: `${SITE_URL}/nanpre/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      publisher: { '@id': `${SITE_URL}/#publisher` },
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

      <h1>ナンプレ</h1>
      <p className="lead">
        定番の数字パズルをブラウザで。<strong>答えは必ず1通り</strong>になるように作られた問題を、その場で無限に生成します。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>空いているマスをタップして選び、下の数字ボタン（またはキーボードの1〜9）で入力します</li>
        <li>タテ・ヨコの各列と、太線で区切られた3×3のブロックに、1〜9を1つずつ入れます</li>
        <li>入れた数字を消すときは、マスを選んで「⌫」（キーボードなら0か削除キー）を押します</li>
        <li>同じ数字が重複すると赤く表示されます。すべて正しく埋まればクリアです</li>
      </ol>
      <p>
        マスを選ぶと、盤面にある同じ数字がハイライトされます。「その数字がどこに
        置けないか」を目で追いやすくなるので、確定探しに活用してください。
        最初から埋まっている出題マスは変更できません。タイムの計測は最初に数字を
        入れた瞬間から始まるので、問題を開いてじっくり眺めてから解き始めても
        不利になりません。
      </p>
      <h2>コツ</h2>
      <ul>
        <li>基本は<strong>「その数字が置ける場所が1つしかない」マスを探す</strong>ことです。あるブロックに5を入れたい場合、同じ行・列にすでにある5とぶつかる場所を除いて、残りが1マスならそこで確定です</li>
        <li>盤面に多く埋まっている数字から手を付けましょう。9が8個埋まっていれば、残り1個の場所は自動的に決まります</li>
        <li>逆に「そのマスに入れられる数字が1つしかない」パターンもあります。行・列・ブロックを合わせて8種類の数字に囲まれたマスは、残りの1種類で確定です</li>
        <li>この2つ（数字から探す・マスから探す）を交互に繰り返すのが基本手順です。かんたん・ふつうの問題は、ほぼこれだけで解き切れます</li>
        <li>行き詰まったら、候補が2つに絞れているマスに注目します。片方を仮に置いて矛盾が出れば、もう片方が正解です。ヒント26個のむずかしいモードでは、この読みが必要になる場面があります</li>
      </ul>

      <h2>ナンプレというパズルについて</h2>
      <p>
        ナンプレ（ナンバープレース）は、1970年代にアメリカのパズル誌に載った形式が
        原型とされ、その後日本のパズル誌で人気が定着し、2000年代には海外の新聞に
        掲載されたことをきっかけに世界的なブームになりました。ルールは
        「行・列・ブロックに1〜9を1つずつ」だけと簡単ですが、良い問題の条件として
        「答えが1通りしかないこと」が重視されます。答えが複数あると、論理だけでは
        解き切れず、最後は当てずっぽうになってしまうからです。このページの問題は
        生成のたびにコンピュータが解の個数を検証しているので、
        <strong>どの問題も推理だけで必ず解き切れます</strong>。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <h2>他のゲーム</h2>
      <div className="game-grid">
        {games
          .filter((g) => g.ready && g.slug !== 'nanpre')
          .map((g) => (
            <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
              <div className="icon" aria-hidden="true">
                <GameIcon name={g.icon} />
              </div>
              <div className="name">{g.name}</div>
              <div className="desc">{g.description}</div>
            </Link>
          ))}
      </div>
    </>
  );
}
