import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  DATA_CHECKED_AT,
  TAX_YEAR,
  filingDeadline,
  filingStart,
  refundDeadline,
  refundStart,
} from '@/lib/kakutei-shinkoku-hantei';
import { MEYASU, OUT_OF_SCOPE, jaDate } from './text';
import Calculator from './Calculator';

// 年分と期日は lib の TAX_YEAR から作る（年分を上げるときに1か所で済むように）
const REIWA = TAX_YEAR - 2018;
const DEADLINE = jaDate(filingDeadline());
const START = jaDate(filingStart());
const REFUND_FROM = jaDate(refundStart());
const REFUND_TO = jaDate(refundDeadline());

const title = `確定申告が必要か 判定（令和${REIWA}年分）｜副業20万円・年金400万円・還付申告・住民税の申告`;
const description = `給与・年金・副業・控除の状況を選ぶと、所得税の確定申告が「必要」「不要」「不要だが申告すれば戻る」のどれかと、所得税は不要でも住民税の申告が要るかを分けて答えます。期限は${DEADLINE}、還付申告は${REFUND_TO}まで。`;

export const metadata: Metadata = {
  title,
  description,
  keywords: ['確定申告 必要か', '副業 20万円 確定申告', '年金 確定申告 不要', '還付申告 いつまで', '住民税 申告 必要'],
  alternates: { canonical: `${SITE_URL}/kakutei-shinkoku-hantei/` },
  robots: robotsFor('kakutei-shinkoku-hantei'),
};

const faq = [
  {
    q: '副業の所得が20万円以下なら、何もしなくていいですか？',
    a: `所得税の確定申告は不要ですが、住民税の申告は要ります。「20万円以下なら申告不要」は所得税だけの特例で、住民税にはありません。お住まいの市区町村へ、${DEADLINE}までに申告します。また、医療費控除などで確定申告（還付申告）をするなら、20万円以下の副業の所得も申告書に書く必要があります。`,
  },
  {
    q: '「20万円」は売上ですか、所得ですか？',
    a: '所得です。売上（収入）から必要経費を引いた額で判定します。アフィリエイトやフリマの売上そのものではありません。特定口座（源泉徴収あり）の株・投資信託の利益は、申告しないことを選ぶなら数えません。',
  },
  {
    q: '年金が400万円以下なら申告しなくていいですか？',
    a: '公的年金等の収入が400万円以下で、年金以外の所得が20万円以下なら、所得税の確定申告は不要です（源泉徴収されない外国の年金などがある人は使えません）。ただし、医療費控除などで税金が戻る場合は還付申告ができます。年金以外の所得がある人や、源泉徴収票に載らない控除を受けたい人は住民税の申告が要ります。',
  },
  {
    q: '医療費控除だけ申告したいのですが、いつまでにすればいいですか？',
    a: `還付申告は確定申告の期間に関係なく、${REFUND_FROM}から5年間（${REFUND_TO}まで）出せます。確定申告の期間（${START}〜${DEADLINE}）は混むので、源泉徴収票が届いたら1月から出すのがおすすめです。`,
  },
  {
    q: 'ふるさと納税でワンストップ特例を出しましたが、医療費控除で確定申告します。',
    a: '確定申告をすると、ワンストップ特例は無効になります。ワンストップ特例を出した寄附も含めて、全部の寄附を確定申告書に書いてください。書かないと、その寄附の控除が受けられません。',
  },
  {
    q: '年の途中で会社を辞めて、そのまま働いていません。',
    a: '年末調整を受けていないので、源泉徴収された所得税が納め過ぎになっていることが多く、確定申告（還付申告）をすると戻ります。退職した年の翌年1月1日から5年間出せます。年内に再就職した場合は、新しい勤務先で前の勤務先の分も含めて年末調整されます。',
  },
].map((f) => ({ ...f, a: `${f.a}${MEYASU}` }));

