import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { PENSION_BONUS_CAP, PENSION_CAP_STAGES } from '@/lib/shaho-grades';
import { AFFECTED_FROM, accumulate, formatMonthJa, premiumDiff } from '@/lib/kosei-nenkin-jogen';
import Calculator from './Calculator';
import { HAYAMIHYO_ROWS } from './tables';

const title =
  '厚生年金 標準報酬月額 上限引き上げ 計算機（2027年9月〜）｜月給からいくら増えるか・年金はいくら増えるか';
const description =
  '2027年9月から厚生年金の標準報酬月額の上限が65万→68万→71万→75万円と3段階で上がります。月給を入れると、いつの給与から保険料が月いくら増えるか（本人負担で最大9,150円）と、将来の老齢厚生年金がいくら増えるかの目安がわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/kosei-nenkin-jogen/` },
  robots: robotsFor('kosei-nenkin-jogen'),
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

/** 本文の額はすべて lib から出す（手で書かない） */
const TOP = premiumDiff(1_000_000);
const MAX_DIFF = TOP[TOP.length - 1].diff;
/** 2027年9月から10年（本文の説明用。画面を開いた日に依らない固定の例） */
const TEN_YEARS = accumulate(1_000_000, 120, '2027-09');
const STAGES = PENSION_CAP_STAGES;

const faq = [
  {
    q: '対象になる年収の目安は？',
    a: `報酬月額（残業代・手当を含む月の総支給額）が${man(AFFECTED_FROM)}以上の方です。賞与を除いた月給×12でおよそ800万円以上にあたります。厚生労働省の見込みでは加入者の約6%です。`,
  },
  {
    q: '賞与（ボーナス）の保険料も上がりますか？',
    a: `上がりません。厚生年金の標準賞与額の上限（1か月あたり${man(PENSION_BONUS_CAP)}）は今回の改正で変わりません。`,
  },
  {
    q: '健康保険料も上がりますか？',
    a: '上がりません。健康保険の標準報酬月額の上限（50等級・139万円）は今回の改正で変わらず、上がるのは厚生年金保険料だけです。',
  },
  {
    q: '年金はいくら増えますか？',
    a: `上限が上がった分だけ、老齢厚生年金の報酬比例部分（標準報酬 × 5.481/1000 × 月数）が増えます。月給が高く3段階とも上限に当たる方が2027年9月から10年払うと、年額 約${yen(Math.round(TEN_YEARS.pensionPerYear / 100) * 100)}の目安です。遺族厚生年金・障害厚生年金も報酬比例部分をもとに計算するので、これらの額にも反映されます。`,
  },
  {
    q: 'いつの給与から引かれる額が変わりますか？',
    a: `厚生年金保険料は翌月の給与から控除するのが一般的なので、2027年9月分の保険料は${formatMonthJa(TOP[1].deductedFrom as string)}の給与から引かれます（2028年・2029年も同じく10月の給与から）。会社によっては当月控除のところもあります。`,
  },
  {
    q: '役員も対象ですか？',
    a: '対象です。厚生年金に加入している法人の役員も、役員報酬の月額（報酬月額）で標準報酬月額が決まるので、会社員と同じように上限の引き上げが効きます。',
  },
];

