/**
 * QRコードの生成（モデル2・バイトモード）
 *
 * 仕様: docs/features/qr-code-seisei.md
 *
 * ブラウザ内だけで完結させるため、エンコーダをここに自前で持っている
 * （外部ライブラリ・外部APIを使わない ＝ 入力内容がどこにも送信されない）。
 * 規格は ISO/IEC 18004（公知。基本特許は失効済み）。
 * 「QRコード」はデンソーウェーブの登録商標なので、画面には脚注を入れる。
 *
 * 扱う範囲を絞ってある:
 * - モデル2・**バイトモード（UTF-8）のみ**。数字・英数字モードの詰め込みはしない。
 *   URLやWi-Fi設定が主な用途で、詰め込んでも版数が1つ縮む程度のため
 * - 誤り訂正レベルは **M / Q のみ**（画面の切り替えに合わせている）
 * - 版数（バージョン）は 1〜40 を自動選択する
 *
 * DOM にも React にも依存しない純関数だけを置くこと（描画は app/qr-code/ 側）。
 */

/** 誤り訂正レベル。M＝約15%、Q＝約25%まで復元できる */
export type EcLevel = 'M' | 'Q';

/** 生成結果。modules[y][x] が true のマスを黒で塗る */
export interface QrCode {
  /** 版数（1〜40）。大きいほどマスが細かくなる */
  version: number;
  ecLevel: EcLevel;
  /** 選ばれたマスクパターン（0〜7） */
  mask: number;
  /** 一辺のマス数（4×版数+17） */
  size: number;
  /** 明暗のマス。true が黒 */
  modules: boolean[][];
}

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/**
 * 版数ごとの1ブロックあたりの誤り訂正コード語数（ISO/IEC 18004 の表9）。
 * 添字は版数（0番は未使用）。
 *
 * 【データ更新箇所】規格の表そのものなので改定されることはない。
 */
const EC_CODEWORDS_PER_BLOCK: Record<EcLevel, number[]> = {
  //  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25  26  27  28  29  30  31  32  33  34  35  36  37  38  39  40
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

/** 版数ごとの誤り訂正ブロック数（同上）。添字は版数（0番は未使用） */
const EC_BLOCKS: Record<EcLevel, number[]> = {
  //  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
};

/** 形式情報に埋める誤り訂正レベルの符号（規格どおり。M=00, Q=11） */
const EC_FORMAT_BITS: Record<EcLevel, number> = { M: 0b00, Q: 0b11 };

/** マスクの評価に使う減点の重み（規格の N1〜N4） */
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** ビット列の i ビット目（下位から数える）を取り出す */
function getBit(value: number, i: number): boolean {
  return ((value >>> i) & 1) !== 0;
}

/**
 * 版数ごとの、機能パターン（位置検出・タイミング・形式情報など）を除いたマス数。
 * ここからコード語の総数が決まる。
 */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignCount = Math.floor(version / 7) + 2;
    // 位置合わせパターンの分を引く（タイミングパターンと重なる分は戻す）
    result -= (25 * alignCount - 10) * alignCount - 55;
    // 版数7以上は版数情報（18マス×2）が入る
    if (version >= 7) result -= 36;
  }
  return result;
}

/** 版数ごとのコード語（8ビット）の総数。データ＋誤り訂正の合計 */
export function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

/** 版数・誤り訂正レベルごとに入れられるデータのコード語数 */
export function dataCodewords(version: number, ec: EcLevel): number {
  return totalCodewords(version) - EC_CODEWORDS_PER_BLOCK[ec][version] * EC_BLOCKS[ec][version];
}

/** 文字数指示子のビット数。バイトモードは版数9以下で8ビット、10以上で16ビット */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** その版数・レベルに入れられる最大バイト数（モード指示子と文字数指示子を除いた分） */
export function capacityBytes(version: number, ec: EcLevel): number {
  const bits = dataCodewords(version, ec) * 8 - 4 - charCountBits(version);
  return Math.max(0, Math.floor(bits / 8));
}

/** 版数40まで使ったときの上限バイト数。画面の「入れすぎ」判定に使う */
export function maxBytes(ec: EcLevel): number {
  return capacityBytes(MAX_VERSION, ec);
}

/** 文字列のUTF-8バイト列。QRに入るのは文字数ではなくバイト数なので、ここで換算する */
export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * データが収まる最小の版数。収まらなければ null。
 * 版数が上がると文字数指示子が8→16ビットに増えるので、版数ごとに判定する。
 */
export function chooseVersion(byteLength: number, ec: EcLevel): number | null {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    if (byteLength <= capacityBytes(version, ec)) return version;
  }
  return null;
}

