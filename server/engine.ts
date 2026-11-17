import crypto from 'node:crypto';
import type {
  AuditLogEntry,
  Complaint,
  DepartmentLeaderboardRow,
  DuplicateCandidate,
  IssueCategory,
  Officer,
  ReorgPreviewResult,
  RoutingHistoryEntry,
  WardPerformanceRow,
} from '../src/types/wardwise.ts';
import type { WardwiseDatabase } from './seed.ts';

export function makeHash(payload: string): string {
  return crypto.createHash('sha256').update(payload + Date.now().toString()).digest('hex').slice(0, 40);
}

export function appendAuditLog(
  db: WardwiseDatabase,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'hash'>
): AuditLogEntry {
  const full: AuditLogEntry = {
    ...entry,
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: new Date().toISOString(),
    hash: makeHash(`${entry.action}:${entry.entityId}:${entry.previousValue}:${entry.newValue}`),
  };
  db.auditLogs.unshift(full);
  return full;
}

export function computeSlaDeadline(db: WardwiseDatabase, category: IssueCategory, createdAtIso?: string): {
  slaHours: number;
  slaDeadline: string;
} {
  const policy = db.slaPolicies.find((p) => p.category === category);
  const slaHours = policy ? policy.targetHours : 24;
  const baseMs = createdAtIso ? new Date(createdAtIso).getTime() : Date.now();
  return {
    slaHours,
    slaDeadline: new Date(baseMs + slaHours * 3600 * 1000).toISOString(),
  };
}

