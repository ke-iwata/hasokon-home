import { describe, expect, it } from 'vitest';
import { KANJI, gradeOf, isJoyo, isKyoiku } from '@/lib/jukugo/kanji';
import { AMBIGUOUS_WORDS, parseWords, WORDS, type Word } from '@/lib/jukugo/words';
import { isHiragana, matchesKanjiReading, soundVariants, toHiragana } from '@/lib/jukugo/reading';
import {
  blankIndex,
  buildLexicon,
  centerReading,
  centersFor,
  charAllowed,
  findAlternatives,
  generatePuzzle,
  isCorrect,
  matchCount,
  maskedWord,
  meaningHint,
  readingCandidates,
  readingHint,
  SLOTS,
  TIER_ORDER,
  wordAt,
  type Puzzle,
  type Tier,
} from '@/lib/jukugo/generate';
import { DAILY_VERSIONS, dailyCenter, dailyPuzzle, dayIndex, latestLexicon, lexiconFor, versionFor } from '@/lib/jukugo/daily';
import {
  attemptEmoji,
  EMPTY_ATTEMPT,
  isFinished,
  isSolved,
  readDailyAttempt,
  shareText,
  solvedOnTry,
  tryChar,
  variantOf,
  writeDailyAttempt,
  type ProgressStorage,
} from '@/lib/jukugo/session';
import { mulberry32, previousDateKey } from '@/lib/daily';

/**
 * 熟語パズル（漢字の穴埋め）のテスト。
 *
 * 仕様: docs/features/game-jukugo-anaume.md の「テスト」
 */

/** 2026-12-01 から n 日ぶんの日付キー */
function days(n: number, from = '2026-12-01'): string[] {
  const [y, m, d] = from.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  });
}

/** 問題を1行に（スナップショット用）。答え：上左/下右：4択 */
function summary(p: Puzzle): string {
  const c = p.clues;
  return `${p.answer}:${c.top}${c.left}/${c.bottom}${c.right}:${p.choices.join('')}:${p.hintSlot[0]}${p.meaningSlot[0]}`;
}

const lex = latestLexicon();

/** 段ごとに、日替わり60日＋練習60問を作っておく（重いので1回だけ） */
const samples: Record<Tier, Puzzle[]> = {
  sho: [],
  chu: [],
  otona: [],
};
for (const tier of TIER_ORDER) {
  const rng = mulberry32(42);
  samples[tier] = [
    ...days(60).map((k) => dailyPuzzle(k, tier)),
    ...Array.from({ length: 60 }, () => generatePuzzle(lex, tier, rng)),
  ];
}

describe('字の表（kanji.ts）', () => {
  it('常用漢字表の 2,136 字がある', () => {
    expect(KANJI.size).toBe(2136);
  });

  it('教育漢字は学年別漢字配当表のとおり 1,026 字（1年80・2年160・3年200・4年202・5年193・6年191）', () => {
    const count = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const info of KANJI.values()) count[info.grade] += 1;
    expect(count.slice(1, 7)).toEqual([80, 160, 200, 202, 193, 191]);
    expect(count[7]).toBe(2136 - 1026);
  });

  it('学年の値が配当表と一致する（見本）', () => {
    expect(gradeOf('一')).toBe(1);
    expect(gradeOf('学')).toBe(1);
    expect(gradeOf('病')).toBe(3);
    expect(gradeOf('院')).toBe(3);
    expect(gradeOf('看')).toBe(6);
    expect(gradeOf('鮮')).toBe(7);
    expect(gradeOf('茨')).toBe(4); // 2020年度からの都道府県名の字
    expect(gradeOf('鬱')).toBe(7);
    expect(gradeOf('龍')).toBeUndefined(); // 表外字
  });

  it('音訓はひらがなで、送り仮名を落としてある', () => {
    for (const [ch, info] of KANJI) {
      expect(info.readings.length, ch).toBeGreaterThan(0);
      for (const r of info.readings) expect(isHiragana(r), `${ch}:${r}`).toBe(true);
    }
    expect(KANJI.get('病')?.readings).toEqual(['びょう', 'へい', 'や', 'やまい']);
    expect(KANJI.get('生')?.readings).toContain('しょう');
  });
});

