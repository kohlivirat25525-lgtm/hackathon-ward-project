import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import type { IssueStatus } from '../types/wardwise';

export const WARDWISE_EASE = [0.16, 1, 0.3, 1] as const;

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}) {
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    let rafId = 0;
    const duration = 650;
    const startTime = performance.now();
    const startVal = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setDisplay(startVal + (value - startVal) * eased);
      if (elapsed < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, prefersReduced]);

  return (
    <span className="tabular-nums">
      {prefix}
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()}
      {suffix}
    </span>
  );
}

export function RevealBlock({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.45, delay, ease: WARDWISE_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  emphasis,
  subtitle,
  dark = false,
  action,
}: {
  eyebrow: string;
  title: string;
  emphasis?: string;
  subtitle?: string;
  dark?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
      <div className="max-w-3xl">
        <div
          className={`text-xs font-semibold tracking-wider uppercase ${
            dark ? 'text-[#93c5fd]' : 'text-[#1e40af]'
          }`}
        >
          {eyebrow}
        </div>
        <h2
          className={`font-display text-3xl sm:text-4xl lg:text-[44px] lg:leading-[1.15] font-normal mt-2 text-balance ${
            dark ? 'text-white' : 'text-[#0b1221]'
          }`}
        >
          {title}{' '}
          {emphasis && (
            <span className={`italic ${dark ? 'text-[#93c5fd]' : 'text-[#475569]'}`}>{emphasis}</span>
          )}
        </h2>
        {subtitle && (
          <p
            className={`text-sm sm:text-base mt-3 leading-relaxed max-w-2xl ${
              dark ? 'text-slate-300' : 'text-[#475569]'
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatusIndicator({
  status,
  isOverdue = false,
  dark = false,
}: {
  status: IssueStatus;
  isOverdue?: boolean;
  dark?: boolean;
}) {
  const critical = status === 'Escalated' || isOverdue;
  const completed = status === 'Resolved' || status === 'Closed';
  const warning = status === 'Reopened';

  const tone = critical
    ? dark
      ? 'text-red-300'
      : 'text-[#dc2626]'
    : completed
    ? dark
      ? 'text-emerald-300'
      : 'text-[#059669]'
    : warning
    ? dark
      ? 'text-amber-300'
      : 'text-[#d97706]'
    : dark
    ? 'text-sky-300'
    : 'text-[#1e40af]';

  const Icon = critical
    ? ShieldAlert
    : completed
    ? CheckCircle2
    : warning
    ? AlertTriangle
    : Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${tone}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
}

export function SkeletonRow() {
  return (
    <div className="h-12 w-full rounded-xl bg-slate-200/70 animate-pulse" aria-hidden="true" />
  );
}
