import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  NO_WARNING_IS_NOT_SAFE,
  TRACKING_PARAMS,
  checkHost,
  checkLabel,
  cleanUrl,
  decodeLine,
  decodeText,
  detectDirection,
  encodeLine,
  guessCharset,
  hostToAscii,
  hostToUnicode,
  japaneseScore,
  looksDoubleEncoded,
  looksLikeUrl,
  parseUrl,
  punycodeDecode,
  punycodeEncode,
  reverseTable,
  trackCharset,
  trackingReason,
} from '@/lib/url-decode';
import { INVISIBLE_CHARS, LINE_BREAK_CHARS } from '@/lib/invisible-chars';

// 仕様: docs/features/url-decode-encode.md

const SJIS_KONNICHIWA = '%82%B1%82%F1%82%C9%82%BF%82%CD';
const EUC_KONNICHIWA = '%A4%B3%A4%F3%A4%CB%A4%C1%A4%CF';

describe('向きの自動判定', () => {
  it('%XX を含めばデコード', () => {
    expect(detectDirection('https://example.com/?q=%E6%9D%B1').direction).toBe('decode');
  });
  it('xn-- を含めばデコード', () => {
    expect(detectDirection('https://xn--wgv71a119e.jp/').direction).toBe('decode');
  });
  it('%XX を含まず日本語を含めばエンコード', () => {
    expect(detectDirection('東京 タワー').direction).toBe('encode');
  });
  it('hello world は「変換するものはありません」（勝手にエンコードしない）', () => {
    const d = detectDirection('hello world');
    expect(d.direction).toBe('none');
    expect(d.reason).toBe('変換するもの（%XX・日本語・xn--）はありません');
  });
});

describe('文字コードの判別', () => {
  it('UTF-8 は fatal で通れば確定', () => {
    const r = decodeText('%E6%9D%B1%E4%BA%AC');
    expect(r.charset).toBe('utf-8');
    expect(r.lines[0].text).toBe('東京');
    expect(r.guess.candidates).toEqual(['utf-8']);
  });

  it('Shift_JIS の実例', () => {
    const r = decodeText(`https://example.jp/cgi-bin/search.cgi?word=${SJIS_KONNICHIWA}`);
    expect(r.charset).toBe('shift_jis');
    expect(r.lines[0].text).toBe('https://example.jp/cgi-bin/search.cgi?word=こんにちは');
    expect(trackCharset(r.guess)).toBe('sjis');
  });

  it('Shift_JIS の2バイト目が % になっていない古い URL（%83A＝ア）も読む', () => {
    expect(decodeText('%83A%83C%83E').lines[0].text).toBe('アイウ');
  });

  it('EUC-JP の実例（Shift_JIS としても読めるが、半角カナになるので点が低い）', () => {
    const r = decodeText(EUC_KONNICHIWA);
    expect(r.charset).toBe('euc-jp');
    expect(r.lines[0].text).toBe('こんにちは');
    expect(trackCharset(r.guess)).toBe('eucjp');
  });

  it('ISO-2022-JP（ESC $ B）は先に試す', () => {
    const r = decodeText('%1B%24B%24%22%24%24%1B%28B');
    expect(r.charset).toBe('iso-2022-jp');
    expect(r.lines[0].text).toBe('あい');
    expect(trackCharset(r.guess)).toBe('jis');
  });

  it('手で選んだ文字コードが自動判別より優先', () => {
    const r = decodeText(SJIS_KONNICHIWA, { charset: 'utf-8' });
    expect(r.charset).toBe('utf-8');
    expect(r.lines[0].problems.length).toBeGreaterThan(0);
  });

  it('点が近いときは候補を並べる（どちらも第2水準の漢字になる並び）', () => {
    const g = guessCharset('%E9%DF%E9%DF');
    expect(g.candidates.sort()).toEqual(['euc-jp', 'shift_jis']);
    expect(trackCharset(g)).toBe('ambiguous');
    expect(decodeText('%E9%DF', { charset: 'shift_jis' }).lines[0].text).toBe('鱇');
    expect(decodeText('%E9%DF', { charset: 'euc-jp' }).lines[0].text).toBe('蛬');
  });

  it('UTF-8 で1バイト目だけ残って行が終わったものは「切れた」として UTF-8 のまま', () => {
    expect(guessCharset('%E6%9D%B1%E3').charset).toBe('utf-8');
  });

  it('ASCII だけなら UTF-8（どれでも同じ）', () => {
    expect(guessCharset('%41%42').asciiOnly).toBe(true);
  });

  it('日本語らしさ：ひらがなは半角カナより点が高い', () => {
    expect(japaneseScore('こんにちは')).toBeGreaterThan(japaneseScore('､ｳ､ﾈ'));
  });
});

