import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';

const title = '迷路（めいろ）無料｜子供〜大人の5段階・今日の1面・A4に印刷できる答えつき';
const description =
  '無料の迷路。指やマウスでなぞってスタートからゴールへ。ようじ（5×5）・かんたん・ふつう・むずかしい・おにむず（30×30）の5段階と、全員が同じ迷路を解く「今日の1面」。毎回その場で作る迷路は必ず解けて、道は1本。A4に答えつきで印刷でき、4面まとめての印刷も。インストール不要。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/meiro/` },
  robots: robotsFor('meiro'),
};

/**
 * FAQ の1問目（印刷物の配布）は、`home/privacy.html` の著作権の項に例外を足すかどうかが
 * 運営者の確認待ち（docs/features/game-meiro.md の「印刷物の配布と規約」）。
 * 確認が取れるまでは案 (b)：**家庭内での利用**までにとどめ、配布には触れない。
 * 案 (a) が通ったら、規約の文言を足すPRでこの答えも書き換える
 */
const faq = [
  {
    q: '印刷した迷路は使ってよいですか？',
    a: 'ご家庭で、お子さんと遊ぶために印刷してお使いください。印刷には広告やボタンは入らず、迷路と答え、名前と日付を書く欄、ページの場所（hasokon.com/games/meiro/）だけが出ます。',
  },
  {
    q: '答えが1本なのはなぜですか？',
    a: 'このゲームの迷路は「完全迷路」という作り方で、すべてのマスがつながっていて、どの2マスのあいだの道もちょうど1本になるように作っています。行き止まりはたくさんありますが、輪になった道が無いので、スタートからゴールへの正しい道は必ず1本だけです。',
  },
  {
    q: 'スマホで大きい迷路を遊ぶには？',
    a: 'むずかしい（20×20）とおにむず（30×30）では、盤の上の「＋」で迷路を拡大できます。拡大中は、2本の指でなぞると見る場所を動かせます（パソコンはスクロール）。指を離すと、なぞっていた先が画面に入るように表示が自動で動きます。指で盤を触っているあいだは画面がスクロールしないので、落ち着いてなぞれます。',
  },
  {
    q: '広告は印刷されますか？',
    a: '印刷されません。「印刷する」で出るのは迷路と答えだけで、広告・ボタン・ページの説明は紙に出ないようにしています。背景は白、線は黒なので、インクもあまり使いません。',
  },
];

const trail = breadcrumbFor('meiro');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '迷路',
      url: `${SITE_URL}/meiro/`,
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

      <h1>迷路（めいろ）</h1>
      {/* リード文は1行に収める（2行にすると盤が画面の外へ出る） */}
      <p className="lead">なぞってゴールへ。印刷して紙でも遊べます。</p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          左上の<strong>S（スタート）</strong>から、右下の<strong>G（ゴール）</strong>まで道をなぞります
        </li>
        <li>
          指やマウスで<strong>押したまま進むと線が伸び</strong>、来た道を戻ると線が消えます。
          壁の向こうへは線が伸びません
        </li>
        <li>キーボードでは矢印キーで1マスずつ進みます</li>
        <li>ゴールに着いたらクリア。かかった時間が記録されます</li>
      </ol>
      <p>
        大きさは5段階から選べます。
        <strong>ようじ（5×5）</strong>は3〜5歳、
        <strong>かんたん（8×8）</strong>は小学校低学年、
        <strong>ふつう（12×12）</strong>は小学校高学年、
        <strong>むずかしい（20×20）</strong>は中学生〜おとな、
        <strong>おにむず（30×30）</strong>はおとな向けが目安です。
        <strong>今日の1面</strong>は日付で決まる迷路で、同じ日なら誰が開いても同じ迷路になります（段階ごとに1面）。
        「新しい迷路」を押すと、何度でも別の迷路が出ます。
      </p>
      <p>
        「こたえを見る」を押すと、ゴールまでの道が薄く出ます（そのあとクリアしても記録は付きません）。
        「すいすいモード」にすると、矢印キーで分かれ道まで自動で進みます。
        記録（クリア回数・ベストタイム・今日の1面の連続日数）は段階ごとにブラウザへ保存されます。
      </p>

      <h2>印刷のしかた</h2>
      <ul>
        <li>
          <strong>「印刷する」</strong>で、A4縦の1枚目に迷路、2枚目に答えが出ます。
          名前と日付を書く欄つきです
        </li>
        <li>
          <strong>「4面まとめて」</strong>（ようじ・かんたん・ふつう）は、A4 1枚に小さめの迷路を4つ並べ、
          2枚目に4面分の答えをまとめて付けます
        </li>
        <li>
          印刷には広告やボタンは入りません。線は黒、背景は白です。
          プリンターの設定で「両面」を切っておくと、答えを別の紙にできます
        </li>
      </ul>
      <p>お子さんと一緒に画面で遊んだり、印刷して渡したりして使ってください。</p>

      <h2>迷路の作り方（完全迷路とは）</h2>
      <p>
        このゲームの迷路は、開くたびにその場で作っています。
        はじめはすべてのマスが壁で囲まれていて、そこから壁を1枚ずつ壊して道をつなげていきます。
        壊すのは「まだ道がつながっていないマス」との間の壁だけなので、道が輪になることがありません。
        すべてのマスがつながったところで止めると、<strong>どの2マスの間にも道がちょうど1本</strong>だけある迷路になります。
        これを<strong>完全迷路</strong>といい、マスの数より1つ少ない数だけ壁を壊したところでちょうど出来上がります。
      </p>
      <p>
        壊し方には2通りを使っています。小さい迷路は、行けるところまで掘り進み、
        行き止まりになったら戻って別の方へ掘る<strong>「穴掘り法（深さ優先）」</strong>で、
        長くくねった1本道ができやすく、迷いにくい迷路になります。
        大きい迷路は、でたらめに歩いた跡を道にする<strong>「Wilson（ウィルソン）法」</strong>で、
        分かれ道と行き止まりが多く、偏りの少ない迷路になります。
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
        {publicGames
          .filter((g) => g.slug !== 'meiro')
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
