/**
 * MD5・SHA-1・SHA-256・SHA-384・SHA-512 の逐次計算（`update(chunk)` → `digest()`）。
 *
 * 仕様: docs/features/hash-keisan.md「計算の約束」
 *
 * - **依存パッケージを足さずに自前で書く。** Web Crypto（`crypto.subtle.digest`）には
 *   逐次計算と MD5 が無く、ファイル全体をメモリに読まないと計算できないため。
 *   文字列もファイルも、この1本の経路を通す
 * - **SHA-512・SHA-384 の 64bit 演算は 32bit の上位・下位の組で書く（BigInt は使わない）**。
 *   BigInt だと桁違いに遅く、5種を同時に流すとここが律速になるため
 * - 長さはバイト数を Number で数える（2^53 バイトまで。実用上の上限は無い）
 *
 * 出典:
 * - NIST FIPS 180-4 Secure Hash Standard（SHA-1・SHA-2 の定義） https://csrc.nist.gov/pubs/fips/180-4/upd1/final
 * - RFC 1321 The MD5 Message-Digest Algorithm https://www.rfc-editor.org/rfc/rfc1321
 */

export type Algorithm = 'sha256' | 'sha1' | 'md5' | 'sha384' | 'sha512';

/** 画面に並べる順（SHA-256 が一番上） */
export const ALGORITHMS: readonly Algorithm[] = ['sha256', 'sha1', 'md5', 'sha384', 'sha512'];

export const ALGORITHM_LABELS: Record<Algorithm, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  md5: 'MD5',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

/** 出力のバイト数 */
export const DIGEST_BYTES: Record<Algorithm, number> = {
  md5: 16,
  sha1: 20,
  sha256: 32,
  sha384: 48,
  sha512: 64,
};

export interface Hasher {
  update(data: Uint8Array): Hasher;
  /** 一度だけ呼ぶ。呼んだあとの update は想定しない */
  digest(): Uint8Array;
}

/** 64 バイト（MD5・SHA-1・SHA-256）／128 バイト（SHA-512・SHA-384）の塊で回す共通部分 */
abstract class BlockHasher implements Hasher {
  private readonly buf: Uint8Array;
  private bufLen = 0;
  private total = 0;

  constructor(
    private readonly blockSize: 64 | 128,
    private readonly littleEndianLength: boolean,
  ) {
    this.buf = new Uint8Array(blockSize);
  }

  protected abstract block(data: Uint8Array, offset: number): void;
  protected abstract output(): Uint8Array;

  update(data: Uint8Array): Hasher {
    const bs = this.blockSize;
    const n = data.length;
    this.total += n;
    let i = 0;
    if (this.bufLen > 0) {
      const take = Math.min(bs - this.bufLen, n);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      i = take;
      if (this.bufLen === bs) {
        this.block(this.buf, 0);
        this.bufLen = 0;
      }
    }
    for (; i + bs <= n; i += bs) this.block(data, i);
    if (i < n) {
      this.buf.set(data.subarray(i), 0);
      this.bufLen = n - i;
    }
    return this;
  }

  digest(): Uint8Array {
    const bs = this.blockSize;
    const lenBytes = bs / 8; // 8（64bit の長さ）または 16（128bit の長さ）
    const total = this.total;
    let padLen = bs - ((this.bufLen + 1 + lenBytes) % bs);
    if (padLen === bs) padLen = 0;
    const tail = new Uint8Array(1 + padLen + lenBytes);
    tail[0] = 0x80;
    // ビット長 = total × 8。上位と下位の 32bit に分けて書く
    const lo = ((total % 0x20000000) * 8) >>> 0;
    const hi = Math.floor(total / 0x20000000) >>> 0;
    const end = tail.length;
    if (this.littleEndianLength) {
      writeLE32(tail, end - 8, lo);
      writeLE32(tail, end - 4, hi);
    } else {
      writeBE32(tail, end - 4, lo);
      writeBE32(tail, end - 8, hi);
    }
    this.update(tail);
    return this.output();
  }
}

