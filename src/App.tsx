import { useEffect, useState } from 'react';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { ToastViewport } from './components/ToastViewport';
import { useSettingsStore } from './state/settings';
import { installNativeBackButton } from './platform/nativeShell';

type Route = { name: 'library' } | { name: 'reader'; id: string };

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  const match = hash.match(/^\/read\/([^/?]+)/);
  if (match) return { name: 'reader', id: decodeURIComponent(match[1]) };
  return { name: 'library' };
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const hydrate = useSettingsStore((state) => state.hydrate);
  const hydrated = useSettingsStore((state) => state.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    installNativeBackButton();
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <>
      {!hydrated ? (
        <div className="boot" />
      ) : route.name === 'reader' ? (
        <ReaderPage key={route.id} bookId={route.id} />
      ) : (
        <LibraryPage />
      )}
      <ToastViewport raised={route.name === 'reader'} />
    </>
  );
}
