import { checkJson, scanZenkaku } from '@/lib/json-seikei';

/**
 * 本文「よくあるエラーと直し方」の表の行。
 *
 * 出す文は手で書かず、例の入力を実際に `checkJson` に通して作る。
 * ツールの言い方を変えたときに本文だけ古いまま残らないようにするため
 * （docs/features/thin-tool-content.md の「本文に額を手で書かない」と同じ考え方）。
 */
export interface ErrorExample {
  situation: string;
  /** 例の入力（画面では等幅で出す） */
  input: string;
  /** このツールが出す位置 */
  where: string;
  /** このツールが出す原因の見当 */
  hint: string;
  /** 直した形 */
  fixed: string;
}

const EXAMPLES: Omit<ErrorExample, 'where' | 'hint'>[] = [
  { situation: '最後の要素のあとのカンマ', input: '{"a": 1, "b": 2,}', fixed: '{"a": 1, "b": 2}' },
  {
    situation: '行末のカンマ忘れ',
    input: '{\n  "a": 1\n  "b": 2\n}',
    fixed: '{\n  "a": 1,\n  "b": 2\n}',
  },
  { situation: "' で囲った文字列", input: "{'name': 'taro'}", fixed: '{"name": "taro"}' },
  { situation: '引用符のないキー', input: '{name: "taro"}', fixed: '{"name": "taro"}' },
  { situation: 'コメント', input: '{"a": 1 // 個数\n}', fixed: '{"a": 1\n}' },
  { situation: 'NaN・Infinity・undefined', input: '{"a": NaN}', fixed: '{"a": null}' },
  { situation: '全角の記号・空白', input: '{"a"：1}', fixed: '{"a":1}' },
];

export const ERROR_EXAMPLES: ErrorExample[] = EXAMPLES.map((example) => {
  const result = checkJson(example.input);
  if (result.ok) throw new Error(`例の入力が正しい JSON になっている: ${example.input}`);
  return {
    ...example,
    where:
      result.markLine !== result.line
        ? `${result.line} 行目 ${result.column} 文字目（${result.markLine} 行目を強調）`
        : `${result.line} 行目 ${result.column} 文字目`,
    hint: result.hint ?? result.message,
  };
});

/** 本文「全角の混入」の例。直したあとの形は scanZenkaku に作らせる */
export const ZENKAKU_EXAMPLE = (() => {
  const input = '{“住所”：“東京都　港区”，　"メモ":"“至急”と連絡"}';
  const scan = scanZenkaku(input);
  return { input, fixed: scan.fixed, count: scan.replaced.length };
})();
