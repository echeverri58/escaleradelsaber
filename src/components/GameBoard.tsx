import { Flag, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import {
  getBoardRenderSquares,
  getSquareCenterPercent,
  getTileRowCol,
  LADDERS,
  MAX_SQUARE,
  SNAKES,
} from '../shared/board.ts';
import type { PublicPlayer } from '../shared/types.ts';

interface GameBoardProps {
  players: PublicPlayer[];
  snakesEnabled: boolean;
  recentMoverId?: string | null;
}

const TILE_PALETTE = [
  'bg-amber-50 text-slate-800',
  'bg-sky-50 text-slate-800',
  'bg-emerald-50 text-slate-800',
  'bg-rose-50 text-slate-800',
  'bg-violet-50 text-slate-800',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Calcula la geometría SVG de una escalera entre dos casillas en un espacio 600x500 (6x5).
 */
function buildLadderGeometry(from: number, to: number) {
  const p1 = getSquareCenterPercent(from);
  const p2 = getSquareCenterPercent(to);
  const x1 = p1.x * 6;
  const y1 = p1.y * 5;
  const x2 = p2.x * 6;
  const y2 = p2.y * 5;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy * 12;
  const py = ux * 12;

  const trim = 18;
  const sx1 = x1 + ux * trim;
  const sy1 = y1 + uy * trim;
  const sx2 = x2 - ux * trim;
  const sy2 = y2 - uy * trim;

  const rungs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const step = 24;
  const usableLen = Math.max(0, len - trim * 2);
  const count = Math.max(3, Math.floor(usableLen / step));

  for (let i = 1; i < count; i++) {
    const t = i / count;
    const cx = sx1 + (sx2 - sx1) * t;
    const cy = sy1 + (sy2 - sy1) * t;
    rungs.push({
      x1: cx - px,
      y1: cy - py,
      x2: cx + px,
      y2: cy + py,
    });
  }

  return {
    railA: { x1: sx1 - px, y1: sy1 - py, x2: sx2 - px, y2: sy2 - py },
    railB: { x1: sx1 + px, y1: sy1 + py, x2: sx2 + px, y2: sy2 + py },
    rungs,
  };
}

/**
 * Calcula una curva sinuosa suave para dibujar una serpiente desde su cabeza (from) hasta la cola (to).
 */
function buildSnakePath(from: number, to: number) {
  const p1 = getSquareCenterPercent(from);
  const p2 = getSquareCenterPercent(to);
  const x1 = p1.x * 6;
  const y1 = p1.y * 5;
  const x2 = p2.x * 6;
  const y2 = p2.y * 5;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 26;
  const py = (dx / len) * 26;

  const c1x = x1 + dx * 0.25 + px;
  const c1y = y1 + dy * 0.25 + py;
  const midX = x1 + dx * 0.5;
  const midY = y1 + dy * 0.5;
  const c2x = x1 + dx * 0.75 - px;
  const c2y = y1 + dy * 0.75 - py;

  const path = `M ${x1} ${y1} Q ${c1x} ${c1y} ${midX} ${midY} Q ${c2x} ${c2y} ${x2} ${y2}`;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  return { path, headX: x1, headY: y1, tailX: x2, tailY: y2, angleDeg };
}

export function GameBoard({ players, snakesEnabled, recentMoverId }: GameBoardProps) {
  const squares = useMemo(() => getBoardRenderSquares(), []);

  const positionedPlayers = useMemo(() => {
    const groups = new Map<number, PublicPlayer[]>();
    for (const p of players) {
      const list = groups.get(p.position) ?? [];
      list.push(p);
      groups.set(p.position, list);
    }

    return players.map((player) => {
      const group = groups.get(player.position) ?? [player];
      const idx = group.findIndex((item) => item.id === player.id);
      const total = group.length;

      if (player.position === 0) {
        const maxPerRow = 10;
        const row = Math.floor(idx / maxPerRow);
        const col = idx % maxPerRow;
        const countInRow = Math.min(maxPerRow, total - row * maxPerRow);
        const spacing = Math.min(9.5, 82 / Math.max(1, countInRow));
        const startX = 50 - ((countInRow - 1) * spacing) / 2;
        const x = startX + col * spacing;
        const y = total > maxPerRow ? (row === 0 ? 105 : 111) : 107.5;
        return { player, x, y };
      }

      const center = getSquareCenterPercent(player.position);
      if (total === 1) {
        return { player, x: center.x, y: center.y };
      }

      const radius = total <= 2 ? 3.2 : total <= 4 ? 3.8 : 4.2;
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 4;
      return {
        player,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
  }, [players]);

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full select-none">
      {/* Contenedor 6x5 (30 casillas) con espacio inferior para SALIDA */}
      <div className="relative w-full max-w-[min(98vh,860px)] pb-[12%]">
        <div className="relative w-full aspect-[6/5] rounded-2xl overflow-visible bg-slate-900 p-2 shadow-2xl ring-1 ring-white/15">
          {/* Cuadrícula 6x5 = 30 casillas */}
          <div className="grid grid-cols-6 grid-rows-5 w-full h-full rounded-xl overflow-hidden border-2 border-slate-800 bg-white">
            {squares.map((num) => {
              const { rowFromTop, col } = getTileRowCol(num);
              const paletteIdx = (rowFromTop * 3 + col) % TILE_PALETTE.length;
              const isStart = num === 1;
              const isFinish = num === MAX_SQUARE;
              const hasLadderStart = LADDERS.some((l) => l.from === num);
              const hasSnakeHead = snakesEnabled && SNAKES.some((s) => s.from === num);

              let cellBg = TILE_PALETTE[paletteIdx];
              if (isFinish) {
                cellBg = 'bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 text-amber-950';
              } else if (isStart) {
                cellBg = 'bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-950';
              }

              return (
                <div
                  key={num}
                  className={`relative border border-slate-900/12 flex flex-col justify-between p-1.5 sm:p-2 ${cellBg}`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`font-mono tabular-nums leading-none font-extrabold ${
                        isFinish
                          ? 'text-base sm:text-xl text-amber-950'
                          : 'text-sm sm:text-lg md:text-xl text-slate-800'
                      }`}
                    >
                      {num}
                    </span>
                    {hasLadderStart && (
                      <span
                        className="text-xs font-extrabold text-amber-700 leading-none"
                        title="Base de escalera"
                      >
                        ▲
                      </span>
                    )}
                    {hasSnakeHead && (
                      <span
                        className="text-xs font-extrabold text-rose-600 leading-none"
                        title="Cabeza de serpiente"
                      >
                        ▼
                      </span>
                    )}
                  </div>

                  {isFinish && (
                    <div className="flex items-center justify-between gap-1 pt-1">
                      <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-amber-900">
                        Meta
                      </span>
                      <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-800 drop-shadow-sm" />
                    </div>
                  )}
                  {isStart && (
                    <div className="flex items-center justify-end">
                      <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                        Inicio
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Capa SVG de Escaleras y Serpientes alineada exactamente 1:1 con el 6x5 */}
          <svg
            viewBox="0 0 600 500"
            className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] pointer-events-none z-10"
            aria-hidden="true"
          >
            <defs>
              <filter id="board-shadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.28" />
              </filter>
            </defs>

            {/* Escaleras (Suben) */}
            {LADDERS.map((ladder) => {
              const geo = buildLadderGeometry(ladder.from, ladder.to);
              return (
                <g key={`ladder-${ladder.from}-${ladder.to}`} filter="url(#board-shadow)" opacity="0.92">
                  {geo.rungs.map((rung, idx) => (
                    <g key={idx}>
                      <line
                        x1={rung.x1}
                        y1={rung.y1}
                        x2={rung.x2}
                        y2={rung.y2}
                        stroke={ladder.color}
                        strokeWidth="6.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={rung.x1}
                        y1={rung.y1}
                        x2={rung.x2}
                        y2={rung.y2}
                        stroke={ladder.accent}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </g>
                  ))}
                  <line
                    x1={geo.railA.x1}
                    y1={geo.railA.y1}
                    x2={geo.railA.x2}
                    y2={geo.railA.y2}
                    stroke={ladder.color}
                    strokeWidth="7.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1={geo.railA.x1}
                    y1={geo.railA.y1}
                    x2={geo.railA.x2}
                    y2={geo.railA.y2}
                    stroke={ladder.accent}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <line
                    x1={geo.railB.x1}
                    y1={geo.railB.y1}
                    x2={geo.railB.x2}
                    y2={geo.railB.y2}
                    stroke={ladder.color}
                    strokeWidth="7.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1={geo.railB.x1}
                    y1={geo.railB.y1}
                    x2={geo.railB.x2}
                    y2={geo.railB.y2}
                    stroke={ladder.accent}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Serpientes opcionales (Bajan) */}
            {snakesEnabled &&
              SNAKES.map((snake) => {
                const s = buildSnakePath(snake.from, snake.to);
                return (
                  <g key={`snake-${snake.from}-${snake.to}`} filter="url(#board-shadow)" opacity="0.9">
                    <path
                      d={s.path}
                      fill="none"
                      stroke={snake.color}
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                    <path
                      d={s.path}
                      fill="none"
                      stroke={snake.accent}
                      strokeWidth="4.8"
                      strokeLinecap="round"
                      strokeDasharray="8 11"
                    />
                    <g transform={`translate(${s.headX}, ${s.headY}) rotate(${s.angleDeg})`}>
                      <path
                        d="M -9 0 L -17 0 M -14 0 L -19 -3.5 M -14 0 L -19 3.5"
                        stroke="#F43F5E"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <ellipse cx="0" cy="0" rx="11" ry="9" fill={snake.color} stroke="#FFFFFF" strokeWidth="1.8" />
                      <circle cx="-2.5" cy="-3.5" r="2.5" fill="#FFFFFF" />
                      <circle cx="-2.5" cy="3.5" r="2.5" fill="#FFFFFF" />
                      <circle cx="-3.3" cy="-3.5" r="1.2" fill="#0F172A" />
                      <circle cx="-3.3" cy="3.5" r="1.2" fill="#0F172A" />
                    </g>
                    <circle cx={s.tailX} cy={s.tailY} r="4.5" fill={snake.color} />
                  </g>
                );
              })}
          </svg>

          {/* Zona de SALIDA (Casilla 0) justo debajo del tablero */}
          <div
            className="absolute left-0 right-0 top-[calc(100%+10px)] h-[12%] rounded-xl bg-slate-800/90 border border-slate-700/80 px-4 flex items-center justify-between shadow-lg"
            aria-label="Zona de Salida, casilla 0"
          >
            <div className="flex items-center gap-2 text-emerald-400">
              <Flag className="w-4 h-4 shrink-0" />
              <span className="font-display font-bold text-xs sm:text-sm tracking-wide uppercase">
                Salida · Casilla 0
              </span>
            </div>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline tabular-nums">
              {players.filter((p) => p.position === 0).length} en espera de avanzar
            </span>
          </div>

          {/* Capa de Fichas de Jugadores con animación fluida */}
          <div className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] pointer-events-none z-20">
            {positionedPlayers.map(({ player, x, y }) => {
              const isRecent = recentMoverId === player.id;
              return (
                <motion.div
                  key={player.id}
                  initial={{ left: `${x}%`, top: `${y}%`, scale: 0.4, opacity: 0 }}
                  animate={{
                    left: `${x}%`,
                    top: `${y}%`,
                    scale: isRecent ? 1.18 : 1,
                    opacity: player.connected ? 1 : 0.65,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 190,
                    damping: 22,
                    mass: 0.8,
                  }}
                  style={{
                    transform: 'translate(-50%, -50%)',
                    zIndex: isRecent ? 40 : player.position === 0 ? 25 : 30,
                  }}
                  className="absolute flex flex-col items-center"
                >
                  <div
                    className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-display font-extrabold text-xs sm:text-sm text-white shadow-lg transition-shadow ${
                      player.connected
                        ? 'ring-2 ring-white'
                        : 'ring-2 ring-dashed ring-slate-300 grayscale'
                    } ${isRecent ? 'ring-4 ring-amber-300' : ''}`}
                    style={{ backgroundColor: player.color }}
                  >
                    {getInitials(player.name)}
                  </div>
                  <span
                    className={`mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold leading-none whitespace-nowrap shadow-sm border ${
                      player.connected
                        ? 'bg-slate-950/90 text-white border-white/15'
                        : 'bg-slate-700/90 text-slate-300 border-slate-500/40'
                    }`}
                  >
                    {player.name}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
