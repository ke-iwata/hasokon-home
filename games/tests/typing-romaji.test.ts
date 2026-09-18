import { describe, expect, it } from 'vitest';
import {
  defaultRomaji,
  initialProgress,
  isTypableKana,
  isTypingKey,
  romajiView,
  segment,
  typeChar,
  type Chunk,
} from '@/lib/typing-romaji';

/**
 * ローマ字判定のテスト。
 *
 * 仕様: docs/features/game-typing.md（「ローマ字判定は複数表記を受け付ける」）
 *
 * ここが仕様書の言う「判定の山場」で、**促音（子音重ね）と「ん」の n 1打/2打**が
 * いちばん壊れやすい。表記ゆれを1つ受け落とすと、その打ち方の人にとっては
 * 「正しく打っているのにミスになる」ゲームになるので、網羅して固定する。
 */

/** 語に対してローマ字を打ち込み、結果をまとめる */
function play(word: string, keys: string) {
  const chunks = segment(word);
  let progress = initialProgress();
  let hits = 0;
  let misses = 0;
  let done = false;
  for (const key of keys) {
    const outcome = typeChar(chunks, progress, key);
    if (outcome.ok) {
      hits += 1;
      progress = outcome.progress;
      if (outcome.done) done = true;
    } else {
      misses += 1;
    }
  }
  return { hits, misses, done, progress };
}

/** その打ち方で最後まで打ち切れる（1回もミスにならない）か */
function typable(word: string, keys: string): boolean {
  const r = play(word, keys);
  return r.done && r.misses === 0 && r.hits === keys.length;
}

/** かたまりのかなだけを並べる（切り方の確認用） */
function kanaOf(chunks: Chunk[]): string[] {
  return chunks.map((c) => c.kana);
}

describe('segment（打鍵の単位に切る）', () => {
  it('清音は1文字ずつ', () => {
    expect(kanaOf(segment('ねこ'))).toEqual(['ね', 'こ']);
  });

  it('拗音は2文字で1つ', () => {
    expect(kanaOf(segment('きゃく'))).toEqual(['きゃ', 'く']);
    expect(kanaOf(segment('しゅくだい'))).toEqual(['しゅ', 'く', 'だ', 'い']);
  });

  it('促音は次のかたまりに合体させる', () => {
    expect(kanaOf(segment('しゅっぱつ'))).toEqual(['しゅ', 'っぱ', 'つ']);
    expect(kanaOf(segment('きっぷ'))).toEqual(['き', 'っぷ']);
  });

  it('促音＋拗音も1つのかたまりになる', () => {
    expect(kanaOf(segment('やっきょく'))).toEqual(['や', 'っきょ', 'く']);
  });

  it('「ん」は単独のかたまり', () => {
    expect(kanaOf(segment('ほんき'))).toEqual(['ほ', 'ん', 'き']);
  });

  it('変換できない文字が混ざっていたら投げる（語彙リストの取り違えを止める）', () => {
    expect(() => segment('ラーメン')).toThrow(/変換できない/);
    expect(() => segment('こーひー')).toThrow(/変換できない/);
    expect(() => segment('漢字')).toThrow(/変換できない/);
  });

  it('isTypableKana は投げずに真偽で返す', () => {
    expect(isTypableKana('しゅっぱつしんこう')).toBe(true);
    expect(isTypableKana('こーひー')).toBe(false);
  });
});

