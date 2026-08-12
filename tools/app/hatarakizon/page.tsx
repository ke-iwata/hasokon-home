import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { PUBLISHER_REF, webApplication } from '@/lib/jsonld';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const name = '社会保険 損得計算機';
const title = '社会保険 損得計算機【2026年10月〜】加入後の手取りと損益分岐点';
const description =
  '2026年10月1日に社会保険の賃金要件（106万円）が撤廃されます。扶養内に抑える場合と加入して働く場合の手取りを並べ、手取りが逆転する「働き損」の年収帯と、いくら稼げば取り戻せるかの損益分岐点を計算。増える厚生年金・傷病手当金も金額で出します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hatarakizon/` },
};

const faq = [
  {
    q: '社会保険に加入すると「働き損」になるのはなぜですか？',
    a: '社会保険料は年収の約15%（労使折半後の本人負担）で、加入した瞬間に丸ごと引かれ始めるためです。税金は「超えた分」にだけかかるので少し超えても影響は小さいのに対し、社会保険料は年収全体にかかります。そのため加入直後は、年収を上げたのに手取りが下がる区間ができます。この計算機はその区間（働き損ゾーン）と、扶養内に抑えた場合の手取りに追いつく年収（損益分岐点）を出します。',
  },
  {
    q: '2026年10月に何が変わりますか？',
    a: '短時間労働者が勤務先の社会保険に加入する条件から、賃金要件（月額8.8万円＝年収106万円相当）が撤廃されます。以降は従業員51人以上の勤務先で週20時間以上働けば、年収がいくらであっても加入します。「年収を106万円未満に抑える」という調整ができなくなるため、扶養内に留まりたい場合に調整するのは年収ではなく週の所定労働時間になります。',
  },
  {
    q: '損をしてでも加入したほうがよい場合はありますか？',
    a: '手取りだけを見れば加入直後は減りますが、将来の老齢厚生年金が終身で増え、傷病手当金・出産手当金の対象にもなります。この計算機は年金の増分を年額で出し、受給が始まってから何年で払った保険料を取り戻すか（おおむね17年前後）も表示します。長く働き続ける予定があるか、公的年金以外の備えがあるかで判断が変わります。',
  },
  {
    q: '扶養内に抑える場合の年収は何を基準にしていますか？',
    a: '賃金要件が残っている2026年9月30日までは106万円、撤廃後は家族の社会保険の扶養認定基準（130万円。19〜22歳の学生は150万円）を上限とし、その1万円手前を「扶養内で最大限働いた場合」として比較しています。実際にはそこまで働けないという場合は、チェックを入れて自分の年収を指定できます。',
  },
  {
    q: '計算結果はどのくらい正確ですか？',
    a: '概算です。健康保険料率は協会けんぽの全国平均を使っているため、お住まいの都道府県で数%変わります。標準報酬月額は本来4〜6月の報酬から決まりますが、ここでは年収の12分の1で判定しています。また子ども・子育て支援金は含めていません。正確な保険料は勤務先または加入する健康保険の保険者にご確認ください。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      ...webApplication({
        name,
        slug: 'hatarakizon',
        description,
        category: 'FinanceApplication',
      }),
      publisher: PUBLISHER_REF,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>社会保険 損得計算機（2026年10月の賃金要件撤廃に対応）</h1>
      <p className="lead">
        社会保険に加入すると、手取りはいくら減り、いくら稼げば取り戻せるのか。
        <strong>扶養内に抑える場合</strong>と<strong>加入して働く場合</strong>の手取りを年収の軸で並べ、
        手取りが逆転する「働き損」の年収帯と損益分岐点を計算します。
        減る手取りだけでなく、増える厚生年金・傷病手当金も金額で出します。
      </p>

      {/*
        2026年10月1日の賃金要件撤廃で前提が変わる。基準日はビルド時刻ではなく
        「画面を開いた日」で評価する（lib/nenshu-kabe.ts と同じ理由）
      */}
      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>なぜ「働き損」が起きるのか</h2>
      <p>
        税金の壁と社会保険の壁は、効き方がまったく違います。所得税や住民税は
        <strong>超えた分にだけ</strong>かかるため、178万円の壁を1万円超えても増える税は数百円です。
        一方で社会保険料は、加入した時点で<strong>年収の全体</strong>に約15%（本人負担分）がかかります。
        年収106万円で加入すれば、年間16万円前後が新たに天引きされます。
      </p>
      <p>
        このため、加入のラインをまたいだ直後は「年収は上がったのに手取りは下がる」区間が生まれます。
        これが働き損ゾーンです。ゾーンを抜けるまで働けば手取りは扶養内を上回り、
        それ以降は働いた分だけ手取りも増えていきます。
      </p>

      <h2>2026年10月1日に変わること</h2>
      <table>
        <thead>
          <tr>
            <th>時期</th>
            <th>加入の条件</th>
            <th>扶養内に留まるには</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>〜2026年9月30日</td>
            <td style={{ textAlign: 'left' }}>
              従業員51人以上 かつ 週20時間以上 かつ <strong>月額賃金8.8万円以上</strong>
              （＝年収106万円相当）
            </td>
            <td style={{ textAlign: 'left' }}>年収を106万円未満に抑える</td>
          </tr>
          <tr>
            <td>2026年10月1日〜</td>
            <td style={{ textAlign: 'left' }}>
              従業員51人以上 かつ 週20時間以上（<strong>賃金要件は撤廃</strong>。年収は問わない）
            </td>
            <td style={{ textAlign: 'left' }}>
              週の所定労働時間を20時間未満にする（そのうえで扶養認定の130万円）
            </td>
          </tr>
        </tbody>
      </table>
      <div className="note">
        年金制度改正法（2025年6月成立）により、短時間労働者の適用拡大から賃金要件が撤廃されます。
        この計算機は施行日を境に前提を自動で切り替えます（判定は端末の日付にもとづきます）。
        企業規模の要件（従業員51人以上）も2027年10月から段階的に縮小され2035年10月に撤廃される予定ですが、
        本ツールは現行の51人以上で判定します。なお昼間部の学生は適用除外です（夜間部・定時制・通信制、休学中の方は対象）。
      </div>

      <h2>加入すると増えるもの</h2>
      <p>
        働き損という言葉は手取りだけを見た表現で、加入によって増える給付があります。
        この計算機はそれも金額で出します。
      </p>
      <ul>
        <li>
          <strong>老齢厚生年金（報酬比例部分）</strong>
          ：「平均標準報酬額 × 5.481/1000 × 加入月数」で終身増えます。
          老齢基礎年金は扶養内（第3号被保険者）でも満額の対象なので、増えるのはこの部分だけです
        </li>
        <li>
          <strong>傷病手当金・出産手当金</strong>
          ：病気やケガ、出産で働けない期間に標準報酬日額の3分の2が支給されます。
          扶養内では受け取れません（
          <Link href="/shobyo-teate/">傷病手当金 計算機</Link>）
        </li>
        <li>
          <strong>保険料の半分は勤務先が負担します</strong>
          。国民健康保険・国民年金には無い仕組みで、同じ保障を自分で買うより負担は軽くなります
        </li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hatarakizon" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/nenshu-kabe/">年収の壁 計算機</Link>（自分に関係する壁がどこにあるか）
        ／<Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link>
        ／<Link href="/shobyo-teate/">傷病手当金 計算機</Link>
      </p>

      <ToolMeta slug="hatarakizon" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/tekiyoukakudai/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「社会保険適用拡大特設サイト」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20120817.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「標準報酬月額の決め方」
        </a>
        ／
        <a
          href="https://www.kyoukaikenpo.or.jp/g7/cat330/sb3150/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          全国健康保険協会「保険料額表」
        </a>
        （健康保険料率は都道府県ごとに異なります。本ツールは全国平均で概算しています）
        ／
        <a
          href="https://www.nenkin.go.jp/service/jukyu/roureinenkin/jukyu-yoken/20140421-02.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「老齢厚生年金の計算方法」
        </a>
        ／年金制度改正法（2025年6月成立）および所得税法等の一部を改正する法律（令和8年法律第12号）にもとづき作成。
      </ToolMeta>
    </>
  );
}
