import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/students', label: 'Students' },
  { to: '/fees', label: 'Collect Fee' },
  { to: '/fee-register', label: 'Fee Register' },
  { to: '/fee-structure', label: 'Fee Structure' },
  { to: '/enroll', label: 'Enroll Student' },
  { to: '/import', label: 'Import Students' },
  { to: '/import-fee', label: 'Import Fee Reg' },
  { to: '/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="w-44 shrink-0 h-full bg-gray-900 text-white flex flex-col">
      <div className="px-4 py-4 border-b border-gray-700">
        <span className="font-bold text-sm tracking-wide">SMP ADMISSIONS</span>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
