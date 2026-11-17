import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLAGS,
  HIGHLIGHT_LIMIT,
  MAX_TEXT_CHARS,
  checkAction,
  captureNames,
  classifyRegexError,
  compile,
  countBucket,
  detectFeatures,
  displayPieces,
  expandReplacement,
  hasUnicodeProperty,
  flagsToString,
  hasNestedQuantifier,
  invisibleNames,
  parseFlags,
  pasteForms,
  positions,
  prepareText,
  replaceWithMarks,
  runMatch,
  splitSlashForm,
  toSheetPattern,
  warnings,
  type FlagState,
  type RegexErrorKind,
} from '@/lib/regex-check';
import { DIALECT_ROWS, REGEX_PARTS } from '@/lib/regex-parts';
import { tools } from '@/lib/registry';

// 仕様: docs/features/seiki-hyogen-checker.md

const flags = (s: string): FlagState => parseFlags(s);
const re = (p: string, f = 'gu') => {
  const c = compile(p, f);
  if ('error' in c) throw new Error(c.error.message);
  return c.re;
};

describe('フラグとパターンの読み直し', () => {
  it('既定は g と u', () => {
    expect(flagsToString(DEFAULT_FLAGS)).toBe('gu');
  });

  it('u と v はどちらか一方（new RegExp(…, "uv") は SyntaxError）', () => {
    expect(() => new RegExp('a', 'uv')).toThrow();
    expect(flagsToString(parseFlags('guv'))).toBe('gv');
    expect(flagsToString(parseFlags('gvu'))).toBe('gu');
  });

  it('/…/gu の形を分けて読む', () => {
    const r = splitSlashForm('/\\d+/gi');
    expect(r?.pattern).toBe('\\d+');
    expect(flagsToString(r!.flags)).toBe('gi');
    expect(splitSlashForm('/a\\/b/u')?.pattern).toBe('a/b');
    expect(splitSlashForm('abc')).toBeUndefined();
    expect(splitSlashForm('/')).toBeUndefined();
  });
});

describe('判定の約束 1：判定はブラウザの RegExp そのもの', () => {
  it('lib に自前のエンジンを持たず new RegExp で組み立てる', () => {
    const src = readFileSync('lib/regex-check.ts', 'utf8');
    expect(src).toMatch(/new RegExp\(pattern, flags\)/);
  });
});

describe('判定の約束 2：構文エラーを日本語にする', () => {
  const cases: [string, string, RegexErrorKind][] = [
    ['(abc', 'gu', 'unclosed-group'],
    ['[abc', 'gu', 'unclosed-class'],
    ['*a', 'gu', 'nothing-to-repeat'],
    ['a+?+', 'gu', 'nothing-to-repeat'],
    ['a{2,1}', 'gu', 'range-order'],
    ['\\-', 'gu', 'invalid-escape'],
    ['(?<=a)*', 'gu', 'lookaround'],
    ['(?<a>x)(?<a>y)', 'gu', 'duplicate-name'],
  ];
  it.each(cases)('%s（%s）→ %s', (p, f, kind) => {
    const c = compile(p, f);
    expect('error' in c).toBe(true);
    if ('error' in c) {
      expect(c.error.kind).toBe(kind);
      // 例外の英文をそのまま出さない
      expect(c.error.message).not.toMatch(/Invalid regular expression/);
    }
  });

  it('文字クラスの中の [\\-] は u でも v でも正しい書き方なので誤りにしない', () => {
    expect('re' in compile('[\\-]', 'gu')).toBe(true);
    expect('re' in compile('[\\-]', 'gv')).toBe(true);
  });

  it('ほかのエンジンの例外の文（Firefox・Safari）も同じ種類に読む', () => {
    expect(classifyRegexError('(a', 'unterminated parenthetical').kind).toBe('unclosed-group');
    expect(classifyRegexError('(a', 'missing )').kind).toBe('unclosed-group');
    expect(classifyRegexError('[a', 'missing terminating ] for character class').kind).toBe('unclosed-class');
    expect(classifyRegexError('*', 'nothing to repeat').kind).toBe('nothing-to-repeat');
    expect(classifyRegexError('\\-', 'invalid identity escape in regular expression').kind).toBe('invalid-escape');
    expect(classifyRegexError('\\-', 'invalid escaped character for Unicode pattern').kind).toBe('invalid-escape');
    expect(classifyRegexError('(?<a>)(?<a>)', 'duplicate group specifier name').kind).toBe('duplicate-name');
    expect(classifyRegexError('x', 'something new').kind).toBe('other');
  });
});

