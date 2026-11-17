import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import dotenv from 'dotenv';
import type {
  AdminRole,
  AdminUser,
  Complaint,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  PublicComplaint,
} from './src/types/wardwise.ts';
import {
  appendAuditLog,
  buildDepartmentLeaderboard,
  buildWardPerformance,
  computeSlaDeadline,
  detectDuplicates,
  makeHash,
  previewReorganization,
  processSlaEscalations,
  routeComplaint,
} from './server/engine.ts';
import { getDatabase, saveDatabase, UPLOADS_DIR } from './server/store.ts';
import {
  broadcastAdminEvent,
  broadcastPublicEvent,
  getRealtimeStats,
  registerAdminSseClient,
  registerPublicSseClient,
} from './server/realtime.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'wardwise-civic-session-secret-2026-dev';
const COOKIE_NAME = 'wardwise_admin_session';

interface AdminCredential extends AdminUser {
  password: string;
}

const ADMIN_ACCOUNTS: AdminCredential[] = [
  {
    id: 'adm-commissioner',
    email: 'commissioner@wardwise.gov',
    password: process.env.ADMIN_DEMO_PASSWORD || '1234567890',
    name: 'Comm. E. Vance',
    role: 'Commissioner',
    departmentId: null,
  },
  {
    id: 'adm-supervisor',
    email: 'supervisor@wardwise.gov',
    password: process.env.SUPERVISOR_DEMO_PASSWORD || '1234567890',
    name: 'Sup. N. Desai',
    role: 'Supervisor',
    departmentId: 'dept-water',
  },
  {
    id: 'adm-dispatcher',
    email: 'dispatch@wardwise.gov',
    password: process.env.DISPATCH_DEMO_PASSWORD || '1234567890',
    name: 'Op. M. Alvarez',
    role: 'Dispatcher',
    departmentId: null,
  },
];

function hashOfficialPassword(password: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`pwd:${password}`).digest('hex');
}

function setSessionCookie(req: Request, res: Response, token: string, maxAgeSeconds: number) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = req.secure || forwardedProto.includes('https');
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function extractRequestToken(req: Request): string | undefined {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : undefined;
  const cookieToken = parseCookie(req, COOKIE_NAME);
  const queryToken = typeof req.query.token === 'string' && req.query.token.trim()
    ? req.query.token.trim()
    : undefined;
  return bearer || cookieToken || queryToken;
}

function signSession(user: AdminUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      user,
      exp: Date.now() + 24 * 3600 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string | undefined): AdminUser | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      user: AdminUser;
      exp: number;
    };
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.user;
  } catch {
    return null;
  }
}

function parseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

interface AuthedRequest extends Request {
  adminUser?: AdminUser;
}

function requireAdmin(allowedRoles?: AdminRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = verifySession(extractRequestToken(req));
    if (!user) {
      return res.status(401).json({ error: 'Authentication required for Control Room access.' });
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: `Role ${user.role} lacks permission for this action.` });
    }
    req.adminUser = user;
    next();
  };
}

