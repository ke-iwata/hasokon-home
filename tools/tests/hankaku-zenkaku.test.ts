import { describe, expect, it } from 'vitest';
import {
  convertWidth,
  countChars,
  DEFAULT_OPTIONS,
  type WidthOptions,
} from '@/lib/hankaku-zenkaku';

/** 1種類だけを対象にするオプションを作る */
const only = (key: keyof WidthOptions): WidthOptions => ({
  alnum: false,
  kana: false,
  symbol: false,
  space: false,
  [key]: true,
});

describe('convertWidth 全角→半角', () => {
  it('英数字を半角にする', () => {
    expect(convertWidth('ＡＢＣ１２３ａｂｃ', 'toHalf')).toBe('ABC123abc');
  });

  it('カタカナを半角にする', () => {
    expect(convertWidth('アイウエオ', 'toHalf')).toBe('ｱｲｳｴｵ');
  });

  it('濁点・半濁点付きのカタカナは2文字に分解される', () => {
    expect(convertWidth('ガギグゲゴ', 'toHalf')).toBe('ｶﾞｷﾞｸﾞｹﾞｺﾞ');
    expect(convertWidth('パピプペポ', 'toHalf')).toBe('ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ');
    expect(convertWidth('ヴ', 'toHalf')).toBe('ｳﾞ');
  });

  it('記号を半角にする', () => {
    expect(convertWidth('！＠＃＄％＆（）', 'toHalf')).toBe('!@#$%&()');
  });

  it('全角スペースを半角スペースにする', () => {
    expect(convertWidth('あ　い', 'toHalf')).toBe('あ い');
  });

  it('小書き文字・長音・句読点も変換する', () => {
    expect(convertWidth('ァィゥェォャュョッー', 'toHalf')).toBe('ｧｨｩｪｫｬｭｮｯｰ');
    expect(convertWidth('、。「」・', 'toHalf')).toBe('､｡｢｣･');
  });
});

describe('convertWidth 半角→全角', () => {
  it('英数字を全角にする', () => {
    expect(convertWidth('ABC123abc', 'toFull')).toBe('ＡＢＣ１２３ａｂｃ');
  });

  it('カタカナを全角にする', () => {
    expect(convertWidth('ｱｲｳｴｵ', 'toFull')).toBe('アイウエオ');
  });

  it('濁点・半濁点は1文字に合成される', () => {
    expect(convertWidth('ｶﾞｷﾞｸﾞｹﾞｺﾞ', 'toFull')).toBe('ガギグゲゴ');
    expect(convertWidth('ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ', 'toFull')).toBe('パピプペポ');
    expect(convertWidth('ｳﾞ', 'toFull')).toBe('ヴ');
  });

  it('合成できない濁点はそのまま残る', () => {
    // 「ｱﾞ」は存在しない組み合わせなので、勝手に消したりせず2文字のまま
    expect(convertWidth('ｱﾞ', 'toFull')).toBe('ア゛');
  });

  it('記号を全角にする', () => {
    expect(convertWidth('!@#$%&()', 'toFull')).toBe('！＠＃＄％＆（）');
  });

  it('半角スペースを全角スペースにする', () => {
    expect(convertWidth('あ い', 'toFull')).toBe('あ　い');
  });
});

describe('convertWidth 対象の絞り込み', () => {
  it('英数字だけを半角にし、カタカナと記号は残す', () => {
    expect(convertWidth('ＡＢＣアイウ！', 'toHalf', only('alnum'))).toBe('ABCアイウ！');
  });

  it('カタカナだけを半角にし、英数字は残す', () => {
    expect(convertWidth('ＡＢＣアイウ', 'toHalf', only('kana'))).toBe('ＡＢＣｱｲｳ');
  });

  it('記号だけを全角にし、英数字は残す', () => {
    expect(convertWidth('abc!?', 'toFull', only('symbol'))).toBe('abc！？');
  });

  it('スペースだけを対象にすると他は一切変わらない', () => {
    expect(convertWidth('ＡＢ　アイ！', 'toHalf', only('space'))).toBe('ＡＢ アイ！');
  });

  it('すべてOFFなら入力がそのまま返る', () => {
    const off = { alnum: false, kana: false, symbol: false, space: false };
    expect(convertWidth('ＡＢアイ！　', 'toHalf', off)).toBe('ＡＢアイ！　');
  });
});

describe('convertWidth 変換対象外', () => {
  it('ひらがな・漢字は変換しない（半角が存在しないため）', () => {
    expect(convertWidth('ひらがな漢字', 'toHalf')).toBe('ひらがな漢字');
    expect(convertWidth('ひらがな漢字', 'toFull')).toBe('ひらがな漢字');
  });

  it('半角が存在しないカタカナはそのまま残す', () => {
    expect(convertWidth('ヰヱヵヶ', 'toHalf')).toBe('ヰヱヵヶ');
  });

  it('空文字を渡しても落ちない', () => {
    expect(convertWidth('', 'toHalf')).toBe('');
    expect(convertWidth('', 'toFull')).toBe('');
  });

  it('絵文字はそのまま残る', () => {
    expect(convertWidth('ＡＢ🎲', 'toHalf')).toBe('AB🎲');
  });

  it('改行・タブは保持される', () => {
    expect(convertWidth('ＡＢ\n\tＣＤ', 'toHalf')).toBe('AB\n\tCD');
  });
});

describe('convertWidth 往復', () => {
  it('半角→全角→半角で元に戻る（英数字・記号）', () => {
    const src = 'Tel:03-1234-5678 (Yamada)';
    expect(convertWidth(convertWidth(src, 'toFull'), 'toHalf')).toBe(src);
  });

  it('全角→半角→全角で元に戻る（濁点付きカタカナ）', () => {
    const src = 'ガンダム・パーツ';
    expect(convertWidth(convertWidth(src, 'toHalf'), 'toFull')).toBe(src);
  });
});

describe('convertWidth 実用例', () => {
  it('住所の全角英数字だけを半角に直す（カタカナは全角のまま残す）', () => {
    expect(convertWidth('東京都渋谷区１−２−３　渋谷ビル４Ｆ', 'toHalf', only('alnum'))).toBe(
      '東京都渋谷区1−2−3　渋谷ビル4F',
    );
  });

  it('全角ハイフンに見える記号（U+2212 など）は変換しない', () => {
    // ASCIIに対応がない文字まで書き換えると、住所の表記が壊れるため
    expect(convertWidth('１−２', 'toHalf')).toBe('1−2');
  });

  it('半角カナ混じりの氏名を全角に揃える', () => {
    expect(convertWidth('ﾔﾏﾀﾞ ﾀﾛｳ', 'toFull')).toBe('ヤマダ　タロウ');
  });

  it('DEFAULT_OPTIONS は全種類が有効', () => {
    expect(DEFAULT_OPTIONS).toEqual({ alnum: true, kana: true, symbol: true, space: true });
  });
});

describe('countChars', () => {
  it('全角と半角を数え分ける', () => {
    expect(countChars('あいうAB')).toEqual({ total: 5, full: 3, half: 2 });
  });

  it('半角カナは半角として数える', () => {
    expect(countChars('ｱｲｳ')).toEqual({ total: 3, full: 0, half: 3 });
  });

  it('全角記号は全角として数える', () => {
    expect(countChars('！？')).toEqual({ total: 2, full: 2, half: 0 });
  });

  it('絵文字は1文字として数える（サロゲートペアを分解しない）', () => {
    expect(countChars('🎲').total).toBe(1);
  });

  it('空文字は0件', () => {
    expect(countChars('')).toEqual({ total: 0, full: 0, half: 0 });
  });
});