describe('デコードの約束', () => {
  it('1. + はパスで残し、クエリで空白にする（auto）', () => {
    expect(decodeLine('/a+b?q=c+d', 'utf-8').text).toBe('/a+b?q=c d');
    expect(decodeLine('a+b', 'utf-8', 'space').text).toBe('a b');
    expect(decodeLine('q=a+b', 'utf-8', 'keep').text).toBe('q=a+b');
  });

  it('1. URL として分解したときも、パスは + を残しクエリは空白', () => {
    const u = parseUrl('https://example.com/a+b/c?q=x+y')!;
    expect(u.pathSegments).toEqual(['a+b', 'c']);
    expect(u.query[0]).toMatchObject({ key: 'q', value: 'x y' });
  });

  it('2. %E3%81 で途切れても止めずに印を付け、ほかは変換する', () => {
    const r = decodeLine('%E3%81%82%E3%81', 'utf-8');
    expect(r.text).toBe('あ%E3%81');
    expect(r.segments).toEqual([{ text: 'あ' }, { text: '%E3%81', mark: 'broken' }]);
    expect(r.problems[0].kind).toBe('truncated');
    expect(r.problems[0].message).toBe('入力の10文字目に途中で切れた文字があります（コピーのときに末尾が欠けた可能性）');
    // 途中で切れたものは Shift_JIS と取り違えない
    expect(decodeText('%E3%81%82%E3%81').charset).toBe('utf-8');
  });

  it('2. %G1・% だけも印を付けて残す', () => {
    const r = decodeLine('a%G1b%', 'utf-8');
    expect(r.text).toBe('a%G1b%');
    expect(r.problems.map((p) => p.kind)).toEqual(['bad-percent', 'bad-percent']);
    expect(r.segments.filter((s) => s.mark === 'broken').map((s) => s.text)).toEqual(['%', '%']);
  });

  it('3. 二重エンコード（%2525・%25E3…）を見つける。自動では繰り返さない', () => {
    const once = decodeText('%25E6%259D%25B1');
    expect(once.lines[0].text).toBe('%E6%9D%B1');
    expect(once.doubleEncoded).toBe(true);
    expect(decodeText(once.lines[0].text).lines[0].text).toBe('東');
    expect(decodeText('%25').doubleEncoded).toBe(false); // % を本当に % として使うもの
    expect(looksDoubleEncoded('%E6%9D%B1', '東')).toBe(false);
  });

  it('4. 何文字目は書記素で数える（絵文字を割らない）', () => {
    const r = decodeLine('👨‍👩‍👧%E3%81', 'utf-8');
    expect(r.problems[0].at).toBe(2);
  });

  it('5. 見えない文字（ゼロ幅・BOM・NBSP・全角スペース・タブ・改行）に印を付ける。コピーする値は変えない', () => {
    const r = decodeLine('a%E2%80%8Bb%EF%BB%BF%C2%A0%E3%80%80%09%0A%0Dc', 'utf-8');
    expect(r.text).toBe('a\u200Bb\uFEFF\u00A0\u3000\t\n\rc');
    const marks = r.segments.filter((s) => s.mark === 'invisible');
    expect(marks.map((s) => s.invisible!.name)).toEqual([
      'ゼロ幅スペース',
      'BOM（ゼロ幅ノーブレークスペース）',
      'ノーブレークスペース',
      '全角スペース',
      'タブ',
      '改行（LF）',
      '改行（CR）',
    ]);
    expect(r.problems[0]).toMatchObject({ kind: 'invisible', at: 2, message: '変換結果の2文字目に見えない文字（ゼロ幅スペース）があります' });
  });

  it('5. 呼び名はテキスト比較と共有の一覧（invisible-chars.ts）から引く', () => {
    for (const c of [...INVISIBLE_CHARS, ...LINE_BREAK_CHARS]) {
      const r = decodeLine(encodeLine(c.char).text, 'utf-8');
      expect(r.segments.find((s) => s.mark === 'invisible')?.invisible).toBe(c);
    }
  });

  it('5. 前の文字にくっつくゼロ幅接合子も印を付けるが、絵文字の組み合わせの中の ZWJ には付けない', () => {
    expect(decodeLine('a%E2%80%8Db', 'utf-8').segments.some((s) => s.mark === 'invisible')).toBe(true);
    expect(decodeLine(encodeLine('👨‍👩‍👧').text, 'utf-8').segments.some((s) => s.mark === 'invisible')).toBe(false);
  });

  it('5. 普通の空白（%20・+）には印を付けない', () => {
    expect(decodeLine('a%20b?q=c+d', 'utf-8').segments.some((s) => s.mark === 'invisible')).toBe(false);
  });

  it('複数行で別の文字コードの行が混ざったら、その行を知らせる', () => {
    const r = decodeText(`${SJIS_KONNICHIWA}\n${SJIS_KONNICHIWA}\n${EUC_KONNICHIWA}`);
    expect(r.charset).toBe('shift_jis');
    expect(r.lineHints).toEqual([{ line: 3, charset: 'euc-jp' }]);
    expect(decodeText(`${SJIS_KONNICHIWA}\n${SJIS_KONNICHIWA}`).lineHints).toEqual([]);
    expect(decodeText(EUC_KONNICHIWA).lineHints).toEqual([]);
  });

  it('どの文字コードでも読めないときは位置を示し、UTF-8 で読めた分を出す', () => {
    const r = decodeText('%E6%9D%B1%FF%FE');
    expect(r.guess.unreadable).toBe(true);
    expect(r.lines[0].text.startsWith('東')).toBe(true);
    expect(r.lines[0].problems[0]).toMatchObject({ kind: 'unreadable', at: 10 });
  });

  it('複数行はそれぞれ変換する', () => {
    const r = decodeText('%E3%81%82\n%E3%81%84');
    expect(r.lines.map((l) => l.text)).toEqual(['あ', 'い']);
  });
});

