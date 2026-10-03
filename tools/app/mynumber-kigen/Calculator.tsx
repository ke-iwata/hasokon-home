'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  CARD_BASIS,
  INPUT_ERROR_MESSAGES,
  calcMynumber,
  daysLeft,
  daysLeftLabel,
  expiryStatus,
  formatDate,
  formatJaWithWeekday,
  parseDate,
  validateInput,
  type ExpiryItem,
  type MynumberResult,
} from '@/lib/mynumber-kigen';

/** 既定値（仕様書の例）。「入れたら変わる」型にするため最初から結果を出す */
const DEFAULT_BIRTH = '1985-11-14';
const DEFAULT_CARD_EXPIRY = '2031-11-14';

const row = { margin: '4px 0 0', fontSize: 'var(--fs-sm)' };
const rowLabel = { textAlign: 'left' as const };
/** 320px 幅で横スクロールさせないため余白を詰める */
const tight = { padding: '6px 6px' };

/** 1枚分（電子証明書／カード本体）。期限日と残りを太字、更新できる日・通知書の目安・根拠を下に */
function ExpiryCard({
  title,
  item,
  basis,
  today,
  emphasize,
  children,
}: {
  title: string;
  item: ExpiryItem;
  basis: string;
  today: string | null;
  emphasize: boolean;
  children?: React.ReactNode;
}) {
  const n = today ? daysLeft(item.expiry, today) : null;
  return (
    <div className={emphasize ? 'panel' : 'panel quiet'}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{title}</div>
      <div className="metric">
        <span className="value" style={{ fontSize: 'clamp(1.15rem, 5.4vw, 1.6rem)' }}>
          {formatJaWithWeekday(item.expiry)}
        </span>
        <span className="label">
          まで
          {n !== null && (
            <>
              {' '}
              <strong style={n < 0 ? { color: 'var(--danger-fg)' } : undefined}>{daysLeftLabel(n)}</strong>
            </>
          )}
        </span>
      </div>
      <p style={row}>更新できる日：{formatJaWithWeekday(item.renewFrom)}から</p>
      <p style={row}>通知書の目安：{item.notice}</p>
      <p className="hint" style={{ margin: '4px 0 0' }}>
        根拠：{basis}
      </p>
      {item.closedBecause && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          期限日は{item.closedBecause}
          です。期限日が土日祝でも、期限はその日のままです（繰り下がりません）。窓口は開いていないので、前の平日までに。
        </p>
      )}
      {children}
    </div>
  );
}

/** 電子証明書の状態ごとの文面 */
function CertStatus({ r, today }: { r: MynumberResult; today: string }) {
  const status = expiryStatus(r.cert.expiry, today);
  if (status === 'expired') {
    const graceLeft = daysLeft(r.cert.hokenGraceEnd, today);
    return (
      <p className="note" role="alert" style={{ marginTop: 8 }}>
        <strong>電子証明書の有効期限を過ぎています。</strong>
        {graceLeft >= 0 ? (
          <>
            マイナ保険証は<strong>{formatJaWithWeekday(r.cert.hokenGraceEnd)}まで</strong>
            （満了日が属する月の末日から3か月間）は引き続き使えますが、保険資格の情報だけで、診療情報・薬剤情報の提供はできません。
          </>
        ) : (
          <>
            マイナ保険証の猶予（{formatJaWithWeekday(r.cert.hokenGraceEnd)}
            まで）も過ぎていて、マイナ保険証としては使えません。
            有効な健康保険証が無く再発行もしていない人には、資格確認書が交付されます。
          </>
        )}
        お住まいの市区町村の窓口で電子証明書の再発行の手続きを（オンラインではできません）。
      </p>
    );
  }
  if (status === 'renewable') {
    return (
      <p className="note" style={{ marginTop: 8 }}>
        いま更新できます。通知書が届いていなくても、カードを持って市区町村の窓口へ。
      </p>
    );
  }
  return null;
}

/** カード本体の状態ごとの文面 */
function CardStatus({ r, today }: { r: MynumberResult; today: string }) {
  const status = expiryStatus(r.card.expiry, today);
  if (status === 'expired') {
    return (
      <p className="note" role="alert" style={{ marginTop: 8 }}>
        <strong>カードの有効期限を過ぎています。</strong>本人確認書類として使えません。 市区町村の窓口で
        <strong>新しいカードを申請</strong>してください（有効期限による更新の手数料は無料。紛失などの場合は有料です）。
      </p>
    );
  }
  if (status === 'renewable') {
    return (
      <p className="note" style={{ marginTop: 8 }}>
        いま更新できます。通知書が届いていなくても、カードを持って市区町村の窓口へ。
      </p>
    );
  }
  return null;
}

/**
 * マイナンバーカード・電子証明書の有効期限チェッカーの UI。
 *
 * 入力の主は生年月日とカード表面の有効期限（交付日は印字されていない）。
 * 結果は縦に2枚（電子証明書・カード本体）。ロジックは lib/mynumber-kigen.ts。
 */