describe('判定の約束 3：長さ 0 の当たりで無限ループしない', () => {
  it('captureNames はグループの名前を番号の順に返す（文字クラス・エスケープ・後読みは数えない）', () => {
    expect(captureNames('(a)(?<x>b)(?:c)(?<=d)[(]\\((?<y>e)')).toEqual([undefined, 'x', 'y']);
  });

  it('g ありの ^・\\b・a* は matchAll で先へ進む', () => {
    expect(runMatch(re('^', 'gmu'), 'a\nb\nc').total).toBe(3);
    expect(runMatch(re('\\b', 'gu'), 'ab cd').total).toBe(4);
    const r = runMatch(re('a*', 'gu'), 'baab');
    expect(r.items.map((m) => [m.index, m.text])).toEqual([
      [0, ''],
      [1, 'aa'],
      [3, ''],
      [4, ''],
    ]);
  });

  it('g が無いときは exec を 1 回だけ呼んで最初の 1 件', () => {
    const r = runMatch(re('\\d+', 'u'), 'a12 b34');
    expect(r.total).toBe(1);
    expect(r.items[0].text).toBe('12');
    expect(runMatch(re('x', 'u'), 'abc').total).toBe(0);
  });

  it('g のない RegExp に matchAll を呼ぶと TypeError になる（だから exec を使う）', () => {
    expect(() => 'a'.matchAll(/a/u)).toThrow(TypeError);
  });

  it('件数は全部数え、中身は最初の 1,000 件まで', () => {
    const text = 'a'.repeat(HIGHLIGHT_LIMIT + 500);
    const r = runMatch(re('a', 'gu'), text);
    expect(r.total).toBe(HIGHLIGHT_LIMIT + 500);
    expect(r.items).toHaveLength(HIGHLIGHT_LIMIT);
  });

  it('グループの中身（番号つき・名前つき・当たらなかったグループ）', () => {
    const r = runMatch(re('(?<y>\\d{4})-(\\d{2})(x)?', 'gu'), '2026-11 と 2027-01');
    expect(r.groupCount).toBe(3);
    expect(r.groupNames).toEqual(['y', undefined, undefined]);
    expect(r.items[0].groups).toEqual(['2026', '11', undefined]);
    expect(r.items[1].named).toEqual({ y: '2027' });
  });
});

describe('判定の約束 4：位置は書記素の列と UTF-16 の位置の両方', () => {
  it('絵文字・異体字セレクタの後ろでも列がずれない', () => {
    const text = '👨‍👩‍👧あ\n葛󠄀x';
    const r = runMatch(re('あ|x', 'gu'), text);
    expect(r.items[0]).toMatchObject({ index: 8, line: 1, column: 2 });
    expect(r.items[1]).toMatchObject({ line: 2, column: 2 });
    expect(r.items[1].index).toBe(text.indexOf('x'));
  });

  it('文章の末尾の長さ 0 の当たり', () => {
    expect(positions('ab', [2])).toEqual([{ line: 1, column: 3 }]);
    expect(positions('a\n', [2])).toEqual([{ line: 2, column: 1 }]);
  });
});

describe('判定の約束 5：i フラグの注意', () => {
  const base = { pattern: 'i', replacement: '', flags: flags('giu') };
  it('トルコ語の İ・ı があれば注意', () => {
    expect(warnings({ ...base, target: 'js', text: 'İstanbul' }).map((w) => w.id)).toContain('case-split');
    expect(warnings({ ...base, target: 'js', text: 'Istanbul' }).map((w) => w.id)).not.toContain('case-split');
  });

  it('全角英字は JavaScript では注意しない（/ａ/iu.test("Ａ") は true）', () => {
    expect(/ａ/iu.test('Ａ')).toBe(true);
    expect(warnings({ ...base, target: 'js', text: 'ＡＢＣ' }).map((w) => w.id)).not.toContain('case-fullwidth');
  });

  it('使う先が Excel・スプレッドシートのときだけ全角英字の注意', () => {
    expect(warnings({ ...base, target: 'excel', text: 'ＡＢＣ' }).map((w) => w.id)).toContain('case-fullwidth');
    expect(warnings({ ...base, target: 'sheets', text: 'ＡＢＣ' }).map((w) => w.id)).toContain('case-fullwidth');
  });
});

