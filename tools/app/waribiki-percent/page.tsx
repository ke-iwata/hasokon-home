import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  LOOKUP_PRICES,
  LOOKUP_RATES,
  LOOKUP_TABLE,
  TAX_RATE_REDUCED,
  TAX_RATE_STANDARD,
  formatPercent,
  formatYen,
} from '@/lib/waribiki-percent';
import Calculator from './Calculator';

const title = '割引・パーセント計算｜%オフ・二重割引・早見表';
const description =
  '「30%オフはいくら？」「割引率は何%？」を、税込／税抜と端数の丸め方（切り捨て・四捨五入・切り上げ）を選んで計算できる割引・パーセント計算機。二重割引（30%オフからさらに20%オフ）や、〇%オフ早見表つき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/waribiki-percent/` },
  robots: robotsFor('waribiki-percent'),
};

/** 本文で何度も出てくる代表値は表と同じ関数から引く */
const cellFor = (price: number, rate: number) => {
  const i = LOOKUP_PRICES.indexOf(price);
  const j = LOOKUP_RATES.indexOf(rate);
  if (i < 0 || j < 0) throw new Error(`早見表にない組み合わせ: ${price}円 × ${rate}%`);
  return LOOKUP_TABLE[i][j];
};

const p1000off30 = cellFor(1000, 30);
const p3000off50 = cellFor(3000, 50);

const faq = [
  {
    q: '「30%オフからさらに20%オフ」は合計で何%オフですか？',
    a: '合計50%オフではなく、44%オフです。1段目の割引で残った70%（0.7）に、2段目の割引で残る80%（0.8）を掛けて残率は0.56。100% − 56% ＝ 44%が合計割引率になります。二重割引モードのチェックを入れると、このツールでも同じ計算になります。',
  },
  {
    q: '端数の切り捨て・四捨五入・切り上げは何が違いますか？',
    a: '1円未満の端数をどう処理するかの違いです。切り捨ては下に落とす（0.9円→0円）、四捨五入は0.5円で上に上がる（0.5円→1円、0.4円→0円）、切り上げは上に押し上げる（0.1円→1円）。同じ「200円の3%オフ」でも、194円（切り捨て・四捨五入）と195円（切り上げ）で分かれます。店舗ごとに実運用が違うため、レジと1円合わないときはこのツールで丸め方を切り替えると、どの方式で処理されているかが分かります。既定は四捨五入です。',
  },
  {
    q: '税込と税抜、どちらで入力するのが正しいですか？',
    a: '基本は税込で入力してください。2021年4月の総額表示義務以降、店頭の値札は税込表示が原則で、レジで打たれるのも税込です。税込のまま計算した割引後の値段が、そのまま支払額になり、二重に消費税を掛ける間違いも起きません。ネットショップやカタログで税抜表示のときだけ「税抜で入力」に切り替えて、割引後の税込額を併記させてください。',
  },
  {
    q: '軽減税率8%はどんなときに選びますか？',
    a: '飲食料品（酒類・外食を除く）と、週2回以上発行される定期購読の新聞が軽減税率の対象です。ただしこのツールは対象品目かどうかを判定しないため、対象になるかどうかは領収書やレシートで確認してください。テイクアウトは軽減8%、店内飲食は標準10%といった判定は、お店側が行います。',
  },
  {
    q: '半額と50%オフは同じですか？',
    a: '同じです。「半額」は「元の値段の50%になる（＝50%オフ）」で、1,000円なら500円です。まれに「実質半額（ポイント還元込み）」のように表記されることがありますが、その場合はポイント還元の条件と有効期限を必ず確認してください。ポイントは値引きと同じではなく、次の買い物で使うまで手元の金額は減りません。',
  },
  {
    q: '「◯円が◯円になった」は何%オフですか？',
    a: '「割引率の逆算」モードを使ってください。元の値段と売値を入れると、値引き額と割引率（オフ率）が出ます。例えば3,980円が2,786円になっていたら30%オフ、1,990円になっていたら50%オフです。売値のほうが高い場合は「値上げ」として、値上げ率と差額を返します。',
  },
  {
    q: '「AのB%はいくら？」と「AはBの何%？」は何が違いますか？',
    a: '前者はA×B÷100（例: 1,200円の8%＝96円）、後者はA÷B×100（例: 300は1,200の25%）です。同じA・Bを入れても計算式が違うので答えが変わります。買い物では「税額」や「値引き額」を求めるのが前者、「達成率」や「シェア」を求めるのが後者です。「変化率」は「AがBに増えた／減った」で、(B−A)÷A×100（例: 1,000→1,200なら+20%）を計算します。',
  },
  {
    q: '複数の割引を使うときの順番で結果は変わりますか？',
    a: '割引率どうしの二重割引だけなら順番は関係ありません（30%→20%と20%→30%は同じ44%オフ）。ただし「割引→ポイント」の順と「ポイント→割引」の順ではレシートの金額が変わることがあり、支払額は同じでも付与されるポイントが変わります。また端数を各段階で丸めるかどうかによっても1〜数円ずれることがあり、店舗ごとに運用が違います。',
  },
];

