import { useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Eye, EyeOff, Lock, Menu, ShieldCheck, UserPlus, X } from 'lucide-react';
import type { AdminRole, AdminUser } from '../types/wardwise';
import { api } from '../lib/api';
import type { ConnectionStatus } from '../lib/realtime';

export type PublicRoute = '/' | '/report' | '/map' | '/track' | '/transparency' | '/control-room';

interface LayoutProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute, query?: string) => void;
  adminUser: AdminUser | null;
  onAdminAuthenticated: (user: AdminUser) => void;
  realtimeStatus?: ConnectionStatus;
  children: ReactNode;
}

export function PublicLayout({
  currentRoute,
  onNavigate,
  adminUser,
  onAdminAuthenticated,
  realtimeStatus = 'connected',
  children,
}: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminRole>('Commissioner');
  const [email, setEmail] = useState('commissioner@wardwise.gov');
  const [password, setPassword] = useState('1234567890');
  const [showPassword, setShowPassword] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const navItems: { label: string; route: PublicRoute }[] = [
    { label: 'Home', route: '/' },
    { label: 'Live City Map', route: '/map' },
    { label: 'Track My Issue', route: '/track' },
    { label: 'Transparency', route: '/transparency' },
  ];

  const isDarkHero = currentRoute === '/';

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res =
        authMode === 'signup'
          ? await api.register({
              name: fullName,
              email,
              password,
              role,
            })
          : await api.login(email, password);
      onAdminAuthenticated(res.user);
      setLoginOpen(false);
      onNavigate('/control-room');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-[#faf9f5] text-[#0b1221]">
        {/* Unified 3-Zone Top Bar Contract */}
        <header
          className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-200 backdrop-blur-xl ${
            isDarkHero
              ? 'bg-[#0b1221]/85 border-white/10 text-white'
              : 'bg-[#faf9f5]/90 border-[#e2e8f0] text-[#0b1221]'
          }`}
        >
          <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16 h-16 flex items-center justify-between gap-8">
            {/* Zone 1: Clean Single-Line Wordmark */}
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer rounded-md"
            >
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  isDarkHero
                    ? 'bg-[#1e40af] border-[#60a5fa]/35 text-white'
                    : 'bg-[#0b1221] border-[#0b1221] text-white'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span
                className={`text-base font-bold tracking-tight whitespace-nowrap shrink-0 ${
                  isDarkHero ? 'text-white' : 'text-[#0b1221]'
                }`}
              >
                WARDWISE
              </span>
            </button>

            {/* Zone 2: Clean Single-Line Nav Links */}
            <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
              {navItems.map((item) => {
                const active = currentRoute === item.route;
                return (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => onNavigate(item.route)}
                    className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 ${
                      active
                        ? isDarkHero
                          ? 'text-white border-[#60a5fa] font-semibold'
                          : 'text-[#0b1221] border-[#1e40af] font-semibold'
                        : isDarkHero
                        ? 'text-slate-300 border-transparent hover:text-white'
                        : 'text-[#475569] border-transparent hover:text-[#0b1221]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Primary CTA + Official Portal Access */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (adminUser) {
                    onNavigate('/control-room');
                  } else {
                    setLoginError(null);
                    setLoginOpen(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer px-2.5 py-1.5 rounded-md ${
                  isDarkHero
                    ? 'text-slate-200 hover:text-white hover:bg-white/10 border border-white/10 sm:border-transparent'
                    : 'text-[#475569] hover:text-[#0b1221] hover:bg-slate-200/60 border border-slate-200 sm:border-transparent'
                }`}
                title="Municipal Official Portal"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{adminUser ? 'Control Room' : 'Official Portal'}</span>
                <span className="sm:hidden">{adminUser ? 'Console' : 'Official'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/report')}
                className={`inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isDarkHero
                    ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-sm'
                    : 'bg-[#1e40af] hover:bg-[#1d4ed8] text-white shadow-xs'
                }`}
              >
                Report an Issue
              </button>

              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className={`md:hidden p-2 rounded-lg transition-colors cursor-pointer ${
                  isDarkHero
                    ? 'text-white hover:bg-white/10'
                    : 'text-[#0b1221] hover:bg-slate-200/60'
                }`}
                aria-label="Toggle navigation menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                className="md:hidden border-t border-[#e2e8f0] bg-white text-[#0b1221] px-5 py-4 shadow-lg flex flex-col gap-1"
              >
                {navItems.map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      onNavigate(item.route);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                      currentRoute === item.route
                        ? 'bg-[#f2f4f8] text-[#1e40af] font-semibold'
                        : 'text-[#475569] hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    if (adminUser) onNavigate('/control-room');
                    else setLoginOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium text-[#475569] hover:bg-slate-50"
                >
                  {adminUser ? 'Open Control Room' : 'Official Sign In'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Main Viewport with Smooth Route Transition */}
        <main className="flex-1 pt-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentRoute}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Unified Editorial Footer */}
        <footer className="w-full bg-[#0b1221] text-slate-300 border-t border-white/10 pt-16 pb-12">
          <div className="max-w-[1380px] mx-auto px-5 md:px-10 lg:px-16">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-14">
              <div className="md:col-span-5 flex flex-col justify-between pr-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#1e40af] flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-base text-white tracking-tight font-bold">WARDWISE</span>
                  </div>
                  <p className="font-display text-2xl italic text-white max-w-md leading-snug">
                    Infrastructure accountability built for cities that refuse silent delays.
                  </p>
                </div>
                <div className="mt-8 text-xs text-slate-400 font-medium">
                  Municipal Civic Operations Platform · Open Public Accountability Ledger
                </div>
              </div>

              <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Platform
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('/')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Home Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/map')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Live City Map
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/track')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Track My Issue
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/transparency')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Public Transparency
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Accountability
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('/transparency')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Department Leaderboard
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/transparency')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Scoring Methodology
                  </button>
                  <a
                    href="/api/public/transparency/export.csv"
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Export Open CSV
                  </a>
                  <a
                    href="/api/public/transparency/export.json"
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Export Open JSON
                  </a>
                </div>

                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Citizen Action
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('/report')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Report an Issue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (adminUser) onNavigate('/control-room');
                      else setLoginOpen(true);
                    }}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Official Portal Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/map')}
                    className="text-left text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Privacy &amp; PII Charter
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
              <p>© 2026 WARDWISE Civic Systems. Public records preserved under municipal ordinance.</p>
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-mono-tabular text-[11px] font-medium text-slate-200">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      realtimeStatus === 'connected'
                        ? 'bg-emerald-400'
                        : realtimeStatus === 'reconnecting'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-slate-500'
                    }`}
                  />
                  {realtimeStatus === 'connected'
                    ? 'Live Stream Synchronized'
                    : realtimeStatus === 'reconnecting'
                    ? 'Resyncing Stream…'
                    : 'Stream Offline'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Zero Private Citizen PII Exposed</span>
                <span aria-hidden="true">·</span>
                <span>Demo &amp; Live Records Labeled</span>
              </div>
            </div>
          </div>
        </footer>

        {/* Private Official Portal Sign-In & Sign-Up Modal */}
        <AnimatePresence>
          {loginOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-[#070d19]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
              onClick={() => setLoginOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 10 }}
                transition={{ duration: 0.18 }}
                className="w-full max-w-md rounded-2xl bg-[#0b1221] text-white border border-white/15 p-6 sm:p-7 shadow-2xl my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#2563eb]/20 border border-[#60a5fa]/40 flex items-center justify-center text-[#93c5fd]">
                      {authMode === 'signup' ? <UserPlus className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">
                        {authMode === 'signup' ? 'Official Registration' : 'Control Room Sign In'}
                      </h2>
                      <p className="text-xs text-slate-300">Authorized Municipal Personnel Portal</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLoginOpen(false)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                    aria-label="Close official portal dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Sign In / Sign Up Mode Switcher */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#131c31] border border-white/10 mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setLoginError(null);
                      if (!email) setEmail('commissioner@wardwise.gov');
                      if (!password) setPassword('1234567890');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      authMode === 'signin'
                        ? 'bg-[#2563eb] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Official Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setLoginError(null);
                      if (email === 'commissioner@wardwise.gov' || email === 'supervisor@wardwise.gov' || email === 'dispatch@wardwise.gov') {
                        setEmail('');
                      }
                      setPassword('1234567890');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      authMode === 'signup'
                        ? 'bg-[#2563eb] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Official Sign Up
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authMode === 'signup' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1.5">Official Full Name</label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Insp. A. Patel"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#131c31] border border-white/20 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#60a5fa]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1.5">Municipal Role</label>
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value as AdminRole)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#131c31] border border-white/20 text-sm text-white focus:outline-none focus:border-[#60a5fa]"
                        >
                          <option value="Commissioner">Commissioner</option>
                          <option value="Supervisor">Supervisor</option>
                          <option value="Dispatcher">Dispatcher</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-200 mb-1.5">Municipal Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={authMode === 'signup' ? 'official.name@wardwise.gov' : 'commissioner@wardwise.gov'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#131c31] border border-white/20 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#60a5fa]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-slate-200">Password</label>
                      <span className="text-[11px] font-mono-tabular text-[#93c5fd]">
                        Default: 1234567890
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="1234567890"
                        className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-[#131c31] border border-white/20 text-sm font-mono-tabular text-white placeholder:text-slate-400 focus:outline-none focus:border-[#60a5fa]"
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
                    <div className="p-3 rounded-xl bg-red-950/75 border border-red-400/50 text-xs text-red-100">
                      {loginError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loggingIn}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {loggingIn
                      ? authMode === 'signup'
                        ? 'Creating Official Account…'
                        : 'Verifying Credentials…'
                      : authMode === 'signup'
                      ? 'Create Account & Enter Control Room'
                      : 'Authenticate & Enter Control Room'}
                  </button>
                </form>

                <div className="mt-5 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between text-[11px] mb-2">
                    <span className="font-semibold text-slate-300">Quick-Fill Evaluation Accounts:</span>
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
                          setEmail(acc.email);
                          setPassword(acc.pass);
                        }}
                        className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-[11px] text-[#93c5fd] font-semibold cursor-pointer transition-colors"
                      >
                        {acc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
