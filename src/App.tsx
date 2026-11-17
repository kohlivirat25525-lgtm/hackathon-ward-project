import { useCallback, useEffect, useState } from 'react';
import { api, type PublicBootstrapResponse, type TransparencyWindow } from './lib/api';
import { useRealtimeSync } from './lib/realtime';
import type { AdminUser, RealtimeEvent } from './types/wardwise';
import { PublicLayout, type PublicRoute } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ReportIssuePage } from './pages/ReportIssuePage';
import { LiveCityMapPage } from './pages/LiveCityMapPage';
import { TrackIssuePage } from './pages/TrackIssuePage';
import { TransparencyPage } from './pages/TransparencyPage';
import { ControlRoomPage } from './pages/ControlRoomPage';

function parseLocation(): { route: PublicRoute; params: URLSearchParams } {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === '/report') return { route: '/report', params };
  if (path === '/map') return { route: '/map', params };
  if (path === '/track') return { route: '/track', params };
  if (path === '/transparency') return { route: '/transparency', params };
  if (path === '/control-room') return { route: '/control-room', params };
  return { route: '/', params };
}

export default function App() {
  const [{ route, params }, setLocationState] = useState(parseLocation);
  const [transparencyWindow, setTransparencyWindow] = useState<TransparencyWindow>('30d');
  const [publicData, setPublicData] = useState<PublicBootstrapResponse | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [lastPublicEvent, setLastPublicEvent] = useState<RealtimeEvent | null>(null);

  const loadPublicData = useCallback(async (win: TransparencyWindow = transparencyWindow) => {
    try {
      const data = await api.getPublicBootstrap(win);
      setPublicData(data);
    } catch (err) {
      console.error('Failed to load WARDWISE public bootstrap:', err);
    }
  }, [transparencyWindow]);

  const handlePublicRealtimeEvent = useCallback(
    (evt: RealtimeEvent) => {
      setLastPublicEvent(evt);
      loadPublicData(transparencyWindow);
    },
    [loadPublicData, transparencyWindow]
  );

  const { status: publicStreamStatus } = useRealtimeSync(
    '/api/events',
    route !== '/control-room',
    handlePublicRealtimeEvent,
    () => loadPublicData(transparencyWindow)
  );

  useEffect(() => {
    loadPublicData(transparencyWindow);
  }, [loadPublicData, transparencyWindow]);

  useEffect(() => {
    api
      .me()
      .then((res) => {
        if (res.authenticated) setAdminUser(res.user);
      })
      .catch(() => {
        // Not logged in; normal for public visitors
      });

    const onPopState = () => setLocationState(parseLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextRoute: PublicRoute, query?: string) => {
    const nextUrl = query ? `${nextRoute}?${query}` : nextRoute;
    window.history.pushState({}, '', nextUrl);
    setLocationState(parseLocation());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (route === '/control-room') {
    return (
      <ControlRoomPage
        adminUser={adminUser}
        onAdminAuthenticated={setAdminUser}
        onNavigate={navigate}
        onDataChanged={() => loadPublicData(transparencyWindow)}
      />
    );
  }

  return (
    <PublicLayout
      currentRoute={route}
      onNavigate={navigate}
      adminUser={adminUser}
      onAdminAuthenticated={setAdminUser}
      realtimeStatus={publicStreamStatus}
    >
      {route === '/' && (
        <HomePage
          data={publicData}
          realtimeStatus={publicStreamStatus}
          lastRealtimeEvent={lastPublicEvent}
          onNavigate={navigate}
        />
      )}
      {route === '/report' && (
        <ReportIssuePage
          data={publicData}
          onSubmitted={() => loadPublicData(transparencyWindow)}
          onNavigate={navigate}
        />
      )}
      {route === '/map' && (
        <LiveCityMapPage
          data={publicData}
          initialWardFilter={params.get('ward') || 'ALL'}
          realtimeStatus={publicStreamStatus}
          lastRealtimeEvent={lastPublicEvent}
          onNavigate={navigate}
        />
      )}
      {route === '/track' && (
        <TrackIssuePage
          data={publicData}
          initialId={params.get('id') || undefined}
          realtimeStatus={publicStreamStatus}
          lastRealtimeEvent={lastPublicEvent}
          onNavigate={navigate}
        />
      )}
      {route === '/transparency' && (
        <TransparencyPage
          data={publicData}
          windowMode={transparencyWindow}
          onWindowChange={setTransparencyWindow}
          onNavigate={navigate}
        />
      )}
    </PublicLayout>
  );
}
