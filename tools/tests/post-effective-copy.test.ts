import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metadata as hatarakizonMeta } from '@/app/hatarakizon/page';
import { metadata as idecoMeta } from '@/app/ideco/page';
import { metadata as invoiceMeta } from '@/app/invoice-nozeigaku/page';
import { metadata as iryohiMeta } from '@/app/iryohi-kojo/page';
import { metadata as kokunenMeta } from '@/app/kokunen-ikuji-menjo/page';
import { metadata as nenshuKabeMeta } from '@/app/nenshu-kabe/page';
import { metadata as saiteiChinginMeta } from '@/app/saitei-chingin/page';
import { metadata as shuzeiMeta } from '@/app/shuzei-kaisei/page';
import { metadata as tabakoMeta } from '@/app/tabako-zei-neage/page';
import { metadata as tedoriMeta } from '@/app/tedori-keisan/page';
import { REFORM_EFFECTIVE_FROM } from '@/lib/ideco';
import { PURCHASE_TRANSITION } from '@/lib/invoice-nozeigaku';
import { SELF_MED_REFORM_EFFECTIVE_ON } from '@/lib/iryohi-kojo';
import { IKUJI_START } from '@/lib/kokunen-ikuji-menjo';
import { WAGE_REQUIREMENT_ABOLISHED_ON } from '@/lib/nenshu-kabe';
import { tools } from '@/lib/registry';
import { REVISION_DATE } from '@/lib/shuzei-kaisei';
import { HEATED_ALIGNED_FROM } from '@/lib/tabako-zei';
import { WITHHOLDING_TABLE_EFFECTIVE_ON } from '@/lib/tedori-keisan';

/**
 * 施行日を過ぎたのに「これから」の文面（未来形）が残っていないかを、施行日を持つツール全体で見る。
 * 静的HTMLに焼き込む文面は開いた日で切り替わらないので、期日を過ぎたら書き換えで追従する必要がある。
 *
 * 仕様: docs/features/r8-10gatsu-shikogo-copy-sweep.md
 *       docs/features/r8-12gatsu-1gatsu-shikogo-copy.md（12-01・01-01 施行分）
 */

type Entry = {
  slug: string;
  /** 施行日 'YYYY-MM-DD'。lib の定数から取る（日付を二重に書かない） */
  effectiveOn: string;
  /** page.tsx の description と registry の description に残っていてはいけない文面 */
  patterns: RegExp[];
  /**
   * page.tsx の本文（FAQ を含むソース全体）に残っていてはいけない文面。
   * 過去の扱いを説明する段落が本文に正しく残るページ（酒税・たばこ）は空にして description だけを見る
   */
  sourcePatterns: RegExp[];
  /**
   * page.tsx 以外に検査するファイル（同じディレクトリ）。Calculator.tsx は施行前の枝に未来形が
   * 正しく残るので、sourcePatterns ではなく extraPatterns（分岐の外に置いてはいけない文面）だけで見る
   */
  extraFiles?: string[];
  extraPatterns?: RegExp[];
  description: string;
};

const WALL_PATTERNS = [/撤廃されます/, /撤廃され[^。]*変わります/, /10月1日に始まる/];
const INVOICE_70_FROM = PURCHASE_TRANSITION.find((p) => p.rate === 0.7)!.from;