function sanitizeComplaintForPublic(c: Complaint): PublicComplaint {
  const { reporterName: _rn, reporterContact: _rc, ...rest } = c;
  return rest;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Serve uploaded evidence & citizen photos
  getDatabase(); // Ensure DB & uploads dir initialized
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Periodic background SLA sweep (every 60s)
  const slaInterval = setInterval(() => {
    const db = getDatabase();
    const created = processSlaEscalations(db);
    if (created > 0) {
      saveDatabase(db);
      broadcastPublicEvent('sla:swept', { summary: `${created} SLA escalation(s) triggered.` });
      broadcastAdminEvent('sla:swept', { summary: `${created} SLA escalation(s) triggered.` });
    }
  }, 60000);
  slaInterval.unref();

  // =========================================================
  // SERVER-AUTHORITATIVE REAL-TIME SSE STREAMS
  // =========================================================
  app.get('/api/events', (req: Request, res: Response) => {
    const cleanup = registerPublicSseClient(res);
    req.on('close', cleanup);
  });

  app.get('/api/admin/events', requireAdmin(), (req: AuthedRequest, res: Response) => {
    const cleanup = registerAdminSseClient(res);
    req.on('close', cleanup);
  });

  // =========================================================
  // AUTH ROUTES (SIGN IN + OFFICIAL SIGN UP)
  // =========================================================
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const seededAccount = ADMIN_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === normalizedEmail && a.password === password
    );

    let user: AdminUser | null = null;
    if (seededAccount) {
      user = {
        id: seededAccount.id,
        email: seededAccount.email,
        name: seededAccount.name,
        role: seededAccount.role,
        departmentId: seededAccount.departmentId,
      };
    } else {
      const db = getDatabase();
      const pwdHash = hashOfficialPassword(password);
      const registered = (db.officialAccounts || []).find(
        (a) => a.email.toLowerCase() === normalizedEmail && a.passwordHash === pwdHash
      );
      if (registered) {
        user = {
          id: registered.id,
          email: registered.email,
          name: registered.name,
          role: registered.role,
          departmentId: registered.departmentId,
        };
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid municipal email or password (use 1234567890 for evaluation accounts).' });
    }

    const token = signSession(user);
    setSessionCookie(req, res, token, 86400);
    res.json({ user, token });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { name, email, password, role, departmentId } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: AdminRole;
      departmentId?: string | null;
    };

    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = password || '';
    const validRoles: AdminRole[] = ['Commissioner', 'Supervisor', 'Dispatcher'];
    const chosenRole: AdminRole = role && validRoles.includes(role) ? role : 'Supervisor';

    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Full official name (at least 2 characters) is required.' });
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'A valid official email address is required.' });
    }
    if (cleanPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters (e.g. 1234567890).' });
    }

    const db = getDatabase();
    if (!db.officialAccounts) db.officialAccounts = [];

    const existsInDemo = ADMIN_ACCOUNTS.some((a) => a.email.toLowerCase() === cleanEmail);
    const existsInDb = db.officialAccounts.some((a) => a.email.toLowerCase() === cleanEmail);
    if (existsInDemo || existsInDb) {
      return res.status(409).json({ error: 'An official account with this email already exists. Please Sign In instead.' });
    }

    const newAccount = {
      id: `adm-${Date.now()}`,
      email: cleanEmail,
      name: cleanName,
      role: chosenRole,
      departmentId: departmentId || null,
      passwordHash: hashOfficialPassword(cleanPassword),
      createdAt: new Date().toISOString(),
    };

    db.officialAccounts.push(newAccount);
    appendAuditLog(db, {
      actorId: newAccount.id,
      actorName: newAccount.name,
      actorRole: newAccount.role,
      action: 'OFFICIAL_SIGNUP',
      entityType: 'officer',
      entityId: newAccount.id,
      complaintId: null,
      previousValue: 'Unregistered',
      newValue: `${newAccount.name} (${newAccount.role} · ${newAccount.email})`,
      reason: 'Self-registered municipal official account in Control Room portal.',
    });
    saveDatabase(db);

    const user: AdminUser = {
      id: newAccount.id,
      email: newAccount.email,
      name: newAccount.name,
      role: newAccount.role,
      departmentId: newAccount.departmentId,
    };
    const token = signSession(user);
    setSessionCookie(req, res, token, 86400);
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = verifySession(extractRequestToken(req));
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true, user });
  });

  // =========================================================
  // IMAGE UPLOAD ROUTE
  // =========================================================
  app.post('/api/uploads', (req: Request, res: Response) => {
    try {
      const { dataUrl, filename } = req.body as { dataUrl?: string; filename?: string };
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'Image dataUrl is required.' });
      }
      const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl);
      if (!match) {
        return res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are supported.' });
      }
      const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image must be 6MB or smaller.' });
      }
      const safeBase = (filename || 'evidence').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'evidence';
      const outName = `${safeBase}-${Date.now()}-${Math.floor(Math.random() * 1000)}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, outName), buffer);
      res.json({ url: `/uploads/${outName}` });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to store uploaded image.' });
    }
  });

  // =========================================================
  // PUBLIC API ROUTES (NO PRIVATE CITIZEN PII)
  // =========================================================
  app.get('/api/public/bootstrap', (req: Request, res: Response) => {
    const db = getDatabase();
    const escalations = processSlaEscalations(db);
    if (escalations > 0) {
      saveDatabase(db);
      broadcastPublicEvent('sla:swept', { summary: `${escalations} SLA escalation(s) triggered.` });
      broadcastAdminEvent('sla:swept', { summary: `${escalations} SLA escalation(s) triggered.` });
    }

    const rawWindow = String(req.query.window || '30d').toLowerCase();
    const windowMode = rawWindow === 'qtd' || rawWindow === 'annual' ? rawWindow : '30d';
    const windowFactor = windowMode === 'annual' ? 12 : windowMode === 'qtd' ? 3 : 1;

    const publicComplaints = db.complaints
      .filter((c) => c.isPublic && !c.masterIssueId)
      .map(sanitizeComplaintForPublic);

    const allTopLevel = db.complaints.filter((c) => !c.masterIssueId);
    const activeCount = allTopLevel.filter((c) => c.status !== 'Resolved' && c.status !== 'Closed').length;
    const resolvedCount = allTopLevel.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length;
    const overdueCount = allTopLevel.filter((c) => {
      if (c.status === 'Resolved' || c.status === 'Closed') return false;
      const deadlineMs = new Date(c.slaDeadline).getTime() + (c.fairSlaCreditHours || 0) * 3600 * 1000;
      return Date.now() > deadlineMs;
    }).length;

    const baseLeaderboard = buildDepartmentLeaderboard(db);
    const leaderboard = baseLeaderboard.map((row) => ({
      ...row,
      resolvedCount: Math.round(row.resolvedCount * (windowMode === '30d' ? 1 : windowMode === 'qtd' ? 2.8 : 10.6)),
    }));
    const baseWardPerf = buildWardPerformance(db);
    const wardPerformance = baseWardPerf.map((row) => ({
      ...row,
      resolvedCount: Math.round(row.resolvedCount * (windowMode === '30d' ? 1 : windowMode === 'qtd' ? 2.8 : 10.6)),
    }));

    const monthlyPerformance =
      windowMode === '30d'
        ? db.monthlyPerformance.slice(-4)
        : windowMode === 'qtd'
        ? db.monthlyPerformance.slice(-6)
        : db.monthlyPerformance;

    const avgCompliance =
      leaderboard.length > 0
        ? Number((leaderboard.reduce((acc, r) => acc + r.slaCompliancePct, 0) / leaderboard.length).toFixed(1))
        : 95.0;

    res.json({
      window: windowMode,
      wards: db.wards,
      slaPolicies: db.slaPolicies,
      complaints: publicComplaints,
      leaderboard,
      wardPerformance,
      monthlyPerformance,
      realtime: getRealtimeStats(),
      metrics: {
        totalTracked: allTopLevel.length,
        activeCount,
        resolvedCount,
        overdueCount,
        slaCompliancePct: avgCompliance,
        demoTotalResolvedHistorical: 1235 * windowFactor + resolvedCount,
      },
    });
  });

  app.get('/api/public/complaints/:id', (req: Request, res: Response) => {
    const db = getDatabase();
    const escalations = processSlaEscalations(db);
    if (escalations > 0) saveDatabase(db);

    const rawId = decodeURIComponent(req.params.id).trim().replace(/^#/, '').toUpperCase();
    const found = db.complaints.find((c) => c.id.toUpperCase() === rawId);
    if (!found) {
      return res.status(404).json({ error: `No civic issue found with ID #${rawId}.` });
    }

    // If this report was merged into a Master Work Order, include master info too
    const master = found.masterIssueId
      ? db.complaints.find((c) => c.id === found.masterIssueId)
      : null;

    res.json({
      complaint: sanitizeComplaintForPublic(found),
      masterComplaint: master ? sanitizeComplaintForPublic(master) : null,
      clusteredReportsCount: found.childReportIds.length,
    });
  });

  app.post('/api/public/complaints', (req: Request, res: Response) => {
    const db = getDatabase();
    const {
      title,
      description,
      category,
      subCategory,
      severity,
      wardId,
      address,
      lat,
      lng,
      mapX,
      mapY,
      observedDate,
      observedWindow,
      photoUrl,
      photoUrls,
      isPublic,
      reporterName,
      reporterContact,
    } = req.body as {
      title?: string;
      description?: string;
      category?: IssueCategory;
      subCategory?: string;
      severity?: IssueSeverity;
      wardId?: string;
      address?: string;
      lat?: number;
      lng?: number;
      mapX?: number;
      mapY?: number;
      observedDate?: string;
      observedWindow?: string;
      photoUrl?: string | null;
      photoUrls?: string[];
      isPublic?: boolean;
      reporterName?: string;
      reporterContact?: string;
    };

    if (!title || !description || !category || !wardId) {
      return res.status(400).json({ error: 'Title, description, category, and ward are required.' });
    }

    const ward = db.wards.find((w) => w.id === wardId) || db.wards[0];
    const ticketNum = db.nextTicketNumber;
    db.nextTicketNumber += 1;
    const id = `WW-${ticketNum}`;
    const createdAt = new Date().toISOString();
    const { slaHours, slaDeadline } = computeSlaDeadline(db, category, createdAt);
    const cleanPhotos = Array.isArray(photoUrls)
      ? photoUrls.filter((u) => typeof u === 'string' && u.length > 0).slice(0, 4)
      : photoUrl
      ? [photoUrl]
      : [];
    const primaryPhoto = cleanPhotos[0] || photoUrl || null;

    const complaint: Complaint = {
      id,
      version: 1,
      title: title.trim(),
      description: description.trim(),
      category,
      subCategory: subCategory?.trim(),
      severity: severity || 'Medium',
      status: 'Submitted',
      wardId: ward.id,
      wardName: `${ward.code} · ${ward.name}`,
      address: (address || `${ward.name} Sector`).trim(),
      lat: typeof lat === 'number' ? lat : ward.mapBounds.lat,
      lng: typeof lng === 'number' ? lng : ward.mapBounds.lng,
      mapX: typeof mapX === 'number' ? mapX : ward.mapBounds.centerX,
      mapY: typeof mapY === 'number' ? mapY : ward.mapBounds.centerY,
      observedDate: observedDate || createdAt.slice(0, 10),
      observedWindow: observedWindow || 'Current Window',
      photoUrl: primaryPhoto,
      photoUrls: cleanPhotos,
      photoHash: primaryPhoto ? `sha256:${makeHash(`photo:${id}:${primaryPhoto}`).slice(0, 16)}` : null,
      resolutionPhotoUrl: null,
      resolutionPhotoHash: null,
      resolutionNotes: null,
      recordHash: `0x${makeHash(`record:${id}:${createdAt}:${ward.id}`).slice(0, 32)}`,
      isPublic: isPublic !== false,
      isDemo: false, // Real citizen-submitted record
      reporterName: (reporterName || 'Anonymous Resident').trim(),
      reporterContact: (reporterContact || '').trim(),
      departmentId: 'default-queue',
      departmentName: 'Default Triage Queue',
      assignedOfficerId: null,
      assignedOfficerName: 'Pending Assignment',
      slaHours,
      slaDeadline,
      elapsedBeforeTransferHours: 0,
      fairSlaCreditHours: 0,
      escalationTier: 1,
      escalationHistory: [],
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'Submitted',
          note: 'Citizen report ingested with verified ward coordinates.',
          actor: 'Citizen Portal',
          timestamp: createdAt,
        },
      ],
      routingHistory: [],
      masterIssueId: null,
      childReportIds: [],
      citizenFeedback: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
      closedAt: null,
    };

    const routingEntry = routeComplaint(db, complaint);
    complaint.statusHistory.push({
      id: `sh-${Date.now() + 1}`,
      status: complaint.status,
      note: routingEntry.reason,
      actor: 'Routing Engine',
      timestamp: new Date().toISOString(),
    });

    db.complaints.unshift(complaint);

    // Notify administrative queue
    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      recipientRole: 'Dispatcher',
      title: `New Issue #${complaint.id} · ${complaint.category}`,
      message: `${complaint.title} in ${ward.code} auto-routed to ${complaint.departmentName} (${complaint.assignedOfficerName}).`,
      complaintId: complaint.id,
      createdAt: new Date().toISOString(),
      read: false,
      severity: complaint.severity === 'Critical' ? 'critical' : 'info',
    });

    // Check immediate duplicate candidates involving this complaint
    const candidates = detectDuplicates(db).filter(
      (d) => d.primaryId === complaint.id || d.secondaryId === complaint.id
    );
    if (candidates.length > 0) {
      db.notifications.unshift({
        id: `notif-dup-${Date.now()}`,
        recipientRole: 'Supervisor',
        title: `Duplicate Match Found · #${complaint.id}`,
        message: `New report #${complaint.id} matches existing issue #${
          candidates[0].primaryId === complaint.id ? candidates[0].secondaryId : candidates[0].primaryId
        } (${candidates[0].confidenceScore}% confidence).`,
        complaintId: complaint.id,
        createdAt: new Date().toISOString(),
        read: false,
        severity: 'warning',
      });
    }

    saveDatabase(db);
    const sanitized = sanitizeComplaintForPublic(complaint);
    if (complaint.isPublic) {
      broadcastPublicEvent('complaint:created', {
        complaintId: complaint.id,
        summary: `New civic report #${complaint.id} in ${ward.code} auto-routed to ${complaint.departmentName}.`,
        payload: sanitized,
      });
    }
    broadcastAdminEvent('complaint:created', {
      complaintId: complaint.id,
      summary: `New civic report #${complaint.id} (${complaint.severity}) ingested.`,
      payload: complaint,
    });

    res.status(201).json({
      complaint: sanitized,
      duplicateCandidates: candidates,
    });
  });

  app.post('/api/public/complaints/:id/feedback', (req: Request, res: Response) => {
    const db = getDatabase();
    const rawId = decodeURIComponent(req.params.id).trim().replace(/^#/, '').toUpperCase();
    const complaint = db.complaints.find((c) => c.id.toUpperCase() === rawId);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }
    if (complaint.status !== 'Resolved' && complaint.status !== 'Closed') {
      return res.status(400).json({ error: 'Feedback can only be submitted once the issue is Resolved or Closed.' });
    }
    const { rating, comment, rectified } = req.body as {
      rating?: number;
      comment?: string;
      rectified?: 'Yes' | 'Partially' | 'No';
    };
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating between 1 and 5 is required.' });
    }
    complaint.citizenFeedback = {
      rating: Math.round(rating),
      rectified: rectified || (rating >= 4 ? 'Yes' : rating === 3 ? 'Partially' : 'No'),
      comment: (comment || '').trim(),
      submittedAt: new Date().toISOString(),
    };
    if (complaint.status === 'Resolved' && rating >= 4) {
      complaint.status = 'Closed';
      complaint.closedAt = new Date().toISOString();
      complaint.statusHistory.push({
        id: `sh-${Date.now()}`,
        status: 'Closed',
        note: `Citizen verified resolution (${rating}/5 stars · Rectified: ${complaint.citizenFeedback.rectified}).`,
        actor: 'Citizen Sign-Off',
        timestamp: new Date().toISOString(),
      });
    }
    complaint.version = (complaint.version || 1) + 1;
    complaint.updatedAt = new Date().toISOString();
    saveDatabase(db);

    const sanitized = sanitizeComplaintForPublic(complaint);
    if (complaint.isPublic) {
      broadcastPublicEvent('complaint:updated', {
        complaintId: complaint.id,
        summary: `Citizen review submitted for #${complaint.id} (${rating}/5 stars).`,
        payload: sanitized,
      });
    }
    broadcastAdminEvent('complaint:updated', {
      complaintId: complaint.id,
      summary: `Citizen review submitted for #${complaint.id} (${rating}/5 stars).`,
      payload: complaint,
    });

    res.json({ complaint: sanitized });
  });

  app.get('/api/public/transparency/export.csv', (_req: Request, res: Response) => {
    const db = getDatabase();
    const header = 'ID,Title,Category,Severity,Status,Ward,Department,AssignedOfficer,SLAHours,SLADeadline,EscalationTier,IsDemo,CreatedAt,ResolvedAt\n';
    const rows = db.complaints
      .filter((c) => c.isPublic)
      .map((c) =>
        [
          c.id,
          `"${c.title.replace(/"/g, '""')}"`,
          `"${c.category}"`,
          c.severity,
          c.status,
          `"${c.wardName}"`,
          `"${c.departmentName}"`,
          `"${c.assignedOfficerName}"`,
          c.slaHours,
          c.slaDeadline,
          c.escalationTier,
          c.isDemo ? 'DEMO' : 'LIVE',
          c.createdAt,
          c.resolvedAt || '',
        ].join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wardwise-civic-ledger.csv"');
    res.send(header + rows);
  });

  app.get('/api/public/transparency/export.json', (_req: Request, res: Response) => {
    const db = getDatabase();
    const publicRecords = db.complaints
      .filter((c) => c.isPublic)
      .map(sanitizeComplaintForPublic);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wardwise-open-ledger.json"');
    res.json({
      schema: 'WARDWISE-OPEN-CIVIC-LEDGER-v2.0',
      exportedAt: new Date().toISOString(),
      piiPolicy: 'Zero private citizen identifiers exposed',
      recordCount: publicRecords.length,
      leaderboard: buildDepartmentLeaderboard(db),
      wardPerformance: buildWardPerformance(db),
      records: publicRecords,
    });
  });

  // =========================================================
  // PRIVATE ADMIN CONTROL ROOM ROUTES (/api/admin/*)
  // =========================================================
  app.get('/api/admin/state', requireAdmin(), (_req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const escalations = processSlaEscalations(db);
    if (escalations > 0) saveDatabase(db);

    res.json({
      wards: db.wards,
      departments: db.departments,
      officers: db.officers,
      routingRules: db.routingRules,
      slaPolicies: db.slaPolicies,
      complaints: db.complaints,
      auditLogs: db.auditLogs,
      notifications: db.notifications,
      duplicateCandidates: detectDuplicates(db),
      leaderboard: buildDepartmentLeaderboard(db),
      wardPerformance: buildWardPerformance(db),
      monthlyPerformance: db.monthlyPerformance,
    });
  });

  app.post('/api/admin/notifications/read-all', requireAdmin(), (_req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    for (const n of db.notifications) n.read = true;
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Update Complaint Status / Close / Reopen / Upload Resolution Evidence
  app.patch('/api/admin/complaints/:id', requireAdmin(), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const complaint = db.complaints.find((c) => c.id === req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const { status, resolutionNotes, resolutionPhotoUrl, reason, expectedVersion } = req.body as {
      status?: IssueStatus;
      resolutionNotes?: string;
      resolutionPhotoUrl?: string;
      reason?: string;
      expectedVersion?: number;
    };

    if (typeof expectedVersion === 'number' && expectedVersion !== (complaint.version || 1)) {
      return res.status(409).json({
        error: `Record #${complaint.id} was modified by another official (server v${complaint.version}, your view v${expectedVersion}).`,
        currentVersion: complaint.version,
        complaint,
      });
    }

    const prevStatus = complaint.status;
    if (status && status !== prevStatus) {
      // Policy check: Closing requires resolution notes or prior Resolved state
      if (status === 'Closed' && !resolutionNotes && !complaint.resolutionNotes) {
        return res.status(400).json({
          error: 'Policy requires resolution notes or evidence before closing a complaint.',
        });
      }
      if (status === 'Reopened' && prevStatus !== 'Closed' && prevStatus !== 'Resolved') {
        return res.status(400).json({ error: 'Only Resolved or Closed issues can be reopened.' });
      }
      complaint.status = status;
      if (status === 'Resolved') {
        complaint.resolvedAt = new Date().toISOString();
        for (const e of complaint.escalationHistory) e.resolved = true;
      }
      if (status === 'Closed') {
        complaint.closedAt = new Date().toISOString();
        if (!complaint.resolvedAt) complaint.resolvedAt = complaint.closedAt;
        for (const e of complaint.escalationHistory) e.resolved = true;
      }
      if (status === 'Reopened') {
        complaint.closedAt = null;
      }

      complaint.statusHistory.push({
        id: `sh-${Date.now()}`,
        status,
        note: reason || resolutionNotes || `Status updated from ${prevStatus} to ${status}.`,
        actor: `${actor.name} (${actor.role})`,
        timestamp: new Date().toISOString(),
      });

      appendAuditLog(db, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'STATUS_CHANGE',
        entityType: 'complaint',
        entityId: complaint.id,
        complaintId: complaint.id,
        previousValue: prevStatus,
        newValue: status,
        reason: reason || 'Administrative status transition',
      });
    }

    if (resolutionNotes !== undefined) {
      const prevNotes = complaint.resolutionNotes || 'None';
      complaint.resolutionNotes = resolutionNotes;
      if (resolutionNotes && resolutionNotes !== prevNotes) {
        appendAuditLog(db, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          action: 'RESOLUTION_EVIDENCE_UPDATED',
          entityType: 'complaint',
          entityId: complaint.id,
          complaintId: complaint.id,
          previousValue: prevNotes,
          newValue: resolutionNotes,
          reason: reason || 'Inspector uploaded field verification notes.',
        });
      }
    }

    if (resolutionPhotoUrl !== undefined) {
      complaint.resolutionPhotoUrl = resolutionPhotoUrl;
      complaint.resolutionPhotoHash = resolutionPhotoUrl
        ? `sha256:${makeHash(`resphoto:${complaint.id}:${resolutionPhotoUrl}`).slice(0, 16)}`
        : null;
    }

    complaint.version = (complaint.version || 1) + 1;
    complaint.updatedAt = new Date().toISOString();
    complaint.recordHash = `0x${makeHash(`record:${complaint.id}:${complaint.updatedAt}:${complaint.status}`).slice(0, 32)}`;
    saveDatabase(db);

    const eventType = complaint.status === 'Escalated' && prevStatus !== 'Escalated' ? 'complaint:escalated' : 'complaint:updated';
    if (complaint.isPublic) {
      broadcastPublicEvent(eventType, {
        complaintId: complaint.id,
        summary: `Issue #${complaint.id} updated to ${complaint.status}.`,
        payload: sanitizeComplaintForPublic(complaint),
      });
    }
    broadcastAdminEvent(eventType, {
      complaintId: complaint.id,
      summary: `Issue #${complaint.id} updated to ${complaint.status} by ${actor.name}.`,
      payload: complaint,
    });

    res.json({ complaint });
  });

  // Emergency Dispatch Unit Assignment
  app.post('/api/admin/complaints/:id/emergency-dispatch', requireAdmin(), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const complaint = db.complaints.find((c) => c.id === req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const { unitName, note, expectedVersion } = req.body as {
      unitName?: string;
      note?: string;
      expectedVersion?: number;
    };

    if (typeof expectedVersion === 'number' && expectedVersion !== (complaint.version || 1)) {
      return res.status(409).json({
        error: `Record #${complaint.id} was modified concurrently (v${complaint.version}).`,
        currentVersion: complaint.version,
        complaint,
      });
    }

    const chosenUnit = (unitName || 'Rapid Emergency Engineering Unit').trim();
    const dispatchNote = (note || `Emergency dispatch ordered by ${actor.name} (${actor.role}).`).trim();
    const prevStatus = complaint.status;
    complaint.status = 'In Progress';
    if (complaint.escalationTier < 2) {
      complaint.escalationTier = 2;
    }
    complaint.escalationHistory.push({
      id: `esc-emg-${Date.now()}`,
      tier: complaint.escalationTier,
      tierLabel: complaint.escalationTier === 3 ? 'Commissioner' : 'Supervisor',
      triggeredAt: new Date().toISOString(),
      reason: `Emergency Dispatch (${chosenUnit}): ${dispatchNote}`,
      assignedTo: chosenUnit,
      resolved: false,
    });
    complaint.statusHistory.push({
      id: `sh-emg-${Date.now()}`,
      status: 'In Progress',
      note: `Emergency unit "${chosenUnit}" dispatched. ${dispatchNote}`,
      actor: `${actor.name} (${actor.role})`,
      timestamp: new Date().toISOString(),
    });
    complaint.version = (complaint.version || 1) + 1;
    complaint.updatedAt = new Date().toISOString();

    db.notifications.unshift({
      id: `notif-emg-${Date.now()}`,
      recipientRole: 'Commissioner',
      title: `Emergency Dispatch · #${complaint.id}`,
      message: `${chosenUnit} deployed to ${complaint.wardName} (${complaint.title}).`,
      complaintId: complaint.id,
      createdAt: complaint.updatedAt,
      read: false,
      severity: 'critical',
    });

    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'EMERGENCY_DISPATCH',
      entityType: 'complaint',
      entityId: complaint.id,
      complaintId: complaint.id,
      previousValue: prevStatus,
      newValue: `Emergency Dispatch -> ${chosenUnit}`,
      reason: dispatchNote,
    });

    saveDatabase(db);

    if (complaint.isPublic) {
      broadcastPublicEvent('complaint:escalated', {
        complaintId: complaint.id,
        summary: `Emergency field unit dispatched to #${complaint.id}.`,
        payload: sanitizeComplaintForPublic(complaint),
      });
    }
    broadcastAdminEvent('complaint:escalated', {
      complaintId: complaint.id,
      summary: `${chosenUnit} dispatched to #${complaint.id} by ${actor.name}.`,
      payload: complaint,
    });

    res.json({ complaint });
  });

  // Reassign Department / Officer with mandatory reason
  app.post('/api/admin/complaints/:id/reassign', requireAdmin(), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const complaint = db.complaints.find((c) => c.id === req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const { departmentId, officerId, reason, expectedVersion } = req.body as {
      departmentId?: string;
      officerId?: string | null;
      reason?: string;
      expectedVersion?: number;
    };

    if (typeof expectedVersion === 'number' && expectedVersion !== (complaint.version || 1)) {
      return res.status(409).json({
        error: `Record #${complaint.id} was modified by another official (server v${complaint.version}, your view v${expectedVersion}).`,
        currentVersion: complaint.version,
        complaint,
      });
    }

    if (!reason || reason.trim().length < 4) {
      return res.status(400).json({ error: 'A reassignment reason is mandatory for audit integrity.' });
    }

    const dept = db.departments.find((d) => d.id === (departmentId || complaint.departmentId));
    if (!dept) return res.status(400).json({ error: 'Target department not found.' });

    const prevOfficer = db.officers.find((o) => o.id === complaint.assignedOfficerId);
    if (prevOfficer && prevOfficer.activeWorkload > 0) prevOfficer.activeWorkload -= 1;

    const newOfficer = officerId ? db.officers.find((o) => o.id === officerId) : null;
    if (newOfficer) newOfficer.activeWorkload += 1;

    const prevSummary = `${complaint.departmentName} · ${complaint.assignedOfficerName}`;
    complaint.departmentId = dept.id;
    complaint.departmentName = dept.name;
    complaint.assignedOfficerId = newOfficer ? newOfficer.id : null;
    complaint.assignedOfficerName = newOfficer ? newOfficer.name : `${dept.code} Dispatch Pool`;
    if (complaint.status === 'Submitted') complaint.status = 'Routed';
    complaint.version = (complaint.version || 1) + 1;
    complaint.updatedAt = new Date().toISOString();

    const newSummary = `${complaint.departmentName} · ${complaint.assignedOfficerName}`;

    complaint.routingHistory.push({
      id: `rh-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ruleId: null,
      ruleName: 'Manual Administrative Reassignment',
      departmentId: dept.id,
      departmentName: dept.name,
      officerId: complaint.assignedOfficerId,
      officerName: complaint.assignedOfficerName,
      reason: reason.trim(),
    });
    complaint.statusHistory.push({
      id: `sh-${Date.now()}`,
      status: complaint.status,
      note: `Reassigned to ${newSummary}. Reason: ${reason.trim()}`,
      actor: `${actor.name} (${actor.role})`,
      timestamp: new Date().toISOString(),
    });

    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'REASSIGN_COMPLAINT',
      entityType: 'complaint',
      entityId: complaint.id,
      complaintId: complaint.id,
      previousValue: prevSummary,
      newValue: newSummary,
      reason: reason.trim(),
    });

    saveDatabase(db);
    if (complaint.isPublic) {
      broadcastPublicEvent('complaint:updated', {
        complaintId: complaint.id,
        summary: `Issue #${complaint.id} reassigned to ${dept.name}.`,
        payload: sanitizeComplaintForPublic(complaint),
      });
    }
    broadcastAdminEvent('complaint:updated', {
      complaintId: complaint.id,
      summary: `Issue #${complaint.id} reassigned to ${newSummary}.`,
      payload: complaint,
    });
    res.json({ complaint });
  });

  // Routing Rules CRUD
  app.post('/api/admin/routing-rules', requireAdmin(['Commissioner', 'Supervisor']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const { name, category, wardId, departmentId, strategy, specificOfficerId, priority } = req.body as {
      name?: string;
      category?: IssueCategory | 'ALL';
      wardId?: string;
      departmentId?: string;
      strategy?: 'lowest_workload' | 'specific_officer' | 'ward_lead';
      specificOfficerId?: string | null;
      priority?: number;
    };
    if (!name || !category || !wardId || !departmentId) {
      return res.status(400).json({ error: 'Rule name, category, ward, and department are required.' });
    }
    const rule = {
      id: `rule-${Date.now()}`,
      name: name.trim(),
      category,
      wardId,
      departmentId,
      strategy: strategy || 'lowest_workload',
      specificOfficerId: specificOfficerId || null,
      priority: Number(priority || db.routingRules.length + 1),
      active: true,
    };
    db.routingRules.push(rule);
    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'CREATE_ROUTING_RULE',
      entityType: 'routing_rule',
      entityId: rule.id,
      complaintId: null,
      previousValue: 'None',
      newValue: `${rule.name} (${rule.category} · ${rule.wardId} -> ${rule.departmentId})`,
      reason: 'Added automated dispatch rule.',
    });
    saveDatabase(db);
    broadcastAdminEvent('routing:updated', { summary: `Routing rule "${rule.name}" created.` });
    res.status(201).json({ rule });
  });

  app.patch('/api/admin/routing-rules/:id', requireAdmin(['Commissioner', 'Supervisor']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const rule = db.routingRules.find((r) => r.id === req.params.id);
    if (!rule) return res.status(404).json({ error: 'Routing rule not found.' });
    const prev = JSON.stringify(rule);
    Object.assign(rule, req.body);
    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'UPDATE_ROUTING_RULE',
      entityType: 'routing_rule',
      entityId: rule.id,
      complaintId: null,
      previousValue: prev,
      newValue: JSON.stringify(rule),
      reason: 'Updated routing configuration.',
    });
    saveDatabase(db);
    broadcastAdminEvent('routing:updated', { summary: `Routing rule "${rule.name}" updated.` });
    res.json({ rule });
  });

  app.delete('/api/admin/routing-rules/:id', requireAdmin(['Commissioner', 'Supervisor']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const idx = db.routingRules.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Routing rule not found.' });
    const [removed] = db.routingRules.splice(idx, 1);
    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'DELETE_ROUTING_RULE',
      entityType: 'routing_rule',
      entityId: removed.id,
      complaintId: null,
      previousValue: removed.name,
      newValue: 'Deleted',
      reason: 'Removed routing rule from engine.',
    });
    saveDatabase(db);
    broadcastAdminEvent('routing:updated', { summary: `Routing rule "${removed.name}" deleted.` });
    res.json({ ok: true });
  });

  // SLA Policies & Sweep
  app.patch('/api/admin/sla-policies/:category', requireAdmin(['Commissioner', 'Supervisor']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const category = decodeURIComponent(req.params.category) as IssueCategory;
    const policy = db.slaPolicies.find((p) => p.category === category);
    if (!policy) return res.status(404).json({ error: 'SLA policy not found.' });
    const prev = `${policy.targetHours}h target / +${policy.tier3BreachHours}h Tier 3`;
    if (typeof req.body.targetHours === 'number') policy.targetHours = Math.max(1, req.body.targetHours);
    if (typeof req.body.warningThresholdPct === 'number') policy.warningThresholdPct = Math.min(95, Math.max(30, req.body.warningThresholdPct));
    if (typeof req.body.tier3BreachHours === 'number') policy.tier3BreachHours = Math.max(1, req.body.tier3BreachHours);

    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'UPDATE_SLA_POLICY',
      entityType: 'sla_policy',
      entityId: category,
      complaintId: null,
      previousValue: prev,
      newValue: `${policy.targetHours}h target / +${policy.tier3BreachHours}h Tier 3`,
      reason: 'Updated municipal category SLA ordinance policy.',
    });
    saveDatabase(db);
    broadcastPublicEvent('sla:updated', { summary: `SLA policy updated for ${category}.` });
    broadcastAdminEvent('sla:updated', { summary: `SLA policy updated for ${category}.` });
    res.json({ policy });
  });

  app.post('/api/admin/sla/sweep', requireAdmin(), (_req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const escalationsCreated = processSlaEscalations(db);
    saveDatabase(db);
    broadcastPublicEvent('sla:swept', { summary: `Manual SLA sweep completed (${escalationsCreated} escalation(s)).` });
    broadcastAdminEvent('sla:swept', { summary: `Manual SLA sweep completed (${escalationsCreated} escalation(s)).` });
    res.json({ escalationsCreated });
  });

  // Duplicate Merge & Separate
  app.post('/api/admin/duplicates/merge', requireAdmin(), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const { primaryId, secondaryId, reason } = req.body as {
      primaryId?: string;
      secondaryId?: string;
      reason?: string;
    };
    const primary = db.complaints.find((c) => c.id === primaryId);
    const secondary = db.complaints.find((c) => c.id === secondaryId);
    if (!primary || !secondary || primary.id === secondary.id) {
      return res.status(400).json({ error: 'Valid distinct primary and secondary complaint IDs are required.' });
    }
    if (secondary.masterIssueId === primary.id) {
      return res.status(400).json({ error: 'Complaint is already merged under this master issue.' });
    }

    secondary.masterIssueId = primary.id;
    secondary.version = (secondary.version || 1) + 1;
    secondary.updatedAt = new Date().toISOString();
    primary.version = (primary.version || 1) + 1;
    primary.updatedAt = secondary.updatedAt;
    if (!primary.childReportIds.includes(secondary.id)) {
      primary.childReportIds.push(secondary.id);
    }
    secondary.statusHistory.push({
      id: `sh-${Date.now()}`,
      status: secondary.status,
      note: `Clustered under Master Work Order #${primary.id}. Original submission preserved.`,
      actor: `${actor.name} (${actor.role})`,
      timestamp: new Date().toISOString(),
    });
    primary.statusHistory.push({
      id: `sh-${Date.now() + 1}`,
      status: primary.status,
      note: `Linked duplicate report #${secondary.id} into coordinated work order.`,
      actor: `${actor.name} (${actor.role})`,
      timestamp: new Date().toISOString(),
    });

    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'MERGE_DUPLICATE_CLUSTER',
      entityType: 'duplicate_cluster',
      entityId: primary.id,
      complaintId: secondary.id,
      previousValue: 'Independent report',
      newValue: `Merged under Master #${primary.id}`,
      reason: reason || 'Proximity and description similarity verified.',
    });

    saveDatabase(db);
    broadcastPublicEvent('duplicate:merged', {
      complaintId: primary.id,
      summary: `Duplicate #${secondary.id} clustered under Master #${primary.id}.`,
    });
    broadcastAdminEvent('duplicate:merged', {
      complaintId: primary.id,
      summary: `Duplicate #${secondary.id} merged under Master #${primary.id}.`,
    });
    res.json({ primary, secondary });
  });

  app.post('/api/admin/duplicates/separate', requireAdmin(), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const { secondaryId, reason } = req.body as { secondaryId?: string; reason?: string };
    const secondary = db.complaints.find((c) => c.id === secondaryId);
    if (!secondary || !secondary.masterIssueId) {
      return res.status(400).json({ error: 'Complaint is not currently clustered under a master issue.' });
    }
    const prevMasterId = secondary.masterIssueId;
    const master = db.complaints.find((c) => c.id === prevMasterId);
    if (master) {
      master.childReportIds = master.childReportIds.filter((id) => id !== secondary.id);
      master.version = (master.version || 1) + 1;
      master.updatedAt = new Date().toISOString();
    }
    secondary.masterIssueId = null;
    secondary.version = (secondary.version || 1) + 1;
    secondary.updatedAt = new Date().toISOString();
    secondary.statusHistory.push({
      id: `sh-${Date.now()}`,
      status: secondary.status,
      note: `Separated from Master #${prevMasterId} into independent ticket.`,
      actor: `${actor.name} (${actor.role})`,
      timestamp: new Date().toISOString(),
    });

    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'SEPARATE_DUPLICATE',
      entityType: 'duplicate_cluster',
      entityId: prevMasterId,
      complaintId: secondary.id,
      previousValue: `Merged under #${prevMasterId}`,
      newValue: 'Independent ticket',
      reason: reason || 'Separated after administrative review.',
    });

    saveDatabase(db);
    broadcastPublicEvent('duplicate:separated', {
      complaintId: secondary.id,
      summary: `Ticket #${secondary.id} separated into independent work order.`,
    });
    broadcastAdminEvent('duplicate:separated', {
      complaintId: secondary.id,
      summary: `Ticket #${secondary.id} separated from #${prevMasterId}.`,
    });
    res.json({ secondary });
  });

  // Department & Officer Management
  app.post('/api/admin/departments', requireAdmin(['Commissioner']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const { code, name, description, categories, slaTargetPct } = req.body as {
      code?: string;
      name?: string;
      description?: string;
      categories?: IssueCategory[];
      slaTargetPct?: number;
    };
    if (!code || !name) return res.status(400).json({ error: 'Code and name are required.' });
    const dept = {
      id: `dept-${Date.now()}`,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: (description || '').trim(),
      categories: categories || [],
      active: true,
      mergedIntoId: null,
      slaTargetPct: Number(slaTargetPct || 93),
      avgResponseHoursBase: 3.0,
    };
    db.departments.push(dept);
    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'CREATE_DEPARTMENT',
      entityType: 'department',
      entityId: dept.id,
      complaintId: null,
      previousValue: 'None',
      newValue: `${dept.code} · ${dept.name}`,
      reason: 'Created municipal department.',
    });
    saveDatabase(db);
    broadcastPublicEvent('org:updated', { summary: `Municipal bureau ${dept.code} established.` });
    broadcastAdminEvent('org:updated', { summary: `Department ${dept.code} · ${dept.name} created.` });
    res.status(201).json({ department: dept });
  });

  app.post('/api/admin/officers', requireAdmin(['Commissioner', 'Supervisor']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const { name, title, role, email, departmentId, wardIds, maxCapacity } = req.body as {
      name?: string;
      title?: string;
      role?: 'Officer' | 'Supervisor' | 'Commissioner';
      email?: string;
      departmentId?: string;
      wardIds?: string[];
      maxCapacity?: number;
    };
    if (!name || !departmentId) return res.status(400).json({ error: 'Name and department are required.' });
    const officer = {
      id: `off-${Date.now()}`,
      name: name.trim(),
      title: (title || 'Field Inspector').trim(),
      role: role || 'Officer',
      email: (email || `${name.toLowerCase().replace(/[^a-z]/g, '')}@wardwise.gov`).trim(),
      departmentId,
      wardIds: wardIds && wardIds.length > 0 ? wardIds : ['w01'],
      maxCapacity: Number(maxCapacity || 8),
      activeWorkload: 0,
      eligible: true,
    };
    db.officers.push(officer);
    appendAuditLog(db, {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'CREATE_OFFICER',
      entityType: 'officer',
      entityId: officer.id,
      complaintId: null,
      previousValue: 'None',
      newValue: `${officer.name} (${officer.role})`,
      reason: 'Registered new municipal officer.',
    });
    saveDatabase(db);
    broadcastAdminEvent('org:updated', { summary: `Officer ${officer.name} registered.` });
    res.status(201).json({ officer });
  });

  // Department Reorganization (Preview & Confirmed Execute)
  app.post('/api/admin/reorg/preview', requireAdmin(['Commissioner']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const preview = previewReorganization(db, req.body);
    res.json({ preview });
  });

  app.post('/api/admin/reorg/execute', requireAdmin(['Commissioner']), (req: AuthedRequest, res: Response) => {
    const db = getDatabase();
    const actor = req.adminUser!;
    const {
      type,
      sourceDepartmentId,
      targetDepartmentId,
      newDepartmentName,
      newDepartmentCode,
      officerId,
      wardId,
      categoriesToSplit,
      reason,
      confirmed,
    } = req.body as {
      type: 'merge' | 'split' | 'officer_transfer' | 'ward_transfer';
      sourceDepartmentId?: string;
      targetDepartmentId?: string;
      newDepartmentName?: string;
      newDepartmentCode?: string;
      officerId?: string;
      wardId?: string;
      categoriesToSplit?: IssueCategory[];
      reason?: string;
      confirmed?: boolean;
    };

    if (!confirmed) {
      return res.status(400).json({ error: 'Administrative confirmation is required before migrating records.' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'A formal reorganization reason is mandatory.' });
    }

    const preview = previewReorganization(db, req.body);
    if (preview.warnings.length > 0) {
      return res.status(400).json({ error: preview.warnings[0] });
    }

    const nowIso = new Date().toISOString();
    let migratedCount = 0;

    const applyFairSlaCredit = (c: Complaint, newDeptId: string, newDeptName: string, note: string) => {
      const elapsedHrs = Math.max(0, (Date.now() - new Date(c.createdAt).getTime()) / (3600 * 1000));
      c.elapsedBeforeTransferHours = Number(elapsedHrs.toFixed(2));
      // Fair SLA protection: if issue was already close to or past deadline prior to reorg,
      // grant incoming unit fair transition credit so new officers aren't penalized for historical delays,
      // while preserving original createdAt & escalationHistory intact!
      const remainingHrs = (new Date(c.slaDeadline).getTime() - Date.now()) / (3600 * 1000);
      if (remainingHrs < 4) {
        c.fairSlaCreditHours = Number(((c.fairSlaCreditHours || 0) + Math.max(6, Math.abs(remainingHrs) + 6)).toFixed(1));
      }
      const prevDept = c.departmentName;
      c.departmentId = newDeptId;
      c.departmentName = newDeptName;
      c.version = (c.version || 1) + 1;
      c.updatedAt = nowIso;
      c.routingHistory.push({
        id: `rh-reorg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: nowIso,
        ruleId: null,
        ruleName: 'Institutional Reorganization Migration',
        departmentId: newDeptId,
        departmentName: newDeptName,
        officerId: c.assignedOfficerId,
        officerName: c.assignedOfficerName,
        reason: note,
      });
      c.statusHistory.push({
        id: `sh-reorg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        status: c.status,
        note: `${note} (Original filing date & ${c.elapsedBeforeTransferHours}h elapsed history preserved; Fair SLA Credit: +${c.fairSlaCreditHours}h).`,
        actor: `${actor.name} (Reorganization)`,
        timestamp: nowIso,
      });
      appendAuditLog(db, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'REORG_MIGRATE_COMPLAINT',
        entityType: 'reorganization',
        entityId: c.id,
        complaintId: c.id,
        previousValue: prevDept,
        newValue: newDeptName,
        reason: reason.trim(),
      });
      migratedCount += 1;
    };

    if (type === 'merge') {
      const src = db.departments.find((d) => d.id === sourceDepartmentId)!;
      const tgt = db.departments.find((d) => d.id === targetDepartmentId)!;
      src.active = false;
      src.mergedIntoId = tgt.id;
      for (const cat of src.categories) {
        if (!tgt.categories.includes(cat)) tgt.categories.push(cat);
      }
      for (const o of db.officers) {
        if (o.departmentId === src.id) o.departmentId = tgt.id;
      }
      for (const r of db.routingRules) {
        if (r.departmentId === src.id) r.departmentId = tgt.id;
      }
      for (const c of db.complaints) {
        if (c.departmentId === src.id && c.status !== 'Closed') {
          applyFairSlaCredit(c, tgt.id, tgt.name, `Merged ${src.name} -> ${tgt.name}.`);
        }
      }
      appendAuditLog(db, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'DEPARTMENT_MERGE',
        entityType: 'reorganization',
        entityId: tgt.id,
        complaintId: null,
        previousValue: `${src.code} (${src.name})`,
        newValue: `Merged into ${tgt.code} (${tgt.name}) · ${migratedCount} open issues migrated`,
        reason: reason.trim(),
      });
    } else if (type === 'split') {
      const src = db.departments.find((d) => d.id === sourceDepartmentId)!;
      const cats = categoriesToSplit || [];
      const newDept = {
        id: `dept-${Date.now()}`,
        code: (newDepartmentCode || 'NEW').trim().toUpperCase(),
        name: (newDepartmentName || 'Spun-Off Municipal Bureau').trim(),
        description: `Spun off from ${src.name} to govern ${cats.join(', ')}.`,
        categories: cats,
        active: true,
        mergedIntoId: null,
        slaTargetPct: src.slaTargetPct,
        avgResponseHoursBase: src.avgResponseHoursBase,
      };
      db.departments.push(newDept);
      src.categories = src.categories.filter((c) => !cats.includes(c));
      for (const r of db.routingRules) {
        if (r.departmentId === src.id && r.category !== 'ALL' && cats.includes(r.category)) {
          r.departmentId = newDept.id;
        }
      }
      for (const c of db.complaints) {
        if (c.departmentId === src.id && cats.includes(c.category) && c.status !== 'Closed') {
          applyFairSlaCredit(c, newDept.id, newDept.name, `Split ${src.name} -> ${newDept.name}.`);
        }
      }
      appendAuditLog(db, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'DEPARTMENT_SPLIT',
        entityType: 'reorganization',
        entityId: newDept.id,
        complaintId: null,
        previousValue: src.name,
        newValue: `${newDept.name} (${cats.join(', ')}) · ${migratedCount} open issues migrated`,
        reason: reason.trim(),
      });
    } else if (type === 'officer_transfer') {
      const off = db.officers.find((o) => o.id === officerId)!;
      const tgt = db.departments.find((d) => d.id === targetDepartmentId)!;
      const prevDeptId = off.departmentId;
      off.departmentId = tgt.id;
      for (const c of db.complaints) {
        if (c.assignedOfficerId === off.id && c.status !== 'Closed' && c.status !== 'Resolved') {
          applyFairSlaCredit(c, tgt.id, tgt.name, `Officer ${off.name} transferred to ${tgt.name}.`);
        }
      }
      appendAuditLog(db, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'OFFICER_TRANSFER',
        entityType: 'reorganization',
        entityId: off.id,
        complaintId: null,
        previousValue: prevDeptId,
        newValue: `${tgt.name} · ${migratedCount} active tickets migrated`,
        reason: reason.trim(),
      });
    } else if (type === 'ward_transfer') {
      const ward = db.wards.find((w) => w.id === wardId)!;
      const tgt = db.departments.find((d) => d.id === targetDepartmentId)!;
      const prevDept = ward.primaryDepartmentId;
      ward.primaryDepartmentId = tgt.id;
      for (const r of db.routingRules) {
        if (r.wardId === ward.id) r.departmentId = tgt.id;
      }
      for (const c of db.complaints) {
        if (c.wardId === ward.id && c.status !== 'Closed') {
          applyFairSlaCredit(c, tgt.id, tgt.name, `Ward ${ward.code} jurisdiction transferred to ${tgt.name}.`);
        }
      }
      appendAuditLog(db, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'WARD_JURISDICTION_TRANSFER',
        entityType: 'reorganization',
        entityId: ward.id,
        complaintId: null,
        previousValue: prevDept,
        newValue: `${tgt.name} · ${migratedCount} issues migrated`,
        reason: reason.trim(),
      });
    }

    saveDatabase(db);
    broadcastPublicEvent('reorg:executed', {
      summary: `Institutional reorganization (${type}) migrated ${migratedCount} open complaint(s) with Fair SLA Credit preserved.`,
    });
    broadcastAdminEvent('reorg:executed', {
      summary: `Reorganization (${type}) executed by ${actor.name}; ${migratedCount} open ticket(s) migrated.`,
    });
    res.json({ ok: true, migratedCount });
  });

  // =========================================================
  // VITE DEV MIDDLEWARE OR PRODUCTION DIST SERVING
  // =========================================================
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist/index.html'));
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WARDWISE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start WARDWISE server:', err);
  process.exit(1);
});
