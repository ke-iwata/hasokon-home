import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_CHARS,
  APPENDED_DIGITS,
  BITS_PER_WORD,
  CHARSETS,
  CHARSET_KEYS,
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  GUESSES_PER_SECOND,
  MAX_COUNT,
  MAX_LENGTH,
  MIN_LENGTH,
  PASSPHRASE_WORDS,
  PasswordOptionError,
  alphabetSize,
  charPools,
  crackSeconds,
  cryptoRandom,
  entropyBits,
  formatDuration,
  generatePassphrase,
  generatePassphrases,
  generatePassword,
  generatePasswords,
  passphraseEntropyBits,
  randomInt,
  shuffle,
  strengthOf,
  type PasswordOptions,
  type RandomSource,
} from '@/lib/password';

/**
 * パスワード生成（docs/features/password-seisei.md）のテスト。
 *
 * 見張っているのは**生成の質**そのもの。
 *
 * 1. **剰余バイアスを作らないこと**（`randomInt` の棄却サンプリング）。
 *    ここが壊れると特定の文字が出やすくなるが、見た目には分からない
 * 2. **選んだ文字種が必ず1文字以上入ること**。「記号あり」で作ったのに
 *    記号のないパスワードが出ると、そのまま登録できずに使えない
 * 3. **「紛らわしい文字を除く」が本当に除けていること**
 * 4. **エントロピーの計算式**。画面に出す「総当たり◯年」の根拠になる
 *
 * 乱数は `RandomSource` を差し替えて固定する。**既定は Web Crypto なので、
 * 引数を省いた呼び出しは本物の暗号用乱数を使う**（下のいくつかの検査は
 * 既定のまま何度も回して、性質が保たれることを見ている）。
 */

/** 決め打ちのバイト列を返す乱数源。使い切ったら投げる（想定以上に引いていたら気づける） */
function bytesFrom(values: readonly number[]): RandomSource {
  let index = 0;
  return (byteLength) => {
    const out = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
      if (index >= values.length) throw new Error('テスト用の乱数を使い切りました');
      out[i] = values[index++];
    }
    return out;
  };
}

/** いつも0を返す乱数源。「必ず先頭の候補が選ばれる」ので手で追える */
const zeros: RandomSource = (byteLength) => new Uint8Array(byteLength);

describe('randomInt（棄却サンプリング）', () => {
  it('割り切れない端の値は捨てて引き直す', () => {
    // 0〜255 を 10 で割ると 250〜255 が余る。250 は捨てられ、次の 7 が使われる
    expect(randomInt(10, bytesFrom([250, 7]))).toBe(7);
    expect(randomInt(10, bytesFrom([255, 254, 253, 3]))).toBe(3);
  });

  it('捨てずに剰余だけ取ると偏る値（249）も、範囲内なのでそのまま使う', () => {
    expect(randomInt(10, bytesFrom([249]))).toBe(9);
  });

  it('0〜255をすべて流すと、どの値もちょうど25回ずつ出る（偏りがない）', () => {
    const source = bytesFrom(Array.from({ length: 256 }, (_, i) => i));
    const counts = new Array(10).fill(0);
    // 250〜255 は捨てられるので、引ける回数は250回
    for (let i = 0; i < 250; i++) counts[randomInt(10, source)]++;
    expect(counts).toEqual(new Array(10).fill(25));
  });

  it('257以上は2バイトで引く（単語リストの2048語もこちら）', () => {
    // 0x08 0x01 = 2049。2048で割った余りは1
    expect(randomInt(2048, bytesFrom([0x08, 0x01]))).toBe(1);
    expect(randomInt(2048, bytesFrom([0x00, 0x00]))).toBe(0);
  });

  it('候補が1つしかないときは乱数を引かない', () => {
    const source: RandomSource = () => {
      throw new Error('引いてはいけない');
    };
    expect(randomInt(1, source)).toBe(0);
  });

  it('範囲が不正なら投げる', () => {
    expect(() => randomInt(0, zeros)).toThrow(RangeError);
    expect(() => randomInt(-1, zeros)).toThrow(RangeError);
    expect(() => randomInt(1.5, zeros)).toThrow(RangeError);
    expect(() => randomInt(65537, zeros)).toThrow(RangeError);
  });

  it('乱数が足りなければ投げる（黙って0で埋めない）', () => {
    const broken: RandomSource = () => new Uint8Array(0);
    expect(() => randomInt(10, broken)).toThrow(/乱数/);
  });
});