const trail = breadcrumbFor('kosei-nenkin-jogen');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '厚生年金 標準報酬月額 上限引き上げ 計算機',
      url: `${SITE_URL}/kosei-nenkin-jogen/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kosei-nenkin-jogen'),
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

      <h1>厚生年金 標準報酬月額 上限引き上げ 計算機</h1>
      <p className="lead">
        2027年9月から、厚生年金の標準報酬月額の上限が{STAGES.map((s) => man(s.cap)).join('→')}
        と3段階で上がります。月給を入れると、<strong>いつの給与から・月いくら</strong>
        保険料が増えるかと、将来の年金がいくら増えるかの目安がわかります。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>上限は3回に分けて上がる</h2>
      <p>
        令和7年の年金制度改正法（令和7年法律第74号。2025年6月13日成立）で、厚生年金の標準報酬月額の上限（現行
        {STAGES[0].grade}等級・{man(STAGES[0].cap)}）が段階的に引き上げられます。料率（18.3%・本人9.15%）は変わらないので、
        増える額は等級の差だけで決まります。会社負担も同じ額だけ増えます。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>施行</th>
              <th>上限</th>
              <th>等級</th>
              <th>控除される給与</th>
            </tr>
          </thead>
          <tbody>
            {TOP.map((p, i) => (
              <tr key={p.effectiveFrom ?? 'current'}>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {p.effectiveFrom ? formatMonthJa(p.effectiveFrom.slice(0, 7)) : '現行（〜2027年8月）'}
                </th>
                <td>{man(p.cap)}</td>
                <td>{STAGES[i].grade}等級</td>
                <td>{p.deductedFrom ? `${formatMonthJa(p.deductedFrom)}〜` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>月給別の本人負担の早見表</h2>
      <p>
        「最大で月{yen(MAX_DIFF)}」は3段階すべてで上限に当たる方の値です。
        <strong>月給が{man(AFFECTED_FROM)}〜73万円の方は、途中の等級で止まります。</strong>
        この表は上の計算機と同じ計算から作っています。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>報酬月額</th>
              <th>〜2027年8月</th>
              <th>2027年9月〜</th>
              <th>2028年9月〜</th>
              <th>2029年9月〜</th>
            </tr>
          </thead>
          <tbody>
            {HAYAMIHYO_ROWS.map((row) => (
              <tr key={row.salary}>
                <th scope="row">{man(row.salary)}</th>
                {row.points.map((p) => (
                  <td key={p.effectiveFrom ?? 'current'}>
                    {yen(p.employee)}
                    {p.diff > 0 && (
                      <>
                        <br />
                        <span className="hint">（+{yen(p.diff)}）</span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>保険料が増えると、年金も増える</h2>
      <p>
        老齢厚生年金の報酬比例部分は「平均標準報酬額 × 5.481/1000 × 被保険者期間の月数」（2003年4月以後の期間）で決まります。
        上限が上がった月は、その差の分だけ年金が積み上がります。3段階とも上限に当たる方が2027年9月から10年（120か月）払うと、
        本人負担の増加は累計 {yen(TEN_YEARS.premiumTotal)}、老齢厚生年金は年 {yen(TEN_YEARS.pensionPerYear)}（月{' '}
        {yen(TEN_YEARS.pensionPerMonth)}）増える目安です。
      </p>
      <p>
        計算機は、この2つの数字（保険料の増加の累計と、年金の増加年額）の比も出します。どちらも賃金の再評価・マクロ経済スライド・
        税の戻りを入れない粗い目安で、実際の年金額は日本年金機構の「ねんきん定期便」などで確認してください。
      </p>

      <h2>変わらないもの</h2>
      <ul>
        <li>
          <strong>健康保険・介護保険</strong>：上限は50等級・139万円のまま
        </li>
        <li>
          <strong>賞与</strong>：厚生年金の標準賞与額の上限は1か月あたり{man(PENSION_BONUS_CAP)}のまま
        </li>
        <li>
          <strong>月給{man(AFFECTED_FROM)}未満の方</strong>：標準報酬月額も保険料も変わりません
        </li>
      </ul>
      <p>
        手取りへの影響をまとめて見たいときは<Link href="/tedori-keisan/">手取り計算機</Link>
        、働きながら年金を受け取る方は<Link href="/zaishoku-rorei-nenkin/">在職老齢年金 計算機</Link>
        （同じ改正法で基準額が変わりました）もあわせてどうぞ。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kosei-nenkin-jogen" />

      <ToolMeta slug="kosei-nenkin-jogen" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000147284_00024.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「厚生年金等の標準報酬月額の上限の段階的引上げについて」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「厚生年金保険料額表」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/jukyu/roureinenkin/jukyu-yoken/20140421-02.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「老齢厚生年金の計算方法」
        </a>
        にもとづき作成。等級の境目（66.5万・69.5万・73万円）は健康保険の等級表と同じです。
        この計算は数字の説明に留め、個別の資産形成や老後の判断は扱いません。
      </ToolMeta>
    </>
  );
}
