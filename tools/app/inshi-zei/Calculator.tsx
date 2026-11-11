'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  DAI7GO_TAX,
  DEFAULT_COPIES,
  DOC_GO,
  DOC_LABEL,
  ISSUER_LABEL,
  MAX_COPIES,
  MIN_DATE,
  SOURCES,
  TAIKO_STATUS,
  formatDate,
  formatYen,
  judge,
  kataizei,
  nextDay,
  parseYen,
  todayInTokyo,
  type DocKind,
  type Issuer,
  type Medium,
  type TaxWriting,
  type UkeoiNature,
} from '@/lib/inshi-zei';

const DOCS: DocKind[] = ['ryoshusho', 'fudosan', 'kensetsu', 'ukeoi'];
const ISSUERS: Issuer[] = ['hojin', 'kojin-jigyo', 'kojin-shigyo', 'kojin-shiteki'];

/** 選択ボタン。押せる面を 44px 以上にする（スマホで2列×2段） */
const choiceStyle = (on: boolean): React.CSSProperties => ({
  minHeight: 44,
  padding: '8px 10px',
  borderRadius: 10,
  border: on ? '2px solid var(--accent)' : '1px solid var(--border)',
  background: on ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontWeight: on ? 700 : 400,
  fontSize: 'var(--fs-sm)',
  textAlign: 'left',
  cursor: 'pointer',
});

function Radio<T extends string>({
  name,
  value,
  current,
  onChange,
  children,
}: {
  name: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, minHeight: 32 }}>
      <input
        type="radio"
        name={name}
        checked={current === value}
        onChange={() => onChange(value)}
        style={{ width: 'auto', marginTop: 5 }}
      />
      <span>{children}</span>
    </label>
  );
}

