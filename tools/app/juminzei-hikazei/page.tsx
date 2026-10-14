import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';
import { hayamihyo, salaryMaxByKyuchi, specialSalaryMax } from './tables';

const title = '住民税 非課税 判定｜令和9年度（2026年の収入）から119万円に。扶養・年金・世帯でいくらまで？';
const description =
  '令和9年度（2026年の収入）から、単身・給与だけなら119万円以下で住民税が非課税に。扶養1人・2人、65歳以上の年金155万円、ひとり親、住んでいる市区町村の級地まで入れて「均等割も所得割もかからないか」を判定。世帯全員を入れて住民税非課税世帯かどうかも出します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/juminzei-hikazei/` },
  robots: robotsFor('juminzei-hikazei'),
};

const fmtYen = (yen: number) => `${yen.toLocaleString('ja-JP')}円`;

const rowsR9 = hayamihyo('R9');
const rowsR8 = hayamihyo('R8');
const specialR9 = specialSalaryMax('R9');
const specialR8 = specialSalaryMax('R8');

const faq = [
  {
    q: 'パートで年収119万円なら、住民税は本当に0円ですか？',
    a: `令和9年度（2026年の収入）の住民税なら、扶養する家族がいない給与だけの方は、給与収入${fmtYen(rowsR9[0].salaryNone)}以下で均等割も所得割もかかりません。給与所得控除の最低保障が74万円に上がり、非課税の線（合計所得45万円）と合わせて119万円になるためです。1円でも超えると均等割と所得割の両方がかかります。ただし均等割の線は住んでいる市区町村の級地で下がり、3級地なら給与${fmtYen(salaryMaxByKyuchi('R9', 3))}が目安です。`,
  },
  {
    q: '親の扶養に入っている学生は、住民税がかかりますか？',
    a: '扶養に入っているかどうかではなく、本人の前年の合計所得で決まります。給与だけの学生なら、令和9年度は給与収入119万円以下で非課税です。なお未成年（賦課期日の1月1日時点で18歳未満）なら、合計所得135万円以下まで非課税になります。親の扶養から外れる線（所得税の扶養は給与136万円以下、社会保険の扶養は年130万円未満など）とは別の線です。',
  },
  {
    q: '年金だけで暮らしている親は、住民税非課税ですか？',
    a: `65歳以上で公的年金だけの方は、公的年金等控除（最低110万円）が効くので、扶養する家族がいなければ年金収入${fmtYen(rowsR9[0].pensionNone)}以下が非課税の目安です（1級地）。配偶者を扶養していれば線は上がります。遺族年金・障害年金は非課税の収入なので数えません。ただし「住民税非課税世帯」になるには、同じ世帯（住民票上の世帯）の全員が非課税である必要があります。`,
  },
  {
    q: '令和8年度（いまの住民税）と何が違いますか？',
    a: `給与所得控除の最低保障が65万円から74万円に上がり（令和9・10年度）、給与収入に直した非課税の線が9万円上がります。単身なら${fmtYen(rowsR8[0].salaryNone)}→${fmtYen(rowsR9[0].salaryNone)}、扶養1人なら${fmtYen(rowsR8[1].salaryNone)}→${fmtYen(rowsR9[1].salaryNone)}です（1級地）。一方で住民税の基礎控除は43万円のままで、非課税の限度額の式（35万円×人数＋10万円など）も変わっていません。年金だけの方の線は変わりません。`,
  },
  {
    q: '医療費控除やふるさと納税で住民税が0円になったら、非課税世帯ですか？',
    a: 'いいえ。住民税の非課税は、所得控除を引く前の合計所得金額（総所得金額等）で判定します。医療費控除・ふるさと納税・社会保険料控除などで所得割の額が0円になることはありますが、それは「非課税」ではなく、非課税世帯の判定にも効きません。給付金や高額療養費の区分を調べるときは、控除前の所得で判定してください。',
  },
  {
    q: '住民税非課税世帯なら給付金はもらえますか？',
    a: '住民税非課税世帯を対象にした給付金は、国の経済対策や自治体の独自施策として年度ごとに決まり、対象・金額・申請期限は自治体によって違います。このツールでは金額を出しません。お住まいの市区町村の案内（広報・公式サイト）を確認してください。非課税世帯かどうかは、6月ごろに届く住民税の通知書（または非課税証明書）で確定します。',
  },
];