describe('表記ゆれ（ヘボン式と訓令式の両方を受け付ける）', () => {
  it('し は shi でも si でも打てる', () => {
    expect(typable('しお', 'shio')).toBe(true);
    expect(typable('しお', 'sio')).toBe(true);
  });

  it('ち は chi でも ti でも打てる', () => {
    expect(typable('ちかい', 'chikai')).toBe(true);
    expect(typable('ちかい', 'tikai')).toBe(true);
  });

  it('つ は tsu でも tu でも打てる', () => {
    expect(typable('つき', 'tsuki')).toBe(true);
    expect(typable('つき', 'tuki')).toBe(true);
  });

  it('ふ は fu でも hu でも打てる', () => {
    expect(typable('ふね', 'fune')).toBe(true);
    expect(typable('ふね', 'hune')).toBe(true);
  });

  it('じ は ji でも zi でも打てる', () => {
    expect(typable('じかん', 'jikann')).toBe(true);
    expect(typable('じかん', 'zikann')).toBe(true);
  });

  it('ちゃ は cha でも tya でも打てる', () => {
    expect(typable('ちゃいろ', 'chairo')).toBe(true);
    expect(typable('ちゃいろ', 'tyairo')).toBe(true);
  });

  it('しゃ は sha でも sya でも打てる', () => {
    expect(typable('しゃしん', 'shashinn')).toBe(true);
    expect(typable('しゃしん', 'syasinn')).toBe(true);
  });

  it('じゃ は ja / zya / jya のどれでも打てる', () => {
    expect(typable('じゃがいも', 'jagaimo')).toBe(true);
    expect(typable('じゃがいも', 'zyagaimo')).toBe(true);
    expect(typable('じゃがいも', 'jyagaimo')).toBe(true);
  });

  it('小書きのかなは x でも l でも打てる', () => {
    expect(typable('ふぁ', 'fa')).toBe(true);
    expect(typable('ぁ', 'xa')).toBe(true);
    expect(typable('ぁ', 'la')).toBe(true);
  });

  it('大文字で打っても同じに扱う（CapsLock を押していても遊べる）', () => {
    expect(typable('ねこ', 'NEKO')).toBe(true);
    expect(typable('しお', 'SHIO')).toBe(true);
  });
});

describe('促音「っ」', () => {
  it('次の子音を重ねて打てる', () => {
    expect(typable('きっぷ', 'kippu')).toBe(true);
    expect(typable('がっこう', 'gakkou')).toBe(true);
    expect(typable('しゅっぱつ', 'shuppatsu')).toBe(true);
  });

  it('重ねる子音は次のかたまりの表記に追随する（っち は tch でも tt でも）', () => {
    expect(typable('まっちゃ', 'matcha')).toBe(true);
    expect(typable('まっちゃ', 'mattya')).toBe(true);
  });

  it('xtu / ltu で「っ」だけを打つ書き方も受け付ける', () => {
    expect(typable('きっぷ', 'kixtupu')).toBe(true);
    expect(typable('きっぷ', 'kiltupu')).toBe(true);
    expect(typable('きっぷ', 'kixtsupu')).toBe(true);
  });

  it('子音を重ねない打ち方はミスになる（進まない）', () => {
    const r = play('きっぷ', 'kipu');
    expect(r.done).toBe(false);
    expect(r.misses).toBeGreaterThan(0);
  });
});

describe('撥音「ん」の n 1打 / 2打', () => {
  it('次が子音なら n 1打でよい', () => {
    expect(typable('ほんき', 'honki')).toBe(true);
    expect(typable('しんかんせん', 'shinkansenn')).toBe(true);
  });

  it('次が子音でも nn 2打で打てる（どちらの打ち方も通す）', () => {
    expect(typable('ほんき', 'honnki')).toBe(true);
    expect(typable('しんかんせん', 'shinnkannsenn')).toBe(true);
  });

  it('次が な行 なら nn が要る（かんな と かな を読み分けるため）', () => {
    // ん を `nn` で確定させてから な を打つので n は3つ（IMEのローマ字入力と同じ）
    expect(typable('かんな', 'kannna')).toBe(true);
    const r = play('かんな', 'kana');
    expect(r.done).toBe(false);
    expect(r.misses).toBe(1);
  });

  it('n 2打で「ん」を確定させたあと、な行の n を続けて打てる', () => {
    // `kanna` は「かんあ」の打ち方なので、最後の a はミスになる
    const r = play('かんな', 'kanna');
    expect(r.done).toBe(false);
    expect(r.misses).toBe(1);
  });

  it('次が母音なら nn が要る', () => {
    expect(typable('きんえん', 'kinnenn')).toBe(true);
    expect(play('きんえん', 'kinenn').misses).toBeGreaterThan(0);
  });

  it('次が や行 なら nn が要る', () => {
    expect(typable('ほんや', 'honnya')).toBe(true);
    expect(play('ほんや', 'honya').misses).toBeGreaterThan(0);
  });

  it('語末の「ん」は nn（n 1打では打ち切らない）', () => {
    expect(typable('ほん', 'honn')).toBe(true);
    const r = play('ほん', 'hon');
    expect(r.done).toBe(false);
    expect(r.misses).toBe(0); // 途中まで正しい。まだ打ち切っていないだけ
  });

  it('xn でも打てる', () => {
    expect(typable('ほん', 'hoxn')).toBe(true);
  });

  it('「ん」の n を打った直後に次のかたまりへ移れる（n が nn の頭でも詰まらない）', () => {
    // ここが壊れると honki の k が理不尽なミスになる
    const chunks = segment('ほんき');
    let p = initialProgress();
    for (const key of 'hon') p = typeChar(chunks, p, key).progress;
    const outcome = typeChar(chunks, p, 'k');
    expect(outcome.ok).toBe(true);
  });
});