describe('判定の約束 6：置換の $ の読み方', () => {
  const cases: [string, string, string, string][] = [
    ['(\\w+),\\s(\\w+)', 'gu', '$2 $1', 'Smith, John'],
    ['a', 'gu', '$$', 'banana'],
    ['a', 'gu', '[$&]', 'banana'],
    ['n', 'u', '[$`]', 'banana'],
    ['n', 'u', "[$']", 'banana'],
    ['(?<y>\\d{4})', 'gu', '<$<y>>', '2026年'],
    ['(a)', 'gu', '$2$1$0$', 'aa'],
    ['(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)', 'gu', '$10-$11-$01', 'abcdefghij'],
    ['x*', 'gu', '-', 'abc'],
    ['(a)|(b)', 'gu', '[$1$2]', 'ab'],
    ['(?<n>a)', 'gu', '$<m>', 'a'],
    ['a', 'gu', '$<n>', 'a'],
  ];
  it.each(cases)('/%s/%s を %s で置換すると String.prototype.replace と同じ', (p, f, rep, text) => {
    const r = re(p, f);
    const pieces = replaceWithMarks(r, text, rep);
    expect(pieces.map((x) => x.text).join('')).toBe(text.replace(new RegExp(p, f), rep));
  });

  it('置き換わった箇所に印が付く', () => {
    const pieces = replaceWithMarks(re('\\d+'), 'a1b22c', '#');
    expect(pieces).toEqual([
      { text: 'a', changed: false },
      { text: '#', changed: true },
      { text: 'b', changed: false },
      { text: '#', changed: true },
      { text: 'c', changed: false },
    ]);
  });

  it('expandReplacement は $ だけで終わる文字列をそのまま残す', () => {
    expect(expandReplacement('x$', 'a', 0, 'a', [], undefined)).toBe('x$');
  });

  it('$1 は Excel・スプレッドシートでも同じ書き方なので注意しない', () => {
    for (const target of ['excel', 'sheets'] as const) {
      const ids = warnings({ pattern: '(a)', flags: DEFAULT_FLAGS, target, text: '', replacement: '$1' }).map((w) => w.id);
      expect(ids.filter((id) => id.startsWith('rep-'))).toEqual([]);
    }
  });

  it('$<名前>・$&・$`・$\' は Excel・スプレッドシートのときだけ注意', () => {
    for (const rep of ['$<y>', '$&', '$`', "$'"]) {
      const w = (target: 'js' | 'excel' | 'sheets') =>
        warnings({ pattern: '(?<y>a)', flags: DEFAULT_FLAGS, target, text: '', replacement: rep }).filter((x) => x.id.startsWith('rep-'));
      expect(w('js')).toEqual([]);
      expect(w('excel')).toHaveLength(1);
      expect(w('sheets')).toHaveLength(1);
    }
  });
});

describe('判定の約束 7：見えない文字に印', () => {
  it('全角スペース・NBSP・ゼロ幅・BOM・タブに印を付ける', () => {
    const text = 'a\u3000b\u00a0c\u200bd\ufeffe\tf';
    expect(invisibleNames(text)).toEqual(['全角スペース', 'ノーブレークスペース', 'ゼロ幅スペース', 'BOM（ゼロ幅ノーブレークスペース）', 'タブ']);
    const pieces = displayPieces(text, []);
    expect(pieces.filter((p) => p.kind === 'invisible')).toHaveLength(5);
  });

  it('当たりの中の見えない文字にも、その当たりの番号が付く', () => {
    const text = 'x　y';
    const r = runMatch(re('x\\sy'), text);
    const pieces = displayPieces(text, r.items);
    expect(pieces).toEqual([
      { kind: 'match', text: 'x', n: 0 },
      { kind: 'invisible', char: expect.objectContaining({ name: '全角スペース' }), n: 0 },
      { kind: 'match', text: 'y', n: 0 },
    ]);
  });

  it('長さ 0 の当たりは empty の片になる', () => {
    const pieces = displayPieces('ab', runMatch(re('^', 'gu'), 'ab').items);
    expect(pieces).toEqual([
      { kind: 'empty', n: 0 },
      { kind: 'text', text: 'ab' },
    ]);
  });

  it('片をつなぐと元の文章に戻る', () => {
    const text = 'ねこ　いぬ\tねこ';
    const pieces = displayPieces(text, runMatch(re('ねこ'), text).items);
    const back = pieces.map((p) => (p.kind === 'invisible' ? p.char.char : p.kind === 'empty' ? '' : p.text)).join('');
    expect(back).toBe(text);
  });
});

