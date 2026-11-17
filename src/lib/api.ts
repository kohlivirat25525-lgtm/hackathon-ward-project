import type {
  AdminRole,
  AdminUser,
  AuditLogEntry,
  Complaint,
  Department,
  DepartmentLeaderboardRow,
  DuplicateCandidate,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  MonthlyPerformancePoint,
  NotificationItem,
  Officer,
  PublicComplaint,
  ReorgPreviewResult,
  RoutingRule,
  SlaPolicy,
  Ward,
  WardPerformanceRow,
} from '../types/wardwise';

export type TransparencyWindow = '30d' | 'qtd' | 'annual';

export interface PublicBootstrapResponse {
  window?: TransparencyWindow;
  wards: Ward[];
  slaPolicies: SlaPolicy[];
  complaints: PublicComplaint[];
  leaderboard: DepartmentLeaderboardRow[];
  wardPerformance: WardPerformanceRow[];
  monthlyPerformance: MonthlyPerformancePoint[];
  realtime?: {
    publicSubscribers: number;
    adminSubscribers: number;
  };
  metrics: {
    totalTracked: number;
    activeCount: number;
    resolvedCount: number;
    overdueCount: number;
    slaCompliancePct: number;
    demoTotalResolvedHistorical: number;
  };
}

export interface AdminStateResponse {
  wards: Ward[];
  departments: Department[];
  officers: Officer[];
  routingRules: RoutingRule[];
  slaPolicies: SlaPolicy[];
  complaints: Complaint[];
  auditLogs: AuditLogEntry[];
  notifications: NotificationItem[];
  duplicateCandidates: DuplicateCandidate[];
  leaderboard: DepartmentLeaderboardRow[];
  wardPerformance: WardPerformanceRow[];
  monthlyPerformance: MonthlyPerformancePoint[];
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const TOKEN_STORAGE_KEY = 'wardwise_admin_token';
let memoryAdminToken: string | null = null;

export function getAdminToken(): string | null {
  if (memoryAdminToken) return memoryAdminToken;
  try {
    const stored =
      window.localStorage.getItem(TOKEN_STORAGE_KEY) ||
      window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      memoryAdminToken = stored;
      return stored;
    }
  } catch {
    // Storage may be blocked in strict sandboxed iframes; memory fallback stays active
  }
  return null;
}

export function setAdminToken(token: string | null): void {
  memoryAdminToken = token;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors inside restricted iframes
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...baseHeaders,
      ...(options?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 && (url.startsWith('/api/admin/') || url === '/api/auth/me')) {
      setAdminToken(null);
    }
    throw new ApiError(
      typeof data.error === 'string' ? data.error : `Request failed (${res.status})`,
      res.status,
      data
    );
  }
  return data as T;
}