export function routeComplaint(
  db: WardwiseDatabase,
  complaint: Complaint,
  actorName = 'WARDWISE Routing Engine'
): RoutingHistoryEntry {
  const activeRules = db.routingRules
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority);

  // Exact ward + category match first, then ALL wards + category, then ALL + ALL
  const matchedRule =
    activeRules.find((r) => r.category === complaint.category && r.wardId === complaint.wardId) ||
    activeRules.find((r) => r.category === complaint.category && r.wardId === 'ALL') ||
    activeRules.find((r) => r.category === 'ALL' && r.wardId === complaint.wardId) ||
    activeRules.find((r) => r.category === 'ALL' && r.wardId === 'ALL') ||
    null;

  if (!matchedRule) {
    complaint.departmentId = 'default-queue';
    complaint.departmentName = 'Default Triage Queue';
    complaint.assignedOfficerId = null;
    complaint.assignedOfficerName = 'Unassigned (Default Queue)';
    complaint.status = 'Submitted';
    const entry: RoutingHistoryEntry = {
      id: `rh-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ruleId: null,
      ruleName: 'Fallback Default Queue',
      departmentId: 'default-queue',
      departmentName: 'Default Triage Queue',
      officerId: null,
      officerName: 'Unassigned (Default Queue)',
      reason: 'No active routing rule matched category and ward; queued for dispatcher review.',
    };
    complaint.routingHistory.push(entry);
    return entry;
  }

  const dept = db.departments.find((d) => d.id === matchedRule.departmentId && d.active);
  if (!dept) {
    complaint.departmentId = 'default-queue';
    complaint.departmentName = 'Default Triage Queue';
    complaint.assignedOfficerId = null;
    complaint.assignedOfficerName = 'Unassigned (Default Queue)';
    const entry: RoutingHistoryEntry = {
      id: `rh-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ruleId: matchedRule.id,
      ruleName: matchedRule.name,
      departmentId: 'default-queue',
      departmentName: 'Default Triage Queue',
      officerId: null,
      officerName: 'Unassigned (Default Queue)',
      reason: 'Target department inactive; placed in Default Triage Queue.',
    };
    complaint.routingHistory.push(entry);
    return entry;
  }

  const eligibleOfficers = db.officers.filter(
    (o) =>
      o.eligible &&
      o.departmentId === dept.id &&
      o.activeWorkload < o.maxCapacity &&
      (o.wardIds.includes(complaint.wardId) || o.role !== 'Officer')
  );

  let chosenOfficer: Officer | null = null;
  if (matchedRule.strategy === 'specific_officer' && matchedRule.specificOfficerId) {
    chosenOfficer = eligibleOfficers.find((o) => o.id === matchedRule.specificOfficerId) || null;
  } else if (matchedRule.strategy === 'ward_lead') {
    chosenOfficer =
      eligibleOfficers.find((o) => o.wardIds.includes(complaint.wardId) && o.role === 'Supervisor') ||
      eligibleOfficers.sort((a, b) => a.activeWorkload - b.activeWorkload)[0] ||
      null;
  }

  if (!chosenOfficer && eligibleOfficers.length > 0) {
    chosenOfficer = eligibleOfficers.sort((a, b) => a.activeWorkload - b.activeWorkload)[0];
  }
  if (!chosenOfficer) {
    const anyDeptOfficer = db.officers
      .filter((o) => o.eligible && o.departmentId === dept.id)
      .sort((a, b) => a.activeWorkload - b.activeWorkload)[0];
    chosenOfficer = anyDeptOfficer || null;
  }

  complaint.departmentId = dept.id;
  complaint.departmentName = dept.name;
  complaint.assignedOfficerId = chosenOfficer ? chosenOfficer.id : null;
  complaint.assignedOfficerName = chosenOfficer ? chosenOfficer.name : `${dept.code} Dispatch Pool`;
  complaint.status = 'Routed';

  if (chosenOfficer) {
    chosenOfficer.activeWorkload += 1;
  }

  const entry: RoutingHistoryEntry = {
    id: `rh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ruleId: matchedRule.id,
    ruleName: matchedRule.name,
    departmentId: dept.id,
    departmentName: dept.name,
    officerId: chosenOfficer ? chosenOfficer.id : null,
    officerName: complaint.assignedOfficerName,
    reason: `Matched rule "${matchedRule.name}" (${matchedRule.strategy}) -> ${complaint.assignedOfficerName}.`,
  };
  complaint.routingHistory.push(entry);

  appendAuditLog(db, {
    actorId: 'system-router',
    actorName,
    actorRole: 'System',
    action: 'AUTO_ROUTE',
    entityType: 'complaint',
    entityId: complaint.id,
    complaintId: complaint.id,
    previousValue: 'Unassigned',
    newValue: `${dept.name} · ${complaint.assignedOfficerName}`,
    reason: entry.reason,
  });

  return entry;
}

export function processSlaEscalations(db: WardwiseDatabase): number {
  let escalationsCreated = 0;
  const nowMs = Date.now();

  for (const c of db.complaints) {
    if (c.status === 'Resolved' || c.status === 'Closed' || c.masterIssueId) {
      continue;
    }

    const policy = db.slaPolicies.find((p) => p.category === c.category);
    const deadlineMs = new Date(c.slaDeadline).getTime() + (c.fairSlaCreditHours || 0) * 3600 * 1000;
    const overdueHours = (nowMs - deadlineMs) / (3600 * 1000);
    const totalWindowMs = c.slaHours * 3600 * 1000;
    const consumedPct = ((nowMs - new Date(c.createdAt).getTime()) / Math.max(totalWindowMs, 1)) * 100;

    const hasTier2 = c.escalationHistory.some((e) => e.tier === 2);
    const hasTier3 = c.escalationHistory.some((e) => e.tier === 3);

    const tier3BreachHours = policy ? policy.tier3BreachHours : 6;
    const warningPct = policy ? policy.warningThresholdPct : 75;

    // Escalate to Tier 2 (Supervisor) upon deadline breach or critical >= warningPct
    if (!hasTier2 && (overdueHours > 0 || (c.severity === 'Critical' && consumedPct >= warningPct))) {
      const supervisor =
        db.officers.find((o) => o.departmentId === c.departmentId && o.role === 'Supervisor') ||
        db.officers.find((o) => o.role === 'Supervisor');
      const supervisorName = supervisor ? supervisor.name : 'Department Duty Supervisor';
      const reason =
        overdueHours > 0
          ? `SLA deadline breached (+${overdueHours.toFixed(1)}h overdue). Escalated from Officer to Supervisor.`
          : `Critical severity issue consumed ${Math.round(consumedPct)}% of SLA window; preemptive Supervisor escalation.`;

      c.escalationTier = 2;
      c.status = 'Escalated';
      c.version = (c.version || 1) + 1;
      c.updatedAt = new Date().toISOString();
      c.escalationHistory.push({
        id: `esc-${c.id}-t2`,
        tier: 2,
        tierLabel: 'Supervisor',
        triggeredAt: new Date().toISOString(),
        reason,
        assignedTo: supervisorName,
        resolved: false,
      });
      c.statusHistory.push({
        id: `sh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        status: 'Escalated',
        note: reason,
        actor: 'SLA Enforcer',
        timestamp: new Date().toISOString(),
      });
      db.notifications.unshift({
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        recipientRole: 'Supervisor',
        title: `Tier 2 Escalation · #${c.id}`,
        message: `${c.title} (${c.wardName}) escalated to ${supervisorName}.`,
        complaintId: c.id,
        createdAt: new Date().toISOString(),
        read: false,
        severity: 'warning',
      });
      appendAuditLog(db, {
        actorId: 'system-sla',
        actorName: 'WARDWISE SLA Enforcer',
        actorRole: 'System',
        action: 'SLA_ESCALATION_TIER_2',
        entityType: 'complaint',
        entityId: c.id,
        complaintId: c.id,
        previousValue: 'Tier 1 (Officer)',
        newValue: `Tier 2 (Supervisor · ${supervisorName})`,
        reason,
      });
      escalationsCreated += 1;
    }

    // Escalate to Tier 3 (Commissioner) after prolonged breach
    if (!hasTier3 && overdueHours >= tier3BreachHours) {
      const commissioner = db.officers.find((o) => o.role === 'Commissioner');
      const commName = commissioner ? commissioner.name : 'City Operations Commissioner';
      const reason = `Extended breach (+${overdueHours.toFixed(1)}h past SLA deadline, exceeds +${tier3BreachHours}h Tier 3 threshold).`;

      c.escalationTier = 3;
      c.status = 'Escalated';
      c.version = (c.version || 1) + 1;
      c.updatedAt = new Date().toISOString();
      c.escalationHistory.push({
        id: `esc-${c.id}-t3`,
        tier: 3,
        tierLabel: 'Commissioner',
        triggeredAt: new Date().toISOString(),
        reason,
        assignedTo: commName,
        resolved: false,
      });
      c.statusHistory.push({
        id: `sh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        status: 'Escalated',
        note: reason,
        actor: 'SLA Enforcer',
        timestamp: new Date().toISOString(),
      });
      db.notifications.unshift({
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        recipientRole: 'Commissioner',
        title: `Tier 3 Critical Breach · #${c.id}`,
        message: `${c.title} escalated to ${commName}.`,
        complaintId: c.id,
        createdAt: new Date().toISOString(),
        read: false,
        severity: 'critical',
      });
      appendAuditLog(db, {
        actorId: 'system-sla',
        actorName: 'WARDWISE SLA Enforcer',
        actorRole: 'System',
        action: 'SLA_ESCALATION_TIER_3',
        entityType: 'complaint',
        entityId: c.id,
        complaintId: c.id,
        previousValue: 'Tier 2 (Supervisor)',
        newValue: `Tier 3 (Commissioner · ${commName})`,
        reason,
      });
      escalationsCreated += 1;
    }
  }

  return escalationsCreated;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectDuplicates(db: WardwiseDatabase): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const active = db.complaints.filter((c) => !c.masterIssueId && c.status !== 'Closed');

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      if (a.category !== b.category) continue;

      const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      const gridDist = Math.hypot(a.mapX - b.mapX, a.mapY - b.mapY);
      const effectiveDist = Math.min(dist, gridDist * 65);
      if (effectiveDist > 450 && a.wardId !== b.wardId) continue;

      const timeDeltaHours = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) / (3600 * 1000);
      if (timeDeltaHours > 96) continue;

      const textSim = jaccardSimilarity(`${a.title} ${a.description}`, `${b.title} ${b.description}`);
      if (effectiveDist <= 350 || textSim >= 0.2) {
        const proximityScore = Math.max(0, 1 - effectiveDist / 500);
        const timeScore = Math.max(0, 1 - timeDeltaHours / 96);
        const confidence = Math.min(99, Math.round((proximityScore * 0.45 + textSim * 0.35 + timeScore * 0.2) * 100));
        if (confidence >= 45) {
          const older = new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? a : b;
          const newer = older.id === a.id ? b : a;
          candidates.push({
            pairId: `${older.id}__${newer.id}`,
            primaryId: older.id,
            secondaryId: newer.id,
            distanceMeters: Math.round(effectiveDist),
            textSimilarity: Math.round(textSim * 100),
            timeDeltaHours: Number(timeDeltaHours.toFixed(1)),
            confidenceScore: confidence,
            reason: `Same category (${a.category}), ${Math.round(effectiveDist)}m proximity, ${Math.round(textSim * 100)}% lexical overlap within ${timeDeltaHours.toFixed(1)}h.`,
          });
        }
      }
    }
  }

  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function buildDepartmentLeaderboard(db: WardwiseDatabase): DepartmentLeaderboardRow[] {
  const rows: DepartmentLeaderboardRow[] = [];

  for (const dept of db.departments.filter((d) => d.active)) {
    const deptComplaints = db.complaints.filter((c) => c.departmentId === dept.id && !c.masterIssueId);
    const activeBacklog = deptComplaints.filter((c) => c.status !== 'Resolved' && c.status !== 'Closed').length;
    const resolved = deptComplaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed');
    const resolvedCount = resolved.length + (dept.code === 'WSA' ? 310 : dept.code === 'MPL' ? 243 : dept.code === 'BPW' ? 516 : dept.code === 'ESU' ? 409 : dept.code === 'TSB' ? 284 : 192);

    const escalatedCount = deptComplaints.filter((c) => c.escalationHistory.length > 0).length;
    const escalationPct = deptComplaints.length > 0 ? Number(((escalatedCount / deptComplaints.length) * 100).toFixed(1)) : 0;

    // Account for fair SLA credit after reorgs
    let compliantCount = 0;
    let totalResolutionHrs = 0;
    for (const c of deptComplaints) {
      const effectiveDeadlineMs =
        new Date(c.slaDeadline).getTime() + (c.fairSlaCreditHours || 0) * 3600 * 1000;
      if (c.resolvedAt) {
        const resMs = new Date(c.resolvedAt).getTime();
        if (resMs <= effectiveDeadlineMs) compliantCount += 1;
        totalResolutionHrs += Math.max(0.5, (resMs - new Date(c.createdAt).getTime()) / (3600 * 1000));
      } else {
        if (Date.now() <= effectiveDeadlineMs) compliantCount += 1;
      }
    }

    const liveCompliance = deptComplaints.length > 0 ? (compliantCount / deptComplaints.length) * 100 : dept.slaTargetPct;
    const slaCompliancePct = Number(((dept.slaTargetPct * 0.65 + liveCompliance * 0.35)).toFixed(1));
    const avgResolutionHours =
      resolved.length > 0
        ? Number(((dept.avgResponseHoursBase * 2 + totalResolutionHrs / resolved.length) / 3).toFixed(1))
        : dept.avgResponseHoursBase;

    const feedbacks = deptComplaints.map((c) => c.citizenFeedback?.rating).filter((r): r is number => typeof r === 'number');
    const baseScore = dept.code === 'WSA' ? 4.9 : dept.code === 'MPL' ? 4.8 : dept.code === 'TSB' ? 4.7 : dept.code === 'BPW' ? 4.6 : 4.5;
    const citizenScore =
      feedbacks.length > 0
        ? Number(((baseScore + feedbacks.reduce((a, b) => a + b, 0) / feedbacks.length) / 2).toFixed(1))
        : baseScore;

    const compositeScore = Number(
      (slaCompliancePct * 0.5 + Math.max(0, 100 - escalationPct * 2) * 0.25 + (citizenScore / 5) * 100 * 0.25).toFixed(1)
    );

    rows.push({
      departmentId: dept.id,
      code: dept.code,
      name: dept.name,
      activeBacklog,
      resolvedCount,
      avgResolutionHours,
      slaCompliancePct,
      escalationPct,
      citizenScore,
      compositeScore,
    });
  }

  return rows.sort((a, b) => b.compositeScore - a.compositeScore);
}

