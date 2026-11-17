import type { Response } from 'express';
import type { RealtimeEvent, RealtimeEventType } from '../src/types/wardwise.ts';

const publicClients = new Set<Response>();
const adminClients = new Set<Response>();
let seq = 1;

function nextEventId(): string {
  const id = `evt-${Date.now()}-${seq}`;
  seq += 1;
  return id;
}

function writeSseFrame(res: Response, event: RealtimeEvent) {
  try {
    res.write(`id: ${event.eventId}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    publicClients.delete(res);
    adminClients.delete(res);
  }
}

export function registerPublicSseClient(res: Response): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  publicClients.add(res);
  writeSseFrame(res, {
    eventId: nextEventId(),
    type: 'connected',
    timestamp: new Date().toISOString(),
    summary: 'WARDWISE public telemetry stream synchronized.',
  });

  const heartbeat = setInterval(() => {
    writeSseFrame(res, {
      eventId: nextEventId(),
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
    });
  }, 25000);

  return () => {
    clearInterval(heartbeat);
    publicClients.delete(res);
  };
}

export function registerAdminSseClient(res: Response): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  adminClients.add(res);
  writeSseFrame(res, {
    eventId: nextEventId(),
    type: 'connected',
    timestamp: new Date().toISOString(),
    summary: 'WARDWISE Control Room authenticated telemetry stream active.',
  });

  const heartbeat = setInterval(() => {
    writeSseFrame(res, {
      eventId: nextEventId(),
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
    });
  }, 25000);

  return () => {
    clearInterval(heartbeat);
    adminClients.delete(res);
  };
}

export function broadcastPublicEvent(
  type: RealtimeEventType,
  details?: { complaintId?: string; summary?: string; payload?: unknown }
) {
  const event: RealtimeEvent = {
    eventId: nextEventId(),
    type,
    timestamp: new Date().toISOString(),
    complaintId: details?.complaintId,
    summary: details?.summary,
    payload: details?.payload,
  };
  for (const client of publicClients) {
    writeSseFrame(client, event);
  }
}

export function broadcastAdminEvent(
  type: RealtimeEventType,
  details?: { complaintId?: string; summary?: string; payload?: unknown }
) {
  const event: RealtimeEvent = {
    eventId: nextEventId(),
    type,
    timestamp: new Date().toISOString(),
    complaintId: details?.complaintId,
    summary: details?.summary,
    payload: details?.payload,
  };
  for (const client of adminClients) {
    writeSseFrame(client, event);
  }
}

export function getRealtimeStats() {
  return {
    publicSubscribers: publicClients.size,
    adminSubscribers: adminClients.size,
  };
}