export const api = {
  // Public
  getPublicBootstrap: (windowMode: TransparencyWindow = '30d') =>
    request<PublicBootstrapResponse>(`/api/public/bootstrap?window=${encodeURIComponent(windowMode)}`),
  trackComplaint: (id: string) =>
    request<{
      complaint: PublicComplaint;
      masterComplaint: PublicComplaint | null;
      clusteredReportsCount: number;
    }>(`/api/public/complaints/${encodeURIComponent(id)}`),
  submitComplaint: (payload: {
    title: string;
    description: string;
    category: IssueCategory;
    subCategory?: string;
    severity: IssueSeverity;
    wardId: string;
    address: string;
    lat: number;
    lng: number;
    mapX: number;
    mapY: number;
    observedDate?: string;
    observedWindow?: string;
    photoUrl: string | null;
    photoUrls?: string[];
    isPublic: boolean;
    reporterName: string;
    reporterContact: string;
  }) =>
    request<{ complaint: PublicComplaint; duplicateCandidates: DuplicateCandidate[] }>('/api/public/complaints', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submitFeedback: (id: string, rating: number, comment: string, rectified?: 'Yes' | 'Partially' | 'No') =>
    request<{ complaint: PublicComplaint }>(`/api/public/complaints/${encodeURIComponent(id)}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment, rectified }),
    }),
  uploadImage: (dataUrl: string, filename: string) =>
    request<{ url: string }>('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename }),
    }),

  // Auth
  login: async (email: string, password: string) => {
    const res = await request<{ user: AdminUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) setAdminToken(res.token);
    return res;
  },
  register: async (payload: {
    name: string;
    email: string;
    password: string;
    role: AdminRole;
    departmentId?: string | null;
  }) => {
    const res = await request<{ user: AdminUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setAdminToken(res.token);
    return res;
  },
  logout: async () => {
    try {
      return await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setAdminToken(null);
    }
  },
  me: () => request<{ authenticated: boolean; user: AdminUser }>('/api/auth/me'),

  // Admin Control Room
  getAdminState: () => request<AdminStateResponse>('/api/admin/state'),
  markAllNotificationsRead: () => request<{ ok: boolean }>('/api/admin/notifications/read-all', { method: 'POST' }),
  updateComplaint: (
    id: string,
    payload: {
      status?: IssueStatus;
      resolutionNotes?: string;
      resolutionPhotoUrl?: string;
      reason?: string;
      expectedVersion?: number;
    }
  ) =>
    request<{ complaint: Complaint }>(`/api/admin/complaints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  emergencyDispatch: (
    id: string,
    payload: { unitName?: string; note?: string; expectedVersion?: number }
  ) =>
    request<{ complaint: Complaint }>(`/api/admin/complaints/${encodeURIComponent(id)}/emergency-dispatch`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reassignComplaint: (
    id: string,
    payload: { departmentId: string; officerId: string | null; reason: string; expectedVersion?: number }
  ) =>
    request<{ complaint: Complaint }>(`/api/admin/complaints/${encodeURIComponent(id)}/reassign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createRoutingRule: (payload: Omit<RoutingRule, 'id' | 'active'>) =>
    request<{ rule: RoutingRule }>('/api/admin/routing-rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRoutingRule: (id: string, payload: Partial<RoutingRule>) =>
    request<{ rule: RoutingRule }>(`/api/admin/routing-rules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteRoutingRule: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/routing-rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  updateSlaPolicy: (category: IssueCategory, payload: Partial<SlaPolicy>) =>
    request<{ policy: SlaPolicy }>(`/api/admin/sla-policies/${encodeURIComponent(category)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  runSlaSweep: () => request<{ escalationsCreated: number }>('/api/admin/sla/sweep', { method: 'POST' }),
  mergeDuplicates: (primaryId: string, secondaryId: string, reason: string) =>
    request<{ primary: Complaint; secondary: Complaint }>('/api/admin/duplicates/merge', {
      method: 'POST',
      body: JSON.stringify({ primaryId, secondaryId, reason }),
    }),
  separateDuplicate: (secondaryId: string, reason: string) =>
    request<{ secondary: Complaint }>('/api/admin/duplicates/separate', {
      method: 'POST',
      body: JSON.stringify({ secondaryId, reason }),
    }),
  createDepartment: (payload: {
    code: string;
    name: string;
    description: string;
    categories: IssueCategory[];
    slaTargetPct: number;
  }) =>
    request<{ department: Department }>('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createOfficer: (payload: {
    name: string;
    title: string;
    role: 'Officer' | 'Supervisor' | 'Commissioner';
    email: string;
    departmentId: string;
    wardIds: string[];
    maxCapacity: number;
  }) =>
    request<{ officer: Officer }>('/api/admin/officers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  previewReorg: (payload: {
    type: 'merge' | 'split' | 'officer_transfer' | 'ward_transfer';
    sourceDepartmentId?: string;
    targetDepartmentId?: string;
    newDepartmentName?: string;
    newDepartmentCode?: string;
    officerId?: string;
    wardId?: string;
    categoriesToSplit?: IssueCategory[];
  }) =>
    request<{ preview: ReorgPreviewResult }>('/api/admin/reorg/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  executeReorg: (payload: {
    type: 'merge' | 'split' | 'officer_transfer' | 'ward_transfer';
    sourceDepartmentId?: string;
    targetDepartmentId?: string;
    newDepartmentName?: string;
    newDepartmentCode?: string;
    officerId?: string;
    wardId?: string;
    categoriesToSplit?: IssueCategory[];
    reason: string;
    confirmed: boolean;
  }) =>
    request<{ ok: boolean; migratedCount: number }>('/api/admin/reorg/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export function formatSlaDelta(slaDeadline: string, fairCreditHours = 0, status?: IssueStatus): {
  label: string;
  isOverdue: boolean;
  isWarning: boolean;
} {
  if (status === 'Resolved' || status === 'Closed') {
    return { label: 'Completed', isOverdue: false, isWarning: false };
  }
  const effectiveMs = new Date(slaDeadline).getTime() + fairCreditHours * 3600 * 1000;
  const diffMs = effectiveMs - Date.now();
  const absMins = Math.round(Math.abs(diffMs) / 60000);
  const hrs = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const formatted = `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
  if (diffMs < 0) {
    return { label: `${formatted} overdue`, isOverdue: true, isWarning: true };
  }
  return {
    label: `${formatted} remaining`,
    isOverdue: false,
    isWarning: diffMs < 3 * 3600 * 1000,
  };
}

export function formatRelativeTime(iso: string): string {
  const diffMins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMins < 60) return `${diffMins}m ago`;
  const hrs = Math.floor(diffMins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
