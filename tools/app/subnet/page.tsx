import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { CLOUD_RULES, lastOctetTable, reservedAddresses, parseIPv4, summarizeV4 } from '@/lib/subnet';
import Calculator from './Calculator';

// 仕様: docs/features/subnet-keisan.md

const title = 'サブネット計算｜CIDR・サブネットマスクから範囲とホスト数・AWS／Azure／Google Cloud で使える数';
const description =
  'CIDR（192.168.10.0/26 など）やサブネットマスクから、ネットワークアドレス・ブロードキャスト・使えるホスト数・ワイルドカードマスク・2進数を計算します。このIPは範囲に入るか・分割・必要な台数からの逆算も。AWS・Azure・Google Cloud の予約アドレスを引いた実際に使える数まで。入力はブラウザの外に送りません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/subnet/` },
  robots: robotsFor('subnet'),
};

// 本文の例・表は lib から作る（手で書いた数字が計算とずれないように）
const EXAMPLE = summarizeV4(parseIPv4('192.168.10.0')!, 26);
const OCTET_TABLE = lastOctetTable();
const EXAMPLE_28 = parseIPv4('10.0.1.0')!;
const CLOUD_ROWS = (['aws', 'azure', 'gcp'] as const).map((c) => ({
  id: c,
  rule: CLOUD_RULES[c],
  reserved: reservedAddresses(c, EXAMPLE_28, 28),
  usable28: 16 - CLOUD_RULES[c].reserved.length,
}));

const faq = [
  {
    q: '/31 のサブネットは使えますか？',
    a: '使えます。ふつうは先頭（ネットワークアドレス）と末尾（ブロードキャスト）を除くので /31 では1台も残りませんが、RFC 3021 で「ルーターどうしをつなぐ対向リンク」に限って2個とも使えるようになりました。ブロードキャストの無い1対1の接続なので、2台ぶんが使えます。1台だけなら /32 も使えます（ループバックやホストの経路など）。クラウドの VPC のサブネットには使えません。',
  },
  {
    q: 'プライベートアドレスの範囲は？',
    a: 'RFC 1918 で決まっている 10.0.0.0/8（10.0.0.0〜10.255.255.255）、172.16.0.0/12（172.16.0.0〜172.31.255.255）、192.168.0.0/16（192.168.0.0〜192.168.255.255）の3つです。インターネットからは直接届かず、社内や家庭のネットワークで自由に使えます。100.64.0.0/10 は通信事業者のキャリアグレードNAT用（RFC 6598）で、プライベートとは別の扱いです。',
  },
  {
    q: '172.16〜172.31 の範囲の覚え方は？',
    a: '/12 は第2オクテットの上位4ビットまでがネットワーク部なので、16（00010000）から 31（00011111）までの16個がまとめて入ります。「172 の 16 から 16 個」と覚えると、172.32.0.1 がプライベートではないことにも気づけます。',
  },
  {
    q: 'VPC の CIDR はどれくらいの大きさで取ればいいですか？',
    a: '組織の規模や、ほかのネットワークとつなぐ予定によって変わるので、一律の答えはありません。一般には、あとから広げにくいので小さすぎない範囲（/16 など）を取り、社内やほかの VPC と重ならないようにしておくと、ピアリングや VPN で困りにくくなります。サブネットはアベイラビリティゾーンごと・用途ごとに分け、上の「分割」で何個取れるかを確かめてください。',
  },
  {
    q: 'IPv6 では /64 が標準なのはなぜですか？',
    a: 'IPv6 のアドレスの自動設定（SLAAC）が、下位 64 ビットをインターフェースの識別子として使う前提で作られているためです。/64 より小さく切ると自動設定が動かない機器があるので、1つのセグメントには /64 を割り当てるのが基本です。このツールでは IPv6 は範囲とアドレス数だけを出します。',
  },
];

const trail = breadcrumbFor('subnet');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'サブネット計算（CIDR・IPアドレス範囲）', slug: 'subnet', description }),
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbList(trail),
  ],
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
  fontSize: '0.85rem',
};

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 6px' };
const td: React.CSSProperties = { padding: '4px 6px', borderTop: '1px solid var(--border)', verticalAlign: 'top' };

const ext = { target: '_blank', rel: 'nofollow noopener noreferrer' } as const;

