import { PlayerView } from './components/PlayerView.tsx';
import { ProjectionView } from './components/ProjectionView.tsx';

export default function App() {
  if (typeof window === 'undefined') {
    return <ProjectionView />;
  }

  const pathname = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();

  const isPlayerRoute =
    pathname === '/jugar' ||
    pathname.endsWith('/jugar') ||
    pathname.includes('/jugar/') ||
    params.get('vista')?.toLowerCase() === 'jugar' ||
    hash === '#/jugar';

  if (isPlayerRoute) {
    return <PlayerView />;
  }

  return <ProjectionView />;
}
