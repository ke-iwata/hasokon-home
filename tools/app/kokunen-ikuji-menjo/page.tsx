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
  FUKA_PREMIUM,
  formatMonthJa,
  IKUJI_MONTHS_MOTHER,
  IKUJI_MONTHS_OTHERS,
  MONTHLY_PREMIUM,
  SANZEN_MONTHS_MULTIPLE,
  SANZEN_MONTHS_SINGLE,
} from '@/lib/kokunen-ikuji-menjo';
import Calculator from './Calculator';
import { EXEMPT_TABLE_AFTER, EXEMPT_TABLE_BEFORE } from './tables';

const title =
  '国民年金 産前産後・育児期間の保険料免除 計算機（2026年10月〜）｜フリーランス・自営業の親はいつからいつまで免除か';
const description =
  '2026年10月に始まる国民年金の育児免除と産前産後免除を計算。子の生年月日（出産予定日）と実母・実父を選ぶだけで、自営業・フリーランスの親の保険料が免除される月と免除額（最大13か月・夫婦で約45万円）がわかります。所得制限なし・年金額は減りません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/kokunen-ikuji-menjo/` },
  robots: robotsFor('kokunen-ikuji-menjo'),
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

/** '2026-09-27' → '2026年9月27日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const PREMIUM_2026 = MONTHLY_PREMIUM['2026'];
const PREMIUM_2025 = MONTHLY_PREMIUM['2025'];
const MOTHER_MONTHS = SANZEN_MONTHS_SINGLE + IKUJI_MONTHS_MOTHER;

const faq = [
  {
    q: '所得が高くても免除されますか？',
    a: 'はい。産前産後免除も育児免除も所得の要件はありません。一般の申請免除（全額免除・一部免除）や納付猶予は前年の所得で決まりますが、この2つは子の出産・養育という事実だけで決まります。',
  },
  {
    q: '会社員の配偶者（第3号被保険者）は対象ですか？',
    a: '対象ではありませんが、もともと第3号被保険者には国民年金保険料の負担がありません。会社員・公務員（第2号被保険者）本人は、勤務先を通じて産休・育休中の厚生年金・健康保険の保険料が免除される別の仕組みがあります。任意加入被保険者も育児免除の対象ではありません。',
  },
  {
    q: 'もう保険料を納めてしまった月や、申請免除・学生納付特例の月はどうなりますか？',
    a: '届け出れば育児免除の期間として扱われます。すでに納めた保険料は、ほかの月の保険料に充当されるか還付されます。申請免除・納付猶予・学生納付特例が承認されている月も、届け出ると育児免除（年金額が減らない扱い）に切り替わります。',
  },
  {
    q: '免除中に付加保険料は払えますか？',
    a: `払えます。産前産後免除・育児免除の期間中も、付加保険料（月${yen(FUKA_PREMIUM)}）は納められます。付加保険料を納めた月数に応じて付加年金が上乗せされます。`,
  },
  {
    q: '国民年金基金に入っている場合はどうなりますか？',
    a: '国民年金基金は国民年金とは別の制度で、免除期間中の加入員資格や掛金の扱いは基金の規約によります。このページでは計算していません。加入している国民年金基金に確認してください。',
  },
  {
    q: '2026年10月より前に生まれた子は対象ですか？',
    a: `2026年10月1日の時点で1歳未満の子なら、2026年10月分から対象になります。ただし免除の終わりは延びません。実父・養父母は「1歳の誕生日の前月まで」、実母は「産前産後免除の翌月から${IKUJI_MONTHS_MOTHER}か月目まで」のうち、2026年10月以降の月だけが免除になります。たとえば2026年5月生まれの子の実母は、2026年10月〜2027年4月の7か月です。`,
  },
  {
    q: '養子の場合はいつからですか？',
    a: `養父母は、養子縁組などで子を養育することとなった月から、子が1歳になる誕生日の前月までです（最大${IKUJI_MONTHS_OTHERS}か月）。1歳を過ぎてから縁組した場合は対象になりません。`,
  },
  {
    q: '出産予定日で届け出たあと、実際の出産日がずれたら？',
    a: '産前産後免除は「出産予定日または出産日」の属する月で期間が決まります。予定日で届け出たあとに出産の月が前後すると、免除の月が1か月前後することがあります。届け直しが必要かどうかは年金事務所または市区町村の国民年金窓口に確認してください。',
  },
];

const trail = breadcrumbFor('kokunen-ikuji-menjo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '国民年金 産前産後・育児期間の保険料免除 計算機',
      url: `${SITE_URL}/kokunen-ikuji-menjo/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kokunen-ikuji-menjo'),
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

      <h1>国民年金 産前産後・育児期間の保険料免除 計算機</h1>
      <p className="lead">
        2026年10月から、自営業・フリーランスなど国民年金の第1号被保険者の親は、子が1歳になるまでの保険料が
        <strong>所得に関係なく</strong>
        免除されます。子の生年月日（生まれる前なら出産予定日）を入れると、免除される月と額がわかります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>2026年10月から始まる「育児免除」</h2>
      <p>
        子ども・子育て支援法等の一部を改正する法律（令和6年法律第47号）による国民年金法の改正で、
        <strong>2026年（令和8年）10月1日</strong>
        から、国民年金第1号被保険者の実父母・養父母が、子が1歳になるまでの期間の保険料を届出により免除されるようになりました。
        要件は「子と親子関係が続いていること」「子と同じ住所に住んでいること」だけで、<strong>所得の要件はありません</strong>。
      </p>
      <ul>
        <li>
          <strong>実父・養父母</strong>：子を養育することとなった月（実父は生まれた月）から、1歳の誕生日の前月まで。最大
          {IKUJI_MONTHS_OTHERS}か月
        </li>
        <li>
          <strong>出産した本人（実母）</strong>：産前産後免除の期間に引き続く{IKUJI_MONTHS_MOTHER}
          か月。産前産後免除と合わせて最大{MOTHER_MONTHS}か月（多胎は
          {SANZEN_MONTHS_MULTIPLE + IKUJI_MONTHS_MOTHER}か月）
        </li>
      </ul>
      <p>
        令和8年度の国民年金保険料は月{yen(PREMIUM_2026)}（令和7年度は{yen(PREMIUM_2025)}）なので、実母
        {MOTHER_MONTHS}か月で{yen(PREMIUM_2026 * MOTHER_MONTHS)}、実父{IKUJI_MONTHS_OTHERS}か月で
        {yen(PREMIUM_2026 * IKUJI_MONTHS_OTHERS)}、
        <strong>夫婦とも第1号なら合計{yen(PREMIUM_2026 * (MOTHER_MONTHS + IKUJI_MONTHS_OTHERS))}</strong>
        の負担がなくなります（令和9年度以降の月は令和8年度の額で概算）。
      </p>

      <h2>出産した本人は、先に「産前産後免除」がある</h2>
      <p>
        出産した本人には、2019年4月から<strong>産前産後免除</strong>
        があります。出産予定日（または出産日）の属する月の<strong>前月から{SANZEN_MONTHS_SINGLE}か月</strong>
        、多胎妊娠なら<strong>3か月前から{SANZEN_MONTHS_MULTIPLE}か月</strong>
        の保険料が免除されます（国民年金法88条の2）。妊娠85日以上の出産が対象で、死産・流産・早産も含みます。出産予定日の6か月前から届け出られます。
      </p>
      <p>
        育児免除は、この産前産後免除が終わった翌月から続けて始まります。つまり実母は
        「産前産後{SANZEN_MONTHS_SINGLE}か月 → 育児{IKUJI_MONTHS_MOTHER}
        か月」と切れ目なく免除が続き、子が1歳になる誕生日の前月で終わります。
      </p>

      <h2>免除でも年金額は減らない</h2>
      <p>
        一般の申請免除や納付猶予は、免除された期間の分だけ将来の老齢基礎年金が減り（納付猶予は年金額に反映されない）、満額にするには後から追納が要ります。
        <strong>産前産後免除と育児免除は違います。</strong>
        免除された期間も保険料を納めた期間として扱われ、<strong>年金額は減りません</strong>
        。「免除＝年金が減る」と思って届け出ない人がいますが、この2つは届け出たほうが得です。
      </p>

      <h2>2026年10月より前に生まれた子の数え方</h2>
      <p>
        施行日の時点で1歳未満の子は、<strong>2026年10月分から</strong>
        対象になります。ただし繰り下がるのは始まりだけで、終わりは延びません。実母なら「産前産後免除の翌月から
        {IKUJI_MONTHS_MOTHER}
        か月目まで」を先に数え、そのうち2026年10月以降の月だけが免除になります。下の表は生まれ月ごとの免除月数と額です（産前産後免除を含む。15日生まれとして計算）。
      </p>
      <table>
        <thead>
          <tr>
            <th>生まれ月</th>
            <th>実母</th>
            <th>うち育児免除</th>
            <th>実父</th>
          </tr>
        </thead>
        <tbody>
          {EXEMPT_TABLE_BEFORE.map((row) => (
            <tr key={row.month}>
              <td style={{ textAlign: 'left' }}>{formatMonthJa(row.month)}</td>
              <td>
                {row.mother.months}か月
                <br />
                {yen(row.mother.amount)}
              </td>
              <td>{row.motherIkujiMonths}か月</td>
              <td>
                {row.father.months}か月
                <br />
                {yen(row.father.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        実母の月数には、2026年9月以前の産前産後免除の月も含めています（産前産後免除は2019年4月からの制度なので、施行日の影響を受けません）。
      </p>

      <h2>生まれ月別の免除額の早見表（2026年10月〜2027年9月生まれ）</h2>
      <table>
        <thead>
          <tr>
            <th>生まれ月</th>
            <th>実母</th>
            <th>実父</th>
          </tr>
        </thead>
        <tbody>
          {EXEMPT_TABLE_AFTER.map((row) => (
            <tr key={row.month}>
              <td style={{ textAlign: 'left' }}>{formatMonthJa(row.month)}</td>
              <td>
                {row.mother.months}か月・{yen(row.mother.amount)}
              </td>
              <td>
                {row.father.months}か月・{yen(row.father.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        令和9年度（2027年4月）以降の月は、保険料が未公表のため令和8年度の月額{yen(PREMIUM_2026)}
        で概算しています。国民年金保険料は毎年4月に改定されます。
      </p>

      <h2>届出のしかた</h2>
      <ul>
        <li>
          <strong>産前産後免除を届け出ている実母</strong>
          ：産前産後免除の期間が2026年9月以降に終わり、マイナンバーで親子関係と同一世帯であることを日本年金機構が確認できる場合は、育児免除の届出は不要です。「国民年金保険料育児免除該当通知書」が届きます（確認できなかったときは「産前産後免除終了のお知らせ」が届くので、そこから届け出ます）
        </li>
        <li>
          <strong>それ以外の人（実父・養父母、産前産後免除を届け出ていない実母）</strong>
          ：住民登録をしている市区町村の国民年金担当窓口に届書を出す（郵送可）か、マイナポータルから電子申請します。2026年10月より前から子を育てている場合は、2026年10月1日以降に届け出ます
        </li>
      </ul>
      <p>
        最終的な該当と期間は、年金事務所または市区町村の国民年金窓口で確認してください。
      </p>

      <h2>会社員・公務員の場合</h2>
      <p>
        厚生年金に加入している会社員・公務員（第2号被保険者）はこの免除の対象ではありません。代わりに、産休・育休の期間は勤務先を通じて厚生年金・健康保険の保険料が本人・会社ともに免除されます。育休中の収入は
        <Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>、産休中の収入は
        <Link href="/shussan-teate/">出産手当金 計算機</Link>で出せます。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kokunen-ikuji-menjo" />

      <ToolMeta slug="kokunen-ikuji-menjo" ymyl>
        出典：
        <a
          href="https://www.nenkin.go.jp/tokusetsu/ikujimenjo.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「令和8年（2026年）10月から国民年金保険料の育児免除制度が始まります!」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/kokunen/menjo/ikujimenjo.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「国民年金保険料の育児免除制度」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/kokunen/menjo/20180810.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「国民年金保険料の産前産後期間の免除制度」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/kokunen/hokenryo/hokenryo.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「国民年金保険料」
        </a>
        、国民年金法88条の2にもとづき作成。制度データの最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