const trail = breadcrumbFor('waribiki-percent');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '割引・パーセント計算',
      url: `${SITE_URL}/waribiki-percent/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('waribiki-percent'),
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

      <h1>割引・パーセント計算</h1>
      <p className="lead">
        「{formatYen(1000)}の30%オフはいくら？」「割引率は何%だった？」を、税込／税抜と
        <strong>端数の丸め方（切り捨て・四捨五入・切り上げ）を選んで計算</strong>
        できます。二重割引・パーセント計算・
        <a href="#hayamihyou">〇%オフ早見表</a>も1ページにまとめています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>計算の中身</h2>
      <h3>割引後の値段</h3>
      <p>
        <strong>割引後の値段 ＝ 元の値段 × (1 − 割引率 ÷ 100)</strong>を計算し、選んだ丸め方で1円単位に丸めます。例えば {formatYen(1000)} の30%オフは 1,000 × 0.7 ＝ {formatYen(p1000off30.discounted)}、{formatYen(3000)} の50%オフは 3,000 × 0.5 ＝ {formatYen(p3000off50.discounted)} です。
      </p>
      <h3>二重割引</h3>
      <p>
        「{formatPercent(30)}オフからさらに{formatPercent(20)}オフ」は、割引率どうしを足すのではなく、残った率どうしを掛けます。0.7 × 0.8 ＝ 0.56 で残るのは56%、割引率は<strong>{formatPercent(44)}オフ</strong>です。50%オフだと思って買うと、実際の値引きより小さくてがっかりすることがあります。順番を入れ替えても結果は同じです。
      </p>
      <h3>割引率の逆算</h3>
      <p>
        <strong>割引率 ＝ (元の値段 − 売値) ÷ 元の値段 × 100</strong>。1,000円が700円になっていれば {formatPercent(30)}オフです。売値のほうが高い場合は負の値（値上げ率）として、差額とともに返します。
      </p>
      <h3>パーセント計算</h3>
      <p>「A の B% は？」「A は B の何%？」「A が B に増えた／減った変化率は？」の3種類です。買い物では前2つが、家計や成績の増減では最後の変化率がよく使われます。式はいずれも小学校で習う3公式ですが、その場で電卓を叩くよりこのツールに入れたほうが早いはずです。</p>

      <h2>「レジと1円合わない」ときのために（端数処理）</h2>
      <p>
        1円未満の端数を店舗ごとにどう丸めるかは統一ルールがありません。<strong>切り捨て・四捨五入・切り上げ</strong>のいずれで処理するかで、同じ割引率でも1〜数円ずれます。
      </p>
      <ul>
        <li>
          <strong>切り捨て</strong>: 端数を下に落とす（消費者に有利）
        </li>
        <li>
          <strong>四捨五入</strong>: 端数が0.5以上で上に上がる（既定。多くの店舗で使われる）
        </li>
        <li>
          <strong>切り上げ</strong>: 端数を上に押し上げる（店舗に有利）
        </li>
      </ul>
      <p>
        税抜で入力したときは、<strong>「割引後の税抜価格」と「税込額」の2段階</strong>それぞれに、選んだ丸め方が1回ずつ掛かります。どの段階で1円ズレたかは結果の内訳に出るので、レジのレシートと突き合わせて原因を切り分けてください。
      </p>

      <h2 id="hayamihyou">〇%オフ早見表</h2>
      <p>
        代表的な価格と割引率の早見表です。値は計算機と同じ式（四捨五入）から作っているので、表の値と計算結果が食い違うことはありません。税は含まず「本体価格の割引後」を出しています。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>元の値段 ＼ 割引率</th>
              {LOOKUP_RATES.map((rate) => (
                <th key={rate}>{rate}%オフ</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LOOKUP_PRICES.map((price, i) => (
              <tr key={price}>
                <th scope="row">{formatYen(price)}</th>
                {LOOKUP_RATES.map((_rate, j) => (
                  <td key={j}>{formatYen(LOOKUP_TABLE[i][j].discounted)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        表は税抜・税込の区別をせず、入力の値段をそのまま割引に掛けたものです。税抜で持っている場合は、下欄外の「税込に直す」列の目安（本体価格 × 1.10）を足してください。
      </p>

      <h2>税込／税抜の考え方</h2>
      <p>
        <strong>入力は税込を既定にしています。</strong>2021年4月の総額表示義務以降、店頭の値札は税込表示が原則で、値段を打つ人が「税抜」を想定している場面は少ないためです。税込のまま計算した割引後の値段が、そのまま支払額になります。ネットショップやカタログで税抜表示のときだけ「税抜で入力」に切り替えると、割引後に消費税（{Math.round(TAX_RATE_STANDARD * 100)}% ／ 軽減{Math.round(TAX_RATE_REDUCED * 100)}%）を上乗せした税込額が並んで出ます。
      </p>
      <div className="note">
        <strong>軽減税率（8%）は対象品目が限られます。</strong>飲食料品（酒類・外食を除く）と、週2回以上発行される定期購読の新聞のみで、テイクアウト・店内飲食の区分はお店の判断です。このツールは品目の判定はしないので、対象かどうかはレシートで確認してください。
      </div>

      <h2>やらないこと（避けている落とし穴）</h2>
      <ul>
        <li>
          <strong>ポイント還元を「実質値引き」として扱わない</strong>。還元の条件（付与上限・有効期限・現金化不可）が複雑すぎて、単純に値引きへ変換すると誤解を生みます。ポイントは次の買い物で使うまで手元の金額は減りません
        </li>
        <li>
          <strong>クーポン併用の店舗別ルールを持たない</strong>。同じ「30%オフクーポン」でも他のセール品と併用可・不可、対象品目、優先順位が店舗ごとに違うため、一般化して答えを出せません
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

      <RelatedTools current="waribiki-percent" />

      <ToolMeta slug="waribiki-percent">
        消費税率は、消費税法（
        <a
          href="https://elaws.e-gov.go.jp/document?lawid=363AC0000000108"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          昭和63年法律第108号
        </a>
        ）と地方税法にもとづく国税庁の告示（2019年10月1日施行の10% ／軽減8%）を根拠にしています。総額表示は消費税法63条の「消費税転嫁対策特別措置法」失効（2021年4月1日）以降、値札・広告等で税込表示が義務です。1円未満の端数処理は法定ではなく、店舗の運用によります。
      </ToolMeta>
    </>
  );
}