describe('熟語の表（words.ts）', () => {
  it('800 語以上ある', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(800);
  });

  it('すべての語が2字で、両方の字が常用漢字表にある', () => {
    for (const w of WORDS) {
      expect(Array.from(w.word), w.word).toHaveLength(2);
      expect(w.chars.every((c) => isJoyo(c)), w.word).toBe(true);
    }
  });

  it('学年は2字のうち高いほう（字の表から引いた値）', () => {
    for (const w of WORDS) {
      expect(w.grade, w.word).toBe(Math.max(gradeOf(w.chars[0])!, gradeOf(w.chars[1])!));
    }
  });

  it('読みはひらがなだけで、字ごとの読みが字の表の音訓（連濁・促音を含む）で説明できる', () => {
    for (const w of WORDS) {
      expect(w.reading, w.word).toBe(w.readings.join(''));
      w.chars.forEach((c, i) => {
        expect(isHiragana(w.readings[i]), `${w.word}:${w.readings[i]}`).toBe(true);
        expect(matchesKanjiReading(c, w.readings[i]), `${w.word} の ${c}（${w.readings[i]}）`).toBe(true);
      });
    }
  });

  it('語の重複が無い', () => {
    const seen = new Set<string>();
    const dup = WORDS.filter((w) => (seen.has(w.word) ? true : (seen.add(w.word), false))).map((w) => w.word);
    expect(dup).toEqual([]);
  });

  it('読みが2つある語・熟字訓は表に入れていない', () => {
    const hit = WORDS.filter((w) => AMBIGUOUS_WORDS.includes(w.word)).map((w) => w.word);
    expect(hit).toEqual([]);
  });

  it('意味の1行がある', () => {
    for (const w of WORDS) expect(w.meaning.length, w.word).toBeGreaterThan(1);
  });

  it('小学生の段の語（両方が教育漢字）がたっぷりある', () => {
    expect(WORDS.filter((w) => !w.hard && w.chars.every((c) => isKyoiku(c))).length).toBeGreaterThan(500);
  });

  it('書式の違う行は読み込みで落ちる', () => {
    expect(() => parseWords('看病 かんびょう 意味', 1)).toThrow();
    expect(() => parseWords('看 かん・びょう 意味', 1)).toThrow();
    expect(parseWords('!看病 かん・びょう 病人の世話', 3)[0]).toMatchObject({ hard: true, since: 3, word: '看病' });
  });
});

describe('読みの照合', () => {
  it('カタカナはひらがなに直す', () => {
    expect(toHiragana(' ビョウ ')).toBe('びょう');
  });

  it('連濁・半濁音・促音の形を並べる', () => {
    expect(soundVariants('はつ')).toEqual(expect.arrayContaining(['はつ', 'ばつ', 'ぱつ', 'はっ', 'ぱっ']));
    expect(soundVariants('がく')).toContain('がっ');
  });
});

