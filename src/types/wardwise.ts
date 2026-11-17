export type IssueCategory =
  | 'Water & Drainage'
  | 'Roads & Pavement'
  | 'Sanitation & Waste'
  | 'Street Lighting & Power'
  | 'Parks & Trees'
  | 'Traffic & Signals';

export type IssueSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export type IssueStatus =
  | 'Submitted'
  | 'Routed'
  | 'In Progress'
  | 'Escalated'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export type AdminRole = 'Commissioner' | 'Supervisor' | 'Dispatcher';

export type EscalationTier = 1 | 2 | 3;

export interface StatusHistoryEntry {
  id: string;
  status: IssueStatus;
  note: string;
  actor: string;
  timestamp: string;
}

export interface EscalationEvent {
  id: string;
  tier: EscalationTier;
  tierLabel: 'Officer' | 'Supervisor' | 'Commissioner';
  triggeredAt: string;
  reason: string;
  assignedTo: string;
  resolved: boolean;
}

export interface CitizenFeedback {
  rating: number;
  rectified?: 'Yes' | 'Partially' | 'No';
  comment: string;
  submittedAt: string;
}

export interface RoutingHistoryEntry {
  id: string;
  timestamp: string;
  ruleId: string | null;
  ruleName: string;
  departmentId: string;
  departmentName: string;
  officerId: string | null;
  officerName: string;
  reason: string;
}

export interface Complaint {
  id: string;
  version: number;
  title: string;
  description: string;
  category: IssueCategory;
  subCategory?: string;
  severity: IssueSeverity;
  status: IssueStatus;
  wardId: string;
  wardName: string;
  address: string;
  lat: number;
  lng: number;
  mapX: number; // 0 - 100 percentage on interactive municipal grid
  mapY: number; // 0 - 100 percentage on interactive municipal grid
  observedDate?: string;
  observedWindow?: string;
  photoUrl: string | null;
  photoUrls?: string[];
  photoHash?: string | null;
  resolutionPhotoUrl: string | null;
  resolutionPhotoHash?: string | null;
  resolutionNotes: string | null;
  recordHash?: string;
  isPublic: boolean;
  isDemo: boolean;
  // Private citizen metadata (strictly stripped on public APIs & public SSE)
  reporterName?: string;
  reporterContact?: string;
  // Assignment & Routing
  departmentId: string;
  departmentName: string;
  assignedOfficerId: string | null;
  assignedOfficerName: string;
  // SLA & Fair Reorganization Tracking
  slaHours: number;
  slaDeadline: string;
  elapsedBeforeTransferHours: number;
  fairSlaCreditHours: number;
  escalationTier: EscalationTier;
  escalationHistory: EscalationEvent[];
  statusHistory: StatusHistoryEntry[];
  routingHistory: RoutingHistoryEntry[];
  // Duplicate Clustering
  masterIssueId: string | null;
  childReportIds: string[];
  // Citizen Verification
  citizenFeedback: CitizenFeedback | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export type PublicComplaint = Omit<Complaint, 'reporterName' | 'reporterContact'>;

export interface Ward {
  id: string;
  code: string;
  name: string;
  districtSummary: string;
  alderperson?: string;
  depot?: string;
  stressIndex: number;
  mapBounds: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    centerX: number;
    centerY: number;
    lat: number;
    lng: number;
  };
  primaryDepartmentId: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  categories: IssueCategory[];
  active: boolean;
  mergedIntoId: string | null;
  slaTargetPct: number;
  avgResponseHoursBase: number;
}

export interface Officer {
  id: string;
  name: string;
  title: string;
  role: 'Officer' | 'Supervisor' | 'Commissioner';
  email: string;
  departmentId: string;
  wardIds: string[];
  maxCapacity: number;
  activeWorkload: number;
  eligible: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  category: IssueCategory | 'ALL';
  wardId: string; // 'ALL' or specific wardId
  departmentId: string;
  strategy: 'lowest_workload' | 'specific_officer' | 'ward_lead';
  specificOfficerId: string | null;
  priority: number;
  active: boolean;
}

export interface SlaPolicy {
  category: IssueCategory;
  targetHours: number;
  warningThresholdPct: number;
  tier2BreachHours: number;
  tier3BreachHours: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: 'complaint' | 'routing_rule' | 'sla_policy' | 'department' | 'officer' | 'reorganization' | 'duplicate_cluster';
  entityId: string;
  complaintId: string | null;
  previousValue: string;
  newValue: string;
  reason: string;
  hash: string;
}

export interface NotificationItem {
  id: string;
  recipientRole: string;
  title: string;
  message: string;
  complaintId: string | null;
  createdAt: string;
  read: boolean;
  severity: 'info' | 'warning' | 'critical';
}

export interface DuplicateCandidate {
  pairId: string;
  primaryId: string;
  secondaryId: string;
  distanceMeters: number;
  textSimilarity: number;
  timeDeltaHours: number;
  confidenceScore: number;
  reason: string;
}

export interface MonthlyPerformancePoint {
  month: string;
  filed: number;
  resolved: number;
  slaCompliancePct: number;
  avgResolutionHours: number;
}

export interface DepartmentLeaderboardRow {
  departmentId: string;
  code: string;
  name: string;
  activeBacklog: number;
  resolvedCount: number;
  avgResolutionHours: number;
  slaCompliancePct: number;
  escalationPct: number;
  citizenScore: number;
  compositeScore: number;
}

export interface WardPerformanceRow {
  wardId: string;
  code: string;
  name: string;
  activeCount: number;
  resolvedCount: number;
  overdueCount: number;
  slaCompliancePct: number;
  stressIndex: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  departmentId: string | null;
}

export interface ReorgPreviewResult {
  type: 'merge' | 'split' | 'officer_transfer' | 'ward_transfer';
  summary: string;
  affectedComplaintIds: string[];
  affectedComplaintsCount: number;
  affectedOfficersCount: number;
  affectedRulesCount: number;
  fairSlaPreserved: boolean;
  warnings: string[];
}

export type RealtimeEventType =
  | 'connected'
  | 'heartbeat'
  | 'complaint:created'
  | 'complaint:updated'
  | 'complaint:escalated'
  | 'duplicate:merged'
  | 'duplicate:separated'
  | 'reorg:executed'
  | 'sla:swept'
  | 'sla:updated'
  | 'routing:updated'
  | 'org:updated';

export interface RealtimeEvent {
  eventId: string;
  type: RealtimeEventType;
  timestamp: string;
  complaintId?: string;
  summary?: string;
  payload?: unknown;
}
