import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FiltersProvider } from './contexts/FiltersContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { Layout } from './components/layout/Layout';
import { PageSpinner } from './components/common/PageSpinner';

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Students = lazy(() => import('./pages/Students').then((m) => ({ default: m.Students })));
const EnrollStudent = lazy(() =>
  import('./pages/EnrollStudent').then((m) => ({ default: m.EnrollStudent }))
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const CollectFee = lazy(() =>
  import('./pages/CollectFee').then((m) => ({ default: m.CollectFee }))
);
const FeeRegister = lazy(() =>
  import('./pages/FeeRegister').then((m) => ({ default: m.FeeRegister }))
);
const FeeReportsPage = lazy(() =>
  import('./pages/FeeReportsPage').then((m) => ({ default: m.FeeReportsPage }))
);

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <PageSpinner fullScreen />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <SettingsProvider>
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/enroll" element={<EnrollStudent />} />
        <Route path="/students" element={<Students />} />
        <Route
          path="/fees"
          element={isAdmin ? <CollectFee /> : <Navigate to="/dashboard" replace />}
        />
        <Route path="/fee-register" element={<FeeRegister />} />
        <Route
          path="/fee-reports"
          element={isAdmin ? <FeeReportsPage /> : <Navigate to="/dashboard" replace />}
        />
        <Route
          path="/settings"
          element={isAdmin ? <Settings /> : <Navigate to="/dashboard" replace />}
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FiltersProvider>
        <Suspense fallback={<PageSpinner fullScreen />}>
          <AppRoutes />
        </Suspense>
        </FiltersProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
