/**
 * ヘボン式ローマ字変換ロジック（パスポート表記）
 *
 * 外務省のパスポート用ヘボン式ローマ字のルールにもとづく。
 * - 基本はヘボン式（し=SHI ち=CHI つ=TSU ふ=FU じ=JI ぢ=JI づ=ZU を=O）
 * - 撥音「ん」: 通常は N。ただし直後が B・M・P の音のときは M（なんば→NAMBA）
 * - 促音「っ」: 次の子音を重ねる（はっとり→HATTORI）。次が CH 音のときは T を置く（はっちょう→HATCHO）
 * - 長音: 「お段+う」「お段+お」は末尾の U/O を表記しない（さいとう→SAITO、おおの→ONO）。
 *   「う段+う」も U を表記しない（ゆうき→YUKI）。「いい」「えい」はそのまま（NIIGATA、EITA）
 * - 長音 O を含む氏名は、申請時に選択できる OH 表記（長音氏名表記）の代替案も返す（おおの→OHNO）
 *
 * 【データ更新箇所】表記ルールが変わったら BASE_MAP / 各判定関数を更新する
 */

/** 変換結果 */
export interface HebonResult {
  /** 変換に成功したか */
  ok: boolean;
  /** パスポート表記（大文字）。ok=false のときは空文字 */
  romaji: string;
  /** 長音 O（おう・おお）を含む場合のみ、OH 表記の代替案。含まない場合は null */
  ohRomaji: string | null;
  /** エラーメッセージ。ok=true のときは null */
  error: string | null;
}

/** 拗音（2文字）の変換表 */
const DIGRAPH_MAP: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
};

/** 単音（1文字）の変換表 */
const BASE_MAP: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};

/**
 * カタカナをひらがなに正規化する（長音符「ー」はそのまま残す）
 */
export function toHiragana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** 内部トークン */
type Token =
  | { type: 'syllable'; char: string; romaji: string }
  | { type: 'n' } // ん
  | { type: 'sokuon' } // っ
  | { type: 'choon' }; // ー

/** ひらがな文字列をトークン列に分解する。変換できない文字は invalid に集める */
function tokenize(kana: string): { tokens: Token[]; invalid: string[] } {
  const tokens: Token[] = [];
  const invalid: string[] = [];
  let i = 0;
  while (i < kana.length) {
    const two = kana.slice(i, i + 2);
    const one = kana[i];
    if (two.length === 2 && DIGRAPH_MAP[two]) {
      tokens.push({ type: 'syllable', char: two, romaji: DIGRAPH_MAP[two] });
      i += 2;
    } else if (one === 'ん') {
      tokens.push({ type: 'n' });
      i += 1;
    } else if (one === 'っ') {
      tokens.push({ type: 'sokuon' });
      i += 1;
    } else if (one === 'ー') {
      tokens.push({ type: 'choon' });
      i += 1;
    } else if (BASE_MAP[one]) {
      tokens.push({ type: 'syllable', char: one, romaji: BASE_MAP[one] });
      i += 1;
    } else {
      if (!invalid.includes(one)) invalid.push(one);
      i += 1;
    }
  }
  return { tokens, invalid };
}

/** トークン列からローマ字を組み立てる（useOh=true なら長音 O を OH と表記） */
function assemble(tokens: Token[], useOh: boolean): { romaji: string; hasLongO: boolean } {
  let out = '';
  let hasLongO = false;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'sokuon') {
      const next = tokens[i + 1];
      if (next && next.type === 'syllable') {
        // 次が CH 音なら T、それ以外は次の子音を重ねる
        out += next.romaji.startsWith('ch') ? 't' : next.romaji[0];
      }
      i += 1;
      continue;
    }
    if (t.type === 'n') {
      const next = tokens[i + 1];
      const nextFirst = next && next.type === 'syllable' ? next.romaji[0] : '';
      out += nextFirst === 'b' || nextFirst === 'm' || nextFirst === 'p' ? 'm' : 'n';
      i += 1;
      continue;
    }
    if (t.type === 'choon') {
      // 単独の「ー」（先頭など）は無視される
      i += 1;
      continue;
    }
    // syllable
    out += t.romaji;
    const lastVowel = t.romaji[t.romaji.length - 1];
    const next = tokens[i + 1];
    if (next) {
      const isU = next.type === 'syllable' && (next.char === 'う' || next.char === 'ぅ');
      const isO = next.type === 'syllable' && (next.char === 'お' || next.char === 'ぉ');
      const isChoon = next.type === 'choon';
      if (lastVowel === 'o' && (isU || isO || isChoon)) {
        // 長音 O: 表記しない（OH 表記なら H を置く）
        hasLongO = true;
        if (useOh) out += 'h';
        i += 2;
        continue;
      }
      if (lastVowel === 'u' && (isU || isChoon)) {
        // 長音 U: 表記しない
        i += 2;
        continue;
      }
      if (isChoon) {
        // あ・い・え段の「ー」は同じ母音を重ねる（カタカナ名対応）
        out += lastVowel;
        i += 2;
        continue;
      }
    }
    i += 1;
  }
  return { romaji: out.toUpperCase(), hasLongO };
}

/**
 * ひらがな・カタカナの氏名をパスポート用ヘボン式ローマ字（大文字）に変換する。
 *
 * @param input ひらがなまたはカタカナの文字列（空白は無視）
 * @returns 変換結果。長音 O を含む場合は OH 表記の代替案（ohRomaji）も返す
 */
export function toHebonRomaji(input: string): HebonResult {
  const trimmed = input.replace(/[\s　]/g, '');
  if (trimmed === '') {
    return { ok: false, romaji: '', ohRomaji: null, error: 'ひらがなまたはカタカナを入力してください。' };
  }
  const kana = toHiragana(trimmed);
  const { tokens, invalid } = tokenize(kana);
  if (invalid.length > 0) {
    return {
      ok: false,
      romaji: '',
      ohRomaji: null,
      error: `変換できない文字が含まれています: ${invalid.join('、')}（ひらがな・カタカナで入力してください）`,
    };
  }
  const normal = assemble(tokens, false);
  const ohRomaji = normal.hasLongO ? assemble(tokens, true).romaji : null;
  return { ok: true, romaji: normal.romaji, ohRomaji, error: null };
}
