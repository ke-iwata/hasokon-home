import { describe, expect, it } from 'vitest';
import {
  alignmentPatternPositions,
  capacityBytes,
  chooseVersion,
  dataCodewords,
  encodeQr,
  interleaveBlocks,
  maxBytes,
  QrCapacityError,
  qrPathData,
  qrToSvg,
  qrViewBoxSize,
  QUIET_ZONE,
  reedSolomonRemainder,
  toDataCodewords,
  totalCodewords,
  utf8Bytes,
  wifiPayload,
  type EcLevel,
  type QrCode,
} from '@/lib/qr-code';

/**
 * QRコード生成（lib/qr-code.ts）のテスト。
 *
 * 仕様: docs/features/qr-code-seisei.md
 *
 * このツールだけは「出力が正しいかを目で見て確かめられない」のが特徴で、
 * 少しずれた盤面でもそれらしく見えてしまう。**間違ったQRを配ると、
 * 印刷して配布されたあとに気づくことになる**ので、次の4方向から固める。
 *
 * 1. **規格の表と突き合わせる** — コード語数・容量・位置合わせパターンの座標は
 *    ISO/IEC 18004 が定める値そのもの。実装が導出している式が正しいかを見る
 * 2. **既知のベクタ** — リード・ソロモンは規格の付属書にある計算例と一致すること
 * 3. **別実装との一致（ゴールデン）** — 実績のある実装（npm の qrcode）が出した
 *    盤面と1マスも違わないこと。マスクは固定して比べる（マスクの選び方は
 *    実装ごとに解釈の差があり、どれを選んでも読み取りには影響しないため）
 * 4. **盤面からの読み戻し** — 出来上がった盤面をこのテスト側で独立に解釈し直し
 *    （機能パターンの位置をここでも規格から組み立て直す）、
 *    符号化したコード語が復元できること。配置・マスク・形式情報の取り違えを検知する
 */

// ---------------------------------------------------------------------------
// 1. 規格の表との突き合わせ
// ---------------------------------------------------------------------------

describe('コード語数と容量（規格の表）', () => {
  it('版数ごとのコード語の総数が規格どおり', () => {
    // ISO/IEC 18004 表7（総コード語数）の抜粋
    expect(totalCodewords(1)).toBe(26);
    expect(totalCodewords(2)).toBe(44);
    expect(totalCodewords(7)).toBe(196);
    expect(totalCodewords(40)).toBe(3706);
  });

  it('データコード語数が規格どおり（誤り訂正の分を引いた残り）', () => {
    expect(dataCodewords(1, 'M')).toBe(16);
    expect(dataCodewords(1, 'Q')).toBe(13);
    expect(dataCodewords(40, 'M')).toBe(2334);
    expect(dataCodewords(40, 'Q')).toBe(1666);
  });

  /** 公表されている「バイトモードの最大文字数」の表と一致すること */
  it('バイトモードの容量が規格の表と一致する', () => {
    expect([1, 2, 3, 10, 40].map((v) => capacityBytes(v, 'M'))).toEqual([14, 26, 42, 213, 2331]);
    expect([1, 2, 3, 10, 40].map((v) => capacityBytes(v, 'Q'))).toEqual([11, 20, 32, 151, 1663]);
    expect(maxBytes('M')).toBe(2331);
    expect(maxBytes('Q')).toBe(1663);
  });

  it('入るなら最小の版数を選ぶ（1バイト増えると版数が上がる）', () => {
    expect(chooseVersion(14, 'M')).toBe(1);
    expect(chooseVersion(15, 'M')).toBe(2);
    expect(chooseVersion(11, 'Q')).toBe(1);
    expect(chooseVersion(12, 'Q')).toBe(2);
  });

  it('版数40にも入らない長さは null（呼び出し側で断る）', () => {
    expect(chooseVersion(2332, 'M')).toBeNull();
    expect(chooseVersion(1664, 'Q')).toBeNull();
  });

  /**
   * 版数9と10の境目で文字数指示子が8→16ビットに増える。
   * ここを取り違えると、長い入力だけが読めないQRになる（気づきにくい）
   */
  it('版数10で文字数指示子が16ビットに増える分、容量が2バイト減る形になっている', () => {
    expect(dataCodewords(9, 'M') * 8 - 4 - 8).toBe(capacityBytes(9, 'M') * 8 + 4);
    expect(capacityBytes(10, 'M')).toBe(Math.floor((dataCodewords(10, 'M') * 8 - 4 - 16) / 8));
  });
});