function writeBE32(out: Uint8Array, o: number, v: number) {
  out[o] = v >>> 24;
  out[o + 1] = (v >>> 16) & 0xff;
  out[o + 2] = (v >>> 8) & 0xff;
  out[o + 3] = v & 0xff;
}

function writeLE32(out: Uint8Array, o: number, v: number) {
  out[o] = v & 0xff;
  out[o + 1] = (v >>> 8) & 0xff;
  out[o + 2] = (v >>> 16) & 0xff;
  out[o + 3] = v >>> 24;
}

function wordsBE(words: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) writeBE32(out, i * 4, words[i]);
  return out;
}

// ---------------------------------------------------------------------------
// MD5（RFC 1321）
// ---------------------------------------------------------------------------

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/** RFC 1321 3.4 の T[i] = floor(2^32 × |sin(i)|)（i は 1 から） */
const MD5_K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0);

class Md5 extends BlockHasher {
  private h = Int32Array.of(0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476);
  private m = new Int32Array(16);

  constructor() {
    super(64, true);
  }

  protected block(d: Uint8Array, o: number) {
    const m = this.m;
    for (let j = 0; j < 16; j++) {
      const p = o + j * 4;
      m[j] = d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24);
    }
    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let dd = this.h[3];
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & dd);
        g = i;
      } else if (i < 32) {
        f = (dd & b) | (~dd & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ dd;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~dd);
        g = (7 * i) & 15;
      }
      const x = (a + f + MD5_K[i] + m[g]) | 0;
      const s = MD5_S[i];
      a = dd;
      dd = c;
      c = b;
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + dd) | 0;
  }

  protected output(): Uint8Array {
    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i++) writeLE32(out, i * 4, this.h[i]);
    return out;
  }
}

// ---------------------------------------------------------------------------
// SHA-1（FIPS 180-4 6.1）
// ---------------------------------------------------------------------------

class Sha1 extends BlockHasher {
  private h = Int32Array.of(0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0);
  private w = new Int32Array(80);

  constructor() {
    super(64, false);
  }

  protected block(d: Uint8Array, o: number) {
    const w = this.w;
    for (let t = 0; t < 16; t++) {
      const p = o + t * 4;
      w[t] = (d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3];
    }
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }
    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let dd = this.h[3];
    let e = this.h[4];
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & dd);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ dd;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & dd) | (c & dd);
        k = 0x8f1bbcdc | 0;
      } else {
        f = b ^ c ^ dd;
        k = 0xca62c1d6 | 0;
      }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0;
      e = dd;
      dd = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = tmp;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + dd) | 0;
    this.h[4] = (this.h[4] + e) | 0;
  }

  protected output(): Uint8Array {
    return wordsBE(this.h);
  }
}

// ---------------------------------------------------------------------------
// SHA-256（FIPS 180-4 6.2）
// ---------------------------------------------------------------------------

/** FIPS 180-4 4.2.2（最初の 64 個の素数の立方根の小数部の先頭 32bit） */
const SHA256_K = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
].map((x) => x | 0));

class Sha256 extends BlockHasher {
  private h = Int32Array.from(
    [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19].map((x) => x | 0),
  );
  private w = new Int32Array(64);

  constructor() {
    super(64, false);
  }

  protected block(d: Uint8Array, o: number) {
    const w = this.w;
    for (let t = 0; t < 16; t++) {
      const p = o + t * 4;
      w[t] = (d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3];
    }
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (s1 + w[t - 7] + s0 + w[t - 16]) | 0;
    }
    const h = this.h;
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let dd = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (dd + t1) | 0;
      dd = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + dd) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  protected output(): Uint8Array {
    return wordsBE(this.h);
  }
}

// ---------------------------------------------------------------------------
// SHA-512・SHA-384（FIPS 180-4 6.4・6.5）。64bit は [上位, 下位] の 32bit の組
// ---------------------------------------------------------------------------

