import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Compass,
  Droplets,
  Eye,
  GitMerge,
  Lightbulb,
  MapPin,
  Network,
  Radio,
  Route,
  Search,
  ShieldCheck,
  Timer,
  TrafficCone,
  Trash2,
  Trees,
  Wrench,
} from 'lucide-react';
import type { PublicBootstrapResponse } from '../lib/api';
import { formatRelativeTime, formatSlaDelta } from '../lib/api';
import type { ConnectionStatus } from '../lib/realtime';
import type { IssueCategory, PublicComplaint, RealtimeEvent } from '../types/wardwise';
import type { PublicRoute } from '../components/Layout';
import { ResilientImage } from '../components/ResilientImage';
import {
  AnimatedNumber,
  RevealBlock,
  SectionHeading,
  StatusIndicator,
  WARDWISE_EASE,
} from '../components/DesignSystem';

interface HomePageProps {
  data: PublicBootstrapResponse | null;
  realtimeStatus?: ConnectionStatus;
  lastRealtimeEvent?: RealtimeEvent | null;
  onNavigate: (route: PublicRoute, query?: string) => void;
}

type HeroFilter = 'all' | 'water' | 'roads' | 'sanitation' | 'signals';

function matchesHeroFilter(category: IssueCategory, filter: HeroFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'water') return category === 'Water & Drainage';
  if (filter === 'roads') return category === 'Roads & Pavement';
  if (filter === 'sanitation') return category === 'Sanitation & Waste';
  return category === 'Traffic & Signals' || category === 'Street Lighting & Power' || category === 'Parks & Trees';
}

function CategoryGlyph({ category }: { category: IssueCategory }) {
  if (category === 'Water & Drainage') return <Droplets className="w-3.5 h-3.5" />;
  if (category === 'Sanitation & Waste') return <Trash2 className="w-3.5 h-3.5" />;
  if (category === 'Street Lighting & Power') return <Lightbulb className="w-3.5 h-3.5" />;
  if (category === 'Traffic & Signals') return <TrafficCone className="w-3.5 h-3.5" />;
  if (category === 'Parks & Trees') return <Trees className="w-3.5 h-3.5" />;
  return <Wrench className="w-3.5 h-3.5" />;
}

