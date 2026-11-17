import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  Bell,
  Building2,
  Clock,
  Cpu,
  Eye,
  EyeOff,
  FileCheck2,
  GitMerge,
  Layers,
  Lock,
  LogOut,
  Map as MapIcon,
  Radio,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sliders,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { AdminStateResponse } from '../lib/api';
import { ApiError, api, formatSlaDelta } from '../lib/api';
import { useRealtimeSync } from '../lib/realtime';
import type {
  AdminRole,
  AdminUser,
  Complaint,
  IssueCategory,
  IssueStatus,
  RealtimeEvent,
  ReorgPreviewResult,
} from '../types/wardwise';
import type { PublicRoute } from '../components/Layout';
import { ResilientImage } from '../components/ResilientImage';
import { AnimatedNumber, StatusIndicator, WARDWISE_EASE } from '../components/DesignSystem';

interface ControlRoomPageProps {
  adminUser: AdminUser | null;
  onAdminAuthenticated: (user: AdminUser | null) => void;
  onNavigate: (route: PublicRoute, query?: string) => void;
  onDataChanged: () => Promise<void> | void;
}

type AdminTab =
  | 'overview'
  | 'complaints'
  | 'live-ops'
  | 'routing'
  | 'sla'
  | 'duplicates'
  | 'departments'
  | 'officers'
  | 'wards'
  | 'reorg'
  | 'analytics'
  | 'audit';

const ALL_CATEGORIES: IssueCategory[] = [
  'Water & Drainage',
  'Roads & Pavement',
  'Sanitation & Waste',
  'Street Lighting & Power',
  'Parks & Trees',
  'Traffic & Signals',
];

const STATUS_LIST: IssueStatus[] = [
  'Submitted',
  'Routed',
  'In Progress',
  'Escalated',
  'Resolved',
  'Closed',
  'Reopened',
];

