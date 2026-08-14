import { describe, expect, it } from 'vitest';
import {
  BEHAVIORS,
  FINE_TIERS,
  RED_TICKET_VIOLATIONS,
  SYSTEM,
  VIOLATIONS,
  VIOLATION_COUNT,
  behaviorById,
  checkBehavior,
  fineGroups,
  formatYen,
  searchBehaviors,
  violationById,
} from '@/lib/jitensha-hansokukin';

/**
 * 自転車の反則金（青切符）早見表・チェッカーのテスト。
 *
 * 仕様: docs/features/jitensha-hansokukin.md
 *
 * このツールは計算機ではなく分類ツールなので、テストの主眼は
 * 仕様書のとおり「全項目に金額と根拠がある」「行為→違反のマッピングが一意」の2つ。
 * あわせて、警察庁の公式一覧PDFから読み取った金額そのものを固定しておく。
 * 金額は自治体サイトにも誤りの実例があり、二次情報を見て直されると困るため、
 * **一次資料の値をテストに焼き込んで動かせなくする**。
 */

describe('VIOLATIONS（警察庁一覧の反則行為）', () => {
  it('全項目に名称・金額・根拠条文がある', () => {
    for (const v of VIOLATIONS) {
      expect(v.name, `${v.id}: 名称が空`).not.toBe('');
      expect(v.article, `${v.id}: 根拠条文が空`).toMatch(/^§/);
      expect(v.yen, `${v.id}: 反則金が正の整数でない`).toBeGreaterThan(0);
      expect(Number.isInteger(v.yen), `${v.id}: 反則金が整数でない`).toBe(true);
    }
  });

  it('IDが重複していない', () => {
    const ids = VIOLATIONS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('行為名が重複していない', () => {
    const names = VIOLATIONS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * 「113種類」「約110種類」は二次情報の数え方で、警察庁一覧の行数とは一致しない。
   * ページに書く数字がずれないよう、実データの件数と定数を突き合わせる。
   */
  it('項目数が警察庁一覧の65項目と一致する', () => {
    expect(VIOLATIONS).toHaveLength(VIOLATION_COUNT);
    expect(VIOLATION_COUNT).toBe(65);
  });

  it('反則金の額はすべて FINE_TIERS のいずれか', () => {
    for (const v of VIOLATIONS) {
      expect(FINE_TIERS, `${v.id}: ${v.yen}円 は一覧に無い額`).toContain(v.yen);
    }
  });

  /**
   * 警察庁「自転車をはじめとする軽車両の反則行為と反則金の額」（公式一覧PDF）の値。
   * 愛媛県警の早見表PDFとも突合済み（2026-08-14）。
   */
  it('主要な項目の金額と根拠条文が公式一覧PDFのとおり', () => {
    const expected: Array<[string, number, string]> = [
      ['keitai-hoji', 12000, '§71(5)の5'],
      ['shadan-fumikiri', 7000, '§33②'],
      ['shingo-mushi', 6000, '§7'],
      ['tsuko-kubun', 6000, '§17①・②・§17④・⑥'],
      ['odan-hokosha-bogai', 6000, '§38①〜③・§38の2'],
      ['anzen-unten-gimu', 6000, '§70'],
      ['fumikiri-futeishi', 6000, '§33①'],
      ['ichiji-futeishi', 5000, '§43'],
      ['mutoka', 5000, '§52①'],
      ['seido-sochi-furyo', 5000, '§63の9①'],
      ['koan-iinkai-junshu', 5000, '§71(6)'],
      ['tsuko-kinshi', 5000, '§8①'],
      ['hodo-jokou-gimu', 3000, '§63の4②'],
      ['josha-sekisai-seigen', 3000, '§57②'],
      ['heishin-kinshi', 3000, '§19'],
      ['jitensha-do-tsuko-gimu', 3000, '§63の3'],
      ['keionki-shiyo-seigen', 3000, '§54②'],
    ];

    for (const [id, yen, article] of expected) {
      const v = violationById(id);
      expect(v, `${id} が VIOLATIONS に無い`).toBeDefined();
      expect(v?.yen, `${id} の反則金`).toBe(yen);
      expect(v?.article, `${id} の根拠条文`).toBe(article);
    }
  });

  it('信号無視は6,000円で、点滅信号が5,000円である旨の注記を持つ', () => {
    const v = violationById('shingo-mushi');
    expect(v?.yen).toBe(6000);
    expect(v?.fineNote).toContain('点滅');
    expect(v?.fineNote).toContain('5,000円');
  });

  /** 金額が状況で変わる3項目は、内訳を持っていないと画面に嘘を出すことになる */
  it('放置駐車・駐停車・速度超過は金額の内訳を持ち、基準額が内訳に含まれる', () => {
    for (const id of ['hochi-chusha', 'chuteisha', 'sokudo-choka']) {
      const v = violationById(id);
      expect(v?.variants, `${id}: variants が無い`).toBeDefined();
      expect(v!.variants!.length).toBeGreaterThan(1);
      expect(v!.variants!.map((x) => x.yen), `${id}: 基準額が内訳に無い`).toContain(v!.yen);
      for (const variant of v!.variants!) {
        expect(variant.condition).not.toBe('');
        expect(FINE_TIERS).toContain(variant.yen);
      }
    }
  });

  it('速度超過は超過幅が大きいほど高い', () => {
    const variants = violationById('sokudo-choka')!.variants!;
    const amounts = variants.map((v) => v.yen);
    // 一覧PDFの並び（超過幅の大きい順）がそのまま金額の降順になっている
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(amounts).toEqual([12000, 10000, 7000, 6000]);
  });

  it('適用範囲の限定（※1 / ※2）が公式一覧の注記どおり', () => {
    // ※1 自転車が対象（自転車以外の軽車両を除く）
    expect(violationById('keitai-hoji')?.scope).toBe('bicycle');
    expect(violationById('aizu-furiko')?.scope).toBe('bicycle');
    expect(violationById('keionki-suimei-gimu')?.scope).toBe('bicycle');
    // ※2 普通自転車が対象
    expect(violationById('hodo-jokou-gimu')?.scope).toBe('ordinary-bicycle');
    expect(violationById('jitensha-do-tsuko-gimu')?.scope).toBe('ordinary-bicycle');
    // 注記の無い項目は軽車両一般。undefined のままにしておく
    expect(violationById('shingo-mushi')?.scope).toBeUndefined();
  });
});

describe('SYSTEM（制度そのものの数値）', () => {
  it('施行日・対象年齢・納付期限が一次情報のとおり', () => {
    expect(SYSTEM.effectiveFrom).toBe('2026-04-01');
    expect(SYSTEM.minAge).toBe(16);
    expect(SYSTEM.provisionalPaymentDays).toBe(7);
    expect(SYSTEM.postNoticePaymentDays).toBe(10);
    expect(SYSTEM.law).toBe('令和6年法律第34号');
  });

  /**
   * 「2026年4月に罰則ができた」と書かないための歯止め。
   * 酒気帯び・ながらスマホの罰則強化は2024年11月1日に先行施行されており、
   * 2026年4月に変わったのは青切符の対象になったこと。
   */
  it('罰則強化の先行施行日を青切符の施行日と取り違えていない', () => {
    expect(SYSTEM.penaltyStrengthenedFrom).toBe('2024-11-01');
    expect(SYSTEM.penaltyStrengthenedFrom).not.toBe(SYSTEM.effectiveFrom);
  });
});

describe('RED_TICKET_VIOLATIONS（赤切符のまま残る違反）', () => {
  it('警察庁「取締りについて」に挙げられた4件がそろっている', () => {
    expect(RED_TICKET_VIOLATIONS.map((v) => v.id)).toEqual([
      'shusui',
      'bogai-unten',
      'keitai-kiken',
      'jiko',
    ]);
  });

  it('全項目に名称と説明がある', () => {
    for (const v of RED_TICKET_VIOLATIONS) {
      expect(v.name).not.toBe('');
      expect(v.note.length).toBeGreaterThan(10);
    }
  });

  /**
   * 罰則（懲役・罰金）の額は一次情報で確認できたものだけを書く方針なので、
   * 赤切符側には額を持たせていない。うっかり金額を書き足すのを止める。
   */
  it('赤切符の項目に罰則の金額を書いていない', () => {
    for (const v of RED_TICKET_VIOLATIONS) {
      expect(v.note, `${v.id}: 罰則の額を断定しない`).not.toMatch(/万円以下|懲役|拘禁刑/);
    }
  });

  it('青切符の一覧と赤切符の一覧でIDが衝突していない', () => {
    const blue = new Set(VIOLATIONS.map((v) => v.id));
    for (const red of RED_TICKET_VIOLATIONS) {
      expect(blue.has(red.id), `${red.id} が両方にある`).toBe(false);
    }
  });
});

describe('BEHAVIORS（行為から引く選択肢）', () => {
  it('IDとラベルが重複していない', () => {
    const ids = BEHAVIORS.map((b) => b.id);
    const labels = BEHAVIORS.map((b) => b.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  /**
   * 仕様書の「行為→違反のマッピングが一意」。
   * 参照先が実在しないと画面で黙って消えるので、全参照を解決してみる。
   */
  it('参照している違反IDがすべて実在する', () => {
    for (const b of BEHAVIORS) {
      for (const id of b.violationIds) {
        expect(violationById(id), `${b.id} → ${id} が VIOLATIONS に無い`).toBeDefined();
      }
      for (const id of b.redTicketIds ?? []) {
        expect(
          RED_TICKET_VIOLATIONS.find((v) => v.id === id),
          `${b.id} → ${id} が RED_TICKET_VIOLATIONS に無い`
        ).toBeDefined();
      }
    }
  });

  it('どの行為も、青切符か赤切符のどちらかに結び付くか、注意書きで理由を説明している', () => {
    for (const b of BEHAVIORS) {
      const hasTarget = b.violationIds.length > 0 || (b.redTicketIds ?? []).length > 0;
      if (!hasTarget) {
        // 該当が無いのは「16歳未満」のように制度の対象外である場合だけ。
        // その理由を必ず注意書きで示す
        expect(b.caution, `${b.id}: 該当が無いのに理由の説明が無い`).toBeDefined();
      }
    }
  });

  it('全項目にキーワードがあり、検索で自分自身を引ける', () => {
    for (const b of BEHAVIORS) {
      expect(b.keywords.length, `${b.id}: キーワードが無い`).toBeGreaterThan(0);
      for (const keyword of b.keywords) {
        expect(
          searchBehaviors(keyword).map((x) => x.id),
          `${b.id}: キーワード「${keyword}」で自分が出ない`
        ).toContain(b.id);
      }
    }
  });

  it('日常で問い合わせの多い行為が選択肢にある', () => {
    const ids = BEHAVIORS.map((b) => b.id);
    for (const id of [
      'earphone',
      'umbrella',
      'sidewalk',
      'two-riders',
      'smartphone',
      'no-light',
      'red-light',
      'no-stop',
    ]) {
      expect(ids, `${id} が選択肢に無い`).toContain(id);
    }
  });
});

describe('checkBehavior', () => {
  it('イヤホンは公安委員会遵守事項違反の5,000円で、都道府県差の注意が付く', () => {
    const r = checkBehavior('earphone');
    expect(r.violations.map((v) => v.id)).toEqual(['koan-iinkai-junshu']);
    expect(r.yen).toBe(5000);
    expect(r.behavior.caution).toContain('都道府県');
  });

  /** 仕様書が名指ししている「傘さしは5,000円だが6,000円にもなり得る」ケース */
  it('傘さしは公安委員会遵守事項違反が主で、安全運転義務違反にもなり得る', () => {
    const r = checkBehavior('umbrella');
    expect(r.violations.map((v) => v.id)).toEqual(['koan-iinkai-junshu', 'anzen-unten-gimu']);
    // 代表額は主たる該当先（先頭）の額
    expect(r.yen).toBe(5000);
    expect(r.violations[1].yen).toBe(6000);
  });

  it('歩道通行は徐行等義務違反の3,000円が主で、例外的に通行できる場合の説明が付く', () => {
    const r = checkBehavior('sidewalk');
    expect(r.violations[0].id).toBe('hodo-jokou-gimu');
    expect(r.yen).toBe(3000);
    expect(r.behavior.caution).toContain('13歳未満');
  });

  it('二人乗りは3,000円で、幼児用座席の例外に触れている', () => {
    const r = checkBehavior('two-riders');
    expect(r.yen).toBe(3000);
    expect(r.behavior.caution).toContain('幼児');
  });

  it('ながらスマホは12,000円で、危険を生じさせた場合は赤切符も示す', () => {
    const r = checkBehavior('smartphone');
    expect(r.yen).toBe(12000);
    expect(r.redTickets.map((v) => v.id)).toEqual(['keitai-kiken']);
  });

  it('飲酒運転は青切符の対象が無く、赤切符だけを返す', () => {
    const r = checkBehavior('drinking');
    expect(r.violations).toEqual([]);
    expect(r.yen).toBeNull();
    expect(r.redTickets.map((v) => v.id)).toEqual(['shusui']);
  });

  it('16歳未満は青切符も赤切符も返さず、対象外である旨だけを示す', () => {
    const r = checkBehavior('child-under-16');
    expect(r.violations).toEqual([]);
    expect(r.redTickets).toEqual([]);
    expect(r.yen).toBeNull();
    expect(r.behavior.caution).toContain('16歳');
  });

  it('すべての行為が例外なく解決できる', () => {
    for (const b of BEHAVIORS) {
      expect(() => checkBehavior(b.id), `${b.id} が解決できない`).not.toThrow();
    }
  });

  it('未登録の行為IDは投げる（黙って「該当なし」にしない）', () => {
    expect(() => checkBehavior('nonexistent')).toThrow(/行為のID/);
  });
});

describe('searchBehaviors', () => {
  it('空文字なら全件返す', () => {
    expect(searchBehaviors('')).toHaveLength(BEHAVIORS.length);
    expect(searchBehaviors('   ')).toHaveLength(BEHAVIORS.length);
  });

  it('ラベルの一部でも引ける', () => {
    expect(searchBehaviors('歩道').map((b) => b.id)).toContain('sidewalk');
  });

  it('言い換えのキーワードで引ける', () => {
    expect(searchBehaviors('ながら').map((b) => b.id)).toContain('smartphone');
    expect(searchBehaviors('逆走').map((b) => b.id)).toContain('wrong-side');
    expect(searchBehaviors('かさ').map((b) => b.id)).toContain('umbrella');
  });

  it('該当しない語では空になる', () => {
    expect(searchBehaviors('確定申告')).toEqual([]);
  });
});

describe('fineGroups（早見表）', () => {
  it('金額の高い順に並ぶ', () => {
    const groups = fineGroups();
    const amounts = groups.map((g) => g.yen);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(amounts[0]).toBe(12000);
    expect(amounts[amounts.length - 1]).toBe(3000);
  });

  it('全65項目がちょうど1つのグループに入る（取りこぼしも重複も無い）', () => {
    const groups = fineGroups();
    const listed = groups.flatMap((g) => g.violations.map((v) => v.id));
    expect(listed).toHaveLength(VIOLATION_COUNT);
    expect(new Set(listed).size).toBe(VIOLATION_COUNT);
    expect(new Set(listed)).toEqual(new Set(VIOLATIONS.map((v) => v.id)));
  });

  it('各グループの項目はそのグループの金額を持つ', () => {
    for (const g of fineGroups()) {
      for (const v of g.violations) {
        expect(v.yen).toBe(g.yen);
      }
    }
  });

  it('onlyCommon では日常で問題になりやすい項目だけになる', () => {
    const common = fineGroups(true);
    const ids = common.flatMap((g) => g.violations.map((v) => v.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(VIOLATION_COUNT);
    for (const id of ids) {
      expect(violationById(id)?.common, `${id} が common でない`).toBe(true);
    }
    // 検索需要のある項目は必ず含める
    for (const id of ['keitai-hoji', 'shingo-mushi', 'ichiji-futeishi', 'mutoka']) {
      expect(ids).toContain(id);
    }
  });

  it('空のグループを作らない', () => {
    for (const g of [...fineGroups(), ...fineGroups(true)]) {
      expect(g.violations.length).toBeGreaterThan(0);
    }
  });
});

describe('formatYen', () => {
  it('3桁ごとに区切って「円」を付ける', () => {
    expect(formatYen(12000)).toBe('12,000円');
    expect(formatYen(5000)).toBe('5,000円');
    expect(formatYen(3000)).toBe('3,000円');
  });
});

describe('violationById / behaviorById', () => {
  it('登録済みのIDを引ける', () => {
    expect(violationById('mutoka')?.name).toBe('無灯火');
    expect(behaviorById('earphone')?.label).toContain('イヤホン');
  });

  it('未登録のIDは undefined', () => {
    expect(violationById('nope')).toBeUndefined();
    expect(behaviorById('nope')).toBeUndefined();
  });
});
