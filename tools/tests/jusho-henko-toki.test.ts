import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  INPUT_ERROR_MESSAGES,
  JUSHO_GIMUKA_START,
  JUSHO_KARYO_MAX_YEN,
  JUSHO_KEIKA_SOCHI_DEADLINE,
  JUSHO_TOKI_MONTHS,
  OVERDUE_MESSAGE,
  SEARCH_INFO_DONE_NOTE,
  SEARCH_INFO_UNKNOWN_NOTE,
  addMonthsSameDay,
  earliestDeadline,
  isOverdue,
  tokiDeadline,
  torokuMenkyo,
  validateInput,
} from '@/lib/jusho-henko-toki';
import { GIMUKA_START } from '@/lib/sozoku-toki-kigen';

describe('定数', () => {
  it('施行日・経過措置・期間・過料（法務省の案内）', () => {
    expect(JUSHO_GIMUKA_START).toBe('2026-04-01');
    expect(JUSHO_KEIKA_SOCHI_DEADLINE).toBe('2028-03-31');
    expect(JUSHO_TOKI_MONTHS).toBe(24);
    expect(JUSHO_KARYO_MAX_YEN).toBe(50_000);
  });

  it('相続登記の施行日と取り違えていない', () => {
    expect(JUSHO_GIMUKA_START).not.toBe(GIMUKA_START);
  });
});

describe('tokiDeadline', () => {
  it('施行前の変更は経過措置の 2028-03-31', () => {
    expect(tokiDeadline('2024-06-15')).toEqual({ deadline: '2028-03-31', basis: 'transitional' });
    expect(tokiDeadline('2026-03-31')).toEqual({ deadline: '2028-03-31', basis: 'transitional' });
  });

  it('施行日以後は変更日から2年の応当日', () => {
    expect(tokiDeadline('2026-04-01')).toEqual({ deadline: '2028-04-01', basis: 'principle' });
    expect(tokiDeadline('2026-10-02')).toEqual({ deadline: '2028-10-02', basis: 'principle' });
  });

  it('応当日が無い日（2月29日）は月末', () => {
    expect(tokiDeadline('2028-02-29')).toEqual({ deadline: '2030-02-28', basis: 'principle' });
  });

  it('施行前の変更日＋2年が経過措置の期限を超えることは無い', () => {
    // 施行前の最終日 ＋ 2年がちょうど経過措置の期限なので、「遅いほう」を取らなくてよい
    expect(addMonthsSameDay('2026-03-31', JUSHO_TOKI_MONTHS)).toBe(JUSHO_KEIKA_SOCHI_DEADLINE);
  });

  it('不正な日付は投げる', () => {
    expect(() => tokiDeadline('2026-02-30')).toThrow();
  });
});

describe('earliestDeadline', () => {
  it('2回の変更なら早いほう。of はその変更日', () => {
    expect(earliestDeadline(['2025-01-10', '2026-08-01'])).toEqual({
      deadline: '2028-03-31',
      basis: 'transitional',
      of: '2025-01-10',
    });
  });

  it('順序に依存しない', () => {
    expect(earliestDeadline(['2026-08-01', '2026-05-01']).of).toBe('2026-05-01');
  });

  it('施行前の変更が2つなら同じ期限で、古いほうを of にする', () => {
    expect(earliestDeadline(['2025-05-01', '2023-01-01'])).toEqual({
      deadline: '2028-03-31',
      basis: 'transitional',
      of: '2023-01-01',
    });
  });

  it('空なら投げる', () => {
    expect(() => earliestDeadline([])).toThrow();
  });
});

describe('isOverdue', () => {
  it('期限当日はまだ過ぎていない', () => {
    expect(isOverdue('2028-03-31', '2028-03-31')).toBe(false);
    expect(isOverdue('2028-03-31', '2028-04-01')).toBe(true);
  });
});

describe('torokuMenkyo', () => {
  it('1個1,000円', () => {
    expect(torokuMenkyo(1)).toBe(1_000);
    expect(torokuMenkyo(3)).toBe(3_000);
    expect(torokuMenkyo(0)).toBe(0);
  });

  it('負数・小数・NaN は0以上の整数に丸める', () => {
    expect(torokuMenkyo(-2)).toBe(0);
    expect(torokuMenkyo(2.7)).toBe(2_000);
    expect(torokuMenkyo(Number.NaN)).toBe(0);
  });
});

describe('validateInput', () => {
  it('未来の日付は future', () => {
    expect(validateInput('2026-10-03', undefined, '2026-10-02')).toBe('future');
    expect(validateInput('2026-10-02', undefined, '2026-10-02')).toBeNull();
  });

  it('前の変更日が今回より後なら order。同日は許す', () => {
    expect(validateInput('2026-05-01', '2026-06-01', '2026-10-02')).toBe('order');
    expect(validateInput('2026-05-01', '2026-05-01', '2026-10-02')).toBeNull();
    expect(validateInput('2026-05-01', '2025-01-01', '2026-10-02')).toBeNull();
  });

  it('文言は仕様書どおり', () => {
    expect(INPUT_ERROR_MESSAGES.future).toBe('変わった日は今日以前の日付を入れてください。');
    expect(INPUT_ERROR_MESSAGES.order).toBe('前の変更日は今回より前の日付を入れてください。');
  });
});

describe('画面の文言（断定しない）', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const sources = [
    read('../app/jusho-henko-toki/page.tsx'),
    read('../app/jusho-henko-toki/Calculator.tsx'),
    read('../lib/jusho-henko-toki.ts'),
  ];

  it('禁止表現（「必ず」「確実に」「すべき」・申請書の書き方）が無い', () => {
    for (const src of sources) {
      expect(src).not.toMatch(/必ず|確実に|すべき|べきです|申請書はこう書く/);
    }
  });

  it('申出の効果を言い切らない（#316 レビュー必須 1）', () => {
    for (const src of sources) {
      expect(src).not.toMatch(/何もしなくていい|正当な理由として扱われ|正当な理由になります/);
    }
  });

  it('申出「はい」の注記は通知への応答を促し、期限を消さない', () => {
    expect(SEARCH_INFO_DONE_NOTE).toContain('応答');
    expect(SEARCH_INFO_DONE_NOTE).toContain('期限は上のとおり把握');
    expect(SEARCH_INFO_UNKNOWN_NOTE).toContain('2025年4月21日より前');
  });

  it('期限切れの文言は相続登記と同じで、過料の有無を断定しない', () => {
    expect(OVERDUE_MESSAGE).toContain('過料になるかどうかは裁判所が決めます');
    expect(OVERDUE_MESSAGE).not.toMatch(/過料になります|過料にはなりません/);
  });

  it('ツール名に「過料」を入れない', () => {
    const h1 = /<h1>([^<]+)<\/h1>/.exec(sources[0])?.[1] ?? '';
    expect(h1).toBe('住所変更登記の期限チェッカー');
  });

  it('祝日データ HOLIDAYS を参照しない（2028年以降で黙って平日扱いになるため）', () => {
    for (const src of sources) {
      expect(src).not.toMatch(/HOLIDAYS|lib\/nissu-keisan|\.\/nissu-keisan/);
    }
  });

  it('関連リンクは PublicToolLink を通し、<Link> を手で書かない', () => {
    expect(sources[0]).not.toMatch(/from 'next\/link'/);
  });
});
