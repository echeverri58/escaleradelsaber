// Utilidades para resolver el modo de conexión (Socket.io o WebRTC P2P en GitHub Pages)
// y construir el enlace del código QR.

export function getInitialServerUrl(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('server')?.trim();
    if (fromQuery) return fromQuery.replace(/\/+$/, '');
  }
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return '';
}

export function getRoomCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return (params.get('sala') ?? '').trim().toUpperCase();
}

export function isStaticGitHubPages(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function buildPeerHostId(roomCode: string): string {
  return `la-escalera-saber-${roomCode.trim().toUpperCase()}`;
}

export function buildDefaultPlayerJoinUrl(serverUrl: string, p2pRoomCode?: string | null): string {
  if (typeof window === 'undefined') return '/jugar';

  if (p2pRoomCode) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams();
    params.set('vista', 'jugar');
    params.set('sala', p2pRoomCode);
    return `${base}?${params.toString()}`;
  }

  const cleanServer = serverUrl.trim().replace(/\/+$/, '');
  if (isStaticGitHubPages()) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams();
    params.set('vista', 'jugar');
    if (cleanServer) params.set('server', cleanServer);
    return `${base}?${params.toString()}`;
  }

  const base = `${window.location.origin}/jugar`;
  if (cleanServer && cleanServer !== window.location.origin) {
    return `${base}?server=${encodeURIComponent(cleanServer)}`;
  }
  return base;
}