export function ControlRoomPage({
  adminUser,
  onAdminAuthenticated,
  onNavigate,
  onDataChanged,
}: ControlRoomPageProps) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [signupName, setSignupName] = useState('');
  const [signupRole, setSignupRole] = useState<AdminRole>('Commissioner');
  const [loginEmail, setLoginEmail] = useState('commissioner@wardwise.gov');
  const [loginPassword, setLoginPassword] = useState('1234567890');
  const [showPassword, setShowPassword] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [state, setState] = useState<AdminStateResponse | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19));
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Complaint Drawer + Filters
  const [complaintSearch, setComplaintSearch] = useState('');
  const [complaintStatusFilter, setComplaintStatusFilter] = useState<'ALL' | IssueStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<IssueStatus>('In Progress');
  const [drawerNotes, setDrawerNotes] = useState('');
  const [drawerPhoto, setDrawerPhoto] = useState('');
  const [drawerReason, setDrawerReason] = useState('');
  const [reassignDeptId, setReassignDeptId] = useState('');
  const [reassignOfficerId, setReassignOfficerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  const [savingDrawer, setSavingDrawer] = useState(false);
  const evidenceFileRef = useRef<HTMLInputElement | null>(null);

  // Emergency Dispatch Modal
  const [emergencyModalId, setEmergencyModalId] = useState<string | null>(null);
  const [emergencyUnit, setEmergencyUnit] = useState('Rapid Emergency Engineering Unit');
  const [emergencyNote, setEmergencyNote] = useState('');

  // Routing rule form
  const [ruleName, setRuleName] = useState('');
  const [ruleCategory, setRuleCategory] = useState<IssueCategory | 'ALL'>('Roads & Pavement');
  const [ruleWard, setRuleWard] = useState('ALL');
  const [ruleDept, setRuleDept] = useState('dept-works');

  // Dept & Officer forms
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [newOffName, setNewOffName] = useState('');
  const [newOffTitle, setNewOffTitle] = useState('Field Inspector');
  const [newOffDept, setNewOffDept] = useState('dept-works');

  // Reorg simulator
  const [reorgType, setReorgType] = useState<'merge' | 'split' | 'officer_transfer' | 'ward_transfer'>('merge');
  const [reorgSourceDept, setReorgSourceDept] = useState('dept-parks');
  const [reorgTargetDept, setReorgTargetDept] = useState('dept-sanitation');
  const [reorgNewName, setReorgNewName] = useState('Urban Hydrology & Drainage Authority');
  const [reorgNewCode, setReorgNewCode] = useState('UHD');
  const [reorgOfficerId, setReorgOfficerId] = useState('off-01');
  const [reorgWardId, setReorgWardId] = useState('w04');
  const [reorgReason, setReorgReason] = useState('Municipal structural realignment for improved dispatch synergy.');
  const [reorgPreview, setReorgPreview] = useState<ReorgPreviewResult | null>(null);

  // Audit filter
  const [auditQuery, setAuditQuery] = useState('');

  const notify = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const loadAdminState = useCallback(async () => {
    if (!adminUser) return;
    setLoadingState(true);
    try {
      const data = await api.getAdminState();
      setState(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAdminAuthenticated(null);
      } else {
        notify('err', err instanceof Error ? err.message : 'Failed to sync Control Room state.');
      }
    } finally {
      setLoadingState(false);
    }
  }, [adminUser, onAdminAuthenticated, notify]);

  const handleAdminEvent = useCallback(
    (_evt: RealtimeEvent) => {
      loadAdminState();
      onDataChanged();
    },
    [loadAdminState, onDataChanged]
  );

  const { status: adminSseStatus } = useRealtimeSync(
    '/api/admin/events',
    Boolean(adminUser),
    handleAdminEvent,
    loadAdminState
  );

  useEffect(() => {
    loadAdminState();
  }, [loadAdminState]);

  useEffect(() => {
    const t = setInterval(() => {
      setUtcClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const selectedComplaint: Complaint | null = useMemo(() => {
    if (!selectedId || !state) return null;
    return state.complaints.find((c) => c.id === selectedId) || null;
  }, [selectedId, state]);

  useEffect(() => {
    if (selectedComplaint) {
      setDrawerStatus(selectedComplaint.status);
      setDrawerNotes(selectedComplaint.resolutionNotes || '');
      setDrawerPhoto(selectedComplaint.resolutionPhotoUrl || '');
      setDrawerReason('');
      setReassignDeptId(selectedComplaint.departmentId);
      setReassignOfficerId(selectedComplaint.assignedOfficerId || '');
      setReassignReason('');
      setConflictAlert(null);
    }
  }, [selectedComplaint]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res =
        authMode === 'signup'
          ? await api.register({
              name: signupName,
              email: loginEmail,
              password: loginPassword,
              role: signupRole,
            })
          : await api.login(loginEmail, loginPassword);
      onAdminAuthenticated(res.user);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    onAdminAuthenticated(null);
    setState(null);
    onNavigate('/');
  };

  const openComplaints = useMemo(
    () => (state?.complaints || []).filter((c) => c.status !== 'Resolved' && c.status !== 'Closed' && !c.masterIssueId),
    [state]
  );

  const breachedComplaints = useMemo(
    () =>
      openComplaints.filter(
        (c) => formatSlaDelta(c.slaDeadline, c.fairSlaCreditHours, c.status).isOverdue || c.status === 'Escalated'
      ),
    [openComplaints]
  );

  const filteredComplaints = useMemo(() => {
    const q = complaintSearch.trim().toLowerCase();
    return (state?.complaints || []).filter((c) => {
      if (complaintStatusFilter !== 'ALL' && c.status !== complaintStatusFilter) return false;
      if (q) {
        const hay = `${c.id} ${c.title} ${c.wardName} ${c.departmentName} ${c.assignedOfficerName} ${
          c.reporterName || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state, complaintSearch, complaintStatusFilter]);

  const unreadNotifs = useMemo(() => (state?.notifications || []).filter((n) => !n.read).length, [state]);

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
      });
      const res = await api.uploadImage(dataUrl, file.name);
      setDrawerPhoto(res.url);
      notify('ok', 'Resolution evidence uploaded and hashed.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleSaveDrawer = async () => {
    if (!selectedComplaint) return;
    setSavingDrawer(true);
    setConflictAlert(null);
    try {
      await api.updateComplaint(selectedComplaint.id, {
        status: drawerStatus,
        resolutionNotes: drawerNotes,
        resolutionPhotoUrl: drawerPhoto || undefined,
        reason: drawerReason || undefined,
        expectedVersion: selectedComplaint.version,
      });
      notify('ok', `Ticket #${selectedComplaint.id} updated cleanly.`);
      await loadAdminState();
      await onDataChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictAlert(err.message);
      } else {
        notify('err', err instanceof Error ? err.message : 'Update failed.');
      }
    } finally {
      setSavingDrawer(false);
    }
  };

  const handleReassignDrawer = async () => {
    if (!selectedComplaint) return;
    setSavingDrawer(true);
    setConflictAlert(null);
    try {
      await api.reassignComplaint(selectedComplaint.id, {
        departmentId: reassignDeptId,
        officerId: reassignOfficerId || null,
        reason: reassignReason,
        expectedVersion: selectedComplaint.version,
      });
      notify('ok', `Ticket #${selectedComplaint.id} reassigned with audit log.`);
      setReassignReason('');
      await loadAdminState();
      await onDataChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictAlert(err.message);
      } else {
        notify('err', err instanceof Error ? err.message : 'Reassignment failed.');
      }
    } finally {
      setSavingDrawer(false);
    }
  };

  const handleEmergencyDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyModalId || !state) return;
    const target = state.complaints.find((c) => c.id === emergencyModalId);
    try {
      await api.emergencyDispatch(emergencyModalId, {
        unitName: emergencyUnit,
        note: emergencyNote || 'Priority emergency municipal mobilization.',
        expectedVersion: target?.version,
      });
      notify('ok', `Emergency unit dispatched to #${emergencyModalId}.`);
      setEmergencyModalId(null);
      setEmergencyNote('');
      await loadAdminState();
      await onDataChanged();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Dispatch failed.');
    }
  };

  // =========================================================
  // UNAUTHENTICATED LOGIN GATE
  // =========================================================
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-[#070d19] text-white flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl bg-[#0b1221] border border-white/15 p-7 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#2563eb]/20 border border-[#60a5fa]/40 flex items-center justify-center text-[#93c5fd]">
                {authMode === 'signup' ? <UserPlus className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div>
                <span className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#93c5fd]">
                  WARDWISE · PRIVATE NODE
                </span>
                <h1 className="text-lg font-bold text-white">
                  {authMode === 'signup' ? 'Official Registration' : 'Municipal Control Room'}
                </h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Public Site</span>
            </button>
          </div>

          {/* Sign In / Sign Up Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#131c31] border border-white/10 mb-5">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setLoginError(null);
                if (!loginEmail) setLoginEmail('commissioner@wardwise.gov');
                if (!loginPassword) setLoginPassword('1234567890');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                authMode === 'signin' ? 'bg-[#2563eb] text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Official Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setLoginError(null);
                if (
                  loginEmail === 'commissioner@wardwise.gov' ||
                  loginEmail === 'supervisor@wardwise.gov' ||
                  loginEmail === 'dispatch@wardwise.gov'
                ) {
                  setLoginEmail('');
                }
                setLoginPassword('1234567890');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                authMode === 'signup' ? 'bg-[#2563eb] text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Official Sign Up
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-200 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="e.g. Insp. A. Patel"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#131c31] border border-white/20 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#60a5fa]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-200 mb-1.5">Role</label>
                  <select
                    value={signupRole}
                    onChange={(e) => setSignupRole(e.target.value as AdminRole)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/20 text-sm text-white focus:outline-none focus:border-[#60a5fa]"
                  >
                    <option value="Commissioner">Commissioner</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Dispatcher">Dispatcher</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">Official Email</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder={authMode === 'signup' ? 'official.name@wardwise.gov' : 'commissioner@wardwise.gov'}
                className="w-full px-4 py-2.5 rounded-lg bg-[#131c31] border border-white/20 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#60a5fa]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-200">Password</label>
                <span className="text-[11px] font-mono-tabular text-[#93c5fd]">Default: 1234567890</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="1234567890"
                  className="w-full pl-4 pr-11 py-2.5 rounded-lg bg-[#131c31] border border-white/20 text-sm font-mono-tabular text-white placeholder:text-slate-400 focus:outline-none focus:border-[#60a5fa]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-950/75 border border-red-400/50 text-xs text-red-100">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60 transition-colors"
            >
              {loggingIn
                ? authMode === 'signup'
                  ? 'Creating Official Account…'
                  : 'Verifying Session…'
                : authMode === 'signup'
                ? 'Register & Enter Control Room'
                : 'Enter Authenticated Control Room'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10">
            <div className="flex items-center justify-between text-[11px] mb-2.5">
              <span className="text-slate-300">Server-Enforced RBAC Demo Accounts:</span>
              <span className="font-mono-tabular text-emerald-300">Pass: 1234567890</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Commissioner', email: 'commissioner@wardwise.gov', pass: '1234567890' },
                { label: 'Supervisor', email: 'supervisor@wardwise.gov', pass: '1234567890' },
                { label: 'Dispatcher', email: 'dispatch@wardwise.gov', pass: '1234567890' },
              ].map((acc) => (
                <button
                  key={acc.label}
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setLoginError(null);
                    setLoginEmail(acc.email);
                    setLoginPassword(acc.pass);
                  }}
                  className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-[11px] font-semibold text-[#93c5fd] cursor-pointer transition-colors"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sidebarItems: { id: AdminTab; label: string; icon: typeof Activity; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'complaints', label: 'Complaints', icon: FileCheck2, badge: openComplaints.length },
    { id: 'live-ops', label: 'Live Ops GIS', icon: MapIcon },
    { id: 'routing', label: 'Smart Routing', icon: Route },
    { id: 'sla', label: 'SLA & Escalations', icon: Siren, badge: breachedComplaints.length },
    { id: 'duplicates', label: 'Duplicate Detection', icon: GitMerge, badge: state?.duplicateCandidates.length || 0 },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'officers', label: 'Officers', icon: Users },
    { id: 'wards', label: 'Wards', icon: Layers },
    { id: 'reorg', label: 'Reorganization', icon: Sliders },
    { id: 'analytics', label: 'Analytics', icon: Cpu },
    { id: 'audit', label: 'Audit Logs', icon: ShieldCheck },
  ];

  const isCommissioner = adminUser.role === 'Commissioner';
  const isSupervisorOrAbove = adminUser.role === 'Commissioner' || adminUser.role === 'Supervisor';

  return (
    <div className="min-h-screen bg-[#070d19] text-white flex flex-col lg:flex-row">
      {/* PERSISTENT DARK COMMAND SIDEBAR */}
      <aside className="w-full lg:w-64 shrink-0 bg-[#0b1221] border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center justify-between px-2 py-2 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#2563eb]/20 border border-[#60a5fa]/40 flex items-center justify-center text-[#93c5fd]">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-xs font-bold tracking-wider text-white">WARDWISE OPS</span>
                <span className="block text-[10px] font-mono-tabular text-slate-400">CONTROL ROOM v2</span>
              </div>
            </div>
          </div>

          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1" aria-label="Control Room Modules">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2563eb]/20 text-[#93c5fd] border border-[#60a5fa]/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono-tabular text-[10px] font-bold ${
                        item.id === 'sla' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 space-y-2.5">
          <div className="px-3 py-2.5 rounded-xl bg-[#131c31] border border-white/10 text-xs">
            <div className="font-bold text-white">{adminUser.name}</div>
            <div className="text-[11px] font-mono-tabular text-[#93c5fd]">{adminUser.role}</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-slate-300 cursor-pointer"
            >
              Public Portal
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN COMMAND VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Command Header */}
        <header className="h-16 px-6 bg-[#0b1221]/90 border-b border-white/10 flex items-center justify-between gap-4 sticky top-0 z-30 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-bold text-white capitalize truncate">
              {sidebarItems.find((s) => s.id === tab)?.label}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono-tabular text-[#93c5fd]">
              <Radio className="w-3 h-3" />
              <span>{adminSseStatus === 'connected' ? 'SSE Live Stream' : 'Resyncing…'}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono-tabular text-slate-300">
              <Clock className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span>{utcClock} UTC</span>
            </span>

            <button
              type="button"
              onClick={loadAdminState}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              title="Force Refresh Control Room State"
            >
              <RefreshCw className={`w-4 h-4 ${loadingState ? 'animate-spin' : ''}`} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white relative cursor-pointer"
                aria-label="Admin Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#dc2626] text-white text-[9px] font-mono-tabular font-bold">
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl bg-[#0b1221] border border-white/15 shadow-2xl p-4 z-40">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="text-xs font-bold text-white">Dispatch Alerts</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.markAllNotificationsRead();
                          await loadAdminState();
                        } catch (err) {
                          notify('err', err instanceof Error ? err.message : 'Failed to mark alerts read.');
                        }
                      }}
                      className="text-[11px] text-[#93c5fd] hover:underline cursor-pointer"
                    >
                      Mark All Read
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(state?.notifications || []).slice(0, 8).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (n.complaintId) setSelectedId(n.complaintId);
                          setNotifOpen(false);
                        }}
                        className={`p-2.5 rounded-xl text-xs cursor-pointer ${
                          n.read ? 'bg-white/5 opacity-70' : 'bg-[#2563eb]/20 border border-[#60a5fa]/35'
                        }`}
                      >
                        <div className="font-bold text-white">{n.title}</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">{n.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Global Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: WARDWISE_EASE }}
              className={`mx-6 mt-4 p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                toast.kind === 'ok'
                  ? 'bg-emerald-950/85 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/85 border-red-500/40 text-red-200'
              }`}
            >
              <span>{toast.msg}</span>
              <button type="button" onClick={() => setToast(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 p-6 space-y-6 overflow-x-hidden">
          {/* TAB: OVERVIEW */}
          {tab === 'overview' && state && (
            <>
              {/* 6 KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Active Queue', value: openComplaints.length, tone: 'text-white' },
                  {
                    label: 'Resolved / Closed',
                    value: state.complaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length,
                    tone: 'text-emerald-300',
                  },
                  { label: 'SLA Breach Watch', value: breachedComplaints.length, tone: 'text-red-300' },
                  { label: 'Duplicate Pairs', value: state.duplicateCandidates.length, tone: 'text-[#93c5fd]' },
                  { label: 'Active Bureaus', value: state.departments.filter((d) => d.active).length, tone: 'text-amber-300' },
                  { label: 'SHA-256 Audits', value: state.auditLogs.length, tone: 'text-[#60a5fa]' },
                ].map((k) => (
                  <div key={k.label} className="p-4 rounded-2xl bg-[#0b1221] border border-white/10">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {k.label}
                    </span>
                    <div className={`text-2xl font-mono-tabular font-bold mt-1.5 ${k.tone}`}>
                      <AnimatedNumber value={k.value} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Critical Breached Queue + Duplicate Quick Merge */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-7 bg-[#0b1221] border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-red-300" />
                      <span>Breached &amp; High-Priority Triage Queue</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab('complaints')}
                      className="text-xs text-[#93c5fd] hover:underline cursor-pointer"
                    >
                      Open Full Queue →
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {openComplaints.slice(0, 6).map((c) => {
                      const sla = formatSlaDelta(c.slaDeadline, c.fairSlaCreditHours, c.status);
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className="p-3.5 rounded-xl bg-[#131c31] hover:bg-[#192440] border border-white/10 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="font-mono-tabular font-bold text-[#93c5fd]">#{c.id}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-white">Tier {c.escalationTier}</span>
                              <span aria-hidden="true">·</span>
                              <span>{c.wardName.split('·')[0]}</span>
                            </div>
                            <div className="text-sm font-semibold text-white truncate mt-0.5">{c.title}</div>
                            <div className="text-[11px] text-slate-400">
                              {c.departmentName} · {c.assignedOfficerName}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`font-mono-tabular text-xs font-bold ${
                                sla.isOverdue ? 'text-red-300' : 'text-emerald-300'
                              }`}
                            >
                              {sla.label}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEmergencyModalId(c.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#dc2626]/25 hover:bg-[#dc2626]/40 border border-red-400/30 text-red-200 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Dispatch Unit
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="xl:col-span-5 bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <GitMerge className="w-4 h-4 text-[#93c5fd]" />
                      <span>Duplicate Cluster Scanner</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab('duplicates')}
                      className="text-xs text-[#93c5fd] hover:underline cursor-pointer"
                    >
                      Manage Clusters →
                    </button>
                  </div>

                  {state.duplicateCandidates.length === 0 ? (
                    <div className="p-6 rounded-xl bg-[#131c31] border border-white/10 text-xs text-slate-400 text-center">
                      No unmerged duplicate candidates detected across active wards.
                    </div>
                  ) : (
                    state.duplicateCandidates.slice(0, 3).map((d) => (
                      <div key={d.pairId} className="p-4 rounded-xl bg-[#131c31] border border-white/10 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono-tabular font-bold text-amber-300">
                            #{d.primaryId} ↔ #{d.secondaryId}
                          </span>
                          <span className="font-mono-tabular font-bold text-[#93c5fd]">
                            {d.confidenceScore}% match
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{d.reason}</p>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.mergeDuplicates(d.primaryId, d.secondaryId, 'Verified duplicate cluster from Overview.');
                              notify('ok', `Merged #${d.secondaryId} under Master #${d.primaryId}.`);
                              await loadAdminState();
                              await onDataChanged();
                            } catch (err) {
                              notify('err', err instanceof Error ? err.message : 'Merge failed.');
                            }
                          }}
                          className="w-full py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold cursor-pointer transition-colors"
                        >
                          1-Click Merge Under #{d.primaryId}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB: COMPLAINTS QUEUE */}
          {tab === 'complaints' && state && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b1221] p-4 rounded-2xl border border-white/10">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={complaintSearch}
                    onChange={(e) => setComplaintSearch(e.target.value)}
                    placeholder="Search ID, title, ward, officer, or private reporter…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-xs text-white focus:outline-none focus:border-[#60a5fa]"
                  />
                </div>
                <select
                  value={complaintStatusFilter}
                  onChange={(e) => setComplaintStatusFilter(e.target.value as 'ALL' | IssueStatus)}
                  className="px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-xs text-white"
                >
                  <option value="ALL">All Statuses</option>
                  {STATUS_LIST.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[#0b1221] border border-white/10 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[820px] text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase text-[11px]">
                      <th className="py-3.5 px-4">ID</th>
                      <th className="py-3.5 px-4">Title &amp; Private Reporter</th>
                      <th className="py-3.5 px-4">Dept &amp; Officer</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">SLA</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredComplaints.map((c) => {
                      const sla = formatSlaDelta(c.slaDeadline, c.fairSlaCreditHours, c.status);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-4 font-mono-tabular font-bold text-[#93c5fd]">
                            #{c.id}
                            <span className="block text-[10px] text-slate-400">v{c.version || 1}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{c.title}</div>
                            <div className="text-[11px] text-slate-400">
                              {c.wardName} · Reporter: {c.reporterName || 'Anonymous'} (
                              {c.reporterContact || 'No contact'})
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-white">{c.departmentName}</div>
                            <div className="text-[11px] text-slate-400">{c.assignedOfficerName}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusIndicator status={c.status} isOverdue={sla.isOverdue} dark />
                            {c.masterIssueId && (
                              <span className="block text-[10px] text-amber-300 mt-0.5">Merged → #{c.masterIssueId}</span>
                            )}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-mono-tabular font-bold ${
                              sla.isOverdue ? 'text-red-300' : 'text-emerald-300'
                            }`}
                          >
                            {sla.label}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(c.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#2563eb]/20 hover:bg-[#2563eb]/35 text-[#93c5fd] font-semibold cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: LIVE OPS GIS */}
          {tab === 'live-ops' && state && (
            <div className="bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Authenticated Live GIS Operations Grid (Public + Confidential)</h2>
                <span className="text-xs font-mono-tabular text-[#93c5fd]">
                  {state.complaints.filter((c) => !c.masterIssueId).length} Active Pins
                </span>
              </div>
              <div className="relative w-full h-[520px] rounded-xl bg-[#070d19] border border-white/10 overflow-hidden">
                {state.wards.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      left: `${w.mapBounds.x1}%`,
                      top: `${w.mapBounds.y1}%`,
                      width: `${Math.max(14, w.mapBounds.x2 - w.mapBounds.x1)}%`,
                      height: `${Math.max(15, w.mapBounds.y2 - w.mapBounds.y1)}%`,
                    }}
                    className="absolute rounded-xl border border-white/10 bg-white/[0.02] p-2 text-[10px] font-mono-tabular text-slate-400"
                  >
                    {w.code}
                  </div>
                ))}
                {state.complaints
                  .filter((c) => !c.masterIssueId)
                  .map((c) => {
                    const sla = formatSlaDelta(c.slaDeadline, c.fairSlaCreditHours, c.status);
                    const color =
                      c.status === 'Escalated' || sla.isOverdue
                        ? 'bg-[#dc2626] text-white'
                        : c.status === 'Resolved' || c.status === 'Closed'
                        ? 'bg-[#059669] text-white'
                        : 'bg-[#2563eb] text-white';
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        style={{ left: `${c.mapX}%`, top: `${c.mapY}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group"
                      >
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono-tabular font-bold shadow ring-1 ring-white/25 ${color}`}>
                          #{c.id}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB: SMART ROUTING */}
          {tab === 'routing' && state && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-8 bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-white">Active Automated Dispatch Rules</h2>
                {state.routingRules.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl bg-[#131c31] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">
                        P{r.priority} · {r.name}
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        {r.category} · Ward: {r.wardId} → {state.departments.find((d) => d.id === r.departmentId)?.name} (
                        {r.strategy})
                      </div>
                    </div>
                    {isSupervisorOrAbove && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.updateRoutingRule(r.id, { active: !r.active });
                              await loadAdminState();
                            } catch (err) {
                              notify('err', err instanceof Error ? err.message : 'Failed to update rule.');
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                            r.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-400'
                          }`}
                        >
                          {r.active ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.deleteRoutingRule(r.id);
                              notify('ok', `Deleted rule "${r.name}".`);
                              await loadAdminState();
                            } catch (err) {
                              notify('err', err instanceof Error ? err.message : 'Failed to delete rule.');
                            }
                          }}
                          className="p-1.5 rounded-lg bg-red-500/20 text-red-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="xl:col-span-4 bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white">Add Routing Rule</h3>
                {!isSupervisorOrAbove ? (
                  <p className="text-xs text-amber-300">
                    RBAC Notice: Dispatcher role is read-only for routing policies. Supervisor or Commissioner access required.
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await api.createRoutingRule({
                          name: ruleName,
                          category: ruleCategory,
                          wardId: ruleWard,
                          departmentId: ruleDept,
                          strategy: 'lowest_workload',
                          specificOfficerId: null,
                          priority: state.routingRules.length + 1,
                        });
                        setRuleName('');
                        notify('ok', 'Routing rule added.');
                        await loadAdminState();
                      } catch (err) {
                        notify('err', err instanceof Error ? err.message : 'Failed to create rule.');
                      }
                    }}
                    className="space-y-3 text-xs"
                  >
                    <input
                      type="text"
                      required
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      placeholder="Rule title (e.g. Ward 04 Priority Paving)"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <select
                      value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value as IssueCategory | 'ALL')}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    >
                      <option value="ALL">ALL Categories</option>
                      {ALL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ruleWard}
                      onChange={(e) => setRuleWard(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    >
                      <option value="ALL">ALL Wards</option>
                      {state.wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} · {w.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ruleDept}
                      onChange={(e) => setRuleDept(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    >
                      {state.departments
                        .filter((d) => d.active)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} · {d.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer transition-colors"
                    >
                      Deploy Routing Rule
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB: SLA & ESCALATIONS */}
          {tab === 'sla' && state && (
            <div className="space-y-6">
              <div className="bg-[#0b1221] border border-white/10 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white">Autonomous SLA Enforcement Sweep</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Runs every 60s server-side or manually on demand to escalate overdue tickets through Tier 2 &amp; Tier 3.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.runSlaSweep();
                      notify('ok', `SLA Sweep executed: ${res.escalationsCreated} new escalation(s) triggered.`);
                      await loadAdminState();
                      await onDataChanged();
                    } catch (err) {
                      notify('err', err instanceof Error ? err.message : 'SLA sweep failed.');
                    }
                  }}
                  className="px-5 py-2.5 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  Run Live SLA Sweep Now
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.slaPolicies.map((p) => (
                  <div key={p.category} className="p-5 rounded-2xl bg-[#0b1221] border border-white/10 space-y-3 text-xs">
                    <div className="font-bold text-white text-sm">{p.category}</div>
                    <div className="flex justify-between text-slate-300">
                      <span>Ordinance Target</span>
                      <span className="font-mono-tabular font-bold text-[#93c5fd]">{p.targetHours}h</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Critical Warning</span>
                      <span className="font-mono-tabular">{p.warningThresholdPct}%</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Tier 3 Commissioner Breach</span>
                      <span className="font-mono-tabular text-red-300">+{p.tier3BreachHours}h</span>
                    </div>
                    {isSupervisorOrAbove && (
                      <div className="pt-2 border-t border-white/10 flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.updateSlaPolicy(p.category, { targetHours: Math.max(4, p.targetHours - 2) });
                              notify('ok', `Tightened SLA for ${p.category} to ${Math.max(4, p.targetHours - 2)}h.`);
                              await loadAdminState();
                            } catch (err) {
                              notify('err', err instanceof Error ? err.message : 'Failed to update SLA policy.');
                            }
                          }}
                          className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white cursor-pointer"
                        >
                          -2h Target
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.updateSlaPolicy(p.category, { targetHours: p.targetHours + 2 });
                              notify('ok', `Adjusted SLA for ${p.category} to ${p.targetHours + 2}h.`);
                              await loadAdminState();
                            } catch (err) {
                              notify('err', err instanceof Error ? err.message : 'Failed to update SLA policy.');
                            }
                          }}
                          className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white cursor-pointer"
                        >
                          +2h Target
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: DUPLICATE DETECTION */}
          {tab === 'duplicates' && state && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-white">Detected Candidate Pairs</h2>
                {state.duplicateCandidates.length === 0 ? (
                  <p className="text-xs text-slate-400">No unmerged duplicate candidates right now.</p>
                ) : (
                  state.duplicateCandidates.map((d) => (
                    <div key={d.pairId} className="p-4 rounded-xl bg-[#131c31] border border-white/10 space-y-2.5 text-xs">
                      <div className="flex justify-between">
                        <span className="font-mono-tabular font-bold text-[#93c5fd]">
                          Master #{d.primaryId} ← Candidate #{d.secondaryId}
                        </span>
                        <span className="font-mono-tabular font-bold text-amber-300">
                          {d.confidenceScore}% ({d.distanceMeters}m)
                        </span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{d.reason}</p>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.mergeDuplicates(d.primaryId, d.secondaryId, 'Verified proximity & category match.');
                            notify('ok', `Clustered #${d.secondaryId} under #${d.primaryId}.`);
                            await loadAdminState();
                            await onDataChanged();
                          } catch (err) {
                            notify('err', err instanceof Error ? err.message : 'Merge failed.');
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold cursor-pointer transition-colors"
                      >
                        Merge Under Master #{d.primaryId}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-white">Active Clustered Child Tickets (Preserved)</h2>
                {state.complaints
                  .filter((c) => Boolean(c.masterIssueId))
                  .map((c) => (
                    <div key={c.id} className="p-4 rounded-xl bg-[#131c31] border border-white/10 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-mono-tabular font-bold text-white">
                          #{c.id} → Master #{c.masterIssueId}
                        </div>
                        <div className="text-slate-400 mt-0.5">{c.title}</div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.separateDuplicate(c.id, 'Separated for independent field verification.');
                            notify('ok', `Separated #${c.id} into independent ticket.`);
                            await loadAdminState();
                            await onDataChanged();
                          } catch (err) {
                            notify('err', err instanceof Error ? err.message : 'Separation failed.');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-red-300 font-semibold cursor-pointer shrink-0"
                      >
                        Separate
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB: DEPARTMENTS */}
          {tab === 'departments' && state && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {state.departments.map((d) => (
                  <div key={d.id} className="p-5 rounded-2xl bg-[#0b1221] border border-white/10 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono-tabular font-bold text-[#93c5fd]">{d.code}</span>
                      <span className={d.active ? 'text-emerald-300 font-bold' : 'text-red-300'}>
                        {d.active ? 'ACTIVE' : `MERGED → ${d.mergedIntoId}`}
                      </span>
                    </div>
                    <div className="text-base font-bold text-white">{d.name}</div>
                    <p className="text-slate-400 leading-relaxed">{d.description}</p>
                    <div className="pt-2 text-[11px] text-[#93c5fd]">{d.categories.join(' · ')}</div>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-4 bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Create Municipal Bureau</h3>
                {!isCommissioner ? (
                  <p className="text-xs text-amber-300">Commissioner role required to establish new departments.</p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await api.createDepartment({
                          code: newDeptCode,
                          name: newDeptName,
                          description: newDeptDesc,
                          categories: ['Roads & Pavement'],
                          slaTargetPct: 94,
                        });
                        setNewDeptCode('');
                        setNewDeptName('');
                        setNewDeptDesc('');
                        notify('ok', 'New municipal bureau created.');
                        await loadAdminState();
                      } catch (err) {
                        notify('err', err instanceof Error ? err.message : 'Creation failed.');
                      }
                    }}
                    className="space-y-3 text-xs"
                  >
                    <input
                      type="text"
                      required
                      value={newDeptCode}
                      onChange={(e) => setNewDeptCode(e.target.value)}
                      placeholder="Code (e.g. UMD)"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <input
                      type="text"
                      required
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      placeholder="Bureau Name"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <textarea
                      rows={2}
                      value={newDeptDesc}
                      onChange={(e) => setNewDeptDesc(e.target.value)}
                      placeholder="Mandate description"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <button type="submit" className="w-full py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer">
                      Create Department
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB: OFFICERS */}
          {tab === 'officers' && state && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-[#0b1221] border border-white/10 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase text-[11px]">
                      <th className="py-3.5 px-4">Officer</th>
                      <th className="py-3.5 px-4">Role</th>
                      <th className="py-3.5 px-4">Department</th>
                      <th className="py-3.5 px-4 text-right">Workload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {state.officers.map((o) => (
                      <tr key={o.id} className="hover:bg-white/[0.03]">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{o.name}</div>
                          <div className="text-[11px] text-slate-400">{o.title}</div>
                        </td>
                        <td className="py-3.5 px-4 text-[#93c5fd]">{o.role}</td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {state.departments.find((d) => d.id === o.departmentId)?.name || o.departmentId}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-tabular font-bold text-[#60a5fa]">
                          {o.activeWorkload} / {o.maxCapacity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:col-span-4 bg-[#0b1221] border border-white/10 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Register Field Officer</h3>
                {!isSupervisorOrAbove ? (
                  <p className="text-xs text-amber-300">Supervisor or Commissioner permission required.</p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await api.createOfficer({
                          name: newOffName,
                          title: newOffTitle,
                          role: 'Officer',
                          email: `${newOffName.toLowerCase().replace(/[^a-z]/g, '')}@wardwise.gov`,
                          departmentId: newOffDept,
                          wardIds: ['w01', 'w04'],
                          maxCapacity: 8,
                        });
                        setNewOffName('');
                        notify('ok', 'Officer registered in dispatch pool.');
                        await loadAdminState();
                      } catch (err) {
                        notify('err', err instanceof Error ? err.message : 'Failed to register officer.');
                      }
                    }}
                    className="space-y-3 text-xs"
                  >
                    <input
                      type="text"
                      required
                      value={newOffName}
                      onChange={(e) => setNewOffName(e.target.value)}
                      placeholder="Officer Full Name"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <input
                      type="text"
                      value={newOffTitle}
                      onChange={(e) => setNewOffTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <select
                      value={newOffDept}
                      onChange={(e) => setNewOffDept(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    >
                      {state.departments
                        .filter((d) => d.active)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                    <button type="submit" className="w-full py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer">
                      Register Officer
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB: WARDS */}
          {tab === 'wards' && state && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {state.wards.map((w) => {
                const wp = state.wardPerformance.find((p) => p.wardId === w.id);
                return (
                  <div key={w.id} className="p-5 rounded-2xl bg-[#0b1221] border border-white/10 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono-tabular font-bold text-[#93c5fd]">{w.code}</span>
                      <span className="font-mono-tabular text-emerald-300">{wp?.slaCompliancePct ?? 97}% SLA</span>
                    </div>
                    <div className="text-base font-bold text-white">{w.name}</div>
                    <p className="text-slate-400 leading-relaxed">{w.districtSummary}</p>
                    <div className="pt-2 border-t border-white/10 flex justify-between text-[11px] text-slate-300">
                      <span>{w.alderperson}</span>
                      <span>Stress: {wp?.stressIndex ?? w.stressIndex}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB: REORGANIZATION SIMULATOR & EXECUTOR */}
          {tab === 'reorg' && state && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-[#0b1221] border border-white/10 rounded-2xl p-6 space-y-4 text-xs">
                <div>
                  <h2 className="text-base font-bold text-white">Department Reorganization &amp; Fair SLA Migration</h2>
                  <p className="text-slate-400 mt-1 leading-relaxed">
                    Preview impact before executing. Preserves original creation timestamps, elapsed hours, escalation
                    history, and awards Fair SLA Credit so restructured teams aren&apos;t unfairly penalized.
                  </p>
                </div>

                {!isCommissioner && (
                  <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-400/35 text-amber-200">
                    RBAC Notice: Commissioner authorization required to simulate or execute structural reorganizations.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'merge', label: 'Merge Bureaus' },
                      { id: 'split', label: 'Spin-Off Bureau' },
                      { id: 'officer_transfer', label: 'Transfer Officer' },
                      { id: 'ward_transfer', label: 'Transfer Ward' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setReorgType(t.id);
                        setReorgPreview(null);
                      }}
                      className={`py-2 px-3 rounded-lg font-semibold cursor-pointer transition-colors ${
                        reorgType === t.id
                          ? 'bg-[#2563eb] text-white'
                          : 'bg-[#131c31] text-slate-300 border border-white/10 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {(reorgType === 'merge' || reorgType === 'split') && (
                  <div>
                    <label className="block text-slate-400 mb-1">Source Department</label>
                    <select
                      value={reorgSourceDept}
                      onChange={(e) => setReorgSourceDept(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    >
                      {state.departments
                        .filter((d) => d.active)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} · {d.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {reorgType !== 'split' && (
                  <div>
                    <label className="block text-slate-400 mb-1">Target Department</label>
                    <select
                      value={reorgTargetDept}
                      onChange={(e) => setReorgTargetDept(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    >
                      {state.departments
                        .filter((d) => d.active)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} · {d.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {reorgType === 'split' && (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={reorgNewCode}
                      onChange={(e) => setReorgNewCode(e.target.value)}
                      placeholder="Code"
                      className="px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                    <input
                      type="text"
                      value={reorgNewName}
                      onChange={(e) => setReorgNewName(e.target.value)}
                      placeholder="New Bureau Name"
                      className="col-span-2 px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                    />
                  </div>
                )}

                {reorgType === 'officer_transfer' && (
                  <select
                    value={reorgOfficerId}
                    onChange={(e) => setReorgOfficerId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                  >
                    {state.officers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.role})
                      </option>
                    ))}
                  </select>
                )}

                {reorgType === 'ward_transfer' && (
                  <select
                    value={reorgWardId}
                    onChange={(e) => setReorgWardId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                  >
                    {state.wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} · {w.name}
                      </option>
                    ))}
                  </select>
                )}

                <div>
                  <label className="block text-slate-400 mb-1">Formal Reorganization Ordinance Reason</label>
                  <textarea
                    rows={2}
                    value={reorgReason}
                    onChange={(e) => setReorgReason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
                  />
                </div>

                {isCommissioner && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await api.previewReorg({
                          type: reorgType,
                          sourceDepartmentId: reorgSourceDept,
                          targetDepartmentId: reorgTargetDept,
                          newDepartmentName: reorgNewName,
                          newDepartmentCode: reorgNewCode,
                          officerId: reorgOfficerId,
                          wardId: reorgWardId,
                          categoriesToSplit: ['Parks & Trees'],
                        });
                        setReorgPreview(res.preview);
                      } catch (err) {
                        notify('err', err instanceof Error ? err.message : 'Preview failed.');
                      }
                    }}
                    className="w-full py-2.5 rounded-lg bg-white hover:bg-slate-100 text-[#0b1221] font-bold cursor-pointer transition-colors"
                  >
                    Simulate Migration Impact
                  </button>
                )}
              </div>

              <div className="lg:col-span-6 bg-[#0b1221] border border-white/10 rounded-2xl p-6 space-y-4 text-xs">
                <h3 className="text-base font-bold text-white">Simulation Preview &amp; Execution</h3>
                {!reorgPreview ? (
                  <div className="p-8 rounded-xl bg-[#131c31] border border-white/10 text-center text-slate-400">
                    Run &quot;Simulate Migration Impact&quot; to inspect affected tickets, officers, and Fair SLA preservation.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#131c31] border border-[#60a5fa]/40 text-white leading-relaxed">
                      {reorgPreview.summary}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-[#131c31] border border-white/10">
                        <span className="text-slate-400 block">Complaints</span>
                        <span className="text-lg font-mono-tabular font-bold text-[#93c5fd]">
                          {reorgPreview.affectedComplaintsCount}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-[#131c31] border border-white/10">
                        <span className="text-slate-400 block">Officers</span>
                        <span className="text-lg font-mono-tabular font-bold text-white">
                          {reorgPreview.affectedOfficersCount}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-[#131c31] border border-white/10">
                        <span className="text-slate-400 block">Rules</span>
                        <span className="text-lg font-mono-tabular font-bold text-white">
                          {reorgPreview.affectedRulesCount}
                        </span>
                      </div>
                    </div>
                    {reorgPreview.warnings.length > 0 ? (
                      <div className="p-3 rounded-xl bg-red-950/60 border border-red-400/40 text-red-200">
                        {reorgPreview.warnings[0]}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await api.executeReorg({
                              type: reorgType,
                              sourceDepartmentId: reorgSourceDept,
                              targetDepartmentId: reorgTargetDept,
                              newDepartmentName: reorgNewName,
                              newDepartmentCode: reorgNewCode,
                              officerId: reorgOfficerId,
                              wardId: reorgWardId,
                              categoriesToSplit: ['Parks & Trees'],
                              reason: reorgReason,
                              confirmed: true,
                            });
                            notify('ok', `Reorganization executed: ${res.migratedCount} open complaint(s) migrated with Fair SLA Credit.`);
                            setReorgPreview(null);
                            await loadAdminState();
                            await onDataChanged();
                          } catch (err) {
                            notify('err', err instanceof Error ? err.message : 'Execution failed.');
                          }
                        }}
                        className="w-full py-3 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer transition-colors"
                      >
                        Confirm &amp; Execute Reorganization
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ANALYTICS */}
          {tab === 'analytics' && state && (
            <div className="bg-[#0b1221] border border-white/10 rounded-2xl p-5 overflow-x-auto">
              <h2 className="text-sm font-bold text-white mb-4">Live Departmental SLA &amp; Backlog Matrix</h2>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase text-[11px]">
                    <th className="py-3.5 px-4">Bureau</th>
                    <th className="py-3.5 px-4 text-right">Backlog</th>
                    <th className="py-3.5 px-4 text-right">Resolved</th>
                    <th className="py-3.5 px-4 text-right">SLA %</th>
                    <th className="py-3.5 px-4 text-right">Escalation %</th>
                    <th className="py-3.5 px-4 text-right">Composite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {state.leaderboard.map((r) => (
                    <tr key={r.departmentId} className="hover:bg-white/[0.03]">
                      <td className="py-3.5 px-4 font-bold text-white">{r.name}</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular">{r.activeBacklog}</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular">{r.resolvedCount}</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-emerald-300">{r.slaCompliancePct}%</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-red-300">{r.escalationPct}%</td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-bold text-[#93c5fd]">{r.compositeScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {tab === 'audit' && state && (
            <div className="space-y-4">
              <div className="bg-[#0b1221] border border-white/10 rounded-2xl p-4">
                <input
                  type="text"
                  value={auditQuery}
                  onChange={(e) => setAuditQuery(e.target.value)}
                  placeholder="Filter audit logs by ticket ID, action, or official name…"
                  className="w-full px-4 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-xs text-white focus:outline-none focus:border-[#60a5fa]"
                />
              </div>
              <div className="bg-[#0b1221] border border-white/10 rounded-2xl divide-y divide-white/10 text-xs">
                {state.auditLogs
                  .filter((l) =>
                    !auditQuery
                      ? true
                      : `${l.action} ${l.entityId} ${l.actorName} ${l.reason}`
                          .toLowerCase()
                          .includes(auditQuery.toLowerCase())
                  )
                  .slice(0, 40)
                  .map((l) => (
                    <div key={l.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular font-bold text-[#93c5fd]">{l.action}</span>
                          <span className="text-slate-400">· {l.entityId}</span>
                          <span className="text-[#60a5fa]">by {l.actorName} ({l.actorRole})</span>
                        </div>
                        <div className="text-slate-300">
                          {l.previousValue} → <strong className="text-white">{l.newValue}</strong>
                        </div>
                        <div className="text-slate-400 italic">{l.reason}</div>
                      </div>
                      <div className="text-right font-mono-tabular text-[11px] text-slate-400">
                        <div>{new Date(l.timestamp).toLocaleString()}</div>
                        <div className="text-[#60a5fa]">sha256:{l.hash.slice(0, 14)}…</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* SLIDE-OVER COMPLAINT INSPECTION & RESOLUTION DRAWER */}
      <AnimatePresence>
        {selectedComplaint && state && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#070d19]/75 backdrop-blur-xs flex justify-end"
            onClick={() => setSelectedId(null)}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: WARDWISE_EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#0b1221] border-l border-white/10 h-full overflow-y-auto p-6 space-y-6 text-xs shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="font-mono-tabular text-sm font-bold text-[#93c5fd]">
                      #{selectedComplaint.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-[11px] text-slate-300">
                      v{selectedComplaint.version || 1}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedComplaint.wardName}</span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1">{selectedComplaint.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-400 cursor-pointer"
                  aria-label="Close inspection drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {conflictAlert && (
                <div className="p-4 rounded-xl bg-red-950/70 border border-red-400/50 text-red-200 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Concurrency Conflict (HTTP 409)</span>
                  </div>
                  <p>{conflictAlert}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setConflictAlert(null);
                      loadAdminState();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-300 text-[#070d19] font-bold cursor-pointer"
                  >
                    Reload Latest Server Version
                  </button>
                </div>
              )}

              {/* Private Citizen Contact (Admin Only) */}
              <div className="p-4 rounded-xl bg-[#131c31] border border-white/10 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Private Citizen Metadata (Hidden from Public API)
                </div>
                <div className="text-white font-semibold">
                  Reporter: {selectedComplaint.reporterName || 'Anonymous Resident'}
                </div>
                <div className="text-slate-400">
                  Contact: {selectedComplaint.reporterContact || 'Not provided'}
                </div>
              </div>

              {/* Status & Field Resolution Evidence */}
              <div className="p-4 rounded-xl bg-[#131c31] border border-white/10 space-y-3">
                <div className="font-bold text-white">Status Transition &amp; Field Evidence</div>
                <select
                  value={drawerStatus}
                  onChange={(e) => setDrawerStatus(e.target.value as IssueStatus)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0b1221] border border-white/15 text-white"
                >
                  {STATUS_LIST.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={3}
                  value={drawerNotes}
                  onChange={(e) => setDrawerNotes(e.target.value)}
                  placeholder="Inspector verification / resolution notes (required before Closed)…"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0b1221] border border-white/15 text-white"
                />
                <input
                  type="text"
                  value={drawerReason}
                  onChange={(e) => setDrawerReason(e.target.value)}
                  placeholder="Audit log note (optional)"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0b1221] border border-white/15 text-white"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={evidenceFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleEvidenceUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => evidenceFileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Resolution Photo</span>
                  </button>
                  {drawerPhoto && <span className="text-emerald-300 font-mono-tabular">Attached: {drawerPhoto}</span>}
                </div>

                {drawerPhoto && (
                  <div className="h-32 rounded-xl overflow-hidden border border-white/10">
                    <ResilientImage src={drawerPhoto} alt="Resolution proof" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={savingDrawer}
                    onClick={handleSaveDrawer}
                    className="flex-1 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    {savingDrawer ? 'Saving…' : 'Save Status & Evidence'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmergencyModalId(selectedComplaint.id)}
                    className="px-4 py-2.5 rounded-lg bg-[#dc2626]/25 hover:bg-[#dc2626]/40 border border-red-400/35 text-red-200 font-bold cursor-pointer"
                  >
                    Emergency Dispatch
                  </button>
                </div>
              </div>

              {/* Manual Reassignment */}
              <div className="p-4 rounded-xl bg-[#131c31] border border-white/10 space-y-3">
                <div className="font-bold text-white">Manual Reassignment (Audited Override)</div>
                <select
                  value={reassignDeptId}
                  onChange={(e) => setReassignDeptId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0b1221] border border-white/15 text-white"
                >
                  {state.departments
                    .filter((d) => d.active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
                <select
                  value={reassignOfficerId}
                  onChange={(e) => setReassignOfficerId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0b1221] border border-white/15 text-white"
                >
                  <option value="">Department Dispatch Pool</option>
                  {state.officers
                    .filter((o) => o.departmentId === reassignDeptId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.activeWorkload}/{o.maxCapacity})
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Mandatory reassignment reason (min 4 chars)…"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0b1221] border border-white/15 text-white"
                />
                <button
                  type="button"
                  disabled={savingDrawer}
                  onClick={handleReassignDrawer}
                  className="w-full py-2.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer transition-colors"
                >
                  Execute Audited Reassignment
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EMERGENCY DISPATCH MODAL */}
      <AnimatePresence>
        {emergencyModalId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#070d19]/80 flex items-center justify-center p-4"
            onClick={() => setEmergencyModalId(null)}
          >
            <form
              onSubmit={handleEmergencyDispatch}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-[#0b1221] border border-red-400/40 p-6 space-y-4 text-xs shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                  <Siren className="w-5 h-5" />
                  <span>Emergency Field Dispatch · #{emergencyModalId}</span>
                </div>
                <button type="button" onClick={() => setEmergencyModalId(null)} className="text-slate-400 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                required
                value={emergencyUnit}
                onChange={(e) => setEmergencyUnit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
              />
              <textarea
                rows={3}
                value={emergencyNote}
                onChange={(e) => setEmergencyNote(e.target.value)}
                placeholder="Urgent hazard mobilization directive…"
                className="w-full px-3 py-2.5 rounded-lg bg-[#131c31] border border-white/10 text-white"
              />
              <button type="submit" className="w-full py-2.5 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold cursor-pointer transition-colors">
                Confirm Emergency Mobilization
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
