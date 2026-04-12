import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Sidebar() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const navItems = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/inquiries', label: 'Inquiries' },
    { to: '/enroll', label: 'Enroll Student' },
    { to: '/admissions', label: 'Admissions' },
    { to: '/students', label: 'Students' },
    ...(isAdmin ? [{ to: '/fees', label: 'Collect Fee' }] : []),
    { to: '/fee-register', label: 'Fee Register' },
    ...(isAdmin ? [{ to: '/fee-reports', label: 'Fee Reports' }] : []),
    ...(isAdmin ? [{ to: '/messaging', label: 'Messaging' }] : []),
    ...(isAdmin ? [{ to: '/settings', label: 'Settings' }] : []),
  ];

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
      {!isAdmin && (
        <div className="px-4 py-3 border-t border-gray-700">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
            Staff Access
          </span>
        </div>
      )}
    </aside>
  );
}
