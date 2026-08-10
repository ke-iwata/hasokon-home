// コマンドライン引数の解釈。テストから触りたいのでファイルを分けている。

export const DEFAULTS = Object.freeze({
  sitemap: 'https://hasokon.com/sitemap.xml',
  siteUrl: 'https://hasokon.com/',
  concurrency: 4,
  out: null,
  dryRun: false,
  help: false,
});

const NUMERIC = new Set(['concurrency']);

const USAGE = `使い方: node scripts/gsc-canonical-audit.mjs [オプション]

サイトマップに載っている全URLを Search Console の URL検査API にかけ、
googleCanonical が旧サブドメイン（tool / game / roulette.hasokon.com）を
指したままのページが何件あるかを数える。
仕様: docs/features/search-index-consolidation.md

オプション:
  --sitemap <url>     起点のサイトマップ（既定: ${DEFAULTS.sitemap}）
  --site-url <url>    Search Console のプロパティ（既定: ${DEFAULTS.siteUrl}）
  --concurrency <n>   同時に検査する数（既定: ${DEFAULTS.concurrency}）
  --out <path>        結果をJSONで保存する。ベースラインの記録用
  --dry-run           APIを叩かず、対象URLの一覧だけ出す
  --help              この説明を出す

環境変数:
  GOOGLE_SERVICE_ACCOUNT_JSON  サービスアカウントのJSON（生でもbase64でも可）

終了コード:
  0  旧サブドメインを指すURLが0件（統合完了）／--dry-run が成功
  1  旧サブドメインを指すURLが残っている、または検査に失敗したURLがある
  2  実行できなかった（認証・サイトマップ取得の失敗など）`;

export function usage() {
  return USAGE;
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @returns {typeof DEFAULTS}
 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--sitemap':
      case '--site-url':
      case '--concurrency':
      case '--out': {
        const key = arg === '--site-url' ? 'siteUrl' : arg.slice(2);
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new Error(`${arg} には値が必要です`);
        }
        i += 1;
        if (NUMERIC.has(key)) {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed < 1) {
            throw new Error(`${arg} は1以上の整数にしてください`);
          }
          options[key] = parsed;
        } else {
          options[key] = value;
        }
        break;
      }
      default:
        throw new Error(`知らないオプションです: ${arg}`);
    }
  }

  return options;
}
