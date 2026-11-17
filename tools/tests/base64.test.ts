import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  JWT_SIGNATURE_NOTE,
  MAX_AUTO_CHARS,
  MAX_PASTE_CHARS,
  PREVIEW_IMAGE_TYPES,
  SAVE_BLOB_TYPE,
  base64ToBytes,
  bytesBand,
  bytesToBase64,
  bytesToText,
  convert,
  decodeJwt,
  decodeMime,
  detect,
  encodeText,
  expiryNote,
  inputSizeMode,
  markInvisible,
  parseDataUri,
  sniff,
  toDataUri,
  trackCharsetOf,
  trackFormat,
} from '@/lib/base64';
import { MAX_AUTO_CHARS as URL_MAX_AUTO_CHARS } from '@/lib/url-decode';

// 仕様: docs/features/base64-henkan.md

const bytes = (...b: number[]) => Uint8Array.from(b);
const utf8 = (s: string) => new TextEncoder().encode(s);
const sjis = (pairs: number[]) => Uint8Array.from(pairs);

/** JWT を組み立てる（base64url・署名は飾り） */
function jwt(header: object, payload: object, sig = 'c2ln'): string {
  const part = (o: object) => bytesToBase64(utf8(JSON.stringify(o)), 'base64url');
  return `${part(header)}.${part(payload)}.${sig}`;
}

describe('判定の約束', () => {
  it('1. 前後の空白・76文字ごとの折り返しを取り除いてから判定する', () => {
    const long = bytesToBase64(utf8('あ'.repeat(100)), 'mime76');
    expect(long).toContain('\n');
    expect(detect(`  ${long}\n`)?.format).toBe('base64');
    const r = convert(`\n${long}\n`);
    expect(r.kind).toBe('decoded');
    if (r.kind === 'decoded' && r.output.kind === 'text') expect(r.output.text).toBe('あ'.repeat(100));
  });

  it('2. =?…?B?…?= / =?…?Q?…?= を含めば MIME encoded-word', () => {
    expect(detect('=?UTF-8?B?44GC?=')?.format).toBe('mime');
    expect(detect('件名: =?utf-8?q?a_b?= です')?.format).toBe('mime');
  });

  it('3. 3つに分かれ先頭が eyJ なら JWT', () => {
    expect(detect(jwt({ alg: 'HS256' }, { sub: '1' }))?.format).toBe('jwt');
    // 先頭が eyJ でなければ JWT にしない
    expect(detect('abc.def.ghi')?.format).toBe('encode');
  });

  it('4. data:<type>;base64, で始まれば data URI', () => {
    expect(detect('data:image/png;base64,iVBORw0KGgo=')?.format).toBe('datauri');
    expect(detect('DATA:text/plain;charset=utf-8;base64,44GC')?.format).toBe('datauri');
  });

  it('5. 標準 Base64 と base64url を分ける', () => {
    expect(detect('aGFzb2tvbg==')?.format).toBe('base64');
    expect(detect('+/8=')?.format).toBe('base64');
    expect(detect('-_8')?.format).toBe('base64url');
  });

  it('6. どれにも当たらなければエンコード。判定は画面に出す文言つき', () => {
    expect(detect('こんにちは')?.format).toBe('encode');
    expect(detect('hello world')?.format).toBe('encode');
    expect(detect('hello')?.format).toBe('encode'); // 英数字だけで長さが 4 の倍数でない
    expect(detect('aGFzb2tvbg==')?.reason).toBe('標準 Base64として読みました');
    expect(detect('')).toBeNull();
    expect(detect('   ')).toBeNull();
  });

  it('7. 読めるが意味のある文字にならない短い英単語は、デコードとエンコードを両方出す', () => {
    for (const word of ['test', 'abcd']) {
      const r = convert(word);
      expect(r.kind).toBe('decoded');
      if (r.kind === 'decoded') expect(r.alsoEncoded).toBe(encodeText(word).output);
    }
    // 意味のある文字になるもの（Hello World!）は片方だけ
    const r = convert('SGVsbG8gV29ybGQh');
    expect(r.kind).toBe('decoded');
    if (r.kind === 'decoded') {
      expect(r.alsoEncoded).toBeNull();
      expect(r.output.kind === 'text' && r.output.text).toBe('Hello World!');
    }
  });
});

