import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { StudentAuthProvider, useStudentAuth } from './contexts/StudentAuthContext';
import { FiltersProvider } from './contexts/FiltersContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { Layout } from './components/layout/Layout';
import { PageSpinner } from './components/common/PageSpinner';

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const StudentLogin = lazy(() =>
  import('./pages/StudentLogin').then((m) => ({ default: m.StudentLogin }))
);
const StudentPortal = lazy(() =>
  import('./pages/student-portal/StudentPortal').then((m) => ({ default: m.StudentPortal }))
);
const ReceiptBreakup = lazy(() =>
  import('./pages/student-portal/ReceiptBreakup').then((m) => ({ default: m.ReceiptBreakup }))
);
const StudentMessages = lazy(() =>
  import('./pages/StudentMessages').then((m) => ({ default: m.StudentMessages }))
);
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Students = lazy(() => import('./pages/Students').then((m) => ({ default: m.Students })));
const Admissions = lazy(() =>
  import('./pages/Admissions').then((m) => ({ default: m.Admissions }))
);
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
const Messaging = lazy(() =>
  import('./pages/Messaging').then((m) => ({ default: m.Messaging }))
);
const Inquiries = lazy(() =>
  import('./pages/Inquiries').then((m) => ({ default: m.Inquiries }))
);
const StudentReports = lazy(() =>
  import('./pages/StudentReports').then((m) => ({ default: m.StudentReports }))
);
const Results = lazy(() => import('./pages/Results').then((m) => ({ default: m.Results })));

function AppRoutes() {
  const { user, role, loading } = useAuth();
  const { isStudentSession, loading: studentLoading } = useStudentAuth();

  if (loading || studentLoading) {
    return <PageSpinner fullScreen />;
  }

  if (!user) {
    if (isStudentSession) {
      return (
        <Suspense fallback={<PageSpinner fullScreen />}>
          <Routes>
            <Route path="/portal" element={<StudentPortal />} />
            <Route path="/portal/receipt" element={<ReceiptBreakup />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<PageSpinner fullScreen />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/student-login" element={<StudentLogin />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <SettingsProvider>
    <FiltersProvider>
    <Layout>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/enroll" element={<EnrollStudent />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="/students" element={<Students />} />
          <Route path="/student-reports" element={<StudentReports />} />
          <Route path="/results" element={<Results />} />
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
            path="/messaging"
            element={isAdmin ? <Messaging /> : <Navigate to="/dashboard" replace />}
          />
          <Route
            path="/student-messages"
            element={isAdmin ? <StudentMessages /> : <Navigate to="/dashboard" replace />}
          />
          <Route
            path="/settings"
            element={isAdmin ? <Settings /> : <Navigate to="/dashboard" replace />}
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </Layout>
    </FiltersProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StudentAuthProvider>
          <AppRoutes />
        </StudentAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
