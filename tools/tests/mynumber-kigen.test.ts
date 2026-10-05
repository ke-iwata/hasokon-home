import { describe, expect, it } from 'vitest';
import { addDays, parseDate, type DateParts } from '@/lib/date-parts';
import { ageAt } from '@/lib/nenrei';
import {
  calcMynumber,
  cardExpiryFromIssue,
  certExpiryFromCard,
  certExpiryFromIssue,
  certMaybeRenewed,
  classifyByExpiry,
  closedDayReason,
  daysLeftLabel,
  expiryStatus,
  formatJaWithWeekday,
  hokenGraceEnd,
  isBirthdayDate,
  isLegacyMinorIssue,
  noticeWindow,
  nthBirthday,
  renewFrom,
  signatureCertIssued,
  validateInput,
} from '@/lib/mynumber-kigen';

const d = (ymd: string): DateParts => parseDate(ymd) as DateParts;

describe('classifyByExpiry（券面の期限の日の年齢で区分を決める・仕様書の表の5行）', () => {
  it('28歳以上 → 18歳以上で交付（10回目）', () => {
    expect(classifyByExpiry('1990-05-10', '2031-05-10')).toBe('adult');
    expect(classifyByExpiry('2003-05-10', '2031-05-10')).toBe('adult'); // ちょうど28歳
  });

  it('23〜24歳で期限−5年が2022-03-31以前 → 旧ルールの20歳未満（5回目）', () => {
    expect(classifyByExpiry('2003-06-01', '2026-06-01')).toBe('legacyMinor'); // 23歳
    expect(classifyByExpiry('2002-03-01', '2026-03-01')).toBe('legacyMinor'); // 24歳
  });

  it('23〜24歳でも期限−5年が2022-04-01以降なら入力エラー', () => {
    expect(classifyByExpiry('2004-06-01', '2028-06-01')).toBe('invalid'); // 24歳・期限−5年は2023-06-01
  });

  it('20〜22歳 → 15〜17歳で交付（5回目）', () => {
    expect(classifyByExpiry('2008-06-01', '2029-06-01')).toBe('minor');
  });

  it('〜19歳 → 15歳未満で交付。署名用電子証明書は原則なし', () => {
    expect(classifyByExpiry('2015-06-01', '2033-06-01')).toBe('under15');
    expect(signatureCertIssued('2015-06-01', '2033-06-01')).toBe(false);
    expect(signatureCertIssued('2008-06-01', '2029-06-01')).toBe(true);
  });

  it('25〜27歳はどのカードにもならない（入力エラー）', () => {
    expect(classifyByExpiry('2000-06-01', '2026-06-01')).toBe('invalid'); // 26歳
    expect(classifyByExpiry('2001-06-01', '2026-06-01')).toBe('invalid'); // 25歳
    expect(classifyByExpiry('1999-06-01', '2026-06-01')).toBe('invalid'); // 27歳
  });
});

describe('certExpiryFromCard（券面の期限から電子証明書の期限）', () => {
  it('18歳以上で交付ならカードの5年前の同じ誕生日', () => {
    expect(certExpiryFromCard('1985-11-14', '2031-11-14')).toBe('2026-11-14');
  });

  it('18歳未満・旧ルールの交付はカードと同じ日', () => {
    expect(certExpiryFromCard('2003-06-01', '2026-06-01')).toBe('2026-06-01');
    expect(certExpiryFromCard('2008-06-01', '2029-06-01')).toBe('2029-06-01');
    expect(certExpiryFromCard('2015-06-01', '2033-06-01')).toBe('2033-06-01');
  });

  it('入力エラーの組み合わせは null', () => {
    expect(certExpiryFromCard('2000-06-01', '2026-06-01')).toBeNull();
  });

  it('2月29日生まれは ageAt() の流儀と一致する（その日に年齢が1つ増える）', () => {
    // 期待値の日付そのものは施行令の確定後に書く（仕様書「テスト」）。ここでは流儀の一致だけを見る
    const birth = '2000-02-29';
    for (const card of ['2032-02-29', '2033-03-01', '2033-02-28']) {
      const cert = certExpiryFromCard(birth, card) as string;
      const b = d(birth);
      expect(ageAt(b, d(cert))).toBe(ageAt(b, addDays(d(cert), -1)) + 1);
    }
  });
});

