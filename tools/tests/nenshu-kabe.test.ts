import { describe, expect, it } from 'vitest';
import { evaluateKabe, nextWall, type KabeInput } from '@/lib/nenshu-kabe';

const M = 10_000;

const base: KabeInput = {
  income: 100 * M,
  position: 'spouse',
  size51: false,
  hours20: false,
};

describe('evaluateKabe（該当する壁の抽出）', () => {
  it('配偶者の扶養内: 119/130/136/169/178/207万の壁が該当する', () => {
    const labels = evaluateKabe(base).map((r) => r.label);
    expect(labels).toEqual([
      '119万円の壁',
      '130万円の壁',
      '136万円の壁（配偶者）',
      '169万円の壁（配偶者）',
      '178万円の壁',
      '207万円の壁（配偶者）',
    ]);
  });

  it('51人以上・週20時間以上なら106万円の壁が追加される', () => {
    const labels = evaluateKabe({ ...base, size51: true, hours20: true }).map((r) => r.label);
    expect(labels).toContain('106万円の壁');
  });

  it('51人以上でも週20時間未満なら106万円の壁は出ない', () => {
    const labels = evaluateKabe({ ...base, size51: true, hours20: false }).map((r) => r.label);
    expect(labels).not.toContain('106万円の壁');
  });

  it('学生(19-22歳)は130万ではなく150万の壁になり、159/163/197万の壁が出る', () => {
    const labels = evaluateKabe({ ...base, position: 'student' }).map((r) => r.label);
    expect(labels).toContain('150万円の壁（学生）');
    expect(labels).not.toContain('130万円の壁');
    expect(labels).toContain('159万円の壁（学生）');
    expect(labels).toContain('163万円の壁（学生）');
    // 特定親族特別控除が消失するのは197万円（配偶者特別控除の207万円と混同しない）
    expect(labels).toContain('197万円の壁（学生）');
    expect(labels).not.toContain('207万円の壁（配偶者）');
    expect(labels).not.toContain('136万円の壁（配偶者）');
  });

  it('扶養に入っていない場合は税金の壁のみ（106/130万は出ない）', () => {
    const labels = evaluateKabe({ ...base, position: 'none', size51: true, hours20: true }).map(
      (r) => r.label
    );
    expect(labels).toEqual(['119万円の壁', '178万円の壁']);
  });

  it('結果は金額の昇順で返る', () => {
    const amounts = evaluateKabe({ ...base, size51: true, hours20: true }).map((r) => r.amount);
    const sorted = [...amounts].sort((a, b) => a - b);
    expect(amounts).toEqual(sorted);
  });
});

describe('evaluateKabe（超過判定と差分）', () => {
  it('年収125万円: 119万は超過・130万は未達で、差分が正しい', () => {
    const rs = evaluateKabe({ ...base, income: 125 * M });
    const juumin = rs.find((r) => r.label === '119万円の壁')!;
    const shaho = rs.find((r) => r.label === '130万円の壁')!;
    expect(juumin.over).toBe(true);
    expect(juumin.diff).toBe(6 * M);
    expect(shaho.over).toBe(false);
    expect(shaho.diff).toBe(5 * M);
  });

  it('社会保険の壁ちょうどは「超えた」扱い（扶養条件が130万円未満のため）', () => {
    const rs = evaluateKabe({ ...base, income: 130 * M });
    expect(rs.find((r) => r.label === '130万円の壁')!.over).toBe(true);
  });

  it('社会保険の壁は1円下回れば扶養内（129万9,999円）', () => {
    const rs = evaluateKabe({ ...base, income: 130 * M - 1 });
    expect(rs.find((r) => r.label === '130万円の壁')!.over).toBe(false);
  });

  it('106万・150万（学生）の壁もちょうどで「超えた」扱い', () => {
    const shaho = evaluateKabe({ ...base, income: 106 * M, size51: true, hours20: true });
    expect(shaho.find((r) => r.label === '106万円の壁')!.over).toBe(true);

    const gakusei = evaluateKabe({ ...base, position: 'student', income: 150 * M });
    expect(gakusei.find((r) => r.label === '150万円の壁（学生）')!.over).toBe(true);
  });

  it('税金の壁ちょうどは「超えていない」扱い（超えた分にだけ課税されるため）', () => {
    const rs = evaluateKabe({ ...base, income: 178 * M });
    expect(rs.find((r) => r.label === '178万円の壁')!.over).toBe(false);
    expect(rs.find((r) => r.label === '119万円の壁')!.over).toBe(true);

    const juumin = evaluateKabe({ ...base, income: 119 * M });
    expect(juumin.find((r) => r.label === '119万円の壁')!.over).toBe(false);
  });

  it('負の年収は0として扱う', () => {
    const rs = evaluateKabe({ ...base, income: -1 });
    expect(rs.every((r) => !r.over)).toBe(true);
  });
});

describe('nextWall（次の壁）', () => {
  it('年収125万円の配偶者: 次の壁は130万円', () => {
    const rs = evaluateKabe({ ...base, income: 125 * M });
    expect(nextWall(rs)!.label).toBe('130万円の壁');
  });

  it('全部超えている場合は undefined', () => {
    const rs = evaluateKabe({ ...base, income: 300 * M });
    expect(nextWall(rs)).toBeUndefined();
  });
});
