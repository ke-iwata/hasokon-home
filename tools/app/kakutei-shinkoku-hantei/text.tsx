import { weekdayLabel, parseDate } from '@/lib/date-parts';
import type { Note, Reason, RefundHint } from '@/lib/kakutei-shinkoku-hantei';

/**
 * 判定の ID → 画面の文面。判定（lib）と文言をここで分ける。
 * 仕様書の表の行をそのまま書く（出典は No.1900・No.1600）
 */

/** '2027-03-15' → '2027年3月15日（月）' */
export function jaDate(iso: string): string {
  const p = parseDate(iso)!;
  return `${p.year}年${p.month}月${p.day}日（${weekdayLabel(p)}）`;
}

export const REASON_TEXT: Record<Reason, string> = {
  'salary-over-20m': '給与の収入が2,000万円を超えています（年末調整の対象外。No.1900 の1）。',
  'salary-other-income-over-200k':
    '給与を1か所から受けていて、給与・退職所得以外の所得の合計が20万円を超えています（No.1900 の2）。',
  'salary-other-income-under-200k':
    '給与を1か所から受けていて、給与・退職所得以外の所得の合計が20万円以下です（No.1900 の2に当たらない）。',
  'two-salaries':
    '給与を2か所以上から受けていて、年末調整されなかった給与の収入と、給与・退職所得以外の所得の合計が20万円を超えています（No.1900 の3）。',
  'two-salaries-under-limit':
    '給与を2か所以上から受けていますが、年末調整されなかった給与と他の所得の合計が20万円以下か、給与の合計が150万円以下で他の所得が20万円以下です（No.1900 の3と注）。',
  'pension-over-4m': '公的年金等の収入が400万円を超えています（No.1600）。',
  'pension-other-income-over-200k': '公的年金等に係る雑所得以外の所得（給与所得を含む）が20万円を超えています（No.1600）。',
  'pension-under-4m': '公的年金等の収入が400万円以下で、年金以外の所得が20万円以下です（公的年金等に係る確定申告不要制度。No.1600）。',
  'no-withholding-pension':
    '源泉徴収されない公的年金等（外国の年金など）があるので、年金の確定申告不要制度を使えません（No.1600 注3）。',
  'business-tax-due': '給与・年金が無く、所得から基礎控除を引いても課税される所得が残ります（所得税法120条）。',
  'no-tax-due':
    '所得から基礎控除（令和8年分は合計所得489万円以下で104万円）を引くと課税される所得が残らないので、所得税額が出ず、申告の義務そのものがありません（所得税法120条）。',
  'no-income': '2026年に収入がありません。',
};

export const HINT_TEXT: Record<RefundHint, string> = {
  medical: '医療費控除（1年間の医療費が10万円、または総所得金額等の5%を超えた）',
  'self-medication': 'セルフメディケーション税制（対象の市販薬の購入が12,000円を超えた。医療費控除とどちらか一方）',
  furusato: 'ふるさと納税の寄附金控除（6団体以上に寄附した・ワンストップ特例の申請を出していない）',
  'housing-loan-first': '住宅ローン控除の1年目（1年目は確定申告が必要。2年目からは年末調整で受けられます）',
  'retired-no-adjustment': '年の途中で退職して年末調整を受けていない（源泉徴収された所得税が納め過ぎになっていることが多い。No.1910）',
  'retirement-no-declaration': '退職金で「退職所得の受給に関する申告書」を出さず、20.42%で源泉徴収された',
  disaster: '災害・盗難の損失（雑損控除）',
};

/** 還付の行き先ツールの名前（リンクは PublicToolLink で公開済みだけに出す） */
export const HINT_TOOL_LABEL: Record<RefundHint, string | null> = {
  medical: '医療費控除の計算機',
  'self-medication': '医療費控除・セルフメディケーション税制の計算機',
  furusato: 'ふるさと納税の計算機',
  'housing-loan-first': '住宅ローン控除の計算機',
  'retired-no-adjustment': '年末調整の還付金の計算機',
  'retirement-no-declaration': '退職金の手取りの計算機',
  disaster: null,
};

export const NOTE_TEXT: Record<Note, string> = {
  'refund-include-other-income':
    '申告するなら副業などの所得も含めます（20万円以下でも）。戻る額が減ることがあり、副業の所得によっては納める側になることもあります（No.1900 の質疑応答「確定申告を要しない場合の意義」）。',
  'onestop-invalid':
    'ワンストップ特例の申請を出していても、確定申告をするとワンストップ特例は無効になります。ワンストップ特例を出した寄附も含めて、全部の寄附を申告書に書いてください。',
  'pension-resident-deductions':
    '年金の源泉徴収票に載らない控除（医療費控除・国民健康保険料などの社会保険料控除・生命保険料控除など）を住民税にも効かせたいときは、住民税の申告（または所得税の確定申告）が要ります。',
  'two-salaries-gross':
    '150万円の判定は、本来は給与の合計から社会保険料控除などの所得控除（雑損・医療費・寄附金・基礎控除を除く）を引いた額で見ます。この判定は引く前の額で見ているので、控除を引くと不要になる場合があります。',
};

/**
 * 断定を避ける共通の文言（仕様書：結果の3ブロック・解説・FAQ のすべてに出す）。
 * 税理士法2条の税務相談に当たる書き方を避けるため
 */
export const MEYASU =
  '判定の目安です。最終的には国税庁の「確定申告書等作成コーナー」または税務署で確認してください。';

export function Meyasu() {
  return (
    <p className="hint" style={{ margin: '6px 0 0' }}>
      {MEYASU}
    </p>
  );
}

/** 対象外（仕様書「やらないこと」）。画面に1行出す */
export const OUT_OF_SCOPE = '配当控除・予定納税がある人はこの判定の対象外です。国税庁で確認してください。';
