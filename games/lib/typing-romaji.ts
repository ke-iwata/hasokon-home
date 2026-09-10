/**
 * タイピング練習のローマ字判定
 *
 * 仕様: docs/features/game-typing.md
 *
 * ## 何をするモジュールか
 *
 * かなの語（「しゅっぱつ」）を**打鍵の単位（かたまり）に切り**、
 * それぞれが受け付けるローマ字表記の一覧を持つ。1打ごとの判定は
 * `typeChar()` が行い、`Progress`（どのかたまりの何文字目まで打てたか）を進める。
 *
 * ## 方針
 *
 * - **ヘボン式と訓令式の両方を受け付ける**（し = shi / si、ちゃ = cha / tya）。
 *   打ち方を1つに強制すると「いつもの打ち方だと間違い扱いになる」練習になる
 * - `tools/lib/hebon-romaji.ts`（ヘボン式変換）は**参照にとどめ、流用しない**。
 *   あちらは かな → ローマ字の一方向変換で、ここは
 *   「打たれたローマ字がこのかなとして妥当か」の照合。方向も要件も違う
 * - **表示するローマ字は、打たれた文字に合わせて選び直す**（`romajiView`）。
 *   `shi` と出しておいて `si` を受け付けると、打っている途中で見本と
 *   食い違って読めなくなる
 *
 * ## 判定の山場（テストで網羅する）
 *
 * - **促音「っ」は次のかたまりに合体させる。** 「っぱ」= `ppa` / `xtupa` / `ltupa`。
 *   単独のかたまりにすると「次の子音」を判定のたびに引き直すことになる
 * - **撥音「ん」は次のかたまり次第で n 1打か 2打かが変わる。**
 *   次が子音（な行・や行を除く）なら `n` 1打でよい（ほんき → honki）。
 *   次が母音・な行・や行なら `nn`（かんな → kanna。`kana` と区別できないため）
 * - **語末の「ん」は `nn` / `xn` だけにする。** 語末で `n` 1打を認めると、
 *   `n` を打った瞬間に語が終わり、続けて打った2打目が次の語のミスになる
 */

/** 1打鍵ぶんの単位。表示するかなと、受け付けるローマ字表記 */
export interface Chunk {
  /** このかたまりが表すかな（「きゃ」「っぱ」「ん」「か」） */
  kana: string;
  /**
   * 受け付けるローマ字表記。**先頭が既定の表記**（まだ打っていないかたまりの
   * 見本として出す）。ヘボン式を先頭に置いてある（サイトのヘボン式変換ツールと
   * 見た目をそろえるため。訓令式で打っても正しく判定される）
   */
  patterns: string[];
}

/** どこまで打てたか。`chunk` 番目のかたまりを `typed` まで打った状態 */
export interface Progress {
  /** いま打っているかたまりの位置（`chunks.length` に達したら語を打ち切り） */
  chunk: number;
  /** そのかたまりで打てているローマ字（かたまりを打ち切ると空に戻る） */
  typed: string;
  /** 語のはじめから正しく打てたローマ字すべて（`typed` を含む。表示用） */
  text: string;
}

/** 1打の判定結果 */
export interface TypeOutcome {
  /** 打ったあとの状態（ミスなら変わらない） */
  progress: Progress;
  /** 正しい打鍵だったか */
  ok: boolean;
  /** この1打で語を打ち切ったか */
  done: boolean;
}

