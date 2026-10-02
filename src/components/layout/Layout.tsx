import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('smp_sidebar_collapsed') === 'true'
  );
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('smp_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  // Ctrl+B / ⌘B toggles the sidebar (drawer on mobile) — ignored while typing
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      if (isDesktop) toggleSidebar();
      else setMobileNavOpen((o) => !o);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, toggleSidebar]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'linear-gradient(160deg, #F6F8FB 0%, #F8FAFC 45%, #F4F6FB 100%)' }}>
      {!isDesktop && mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[2px]"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
          style={{ animation: 'backdrop-enter 0.22s ease-out' }}
        />
      )}
      <div
        className={isDesktop ? 'relative' : 'fixed inset-y-0 left-0 z-50 sb-motion'}
        style={isDesktop ? undefined : {
          transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: mobileNavOpen ? '8px 0 30px rgba(15,23,42,0.15)' : 'none',
        }}
      >
        <Sidebar
          collapsed={isDesktop ? collapsed : false}
          onToggle={isDesktop ? toggleSidebar : () => setMobileNavOpen(false)}
          onNavigate={() => setMobileNavOpen(false)}
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 min-h-0 overflow-auto no-scrollbar p-4">{children}</main>
      </div>
    </div>
  );
}
