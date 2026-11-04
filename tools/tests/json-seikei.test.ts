import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH,
  MAX_INPUT_BYTES,
  checkJson,
  losesPrecision,
  renderOutput,
  scanZenkaku,
  utf8Bytes,
  type JsonCheck,
} from '@/lib/json-seikei';
import { ERROR_EXAMPLES, ZENKAKU_EXAMPLE } from '@/app/json-seikei/tables';

/**
 * JSON 整形・チェック（docs/features/json-seikei.md の「テスト」の節）
 */

function ok(input: string) {
  const r = checkJson(input);
  if (!r.ok) throw new Error(`ok のはずが ${r.line}:${r.column} ${r.message}`);
  return r;
}

function ng(input: string): Extract<JsonCheck, { ok: false }> {
  const r = checkJson(input);
  if (r.ok) throw new Error(`エラーのはずが通った: ${input}`);
  return r;
}

describe('整形・圧縮・キーの並べ替え', () => {
  const src = '{"b":[3,1,{"z":1,"y":2}],"a":{"d":true,"c":null},"e":[],"f":{}}';

  it('整形（インデント 2）', () => {
    expect(renderOutput(ok(src).tree, 'format', '2')).toBe(
      [
        '{',
        '  "b": [',
        '    3,',
        '    1,',
        '    {',
        '      "z": 1,',
        '      "y": 2',
        '    }',
        '  ],',
        '  "a": {',
        '    "d": true,',
        '    "c": null',
        '  },',
        '  "e": [],',
        '  "f": {}',
        '}',
      ].join('\n'),
    );
  });

  it('整形の結果は JSON.stringify(…, null, n) と同じ形（数値・エスケープを変えない入力なら）', () => {
    const tree = ok(src).tree;
    expect(renderOutput(tree, 'format', '4')).toBe(JSON.stringify(JSON.parse(src), null, 4));
    expect(renderOutput(tree, 'format', 'tab')).toBe(JSON.stringify(JSON.parse(src), null, '\t'));
  });

  it('1行に圧縮は空白なし', () => {
    const pretty = renderOutput(ok(src).tree, 'format', '2');
    expect(renderOutput(ok(pretty).tree, 'minify', '2')).toBe(src);
  });

  it('キーの並べ替えは再帰的で、配列の順は変えない', () => {
    expect(renderOutput(ok(src).tree, 'minify', '2')).toBe(src);
    const sorted = renderOutput(ok(src).tree, 'sort', '2');
    expect(renderOutput(ok(sorted).tree, 'minify', '2')).toBe(
      '{"a":{"c":null,"d":true},"b":[3,1,{"y":2,"z":1}],"e":[],"f":{}}',
    );
  });

  it('最上位がスカラーでも読める', () => {
    expect(renderOutput(ok(' "x" ').tree, 'format', '2')).toBe('"x"');
    expect(ok('42').stats.depth).toBe(0);
  });

  it('統計：階層・キー数・バイト数', () => {
    const r = ok('{"a":{"b":[1]},"c":"あ"}');
    expect(r.stats).toEqual({ depth: 3, keys: 3, bytes: utf8Bytes('{"a":{"b":[1]},"c":"あ"}') });
    expect(utf8Bytes('あ')).toBe(3);
    expect(utf8Bytes('😀')).toBe(4);
  });
});