/**
 * 位置合わせパターンの中心座標。版数1は無し。
 * 6 から始まり、右下端（4×版数+10）から等間隔に置く（規格の表E.1と一致する）。
 */
export function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  // 版数32だけ規格の表と式が合わないので個別に持つ（規格側の例外）
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ---------------------------------------------------------------------------
// ガロア体 GF(256) 上の演算とリード・ソロモン符号
// ---------------------------------------------------------------------------

/** GF(256) の掛け算。原始多項式は規格が定める 0x11D */
function gfMultiply(a: number, b: number): number {
  let result = 0;
  for (let i = 7; i >= 0; i--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((b >>> i) & 1) * a;
  }
  return result & 0xff;
}

/** 誤り訂正コード語を degree 個作るための生成多項式 */
function rsGeneratorPolynomial(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** データのコード語列から誤り訂正コード語を計算する（多項式の剰余） */
export function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const generator = rsGeneratorPolynomial(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < degree; i++) result[i] ^= gfMultiply(generator[i], factor);
  }
  return result;
}

// ---------------------------------------------------------------------------
// データのビット列化とブロックの並べ替え
// ---------------------------------------------------------------------------

/**
 * バイト列をデータコード語に変換する。
 * モード指示子（バイトモード=0100）→ 文字数 → 本体 → 終端 → 埋め草（0xEC/0x11）。
 */
