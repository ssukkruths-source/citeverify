import React, { useState } from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  FileText,
  Search,
  BookMarked,
  FileCheck2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  SplitSquareVertical,
  Home,
  Compass,
  FolderOpen,
  CalendarRange,
  Users,
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react';
import { useSupabaseAuth } from './SupabaseAuthGate';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeAuditId?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  requiresAudit?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  activeAuditId,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const { session, signOut } = useSupabaseAuth();

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('citeverify-theme', next ? 'dark' : 'light');
  };

  const groups: NavGroup[] = [
    {
      title: 'Verification',
      items: [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        { id: 'upload', label: 'New Audit', icon: UploadCloud, highlight: true },
        { id: 'history', label: 'My Audits', icon: FileText },
        { id: 'results', label: 'Audit Results', icon: FileCheck2, requiresAudit: true },
        { id: 'claims', label: 'Claim Explorer', icon: Search, requiresAudit: true },
        { id: 'pdf-viewer', label: 'PDF Workspace', icon: SplitSquareVertical, requiresAudit: true },
        { id: 'references', label: 'Reference Library', icon: BookMarked, requiresAudit: true },
      ],
    },
    {
      title: 'Discovery',
      items: [
        { id: 'discover', label: 'Discover Research', icon: Compass },
        { id: 'collections', label: 'Collections', icon: FolderOpen },
        { id: 'timeline', label: 'Research Timeline', icon: CalendarRange },
        { id: 'authors', label: 'Author Explorer', icon: Users },
      ],
    },
    {
      title: 'Output',
      items: [
        { id: 'reports', label: 'Reports', icon: FileCheck2, requiresAudit: true },
        { id: 'settings', label: 'Settings & Privacy', icon: Settings },
      ],
    },
  ];

  const go = (view: string) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="cv-workspace-mobilebar lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-[#E8E7E1] flex items-center justify-between px-4 z-50">
        <button className="flex items-center gap-2" onClick={() => go('landing')}>
          <span className="w-7 h-7 rounded-lg bg-[#3268BB] flex items-center justify-center text-white">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <span className="font-extrabold text-sm tracking-tight text-[#14233F]">CiteVerify</span>
        </button>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg text-[#687387] hover:bg-[#FAF9F5]"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-[#14233F]/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`cv-sidebar relative flex flex-col justify-between border-r border-[#E8E7E1] bg-white transition-all duration-300 z-50 select-none shrink-0
          lg:sticky lg:top-0 lg:h-screen
          ${mobileOpen ? 'fixed top-14 left-0 bottom-0 w-64' : 'hidden lg:flex'}
          ${isCollapsed ? 'lg:w-16' : 'lg:w-64'}`}
      >
        <div className="overflow-y-auto">
          <div className="hidden lg:flex items-center justify-between p-4 border-b border-[#E8E7E1] h-16">
            {!isCollapsed ? (
              <button onClick={() => go('landing')} className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#3268BB] flex items-center justify-center text-white">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <span className="font-extrabold text-base tracking-tight text-[#14233F]">CiteVerify</span>
              </button>
            ) : (
              <button
                onClick={() => go('landing')}
                className="w-8 h-8 rounded-lg bg-[#3268BB] flex items-center justify-center text-white mx-auto"
              >
                <ShieldCheck className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded-md text-[#687387] hover:bg-[#FAF9F5] hover:text-[#14233F] transition-colors"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          <nav className="p-3 space-y-3">
            {groups.map((group) => (
              <div key={group.title} className="space-y-0.5">
                {!isCollapsed && (
                  <div className="px-3 pt-1 pb-1 text-[9.5px] font-mono uppercase tracking-wider text-[#9CA3AF]">
                    {group.title}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  const isDisabled = item.requiresAudit && !activeAuditId;
                  return (
                    <button
                      key={item.id}
                      disabled={isDisabled}
                      onClick={() => go(item.id)}
                      title={isCollapsed ? item.label : isDisabled ? `${item.label} (upload a paper first)` : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[11.5px] font-semibold transition-all ${
                        isActive
                          ? 'bg-[#14233F] text-white shadow-sm'
                          : isDisabled
                            ? 'opacity-40 cursor-not-allowed text-[#687387]'
                            : item.highlight
                              ? 'bg-[#FFF3D8] text-[#14233F] hover:bg-[#cbe665]'
                              : 'text-[#687387] hover:bg-[#FAF9F5] hover:text-[#14233F]'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : item.highlight ? 'text-[#14233F]' : 'text-[#687387]'
                        }`}
                      />
                      {!isCollapsed && <span>{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="p-3 border-t border-[#E8E7E1] bg-[#FAF9F5]/50">
          <button
            onClick={() => { void signOut(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-[#687387] hover:text-[#14233F] hover:bg-white transition-all"
            title={session.user.is_anonymous ? 'Sign out of guest workspace' : `Sign out${session.user.email ? ` (${session.user.email})` : ''}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>{session.user.is_anonymous ? 'Guest workspace' : (session.user.email || 'Signed in')} · Sign out</span>}
          </button>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-[#687387] hover:text-[#14233F] hover:bg-white transition-all"
            title={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
          >
            {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            {!isCollapsed && <span>{isDark ? 'Light appearance' : 'Dark appearance'}</span>}
          </button>
          <button
            onClick={() => go('landing')}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-[#687387] hover:text-[#14233F] hover:bg-white transition-all"
          >
            <Home className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Return to Website</span>}
          </button>

          {!isCollapsed && (
            <div className="mt-2 pt-2 border-t border-[#E8E7E1] px-2 text-[11px] font-mono text-[#687387]">
              <div>Verification + Discovery</div>
              <div className="text-[10px] text-emerald-700 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Crossref · OpenAlex · S2
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
