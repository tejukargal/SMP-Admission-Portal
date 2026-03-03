import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FiltersProvider } from './contexts/FiltersContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { Layout } from './components/layout/Layout';

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Students = lazy(() => import('./pages/Students').then((m) => ({ default: m.Students })));
const EnrollStudent = lazy(() =>
  import('./pages/EnrollStudent').then((m) => ({ default: m.EnrollStudent }))
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const ImportStudents = lazy(() =>
  import('./pages/ImportStudents').then((m) => ({ default: m.ImportStudents }))
);
const CollectFee = lazy(() =>
  import('./pages/CollectFee').then((m) => ({ default: m.CollectFee }))
);
const FeeStructurePage = lazy(() =>
  import('./pages/FeeStructurePage').then((m) => ({ default: m.FeeStructurePage }))
);
const FeeRegister = lazy(() =>
  import('./pages/FeeRegister').then((m) => ({ default: m.FeeRegister }))
);
const ImportFeeRegister = lazy(() =>
  import('./pages/ImportFeeRegister').then((m) => ({ default: m.ImportFeeRegister }))
);

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <SettingsProvider>
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/enroll" element={<EnrollStudent />} />
        <Route path="/students" element={<Students />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/import" element={<ImportStudents />} />
        <Route path="/fees" element={<CollectFee />} />
        <Route path="/fee-structure" element={<FeeStructurePage />} />
        <Route path="/fee-register" element={<FeeRegister />} />
        <Route path="/import-fee" element={<ImportFeeRegister />} />
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
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <p className="text-gray-500">Loading...</p>
            </div>
          }
        >
          <AppRoutes />
        </Suspense>
        </FiltersProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
