import { describe, expect, it } from 'vitest';
import { toHebonRomaji, toHiragana } from '@/lib/hebon-romaji';

describe('toHebonRomaji（長音）', () => {
  it('さいとう → SAITO（お段+う の U は表記しない）', () => {
    const r = toHebonRomaji('さいとう');
    expect(r.ok).toBe(true);
    expect(r.romaji).toBe('SAITO');
  });

  it('おおの → ONO、OH表記は OHNO', () => {
    const r = toHebonRomaji('おおの');
    expect(r.ok).toBe(true);
    expect(r.romaji).toBe('ONO');
    expect(r.ohRomaji).toBe('OHNO');
  });

  it('ゆうき → YUKI（うう の U は表記しない）', () => {
    const r = toHebonRomaji('ゆうき');
    expect(r.romaji).toBe('YUKI');
    expect(r.ohRomaji).toBeNull();
  });

  it('にいがた → NIIGATA（いい はそのまま）', () => {
    expect(toHebonRomaji('にいがた').romaji).toBe('NIIGATA');
  });

  it('えいた → EITA（えい はそのまま）', () => {
    expect(toHebonRomaji('えいた').romaji).toBe('EITA');
  });
});

describe('toHebonRomaji（撥音「ん」）', () => {
  it('しんばし → SHIMBASHI（B の前は M）', () => {
    expect(toHebonRomaji('しんばし').romaji).toBe('SHIMBASHI');
  });

  it('ほんま → HOMMA（M の前は M）', () => {
    expect(toHebonRomaji('ほんま').romaji).toBe('HOMMA');
  });

  it('なんば → NAMBA', () => {
    expect(toHebonRomaji('なんば').romaji).toBe('NAMBA');
  });

  it('けんいち → KENICHI（母音の前でも N のまま）', () => {
    expect(toHebonRomaji('けんいち').romaji).toBe('KENICHI');
  });

  it('じゅんいちろう → JUNICHIRO（拗音+ん+長音の複合）', () => {
    const r = toHebonRomaji('じゅんいちろう');
    expect(r.romaji).toBe('JUNICHIRO');
    expect(r.ohRomaji).toBe('JUNICHIROH');
  });
});

describe('toHebonRomaji（促音「っ」）', () => {
  it('はっとり → HATTORI（子音を重ねる）', () => {
    expect(toHebonRomaji('はっとり').romaji).toBe('HATTORI');
  });

  it('はっちょう → HATCHO（CH音の前は T）', () => {
    expect(toHebonRomaji('はっちょう').romaji).toBe('HATCHO');
  });
});

describe('toHebonRomaji（拗音）', () => {
  it('きょうこ → KYOKO、OH表記は KYOHKO', () => {
    const r = toHebonRomaji('きょうこ');
    expect(r.romaji).toBe('KYOKO');
    expect(r.ohRomaji).toBe('KYOHKO');
  });

  it('しゃち → SHACHI', () => {
    expect(toHebonRomaji('しゃち').romaji).toBe('SHACHI');
  });
});

describe('toHebonRomaji（カタカナ・エラー）', () => {
  it('カタカナ入力（サイトウ）も変換できる', () => {
    expect(toHebonRomaji('サイトウ').romaji).toBe('SAITO');
  });

  it('カタカナの長音符（ユーキ → YUKI）も処理できる', () => {
    expect(toHebonRomaji('ユーキ').romaji).toBe('YUKI');
  });

  it('toHiragana はカタカナをひらがなに変換する', () => {
    expect(toHiragana('サイトウ')).toBe('さいとう');
  });

  it('漢字が含まれるとエラーになる', () => {
    const r = toHebonRomaji('斎藤');
    expect(r.ok).toBe(false);
    expect(r.romaji).toBe('');
    expect(r.error).toContain('変換できない文字');
    expect(r.error).toContain('斎');
  });

  it('空文字はエラーになる', () => {
    const r = toHebonRomaji('  ');
    expect(r.ok).toBe(false);
    expect(r.error).not.toBeNull();
  });
});
