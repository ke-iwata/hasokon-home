import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  addDays,
  computeFee,
  ENVELOPE_PRESETS,
  fewestStamps,
  formatCombo,
  formatFullDate,
  formatMonthDay,
  formatWeight,
  LETTER_PACK,
  letterPackThreshold,
  LIMITS,
  nengaFaqAnswer,
  nengaScheduleFor,
  NO_OPTIONS,
  OLD_STAMPS,
  pageDescription,
  pageTitle,
  rateTableAt,
  todayInTokyo,
} from '@/lib/yubin-ryokin';
import Calculator from './Calculator';

/**
 * title・description・早見表・FAQ は**ビルド時の日付（Asia/Tokyo）**で RATE_TABLES・NENGA_* から組み立てる。
 * 額や年賀状の日付を文字列に手で書かない（仕様の「ビルド時に焼き込まれる文面」）。
 * 帯と結果は Calculator がブラウザで「今日」を見て切り替える
 */
const buildDay = todayInTokyo();
const t = rateTableAt(buildDay);
const nenga = nengaScheduleFor(buildDay);
const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

export const metadata: Metadata = {
  title: pageTitle(buildDay),
  description: pageDescription(buildDay),
  alternates: { canonical: `${SITE_URL}/yubin-ryokin/` },
  robots: robotsFor('yubin-ryokin'),
};

/** 古い切手 → 定形・はがきにあと何円（今売られている額面で枚数がいちばん少ない組み合わせ） */
function topUp(old: number, fee: number): string {
  const diff = fee - old;
  if (diff <= 0) return diff === 0 ? 'ちょうど' : `${yen(-diff)}多い`;
  return `あと${yen(diff)}（${formatCombo(fewestStamps(diff)!)}）`;
}

const kaku2 = ENVELOPE_PRESETS.find((p) => p.name === '角形2号')!;
const naga3 = ENVELOPE_PRESETS.find((p) => p.name === '長形3号')!;
const a4Fee = (w: number) => {
  const r = computeFee({ kind: 'envelope', size: { length: kaku2.length, width: kaku2.width, thickness: 1, weight: w }, options: NO_OPTIONS }, buildDay);
  return r.ok ? r.total : 0;
};
const lightOver = letterPackThreshold(t.kikakunai, t.letterPackLight);
const plusOver = letterPackThreshold(t.kikakugai, t.letterPackPlus);

const faq = [
  {
    q: '定形郵便の料金はいくら？',
    a: `定形郵便物は50gまで${yen(t.teikei)}です。大きさは長さ${LIMITS.min.long}〜${LIMITS.teikei.longMax}cm・幅${LIMITS.min.short}〜${LIMITS.teikei.shortMax}cm・厚さ${LIMITS.teikei.thickMax}cmまで。どれか1つでも外れると定形外になり、規格内なら50gまで${yen(t.kikakunai[0].fee)}、規格外なら50gまで${yen(t.kikakugai[0].fee)}からです。`,
  },
  {
    q: '84円切手はあと何円？',
    a: `定形郵便（50gまで${yen(t.teikei)}）に84円切手を使うなら、${topUp(84, t.teikei)}です。古い切手は今も額面どおりに使えます。足りない分は今売られている切手を一緒に貼ってください。`,
  },
  {
    q: '63円のはがきはあと何円？',
    a: `通常はがきは${yen(t.hagaki)}なので、63円のはがきは${topUp(63, t.hagaki)}を貼り足します。62円・52円のはがきも、差額分の切手を貼れば使えます（62円なら${topUp(62, t.hagaki)}）。`,
  },
  {
    q: 'A4の書類を送るといくら？',
    a: `A4を三つ折りにして${naga3.name}（${naga3.width}×${naga3.length}cm）に入れ、厚さ1cm・50gまでなら定形で${yen(t.teikei)}です。折らずに${kaku2.name}（${kaku2.width}×${kaku2.length}cm）で送ると定形外（規格内）になり、厚さ3cmまでで50gまで${yen(a4Fee(50))}・100gまで${yen(a4Fee(100))}・250gまで${yen(a4Fee(250))}です。`,
  },
  {
    q: 'レターパックと定形外どちらが安い？',
    a: lightOver
      ? `定形外（規格内）で${formatWeight(lightOver.overWeight)}を超える（${yen(lightOver.fee)}以上）なら、厚さ${LETTER_PACK.lightThickMax}cmまでのレターパックライト（${yen(t.letterPackLight)}）のほうが安くなります。${plusOver ? `厚さ${LETTER_PACK.lightThickMax}cmを超える規格外で${formatWeight(plusOver.overWeight)}を超える（${yen(plusOver.fee)}以上）なら、レターパックプラス（${yen(t.letterPackPlus)}）のほうが安くなります。` : ''}どちらもA4ファイルサイズ（${LETTER_PACK.long}×${LETTER_PACK.short}cm）・4kgまでです。`
      : `レターパックライトは${yen(t.letterPackLight)}、プラスは${yen(t.letterPackPlus)}です。大きさと重さを入れると、計算機がどちらが安いかを出します。`,
  },
  {
    q: '年賀状はいつから受け付け？元日に届く期限は？',
    a: nengaFaqAnswer(buildDay),
  },
  {
    q: '郵便料金はまた値上げされる？',
    a: '令和8年6月19日に公布された改正郵便法で、定形郵便物の料金の上限は日本郵便が定めて総務大臣の認可を受ける形に変わりました。次の値上げは2027年度と報じられている段階で、額も時期もまだ決まっていません。認可・発表が出たら、このページの料金表に施行日つきで足し、施行日の前から「◯月◯日から◯円になります」と出します。',
  },
];

