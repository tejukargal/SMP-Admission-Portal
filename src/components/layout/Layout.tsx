import { useState } from 'react';
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

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('smp_sidebar_collapsed', String(next));
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)' }}>
      {!isDesktop && mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
          style={{ animation: 'backdrop-enter 0.18s ease-out' }}
        />
      )}
      <div
        className={isDesktop ? 'relative' : 'fixed inset-y-0 left-0 z-50 transition-transform duration-220'}
        style={isDesktop ? undefined : {
          transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Sidebar
          collapsed={isDesktop ? collapsed : false}
          onToggle={toggleSidebar}
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