describe('位置合わせパターンの座標（規格の表E.1）', () => {
  it('版数1には無い', () => {
    expect(alignmentPatternPositions(1)).toEqual([]);
  });

  it('規格の表と一致する', () => {
    expect(alignmentPatternPositions(2)).toEqual([6, 18]);
    expect(alignmentPatternPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPatternPositions(14)).toEqual([6, 26, 46, 66]);
    // 版数32だけは等間隔の式に乗らない（規格側の例外）
    expect(alignmentPatternPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPatternPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  it('個数は 版数/7 + 2 で、右下端はシンボルの端から6マス', () => {
    for (let version = 2; version <= 40; version++) {
      const positions = alignmentPatternPositions(version);
      expect(positions).toHaveLength(Math.floor(version / 7) + 2);
      expect(positions[0]).toBe(6);
      expect(positions[positions.length - 1]).toBe(version * 4 + 10);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. リード・ソロモン（既知のベクタ）
// ---------------------------------------------------------------------------

describe('リード・ソロモン符号', () => {
  /**
   * ISO/IEC 18004 の計算例（版数1・レベルM・数字モードの "01234567"）。
   * データコード語からこの10個の誤り訂正コード語が出ることは規格の付属書に載っている。
   */
  it('規格の計算例と一致する', () => {
    const data = [
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec,
      0x11,
    ];
    expect(reedSolomonRemainder(data, 10)).toEqual([
      0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55,
    ]);
  });

  it('求めた個数だけ返す', () => {
    expect(reedSolomonRemainder([0x40, 0x18, 0xac], 13)).toHaveLength(13);
    expect(reedSolomonRemainder([0x40, 0x18, 0xac], 30)).toHaveLength(30);
  });

  it('データが1バイト違えば誤り訂正コード語も変わる', () => {
    const a = reedSolomonRemainder([0x40, 0x18, 0xac, 0x00], 10);
    const b = reedSolomonRemainder([0x40, 0x18, 0xac, 0x01], 10);
    expect(a).not.toEqual(b);
  });
});

describe('データコード語', () => {
  it('モード指示子・文字数・本文・埋め草の順に並ぶ', () => {
    // 'A'（0x41）1文字。0100（バイトモード）+ 00000001（1文字）+ 01000001
    const codewords = toDataCodewords(utf8Bytes('A'), 1, 'M');
    expect(codewords.slice(0, 3)).toEqual([0x40, 0x14, 0x10]);
    // 残りは 0xEC / 0x11 の繰り返しで、データコード語数ちょうどまで埋まる
    expect(codewords).toHaveLength(dataCodewords(1, 'M'));
    expect(codewords.slice(3, 7)).toEqual([0xec, 0x11, 0xec, 0x11]);
  });

  it('ちょうど入りきるときは埋め草が入らない', () => {
    const codewords = toDataCodewords(utf8Bytes('x'.repeat(14)), 1, 'M');
    expect(codewords).toHaveLength(16);
    expect(codewords.filter((c) => c === 0xec)).toHaveLength(0);
  });

  it('日本語はUTF-8のバイト数で数える（1文字3バイト）', () => {
    expect(utf8Bytes('あ')).toHaveLength(3);
    expect(chooseVersion(utf8Bytes('あ'.repeat(5)).length, 'M')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. 別実装との一致（ゴールデン）
// ---------------------------------------------------------------------------

/**
 * 実績のある別実装（npm の qrcode 1.5.4。バイトモードを指定して生成）の出力。
 *
 * **マスクは向こうが選んだ番号に固定して比べている。** マスクの評価規則は
 * 実装ごとに解釈の差があり（シンボルの外側を明領域として数えるかなど）、
 * どれを選んでも読み取りには影響しないため、ここでは盤面そのものの一致を見る。
 */
const GOLDEN: { label: string; text: string; ec: EcLevel; version: number; mask: number; rows: string[] }[] = [
  {
    label: '短い英数字（版数1）',
    text: 'hasokon',
    ec: 'M',
    version: 1,
    mask: 2,
    rows: [
      '#######..##...#######',
      '#.....#....##.#.....#',
      '#.###.#.#.#.#.#.###.#',
      '#.###.#.##.##.#.###.#',
      '#.###.#.#...#.#.###.#',
      '#.....#.#..#..#.....#',
      '#######.#.#.#.#######',
      '........#............',
      '#.#####..#.#..#####..',
      '###.##.#.#######..#.#',
      '....###..#..#.##.###.',
      '..#.#....##########..',
      '.#.#..#..#..#...##..#',
      '........##..#..##.#.#',
      '#######....#.#...#.#.',
      '#.....#.#.#.....#####',
      '#.###.#.##.#.#..#..#.',
      '#.###.#.##########...',
      '#.###.#.#...#.#..#...',
      '#.....#....####.###..',
      '#######.#...#..##..#.',
    ],
  },
  {
    label: 'URL（版数3）',
    text: 'https://hasokon.com/tools/qr-code/',
    ec: 'M',
    version: 3,
    mask: 2,
    rows: [
      '#######..#.#####.####.#######',
      '#.....#..#.#######..#.#.....#',
      '#.###.#.#.#..#.#...##.#.###.#',
      '#.###.#.#####.##.#.#..#.###.#',
      '#.###.#.##.##..######.#.###.#',
      '#.....#.#.............#.....#',
      '#######.#.#.#.#.#.#.#.#######',
      '........#####.#.#.#.#........',
      '#.#####...#.#....#..#.#####..',
      '...#.#.#.#.#.###...######...#',
      '#..#..#...##.######.####.....',
      '.....#...##.##..#..##.##.#.#.',
      '##.####.#.....#..###.....##..',
      '##.#.#...#.......###.####...#',
      '......######...###..#.##.##..',
      '##.##......#..###...#.#.#..#.',
      '#.##.##..#.##..#.#.#...#.##..',
      '#..##..##.#..##.#..######.#.#',
      '#....###....####..#.#.###.#..',
      '#.#.#..#######.##..####.#..#.',
      '#.##.##..####.##.#.######.###',
      '........##.#....#...#...#####',
      '#######..##....######.#.###..',
      '#.....#.#...#.#.#.###...#..##',
      '#.###.#.#...#....##.#####.##.',
      '#.###.#.#..####.######...####',
      '#.###.#.#......##....#######.',
      '#.....#.............#.#.##.#.',
      '#######.##..#..#.#.#.##...#..',
    ],
  },
  {
    label: 'Wi-Fi設定・レベルQ（版数5）',
    text: 'WIFI:T:WPA;S:hasokon-guest;P:pa\\;ss\\,word;H:true;;',
    ec: 'Q',
    version: 5,
    mask: 7,
    rows: [
      '#######.###.##.###.#..#..#.#..#######',
      '#.....#..#.#..#...#.#.#...##..#.....#',
      '#.###.#.###..#....##.......#..#.###.#',
      '#.###.#.####..#...#.#...#.###.#.###.#',
      '#.###.#..#.#.#...########...#.#.###.#',
      '#.....#.##...#..##.#.......#..#.....#',
      '#######.#.#.#.#.#.#.#.#.#.#.#.#######',
      '........#.#.##..#....#.###..#........',
      '.#.#.####...#.#.#......#..##.###.##.#',
      '##.............##..#..#..#.#..##.#.##',
      '..#.#.###.#.#####...##..#...#.....###',
      '##.#.#..#.####.#.#...##.##.#.#.#.....',
      '#....#####..##..###.#.......#.##.#..#',
      '.#..##.##.###...#....####.#.#.##..#.#',
      '.#....###.#.#.....##..##..#.#..###..#',
      '#......#.#.##.#####.###..####.###....',
      '##...#####.###.###.....#...#.###....#',
      '#.#....#.###....#.....#..##.#.#.##.#.',
      '###.#.#...##.##.##.####..#....##.#.##',
      '...###.#.#.....####..###..##..#.#.###',
      '###...#.#.##..#....###.#####..#....##',
      '.......#.###...##.####..##....#..#..#',
      '....#.######..#.........###....#.#.##',
      '.#.##..##.#...#.#.#..#.#.#.####.#....',
      '##.##.##..###.#.#..####...#.#.##.####',
      '.##.....#..#....##.##...#.##.#....#.#',
      '#.....#..#####...##.#.##...###.#.##.#',
      '.#...#.#..#..#.#####.#...#..###....##',
      '###.######..####.#####...#.######.#..',
      '........#..#.##...##..##.##.#...###.#',
      '#######.###....##...##......#.#.#####',
      '#.....#.###.#.#.###.#.##..#.#...#.##.',
      '#.###.#....#.##..#.##..####.#####.##.',
      '#.###.#.####.#..##.#...##.#.#...#.#.#',
      '#.###.#...#..#.....#.#.##....######.#',
      '#.....#.##..#..##.####.###.######....',
      '#######..#.###.#.#...#.#.#..#..#...##',
    ],
  },
];

/** 盤面を '#'（黒）と '.'（白）の行に直す。ゴールデンと見比べるため */
function toRows(qr: QrCode): string[] {
  return qr.modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));
}

describe('別実装との一致（ゴールデン）', () => {
  for (const golden of GOLDEN) {
    it(`${golden.label}: 1マスも違わない`, () => {
      const qr = encodeQr(golden.text, golden.ec, golden.mask);
      expect(qr.version).toBe(golden.version);
      expect(qr.size).toBe(golden.version * 4 + 17);
      expect(toRows(qr)).toEqual(golden.rows);
    });
  }

  it('Wi-Fi設定の文字列はゴールデンの入力と同じものを組み立てている', () => {
    expect(
      wifiPayload({ ssid: 'hasokon-guest', password: 'pa;ss,word', auth: 'WPA', hidden: true }),
    ).toBe(GOLDEN[2].text);
  });
});

// ---------------------------------------------------------------------------
// 4. 盤面からの読み戻し
// ---------------------------------------------------------------------------

/**
 * 機能パターン（データが入らないマス）の位置を、テスト側でも規格から組み立て直す。
 * lib の内部を借りずに独立に作ることで、配置のずれを検知できるようにしている。
 */
function functionModuleMap(version: number): boolean[][] {
  const size = version * 4 + 17;
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) map[y][x] = true;
  };

  // 位置検出パターン＋分離パターン（8×8）と、その隣の形式情報
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      mark(i, j);
      mark(size - 1 - i, j);
      mark(i, size - 1 - j);
    }
  }
  // 形式情報（左上のL字と、右上・左下の帯）
  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(size - 1 - i, 8);
    mark(8, size - 1 - i);
  }
  // タイミングパターン
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  // 位置合わせパターン（3隅は位置検出パターンと重なるので置かれない）
  const positions = alignmentPatternPositions(version);
  for (const [i, cx] of positions.entries()) {
    for (const [j, cy] of positions.entries()) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy);
    }
  }
  // 版数情報（版数7以上）
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(a, b);
      mark(b, a);
    }
  }
  return map;
}

/** 規格のマスク条件（i＝行, j＝列）。lib とは別に書き下している */
const MASK_RULES: ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** 左上に置かれた15ビットの形式情報を読み、誤り訂正レベルとマスク番号に戻す */
function readFormatInfo(qr: QrCode): { ecBits: number; mask: number } {
  const dark = (x: number, y: number) => (qr.modules[y][x] ? 1 : 0);
  let bits = 0;
  const set = (i: number, value: number) => {
    if (value) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i++) set(i, dark(8, i));
  set(6, dark(8, 7));
  set(7, dark(8, 8));
  set(8, dark(7, 8));
  for (let i = 9; i < 15; i++) set(i, dark(14 - i, 8));
  const data = (bits ^ 0x5412) >>> 10;
  return { ecBits: data >>> 3, mask: data & 7 };
}

/** 盤面を読み、埋め込まれているコード語（インターリーブ後）を取り出す */
function readCodewords(qr: QrCode): number[] {
  const map = functionModuleMap(qr.version);
  const rule = MASK_RULES[qr.mask];
  const bits: number[] = [];
  for (let right = qr.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < qr.size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? qr.size - 1 - vertical : vertical;
        if (map[y][x]) continue;
        // マスクを外す（XORなので同じ条件をもう一度当てれば戻る）
        const value = (qr.modules[y][x] ? 1 : 0) ^ (rule(y, x) ? 1 : 0);
        bits.push(value);
      }
    }
  }
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  return codewords;
}