const RFCS = [
  { n: 1918, t: 'プライベートアドレス' },
  { n: 3021, t: '/31 の対向リンク' },
  { n: 4632, t: 'CIDR' },
  { n: 5737, t: 'ドキュメント用アドレス' },
  { n: 6598, t: '共有アドレス（CGNAT）' },
  { n: 6890, t: '特殊用途アドレスの登録簿' },
  { n: 5952, t: 'IPv6 の表記' },
];

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>サブネット計算（CIDR・IPアドレス範囲）</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <code style={codeStyle}>192.168.10.0/26</code> やサブネットマスクを入れると、ネットワークアドレス・ブロードキャスト・<strong>使えるホスト数</strong>・ワイルドカードマスクを出します。AWS・Azure・Google Cloud を選べば、<strong>予約アドレスを引いた実際に使える数</strong>も。範囲に入るかの判定・分割・必要な台数からの逆算もできます。入力はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>サブネットの計算のしかた</h2>
      <p>
        <code style={codeStyle}>{EXAMPLE.network}/{EXAMPLE.prefix}</code> の「/{EXAMPLE.prefix}」は、32 ビットのうち上の {EXAMPLE.prefix} ビットがネットワーク部という意味です。残りの 32−{EXAMPLE.prefix}＝{32 - EXAMPLE.prefix} ビットがホスト部なので、アドレスは 2^{32 - EXAMPLE.prefix}＝<strong>{EXAMPLE.total} 個</strong>。先頭（{EXAMPLE.network}：ネットワークアドレス）と末尾（{EXAMPLE.broadcast}：ブロードキャスト）は機器に割り当てられないので、使えるのは {EXAMPLE.total}−2＝<strong>{EXAMPLE.usable} 台</strong>（{EXAMPLE.firstUsable}〜{EXAMPLE.lastUsable}）です。
      </p>
      <p>
        サブネットマスクは、ネットワーク部を 1・ホスト部を 0 にした 32 ビットを10進数で書いたもので、/{EXAMPLE.prefix} なら {EXAMPLE.mask} です。ワイルドカードマスク（Cisco の ACL などで使う）は 0 と 1 を反転させた {EXAMPLE.wildcard} になります。
      </p>
      <h3>第4オクテットの早見表（/25〜/32）</h3>
      <p>試験で手で解くときは、マスクの最後の数とアドレス数の対応を覚えておくと早く解けます。/24 より短いときは、同じ数が1つ上のオクテットに来ます（/18 なら 255.255.192.0）。</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th style={th}>長さ</th>
              <th style={th}>第4オクテット</th>
              <th style={th}>アドレス数</th>
              <th style={th}>使える数</th>
            </tr>
          </thead>
          <tbody>
            {OCTET_TABLE.map((r) => (
              <tr key={r.prefix}>
                <td style={{ ...td, ...codeStyle, whiteSpace: 'nowrap' }}>/{r.prefix}</td>
                <td style={{ ...td, ...codeStyle }}>{r.lastOctet}</td>
                <td style={td}>{r.total}</td>
                <td style={td}>
                  {r.usable}
                  {r.prefix === 31 && '（対向リンク）'}
                  {r.prefix === 32 && '（ホスト1台）'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>クラウドで使える数が減る理由</h2>
      <p>
        AWS・Azure・Google Cloud の VPC（仮想ネットワーク）では、ネットワークアドレスとブロードキャストのほかに、ルーター・DNS などのためにサブネットの先頭のアドレスが予約されます。たとえば /28（16 個）のサブネットで機器に割り当てられるのは、ふつうの 14 台ではなく、AWS と Azure で {CLOUD_ROWS[0].usable28} 台、Google Cloud で {CLOUD_ROWS[2].usable28} 台です。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th style={th}>クラウド</th>
              <th style={th}>予約</th>
              <th style={th}>10.0.1.0/28 で予約されるアドレス</th>
              <th style={th}>作れる大きさ</th>
            </tr>
          </thead>
          <tbody>
            {CLOUD_ROWS.map((c) => (
              <tr key={c.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.rule.label}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.rule.reserved.length} 個</td>
                <td style={td}>
                  {c.reserved.map((r) => (
                    <div key={r.address}>
                      <span style={codeStyle}>{r.address}</span>：{r.label}
                    </div>
                  ))}
                </td>
                <td style={td}>{c.rule.minPrefix > 0 ? `/${c.rule.minPrefix}〜/${c.rule.maxPrefix}` : `最小 /${c.rule.maxPrefix}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        AWS の「先頭＋2」は、本来は VPC の CIDR の先頭＋2 が Amazon の DNS サーバーのアドレスで、どのサブネットでも先頭＋2 は予約として外されます。VPC はブロードキャストに対応していないので、末尾も使えません。
      </p>

      <h2>特殊用途のアドレス</h2>
      <p>
        結果の「種類」では、プライベート（RFC 1918）のほか、100.64.0.0/10（キャリアグレードNAT・RFC 6598）、169.254.0.0/16（リンクローカル）、192.0.2.0/24・198.51.100.0/24・203.0.113.0/24（ドキュメント用・RFC 5737）、198.18.0.0/15（ベンチマーク用）、224.0.0.0/4（マルチキャスト）などを見分けます。これらはインターネットからは直接届かないアドレスです。3つのプライベートの範囲は下の質問を見てください。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <h3>入力したアドレスは送信されますか？</h3>
      <p>
        送信されません。計算はすべてお使いのブラウザの中で行います。「共有用のURLをコピー」を押したときだけ、URL のうしろ（?q=…）に入力を付けてクリップボードに入れます。そのURLで開いたときも、読み込んだあとアドレスバーから消し、アクセス解析にも載せません。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="subnet" />

      <ToolMeta slug="subnet">
        AWS は{' '}
        <a href={CLOUD_RULES.aws.source.url} {...ext}>{CLOUD_RULES.aws.source.title}</a>
        、Azure は{' '}
        <a href={CLOUD_RULES.azure.source.url} {...ext}>{CLOUD_RULES.azure.source.title}</a>
        、Google Cloud は{' '}
        <a href={CLOUD_RULES.gcp.source.url} {...ext}>{CLOUD_RULES.gcp.source.title}</a>
        、アドレスの決まりは{' '}
        {RFCS.map((r, i) => (
          <span key={r.n}>
            {i > 0 && '・'}
            <a href={`https://www.rfc-editor.org/rfc/rfc${r.n}`} {...ext}>RFC {r.n}</a>（{r.t}）
          </span>
        ))}
        にもとづいて当サイトが実装しました（外部のライブラリは使っていません）。
      </ToolMeta>
    </>
  );
}
