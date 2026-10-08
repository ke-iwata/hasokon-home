import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { DATA_CHECKED_AT, OTHER_RULES, RULES, earliestReturn, formatMd, parseDate } from '@/lib/shusseki-teishi';
import Calculator from './Calculator';

const title = '出席停止期間 計算｜インフルエンザ・コロナはいつから登校できる？（学校保健安全法）';
const description =
  '発症日と解熱日を入れると、インフルエンザ・新型コロナ・はしか・おたふくかぜ・プール熱で学校（保育園・幼稚園）に行ける最も早い日を計算。学校保健安全法施行規則19条の『発症後5日・解熱後2日（幼児3日）』を0日目からのカレンダーで表示します。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['インフルエンザ 出席停止 計算', 'インフルエンザ 登校 いつから', 'コロナ 登園 いつから', '出席停止 数え方'],
  alternates: { canonical: `${SITE_URL}/shusseki-teishi/` },
  robots: robotsFor('shusseki-teishi'),
};

// 本文の例はロジックから出す（手で日付を書かない）
const EX_ONSET = parseDate('2026-12-02')!;
const EX_TODAY = parseDate('2026-12-31')!;
const exFor = (group: 'school' | 'preschool', recovery: string) => {
  const r = earliestReturn({ disease: 'influenza', group, onset: EX_ONSET, recovery: parseDate(recovery)!, today: EX_TODAY });
  if (typeof r === 'string') throw new Error(r);
  return formatMd(r.earliest);
};
const EX_LATE_RECOVERY = '2026-12-06';
const EX_EARLY = exFor('school', '2026-12-03');
const EX_LATE = exFor('school', EX_LATE_RECOVERY);
const EX_LATE_PRESCHOOL = exFor('preschool', EX_LATE_RECOVERY);

const faq = [
  {
    q: '夜に熱が出た日は発症日ですか？',
    a: 'インフルエンザの「発症」は、一般的には発熱のことで、熱が出始めた日が発症日（0日目）です。夜に熱が出たときもその日が0日目になります（受診した日ではありません）。熱が無いのにインフルエンザと診断されたときは、何らかの症状が出た日を発症日と考えます（こども家庭庁「保育所における感染症対策ガイドライン」）。迷ったら医師・学校に確かめてください。',
  },
  {
    q: '解熱剤で熱が下がった日は解熱日ですか？',
    a: '新型コロナの「症状が軽快」は、ガイドラインで「解熱剤を使用せずに解熱し、かつ、呼吸器症状が改善傾向にある状態」とされています。解熱剤で一時的に下がっただけの日を解熱日にしてよいかは、医師・学校に確かめてください。',
  },
  {
    q: '大人はいつから出勤できますか？',
    a: 'インフルエンザ・新型コロナとも、大人の出勤停止に法令の基準はありません。このページでは学校と同じ数え方を「目安」として出しています。勤務先の就業規則・指示に従ってください。',
  },
  {
    q: '無症状の新型コロナはどう数えますか？',
    a: '症状が無い場合は、検体を採取した日（検査をした日）を0日目として、5日を経過するまでがめやすです（こども家庭庁「保育所における感染症対策ガイドライン」）。このページの計算機では、発症した日と軽快した日に同じ検体採取日を入れると、同じ日が出ます。',
  },
];