describe('typeChar（1打ごとの判定）', () => {
  it('間違いでは進まない', () => {
    const chunks = segment('ねこ');
    const outcome = typeChar(chunks, initialProgress(), 'x');
    expect(outcome.ok).toBe(false);
    expect(outcome.progress).toEqual(initialProgress());
  });

  it('打ち切ったら done になる', () => {
    expect(play('ねこ', 'neko').done).toBe(true);
  });

  it('打ち切ったあとの打鍵は done を返して数えない', () => {
    const chunks = segment('ね');
    const after = typeChar(chunks, { chunk: 1, typed: '', text: 'ne' }, 'a');
    expect(after.ok).toBe(false);
    expect(after.done).toBe(true);
  });

  it('長い語を最後まで打ち切れる（ヘボン式・訓令式のどちらでも）', () => {
    expect(typable('しゅっぱつしんこう', 'shuppatsushinkou')).toBe(true);
    expect(typable('しゅっぱつしんこう', 'syuppatusinnkou')).toBe(true);
  });
});

describe('romajiView（見本の出し分け）', () => {
  it('打つ前はヘボン式の見本を出す', () => {
    const chunks = segment('しお');
    expect(romajiView(chunks, initialProgress())).toEqual({ typed: '', rest: 'shio' });
  });

  it('訓令式で打ち始めたら見本もそちらに切り替わる', () => {
    const chunks = segment('しお');
    const first = typeChar(chunks, initialProgress(), 's').progress;
    const view = romajiView(chunks, first);
    expect(view.typed).toBe('s');
    expect(view.typed + view.rest).toBe('shio');

    const second = typeChar(chunks, first, 'i').progress;
    const after = romajiView(chunks, second);
    expect(after.typed).toBe('si');
    expect(after.typed + after.rest).toBe('sio');
  });

  it('打ち切ると残りが無くなる', () => {
    const chunks = segment('ねこ');
    const { progress } = play('ねこ', 'neko');
    expect(romajiView(chunks, progress)).toEqual({ typed: 'neko', rest: '' });
  });

  it('defaultRomaji は見本そのもの', () => {
    expect(defaultRomaji('しゅっぱつしんこう')).toBe('shuppatsushinkou');
    expect(defaultRomaji('ほん')).toBe('honn');
    expect(defaultRomaji('ほんき')).toBe('honki');
  });
});

describe('isTypingKey（打鍵として数えるキー）', () => {
  it('英字1文字だけを受ける', () => {
    expect(isTypingKey('a')).toBe(true);
    expect(isTypingKey('Z')).toBe(true);
  });

  it('修飾キー・矢印・記号は数えない（何もしていないのに正確率が下がらないように）', () => {
    expect(isTypingKey('Shift')).toBe(false);
    expect(isTypingKey('ArrowLeft')).toBe(false);
    expect(isTypingKey('Enter')).toBe(false);
    expect(isTypingKey(' ')).toBe(false);
    expect(isTypingKey('1')).toBe(false);
    expect(isTypingKey('-')).toBe(false);
  });

  it('Ctrl などを押しながらの操作は数えない（Ctrl+R で正確率が下がらない）', () => {
    expect(isTypingKey('r', true)).toBe(false);
  });
});
