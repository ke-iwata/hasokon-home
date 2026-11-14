'use client';

import { useEffect, useRef, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { toWareki } from '@/lib/nenrei';
import {
  INPUT_ERROR_MESSAGES,
  LAPSE_UNAVOIDABLE_YEARS,
  OFFICIAL_NOTICE,
  calcMenkyo,
  formatDate,
  formatJaWithWeekday,
  lapseStatus,
  parseCardDate,
  parseDate,
  renewalStatus,
  validateInput,
  upcomingExpiry,
  windowHeading,
  type LicenseTerm,
  type MenkyoResult,
} from '@/lib/menkyo-koshin';

/**
 * 既定値（仕様書の例：警察の案内「9/27 生まれ → 8/27〜10/27」）。開いた瞬間に結果を出す。
 * 有効期限はマウント後に「今日以降で最初の 10/27」に置き換える（固定の日付だと、日がたつと
 * 開いた瞬間に「期限を過ぎています」が出る。#503 レビュー必須1）。下の値は静的書き出し用
 */
const DEFAULT_BIRTH = '1980-09-27';
const DEFAULT_EXPIRY = '2027-10-27';

const row = { margin: '4px 0 0', fontSize: 'var(--fs-sm)' };

function StatusLine({ r, today }: { r: MenkyoResult; today: string }) {
  const s = renewalStatus(r.window, parseDate(today)!);
  if (s.kind === 'before') {
    return (
      <p style={row}>
        更新期間まで
        <strong>あと{s.daysUntilStart.toLocaleString('ja-JP')}日</strong>
      </p>
    );
  }
  if (s.kind === 'during') {
    return (
      <p style={row}>
        <strong>いま更新期間中です</strong>（
        {s.daysLeft === 0 ? '今日が最終日' : `残り${s.daysLeft.toLocaleString('ja-JP')}日`}）
      </p>
    );
  }
  return (
    <p style={{ ...row, color: 'var(--danger-fg)' }}>
      <strong>期限を過ぎています</strong>（失効から
      {s.daysSinceLapse.toLocaleString('ja-JP')}日）
    </p>
  );
}

/**
 * 運転免許の更新期間 計算機の UI。ロジックは lib/menkyo-koshin.ts。
 *
 * 日付の入力は mynumber-kigen と同じ `<input type="date">`。券面の和暦をそのまま打ちたい人のために、
 * 有効期限には「令和8年12月29日」の形も受ける欄を添える（仕様書「確かめること」）
 */
export default function Calculator() {
  const [birth, setBirth] = useState(DEFAULT_BIRTH);
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY);
  const [wareki, setWareki] = useState('');
  const [renewalYear, setRenewalYear] = useState('');
  const [term, setTerm] = useState<LicenseTerm>('five');
  const [today, setToday] = useState<string | null>(null);
  const seniorSent = useRef(false);
  const calcSent = useRef(false);

  /** 計算した、は1回の訪問で1回だけ数える（欄を移るたびに数えない） */
  const trackCalc = () => {
    if (calcSent.current) return;
    calcSent.current = true;
    trackToolUse('menkyo-koshin', 'calc');
  };

  /** 「今日」は開いた日。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    const t = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
    setToday(formatDate(t));
    // まだ触られていない既定値だけを、今日以降の例に置き換える
    setExpiry((cur) => (cur === DEFAULT_EXPIRY ? formatDate(upcomingExpiry(parseDate(DEFAULT_BIRTH)!, t)) : cur));
  }, []);

  const birthParts = parseDate(birth);
  const expiryParts = parseDate(expiry);
  const yearNum = Number(renewalYear);
  const useEstimate = !expiryParts && Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2100;
  const input = {
    birth,
    expiry: expiryParts ? expiry : undefined,
    renewalYear: useEstimate ? yearNum : undefined,
    term,
  };
  const r = birthParts ? calcMenkyo(input) : null;
  // 「今日」が未確定の描画（静的書き出し）では、生年月日が未来かどうかを見ない
  const error = r && birthParts ? validateInput(birthParts, r.window.expiry, parseDate(today ?? '9999-12-31')!) : null;
  const ok = r && !error ? r : null;
  const showSenior = Boolean(ok && ok.senior.lecture);

  useEffect(() => {
    if (showSenior && !seniorSent.current) {
      seniorSent.current = true;
      trackToolUse('menkyo-koshin', 'senior-shown');
    }
  }, [showSenior]);

  const expiryWareki = expiryParts ? toWareki(expiryParts)?.label : null;
  const expired = ok && today ? renewalStatus(ok.window, parseDate(today)!).kind === 'expired' : false;
  const lapse = ok && today && expired ? lapseStatus(ok.lapse, parseDate(today)!) : null;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="menkyo-birth">生年月日</label>
        <input
          id="menkyo-birth"
          type="date"
          value={birth}
          max="2100-12-31"
          onChange={(e) => setBirth(e.target.value)}
          onBlur={trackCalc}
        />
      </div>
      <div className="field">
        <label htmlFor="menkyo-expiry">免許証の有効期限（券面の「○年○月○日まで」）</label>
        <input
          id="menkyo-expiry"
          type="date"
          value={expiry}
          max="2100-12-31"
          onChange={(e) => {
            setExpiry(e.target.value);
            setWareki('');
          }}
          onBlur={trackCalc}
        />
        {expiryWareki && (
          <p className="hint" style={{ margin: '4px 0 0' }}>
            ＝{expiryWareki}まで
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="menkyo-wareki">券面の和暦のまま入れる（任意）</label>
        <input
          id="menkyo-wareki"
          type="text"
          inputMode="text"
          placeholder="例：令和8年12月29日"
          value={wareki}
          onChange={(e) => {
            setWareki(e.target.value);
            const p = parseCardDate(e.target.value);
            if (p) setExpiry(formatDate(p));
          }}
          onBlur={trackCalc}
        />
        {wareki && !parseCardDate(wareki) && (
          <p className="hint" style={{ margin: '4px 0 0' }}>
            「令和8年12月29日」「R8.12.29」の形で入れてください。
          </p>
        )}
      </div>
      <p className="hint">
        マイナ免許証だけの人は、マイナポータルの「運転免許情報」や免許情報の読み取りアプリに出る有効期限の日付を入れてください（数え方は免許証と同じです）。
      </p>

      <details
        className="field"
        open={(!expiryParts && renewalYear !== '') || undefined}
        onToggle={(e) => {
          // 開いたら有効期限の欄を空にして、更新の年だけで推定できるようにする
          if (e.currentTarget.open) {
            setExpiry('');
            setWareki('');
          }
        }}
      >
        <summary style={{ cursor: 'pointer' }}>券面の日付が分からない人（更新の年だけで推定）</summary>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="menkyo-year">次の誕生日の年（＝更新の年）</label>
          <input
            id="menkyo-year"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2100}
            placeholder="例：2027"
            value={renewalYear}
            onChange={(e) => setRenewalYear(e.target.value)}
          />
        </div>
        <p className="hint">
          ここを開くと上の有効期限の欄は空になります。誕生日の翌月の同じ日を有効期限とみなします。券面の日付と違ったら券面を入れてください。
        </p>
      </details>

      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>
          いまの免許の有効期間（次の期限の見込みにだけ使います）
        </legend>
        <div style={{ display: 'grid', gap: 4, fontSize: 'var(--fs-sm)' }}>
          {(
            [
              ['five', '5年（ゴールド・ブルー5年）'],
              ['three', '3年（ブルー3年・グリーン＝初回）'],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              style={{
                fontWeight: 400,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <input
                type="radio"
                name="menkyo-term"
                checked={term === v}
                onChange={() => setTerm(v)}
                style={{ width: 'auto' }}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          次の更新までに違反をすると変わります。優良運転者（ゴールド）になるかの判定はしていません。
        </p>
      </fieldset>

      {error ? (
        <p className="note" role="alert">
          {INPUT_ERROR_MESSAGES[error]}
        </p>
      ) : !ok ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            生年月日と免許証の有効期限（または更新の年）を入れると、更新できる期間と最終日が出ます。
          </p>
        </div>
      ) : (
        <>
          <div className="panel">
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{windowHeading(ok.estimated)}</div>
            <div className="metric">
              <span className="value" style={{ fontSize: 'clamp(1.05rem, 5vw, 1.5rem)' }}>
                {formatJaWithWeekday(ok.window.start)}〜{formatJaWithWeekday(ok.window.legalEnd)}
              </span>
            </div>
            {ok.window.extended && (
              <p style={row}>
                本来の期限は{formatJaWithWeekday(ok.window.expiry)}（{ok.window.extendedReasons[0]}）。法律上は
                <strong>{formatJaWithWeekday(ok.window.legalEnd)}まで</strong>
                延びます。ただし延長日に窓口が開いているかは住所地の警察で確認を。
              </p>
            )}
            {ok.window.holidayTableOutOfRange && (
              <p className="hint" style={{ margin: '4px 0 0' }}>
                この年の祝日はまだ反映していません。最終日が祝日なら、さらに翌日に延びます。
              </p>
            )}
            {today && <StatusLine r={ok} today={today} />}
          </div>
          <p className="hint" style={{ fontWeight: 700 }}>
            {OFFICIAL_NOTICE}
          </p>

          {ok.senior.lecture && (
            <div className="panel">
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
                {ok.senior.cognitive ? '高齢者講習・認知機能検査' : '高齢者講習'}
                （満了日に{ok.senior.ageAtEnd}歳）
              </div>
              <p style={row}>
                受けられる期間：
                <strong>
                  {formatJaWithWeekday(ok.senior.from)}ごろ〜
                  {formatJaWithWeekday(ok.senior.to)}
                </strong>
                （更新期間が満了する日前6か月以内）
              </p>
              {ok.senior.cognitive && (
                <p style={row}>75歳以上なので、高齢者講習の前に認知機能検査も受けます（同じ期間）。</p>
              )}
              <p className="hint" style={{ margin: '4px 0 0' }}>
                一定の違反歴がある75歳以上の人は運転技能検査も要ります（ここでは判定しません。通知のはがきに書かれます）。
                通知はおおむね満了日の6か月前ごろに届きます。予約が数か月先まで埋まる地域があるので、届いたら早めに予約を。
              </p>
            </div>
          )}

          {!expired && (
            <div className="panel quiet">
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
                次の有効期限の見込み（この期間内に更新したとき）
              </div>
              <div className="metric">
                <span className="value" style={{ fontSize: 'clamp(1.05rem, 5vw, 1.4rem)' }}>
                  {formatJaWithWeekday(ok.next.date)}
                </span>
                <span className="label">まで（{ok.next.birthdays}回目の誕生日の1か月後）</span>
              </div>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                更新日の年齢は誕生日の前日で数えるので（{ok.next.ageAtRenewal}
                歳）、誕生日の前に更新しても後に更新しても同じ日です。
                その日が土日・祝日・年末年始なら翌日まで延びます（祝日はその年に決まってから確定）。
                {term === 'three' && '初回更新の人は、次の更新までに違反がなければ次は5年になります。'}
                ゴールドになるかは更新時点の違反歴で決まります。
              </p>
            </div>
          )}

          {lapse && (
            <p className="note" role="alert">
              <strong>失効中に運転すると無免許運転です。</strong>
              {formatJaWithWeekday(ok.lapse.lapsedOn)}に失効しています。
              {lapse === 'within6m' ? (
                <>
                  <strong>{formatJaWithWeekday(ok.lapse.deadline)}まで</strong>
                  （失効から6か月）なら、学科・技能試験の免除を受けて取り直せます。住所地の運転免許センターへ。
                </>
              ) : lapse === 'within3y' ? (
                <>
                  6か月の免除期限（{formatJaWithWeekday(ok.lapse.deadline)}
                  ）を過ぎています。 海外旅行・災害・入院などやむを得ない理由があった場合に限り、
                  {formatJaWithWeekday(ok.lapse.unavoidableDeadline)}
                  まで（失効から{LAPSE_UNAVOIDABLE_YEARS}
                  年以内）で、その事情がやんでから1か月以内なら免除を受けられます。それ以外は新たに免許を取り直す必要があります。住所地の運転免許センターへ。
                </>
              ) : (
                <>
                  6か月の免除期限（{formatJaWithWeekday(ok.lapse.deadline)}
                  ）も、やむを得ない理由があった場合の
                  {LAPSE_UNAVOIDABLE_YEARS}年の上限（
                  {formatJaWithWeekday(ok.lapse.unavoidableDeadline)}
                  ）も過ぎています。新たに免許を取り直す必要があります。住所地の運転免許センターへ。
                </>
              )}
            </p>
          )}

          {ok.irregularExpiry && (
            <p className="hint">
              有効期限はふつう誕生日の1か月後の日です。券面の日付をもう一度確かめてください（券面の日付を正として計算しています）。
            </p>
          )}
          {ok.leapDayBirth && (
            <p className="hint">
              2月29日生まれの方は、うるう年でない年は2月28日を誕生日とみなします（道路交通法第101条2項）。
            </p>
          )}
          <p className="hint">
            海外赴任・出産・入院などで期間内に行けないときは、更新期間の前でも更新できます（特例更新）。その場合、次の期限は短くなることがあります。
          </p>
        </>
      )}
    </div>
  );
}