describe('交付日から（分かる人向けの突き合わせ）', () => {
  it('18歳以上で交付 → カードは10回目、電子証明書は5回目の誕生日', () => {
    expect(cardExpiryFromIssue('1990-05-10', '2021-05-20', false)).toBe('2031-05-10');
    expect(certExpiryFromIssue('1990-05-10', '2021-05-20')).toBe('2026-05-10');
  });

  it('18歳未満で交付 → カードも5回目', () => {
    expect(cardExpiryFromIssue('2010-08-01', '2025-09-01', false)).toBe('2030-08-01');
  });

  it('18歳の境目は ageAt() と同じ（誕生日当日の交付は18歳で10回目、前日は17歳で5回目）', () => {
    const birth = '2005-07-01';
    expect(ageAt(d(birth), d('2023-07-01'))).toBe(18);
    expect(cardExpiryFromIssue(birth, '2023-07-01', false)).toBe('2033-07-01');
    expect(ageAt(d(birth), d('2023-06-30'))).toBe(17);
    // 翌日の誕生日が1回目になるので、5回目は2027年
    expect(cardExpiryFromIssue(birth, '2023-06-30', false)).toBe('2027-07-01');
  });

  it('交付日が誕生日の当日なら、その日は1回目に数えない', () => {
    expect(nthBirthday(d('1990-05-10'), d('2021-05-10'), 1)).toEqual(d('2022-05-10'));
    expect(nthBirthday(d('1990-05-10'), d('2021-05-09'), 1)).toEqual(d('2021-05-10'));
  });

  it('旧ルール：2022-03-31以前に19歳で交付 → 5回目。2022-04-01以降の19歳 → 10回目', () => {
    const birth = '2003-01-01';
    expect(isLegacyMinorIssue(birth, '2022-03-01')).toBe(true);
    expect(cardExpiryFromIssue(birth, '2022-03-01', true)).toBe('2027-01-01');
    expect(isLegacyMinorIssue(birth, '2022-04-10')).toBe(false);
    expect(cardExpiryFromIssue(birth, '2022-04-10', false)).toBe('2032-01-01');
  });

  it('券面の期限から出した区分と、交付日から出した期限が噛み合う', () => {
    const birth = '2003-01-01';
    expect(classifyByExpiry(birth, cardExpiryFromIssue(birth, '2022-03-01', true))).toBe('legacyMinor');
    expect(classifyByExpiry(birth, cardExpiryFromIssue(birth, '2022-04-10', false))).toBe('adult');
  });
});

describe('更新・通知書・マイナ保険証の猶予', () => {
  it('更新できるのは3か月前の応当日から（応当日が無い月は末日）', () => {
    expect(renewFrom('2026-11-14')).toBe('2026-08-14');
    expect(renewFrom('2027-05-31')).toBe('2027-02-28');
  });

  it('通知書の目安は期限の3〜2か月前の月', () => {
    expect(noticeWindow('2026-11-14')).toBe('2026年8〜9月');
    expect(noticeWindow('2027-02-10')).toBe('2026年11〜12月');
    expect(noticeWindow('2027-03-10')).toBe('2026年12月〜2027年1月');
  });

  it('マイナ保険証は「満了日が属する月の末日から3か月間」（厚労省）', () => {
    expect(hokenGraceEnd('2026-11-14')).toBe('2027-02-28');
    expect(hokenGraceEnd('2026-01-31')).toBe('2026-04-30');
    expect(hokenGraceEnd('2027-11-01')).toBe('2028-02-29');
  });

  it('状態：期限前／更新できる期間／期限切れ', () => {
    expect(expiryStatus('2026-11-14', '2026-08-13')).toBe('ok');
    expect(expiryStatus('2026-11-14', '2026-08-14')).toBe('renewable');
    expect(expiryStatus('2026-11-14', '2026-11-14')).toBe('renewable');
    expect(expiryStatus('2026-11-14', '2026-11-15')).toBe('expired');
  });

  it('期限日が土日祝なら理由を返す（期限は繰り下げない）', () => {
    expect(closedDayReason('2026-11-14')).toBe('土曜');
    expect(closedDayReason('2026-11-03')).toBe('文化の日');
    expect(closedDayReason('2026-11-16')).toBeNull();
    expect(closedDayReason('2031-11-16')).toBe('日曜'); // 祝日データの範囲外は土日だけ
  });
});