const trail = breadcrumbFor('yubin-ryokin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '郵便料金 計算機',
      url: `${SITE_URL}/yubin-ryokin/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('yubin-ryokin'),
      publisher: PUBLISHER_REF,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      description: metadata.description,
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

const caption = { captionSide: 'top' as const, textAlign: 'left' as const, padding: '4px 0' };
const weights = t.kikakugai.map((s) => s.upTo);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>郵便料金 計算機（はがき・封書・定形外・速達・書留）</h1>
      <p className="lead">
        封筒の大きさと重さを入れると、<strong>定形・定形外（規格内・規格外）を判定して料金</strong>
        を出します。はがき{yen(t.hagaki)}・定形{yen(t.teikei)}。「あと何mm薄ければ安くなるか」、手持ちの古い切手（84円・63円など）にあと何円足すか、レターパックのほうが安いかも示します。
      </p>

      <Calculator buildDate={buildDay} />

      <AdUnit position="below-tool" />

      <h2>定形・定形外（規格内・規格外）の見分け方</h2>
      <p>
        区分は大きさと重さの両方で決まります。長さと幅は大きいほうを長さとして見るので、封筒を縦に置いても横に置いても同じです。どれか1つでも上限を超えると、1つ上の区分になります。長さ{LIMITS.min.long}cm・幅{LIMITS.min.short}
        cmに足りないものは、定形外にもならず郵便では送れません。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption style={caption}>大きさと重さの上限</caption>
          <thead>
            <tr>
              <th scope="col">区分</th>
              <th scope="col">大きさ</th>
              <th scope="col">重さ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">定形</th>
              <td>
                長さ{LIMITS.min.long}〜{LIMITS.teikei.longMax}cm・幅{LIMITS.min.short}〜{LIMITS.teikei.shortMax}cm・厚さ{LIMITS.teikei.thickMax}cmまで
              </td>
              <td>{LIMITS.teikei.weightMax}gまで</td>
            </tr>
            <tr>
              <th scope="row">定形外（規格内）</th>
              <td>
                長辺{LIMITS.kikakunai.longMax}cm・短辺{LIMITS.kikakunai.shortMax}cm・厚さ{LIMITS.kikakunai.thickMax}cmまで
              </td>
              <td>{formatWeight(LIMITS.kikakunai.weightMax)}まで</td>
            </tr>
            <tr>
              <th scope="row">定形外（規格外）</th>
              <td>
                長辺{LIMITS.kikakugai.longMax}cmまで・3辺の合計{LIMITS.kikakugai.sumMax}cmまで
              </td>
              <td>{formatWeight(LIMITS.kikakugai.weightMax)}まで</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>重さの段と料金の早見表</h2>
      <p>
        重さの段は「以内」で、50gちょうどは50gまでの段です。定形は50gまで{yen(t.teikei)}の1段だけ、通常はがきは{yen(t.hagaki)}・往復はがきは{yen(t.ofukuHagaki)}です。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption style={caption}>定形外郵便物の料金（{formatFullDate(t.effectiveFrom)}から）</caption>
          <thead>
            <tr>
              <th scope="col">重さ</th>
              <th scope="col">規格内</th>
              <th scope="col">規格外</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((w) => {
              const inside = t.kikakunai.find((s) => s.upTo === w);
              const outside = t.kikakugai.find((s) => s.upTo === w)!;
              return (
                <tr key={w}>
                  <th scope="row">{formatWeight(w)}まで</th>
                  <td>{inside ? yen(inside.fee) : '—'}</td>
                  <td>{yen(outside.fee)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>速達・書留・特定記録の違いと料金</h2>
      <p>
        速達は早く届ける、特定記録は差し出した記録と郵便受けへの配達の記録を残す、書留は手渡しで受け取りの記録を残し、壊れたり届かなかったりしたときに損害要償額まで賠償される、というサービスです。料金は基本料金に足します。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption style={caption}>オプションの加算額</caption>
          <thead>
            <tr>
              <th scope="col">サービス</th>
              <th scope="col">加算額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">速達</th>
              <td>{t.sokutatsu.map((s) => `${formatWeight(s.upTo)}まで +${yen(s.fee)}`).join('／')}</td>
            </tr>
            <tr>
              <th scope="row">特定記録</th>
              <td>+{yen(t.tokuteiKiroku)}</td>
            </tr>
            <tr>
              <th scope="row">簡易書留</th>
              <td>
                +{yen(t.kaniKakitome)}（損害要償額{t.kaniMaxSongai / 10_000}万円まで）
              </td>
            </tr>
            <tr>
              <th scope="row">一般書留</th>
              <td>
                +{yen(t.ippanKakitome.base)}（{t.ippanKakitome.baseCovers / 10_000}万円まで。以後{t.ippanKakitome.stepYen / 10_000}万円ごとに+{yen(t.ippanKakitome.stepFee)}、上限{t.ippanKakitome.max / 10_000}万円）
              </td>
            </tr>
            <tr>
              <th scope="row">現金書留</th>
              <td>
                +{yen(t.genkinKakitome.base)}（{t.genkinKakitome.baseCovers / 10_000}万円まで。以後{t.genkinKakitome.stepYen.toLocaleString('ja-JP')}円ごとに+{yen(t.genkinKakitome.stepFee)}、上限{t.genkinKakitome.max / 10_000}万円）
              </td>
            </tr>
            <tr>
              <th scope="row">配達証明</th>
              <td>+{yen(t.haitatsuShomei)}（差し出すときに申し込む。一般書留にした郵便物だけ）</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        現金書留は窓口で売っている専用の封筒が要るので、計算機のオプションには入れていません。
      </p>

      <h2>古い切手を使うとき（84円・63円にいくら足すか）</h2>
      <p>
        値上げ前の切手やはがきも、額面どおりに今も使えます。足りない分の切手を一緒に貼ってください。差額の切手は、今売られている額面で枚数がいちばん少ない組み合わせを例に出しています。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption style={caption}>古い切手1枚に足す額</caption>
          <thead>
            <tr>
              <th scope="col">古い切手</th>
              <th scope="col">定形（{yen(t.teikei)}）なら</th>
              <th scope="col">はがき（{yen(t.hagaki)}）なら</th>
            </tr>
          </thead>
          <tbody>
            {OLD_STAMPS.map((v) => (
              <tr key={v}>
                <th scope="row">{v}円</th>
                <td>{topUp(v, t.teikei)}</td>
                <td>{topUp(v, t.hagaki)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>手持ちの切手が何枚かあるときは、計算機の「手持ちの切手」に枚数を入れると、合計とあと何円かを出します。</p>

      <h2 id="nenga">年賀状はいつから出せる？元日に届く期限</h2>
      {nenga ? (
        <>
          <p>
            {nenga.year}年用の年賀状の受付は<strong>{formatFullDate(nenga.acceptFrom)}{formatMonthDay(nenga.acceptFrom).slice(-3)}から</strong>
            、元日に届けるための差出日の目安は<strong>{formatMonthDay(nenga.newYearBy)}</strong>
            です。どちらも前の年より遅くなりました（従前は受付が12月15日から、元日に届ける目安が12月25日まで）。
            {formatMonthDay(addDays(nenga.acceptFrom, -1))}以前に出した年賀状は、年賀状としてではなく、ふつうの郵便として年内に届きます。
          </p>
          <p>
            年賀はがきの販売は{formatFullDate(nenga.saleFrom)}から{formatFullDate(nenga.saleTo)}
            まで。三が日の年賀状の配達は元日と{formatMonthDay(`${nenga.year}-01-03`)}です。目安の日を過ぎて出した年賀状がいつ届くかは、日本郵便の発表に書かれていないので、このページでも書いていません。
          </p>
        </>
      ) : (
        <p>
          年賀状の受付開始日と元日に届けるための差出日の目安は、毎年8月末に日本郵便が発表します。発表が出たら、このページと計算機の「はがき」の欄に載せます。
        </p>
      )}
      <PublicToolLink slug="nissu-keisan">
        <p>
          期限まであと何日かは<ToolLink slug="nissu-keisan">日数計算</ToolLink>でも数えられます。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="renkyu-keisan">
        <p>
          年末年始の休みは<ToolLink slug="renkyu-keisan">連休計算機</ToolLink>で調べられます。
        </p>
      </PublicToolLink>

      <h2>次の値上げはいつ？</h2>
      <p>
        令和8年6月19日に公布された改正郵便法（令和8年法律第42号）で、定形郵便物の料金の上限は「省令で定める」から「日本郵便が定めて総務大臣の認可を受ける」に変わりました。次の値上げは2027年度と報じられている段階で、
        <strong>額も時期もまだ決まっていません</strong>。
      </p>
      <p>
        このページの料金表は「いつから」の日付つきで持っています。認可・発表が出たら新しい表を足し、施行日の前は計算結果に「◯月◯日から◯円になります」と出して、施行日からは新しい額で計算します。決まっていない額は書きません。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="yubin-ryokin" />

      <ToolMeta slug="yubin-ryokin">
        料金は
        <a href="https://www.post.japanpost.jp/send/domestic/charge/list/one_two.html" target="_blank" rel="nofollow noopener noreferrer">
          日本郵便「手紙・はがき」料金表
        </a>
        ・
        <a href="https://www.post.japanpost.jp/send/domestic/charge/list/option.html" target="_blank" rel="nofollow noopener noreferrer">
          「オプションサービス」料金表
        </a>
        ・
        <a href="https://www.post.japanpost.jp/service/send/domestic/mail/letterpack/" target="_blank" rel="nofollow noopener noreferrer">
          「レターパック」
        </a>
        を、大きさの最大・最小とあて名札の特例は
        <a href="https://www.post.japanpost.jp/service/send/domestic/mail/letter/" target="_blank" rel="nofollow noopener noreferrer">
          「手紙（第一種郵便物）」
        </a>
        を、はがきの規格は
        <a href="https://www.post.japanpost.jp/service/send/domestic/mail/postcard/" target="_blank" rel="nofollow noopener noreferrer">
          「はがき」
        </a>
        を、封筒の寸法は
        <a href="https://www.post.japanpost.jp/service/create/guideline/jis_envelope.html" target="_blank" rel="nofollow noopener noreferrer">
          「JIS S5502:2010「封筒」に適合する封筒の条件」
        </a>
        を、今売られている切手の額面は
        <a href="https://www.post.japanpost.jp/enjoy/culture/stamp/" target="_blank" rel="nofollow noopener noreferrer">
          「切手」
        </a>
        を参照しています。年賀状の日付は
        <a
          href="https://files.japanpost.jp/assets/34d9d11432734cfaa759e78fe395b688/159168aef19d465baf3350d358e46fa9/20260831_02_06.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本郵便 報道発表（2026年8月31日）「2027（令和9）年用年賀はがきの発行・販売等」
        </a>
        、改正郵便法は
        <a href="https://www.soumu.go.jp/menu_hourei/s_houritsu.html" target="_blank" rel="nofollow noopener noreferrer">
          総務省「所管法令（法律）」
        </a>
        によります。
      </ToolMeta>
    </>
  );
}