describe('shuffle', () => {
  it('要素は増えも減りもしない（並べ替えだけ）', () => {
    const items = [...'abcdefgh'];
    const result = shuffle(items, cryptoRandom);
    expect(result).toHaveLength(items.length);
    expect([...result].sort()).toEqual([...items].sort());
  });

  it('元の配列を書き換えない', () => {
    const items = [...'abcdefgh'];
    shuffle(items, cryptoRandom);
    expect(items).toEqual([...'abcdefgh']);
  });

  it('乱数を固定すれば結果も決まる（0固定なら末尾から順に先頭と交換）', () => {
    expect(shuffle([...'abcd'], zeros).join('')).toBe('bcda');
  });
});

describe('文字種', () => {
  it('既定は英大文字・英小文字・数字・記号の86文字', () => {
    expect(alphabetSize(DEFAULT_PASSWORD_OPTIONS)).toBe(26 + 26 + 10 + 24);
  });

  it('紛らわしい文字を除くと Il1Oo0 の6文字が減る', () => {
    const options = { ...DEFAULT_PASSWORD_OPTIONS, excludeAmbiguous: true };
    expect(alphabetSize(options)).toBe(86 - AMBIGUOUS_CHARS.length);
    const { alphabet } = charPools(options);
    for (const char of AMBIGUOUS_CHARS) expect(alphabet).not.toContain(char);
  });

  it('記号に引用符・バックスラッシュ・パイプ・不等号を入れない（貼り付け先で壊れるため）', () => {
    for (const char of ['"', "'", '`', '\\', '|', '<', '>', '/']) {
      expect(CHARSETS.symbol).not.toContain(char);
    }
  });

  it('文字種を1つも選ばないと投げる', () => {
    const options: PasswordOptions = {
      ...DEFAULT_PASSWORD_OPTIONS,
      upper: false,
      lower: false,
      digit: false,
      symbol: false,
    };
    expect(() => charPools(options)).toThrow(PasswordOptionError);
  });
});

describe('generatePassword', () => {
  it('指定した長さちょうどになる', () => {
    for (const length of [MIN_LENGTH, 12, 16, 32, MAX_LENGTH]) {
      expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length })).toHaveLength(length);
    }
  });

  it('選んだ文字種が必ず1文字以上入る（200回とも）', () => {
    const options = { ...DEFAULT_PASSWORD_OPTIONS, length: MIN_LENGTH };
    for (let i = 0; i < 200; i++) {
      const password = generatePassword(options);
      for (const key of CHARSET_KEYS) {
        expect([...password].some((c) => CHARSETS[key].includes(c))).toBe(true);
      }
    }
  });

  it('選んでいない文字種は1文字も入らない', () => {
    const options: PasswordOptions = {
      ...DEFAULT_PASSWORD_OPTIONS,
      symbol: false,
      digit: false,
    };
    for (let i = 0; i < 100; i++) {
      for (const char of generatePassword(options)) {
        expect(CHARSETS.symbol.includes(char)).toBe(false);
        expect(CHARSETS.digit.includes(char)).toBe(false);
      }
    }
  });

  it('「紛らわしい文字を除く」なら1文字も出てこない（200回とも）', () => {
    const options = { ...DEFAULT_PASSWORD_OPTIONS, excludeAmbiguous: true, length: MAX_LENGTH };
    for (let i = 0; i < 200; i++) {
      for (const char of generatePassword(options)) {
        expect(AMBIGUOUS_CHARS).not.toContain(char);
      }
    }
  });

  it('文字種が1つでも作れる（数字だけの暗証番号のような使い方）', () => {
    const options: PasswordOptions = {
      ...DEFAULT_PASSWORD_OPTIONS,
      upper: false,
      lower: false,
      symbol: false,
      length: 8,
    };
    expect(generatePassword(options)).toMatch(/^\d{8}$/);
  });

  it('乱数を0で固定すると、各文字種の先頭を1つずつ確保してから埋めた並びになる', () => {
    // 確保: A（大文字の先頭）a（小文字）0（数字）!（記号）→ 残り4文字は候補の先頭 A
    // → [A,a,0,!,A,A,A,A] を0固定でシャッフルすると a0!AAAAA になる
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 }, zeros)).toBe('a0!AAAAA');
  });

  it('長さが範囲外なら投げる', () => {
    expect(() =>
      generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: MIN_LENGTH - 1 }),
    ).toThrow(PasswordOptionError);
    expect(() =>
      generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: MAX_LENGTH + 1 }),
    ).toThrow(PasswordOptionError);
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 16.5 })).toThrow(
      PasswordOptionError,
    );
  });

  it('毎回ちがう値になる（同じ値が並ばない）', () => {
    const passwords = generatePasswords(MAX_COUNT, DEFAULT_PASSWORD_OPTIONS);
    expect(new Set(passwords).size).toBe(MAX_COUNT);
  });

  it('件数が範囲外なら投げる', () => {
    expect(() => generatePasswords(0, DEFAULT_PASSWORD_OPTIONS)).toThrow(PasswordOptionError);
    expect(() => generatePasswords(MAX_COUNT + 1, DEFAULT_PASSWORD_OPTIONS)).toThrow(
      PasswordOptionError,
    );
  });

  /**
   * 文字の出方が偏っていないことの確認。
   * 数字だけ・長さ10で1000本作ると10000文字になる。完全な一様なら各数字1000回で、
   * 上下25%（750〜1250回）に収まらなければ実装が疑わしい
   * （棄却サンプリングを外すと 0〜5 が 6〜9 より2〜4%多く出る）。
   */
  it('1つの文字種の中でも出現に偏りがない', () => {
    const options: PasswordOptions = {
      ...DEFAULT_PASSWORD_OPTIONS,
      upper: false,
      lower: false,
      symbol: false,
      length: 10,
    };
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      for (const char of generatePassword(options)) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(10);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(750);
      expect(count).toBeLessThan(1250);
    }
  });
});