describe('出題（generate.ts）', () => {
  it('段ごとに、真ん中に置ける字が 50 字以上ある', () => {
    for (const tier of TIER_ORDER) expect(centersFor(lex, tier).length, tier).toBeGreaterThanOrEqual(50);
  });

  it('生成した問題の4つの熟語は表の語で、盤の字と答えから作れる', () => {
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier]) {
        for (const s of SLOTS) {
          const w = p.words[s];
          expect(lex.all.get(w.word)).toBe(w);
          expect(wordAt(s, p.clues[s], p.answer)).toBe(w.word);
          expect(w.chars[blankIndex(s)]).toBe(p.answer);
        }
        // 盤の4字は答えと別で、互いに重ならない
        const clues = SLOTS.map((s) => p.clues[s]);
        expect(new Set([...clues, p.answer]).size).toBe(5);
      }
    }
  });

  it('別解の列挙が正しい（常用漢字を総当たりして確かめる）', () => {
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier].slice(0, 30)) {
        const brute = [...KANJI.keys()]
          .filter((c) => c !== p.answer && charAllowed(tier, c) && matchCount(lex, p.clues, c) === 4)
          .sort();
        expect(p.alternatives).toEqual(brute);
        for (const alt of p.alternatives) expect(isCorrect(p, alt)).toBe(true);
      }
    }
  });

  it('別解がある盤を作ると列挙され、どれも正解になる', () => {
    // 「中」「本」で始まり「心」で終わる表に、真ん中「心」と「身」の両方が入るようにする
    const words = parseWords(
      ['中心 ちゅう・しん x', '本心 ほん・しん x', '心身 しん・しん x', '心理 しん・り x', '心配 しん・ぱい x',
        '中身 なか・み x', '本身 ほん・み x', '身理 しん・り x', '身配 しん・ぱい x'].join('\n'),
      1,
    );
    const small = buildLexicon(words);
    const alts = findAlternatives(small, 'sho', { top: '中', left: '本', bottom: '理', right: '配' }, '心');
    expect(alts).toEqual(['身']);
  });

  it('4択は答え＋誤答3つで、誤答は4つの熟語を全部は満たさない', () => {
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier]) {
        expect(p.choices).toHaveLength(4);
        expect(new Set(p.choices).size).toBe(4);
        expect(p.choices).toContain(p.answer);
        for (const c of p.choices.filter((x) => x !== p.answer)) {
          expect(matchCount(lex, p.clues, c), `${summary(p)} の ${c}`).toBeLessThan(4);
          expect(isCorrect(p, c)).toBe(false);
        }
      }
    }
  });

  it('誤答の多くは「4語のうち2〜3語は作れる字」', () => {
    let near = 0;
    let all = 0;
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier]) {
        for (const c of p.choices.filter((x) => x !== p.answer)) {
          all += 1;
          if (matchCount(lex, p.clues, c) >= 2) near += 1;
        }
      }
    }
    expect(near / all).toBeGreaterThan(0.2);
  });

  it('小学生の段の問題（盤の4字・答え・4択の誤答）に教育漢字以外が出ない', () => {
    const shoLex = latestLexicon();
    const rng = mulberry32(7);
    const list = [...samples.sho, ...Array.from({ length: 200 }, () => generatePuzzle(shoLex, 'sho', rng))];
    for (const p of list) {
      const chars = [p.answer, ...SLOTS.map((s) => p.clues[s]), ...p.choices, ...p.alternatives];
      const bad = chars.filter((c) => !isKyoiku(c));
      expect(bad, summary(p)).toEqual([]);
      for (const s of SLOTS) expect(p.words[s].hard).toBe(false);
    }
  });

  it('中学生の段は中学で習う字を含み、やや難しい語は出ない', () => {
    for (const p of samples.chu) {
      const chars = [p.answer, ...SLOTS.flatMap((s) => p.words[s].chars)];
      expect(chars.some((c) => !isKyoiku(c)), summary(p)).toBe(true);
      for (const s of SLOTS) expect(p.words[s].hard).toBe(false);
    }
  });

  it('おとなの段は、やや難しい語を含むか、真ん中が中学以上の字', () => {
    for (const p of samples.otona) {
      expect(!isKyoiku(p.answer) || SLOTS.some((s) => p.words[s].hard), summary(p)).toBe(true);
    }
  });

  it('読みが2つある語が出題されない', () => {
    for (const tier of TIER_ORDER) {
      for (const k of days(365)) {
        const p = dailyPuzzle(k, tier);
        for (const s of SLOTS) expect(AMBIGUOUS_WORDS).not.toContain(p.words[s].word);
      }
    }
  });

  it('練習で避けたい字を渡すと、その字は出ない', () => {
    const rng = mulberry32(3);
    const centers = centersFor(lex, 'sho');
    const avoid = new Set(centers.slice(0, centers.length - 5));
    for (let i = 0; i < 20; i++) {
      expect(avoid.has(generatePuzzle(lex, 'sho', rng, { avoid }).answer)).toBe(false);
    }
  });
});

describe('ヒント', () => {
  it('1回目のヒントの読みは、添えた語での真ん中の字の読みの頭', () => {
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier]) {
        const h = readingHint(p);
        const w = p.words[p.hintSlot];
        expect(h.masked).toBe(maskedWord(p, p.hintSlot));
        expect(h.masked.replace('□', p.answer)).toBe(w.word);
        expect(h.head).toBe(Array.from(w.readings[blankIndex(p.hintSlot)])[0]);
        expect(h.text).toContain(h.masked);
      }
    }
  });

  it('2回目のヒントは1回目と別の語の意味で、答えの字を伏せてある', () => {
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier]) {
        expect(p.meaningSlot).not.toBe(p.hintSlot);
        const h = meaningHint(p);
        expect(h.meaning).not.toContain(p.answer);
        expect(h.text.startsWith(maskedWord(p, p.meaningSlot))).toBe(true);
      }
    }
  });

  it('例：看病の「病」なら「□気 の □ は『び』から」の形', () => {
    const words = parseWords(
      ['看病 かん・びょう a', '重病 じゅう・びょう b', '病気 びょう・き 病の気', '病院 びょう・いん d'].join('\n'),
      1,
    );
    const small = buildLexicon(words);
    const p = generatePuzzle(small, 'sho', mulberry32(1));
    const fixed: Puzzle = { ...p, hintSlot: SLOTS.find((s) => p.words[s].word === '病気')!, meaningSlot: SLOTS.find((s) => p.words[s].word === '病気')! };
    expect(readingHint(fixed).text).toBe('□気 の □ は「び」から');
    expect(meaningHint(fixed).meaning).toBe('□の気');
  });
});

