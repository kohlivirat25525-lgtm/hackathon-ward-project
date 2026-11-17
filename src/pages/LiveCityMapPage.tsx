import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Compass,
  Droplets,
  Layers,
  Lightbulb,
  List,
  Map as MapIcon,
  MapPin,
  Radio,
  Search,
  Timer,
  TrafficCone,
  Trash2,
  Trees,
  Wrench,
  X,
} from 'lucide-react';
import type { PublicBootstrapResponse } from '../lib/api';
import { formatRelativeTime, formatSlaDelta } from '../lib/api';
import type { ConnectionStatus } from '../lib/realtime';
import type { IssueCategory, IssueStatus, PublicComplaint, RealtimeEvent } from '../types/wardwise';
import type { PublicRoute } from '../components/Layout';
import { ResilientImage } from '../components/ResilientImage';
import { RevealBlock, StatusIndicator, WARDWISE_EASE } from '../components/DesignSystem';

interface LiveCityMapPageProps {
  data: PublicBootstrapResponse | null;
  initialWardFilter?: string;
  realtimeStatus?: ConnectionStatus;
  lastRealtimeEvent?: RealtimeEvent | null;
  onNavigate: (route: PublicRoute, query?: string) => void;
}

type CanvasMode = 'navy' | 'standard' | 'satellite';

const ALL_CATEGORIES: IssueCategory[] = [
  'Water & Drainage',
  'Roads & Pavement',
  'Sanitation & Waste',
  'Street Lighting & Power',
  'Parks & Trees',
  'Traffic & Signals',
];

const STATUS_OPTIONS: ('ALL' | IssueStatus)[] = [
  'ALL',
  'Submitted',
  'Routed',
  'In Progress',
  'Escalated',
  'Resolved',
  'Closed',
];

function CategoryIcon({ category }: { category: IssueCategory }) {
  if (category === 'Water & Drainage') return <Droplets className="w-3.5 h-3.5" />;
  if (category === 'Sanitation & Waste') return <Trash2 className="w-3.5 h-3.5" />;
  if (category === 'Street Lighting & Power') return <Lightbulb className="w-3.5 h-3.5" />;
  if (category === 'Traffic & Signals') return <TrafficCone className="w-3.5 h-3.5" />;
  if (category === 'Parks & Trees') return <Trees className="w-3.5 h-3.5" />;
  return <Wrench className="w-3.5 h-3.5" />;
}

