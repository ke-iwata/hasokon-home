import { describe, expect, it } from 'vitest';
import {
  DAYTIME_STUDENT_EXCLUSION_NOTE,
  HOKENRYO_CHOSEI_NOTE,
  evaluateKabe,
  evaluateShaho,
  isStudentFor,
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
  workplace: 'not-covered',
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

  it('加入対象の勤務先・週20時間以上なら106万円の壁が追加される', () => {
    const labels = evaluateKabe({ ...base, workplace: 'over51', hours20: true }).map((r) => r.label);
    expect(labels).toContain('106万円の壁');
  });

  it('加入対象の勤務先でも週20時間未満なら106万円の壁は出ない', () => {
    const labels = evaluateKabe({ ...base, workplace: 'over51', hours20: false }).map((r) => r.label);
    expect(labels).not.toContain('106万円の壁');
  });

  it('19〜22歳の学生は130万ではなく150万の壁になり、159/163/197万の壁が出る', () => {
    const labels = evaluateKabe({ ...base, position: 'age19to22', isStudent: true }).map((r) => r.label);
    expect(labels).toContain('150万円の壁（19〜22歳）');
    expect(labels).not.toContain('130万円の壁');
    expect(labels).toContain('159万円の壁（19〜22歳）');
    expect(labels).toContain('163万円の壁（勤労学生）');
    // 特定親族特別控除が消失するのは197万円（配偶者特別控除の207万円と混同しない）
    expect(labels).toContain('197万円の壁（19〜22歳）');
    expect(labels).not.toContain('207万円の壁（配偶者）');
    expect(labels).not.toContain('136万円の壁（配偶者）');
  });

  it('扶養に入っていない場合は税金の壁のみ（106/130万は出ない）', () => {
    const labels = evaluateKabe({ ...base, position: 'none', workplace: 'over51', hours20: true }).map(
      (r) => r.label
    );
    expect(labels).toEqual(['119万円の壁', '178万円の壁']);
  });

  it('結果は金額の昇順で返る', () => {
    const amounts = evaluateKabe({ ...base, workplace: 'over51', hours20: true }).map((r) => r.amount);
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

  it('106万・150万（19〜22歳）の壁もちょうどで「超えた」扱い', () => {
    const shaho = evaluateKabe({ ...base, income: 106 * M, workplace: 'over51', hours20: true });
    expect(shaho.find((r) => r.label === '106万円の壁')!.over).toBe(true);

    const gakusei = evaluateKabe({ ...base, position: 'age19to22', isStudent: true, income: 150 * M });
    expect(gakusei.find((r) => r.label === '150万円の壁（19〜22歳）')!.over).toBe(true);
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
  const kanyu: KabeInput = { ...base, workplace: 'over51', hours20: true };

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
  const kanyu: KabeInput = { ...base, workplace: 'over51', hours20: true };

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

  it('週20時間未満・加入対象でない勤務先は施行後も対象外', () => {
    expect(evaluateShaho({ ...kanyu, hours20: false, asOf: ON }).kind).toBe('not-applicable');
    expect(evaluateShaho({ ...kanyu, workplace: 'not-covered', asOf: ON }).kind).toBe('not-applicable');
  });

  it('扶養に入っていない人は対象外', () => {
    expect(evaluateShaho({ ...kanyu, position: 'none', asOf: ON }).kind).toBe('not-applicable');
  });
});

// 昼間部の学生は社会保険の適用除外だが、isStudent（学生か）は昼間部とは限らないので
// 判定からは外さず注記で補っている（DAYTIME_STUDENT_EXCLUSION_NOTE）。
// 「注記に逃がした」という判断そのものを、あとから読んで分かる形で固定しておく。
/**
 * `size51: boolean` を3択（Workplace）に置き換えた回で足したテスト。
 * docs/features/hokenryo-chosei-seido.md
 *
 * 置き換えの条件は「**既存の判定が1つも変わらないこと**」だった。
 * `'over51'` が従来の `true`、`'not-covered'` が従来の `false` と同じ結果になることを
 * 壁の一覧と加入判定の両方で固定しておく（ここが崩れると、既存の利用者に別の答えが出る）。
 */
describe('勤務先の3択化（旧 size51 との互換）', () => {
  const kanyu: KabeInput = { ...base, hours20: true };

  it("'over51' は従来の size51: true と同じ壁の一覧になる", () => {
    // 従来 true のときに出ていた並び（施行前）
    const labels = evaluateKabe({ ...kanyu, workplace: 'over51', asOf: BEFORE }).map((r) => r.label);
    expect(labels).toContain('106万円の壁');
    expect(labels).toContain('130万円の壁');
    expect(labels).toContain('119万円の壁');
  });

  it("'not-covered' は従来の size51: false と同じ壁の一覧になる", () => {
    const labels = evaluateKabe({ ...kanyu, workplace: 'not-covered', asOf: BEFORE }).map(
      (r) => r.label
    );
    expect(labels).not.toContain('106万円の壁');
    expect(labels).toContain('130万円の壁');
  });

  it("'optional-covered' は 'over51' と同じ加入判定・同じ壁になる（50人以下でも加入する）", () => {
    for (const asOf of [BEFORE, ON]) {
      const over51 = evaluateShaho({ ...kanyu, workplace: 'over51', asOf });
      const optional = evaluateShaho({ ...kanyu, workplace: 'optional-covered', asOf });
      expect(optional.kind).toBe(over51.kind);
      expect(evaluateKabe({ ...kanyu, workplace: 'optional-covered', asOf }).map((r) => r.label)).toEqual(
        evaluateKabe({ ...kanyu, workplace: 'over51', asOf }).map((r) => r.label)
      );
    }
  });

  it('保険料調整制度の対象になるのは optional-covered だけ', () => {
    const over51 = evaluateShaho({ ...kanyu, workplace: 'over51', asOf: ON });
    const optional = evaluateShaho({ ...kanyu, workplace: 'optional-covered', asOf: ON });
    expect(over51.kind !== 'not-applicable' && over51.choseiEligible).toBe(false);
    expect(optional.kind !== 'not-applicable' && optional.choseiEligible).toBe(true);
  });

  it('施行前（賃金要件が残っている間）も対象の判定は同じ', () => {
    const s = evaluateShaho({ ...kanyu, workplace: 'optional-covered', asOf: BEFORE });
    expect(s.kind).toBe('wage-gate');
    expect(s.kind === 'wage-gate' && s.choseiEligible).toBe(true);
  });

  it('加入しない勤務先の文言が「51人以上でなければ加入しない」と言い切っていない', () => {
    // 施行後は任意特定適用事業所があるので、その言い方は事実として誤りになる
    const s = evaluateShaho({ ...kanyu, workplace: 'not-covered', asOf: ON });
    expect(s.kind).toBe('not-applicable');
    if (s.kind === 'not-applicable') {
      expect(s.reason).toContain('50人以下でも加入させることにした勤務先');
    }
  });
});

describe('保険料調整制度の注記（金額は持たない）', () => {
  it('注記が制度の要点に触れている', () => {
    expect(HOKENRYO_CHOSEI_NOTE).toContain('保険料調整制度');
    expect(HOKENRYO_CHOSEI_NOTE).toContain('25〜48%');
    expect(HOKENRYO_CHOSEI_NOTE).toContain('3年');
    expect(HOKENRYO_CHOSEI_NOTE).toContain('事業主の申出制');
    // 複数事業所で加入している人は掛け持ちの短時間労働者に普通にいて、
    // 制度の対象外（パンフレット3頁）。金額は出さないが、対象外であることは伝える
    expect(HOKENRYO_CHOSEI_NOTE).toContain('複数の勤務先で社会保険に加入している方');
  });
});

describe('昼間部の学生の適用除外（注記で補う）', () => {
  const gakusei: KabeInput = {
    ...base,
    position: 'age19to22',
    isStudent: true,
    workplace: 'over51',
    hours20: true,
  };

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
    expect(evaluateShaho({ ...gakusei, workplace: 'not-covered', asOf: ON }).kind).toBe('not-applicable');
  });

  it('150万円の壁（19〜22歳）の扱いも変わっていない', () => {
    // 施行前: 106万円の壁とあわせて出る / 施行後: 加入するので扶養の壁には到達しない
    expect(evaluateKabe({ ...gakusei, asOf: BEFORE }).map((r) => r.label)).toContain(
      '150万円の壁（19〜22歳）'
    );
    expect(evaluateKabe({ ...gakusei, asOf: ON }).map((r) => r.label)).not.toContain(
      '150万円の壁（19〜22歳）'
    );
  });
});

describe('扶養の壁との重複解消', () => {
  it('施行後、勤務先の社保に加入する配偶者には130万円の壁が出ない', () => {
    const labels = evaluateKabe({ ...base, workplace: 'over51', hours20: true, asOf: ON }).map(
      (r) => r.label
    );
    expect(labels).not.toContain('130万円の壁');
    expect(labels).not.toContain('106万円の壁');
    // 税金の壁は残る
    expect(labels).toContain('119万円の壁');
    expect(labels).toContain('178万円の壁');
  });

  it('施行前は106万円の壁と130万円の壁が両方出る（従来どおり）', () => {
    const labels = evaluateKabe({ ...base, workplace: 'over51', hours20: true, asOf: BEFORE }).map(
      (r) => r.label
    );
    expect(labels).toContain('106万円の壁');
    expect(labels).toContain('130万円の壁');
  });

  it('施行後でも要件を満たさなければ130万円の壁は残る', () => {
    const labels = evaluateKabe({ ...base, workplace: 'over51', hours20: false, asOf: ON }).map(
      (r) => r.label
    );
    expect(labels).toContain('130万円の壁');
  });

  it('施行後、社保に加入する学生には150万円の壁が出ない', () => {
    const labels = evaluateKabe({
      ...base,
      position: 'age19to22',
      isStudent: true,
      workplace: 'over51',
      hours20: true,
      asOf: ON,
    }).map((r) => r.label);
    expect(labels).not.toContain('150万円の壁（19〜22歳）');
    expect(labels).toContain('159万円の壁（19〜22歳）');
  });
});

/**
 * 19〜22歳の150万円・特定親族特別控除は「年齢だけ」が要件で、学生であることは求めない
 * （日本年金機構 Q&A「学生であることの要件は求めません。あくまでも、年齢によって判断します」）。
 * 勤労学生控除・昼間部の適用除外は「学生であること」が要件で、年齢は問わない。
 * 入力をこの2軸（position: 'age19to22' と isStudent）に分けた回のテスト。
 * docs/features/fuyo-19-22sai-nenrei-kijun.md
 */
describe('19〜22歳の基準と学生の基準は別の軸', () => {
  const labelsOf = (input: Partial<KabeInput>) =>
    evaluateKabe({ ...base, income: 140 * M, ...input }).map((r) => r.label);

  it('19〜22歳・学生でない・140万円: 150万円の壁が次、130万・136万（扶養）は出ず、159万が出る', () => {
    const rs = evaluateKabe({ ...base, income: 140 * M, position: 'age19to22', isStudent: false });
    const labels = rs.map((r) => r.label);
    expect(labels).toContain('150万円の壁（19〜22歳）');
    expect(rs.find((r) => r.label === '150万円の壁（19〜22歳）')!.over).toBe(false);
    expect(nextWall(rs)!.label).toBe('150万円の壁（19〜22歳）');
    expect(labels).not.toContain('130万円の壁');
    // 19〜22歳は136万円を超えても特定親族特別控除（63万円）が満額で続く
    expect(labels).not.toContain('136万円の壁（扶養）');
    expect(labels).toContain('159万円の壁（19〜22歳）');
    expect(labels).toContain('197万円の壁（19〜22歳）');
    // 学生でなければ勤労学生控除の壁は出さない
    expect(labels).not.toContain('163万円の壁（勤労学生）');
  });

  it('isStudent を省略しても学生でない扱い（既定 false）', () => {
    expect(labelsOf({ position: 'age19to22' })).not.toContain('163万円の壁（勤労学生）');
  });

  it('19〜22歳・学生: 上に加えて163万円（勤労学生）が出る', () => {
    const labels = labelsOf({ position: 'age19to22', isStudent: true });
    expect(labels).toContain('150万円の壁（19〜22歳）');
    expect(labels).toContain('159万円の壁（19〜22歳）');
    expect(labels).toContain('163万円の壁（勤労学生）');
    expect(labels).not.toContain('130万円の壁');
    expect(labels).not.toContain('136万円の壁（扶養）');
  });

  it('それ以外の年齢・学生（例: 24歳の院生）: 130万・136万・163万が出て、150万・159万は出ない', () => {
    const labels = labelsOf({ position: 'dependent', isStudent: true });
    expect(labels).toContain('130万円の壁');
    expect(labels).toContain('136万円の壁（扶養）');
    expect(labels).toContain('163万円の壁（勤労学生）');
    expect(labels).not.toContain('150万円の壁（19〜22歳）');
    expect(labels).not.toContain('159万円の壁（19〜22歳）');
    expect(labels).not.toContain('197万円の壁（19〜22歳）');
  });

  it('それ以外の年齢・学生でない: いままでどおり130万・136万（扶養）で、163万は出ない', () => {
    const labels = labelsOf({ position: 'dependent' });
    expect(labels).toContain('130万円の壁');
    expect(labels).toContain('136万円の壁（扶養）');
    expect(labels).not.toContain('163万円の壁（勤労学生）');
  });

  it('配偶者の扶養で isStudent が残っていても、163万円（勤労学生）と昼間部の注記は出ない', () => {
    // チェックを入れてから「配偶者の扶養内」に切り替えた状態
    const input: KabeInput = { ...base, income: 140 * M, position: 'spouse', isStudent: true };
    expect(evaluateKabe(input).map((r) => r.label)).not.toContain('163万円の壁（勤労学生）');
    expect(isStudentFor(input)).toBe(false);
  });

  it('isStudentFor: 学生で配偶者の扶養でなければ年齢を問わず true', () => {
    expect(isStudentFor({ position: 'age19to22', isStudent: true })).toBe(true);
    expect(isStudentFor({ position: 'dependent', isStudent: true })).toBe(true);
    expect(isStudentFor({ position: 'none', isStudent: true })).toBe(true);
    expect(isStudentFor({ position: 'age19to22', isStudent: false })).toBe(false);
    expect(isStudentFor({ position: 'age19to22' })).toBe(false);
  });
});