describe('判定の約束 8：改行を \\n に揃える', () => {
  it('\\r\\n・\\r を \\n にして、揃えたことを返す', () => {
    expect(prepareText('a\r\nb\rc')).toEqual({ text: 'a\nb\nc', newlinesNormalized: true, truncated: false });
    expect(prepareText('a\nb').newlinesNormalized).toBe(false);
  });

  it('m フラグの $ が \\r\\n でも行末に当たる', () => {
    const { text } = prepareText('ab\r\ncd');
    expect(runMatch(re('b$', 'gmu'), text).total).toBe(1);
  });

  it('上限を超えたら先頭だけにする（サロゲートペアを割らない）', () => {
    const p = prepareText('a'.repeat(MAX_TEXT_CHARS + 10));
    expect(p.truncated).toBe(true);
    expect(p.text).toHaveLength(MAX_TEXT_CHARS);
    const q = prepareText('a'.repeat(MAX_TEXT_CHARS - 1) + '😀');
    expect(q.text).toHaveLength(MAX_TEXT_CHARS - 1);
  });
});

describe('日本語の部品', () => {
  it('8 部品', () => {
    expect(REGEX_PARTS).toHaveLength(8);
  });

  for (const flag of ['u', 'v'] as const) {
    describe(`${flag} フラグ`, () => {
      it.each(REGEX_PARTS.map((p) => [p.label, p] as const))('%s', (_label, part) => {
        const src = part.check === 'chars' ? `^(?:${part.pattern})+$` : `^${part.pattern}$`;
        const r = new RegExp(src, flag);
        for (const s of part.shouldMatch) expect(r.test(s), `${s} に当たる`).toBe(true);
        for (const s of part.shouldNotMatch) expect(r.test(s), `${s} に当たらない`).toBe(false);
      });
    });
  }

  it('カタカナ：ｶﾞｰﾄﾞ・ﾊﾟﾝ・カード に当たり、かーど に当たらない', () => {
    const k = REGEX_PARTS.find((p) => p.id === 'katakana')!;
    expect(k.shouldMatch).toEqual(expect.arrayContaining(['ｶﾞｰﾄﾞ', 'ﾊﾟﾝ', 'カード']));
    expect(k.shouldNotMatch).toContain('かーど');
    // ﾞ・ﾟ を足さないと「ｶｰﾄﾞ」が当たらない
    expect(/^[\p{Script=Katakana}ーｰ]+$/u.test('ｶｰﾄﾞ')).toBe(false);
  });

  it('[ぁ-ん] では ゔ・ゕ・ゖ が落ちる（だから \\p{Script=Hiragana}）', () => {
    expect(/^[ぁ-ん]+$/u.test('ゔ')).toBe(false);
    expect(/^\p{Script=Hiragana}+$/u.test('ゔゕゖ')).toBe(true);
  });

  it('漢字：〆・ヶ は Han に入らない', () => {
    expect(/\p{Script=Han}/u.test('〆')).toBe(false);
    expect(/\p{Script=Han}/u.test('ヶ')).toBe(false);
    expect(/^[\p{Script=Han}〆ヶ]+$/u.test('霞ヶ関')).toBe(true);
  });

  it('\\d は u フラグでも全角数字に当たらない・\\s は全角スペースに当たる', () => {
    expect(/\d/u.test('１')).toBe(false);
    expect(/\s/u.test('　')).toBe(true);
  });
});

