/**
 * 方言の判定（仕様: docs/features/cron-shiki-checker.md の「自動判定のルール」）
 *
 * 上から順に当てはめ、最初に当たったものを使う。
 * 1. `cron(...)`・`rate(...)`・`at(...)` → AWS（既定はルール＝UTC）
 * 2. `@daily` などのマクロ → crontab として展開
 * 3. 5 フィールド → crontab 系
 * 4. 7 フィールド → Quartz
 * 5. 6 フィールド → AWS・Quartz・Spring の3つの文法で解析し、誤りにならなかったものだけを残す
 * 6. Quartz と Spring の両方で読めて、曜日に数字があるときは両方の読みを並べる（既定は Quartz）
 *
 * `crontab -l` の1行（後ろにコマンドが付いたもの）は、6 フィールド目以降を無視して読む。
 */
import { MACROS, parseFields, splitFields, type ParseResult } from './parse';
import { GRAMMAR_OF, type CronSpec, type Dialect, type Grammar, type ParseError } from './types';

export interface Reading {
  dialect: Dialect;
  grammar: Grammar;
  spec: CronSpec;
  /** 解析したフィールド（コマンドを除いたもの） */
  fields: string[];
  /** 「Quartz」「Spring」など、読みを並べるときの名前 */
  label: string;
}

export type Analysis =
  | {
      ok: true;
      kind: 'cron';
      /** 読み。2つ以上なら方言によって意味が変わる（並べて選ばせる） */
      readings: Reading[];
      /** 判定した方言（readings[0] の方言） */
      dialect: Dialect;
      /** 自動判定のときの説明（「Linux の crontab として読みました」） */
      detectedAs: string;
      /** マクロを展開したとき：元のマクロ */
      macro?: string;
      /** crontab の行の後ろのコマンド（無視した部分） */
      ignoredCommand?: string;
    }
  | { ok: true; kind: 'reboot'; dialect: Dialect; detectedAs: string }
  | { ok: true; kind: 'rate'; dialect: Dialect; detectedAs: string; value: number; unit: 'minute' | 'hour' | 'day'; text: string }
  | { ok: true; kind: 'at'; dialect: Dialect; detectedAs: string; wall: { year: number; month: number; day: number; hour: number; minute: number; second: number } }
  | { ok: false; errors: ParseError[]; dialect: Dialect | null };

export type DialectChoice = Dialect | 'auto';

const AWS_WRAP = /^(cron|rate|at)\((.*)\)$/i;

