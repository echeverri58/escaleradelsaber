// Cliente P2P (WebRTC) para que los celulares se conecten directamente a la pantalla de proyección en GitHub Pages.

import Peer, { type DataConnection } from 'peerjs';
import type {
  AnswerResultPayload,
  ClientQuestion,
  JoinSuccessPayload,
  PublicGameState,
  PublicPlayer,
} from '../shared/types.ts';
import { buildPeerHostId } from './socketConfig.ts';

interface WireIncoming {
  type: string;
  reqId?: string;
  payload?: unknown;
}

export interface P2PClientController {
  isConnected: () => boolean;
  join: (
    name: string,
    ack: (res: { ok: boolean; error?: string; data?: JoinSuccessPayload }) => void
  ) => void;
  reconnectPlayer: (
    playerId: string,
    ack: (res: { ok: boolean; data?: JoinSuccessPayload }) => void
  ) => void;
  answer: (
    answerText: string,
    ack: (res: { ok: boolean; error?: string }) => void
  ) => void;
  destroy: () => void;
}

interface P2PClientCallbacks {
  onOpen: () => void;
  onStateUpdate: (state: PublicGameState) => void;
  onQuestion: (q: ClientQuestion) => void;
  onAnswerResult: (res: AnswerResultPayload) => void;
  onWinner: (payload: { winner: PublicPlayer; podium: PublicPlayer[] }) => void;
  onPlayAgain: () => void;
  onKicked: () => void;
  onReset: () => void;
  onError: (msg: string) => void;
}

export function createP2PClient(
  roomCode: string,
  callbacks: P2PClientCallbacks
): P2PClientController {
  const hostId = buildPeerHostId(roomCode);
  const pendingAcks = new Map<string, (payload: unknown) => void>();
  let conn: DataConnection | null = null;
  let destroyed = false;

  const peer = new Peer({
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });

  function sendWithAck<T>(type: string, payload: unknown, ack: (res: T) => void): void {
    if (!conn || !conn.open) {
      ack({ ok: false, error: 'Sin conexión con la pantalla principal.' } as T);
      return;
    }
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timeout = setTimeout(() => {
      if (pendingAcks.has(reqId)) {
        pendingAcks.delete(reqId);
        ack({ ok: false, error: 'Tiempo de espera agotado. Intenta de nuevo.' } as T);
      }
    }, 8000);

    pendingAcks.set(reqId, (res) => {
      clearTimeout(timeout);
      ack(res as T);
    });

    conn.send({ type, reqId, payload });
  }

  peer.on('open', () => {
    if (destroyed) return;
    const c = peer.connect(hostId, { reliable: true });
    conn = c;

    c.on('open', () => {
      if (destroyed) return;
      callbacks.onOpen();
    });

    c.on('data', (raw) => {
      if (destroyed || typeof raw !== 'object' || raw === null) return;
      const msg = raw as WireIncoming;

      if (msg.type === 'ack' && msg.reqId) {
        const resolver = pendingAcks.get(msg.reqId);
        if (resolver) {
          pendingAcks.delete(msg.reqId);
          resolver(msg.payload);
        }
        return;
      }

      if (msg.type === 'state_update') callbacks.onStateUpdate(msg.payload as PublicGameState);
      else if (msg.type === 'question') callbacks.onQuestion(msg.payload as ClientQuestion);
      else if (msg.type === 'answer_result') callbacks.onAnswerResult(msg.payload as AnswerResultPayload);
      else if (msg.type === 'winner') callbacks.onWinner(msg.payload as { winner: PublicPlayer; podium: PublicPlayer[] });
      else if (msg.type === 'play_again') callbacks.onPlayAgain();
      else if (msg.type === 'kicked') callbacks.onKicked();
      else if (msg.type === 'reset') callbacks.onReset();
    });

    c.on('close', () => {
      if (!destroyed) {
        callbacks.onError('Se perdió la conexión con la pantalla principal.');
      }
    });

    c.on('error', () => {
      if (!destroyed) {
        callbacks.onError('No se pudo conectar con la sala. Verifica que la pantalla principal siga abierta.');
      }
    });
  });

  peer.on('error', () => {
    if (!destroyed) {
      callbacks.onError('No se encontró la sala. Escanea nuevamente el código QR de la pantalla.');
    }
  });

  return {
    isConnected: () => Boolean(conn?.open),
    join(name, ack) {
      sendWithAck('join', { name }, ack);
    },
    reconnectPlayer(playerId, ack) {
      sendWithAck('reconnect_player', { playerId }, ack);
    },
    answer(answerText, ack) {
      sendWithAck('answer', { answerText }, ack);
    },
    destroy() {
      destroyed = true;
      pendingAcks.clear();
      conn?.close();
      peer.destroy();
    },
  };
}