describe('読み入力', () => {
  it('4語のどの読みを打っても、正解の字が候補に出る', () => {
    for (const tier of TIER_ORDER) {
      for (const p of samples[tier]) {
        for (const s of SLOTS) {
          const r = centerReading(p, s);
          expect(readingCandidates(lex, p, r), `${summary(p)} ${r}`).toContain(p.answer);
          // カタカナで打っても同じ
          const kata = r.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
          expect(readingCandidates(lex, p, kata)).toContain(p.answer);
        }
      }
    }
  });

  it('候補はその段の字だけ（小学生なら教育漢字だけ）', () => {
    for (const p of samples.sho) {
      for (const c of readingCandidates(lex, p, 'こう')) expect(isKyoiku(c)).toBe(true);
    }
  });

  it('漢字をそのまま打ったら、その字が候補になる。空なら候補なし', () => {
    const p = samples.sho[0];
    expect(readingCandidates(lex, p, p.answer)).toEqual([p.answer]);
    expect(readingCandidates(lex, p, '  ')).toEqual([]);
  });
});

describe('日替わり（daily.ts）', () => {
  it('同じ日付・同じ段なら同じ問題', () => {
    for (const tier of TIER_ORDER) {
      for (const k of days(10)) expect(summary(dailyPuzzle(k, tier))).toBe(summary(dailyPuzzle(k, tier)));
    }
  });

  it('違う日なら違う問題。365 日で重複が少ない', () => {
    for (const tier of TIER_ORDER) {
      const keys = days(365).map((k) => summary(dailyPuzzle(k, tier)));
      expect(new Set(keys).size, tier).toBeGreaterThanOrEqual(280);
      for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
    }
  });

  it('真ん中の字は、ひと回りのあいだ同じ字が2度出ない', () => {
    for (const tier of TIER_ORDER) {
      const v = versionFor('2026-12-01');
      const n = centersFor(lexiconFor(v), tier).length;
      const centers = days(n).map((k) => dailyCenter(k, tier, lexiconFor(v), v));
      expect(new Set(centers).size, tier).toBe(n);
    }
  });

  it('日は 2026-12-01 から数え、それより前の日も問題が出る', () => {
    expect(dayIndex('2026-12-01')).toBe(0);
    expect(dayIndex('2026-12-02')).toBe(1);
    expect(dayIndex(previousDateKey('2026-12-01'))).toBe(-1);
    expect(() => dailyPuzzle('2026-11-23', 'sho')).not.toThrow();
  });

  it('版の切り替え表：from の日以降にその版。最初の行より前は最初の版', () => {
    const table = [
      { from: '2026-12-01', version: 1 },
      { from: '2027-04-01', version: 2 },
    ];
    expect(versionFor('2026-11-30', table)).toBe(1);
    expect(versionFor('2027-03-31', table)).toBe(1);
    expect(versionFor('2027-04-01', table)).toBe(2);
    expect(DAILY_VERSIONS[0]).toEqual({ from: '2026-12-01', version: 1 });
  });

  it('版の固定：版1の期間の30日分の問題が、since: 2 の語を足しても、版2の行を足しても変わらない', () => {
    const extra: Word[] = parseWords(
      ['学長 がく・ちょう 大学でいちばん上の人', '生気 せい・き 生き生きした様子', '心気 しん・き 気持ち', '大心 だい・しん x',
        '気心 き・ごころ 気持ち', '本学 ほん・がく この大学', '人心 じん・しん 人の心', '病心 びょう・しん x'].join('\n'),
      2,
    );
    const bigger = [...WORDS, ...extra];
    const versions = [...DAILY_VERSIONS, { from: '2027-04-01', version: 2 }];
    for (const tier of TIER_ORDER) {
      for (const k of days(30)) {
        expect(summary(dailyPuzzle(k, tier, bigger, versions))).toBe(summary(dailyPuzzle(k, tier)));
      }
    }
  });

  it('版1の期間の30日分のスナップショット（**公開後にここが変わったら、過去の問題を動かしている**）', () => {
    const snap = TIER_ORDER.map((tier) => `${tier} ${days(30).map((k) => summary(dailyPuzzle(k, tier))).join(' ')}`);
    expect(snap).toMatchSnapshot();
  });
});

