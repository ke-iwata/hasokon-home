import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ALGORITHMS,
  MultiHasher,
  createHasher,
  formatDigest,
  fromBase64,
  hashAll,
  hashBytes,
  toBase64,
  toHex,
  toSri,
  type Algorithm,
} from '@/lib/hash/digest';
import { DEFAULT_TEXT_OPTIONS, encodeShiftJis, firstNonShiftJis, shapeText, textToBytes, type TextOptions } from '@/lib/hash/text';
import {
  algorithmForHexLength,
  candidateOptions,
  findEntry,
  findHint,
  parseExpected,
  parseSingleValue,
  parseSumsLine,
} from '@/lib/hash/compare';
import { commandsFor, quotePosix, quoteWindows } from '@/lib/hash/command';
import { CHUNK_BYTES, hashBlob, sizeBand } from '@/lib/hash/file';

/**
 * ハッシュ値 計算のテスト。仕様: docs/features/hash-keisan.md「確かめること」
 * 自前の逐次計算は、すべて node:crypto の createHash と突き合わせる。
 */

const ref = (a: Algorithm, data: Uint8Array) => createHash(a).update(data).digest('hex');
const ascii = (s: string) => new TextEncoder().encode(s);

/** 再現できる乱数（xorshift32）。テストの入力を毎回同じにする */
function rng(seed: number) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

function randomBytes(n: number, next: () => number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = next() & 0xff;
  return out;
}

