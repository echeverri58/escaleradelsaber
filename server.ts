import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import { DISCONNECTED_COLOR, LADDERS, MAX_SQUARE, PLAYER_COLORS, SNAKES } from './src/shared/board.ts';
import { DEFAULT_QUESTIONS, isAnswerCorrect, parseCustomQuestions } from './src/shared/questions.ts';
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
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DISCONNECT_GRACE_MS = 2 * 60 * 1000; // 2 minutos antes de eliminar al jugador desconectado
const NEXT_QUESTION_DELAY_MS = 2000; // 2 segundos tras responder

interface ServerPlayer extends PublicPlayer {
  socketId: string;
  deck: string[];
  deckCursor: number;
  currentQuestionId: string | null;
  awaitingNextQuestion: boolean;
  nextQuestionTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

// ============================================================================
// Estado en memoria del servidor (única fuente de verdad, sin BD ni archivos)
// ============================================================================
let gameStatus: GameStatus = 'WAITING';
let snakesEnabled = true;
let activeQuestions: Question[] = [...DEFAULT_QUESTIONS];
let customQuestionsCount = 0;
const players = new Map<string, ServerPlayer>();
let events: GameEvent[] = [];
let winner: PublicPlayer | null = null;
let podium: PublicPlayer[] = [];

function shuffleIds(list: Question[]): string[] {
  const ids = list.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function toPublicPlayer(p: ServerPlayer): PublicPlayer {
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

function getClientQuestionForPlayer(player: ServerPlayer): ClientQuestion | null {
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

function dealNextQuestion(player: ServerPlayer): ClientQuestion | null {
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

function clearPlayerTimers(player: ServerPlayer): void {
  if (player.nextQuestionTimer) {
    clearTimeout(player.nextQuestionTimer);
    player.nextQuestionTimer = null;
  }
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function resetEverything(keepDefaultBank = true): void {
  for (const player of players.values()) {
    clearPlayerTimers(player);
  }
  players.clear();
  gameStatus = 'WAITING';
  events = [];
  winner = null;
  podium = [];
  if (keepDefaultBank) {
    activeQuestions = [...DEFAULT_QUESTIONS];
    customQuestionsCount = 0;
    snakesEnabled = true;
  }
}

function findPlayerBySocket(socketId: string): ServerPlayer | undefined {
  for (const p of players.values()) {
    if (p.socketId === socketId) return p;
  }
  return undefined;
}

function normalizeNameCheck(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ============================================================================
// Configuración de Express, HTTP y Socket.io
// ============================================================================
async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  function broadcastState(): void {
    io.emit('state_update', getPublicState());
  }

  io.on('connection', (socket) => {
    // El cliente solicita el estado actual al conectar
    socket.on('request_state', () => {
      socket.emit('state_update', getPublicState());
    });

    // Al abrir o recargar la pantalla de proyección, todo se borra y empieza desde cero
    socket.on('host_init', () => {
      socket.join('hosts');
      resetEverything(true);
      io.emit('reset');
      broadcastState();
    });

    // Un jugador nuevo ingresa con su nombre
    socket.on(
      'join',
      (
        payload: { name?: string },
        ack?: (res: { ok: boolean; error?: string; data?: JoinSuccessPayload }) => void
      ) => {
        const rawName = typeof payload?.name === 'string' ? payload.name.trim() : '';
        const cleanName = rawName.replace(/\s+/g, ' ');

        if (!cleanName) {
          ack?.({ ok: false, error: 'Ingresa tu nombre para poder entrar.' });
          return;
        }

        if (cleanName.length > 15) {
          ack?.({ ok: false, error: 'El nombre debe tener máximo 15 caracteres.' });
          return;
        }

        const normalizedNew = normalizeNameCheck(cleanName);
        for (const existing of players.values()) {
          if (normalizeNameCheck(existing.name) === normalizedNew) {
            ack?.({ ok: false, error: 'Ese nombre ya está en uso. Elige otro.' });
            return;
          }
        }

        const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const color = pickDistinctColor();
        const newPlayer: ServerPlayer = {
          id,
          socketId: socket.id,
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

        // Si el juego ya está en curso o en pausa, recibe pregunta para entrar directo desde SALIDA
        let initialQuestion: ClientQuestion | null = null;
        if (gameStatus === 'PLAYING' || gameStatus === 'PAUSED') {
          initialQuestion = dealNextQuestion(newPlayer);
        }

        players.set(id, newPlayer);
        pushEvent('join', `${newPlayer.name} se unió al juego`, newPlayer.color);
        broadcastState();

        ack?.({
          ok: true,
          data: {
            player: toPublicPlayer(newPlayer),
            gameState: getPublicState(),
            currentQuestion: initialQuestion,
          },
        });
      }
    );

    // Reconexión automática ante microcortes de red sin recargar página
    socket.on(
      'reconnect_player',
      (
        payload: { playerId?: string },
        ack?: (res: { ok: boolean; data?: JoinSuccessPayload }) => void
      ) => {
        const playerId = payload?.playerId;
        if (!playerId) {
          ack?.({ ok: false });
          return;
        }

        const player = players.get(playerId);
        if (!player) {
          ack?.({ ok: false });
          return;
        }

        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = null;
        }

        player.socketId = socket.id;
        player.connected = true;

        if ((gameStatus === 'PLAYING' || gameStatus === 'PAUSED') && !player.currentQuestionId) {
          dealNextQuestion(player);
        }

        pushEvent('reconnect', `${player.name} volvió a conectarse`, player.color);
        broadcastState();

        ack?.({
          ok: true,
          data: {
            player: toPublicPlayer(player),
            gameState: getPublicState(),
            currentQuestion: getClientQuestionForPlayer(player),
          },
        });
      }
    );

    // Iniciar partida (Anfitrión)
    socket.on('start', () => {
      if (gameStatus !== 'WAITING') return;
      gameStatus = 'PLAYING';
      winner = null;
      podium = [];

      for (const player of players.values()) {
        player.deck = shuffleIds(activeQuestions);
        player.deckCursor = 0;
        const q = dealNextQuestion(player);
        if (player.connected && q) {
          io.to(player.socketId).emit('question', q);
        }
      }

      pushEvent('system', '¡El juego ha comenzado!');
      broadcastState();
    });

    // Pausar partida (Anfitrión)
    socket.on('pause', () => {
      if (gameStatus !== 'PLAYING') return;
      gameStatus = 'PAUSED';
      pushEvent('system', 'El juego está en pausa.');
      broadcastState();
    });

    // Reanudar partida (Anfitrión)
    socket.on('resume', () => {
      if (gameStatus !== 'PAUSED') return;
      gameStatus = 'PLAYING';

      // Asegurar que ningún jugador quede sin pregunta tras una pausa
      for (const player of players.values()) {
        if (!player.currentQuestionId || (player.awaitingNextQuestion && !player.nextQuestionTimer)) {
          const q = dealNextQuestion(player);
          if (player.connected && q) {
            io.to(player.socketId).emit('question', q);
          }
        }
      }

      pushEvent('system', 'El juego se ha reanudado.');
      broadcastState();
    });

    // Activar o desactivar serpientes (antes de iniciar)
    socket.on('toggle_snakes', (payload?: { enabled?: boolean }) => {
      if (gameStatus !== 'WAITING') return;
      snakesEnabled = typeof payload?.enabled === 'boolean' ? payload.enabled : !snakesEnabled;
      pushEvent(
        'system',
        snakesEnabled
          ? 'Serpientes activadas en el tablero.'
          : 'Modo solo escaleras activado (sin serpientes).'
      );
      broadcastState();
    });

    // Cargar preguntas personalizadas en formato "pregunta | respuesta1 ; respuesta2"
    socket.on(
      'custom_questions',
      (
        payload: { rawText?: string; mode?: 'replace' | 'append' },
        ack?: (res: { ok: boolean; added: number; total: number; invalidLines: number[]; error?: string }) => void
      ) => {
        if (gameStatus !== 'WAITING') {
          ack?.({
            ok: false,
            added: 0,
            total: activeQuestions.length,
            invalidLines: [],
            error: 'Solo puedes modificar preguntas antes de iniciar el juego.',
          });
          return;
        }

        const rawText = typeof payload?.rawText === 'string' ? payload.rawText : '';
        const mode = payload?.mode === 'replace' ? 'replace' : 'append';
        const { questions: parsed, invalidLines } = parseCustomQuestions(rawText);

        if (parsed.length === 0) {
          ack?.({
            ok: false,
            added: 0,
            total: activeQuestions.length,
            invalidLines,
            error: 'No se encontraron preguntas válidas. Usa: pregunta | respuesta1 ; respuesta2',
          });
          return;
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

        ack?.({
          ok: true,
          added: parsed.length,
          total: activeQuestions.length,
          invalidLines,
        });
      }
    );

    // Restaurar banco inicial de 30 preguntas
    socket.on('restore_default_questions', () => {
      if (gameStatus !== 'WAITING') return;
      activeQuestions = [...DEFAULT_QUESTIONS];
      customQuestionsCount = 0;
      pushEvent('system', 'Banco restaurado a las 30 preguntas iniciales.');
      broadcastState();
    });

    // Expulsar a un jugador (Anfitrión)
    socket.on('kick', (payload: { playerId?: string }) => {
      const playerId = payload?.playerId;
      if (!playerId) return;
      const target = players.get(playerId);
      if (!target) return;

      clearPlayerTimers(target);
      players.delete(playerId);

      io.to(target.socketId).emit('kicked');
      pushEvent('kick', `${target.name} fue expulsado de la partida.`);
      broadcastState();
    });

    // Jugar de nuevo manteniendo jugadores conectados
    socket.on('play_again', () => {
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
      io.emit('play_again');
      broadcastState();
    });

    // Reiniciar todo (borra jugadores, progreso y restaura todo desde cero)
    socket.on('reset', () => {
      resetEverything(true);
      io.emit('reset');
      broadcastState();
    });

    // Jugador envía una respuesta de texto abierto
    socket.on(
      'answer',
      (
        payload: { answerText?: string },
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        if (gameStatus !== 'PLAYING') {
          ack?.({ ok: false, error: 'El juego no está activo en este momento.' });
          return;
        }

        const player = findPlayerBySocket(socket.id);
        if (!player || !player.connected) {
          ack?.({ ok: false, error: 'Jugador no encontrado.' });
          return;
        }

        if (player.awaitingNextQuestion || !player.currentQuestionId) {
          ack?.({ ok: false, error: 'Espera a la siguiente pregunta.' });
          return;
        }

        const question = activeQuestions.find((q) => q.id === player.currentQuestionId);
        if (!question) {
          ack?.({ ok: false, error: 'Pregunta no disponible.' });
          return;
        }

        const answerText = typeof payload?.answerText === 'string' ? payload.answerText : '';
        if (!answerText.trim()) {
          ack?.({ ok: false, error: 'Escribe una respuesta antes de enviar.' });
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
            player.streak = 0; // La racha vuelve a 0 después del bonus
          }

          const totalAdvance = diceRoll + bonusSteps;
          const landedPosition = Math.min(MAX_SQUARE, previousPosition + totalAdvance);
          let finalPosition = landedPosition;
          let boardTransition: 'ladder' | 'snake' | null = null;
          let transitionFrom: number | null = null;
          let transitionTo: number | null = null;

          // Verificar escaleras o serpientes solo si aún no llega a la meta (30)
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
            pushEvent(
              'bonus',
              `${player.name} activó el BONUS y avanzó 3 más`,
              player.color
            );
            const bonusPayload: BonusBroadcastPayload = {
              playerId: player.id,
              playerName: player.name,
              playerColor: player.color,
              bonusSteps: 3,
              finalPosition,
            };
            io.emit('bonus', bonusPayload);
          }

          if (boardTransition === 'ladder' && transitionFrom !== null && transitionTo !== null) {
            pushEvent(
              'ladder',
              `${player.name} subió por una escalera (${transitionFrom} → ${transitionTo})`,
              player.color
            );
          } else if (boardTransition === 'snake' && transitionFrom !== null && transitionTo !== null) {
            pushEvent(
              'snake',
              `${player.name} bajó por una serpiente (${transitionFrom} → ${transitionTo})`,
              player.color
            );
          }

          const isWinner = finalPosition >= MAX_SQUARE;
          if (isWinner) {
            player.position = MAX_SQUARE;
            player.reachedAt = Date.now();
            gameStatus = 'FINISHED';

            // Detener temporizadores de siguientes preguntas para todos
            for (const p of players.values()) {
              if (p.nextQuestionTimer) {
                clearTimeout(p.nextQuestionTimer);
                p.nextQuestionTimer = null;
              }
            }

            const ranked = getSortedPlayers();
            winner = toPublicPlayer(player);
            podium = ranked.slice(0, 3);

            pushEvent(
              'winner',
              `¡${player.name} llegó a la casilla ${MAX_SQUARE} y ganó el juego!`,
              player.color
            );
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

        ack?.({ ok: true });
        socket.emit('answer_result', resultPayload);
        broadcastState();

        if (gameStatus === 'FINISHED' && winner) {
          io.emit('winner', { winner, podium });
          return;
        }

        // Enviar la siguiente pregunta después de 2 segundos
        player.nextQuestionTimer = setTimeout(() => {
          player.nextQuestionTimer = null;
          if (gameStatus === 'PLAYING') {
            const nextQ = dealNextQuestion(player);
            if (player.connected && nextQ) {
              io.to(player.socketId).emit('question', nextQ);
            }
          }
        }, NEXT_QUESTION_DELAY_MS);
      }
    );

    // Manejo de desconexión con ventana de 2 minutos antes de eliminar
    socket.on('disconnect', () => {
      const player = findPlayerBySocket(socket.id);
      if (!player) return;

      player.connected = false;
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

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Montar Vite en desarrollo o archivos estáticos en producción
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de Escalera en Vivo escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