describe('途中経過・共有（session.ts）', () => {
  const p = samples.sho[0];
  const wrong = p.choices.find((c) => c !== p.answer)!;

  it('試した字を積み、正解したら終わる。同じ字の2度目・終わった後は数えない', () => {
    let a = tryChar(p, EMPTY_ATTEMPT, wrong);
    a = tryChar(p, a, wrong);
    expect(a.tries).toEqual([wrong]);
    expect(isSolved(p, a)).toBe(false);
    a = tryChar(p, a, p.answer);
    expect(isSolved(p, a)).toBe(true);
    expect(solvedOnTry(p, a)).toBe(2);
    expect(tryChar(p, a, '一')).toBe(a);
    expect(attemptEmoji(p, a)).toBe('❌⭕');
  });

  it('答えを見たら終わり（最後は 👀）', () => {
    const a = { ...tryChar(p, EMPTY_ATTEMPT, wrong), revealed: true };
    expect(isFinished(p, a)).toBe(true);
    expect(solvedOnTry(p, a)).toBeNull();
    expect(attemptEmoji(p, a)).toBe('❌👀');
  });

  it('共有文は「熟語パズル 11/23 小学生 1回目で正解・ヒント0・連続3日」の形で、答え・盤の字を含まない', () => {
    const a = tryChar(p, EMPTY_ATTEMPT, p.answer);
    const text = shareText({ dateKey: '2026-11-23', puzzle: p, attempt: a, streak: 3, url: 'https://hasokon.com/games/jukugo-puzzle/' });
    expect(text.split('\n')).toEqual([
      '熟語パズル 11/23 小学生 1回目で正解・ヒント0・連続3日',
      '⭕',
      'https://hasokon.com/games/jukugo-puzzle/',
    ]);
    for (const c of [p.answer, ...SLOTS.map((s) => p.clues[s])]) expect(text).not.toContain(c);
  });

  it('答えを見たときの共有文には連続日数を付けない', () => {
    const a = { tries: [wrong], hints: 2, revealed: true };
    const text = shareText({ dateKey: '2026-12-05', puzzle: p, attempt: a, streak: 3, url: 'u' });
    expect(text.split('\n')[0]).toBe('熟語パズル 12/05 小学生 答えを見た・ヒント2');
  });

  it('きょうの1問の途中経過を段ごとに保存して読み戻す。別の日・壊れたデータは空', () => {
    const store = new Map<string, string>();
    const storage: ProgressStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    };
    writeDailyAttempt(storage, '2026-12-01', 'sho', { tries: ['病'], hints: 1, revealed: false });
    writeDailyAttempt(storage, '2026-12-01', 'otona', { tries: [], hints: 2, revealed: true });
    expect(readDailyAttempt(storage, '2026-12-01', 'sho')).toEqual({ tries: ['病'], hints: 1, revealed: false });
    expect(readDailyAttempt(storage, '2026-12-01', 'otona').revealed).toBe(true);
    expect(readDailyAttempt(storage, '2026-12-01', 'chu')).toEqual(EMPTY_ATTEMPT);
    expect(readDailyAttempt(storage, '2026-12-02', 'sho')).toEqual(EMPTY_ATTEMPT);
    store.set('jukugo-puzzle:daily', '{壊れた');
    expect(readDailyAttempt(storage, '2026-12-01', 'sho')).toEqual(EMPTY_ATTEMPT);
    expect(readDailyAttempt(null, '2026-12-01', 'sho')).toEqual(EMPTY_ATTEMPT);
  });

  it('記録の区分はモード×段', () => {
    expect(variantOf('daily', 'sho')).toBe('daily-sho');
    expect(variantOf('practice', 'otona')).toBe('practice-otona');
  });
});
