import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../hooks/useSettings';
import { Button } from '../common/Button';

export function Header() {
  const { logout, user } = useAuth();
  const { settings } = useSettings();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      <div className="text-sm text-gray-500">
        {settings?.currentAcademicYear && (
          <span>
            Academic Year:{' '}
            <span className="font-semibold text-gray-800">
              {settings.currentAcademicYear}
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {user?.email && (
          <span className="text-sm text-gray-500">{user.email}</span>
        )}
        <Button variant="secondary" size="sm" onClick={() => { void logout(); }}>
          Logout
        </Button>
      </div>
    </header>
  );
}
