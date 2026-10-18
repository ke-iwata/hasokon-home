import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  DATA_CHECKED_AT,
  LIMIT_BEFORE,
  LIMIT_FROM_2026_04,
  YASHOKU_BEFORE,
  YASHOKU_FROM_2026_04,
} from '@/lib/shokuji-hojo-hikazei';
import Calculator from './Calculator';
import { EXAMPLE_2594, EXAMPLE_2594_1, PER_DAY_ROWS } from './tables';

const title = '食事補助の非課税 判定｜月7,500円（令和8年4月から）・8%と10%の混在も計算';
const description =
  '会社の食事補助が所得税で非課税かを判定。1食の価額・本人負担・食数を入れると、半分以上の自己負担と会社負担月7,500円（税抜き）の2条件を確かめ、課税なら給与に足す額とあと何円で非課税になるかを出します。弁当（8%）と社員食堂（10%）の混在、夜食代650円にも対応。登録不要・無料。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['食事補助', '非課税', '7500円', '社員食堂', '福利厚生', '令和8年'],
  alternates: { canonical: `${SITE_URL}/shokuji-hojo-hikazei/` },
  robots: robotsFor('shokuji-hojo-hikazei'),
};

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const dec = (v: number) => v.toLocaleString('ja-JP', { maximumFractionDigits: 2 });

const ex1 = EXAMPLE_2594_1;

const faq = [
  {
    q: '食事補助の非課税枠はいつから7,500円ですか？',
    a: `令和8年4月1日以後に支給する食事からです（所得税基本通達36-38の2の改正）。それより前に支給した食事は月${yen(LIMIT_BEFORE)}（消費税等を除く）のままです。`,
  },
  {
    q: '7,500円を超えたら、超えた分だけ課税ですか？',
    a: `いいえ。会社負担が税抜き${yen(LIMIT_FROM_2026_04)}を1円でも超えると、超えた分ではなく会社負担の全額が給与になります。本人の負担が食事の価額の半分未満のときも同じで、全額が給与です。`,
  },
  {
    q: '7,500円は税込みですか、税抜きですか？',
    a: '限度額と比べるのは消費税等を除いた（税抜きの）会社負担で、10円未満の端数は切り捨てます。一方、課税になったときに給与に足すのは税込みの会社負担の全額です。',
  },
  {
    q: '食事券・チケットでも非課税になりますか？',
    a: `会社が契約した飲食店で、在宅勤務の日に本人の食事にだけ使える・1回の利用に上限がある・釣銭が出ない・有効期間がある、などの条件を付けた食券なら、食事の支給と同じとみることができ、同じ2条件（半分以上の本人負担・会社負担が月${yen(LIMIT_FROM_2026_04)}〈税抜き〉以下）で判定します。出勤日の弁当と併せて出すときは、会社負担の合計で見ます（国税庁 在宅勤務FAQ 問12・問13）。社員が払った食事代をあとからお金で補助する形は、補助の全額が給与です（質疑応答事例「使用者が使用人等に対し食事代として金銭を支給した場合」）。`,
  },
  {
    q: '締め日が3月21日〜4月20日のように4月をまたぐときは？',
    a: `限度額は「令和8年4月1日以後に支給する食事」で切り替わるので、3月31日以前に出した食事は月${yen(LIMIT_BEFORE)}、4月1日以後に出した食事は月${yen(LIMIT_FROM_2026_04)}で、分けて判定します。この計算機では「この食事を出した期間」を切り替えて2回入れてください。`,
  },
  {
    q: '残業のときの弁当はどうなりますか？',
    a: '残業や宿日直をしたときに無料で出す食事は、給与にしなくてかまいません。この計算機の内訳にも入れないでください。',
  },
  {
    q: '夜食代はいくらまで非課税ですか？',
    a: `深夜勤務者（正規の勤務時間の一部か全部が午後10時〜翌午前5時の人）に、夜食を現物で出すのが著しく困難なために、通常の給与に加えて勤務1回ごとの定額で渡す夜食代なら、1回${yen(YASHOKU_FROM_2026_04)}以下が非課税です（令和8年3月31日以前の支給は${yen(YASHOKU_BEFORE)}）。${yen(YASHOKU_FROM_2026_04)}を超えるかは消費税等相当額を除いた金額で判定しますが、換算の税率は通達に書かれていないので、${yen(YASHOKU_FROM_2026_04)}を少し超える額は税務署か税理士に確認してください。`,
  },
];