describe('パスフレーズ', () => {
  it('指定した数の単語を区切り文字でつなぐ', () => {
    const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 5 });
    expect(phrase.split('-')).toHaveLength(5);
  });

  it('単語はリストの中のものだけを使う', () => {
    const words = new Set(PASSPHRASE_WORDS);
    for (let i = 0; i < 50; i++) {
      const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 6 });
      for (const word of phrase.split('-')) expect(words.has(word)).toBe(true);
    }
  });

  it('区切りなしも選べる', () => {
    const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, separator: '' });
    expect(phrase).toMatch(/^[a-z]+$/);
  });

  it('先頭を大文字にする指定が効く', () => {
    const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, capitalize: true });
    for (const word of phrase.split('-')) expect(word[0]).toBe(word[0].toUpperCase());
  });

  it('末尾に2桁の数字を足せる（0埋めするので必ず2桁）', () => {
    for (let i = 0; i < 50; i++) {
      const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, appendNumber: true });
      expect(phrase).toMatch(/-\d{2}$/);
    }
  });

  it('乱数を0で固定するとリストの先頭の語が並ぶ', () => {
    const first = PASSPHRASE_WORDS[0];
    expect(generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 3 }, zeros)).toBe(
      [first, first, first].join('-'),
    );
  });

  it('引いた値の分だけリストを進んだ語になる', () => {
    // 2バイトずつ引く。0x0000 → 先頭、0x0001 → 2語目、0x0002 → 3語目
    const source = bytesFrom([0x00, 0x00, 0x00, 0x01, 0x00, 0x02]);
    expect(generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 3 }, source)).toBe(
      [PASSPHRASE_WORDS[0], PASSPHRASE_WORDS[1], PASSPHRASE_WORDS[2]].join('-'),
    );
  });

  it('単語の数が範囲外なら投げる', () => {
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 2 })).toThrow(
      PasswordOptionError,
    );
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 11 })).toThrow(
      PasswordOptionError,
    );
  });

  it('まとめて作ると全部ちがう値になる', () => {
    const phrases = generatePassphrases(MAX_COUNT, DEFAULT_PASSPHRASE_OPTIONS);
    expect(new Set(phrases).size).toBe(MAX_COUNT);
  });
});