/** FIPS 180-4 4.2.3（最初の 80 個の素数の立方根の小数部の先頭 64bit） */
const SHA512_K_HEX = [
  '428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc',
  '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118',
  'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2',
  '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694',
  'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65',
  '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5',
  '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4',
  'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70',
  '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df',
  '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b',
  'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30',
  'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8',
  '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8',
  '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3',
  '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec',
  '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b',
  'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178',
  '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b',
  '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c',
  '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817',
];

/** FIPS 180-4 5.3.5（SHA-512 の初期値） */
const SHA512_IV_HEX = [
  '6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1',
  '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179',
];

/** FIPS 180-4 5.3.4（SHA-384 の初期値） */
const SHA384_IV_HEX = [
  'cbbb9d5dc1059ed8', '629a292a367cd507', '9159015a3070dd17', '152fecd8f70e5939',
  '67332667ffc00b31', '8eb44a8768581511', 'db0c2e0d64f98fa7', '47b5481dbefa4fa4',
];

/** 16 桁の16進を [上位, 下位, 上位, 下位, …] の Int32Array に */
function splitHex64(list: string[]): Int32Array {
  const out = new Int32Array(list.length * 2);
  list.forEach((h, i) => {
    out[i * 2] = parseInt(h.slice(0, 8), 16) | 0;
    out[i * 2 + 1] = parseInt(h.slice(8), 16) | 0;
  });
  return out;
}

const SHA512_K = splitHex64(SHA512_K_HEX);
const SHA512_IV = splitHex64(SHA512_IV_HEX);
const SHA384_IV = splitHex64(SHA384_IV_HEX);

const TWO32 = 0x100000000;

class Sha512 extends BlockHasher {
  /** [a上, a下, b上, b下, …] */
  private h: Int32Array;
  private wh = new Int32Array(80);
  private wl = new Int32Array(80);

  constructor(
    iv: Int32Array,
    private readonly outBytes: 48 | 64,
  ) {
    super(128, false);
    this.h = Int32Array.from(iv);
  }

  protected block(d: Uint8Array, o: number) {
    const wh = this.wh;
    const wl = this.wl;
    for (let t = 0; t < 16; t++) {
      const p = o + t * 8;
      wh[t] = (d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3];
      wl[t] = (d[p + 4] << 24) | (d[p + 5] << 16) | (d[p + 6] << 8) | d[p + 7];
    }
    for (let t = 16; t < 80; t++) {
      // σ0(W[t-15]) = ROTR1 ^ ROTR8 ^ SHR7
      let xh = wh[t - 15];
      let xl = wl[t - 15];
      const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
      const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
      // σ1(W[t-2]) = ROTR19 ^ ROTR61 ^ SHR6
      xh = wh[t - 2];
      xl = wl[t - 2];
      const s1h = ((xh >>> 19) | (xl << 13)) ^ ((xl >>> 29) | (xh << 3)) ^ (xh >>> 6);
      const s1l = ((xl >>> 19) | (xh << 13)) ^ ((xh >>> 29) | (xl << 3)) ^ ((xl >>> 6) | (xh << 26));
      const lo = (s1l >>> 0) + (wl[t - 7] >>> 0) + (s0l >>> 0) + (wl[t - 16] >>> 0);
      wh[t] = (s1h + wh[t - 7] + s0h + wh[t - 16] + Math.floor(lo / TWO32)) | 0;
      wl[t] = lo | 0;
    }

    const h = this.h;
    let ah = h[0], al = h[1];
    let bh = h[2], bl = h[3];
    let ch = h[4], cl = h[5];
    let dh = h[6], dl = h[7];
    let eh = h[8], el = h[9];
    let fh = h[10], fl = h[11];
    let gh = h[12], gl = h[13];
    let hh = h[14], hl = h[15];

    for (let t = 0; t < 80; t++) {
      // Σ1(e) = ROTR14 ^ ROTR18 ^ ROTR41
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
      const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      // Ch(e, f, g)
      const chh = (eh & fh) ^ (~eh & gh);
      const chl = (el & fl) ^ (~el & gl);
      // T1 = h + Σ1 + Ch + K[t] + W[t]
      const t1lo = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (SHA512_K[t * 2 + 1] >>> 0) + (wl[t] >>> 0);
      const t1h = (hh + S1h + chh + SHA512_K[t * 2] + wh[t] + Math.floor(t1lo / TWO32)) | 0;
      const t1l = t1lo | 0;
      // Σ0(a) = ROTR28 ^ ROTR34 ^ ROTR39
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
      const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      // Maj(a, b, c)
      const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
      const majl = (al & bl) ^ (al & cl) ^ (bl & cl);
      const t2lo = (S0l >>> 0) + (majl >>> 0);
      const t2h = (S0h + majh + Math.floor(t2lo / TWO32)) | 0;
      const t2l = t2lo | 0;

      hh = gh; hl = gl;
      gh = fh; gl = fl;
      fh = eh; fl = el;
      const elo = (dl >>> 0) + (t1l >>> 0);
      eh = (dh + t1h + Math.floor(elo / TWO32)) | 0;
      el = elo | 0;
      dh = ch; dl = cl;
      ch = bh; cl = bl;
      bh = ah; bl = al;
      const alo = (t1l >>> 0) + (t2l >>> 0);
      ah = (t1h + t2h + Math.floor(alo / TWO32)) | 0;
      al = alo | 0;
    }

    const add = (i: number, xh: number, xl: number) => {
      const lo = (h[i + 1] >>> 0) + (xl >>> 0);
      h[i] = (h[i] + xh + Math.floor(lo / TWO32)) | 0;
      h[i + 1] = lo | 0;
    };
    add(0, ah, al);
    add(2, bh, bl);
    add(4, ch, cl);
    add(6, dh, dl);
    add(8, eh, el);
    add(10, fh, fl);
    add(12, gh, gl);
    add(14, hh, hl);
  }

