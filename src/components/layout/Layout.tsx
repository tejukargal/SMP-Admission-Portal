import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('smp_sidebar_collapsed') === 'true'
  );

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('smp_sidebar_collapsed', String(next));
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #f0fdf8 0%, #f0f9ff 50%, #fafff8 100%)' }}>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
