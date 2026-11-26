// Geometría del tablero de 30 casillas (6x5 en zigzag), escaleras, serpientes y paleta de fichas.

export const MAX_SQUARE = 30;
export const BOARD_COLS = 6;
export const BOARD_ROWS = 5;

export interface BoardConnection {
  from: number;
  to: number;
  color: string;
  accent: string;
}

// 4 Escaleras equilibradas que suben (casillas 1..30 sin repetirse)
export const LADDERS: BoardConnection[] = [
  { from: 3, to: 14, color: '#D97706', accent: '#FDE68A' },
  { from: 8, to: 21, color: '#059669', accent: '#A7F3D0' },
  { from: 12, to: 23, color: '#0284C7', accent: '#BAE6FD' },
  { from: 17, to: 28, color: '#B45309', accent: '#FCD34D' },
];

// 4 Serpientes opcionales que bajan (ninguna casilla colisiona con escaleras ni entre sí)
export const SNAKES: BoardConnection[] = [
  { from: 10, to: 4, color: '#E11D48', accent: '#FDA4AF' },
  { from: 16, to: 5, color: '#7C3AED', accent: '#DDD6FE' },
  { from: 22, to: 13, color: '#EA580C', accent: '#FED7AA' },
  { from: 29, to: 19, color: '#DB2777', accent: '#FBCFE8' },
];

// Paleta de 20 colores vibrantes y diferenciables para las fichas de jugadores
export const PLAYER_COLORS: string[] = [
  '#EF4444', // Rojo vivo
  '#3B82F6', // Azul brillante
  '#10B981', // Esmeralda
  '#F59E0B', // Ámbar
  '#8B5CF6', // Violeta
  '#EC4899', // Fucsia
  '#06B6D4', // Cian
  '#F97316', // Naranja
  '#14B8A6', // Turquesa
  '#6366F1', // Índigo
  '#84CC16', // Lima
  '#E11D48', // Carmesí
  '#0EA5E9', // Celeste
  '#D946EF', // Magenta
  '#65A30D', // Verde oliva vivo
  '#EA580C', // Mandarina
  '#2563EB', // Azul cobalto
  '#7C3AED', // Púrpura
  '#059669', // Jade
  '#DC2626', // Escarlata
];

export const DISCONNECTED_COLOR = '#64748B';

/**
 * Convierte un número de casilla (1..30) a fila desde arriba (0..4) y columna desde la izquierda (0..5)
 * siguiendo numeración en zigzag desde la esquina inferior izquierda (casilla 1).
 */
export function getTileRowCol(square: number): { rowFromTop: number; col: number } {
  const clamped = Math.max(1, Math.min(MAX_SQUARE, square));
  const zeroBased = clamped - 1;
  const rowFromBottom = Math.floor(zeroBased / BOARD_COLS);
  const colInRow = zeroBased % BOARD_COLS;
  const col = rowFromBottom % 2 === 0 ? colInRow : BOARD_COLS - 1 - colInRow;
  const rowFromTop = BOARD_ROWS - 1 - rowFromBottom;
  return { rowFromTop, col };
}

/**
 * Devuelve las coordenadas centrales en porcentaje (0..100) sobre el tablero 6x5.
 */
export function getSquareCenterPercent(square: number): { x: number; y: number } {
  if (square <= 0) {
    return { x: 100 / BOARD_COLS / 2, y: 90 };
  }
  const { rowFromTop, col } = getTileRowCol(square);
  const cellW = 100 / BOARD_COLS;
  const cellH = 100 / BOARD_ROWS;
  return {
    x: col * cellW + cellW / 2,
    y: rowFromTop * cellH + cellH / 2,
  };
}

/**
 * Genera el arreglo de 30 casillas en orden visual de renderizado (arriba-izquierda a abajo-derecha).
 * Fila superior (rowFromTop=0): 25, 26, 27, 28, 29, 30
 * Fila inferior (rowFromTop=4): 1, 2, 3, 4, 5, 6
 */
export function getBoardRenderSquares(): number[] {
  const squares: number[] = [];
  for (let rowFromTop = 0; rowFromTop < BOARD_ROWS; rowFromTop++) {
    const rowFromBottom = BOARD_ROWS - 1 - rowFromTop;
    for (let col = 0; col < BOARD_COLS; col++) {
      const colInRow = rowFromBottom % 2 === 0 ? col : BOARD_COLS - 1 - col;
      const squareNumber = rowFromBottom * BOARD_COLS + colInRow + 1;
      squares.push(squareNumber);
    }
  }
  return squares;
}
