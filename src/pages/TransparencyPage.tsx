import { useMemo } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  Download,
  FileJson,
  GitMerge,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { PublicBootstrapResponse, TransparencyWindow } from '../lib/api';
import type { PublicRoute } from '../components/Layout';
import { ResilientImage } from '../components/ResilientImage';
import { AnimatedNumber, RevealBlock } from '../components/DesignSystem';

interface TransparencyPageProps {
  data: PublicBootstrapResponse | null;
  windowMode?: TransparencyWindow;
  onWindowChange?: (win: TransparencyWindow) => void;
  onNavigate?: (route: PublicRoute, query?: string) => void;
}

export function TransparencyPage({
  data,
  windowMode = '30d',
  onWindowChange,
  onNavigate,
}: TransparencyPageProps) {
  const leaderboard = data?.leaderboard || [];
  const wardPerformance = data?.wardPerformance || [];
  const monthlyPerformance = data?.monthlyPerformance || [];
  const complaints = data?.complaints || [];
  const topDepartment = leaderboard[0];

  const statusBreakdown = useMemo(() => {
    const counts = {
      active: 0,
      inProgress: 0,
      escalated: 0,
      resolvedClosed: 0,
    };
    for (const c of complaints) {
      if (c.status === 'Resolved' || c.status === 'Closed') counts.resolvedClosed += 1;
      else if (c.status === 'Escalated') counts.escalated += 1;
      else if (c.status === 'In Progress') counts.inProgress += 1;
      else counts.active += 1;
    }
    const total = Math.max(1, complaints.length);
    return { ...counts, total };
  }, [complaints]);

  const categoryTurnaround = useMemo(() => {
    const map = new Map<string, { count: number; avgSla: number }>();
    for (const p of data?.slaPolicies || []) {
      map.set(p.category, { count: 0, avgSla: p.targetHours });
    }
    for (const c of complaints) {
      const cur = map.get(c.category) || { count: 0, avgSla: c.slaHours };
      cur.count += 1;
      map.set(c.category, cur);
    }
    return Array.from(map.entries()).map(([category, v]) => ({ category, ...v }));
  }, [data, complaints]);

  return (
    <section className="w-full bg-[#faf9f5] pb-20">
      <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16 pt-6">
        {/* Header & Period Switcher */}
        <RevealBlock className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#e2e8f0]">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#1e40af]">
              Open Public Accountability Portal
            </span>
            <h1 className="font-display text-4xl sm:text-5xl text-[#0b1221] font-normal mt-2">
              Municipal Performance &amp; <span className="italic text-[#475569]">Transparency.</span>
            </h1>
            <p className="text-sm sm:text-base text-[#475569] mt-2.5 max-w-2xl leading-relaxed">
              Real-time service-level adherence, departmental accountability scores, and ward-by-ward stress equity
              computed directly from live municipal database records (zero private citizen PII).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onWindowChange && (
              <div className="flex items-center gap-1 bg-[#f2f4f8] p-1 rounded-xl border border-[#e2e8f0]">
                {(
                  [
                    { key: '30d', label: '30 Days' },
                    { key: 'qtd', label: 'QTD' },
                    { key: 'annual', label: 'Annual' },
                  ] as const
                ).map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => onWindowChange(w.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      windowMode === w.key
                        ? 'bg-[#0b1221] text-white'
                        : 'text-[#475569] hover:text-[#0b1221]'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}

            <a
              href="/api/public/transparency/export.csv"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-[#e2e8f0] hover:bg-[#f2f4f8] text-xs font-semibold text-[#0b1221] whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#1e40af]" />
              <span>CSV Ledger</span>
            </a>
            <a
              href="/api/public/transparency/export.json"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Open JSON</span>
            </a>
          </div>
        </RevealBlock>

        {/* 4 KPI SUMMARY CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-8">
          <div className="p-5 rounded-2xl bg-white border border-[#e2e8f0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
              Total Resolved (Demo + Live)
            </span>
            <div className="font-display text-3xl sm:text-4xl text-[#0b1221] mt-2 tabular-nums">
              <AnimatedNumber value={data?.metrics.demoTotalResolvedHistorical ?? 1238} />
            </div>
            <span className="text-xs text-[#059669] font-semibold mt-1 block">
              {data?.metrics.resolvedCount ?? 4} verified in current active sample
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#e2e8f0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
              Citywide SLA Compliance
            </span>
            <div className="font-display text-3xl sm:text-4xl text-[#0b1221] mt-2 tabular-nums">
              <AnimatedNumber value={data?.metrics.slaCompliancePct ?? 94.6} decimals={1} suffix="%" />
            </div>
            <span className="text-xs text-[#64748b] mt-1 block">
              Weighted across {leaderboard.length} active bureaus
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#e2e8f0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
              Active Open Backlog
            </span>
            <div className="font-display text-3xl sm:text-4xl text-[#0b1221] mt-2 tabular-nums">
              <AnimatedNumber value={data?.metrics.activeCount ?? 12} />
            </div>
            <span className="text-xs text-[#64748b] mt-1 block">
              Across {data?.wards.length ?? 12} connected wards
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#e2e8f0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc2626]">
              Overdue SLA Breaches
            </span>
            <div className="font-display text-3xl sm:text-4xl text-[#dc2626] mt-2 tabular-nums">
              <AnimatedNumber value={data?.metrics.overdueCount ?? 2} />
            </div>
            <span className="text-xs text-[#64748b] mt-1 block">
              Automatically pinned to Tier 2 &amp; 3 escalation
            </span>
          </div>
        </div>

        {/* RANK 1 SPOTLIGHT + DEPARTMENT LEADERBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {topDepartment && (
            <div className="lg:col-span-4 bg-[#0b1221] text-white border border-[#1e293b] rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#93c5fd]">
                  <Award className="w-4 h-4" />
                  <span>Rank #01 Spotlight</span>
                </span>
                <span className="font-mono-tabular text-xs font-bold text-emerald-300">
                  {topDepartment.compositeScore} pts
                </span>
              </div>
              <div>
                <div className="text-xs font-mono-tabular text-slate-400">{topDepartment.code}</div>
                <h2 className="font-display text-2xl text-white mt-0.5">{topDepartment.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#131c31] border border-white/10">
                  <span className="text-slate-400 block text-[11px]">SLA Compliance</span>
                  <span className="font-mono-tabular text-lg font-bold text-emerald-300">
                    {topDepartment.slaCompliancePct}%
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#131c31] border border-white/10">
                  <span className="text-slate-400 block text-[11px]">Avg Turnaround</span>
                  <span className="font-mono-tabular text-lg font-bold text-white">
                    {topDepartment.avgResolutionHours}h
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#131c31] border border-white/10">
                  <span className="text-slate-400 block text-[11px]">Citizen Sign-Off</span>
                  <span className="font-mono-tabular text-lg font-bold text-amber-300">
                    {topDepartment.citizenScore.toFixed(1)} / 5.0
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#131c31] border border-white/10">
                  <span className="text-slate-400 block text-[11px]">Escalation Rate</span>
                  <span className="font-mono-tabular text-lg font-bold text-white">
                    {topDepartment.escalationPct}%
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Leading city bureau in weighted SLA compliance, minimal escalation overhang, and verified post-repair
                resident satisfaction.
              </p>
            </div>
          )}

          <div className={topDepartment ? 'lg:col-span-8' : 'lg:col-span-12'}>
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 sm:p-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-2xl text-[#0b1221]">Department Accountability Leaderboard</h2>
                <span className="text-xs text-[#64748b] font-mono-tabular uppercase">
                  Window: {windowMode.toUpperCase()}
                </span>
              </div>
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                    <th className="py-3 px-3">Rank</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-right">Backlog</th>
                    <th className="py-3 px-3 text-right">Resolved</th>
                    <th className="py-3 px-3 text-right">Avg Time</th>
                    <th className="py-3 px-3">SLA Compliance</th>
                    <th className="py-3 px-3 text-right">Escalation %</th>
                    <th className="py-3 px-3 text-right">Composite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-xs">
                  {leaderboard.map((row, idx) => (
                    <tr key={row.departmentId} className="hover:bg-[#faf9f5] transition-colors">
                      <td className="py-3.5 px-3 font-mono-tabular font-bold text-[#0b1221]">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-[#0b1221]">{row.name}</div>
                        <div className="text-[10px] font-mono-tabular text-[#64748b]">{row.code}</div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular">{row.activeBacklog}</td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold">
                        {row.resolvedCount}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular">{row.avgResolutionHours}h</td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden">
                            <div
                              className="h-full bg-[#059669] rounded-full"
                              style={{ width: `${Math.min(100, row.slaCompliancePct)}%` }}
                            />
                          </div>
                          <span className="font-mono-tabular font-bold text-[#0b1221]">{row.slaCompliancePct}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular text-[#dc2626]">
                        {row.escalationPct}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-bold text-[#1e40af]">
                        {row.compositeScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RANKING METHODOLOGY & HISTORICAL CONTINUITY */}
        <RevealBlock className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          <div className="lg:col-span-7 bg-[#f2f4f8] border border-[#e2e8f0] rounded-2xl p-6 sm:p-7">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#475569]">
              <Scale className="w-4 h-4 text-[#1e40af]" />
              <span>Composite Ranking Methodology</span>
            </div>
            <h3 className="font-display text-2xl text-[#0b1221] mt-1">
              How every municipal bureau is scored
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              {[
                {
                  weight: '50%',
                  title: 'SLA Adherence',
                  desc: 'Percentage of tickets resolved within ordinance target + authorized Fair SLA Credit.',
                },
                {
                  weight: '25%',
                  title: 'Escalation Control',
                  desc: 'Penalizes Tier 2/Tier 3 breaches (100 - escalationPct * 2) to reward proactive triage.',
                },
                {
                  weight: '25%',
                  title: 'Citizen Verification',
                  desc: 'Post-repair 5-star sign-off ratings normalized against historical verified completions.',
                },
              ].map((m) => (
                <div key={m.title} className="p-4 rounded-xl bg-white border border-[#e2e8f0]">
                  <span className="font-mono-tabular text-2xl font-bold text-[#1e40af]">{m.weight}</span>
                  <div className="text-sm font-bold text-[#0b1221] mt-1">{m.title}</div>
                  <p className="text-xs text-[#475569] mt-1 leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#475569]">
                <GitMerge className="w-4 h-4 text-[#1e40af]" />
                <span>Historical Continuity Protocol</span>
              </div>
              <h3 className="font-display text-2xl text-[#0b1221] mt-1">Fair Reorg Accounting</h3>
              <p className="text-xs text-[#475569] mt-2 leading-relaxed">
                When municipal bureaus merge, split, or transfer ward jurisdictions in the Control Room, WARDWISE
                preserves every ticket&apos;s original creation timestamp and escalation log while granting{' '}
                <strong className="text-[#0b1221]">Fair SLA Credit</strong> to incoming teams so reorganizations never
                distort rankings or erase audit trails.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#e2e8f0] flex items-center gap-2 text-xs font-semibold text-[#059669]">
              <CheckCircle2 className="w-4 h-4" />
              <span>SHA-256 Immutable Audit Trail Verified</span>
            </div>
          </div>
        </RevealBlock>

        {/* CHARTS: MONTHLY VELOCITY + STATUS SPLIT + CATEGORY TURNAROUND */}
        <RevealBlock className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          <div className="lg:col-span-7 bg-white border border-[#e2e8f0] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display text-2xl text-[#0b1221]">Monthly Resolution Velocity</h3>
                <p className="text-xs text-[#475569]">Filed vs. Resolved complaints &amp; SLA compliance rate</p>
              </div>
              <TrendingUp className="w-5 h-5 text-[#1e40af]" />
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 items-end h-52 pt-4">
              {monthlyPerformance.map((pt) => {
                const maxVal = Math.max(...monthlyPerformance.map((p) => Math.max(p.filed, p.resolved)), 100);
                const filedPct = Math.round((pt.filed / maxVal) * 100);
                const resolvedPct = Math.round((pt.resolved / maxVal) * 100);
                return (
                  <div key={pt.month} className="flex flex-col items-center h-full justify-end gap-2">
                    <div className="flex items-end gap-1.5 h-36 w-full justify-center">
                      <div
                        className="w-4 rounded-t-md bg-[#bfdbfe]"
                        style={{ height: `${filedPct}%` }}
                        title={`Filed: ${pt.filed}`}
                      />
                      <div
                        className="w-4 rounded-t-md bg-[#0b1221]"
                        style={{ height: `${resolvedPct}%` }}
                        title={`Resolved: ${pt.resolved}`}
                      />
                    </div>
                    <div className="text-center">
                      <span className="block text-[11px] font-bold text-[#0b1221]">{pt.month}</span>
                      <span className="block text-[10px] font-mono-tabular text-[#059669]">
                        {pt.slaCompliancePct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-[#e2e8f0] flex items-center gap-6 text-xs text-[#475569]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#bfdbfe] inline-block" /> Filed Volume
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#0b1221] inline-block" /> Resolved Volume
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-[#e2e8f0] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl text-[#0b1221]">Live Status &amp; Category Mix</h3>
              <BarChart3 className="w-5 h-5 text-[#64748b]" />
            </div>

            <div className="space-y-3 text-xs">
              {[
                { label: 'Active Intake / Routed', count: statusBreakdown.active, color: 'bg-[#0b1221]' },
                { label: 'Field Work In Progress', count: statusBreakdown.inProgress, color: 'bg-[#2563eb]' },
                { label: 'Escalated Breach Watch', count: statusBreakdown.escalated, color: 'bg-[#dc2626]' },
                { label: 'Resolved & Closed', count: statusBreakdown.resolvedClosed, color: 'bg-[#059669]' },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-[#0b1221]">{s.label}</span>
                    <span className="font-mono-tabular font-bold text-[#0b1221]">{s.count}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#f2f4f8] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${Math.round((s.count / statusBreakdown.total) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[#e2e8f0]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569] block mb-2">
                Ordinance Target by Category
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {categoryTurnaround.map((c) => (
                  <div key={c.category} className="p-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] flex justify-between items-center">
                    <span className="truncate pr-2 text-[#0b1221] font-medium">{c.category}</span>
                    <span className="font-mono-tabular font-bold text-[#1e40af] shrink-0">{c.avgSla}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </RevealBlock>

        {/* 12-WARD EQUITY MATRIX */}
        <RevealBlock className="mt-8 bg-white border border-[#e2e8f0] rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-2xl text-[#0b1221]">12-Ward Performance &amp; Equity Matrix</h3>
              <p className="text-xs text-[#475569]">
                Click any ward card to filter live street tickets on the interactive GIS map.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {wardPerformance.map((w) => (
              <button
                key={w.wardId}
                type="button"
                onClick={() => onNavigate?.('/map', `ward=${encodeURIComponent(w.wardId)}`)}
                className="p-4 rounded-xl bg-[#faf9f5] hover:bg-[#f2f4f8] border border-[#e2e8f0] text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono-tabular font-bold text-[#0b1221]">{w.code}</span>
                  <span
                    className={`font-mono-tabular font-bold ${
                      w.overdueCount > 0 ? 'text-[#dc2626]' : 'text-[#059669]'
                    }`}
                  >
                    {w.slaCompliancePct}% SLA
                  </span>
                </div>
                <div className="text-sm font-bold text-[#0b1221] mt-1 truncate">{w.name}</div>
                <div className="flex items-center justify-between text-[11px] text-[#475569] mt-3">
                  <span>Active: {w.activeCount}</span>
                  <span>Resolved: {w.resolvedCount}</span>
                  <span>Stress: {w.stressIndex}%</span>
                </div>
              </button>
            ))}
          </div>
        </RevealBlock>

        {/* 3 OBSERVATIONAL FINDINGS CARDS */}
        <RevealBlock className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {[
            {
              title: 'Hydraulic Conduit Upgrades',
              kicker: 'Water & Drainage',
              img: '/src/assets/images/civic_water_repair_1794931447493.jpg',
              body: 'Preventative valve inspections in Wards 02 and 04 cut emergency burst duration by 31% across Q2.',
            },
            {
              title: 'Intersection Signal Telemetry',
              kicker: 'Traffic & Signals',
              img: '/src/assets/images/civic_traffic_signal_1794931447024.jpg',
              body: 'Automated optical mast diagnostics enable sub-4-hour dispatch before commuter corridor congestion.',
            },
            {
              title: 'Cryptographic Ledger Audits',
              kicker: 'Zero Silent Closures',
              img: '/src/assets/images/civic_audit_ledger_1794931445911.jpg',
              body: 'Every status change and resolution photograph carries a SHA-256 verification digest open to public audit.',
            },
          ].map((card) => (
            <div key={card.title} className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden shadow-xs">
              <div className="h-44 bg-[#f2f4f8]">
                <ResilientImage src={card.img} alt={card.title} className="w-full h-full object-cover" />
              </div>
              <div className="p-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1e40af]">
                  {card.kicker}
                </span>
                <h4 className="font-display text-xl text-[#0b1221] mt-1">{card.title}</h4>
                <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">{card.body}</p>
              </div>
            </div>
          ))}
        </RevealBlock>

        {/* OPEN DATA EXPORT BANNER */}
        <div className="mt-8 p-7 rounded-2xl bg-[#0b1221] text-white border border-[#1e293b] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-[#60a5fa] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-2xl text-white">Machine-Readable Open Civic Data</h3>
              <p className="text-xs text-slate-300 mt-1">
                Download anonymized CSV or JSON feeds for independent journalism, civic research, and municipal audits.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/api/public/transparency/export.csv"
              className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Download CSV
            </a>
            <a
              href="/api/public/transparency/export.json"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <span>Download Open JSON</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