/** 拗音など、かな2文字で1打鍵単位になるもの */
const DIGRAPHS: Record<string, string[]> = {
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'], しぇ: ['she', 'sye'],
  じゃ: ['ja', 'zya', 'jya'], じゅ: ['ju', 'zyu', 'jyu'], じょ: ['jo', 'zyo', 'jyo'],
  ちゃ: ['cha', 'tya'], ちゅ: ['chu', 'tyu'], ちょ: ['cho', 'tyo'], ちぇ: ['che', 'tye'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'],
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'],
  てぃ: ['thi'], でぃ: ['dhi'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'],
};

/** かな1文字で1打鍵単位になるもの（「っ」「ん」は別扱い） */
const SINGLES: Record<string, string[]> = {
  あ: ['a'], い: ['i'], う: ['u'], え: ['e'], お: ['o'],
  か: ['ka'], き: ['ki'], く: ['ku'], け: ['ke'], こ: ['ko'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  さ: ['sa'], し: ['shi', 'si'], す: ['su'], せ: ['se'], そ: ['so'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['wo'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li'], ぅ: ['xu', 'lu'], ぇ: ['xe', 'le'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'],
};

/** 促音「っ」そのものを打つ表記（次の子音を重ねられないときに使う） */
const SOKUON_ALONE = ['xtu', 'ltu', 'xtsu', 'ltsu'];

/** 撥音「ん」を必ず打てる表記（語末はこれだけを受け付ける） */
const NN_ALWAYS = ['nn', 'xn'];

/** 母音。促音の子音重ねが使えるかどうかの判定に使う */
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

/** 「ん」を n 1打で済ませられない次の子音（な行・や行。`nn` と読み分けられない） */
const AMBIGUOUS_AFTER_N = new Set(['n', 'y']);

/** このモジュールが打鍵単位に切れるかな（語彙リストの検査から使う） */
export function isTypableKana(kana: string): boolean {
  try {
    segment(kana);
    return true;
  } catch {
    return false;
  }
}

/** 位置 `i` から1打鍵単位を1つ切り出す（「っ」「ん」は呼び出し側で処理する） */
function readUnit(kana: string, i: number): { kana: string; patterns: string[]; next: number } | null {
  const pair = kana.slice(i, i + 2);
  const digraph = DIGRAPHS[pair];
  if (digraph) return { kana: pair, patterns: digraph, next: i + 2 };
  const single = SINGLES[kana[i]];
  if (single) return { kana: kana[i], patterns: single, next: i + 1 };
  return null;
}

/**
 * かなの語を打鍵の単位に切る。変換できない文字があれば投げる
 * （語彙リストの取り違えをビルド・テストで止めるため）。
 */
export function segment(word: string): Chunk[] {
  const chunks: Chunk[] = [];
  /** 「ん」のかたまりは次のかたまりが決まってから表記を埋める */
  const pendingN: number[] = [];
  let i = 0;

  while (i < word.length) {
    const ch = word[i];

    if (ch === 'っ') {
      const rest = readUnit(word, i + 1);
      if (!rest) {
        // 語末の「っ」など、重ねる子音が無い場合。単独表記だけで打てるようにする
        chunks.push({ kana: 'っ', patterns: [...SOKUON_ALONE] });
        i += 1;
        continue;
      }
      // 子音を重ねる打ち方（っぱ → ppa）。母音で始まる表記には重ねられない。
      // **ch で始まる表記だけは t を置く**（まっちゃ → matcha）。
      // ヘボン式の約束で、`tools/lib/hebon-romaji.ts` の「次が CH 音のときは T」と同じ。
      // `ccha` も打てるようにしておく（IMEのローマ字入力ではどちらも通るため）
      const doubled = rest.patterns
        .filter((p) => !VOWELS.has(p[0]))
        .flatMap((p) => (p.startsWith('ch') ? ['t' + p, p[0] + p] : [p[0] + p]));
      const spelled = SOKUON_ALONE.flatMap((s) => rest.patterns.map((p) => s + p));
      chunks.push({ kana: 'っ' + rest.kana, patterns: [...doubled, ...spelled] });
      i = rest.next;
      continue;
    }

    if (ch === 'ん') {
      pendingN.push(chunks.length);
      chunks.push({ kana: 'ん', patterns: [...NN_ALWAYS] });
      i += 1;
      continue;
    }

    const unit = readUnit(word, i);
    if (!unit) {
      throw new Error(`ローマ字に変換できない文字が含まれています: ${word}（${ch}）`);
    }
    chunks.push({ kana: unit.kana, patterns: unit.patterns });
    i = unit.next;
  }

  // 「ん」の表記を、次のかたまりを見てから決める
  for (const at of pendingN) {
    const next = chunks[at + 1];
    if (!next) continue; // 語末は `nn` / `xn` のまま
    // 次がすべて「な行・や行以外の子音」で始まるときだけ n 1打を許す。
    // 見本には短いほう（`n`）を出したいので先頭に置く
    const singleOk = next.patterns.every((p) => !VOWELS.has(p[0]) && !AMBIGUOUS_AFTER_N.has(p[0]));
    if (singleOk) chunks[at] = { kana: 'ん', patterns: ['n', ...NN_ALWAYS] };
  }

  return chunks;
}

/** まだ打っていない状態 */
export function initialProgress(): Progress {
  return { chunk: 0, typed: '', text: '' };
}

/** `typed` まで打った状態で、そのかたまりを打ち切ったといえるか */
function satisfied(chunk: Chunk, typed: string): boolean {
  return typed.length > 0 && chunk.patterns.includes(typed);
}

/**
 * `typed` でかたまりが確定したか。
 *
 * **表記として完成していても、それを頭に持つ長い表記が残っていれば確定させない。**
 * 「ん」の `n` と `nn` がこれで、`n` の時点で次のかたまりへ進めてしまうと、
 * 続けて打たれた2打目の `n` が理不尽なミスになる。
 */
function settled(chunk: Chunk, typed: string): boolean {
  if (!satisfied(chunk, typed)) return false;
  return !chunk.patterns.some((p) => p.length > typed.length && p.startsWith(typed));
}

/** かたまりを1つ進めた `Progress` を作る */
function advance(chunks: Chunk[], progress: Progress, at: number, typed: string): Progress {
  const text = progress.text.slice(0, progress.text.length - progress.typed.length) + typed;
  return settled(chunks[at], typed)
    ? { chunk: at + 1, typed: '', text }
    : { chunk: at, typed, text };
}

/**
 * 1打ぶんの判定。正しければ `Progress` が進み、間違いならそのまま返る
 * （間違えても進まない＝仕様の「その場で赤くなる（進まない）」）。
 *
 * `key` は英字1文字を想定する（`isTypingKey` で絞ってから渡す）。
 */
export function typeChar(chunks: Chunk[], progress: Progress, key: string): TypeOutcome {
  const current = chunks[progress.chunk];
  if (!current) return { progress, ok: false, done: true };

  const lower = key.toLowerCase();
  const candidate = progress.typed + lower;

  // いま打っているかたまりの続きとして受け付けられるか
  if (current.patterns.some((p) => p.startsWith(candidate))) {
    const next = advance(chunks, progress, progress.chunk, candidate);
    return { progress: next, ok: true, done: next.chunk >= chunks.length };
  }

  // 続きにならなくても、いまのかたまりが表記として完成していれば
  // 次のかたまりの1打目として受け付ける（「ほんき」の `n` → `k`）
  if (satisfied(current, progress.typed)) {
    const following = chunks[progress.chunk + 1];
    if (following && following.patterns.some((p) => p.startsWith(lower))) {
      const moved: Progress = { chunk: progress.chunk + 1, typed: '', text: progress.text };
      const next = advance(chunks, moved, moved.chunk, lower);
      return { progress: next, ok: true, done: next.chunk >= chunks.length };
    }
  }

  return { progress, ok: false, done: false };
}

/**
 * 画面に出すローマ字。**打たれた文字に合わせて見本を選び直す**ので、
 * `si` と打っても見本が `shi` のまま残って食い違うことがない。
 */
export function romajiView(chunks: Chunk[], progress: Progress): { typed: string; rest: string } {
  const rest = chunks
    .slice(progress.chunk)
    .map((chunk, offset) =>
      offset === 0
        ? (chunk.patterns.find((p) => p.startsWith(progress.typed)) ?? chunk.patterns[0])
        : chunk.patterns[0],
    )
    .join('');
  return { typed: progress.text, rest: rest.slice(progress.typed.length) };
}

/** まだ1打も打っていないときの見本（語彙リストの検査とページの解説から使う） */
export function defaultRomaji(word: string): string {
  return segment(word)
    .map((chunk) => chunk.patterns[0])
    .join('');
}

/**
 * その `KeyboardEvent.key` を打鍵として扱うか。
 *
 * **英字1文字だけを受ける。** Shift や矢印キーまでミスに数えると、
 * 何もしていないのに正確率が下がる。修飾キーを伴う操作（Ctrl+R など）も除く。
 */
export function isTypingKey(key: string, modified = false): boolean {
  if (modified) return false;
  return key.length === 1 && /^[a-zA-Z]$/.test(key);
}