const ROUND_TRIP: { label: string; text: string }[] = [
  { label: '1文字', text: 'a' },
  { label: 'URL', text: 'https://hasokon.com/tools/qr-code/' },
  { label: '日本語', text: 'こんにちは、世界。QRコードのテストです。' },
  { label: '絵文字・サロゲートペア', text: '𩸽と🍣を含む文字列' },
  { label: 'Wi-Fi設定', text: wifiPayload({ ssid: 'ハソコン Wi-Fi', password: 'a;b,c', hidden: true }) },
  { label: '版数10以上（文字数指示子16ビット）', text: 'x'.repeat(300) },
  { label: '大きい版数（複数ブロック）', text: 'あ'.repeat(400) },
];

describe('盤面からの読み戻し', () => {
  for (const ec of ['M', 'Q'] as EcLevel[]) {
    for (const { label, text } of ROUND_TRIP) {
      it(`${ec}: ${label} — 符号化したコード語がそのまま並んでいる`, () => {
        const qr = encodeQr(text, ec);
        const expected = interleaveBlocks(
          toDataCodewords(utf8Bytes(text), qr.version, ec),
          qr.version,
          ec,
        );
        expect(readCodewords(qr).slice(0, expected.length)).toEqual(expected);
      });

      it(`${ec}: ${label} — 形式情報がレベルとマスクを指している`, () => {
        const qr = encodeQr(text, ec);
        const { ecBits, mask } = readFormatInfo(qr);
        expect(ecBits).toBe(ec === 'M' ? 0b00 : 0b11);
        expect(mask).toBe(qr.mask);
      });
    }
  }

  it('選ばれるマスクは0〜7で、入力が同じなら毎回同じものになる', () => {
    for (const { text } of ROUND_TRIP) {
      const first = encodeQr(text, 'M');
      const second = encodeQr(text, 'M');
      expect(first.mask).toBeGreaterThanOrEqual(0);
      expect(first.mask).toBeLessThanOrEqual(7);
      expect(toRows(second)).toEqual(toRows(first));
    }
  });
});