describe('データを黙って変えない', () => {
  const src = '{"id":12345678901234567890,"a":1.0,"b":1e3,"c":-0,"d":0.10,"e":"\\u00e9"}';

  it('整形・圧縮・並べ替えのどれでも、数値とエスケープが元の文字列のまま', () => {
    const tree = ok(src).tree;
    for (const out of [
      renderOutput(tree, 'format', '2'),
      renderOutput(tree, 'minify', '2'),
      renderOutput(tree, 'sort', '4'),
    ]) {
      for (const raw of ['12345678901234567890', '1.0', '1e3', '-0', '0.10', '"\\u00e9"']) {
        expect(out).toContain(raw);
      }
      expect(out).not.toContain('é');
    }
    expect(renderOutput(tree, 'minify', '2')).toBe(src);
  });

  it('大きな整数で「精度が落ちる」注意が出る', () => {
    const r = ok('{\n"a": 1,\n"id": 12345678901234567890\n}');
    const notice = r.notices.find((n) => n.kind === 'precision');
    expect(notice?.lines).toEqual([3]);
    expect(notice?.message).toBe(
      'JavaScript で読むと精度が落ちる数があります（3 行目）。このツールは書き方を変えずに出力します',
    );
  });

  it('精度の判定の境目', () => {
    expect(losesPrecision('9007199254740991')).toBe(false);
    expect(losesPrecision('9007199254740992')).toBe(true);
    expect(losesPrecision('-9007199254740993')).toBe(true);
    expect(losesPrecision('0.12345678901234567')).toBe(false); // 17 桁
    expect(losesPrecision('0.123456789012345678')).toBe(true); // 18 桁
    expect(losesPrecision('1.5000000000000000000000')).toBe(false); // 末尾の 0 は数えない
    expect(losesPrecision('1e400')).toBe(true); // Infinity になる
    expect(ok('{"a":1.0,"b":1e3}').notices).toEqual([]);
  });
});

describe('重複キー', () => {
  it('注意が出て、行が両方示され、整形・並べ替えのあとも両方残る', () => {
    const src = '{\n  "a": 1,\n  "b": 0,\n  "a": 2\n}';
    const r = ok(src);
    const dup = r.notices.filter((n) => n.kind === 'duplicate-key');
    expect(dup).toHaveLength(1);
    expect(dup[0].lines).toEqual([2, 4]);
    expect(dup[0].message).toBe(
      '"a" が 2 回出てきます（2 行目・4 行目）。多くのプログラムは後ろの値だけを使います',
    );
    expect(renderOutput(r.tree, 'minify', '2')).toBe('{"a":1,"b":0,"a":2}');
    // 並べ替えでも順を保って両方
    expect(renderOutput(r.tree, 'sort', '2').replace(/\s/g, '')).toBe('{"a":1,"a":2,"b":0}');
  });

  it('1 行に書いた {"a":1,"a":2} でも注意が出る（同じ行なら文字目まで示す）', () => {
    const r = ok('{"a":1,"a":2}');
    expect(r.notices[0].message).toContain('1 行目 2 文字目・1 行目 8 文字目');
    expect(renderOutput(r.tree, 'format', '2')).toBe('{\n  "a": 1,\n  "a": 2\n}');
  });

  it('エスケープで書いたキーも同じキーとみなす', () => {
    expect(ok('{"a":1,"\\u0061":2}').notices.map((n) => n.kind)).toEqual(['duplicate-key']);
  });

  it('別のオブジェクトの同じキーは重複ではない', () => {
    expect(ok('[{"a":1},{"a":2}]').notices).toEqual([]);
  });
});

