import { describe, expect, it } from 'vitest';
import {
  DAYTIME_STUDENT_EXCLUSION_NOTE,
  evaluateKabe,
  evaluateShaho,
  nextWall,
  WAGE_REQUIREMENT_ABOLISHED_ON,
  type KabeInput,
} from '@/lib/nenshu-kabe';

const M = 10_000;

/**
 * 施行日をまたぐ判定は現在時刻に依存させない。
 * 賃金要件の撤廃は2026年10月1日なので、その前日と当日を固定して使う。
 */
const BEFORE = new Date(2026, 8, 30); // 2026-09-30（ローカル時刻）
const ON = new Date(2026, 9, 1); // 2026-10-01（ローカル時刻）

const base: KabeInput = {
  income: 100 * M,
  position: 'spouse',
  size51: false,
  hours20: false,
  asOf: BEFORE,
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

// 2026年10月1日の賃金要件（月8.8万円＝年収106万円相当）撤廃。
// 施行日をまたぐ境界が壊れていないことだけを見るので、現在時刻には依存させない。
describe('賃金要件の撤廃（2026-10-01 施行）', () => {
  const kanyu: KabeInput = { ...base, size51: true, hours20: true };

  it('撤廃日の定数は 2026-10-01', () => {
    expect(WAGE_REQUIREMENT_ABOLISHED_ON).toBe('2026-10-01');
  });

  it('2026-09-30 は106万円の壁が出る', () => {
    const labels = evaluateKabe({ ...kanyu, asOf: BEFORE }).map((r) => r.label);
    expect(labels).toContain('106万円の壁');
  });

  it('2026-10-01 は106万円の壁が消える', () => {
    const labels = evaluateKabe({ ...kanyu, asOf: ON }).map((r) => r.label);
    expect(labels).not.toContain('106万円の壁');
  });

  it('施行日の前日23:59と当日00:00で切り替わる（ローカル暦日で判定する）', () => {
    const eve = new Date(2026, 8, 30, 23, 59, 59);
    const midnight = new Date(2026, 9, 1, 0, 0, 0);
    expect(evaluateShaho({ ...kanyu, asOf: eve }).kind).toBe('wage-gate');
    expect(evaluateShaho({ ...kanyu, asOf: midnight }).kind).toBe('enrolled');
  });

  it('要件を満たさない人は施行後も106万円の壁が無いだけで、他の壁は変わらない', () => {
    const before = evaluateKabe({ ...base, asOf: BEFORE }).map((r) => r.label);
    const after = evaluateKabe({ ...base, asOf: ON }).map((r) => r.label);
    expect(after).toEqual(before);
  });

  it('施行後の再現手順（年収100万・配偶者の扶養内・51人以上・週20時間以上）', () => {
    // 仕様書の再現手順。「あと6万円まで大丈夫」と読ませてはいけない
    const rs = evaluateKabe({ ...kanyu, income: 100 * M, asOf: ON });
    expect(rs.map((r) => r.label)).not.toContain('106万円の壁');
    expect(nextWall(rs)?.label).not.toBe('106万円の壁');
    expect(evaluateShaho({ ...kanyu, income: 100 * M, asOf: ON }).kind).toBe('enrolled');
  });

  it('asOf 省略時は実行時の現在日で評価される（ビルド時刻で固定しない）', () => {
    // 現在日そのものには依存させず、「省略＝現在日を渡したのと同じ」ことだけを見る
    const omitted = evaluateKabe({ ...kanyu, asOf: undefined }).map((r) => r.label);
    const explicit = evaluateKabe({ ...kanyu, asOf: new Date() }).map((r) => r.label);
    expect(omitted).toEqual(explicit);
  });
});

describe('evaluateShaho（勤務先の社会保険に加入するか）', () => {
  const kanyu: KabeInput = { ...base, size51: true, hours20: true };

  it('施行前は賃金要件つき（106万円）', () => {
    const s = evaluateShaho({ ...kanyu, asOf: BEFORE });
    expect(s.kind).toBe('wage-gate');
    expect(s.kind === 'wage-gate' && s.threshold).toBe(106 * M);
  });

  it('施行後は年収に関係なく加入', () => {
    const s = evaluateShaho({ ...kanyu, asOf: ON });
    expect(s.kind).toBe('enrolled');
    expect(s.kind === 'enrolled' && s.reason).toContain('年収に関係なく');
  });

  it('週20時間未満・51人未満は施行後も対象外', () => {
    expect(evaluateShaho({ ...kanyu, hours20: false, asOf: ON }).kind).toBe('not-applicable');
    expect(evaluateShaho({ ...kanyu, size51: false, asOf: ON }).kind).toBe('not-applicable');
  });

  it('扶養に入っていない人は対象外', () => {
    expect(evaluateShaho({ ...kanyu, position: 'none', asOf: ON }).kind).toBe('not-applicable');
  });
});

// 昼間部の学生は社会保険の適用除外だが、position: 'student' は昼間部とは限らないので
// 判定からは外さず注記で補っている（DAYTIME_STUDENT_EXCLUSION_NOTE）。
// 「注記に逃がした」という判断そのものを、あとから読んで分かる形で固定しておく。
describe('昼間部の学生の適用除外（注記で補う）', () => {
  const gakusei: KabeInput = { ...base, position: 'student', size51: true, hours20: true };

  it('注記が昼間部の除外と、夜間部などが対象であることの両方に触れている', () => {
    expect(DAYTIME_STUDENT_EXCLUSION_NOTE).toContain('昼間部');
    expect(DAYTIME_STUDENT_EXCLUSION_NOTE).toContain('夜間部');
  });

  it('判定は変えていない: 学生も施行前は賃金要件つき、施行後は加入', () => {
    expect(evaluateShaho({ ...gakusei, asOf: BEFORE }).kind).toBe('wage-gate');
    expect(evaluateShaho({ ...gakusei, asOf: ON }).kind).toBe('enrolled');
  });

  it('要件を満たさない学生は施行後も対象外のまま（注記を出す場面ではない）', () => {
    expect(evaluateShaho({ ...gakusei, hours20: false, asOf: ON }).kind).toBe('not-applicable');
    expect(evaluateShaho({ ...gakusei, size51: false, asOf: ON }).kind).toBe('not-applicable');
  });

  it('150万円の壁（学生）の扱いも変わっていない', () => {
    // 施行前: 106万円の壁とあわせて出る / 施行後: 加入するので扶養の壁には到達しない
    expect(evaluateKabe({ ...gakusei, asOf: BEFORE }).map((r) => r.label)).toContain(
      '150万円の壁（学生）'
    );
    expect(evaluateKabe({ ...gakusei, asOf: ON }).map((r) => r.label)).not.toContain(
      '150万円の壁（学生）'
    );
  });
});

describe('扶養の壁との重複解消', () => {
  it('施行後、勤務先の社保に加入する配偶者には130万円の壁が出ない', () => {
    const labels = evaluateKabe({ ...base, size51: true, hours20: true, asOf: ON }).map(
      (r) => r.label
    );
    expect(labels).not.toContain('130万円の壁');
    expect(labels).not.toContain('106万円の壁');
    // 税金の壁は残る
    expect(labels).toContain('119万円の壁');
    expect(labels).toContain('178万円の壁');
  });

  it('施行前は106万円の壁と130万円の壁が両方出る（従来どおり）', () => {
    const labels = evaluateKabe({ ...base, size51: true, hours20: true, asOf: BEFORE }).map(
      (r) => r.label
    );
    expect(labels).toContain('106万円の壁');
    expect(labels).toContain('130万円の壁');
  });

  it('施行後でも要件を満たさなければ130万円の壁は残る', () => {
    const labels = evaluateKabe({ ...base, size51: true, hours20: false, asOf: ON }).map(
      (r) => r.label
    );
    expect(labels).toContain('130万円の壁');
  });

  it('施行後、社保に加入する学生には150万円の壁が出ない', () => {
    const labels = evaluateKabe({
      ...base,
      position: 'student',
      size51: true,
      hours20: true,
      asOf: ON,
    }).map((r) => r.label);
    expect(labels).not.toContain('150万円の壁（学生）');
    expect(labels).toContain('159万円の壁（学生）');
  });
});