describe('既知の値（FIPS 180・RFC 1321 の例）', () => {
  const cases: [string, Record<Algorithm, string>][] = [
    [
      '',
      {
        md5: 'd41d8cd98f00b204e9800998ecf8427e',
        sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sha384: '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
        sha512:
          'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
      },
    ],
    [
      'abc',
      {
        md5: '900150983cd24fb0d6963f7d28e17f72',
        sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        sha384: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
        sha512:
          'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      },
    ],
  ];

  for (const [input, expected] of cases) {
    for (const a of ALGORITHMS) {
      it(`${a}("${input}")`, () => {
        expect(toHex(hashBytes(a, ascii(input)))).toBe(expected[a]);
      });
    }
  }

  it('SHA-256 の2ブロックの例（abcdbcdecdef…nopq）', () => {
    expect(toHex(hashBytes('sha256', ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('MD5 の The quick brown fox jumps over the lazy dog', () => {
    expect(toHex(hashBytes('md5', ascii('The quick brown fox jumps over the lazy dog')))).toBe('9e107d9d372bb6826bd81d3542a419d6');
  });
});

describe('塊の境目を node:crypto と突き合わせる', () => {
  const LENGTHS = [0, 1, 55, 56, 63, 64, 65, 111, 112, 127, 128, 129];

  it('長さ 0・1・55・56・63・64・65・111・112・127・128・129 バイト', () => {
    const next = rng(1);
    for (const n of LENGTHS) {
      const data = randomBytes(n, next);
      for (const a of ALGORITHMS) expect(toHex(hashBytes(a, data)), `${a} / ${n} バイト`).toBe(ref(a, data));
    }
  });

  it('ランダムな入力 200 通り（長さもランダム）', () => {
    const next = rng(2026);
    for (let i = 0; i < 200; i++) {
      const data = randomBytes(next() % 600, next);
      const all = hashAll(data);
      for (const a of ALGORITHMS) expect(toHex(all[a]), `${a} / ${data.length} バイト`).toBe(ref(a, data));
    }
  });

  it('4MB±1 バイト', () => {
    const next = rng(4);
    for (const n of [CHUNK_BYTES - 1, CHUNK_BYTES, CHUNK_BYTES + 1]) {
      const data = randomBytes(n, next);
      const all = hashAll(data);
      for (const a of ALGORITHMS) expect(toHex(all[a]), `${a} / ${n} バイト`).toBe(ref(a, data));
    }
  });

  it('塊の切り方を変えても（1 バイトずつ・7 バイトずつ・一括）値が同じ', () => {
    const next = rng(7);
    const data = randomBytes(1000, next);
    for (const a of ALGORITHMS) {
      const whole = toHex(hashBytes(a, data));
      const one = createHasher(a);
      for (let i = 0; i < data.length; i++) one.update(data.subarray(i, i + 1));
      const seven = createHasher(a);
      for (let i = 0; i < data.length; i += 7) seven.update(data.subarray(i, i + 7));
      expect(toHex(one.digest()), `${a} 1 バイトずつ`).toBe(whole);
      expect(toHex(seven.digest()), `${a} 7 バイトずつ`).toBe(whole);
      expect(whole).toBe(ref(a, data));
    }
  });

  it('MultiHasher は5種に同じ塊を流す', () => {
    const data = randomBytes(300, rng(9));
    const m = new MultiHasher().update(data.subarray(0, 100)).update(data.subarray(100)).digest();
    for (const a of ALGORITHMS) expect(toHex(m[a])).toBe(ref(a, data));
  });

  it('ファイル（Blob）を塊ごとに読んでも同じ値・進み具合が最後に 100%', async () => {
    const data = randomBytes(10_000, rng(11));
    const progress: number[] = [];
    const digests = await hashBlob(new Blob([data as BlobPart]), { chunkBytes: 333, onProgress: (d) => progress.push(d) });
    expect(digests).not.toBeNull();
    for (const a of ALGORITHMS) expect(toHex(digests![a])).toBe(ref(a, data));
    expect(progress.at(-1)).toBe(10_000);
  });

  it('中止すると null を返す', async () => {
    const data = randomBytes(10_000, rng(12));
    let n = 0;
    const r = await hashBlob(new Blob([data as BlobPart]), { chunkBytes: 1000, isCancelled: () => ++n > 3 });
    expect(r).toBeNull();
  });
});

describe('表示の形', () => {
  const abc = hashBytes('sha256', ascii('abc'));

  it('16進（小文字・大文字）と Base64', () => {
    expect(formatDigest(abc, 'hex')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(formatDigest(abc, 'HEX')).toBe(createHash('sha256').update('abc').digest('hex').toUpperCase());
    expect(formatDigest(abc, 'base64')).toBe(createHash('sha256').update('abc').digest('base64'));
  });

  it('Base64 の端（1・2・3 バイト）と戻し', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const b = randomBytes(n, rng(n));
      expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
      expect(Array.from(fromBase64(toBase64(b))!)).toEqual(Array.from(b));
    }
  });

  it('SRI は sha384-Base64', () => {
    const v = hashBytes('sha384', ascii('alert(1)'));
    expect(toSri(v)).toBe(`sha384-${createHash('sha384').update('alert(1)').digest('base64')}`);
  });
});

describe('文字列 → バイト列', () => {
  const TEST = 'テスト';

  it('「テスト」の UTF-8・UTF-8 BOM・Shift_JIS で値が別になり、それぞれ node:crypto と一致', () => {
    const utf8 = Buffer.from(TEST, 'utf8');
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]);
    // テ＝83 65・ス＝83 58・ト＝83 67（JIS X 0208 の Shift_JIS）
    const sjis = Buffer.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);
    const enc = (charset: TextOptions['charset']) => {
      const r = textToBytes(TEST, { ...DEFAULT_TEXT_OPTIONS, charset });
      if (!r.ok) throw new Error('encode failed');
      return r.bytes;
    };
    expect(Array.from(enc('shift_jis'))).toEqual(Array.from(sjis));
    const values = (['utf-8', 'utf-8-bom', 'shift_jis'] as const).map((c) => toHex(hashBytes('sha256', enc(c))));
    expect(values[0]).toBe(createHash('sha256').update(utf8).digest('hex'));
    expect(values[1]).toBe(createHash('sha256').update(bom).digest('hex'));
    expect(values[2]).toBe(createHash('sha256').update(sjis).digest('hex'));
    expect(new Set(values).size).toBe(3);
  });

  it('Shift_JIS の特別扱い（¥ は 0x5C・− は全角ハイフンマイナス 81 7C・半角カナは1バイト）', () => {
    const r = encodeShiftJis('¥−ｱ');
    expect(r.ok && Array.from(r.bytes)).toEqual([0x5c, 0x81, 0x7c, 0xb1]);
  });

  it('Shift_JIS に無い文字（😀・𠮷）は位置を返す', () => {
    expect(firstNonShiftJis('あ😀')).toEqual({ position: 2, char: '😀' });
    expect(firstNonShiftJis('𠮷野家')).toEqual({ position: 1, char: '𠮷' });
    expect(firstNonShiftJis('吉野家')).toBeNull();
    expect(textToBytes('a😀', { ...DEFAULT_TEXT_OPTIONS, charset: 'shift_jis' }).ok).toBe(false);
  });

  it('改行・末尾の改行・前後の空白の加工', () => {
    const keep = { newline: 'keep', trailing: 'keep', trim: false } as const;
    expect(shapeText('a\r\nb\nc\rd', { ...keep, newline: 'lf' })).toBe('a\nb\nc\nd');
    expect(shapeText('a\r\nb\nc', { ...keep, newline: 'crlf' })).toBe('a\r\nb\r\nc');
    expect(shapeText('abc', { ...keep, trailing: 'lf' })).toBe('abc\n');
    expect(shapeText('abc', { ...keep, trailing: 'crlf' })).toBe('abc\r\n');
    expect(shapeText('abc\r\n\n', { ...keep, trailing: 'strip' })).toBe('abc');
    expect(shapeText('  abc \n', { ...keep, trim: true })).toBe('abc');
  });
});

describe('一致の判定', () => {
  it('長さでアルゴリズムを決める', () => {
    expect(algorithmForHexLength(32)).toBe('md5');
    expect(algorithmForHexLength(40)).toBe('sha1');
    expect(algorithmForHexLength(64)).toBe('sha256');
    expect(algorithmForHexLength(96)).toBe('sha384');
    expect(algorithmForHexLength(128)).toBe('sha512');
    expect(algorithmForHexLength(33)).toBeNull();
  });

  it('大文字小文字・空白・: 区切りは無視する', () => {
    const hex = createHash('md5').update('abc').digest('hex');
    const colon = hex.toUpperCase().match(/../g)!.join(':');
    expect(parseSingleValue(colon)?.algorithm).toBe('md5');
    expect(toHex(parseSingleValue(`  ${hex.slice(0, 16)} ${hex.slice(16)}\n`)!.bytes)).toBe(hex);
  });

  it('SRI の sha384-… を受ける', () => {
    const b64 = createHash('sha384').update('x').digest('base64');
    const v = parseSingleValue(`sha384-${b64}`);
    expect(v?.algorithm).toBe('sha384');
    expect(toHex(v!.bytes)).toBe(createHash('sha384').update('x').digest('hex'));
    expect(parseSingleValue('sha384-AAAA')).toBeNull();
  });

  it('SHA256SUMS 形式（␣␣ と ␣*）を読む', () => {
    const a = createHash('sha256').update('a').digest('hex');
    const b = createHash('sha256').update('b').digest('hex');
    const parsed = parseExpected(`# comment\n${a}  ubuntu-24.04.iso\n${b} *my file.zip\n`);
    expect(parsed.kind).toBe('list');
    if (parsed.kind !== 'list') return;
    expect(parsed.entries.map((e) => [e.algorithm, e.filename])).toEqual([
      ['sha256', 'ubuntu-24.04.iso'],
      ['sha256', 'my file.zip'],
    ]);
    expect(findEntry(parsed.entries, 'my file.zip').length).toBe(1);
    expect(findEntry(parsed.entries, 'UBUNTU-24.04.ISO').length).toBe(1);
    expect(findEntry(parsed.entries, 'other.iso').length).toBe(0);
  });

  it('BSD 形式（SHA256 (a b.iso) = …・openssl の SHA2-256(…)= …・MD5 (…) = …）を読む', () => {
    const h = createHash('sha256').update('a').digest('hex');
    expect(parseSumsLine(`SHA256 (a b.iso) = ${h}`)).toMatchObject({ algorithm: 'sha256', filename: 'a b.iso' });
    expect(parseSumsLine(`SHA2-256(x.tar.gz)= ${h}`)).toMatchObject({ algorithm: 'sha256', filename: 'x.tar.gz' });
    const m = createHash('md5').update('a').digest('hex');
    expect(parseSumsLine(`MD5 (f.bin) = ${m}`)).toMatchObject({ algorithm: 'md5', filename: 'f.bin' });
    // 名前と桁数が合わなければ読まない
    expect(parseSumsLine(`SHA512 (f.bin) = ${m}`)).toBeNull();
  });

  it('MD5 の1行で、ファイル名が16進8文字（deadbeef）でも SHA-1 と読み違えない', () => {
    const m = createHash('md5').update('a').digest('hex');
    const parsed = parseExpected(`${m}  deadbeef`);
    expect(parsed.kind).toBe('list');
    if (parsed.kind !== 'list') return;
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({ algorithm: 'md5', filename: 'deadbeef' });
  });

  it('1行の「値␣␣ファイル名」は一覧として読み、区切りの空白1つの値は1つの値として読む', () => {
    const h = createHash('sha256').update('a').digest('hex');
    expect(parseExpected(`${h}  a.iso`).kind).toBe('list');
    expect(parseExpected(`${h.slice(0, 32)} ${h.slice(32)}`)).toMatchObject({ kind: 'single', expected: { algorithm: 'sha256' } });
  });

  it('読めない値は invalid・空は empty', () => {
    expect(parseExpected('').kind).toBe('empty');
    expect(parseExpected('hello').kind).toBe('invalid');
  });
});

describe('不一致の原因探し', () => {
  const hex = (a: Algorithm, data: Buffer | string) => createHash(a).update(data).digest('hex');
  const expectedOf = (a: Algorithm, data: Buffer | string) => parseSingleValue(hex(a, data))!;

  it('試す組み合わせは 96 通り以内の固定の一覧', () => {
    const list = candidateOptions();
    expect(list.length).toBeLessThanOrEqual(96);
    expect(new Set(list.map((o) => JSON.stringify(o))).size).toBe(list.length);
  });

  it('「末尾の改行を足すと一致」を当てる（echo の値）', () => {
    const h = findHint('hello', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', 'hello\n'));
    expect(h?.kinds).toEqual(['trailing-newline']);
    expect(h?.message).toBe('末尾に改行を1つ足すと一致します');
    expect(h?.note).toContain('echo -n');
  });

  it('末尾の改行を外すと一致', () => {
    expect(findHint('hello\n', DEFAULT_TEXT_OPTIONS, expectedOf('md5', 'hello'))?.message).toBe('末尾の改行を外すと一致します');
  });

  it('CRLF にそろえると一致', () => {
    const h = findHint('a\nb', DEFAULT_TEXT_OPTIONS, expectedOf('sha1', 'a\r\nb'));
    expect(h?.kinds).toEqual(['crlf']);
  });

  it('BOM を付けると一致', () => {
    const h = findHint('テスト', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('テスト')])));
    expect(h?.kinds).toEqual(['bom']);
    expect(h?.message).toContain('BOM を付ける');
  });

  it('Shift_JIS にすると一致', () => {
    const h = findHint('テスト', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', Buffer.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])));
    expect(h?.kinds).toEqual(['sjis']);
  });

  it('前後の空白を外すと一致', () => {
    const h = findHint('  abc  ', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', 'abc'));
    expect(h?.kinds).toEqual(['trim']);
  });

  it('当たりが複数あれば、変える箇所が少ないものを出す', () => {
    // "abc\n" は「末尾に LF を足す」（1か所）でも「CRLF＋末尾の改行を…」でも作れない。1か所のほうを選ぶ
    const h = findHint('abc', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', 'abc\n'));
    expect(h?.kinds.length).toBe(1);
  });

  it('2か所を変えて一致（末尾の改行＋CRLF）', () => {
    const h = findHint('a\nb', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', 'a\r\nb\r\n'));
    expect(h?.kinds.sort()).toEqual(['crlf', 'trailing-newline']);
  });

  it('どれでも合わなければ null', () => {
    expect(findHint('abc', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', 'xyz'))).toBeNull();
  });

  it('Shift_JIS に無い文字があれば、Shift_JIS は候補から外れる', () => {
    // 😀 は Shift_JIS に無い。Shift_JIS で作れない値は当てようがないが、例外にもならないこと
    expect(findHint('😀', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', 'nothing'))).toBeNull();
    // 😀 を含む文字列でも、UTF-8 側の原因（末尾の改行）は当てる
    const h = findHint('😀', DEFAULT_TEXT_OPTIONS, expectedOf('sha256', '😀\n'));
    expect(h?.options.charset).not.toBe('shift_jis');
    expect(h?.kinds).toEqual(['trailing-newline']);
  });
});

describe('コマンドの組み立て', () => {
  const find = (name: string | null, a: Algorithm, os: string) => commandsFor(name, a).find((c) => c.os.startsWith(os))!.command;

  it('空白入り（my file.iso）', () => {
    expect(find('my file.iso', 'sha256', 'Windows（コマンド')).toBe('certutil -hashfile "my file.iso" SHA256');
    expect(find('my file.iso', 'sha256', 'Windows（PowerShell')).toBe('Get-FileHash -LiteralPath "my file.iso" -Algorithm SHA256');
    expect(find('my file.iso', 'sha256', 'macOS')).toBe("shasum -a 256 'my file.iso'");
    expect(find('my file.iso', 'sha256', 'Linux')).toBe("sha256sum 'my file.iso'");
  });

  it("' 入り（it's.zip）は '\\'' にする", () => {
    expect(quotePosix("it's.zip")).toBe("'it'\\''s.zip'");
    expect(find("it's.zip", 'sha1', 'Linux')).toBe("sha1sum 'it'\\''s.zip'");
    expect(find("it's.zip", 'sha1', 'Windows（コマンド')).toBe(`certutil -hashfile "it's.zip" SHA1`);
  });

  it('& $ ; 入りでも引用の中に収まる', () => {
    const name = 'a&b$c;d.txt';
    expect(quoteWindows(name)).toBe('"a&b$c;d.txt"');
    expect(quotePosix(name)).toBe("'a&b$c;d.txt'");
    expect(find(name, 'md5', 'macOS')).toBe("md5 'a&b$c;d.txt'");
    expect(find(name, 'md5', 'Linux')).toBe("md5sum 'a&b$c;d.txt'");
  });

  it('Windows の引用から " を外す（ファイル名に使えない文字）', () => {
    expect(quoteWindows('a"b')).toBe('"ab"');
  });

  it('ファイル未選択のときはプレースホルダ', () => {
    expect(find(null, 'sha512', 'Windows（PowerShell')).toBe('Get-FileHash -LiteralPath "ファイル名" -Algorithm SHA512');
  });
});

describe('計測に送る区分', () => {
  it('ファイルの大きさは3区分だけ', () => {
    expect(sizeBand(0)).toBe('lt10mb');
    expect(sizeBand(10 * 1024 * 1024 - 1)).toBe('lt10mb');
    expect(sizeBand(10 * 1024 * 1024)).toBe('lt1gb');
    expect(sizeBand(1024 ** 3)).toBe('ge1gb');
  });
});