const trail = breadcrumbFor('kakutei-shinkoku-hantei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: `確定申告が必要か 判定（令和${REIWA}年分）`,
      url: `${SITE_URL}/kakutei-shinkoku-hantei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kakutei-shinkoku-hantei'),
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

/** '2026-10-11' → '2026年10月11日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const SOURCES = [
  ['https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1900.htm', '国税庁 No.1900 給与所得者で確定申告が必要な人'],
  [
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1900_qa.htm',
    '国税庁 No.1900 質疑応答「確定申告を要しない場合の意義」',
  ],
  ['https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1600.htm', '国税庁 No.1600 公的年金等の課税関係'],
  ['https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1910.htm', '国税庁 No.1910 中途退職で年末調整を受けていないとき'],
  ['https://laws.e-gov.go.jp/law/340AC0000000033', '所得税法（120条・121条）'],
  ['https://laws.e-gov.go.jp/law/325AC0000000226', '地方税法（317条の2）'],
] as const;

const cellL = { textAlign: 'left' as const };

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>確定申告が必要か 判定（令和{REIWA}年分）</h1>
      <p className="lead">
        {TAX_YEAR}年の収入の種類と、戻るかもしれないものを選ぶと、<strong>所得税の確定申告</strong>・<strong>還付申告</strong>・
        <strong>住民税の申告</strong>の3つを分けて答えます。所得税は不要でも住民税の申告が要る人、申告の義務は無くても申告すれば戻る人を取りこぼしません。
        入力した内容はどこにも送信されません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>所得税の確定申告が必要な人（令和{REIWA}年分）</h2>
      <p>
        所得税の申告義務（所得税法120条）があっても、給与や公的年金を受けている人は、121条の特例で申告しなくてよい場合があります。
        次のどれかに当てはまる人は申告が必要です（申告すれば税金が戻る人は除きます）。
      </p>
      <table>
        <thead>
          <tr>
            <th style={cellL}>区分</th>
            <th style={cellL}>申告が必要になる条件</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellL}>給与 1か所</td>
            <td style={cellL}>給与の収入が2,000万円超／給与・退職所得以外の所得の合計が20万円超</td>
          </tr>
          <tr>
            <td style={cellL}>給与 2か所以上</td>
            <td style={cellL}>
              年末調整されなかった給与の収入＋給与・退職所得以外の所得が20万円超（給与の合計から一部の所得控除を引いて150万円以下、かつ他の所得20万円以下なら不要）
            </td>
          </tr>
          <tr>
            <td style={cellL}>公的年金等</td>
            <td style={cellL}>年金の収入が400万円超／年金以外の所得が20万円超／源泉徴収されない年金（外国の年金など）がある</td>
          </tr>
          <tr>
            <td style={cellL}>給与・年金が無い</td>
            <td style={cellL}>所得から基礎控除などを引いても、課税される所得が残る</td>
          </tr>
          <tr>
            <td style={cellL}>その他</td>
            <td style={cellL}>
              同族会社の役員で会社から貸付金の利子などを受け取っている／源泉徴収義務の無い人（家事使用人の雇い主など）から給与を受けている
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        「20万円」に数えない所得：申告しないことを選んだ上場株式等の配当・特定口座（源泉徴収あり）の譲渡益・特定公社債の利子、源泉分離課税の預貯金の利子など。
      </p>
      <p className="hint">{MEYASU}</p>

      <h2>令和{REIWA}年分で変わったこと</h2>
      <p>
        令和{REIWA}年分から、所得税の基礎控除は合計所得489万円以下で104万円（489万円超655万円以下で67万円、655万円超2,350万円以下で62万円）、
        給与所得控除の最低保障は74万円になりました。このため「給与以外に少し所得があるが、所得税は0円」の人が増えます。
        <strong>所得税額が0円なら、20万円の特例以前に申告の義務そのものがありません</strong>（所得税法120条）。この判定は、この2つを分けて答えます。
      </p>

      <h2>申告の義務が無くても、申告すれば戻る人（還付申告）</h2>
      <p>
        医療費控除・ふるさと納税（6団体以上、またはワンストップ特例を出していない）・住宅ローン控除の1年目・年の途中で退職して年末調整を受けていない人は、
        申告すると税金が戻る可能性があります。還付申告は確定申告の期間に関係なく、<strong>{REFUND_FROM}から{REFUND_TO}まで</strong>の5年間出せます。
      </p>
      <p>
        <strong>還付申告をするなら、20万円以下の副業などの所得も書きます。</strong>
        「20万円以下なら申告不要」は申告しなくてよいというだけで、申告するときに除いてよいわけではありません（国税庁 No.1900 の質疑応答）。
        副業の所得を足すと戻る額が減り、場合によっては納める側になります。
      </p>
      <p className="hint">{MEYASU}</p>

      <h2>所得税は不要でも、住民税の申告は要る人</h2>
      <p>
        所得税の「20万円以下なら申告不要」は住民税にはありません。給与以外の所得がある人は、所得税の確定申告をしない場合、
        お住まいの市区町村に住民税の申告が要ります（地方税法317条の2）。期限は所得税と同じ{DEADLINE}です。
        年金の「400万円以下なら申告不要」も同じで、年金以外の所得がある人や、源泉徴収票に載らない控除を受けたい人は住民税の申告が要ります。
        所得税の確定申告（還付申告を含む）をすれば、その内容が市区町村に回るので、住民税の申告は別に要りません。
      </p>
      <p className="hint">{MEYASU}</p>

      <h2>この判定で扱わないこと</h2>
      <p>
        {OUT_OF_SCOPE}
        税額・還付額は計算しません（下の各計算機で計算できます）。青色申告・消費税・相続税・贈与税の申告の要否も扱いません。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kakutei-shinkoku-hantei" />

      <PublicToolLink slug="nenmatsu-chosei">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          年末調整でいくら戻るか：<ToolLink slug="nenmatsu-chosei">年末調整 還付金 計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="iryohi-kojo">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          医療費控除で戻る額：<ToolLink slug="iryohi-kojo">医療費控除・セルフメディケーション税制 計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="furusato-nozei">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ふるさと納税の控除額：<ToolLink slug="furusato-nozei">ふるさと納税 控除額計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="jutaku-loan-kojo">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          住宅ローン控除の額：<ToolLink slug="jutaku-loan-kojo">住宅ローン控除 計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="taishokukin-tedori">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          退職金の税金：<ToolLink slug="taishokukin-tedori">退職金の税金・手取り計算機</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="zoyozei-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          贈与税の申告が要るか：<ToolLink slug="zoyozei-keisan">贈与税 計算機・生前贈与加算チェッカー</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="kakutei-shinkoku-hantei" ymyl>
        出典：
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && '／'}
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
        。所得税額が出るかは、給与所得控除・公的年金等控除・基礎控除だけを引いた概算で見ています（社会保険料控除などは引いていません）。
        一次情報の最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