/** 6 フィールド目以降が cron のフィールドらしくない（コマンド）か */
function looksLikeCommand(token: string): boolean {
  return !/^[0-9A-Za-z*?,\-#/]+$/.test(token) || token.startsWith('/') || /^[a-z]{4,}/.test(token);
}

function errorsOf(r: ParseResult): ParseError[] {
  return r.ok ? [] : r.errors;
}

function parseRate(body: string, dialect: Dialect): Analysis {
  const m = /^\s*(\d+)\s+(minutes?|hours?|days?)\s*$/i.exec(body);
  if (!m) return { ok: false, errors: [{ position: 0, message: 'rate(…) は「rate(5 minutes)」の形で書きます' }], dialect };
  const value = Number(m[1]);
  const unitWord = m[2].toLowerCase();
  const unit = unitWord.startsWith('minute') ? 'minute' : unitWord.startsWith('hour') ? 'hour' : 'day';
  if (value === 0) return { ok: false, errors: [{ position: 0, message: 'rate の値は 1 以上です' }], dialect };
  if ((value === 1) !== !unitWord.endsWith('s')) {
    return { ok: false, errors: [{ position: 0, message: `1 のときは単数（minute・hour・day）、2 以上は複数（minutes・hours・days）で書きます` }], dialect };
  }
  const ja = { minute: '分', hour: '時間', day: '日' }[unit];
  return { ok: true, kind: 'rate', dialect, detectedAs: 'AWS の rate 式として読みました', value, unit, text: `${value}${ja}ごと（始めた時刻から数えます）` };
}

function parseAt(body: string, dialect: Dialect): Analysis {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(body.trim());
  if (!m) return { ok: false, errors: [{ position: 0, message: 'at(…) は「at(2026-12-01T09:00:00)」の形で書きます' }], dialect };
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  return { ok: true, kind: 'at', dialect, detectedAs: 'EventBridge Scheduler の1回だけの実行（at 式）として読みました', wall: { year, month, day, hour, minute, second } };
}

function single(dialect: Dialect, r: ParseResult, label: string): Reading[] | ParseError[] {
  if (!r.ok) return r.errors;
  return [{ dialect, grammar: GRAMMAR_OF[dialect], spec: r.spec, fields: r.fields, label }];
}

const LABEL: Record<Dialect, string> = {
  crontab: 'Linux の crontab',
  github: 'GitHub Actions',
  kubernetes: 'Kubernetes CronJob',
  'eventbridge-rule': 'AWS EventBridge ルール',
  'eventbridge-scheduler': 'AWS EventBridge Scheduler',
  quartz: 'Quartz',
  spring: 'Spring',
};

/** 曜日のフィールドに数字があるか（Quartz と Spring で読みが割れる） */
function dowHasNumber(text: string): boolean {
  return /\d/.test(text.replace(/#\d/, ''));
}

function analyzeCron5(dialect: Dialect, tokens: string[], macro?: string): Analysis {
  let fields = tokens;
  let ignoredCommand: string | undefined;
  if (dialect === 'crontab' && tokens.length > 5) {
    fields = tokens.slice(0, 5);
    ignoredCommand = tokens.slice(5).join(' ');
  }
  const r = parseFields(fields, 'cron5');
  if (!r.ok) return { ok: false, errors: r.errors, dialect };
  return {
    ok: true,
    kind: 'cron',
    readings: [{ dialect, grammar: 'cron5', spec: r.spec, fields: r.fields, label: LABEL[dialect] }],
    dialect,
    detectedAs: `${LABEL[dialect]}として読みました`,
    macro,
    ignoredCommand,
  };
}

/** 方言を決めて読む */
export function analyze(input: string, choice: DialectChoice = 'auto'): Analysis {
  const text = input.trim();
  if (text === '') return { ok: false, errors: [{ position: 0, message: 'cron 式を入力してください' }], dialect: null };

  // 1. AWS の cron(...)・rate(...)・at(...)
  const wrap = AWS_WRAP.exec(text);
  if (wrap) {
    const dialect: Dialect = choice === 'eventbridge-scheduler' ? 'eventbridge-scheduler' : 'eventbridge-rule';
    if (choice !== 'auto' && GRAMMAR_OF[choice] !== 'aws') {
      return { ok: false, errors: [{ position: 0, message: `${LABEL[choice]}では cron(…) で囲みません。AWS の式なら方言を AWS にしてください` }], dialect: choice };
    }
    const kind = wrap[1].toLowerCase();
    if (kind === 'rate') return parseRate(wrap[2], dialect);
    if (kind === 'at') return parseAt(wrap[2], dialect);
    const r = parseFields(splitFields(wrap[2]), 'aws');
    if (!r.ok) return { ok: false, errors: r.errors, dialect };
    return {
      ok: true,
      kind: 'cron',
      readings: [{ dialect, grammar: 'aws', spec: r.spec, fields: r.fields, label: LABEL[dialect] }],
      dialect,
      detectedAs: `${LABEL[dialect]}として読みました`,
    };
  }

  const tokens = splitFields(text);

  // 2. マクロ
  if (tokens[0].startsWith('@')) {
    const macro = tokens[0].toLowerCase();
    const dialect: Dialect = choice === 'auto' ? 'crontab' : choice;
    if (GRAMMAR_OF[dialect] === 'aws' || dialect === 'quartz') {
      return { ok: false, errors: [{ position: 0, message: `${LABEL[dialect]}では ${tokens[0]} のようなマクロは使えません` }], dialect };
    }
    if (macro === '@reboot') {
      return { ok: true, kind: 'reboot', dialect, detectedAs: '@reboot（起動したときに1回）として読みました' };
    }
    const expanded = MACROS[macro];
    if (!expanded) return { ok: false, errors: [{ position: 1, message: `${tokens[0]} というマクロはありません` }], dialect };
    const rest = tokens.slice(1);
    const a = analyzeCron5(dialect === 'spring' ? 'crontab' : dialect, splitFields(expanded), macro);
    if (a.ok && a.kind === 'cron') {
      a.dialect = dialect;
      a.readings = a.readings.map((r) => ({ ...r, dialect }));
      a.detectedAs = `${macro} を「${expanded}」に展開し、${LABEL[dialect]}として読みました`;
      if (rest.length > 0) a.ignoredCommand = rest.join(' ');
    }
    return a;
  }

  // 方言を選んだとき
  if (choice !== 'auto') {
    const grammar = GRAMMAR_OF[choice];
    if (grammar === 'cron5') return analyzeCron5(choice, tokens);
    const r = parseFields(tokens, grammar);
    if (!r.ok) return { ok: false, errors: r.errors, dialect: choice };
    return {
      ok: true,
      kind: 'cron',
      readings: [{ dialect: choice, grammar, spec: r.spec, fields: r.fields, label: LABEL[choice] }],
      dialect: choice,
      detectedAs: `${LABEL[choice]}として読みました`,
    };
  }

  // 3. 5 フィールド
  if (tokens.length < 5) {
    return { ok: false, errors: [{ position: 0, message: `フィールドが ${tokens.length} つしかありません（crontab は 5 つ、秒つきの Quartz・Spring は 6 つ）` }], dialect: null };
  }
  if (tokens.length === 5) return analyzeCron5('crontab', tokens);

  // crontab -l の1行（後ろにコマンド）
  const commandLike = tokens.length > 7 || tokens.slice(5).some(looksLikeCommand);
  const cron5Head = parseFields(tokens.slice(0, 5), 'cron5');
  if (commandLike && cron5Head.ok) return analyzeCron5('crontab', tokens);

  // 4. 7 フィールド
  if (tokens.length === 7) {
    const q = single('quartz', parseFields(tokens, 'quartz'), 'Quartz');
    if (q.length > 0 && 'spec' in q[0]) {
      return { ok: true, kind: 'cron', readings: q as Reading[], dialect: 'quartz', detectedAs: '7 フィールド（秒・分・時・日・月・曜日・年）の Quartz として読みました' };
    }
    if (cron5Head.ok) return analyzeCron5('crontab', tokens);
    return { ok: false, errors: (q as ParseError[]).map((e) => ({ ...e, message: `Quartz として：${e.message}` })), dialect: 'quartz' };
  }

  if (tokens.length > 7) {
    return { ok: false, errors: [{ position: 0, message: `フィールドが ${tokens.length} つあります（多すぎます）` }], dialect: null };
  }

  // 5. 6 フィールド：3つの文法で解析し、誤りにならなかったものだけを残す
  const aws = parseFields(tokens, 'aws');
  const quartz = parseFields(tokens, 'quartz');
  const spring = parseFields(tokens, 'spring');
  if (aws.ok) {
    return {
      ok: true,
      kind: 'cron',
      readings: [{ dialect: 'eventbridge-rule', grammar: 'aws', spec: aws.spec, fields: aws.fields, label: LABEL['eventbridge-rule'] }],
      dialect: 'eventbridge-rule',
      detectedAs: '6 フィールド（分・時・日・月・曜日・年）の AWS EventBridge として読みました（ルールか Scheduler かは下で選べます）',
    };
  }
  const readings: Reading[] = [];
  if (quartz.ok) readings.push({ dialect: 'quartz', grammar: 'quartz', spec: quartz.spec, fields: quartz.fields, label: 'Quartz' });
  if (spring.ok) readings.push({ dialect: 'spring', grammar: 'spring', spec: spring.spec, fields: spring.fields, label: 'Spring' });
  if (readings.length === 2 && !dowHasNumber(tokens[5])) {
    // 曜日が名前か * ・ ? だけなら、読みは同じ
    return {
      ok: true,
      kind: 'cron',
      readings: [readings[0]],
      dialect: 'quartz',
      detectedAs: '6 フィールド（秒・分・時・日・月・曜日）の Quartz／Spring として読みました（どちらでも同じ意味です）',
    };
  }
  if (readings.length > 0) {
    const names = readings.map((r) => r.label).join('と');
    return {
      ok: true,
      kind: 'cron',
      readings,
      dialect: readings[0].dialect,
      detectedAs:
        readings.length > 1
          ? `6 フィールド（秒つき）の${names}の両方として読めます。曜日の数字の読みが違うので、両方を並べます`
          : `6 フィールド（秒・分・時・日・月・曜日）の ${names} として読みました`,
    };
  }
  if (cron5Head.ok) return analyzeCron5('crontab', tokens);
  const errors = [
    ...errorsOf(quartz).map((e) => ({ ...e, message: `Quartz として：${e.message}` })),
    ...errorsOf(spring).map((e) => ({ ...e, message: `Spring として：${e.message}` })),
    ...errorsOf(aws).map((e) => ({ ...e, message: `AWS として：${e.message}` })),
  ];
  return { ok: false, errors, dialect: null };
}