const ENTRIES: Entry[] = [
  {
    slug: 'nenshu-kabe',
    effectiveOn: WAGE_REQUIREMENT_ABOLISHED_ON,
    patterns: WALL_PATTERNS,
    sourcePatterns: WALL_PATTERNS,
    description: String(nenshuKabeMeta.description),
  },
  {
    slug: 'hatarakizon',
    effectiveOn: WAGE_REQUIREMENT_ABOLISHED_ON,
    patterns: [...WALL_PATTERNS, /始まります/],
    sourcePatterns: [...WALL_PATTERNS, /始まります/],
    description: String(hatarakizonMeta.description),
  },
  {
    slug: 'saitei-chingin',
    effectiveOn: WAGE_REQUIREMENT_ABOLISHED_ON,
    patterns: WALL_PATTERNS,
    sourcePatterns: WALL_PATTERNS,
    description: String(saiteiChinginMeta.description),
  },
  {
    // registry の「2026年10月から、〜免除されます」は制度の説明として正しいので「免除されます」は見ない
    slug: 'kokunen-ikuji-menjo',
    effectiveOn: `${IKUJI_START}-01`,
    patterns: [/始まる/],
    sourcePatterns: [/始まる/],
    description: String(kokunenMeta.description),
  },
  {
    // 2028年10月からの 50% などの未来の段階は未来形のままでよい
    slug: 'invoice-nozeigaku',
    effectiveOn: INVOICE_70_FROM,
    patterns: [/80%から70%に下がります/],
    sourcePatterns: [/80%から70%に下がります/, /割合が下がります/, /同時に切り替わる/],
    description: String(invoiceMeta.description),
  },
  {
    slug: 'shuzei-kaisei',
    effectiveOn: REVISION_DATE,
    patterns: [/されます/, /9月中/, /施行前に買う/],
    sourcePatterns: [],
    description: String(shuzeiMeta.description),
  },
  {
    slug: 'tabako-zei-neage',
    effectiveOn: HEATED_ALIGNED_FROM,
    patterns: [/揃います/, /見直されます/, /見直しがあります/],
    sourcePatterns: [],
    description: String(tabakoMeta.description),
  },
  {
    slug: 'ideco',
    effectiveOn: REFORM_EFFECTIVE_FROM,
    patterns: [/6\.2万円に。/, /6\.2万円へ/, /6\.2万円になります/],
    // title は page.tsx の const title にあり description の検査では見えないので、本文側にも入れる
    sourcePatterns: [
      /6\.2万円へ/,
      /6\.2万円になります/,
      /いますぐ月6\.2万円/,
      /必ず並べて表示します/,
      /広がります/,
      /延びます/,
      /引き上げられます/,
      /7\.5万円になります/,
      /から出せる額は違います/,
    ],
    extraFiles: ['Calculator.tsx'],
    extraPatterns: [/延びます（老齢基礎年金/],
    description: String(idecoMeta.description),
  },
  {
    // 「11月までの源泉徴収に反映されていない」は施行後も正しい説明なので見ない
    slug: 'tedori-keisan',
    effectiveOn: WITHHOLDING_TABLE_EFFECTIVE_ON,
    patterns: [],
    sourcePatterns: [/給与明細に現れるのは2027年1月から/, /天引きが変わるのは2027年1月から/],
    description: String(tedoriMeta.description),
  },
  {
    slug: 'iryohi-kojo',
    effectiveOn: SELF_MED_REFORM_EFFECTIVE_ON,
    patterns: [],
    sourcePatterns: [/見直されるので/],
    description: String(iryohiMeta.description),
  },
];

/** 実行環境のローカル日付 'YYYY-MM-DD'（各ツールの Calculator と同じ判定。UTC の CI では 09:00 JST から） */
function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 出典リンクの題名（引用）を検査対象から外す。引用は原文どおりに残すので、未来形でも直さない。
 * `<a ...>〜</a>` の区間を取り除く（複数行にまたがるものも）
 */
export function stripLinks(source: string): string {
  return source.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, '');
}

function pageSource(slug: string, file = 'page.tsx'): string {
  return readFileSync(join(__dirname, `../app/${slug}/${file}`), 'utf8');
}

describe('stripLinks（出典の題名を検査から外す）', () => {
  it('<a> の中の文字列だけを取り除く', () => {
    const src = `前<a href="x"
      target="_blank">
      日本年金機構「〜制度が始まります!」
    </a>後`;
    expect(stripLinks(src)).toBe('前後');
  });

  it('kokunen-ikuji-menjo の出典の題名（原文）は page.tsx に残っている', () => {
    // 引用を書き換えていないことの確認。stripLinks で外れるので下の検査には掛からない
    const src = pageSource('kokunen-ikuji-menjo');
    expect(src).toContain('育児免除制度が始まります!');
    expect(stripLinks(src)).not.toContain('育児免除制度が始まります!');
  });
});

describe('施行日を過ぎたら「これから」の文面が残っていない', () => {
  const today = todayYmd();

  it('表の施行日は YYYY-MM-DD で、対象のツールが registry にある', () => {
    for (const e of ENTRIES) {
      expect(e.effectiveOn, e.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tools.find((t) => t.slug === e.slug), e.slug).toBeDefined();
      // extraFiles を書き間違えると検査が空振りするので、ファイルが読めることを確かめる
      for (const file of e.extraFiles ?? []) {
        expect(pageSource(e.slug, file).length, `${e.slug}/${file}`).toBeGreaterThan(0);
      }
    }
  });

  for (const e of ENTRIES) {
    // 施行前に書いた仕様書・PR が CI で落ちないよう、テストを走らせた日が施行日以降のときだけ検査する
    it.runIf(today >= e.effectiveOn)(`${e.slug}（${e.effectiveOn} 施行）`, () => {
      const registryDescription = tools.find((t) => t.slug === e.slug)!.description;
      for (const re of e.patterns) {
        expect(e.description, `page.tsx の description に ${re}`).not.toMatch(re);
        expect(registryDescription, `registry の description に ${re}`).not.toMatch(re);
      }
      const body = stripLinks(pageSource(e.slug));
      for (const re of e.sourcePatterns) {
        expect(body, `page.tsx の本文・FAQ に ${re}`).not.toMatch(re);
      }
      for (const file of e.extraFiles ?? []) {
        const extra = stripLinks(pageSource(e.slug, file));
        for (const re of e.extraPatterns ?? []) {
          expect(extra, `${file} に ${re}`).not.toMatch(re);
        }
      }
    });
  }
});