describe('盤面の構造', () => {
  const qr = encodeQr('https://hasokon.com/tools/qr-code/', 'M');

  it('一辺は 4×版数+17 マス', () => {
    expect(qr.size).toBe(qr.version * 4 + 17);
    expect(qr.modules).toHaveLength(qr.size);
    for (const row of qr.modules) expect(row).toHaveLength(qr.size);
  });

  it('3隅に位置検出パターン（黒7×7・白枠・黒3×3）がある', () => {
    const corners: [number, number][] = [
      [0, 0],
      [qr.size - 7, 0],
      [0, qr.size - 7],
    ];
    for (const [ox, oy] of corners) {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          expect(qr.modules[oy + dy][ox + dx]).toBe(ring || core);
        }
      }
    }
  });

  it('タイミングパターンが白黒の交互になっている', () => {
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.modules[6][i]).toBe(i % 2 === 0);
      expect(qr.modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('常に黒のマス（左下の形式情報の上）が黒になっている', () => {
    expect(qr.modules[qr.size - 8][8]).toBe(true);
  });

  it('位置検出パターンの周りは白（分離パターン）', () => {
    for (let i = 0; i < 8; i++) {
      expect(qr.modules[7][i]).toBe(false);
      expect(qr.modules[i][7]).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. 入力の受け付けと Wi-Fi
// ---------------------------------------------------------------------------

describe('入力の受け付け', () => {
  it('空文字でも作れる（画面側で作らせない判断をするため、libは投げない）', () => {
    expect(encodeQr('', 'M').version).toBe(1);
  });

  it('版数40にも入らない長さは QrCapacityError', () => {
    expect(() => encodeQr('x'.repeat(2332), 'M')).toThrow(QrCapacityError);
    expect(() => encodeQr('x'.repeat(1664), 'Q')).toThrow(QrCapacityError);
    // 上限ちょうどは通る
    expect(encodeQr('x'.repeat(2331), 'M').version).toBe(40);
    expect(encodeQr('x'.repeat(1663), 'Q').version).toBe(40);
  });

  it('誤り訂正レベルを上げると同じ入力でも版数が上がることがある', () => {
    const text = 'x'.repeat(20);
    expect(encodeQr(text, 'M').version).toBeLessThanOrEqual(encodeQr(text, 'Q').version);
    expect(encodeQr('x'.repeat(14), 'M').version).toBe(1);
    expect(encodeQr('x'.repeat(14), 'Q').version).toBe(2);
  });

  it('エラーの文言に入力の長さと上限が入る（画面にそのまま出せるように）', () => {
    expect(() => encodeQr('x'.repeat(3000), 'M')).toThrow(/3000バイト/);
    expect(() => encodeQr('x'.repeat(3000), 'M')).toThrow(/2331バイト/);
  });
});

describe('wifiPayload', () => {
  it('方式・SSID・パスワード・ステルスの順で組み立てる', () => {
    expect(wifiPayload({ ssid: 'home-wifi', password: 'secret123' })).toBe(
      'WIFI:T:WPA;S:home-wifi;P:secret123;;',
    );
  });

  it('区切り文字（\\ ; , : "）はエスケープする', () => {
    expect(wifiPayload({ ssid: 'a;b', password: 'c,d:e"f\\g' })).toBe(
      'WIFI:T:WPA;S:a\\;b;P:c\\,d\\:e\\"f\\\\g;;',
    );
  });

  it('暗号化なしのときはパスワードを入れない', () => {
    expect(wifiPayload({ ssid: 'free-wifi', password: 'ignored', auth: 'nopass' })).toBe(
      'WIFI:T:nopass;S:free-wifi;;',
    );
  });

  it('ステルスSSIDは H:true が付く', () => {
    expect(wifiPayload({ ssid: 'hidden-ap', password: 'pw', hidden: true })).toBe(
      'WIFI:T:WPA;S:hidden-ap;P:pw;H:true;;',
    );
  });

  it('WEPも選べる', () => {
    expect(wifiPayload({ ssid: 'old-ap', password: 'pw', auth: 'WEP' })).toBe(
      'WIFI:T:WEP;S:old-ap;P:pw;;',
    );
  });

  it('パスワードが空ならP項目を出さない（空のP:を嫌う端末がある）', () => {
    expect(wifiPayload({ ssid: 'ap' })).toBe('WIFI:T:WPA;S:ap;;');
  });
});

// ---------------------------------------------------------------------------
// 6. 出力（SVG）
// ---------------------------------------------------------------------------

describe('SVG出力', () => {
  const qr = encodeQr('https://hasokon.com/tools/qr-code/', 'M');

  it('viewBox は余白（クワイエットゾーン）込みの一辺', () => {
    expect(qrViewBoxSize(qr)).toBe(qr.size + QUIET_ZONE * 2);
    expect(qrToSvg(qr)).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
  });

  it('余白は規格が求める4マス以上', () => {
    expect(QUIET_ZONE).toBeGreaterThanOrEqual(4);
  });

  it('黒マスの数だけ長方形が出る（横に続く分はまとめる）', () => {
    // 1行だけの小さな盤面で、まとめ方を確かめる
    const stub: QrCode = {
      version: 1,
      ecLevel: 'M',
      mask: 0,
      size: 3,
      modules: [
        [true, true, false],
        [false, false, false],
        [true, false, true],
      ],
    };
    expect(qrPathData(stub, 0)).toBe('M0 0h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1z');
  });

  it('マスの座標が余白の分だけずれる', () => {
    const stub: QrCode = {
      version: 1,
      ecLevel: 'M',
      mask: 0,
      size: 1,
      modules: [[true]],
    };
    expect(qrPathData(stub, 4)).toBe('M4 4h1v1h-1z');
  });

  it('SVGは単体で開ける形（宣言・背景・パスがある）', () => {
    const svg = qrToSvg(qr);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('fill="#ffffff"'); // 背景。透過だと読み取れないことがある
    expect(svg).toContain('<path d="M');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('色を指定できる', () => {
    const svg = qrToSvg(qr, { dark: '#123456', light: '#fedcba' });
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#fedcba"');
  });
});
