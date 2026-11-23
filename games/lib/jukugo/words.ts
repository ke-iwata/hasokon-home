/**
 * 熟語の表（二字熟語）
 *
 * 仕様: docs/features/game-jukugo-anaume.md の「熟語の表」
 *
 * 版ごとの生の表（`words-v1.ts` …）を読み、語ごとに字・字ごとの読み・学年・意味・版を持たせる。
 * 学年は表に書かず、**字の表（`kanji.ts`）から引く**（2字のうち高いほう）。
 * 書き写すと配当表とずれるので。
 */

import { gradeOf, type KanjiGrade } from './kanji';
import { WORDS_V1_RAW } from './words-v1';

export interface Word {
  /** 二字熟語（例：看病） */
  word: string;
  /** 1字目・2字目 */
  chars: readonly [string, string];
  /** 字ごとの読み（ひらがな。熟語の中での読み。例：かん・びょう） */
  readings: readonly [string, string];
  /** 語の読み（字ごとの読みをつないだもの） */
  reading: string;
  /** 意味の1行（自前で書いたもの） */
  meaning: string;
  /** やや難しい語（おとなの段にだけ出す） */
  hard: boolean;
  /** その語を足した表の版。日替わりは「その日の版以下」の語だけで作る */
  since: number;
  /** 学年（2字のうち高いほう。7＝中学以上）。常用漢字でない字があれば undefined */
  grade: KanjiGrade | undefined;
}

/**
 * 読みが2つある語・熟字訓。**表に入れない・出題しない。**
 *
 * 意味の1行と読みが食い違う（人気：にんき／ひとけ）うえ、ヒントの「読みの頭」が
 * どちらの読みか決められないため。`tests/jukugo.test.ts` が表に紛れ込んでいないかを見張る。
 */
export const AMBIGUOUS_WORDS: readonly string[] = [
  '人気', '生物', '上手', '下手', '大家', '一日', '今日', '明日', '昨日', '今年', '大人', '一人', '二人',
  '色紙', '風車', '工夫', '最中', '目下', '心中', '分別', '気骨', '市場', '変化', '自重', '生花',
  '時計', '毎年', '毎月', '一時', '日本', '草木', '黄金', '大事', '見物', '上下', '牧場', '強力',
  '後世', '利益', '末期', '足跡', '頭数', '何分', '一行', '大勢', '寒気', '紅葉', '金星', '名代',
  '仮名', '文字', '水車', '天皇', '行方', '梅雨', '雪崩', '景色', '部屋', '眼鏡', '果物',
];

/**
 * 出題から外す語（下品な語・差別語・病名を答えにする出題を避けるため）。
 *
 * 表には残す（ほかの問題の「その語はある」の判定には使う）が、盤には出さない。
 */
export const EXCLUDED_WORDS: readonly string[] = [];

/** 生の表を読む。書式は `words-v1.ts` の冒頭を参照 */
export function parseWords(raw: string, since: number): Word[] {
  const out: Word[] = [];
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const hard = line.startsWith('!');
    const [word, reading, ...rest] = (hard ? line.slice(1) : line).split(' ');
    const chars = Array.from(word);
    const parts = (reading ?? '').split('・');
    if (chars.length !== 2 || parts.length !== 2) {
      throw new Error(`熟語の表の書式が違う: ${rawLine}`);
    }
    const g1 = gradeOf(chars[0]);
    const g2 = gradeOf(chars[1]);
    out.push({
      word,
      chars: [chars[0], chars[1]],
      readings: [parts[0], parts[1]],
      reading: parts.join(''),
      meaning: rest.join(' '),
      hard,
      since,
      grade: g1 === undefined || g2 === undefined ? undefined : (Math.max(g1, g2) as KanjiGrade),
    });
  }
  return out;
}

/** すべての版の語。**版を足したら、ここに `...parseWords(WORDS_V2_RAW, 2)` を足す** */
export const WORDS: readonly Word[] = [...parseWords(WORDS_V1_RAW, 1)];
