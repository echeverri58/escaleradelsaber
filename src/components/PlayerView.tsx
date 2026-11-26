import confetti from 'canvas-confetti';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  PauseCircle,
  Send,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { MAX_SQUARE } from '../shared/board.ts';
import type {
  AnswerResultPayload,
  ClientQuestion,
  JoinSuccessPayload,
  PublicGameState,
  PublicPlayer,
} from '../shared/types.ts';
import { soundManager } from '../utils/sound.ts';

function DiceFace({ value }: { value: number }) {
  // Posiciones de puntos en una cuadrícula 3x3 para caras 1..6
  const pipMap: Record<number, number[]> = {
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const active = pipMap[value] ?? [4];

  return (
    <div
      className="w-16 h-16 rounded-2xl bg-white border-2 border-emerald-200 shadow-lg p-2.5 grid grid-cols-3 grid-rows-3 gap-1 animate-dice-tumble shrink-0"
      aria-label={`Dado: ${value}`}
    >
      {Array.from({ length: 9 }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-center">
          {active.includes(idx) && (
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
          )}
        </div>
      ))}
    </div>
  );
}

export function PlayerView() {
  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [me, setMe] = useState<PublicPlayer | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<ClientQuestion | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerResultPayload | null>(null);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Si hubo microcorte de red sin recargar la página, recuperar sesión en memoria
      if (playerIdRef.current) {
        socket.emit(
          'reconnect_player',
          { playerId: playerIdRef.current },
          (res: { ok: boolean; data?: JoinSuccessPayload }) => {
            if (res.ok && res.data) {
              setMe(res.data.player);
              setGameState(res.data.gameState);
              if (res.data.currentQuestion) {
                setCurrentQuestion(res.data.currentQuestion);
              }
            } else {
              playerIdRef.current = null;
              setMe(null);
            }
          }
        );
      }
    });

    socket.on('state_update', (nextState: PublicGameState) => {
      setGameState(nextState);
      if (playerIdRef.current) {
        const updatedMe = nextState.players.find((p) => p.id === playerIdRef.current);
        if (updatedMe) {
          setMe(updatedMe);
        }
      }
    });

    socket.on('question', (q: ClientQuestion) => {
      setFeedback(null);
      setAnswerText('');
      setSubmitError(null);
      setSubmitting(false);
      setCurrentQuestion(q);
      setTimeout(() => inputRef.current?.focus(), 60);
    });

    socket.on('answer_result', (res: AnswerResultPayload) => {
      setSubmitting(false);
      setFeedback(res);

      if (res.correct) {
        if (res.bonusTriggered) soundManager.playBonus();
        else if (res.boardTransition === 'ladder') soundManager.playLadder();
        else if (res.boardTransition === 'snake') soundManager.playSnake();
        else soundManager.playCorrect();
      } else {
        soundManager.playWrong();
      }
    });

    socket.on('winner', (payload: { winner: PublicPlayer }) => {
      if (payload.winner.id === playerIdRef.current) {
        soundManager.playVictory();
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      }
    });

    socket.on('play_again', () => {
      setFeedback(null);
      setCurrentQuestion(null);
      setAnswerText('');
      setSubmitError(null);
    });

    socket.on('kicked', () => {
      playerIdRef.current = null;
      setMe(null);
      setCurrentQuestion(null);
      setFeedback(null);
      setNoticeBanner('Fuiste expulsado de la partida por el anfitrión.');
    });

    socket.on('reset', () => {
      playerIdRef.current = null;
      setMe(null);
      setCurrentQuestion(null);
      setFeedback(null);
      setAnswerText('');
      setNoticeBanner('El anfitrión reinició el juego. Ingresa tu nombre para volver a jugar.');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundManager.setMuted(next);
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setJoinError('Escribe tu nombre para continuar.');
      return;
    }
    if (trimmed.length > 15) {
      setJoinError('Máximo 15 caracteres.');
      return;
    }

    setJoining(true);
    setJoinError(null);
    setNoticeBanner(null);

    socketRef.current?.emit(
      'join',
      { name: trimmed },
      (res: { ok: boolean; error?: string; data?: JoinSuccessPayload }) => {
        setJoining(false);
        if (!res.ok || !res.data) {
          setJoinError(res.error ?? 'No se pudo entrar al juego.');
          return;
        }
        playerIdRef.current = res.data.player.id;
        setMe(res.data.player);
        setGameState(res.data.gameState);
        setCurrentQuestion(res.data.currentQuestion);
      }
    );
  };

  const handleSubmitAnswer = (e: FormEvent) => {
    e.preventDefault();
    if (!answerText.trim() || submitting || feedback) return;

    setSubmitting(true);
    setSubmitError(null);
    socketRef.current?.emit(
      'answer',
      { answerText },
      (res: { ok: boolean; error?: string }) => {
        if (!res.ok) {
          setSubmitting(false);
          setSubmitError(res.error ?? 'Error al enviar respuesta.');
        }
      }
    );
  };

  // 1. Pantalla de ingreso de nombre
  if (!me) {
    return (
      <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col justify-between p-5">
        <header className="flex items-center justify-between max-w-md w-full mx-auto">
          <div>
            <span className="block font-display text-xl font-extrabold tracking-tight text-slate-900 leading-none">
              LA ESCALERA DEL SABER
            </span>
            <span className="block text-xs text-slate-500 font-medium mt-1">
              Creado por John Alexander Echeverry O.
            </span>
          </div>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </header>

        <main className="max-w-md w-full mx-auto my-auto py-8">
          {noticeBanner && (
            <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
              {noticeBanner}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h1 className="font-display text-3xl font-extrabold text-slate-900 leading-tight">
              Únete al tablero
            </h1>
            <p className="text-slate-600 text-sm mt-2">
              Ingresa tu nombre para aparecer en la casilla de Salida de la pantalla principal.
            </p>

            <form onSubmit={handleJoin} className="mt-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="player-name" className="text-sm font-semibold text-slate-700">
                    Tu nombre
                  </label>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {nameInput.trim().length}/15
                  </span>
                </div>
                <input
                  id="player-name"
                  type="text"
                  maxLength={15}
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (joinError) setJoinError(null);
                  }}
                  placeholder="Ej: Valentina"
                  autoComplete="off"
                  autoFocus
                  className="w-full min-h-[52px] px-4 rounded-2xl bg-slate-50 border border-slate-300 text-slate-900 text-lg font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                />
                {joinError && (
                  <p className="mt-2 text-sm font-medium text-rose-600">{joinError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={joining}
                className="w-full min-h-[52px] rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:bg-slate-300 text-white font-display font-bold text-lg shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                {joining ? 'Entrando...' : 'Entrar al juego'}
              </button>
            </form>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-400 max-w-md w-full mx-auto">
          Responde rápido, activa el bonus de 3 aciertos y sube por las escaleras.
        </footer>
      </div>
    );
  }

  const status = gameState?.status ?? 'WAITING';
  const streak = me.streak;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col">
      {/* Cabecera compacta (<15% de alto móvil) */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-4 h-4 rounded-full shrink-0 ring-2 ring-slate-200"
            style={{ backgroundColor: me.color }}
          />
          <span className="font-display font-bold text-base text-slate-900 truncate">
            {me.name}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono tabular-nums text-sm font-bold text-indigo-700">
            {me.position === 0 ? 'SALIDA' : `Casilla ${me.position}/${MAX_SQUARE}`}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Cuerpo principal móvil */}
      <main className="flex-1 flex flex-col max-w-xl w-full mx-auto p-4 pb-6 gap-4">
        {/* Indicador visual de racha 0/3 para el BONUS */}
        <section
          aria-label="Progreso de racha para bonus"
          className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <Flame className={`w-5 h-5 ${streak > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
            <div>
              <p className="text-xs font-bold text-slate-800 leading-none">Racha de aciertos</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-none">
                3 seguidas = ¡BONUS +3 casillas!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((slot) => (
                <span
                  key={slot}
                  className={`w-6 h-2.5 rounded-full transition-colors ${
                    slot < streak ? 'bg-amber-400' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-slate-700">
              {streak}/3
            </span>
          </div>
        </section>

        {/* Estado: Sala de espera */}
        {status === 'WAITING' && (
          <section className="flex-1 flex flex-col justify-center">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center shadow-sm">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white font-display font-extrabold text-2xl shadow-md ring-4 ring-slate-100"
                style={{ backgroundColor: me.color }}
              >
                {me.name.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-4">
                ¡Estás en la Salida!
              </h2>
              <p className="text-slate-600 text-sm mt-2">
                Ya apareces en la pantalla grande. Espera a que el anfitrión inicie la partida.
              </p>

              <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 gap-3 text-left text-xs text-slate-600">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="font-bold text-slate-800">Dado automático</p>
                  <p className="mt-0.5">Cada respuesta correcta tira un dado del 1 al 6.</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="font-bold text-amber-900">Bonus x3</p>
                  <p className="mt-0.5 text-amber-800">3 aciertos seguidos suman 3 casillas extra.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Estado: En pausa */}
        {status === 'PAUSED' && (
          <section className="flex-1 flex flex-col justify-center">
            <div className="bg-white rounded-3xl border border-amber-200 p-6 text-center shadow-sm">
              <PauseCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <h2 className="font-display text-2xl font-extrabold text-slate-900">
                Juego en pausa
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                El anfitrión pausó la partida temporalmente. En breve continuamos.
              </p>
            </div>
          </section>
        )}

        {/* Estado: Finalizado */}
        {status === 'FINISHED' && gameState?.winner && (
          <section className="flex-1 flex flex-col justify-center">
            <div className="bg-white rounded-3xl border border-amber-200 p-6 text-center shadow-sm">
              <Trophy
                className={`w-14 h-14 mx-auto mb-3 ${
                  gameState.winner.id === me.id ? 'text-amber-500' : 'text-slate-400'
                }`}
              />
              <h2 className="font-display text-2xl font-extrabold text-slate-900">
                {gameState.winner.id === me.id
                  ? '¡Felicidades, ganaste!'
                  : `Ganó ${gameState.winner.name}`}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Llegaste hasta la casilla {me.position} con {me.correctCount} aciertos.
              </p>

              <div className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Podio final
                </p>
                {gameState.podium.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-500">{idx + 1}°</span>
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="font-semibold text-slate-900">{p.name}</span>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-600">
                      Casilla {p.position}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-500 mt-5">
                Espera al anfitrión si desean jugar otra ronda.
              </p>
            </div>
          </section>
        )}

        {/* Estado: Jugando */}
        {status === 'PLAYING' && (
          <AnimatePresence mode="wait">
            {feedback ? (
              <motion.section
                key="feedback-card"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="flex-1 flex flex-col justify-center gap-4"
              >
                {/* Celebración especial de BONUS */}
                {feedback.bonusTriggered && (
                  <motion.div
                    initial={{ y: -12, scale: 0.92 }}
                    animate={{ y: 0, scale: 1 }}
                    className="rounded-3xl bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 text-slate-950 p-5 shadow-lg border-2 border-amber-200 flex items-center gap-3.5"
                  >
                    <Sparkles className="w-8 h-8 text-amber-900 shrink-0" />
                    <div>
                      <p className="font-display text-2xl font-extrabold leading-none">
                        ¡BONUS!
                      </p>
                      <p className="text-sm font-bold mt-1 text-amber-950">
                        3 aciertos seguidos · Avanzaste +{feedback.bonusSteps} casillas adicionales
                      </p>
                    </div>
                  </motion.div>
                )}

                {feedback.correct ? (
                  <div className="rounded-3xl bg-emerald-600 text-white p-6 shadow-md">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-6 h-6 text-emerald-100" />
                          <h2 className="font-display text-2xl font-extrabold">
                            ¡Respuesta correcta!
                          </h2>
                        </div>
                        <p className="text-emerald-100 text-sm mt-2">
                          El dado marcó <strong className="text-white">{feedback.diceRoll}</strong>
                          {feedback.bonusTriggered
                            ? ` + ${feedback.bonusSteps} de bonus`
                            : ''}
                          .
                        </p>
                        <p className="font-mono tabular-nums text-base font-bold text-white mt-1">
                          Casilla {feedback.previousPosition} → Casilla {feedback.finalPosition}
                        </p>
                      </div>

                      {feedback.diceRoll && <DiceFace value={feedback.diceRoll} />}
                    </div>

                    {feedback.boardTransition === 'ladder' && (
                      <div className="mt-4 rounded-2xl bg-white/15 px-4 py-3 flex items-center gap-2.5 text-sm font-bold">
                        <ArrowUpRight className="w-5 h-5 text-amber-300 shrink-0" />
                        <span>
                          ¡Subiste por una escalera! ({feedback.transitionFrom} → {feedback.transitionTo})
                        </span>
                      </div>
                    )}

                    {feedback.boardTransition === 'snake' && (
                      <div className="mt-4 rounded-2xl bg-rose-950/35 px-4 py-3 flex items-center gap-2.5 text-sm font-bold">
                        <ArrowDownRight className="w-5 h-5 text-rose-200 shrink-0" />
                        <span>
                          ¡Caíste en una serpiente! ({feedback.transitionFrom} → {feedback.transitionTo})
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-emerald-100/90 mt-4">
                      Preparando siguiente pregunta...
                    </p>
                  </div>
                ) : (
                  <div className="rounded-3xl bg-rose-600 text-white p-6 shadow-md">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-6 h-6 text-rose-100" />
                      <h2 className="font-display text-2xl font-extrabold">
                        Respuesta incorrecta
                      </h2>
                    </div>
                    <p className="text-rose-100 text-sm mt-2">
                      No avanzas esta vez y tu racha volvió a 0/3.
                    </p>
                    <div className="mt-4 rounded-2xl bg-white/15 px-4 py-3">
                      <p className="text-xs uppercase tracking-wider text-rose-100 font-semibold">
                        Respuesta correcta
                      </p>
                      <p className="text-lg font-bold text-white mt-0.5 capitalize">
                        {feedback.correctAnswerExample}
                      </p>
                    </div>
                    <p className="text-xs text-rose-100/90 mt-4">
                      Siguiente pregunta en un instante...
                    </p>
                  </div>
                )}
              </motion.section>
            ) : currentQuestion ? (
              <motion.section
                key={currentQuestion.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex-1 flex flex-col justify-between gap-4"
              >
                {/* Tarjeta de pregunta abierta */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span>{currentQuestion.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Pregunta {currentQuestion.number}</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug mt-3">
                    {currentQuestion.prompt}
                  </h2>
                </div>

                {/* Zona ergonómica del pulgar para responder */}
                <form onSubmit={handleSubmitAnswer} className="space-y-3 mt-auto">
                  <div>
                    <label htmlFor="answer-input" className="sr-only">
                      Escribe tu respuesta
                    </label>
                    <input
                      ref={inputRef}
                      id="answer-input"
                      type="text"
                      value={answerText}
                      onChange={(e) => {
                        setAnswerText(e.target.value);
                        if (submitError) setSubmitError(null);
                      }}
                      placeholder="Escribe tu respuesta aquí..."
                      autoComplete="off"
                      autoCapitalize="none"
                      disabled={submitting}
                      className="w-full min-h-[54px] px-4 rounded-2xl bg-white border-2 border-slate-300 text-slate-900 text-lg font-medium placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                    />
                    {submitError && (
                      <p className="mt-1.5 text-sm font-medium text-rose-600">{submitError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !answerText.trim()}
                    className="w-full min-h-[54px] rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:bg-slate-300 text-white font-display font-bold text-lg flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                    {submitting ? 'Enviando...' : 'Enviar'}
                  </button>
                </form>
              </motion.section>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Cargando pregunta...
              </div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