const trail = breadcrumbFor('shokuji-hojo-hikazei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '食事補助の非課税 判定',
      url: `${SITE_URL}/shokuji-hojo-hikazei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shokuji-hojo-hikazei'),
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

const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="nofollow noopener noreferrer">
    {text}
  </a>
);

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>食事補助の非課税 判定（月7,500円・令和8年4月から）</h1>
      <p className="lead">
        会社が出す弁当・社員食堂・食事券の1か月分を入れると、所得税が非課税か、課税なら給与に足す額はいくらかを出します。8%（持ち帰り・配達）と10%（店内）が混ざる月も、国税庁の手順どおり税抜きに直して判定します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>食事補助が非課税になる2つの条件</h2>
      <p>
        会社が役員・従業員に食事を支給したとき、次の<strong>2つを両方</strong>満たせば給与にしなくてかまいません（所得税基本通達36-38の2）。
      </p>
      <ol>
        <li>本人が<strong>食事の価額の半分以上</strong>を負担している</li>
        <li>
          「食事の価額 − 本人の負担額」が<strong>1か月{yen(LIMIT_FROM_2026_04)}（消費税等を除く）以下</strong>
          （令和8年4月1日以後に支給する食事から。それより前は{yen(LIMIT_BEFORE)}）
        </li>
      </ol>
      <p>
        食事の価額は、仕出し弁当などなら<strong>業者に払う額</strong>、社員食堂で作るなら<strong>材料費・調味料など直接かかった費用の合計</strong>です。
        満たさないときは、超えた分ではなく「食事の価額 − 本人の負担額」の<strong>全額</strong>が給与です。
        国税庁の例では、価額{yen(EXAMPLE_2594.result.totalPrice)}・本人負担{yen(EXAMPLE_2594.result.totalSelf)}で半分に届かないため、
        差額の{yen(EXAMPLE_2594.result.taxableAmount)}が給与になります。
      </p>

      <h2>8%と10%が混ざるときの計算</h2>
      <p>
        弁当の配達（軽減税率8%）と店内での食事（標準税率10%）が同じ月に混ざるときは、会社の負担額を<strong>税率ごとに合計し、それぞれの税率で税抜きに直してから足し</strong>、10円未満を切り捨てて{yen(LIMIT_FROM_2026_04)}と比べます。行ごとに直して切り捨てると、結果が変わることがあります。国税庁の例をこの計算機の判定でなぞると次のとおりです。
      </p>
      <table>
        <thead>
          <tr>
            <th>区分</th>
            <th>会社負担（税込み）</th>
            <th>税抜き</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>
              配達（8%）{yen(ex1.reduced.price)}・本人{yen(ex1.reduced.selfPay)} × {ex1.reduced.count}回
            </td>
            <td>{yen(ex1.result.companyByKind.reduced)}</td>
            <td>{dec(ex1.reducedExcl)}円</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>
              店内（10%）{yen(ex1.standard.price)}・本人{yen(ex1.standard.selfPay)} × {ex1.standard.count}回
            </td>
            <td>{yen(ex1.result.companyByKind.standard)}</td>
            <td>{dec(ex1.standardExcl)}円…</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>
              <strong>合計（10円未満切り捨て）</strong>
            </td>
            <td>
              <strong>{yen(ex1.result.companyTaxIncl)}</strong>
            </td>
            <td>
              <strong>{yen(ex1.result.companyTaxExcl)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        税抜き{yen(ex1.result.companyTaxExcl)}は{yen(LIMIT_FROM_2026_04)}を超えるので課税で、給与になるのは<strong>税込みの{yen(ex1.result.taxableAmount)}</strong>です。判定は税抜き、給与に足す額は税込み、と使う額が違う点に注意してください。
      </p>

      <h2>お金で渡すと課税になる理由と夜食代の例外</h2>
      <p>
        非課税の扱いは「食事の支給」に限られ、<strong>食事代をお金で渡すと原則として全額が給与</strong>です。社員が飲食店に払った食事代の半分を、月{yen(LIMIT_FROM_2026_04)}を上限に口座へ振り込む制度も、食事ではなく金銭の支給なので補助の全額が給与になります。一方、<strong>会社と飲食店の契約で、会社が飲食店に食事代を払う</strong>形なら、食事の支給として扱えます。
      </p>
      <p>
        例外は、深夜勤務で夜食を出せない人に渡す夜食代です。通常の給与に加えて勤務1回ごとの定額で渡し、1回{yen(YASHOKU_FROM_2026_04)}以下（消費税等相当額を除いた額で判定。改正前は{yen(YASHOKU_BEFORE)}）なら給与にしなくてかまいません。
      </p>

      <h2>1日あたりの目安（7,500円 ÷ 勤務日数）</h2>
      <p>
        会社負担を1日あたりに直すと、次がおおよその上限です（本人が半分以上を負担していることが前提）。「1食500円の補助」は月22日で11,000円になり、課税になります。
      </p>
      <table>
        <thead>
          <tr>
            <th>月の勤務日数</th>
            <th>税抜き</th>
            <th>税込み（8%・弁当）</th>
            <th>税込み（10%・食堂）</th>
          </tr>
        </thead>
        <tbody>
          {PER_DAY_ROWS.map((row) => (
            <tr key={row.days}>
              <td>{row.days}日</td>
              <td>{yen(row.perDay)}</td>
              <td>{yen(row.perDay8)}</td>
              <td>{yen(row.perDay10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">1円未満は切り捨てています。食数と単価を入れた正確な判定は上の計算機で確かめてください。</p>

      <div className="note">
        この判定は所得税の取扱いの目安です。役員だけに出すような特定の人だけの食事補助や、通常の判定に当てはめにくい出し方は、税務署か税理士に確認してください。社会保険料の「報酬」に入るかは、厚生労働大臣が都道府県ごとに定める食事の価額で決まり、この判定とは別です。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shokuji-hojo-hikazei" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/tsukin-teate-hikazei/">通勤手当 非課税限度額チェッカー</Link>／
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>／
        <Link href="/tedori-keisan/">手取り計算機</Link>
      </p>

      <ToolMeta slug="shokuji-hojo-hikazei" ymyl>
        出典：
        {link(
          'https://www.nta.go.jp/users/gensen/2026shokuji/index.htm',
          '国税庁「食事の現物支給に係る所得税の非課税限度額の引上げについて」',
        )}
        ／
        {link(
          'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594.htm',
          '国税庁 タックスアンサー No.2594「食事を支給したとき」',
        )}
        ／
        {link(
          'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594-1.htm',
          '国税庁 タックスアンサー No.2594-1（軽減税率と標準税率が混在する場合）',
        )}
        ／
        {link(
          'https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/gensen/840726/01.htm',
          '国税庁 個別通達「深夜勤務に伴う夜食の現物支給に代えて支給する金銭に対する所得税の取扱いについて」',
        )}
        ／
        {link(
          'https://www.nta.go.jp/law/shitsugi/gensen/03/44.htm',
          '国税庁 質疑応答事例「使用者が使用人等に対し食事代として金銭を支給した場合」',
        )}
        ／
        {link(
          'https://www.nta.go.jp/publication/pamph/pdf/0020012-080.pdf',
          '国税庁「在宅勤務に係る費用負担等に関するFAQ（源泉所得税関係）」問12・問13（令和8年4月1日更新・PDF）',
        )}
        ／
        {link(
          'https://www.nta.go.jp/law/tsutatsu/kihon/shotoku/kaisei/260331/index.htm',
          '所得税基本通達36-38の2の改正（令和8年3月31日）',
        )}
        にもとづき作成（{DATA_CHECKED_AT.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')}確認）。
      </ToolMeta>
    </>
  );
}