export default function Calculator() {
  const [birth, setBirth] = useState(DEFAULT_BIRTH);
  const [cardExpiry, setCardExpiry] = useState(DEFAULT_CARD_EXPIRY);
  const [issued, setIssued] = useState('');
  const [certRenewed, setCertRenewed] = useState('');
  const [today, setToday] = useState<string | null>(null);

  /** 残り日数の「今日」は開いた日。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setToday(formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }));
  }, []);

  const filled = parseDate(birth) !== null && parseDate(cardExpiry) !== null;
  const input = {
    birth,
    cardExpiry,
    issued: parseDate(issued) ? issued : undefined,
    certRenewed: parseDate(certRenewed) ? certRenewed : undefined,
  };
  // 「今日」が未確定の描画（静的書き出し）では、生年月日が未来かどうかを見ない
  const error = filled ? validateInput(input, today ?? '9999-12-31') : null;
  const r = filled && !error ? calcMynumber(input) : null;
  const certFirst = r ? r.cert.expiry <= r.card.expiry : true;

  const certCard = r && (
    <ExpiryCard
      key="cert"
      title={r.signatureCert ? '電子証明書（署名用・利用者証明用）' : '電子証明書（利用者証明用）'}
      item={r.cert}
      basis={
        r.cert.fromRenewal
          ? '電子証明書を更新した日から5回目の誕生日'
          : r.cls === 'adult'
            ? 'カード本体の期限の5年前の同じ誕生日（年齢にかかわらず交付から5回目の誕生日）'
            : 'カード本体と同じ日（交付から5回目の誕生日）'
      }
      today={today}
      emphasize={certFirst}
    >
      {!r.signatureCert && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          15歳未満で交付されたカードには、署名用電子証明書は原則付いていません（利用者証明用のみ）。
        </p>
      )}
      {today && <CertStatus r={r} today={today} />}
    </ExpiryCard>
  );
  const cardCard = r && (
    <ExpiryCard
      key="card"
      title="カード本体"
      item={r.card}
      basis={CARD_BASIS[r.cls]}
      today={today}
      emphasize={!certFirst}
    >
      {today && <CardStatus r={r} today={today} />}
    </ExpiryCard>
  );

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="mynumber-birth">生年月日</label>
        <input
          id="mynumber-birth"
          type="date"
          value={birth}
          max="2100-12-31"
          onChange={(e) => setBirth(e.target.value)}
          onBlur={() => trackToolUse('mynumber-kigen', 'birth')}
        />
      </div>
      <div className="field">
        <label htmlFor="mynumber-card-expiry">カード表面の「◯年◯月◯日まで有効」</label>
        <input
          id="mynumber-card-expiry"
          type="date"
          value={cardExpiry}
          max="2100-12-31"
          onChange={(e) => setCardExpiry(e.target.value)}
          onBlur={() => trackToolUse('mynumber-kigen', 'card-expiry')}
        />
      </div>
      <p className="hint">
        カード本体の有効期限は、カード表面（顔写真の面）に印字されています。交付日は印字されていないので、こちらを入れてください。
      </p>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>交付日・電子証明書を更新した日（分かる人向け）</summary>
        <div style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="mynumber-issued">カードの交付日</label>
            <input id="mynumber-issued" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mynumber-cert-renewed">電子証明書を更新した日</label>
            <input
              id="mynumber-cert-renewed"
              type="date"
              value={certRenewed}
              onChange={(e) => setCertRenewed(e.target.value)}
              onBlur={() => trackToolUse('mynumber-kigen', 'cert-renewed')}
            />
          </div>
        </div>
        <p className="hint">
          電子証明書だけを途中で更新した人は、その日から5回目の誕生日で電子証明書の期限を出し直します。
        </p>
      </details>

      {error ? (
        <p className="note" role="alert">
          {INPUT_ERROR_MESSAGES[error]}
        </p>
      ) : !r ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            生年月日とカード表面の有効期限を入れると、電子証明書とカード本体の期限・更新できる日が出ます。
          </p>
        </div>
      ) : (
        <>
          {certFirst ? [certCard, cardCard] : [cardCard, certCard]}
          {r.issueMismatch && (
            <p className="hint">交付日から数えた期限が券面の印字と合いません。券面の印字を優先しています。</p>
          )}
          {r.notBirthday && (
            <p className="hint">
              カードの有効期限は誕生日の日付になるはずです。生年月日とカード表面の日付をもう一度確かめてください。
            </p>
          )}
          {r.leapDayBirth && (
            <p className="hint">
              2月29日生まれの方は、うるう年でない年の期限が2月28日か3月1日かを法令の原文で確かめられていません。ここでは3月1日として出しています。カード表面の印字を優先してください。
            </p>
          )}
        </>
      )}

      <h2>期限が切れると止まるもの</h2>
      <table>
        <thead>
          <tr>
            <th style={{ ...tight, ...rowLabel }}>切れるもの</th>
            <th style={{ ...tight, ...rowLabel }}>使えなくなるもの</th>
            <th style={{ ...tight, ...rowLabel }}>猶予</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...tight, ...rowLabel }}>電子証明書</td>
            <td style={{ ...tight, ...rowLabel }}>
              マイナ保険証・コンビニ交付・e-Tax 等のオンライン申請・マイナポータル・民間の本人確認
            </td>
            <td style={{ ...tight, ...rowLabel }}>マイナ保険証だけ、満了日が属する月の末日から3か月</td>
          </tr>
          <tr>
            <td style={{ ...tight, ...rowLabel }}>カード本体</td>
            <td style={{ ...tight, ...rowLabel }}>本人確認書類としての利用・上のすべて</td>
            <td style={{ ...tight, ...rowLabel }}>なし</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        更新の持ち物は、マイナンバーカード・有効期限通知書（届いていれば）・暗証番号です。暗証番号を忘れたら窓口で再設定できます。
        有効期限による更新の手数料は無料です。
      </p>
    </div>
  );
}
