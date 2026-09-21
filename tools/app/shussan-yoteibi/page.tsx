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
  LMP_TO_DUE_DAYS,
  MAX_GESTATION_DAYS,
  OVULATION_TO_DUE_DAYS,
  TERM_START_DAY,
} from '@/lib/shussan-yoteibi';
import { AFTER_DAYS, BEFORE_DAYS_MULTIPLE, BEFORE_DAYS_SINGLE } from '@/lib/shussan-teate';
import Calculator from './Calculator';

const title = '出産予定日・妊娠週数 計算機｜産休はいつから・出産手当金までわかる';
const description =
  '最終月経開始日から出産予定日と「今日は妊娠何週何日」を計算。産前休業を請求できる日（出産予定日の6週間前・多胎は14週間前）と産後休業が明ける日、育児休業に入れる日まで日付で出し、そのまま出産手当金の計算に引き継げます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shussan-yoteibi/` },
  robots: robotsFor('shussan-yoteibi'),
};

/** '2026-09-19' → '2026年9月19日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const faq = [
  {
    q: '出産予定日はどうやって計算するのですか？',
    a: `最終月経（生理）が始まった日を妊娠0週0日として、${LMP_TO_DUE_DAYS}日目（40週0日）が出産予定日です。日本産科婦人科学会の用語集による数え方で、月から3を引き（または9を足し）日に7を足す「ネーゲレ概算法」と同じ日になります。排卵日・受精日が分かっている場合は、その日が2週0日にあたるので${OVULATION_TO_DUE_DAYS}日目が予定日です。超音波検査をもとに医師が予定日を修正している場合は、その予定日が優先されます。`,
  },
  {
    q: '妊娠週数の「◯週◯日」はどう数えるのですか？',
    a: `最終月経開始日が0週0日で、そこから満で数えます。たとえば経過${TERM_START_DAY}日目が37週0日（7 × 37 = ${TERM_START_DAY}）、${TERM_START_DAY + 1}日目が37週1日です。「妊娠◯か月」のほうは4週を1か月として数えるので、0週0日から27日目までが「妊娠1か月」、28日目から「妊娠2か月」になります。週数は満、月数は数えと、数え方が違うのがまぎらわしいところです。`,
  },
  {
    q: '産休（産前休業）はいつから取れますか？',
    a: `産前休業は出産予定日の6週間前（多胎妊娠は14週間前）から請求できます（労働基準法65条1項）。予定日を含めて数えるので、単胎なら予定日の${BEFORE_DAYS_SINGLE - 1}日前、多胎なら${BEFORE_DAYS_MULTIPLE - 1}日前が最初の日です。これは「請求すれば取得できる」もので、自動的に休みになるわけではありません。勤務先への申し出が必要です。産後休業（同条2項）のほうは出産日の翌日から8週間で、こちらは本人が希望しても働けない期間が含まれます。`,
  },
  {
    q: '産後はいつから働けますか？',
    a: `産後休業は出産日の翌日から${AFTER_DAYS}日（8週間）です。このうち最初の6週間（42日）は本人が請求しても就業させられません（労働基準法65条2項本文）。6週間が満了するのは出産日から42日後なので、就業できるのはその翌日＝出産日の43日後からで、しかも本人が請求し医師が支障ないと認めた業務に限られます（同項ただし書き）。この計算機では、予定日どおりに生まれた場合のその日付を出しています。`,
  },
  {
    q: '予定日に生まれることは多いのですか？',
    a: '予定日はあくまで目安で、予定日当日に生まれる割合は数%です。37週0日から41週6日までが「正期産」で、この期間の出産はいずれも正常な時期の出産とされています。予定日を過ぎても正期産の範囲に入っていることは珍しくありません。実際の出産日が前後すると、産後休業が明ける日や育児休業に入れる日も同じ日数だけ動きます（産前休業を請求できる日は予定日を基準に決まるので動きません）。',
  },
  {
    q: '妊娠週数が計算できないと表示されます',
    a: `この計算機は、最終月経開始日から42週0日（${MAX_GESTATION_DAYS}日）までを妊娠週数として扱います。入力した日付から数えた日数がこの範囲の外にあるとき（今日より先の日付、あるいは${MAX_GESTATION_DAYS}日より前の日付）は週数を出しません。日付をご確認ください。`,
  },
  {
    q: '産休中にもらえるお金も計算できますか？',
    a: '出産予定日が出たら、結果の下のボタンから出産手当金・出産育児一時金 計算機に予定日と人数を引き継げます。産休中は健康保険から出産手当金（標準報酬日額の3分の2）と出産育児一時金（1児50万円）が、産後休業が明けてからは雇用保険から育児休業給付金が出ます。制度も申請先も別なので、それぞれの計算機で確認してください。',
  },
];

const trail = breadcrumbFor('shussan-yoteibi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '出産予定日・妊娠週数 計算機',
      url: `${SITE_URL}/shussan-yoteibi/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shussan-yoteibi'),
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

      <h1>出産予定日・妊娠週数 計算機</h1>
      <p className="lead">
        最終月経が始まった日を入れると、出産予定日と「今日は妊娠何週何日」が出ます。産前休業を請求できる日・産後休業が明ける日・育児休業に入れる日まで日付でわかり、そのまま出産手当金の計算に進めます。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>数え方：最終月経開始日が「0週0日」</h2>
      <p>
        妊娠週数は<strong>最終月経が始まった日を0週0日</strong>として数え、
        <strong>{LMP_TO_DUE_DAYS}日目（40週0日）が出産予定日</strong>です（日本産科婦人科学会の用語集による定義）。
        月から3を引いて日に7を足す「ネーゲレ概算法」で出る日と同じになります。
      </p>
      <p>
        排卵日・受精日が分かっている場合は、その日が<strong>2週0日</strong>にあたるので、
        そこから{OVULATION_TO_DUE_DAYS}日目が予定日です。排卵日は月経周期が28日周期とは限らないため、
        分かっている場合だけ使う入力にしています（基礎体温や周期からの推定はこの計算機では行いません）。
      </p>
      <p>
        週数は<strong>満</strong>で数えるのに対し、「妊娠◯か月」は
        <strong>4週＝1か月の数え</strong>で数えます。0週0日から27日目までが妊娠1か月、28日目からが妊娠2か月です。
        週と月で数え方が違うので、母子手帳や病院の説明と見比べるときは週数のほうを見るのが確実です。
      </p>

      <h2>時期の区分と正期産</h2>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>妊娠初期</td>
            <td>0週0日 〜 13週6日</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>妊娠中期</td>
            <td>14週0日 〜 27週6日</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>妊娠後期</td>
            <td>28週0日 〜</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>正期産</td>
            <td>37週0日 〜 41週6日</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>予定日当日に生まれる割合は数%</strong>です。37週0日から41週6日までが正期産で、
        予定日の前後に幅があるのが普通です。この計算機が出す産後の日付は、
        すべて「予定日どおりに生まれた場合」のものと考えてください。
      </p>
      <div className="note">
        このページでは<strong>胎児の大きさ・体重の目安や、妊婦健診の間隔・「安定期」といった医学的な内容は扱っていません</strong>
        。出しているのは、法令と用語の定義で日付が決まるものだけです。体調や検査については、かかりつけの医師・助産師にご相談ください。
      </div>

      <h2>産休はいつから？ 予定日の6週間前から請求できる</h2>
      <p>
        産前休業は<strong>出産予定日の6週間前</strong>（多胎妊娠は14週間前）から
        <strong>請求できます</strong>（労働基準法65条1項）。
        予定日を含めて{BEFORE_DAYS_SINGLE}日（多胎は{BEFORE_DAYS_MULTIPLE}日）を数えるので、
        単胎なら<strong>予定日の{BEFORE_DAYS_SINGLE - 1}日前</strong>、多胎なら
        <strong>{BEFORE_DAYS_MULTIPLE - 1}日前</strong>が最初の日です。「1日ずれ」が起きやすいのはここで、
        この計算機は出産手当金 計算機とまったく同じ関数で日付を出しています。
      </p>
      <p>
        産後休業は<strong>出産日の翌日から{AFTER_DAYS}日</strong>（8週間。同条2項）です。
        このうち最初の6週間は本人が希望しても働けず、6週間を過ぎた日以降は
        「本人が請求し、医師が支障がないと認めた業務」に就くことができます。
        6週間（42日）の満了は出産日から42日後なので、<strong>就業できるのはその翌日から</strong>です。
      </p>
      <div className="note">
        <strong>産前休業は「請求すれば取得できる」ものです。</strong>
        日付が来れば自動的に休みになるわけではないので、勤務先への申し出が必要です。
        産後休業のうち最初の6週間は、請求の有無にかかわらず就業させることができない期間です。
      </div>

      <h2>予定日が決まったら、お金の計算へ</h2>
      <p>
        産休・育休のあいだの収入は、<strong>出産予定日を起点に</strong>計算されます。
      </p>
      <ul>
        <li>
          <Link href="/shussan-teate/">出産手当金・出産育児一時金 計算機</Link>
          ：産休中に健康保険から出るお金。支給期間は出産日以前{BEFORE_DAYS_SINGLE}日（多胎
          {BEFORE_DAYS_MULTIPLE}日）＋出産日後{AFTER_DAYS}日で、産前は予定日を起点に数えます
        </li>
        <li>
          <Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>
          ：産後休業が明けてから雇用保険から出るお金。最初の28日は出生後休業支援給付を足して80%、
          その後67%・50%と段が変わります
        </li>
        <li>
          <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>
          ：2026年度から給与天引きが始まった支援金。もらう側ではなく払う側の額です
        </li>
      </ul>
      <p>
        計算結果の下のボタンから、出産予定日と赤ちゃんの人数を出産手当金 計算機へ引き継げます（入れ直す必要はありません）。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shussan-yoteibi" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/shussan-teate/">出産手当金・出産育児一時金 計算機</Link>／
        <Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>／
        <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>／
        <Link href="/nenrei-keisan/">年齢計算</Link>
      </p>

      <ToolMeta slug="shussan-yoteibi" ymyl>
        出典：日本産科婦人科学会「産科婦人科用語集・用語解説集」の妊娠週数・分娩予定日の定義（最終月経開始日＝0週0日、40週0日＝分娩予定日）、
        <a
          href="https://laws.e-gov.go.jp/law/322AC0000000049"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          労働基準法65条（e-Gov 法令検索）
        </a>
        ／
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/seisaku05/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「働く女性の母性健康管理措置、母性保護規定について」
        </a>
        にもとづき作成。制度・定義データの最終確認日は{ja(DATA_CHECKED_AT)}です。
        <strong>
          出産予定日は本来、超音波検査の結果などをもとに医師が判断するものです。このページの計算結果は一般的な数え方による目安であり、医療上の判断を行うものではありません。
        </strong>
      </ToolMeta>
    </>
  );
}