export default function Calculator() {
  const [doc, setDoc] = useState<DocKind>('ryoshusho');
  const [amountText, setAmountText] = useState('');
  const [noAmount, setNoAmount] = useState(false);
  const [taxWriting, setTaxWriting] = useState<TaxWriting>('komi');
  const [medium, setMedium] = useState<Medium>('kami');
  // 静的書き出しなので、ビルド日で描いてからマウント後に「開いた日」へ差し替える
  const [date, setDate] = useState(() => todayInTokyo());
  useEffect(() => setDate(todayInTokyo()), []);
  const [copiesText, setCopiesText] = useState(String(DEFAULT_COPIES));
  const [issuer, setIssuer] = useState<Issuer>('hojin');
  const [ukeoiNature, setUkeoiNature] = useState<UkeoiNature>('kansei');

  const isContract = doc !== 'ryoshusho';
  const parsed = parseYen(amountText);
  const amount = noAmount ? null : parsed;
  const amountInvalid = !noAmount && parsed !== undefined && Number.isNaN(parsed);
  const copiesNum = Number.parseInt(copiesText, 10);
  const copies = Number.isFinite(copiesNum) && copiesNum >= 1 ? Math.min(MAX_COPIES, copiesNum) : 1;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);

  const base = { doc, taxWriting, medium, date, copies, issuer, ukeoiNature };
  // 電子・対象外・営業に関しないは、金額を入れる前に結論が出る
  const early = judge({ ...base, amount: 0 });
  const decidedWithoutAmount =
    early.kind === 'taishogai' || (early.kind === 'zero' && early.reason !== 'hikazei');
  const shown =
    isContract && !dateOk
      ? null
      : decidedWithoutAmount
        ? early
        : amount !== undefined && !Number.isNaN(amount)
          ? judge({ ...base, amount })
          : null;

  const track = () => trackToolUse('inshi-zei', 'calculate');

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">文書の種類</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {DOCS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={doc === d}
              onClick={() => {
                setDoc(d);
                track();
              }}
              style={choiceStyle(doc === d)}
            >
              {DOC_LABEL[d]}
            </button>
          ))}
        </div>
        <details style={{ marginTop: 8 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>
            どれに当たる？
          </summary>
          <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: '1.2em' }}>
            <li>
              <strong>領収書・レシート</strong>：商品・サービスの代金を受け取ったときに渡すもの。請求書や納品書に「代済」「領収」と書いたものも含みます
            </li>
            <li>
              <strong>不動産の売買契約書</strong>：土地・建物の売買契約書、売渡証書など
            </li>
            <li>
              <strong>工事の請負契約書</strong>：建物の建築・リフォーム・設備工事などの工事請負契約書、注文請書
            </li>
            <li>
              <strong>請負契約書（工事以外）</strong>：Web 制作・デザイン・システム開発・広告など、成果物を完成させて納める契約。
              「業務委託契約書」という名前でも、中身によって
              <strong>請負（第2号）</strong>・<strong>準委任</strong>（作業時間や期間に払う。印紙不要）・
              <strong>継続的取引の基本契約</strong>（第7号。1通 {formatYen(DAI7GO_TAX)}の場合あり）のどれにもなります。
              例：「LP を1枚 30万円で納品」は請負、「月 160 時間の開発支援」は準委任、「今後の個別発注に共通の条件を定める」は基本契約
            </li>
          </ul>
        </details>
      </div>

      {doc === 'ukeoi' && (
        <div className="field">
          <span className="field-label">成果物の完成に対して払う契約ですか？</span>
          <div style={{ display: 'grid', gap: 4 }}>
            <Radio name="ukeoi" value="kansei" current={ukeoiNature} onChange={setUkeoiNature}>
              はい（完成した成果物に対して払う）
            </Radio>
            <Radio name="ukeoi" value="jun-inin" current={ukeoiNature} onChange={setUkeoiNature}>
              いいえ（作業時間や期間に対して払う）
            </Radio>
            <Radio name="ukeoi" value="kihon" current={ukeoiNature} onChange={setUkeoiNature}>
              継続して取引する基本契約（個別の発注に共通の条件を定める）
            </Radio>
          </div>
        </div>
      )}

      {doc === 'ryoshusho' && (
        <div className="field">
          <span className="field-label">発行するのはだれ？</span>
          <div style={{ display: 'grid', gap: 4 }}>
            {ISSUERS.map((i) => (
              <Radio key={i} name="issuer" value={i} current={issuer} onChange={setIssuer}>
                {ISSUER_LABEL[i]}
              </Radio>
            ))}
          </div>
          <p className="hint">
            会社の領収書は、本業以外の取引でも「営業に関する」ものとして扱われます。公益法人・NPO 法人などは扱いが違うので
            <a href={SOURCES.eigyogai.url} target="_blank" rel="noopener noreferrer">
              国税庁 No.7125
            </a>
            を見てください。
          </p>
        </div>
      )}

      <div className="field">
        <span className="field-label">紙か電子か</span>
        <div style={{ display: 'grid', gap: 4 }}>
          <Radio name="medium" value="kami" current={medium} onChange={setMedium}>
            紙に印刷して渡す・郵送する
          </Radio>
          <Radio name="medium" value="denshi" current={medium} onChange={setMedium}>
            PDF・メール・電子契約サービスで交わす
          </Radio>
        </div>
        <p className="hint">
          電子で作っても、<strong>印刷して署名・押印したものを相手に渡す／FAX・メールで送ったあとに原本を郵送する</strong>
          場合は、紙の{isContract ? '契約書' : '領収書'}として印紙が要ります。
        </p>
      </div>

      {medium === 'kami' && (
        <>
          <div className="field">
            <span className="field-label">消費税の書き方</span>
            <div style={{ display: 'grid', gap: 4 }}>
              <Radio name="tax" value="komi" current={taxWriting} onChange={setTaxWriting}>
                税込金額だけ書く（「税込」「消費税10%を含む」も同じ）
              </Radio>
              <Radio name="tax" value="bunri" current={taxWriting} onChange={setTaxWriting}>
                税抜金額と消費税額を分けて書く（または税込金額と消費税額）
              </Radio>
            </div>
            <p className="hint">
              分けて書くと、消費税を除いた額で判定します（
              <a href={SOURCES.shohizei.url} target="_blank" rel="noopener noreferrer">
                国税庁 No.7124
              </a>
              ）。消費税の免税事業者は、分けて書いても税込の額で判定します。
            </p>
          </div>

          <div className="field">
            <label htmlFor="inshi-amount">
              {taxWriting === 'bunri' ? '税抜金額' : isContract ? '契約金額（税込）' : '受け取った金額（税込）'}（円）
            </label>
            <input
              id="inshi-amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amountText}
              disabled={noAmount}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={() => parsed !== undefined && !Number.isNaN(parsed) && track()}
              placeholder={isContract ? '30,000,000' : '50,000'}
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? 'inshi-amount-error' : undefined}
            />
            {amountInvalid && (
              <p id="inshi-amount-error" className="hint" style={{ color: 'var(--danger)' }}>
                金額は円の整数で入れてください（カンマはあってもかまいません）。
              </p>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={noAmount}
                onChange={(e) => setNoAmount(e.target.checked)}
                style={{ width: 'auto' }}
              />
              金額を書かない（記載なし）
            </label>
          </div>

          {isContract && (
            <div className="field-row">
              <div className="field">
                <label htmlFor="inshi-date">作成日（署名・交付した日。契約書に書いた日付ではなく、実際に作った日）</label>
                <input
                  id="inshi-date"
                  type="date"
                  min={MIN_DATE}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="inshi-copies">通数</label>
                <input
                  id="inshi-copies"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_COPIES}
                  step={1}
                  value={copiesText}
                  onChange={(e) => setCopiesText(e.target.value)}
                />
                <p className="hint">
                  2通作って双方が1通ずつ持つなら、2通それぞれに印紙が要ります。片方がコピーを持つなら1通分。
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <div aria-live="polite">
        {shown?.kind === 'taishogai' && (
          <div className="panel quiet">
            <p style={{ margin: 0, fontWeight: 700 }}>この計算機の対象外です</p>
            <p className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
              {shown.reason === 'kako'
                ? `${formatDate(MIN_DATE)}より前に作成した契約書は、いまと違う税額表でした。`
                : `準委任は第2号に当たりません。継続的取引の基本契約書（第7号）なら1通 ${formatYen(DAI7GO_TAX)}の場合があります。`}
              <a href={SOURCES.ichiran2.url} target="_blank" rel="noopener noreferrer">
                国税庁の印紙税額一覧表
              </a>
              で確かめてください。
            </p>
          </div>
        )}

        {shown?.kind === 'zero' && (
          <div className="panel">
            <div className="metric">
              <span className="label">貼る印紙</span>
              <span className="value">不要</span>
              <span className="unit">（0円）</span>
            </div>
          </div>
        )}

        {shown?.kind === 'tax' && (
          <div className="panel">
            <div className="metric">
              <span className="label">貼る印紙</span>
              <span className="value">
                {shown.copies > 1
                  ? `1通 ${formatYen(shown.perCopy)} × ${shown.copies}通＝合計 ${formatYen(shown.total)}`
                  : `1通 ${formatYen(shown.perCopy)}`}
              </span>
            </div>
            {shown.basis === 'keigen' && (
              <p style={{ margin: '6px 0 0' }}>
                軽減措置の額です。{formatDate(nextDay(shown.keigenTo!))}以降に作る契約書なら1通{' '}
                <strong>{formatYen(shown.honsokuPerCopy)}</strong>
                {TAIKO_STATUS === 'pending' && '（延長されなければ）'}。
              </p>
            )}
            {shown.keigenIfExtended !== null && TAIKO_STATUS === 'pending' && (
              <p style={{ margin: '6px 0 0' }}>
                軽減措置が延長されれば1通 <strong>{formatYen(shown.keigenIfExtended)}</strong>
                に戻ります（令和9年度税制改正で延長が要望されています）。
              </p>
            )}
            {shown.copies > 1 && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                片方がコピーを持つなら1通分（{formatYen(shown.perCopy)}）。
              </p>
            )}
            <p className="hint" style={{ margin: '6px 0 0' }}>
              貼り忘れると過怠税は1通 {formatYen(kataizei(shown.perCopy).kaihatsu)}
              （税務調査の前に自分から申し出れば {formatYen(kataizei(shown.perCopy).jishu)}）。
            </p>
          </div>
        )}

        {shown && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
              なぜこの額か（{DOC_GO[doc]}）
            </p>
            <ol className="hint" style={{ margin: 0, paddingLeft: '1.4em' }}>
              {shown.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        )}

        {!shown && !amountInvalid && (
          <p className="hint" style={{ marginBottom: 0 }}>
            金額を入れると、貼る印紙の額が出ます。
          </p>
        )}
      </div>
    </div>
  );
}