export function buildWardPerformance(db: WardwiseDatabase): WardPerformanceRow[] {
  return db.wards.map((ward) => {
    const wc = db.complaints.filter((c) => c.wardId === ward.id && !c.masterIssueId);
    const activeCount = wc.filter((c) => c.status !== 'Resolved' && c.status !== 'Closed').length;
    const resolvedCount = wc.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length + 24;
    const nowMs = Date.now();
    const overdueCount = wc.filter((c) => {
      if (c.status === 'Resolved' || c.status === 'Closed') return false;
      const deadlineMs = new Date(c.slaDeadline).getTime() + (c.fairSlaCreditHours || 0) * 3600 * 1000;
      return nowMs > deadlineMs;
    }).length;
    const slaCompliancePct =
      wc.length > 0 ? Number((((wc.length - overdueCount) / wc.length) * 100).toFixed(1)) : 97.5;
    const dynamicStress = Math.min(95, Math.max(12, Math.round(ward.stressIndex * 0.6 + activeCount * 9 + overdueCount * 14)));
    return {
      wardId: ward.id,
      code: ward.code,
      name: ward.name,
      activeCount,
      resolvedCount,
      overdueCount,
      slaCompliancePct,
      stressIndex: dynamicStress,
    };
  });
}

export function previewReorganization(
  db: WardwiseDatabase,
  payload: {
    type: 'merge' | 'split' | 'officer_transfer' | 'ward_transfer';
    sourceDepartmentId?: string;
    targetDepartmentId?: string;
    newDepartmentName?: string;
    newDepartmentCode?: string;
    officerId?: string;
    wardId?: string;
    categoriesToSplit?: IssueCategory[];
  }
): ReorgPreviewResult {
  if (payload.type === 'merge') {
    const src = db.departments.find((d) => d.id === payload.sourceDepartmentId);
    const tgt = db.departments.find((d) => d.id === payload.targetDepartmentId);
    const affectedComplaints = db.complaints.filter(
      (c) => c.departmentId === payload.sourceDepartmentId && c.status !== 'Closed'
    );
    const affectedOfficers = db.officers.filter((o) => o.departmentId === payload.sourceDepartmentId);
    const affectedRules = db.routingRules.filter((r) => r.departmentId === payload.sourceDepartmentId);

    return {
      type: 'merge',
      summary: `Merge "${src?.name || 'Source'}" into "${tgt?.name || 'Target'}". Preserves original filing timestamps, historical elapsed SLA, and adds Fair SLA Credit where overdue prior to transfer.`,
      affectedComplaintIds: affectedComplaints.map((c) => c.id),
      affectedComplaintsCount: affectedComplaints.length,
      affectedOfficersCount: affectedOfficers.length,
      affectedRulesCount: affectedRules.length,
      fairSlaPreserved: true,
      warnings:
        !src || !tgt || src.id === tgt.id
          ? ['Select two distinct active departments to merge.']
          : [],
    };
  }

  if (payload.type === 'split') {
    const src = db.departments.find((d) => d.id === payload.sourceDepartmentId);
    const cats = payload.categoriesToSplit || [];
    const affectedComplaints = db.complaints.filter(
      (c) => c.departmentId === payload.sourceDepartmentId && cats.includes(c.category) && c.status !== 'Closed'
    );
    const affectedRules = db.routingRules.filter(
      (r) => r.departmentId === payload.sourceDepartmentId && (r.category === 'ALL' || cats.includes(r.category))
    );
    return {
      type: 'split',
      summary: `Create "${payload.newDepartmentName || 'New Bureau'}" (${payload.newDepartmentCode || 'NEW'}) spun off from "${src?.name || 'Source'}" covering [${cats.join(', ') || 'None'}].`,
      affectedComplaintIds: affectedComplaints.map((c) => c.id),
      affectedComplaintsCount: affectedComplaints.length,
      affectedOfficersCount: 1,
      affectedRulesCount: affectedRules.length,
      fairSlaPreserved: true,
      warnings: cats.length === 0 ? ['Select at least one category to spin off into the new department.'] : [],
    };
  }

  if (payload.type === 'officer_transfer') {
    const off = db.officers.find((o) => o.id === payload.officerId);
    const tgt = db.departments.find((d) => d.id === payload.targetDepartmentId);
    const affectedComplaints = db.complaints.filter(
      (c) => c.assignedOfficerId === payload.officerId && c.status !== 'Closed' && c.status !== 'Resolved'
    );
    return {
      type: 'officer_transfer',
      summary: `Reassign ${off?.name || 'Officer'} to ${tgt?.name || 'Target Dept'}. Open complaints retain elapsed SLA credit so incoming unit inherits fair timelines.`,
      affectedComplaintIds: affectedComplaints.map((c) => c.id),
      affectedComplaintsCount: affectedComplaints.length,
      affectedOfficersCount: off ? 1 : 0,
      affectedRulesCount: db.routingRules.filter((r) => r.specificOfficerId === payload.officerId).length,
      fairSlaPreserved: true,
      warnings: !off || !tgt ? ['Select both an officer and a destination department.'] : [],
    };
  }

  // ward_transfer
  const ward = db.wards.find((w) => w.id === payload.wardId);
  const tgt = db.departments.find((d) => d.id === payload.targetDepartmentId);
  const affectedComplaints = db.complaints.filter((c) => c.wardId === payload.wardId && c.status !== 'Closed');
  return {
    type: 'ward_transfer',
    summary: `Update ${ward?.code || 'Ward'} primary jurisdiction to ${tgt?.name || 'Target Dept'} and re-index routing rules.`,
    affectedComplaintIds: affectedComplaints.map((c) => c.id),
    affectedComplaintsCount: affectedComplaints.length,
    affectedOfficersCount: db.officers.filter((o) => o.wardIds.includes(payload.wardId || '')).length,
    affectedRulesCount: db.routingRules.filter((r) => r.wardId === payload.wardId).length,
    fairSlaPreserved: true,
    warnings: !ward || !tgt ? ['Select both a ward and a destination department.'] : [],
  };
}