describe('使う先の違い', () => {
  it('書き方を字面で見つける（文字クラスの中は見ない）', () => {
    expect([...detectFeatures('(?<=¥)\\d+(?=円)')].sort()).toEqual(['lookahead', 'lookbehind']);
    expect(detectFeatures('(a)\\1').has('backref')).toBe(true);
    expect(detectFeatures('(?<y>a)\\k<y>').has('named-group')).toBe(true);
    expect(detectFeatures('[(?=]').size).toBe(0);
    expect(detectFeatures('\\(?=').has('lookahead')).toBe(false);
    expect(detectFeatures('\\p{Script=Hiragana}').has('script')).toBe(true);
  });

  it('スプレッドシートでは後読み・先読み・後方参照に注意、Excel・JavaScript では出さない', () => {
    const ids = (target: 'js' | 'excel' | 'sheets') =>
      warnings({ pattern: '(?<=a)(?!b)(c)\\1', flags: DEFAULT_FLAGS, target, text: '', replacement: '' }).map((w) => w.id);
    expect(ids('sheets')).toEqual(expect.arrayContaining(['lookbehind', 'lookahead', 'backref']));
    expect(ids('excel')).not.toContain('lookbehind');
    expect(ids('js')).toEqual([]);
  });

  it('表は 6 行で、スプレッドシートで使えない（null）のは後読み・先読み・後方参照・Unicode の文字クラス', () => {
    expect(DIALECT_ROWS).toHaveLength(6);
    expect(DIALECT_ROWS.filter((r) => r.sheets === null).map((r) => r.id)).toEqual(['lookbehind', 'lookahead', 'backref', 'script']);
  });

  it('\\p{Script=X} は Excel 向けに \\p{X} へ直す', () => {
    expect(toSheetPattern('[\\p{Script=Katakana}ー]\\P{sc=Han}')).toBe('[\\p{Katakana}ー]\\P{Han}');
  });

  it('\\p{…}・\\P{…} を文字クラスの中でも見つける（\\\\p は文字の \\ と p なので数えない）', () => {
    expect(hasUnicodeProperty('[\\p{Script=Katakana}ー]')).toBe(true);
    expect(hasUnicodeProperty('\\P{L}')).toBe(true);
    expect(hasUnicodeProperty('\\\\p{L}')).toBe(false);
    expect(hasUnicodeProperty('[ぁ-ゖ]')).toBe(false);
  });

  it('スプレッドシートでは \\p{…} が使えない注意を出す（#518 必須 2。\\p{L} も同じ）', () => {
    for (const pattern of ['\\p{Script=Hiragana}+', '\\p{L}+', '[\\p{Script=Katakana}ー]']) {
      const ids = (target: 'js' | 'excel' | 'sheets') =>
        warnings({ pattern, flags: DEFAULT_FLAGS, target, text: '', replacement: '' }).map((w) => w.id);
      expect(ids('sheets')).toContain('unicode-property');
      expect(ids('sheets')).not.toContain('script');
      expect(ids('excel')).not.toContain('unicode-property');
      expect(ids('js')).toEqual([]);
    }
    const msg = warnings({ pattern: '\\p{L}', flags: DEFAULT_FLAGS, target: 'sheets', text: '', replacement: '' })[0].message;
    expect(msg).toMatch(/使えません/);
    expect(msg).toMatch(/\[ぁ-ゖ\]/);
  });

  it('Excel では \\p{Script=X} の書き換えの注意だけ', () => {
    const ids = warnings({ pattern: '\\p{Script=Han}', flags: DEFAULT_FLAGS, target: 'excel', text: '', replacement: '' }).map((w) => w.id);
    expect(ids).toEqual(['script']);
  });

  it('[ぁ-ゖ] は ゔ・ゕ・ゖ まで入る（注意で勧める書き方）', () => {
    expect(/^[ぁ-ゖ]+$/u.test('ゔゕゖあ')).toBe(true);
  });
});

