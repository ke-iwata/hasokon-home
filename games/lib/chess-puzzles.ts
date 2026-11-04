/**
 * 今日の 1 手詰めの予備の 30 局面（FEN）。
 *
 * 仕様: docs/features/game-chess.md「今日の 1 手詰め」
 *
 * 自己対局で問題が作れなかった日だけ、日付の seed で 1 つ選んで使う。
 * **すべて `lib/chess.ts` の生成器（`findPuzzleWith`）を、日替わりとは別の seed
 * （`mulberry32(0x5eed0000 + n)`）で回して拾った局面**で、既存の問題集・他サイトの問題は写していない。
 * どれも「メイトになる手がちょうど 1 つ・合法手が 15 以上・駒が 8 個以上」を満たす
 * （`tests/chess.test.ts` が確かめる）。
 */
export const FALLBACK_PUZZLES: readonly string[] = [
  '2N3Q1/8/1P5p/3p3k/P4p1P/5K2/3P1R2/8 w - - 0 57',
  '5k2/p4r2/PpR1pB2/1P4pP/7P/N7/5NK1/8 w - - 3 53',
  '1k6/6R1/4R3/1pP5/P7/3B4/4Pp1b/1N3K2 w - - 2 59',
  'rnk2b1r/1b2pp2/1p3n2/1N4pp/5Q2/8/PP1K1PPP/R1B2BR1 w - - 4 18',
  '4k2r/p6p/1r3p1P/7b/1b1Nn3/pq6/1B1P2R1/3RK3 b - - 1 34',
  '3R4/7k/2p2B2/1p5B/R7/8/b7/4K3 w - - 0 52',
  'R5n1/4kpq1/3p4/3P4/pp1P3b/5p2/8/5K2 b - - 0 46',
  '1r3bnr/1bp2p2/1p1p3p/p3p3/Q1P1Pk1P/3P1P2/PP3KP1/R4BR1 w - - 0 20',
  '4kb2/4p3/7n/1pp1KB1p/2b4P/2p4q/5r2/6R1 b - - 1 43',
  '1n4nr/4p1kp/5pp1/3p3P/3P1b2/Q1P3PR/4PK2/r1q2BN1 b - - 0 24',
  '2NQ3b/8/2N5/1P1K1k1P/p6P/P4P2/7p/8 w - - 0 56',
  '4Q1n1/6k1/7r/1P1BP3/2p2K2/8/8/r3b1N1 w - - 1 59',
  '2n2b1r/5p2/1Qpkp2p/5P1P/3P2pN/1P2P3/R2B4/3B1K2 w - - 1 28',
  'r1b4r/p3bk1p/3p2pP/1pP2p2/2P2p1P/3P4/P2BPK2/RN1Q1BNq b - c3 0 17',
  '8/7p/5p1k/1p3bp1/2r1p1PP/4K3/1n1PRB1N/8 b - - 1 43',
  '8/1p5p/5pp1/5k2/p1P4K/2P2P2/q7/1N6 b - - 0 45',
  '2k1r3/p1p2Pr1/Pp1b3p/1N1p4/P2K2P1/2P3P1/Rn6/5B1R w - - 1 31',
  '4k2r/2P1pp1n/4p2p/p7/1PnPK3/2P3PP/8/1NB3NR w k - 1 24',
  '8/2n1n2r/3b2pp/p1B1kP2/6P1/1Rp4P/2P1P3/3QKB1R w K - 0 31',
  'r2k1bnr/3np1pp/1pB1Q3/p1pP1p2/8/P7/RPPP1P1P/1NB1K2R w - - 1 21',
  '2r3r1/3n1kbp/8/p1p3p1/P2N1P2/1NPp1RKp/3Bq3/5R2 b - - 5 34',
  'r4k1r/pp3B1p/P2p1Q1b/4p1p1/1B2P1b1/P5P1/2PN3P/R3K1NR w KQ - 5 24',
  '1k6/2b1n3/p5pr/1p2pb2/3PP3/5K2/5P2/2B1Nq2 b - - 4 53',
  '2k5/5Q2/7R/2Pp4/3P1p2/8/7K/8 w - - 0 58',
  '2r2knr/p2n4/bq1N1p1P/1p1pp3/5N1P/P1PP1P2/4P2K/2B1Q2R w - - 1 24',
  '6n1/np2Q3/p1r2p2/1k4N1/6P1/2pr1P2/1P3K2/RN1Q4 w - - 1 30',
  '1rb5/1BNn1r2/3p3b/p3k1p1/P1P2RP1/1P6/3P3P/R1B3K1 w - - 1 27',
  '8/p2P4/b1P2k2/5P2/r6P/1P2p2B/2P5/4K2R b - - 0 39',
  '6r1/3b1N1k/2pB2p1/p1Pp1p1p/p6P/3P1PP1/1P2K3/R1Q4R w - - 9 39',
  'rn4nr/2pk1pp1/4p2p/p4q2/2b5/4P1PP/PP1P4/R1B1KBNR b KQ - 0 13',
];
