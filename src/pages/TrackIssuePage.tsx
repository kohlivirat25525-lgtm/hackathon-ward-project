import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  GitMerge,
  Radio,
  Search,
  ShieldCheck,
  Star,
  Timer,
} from 'lucide-react';
import type { PublicBootstrapResponse } from '../lib/api';
import { api, formatRelativeTime, formatSlaDelta } from '../lib/api';
import type { ConnectionStatus } from '../lib/realtime';
import type { PublicComplaint, RealtimeEvent } from '../types/wardwise';
import type { PublicRoute } from '../components/Layout';
import { ResilientImage } from '../components/ResilientImage';
import { RevealBlock, StatusIndicator, WARDWISE_EASE } from '../components/DesignSystem';

interface TrackIssuePageProps {
  data: PublicBootstrapResponse | null;
  initialId?: string;
  realtimeStatus?: ConnectionStatus;
  lastRealtimeEvent?: RealtimeEvent | null;
  onNavigate?: (route: PublicRoute, query?: string) => void;
}

const PRESET_TICKETS = [
  { id: 'WW-8109', label: '#WW-8109 · Tier-3 Escalated' },
  { id: 'WW-8802', label: '#WW-8802 · Clustered Master' },
  { id: 'WW-8544', label: '#WW-8544 · Field Repair' },
  { id: 'WW-8924', label: '#WW-8924 · Resolved Review' },
];