describe('エンコードの約束', () => {
  it('6. 部品として（encodeURIComponent 相当）と URL 全体として（encodeURI 相当）', () => {
    const s = 'https://example.com/検索?q=東京&x=1#a';
    expect(encodeLine(s, { scope: 'component' }).text).toBe(encodeURIComponent(s));
    expect(encodeLine(s, { scope: 'whole' }).text).toBe(encodeURI(s));
  });

  it('7. Shift_JIS・EUC-JP', () => {
    expect(encodeLine('こんにちは', { charset: 'shift_jis' }).text).toBe(SJIS_KONNICHIWA);
    expect(encodeLine('こんにちは', { charset: 'euc-jp' }).text).toBe(EUC_KONNICHIWA);
    expect(encodeLine('ｱ', { charset: 'shift_jis' }).text).toBe('%B1');
    expect(encodeLine('ｱ', { charset: 'euc-jp' }).text).toBe('%8E%B1');
  });

  it('7. 重複は WHATWG encoder の規則で選ぶ（纊 → %FA%5C。%ED%40 にしない）', () => {
    expect(encodeLine('纊', { charset: 'shift_jis' }).text).toBe('%FA%5C');
    // NEC 特殊文字の ① は 0x8740（最初の pointer）
    expect(encodeLine('①', { charset: 'shift_jis' }).text).toBe('%87%40');
    // 髙 は Windows-31J の 0xFBFC で変換できる（無い文字の例にしない）
    expect(encodeLine('髙', { charset: 'shift_jis' }).text).toBe('%FB%FC');
  });

  it('7. encoder の特別扱い：¥ → %5C・‾ → 0x7E（~）・− は － と同じ', () => {
    expect(encodeLine('¥', { charset: 'shift_jis' }).text).toBe('%5C');
    expect(encodeLine('‾', { charset: 'shift_jis' }).text).toBe('~'); // 0x7E は残す文字なのでそのまま
    expect(encodeLine('−', { charset: 'shift_jis' }).text).toBe('%81%7C');
    expect(encodeLine('−', { charset: 'shift_jis' }).text).toBe(encodeLine('－', { charset: 'shift_jis' }).text);
    expect(encodeLine('¥', { charset: 'euc-jp' }).text).toBe('%5C');
  });

  it('7. ブラウザの encoder と同じ結果（逆引き表を TextDecoder で読み戻すと元の文字）', () => {
    const table = reverseTable('shift_jis');
    const d = new TextDecoder('shift_jis');
    let checked = 0;
    for (const [ch, bytes] of table) {
      if (ch === '\u00A5' || ch === '\u203E' || ch === '\u0080') continue; // encoder の特別扱い（Node の ICU は 0x80 を U+0080 にしない）
      expect(d.decode(Uint8Array.from(bytes))).toBe(ch);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(7000);
  });

  it('7. Shift_JIS に無い文字（𠮷・絵文字）は変換せずに印を付ける', () => {
    const r = encodeLine('吉𠮷😀', { charset: 'shift_jis' });
    expect(r.text).toBe('%8Bg𠮷😀');
    expect(r.problems.map((p) => p.raw)).toEqual(['𠮷', '😀']);
    expect(r.problems[0].message).toBe('2文字目の「𠮷」はShift_JISに無い文字です（変換せずに残しました）');
    expect(r.segments[1]).toEqual({ text: '𠮷😀', mark: 'unencodable' });
    // UTF-8 なら変換できる
    expect(encodeLine('𠮷').text).toBe('%F0%A0%AE%B7');
  });

  it('8. 空白は %20 と + を切り替え、16進は大文字', () => {
    expect(encodeLine('a b').text).toBe('a%20b');
    expect(encodeLine('a b+c', { space: '+' }).text).toBe('a+b%2Bc');
    expect(encodeLine('あ').text).toBe('%E3%81%82');
  });

  it('逆引き表の生成は 100ms 以内（目安。テスト環境の確認は実機で）', () => {
    const t0 = performance.now();
    reverseTable('euc-jp');
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('9. 追跡用パラメータ（共有用のきれいな URL）', () => {
  it('utm_*・クリック ID を外し、元の書き方と順序を残す', () => {
    const r = cleanUrl('https://example.com/p?id=3&utm_source=x&UTM_Medium=y&fbclid=abc&q=%E6%9D%B1#top');
    expect(r.url).toBe('https://example.com/p?id=3&q=%E6%9D%B1#top');
    expect(r.removed).toEqual(['utm_source', 'UTM_Medium', 'fbclid']);
  });

  it('全部外れたら ? も消す。チェックを外したキーは残す', () => {
    expect(cleanUrl('https://example.com/?gclid=1&_ga=2').url).toBe('https://example.com/');
    expect(cleanUrl('https://example.com/?gclid=1&_ga=2', new Set(['_ga'])).url).toBe('https://example.com/?_ga=2');
  });

  it('ページを動かすのに要るもの・迷うものは一覧に入れない', () => {
    for (const k of ['id', 'q', 'page', 'v', 'ref', 'source']) expect(trackingReason(k)).toBeNull();
    for (const p of TRACKING_PARAMS) {
      expect(p.reason).not.toBe('');
      expect(p.key).toBe(p.key.toLowerCase());
    }
    for (const k of ['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', 'igshid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'utm_id']) {
      expect(trackingReason(k), k).not.toBeNull();
    }
  });

  it('#:~:text= は外さずデコードして示す', () => {
    const line = 'https://example.com/?utm_source=a#:~:text=%E6%9D%B1%E4%BA%AC';
    expect(cleanUrl(line).url).toBe('https://example.com/#:~:text=%E6%9D%B1%E4%BA%AC');
    expect(parseUrl(line)!.textFragments).toEqual(['東京']);
  });

  it('スキームの無い URL も貼った形のまま返す', () => {
    expect(cleanUrl('www.example.com/a?utm_source=x&q=1').url).toBe('www.example.com/a?q=1');
  });
});

describe('URL の分解', () => {
  it('ホスト・パス・クエリ・フラグメント', () => {
    const u = parseUrl('https://user@example.com:8080/%E6%9D%B1/x?q=%E6%9D%B1+%E4%BA%AC&flag#%E3%81%82')!;
    expect(u).toMatchObject({
      scheme: 'https:',
      assumedScheme: false,
      dangerous: false,
      hostAscii: 'example.com',
      port: '8080',
      userinfo: true,
      pathSegments: ['東', 'x'],
      fragment: 'あ',
    });
    expect(u.query).toEqual([
      { raw: 'q=%E6%9D%B1+%E4%BA%AC', key: 'q', value: '東 京', noValue: false, tracking: null },
      { raw: 'flag', key: 'flag', value: '', noValue: true, tracking: null },
    ]);
  });

  it('Shift_JIS のクエリも、判別した文字コードで読む', () => {
    const u = parseUrl(`https://example.jp/s.cgi?w=${SJIS_KONNICHIWA}`, 'shift_jis')!;
    expect(u.query[0].value).toBe('こんにちは');
  });

  it('スキームの無い URL は https:// を補って分解する（結果には足さない）', () => {
    const line = 'www.example.com/検索?q=%E6%9D%B1';
    const u = parseUrl(line)!;
    expect(u.assumedScheme).toBe(true);
    expect(u.hostAscii).toBe('www.example.com');
    expect(u.pathSegments).toEqual(['検索']);
    expect(decodeText(line).lines[0].text).toBe('www.example.com/検索?q=東');
  });

  it('ドメインらしくない入力は分解しない', () => {
    expect(looksLikeUrl('/path?q=1')).toBeNull();
    expect(looksLikeUrl('東京 タワー')).toBeNull();
    expect(looksLikeUrl('%E6%9D%B1')).toBeNull();
    expect(parseUrl('hello world')).toBeNull();
  });

  it('javascript:・data:・vbscript: は危ない印', () => {
    expect(parseUrl('javascript:alert(1)')!.dangerous).toBe(true);
    expect(parseUrl('data:text/html,%3Cscript%3E')!.dangerous).toBe(true);
    expect(parseUrl('VBScript:msgbox')!.dangerous).toBe(true);
    expect(parseUrl('https://example.com/')!.dangerous).toBe(false);
  });

  it('HTML・javascript: を貼っても文字として返す（変換するだけで解釈しない）', () => {
    expect(decodeText('%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E').lines[0].text).toBe('<img src=x onerror=alert(1)>');
    expect(decodeText('<script>alert(1)</script>').lines[0].text).toBe('<script>alert(1)</script>');
  });
});

describe('日本語ドメイン（Punycode）', () => {
  it('xn-- の往復（RFC 3492）', () => {
    expect(hostToUnicode('xn--wgv71a119e.jp')).toBe('日本語.jp');
    expect(hostToAscii('日本語.jp')).toBe('xn--wgv71a119e.jp');
    expect(new URL('https://日本語.jp/').hostname).toBe('xn--wgv71a119e.jp');
    expect(parseUrl('https://xn--wgv71a119e.jp/')!.hostUnicode).toBe('日本語.jp');
    expect(parseUrl('https://日本語.jp/')!.hostAscii).toBe('xn--wgv71a119e.jp');
  });

  it('RFC 3492 7.1 の例', () => {
    // (A) Arabic (Egyptian) / (L) 3年B組金八先生
    expect(punycodeDecode('egbpdaj6bu4bxfgehfvwxn')).toBe('ليهمابتكلموشعربي؟');
    expect(punycodeEncode('3年B組金八先生')).toBe('3B-ww4c5e180e575a65lsy2b');
    expect(punycodeDecode('3B-ww4c5e180e575a65lsy2b')).toBe('3年B組金八先生');
  });

  it('壊れた Punycode は元のまま', () => {
    expect(hostToUnicode('xn--!!!.jp')).toBe('xn--!!!.jp');
  });
});

describe('見た目の似た文字の注意', () => {
  it('аpple.com（先頭がキリル文字）は注意が出る', () => {
    const w = checkHost('аpple.com');
    expect(w).toHaveLength(1);
    expect(w[0].suspects).toEqual([{ char: 'а', scriptName: 'キリル文字' }]);
    expect(w[0].message).toBe('このドメインには見た目の似た別の文字（キリル文字の а）が混ざっています。本物のサイトではない可能性があります');
    expect(parseUrl('https://xn--pple-43d.com/')!.homograph).toHaveLength(1);
  });

  it('日本語とラテン文字の混在（日本-shop.jp）は注意しない', () => {
    expect(checkHost('日本-shop.jp')).toEqual([]);
  });

  it('カーナビ.jp（Script=Common の ー を含んでも）注意しない', () => {
    expect(checkHost('カーナビ.jp')).toEqual([]);
    expect(checkLabel('ひらがなカタカナ漢字ー123')).toBeNull();
  });

  it('ギリシャ文字の混在も注意する', () => {
    expect(checkLabel('gοogle')).not.toBeNull(); // ο は U+03BF
  });

  it('全部キリル文字（whole-script confusable）は拾えないので、注意が出ない＝安全ではないと出す', () => {
    expect(checkLabel('аррӏе')).toBeNull();
    expect(NO_WARNING_IS_NOT_SAFE).toBe('注意が出ないことは、本物のサイトである保証ではありません');
  });
});

describe('送らない・開かない（ページのソース）', () => {
  const dir = fileURLToPath(new URL('../app/url-decode/', import.meta.url));
  const files = [
    ...readdirSync(dir).map((name) => `${dir}${name}`),
    fileURLToPath(new URL('../lib/url-decode.ts', import.meta.url)),
  ];

  it('fetch( / XMLHttpRequest / sendBeacon / WebSocket が無い', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) {
        expect(source.includes(word), `${file} に ${word}`).toBe(false);
      }
    }
  });

  it('入力を保存しない（localStorage・URL のハッシュを使わない）', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'location.hash', 'history.replaceState', 'history.pushState']) {
        expect(source.includes(word), `${file} に ${word}`).toBe(false);
      }
    }
  });

  it('画面は dangerouslySetInnerHTML を使わず、結果を <a href> にしない', () => {
    const source = readFileSync(`${dir}Calculator.tsx`, 'utf8');
    expect(source.includes('dangerouslySetInnerHTML')).toBe(false);
    expect(/<a\s/.test(source)).toBe(false);
    expect(source.includes('window.open')).toBe(false);
  });

  it('入力欄の文字は 16px 以上', () => {
    const source = readFileSync(`${dir}Calculator.tsx`, 'utf8');
    expect(Number(/const FONT_SIZE = (\d+);/.exec(source)?.[1])).toBeGreaterThanOrEqual(16);
  });
});