describe('エラーの位置と原因の見当（hint の表）', () => {
  it('} ] の直前のカンマ：カンマの位置を指す', () => {
    const r = ng('{"a": 1,}');
    expect([r.line, r.column]).toEqual([1, 8]);
    expect(r.hint).toBe('最後の要素のあとにカンマがあります（JSON では使えません）');
    const a = ng('[\n  1,\n  2,\n]');
    expect([a.line, a.column, a.markLine]).toEqual([3, 4, 3]);
    expect(a.hint).toBe('最後の要素のあとにカンマがあります（JSON では使えません）');
  });

  it('値のあとに改行して次のキー：1 行上を強調する', () => {
    const r = ng('{\n  "a": 1\n  "b": 2\n}');
    expect([r.line, r.column]).toEqual([3, 3]);
    expect(r.hint).toBe('1 行上の行末にカンマが抜けていないか確かめてください');
    expect(r.markLine).toBe(2);
  });

  it('カンマ忘れで強調する行は、JSON.parse の指す行の 1 行上', () => {
    const src = '{\n  "name": "taro",\n  "age": 20\n  "city": "tokyo"\n}';
    const r = ng(src);
    // V8 の JSON.parse は「position N」で 4 行目の " を指す
    let parsePos = -1;
    try {
      JSON.parse(src);
    } catch (e) {
      const m = /position (\d+)/.exec(String(e));
      if (m) parsePos = Number(m[1]);
    }
    expect(parsePos).toBeGreaterThan(0);
    const parseLine = src.slice(0, parsePos).split('\n').length;
    expect(r.line).toBe(parseLine);
    expect(r.markLine).toBe(parseLine - 1);
  });

  it('配列でも、改行のあとの値でカンマ忘れを言う', () => {
    const r = ng('[\n  1\n  2\n]');
    expect(r.markLine).toBe(2);
    expect(r.hint).toBe('1 行上の行末にカンマが抜けていないか確かめてください');
  });

  it("' で囲った文字列", () => {
    const key = ng("{'a': 1}");
    expect([key.line, key.column]).toEqual([1, 2]);
    expect(key.hint).toBe('文字列は " で囲みます（\' は使えません）');
    const value = ng('{"a": \'x\'}');
    expect([value.line, value.column]).toEqual([1, 7]);
    expect(value.hint).toBe('文字列は " で囲みます（\' は使えません）');
  });

  it('引用符のないキー', () => {
    const r = ng('{\n  name: "taro"\n}');
    expect([r.line, r.column]).toEqual([2, 3]);
    expect(r.hint).toBe('キーは " で囲みます');
  });

  it('// と /* */ のコメント', () => {
    for (const src of ['{"a": 1 // 個数\n}', '/* 設定 */ {"a": 1}', '{"a": /* x */ 1}', '{"a": 1}\n// end']) {
      expect(ng(src).hint).toBe('JSON にはコメントを書けません');
    }
    const r = ng('{\n  "a": 1, // 個数\n  "b": 2\n}');
    expect([r.line, r.column]).toEqual([2, 11]);
  });

  it('NaN・Infinity・-Infinity・undefined', () => {
    for (const word of ['NaN', 'Infinity', '-Infinity', 'undefined']) {
      const r = ng(`{"a": ${word}}`);
      expect(r.hint).toBe('JSON に無い値です。null か数値・文字列にしてください');
      expect([r.line, r.column]).toEqual([1, 7]);
    }
  });

  it('全角の記号・空白：見当と「全角を直す」の案内', () => {
    const r = ng('{\n  "a"：1\n}');
    expect([r.line, r.column]).toEqual([2, 6]);
    expect(r.hint).toBe(
      '全角コロンが混ざっています（最初は 2 行目 6 文字目）。「全角を直す」で半角にできます',
    );
    expect(r.fixable).toBe(true);
    expect(ng('{"a":　1}').hint).toContain('全角スペース');
  });

  it('先頭の BOM は黙って取り除き、注記を 1 行出す', () => {
    const r = ok('﻿{"a": 1}');
    expect(r.bomRemoved).toBe(true);
    expect(r.notices.map((n) => n.kind)).toEqual(['bom']);
    expect(renderOutput(r.tree, 'minify', '2')).toBe('{"a":1}');
    // 位置は BOM を除いて数える
    expect(ng('﻿{"a": 1,}').column).toBe(8);
  });

  it('そのほかの誤りも位置を出す（JSON.parse に頼らない）', () => {
    expect(ng('')).toMatchObject({ message: 'JSON が空です' });
    expect(ng('{"a": "x')).toMatchObject({ line: 1, column: 7, message: '文字列が閉じていません（" がありません）' });
    expect(ng('{"a": "x\n"}')).toMatchObject({ line: 1, column: 9, message: '文字列の途中で改行しています' });
    expect(ng('{"a": 01}').message).toBe('数値の先頭に 0 を付けることはできません');
    expect(ng('{"a": 1.}').message).toBe('小数点のあとに数字が必要です');
    expect(ng('{"a": "\\x"}').message).toBe('使えないエスケープ「\\x」があります');
    expect(ng('{"a" 1}').message).toContain('コロン');
    expect(ng('{"a": 1').message).toBe('オブジェクトが閉じていません（} がありません）');
    expect(ng('[1, 2').message).toBe('配列が閉じていません（] がありません）');
    expect(ng('{"a": 1} x').message).toContain('余分な文字');
  });

  it('半角の " で開いて全角の ” で閉じた文字列は、直さずに見当を言う', () => {
    const r = ng('{"a":"x”}');
    expect(r.message).toBe('文字列が閉じていません（" がありません）');
    expect(r.hint).toBe('閉じの引用符が全角（”）になっていないか確かめてください');
    expect(r.fixable).toBe(false);
    expect(ng('{\n  "a": "太郎”,\n  "b": 1\n}').hint).toBe(
      '閉じの引用符が全角（”）になっていないか確かめてください',
    );
    // 閉じの ” が無いただの閉じ忘れには言わない
    expect(ng('{"a": "x').hint).toBeUndefined();
  });

  it('入れ子が深すぎると止める', () => {
    expect(ok('['.repeat(MAX_DEPTH) + ']'.repeat(MAX_DEPTH)).stats.depth).toBe(MAX_DEPTH);
    expect(ng('['.repeat(MAX_DEPTH + 1) + ']'.repeat(MAX_DEPTH + 1)).message).toContain('入れ子が深すぎます');
  });

  it('走査器と JSON.parse の判定が一致する（いろいろな入力）', () => {
    const inputs = [
      '{"a":[1,2,{"b":null}],"c":"\\"\\\\\\/\\b\\f\\n\\r\\t\\u12ab"}',
      '[-0.5e-10, 1E+2, 0, -0, true, false, null]',
      '  \r\n\t{}  ',
      '"あ"',
      '{"a":1,}',
      '[1 2]',
      '{"a":-}',
      '{"a":1e}',
      '{"a":tru}',
      '"\t"',
      '{"":0}',
    ];
    for (const s of inputs) {
      let parseOk = true;
      try {
        JSON.parse(s);
      } catch {
        parseOk = false;
      }
      expect(checkJson(s).ok, s).toBe(parseOk);
    }
  });
});