export function HomePage({
  data,
  realtimeStatus = 'connected',
  lastRealtimeEvent,
  onNavigate,
}: HomePageProps) {
  const prefersReduced = useReducedMotion();
  const [heroFilter, setHeroFilter] = useState<HeroFilter>('all');
  const [selectedPinId, setSelectedPinId] = useState<string>('WW-8802');
  const [quickTrackId, setQuickTrackId] = useState<string>('');
  const [workflowStep, setWorkflowStep] = useState<number>(0);
  const [selectedWardId, setSelectedWardId] = useState<string>('w04');
  const [escalationPhase, setEscalationPhase] = useState<1 | 2 | 3>(2);
  const [reorgSimulated, setReorgSimulated] = useState(false);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 });

  const complaints = data?.complaints || [];
  const wards = data?.wards || [];
  const leaderboard = data?.leaderboard || [];
  const monthly = data?.monthlyPerformance || [];

  const activeMapPins = useMemo(() => {
    const open = complaints.filter((c) => c.status !== 'Closed');
    const filtered = open.filter((c) => matchesHeroFilter(c.category, heroFilter));
    return filtered.slice(0, 9);
  }, [complaints, heroFilter]);

  const selectedComplaint: PublicComplaint | undefined = useMemo(() => {
    return (
      complaints.find((c) => c.id === selectedPinId) ||
      activeMapPins[0] ||
      complaints[0]
    );
  }, [complaints, selectedPinId, activeMapPins]);

  const liveFeedItems = useMemo(() => {
    return complaints.slice(0, 4);
  }, [complaints]);

  const tickerMessages = useMemo(() => {
    if (lastRealtimeEvent?.summary) {
      return [
        lastRealtimeEvent.summary,
        ...complaints
          .slice(0, 4)
          .map(
            (c) =>
              `#${c.id} (${c.isDemo ? 'Demo' : 'Live'}) · ${c.wardName.split('·')[0].trim()} · ${c.departmentName}`
          ),
      ];
    }
    if (complaints.length === 0) {
      return ['Synchronizing 12 municipal wards and active SLA clocks'];
    }
    return complaints
      .slice(0, 5)
      .map(
        (c) =>
          `#${c.id} (${c.isDemo ? 'Demo' : 'Live'}) · ${c.wardName.split('·')[0].trim()} · ${c.departmentName}`
      );
  }, [complaints, lastRealtimeEvent]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTickerIdx((prev) => (prev + 1) % Math.max(1, tickerMessages.length));
    }, 4500);
    return () => clearInterval(timer);
  }, [tickerMessages.length]);

  const selectedWardPerf = useMemo(() => {
    return (
      data?.wardPerformance.find((w) => w.wardId === selectedWardId) ||
      data?.wardPerformance[0]
    );
  }, [data, selectedWardId]);

  const selectedWardMeta = useMemo(() => {
    return wards.find((w) => w.id === selectedWardId) || wards[0];
  }, [wards, selectedWardId]);

  const selectedWardTickets = useMemo(() => {
    return complaints.filter((c) => c.wardId === selectedWardId).slice(0, 3);
  }, [complaints, selectedWardId]);

  const selectedSla = selectedComplaint
    ? formatSlaDelta(
        selectedComplaint.slaDeadline,
        selectedComplaint.fairSlaCreditHours,
        selectedComplaint.status
      )
    : null;

  const selectedSlaBurnPct = useMemo(() => {
    if (!selectedComplaint) return 45;
    const startMs = new Date(selectedComplaint.createdAt).getTime();
    const endMs =
      new Date(selectedComplaint.slaDeadline).getTime() +
      (selectedComplaint.fairSlaCreditHours || 0) * 3600 * 1000;
    const totalMs = Math.max(1, endMs - startMs);
    const refMs =
      selectedComplaint.resolvedAt &&
      (selectedComplaint.status === 'Resolved' || selectedComplaint.status === 'Closed')
        ? new Date(selectedComplaint.resolvedAt).getTime()
        : Date.now();
    return Math.min(100, Math.max(8, Math.round(((refMs - startMs) / totalMs) * 100)));
  }, [selectedComplaint]);

  const workflowStages = [
    {
      step: '01',
      verb: 'Report',
      title: 'Structured Civic Intake',
      summary:
        'Residents classify the street or utility issue, attach up to 4 field photos, and drop a coordinate pin in under 60 seconds.',
      detail: 'Private contact info is isolated immediately; zero PII enters the public map stream.',
      icon: Camera,
      route: '/report' as PublicRoute,
      cta: 'Start a Report',
    },
    {
      step: '02',
      verb: 'Verify',
      title: 'Ward Polygon & Duplicate Scan',
      summary:
        'Spatial rules match coordinates to one of 12 municipal wards while scanning nearby reports within 350 meters for duplicates.',
      detail: 'Duplicate clusters consolidate crew dispatch while preserving every citizen receipt.',
      icon: Compass,
      route: '/map' as PublicRoute,
      cta: 'Explore Ward Map',
    },
    {
      step: '03',
      verb: 'Assign',
      title: 'Deterministic Officer Routing',
      summary:
        'Priority routing rules dispatch the ticket directly to the lowest-workload eligible field engineer in the accountable bureau.',
      detail: 'Every routing decision writes a SHA-256 tamper-evident entry to the operational ledger.',
      icon: Route,
      route: '/transparency' as PublicRoute,
      cta: 'Inspect Bureaus',
    },
    {
      step: '04',
      verb: 'Resolve',
      title: 'Enforced SLA & Escalation',
      summary:
        'Category SLA timers run continuously. Any approaching or breached deadline elevates automatically to Supervisor and Commissioner queues.',
      detail: 'Tickets cannot be closed without field inspector verification notes and completion photography.',
      icon: Timer,
      route: '/track' as PublicRoute,
      cta: 'Inspect SLA Clock',
    },
    {
      step: '05',
      verb: 'Track',
      title: 'Citizen Sign-Off & Open Audit',
      summary:
        'Citizens monitor live status transitions, inspect before-and-after repair evidence, and rate final work quality.',
      detail: 'Verified ratings feed directly into the public Department Accountability Leaderboard.',
      icon: BadgeCheck,
      route: '/track' as PublicRoute,
      cta: 'Track an Issue',
    },
  ];

  const activeStage = workflowStages[workflowStep];
  const ActiveStageIcon = activeStage.icon;

  return (
    <div className="flex flex-col w-full bg-[#faf9f5] text-[#0b1221]">
      {/* ================================================================= */}
      {/* 01. ARCHITECTURAL LIVE-CITY HERO (DEEP MIDNIGHT NAVY COMMAND)     */}
      {/* ================================================================= */}
      <section className="relative w-full overflow-hidden bg-[#060b16] text-white pt-10 pb-16 lg:pt-14 lg:pb-24 border-b border-white/10">
        {/* Multi-Layered Architectural Background & Atmospheric Cobalt Light */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 68% 58% at 74% 38%, rgba(37, 99, 235, 0.22), transparent 70%), radial-gradient(ellipse 50% 45% at 14% 84%, rgba(30, 64, 175, 0.16), transparent 65%), linear-gradient(to bottom, rgba(7, 13, 25, 0.2), rgba(11, 18, 33, 0.96))',
          }}
          aria-hidden="true"
        />
        {/* Fine Architectural Blueprint Grid Overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148, 163, 184, 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.5) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* LEFT COLUMN: EDITORIAL COMMAND PROPOSITION */}
            <div className="lg:col-span-5 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: WARDWISE_EASE }}
                className="flex items-center gap-3 text-xs font-semibold tracking-widest uppercase"
              >
                <span className="h-[1px] w-7 bg-[#60a5fa]" aria-hidden="true" />
                <span className="text-[#93c5fd]">Municipal Infrastructure OS</span>
                <span aria-hidden="true" className="text-white/25">
                  ·
                </span>
                <span className="text-slate-300 font-mono-tabular">12 Wards Connected</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.06, ease: WARDWISE_EASE }}
                className="font-display text-4xl sm:text-5xl xl:text-[62px] xl:leading-[1.06] tracking-tight font-normal text-white text-balance"
              >
                Making every civic issue{' '}
                <span className="italic bg-gradient-to-r from-[#93c5fd] via-[#bfdbfe] to-white bg-clip-text text-transparent">
                  impossible to ignore.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12, ease: WARDWISE_EASE }}
                className="text-base text-slate-300/95 leading-relaxed max-w-xl"
              >
                WARDWISE replaces opaque municipal complaint boxes with a live urban operations network:
                instant ward polygon routing, ordinance-enforced SLA escalation, and photographic public verification.
              </motion.p>

              {/* Primary & Secondary Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.18, ease: WARDWISE_EASE }}
                className="flex flex-wrap items-center gap-3.5 pt-1"
              >
                <button
                  type="button"
                  onClick={() => onNavigate('/report')}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold shadow-lg shadow-[#2563eb]/25 ring-1 ring-[#60a5fa]/40 transition-all cursor-pointer group whitespace-nowrap"
                >
                  <span>Report an Issue</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/map')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.11] border border-white/15 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Compass className="w-4 h-4 text-[#93c5fd]" />
                  <span>Explore Live City Map</span>
                </button>
              </motion.div>

              {/* Direct Quick-Track Lookup Bar */}
              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.22, ease: WARDWISE_EASE }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const cleaned = quickTrackId.trim().replace(/^#/, '');
                  if (cleaned) {
                    onNavigate('/track', `id=${encodeURIComponent(cleaned)}`);
                  } else if (selectedComplaint) {
                    onNavigate('/track', `id=${encodeURIComponent(selectedComplaint.id)}`);
                  }
                }}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0b1221]/90 border border-white/12 max-w-md shadow-inner"
              >
                <Search className="w-4 h-4 text-slate-400 ml-2.5 shrink-0" />
                <input
                  type="text"
                  value={quickTrackId}
                  onChange={(e) => setQuickTrackId(e.target.value)}
                  placeholder={`Track ticket ID (e.g. ${selectedComplaint?.id || 'WW-8802'})`}
                  aria-label="Track complaint ticket ID"
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono-tabular text-white placeholder:text-slate-400 focus:outline-none py-2 px-1"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#93c5fd] hover:text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Track ID →
                </button>
              </motion.form>

              {/* Verifiable Operations Guarantees */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.26 }}
                className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300"
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    {realtimeStatus === 'connected' ? 'Live SSE Sync' : 'Resyncing Stream'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#60a5fa] shrink-0" />
                  <span className="truncate">SHA-256 Audit Trail</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Zero Private PII Exposed</span>
                </div>
              </motion.div>
            </div>

            {/* RIGHT COLUMN: EXECUTIVE METROPOLITAN GIS COMMAND CONSOLE */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12, ease: WARDWISE_EASE }}
              onMouseMove={(e) => {
                if (prefersReduced) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const nx = (e.clientX - rect.left) / rect.width - 0.5;
                const ny = (e.clientY - rect.top) / rect.height - 0.5;
                setHeroTilt({ x: nx * 2.2, y: ny * -2.2 });
              }}
              onMouseLeave={() => setHeroTilt({ x: 0, y: 0 })}
              className="lg:col-span-7"
            >
              <div className="rounded-2xl bg-[#0b1221]/95 border border-white/15 border-t-white/25 shadow-[0_28px_80px_-20px_rgba(0,0,0,0.85)] overflow-hidden">
                {/* 1. Console Header Bar with Animated Event Ticker & Category Filter */}
                <div className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-[#080e1a]">
                  <div className="flex items-center gap-2.5 text-xs min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-[#93c5fd] shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                      GRID 01–12
                    </span>
                    <span aria-hidden="true" className="text-white/20 shrink-0">
                      |
                    </span>
                    <div className="relative h-4 flex-1 min-w-[140px] overflow-hidden">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={tickerIdx}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.25, ease: WARDWISE_EASE }}
                          className="block text-slate-300 font-mono-tabular text-[11px] truncate"
                        >
                          {tickerMessages[tickerIdx]}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Interactive Category Filter */}
                  <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/10 shrink-0">
                    {(
                      [
                        { key: 'all', label: 'All' },
                        { key: 'water', label: 'Water' },
                        { key: 'roads', label: 'Roads' },
                        { key: 'sanitation', label: 'Waste' },
                        { key: 'signals', label: 'Grid' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setHeroFilter(tab.key)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          heroFilter === tab.key
                            ? 'bg-[#2563eb] text-white shadow-xs'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Unobstructed Interactive GIS Map Canvas */}
                <div className="relative h-[300px] sm:h-[330px] overflow-hidden bg-[#070c18]">
                  <div
                    className="absolute inset-0 transition-transform duration-300 ease-out"
                    style={{
                      transform: prefersReduced
                        ? undefined
                        : `perspective(1200px) rotateX(${heroTilt.y}deg) rotateY(${heroTilt.x}deg)`,
                    }}
                  >
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 1000 520"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <pattern id="hero-command-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                          <path
                            d="M 40 0 L 0 0 0 40"
                            fill="none"
                            stroke="rgba(148, 163, 184, 0.1)"
                            strokeWidth="0.8"
                          />
                        </pattern>
                        <radialGradient id="hero-pin-halo" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="rgba(96, 165, 250, 0.45)" />
                          <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
                        </radialGradient>
                      </defs>
                      <rect width="1000" height="520" fill="url(#hero-command-grid)" />
                      {/* Stylized Metropolitan River & Major Arterials */}
                      <path
                        d="M -40 245 C 190 190, 410 310, 720 205 C 880 155, 960 220, 1040 195"
                        fill="none"
                        stroke="rgba(37, 99, 235, 0.24)"
                        strokeWidth="20"
                      />
                      <path
                        d="M -40 245 C 190 190, 410 310, 720 205 C 880 155, 960 220, 1040 195"
                        fill="none"
                        stroke="rgba(147, 197, 253, 0.4)"
                        strokeWidth="1.5"
                      />
                      <path d="M 180 0 L 310 520" stroke="rgba(148,163,184,0.14)" strokeWidth="1.2" />
                      <path d="M 520 0 L 490 520" stroke="rgba(148,163,184,0.14)" strokeWidth="1.2" />
                      <path d="M 800 0 L 730 520" stroke="rgba(148,163,184,0.14)" strokeWidth="1.2" />
                      <path d="M 0 140 L 1000 115" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                      <path d="M 0 365 L 1000 390" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                      {/* Selected Complaint Halo & Dispatch Hub Vector */}
                      {selectedComplaint && (
                        <>
                          <circle
                            cx={selectedComplaint.mapX * 10}
                            cy={selectedComplaint.mapY * 5.2}
                            r="54"
                            fill="url(#hero-pin-halo)"
                          />
                          <line
                            x1={selectedComplaint.mapX * 10}
                            y1={selectedComplaint.mapY * 5.2}
                            x2={500}
                            y2={250}
                            stroke="rgba(147, 197, 253, 0.65)"
                            strokeWidth="1.5"
                            strokeDasharray="4,4"
                          />
                          <circle cx={500} cy={250} r="4" fill="#93c5fd" />
                        </>
                      )}
                    </svg>

                    {/* Ward Boundary Regions */}
                    {wards.map((w) => {
                      const isSelectedWard = selectedComplaint?.wardId === w.id;
                      return (
                        <div
                          key={w.id}
                          style={{
                            left: `${w.mapBounds.x1}%`,
                            top: `${w.mapBounds.y1}%`,
                            width: `${Math.max(13, w.mapBounds.x2 - w.mapBounds.x1)}%`,
                            height: `${Math.max(14, w.mapBounds.y2 - w.mapBounds.y1)}%`,
                          }}
                          className={`absolute rounded-lg border transition-all duration-200 pointer-events-none p-1.5 ${
                            isSelectedWard
                              ? 'border-[#60a5fa]/65 bg-[#2563eb]/15 shadow-[inset_0_0_20px_rgba(37,99,235,0.2)]'
                              : 'border-white/[0.07] bg-white/[0.015]'
                          }`}
                        >
                          <span
                            className={`text-[9px] font-mono-tabular font-semibold ${
                              isSelectedWard ? 'text-[#93c5fd]' : 'text-slate-500'
                            }`}
                          >
                            {w.code}
                          </span>
                        </div>
                      );
                    })}

                    {/* Clickable Live/Demo Issue Markers */}
                    {activeMapPins.map((pin) => {
                      const sla = formatSlaDelta(pin.slaDeadline, pin.fairSlaCreditHours, pin.status);
                      const isSelected = selectedComplaint?.id === pin.id;
                      const isCritical = pin.status === 'Escalated' || sla.isOverdue;
                      const isResolved = pin.status === 'Resolved';
                      const markerBg = isCritical
                        ? 'bg-[#dc2626]'
                        : isResolved
                        ? 'bg-[#059669]'
                        : 'bg-[#2563eb]';

                      return (
                        <button
                          key={pin.id}
                          type="button"
                          onClick={() => setSelectedPinId(pin.id)}
                          style={{ left: `${pin.mapX}%`, top: `${pin.mapY}%` }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer transition-transform duration-150 ${
                            isSelected ? 'scale-120 z-30' : 'hover:scale-110'
                          }`}
                          aria-label={`Inspect issue ${pin.id}: ${pin.title}`}
                        >
                          <span className="relative flex h-7 w-7 items-center justify-center">
                            {isCritical && !prefersReduced && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#dc2626] opacity-45" />
                            )}
                            <span
                              className={`relative inline-flex rounded-full h-6 w-6 ${markerBg} items-center justify-center text-white shadow-lg ring-2 ${
                                isSelected ? 'ring-[#93c5fd]' : 'ring-white/85'
                              }`}
                            >
                              <CategoryGlyph category={pin.category} />
                            </span>
                          </span>
                          <span
                            className={`mt-1 block px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold whitespace-nowrap shadow-sm ${
                              isSelected
                                ? 'bg-[#2563eb] text-white ring-1 ring-[#93c5fd]/50'
                                : 'bg-[#0b1221]/90 text-slate-200 border border-white/15'
                            }`}
                          >
                            #{pin.id}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Subtle Bottom-Right Map Key (Never Obstructs Pins) */}
                  <div className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-lg bg-[#080e1a]/85 backdrop-blur-md border border-white/10 flex items-center gap-3 text-[10px] font-medium text-slate-300 pointer-events-none">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#2563eb]" /> Active
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#dc2626]" /> Escalated
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#059669]" /> Resolved
                    </span>
                  </div>
                </div>

                {/* 3. Docked Live Incident Dossier + Recent Dispatch Feed (Zero Map Collision) */}
                <div className="grid grid-cols-1 md:grid-cols-12 border-t border-white/10 bg-[#0d1629]">
                  {/* Left: Selected Complaint Dossier */}
                  <div className="md:col-span-7 p-4 sm:p-5 border-b md:border-b-0 md:border-r border-white/10">
                    {selectedComplaint && selectedSla ? (
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={selectedComplaint.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18, ease: WARDWISE_EASE }}
                          className="space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 font-mono-tabular text-slate-400">
                              <span className="font-bold text-[#93c5fd]">#{selectedComplaint.id}</span>
                              <span aria-hidden="true">·</span>
                              <span>{selectedComplaint.isDemo ? 'Demo Record' : 'Live Report'}</span>
                            </div>
                            <StatusIndicator
                              status={selectedComplaint.status}
                              isOverdue={selectedSla.isOverdue}
                              dark
                            />
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-white leading-snug line-clamp-1">
                              {selectedComplaint.title}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                              {selectedComplaint.wardName} · {selectedComplaint.departmentName}
                            </p>
                          </div>

                          {/* Live SLA Progress Bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">
                                Officer: <strong className="text-slate-200">{selectedComplaint.assignedOfficerName}</strong>
                              </span>
                              <span
                                className={`font-mono-tabular font-bold ${
                                  selectedSla.isOverdue ? 'text-red-300' : 'text-emerald-300'
                                }`}
                              >
                                {selectedSla.label}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  selectedSla.isOverdue
                                    ? 'bg-[#dc2626]'
                                    : selectedSlaBurnPct > 75
                                    ? 'bg-[#d97706]'
                                    : 'bg-[#059669]'
                                }`}
                                style={{ width: `${selectedSlaBurnPct}%` }}
                              />
                            </div>
                          </div>

                          <div className="pt-1 flex items-center justify-between text-xs">
                            <span className="text-[11px] text-slate-400">
                              Filed {formatRelativeTime(selectedComplaint.createdAt)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate('/track', `id=${encodeURIComponent(selectedComplaint.id)}`)
                              }
                              className="font-semibold text-[#93c5fd] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Inspect Audit Trail</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="text-xs text-slate-400 py-6">Select any pin on the grid to inspect.</div>
                    )}
                  </div>

                  {/* Right: Interactive Live Activity Feed */}
                  <div className="md:col-span-5 p-4 sm:p-5 bg-[#09101f]/70 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                        <span>Live Queue Selector</span>
                        <span className="font-mono-tabular text-[#93c5fd]">{activeMapPins.length} Pins</span>
                      </div>
                      <div className="space-y-1.5">
                        {liveFeedItems.slice(0, 3).map((item) => {
                          const active = selectedComplaint?.id === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedPinId(item.id)}
                              className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#2563eb]/20 border border-[#60a5fa]/40 text-white'
                                  : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.07] text-slate-300'
                              }`}
                            >
                              <span className="truncate font-medium">
                                <span className="font-mono-tabular font-bold text-[#93c5fd]">#{item.id}</span>{' '}
                                · {item.wardName.split('·')[0].trim()}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {item.isDemo ? 'Demo' : 'Live'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('/map')}
                      className="mt-3 text-[11px] font-semibold text-[#93c5fd] hover:text-white inline-flex items-center gap-1 cursor-pointer self-start"
                    >
                      <span>Open Full 12-Ward Map</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* 4. Live Operational Metric Strip Anchored Inside Hero Command Frame */}
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10 bg-[#080e1a] border-t border-white/10">
                  <div className="px-5 py-3.5">
                    <span className="block text-[11px] text-slate-400 font-medium">Tracked Public Queue</span>
                    <span className="font-mono-tabular text-xl font-bold text-white">
                      <AnimatedNumber value={data?.metrics.totalTracked ?? 16} />
                    </span>
                  </div>
                  <div className="px-5 py-3.5">
                    <span className="block text-[11px] text-slate-400 font-medium">Active Dispatch</span>
                    <span className="font-mono-tabular text-xl font-bold text-[#93c5fd]">
                      <AnimatedNumber value={data?.metrics.activeCount ?? 12} />
                    </span>
                  </div>
                  <div className="px-5 py-3.5">
                    <span className="block text-[11px] text-slate-400 font-medium">SLA Compliance</span>
                    <span className="font-mono-tabular text-xl font-bold text-emerald-300">
                      <AnimatedNumber value={data?.metrics.slaCompliancePct ?? 91.7} decimals={1} suffix="%" />
                    </span>
                  </div>
                  <div className="px-5 py-3.5">
                    <span className="block text-[11px] text-slate-400 font-medium">Escalated / Overdue</span>
                    <span className="font-mono-tabular text-xl font-bold text-red-300">
                      <AnimatedNumber value={data?.metrics.overdueCount ?? 3} />
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 02. TRUST & PLATFORM INTELLIGENCE METRICS                         */}
      {/* ================================================================= */}
      <section className="w-full bg-white border-b border-[#e2e8f0] py-12">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="font-display text-4xl lg:text-5xl text-[#0b1221]">
                <AnimatedNumber value={data?.metrics.demoTotalResolvedHistorical ?? 1239} suffix="+" />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mt-2">
                Issues Resolved (Demo Baseline + Live)
              </div>
            </div>
            <div>
              <div className="font-display text-4xl lg:text-5xl text-[#0b1221]">
                <AnimatedNumber value={data?.metrics.resolvedCount ?? 4} />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mt-2">
                Verified Completions in Active Cycle
              </div>
            </div>
            <div>
              <div className="font-display text-4xl lg:text-5xl text-[#1e40af]">
                <AnimatedNumber value={wards.length || 12} />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mt-2">
                Connected Municipal Wards
              </div>
            </div>
            <div>
              <div className="font-display text-4xl lg:text-5xl text-[#0b1221]">
                <AnimatedNumber value={leaderboard.length || 6} />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mt-2">
                Accountable Operating Bureaus
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 03. THE CIVIC PROBLEM (EDITORIAL STORYTELLING)                    */}
      {/* ================================================================= */}
      <section className="w-full bg-[#faf9f5] py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <RevealBlock className="lg:col-span-5 space-y-6">
              <div className="text-xs font-semibold tracking-wider uppercase text-[#1e40af]">
                01. Why Legacy Civic Reporting Fails
              </div>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-[42px] lg:leading-[1.15] text-[#0b1221] font-normal text-balance">
                Complaints vanish when{' '}
                <span className="italic text-[#475569]">nobody owns the clock.</span>
              </h2>
              <p className="text-base text-[#475569] leading-relaxed">
                In traditional municipal systems, residents file a pothole or main break into an unindexed inbox.
                Tickets bounce between divisions without named ownership, miss service deadlines silently, and close
                without proof of field repair.
              </p>
              <div className="pt-4 border-t border-[#e2e8f0] space-y-4">
                {[
                  {
                    title: 'Opaque Handoffs Eliminated',
                    desc: 'Every report binds directly to a ward boundary, responsible bureau, and named officer.',
                  },
                  {
                    title: 'Deadline Silence Made Impossible',
                    desc: 'Automated 3-tier SLA escalation routes stalled tickets up to Supervisors and the City Commissioner.',
                  },
                  {
                    title: 'Zero Silent Closures',
                    desc: 'Inspectors must upload photographic verification and field notes before a citizen review closes the record.',
                  },
                ].map((pt) => (
                  <div key={pt.title} className="space-y-1">
                    <h3 className="text-sm font-bold text-[#0b1221]">{pt.title}</h3>
                    <p className="text-sm text-[#475569]">{pt.desc}</p>
                  </div>
                ))}
              </div>
            </RevealBlock>

            <RevealBlock delay={0.08} className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 items-stretch">
              <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden flex flex-col">
                <div className="h-56 bg-[#e8ecf2]">
                  <ResilientImage
                    src="/src/assets/images/civic_citizen_reporting_1794931445606.jpg"
                    alt="Resident documenting street surface fracture on mobile device"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-medium text-[#64748b]">
                      Field Intake · Geo-Pinned Evidence
                    </div>
                    <h3 className="font-display text-2xl text-[#0b1221] mt-1">
                      Citizen Evidence Locked at Source
                    </h3>
                    <p className="text-sm text-[#475569] mt-2 leading-relaxed">
                      Coordinates, severity assessment, and field photographs receive a cryptographic digest upon submission.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/report')}
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    <span>Experience the 5-step intake</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden flex flex-col">
                <div className="h-56 bg-[#e8ecf2]">
                  <ResilientImage
                    src="/src/assets/images/civic_audit_ledger_1794931445911.jpg"
                    alt="Printed municipal accountability audit ledgers"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-medium text-[#64748b]">
                      Public Ledger · SHA-256 Trail
                    </div>
                    <h3 className="font-display text-2xl text-[#0b1221] mt-1">
                      Every Decision Auditable
                    </h3>
                    <p className="text-sm text-[#475569] mt-2 leading-relaxed">
                      Routing rules, officer reassignments, and departmental reorganizations leave a permanent public record.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/transparency')}
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    <span>Inspect public ledger</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </RevealBlock>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 04. HOW WARDWISE WORKS (REPORT -> VERIFY -> ASSIGN -> RESOLVE -> TRACK) */}
      {/* ================================================================= */}
      <section className="w-full bg-[#f2f4f8] border-y border-[#e2e8f0] py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
          <RevealBlock>
            <SectionHeading
              eyebrow="02. End-to-End Civic Lifecycle"
              title="From street observation to"
              emphasis="verified completion."
              subtitle="Click any operational stage below to inspect the deterministic workflow executed automatically on every municipal report."
            />
          </RevealBlock>

          {/* Interactive 5-Stage Selector */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {workflowStages.map((s, idx) => {
              const active = workflowStep === idx;
              return (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setWorkflowStep(idx)}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-[#0b1221] text-white border-[#0b1221] shadow-sm'
                      : 'bg-white text-[#0b1221] border-[#e2e8f0] hover:border-[#cbd5e1]'
                  }`}
                >
                  <div
                    className={`font-mono-tabular text-xs font-bold ${
                      active ? 'text-[#93c5fd]' : 'text-[#64748b]'
                    }`}
                  >
                    {s.step}
                  </div>
                  <div className="text-base font-bold mt-1">{s.verb}</div>
                </button>
              );
            })}
          </div>

          <motion.div
            key={activeStage.step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="mt-6 bg-white border border-[#e2e8f0] rounded-2xl p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
          >
            <div className="lg:col-span-8 space-y-3">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-[#1e40af]">
                <ActiveStageIcon className="w-4 h-4" />
                <span>
                  Stage {activeStage.step} · {activeStage.verb}
                </span>
              </div>
              <h3 className="font-display text-2xl sm:text-3xl text-[#0b1221] font-normal">
                {activeStage.title}
              </h3>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed max-w-2xl">
                {activeStage.summary}
              </p>
              <p className="text-xs font-medium text-[#64748b] pt-2">{activeStage.detail}</p>
            </div>

            <div className="lg:col-span-4 flex lg:justify-end">
              <button
                type="button"
                onClick={() => onNavigate(activeStage.route)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                <span>{activeStage.cta}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 05. EXPLORE YOUR CITY & 06. REPORT WITHOUT COMPLICATIONS          */}
      {/* ================================================================= */}
      <section className="w-full bg-[#faf9f5] py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16 space-y-16">
          {/* Explore Your City */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <RevealBlock className="lg:col-span-7 bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#1e40af]">
                      03. Explore Your City
                    </div>
                    <h3 className="font-display text-2xl sm:text-3xl text-[#0b1221] mt-1">
                      Privacy-safe GIS visibility across all 12 wards
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/map')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    <span>Open Full Map</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Live Category Breakdown from DB */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(
                    [
                      'Water & Drainage',
                      'Roads & Pavement',
                      'Sanitation & Waste',
                      'Street Lighting & Power',
                      'Parks & Trees',
                      'Traffic & Signals',
                    ] as IssueCategory[]
                  ).map((cat) => {
                    const count = complaints.filter((c) => c.category === cat).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => onNavigate('/map')}
                        className="p-3.5 rounded-xl bg-[#f2f4f8] hover:bg-[#e8ecf2] text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs text-[#475569]">
                          <CategoryGlyph category={cat} />
                          <span className="font-mono-tabular font-bold text-[#0b1221]">{count}</span>
                        </div>
                        <div className="text-xs font-semibold text-[#0b1221] mt-2 truncate">{cat}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-[#e2e8f0] flex flex-wrap items-center justify-between gap-3 text-xs text-[#475569]">
                <span>Clustered duplicates automatically consolidated under Master Work Orders</span>
                <button
                  type="button"
                  onClick={() => onNavigate('/map')}
                  className="px-4 py-2 rounded-lg bg-[#0b1221] text-white font-semibold cursor-pointer"
                >
                  Launch Live City Map
                </button>
              </div>
            </RevealBlock>

            {/* Report Without Complications */}
            <RevealBlock
              delay={0.08}
              className="lg:col-span-5 bg-[#0b1221] text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#93c5fd]">
                  04. Report Without Complications
                </div>
                <h3 className="font-display text-2xl sm:text-3xl text-white font-normal">
                  Submit a verified ticket in four calm steps.
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  No confusing department codes. Select the street problem, attach a photograph, drop your pin, and
                  receive an instant tracking ID with an enforceable SLA deadline.
                </p>

                <div className="space-y-2.5 pt-2 text-xs">
                  {[
                    '01 · Choose issue category & urgency severity',
                    '02 · Upload field photos (SHA-256 verified)',
                    '03 · Pin street location & auto-detect ward',
                    '04 · Receive #WW ticket & live SLA countdown',
                  ].map((line) => (
                    <div
                      key={line}
                      className="px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-200 font-medium"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/report')}
                className="mt-6 w-full py-3.5 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Report a Civic Issue Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </RevealBlock>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 07. REAL-TIME ACCOUNTABILITY (ESCALATION LADDER + CASE STUDIES)   */}
      {/* ================================================================= */}
      <section className="w-full bg-[#0b1221] text-white py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#93c5fd]">
                05. Enforced SLA Escalation
              </div>
              <h2 className="font-display text-3xl sm:text-4xl text-white font-normal text-balance">
                Deadlines that{' '}
                <span className="italic text-[#93c5fd]">elevate automatically.</span>
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Unresolved complaints never gather dust. When an ordinance timer expires, WARDWISE escalates
                authority across three accountability tiers until the repair is verified.
              </p>

              <div className="pt-2 flex flex-wrap gap-2">
                {(
                  [
                    { lvl: 1 as const, label: 'Tier 1 · Field Officer' },
                    { lvl: 2 as const, label: 'Tier 2 · Dept Supervisor' },
                    { lvl: 3 as const, label: 'Tier 3 · Commissioner' },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.lvl}
                    type="button"
                    onClick={() => setEscalationPhase(btn.lvl)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      escalationPhase === btn.lvl
                        ? 'bg-[#2563eb] text-white'
                        : 'bg-white/8 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-3.5">
              {[
                {
                  tier: 1 as const,
                  kicker: 'Tier 01 · T+0h Assignment',
                  title: 'Assigned Ward Engineer & Field Crew',
                  desc: 'Automated workload-balanced dispatch starts the category SLA countdown immediately.',
                  stateLabel: 'Primary Execution',
                },
                {
                  tier: 2 as const,
                  kicker: 'Tier 02 · SLA Breach or Critical 75% Burn',
                  title: 'Department Duty Supervisor Intervention',
                  desc: 'Triggers supervisor alert and priority reassignment review to prevent extended corridor disruption.',
                  stateLabel: 'Supervisor Escalation Active',
                },
                {
                  tier: 3 as const,
                  kicker: 'Tier 03 · Prolonged Breach Overrun',
                  title: 'City Commissioner & Public Ledger Pin',
                  desc: 'Pinned to the executive Control Room queue with permanent SHA-256 breach documentation.',
                  stateLabel: 'Commissioner Override',
                },
              ].map((t) => {
                const active = escalationPhase === t.tier;
                return (
                  <div
                    key={t.tier}
                    className={`p-5 rounded-xl border transition-all ${
                      active
                        ? 'bg-[#131c31] border-[#60a5fa]/60'
                        : 'bg-white/[0.03] border-white/10 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular text-[#93c5fd] font-semibold">{t.kicker}</span>
                      <span className="text-slate-300 font-semibold">
                        {active ? t.stateLabel : 'Standby'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1.5">{t.title}</h3>
                    <p className="text-xs text-slate-300 mt-1">{t.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real Case Study Proof Cards */}
          <div className="pt-12 border-t border-white/10">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#93c5fd]">
                  Verified Field Case Studies
                </div>
                <h3 className="font-display text-2xl sm:text-3xl text-white mt-1">
                  Inspect completed municipal interventions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/track', 'id=WW-8924')}
                className="text-xs font-semibold text-[#93c5fd] hover:underline cursor-pointer"
              >
                Open Public Issue Tracker →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  id: 'WW-7419',
                  meta: 'Ward 04 · Demo Case · 18h Resolution',
                  title: 'Sub-Surface Main Conduit Repair',
                  img: '/src/assets/images/civic_water_repair_1794931447493.jpg',
                  alt: 'Municipal utility crew repairing clean water main',
                },
                {
                  id: 'W6-210',
                  meta: 'Ward 06 · Demo Case · 2.4h Turnaround',
                  title: 'Signal Controller Overhaul',
                  img: '/src/assets/images/civic_traffic_signal_1794931447024.jpg',
                  alt: 'Traffic intersection with steel signal masts',
                },
                {
                  id: 'W5-044',
                  meta: 'Ward 05 · Demo Case · 1.5h Clearance',
                  title: 'Pedestrian Boulevard Arbor Clear',
                  img: '/src/assets/images/civic_arbor_walkway_1794931447001.jpg',
                  alt: 'Clear tree-lined pedestrian stone walkway',
                },
              ].map((cs) => (
                <button
                  key={cs.id}
                  type="button"
                  onClick={() => onNavigate('/track', `id=${encodeURIComponent(cs.id)}`)}
                  className="text-left rounded-2xl bg-[#131c31] border border-white/10 overflow-hidden hover:border-[#60a5fa]/50 transition-colors cursor-pointer group"
                >
                  <div className="h-44 bg-[#070d19] overflow-hidden">
                    <ResilientImage
                      src={cs.img}
                      alt={cs.alt}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-slate-400 font-mono-tabular">{cs.meta}</div>
                    <div className="font-display text-xl text-white mt-1">{cs.title}</div>
                    <div className="mt-3 text-xs font-semibold text-[#93c5fd] inline-flex items-center gap-1">
                      <span>Audit #{cs.id}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 08. TRANSPARENCY & PERFORMANCE (LIVE DB SCOREBOARD + CONTINUITY)  */}
      {/* ================================================================= */}
      <section className="w-full bg-[#faf9f5] py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16 space-y-12">
          <RevealBlock>
            <SectionHeading
              eyebrow="06. Public Accountability Ledger"
              title="Departmental performance measured"
              emphasis="in plain daylight."
              subtitle="Live SLA compliance rates, average resolution hours, and citizen ratings calculated directly from the municipal datastore."
              action={
                <button
                  type="button"
                  onClick={() => onNavigate('/transparency')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0b1221] text-white text-xs font-semibold hover:bg-[#131c31] cursor-pointer"
                >
                  <span>Full Transparency Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              }
            />
          </RevealBlock>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 bg-white border border-[#e2e8f0] rounded-2xl p-6 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[580px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
                    <th className="py-3 px-3">Rank</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-right">Backlog</th>
                    <th className="py-3 px-3 text-right">Resolved</th>
                    <th className="py-3 px-3">SLA Compliance</th>
                    <th className="py-3 px-3 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-sm">
                  {leaderboard.slice(0, 5).map((row, idx) => (
                    <tr key={row.departmentId} className="hover:bg-[#f2f4f8]/60 transition-colors">
                      <td className="py-3.5 px-3 font-mono-tabular font-bold text-[#0b1221]">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-[#0b1221]">{row.name}</td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular text-[#475569]">
                        {row.activeBacklog}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold">
                        {row.resolvedCount}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-1.5 rounded-full bg-[#e8ecf2] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#059669]"
                              style={{ width: `${Math.min(100, row.slaCompliancePct)}%` }}
                            />
                          </div>
                          <span className="font-mono-tabular text-xs font-bold">{row.slaCompliancePct}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-bold text-[#1e40af]">
                        {row.citizenScore.toFixed(1)} / 5.0
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-4 bg-white border border-[#e2e8f0] rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#1e40af]">
                    Monthly Velocity
                  </div>
                  <h3 className="font-display text-xl text-[#0b1221] mt-0.5">Filed vs. Resolved</h3>
                </div>
                <GitMerge className="w-4 h-4 text-[#64748b]" />
              </div>

              <div className="grid grid-cols-4 gap-3 items-end h-36 pt-2">
                {monthly.slice(-4).map((m) => {
                  const maxVal = Math.max(...monthly.map((p) => Math.max(p.filed, p.resolved)), 100);
                  return (
                    <div key={m.month} className="flex flex-col items-center h-full justify-end gap-1.5">
                      <div className="flex items-end gap-1 h-24">
                        <div
                          className="w-3.5 rounded-t bg-[#dbeafe]"
                          style={{ height: `${Math.round((m.filed / maxVal) * 100)}%` }}
                          title={`Filed: ${m.filed}`}
                        />
                        <div
                          className="w-3.5 rounded-t bg-[#1e40af]"
                          style={{ height: `${Math.round((m.resolved / maxVal) * 100)}%` }}
                          title={`Resolved: ${m.resolved}`}
                        />
                      </div>
                      <span className="text-[11px] font-mono-tabular font-semibold text-[#475569]">
                        {m.month}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-[#e2e8f0] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0b1221]">Institutional Continuity</span>
                  <button
                    type="button"
                    onClick={() => setReorgSimulated((v) => !v)}
                    className="text-[#1e40af] font-semibold hover:underline cursor-pointer"
                  >
                    {reorgSimulated ? 'Reset Preview' : 'Simulate Reorg'}
                  </button>
                </div>
                <p className="text-[#475569] leading-relaxed">
                  {reorgSimulated
                    ? 'Active Fair SLA Credit: Original filing timestamps & escalation logs remain immutable across bureau merges.'
                    : 'Department merges or splits preserve 100% of historical filing dates and credit elapsed SLA fairly.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 09. DESIGNED FOR EVERY WARD (12-WARD ACCOUNTABILITY EXPLORER)     */}
      {/* ================================================================= */}
      <section className="w-full bg-[#f2f4f8] border-t border-[#e2e8f0] py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
          <RevealBlock>
            <SectionHeading
              eyebrow="07. Ward-Level Accountability"
              title="Every neighborhood,"
              emphasis="equitably tracked."
              subtitle="Select any of the 12 municipal wards to examine live stress load, SLA adherence, and active field dispatches."
            />
          </RevealBlock>

          <div className="flex flex-wrap gap-2 mt-8 mb-6">
            {wards.slice(0, 8).map((w) => {
              const active = selectedWardId === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWardId(w.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#0b1221] text-white'
                      : 'bg-white border border-[#e2e8f0] text-[#475569] hover:text-[#0b1221]'
                  }`}
                >
                  {w.code} · {w.name.split('&')[0].trim()}
                </button>
              );
            })}
          </div>

          {selectedWardMeta && selectedWardPerf && (
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
                <div>
                  <div className="text-xs font-mono-tabular font-semibold text-[#1e40af]">
                    {selectedWardMeta.code} · {selectedWardMeta.alderperson || 'District Representative'}
                  </div>
                  <h3 className="font-display text-2xl sm:text-3xl text-[#0b1221] mt-1">
                    {selectedWardMeta.name}
                  </h3>
                  <p className="text-sm text-[#475569] mt-2">{selectedWardMeta.districtSummary}</p>

                  <div className="mt-5 p-4 rounded-xl bg-[#f2f4f8]">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="font-semibold text-[#0b1221]">Operational Stress Index</span>
                      <span className="font-mono-tabular font-bold text-[#0b1221]">
                        {selectedWardPerf.stressIndex}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#e2e8f0] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          selectedWardPerf.stressIndex > 70
                            ? 'bg-[#dc2626]'
                            : selectedWardPerf.stressIndex > 45
                            ? 'bg-[#d97706]'
                            : 'bg-[#059669]'
                        }`}
                        style={{ width: `${selectedWardPerf.stressIndex}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-5 border-t border-[#e2e8f0]">
                  <div>
                    <span className="text-xs text-[#64748b] block">Active</span>
                    <span className="font-mono-tabular text-xl font-bold text-[#0b1221]">
                      {selectedWardPerf.activeCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[#64748b] block">Overdue</span>
                    <span className="font-mono-tabular text-xl font-bold text-[#dc2626]">
                      {selectedWardPerf.overdueCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[#64748b] block">Ward SLA</span>
                    <span className="font-mono-tabular text-xl font-bold text-[#059669]">
                      {selectedWardPerf.slaCompliancePct}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#64748b]">
                    Public Tickets in {selectedWardMeta.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('/map', `ward=${encodeURIComponent(selectedWardMeta.id)}`)}
                    className="text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    Filter {selectedWardMeta.code} on Map →
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedWardTickets.length === 0 ? (
                    <div className="p-8 rounded-xl bg-[#f2f4f8] text-center text-sm text-[#475569]">
                      No open public issues queued in {selectedWardMeta.code}.
                    </div>
                  ) : (
                    selectedWardTickets.map((t) => {
                      const sla = formatSlaDelta(t.slaDeadline, t.fairSlaCreditHours, t.status);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onNavigate('/track', `id=${encodeURIComponent(t.id)}`)}
                          className="w-full text-left p-4 rounded-xl bg-[#f2f4f8] hover:bg-[#e8ecf2] transition-colors flex items-center justify-between gap-4 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <MapPin className="w-4 h-4 text-[#1e40af] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-[#0b1221] truncate">
                                #{t.id} · {t.title}
                              </div>
                              <div className="text-xs text-[#475569] truncate">
                                {t.address} · {sla.label}
                              </div>
                            </div>
                          </div>
                          <StatusIndicator status={t.status} isOverdue={sla.isOverdue} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================= */}
      {/* 10. FINAL CALL TO ACTION                                          */}
      {/* ================================================================= */}
      <section className="w-full bg-[#faf9f5] py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
          <div className="rounded-3xl bg-[#0b1221] text-white p-10 sm:p-16 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none opacity-35"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.35), transparent 65%)',
              }}
              aria-hidden="true"
            />
            <div className="relative max-w-2xl mx-auto space-y-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#93c5fd]">
                Civic Participation
              </div>
              <h2 className="font-display text-3xl sm:text-5xl text-white font-normal text-balance">
                A city runs better when{' '}
                <span className="italic text-[#93c5fd]">everyone can see the work.</span>
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Report street hazards, track live repair deadlines, and verify completed municipal operations across all
                12 wards.
              </p>
              <div className="pt-3 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('/report')}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <span>Report an Issue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/track')}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-white/8 hover:bg-white/15 border border-white/15 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#93c5fd]" />
                  <span>Track My Issue</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