export function LiveCityMapPage({
  data,
  initialWardFilter = 'ALL',
  realtimeStatus = 'connected',
  lastRealtimeEvent,
  onNavigate,
}: LiveCityMapPageProps) {
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('navy');
  const [searchQuery, setSearchQuery] = useState('');
  const [wardFilter, setWardFilter] = useState(initialWardFilter);
  const [statusFilter, setStatusFilter] = useState<'ALL' | IssueStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | IssueCategory>('ALL');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>('WW-8802');

  useEffect(() => {
    setWardFilter(initialWardFilter);
  }, [initialWardFilter]);

  const complaints = data?.complaints || [];
  const wards = data?.wards || [];

  const categoryCounts = useMemo(() => {
    const counts = new Map<IssueCategory, number>();
    for (const c of ALL_CATEGORIES) counts.set(c, 0);
    for (const item of complaints) {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
    return counts;
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return complaints.filter((c) => {
      if (wardFilter !== 'ALL' && c.wardId !== wardFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (q) {
        const hay = `${c.id} ${c.title} ${c.address} ${c.wardName} ${c.departmentName} ${c.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [complaints, wardFilter, statusFilter, categoryFilter, searchQuery]);

  const selectedComplaint: PublicComplaint | null = useMemo(() => {
    if (!selectedComplaintId) return null;
    return (
      filteredComplaints.find((c) => c.id === selectedComplaintId) ||
      complaints.find((c) => c.id === selectedComplaintId) ||
      null
    );
  }, [selectedComplaintId, filteredComplaints, complaints]);

  const patternInsights = useMemo(() => {
    const topStressWard = [...(data?.wardPerformance || [])].sort((a, b) => b.stressIndex - a.stressIndex)[0];
    let topCategory: IssueCategory = 'Water & Drainage';
    let topCategoryCount = 0;
    for (const [cat, count] of categoryCounts.entries()) {
      if (count > topCategoryCount) {
        topCategory = cat;
        topCategoryCount = count;
      }
    }
    const escalatedCount = complaints.filter((c) => c.status === 'Escalated' || c.escalationTier > 1).length;
    const clusteredCount = complaints.reduce((acc, c) => acc + c.childReportIds.length, 0);
    return { topStressWard, topCategory, topCategoryCount, escalatedCount, clusteredCount };
  }, [data, categoryCounts, complaints]);

  const canvasBg =
    canvasMode === 'navy'
      ? 'bg-[#070d19] text-white border-[#1e293b]'
      : canvasMode === 'satellite'
      ? 'bg-[#16221d] text-[#faf9f5] border-[#2d3e36]'
      : 'bg-[#edf1f7] text-[#0b1221] border-[#cbd5e1]';

  return (
    <section className="w-full bg-[#faf9f5] pb-20">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-14 pt-6">
        {/* Top Header */}
        <RevealBlock className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-[#e2e8f0]">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-[#475569]">
              <span className="text-[#1e40af]">Real-Time Municipal GIS</span>
              <span aria-hidden="true">·</span>
              <span className={`inline-flex items-center gap-1.5 ${realtimeStatus === 'connected' ? 'text-[#059669]' : 'text-[#d97706]'}`}>
                <Radio className="w-3.5 h-3.5" />
                {realtimeStatus === 'connected' ? 'SSE Live Telemetry' : 'Reconnecting'}
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-[#0b1221] font-normal mt-2">
              Live City <span className="italic text-[#475569]">Map &amp; Dispatch Grid.</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Map Canvas Style Switcher */}
            <div className="flex items-center gap-1 bg-[#f2f4f8] p-1 rounded-xl border border-[#e2e8f0]">
              {(
                [
                  { id: 'navy', label: 'Midnight GIS' },
                  { id: 'standard', label: 'Daylight' },
                  { id: 'satellite', label: 'Terrain' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setCanvasMode(mode.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    canvasMode === mode.id
                      ? 'bg-[#0b1221] text-white shadow-xs'
                      : 'text-[#475569] hover:text-[#0b1221]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Map vs List Toggle */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  viewMode === 'map' ? 'bg-[#1e40af] text-white' : 'text-[#475569] hover:text-[#0b1221]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  viewMode === 'list' ? 'bg-[#1e40af] text-white' : 'text-[#475569] hover:text-[#0b1221]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List ({filteredComplaints.length})</span>
              </button>
            </div>
          </div>
        </RevealBlock>

        {/* Category Quick Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 py-5">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              categoryFilter === 'ALL'
                ? 'bg-[#0b1221] text-white'
                : 'bg-white border border-[#e2e8f0] text-[#475569] hover:text-[#0b1221]'
            }`}
          >
            All Categories ({complaints.length})
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === cat ? 'ALL' : cat)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-[#1e40af] text-white'
                  : 'bg-white border border-[#e2e8f0] text-[#475569] hover:text-[#0b1221]'
              }`}
            >
              <CategoryIcon category={cat} />
              <span>{cat}</span>
              <span className="font-mono-tabular opacity-80">({categoryCounts.get(cat) || 0})</span>
            </button>
          ))}
        </div>

        {/* Main 3-Column Operational Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT TELEMETRY FILTER SIDEBAR */}
          <aside className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-5 shadow-xs">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569] mb-2">
                Search Public Ledger
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ID (#WW-8802), road, ward..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs text-[#0b1221] focus:outline-none focus:border-[#1e40af]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569] mb-2">
                Municipal Ward
              </label>
              <select
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs font-semibold text-[#0b1221]"
              >
                <option value="ALL">All 12 Municipal Wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569] mb-2">
                Lifecycle Status
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                      statusFilter === st
                        ? 'bg-[#1e40af] text-white'
                        : 'bg-[#f2f4f8] text-[#475569] hover:bg-[#e8ecf2] hover:text-[#0b1221]'
                    }`}
                  >
                    {st === 'ALL' ? 'All Statuses' : st}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#475569]">Visible Markers</span>
                <span className="font-mono-tabular font-bold text-[#0b1221]">{filteredComplaints.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">Clustered Child Reports</span>
                <span className="font-mono-tabular font-bold text-[#1e40af]">
                  {patternInsights.clusteredCount} merged
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">Privacy Guard</span>
                <span className="font-semibold text-[#059669]">PII Stripped</span>
              </div>
            </div>

            {(wardFilter !== 'ALL' || statusFilter !== 'ALL' || categoryFilter !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setWardFilter('ALL');
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearchQuery('');
                }}
                className="w-full py-2.5 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] border border-[#e2e8f0] text-xs font-semibold text-[#0b1221] cursor-pointer"
              >
                Reset All Map Filters
              </button>
            )}
          </aside>

          {/* CENTER MAP OR LIST + RIGHT DRAWER */}
          <div className={selectedComplaint && viewMode === 'map' ? 'lg:col-span-6' : 'lg:col-span-9'}>
            {viewMode === 'map' ? (
              <div className={`relative w-full h-[580px] rounded-2xl overflow-hidden border shadow-sm ${canvasBg}`}>
                <svg className="absolute inset-0 w-full h-full opacity-35 pointer-events-none">
                  <defs>
                    <pattern id="gis-grid" width="44" height="44" patternUnits="userSpaceOnUse">
                      <path
                        d="M 44 0 L 0 0 0 44"
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray="2,4"
                        strokeWidth="0.7"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#gis-grid)" />
                  <path
                    d="M-30,240 C220,190 480,310 880,210 C1140,150 1320,250 1500,220"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="16"
                    opacity="0.28"
                  />
                </svg>

                {/* Ward Boundary Polygons */}
                {wards.map((w) => {
                  const isFocused = wardFilter === w.id;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setWardFilter(wardFilter === w.id ? 'ALL' : w.id)}
                      style={{
                        left: `${w.mapBounds.x1}%`,
                        top: `${w.mapBounds.y1}%`,
                        width: `${Math.max(14, w.mapBounds.x2 - w.mapBounds.x1)}%`,
                        height: `${Math.max(15, w.mapBounds.y2 - w.mapBounds.y1)}%`,
                      }}
                      className={`absolute rounded-xl border text-left p-2 transition-all cursor-pointer ${
                        isFocused
                          ? 'border-[#60a5fa] bg-[#2563eb]/20 ring-1 ring-[#60a5fa]/50'
                          : canvasMode === 'standard'
                          ? 'border-slate-300/60 bg-white/30 hover:bg-white/50'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                      }`}
                    >
                      <span className="text-[10px] font-mono-tabular font-bold opacity-75 block">
                        {w.code}
                      </span>
                    </button>
                  );
                })}

                {/* Live SSE Banner */}
                <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                  <div className="px-3.5 py-2 rounded-lg bg-[#0b1221]/90 text-white border border-white/15 backdrop-blur-md shadow-sm text-[11px] font-medium flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-[#60a5fa] shrink-0" />
                    <span className="truncate max-w-[340px]">
                      {lastRealtimeEvent?.summary || 'Live city grid synchronized across all 12 wards'}
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-[#0b1221]/90 text-white border border-white/15 backdrop-blur-md shadow-sm text-[11px] font-mono-tabular font-semibold">
                    Showing {filteredComplaints.length} Issue(s)
                  </div>
                </div>

                {/* Interactive Issue Pins */}
                {filteredComplaints.map((c) => {
                  const sla = formatSlaDelta(c.slaDeadline, c.fairSlaCreditHours, c.status);
                  const isSelected = selectedComplaint?.id === c.id;
                  const isCritical = c.status === 'Escalated' || sla.isOverdue;
                  const isResolved = c.status === 'Resolved' || c.status === 'Closed';
                  const pinColor = isCritical
                    ? 'bg-[#dc2626]'
                    : isResolved
                    ? 'bg-[#059669]'
                    : c.status === 'In Progress'
                    ? 'bg-[#2563eb]'
                    : 'bg-[#0b1221]';

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedComplaintId(c.id)}
                      style={{ left: `${c.mapX}%`, top: `${c.mapY}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer transition-transform ${
                        isSelected ? 'scale-120 z-30' : 'hover:scale-110'
                      }`}
                      aria-label={`Select #${c.id}: ${c.title}`}
                    >
                      <span className="relative flex items-center justify-center">
                        {isCritical && (
                          <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-[#dc2626] opacity-40" />
                        )}
                        <span
                          className={`relative w-7 h-7 rounded-full ${pinColor} text-white flex items-center justify-center shadow-md ring-2 ring-white`}
                        >
                          <CategoryIcon category={c.category} />
                        </span>
                        {c.childReportIds.length > 0 && (
                          <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md bg-[#2563eb] text-white text-[9px] font-mono-tabular font-bold ring-1 ring-white">
                            +{c.childReportIds.length}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block px-1.5 py-0.5 rounded bg-white/95 text-[#0b1221] text-[10px] font-mono-tabular font-bold shadow-xs border border-[#e2e8f0] whitespace-nowrap">
                        #{c.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* LIST VIEW */
              <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[720px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f2f4f8] text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                        <th className="py-3.5 px-4">Ticket</th>
                        <th className="py-3.5 px-4">Issue &amp; Ward</th>
                        <th className="py-3.5 px-4">Bureau</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">SLA Clock</th>
                        <th className="py-3.5 px-4 text-right">Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0] text-xs">
                      {filteredComplaints.map((c) => {
                        const sla = formatSlaDelta(c.slaDeadline, c.fairSlaCreditHours, c.status);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => {
                              setSelectedComplaintId(c.id);
                              setViewMode('map');
                            }}
                            className="hover:bg-[#faf9f5] cursor-pointer transition-colors"
                          >
                            <td className="py-3.5 px-4 font-mono-tabular font-bold text-[#0b1221]">
                              #{c.id}
                              {c.childReportIds.length > 0 && (
                                <span className="ml-1.5 text-[10px] text-[#1e40af]">
                                  (+{c.childReportIds.length})
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-[#0b1221]">{c.title}</div>
                              <div className="text-[11px] text-[#475569]">
                                {c.wardName} · {c.address}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-[#475569]">{c.departmentName}</td>
                            <td className="py-3.5 px-4">
                              <StatusIndicator status={c.status} isOverdue={sla.isOverdue} />
                            </td>
                            <td
                              className={`py-3.5 px-4 font-mono-tabular font-bold ${
                                sla.isOverdue ? 'text-[#dc2626]' : 'text-[#059669]'
                              }`}
                            >
                              {sla.label}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigate('/track', `id=${encodeURIComponent(c.id)}`);
                                }}
                                className="font-bold text-[#1e40af] hover:underline cursor-pointer"
                              >
                                Track →
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
          </div>

          {/* RIGHT ISSUE DETAIL DRAWER (WHEN IN MAP VIEW) */}
          {selectedComplaint && viewMode === 'map' && (
            <motion.aside
              key={selectedComplaint.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: WARDWISE_EASE }}
              className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#64748b]">
                    <span className="font-mono-tabular font-bold text-[#0b1221]">#{selectedComplaint.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[11px] font-semibold">
                      {selectedComplaint.isDemo ? 'Demo Record' : 'Live Report'}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-[#0b1221] mt-1 leading-snug">
                    {selectedComplaint.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedComplaintId(null)}
                  className="p-1.5 rounded-lg hover:bg-[#f2f4f8] text-[#475569] cursor-pointer"
                  aria-label="Close issue drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedComplaint.photoUrl && (
                <div className="w-full h-36 rounded-xl overflow-hidden bg-[#f2f4f8] border border-[#e2e8f0]">
                  <ResilientImage
                    src={selectedComplaint.photoUrl}
                    alt={selectedComplaint.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <p className="text-xs text-[#475569] leading-relaxed">{selectedComplaint.description}</p>

              <div className="p-4 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] space-y-2.5 text-xs">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[#475569]">Status</span>
                  <StatusIndicator
                    status={selectedComplaint.status}
                    isOverdue={
                      formatSlaDelta(
                        selectedComplaint.slaDeadline,
                        selectedComplaint.fairSlaCreditHours,
                        selectedComplaint.status
                      ).isOverdue
                    }
                  />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Ward</span>
                  <span className="font-semibold text-[#0b1221] text-right">{selectedComplaint.wardName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Department</span>
                  <span className="font-semibold text-[#1e40af] text-right">
                    {selectedComplaint.departmentName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Officer</span>
                  <span className="font-semibold text-[#0b1221]">{selectedComplaint.assignedOfficerName}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-[#e2e8f0]">
                  <span className="text-[#475569]">SLA Clock</span>
                  <span
                    className={`font-mono-tabular font-bold flex items-center gap-1 ${
                      formatSlaDelta(
                        selectedComplaint.slaDeadline,
                        selectedComplaint.fairSlaCreditHours,
                        selectedComplaint.status
                      ).isOverdue
                        ? 'text-[#dc2626]'
                        : 'text-[#059669]'
                    }`}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    {
                      formatSlaDelta(
                        selectedComplaint.slaDeadline,
                        selectedComplaint.fairSlaCreditHours,
                        selectedComplaint.status
                      ).label
                    }
                  </span>
                </div>
              </div>

              {selectedComplaint.childReportIds.length > 0 && (
                <div className="p-3 rounded-xl bg-[#dbeafe]/60 border border-[#93c5fd]/50 text-xs text-[#0b1221]">
                  <strong>Clustered Master Work Order:</strong> Includes {selectedComplaint.childReportIds.length}{' '}
                  linked duplicate report(s) ({selectedComplaint.childReportIds.join(', ')}).
                </div>
              )}

              <div className="text-[11px] text-[#64748b]">
                Reported {formatRelativeTime(selectedComplaint.createdAt)} · {selectedComplaint.address}
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/track', `id=${encodeURIComponent(selectedComplaint.id)}`)}
                className="w-full py-3 px-4 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <span>Inspect Full Audit Trail</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.aside>
          )}
        </div>

        {/* 3 DB-Driven Pattern Analysis Cards */}
        <RevealBlock className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          <div className="p-6 rounded-2xl bg-white border border-[#e2e8f0]">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#475569]">
              <Compass className="w-4 h-4 text-[#1e40af]" />
              <span>Highest Pressure Ward</span>
            </div>
            <div className="font-display text-2xl text-[#0b1221] mt-2">
              {patternInsights.topStressWard?.code || 'WARD-04'} ·{' '}
              {patternInsights.topStressWard?.name.split('&')[0] || 'Commercial Corridor'}
            </div>
            <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
              Stress index at <strong className="font-mono-tabular text-[#0b1221]">{patternInsights.topStressWard?.stressIndex ?? 64}%</strong>{' '}
              with {patternInsights.topStressWard?.activeCount ?? 2} active field orders.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#e2e8f0]">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#475569]">
              <Layers className="w-4 h-4 text-[#1e40af]" />
              <span>Primary Incident Category</span>
            </div>
            <div className="font-display text-2xl text-[#0b1221] mt-2">{patternInsights.topCategory}</div>
            <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
              Accounts for <strong className="font-mono-tabular text-[#0b1221]">{patternInsights.topCategoryCount}</strong> active &amp;
              tracked reports on the public ledger.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#e2e8f0]">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#dc2626]">
              <AlertTriangle className="w-4 h-4 text-[#dc2626]" />
              <span>Escalation &amp; Cluster Watch</span>
            </div>
            <div className="font-display text-2xl text-[#0b1221] mt-2 tabular-nums">
              {patternInsights.escalatedCount} Escalated · {patternInsights.clusteredCount} Clustered
            </div>
            <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
              Automated SLA sweep elevates overdue tickets while deduplication merges nearby duplicates.
            </p>
          </div>
        </RevealBlock>

        {/* Bottom CTA */}
        <div className="mt-10 p-7 rounded-2xl bg-[#0b1221] text-white border border-[#1e293b] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl text-white">Spot an unmapped street or utility issue?</h3>
            <p className="text-xs text-slate-300 mt-1">
              Pin it directly on the city grid to generate an SLA-tracked work order in under 60 seconds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/report')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Submit Issue on Map</span>
          </button>
        </div>
      </div>
    </section>
  );
}