const trail = breadcrumbFor('juminzei-hikazei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '住民税 非課税 判定',
      url: `${SITE_URL}/juminzei-hikazei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('juminzei-hikazei'),
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

const EGOV = (id: string) => `https://laws.e-gov.go.jp/law/${id}`;

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>住民税 非課税 判定</h1>
      <p className="lead">
        2026年の収入から、令和9年度（2027年6月から）の住民税が「均等割も所得割もかからないか・所得割だけかからないか・かかるか」を判定します。給与・年金・扶養人数・級地まで入れられ、世帯全員を入れれば住民税非課税世帯かどうかも分かります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>均等割と所得割は、かからなくなる線が違う</h2>
      <p>
        個人の住民税は、所得に関係なく定額でかかる<strong>均等割</strong>と、所得に応じてかかる<strong>所得割</strong>
        の2つでできています。かからなくなる線はそれぞれ別で、所得割のほうが高い線です。そのため「所得割はかからないが、均等割だけかかる」帯があります。
      </p>
      <ul>
        <li>
          <strong>均等割がかからない</strong>：前年の合計所得金額が「35万円 ×（本人＋同一生計配偶者＋扶養親族の人数）＋
          10万円（配偶者・扶養親族がいれば、さらに21万円）」以下。額は市区町村の条例で決まり、生活保護の級地で下がります（2級地は35万円・21万円の0.9倍、3級地は0.8倍）
        </li>
        <li>
          <strong>所得割がかからない</strong>：前年の総所得金額等が「35万円 × 人数 ＋ 10万円（配偶者・扶養親族がいれば、さらに32万円）」以下。こちらは全国共通です
        </li>
        <li>
          <strong>障害者・未成年・寡婦・ひとり親</strong>：前年の合計所得金額が135万円以下なら、均等割も所得割もかかりません
        </li>
      </ul>
      <p>
        人数には<strong>16歳未満の子も数えます</strong>
        。16歳未満の子には扶養控除が無いので年末調整の扶養控除の欄には書きませんが、非課税の線では1人として数えます。ここを0人にすると、線が35万円以上低く出ます。
      </p>

      <h2>給与収入・年金収入の早見表（1級地）</h2>
      {/* 列が5つあるので、320px では表の中だけ横にスクロールさせる（furusato-nozei と同じ） */}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>配偶者・扶養の人数</th>
              <th>令和9年度 給与（均等割も非課税）</th>
              <th>令和9年度 給与（所得割が非課税）</th>
              <th>令和8年度 給与（均等割も非課税）</th>
              <th>65歳以上 年金だけ（均等割も非課税）</th>
            </tr>
          </thead>
          <tbody>
            {rowsR9.map((r, i) => (
              <tr key={r.dependents}>
                <td>{r.dependents === 0 ? 'なし（単身）' : `${r.dependents}人`}</td>
                <td>{fmtYen(r.salaryNone)}以下</td>
                <td>{fmtYen(r.salaryShotokuwari)}以下</td>
                <td>{fmtYen(rowsR8[i].salaryNone)}以下</td>
                <td>{fmtYen(r.pensionNone)}以下</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        障害者・ひとり親等は、給与収入{fmtYen(specialR9)}以下（令和9年度）・{fmtYen(specialR8)}
        以下（令和8年度）で非課税。給与収入が660万円未満の帯は、給与所得を所得税法の別表第五（4,000円刻み）で求めているので、境目が「◯万3,999円」のような端数になります。2・3級地では均等割の線が下がるので、上の計算機で級地を選んでください。
      </p>

      <h2>所得割0円と「非課税」は違う</h2>
      <p>
        住民税の非課税は、<strong>所得控除を引く前</strong>の合計所得金額（総所得金額等）で判定します。医療費控除・ふるさと納税・社会保険料控除・生命保険料控除などで所得割の額が0円になることはありますが、それは非課税ではありません。
      </p>
      <p>
        非課税かどうかは、高額療養費の区分・国民健康保険料の軽減・高校生等奨学給付金・各種の給付金の対象を決めます。所得割が0円でも均等割がかかっていれば、これらの「住民税非課税」の扱いは受けられません。このツールに所得控除の入力欄が無いのはこのためです。
      </p>

      <h2>所得税はかからないのに、住民税はかかる理由</h2>
      <p>
        2026年分（令和8年分）の所得税の基礎控除は、合計所得489万円以下なら104万円です。給与所得控除74万円と合わせると、給与だけの方は178万円まで所得税がかかりません。一方、住民税の基礎控除は43万円のままで、非課税の線も合計所得45万円（単身・給与だけなら119万円）です。
      </p>
      <p>
        そのため、単身で給与119万円を超え178万円以下の方は「所得税はかからないのに住民税はかかる」帯に入ります。所得税が非課税なら住民税も非課税だと思われがちですが、線は別です。
      </p>

      <h2>「非課税世帯」は住民票上の世帯で、全員が非課税のとき</h2>
      <p>
        住民税非課税世帯は、<strong>住民票上の同じ世帯の全員</strong>
        が住民税非課税（均等割もかからない）である世帯です。生計を一にしているかどうかとは別で、同じ家に住んでいても世帯を分けていれば別の世帯になります。本人が非課税でも、同じ世帯に課税される人が1人でもいれば非課税世帯ではありません。
      </p>
      <p>
        親が年金だけ・同居の子が働いて親を扶養している、という世帯では、子の非課税の線は子の扶養人数（親を数える）で決まります。計算機の「世帯の判定」で世帯員ごとに扶養人数を入れられるのはこのためです。
      </p>

      <h2>級地は生活保護の級地</h2>
      <p>
        均等割の線は、生活保護の基準の「級地」（1級地〜3級地）によって市区町村ごとに条例で決まっています。東京23区・政令指定都市の多くは1級地で、町村部には2級地・3級地が多くあります。お住まいの級地は市区町村の住民税のページ（「住民税が課税されない方」などのページ）に載っている非課税の限度額で確かめられます。所得割の線は級地によらず全国共通です。
      </p>

      <div className="note">
        判定は見込みです。最終的な課税・非課税は、お住まいの市区町村の決定（6月ごろに届く住民税の通知書）によります。このツールは制度の説明と金額の判定にとどめ、個別の申告の作成や税務相談は扱いません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="juminzei-hikazei" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/nenshu-kabe/">年収の壁 計算機</Link>（119万・130万・178万の壁）／
        <Link href="/kogaku-ryoyohi/">高額療養費 計算機</Link>（住民税非課税の区分）／
        <Link href="/tedori-keisan/">手取り計算機</Link>（住民税の額の概算）
      </p>

      <ToolMeta slug="juminzei-hikazei" ymyl>
        出典：
        <a href={EGOV('325AC0000000226')} target="_blank" rel="nofollow noopener noreferrer">
          地方税法
        </a>
        （24条の5・295条・附則3条の3）、
        <a href={EGOV('325CO0000000245')} target="_blank" rel="nofollow noopener noreferrer">
          地方税法施行令
        </a>
        （47条の3）、
        <a href={EGOV('329M50000002023')} target="_blank" rel="nofollow noopener noreferrer">
          地方税法施行規則
        </a>
        （9条の21。級地の率）、
        <a
          href="https://www.city.osaka.lg.jp/zaisei/page/0000384084.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          大阪市「市民税・府民税・森林環境税が課税されない方」
        </a>
        、
        <a
          href="https://www.city.osaka.lg.jp/zaisei/page/0000678587.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          大阪市「令和9年度から実施される市民税・府民税の税制改正について」
        </a>
        、
        <a
          href="https://www.nishi.or.jp/kurashi/shizei/kojinshiminzei/kisotishiki/kakaranai.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          西宮市「市・県民税がかからない人」
        </a>
        にもとづき作成。
      </ToolMeta>
    </>
  );
}
