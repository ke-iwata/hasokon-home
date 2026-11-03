import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  ANNUAL_RANGE,
  formatJaDate,
  GRANT_TABLE,
  LAW_REFORM,
  MAX_BALANCE,
  reformAnswer,
  TENURE_SHORT,
  type WeeklyDays,
} from '@/lib/yukyu-fuyo';
import Calculator from './Calculator';

const title = '有給休暇の付与日数 計算｜次はいつ何日・パートの比例付与・時効と年5日の期限';
const description =
  '入社日と週の勤務日数から、有給休暇の次の付与日と日数を計算。パート・アルバイトの比例付与、繰越を足した残り（最大40日）、2年の時効で消える日、年5日の取得義務の期限まで出します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/yukyu-fuyo/` },
  robots: robotsFor('yukyu-fuyo'),
};

const ROWS: WeeklyDays[] = [5, 4, 3, 2, 1];

function rangeLabel(w: WeeklyDays): string {
  const r = ANNUAL_RANGE[w];
  return r.max === null ? `${r.min}日以上` : `${r.min}〜${r.max}日`;
}

const faq = [
  {
    q: 'パート・アルバイトにも有給はありますか？',
    a: `あります。雇入れから6か月継続して勤務し、全労働日の8割以上出勤すれば、パート・アルバイトにも年次有給休暇が付与されます（労働基準法39条1項）。週の所定労働時間が30時間未満で週4日以下（週で決まっていなければ年216日以下）の人は、働く日数に比例した日数になり、週1日（年48日以上）でも6か月で${GRANT_TABLE[1][0]}日付与されます（同3項・施行規則24条の3）。`,
  },
  {
    q: '有給は何年で消えますか？',
    a: `付与された日から2年で時効により消えます（労働基準法115条）。その年に使い切れなかった分は翌年に1回だけ繰り越せるので、勤続6年6か月以上の人でも、手元にある有給は最大で20日＋20日＝${MAX_BALANCE}日です。例えば2026年10月1日に付与された分は、2028年9月30日まで使えます。`,
  },
  {
    q: '年5日の取得義務は誰が対象ですか？',
    a: `年10日以上の有給が付与される人です（労働基準法39条7項）。会社は付与日（基準日）から1年以内に5日を取らせなければならず、違反には30万円以下の罰金があります（同120条）。パートでも勤続が延びて10日以上になれば対象で、週4日の人は3年6か月（${GRANT_TABLE[4][3]}日）、週3日の人は5年6か月（${GRANT_TABLE[3][5]}日）の付与から対象に入ります。週2日・週1日の人は10日に届かないので対象になりません。前年からの繰越分から取った日も5日に数えますが、時間単位で取った分は数えません。`,
  },
  {
    q: '会社は有給の日を変えられますか？',
    a: '有給は労働者が請求する時季に与えるのが原則です。請求された日に休まれると事業の正常な運営を妨げる場合に限って、会社は別の日に変えることができます（労働基準法39条5項ただし書き。時季変更権）。「忙しいから」というだけで取らせない、取得を理由に不利益に扱う、ということは認められていません。',
  },
  {
    q: '法改正で変わりますか？',
    a: reformAnswer(),
  },
];