export function toDataCodewords(bytes: Uint8Array, version: number, ec: EcLevel): number[] {
  const capacity = dataCodewords(version, ec) * 8;
  const bits: boolean[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push(getBit(value, i));
  };

  push(0b0100, 4);
  push(bytes.length, charCountBits(version));
  for (const byte of bytes) push(byte, 8);

  // 終端パターン。残りが4ビット未満なら入るだけ
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(false);
  // コード語の区切りまで0で埋める
  while (bits.length % 8 !== 0) bits.push(false);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    codewords.push(byte);
  }
  // 残りは 0xEC / 0x11 を交互に（規格が定める埋め草のコード語）
  for (let pad = 0xec; codewords.length < capacity / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

/**
 * ブロックごとに誤り訂正を付け、規格の順序（インターリーブ）で並べ直す。
 *
 * ブロックの長さは最大で1コード語しか違わないので、短いブロックの数から
 * 分け方を導ける（版数ごとの分割表を持たずに済む）。
 */
export function interleaveBlocks(data: readonly number[], version: number, ec: EcLevel): number[] {
  const blockCount = EC_BLOCKS[ec][version];
  const ecLength = EC_CODEWORDS_PER_BLOCK[ec][version];
  const total = totalCodewords(version);
  const shortBlockCount = blockCount - (total % blockCount);
  const shortBlockLength = Math.floor(total / blockCount) - ecLength;

  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let i = 0, offset = 0; i < blockCount; i++) {
    const length = shortBlockLength + (i < shortBlockCount ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    blocks.push(block);
    ecBlocks.push(reedSolomonRemainder(block, ecLength));
  }

  const result: number[] = [];
  // データ部：各ブロックの同じ位置を順に拾う。最後の1つは長いブロックにしかない
  for (let i = 0; i < shortBlockLength + 1; i++) {
    for (const [index, block] of blocks.entries()) {
      if (i < shortBlockLength || index >= shortBlockCount) result.push(block[i]);
    }
  }
  // 誤り訂正部：長さがそろっているのでそのまま縦に拾う
  for (let i = 0; i < ecLength; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// マスへの配置
// ---------------------------------------------------------------------------

/** 8つのマスクパターン（規格の表10）。true のマスを反転する */
const MASK_FUNCTIONS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** 描画の作業用。機能パターンかどうかを覚えておき、データとマスクを避ける */
class Canvas {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(readonly version: number, readonly ecLevel: EcLevel) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private setFunction(x: number, y: number, dark: boolean) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  /** 位置検出パターン（3隅の四角）。分離パターン（白枠）も同時に置く */
  private drawFinder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(cx + dx, cy + dy, distance !== 2 && distance !== 4);
      }
    }
  }

  /** 位置合わせパターン（版数2以上の小さい四角） */
  private drawAlignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFunctionPatterns() {
    // タイミングパターン（白黒の点線）
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }

    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const positions = alignmentPatternPositions(this.version);
    for (const [i, cx] of positions.entries()) {
      for (const [j, cy] of positions.entries()) {
        // 3隅は位置検出パターンと重なるので置かない
        const corner =
          (i === 0 && j === 0) ||
          (i === 0 && j === positions.length - 1) ||
          (i === positions.length - 1 && j === 0);
        if (!corner) this.drawAlignment(cx, cy);
      }
    }

    // 形式情報の場所を機能パターンとして確保する（中身はマスク確定後に入れ直す）
    this.drawFormatBits(0);
    this.drawVersionBits();
  }

  /** 形式情報（誤り訂正レベル＋マスク番号）をBCH符号にして2か所へ */
  drawFormatBits(mask: number) {
    const data = (EC_FORMAT_BITS[this.ecLevel] << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;

    // 左上（位置検出パターンの内側を回り込む）
    for (let i = 0; i <= 5; i++) this.setFunction(8, i, getBit(bits, i));
    this.setFunction(8, 7, getBit(bits, 6));
    this.setFunction(8, 8, getBit(bits, 7));
    this.setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, getBit(bits, i));

    // 右上と左下（同じ15ビットの複製）
    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, getBit(bits, i));
    // 常に黒のマス（規格で決まっている）
    this.setFunction(8, this.size - 8, true);
  }

  /** 版数情報（版数7以上）。左下と右上に18ビットずつ */
  private drawVersionBits() {
    if (this.version < 7) return;
    let remainder = this.version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (this.version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const dark = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  /** コード語を右下から2列ずつジグザグに詰める */
  drawCodewords(codewords: readonly number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      // 6列目は縦のタイミングパターンなので飛ばす
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (!this.isFunction[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
            i++;
          }
          // 余りビット（remainder bits）は0のまま置いておく
        }
      }
    }
  }

  /** マスクを掛ける／外す（XORなので同じ呼び出しで戻る） */
  applyMask(mask: number) {
    const fn = MASK_FUNCTIONS[mask];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y][x] && fn(x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** 読み取りにくい並びへの減点（規格の4つの規則）。小さいほど良い */
  penaltyScore(): number {
    let result = 0;
    const size = this.size;

    // 規則1・3：同じ色の連続と、位置検出パターンに似た並び（1:1:3:1:1）
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runLength = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runLength++;
          if (runLength === 5) result += PENALTY_N1;
          else if (runLength > 5) result++;
        } else {
          this.addRunHistory(runLength, history);
          if (!runColor) result += this.countFinderLike(history) * PENALTY_N3;
          runColor = this.modules[y][x];
          runLength = 1;
        }
      }
      result += this.terminateRun(runColor, runLength, history) * PENALTY_N3;
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runLength = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (this.modules[y][x] === runColor) {
          runLength++;
          if (runLength === 5) result += PENALTY_N1;
          else if (runLength > 5) result++;
        } else {
          this.addRunHistory(runLength, history);
          if (!runColor) result += this.countFinderLike(history) * PENALTY_N3;
          runColor = this.modules[y][x];
          runLength = 1;
        }
      }
      result += this.terminateRun(runColor, runLength, history) * PENALTY_N3;
    }

    // 規則2：同じ色の2×2のかたまり
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = this.modules[y][x];
        if (
          color === this.modules[y][x + 1] &&
          color === this.modules[y + 1][x] &&
          color === this.modules[y + 1][x + 1]
        ) {
          result += PENALTY_N2;
        }
      }
    }

    // 規則4：白黒の割合が50%から離れているほど減点
    let dark = 0;
    for (const row of this.modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return result + k * PENALTY_N4;
  }

  /** 直近7本の連続長を覚えておく（先頭の白は余白があるものとして扱う） */
  private addRunHistory(runLength: number, history: number[]) {
    let length = runLength;
    if (history[0] === 0) length += this.size;
    history.pop();
    history.unshift(length);
  }

  /** 1:1:3:1:1 に4倍以上の白が付いた並びの数（0〜2） */
  private countFinderLike(history: readonly number[]): number {
    const n = history[1];
    const core =
      n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (
      (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
      (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
    );
  }

  /** 行・列の終端。端の外側は白の余白として数える */
  private terminateRun(runColor: boolean, runLength: number, history: number[]): number {
    let length = runLength;
    if (runColor) {
      this.addRunHistory(length, history);
      length = 0;
    }
    length += this.size;
    this.addRunHistory(length, history);
    return this.countFinderLike(history);
  }
}

/** 入力が長すぎて版数40にも収まらないときに投げる */
export class QrCapacityError extends Error {
  constructor(readonly byteLength: number, readonly limit: number) {
    super(`入力が長すぎます（${byteLength}バイト。上限は${limit}バイト）`);
    this.name = 'QrCapacityError';
  }
}

/**
 * 文字列からQRコードを作る。
 *
 * @param text 埋め込む文字列（UTF-8のバイト列として入る）
 * @param ecLevel 誤り訂正レベル。既定はM（約15%まで復元できる）
 * @param forcedMask マスク（0〜7）を固定する。**テスト用**。
 *   省略すると規格どおり減点の少ないものを選ぶ
 * @throws {QrCapacityError} 版数40にも収まらない長さのとき
 */
export function encodeQr(text: string, ecLevel: EcLevel = 'M', forcedMask?: number): QrCode {
  const bytes = utf8Bytes(text);
  const version = chooseVersion(bytes.length, ecLevel);
  if (version === null) throw new QrCapacityError(bytes.length, maxBytes(ecLevel));

  const codewords = interleaveBlocks(toDataCodewords(bytes, version, ecLevel), version, ecLevel);

  const canvas = new Canvas(version, ecLevel);
  canvas.drawFunctionPatterns();
  canvas.drawCodewords(codewords);

  // 8つのマスクを順に試し、減点がいちばん小さいものを採る（規格の決め方）
  let bestMask = forcedMask ?? 0;
  let bestPenalty = Infinity;
  for (let mask = 0; forcedMask === undefined && mask < 8; mask++) {
    canvas.applyMask(mask);
    canvas.drawFormatBits(mask);
    const penalty = canvas.penaltyScore();
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    canvas.applyMask(mask); // XORなので同じマスクを掛け直すと元に戻る
  }
  canvas.applyMask(bestMask);
  canvas.drawFormatBits(bestMask);

  return {
    version,
    ecLevel,
    mask: bestMask,
    size: canvas.size,
    modules: canvas.modules,
  };
}

// ---------------------------------------------------------------------------
// 出力（SVG）
// ---------------------------------------------------------------------------

/** 静かな余白（クワイエットゾーン）の既定値。規格は4マス以上を求めている */
export const QUIET_ZONE = 4;

/**
 * 黒いマスをまとめた SVG の path データ。
 * 1マス1つの `<rect>` にすると版数40で1万個を超えるので、path 1本にまとめている。
 * 画面表示（app/qr-code/）とダウンロード用SVGの両方がこれを使う。
 */
export function qrPathData(qr: QrCode, quietZone: number = QUIET_ZONE): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) {
        x++;
        continue;
      }
      // 横に続く黒を1つの長方形にまとめる（path を短くするため）
      let run = 1;
      while (x + run < qr.size && qr.modules[y][x + run]) run++;
      parts.push(`M${x + quietZone} ${y + quietZone}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join('');
}

/** SVG の一辺（マス数。余白込み） */
export function qrViewBoxSize(qr: QrCode, quietZone: number = QUIET_ZONE): number {
  return qr.size + quietZone * 2;
}

/**
 * ダウンロード用のSVG文字列。
 * 拡大しても粗くならないので、印刷用にはこちらを使ってもらう。
 */
export function qrToSvg(
  qr: QrCode,
  options: { quietZone?: number; dark?: string; light?: string } = {},
): string {
  const { quietZone = QUIET_ZONE, dark = '#000000', light = '#ffffff' } = options;
  const side = qrViewBoxSize(qr, quietZone);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 8}" height="${side * 8}" shape-rendering="crispEdges">`,
    `<rect width="${side}" height="${side}" fill="${light}"/>`,
    `<path d="${qrPathData(qr, quietZone)}" fill="${dark}"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Wi-Fi設定のQR（WIFI: スキーム）
// ---------------------------------------------------------------------------

/** Wi-Fiの暗号化方式。nopass は暗号化なし（パスワード欄を使わない） */
export type WifiAuth = 'WPA' | 'WEP' | 'nopass';

export interface WifiInput {
  ssid: string;
  password?: string;
  auth?: WifiAuth;
  /** ステルスSSID（ビーコンを出さない設定）のとき true */
  hidden?: boolean;
}

/**
 * `WIFI:` スキームで使えない文字を退避する。
 * `\ ; , : "` はそのまま書くと区切りとして読まれるため、バックスラッシュを前に置く。
 */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * Wi-Fi設定QRの文字列を組み立てる。
 *
 * Android・iOS（iOS 11以降）のカメラが解釈する事実上の標準形式で、
 * 規格化された仕様書があるわけではない。並びは `T`（方式）→`S`（SSID）→
 * `P`（パスワード）→`H`（ステルス）で、末尾は `;;` で閉じる。
 */
export function wifiPayload({ ssid, password = '', auth = 'WPA', hidden = false }: WifiInput): string {
  const parts = [`T:${auth}`, `S:${escapeWifi(ssid)}`];
  // 暗号化なしのときはパスワードを入れない（空の P: を嫌う端末がある）
  if (auth !== 'nopass' && password !== '') parts.push(`P:${escapeWifi(password)}`);
  if (hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}
