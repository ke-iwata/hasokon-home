import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  AFTER_DAYS,
  BEFORE_DAYS_MULTIPLE,
  BEFORE_DAYS_SINGLE,
  DATA_CHECKED_AT,
  LUMP_SUM_PER_CHILD,
  LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION,
  REFORM,
} from '@/lib/shussan-teate';
import Calculator from './Calculator';

const title = '出産手当金・出産育児一時金 計算機｜産休でもらえる額を予定日と月給から自動計算';
const description =
  '産休中にもらえる出産手当金と出産育児一時金を計算。出産予定日と月給を入れるだけで、産前42日（多胎98日）・産後56日の支給期間、予定日より遅れた分の上乗せ、日額と総額、双子の一時金までわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shussan-teate/` },
  robots: robotsFor('shussan-teate'),
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

/** '2026-06-05' → '2026年6月5日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

/** '2026-09-18' → '2026年9月' */
const jaMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${y}年${m}月`;
};

const faq = [
  {
    q: '出産が予定日より遅れたら、出産手当金は減りますか？',
    a: `減りません。むしろ増えます。産前の支給期間は「出産の日以前${BEFORE_DAYS_SINGLE}日（多胎妊娠は${BEFORE_DAYS_MULTIPLE}日）」ですが、実際の出産が予定日より後になったときは出産予定日を起点に数え、遅れた日数分もそのまま支給されます。たとえば5日遅れて生まれた場合、産前は${BEFORE_DAYS_SINGLE}日＋5日の47日分になります。逆に予定日より早く生まれた場合は、出産日を起点に${BEFORE_DAYS_SINGLE}日を数え直すので日数は変わらず、支給の開始日が前にずれます。ただし産前休業は出産予定日を基準に請求するのが一般的なので、予定日の${BEFORE_DAYS_SINGLE}日前から休み始めていた場合、それより前の日は出勤日となり支給されません。その場合は早まった日数の分だけ産前が短くなります。`,
  },
  {
    q: '双子（多胎）のときはいくらもらえますか？',
    a: `産前の支給期間が${BEFORE_DAYS_SINGLE}日から${BEFORE_DAYS_MULTIPLE}日に延びるので、産後${AFTER_DAYS}日と合わせて154日分の出産手当金が出ます。出産育児一時金は胎児数分なので、双子なら${yen(LUMP_SUM_PER_CHILD)}×2人＝${yen(LUMP_SUM_PER_CHILD * 2)}です。三つ子以上も同じ考え方で人数分になります。`,
  },
  {
    q: '退職したあとでももらえますか？',
    a: '条件を満たせばもらえます。出産手当金は、退職日までに継続して1年以上の被保険者期間があり、退職日（資格喪失日の前日）に出産手当金を受けているか受けられる状態であれば、退職後も引き続き支給されます（健康保険法104条の資格喪失後の継続給付）。ただし退職日に出勤してしまうと継続給付の条件を満たさなくなるので注意してください。出産育児一時金のほうは、資格喪失日の前日までに継続して1年以上の被保険者期間があり、資格喪失後6か月以内の出産であれば受けられます。',
  },
  {
    q: '産休中に給与が出る場合はどうなりますか？',
    a: '出産手当金は「休んだ期間に給与の支払いがないこと」が条件なので、給与が支払われる日は原則として支給されません。ただし支払われる給与の日額が出産手当金の日額より少ない場合は、その差額が支給されます。この計算機では「詳しい条件」に月額を入れると差額に直して表示します（給与日額＝月額÷30は本サイトの換算で、実際の申請では事業主が証明する日額が使われます）。',
  },
  {
    q: 'いつ申請すればよいですか？',
    a: `出産手当金は産前産後の期間が終わってから、産後${AFTER_DAYS}日の経過後にまとめて申請するのが一般的です（産前分と産後分を分けて申請することもできます）。申請書には事業主の証明欄と医師・助産師の証明欄があるため、記入をお願いする時間を見込んでおくとよいでしょう。時効は支給日ごとにその翌日から2年です。出産育児一時金は、直接支払制度を使う場合は医療機関で合意文書を交わすだけで、健康保険への申請は不要です。`,
  },
  {
    q: '出産育児一時金の直接支払制度とは何ですか？',
    a: `健康保険から医療機関へ出産育児一時金（1児につき${yen(LUMP_SUM_PER_CHILD)}）を直接支払ってもらう仕組みです。窓口でまとまった出産費用を立て替えなくて済み、出産費用が一時金より少なければ差額を後から受け取れます（申請が必要）。医療機関によっては、いったん自分で支払ってから健康保険に請求する「受取代理制度」や通常の申請になる場合があります。`,
  },
  {
    q: '国民健康保険や扶養に入っている場合はもらえますか？',
    a: `出産手当金は健康保険の被保険者本人が対象です。国民健康保険（自営業・フリーランス等）には出産手当金の給付がなく、配偶者の扶養に入っている被扶養者も対象外です。任意継続被保険者も対象外です（健康保険法99条1項かっこ書き・102条1項）。一方、出産育児一時金は国民健康保険にも被扶養者にもあり、額は${yen(LUMP_SUM_PER_CHILD)}で同じです。`,
  },
];

const trail = breadcrumbFor('shussan-teate');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '出産手当金・出産育児一時金 計算機',
      url: `${SITE_URL}/shussan-teate/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shussan-teate'),
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

