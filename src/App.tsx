import { PlayerView } from './components/PlayerView.tsx';
import { ProjectionView } from './components/ProjectionView.tsx';

export default function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '/';
  const isPlayerRoute = pathname === '/jugar' || pathname.startsWith('/jugar/');

  if (isPlayerRoute) {
    return <PlayerView />;
  }

  return <ProjectionView />;
}
