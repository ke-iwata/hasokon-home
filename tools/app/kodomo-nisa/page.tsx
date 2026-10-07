import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  ANNUAL_CAP,
  DATA_CHECKED_AT,
  LEARN_NISA_PATH,
  LIFETIME_CAP,
  MONTHLY_CAP,
  contributionSchedule,
  formatDateJa,
  formatYen,
  formatYmJa,
  isScheduleError,
  type ScheduleResult,
} from '@/lib/kodomo-nisa';
import Calculator from './Calculator';

const title = 'こどもNISA シミュレーター（2027年1月〜）｜600万円にいつ届く？12歳・18歳も日付で';
const description =
  '2027年1月に始まる0〜17歳のつみたて投資枠（年60万円・非課税保有限度額600万円）。子の生年月日と毎月の積立額から、600万円に届く月、12歳以降に払い出せる最初の年、大人のNISAへ移る日、18歳までに積み立てる額を日付で出します。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['こどもNISA いつから', 'こどもNISA シミュレーション', 'こどもNISA 12歳 払い出し', '未成年者 つみたて投資枠'],
  alternates: { canonical: `${SITE_URL}/kodomo-nisa/` },
  robots: robotsFor('kodomo-nisa'),
};

/** 本文の例はロジックから出す（手で日付・額を書かない） */
function example(birth: { year: number; month: number; day: number }, monthly: number): ScheduleResult {
  const r = contributionSchedule({ birth, startYm: '2027-01', monthly });
  if (isScheduleError(r)) throw new Error(`例の計算に失敗: ${r}`);
  return r;
}
const EX_BABY = example({ year: 2027, month: 1, day: 1 }, MONTHLY_CAP);
const EX_TEEN = example({ year: 2012, month: 4, day: 2 }, MONTHLY_CAP);
const EX_APR1 = example({ year: 2015, month: 4, day: 1 }, MONTHLY_CAP);
const EX_APR2 = example({ year: 2015, month: 4, day: 2 }, MONTHLY_CAP);

const faq = [
  {
    q: 'こどもNISAはいつから始まりますか？',
    a: '2027年1月から始まります。令和8年度の税制改正で、NISAのつみたて投資枠が0〜17歳にも開かれました（正式名は「未成年者特定累積投資勘定」。こどもNISAは通称です）。',
  },
  {
    q: 'いくらまで積み立てられますか？',
    a: `年間${formatYen(ANNUAL_CAP)}（毎月なら${formatYen(MONTHLY_CAP)}）までで、非課税で持てるのは合計${formatYen(LIFETIME_CAP)}までです。${formatYen(LIFETIME_CAP)}は買ったときの額（取得価額）で数えます。積立は契約にもとづく定期かつ継続的な買付けに限られ、まとめて一度に入れることはできません。`,
  },
  {
    q: '12歳から引き出せるのは、何に使うときですか？',
    a: 'その年の3月31日に12歳である年から、子どもの教育費や生活費に充てるための払出しができます。親権者等が払出しの理由などを書いた書類を金融機関に出します。それより前の年に払い出せるのは、災害など税務署長の確認を受けたやむを得ない場合に限られます。',
  },
  {
    q: '18歳になるとどうなりますか？',
    a: 'その年の1月1日に18歳以上である年から、大人のNISA（つみたて投資枠・成長投資枠）の対象になり、手続きなしで移ります。払出しの制限は、その年の3月31日に18歳である年の1月1日に外れます。年齢は誕生日の前日の終わりに1つ増えるので、1月2日生まれまでは「1月1日に18歳」に入ります。1月3日〜4月1日生まれは、制限が外れる日が大人のNISAへ移る日の1年前になります。',
  },
  {
    q: '大人のNISAの1,800万円とはどういう関係ですか？',
    a: `子どものときの${formatYen(LIFETIME_CAP)}が大人の1,800万円の内に数えられるのかどうかは、政省令・金融庁のQ&Aの公表を待って更新します。このページでは大人の枠の残りは出していません。`,
  },
  {
    q: '親が子どもの口座に入れるお金に贈与税はかかりますか？',
    a: '生活費・教育費として必要な都度渡すお金は非課税ですが、積み立てに回すお金がそれに当たるかは事情によって変わります。このページでは判定していません。税務署や税理士に相談してください。',
  },
];

