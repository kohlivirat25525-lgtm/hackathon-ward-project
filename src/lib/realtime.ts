import { useEffect, useRef, useState } from 'react';
import type { RealtimeEvent, RealtimeEventType } from '../types/wardwise';
import { getAdminToken } from './api';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

const EVENT_TYPES: RealtimeEventType[] = [
  'connected',
  'heartbeat',
  'complaint:created',
  'complaint:updated',
  'complaint:escalated',
  'duplicate:merged',
  'duplicate:separated',
  'reorg:executed',
  'sla:swept',
  'sla:updated',
  'routing:updated',
  'org:updated',
];

export function useRealtimeSync(
  url: string,
  enabled: boolean,
  onEvent: (event: RealtimeEvent) => void,
  onResync?: () => void
) {
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? 'reconnecting' : 'offline');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const wasDisconnectedRef = useRef(false);

  onEventRef.current = onEvent;
  onResyncRef.current = onResync;

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('reconnecting');

      const token = url.startsWith('/api/admin/') ? getAdminToken() : null;
      const effectiveUrl = token
        ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
        : url;

      es = new EventSource(effectiveUrl, { withCredentials: true });

      const handleIncoming = (rawData: string) => {
        try {
          const parsed = JSON.parse(rawData) as RealtimeEvent;
          if (!parsed || !parsed.eventId) return;
          if (seenIdsRef.current.has(parsed.eventId)) return;
          seenIdsRef.current.add(parsed.eventId);
          if (seenIdsRef.current.size > 300) {
            const first = seenIdsRef.current.values().next().value;
            if (first) seenIdsRef.current.delete(first);
          }

          if (parsed.type === 'connected') {
            attempt = 0;
            setStatus('connected');
            if (wasDisconnectedRef.current) {
              wasDisconnectedRef.current = false;
              onResyncRef.current?.();
            }
            return;
          }

          if (parsed.type === 'heartbeat') {
            setStatus('connected');
            return;
          }

          setLastEvent(parsed);
          onEventRef.current(parsed);
        } catch {
          // Ignore malformed keep-alive frames
        }
      };

      for (const evtName of EVENT_TYPES) {
        es.addEventListener(evtName, (e) => {
          handleIncoming((e as MessageEvent).data);
        });
      }

      es.onopen = () => {
        attempt = 0;
        setStatus('connected');
      };

      es.onerror = () => {
        if (disposed) return;
        wasDisconnectedRef.current = true;
        setStatus('reconnecting');
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          attempt += 1;
          const delayMs = Math.min(15000, 1200 * Math.pow(1.6, attempt));
          reconnectTimer = setTimeout(connect, delayMs);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [url, enabled]);

  return { status, lastEvent };
}
