import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';
import {
  CHANGE_EXAMPLE,
  CHANGE_ROW,
  EXAMPLE,
  MODE_ROWS,
  PEOPLE_SHIFT,
  UNIT_ROWS,
} from './tables';

const title = '割り勘計算機｜一人あたりいくら？端数の調整も選べる';
const description =
  '飲み会の合計金額と人数を入れるだけで一人あたりの支払額を計算。端数の丸め単位（10円・100円・500円・1000円）と幹事の負担方法（多め・少なめ・均等）を選べる無料の割り勘計算ツールです。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/warikan/` },
  robots: robotsFor('warikan'),
};

const faq = [
  {
    q: '「幹事が端数を負担」と「幹事が端数を得」はどう使い分けますか？',
    a: '幹事が多めに払うか少なめに払うかの違いです。同じ会計で3つのモードを並べた表を「幹事の扱いは3通り」に出しているので、金額差を見てから選んでください。',
  },
  {
    q: '割り勘の端数はどうするのがスマートですか？',
    a: '集めやすさと金額差のつり合いで決まります。単位ごとに幹事の負担がどう動くかは「丸め単位の選び方」の表で比べられます。集めすぎたお釣りの扱いは、声をかける前に一言伝えておくとトラブルになりません。',
  },
  {
    q: '割り切れないとき、誰が多く払うのが一般的ですか？',
    a: '決まった作法はありません。幹事が予約や立て替えを引き受けているぶん、参加者が切り上げで少し多めに払って幹事の負担を軽くする形が選ばれることもあれば、主催者や年長者が多めに払う形が選ばれることもあります。どちらも「その場の関係と、事前に伝えてあるか」で決まるので、集金前に一言伝えておくのがいちばん確実です。',
  },
  {
    q: '送金アプリで割り勘するときのコツは？',
    a: '送金アプリなら1円単位でやり取りできるため、丸めずに「均等（1円単位）」モードを使うのがおすすめです。表示された一人あたりの金額をそのままグループチャットに貼り付けて請求すれば、端数のもめごとがありません。1円単位の余りは幹事が負担する計算になっているので、集金額が合計を超えることもありません。',
  },
  {
    q: '幹事も含めて人数に入れるのですか？',
    a: 'はい。このツールの「人数」は幹事を含めた参加者全員の数です。たとえば5人と入力すると、幹事以外の4人が同じ金額を支払い、残額を幹事が支払う計算になります。幹事が支払い額ゼロ（おごられる側）のケースを計算したい場合は、人数を1人減らして全員を参加者として計算してください。',
  },
];

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