describe('5MB の上限', () => {
  it('5MB 超で処理しない', () => {
    const big = '"' + 'a'.repeat(MAX_INPUT_BYTES) + '"';
    const r = ng(big);
    expect(r.tooLarge).toBe(true);
  });

  it('全角は 1 文字 3 バイトで数える', () => {
    const justUnder = '"' + 'あ'.repeat(Math.floor((MAX_INPUT_BYTES - 2) / 3)) + '"';
    expect(checkJson(justUnder).ok).toBe(true);
    const over = '"' + 'あ'.repeat(Math.floor(MAX_INPUT_BYTES / 3) + 1) + '"';
    expect(ng(over).tooLarge).toBe(true);
  });
});

describe('全角を直す', () => {
  it('文字列の中身を変えない', () => {
    expect(scanZenkaku('{"a"：“東京　港区”}').fixed).toBe('{"a":"東京　港区"}');
    expect(scanZenkaku('{"住所":"東京都　港区"}').fixed).toBe('{"住所":"東京都　港区"}');
  });

  it('文字列の外の全角スペース・NBSP・： ， 、 ｛ ｝ ［ ］ を半角に', () => {
    const r = scanZenkaku('｛"a"：［1，2、3］,　"b": 1｝');
    expect(r.fixed).toBe('{"a":[1,2,3], "b": 1}');
    expect(checkJson(r.fixed).ok).toBe(true);
    expect(r.replaced).toHaveLength(9);
  });

  it('直した位置（行・列）を返す', () => {
    const r = scanZenkaku('{\n  "a"：1，\n  "b":2\n}');
    expect(r.replaced.map((m) => [m.line, m.column, m.name])).toEqual([
      [2, 6, '全角コロン'],
      [2, 8, '全角カンマ'],
    ]);
  });

  it('全角の引用符：{“a”：“b”} → {"a":"b"}', () => {
    expect(scanZenkaku('{“a”：“b”}').fixed).toBe('{"a":"b"}');
    expect(scanZenkaku('{＂a＂:＂b＂}').fixed).toBe('{"a":"b"}');
    expect(scanZenkaku('[“x”，“y”]').fixed).toBe('["x","y"]');
  });

  it('半角の " の文字列の中の “ ” は変えない', () => {
    const src = '{"s":"彼は“はい”と言った"}';
    const r = scanZenkaku(src);
    expect(r.fixed).toBe(src);
    expect(r.replaced).toEqual([]);
  });

  it('エスケープした \\" のあとも文字列の中として扱う', () => {
    const src = '{"s":"a\\"“b”\\"c"}';
    expect(scanZenkaku(src).fixed).toBe(src);
  });

  it('全角の引用符の中身（全角スペースなど）は変えない', () => {
    expect(scanZenkaku('{“a”:“x　y：z”}').fixed).toBe('{"a":"x　y：z"}');
  });

  it('閉じの無い “ は直さず、hint を出す', () => {
    const src = '{\n  "a": “b,\n  "c": 1\n}';
    const r = scanZenkaku(src);
    expect(r.fixed).toBe(src);
    expect(r.unfixed.map((m) => [m.reason, m.line])).toEqual([['unclosed-quote', 2]]);
    expect(ng(src).hint).toBe('全角の引用符 “ が閉じていません（2 行目）');
    expect(ng(src).fixable).toBe(false);
  });

  it('キーか値の位置に無い “ は直さない', () => {
    expect(scanZenkaku('{"a":1“x”}').fixed).toBe('{"a":1“x”}');
  });

  it('全角マイナス：{"n":－1}・{"n":−1} → {"n":-1}', () => {
    expect(scanZenkaku('{"n":－1}').fixed).toBe('{"n":-1}');
    expect(scanZenkaku('{"n":−1}').fixed).toBe('{"n":-1}');
    expect(scanZenkaku('{"n":－１２}').fixed).toBe('{"n":-12}');
  });

  it('全角数字は文字列の外の数値だけ直す', () => {
    expect(scanZenkaku('{"n":１２３,"s":"１２３"}').fixed).toBe('{"n":123,"s":"１２３"}');
  });

  it('長音の ー は直さず、hint で言う', () => {
    const src = '{"n":ー1}';
    expect(scanZenkaku(src).fixed).toBe(src);
    const r = ng(src);
    expect(r.hint).toBe('長音の ー が入っています（1 行目）。マイナスは半角の - にしてください');
    expect(r.fixable).toBe(false);
  });

  it('直したあとは正しい JSON になる（よくある貼り付けの例）', () => {
    const r = scanZenkaku('{“住所”：“東京都　港区”，　"メモ":"“至急”と連絡"}');
    expect(r.fixed).toBe('{"住所":"東京都　港区", "メモ":"“至急”と連絡"}');
    expect(checkJson(r.fixed).ok).toBe(true);
  });
});