const trail = breadcrumbFor('yukyu-fuyo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '有給休暇 付与日数 計算機',
      url: `${SITE_URL}/yukyu-fuyo/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('yukyu-fuyo'),
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

/** 比例付与の表の 1 列目は横スクロールしても見えるよう固定する */
const stickyHead = {
  position: 'sticky' as const,
  left: 0,
  zIndex: 1,
  whiteSpace: 'nowrap' as const,
};
const narrow = { padding: '6px 6px', whiteSpace: 'nowrap' as const };

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>有給休暇 付与日数 計算機（次はいつ何日・いつ消える）</h1>
      <p className="lead">
        入社日と週の働き方を入れると、次に有給休暇が付与される日と日数を出します。パート・アルバイトの比例付与、前回分の繰越を足したいまの残り（最大
        {MAX_BALANCE}
        日）、2年の時効で消える日、年5日の取得義務の期限と、あと何日取ればよいかまで1画面でわかります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>有給休暇の付与日数の表</h2>
      <p>
        雇入れから6か月継続して勤務し、全労働日の8割以上出勤すると10日付与され、以後1年ごとに日数が増えます（労働基準法39条1項・2項）。週の所定労働時間が30時間未満で、週4日以下（週で決まっていなければ年216日以下）の人は、下の表の比例付与の日数になります（同3項・施行規則24条の3）。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 520 }}>
          <caption className="hint" style={{ captionSide: 'top', textAlign: 'left' }}>
            継続勤務年数ごとの付与日数（日）
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...narrow, ...stickyHead }}>
                週の日数
              </th>
              {TENURE_SHORT.map((t) => (
                <th key={t} scope="col" style={narrow}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((w) => (
              <tr key={w}>
                <th scope="row" style={{ ...narrow, ...stickyHead }}>
                  {w === 5 ? '5日以上' : `${w}日`}
                  <br />
                  <span className="hint">{rangeLabel(w)}</span>
                </th>
                {GRANT_TABLE[w].map((d, i) => {
                  // 年 5 日の取得義務が始まる境目（比例付与で初めて 10 日以上になる列）を太字に
                  const boundary = w !== 5 && d >= 10 && (i === 0 || GRANT_TABLE[w][i - 1] < 10);
                  return (
                    <td key={TENURE_SHORT[i]} style={narrow}>
                      {boundary ? <strong>{d}</strong> : d}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        太字は年5日の取得義務が始まる境目（10日以上になる最初の付与）です。1列目の下の数は、週で決まっていない人の年の所定労働日数です。週4日以下でも週30時間以上働く人は「5日以上」の行です。
      </p>

      <h2>付与日・時効・年5日の期限の数え方</h2>
      <p>
        入社日を1日目として数え、6か月の継続勤務を満たした日に最初の付与があります（4月1日入社なら10月1日）。2回目以降は、その1年後の同じ日です。入社日の応当日が無い月（8月31日入社の6か月後の2月など）は、その月の末日で6か月が満了するので（民法143条2項ただし書き）、
        <strong>付与は翌月1日</strong>
        （2027年3月1日）としています。
      </p>
      <p>
        付与された有給は、付与日から2年の期間の最後の日まで使えます（2026年10月1日付与なら2028年9月30日まで）。年5日の取得義務の期限は付与日から1年の期間の最後の日です（同じ例で2027年9月30日まで）。残りは、取った日を古いほう（前回分）から先に引いて出しています。どちらから引くかは法令に定めがなく、就業規則によります。
      </p>

      <h2>このツールでわからないこと</h2>
      <ul>
        <li>出勤率8割の判定（業務上のけが・育児休業・産前産後休業は出勤したものとして扱うなど、例外が多いため）</li>
        <li>会社独自の上乗せ（法定より多い日数）や、入社日にまとめて前倒しで付与する会社の付与日と年5日の期限</li>
        <li>全社一律の基準日（斉一的取扱い）で付与している会社の付与日</li>
        <li>有給を取った日の賃金の額（通常の賃金・平均賃金・標準報酬日額）</li>
      </ul>
      <p>
        有給を使って何連休できるかは
        <Link href="/renkyu-keisan/">連休計算機</Link>、残業代は
        <Link href="/zangyodai-keisan/">残業代計算機</Link>
        、時給が最低賃金を下回っていないかは
        <Link href="/saitei-chingin/">最低賃金チェッカー</Link>、月の手取りは
        <Link href="/tedori-keisan/">手取り計算機</Link>
        で確かめられます。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="note">
        表示は労働基準法の<strong>最低基準</strong>
        です。会社の就業規則でこれより多く付与されている場合や、個別のご事情の判断は、会社または労働基準監督署にご確認ください。有給を取らせてもらえないなどの相談は、
        <a
          href="https://www.mhlw.go.jp/general/seido/chihou/kaiketu/soudan.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          総合労働相談コーナー
        </a>
        で受け付けています。
      </div>

      <AdUnit position="below-faq" />

      <RelatedTools current="yukyu-fuyo" />

      <ToolMeta slug="yukyu-fuyo" ymyl="legal">
        付与の要件・日数・時季変更・年5日の取得義務・時効・罰則は
        <a href="https://laws.e-gov.go.jp/law/322AC0000000049" target="_blank" rel="nofollow noopener noreferrer">
          労働基準法39条・115条・120条
        </a>
        、比例付与は
        <a href="https://laws.e-gov.go.jp/law/322M40000100023" target="_blank" rel="nofollow noopener noreferrer">
          労働基準法施行規則24条の3
        </a>
        と
        <a
          href="https://www.mhlw.go.jp/www2/kisya/kijun/20001130_01_k/20001130_01_k_bessi.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「1週間の所定労働時間が30時間未満の者に対する年次有給休暇の付与日数」
        </a>
        、年5日の数え方（繰越分から取った日も数える・時間単位の分は数えない）は
        <a href="https://www.mhlw.go.jp/hatarakikata/salaried.html" target="_blank" rel="nofollow noopener noreferrer">
          厚生労働省「年5日の年次有給休暇の確実な取得 わかりやすい解説」
        </a>
        にもとづいています。法改正の動きは
        <a
          href="https://www.mhlw.go.jp/stf/shingi/shingi-rousei_126969.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          労働政策審議会（労働条件分科会）
        </a>
        の資料と
        <a
          href="https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/menu.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          衆議院「議案」
        </a>
        で{formatJaDate(LAW_REFORM.checkedAt)}に確認しました。
      </ToolMeta>
    </>
  );
}