const trail = breadcrumbFor('shusseki-teishi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '出席停止期間 計算機（インフルエンザ・新型コロナほか）',
      url: `${SITE_URL}/shusseki-teishi/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shusseki-teishi'),
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

/** '2026-10-08' → '2026年10月8日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const SOURCES = [
  ['https://laws.e-gov.go.jp/law/333M50000080018', '学校保健安全法施行規則（e-Gov 法令検索）18条・19条'],
  [
    'https://www.mhlw.go.jp/content/10900000/20231010_policies_hoiku_25.pdf',
    'こども家庭庁「保育所における感染症対策ガイドライン（2018年改訂版）」2023年10月一部修正（出席停止期間の算定・症状軽快の定義）',
  ],
] as const;

const left = { textAlign: 'left' as const };
const DATED = ['influenza', 'covid19', 'measles', 'mumps', 'pcf'] as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>出席停止期間 計算機（インフルエンザ・新型コロナほか）</h1>
      <p className="lead">
        インフルエンザは「発症した後5日を経過し、かつ、解熱した後2日（幼児は3日）を経過するまで」が出席停止です（学校保健安全法施行規則19条）。
        発症日と解熱日を入れると、学校・保育園に行ける最も早い日を、0日目から数えたカレンダーで出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>出席停止の期間の基準（施行規則19条2号）</h2>
      <table>
        <thead>
          <tr>
            <th style={left}>病気</th>
            <th style={left}>基準（原文）</th>
          </tr>
        </thead>
        <tbody>
          {DATED.map((k) => (
            <tr key={k}>
              <td style={left}>
                {RULES[k].name}
                <br />
                <span className="hint">{RULES[k].article}</span>
              </td>
              <td style={left}>{RULES[k].text}</td>
            </tr>
          ))}
          {OTHER_RULES.map((o) => (
            <tr key={o.name}>
              <td style={left}>
                {o.name}
                <br />
                <span className="hint">{o.article}</span>
              </td>
              <td style={left}>{o.text}（日付にできないので、計算機では説明だけ出します）</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        どの病気も、医師が感染のおそれがないと認めたときはこの限りではありません（19条2号ただし書き）。
        結核・髄膜炎菌性髄膜炎と第三種の感染症（流行性角結膜炎など）は「医師が感染のおそれがないと認めるまで」で、日付にはできません。
      </p>

      <h2>「0日目」の数え方</h2>
      <p>
        「◯日を経過するまで」は、発症した日・解熱した日を期間に数えず（0日目）、その翌日を1日目と数えます。
        「解熱した後2日を経過するまで」なら、解熱した日の翌日（1日目）と翌々日（2日目）を休み、その次の日から出席できます。
      </p>
      <p>
        インフルエンザは<strong>2つの条件の両方</strong>を満たす必要があります。たとえば{formatMd(EX_ONSET)}に発症した小学生は、
        すぐ解熱しても発症の側の条件で<strong>{EX_EARLY}</strong>から登校できます。
        解熱が{formatMd(parseDate(EX_LATE_RECOVERY)!)}までずれ込むと、解熱の側の条件のほうが遅くなり<strong>{EX_LATE}</strong>から。
        同じ日付でも保育園・幼稚園の子（幼児）は解熱後3日なので<strong>{EX_LATE_PRESCHOOL}</strong>からです。
      </p>
      <p>
        幼児が1日長いのは、条文が「幼児にあつては、三日」と決めているためです。新型コロナは「症状が軽快した後1日」で、幼児の区別はありません。
      </p>

      <h2>保育所・大人の場合</h2>
      <p>
        保育所は学校保健安全法の対象ではありませんが、こども家庭庁「保育所における感染症対策ガイドライン」が同じ基準を登園のめやすとしています。
        保育所は土曜も開いていることが多いので、このページでは幼児の登園日を土日祝でずらしません。園の開所日に従ってください。
      </p>
      <p>
        大人（職場）の出勤停止には、インフルエンザ・新型コロナとも法令の基準がありません。このページは学校と同じ数え方を目安として出すだけです。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shusseki-teishi" />

      <PublicToolLink slug="nissu-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ほかの日付を数える：<ToolLink slug="nissu-keisan">日数計算・期日計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="nenrei-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          満年齢を数える：<ToolLink slug="nenrei-keisan">年齢計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="shussan-yoteibi">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          子育ての日付：<ToolLink slug="shussan-yoteibi">出産予定日 計算</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="shusseki-teishi" ymyl="legal">
        出典：
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '／'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        。このページは条文の期間を日付に直すところまでで、症状の見立て・受診の要否・薬の使い方は扱いません。
        治癒証明書・経過報告書などの書類は、学校・自治体の様式に従ってください。
        一次情報の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
