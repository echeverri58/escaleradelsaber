import confetti from 'canvas-confetti';
import {
  Check,
  Copy,
  Crown,
  FileText,
  Flame,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  UserX,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { MAX_SQUARE } from '../shared/board.ts';
import { parseCustomQuestions } from '../shared/questions.ts';
import type {
  BonusBroadcastPayload,
  GameEvent,
  PublicGameState,
  PublicPlayer,
} from '../shared/types.ts';
import { soundManager } from '../utils/sound.ts';
import { GameBoard } from './GameBoard.tsx';

const INITIAL_STATE: PublicGameState = {
  status: 'WAITING',
  snakesEnabled: true,
  totalQuestions: 30,
  customQuestionsCount: 0,
  players: [],
  events: [],
  winner: null,
  podium: [],
};

export function ProjectionView() {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<PublicGameState>(INITIAL_STATE);
  const [muted, setMuted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bonusBanner, setBonusBanner] = useState<BonusBroadcastPayload | null>(null);
  const [recentMoverId, setRecentMoverId] = useState<string | null>(null);

  const defaultJoinUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/jugar';
    return `${window.location.origin}/jugar`;
  }, []);
  const [customJoinUrl, setCustomJoinUrl] = useState<string>('');
  const [editingQrUrl, setEditingQrUrl] = useState(false);

  // Modal de preguntas personalizadas
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [questionsMode, setQuestionsMode] = useState<'append' | 'replace'>('append');
  const [questionsFeedback, setQuestionsFeedback] = useState<string | null>(null);

  const joinUrl = customJoinUrl.trim() || defaultJoinUrl;

  const previewParsed = useMemo(() => parseCustomQuestions(customText), [customText]);

  const prevEventsTopIdRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Al cargar o recargar la pantalla de proyección, todo se borra y empieza desde cero
      socket.emit('host_init');
    });

    socket.on('state_update', (nextState: PublicGameState) => {
      setGameState(nextState);

      const latest = nextState.events[0];
      if (latest && latest.id !== prevEventsTopIdRef.current) {
        prevEventsTopIdRef.current = latest.id;
        if (latest.type === 'correct') soundManager.playCorrect();
        if (latest.type === 'ladder') soundManager.playLadder();
        if (latest.type === 'snake') soundManager.playSnake();
      }
    });

    socket.on('bonus', (payload: BonusBroadcastPayload) => {
      soundManager.playBonus();
      setBonusBanner(payload);
      setRecentMoverId(payload.playerId);
      setTimeout(() => {
        setBonusBanner((curr) => (curr?.playerId === payload.playerId ? null : curr));
        setRecentMoverId((curr) => (curr === payload.playerId ? null : curr));
      }, 3200);
    });

    socket.on('winner', () => {
      soundManager.playVictory();
      const end = Date.now() + 2600;
      const fire = () => {
        confetti({
          particleCount: 65,
          spread: 75,
          origin: { y: 0.55 },
        });
        if (Date.now() < end) {
          requestAnimationFrame(fire);
        }
      };
      fire();
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

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignorar si el navegador restringe el portapapeles
    }
  };

  const handleStart = () => socketRef.current?.emit('start');
  const handlePauseResume = () => {
    if (gameState.status === 'PLAYING') socketRef.current?.emit('pause');
    else if (gameState.status === 'PAUSED') socketRef.current?.emit('resume');
  };

  const handleToggleSnakes = () => {
    socketRef.current?.emit('toggle_snakes', { enabled: !gameState.snakesEnabled });
  };

  const handleKick = (player: PublicPlayer) => {
    socketRef.current?.emit('kick', { playerId: player.id });
  };

  const handleResetAll = () => {
    if (!confirmReset && gameState.players.length > 0) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3500);
      return;
    }
    setConfirmReset(false);
    socketRef.current?.emit('reset');
  };

  const handlePlayAgain = () => {
    socketRef.current?.emit('play_again');
  };

  const handleSaveCustomQuestions = () => {
    socketRef.current?.emit(
      'custom_questions',
      { rawText: customText, mode: questionsMode },
      (res: { ok: boolean; added: number; total: number; invalidLines: number[]; error?: string }) => {
        if (!res.ok) {
          setQuestionsFeedback(res.error ?? 'No se pudieron cargar las preguntas.');
          return;
        }
        setQuestionsFeedback(
          `Listo: se cargaron ${res.added} preguntas (total activo: ${res.total}).`
        );
        setCustomText('');
        setTimeout(() => {
          setQuestionsModalOpen(false);
          setQuestionsFeedback(null);
        }, 1200);
      }
    );
  };

  const handleRestoreDefaults = () => {
    socketRef.current?.emit('restore_default_questions');
    setQuestionsFeedback('Banco restaurado a las 30 preguntas iniciales.');
    setTimeout(() => setQuestionsFeedback(null), 1600);
  };

  const connectedCount = gameState.players.filter((p) => p.connected).length;
  const leader = gameState.players[0] ?? null;
  const tiedWithLeaderCount = leader
    ? gameState.players.filter((p) => p.position === leader.position).length
    : 0;

  const statusLabel =
    gameState.status === 'WAITING'
      ? 'Sala de espera'
      : gameState.status === 'PLAYING'
        ? 'En juego'
        : gameState.status === 'PAUSED'
          ? 'En pausa'
          : 'Finalizado';

  return (
    <div className="min-h-screen lg:h-screen bg-[#0B1120] text-slate-100 flex flex-col overflow-x-hidden lg:overflow-hidden">
      {/* Barra superior del anfitrión */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 bg-slate-900/90 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white whitespace-nowrap leading-none">
              LA ESCALERA DEL SABER
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Creado por John Alexander Echeverry O.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-200 tabular-nums">
              <Users className="w-4 h-4 text-emerald-400" />
              {connectedCount} {connectedCount === 1 ? 'conectado' : 'conectados'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{statusLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{MAX_SQUARE} casillas</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{gameState.totalQuestions} preguntas</span>
          </div>
        </div>

        {/* Controles del anfitrión */}
        <div className="flex flex-wrap items-center gap-2.5">
          {gameState.status === 'WAITING' && (
            <>
              <button
                type="button"
                onClick={handleToggleSnakes}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameState.snakesEnabled
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Serpientes: {gameState.snakesEnabled ? 'Activadas' : 'Desactivadas'}
              </button>

              <button
                type="button"
                onClick={() => setQuestionsModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                Preguntas
              </button>

              <button
                type="button"
                onClick={handleStart}
                disabled={gameState.players.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
              >
                <Play className="w-4 h-4 fill-current" />
                Iniciar juego
              </button>
            </>
          )}

          {(gameState.status === 'PLAYING' || gameState.status === 'PAUSED') && (
            <button
              type="button"
              onClick={handlePauseResume}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                gameState.status === 'PLAYING'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {gameState.status === 'PLAYING' ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Reanudar
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleResetAll}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              confirmReset
                ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            {confirmReset ? 'Confirmar reinicio' : 'Reiniciar todo'}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
            title={muted ? 'Activar sonido' : 'Silenciar sonido'}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5 text-slate-400" /> : <Volume2 className="w-5 h-5 text-sky-400" />}
          </button>
        </div>
      </header>

      {/* Área principal: Tablero 6x5 (30 casillas) a la izquierda + Panel derecho */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_430px] gap-4 p-4">
        {/* Columna izquierda: Tablero */}
        <section className="relative flex items-center justify-center min-h-[420px] lg:min-h-0 bg-slate-900/45 rounded-2xl border border-slate-800/80 p-3 sm:p-5">
          <GameBoard
            players={gameState.players}
            snakesEnabled={gameState.snakesEnabled}
            recentMoverId={recentMoverId}
          />

          {/* Notificación flotante de BONUS en pantalla grande */}
          <AnimatePresence>
            {bonusBanner && (
              <motion.div
                initial={{ opacity: 0, y: -24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.92 }}
                className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 text-slate-950 shadow-2xl border-2 border-white flex items-center gap-3"
              >
                <Sparkles className="w-7 h-7 text-amber-900 shrink-0" />
                <div>
                  <p className="font-display text-xl font-extrabold leading-tight">
                    ¡BONUS! {bonusBanner.playerName}
                  </p>
                  <p className="text-sm font-bold text-amber-950">
                    3 aciertos seguidos · +{bonusBanner.bonusSteps} casillas extra (Casilla {bonusBanner.finalPosition})
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Aviso de juego pausado */}
          <AnimatePresence>
            {gameState.status === 'PAUSED' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center"
              >
                <div className="bg-slate-900 border border-slate-700 rounded-2xl px-8 py-6 text-center shadow-2xl">
                  <Pause className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                  <h2 className="font-display text-3xl font-extrabold text-white">Juego en pausa</h2>
                  <p className="text-slate-300 text-sm mt-1 mb-4">
                    Las respuestas están pausadas temporalmente.
                  </p>
                  <button
                    type="button"
                    onClick={handlePauseResume}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Reanudar partida
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Panel derecho: Quién va de primero + QR + Ranking + Actividad */}
        <aside className="flex flex-col gap-3.5 min-h-0">
          {/* Panel destacado: Quién va de primero */}
          <section
            aria-label="Jugador que va de primero"
            className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 border border-amber-400/40 p-4 shrink-0 shadow-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-amber-300">
                <Crown className="w-5 h-5 shrink-0" />
                <h2 className="font-display text-sm font-extrabold uppercase tracking-wider">
                  Va de primero
                </h2>
              </div>
              {leader && tiedWithLeaderCount > 1 && leader.position > 0 && (
                <span className="text-xs font-medium text-amber-200/80">
                  Empate ({tiedWithLeaderCount})
                </span>
              )}
            </div>

            {leader ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-display font-extrabold text-base text-white ring-2 ring-amber-300 shadow-md shrink-0"
                    style={{ backgroundColor: leader.color }}
                  >
                    {leader.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-extrabold text-white truncate leading-tight">
                      {leader.name}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5 tabular-nums">
                      {leader.correctCount} {leader.correctCount === 1 ? 'acierto' : 'aciertos'} · Racha {leader.streak}/3
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-[11px] uppercase tracking-wider text-amber-300/90 font-semibold">
                    Casilla
                  </p>
                  <p className="font-mono tabular-nums text-2xl font-extrabold text-amber-300 leading-none mt-0.5">
                    {leader.position}/{MAX_SQUARE}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-1">
                Aún no hay jugadores conectados en la partida.
              </p>
            )}
          </section>

          {/* Tarjeta destacada de Código QR y Link para unirse */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-sm font-bold text-white">
                Escanea para jugar
              </h2>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingQrUrl((v) => !v)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  {editingQrUrl ? 'Cerrar' : 'Editar URL'}
                </button>
                <button
                  type="button"
                  onClick={() => setQrExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  {qrExpanded ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" />
                      Compactar
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      Ampliar QR
                    </>
                  )}
                </button>
              </div>
            </div>

            {editingQrUrl && (
              <div className="mb-2.5 flex items-center gap-2">
                <input
                  type="url"
                  value={customJoinUrl}
                  onChange={(e) => setCustomJoinUrl(e.target.value)}
                  placeholder={defaultJoinUrl}
                  className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                />
                {customJoinUrl && (
                  <button
                    type="button"
                    onClick={() => setCustomJoinUrl('')}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    Restablecer
                  </button>
                )}
              </div>
            )}

            <div className={`flex ${qrExpanded ? 'flex-col items-center text-center' : 'items-center'} gap-3.5`}>
              <div className="bg-white p-2 rounded-xl shrink-0 shadow-md">
                <QRCodeSVG
                  value={joinUrl}
                  size={qrExpanded ? 200 : gameState.status === 'WAITING' ? 108 : 80}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 mb-1">
                  Entra desde tu celular a:
                </p>
                <p className="text-[11px] sm:text-xs font-mono text-sky-300 break-all leading-snug mb-2">
                  {joinUrl}
                </p>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Enlace copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copiar enlace
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Ranking en vivo */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col min-h-[160px] flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-2.5 shrink-0">
              <h2 className="font-display text-sm font-bold text-white">
                Ranking en vivo
              </h2>
              <span className="text-xs text-slate-400 tabular-nums">
                {gameState.players.length} {gameState.players.length === 1 ? 'jugador' : 'jugadores'}
              </span>
            </div>

            {gameState.players.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-4 text-slate-400">
                <Users className="w-7 h-7 mb-1.5 text-slate-600" />
                <p className="text-xs text-slate-400 max-w-[230px]">
                  Pide a los participantes que escaneen el código QR con su celular.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
                {gameState.players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border transition-colors ${
                      index === 0
                        ? 'bg-amber-500/10 border-amber-400/35'
                        : player.connected
                          ? 'bg-slate-800/60 border-slate-700/70'
                          : 'bg-slate-900/60 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono tabular-nums text-xs font-bold text-slate-400 w-5 text-right shrink-0">
                        {index + 1}°
                      </span>
                      <span
                        className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/25"
                        style={{ backgroundColor: player.color }}
                      />
                      <p className="text-sm font-semibold text-white truncate">
                        {player.name}
                        {!player.connected && (
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            (desconectado)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div
                        className="flex items-center gap-1 text-xs font-mono tabular-nums text-amber-300"
                        title={`Racha para BONUS: ${player.streak}/3`}
                      >
                        <Flame className={`w-3.5 h-3.5 ${player.streak > 0 ? 'text-amber-400' : 'text-slate-600'}`} />
                        <span>{player.streak}/3</span>
                      </div>

                      <span className="font-mono tabular-nums text-sm font-bold text-emerald-300 w-9 text-right">
                        {player.position === 0 ? 'SAL' : `${player.position}`}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleKick(player)}
                        title={`Expulsar a ${player.name}`}
                        aria-label={`Expulsar a ${player.name}`}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Feed de eventos recientes */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 h-36 lg:h-40 flex flex-col shrink-0">
            <h2 className="font-display text-sm font-bold text-white mb-1.5 shrink-0">
              Actividad reciente
            </h2>
            {gameState.events.length === 0 ? (
              <p className="text-xs text-slate-500 my-auto text-center">
                Los movimientos, escaleras y bonus aparecerán aquí en vivo.
              </p>
            ) : (
              <ul className="flex-1 overflow-y-auto space-y-1 pr-1 text-xs">
                {gameState.events.map((ev: GameEvent) => (
                  <li key={ev.id} className="flex items-start gap-2 text-slate-300 leading-snug">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{
                        backgroundColor:
                          ev.playerColor ??
                          (ev.type === 'bonus'
                            ? '#F59E0B'
                            : ev.type === 'winner'
                              ? '#10B981'
                              : '#64748B'),
                      }}
                    />
                    <span
                      className={
                        ev.type === 'bonus'
                          ? 'text-amber-300 font-semibold'
                          : ev.type === 'winner'
                            ? 'text-emerald-300 font-bold'
                            : ev.type === 'snake'
                              ? 'text-rose-300'
                              : ev.type === 'ladder'
                                ? 'text-sky-300'
                                : 'text-slate-300'
                      }
                    >
                      {ev.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>

      {/* Modal de Preguntas Personalizadas */}
      <AnimatePresence>
        {questionsModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    Cargar preguntas personalizadas
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Formato: <code className="text-sky-300">pregunta | respuesta1 ; respuesta2</code> (una por línea)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuestionsModalOpen(false)}
                  aria-label="Cerrar modal"
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={7}
                placeholder={`Ejemplo:\n¿Cuál es la capital de Perú? | lima\n¿Cuánto es 7 x 8? | 56 ; cincuenta y seis`}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-slate-400">
                <div>
                  Detectadas:{' '}
                  <span className="font-bold text-emerald-400 tabular-nums">
                    {previewParsed.questions.length} válidas
                  </span>
                  {previewParsed.invalidLines.length > 0 && (
                    <span className="ml-2 text-rose-400">
                      · Líneas con formato inválido: {previewParsed.invalidLines.join(', ')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setQuestionsMode('append')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      questionsMode === 'append'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Agregar al banco
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionsMode('replace')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      questionsMode === 'replace'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Reemplazar banco
                  </button>
                </div>
              </div>

              {questionsFeedback && (
                <p className="mt-3 text-sm font-medium text-emerald-300">{questionsFeedback}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleRestoreDefaults}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                >
                  Restaurar 30 preguntas iniciales
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setQuestionsModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCustomQuestions}
                    disabled={previewParsed.questions.length === 0}
                    className="px-5 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Guardar preguntas
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pantalla de Ganador y Podio Top 3 */}
      <AnimatePresence>
        {gameState.status === 'FINISHED' && gameState.winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl bg-slate-900 border border-amber-400/30 rounded-3xl p-8 text-center shadow-2xl"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-9 h-9 text-amber-400" />
              </div>

              <p className="text-sm font-bold uppercase tracking-widest text-amber-300">
                ¡Tenemos ganador en la casilla {MAX_SQUARE}!
              </p>
              <h2 className="font-display text-4xl sm:text-5xl font-extrabold text-white mt-2">
                {gameState.winner.name}
              </h2>

              <div className="grid grid-cols-3 gap-3 items-end max-w-lg mx-auto mt-8 mb-8">
                {gameState.podium[1] ? (
                  <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 h-36 flex flex-col justify-between">
                    <span className="font-mono text-lg font-bold text-slate-300">2°</span>
                    <div>
                      <span
                        className="inline-block w-4 h-4 rounded-full mb-1"
                        style={{ backgroundColor: gameState.podium[1].color }}
                      />
                      <p className="font-bold text-white truncate">{gameState.podium[1].name}</p>
                      <p className="text-xs text-slate-400 tabular-nums">
                        Casilla {gameState.podium[1].position}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div />
                )}

                {gameState.podium[0] && (
                  <div className="bg-gradient-to-b from-amber-500/25 to-amber-500/5 border border-amber-400/50 rounded-2xl p-4 h-44 flex flex-col justify-between shadow-lg">
                    <span className="font-mono text-2xl font-extrabold text-amber-300">1°</span>
                    <div>
                      <span
                        className="inline-block w-5 h-5 rounded-full mb-1 ring-2 ring-white"
                        style={{ backgroundColor: gameState.podium[0].color }}
                      />
                      <p className="font-display text-lg font-extrabold text-white truncate">
                        {gameState.podium[0].name}
                      </p>
                      <p className="text-xs font-semibold text-amber-200 tabular-nums">
                        Casilla {gameState.podium[0].position} · {gameState.podium[0].correctCount} aciertos
                      </p>
                    </div>
                  </div>
                )}

                {gameState.podium[2] ? (
                  <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 h-28 flex flex-col justify-between">
                    <span className="font-mono text-base font-bold text-orange-300">3°</span>
                    <div>
                      <span
                        className="inline-block w-4 h-4 rounded-full mb-1"
                        style={{ backgroundColor: gameState.podium[2].color }}
                      />
                      <p className="font-bold text-white truncate">{gameState.podium[2].name}</p>
                      <p className="text-xs text-slate-400 tabular-nums">
                        Casilla {gameState.podium[2].position}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handlePlayAgain}
                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base transition-colors cursor-pointer shadow-lg shadow-emerald-500/25"
                >
                  Jugar de nuevo
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-colors cursor-pointer"
                >
                  Reiniciar todo (salir todos)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