describe('入力の検査とまとめ', () => {
  const today = '2026-10-03';

  it('矛盾した入力はエラー', () => {
    expect(validateInput({ birth: '2027-01-01', cardExpiry: '2037-01-01' }, today)).toBe('birth-future');
    expect(validateInput({ birth: '1990-05-10', cardExpiry: '1980-05-10' }, today)).toBe('expiry-before-birth');
    expect(validateInput({ birth: '2000-06-01', cardExpiry: '2026-06-01' }, today)).toBe('invalid-band');
    expect(validateInput({ birth: '1990-05-10', cardExpiry: '2031-05-10' }, today)).toBeNull();
  });

  it('券面の期限が誕生日でなければ注記の印を立てる', () => {
    expect(isBirthdayDate('1990-05-10', '2031-05-10')).toBe(true);
    expect(isBirthdayDate('1990-05-10', '2031-05-11')).toBe(false);
    expect(isBirthdayDate('2000-02-29', '2033-02-28')).toBe(true);
    expect(isBirthdayDate('2000-02-29', '2033-03-01')).toBe(true);
  });

  it('calcMynumber：券面だけから2枚分', () => {
    const r = calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14' })!;
    expect(r.cls).toBe('adult');
    expect(r.cert.expiry).toBe('2026-11-14');
    expect(r.cert.renewFrom).toBe('2026-08-14');
    expect(r.cert.notice).toBe('2026年8〜9月');
    expect(r.cert.hokenGraceEnd).toBe('2027-02-28');
    expect(r.cert.closedBecause).toBe('土曜');
    expect(r.card.expiry).toBe('2031-11-14');
    expect(r.signatureCert).toBe(true);
    expect(r.issueMismatch).toBe(false);
  });

  it('calcMynumber：電子証明書を途中で更新した日があれば、そこから5回目で出し直す', () => {
    const r = calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14', certRenewed: '2026-09-01' })!;
    expect(r.cert.fromRenewal).toBe(true);
    // 期限前の更新は、直後の誕生日（2026-11-14）が1回目になる
    expect(r.cert.expiry).toBe('2030-11-14');
    expect(calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14', certRenewed: '2026-11-20' })!.cert.expiry).toBe(
      '2031-11-14'
    );
  });

  it('calcMynumber：交付日から出した期限が券面と食い違えば印を立てる（券面を優先）', () => {
    expect(calcMynumber({ birth: '1990-05-10', cardExpiry: '2031-05-10', issued: '2021-05-20' })!.issueMismatch).toBe(false);
    expect(calcMynumber({ birth: '1990-05-10', cardExpiry: '2031-05-10', issued: '2020-05-20' })!.issueMismatch).toBe(true);
  });

  it('calcMynumber：入力エラーの組み合わせは null', () => {
    expect(calcMynumber({ birth: '2000-06-01', cardExpiry: '2026-06-01' })).toBeNull();
  });

  it('表示の部品', () => {
    expect(formatJaWithWeekday('2026-11-14')).toBe('2026年11月14日（土）');
    expect(daysLeftLabel(1868)).toBe('あと1,868日');
    expect(daysLeftLabel(0)).toBe('今日が期限');
    expect(daysLeftLabel(-3)).toBe('3日過ぎています');
  });
});

describe('#333 レビューの指摘', () => {
  it('必須1：券面から数えた電子証明書が切れていてカードが有効なら「更新済みかも」の印を立てる（断定しない）', () => {
    const r = calcMynumber({ birth: '1980-07-01', cardExpiry: '2027-07-01' })!;
    expect(r.cert.expiry).toBe('2022-07-01');
    expect(certMaybeRenewed(r, '2026-10-03')).toBe(true);
    // 更新した日を入れたら印は立たない
    const renewed = calcMynumber({ birth: '1980-07-01', cardExpiry: '2027-07-01', certRenewed: '2022-07-15' })!;
    expect(renewed.cert.expiry).toBe('2027-07-01');
    expect(certMaybeRenewed(renewed, '2026-10-03')).toBe(false);
    // まだ切れていない・カード本体も切れているときは立たない
    expect(certMaybeRenewed(calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14' })!, '2026-10-03')).toBe(false);
    expect(certMaybeRenewed(calcMynumber({ birth: '1980-07-01', cardExpiry: '2026-07-01' })!, '2026-10-03')).toBe(false);
  });

  it('必須2：更新後の電子証明書の期限はカード本体の期限を超えない', () => {
    const r = calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14', certRenewed: '2027-12-01' })!;
    expect(r.cert.expiry).toBe('2031-11-14');
    expect(r.cert.cappedByCard).toBe(true);
    const ok = calcMynumber({ birth: '1985-11-14', cardExpiry: '2031-11-14', certRenewed: '2026-11-20' })!;
    expect(ok.cert.cappedByCard).toBe(false);
  });

  it('推奨1：旧ルールの境目は申請から交付までの遅れを見込む（2022-03申請・2022-05交付・4月に誕生日）', () => {
    expect(classifyByExpiry('2003-04-15', '2027-04-15')).toBe('legacyMinor');
    expect(classifyByExpiry('2003-09-30', '2027-09-30')).toBe('legacyMinor'); // 期限−5年がちょうど 2022-09-30
    expect(classifyByExpiry('2003-10-01', '2027-10-01')).toBe('invalid'); // 期限−5年が 2022-10-01
  });

  it('推奨4：電子証明書を更新した日が今日より後・カードの期限より後ならエラー', () => {
    const base = { birth: '1985-11-14', cardExpiry: '2031-11-14' };
    expect(validateInput({ ...base, certRenewed: '2026-10-04' }, '2026-10-03')).toBe('renewed-future');
    expect(validateInput({ ...base, certRenewed: '2031-11-15' }, '2031-12-01')).toBe('renewed-after-card');
    expect(validateInput({ ...base, certRenewed: '2026-10-03' }, '2026-10-03')).toBeNull();
  });
});