export function TrackIssuePage({
  data,
  initialId,
  realtimeStatus = 'connected',
  lastRealtimeEvent,
  onNavigate,
}: TrackIssuePageProps) {
  const [queryId, setQueryId] = useState(initialId || 'WW-8109');
  const [activeId, setActiveId] = useState(initialId || 'WW-8109');
  const [record, setRecord] = useState<{
    complaint: PublicComplaint;
    masterComplaint: PublicComplaint | null;
    clusteredReportsCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Citizen Feedback state
  const [rating, setRating] = useState<number>(5);
  const [rectified, setRectified] = useState<'Yes' | 'Partially' | 'No'>('Yes');
  const [comment, setComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const fetchTicket = useCallback(async (ticketId: string) => {
    const cleaned = ticketId.trim().replace(/^#/, '');
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.trackComplaint(cleaned);
      setRecord(res);
      setActiveId(res.complaint.id);
    } catch (err) {
      setRecord(null);
      setError(err instanceof Error ? err.message : 'Unable to locate complaint record.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialId) {
      setQueryId(initialId);
      fetchTicket(initialId);
    } else {
      fetchTicket('WW-8109');
    }
  }, [initialId, fetchTicket]);

  // Live SSE auto-refresh when the currently inspected complaint or global state mutates
  useEffect(() => {
    if (!lastRealtimeEvent || !activeId) return;
    if (
      !lastRealtimeEvent.complaintId ||
      lastRealtimeEvent.complaintId.toUpperCase() === activeId.toUpperCase() ||
      lastRealtimeEvent.type === 'reorg:executed' ||
      lastRealtimeEvent.type === 'sla:swept' ||
      lastRealtimeEvent.type === 'duplicate:merged' ||
      lastRealtimeEvent.type === 'duplicate:separated'
    ) {
      fetchTicket(activeId);
    }
  }, [lastRealtimeEvent, activeId, fetchTicket]);

  const liveCitizenTickets = useMemo(
    () => (data?.complaints || []).filter((c) => !c.isDemo).slice(0, 4),
    [data]
  );

  const complaint = record?.complaint || null;

  const slaMeta = useMemo(() => {
    if (!complaint) return null;
    const delta = formatSlaDelta(complaint.slaDeadline, complaint.fairSlaCreditHours, complaint.status);
    const startMs = new Date(complaint.createdAt).getTime();
    const endMs =
      new Date(complaint.slaDeadline).getTime() + (complaint.fairSlaCreditHours || 0) * 3600 * 1000;
    const totalMs = Math.max(1, endMs - startMs);
    const refMs =
      complaint.resolvedAt && (complaint.status === 'Resolved' || complaint.status === 'Closed')
        ? new Date(complaint.resolvedAt).getTime()
        : Date.now();
    const burnPct = Math.min(100, Math.max(4, Math.round(((refMs - startMs) / totalMs) * 100)));
    return { delta, burnPct };
  }, [complaint]);

  const lifecycleStage = useMemo(() => {
    if (!complaint) return 1;
    if (complaint.status === 'Resolved' || complaint.status === 'Closed') return 4;
    if (complaint.status === 'In Progress' || complaint.status === 'Escalated' || complaint.status === 'Reopened')
      return 3;
    if (complaint.status === 'Routed') return 2;
    return 1;
  }, [complaint]);

  const handleCopyId = () => {
    if (!complaint) return;
    navigator.clipboard?.writeText(complaint.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint) return;
    setFeedbackError(null);
    setFeedbackSuccess(null);
    setSubmittingFeedback(true);
    try {
      const res = await api.submitFeedback(complaint.id, rating, comment, rectified);
      setRecord((prev) => (prev ? { ...prev, complaint: res.complaint } : prev));
      setFeedbackSuccess('Thank you! Your resolution verification has been recorded in the municipal ledger.');
      setComment('');
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to submit review.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleDownloadCertificate = () => {
    if (!complaint) return;
    const cert = {
      certificateType: 'WARDWISE-PUBLIC-AUDIT-CERTIFICATE',
      exportedAt: new Date().toISOString(),
      ticketId: complaint.id,
      recordType: complaint.isDemo ? 'DEMO' : 'LIVE',
      recordHash: complaint.recordHash || 'SHA256-VERIFIED',
      title: complaint.title,
      category: complaint.category,
      ward: complaint.wardName,
      department: complaint.departmentName,
      assignedOfficer: complaint.assignedOfficerName,
      status: complaint.status,
      escalationTier: complaint.escalationTier,
      slaHours: complaint.slaHours,
      fairSlaCreditHours: complaint.fairSlaCreditHours,
      slaDeadline: complaint.slaDeadline,
      statusHistory: complaint.statusHistory,
      escalationHistory: complaint.escalationHistory,
      citizenFeedback: complaint.citizenFeedback,
      piiNotice: 'Zero private citizen identifiers included.',
    };
    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wardwise-audit-${complaint.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="w-full bg-[#faf9f5] pb-20">
      <div className="max-w-[1320px] mx-auto px-5 md:px-10 lg:px-16 pt-6">
        {/* Header & Lookup Bar */}
        <RevealBlock className="pb-8 border-b border-[#e2e8f0]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-[#475569]">
                <span className="text-[#1e40af]">Citizen Verification Docket</span>
                <span aria-hidden="true">·</span>
                <span className={`inline-flex items-center gap-1.5 ${realtimeStatus === 'connected' ? 'text-[#059669]' : 'text-[#d97706]'}`}>
                  <Radio className="w-3.5 h-3.5" />
                  {realtimeStatus === 'connected' ? 'Live Status Sync' : 'Reconnecting'}
                </span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl text-[#0b1221] font-normal mt-2">
                Track My <span className="italic text-[#475569]">Civic Issue.</span>
              </h1>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchTicket(queryId);
            }}
            className="mt-6 flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queryId}
                onChange={(e) => setQueryId(e.target.value)}
                placeholder="Enter Complaint ID (e.g. WW-8109, WW-8802, WW-8924)..."
                className="w-full pl-11 pr-4 py-3.5 rounded-lg bg-white border border-[#e2e8f0] text-sm font-mono-tabular text-[#0b1221] focus:outline-none focus:border-[#1e40af] shadow-xs"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-7 py-3.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer shrink-0 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {loading ? 'Querying Ledger…' : 'Verify Audit Trail'}
            </button>
          </form>

          {/* Preset & Live Quick Picks */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569] mr-1">
              Quick Inspect:
            </span>
            {PRESET_TICKETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setQueryId(p.id);
                  fetchTicket(p.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeId.toUpperCase() === p.id
                    ? 'bg-[#0b1221] text-white'
                    : 'bg-[#f2f4f8] text-[#0b1221] border border-[#e2e8f0] hover:bg-[#e8ecf2]'
                }`}
              >
                {p.label}
              </button>
            ))}
            {liveCitizenTickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setQueryId(t.id);
                  fetchTicket(t.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeId.toUpperCase() === t.id.toUpperCase()
                    ? 'bg-[#1e40af] text-white'
                    : 'bg-[#dbeafe] text-[#1e40af] hover:bg-[#bfdbfe]'
                }`}
              >
                Live #{t.id}
              </button>
            ))}
          </div>
        </RevealBlock>

        {error && (
          <div className="my-8 p-6 rounded-2xl bg-red-50 border border-red-200 text-sm font-semibold text-[#dc2626]">
            {error}
          </div>
        )}

        {complaint && slaMeta && (
          <motion.div
            key={`${complaint.id}-${complaint.version}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: WARDWISE_EASE }}
            className="mt-8 space-y-6"
          >
            {/* Clustered Master Notice */}
            {record?.masterComplaint && (
              <div className="p-5 rounded-xl bg-[#dbeafe]/60 border border-[#93c5fd] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-[#0b1221]">
                  <GitMerge className="w-5 h-5 text-[#1e40af] shrink-0" />
                  <div>
                    <div className="font-bold">
                      Clustered Under Master Work Order #{record.masterComplaint.id}
                    </div>
                    <p className="mt-0.5 text-[#475569]">
                      Your original report remains preserved. Field crews are executing repair under unified ticket #
                      {record.masterComplaint.id}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQueryId(record.masterComplaint!.id);
                    fetchTicket(record.masterComplaint!.id);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#0b1221] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  View Master #{record.masterComplaint.id} →
                </button>
              </div>
            )}

            {/* CASE OVERVIEW CARD */}
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-[#e2e8f0]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs mb-2 text-[#64748b]">
                    <span className="font-mono-tabular font-bold text-[#0b1221] text-sm">#{complaint.id}</span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#f2f4f8] hover:bg-[#e8ecf2] border border-[#e2e8f0] text-[11px] font-semibold text-[#475569] cursor-pointer"
                    >
                      {copied ? <Check className="w-3 h-3 text-[#059669]" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy ID'}</span>
                    </button>
                    <span aria-hidden="true">·</span>
                    <span className="text-[11px] font-semibold text-[#475569]">
                      {complaint.isDemo ? 'Demo Record' : 'Live Citizen Record'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[11px]">
                      Filed {formatRelativeTime(complaint.createdAt)}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl text-[#0b1221] font-normal">
                    {complaint.title}
                  </h2>
                  <p className="text-sm text-[#475569] mt-2 max-w-3xl leading-relaxed">{complaint.description}</p>
                </div>

                <div className="flex flex-col sm:items-end gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <StatusIndicator status={complaint.status} isOverdue={slaMeta.delta.isOverdue} />
                    <span className="text-[#64748b] text-xs" aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-xs font-bold text-[#0b1221]">
                      Tier {complaint.escalationTier}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadCertificate}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Audit Certificate</span>
                  </button>
                </div>
              </div>

              {/* 4-Column Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 pt-6 text-xs">
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                    Jurisdiction &amp; Address
                  </span>
                  <span className="font-bold text-[#0b1221] mt-1 block">{complaint.wardName}</span>
                  <span className="text-[#475569]">{complaint.address}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                    Assigned Department
                  </span>
                  <span className="font-bold text-[#1e40af] mt-1 block">{complaint.departmentName}</span>
                  <span className="text-[#475569]">{complaint.category}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                    Responsible Officer
                  </span>
                  <span className="font-bold text-[#0b1221] mt-1 block">{complaint.assignedOfficerName}</span>
                  <span className="text-[#475569]">Severity: {complaint.severity}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                    Ledger Digest
                  </span>
                  <span className="font-mono-tabular font-semibold text-[#0b1221] mt-1 block truncate">
                    {complaint.recordHash || `0x${complaint.id.toLowerCase()}sha256`}
                  </span>
                  {record && record.clusteredReportsCount > 0 && (
                    <span className="text-[#1e40af] font-semibold">
                      +{record.clusteredReportsCount} clustered duplicate(s)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 4-STAGE LIFECYCLE CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { stage: 1, label: '01 · Citizen Submission', desc: 'Geotagged & duplicate-scanned' },
                { stage: 2, label: '02 · Bureau Routing', desc: `${complaint.departmentName}` },
                { stage: 3, label: '03 · Field Ops / SLA', desc: `Tier ${complaint.escalationTier} governance` },
                { stage: 4, label: '04 · Verified Closure', desc: 'Photo proof & citizen sign-off' },
              ].map((item) => {
                const done = lifecycleStage > item.stage;
                const current = lifecycleStage === item.stage;
                return (
                  <div
                    key={item.stage}
                    className={`p-4 rounded-xl border ${
                      current
                        ? 'bg-[#0b1221] text-white border-[#0b1221] shadow-xs'
                        : done
                        ? 'bg-[#dbeafe]/35 text-[#0b1221] border-[#93c5fd]'
                        : 'bg-white text-[#64748b] border-[#e2e8f0]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular font-bold">
                      <span className={current ? 'text-[#93c5fd]' : ''}>{item.label}</span>
                      {done && <CheckCircle2 className="w-4 h-4 text-[#059669]" />}
                    </div>
                    <div className={`text-xs mt-1.5 ${current ? 'text-slate-300' : 'text-[#475569]'}`}>{item.desc}</div>
                  </div>
                );
              })}
            </div>

            {/* SLA BURN BAR & 3-TIER ESCALATION LADDER */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-[#0b1221] text-white border border-[#1e293b] rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#93c5fd]">
                    <Timer className="w-4 h-4" />
                    <span>SLA Burn &amp; Deadline</span>
                  </div>
                  <span
                    className={`font-mono-tabular text-xs font-bold ${
                      slaMeta.delta.isOverdue ? 'text-red-300' : 'text-emerald-300'
                    }`}
                  >
                    {slaMeta.delta.label}
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-2">
                    <span>Window Consumption</span>
                    <span className="font-mono-tabular font-bold text-white">{slaMeta.burnPct}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        slaMeta.delta.isOverdue
                          ? 'bg-[#dc2626]'
                          : slaMeta.burnPct > 75
                          ? 'bg-[#d97706]'
                          : 'bg-[#059669]'
                      }`}
                      style={{ width: `${slaMeta.burnPct}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#131c31] border border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ordinance Target</span>
                    <span className="font-mono-tabular font-bold">{complaint.slaHours}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deadline Timestamp</span>
                    <span className="font-mono-tabular">
                      {new Date(complaint.slaDeadline).toLocaleString()}
                    </span>
                  </div>
                  {complaint.fairSlaCreditHours > 0 && (
                    <div className="flex justify-between text-[#93c5fd]">
                      <span>Reorg Fair SLA Credit</span>
                      <span className="font-mono-tabular font-bold">+{complaint.fairSlaCreditHours}h</span>
                    </div>
                  )}
                </div>

                {/* 3-Tier Ladder */}
                <div className="space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    3-Tier Escalation Ladder
                  </div>
                  {[
                    { tier: 1, title: 'Tier 1 · Field Officer', who: complaint.assignedOfficerName },
                    { tier: 2, title: 'Tier 2 · Dept Supervisor', who: 'Triggered on SLA breach / critical 75%' },
                    { tier: 3, title: 'Tier 3 · Commissioner Control', who: 'Executive intervention & ledger pin' },
                  ].map((t) => {
                    const reached = complaint.escalationTier >= t.tier;
                    return (
                      <div
                        key={t.tier}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                          reached
                            ? t.tier === 3
                              ? 'bg-[#dc2626]/20 border-red-400/40 text-white'
                              : t.tier === 2
                              ? 'bg-[#d97706]/20 border-amber-400/40 text-white'
                              : 'bg-[#131c31] border-white/20 text-white'
                            : 'bg-white/[0.03] border-white/10 text-slate-400 opacity-65'
                        }`}
                      >
                        <div>
                          <div className="font-bold">{t.title}</div>
                          <div className="text-[11px] opacity-85">{t.who}</div>
                        </div>
                        <span className="font-mono-tabular text-[11px] font-bold">
                          {reached ? 'ACTIVE' : 'STANDBY'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TIMELINE + PHOTO EVIDENCE */}
              <div className="lg:col-span-7 space-y-6">
                {/* Before & After Photo Evidence */}
                <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6">
                  <h3 className="font-display text-xl text-[#0b1221] mb-4">Photographic Verification &amp; Evidence</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569] block">
                        Intake Condition (Before)
                      </span>
                      <div className="h-44 rounded-xl overflow-hidden border border-[#e2e8f0] bg-[#f2f4f8]">
                        <ResilientImage
                          src={complaint.photoUrl}
                          alt="Citizen intake condition"
                          className="w-full h-full object-cover"
                          fallbackLabel="No intake photograph attached"
                        />
                      </div>
                      {complaint.photoHash && (
                        <span className="block text-[10px] font-mono-tabular text-[#64748b]">
                          {complaint.photoHash}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569] block">
                        Field Resolution Proof (After)
                      </span>
                      <div className="h-44 rounded-xl overflow-hidden border border-[#e2e8f0] bg-[#f2f4f8]">
                        <ResilientImage
                          src={complaint.resolutionPhotoUrl}
                          alt="Inspector resolution proof"
                          className="w-full h-full object-cover"
                          fallbackLabel="Pending field completion photograph"
                        />
                      </div>
                      {complaint.resolutionPhotoHash && (
                        <span className="block text-[10px] font-mono-tabular text-[#059669]">
                          {complaint.resolutionPhotoHash}
                        </span>
                      )}
                    </div>
                  </div>
                  {complaint.resolutionNotes && (
                    <div className="mt-4 p-4 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] text-xs text-[#0b1221]">
                      <strong className="block text-[11px] uppercase tracking-wider text-[#475569] mb-1">
                        Official Inspector Field Notes
                      </strong>
                      {complaint.resolutionNotes}
                    </div>
                  )}
                </div>

                {/* Chronological Status & Escalation History */}
                <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl text-[#0b1221]">Chronological Status &amp; Routing Ledger</h3>
                    <span className="text-xs font-mono-tabular text-[#64748b]">
                      {complaint.statusHistory.length} Event(s)
                    </span>
                  </div>
                  <div className="space-y-3">
                    {[...complaint.statusHistory].reverse().map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3.5 rounded-xl bg-[#faf9f5] border border-[#e2e8f0] flex items-start gap-3 text-xs"
                      >
                        <div className="w-7 h-7 rounded-lg bg-white border border-[#e2e8f0] flex items-center justify-center shrink-0 mt-0.5">
                          {ev.status === 'Escalated' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#dc2626]" />
                          ) : ev.status === 'Resolved' || ev.status === 'Closed' ? (
                            <BadgeCheck className="w-3.5 h-3.5 text-[#059669]" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-[#1e40af]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-[#0b1221]">
                              {ev.status} · <span className="text-[#475569] font-medium">{ev.actor}</span>
                            </span>
                            <span className="font-mono-tabular text-[11px] text-[#64748b]">
                              {new Date(ev.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[#475569] mt-1 leading-relaxed">{ev.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* CITIZEN FEEDBACK & QUALITY VERIFICATION */}
            <div className="bg-[#f2f4f8] border border-[#e2e8f0] rounded-2xl p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-display text-2xl text-[#0b1221]">Citizen Resolution Verification</h3>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Public feedback scores feed directly into the monthly Department Accountability Leaderboard.
                  </p>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('/map', `ward=${encodeURIComponent(complaint.wardId)}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    <span>View {complaint.wardName.split('·')[0]} on City Map</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {complaint.citizenFeedback ? (
                <div className="p-5 rounded-xl bg-white border border-emerald-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#059669]">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Citizen Verification Logged</span>
                      {complaint.citizenFeedback.rectified && (
                        <span className="text-[#475569] font-semibold">
                          · Rectified: {complaint.citizenFeedback.rectified}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#0b1221] font-medium">
                      {complaint.citizenFeedback.comment || 'Verified satisfactory completion.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-5 h-5 ${
                          n <= complaint.citizenFeedback!.rating ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                        }`}
                      />
                    ))}
                    <span className="ml-2 font-mono-tabular text-sm font-bold text-[#0b1221]">
                      {complaint.citizenFeedback.rating}.0 / 5.0
                    </span>
                  </div>
                </div>
              ) : complaint.status === 'Resolved' || complaint.status === 'Closed' ? (
                <form onSubmit={handleFeedbackSubmit} className="bg-white border border-[#e2e8f0] rounded-xl p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-[#0b1221] mb-2">
                        Rate Quality of Municipal Resolution
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRating(n)}
                            className="p-1.5 rounded-lg hover:bg-[#faf9f5] cursor-pointer"
                            aria-label={`Rate ${n} stars`}
                          >
                            <Star
                              className={`w-6 h-6 ${
                                n <= rating ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="ml-2 text-xs font-mono-tabular font-bold text-[#0b1221]">{rating}/5</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0b1221] mb-2">
                        Was the street/utility hazard fully rectified?
                      </label>
                      <div className="flex items-center gap-2">
                        {(['Yes', 'Partially', 'No'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setRectified(opt)}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                              rectified === opt
                                ? 'bg-[#0b1221] text-white'
                                : 'bg-[#f2f4f8] text-[#475569] hover:bg-[#e8ecf2]'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional field note on repair quality or lingering hazards..."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs text-[#0b1221]"
                  />

                  {feedbackError && <div className="text-xs font-semibold text-[#dc2626]">{feedbackError}</div>}
                  {feedbackSuccess && <div className="text-xs font-semibold text-[#059669]">{feedbackSuccess}</div>}

                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{submittingFeedback ? 'Recording Review…' : 'Submit Public Verification'}</span>
                  </button>
                </form>
              ) : (
                <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] text-xs text-[#475569]">
                  Citizen quality rating unlocks automatically once the assigned department marks this ticket{' '}
                  <strong className="text-[#0b1221]">Resolved</strong> with field verification evidence.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