const trail = breadcrumbFor('warikan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '割り勘計算機',
      url: `${SITE_URL}/warikan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('warikan'),
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

      <h1>割り勘計算機</h1>
      <p className="lead">
        飲み会の合計金額と人数を入れるだけで、一人あたりの支払額を計算します。端数の丸め単位と、幹事が多めに払うか少なめに払うかも選べます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>このツールの計算方法</h2>
      <p>
        一人あたりの金額（合計 ÷
        人数）を、選んだ丸め単位で切り捨てまたは切り上げたものを「参加者（幹事以外）の支払額」とし、残りを幹事が支払う仕組みです。どのモードでも
      </p>
      <p
        style={{
          textAlign: 'center',
          fontWeight: 600,
          background: 'var(--accent-soft)',
          padding: 12,
          borderRadius: 10,
        }}
      >
        参加者の支払額 ×（人数 − 1）＋ 幹事の支払額 ＝ 合計金額
      </p>
      <p>
        が<strong>必ず成り立つ</strong>
        ように計算しています。丸めで生じた差は必ず幹事側に寄るため、集金額が合計と合わなくなることがありません。計算機の検算表示はこの式の左辺を出しています。

      </p>

      <h2>幹事の扱いは3通り</h2>
      <p>
        合計{yen(EXAMPLE.total)}を{EXAMPLE.people}人（幹事を含む）で、
        {EXAMPLE.modeTableUnit.toLocaleString('ja-JP')}円単位に丸めた場合の比較です。
        1人あたりは{yen(EXAMPLE.total)} ÷ {EXAMPLE.people} ＝ 約
        {yen(Math.floor(EXAMPLE.total / EXAMPLE.people))}で、きりのよい額になりません。
      </p>
      <table>
        <thead>
          <tr>
            <th>幹事の扱い</th>
            <th>参加者1人</th>
            <th>幹事</th>
          </tr>
        </thead>
        <tbody>
          {MODE_ROWS.map((r) => (
            <tr key={r.mode}>
              <td>{r.label}</td>
              <td>{yen(r.perPerson)}</td>
              <td>{r.kanji < 0 ? `${yen(-r.kanji)}のお釣り` : yen(r.kanji)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        どの行でも「参加者1人 × {EXAMPLE.people - 1}人 ＋ 幹事 ＝ {yen(EXAMPLE.total)}」になります。
        <strong>
          幹事が端数を負担すると幹事の支払いが増え、幹事が端数を得ると減る
        </strong>
        という関係で、参加者の払う額はどちらも丸め単位のきりのよい額です。均等は1円単位まで揃えるかわりに、小銭のやり取りが残ります。
      </p>
      <p>
        <strong>均等を選ぶと丸め単位は使いません。</strong>
        1円単位で揃えるのが目的のモードなので、計算機でも丸め単位の選択が無効になります。送金アプリで請求するなら、この行の金額をそのまま貼るのがいちばん揉めません。
      </p>
      <p>
        「幹事が端数を得」では、<strong>幹事が受け取る側になることがあります</strong>。参加者の支払額 ×（人数 −
        1）が会計を上回るときで、
        <strong>人数が少なく丸め単位が大きいほど起きやすい</strong>
        です。たとえば合計{yen(CHANGE_EXAMPLE.total)}を{CHANGE_EXAMPLE.people}人で
        {CHANGE_EXAMPLE.roundUnit.toLocaleString('ja-JP')}円単位に切り上げると、参加者は
        {yen(CHANGE_ROW.perPerson)}ずつで
        {yen(CHANGE_ROW.perPerson * (CHANGE_EXAMPLE.people - 1))}集まり、幹事は
        {CHANGE_ROW.kanji < 0
          ? `${yen(-CHANGE_ROW.kanji)}のお釣りを受け取ります`
          : `${yen(CHANGE_ROW.kanji)}を支払います`}
        。計算機はこの場合を「お釣り」と表示します。集めたお金が余るので、
        <strong>返すのか幹事が受け取るのかを先に決めておく</strong>と手間になりません。
      </p>

      <h2>丸め単位の選び方</h2>
      <p>
        同じ会計（合計{yen(EXAMPLE.total)}・{EXAMPLE.people}
        人）で、幹事の扱いを「幹事が端数を負担」に固定し、丸め単位だけを変えた場合です。
      </p>
      <table>
        <thead>
          <tr>
            <th>丸め単位</th>
            <th>参加者1人</th>
            <th>幹事</th>
          </tr>
        </thead>
        <tbody>
          {UNIT_ROWS.map((r) => (
            <tr key={r.unit}>
              <td>{r.unit.toLocaleString('ja-JP')}円単位</td>
              <td>{yen(r.perPerson)}</td>
              <td>{yen(r.kanji)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>単位を大きくすると集めるのは楽になりますが、幹事の負担が増えます。</strong>
        現金で集めるなら、千円札と小銭の枚数が少なくてすむ
        {(100).toLocaleString('ja-JP')}円単位か{(500).toLocaleString('ja-JP')}
        円単位が扱いやすく、送金アプリなら1円単位でも手間が変わらないので「均等」で揃えられます。
        {(1_000).toLocaleString('ja-JP')}
        円単位まで大きくすると幹事の持ち出しがはっきり増えるので、幹事が多めに払うと決めている場面向けです。
      </p>
      <p>
        単位を選ぶときに見るのは、<strong>参加者1人と幹事の差額</strong>です。上の表では
        {UNIT_ROWS.map(
          (r, i) =>
            `${i === 0 ? '' : '、'}${r.unit.toLocaleString('ja-JP')}円単位で${yen(r.gap)}`,
        )}
        と広がっていきます。差額は「1人あたりで切り捨てた分を人数分まとめたもの」なので、
        <strong>上限は「丸め単位 × 人数」</strong>
        です。人数が多い会で単位を大きくすると幹事の持ち出しが大きく振れるので、集めやすさと釣り合う範囲で単位は小さめにしておくほうが収まります。
      </p>
      <p>
        <strong>当日に人数が変わると、参加者の額も幹事の上乗せも変わります。</strong>
        上乗せは切り捨てた分を人数分まとめたものなので、人数に比例せず飛ぶように動きます。合計
        {yen(EXAMPLE.total)}を
        {EXAMPLE.modeTableUnit.toLocaleString('ja-JP')}円単位で割ると、
        {PEOPLE_SHIFT.map(
          (r, i) =>
            `${i === 0 ? '' : '、'}${r.people}人なら参加者${yen(r.perPerson)}で幹事の上乗せは${yen(r.gap)}`,
        )}
        です。欠席が出たら人数を直して再計算し、
        <strong>参加者に伝える額は集金前に確定させておく</strong>
        のが安全です。集金後に人数が変わると、参加者の額まで作り直すことになります。
      </p>

      <div className="note">
        表示される金額は計算上の目安です。実際の集金・精算の方法（端数やお釣りの扱いなど）は、参加者間で事前に合意のうえご利用ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="warikan" />

      <ToolMeta slug="warikan" />
    </>
  );
}
