'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMove,
  countStones,
  cpuMove,
  initialBoard,
  isGameOver,
  legalMoves,
  type Player,
  type ReversiBoard,
} from '@/lib/reversi';
import { trackToolUse } from '@/lib/analytics';

/** CPUの思考時間の演出（即打ちだと何が起きたか分からないため） */
const CPU_DELAY_MS = 550;

export default function Game() {
  const [board, setBoard] = useState<ReversiBoard>(initialBoard);
  const [turn, setTurn] = useState<Player>(1); // 1=黒（人間） 2=白（CPU）
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const over = isGameOver(board);
  const { black, white } = countStones(board);
  const humanMoves = legalMoves(board, 1);

  const reset = () => {
    clearTimeout(timer.current);
    setBoard(initialBoard());
    setTurn(1);
    setLastMove(null);
    setMessage('');
    trackToolUse('reversi', 'new');
  };

  /** CPUの手番を進める。CPUが連続で打つ場合（人間がパス）も処理する */
  const runCpu = useCallback((b: ReversiBoard) => {
    const move = cpuMove(b, 2);
    if (move === null) {
      // CPUがパス
      if (legalMoves(b, 1).length > 0) {
        setMessage('コンピュータはパスしました。あなたの番です。');
        setTurn(1);
      }
      return;
    }
    timer.current = window.setTimeout(() => {
      const next = applyMove(b, move, 2)!;
      setBoard(next);
      setLastMove(move);
      if (isGameOver(next)) return;
      if (legalMoves(next, 1).length === 0) {
        // 人間がパス → CPUがもう一度
        setMessage('打てる場所がないためパスです。');
        runCpu(next);
      } else {
        setMessage('');
        setTurn(1);
      }
    }, CPU_DELAY_MS);
  }, []);

  const play = (index: number) => {
    if (turn !== 1 || over) return;
    const next = applyMove(board, index, 1);
    if (!next) return;
    setBoard(next);
    setLastMove(index);
    setMessage('');
    setTurn(2);
    if (!isGameOver(next)) runCpu(next);
  };

  // アンマウント時にCPUのタイマーを止める
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (over) {
      trackToolUse('reversi', black > white ? 'win' : black < white ? 'lose' : 'draw');
    }
    // 終局時に1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  const result =
    black > white ? `あなたの勝ち！（${black}対${white}）` :
    black < white ? `コンピュータの勝ち（${black}対${white}）` :
    `引き分け（${black}対${white}）`;

  return (
    <div className="card">
      <div className="status-bar">
        <span>
          ⚫ あなた: <strong style={{ color: 'var(--text)' }}>{black}</strong>
          {'　'}⚪ CPU: <strong style={{ color: 'var(--text)' }}>{white}</strong>
        </span>
        <button type="button" className="btn" onClick={reset}>
          最初から
        </button>
      </div>

      {over ? (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          {result}
        </p>
      ) : (
        <p className="status-bar">
          {turn === 1 ? '黄色の場所に打てます。' : 'コンピュータが考えています…'}
          {message && ` ${message}`}
        </p>
      )}

      <div className="rv-board" role="grid" aria-label="リバーシの盤面">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            className={`rv-cell ${lastMove === i ? 'rv-last' : ''}`}
            onClick={() => play(i)}
            aria-label={`${Math.floor(i / 8) + 1}行${(i % 8) + 1}列 ${
              cell === 1 ? '黒' : cell === 2 ? '白' : '空き'
            }`}
          >
            {cell !== 0 ? (
              <span className={`rv-stone ${cell === 1 ? 'black' : 'white'}`} />
            ) : turn === 1 && !over && humanMoves.includes(i) ? (
              <span className="rv-hint" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