/** 支給期間の帯（産前 ／ 予定日超過 ／ 産後）。数値は制度データから出す */
function PeriodBar() {
  const cell = {
    padding: '10px 8px',
    textAlign: 'center' as const,
    fontSize: '0.85rem',
    border: '1px solid var(--border)',
  };
  return (
    <div style={{ display: 'flex', margin: '12px 0', overflow: 'hidden', borderRadius: 8 }}>
      <div style={{ ...cell, flex: 42, background: 'var(--surface-2)' }}>
        産前 {BEFORE_DAYS_SINGLE}日<br />
        <span style={{ color: 'var(--muted)' }}>多胎 {BEFORE_DAYS_MULTIPLE}日</span>
      </div>
      <div style={{ ...cell, flex: 12, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}>
        超過分
      </div>
      <div style={{ ...cell, flex: 56, background: 'var(--surface-2)' }}>
        産後 {AFTER_DAYS}日
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>出産手当金・出産育児一時金 計算機</h1>
      <p className="lead">
        産休中にもらえるお金の目安を計算します。出産予定日と月給を入れるだけで、産前産後の支給期間・出産手当金の日額と総額・出産育児一時金がわかります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>産休でもらえるお金は2つある</h2>
      <p>
        産休中の収入は<strong>出産手当金</strong>と<strong>出産育児一時金</strong>
        の2本立てです。どちらも健康保険（協会けんぽ・健康保険組合）からの給付で、性格が違います。
      </p>
      <ul>
        <li>
          <strong>出産手当金</strong>
          ：産休で会社を休み、給与が出ない期間の生活を支えるお金。休んだ日数に応じて日額×日数で支給される
        </li>
        <li>
          <strong>出産育児一時金</strong>：出産費用にあてるお金。1児につき
          {yen(LUMP_SUM_PER_CHILD)}の定額で、休んだかどうかとは関係なく支給される
        </li>
      </ul>
      <p>
        この2つが終わったあと、産後{AFTER_DAYS}
        日の翌日から<strong>育児休業給付金</strong>（雇用保険）に切り替わります。産休は健康保険、育休は雇用保険と、
        <strong>出どころの制度が違う</strong>のがわかりにくいところです。
      </p>

      <h2>支給期間は産前{BEFORE_DAYS_SINGLE}日・産後{AFTER_DAYS}日</h2>
      <PeriodBar />
      <p>
        出産手当金が出るのは、<strong>出産の日以前{BEFORE_DAYS_SINGLE}日</strong>（多胎妊娠は
        {BEFORE_DAYS_MULTIPLE}日）から<strong>出産の翌日以後{AFTER_DAYS}日</strong>
        までのうち、会社を休んだ日です。予定日どおりなら合計
        {BEFORE_DAYS_SINGLE + AFTER_DAYS}日、多胎なら{BEFORE_DAYS_MULTIPLE + AFTER_DAYS}日になります。
      </p>
      <p>
        ポイントは<strong>予定日より遅れて生まれたとき</strong>
        です。産前は出産予定日を起点に数えるので、遅れた日数分もそのまま支給されます。5日遅れれば5日分増えるということです。逆に早く生まれた場合は、出産日から
        {BEFORE_DAYS_SINGLE}日を数え直すため、日数は変わらず開始日が前にずれます。
      </p>
      <div className="note">
        この計算機が出すのは「産前{BEFORE_DAYS_SINGLE}日（多胎{BEFORE_DAYS_MULTIPLE}
        日）をフルに休んだ場合」の額です。出産手当金は<strong>実際に休んで給与が出なかった日</strong>
        に対して支給されるため、産前に働いた日があるとその分は支給されません。なお産後
        {AFTER_DAYS}日のうち最初の42日間は、本人が希望しても働けません（労働基準法65条2項の産後休業。
        43日目以降は医師が支障がないと認めた業務に就くことができます）。
      </div>

      <h2>日額の計算は傷病手当金と同じ</h2>
      <p>
        出産手当金の日額は、<strong>支給開始日以前12か月の各月の標準報酬月額の平均 ÷ 30日 × 2/3</strong>
        です。÷30の時点で10円未満を、×2/3の時点で1円未満をそれぞれ四捨五入します。たとえば標準報酬月額30万円なら日額は6,667円です。
      </p>
      <p>
        これは<Link href="/shobyo-teate/">傷病手当金</Link>
        とまったく同じ式です（健康保険法102条2項が、傷病手当金の額を定めた99条2項を準用しているため）。病気で休んだときの手当と産休の手当は、金額の出し方が共通だと覚えておくと見通しがよくなります。
      </p>
      <p>
        <strong>被保険者期間が12か月に満たない場合は上限があります。</strong>
        その期間の標準報酬月額の平均と、全被保険者の標準報酬月額の平均額（協会けんぽでは32万円）のうち低いほうで計算されるため、給与が高い方でも日額は約7,113円で頭打ちになります。転職・入社から1年以内の方は計算機の「詳しい条件」でチェックを入れてください。
      </p>

      <h2>出産育児一時金は1児{yen(LUMP_SUM_PER_CHILD)}</h2>
      <p>
        産科医療補償制度に加入する医療機関等で妊娠週数22週以降に出産した場合、1児につき
        {yen(LUMP_SUM_PER_CHILD)}です（2023年4月1日以降の出産）。制度に加入していない医療機関での出産や妊娠22週未満の出産は
        {yen(LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION)}になります。<strong>多胎は胎児数分</strong>
        なので、双子なら{yen(LUMP_SUM_PER_CHILD * 2)}です。
      </p>
      <p>
        対象になるのは<strong>妊娠85日（4か月）以降の出産</strong>
        で、死産・流産も含まれます。多くの医療機関では直接支払制度が使え、健康保険から医療機関へ直接支払われるため、窓口では差額だけを精算します。
      </p>

      <h2>もらえない人・注意が要る人</h2>
      <ul>
        <li>
          <strong>任意継続被保険者</strong>：出産手当金は対象外です（健康保険法99条1項かっこ書き・102条1項）
        </li>
        <li>
          <strong>国民健康保険</strong>
          ：出産手当金の給付がありません（出産育児一時金は同額で受けられます）
        </li>
        <li>
          <strong>被扶養者（配偶者の扶養に入っている方）</strong>
          ：出産手当金は本人が被保険者である場合の給付なので対象外です
        </li>
        <li>
          <strong>退職する方</strong>：継続して1年以上の被保険者期間があり、退職日に出産手当金を受けているか受けられる状態であれば、退職後も継続して支給されます（健康保険法104条）。
          <strong>退職日に出勤すると継続給付の条件を満たさなくなります</strong>
        </li>
        <li>
          <strong>健康保険組合の方</strong>
          ：組合によっては法定の給付に上乗せされる付加給付（出産手当金付加金・出産育児一時金付加金）がある場合があります。額は組合ごとに違うため、この計算機には含めていません
        </li>
      </ul>

      <h2>税金と社会保険料はどうなる？</h2>
      <p>
        出産手当金・出産育児一時金には<strong>税金がかかりません</strong>
        （健康保険法62条で保険給付に租税その他の公課を課さないと定められています）。所得税も住民税もかからず、年末調整や確定申告で収入として申告する必要もありません。
      </p>
      <p>
        また産前産後休業期間中は、健康保険・厚生年金保険の保険料が<strong>本人・会社ともに免除</strong>
        されます（健康保険法159条の3・厚生年金保険法81条の2の2）。免除された期間も将来の年金額の計算では保険料を納めたものとして扱われます。
      </p>

      <h2>産休が終わったら育児休業給付金</h2>
      <p>
        産後{AFTER_DAYS}
        日の翌日からは育児休業に入り、雇用保険から<strong>育児休業給付金</strong>
        が出ます（計算機の結果に、その開始日にあたる日付を出しています）。出産手当金は健康保険、育児休業給付金は雇用保険なので、申請先も条件も別です。産休の分が終わる前に、勤務先に育休の手続きを確認しておくとよいでしょう。
      </p>

      <h2>これから変わる予定：出産費用の自己負担無償化</h2>
      <p>
        出産費用の自己負担をなくす仕組みが<strong>{REFORM.lawName}</strong>（
        {ja(REFORM.enactedOn)}成立・{ja(REFORM.promulgatedOn)}公布
        {REFORM.lawNumber ? `・${REFORM.lawNumber}` : ''}）に盛り込まれています。ただし施行日は「
        {REFORM.effectiveRule}」とされており、
        <strong>{jaMonth(DATA_CHECKED_AT)}時点で政令は定められていません</strong>。
      </p>
      <p>
        施行後に出産育児一時金がどうなるのか（廃止されるのか、経過措置で併存するのか）や、全国一律の価格がいくらになるのかは、
        <strong>一次資料で確認できていないためこのページには書いていません</strong>
        。現時点では、上に書いた{yen(LUMP_SUM_PER_CHILD)}
        の一時金が制度として動いているものと考えてください。内容が確定したらこのページを更新します。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shussan-teate" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/shobyo-teate/">傷病手当金 計算機</Link>／
        <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>／
        <Link href="/hatarakizon/">社会保険 損得計算機</Link>
      </p>

      <ToolMeta slug="shussan-teate" ymyl>
        出典：
        <a
          href="https://www.kyoukaikenpo.or.jp/benefit/childbirth/001/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          全国健康保険協会（協会けんぽ）「出産で会社を休んだとき（出産手当金）」
        </a>
        ／
        <a
          href="https://www.kyoukaikenpo.or.jp/benefit/childbirth/002/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「子どもが生まれたとき（出産育児一時金）」
        </a>
        ／
        <a
          href="https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「病気やケガで会社を休んだとき（傷病手当金）」
        </a>
        （日額の計算式）、健康保険法62条・101条・102条・104条・106条・159条の3、健康保険法施行令36条にもとづき作成。制度データの最終確認日は
        {ja(DATA_CHECKED_AT)}です。端数処理は協会けんぽの算定方法によります。
      </ToolMeta>
    </>
  );
}