describe('本文の表（tables.ts）', () => {
  it('よくあるエラーの例はすべてエラーになり、見当の文が出る', () => {
    expect(ERROR_EXAMPLES.length).toBe(7);
    for (const row of ERROR_EXAMPLES) {
      expect(row.hint).not.toBe('');
      expect(checkJson(row.fixed).ok, row.fixed).toBe(true);
    }
    expect(ERROR_EXAMPLES[1].where).toBe('3 行目 3 文字目（2 行目を強調）');
  });

  it('全角の例は直すと正しい JSON になる', () => {
    expect(checkJson(ZENKAKU_EXAMPLE.input).ok).toBe(false);
    expect(checkJson(ZENKAKU_EXAMPLE.fixed).ok).toBe(true);
  });
});

describe('送らない（ページのソースに通信の処理が無い）', () => {
  const dir = fileURLToPath(new URL('../app/json-seikei/', import.meta.url));
  const files = [
    ...readdirSync(dir).map((name) => `${dir}${name}`),
    fileURLToPath(new URL('../lib/json-seikei.ts', import.meta.url)),
  ];

  it('fetch( / XMLHttpRequest / navigator.sendBeacon / WebSocket が無い', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) {
        expect(source.includes(word), `${file} に ${word}`).toBe(false);
      }
    }
  });

  it('入力を保存しない（localStorage・sessionStorage・indexedDB を使わない）', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
        expect(source.includes(word), `${file} に ${word}`).toBe(false);
      }
    }
  });

  it('入力欄の文字は 16px 以上（iOS Safari の拡大を避ける）', () => {
    const source = readFileSync(`${dir}Calculator.tsx`, 'utf8');
    const m = /const FONT_SIZE = (\d+);/.exec(source);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(16);
  });
});
