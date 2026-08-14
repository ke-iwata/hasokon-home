import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DAKUON_TABLE,
  hebonOf,
  SEION_TABLE,
  toHebonRomaji,
  toHiragana,
  YOON_TABLE,
} from '@/lib/hebon-romaji';

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

describe('一覧表（SEION_TABLE / DAKUON_TABLE / YOON_TABLE）', () => {
  const allTables = [...SEION_TABLE, ...DAKUON_TABLE, ...YOON_TABLE];
  const allCells = allTables.flatMap((row) => row.cells).filter((c) => c !== null);

  it('清音は10行×5マス、濁音・半濁音は5行×5マス、拗音は12行×3マス', () => {
    expect(SEION_TABLE).toHaveLength(10);
    expect(SEION_TABLE.every((r) => r.cells.length === 5)).toBe(true);
    expect(DAKUON_TABLE).toHaveLength(5);
    expect(DAKUON_TABLE.every((r) => r.cells.length === 5)).toBe(true);
    expect(YOON_TABLE).toHaveLength(12);
    expect(YOON_TABLE.every((r) => r.cells.length === 3)).toBe(true);
  });

  it('存在しない音（や行のい・え、わ行のい・う・え）だけが空マスになる', () => {
    const blanks = SEION_TABLE.flatMap((row) =>
      row.cells.map((c, i) => (c === null ? `${row.label}${i}` : null)),
    ).filter((v) => v !== null);
    expect(blanks).toEqual(['や行1', 'や行3', 'わ行1', 'わ行2', 'わ行3']);
    expect(DAKUON_TABLE.flatMap((r) => r.cells).every((c) => c !== null)).toBe(true);
    expect(YOON_TABLE.flatMap((r) => r.cells).every((c) => c !== null)).toBe(true);
  });

  it('表のローマ字は変換ロジックの結果と一致する（二重管理していない）', () => {
    for (const cell of allCells) {
      expect(toHebonRomaji(cell.kana).romaji).toBe(cell.romaji);
    }
  });

  it('すべて大文字で、かなの重複が無い', () => {
    const kana = allCells.map((c) => c.kana);
    expect(new Set(kana).size).toBe(kana.length);
    expect(allCells.every((c) => c.romaji === c.romaji.toUpperCase())).toBe(true);
  });

  it('ヘボン式の要点（し・ち・つ・ふ・じ・を・ぢ・づ）が表に出ている', () => {
    const find = (kana: string) => allCells.find((c) => c.kana === kana)?.romaji;
    expect(find('し')).toBe('SHI');
    expect(find('ち')).toBe('CHI');
    expect(find('つ')).toBe('TSU');
    expect(find('ふ')).toBe('FU');
    expect(find('じ')).toBe('JI');
    expect(find('を')).toBe('O');
    expect(find('ぢ')).toBe('JI');
    expect(find('づ')).toBe('ZU');
    expect(find('しゃ')).toBe('SHA');
    expect(find('ぢゃ')).toBe('JA');
  });

  it('hebonOf は変換表を引き、無い文字は null を返す', () => {
    expect(hebonOf('き')).toBe('KI');
    expect(hebonOf('きょ')).toBe('KYO');
    expect(hebonOf('ん')).toBeNull();
    expect(hebonOf('斎')).toBeNull();
  });
});

describe('戸籍フリガナ・自署のFAQ（page.tsx）', () => {
  const page = readFileSync(
    fileURLToPath(new URL('../app/hebon-romaji/page.tsx', import.meta.url)),
    'utf8',
  );

  it('一覧表を lib の変換表から描画している（ページに綴りを手書きしない）', () => {
    expect(page).toContain('SEION_TABLE');
    expect(page).toContain('DAKUON_TABLE');
    expect(page).toContain('YOON_TABLE');
    expect(page).toContain('ヘボン式ローマ字 一覧表（五十音）');
  });

  it('2025年5月26日施行の戸籍フリガナと旅券法施行規則第9条に触れている', () => {
    expect(page).toContain('2025年5月26日');
    expect(page).toContain('旅券法施行規則第9条');
  });

  it('自署（サイン）のFAQがある', () => {
    expect(page).toContain('自署');
  });

  it('出典に外務省の氏名表記ページを載せている', () => {
    expect(page).toContain('https://www.mofa.go.jp/mofaj/toko/todoke/pagew_000001_01529.html');
  });
});