describe('デコードの約束', () => {
  it('1. atob を使わない（日本語がバイト列経由で戻る）', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/base64.ts', import.meta.url)), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\batob\s*\(/);
    expect(code).not.toMatch(/\bbtoa\s*\(/);
    const r = convert('44GT44KT44Gr44Gh44Gv');
    expect(r.kind === 'decoded' && r.output.kind === 'text' && r.output.text).toBe('こんにちは');
  });

  it('2. UTF-8 で読めなければ Shift_JIS・EUC-JP・ISO-2022-JP を試し、選んだ文字コードを返す。手で切り替えられる', () => {
    // 「日本語」の Shift_JIS
    const sj = bytesToBase64(sjis([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]));
    const r = convert(sj);
    expect(r.kind).toBe('decoded');
    if (r.kind === 'decoded' && r.output.kind === 'text') {
      expect(r.output.charset).toBe('shift_jis');
      expect(r.output.text).toBe('日本語');
    }
    // 「日本語」の EUC-JP
    const euc = bytesToBase64(sjis([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec]));
    const e = convert(euc);
    expect(e.kind === 'decoded' && e.output.kind === 'text' && e.output.charset).toBe('euc-jp');
    // ISO-2022-JP の「あ」
    const jis = convert('GyRCJCIbKEI=');
    expect(jis.kind === 'decoded' && jis.output.kind === 'text' && jis.output.charset).toBe('iso-2022-jp');
    expect(jis.kind === 'decoded' && jis.output.kind === 'text' && jis.output.text).toBe('あ');
    // 手で UTF-8 に切り替えると、その文字コードで読む
    const forced = convert(sj, { charset: 'utf-8' });
    expect(forced.kind === 'decoded' && forced.output.kind === 'text' && forced.output.charset).toBe('utf-8');
  });

  it('3. 判別・採点の式を base64.ts に書かない（charset-guess.ts を呼ぶ）', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/base64.ts', import.meta.url)), 'utf8');
    expect(src).toContain("from './charset-guess'");
    expect(src).not.toMatch(/SCORE_MARGIN\s*=/);
    expect(src).not.toMatch(/function\s+(japaneseScore|guessCharset|scanUtf8|jisLevel1)\b/);
    const urlSrc = readFileSync(fileURLToPath(new URL('../lib/url-decode.ts', import.meta.url)), 'utf8');
    expect(urlSrc).toContain("from './charset-guess'");
    expect(urlSrc).not.toMatch(/function\s+(japaneseScore|jisLevel1|scanUtf8)\b/);
  });

  describe('4. MIME encoded-word', () => {
    const cases: [string, string][] = [
      ['=?ISO-2022-JP?B?GyRCJCIbKEI=?=', 'あ'],
      ['=?UTF-8?Q?=E3=81=82?=', 'あ'],
      ['=?UTF-8?Q?a_b?=', 'a b'],
      ['=?UTF-8?B?44GC?= =?UTF-8?B?44GE?=', 'あい'],
      ['件名: =?UTF-8?B?44GC?= です', '件名: あ です'],
      ['=?utf-8?b?44GC?=', 'あ'],
    ];
    for (const [input, expected] of cases) {
      it(`${input} → ${expected}`, () => {
        expect(decodeMime(input).text).toBe(expected);
        const r = convert(input);
        expect(r.kind === 'mime' && r.text).toBe(expected);
      });
    }

    it('隣り合う word に割れた UTF-8 の1文字も化けない', () => {
      // 「あ」E3 81 82 を 2 つの word に割る
      const a = bytesToBase64(bytes(0xe3, 0x81));
      const b = bytesToBase64(bytes(0x82));
      expect(decodeMime(`=?UTF-8?B?${a}?=\r\n =?UTF-8?B?${b}?=`).text).toBe('あ');
    });

    it('Shift_JIS の別名（cp932 など）も読む・壊れた word はそのまま残す', () => {
      const sjA = bytesToBase64(sjis([0x82, 0xa0]));
      expect(decodeMime(`=?cp932?B?${sjA}?=`).text).toBe('あ');
      expect(decodeMime(`=?Shift_JIS?B?${sjA}?=`).text).toBe('あ');
      const broken = decodeMime('=?UTF-8?B?4?=');
      expect(broken.text).toBe('=?UTF-8?B?4?=');
      expect(broken.problems.length).toBe(1);
    });
  });

  describe('5. JWT', () => {
    const exp = Date.UTC(2026, 10, 12, 3, 0, 0) / 1000; // 2026-11-12 12:00 JST
    const iat = Date.UTC(2026, 10, 12, 0, 0, 0) / 1000; // 2026-11-12 09:00 JST
    const token = jwt({ alg: 'HS256', typ: 'JWT' }, { sub: '123', name: '山田', iat, exp });

    it('header・payload を JSON として整形し、exp・iat を日本時間で出す', () => {
      const r = decodeJwt(token, Date.UTC(2026, 10, 12, 1, 30) );
      expect(r.alg).toBe('HS256');
      expect(r.hasSignature).toBe(true);
      expect(JSON.parse(r.headerJson!)).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(r.payloadJson).toContain('\n  "name": "山田"');
      const e = r.times.find((t) => t.claim === 'exp')!;
      expect(e.jst).toBe('2026年11月12日（木） 12:00:00');
      expect(e.remaining).toBe('あと1時間30分');
      expect(r.times.find((t) => t.claim === 'iat')!.jst).toBe('2026年11月12日（木） 09:00:00');
      expect(r.times.find((t) => t.claim === 'iat')!.remaining).toBeNull();
    });

    it('期限を過ぎていれば「期限切れ」。今の時刻が無ければ残りは出さない', () => {
      expect(decodeJwt(token, Date.UTC(2026, 10, 12, 3, 0, 1)).times.find((t) => t.claim === 'exp')!.remaining).toBe('期限切れ');
      expect(decodeJwt(token).times.find((t) => t.claim === 'exp')!.remaining).toBeNull();
      expect(expiryNote(1000, 1000 * 1000)).toBe('期限切れ');
      expect(expiryNote(100_000, 0)).toBe('あと1日3時間');
      expect(expiryNote(90, 0)).toBe('あと1分');
    });

    it('署名は検証していないの文言を持つ', () => {
      expect(JWT_SIGNATURE_NOTE).toContain('署名は検証していません');
      const page = readFileSync(fileURLToPath(new URL('../app/base64/Converter.tsx', import.meta.url)), 'utf8');
      expect(page).toContain('JWT_SIGNATURE_NOTE');
    });

    it('壊れた payload は問題として返す（例外にしない）', () => {
      const r = decodeJwt('eyJhbGciOiJIUzI1NiJ9.!!!!.x');
      expect(r.payloadJson).toBeNull();
      expect(r.problems.length).toBeGreaterThan(0);
    });
  });

  describe('6. data URI の画像は img でだけプレビューする', () => {
    it('画像の種類だけ previewable。SVG も img なら可。text/html・JS は不可', () => {
      expect(parseDataUri('data:image/png;base64,iVBORw0KGgo=')).toMatchObject({ kind: 'datauri', previewable: true, mime: 'image/png' });
      expect(parseDataUri(`data:image/svg+xml;base64,${bytesToBase64(utf8('<svg/>'))}`)).toMatchObject({ previewable: true });
      expect(parseDataUri(`data:text/html;base64,${bytesToBase64(utf8('<script>alert(1)</script>'))}`)).toMatchObject({
        previewable: false,
      });
      expect(parseDataUri('data:application/javascript;base64,YQ==')).toMatchObject({ previewable: false });
      expect(PREVIEW_IMAGE_TYPES).not.toContain('text/html');
    });

    it('画面は SVG を innerHTML・object・iframe に入れない', () => {
      const ui = readFileSync(fileURLToPath(new URL('../app/base64/Converter.tsx', import.meta.url)), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(ui).not.toMatch(/dangerouslySetInnerHTML|innerHTML|<object|<iframe|<embed/);
    });
  });

  it('7. 文字にならないバイナリは先頭から種類を推定し、テキストにしない。保存は a download だけ', () => {
    const pdf = utf8('%PDF-1.7\n\x00\x01\x02');
    expect(sniff(pdf)?.label).toBe('PDF');
    expect(sniff(bytes(0x50, 0x4b, 0x03, 0x04))?.ext).toBe('zip');
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
    const r = convert(bytesToBase64(pdf));
    expect(r.kind === 'decoded' && r.output.kind).toBe('binary');
    // 制御文字だらけのものも文字にしない
    expect(bytesToText(bytes(0, 1, 2, 3, 4, 5)).kind).toBe('binary');

    expect(SAVE_BLOB_TYPE).toBe('application/octet-stream');
    const ui = readFileSync(fileURLToPath(new URL('../app/base64/Converter.tsx', import.meta.url)), 'utf8');
    const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('.download =');
    expect(code).toContain('URL.revokeObjectURL');
    expect(code).not.toMatch(/window\.open|location\.(href|assign|replace)|target=["']_blank/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/localStorage|sessionStorage/);
  });

  it('8. 壊れた入力は何文字目が不正かを出す。= の補完で読めるものは補う', () => {
    const bad = base64ToBytes('aGFz#b2tvbg==');
    expect(bad).toMatchObject({ ok: false, position: 5 });
    expect(!bad.ok && bad.message).toContain('5文字目の「#」');
    // 日本語が混ざっても「何文字目」はコードポイント単位で数える
    expect(base64ToBytes('44GC あ')).toMatchObject({ ok: false, position: 6 });
    // 長さが合わない
    expect(base64ToBytes('aGFzb')).toMatchObject({ ok: false });
    // = の後ろに文字
    expect(base64ToBytes('aG=Fz')).toMatchObject({ ok: false, position: 3 });
    // = の補完
    const fixed = base64ToBytes('aGFzb2tvbg');
    expect(fixed).toMatchObject({ ok: true, padded: 2 });
    const r = convert('aGFzb2tvbg', { mode: 'decode' });
    expect(r.kind === 'decoded' && r.padded).toBe(2);
    expect(r.kind === 'decoded' && r.output.kind === 'text' && r.output.text).toBe('hasokon');
    // base64url は = が無いのが普通なので「補った」とは言わない
    expect(base64ToBytes('-_8')).toMatchObject({ ok: true, padded: 0, variant: 'base64url' });
    // 「デコード」を選ぶと、エンコード向きの入力でもデコードを試してエラーを出す
    expect(convert('こんにちは', { mode: 'decode' })).toMatchObject({ kind: 'error', position: 1 });
  });

  it('9. 見えない文字（ゼロ幅スペース・BOM・制御文字）に印を付ける', () => {
    const seg = markInvisible('a​b﻿c\u0007d\ne');
    expect(seg.filter((s) => s.invisible).map((s) => s.invisible)).toEqual([
      'ゼロ幅スペース',
      'BOM（ゼロ幅ノーブレークスペース）',
      '制御文字（U+0007）',
    ]);
    // 改行には印を付けない
    expect(seg.map((s) => s.text).join('')).toBe('a​b﻿c\u0007d\ne');
    // 先頭の BOM を黙って消さない
    const r = convert(bytesToBase64(bytes(0xef, 0xbb, 0xbf, 0xe3, 0x81, 0x82)));
    expect(r.kind === 'decoded' && r.output.kind === 'text' && r.output.invisibles).toEqual(['BOM（ゼロ幅ノーブレークスペース）']);
  });

  it('10. 入力の上限：100,000 文字までは自動、100,001 はボタン、8,000,001 は断る', () => {
    expect(MAX_AUTO_CHARS).toBe(URL_MAX_AUTO_CHARS);
    expect(MAX_AUTO_CHARS).toBe(100_000);
    expect(MAX_PASTE_CHARS).toBe(8_000_000);
    expect(inputSizeMode(100_000)).toBe('auto');
    expect(inputSizeMode(100_001)).toBe('button');
    expect(inputSizeMode(8_000_000)).toBe('button');
    expect(inputSizeMode(8_000_001)).toBe('too-large');
    expect(convert('A'.repeat(8_000_001)).kind).toBe('too-large');
  });
});

describe('エンコードの約束', () => {
  it('1. UTF-8 のバイト列にしてから Base64 にする（Shift_JIS は選択肢に無い）', () => {
    expect(encodeText('あ').output).toBe('44GC');
    expect(encodeText('😀').output).toBe('8J+YgA==');
    const ui = readFileSync(fileURLToPath(new URL('../app/base64/Converter.tsx', import.meta.url)), 'utf8');
    expect(ui).not.toMatch(/ENCODE_CHARSETS|reverseTable/);
    const src = readFileSync(fileURLToPath(new URL('../lib/base64.ts', import.meta.url)), 'utf8');
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/unescape\s*\(/);
  });

  it('2. 形式を選べる：標準／base64url／76 文字で折り返す／data: URI', () => {
    const long = 'あいうえお'.repeat(10);
    expect(encodeText(long, { format: 'base64url' }).output).not.toMatch(/[+/=]/);
    const wrapped = encodeText(long, { format: 'mime76' }).output.split('\n');
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.slice(0, -1).every((l) => l.length === 76)).toBe(true);
    expect(wrapped.join('')).toBe(encodeText(long).output);
    expect(toDataUri(utf8('a'), 'text/plain')).toBe('data:text/plain;base64,YQ==');
    expect(toDataUri(utf8('a'), '')).toBe('data:application/octet-stream;base64,YQ==');
  });

  it('3. テストケース', () => {
    expect(encodeText('あ').output).toBe('44GC');
    expect(encodeText('hasokon').output).toBe('aGFzb2tvbg==');
    expect(bytesToBase64(bytes(0xfb, 0xff))).toBe('+/8=');
    expect(bytesToBase64(bytes(0xfb, 0xff), 'base64url')).toBe('-_8');
    expect(encodeText('').output).toBe('');
    expect(convert('')).toMatchObject({ kind: 'empty' });
  });

  it('往復：エンコードしてデコードすると元に戻る', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'こんにちは世界', '🍣🍺', 'line1\r\nline2']) {
      const enc = encodeText(s).output;
      const dec = base64ToBytes(enc);
      expect(dec.ok && new TextDecoder().decode(dec.bytes)).toBe(s);
      const url = base64ToBytes(encodeText(s, { format: 'base64url' }).output);
      expect(url.ok && new TextDecoder().decode(url.bytes)).toBe(s);
    }
  });

  it('4. ファイルは 5MB まで。arrayBuffer() で読む', async () => {
    const { MAX_FILE_BYTES } = await import('@/lib/base64');
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
    const ui = readFileSync(fileURLToPath(new URL('../app/base64/Converter.tsx', import.meta.url)), 'utf8');
    expect(ui).toContain('.arrayBuffer()');
    expect(ui).not.toContain('FileReader');
  });

  it('5. 改行は \\n のまま（\\r\\n も勝手に変えない）。切り替えで CRLF', () => {
    expect(encodeText('a\nb').output).toBe(bytesToBase64(utf8('a\nb')));
    expect(encodeText('a\r\nb').output).toBe(bytesToBase64(utf8('a\r\nb')));
    expect(encodeText('a\nb', { crlf: true }).output).toBe(bytesToBase64(utf8('a\r\nb')));
    // すでに CRLF のところは二重にしない
    expect(encodeText('a\r\nb\nc', { crlf: true }).output).toBe(bytesToBase64(utf8('a\r\nb\r\nc')));
  });
});

describe('計測（中身は付けない）', () => {
  it('format・charset・bytes_band の区分だけを返す', () => {
    expect(trackFormat(convert('44GC'))).toBe('base64');
    expect(trackFormat(convert('-_8'))).toBe('base64url');
    expect(trackFormat(convert('=?UTF-8?B?44GC?='))).toBe('mime');
    expect(trackFormat(convert('あ'))).toBe('encode');
    expect(trackCharsetOf(convert('44GC'))).toBe('utf8');
    expect(bytesBand(1024)).toBe('lte1kb');
    expect(bytesBand(1025)).toBe('lte100kb');
    expect(bytesBand(100 * 1024 + 1)).toBe('lte5mb');
  });
});