const trail = breadcrumbFor('kodomo-nisa');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'こどもNISA シミュレーター',
      url: `${SITE_URL}/kodomo-nisa/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kodomo-nisa'),
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

const SOURCES = [
  ['https://www.mof.go.jp/tax_policy/summary/income/nisa_2.pdf', '財務省「令和8年度税制改正の大綱の概要（NISA）」'],
  ['https://www.nta.go.jp/publication/pamph/joto-sanrin/r08aramashi.pdf', '国税庁「令和8年度 税制改正のあらまし」'],
  ['https://www.fsa.go.jp/access/r7/270/270_03.pdf', '金融庁「アクセスFSA」第270号'],
] as const;

const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>こどもNISA シミュレーター</h1>
      <p className="lead">
        2027年1月から、NISAのつみたて投資枠を0〜17歳でも使えるようになります（年{formatYen(ANNUAL_CAP)}・合計
        {formatYen(LIFETIME_CAP)}まで）。子の生年月日と毎月の積立額を入れると、<strong>{formatYen(LIFETIME_CAP)}に届く月</strong>・
        <strong>12歳以降に払い出せる最初の年</strong>・<strong>大人のNISAへ移る日</strong>を日付で出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>制度のあらまし</h2>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>項目</th>
            <th style={{ textAlign: 'left' }}>こどもNISA（0〜17歳）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>始まる時期</td>
            <td style={{ textAlign: 'left' }}>2027年1月</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>年間投資枠</td>
            <td style={{ textAlign: 'left' }}>{formatYen(ANNUAL_CAP)}（つみたて投資枠のみ）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>非課税保有限度額</td>
            <td style={{ textAlign: 'left' }}>{formatYen(LIFETIME_CAP)}（取得価額で数える）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>投資の方法</td>
            <td style={{ textAlign: 'left' }}>契約にもとづく定期かつ継続的な買付け（大人のつみたて投資枠と同じ商品）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>払出し</td>
            <td style={{ textAlign: 'left' }}>その年の3月31日に12歳である年から、子の教育費・生活費に充てるものに限りできる</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>18歳以降</td>
            <td style={{ textAlign: 'left' }}>その年の1月1日に18歳以上である年から大人のNISAへ（手続き不要）</td>
          </tr>
        </tbody>
      </table>

      <h2>月5万円なら600万円に届くのは10年後</h2>
      <p>
        年{formatYen(ANNUAL_CAP)}ずつなので、{formatYen(LIFETIME_CAP)}に届くまで最短でも10年かかります。
        2027年1月1日生まれの子に2027年1月から月{formatYen(MONTHLY_CAP)}を積み立てると、届くのは
        {EX_BABY.reachedYm && formatYmJa(EX_BABY.reachedYm)}です。
      </p>
      <p>
        一方、2027年1月の時点ですでに14歳の子（2012年4月2日生まれ）は、月{formatYen(MONTHLY_CAP)}でも
        {formatYmJa(EX_TEEN.lastYm)}までしか積み立てられず、累計は{formatYen(EX_TEEN.total)}で止まります。
        この子は{EX_TEEN.firstWithdrawalYear}年（始めた年）から払い出せ、{formatDateJa(EX_TEEN.transfer)}に大人のNISAへ移ります。
      </p>

      <h2>4月1日生まれと4月2日生まれで1年ずれる</h2>
      <p>
        払い出せる年は「その年の3月31日に12歳であるか」で決まります。2015年4月1日生まれなら{EX_APR1.firstWithdrawalYear}年から、
        2015年4月2日生まれなら{EX_APR2.firstWithdrawalYear}年からです。法律上、年齢は誕生日の前日の終わりに1つ増えるので、
        4月1日生まれは3月31日の時点で12歳になっています。
        小学校の学年の区切りと同じで、中学校に上がる年から払い出せると考えると覚えやすくなります。
      </p>

      <h2>このツールで出さないもの</h2>
      <p>
        値上がり・値下がりを含めた将来の評価額や、課税口座と比べた税の差は出していません。利回りしだいで変わる数字で、
        ここでは制度から一意に決まる日付と積立額だけを出しています。商品や金融機関の比較・おすすめもしていません。
        また、途中で払い出さない前提で計算しています（払い出した分の枠が戻るかどうかは政省令の公表待ちです）。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kodomo-nisa" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        NISAの仕組みを読む：<a href={LEARN_NISA_PATH}>学ぶ「投資の教科書」NISA</a>
      </p>
      <PublicToolLink slug="ideco">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          親の老後資金の積み立て：<ToolLink slug="ideco">iDeCo 拠出限度額・節税額 計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="koko-jugyoryo">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          12歳以降の払い出しの使い道の目安に：<ToolLink slug="koko-jugyoryo">高校授業料 実質負担 計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="kodomo-nisa" ymyl>
        出典：
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '／'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        。根拠法は所得税法等の一部を改正する法律（令和8年3月31日公布）による租税特別措置法37条の14です。
        子の{formatYen(LIFETIME_CAP)}と大人の1,800万円の関係、払い出した分の枠が戻るかは政省令待ちで、確定したら更新します。
        このページは制度の説明と日付・積立額の計算までで、投資の助言や商品の推奨は行いません。
        一次情報の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
