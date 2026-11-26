// Motor de partida P2P en memoria del navegador usando PeerJS (WebRTC)
// Permite jugar desde GitHub Pages (sin base de datos ni servidor Node.js externo).

import Peer, { type DataConnection } from 'peerjs';
import { DISCONNECTED_COLOR, LADDERS, MAX_SQUARE, PLAYER_COLORS, SNAKES } from '../shared/board.ts';
import { DEFAULT_QUESTIONS, isAnswerCorrect, parseCustomQuestions } from '../shared/questions.ts';
import type {
  AnswerResultPayload,
  BonusBroadcastPayload,
  ClientQuestion,
  GameEvent,
  GameEventType,
  GameStatus,
  JoinSuccessPayload,
  PublicGameState,
  PublicPlayer,
  Question,
} from '../shared/types.ts';
import { buildPeerHostId, generateRoomCode } from './socketConfig.ts';

const DISCONNECT_GRACE_MS = 2 * 60 * 1000;
const NEXT_QUESTION_DELAY_MS = 2000;

interface P2PPlayer extends PublicPlayer {
  conn: DataConnection | null;
  deck: string[];
  deckCursor: number;
  currentQuestionId: string | null;
  awaitingNextQuestion: boolean;
  nextQuestionTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface IncomingWireMsg {
  type: string;
  reqId?: string;
  payload?: Record<string, unknown>;
}

export interface P2PHostController {
  roomCode: string;
  start: () => void;
  pause: () => void;
  resume: () => void;
  toggleSnakes: (enabled?: boolean) => void;
  setCustomQuestions: (
    rawText: string,
    mode: 'append' | 'replace'
  ) => { ok: boolean; added: number; total: number; invalidLines: number[]; error?: string };
  restoreDefaultQuestions: () => void;
  kick: (playerId: string) => void;
  playAgain: () => void;
  reset: () => void;
  destroy: () => void;
}

interface P2PHostCallbacks {
  onReady: (roomCode: string) => void;
  onStateUpdate: (state: PublicGameState) => void;
  onBonus: (payload: BonusBroadcastPayload) => void;
  onWinner: (payload: { winner: PublicPlayer; podium: PublicPlayer[] }) => void;
  onError: (message: string) => void;
}

export function createP2PHost(callbacks: P2PHostCallbacks): P2PHostController {
  const roomCode = generateRoomCode();
  const hostPeerId = buildPeerHostId(roomCode);

  let gameStatus: GameStatus = 'WAITING';
  let snakesEnabled = true;
  let activeQuestions: Question[] = [...DEFAULT_QUESTIONS];
  let customQuestionsCount = 0;
  const players = new Map<string, P2PPlayer>();
  let events: GameEvent[] = [];
  let winner: PublicPlayer | null = null;
  let podium: PublicPlayer[] = [];
  let destroyed = false;

  const peer = new Peer(hostPeerId, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });

