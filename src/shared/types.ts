// Tipos compartidos entre el servidor (fuente de verdad) y los clientes React.

export type GameStatus = 'WAITING' | 'PLAYING' | 'PAUSED' | 'FINISHED';

export interface Question {
  id: string;
  category: string;
  prompt: string;
  answers: string[];
}

export interface ClientQuestion {
  id: string;
  category: string;
  prompt: string;
  number: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  position: number; // 0 = SALIDA, 1..100 = casillas del tablero
  streak: number; // 0..2 (al llegar a 3 activa BONUS y vuelve a 0)
  correctCount: number;
  answeredCount: number;
  connected: boolean;
  joinedAt: number;
  reachedAt: number | null; // Marca de tiempo para desempate en podio
}

export type GameEventType =
  | 'join'
  | 'correct'
  | 'wrong'
  | 'bonus'
  | 'ladder'
  | 'snake'
  | 'winner'
  | 'kick'
  | 'disconnect'
  | 'reconnect'
  | 'system';

export interface GameEvent {
  id: string;
  type: GameEventType;
  message: string;
  playerColor?: string;
  timestamp: number;
}

export interface PublicGameState {
  status: GameStatus;
  snakesEnabled: boolean;
  totalQuestions: number;
  customQuestionsCount: number;
  players: PublicPlayer[];
  events: GameEvent[];
  winner: PublicPlayer | null;
  podium: PublicPlayer[];
}

export interface AnswerResultPayload {
  correct: boolean;
  diceRoll: number | null;
  bonusTriggered: boolean;
  bonusSteps: number;
  previousPosition: number;
  landedPosition: number;
  finalPosition: number;
  boardTransition: 'ladder' | 'snake' | null;
  transitionFrom: number | null;
  transitionTo: number | null;
  correctAnswerExample: string;
  newStreak: number;
  isWinner: boolean;
}

export interface BonusBroadcastPayload {
  playerId: string;
  playerName: string;
  playerColor: string;
  bonusSteps: number;
  finalPosition: number;
}

export interface JoinSuccessPayload {
  player: PublicPlayer;
  gameState: PublicGameState;
  currentQuestion: ClientQuestion | null;
}