describe('そのまま貼れる形', () => {
  it('JavaScript は /…/flags で、文字クラスの外の / をエスケープする', () => {
    const f = pasteForms('a/b[/]', DEFAULT_FLAGS, '');
    expect(f[0].code).toBe('/a\\/b[/]/gu');
    expect(() => new Function(`return ${f[0].code}`)()).not.toThrow();
  });

  it('" は "" に直す', () => {
    const f = pasteForms('"\\d+"', DEFAULT_FLAGS, '');
    expect(f.find((x) => x.label.startsWith('Excel'))!.code).toBe('=REGEXTEST(A1,"""\\d+""")');
    expect(f.find((x) => x.label.startsWith('スプレッドシート'))!.code).toBe('=REGEXMATCH(A1,"""\\d+""")');
  });

  it('\\p{…} を含む式は、スプレッドシート向けの形を出さない（貼っても動かないため）', () => {
    const f = pasteForms('\\p{Script=Hiragana}+', DEFAULT_FLAGS, '$1');
    expect(f.map((x) => x.target)).toEqual(['js', 'excel', 'excel']);
    expect(f[1].code).toBe('=REGEXTEST(A1,"\\p{Hiragana}+")');
  });

  it('i フラグは Excel では引数、スプレッドシートでは (?i)', () => {
    const f = pasteForms('abc', flags('giu'), '$1');
    expect(f.map((x) => x.code)).toEqual([
      '/abc/giu',
      '=REGEXTEST(A1,"abc",1)',
      '=REGEXMATCH(A1,"(?i)abc")',
      '=REGEXREPLACE(A1,"abc","$1",0,1)',
      '=REGEXREPLACE(A1,"(?i)abc","$1")',
    ]);
  });
});

describe('安全の約束 2：入れ子の量指定子を字面で見つける', () => {
  it.each(['(a+)+', '(\\w*)*', '(a|aa)+$'.replace('|aa', '+'), '((ab)+)+', '(x+){2,}', '(?:a*b*)*'])('%s は注意', (p) => {
    expect(hasNestedQuantifier(p)).toBe(true);
  });
  it.each(['(ab)+', 'a+b+', '[(a+)]+', '\\(a+\\)+', '(a{2})+', '(a+)?'])('%s は注意しない', (p) => {
    expect(hasNestedQuantifier(p)).toBe(false);
  });
});

describe('計測（中身は送らない）', () => {
  it('件数の区分は 0／1〜9／10 以上', () => {
    expect([0, 1, 9, 10, 5000].map(countBucket)).toEqual(['0', '1-9', '1-9', '10+', '10+']);
    expect(checkAction('excel', 3)).toBe('check-excel-1-9');
  });

  it('画面はパターン・文章を trackToolUse に渡さない', () => {
    const src = readFileSync('app/seiki-hyogen/Checker.tsx', 'utf8');
    const calls = [...src.matchAll(/trackToolUse\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).not.toMatch(/pattern|text|replacement/);
  });
});

describe('安全の約束 3・4・判定の約束 10：送らない・保存しない・innerHTML を使わない・URL に残さない', () => {
  const src = readFileSync('app/seiki-hyogen/Checker.tsx', 'utf8');
  const worker = readFileSync('app/seiki-hyogen/regex.worker.ts', 'utf8');
  it('通信の処理が無い', () => {
    for (const s of [src, worker]) expect(s).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  });
  it('innerHTML を使わない', () => {
    expect(src).not.toMatch(/\.innerHTML\s*=|dangerouslySetInnerHTML/);
  });
  it('localStorage に残すのは「使う先」だけ', () => {
    const sets = [...src.matchAll(/localStorage\.setItem\(([^,]+),/g)].map((m) => m[1].trim());
    expect(sets).toEqual(['TARGET_STORAGE_KEY']);
  });
  it('URL を書き換えない', () => {
    expect(src).not.toMatch(/history\.(push|replace)State|location\.hash\s*=|useSearchParams|router\.(push|replace)/);
  });
  it('照合は Worker で行い、1 秒で止めて作り直す（止め方は tests/regex-runner.test.ts）', () => {
    expect(src).toMatch(/new Worker\(new URL\('\.\/regex\.worker\.ts'/);
    expect(src).toMatch(/new MatchRunner/);
    expect(src).toMatch(/MATCH_TIMEOUT_MS/);
  });
  it('入力のたびの再計算は 150ms 待つ', () => {
    expect(src).toMatch(/DEBOUNCE_MS/);
  });
});

describe('registry', () => {
  it('stage は wip で入れる', () => {
    const t = tools.find((x) => x.slug === 'seiki-hyogen');
    expect(t?.stage).toBe('wip');
    expect(t?.category).toBe('計算・変換');
    expect(t?.icon).toBe('BracketsCurly');
  });
});