describe('エントロピー', () => {
  it('log2(候補文字数 ^ 長さ) で計算する', () => {
    const options = { ...DEFAULT_PASSWORD_OPTIONS, length: 16 };
    expect(entropyBits(options)).toBeCloseTo(16 * Math.log2(86), 10);
  });

  it('長さを倍にするとビット数も倍になる', () => {
    const a = entropyBits({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 });
    const b = entropyBits({ ...DEFAULT_PASSWORD_OPTIONS, length: 16 });
    expect(b).toBeCloseTo(a * 2, 10);
  });

  it('文字種を減らすとビット数が下がる', () => {
    const full = entropyBits(DEFAULT_PASSWORD_OPTIONS);
    const noSymbol = entropyBits({ ...DEFAULT_PASSWORD_OPTIONS, symbol: false });
    const excluded = entropyBits({ ...DEFAULT_PASSWORD_OPTIONS, excludeAmbiguous: true });
    expect(noSymbol).toBeLessThan(full);
    expect(excluded).toBeLessThan(full);
  });

  it('1語あたりちょうど11ビット（語数が2048だから）', () => {
    expect(BITS_PER_WORD).toBe(11);
    expect(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 4 })).toBe(44);
    expect(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 6 })).toBe(66);
  });

  it('末尾の2桁の数字は log2(100) ビットぶん足す', () => {
    const base = passphraseEntropyBits(DEFAULT_PASSPHRASE_OPTIONS);
    const withNumber = passphraseEntropyBits({
      ...DEFAULT_PASSPHRASE_OPTIONS,
      appendNumber: true,
    });
    expect(withNumber - base).toBeCloseTo(Math.log2(10 ** APPENDED_DIGITS), 10);
  });

  it('先頭の大文字化ではビット数が増えない（規則で決まる変換なので）', () => {
    expect(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE_OPTIONS, capitalize: true })).toBe(
      passphraseEntropyBits(DEFAULT_PASSPHRASE_OPTIONS),
    );
  });

  it('4語のパスフレーズは8文字の英小文字＋数字より強い（差別化の根拠）', () => {
    const short = entropyBits({
      ...DEFAULT_PASSWORD_OPTIONS,
      upper: false,
      symbol: false,
      length: 8,
    });
    expect(passphraseEntropyBits(DEFAULT_PASSPHRASE_OPTIONS)).toBeGreaterThan(short);
  });
});

describe('総当たり時間の目安', () => {
  it('平均で半分（2^(bits-1)）を試した時点で当たるとみなす', () => {
    expect(crackSeconds(41, 1e12)).toBeCloseTo(2 ** 40 / 1e12, 10);
    // 既定の前提は毎秒1兆回
    expect(crackSeconds(41)).toBe(crackSeconds(41, GUESSES_PER_SECOND));
  });

  it('試行速度を10倍にすると時間は10分の1になる', () => {
    expect(crackSeconds(60, 1e12) / crackSeconds(60, 1e13)).toBeCloseTo(10, 10);
  });

  it('単位を秒→分→時間→日→年→万年→億年→兆年と切り替える', () => {
    expect(formatDuration(0.5)).toBe('1秒未満');
    expect(formatDuration(30)).toBe('約30秒');
    expect(formatDuration(600)).toBe('約10分');
    expect(formatDuration(7200)).toBe('約2時間');
    expect(formatDuration(86400 * 30)).toBe('約30日');
    expect(formatDuration(86400 * 365 * 500)).toBe('約500年');
    expect(formatDuration(86400 * 365 * 5e4)).toBe('約5万年');
    expect(formatDuration(86400 * 365 * 3e9)).toBe('約30億年');
    expect(formatDuration(86400 * 365 * 7e12)).toBe('約7兆年');
  });

  it('兆年を超えたら指数表記にする（「実質無限」で潰さない）', () => {
    expect(formatDuration(86400 * 365 * 1.2e30)).toBe('約1.2×10^30年');
  });

  it('16文字・4文字種なら宇宙の年齢（約138億年）よりはるかに長い', () => {
    const bits = entropyBits({ ...DEFAULT_PASSWORD_OPTIONS, length: 16 });
    const years = crackSeconds(bits) / (86400 * 365);
    expect(years).toBeGreaterThan(1.38e10);
  });
});

describe('強度の段階', () => {
  it('45 / 60 / 80 ビットで段階が変わる', () => {
    expect(strengthOf(44.9)).toBe('weak');
    expect(strengthOf(45)).toBe('fair');
    expect(strengthOf(59.9)).toBe('fair');
    expect(strengthOf(60)).toBe('strong');
    expect(strengthOf(79.9)).toBe('strong');
    expect(strengthOf(80)).toBe('verystrong');
  });

  it('既定の設定（16文字・4文字種）は「とても強い」', () => {
    expect(strengthOf(entropyBits(DEFAULT_PASSWORD_OPTIONS))).toBe('verystrong');
  });

  it('8文字の英小文字だけは「弱い」', () => {
    const bits = entropyBits({
      ...DEFAULT_PASSWORD_OPTIONS,
      upper: false,
      digit: false,
      symbol: false,
      length: 8,
    });
    expect(strengthOf(bits)).toBe('weak');
  });
});