  function shuffleIds(list: Question[]): string[] {
    const ids = list.map((q) => q.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  function toPublicPlayer(p: P2PPlayer): PublicPlayer {
    return {
      id: p.id,
      name: p.name,
      color: p.connected ? p.color : DISCONNECTED_COLOR,
      position: p.position,
      streak: p.streak,
      correctCount: p.correctCount,
      answeredCount: p.answeredCount,
      connected: p.connected,
      joinedAt: p.joinedAt,
      reachedAt: p.reachedAt,
    };
  }

  function getSortedPlayers(): PublicPlayer[] {
    return Array.from(players.values())
      .map(toPublicPlayer)
      .sort((a, b) => {
        if (b.position !== a.position) return b.position - a.position;
        if (a.reachedAt !== null && b.reachedAt !== null) return a.reachedAt - b.reachedAt;
        if (a.reachedAt !== null) return -1;
        if (b.reachedAt !== null) return 1;
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        return a.joinedAt - b.joinedAt;
      });
  }

  function getPublicState(): PublicGameState {
    return {
      status: gameStatus,
      snakesEnabled,
      totalQuestions: activeQuestions.length,
      customQuestionsCount,
      players: getSortedPlayers(),
      events: events.slice(0, 20),
      winner,
      podium,
    };
  }

  function pushEvent(type: GameEventType, message: string, playerColor?: string): void {
    const evt: GameEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      message,
      playerColor,
      timestamp: Date.now(),
    };
    events = [evt, ...events].slice(0, 30);
  }

  function sendToConn(conn: DataConnection | null, type: string, payload?: unknown, reqId?: string): void {
    if (!conn || !conn.open) return;
    try {
      conn.send({ type, payload, reqId });
    } catch {
      // Ignorar canales cerrados
    }
  }

  function broadcastAll(type: string, payload?: unknown): void {
    for (const p of players.values()) {
      sendToConn(p.conn, type, payload);
    }
  }

  function broadcastState(): void {
    const state = getPublicState();
    callbacks.onStateUpdate(state);
    broadcastAll('state_update', state);
  }

  function pickDistinctColor(): string {
    const usage = new Map<string, number>();
    PLAYER_COLORS.forEach((c) => usage.set(c, 0));
    for (const p of players.values()) {
      usage.set(p.color, (usage.get(p.color) ?? 0) + 1);
    }
    let chosen = PLAYER_COLORS[0];
    let minCount = Infinity;
    for (const c of PLAYER_COLORS) {
      const count = usage.get(c) ?? 0;
      if (count < minCount) {
        minCount = count;
        chosen = c;
      }
    }
    return chosen;
  }

  function getClientQuestionForPlayer(player: P2PPlayer): ClientQuestion | null {
    if (!player.currentQuestionId) return null;
    const q = activeQuestions.find((item) => item.id === player.currentQuestionId);
    if (!q) return null;
    return {
      id: q.id,
      category: q.category,
      prompt: q.prompt,
      number: player.answeredCount + 1,
    };
  }

  function dealNextQuestion(player: P2PPlayer): ClientQuestion | null {
    if (activeQuestions.length === 0) return null;
    if (player.deck.length === 0 || player.deckCursor >= player.deck.length) {
      player.deck = shuffleIds(activeQuestions);
      player.deckCursor = 0;
    }
    const nextId = player.deck[player.deckCursor];
    player.deckCursor += 1;
    player.currentQuestionId = nextId;
    player.awaitingNextQuestion = false;
    return getClientQuestionForPlayer(player);
  }

  function clearPlayerTimers(player: P2PPlayer): void {
    if (player.nextQuestionTimer) {
      clearTimeout(player.nextQuestionTimer);
      player.nextQuestionTimer = null;
    }
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
  }

  function normalizeNameCheck(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function findPlayerByConn(conn: DataConnection): P2PPlayer | undefined {
    for (const p of players.values()) {
      if (p.conn === conn) return p;
    }
    return undefined;
  }

  function handlePlayerMessage(conn: DataConnection, raw: unknown): void {
    if (destroyed || typeof raw !== 'object' || raw === null) return;
    const msg = raw as IncomingWireMsg;

    if (msg.type === 'join') {
      const rawName = typeof msg.payload?.name === 'string' ? msg.payload.name.trim() : '';
      const cleanName = rawName.replace(/\s+/g, ' ');

      if (!cleanName) {
        sendToConn(conn, 'ack', { ok: false, error: 'Ingresa tu nombre para poder entrar.' }, msg.reqId);
        return;
      }
      if (cleanName.length > 15) {
        sendToConn(conn, 'ack', { ok: false, error: 'El nombre debe tener máximo 15 caracteres.' }, msg.reqId);
        return;
      }

      const normalizedNew = normalizeNameCheck(cleanName);
      for (const existing of players.values()) {
        if (normalizeNameCheck(existing.name) === normalizedNew) {
          sendToConn(conn, 'ack', { ok: false, error: 'Ese nombre ya está en uso. Elige otro.' }, msg.reqId);
          return;
        }
      }

      const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const color = pickDistinctColor();
      const newPlayer: P2PPlayer = {
        id,
        conn,
        name: cleanName,
        color,
        position: 0,
        streak: 0,
        correctCount: 0,
        answeredCount: 0,
        connected: true,
        joinedAt: Date.now(),
        reachedAt: null,
        deck: shuffleIds(activeQuestions),
        deckCursor: 0,
        currentQuestionId: null,
        awaitingNextQuestion: false,
        nextQuestionTimer: null,
        disconnectTimer: null,
      };

      let initialQuestion: ClientQuestion | null = null;
      if (gameStatus === 'PLAYING' || gameStatus === 'PAUSED') {
        initialQuestion = dealNextQuestion(newPlayer);
      }

      players.set(id, newPlayer);
      pushEvent('join', `${newPlayer.name} se unió al juego`, newPlayer.color);

      const joinPayload: JoinSuccessPayload = {
        player: toPublicPlayer(newPlayer),
        gameState: getPublicState(),
        currentQuestion: initialQuestion,
      };
      sendToConn(conn, 'ack', { ok: true, data: joinPayload }, msg.reqId);
      broadcastState();
      return;
    }

    if (msg.type === 'reconnect_player') {
      const playerId = typeof msg.payload?.playerId === 'string' ? msg.payload.playerId : '';
      const player = players.get(playerId);
      if (!player) {
        sendToConn(conn, 'ack', { ok: false }, msg.reqId);
        return;
      }

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = null;
      }

      player.conn = conn;
      player.connected = true;
      if ((gameStatus === 'PLAYING' || gameStatus === 'PAUSED') && !player.currentQuestionId) {
        dealNextQuestion(player);
      }

      pushEvent('reconnect', `${player.name} volvió a conectarse`, player.color);
      const joinPayload: JoinSuccessPayload = {
        player: toPublicPlayer(player),
        gameState: getPublicState(),
        currentQuestion: getClientQuestionForPlayer(player),
      };
      sendToConn(conn, 'ack', { ok: true, data: joinPayload }, msg.reqId);
      broadcastState();
      return;
    }

    if (msg.type === 'answer') {
      if (gameStatus !== 'PLAYING') {
        sendToConn(conn, 'ack', { ok: false, error: 'El juego no está activo en este momento.' }, msg.reqId);
        return;
      }

      const player = findPlayerByConn(conn);
      if (!player || !player.connected) {
        sendToConn(conn, 'ack', { ok: false, error: 'Jugador no encontrado.' }, msg.reqId);
        return;
      }

      if (player.awaitingNextQuestion || !player.currentQuestionId) {
        sendToConn(conn, 'ack', { ok: false, error: 'Espera a la siguiente pregunta.' }, msg.reqId);
        return;
      }

      const question = activeQuestions.find((q) => q.id === player.currentQuestionId);
      if (!question) {
        sendToConn(conn, 'ack', { ok: false, error: 'Pregunta no disponible.' }, msg.reqId);
        return;
      }

      const answerText = typeof msg.payload?.answerText === 'string' ? msg.payload.answerText : '';
      if (!answerText.trim()) {
        sendToConn(conn, 'ack', { ok: false, error: 'Escribe una respuesta antes de enviar.' }, msg.reqId);
        return;
      }

      player.awaitingNextQuestion = true;
      player.answeredCount += 1;
      const correct = isAnswerCorrect(answerText, question.answers);
      const previousPosition = player.position;
      let resultPayload: AnswerResultPayload;

      if (correct) {
        player.correctCount += 1;
        player.streak += 1;

        const diceRoll = Math.floor(Math.random() * 6) + 1;
        let bonusTriggered = false;
        let bonusSteps = 0;

        if (player.streak >= 3) {
          bonusTriggered = true;
          bonusSteps = 3;
          player.streak = 0;
        }

        const totalAdvance = diceRoll + bonusSteps;
        const landedPosition = Math.min(MAX_SQUARE, previousPosition + totalAdvance);
        let finalPosition = landedPosition;
        let boardTransition: 'ladder' | 'snake' | null = null;
        let transitionFrom: number | null = null;
        let transitionTo: number | null = null;

        if (landedPosition < MAX_SQUARE) {
          const ladder = LADDERS.find((l) => l.from === landedPosition);
          if (ladder) {
            boardTransition = 'ladder';
            transitionFrom = ladder.from;
            transitionTo = ladder.to;
            finalPosition = ladder.to;
          } else if (snakesEnabled) {
            const snake = SNAKES.find((s) => s.from === landedPosition);
            if (snake) {
              boardTransition = 'snake';
              transitionFrom = snake.from;
              transitionTo = snake.to;
              finalPosition = snake.to;
            }
          }
        }

        player.position = finalPosition;

        pushEvent(
          'correct',
          `${player.name} respondió bien y avanzó ${diceRoll} ${diceRoll === 1 ? 'casilla' : 'casillas'}`,
          player.color
        );

        if (bonusTriggered) {
          pushEvent('bonus', `${player.name} activó el BONUS y avanzó 3 más`, player.color);
          const bonusPayload: BonusBroadcastPayload = {
            playerId: player.id,
            playerName: player.name,
            playerColor: player.color,
            bonusSteps: 3,
            finalPosition,
          };
          callbacks.onBonus(bonusPayload);
          broadcastAll('bonus', bonusPayload);
        }

        if (boardTransition === 'ladder' && transitionFrom !== null && transitionTo !== null) {
          pushEvent('ladder', `${player.name} subió por una escalera (${transitionFrom} → ${transitionTo})`, player.color);
        } else if (boardTransition === 'snake' && transitionFrom !== null && transitionTo !== null) {
          pushEvent('snake', `${player.name} bajó por una serpiente (${transitionFrom} → ${transitionTo})`, player.color);
        }

        const isWinner = finalPosition >= MAX_SQUARE;
        if (isWinner) {
          player.position = MAX_SQUARE;
          player.reachedAt = Date.now();
          gameStatus = 'FINISHED';

          for (const p of players.values()) {
            if (p.nextQuestionTimer) {
              clearTimeout(p.nextQuestionTimer);
              p.nextQuestionTimer = null;
            }
          }

          const ranked = getSortedPlayers();
          winner = toPublicPlayer(player);
          podium = ranked.slice(0, 3);
          pushEvent('winner', `¡${player.name} llegó a la casilla ${MAX_SQUARE} y ganó el juego!`, player.color);
        }

        resultPayload = {
          correct: true,
          diceRoll,
          bonusTriggered,
          bonusSteps,
          previousPosition,
          landedPosition,
          finalPosition: player.position,
          boardTransition,
          transitionFrom,
          transitionTo,
          correctAnswerExample: question.answers[0],
          newStreak: player.streak,
          isWinner,
        };
      } else {
        player.streak = 0;
        pushEvent('wrong', `${player.name} falló y se quedó en la casilla ${player.position}`, player.color);

        resultPayload = {
          correct: false,
          diceRoll: null,
          bonusTriggered: false,
          bonusSteps: 0,
          previousPosition,
          landedPosition: previousPosition,
          finalPosition: previousPosition,
          boardTransition: null,
          transitionFrom: null,
          transitionTo: null,
          correctAnswerExample: question.answers[0],
          newStreak: 0,
          isWinner: false,
        };
      }

      sendToConn(conn, 'ack', { ok: true }, msg.reqId);
      sendToConn(conn, 'answer_result', resultPayload);
      broadcastState();

      if (gameStatus === 'FINISHED' && winner) {
        const winPayload = { winner, podium };
        callbacks.onWinner(winPayload);
        broadcastAll('winner', winPayload);
        return;
      }

      player.nextQuestionTimer = setTimeout(() => {
        player.nextQuestionTimer = null;
        if (gameStatus === 'PLAYING') {
          const nextQ = dealNextQuestion(player);
          if (player.connected && nextQ) {
            sendToConn(player.conn, 'question', nextQ);
          }
        }
      }, NEXT_QUESTION_DELAY_MS);
    }
  }

  peer.on('open', () => {
    if (destroyed) return;
    callbacks.onReady(roomCode);
    callbacks.onStateUpdate(getPublicState());
  });

  peer.on('connection', (conn) => {
    if (destroyed) {
      conn.close();
      return;
    }

    conn.on('data', (data) => {
      handlePlayerMessage(conn, data);
    });

    conn.on('close', () => {
      const player = findPlayerByConn(conn);
      if (!player) return;
      player.connected = false;
      player.conn = null;
      pushEvent('disconnect', `${player.name} se desconectó`, DISCONNECTED_COLOR);
      broadcastState();

      player.disconnectTimer = setTimeout(() => {
        const current = players.get(player.id);
        if (current && !current.connected) {
          clearPlayerTimers(current);
          players.delete(player.id);
          pushEvent('system', `${current.name} fue eliminado tras 2 min desconectado.`);
          broadcastState();
        }
      }, DISCONNECT_GRACE_MS);
    });
  });

  peer.on('error', (err) => {
    if (destroyed) return;
    callbacks.onError(err.message || 'Error en conexión P2P');
  });

  return {
    roomCode,
    start() {
      if (gameStatus !== 'WAITING') return;
      gameStatus = 'PLAYING';
      winner = null;
      podium = [];

      for (const player of players.values()) {
        player.deck = shuffleIds(activeQuestions);
        player.deckCursor = 0;
        const q = dealNextQuestion(player);
        if (player.connected && q) {
          sendToConn(player.conn, 'question', q);
        }
      }

      pushEvent('system', '¡El juego ha comenzado!');
      broadcastState();
    },
    pause() {
      if (gameStatus !== 'PLAYING') return;
      gameStatus = 'PAUSED';
      pushEvent('system', 'El juego está en pausa.');
      broadcastState();
    },
    resume() {
      if (gameStatus !== 'PAUSED') return;
      gameStatus = 'PLAYING';

      for (const player of players.values()) {
        if (!player.currentQuestionId || (player.awaitingNextQuestion && !player.nextQuestionTimer)) {
          const q = dealNextQuestion(player);
          if (player.connected && q) {
            sendToConn(player.conn, 'question', q);
          }
        }
      }

      pushEvent('system', 'El juego se ha reanudado.');
      broadcastState();
    },
    toggleSnakes(enabled?: boolean) {
      if (gameStatus !== 'WAITING') return;
      snakesEnabled = typeof enabled === 'boolean' ? enabled : !snakesEnabled;
      pushEvent(
        'system',
        snakesEnabled
          ? 'Serpientes activadas en el tablero.'
          : 'Modo solo escaleras activado (sin serpientes).'
      );
      broadcastState();
    },
    setCustomQuestions(rawText: string, mode: 'append' | 'replace') {
      if (gameStatus !== 'WAITING') {
        return {
          ok: false,
          added: 0,
          total: activeQuestions.length,
          invalidLines: [],
          error: 'Solo puedes modificar preguntas antes de iniciar el juego.',
        };
      }

      const { questions: parsed, invalidLines } = parseCustomQuestions(rawText);
      if (parsed.length === 0) {
        return {
          ok: false,
          added: 0,
          total: activeQuestions.length,
          invalidLines,
          error: 'No se encontraron preguntas válidas. Usa: pregunta | respuesta1 ; respuesta2',
        };
      }

      if (mode === 'replace') {
        activeQuestions = parsed;
        customQuestionsCount = parsed.length;
      } else {
        activeQuestions = [...activeQuestions, ...parsed];
        customQuestionsCount += parsed.length;
      }

      pushEvent(
        'system',
        mode === 'replace'
          ? `Se cargaron ${parsed.length} preguntas personalizadas.`
          : `Se agregaron ${parsed.length} preguntas personalizadas (total: ${activeQuestions.length}).`
      );
      broadcastState();
      return { ok: true, added: parsed.length, total: activeQuestions.length, invalidLines };
    },
    restoreDefaultQuestions() {
      if (gameStatus !== 'WAITING') return;
      activeQuestions = [...DEFAULT_QUESTIONS];
      customQuestionsCount = 0;
      pushEvent('system', 'Banco restaurado a las 30 preguntas iniciales.');
      broadcastState();
    },
    kick(playerId: string) {
      const target = players.get(playerId);
      if (!target) return;
      clearPlayerTimers(target);
      sendToConn(target.conn, 'kicked');
      players.delete(playerId);
      pushEvent('kick', `${target.name} fue expulsado de la partida.`);
      broadcastState();
    },
    playAgain() {
      for (const player of players.values()) {
        clearPlayerTimers(player);
        if (!player.connected) {
          players.delete(player.id);
          continue;
        }
        player.position = 0;
        player.streak = 0;
        player.correctCount = 0;
        player.answeredCount = 0;
        player.reachedAt = null;
        player.deck = shuffleIds(activeQuestions);
        player.deckCursor = 0;
        player.currentQuestionId = null;
        player.awaitingNextQuestion = false;
      }

      gameStatus = 'WAITING';
      events = [];
      winner = null;
      podium = [];
      pushEvent('system', 'Nueva ronda lista. Esperando al anfitrión para iniciar.');
      broadcastAll('play_again');
      broadcastState();
    },
    reset() {
      broadcastAll('reset');
      for (const player of players.values()) {
        clearPlayerTimers(player);
      }
      players.clear();
      gameStatus = 'WAITING';
      events = [];
      winner = null;
      podium = [];
      activeQuestions = [...DEFAULT_QUESTIONS];
      customQuestionsCount = 0;
      snakesEnabled = true;
      broadcastState();
    },
    destroy() {
      destroyed = true;
      for (const player of players.values()) {
        clearPlayerTimers(player);
        player.conn?.close();
      }
      players.clear();
      peer.destroy();
    },
  };
}