  protected output(): Uint8Array {
    return wordsBE(this.h).slice(0, this.outBytes);
  }
}

export function createHasher(algorithm: Algorithm): Hasher {
  switch (algorithm) {
    case 'md5':
      return new Md5();
    case 'sha1':
      return new Sha1();
    case 'sha256':
      return new Sha256();
    case 'sha384':
      return new Sha512(SHA384_IV, 48);
    case 'sha512':
      return new Sha512(SHA512_IV, 64);
  }
}

export type Digests = Record<Algorithm, Uint8Array>;

/** 5種に同じ塊を流す係（ファイルの逐次計算用） */
export class MultiHasher {
  private readonly hashers = ALGORITHMS.map((a) => [a, createHasher(a)] as const);

  update(data: Uint8Array): this {
    for (const [, h] of this.hashers) h.update(data);
    return this;
  }

  digest(): Digests {
    const out = {} as Digests;
    for (const [a, h] of this.hashers) out[a] = h.digest();
    return out;
  }
}

/** 1つのアルゴリズムで一括計算 */
export function hashBytes(algorithm: Algorithm, data: Uint8Array): Uint8Array {
  return createHasher(algorithm).update(data).digest();
}

/** 5種を一括計算 */
export function hashAll(data: Uint8Array): Digests {
  return new MultiHasher().update(data).digest();
}

// ---------------------------------------------------------------------------
// 表示の形
// ---------------------------------------------------------------------------

export function toHex(bytes: Uint8Array, upper = false): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return upper ? s.toUpperCase() : s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
    s += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    s += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return s;
}

/** Base64 → バイト列。形が崩れていれば null */
export function fromBase64(s: string): Uint8Array | null {
  const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(t) || t.length % 4 === 1) return null;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const c of t) {
    buf = (buf << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** SRI（`<script integrity>`）の形。既定は SHA-384 */
export function toSri(bytes: Uint8Array, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha384'): string {
  return `${algorithm}-${toBase64(bytes)}`;
}

export type OutputFormat = 'hex' | 'HEX' | 'base64';

export function formatDigest(bytes: Uint8Array, format: OutputFormat): string {
  if (format === 'base64') return toBase64(bytes);
  return toHex(bytes, format === 'HEX');
}
