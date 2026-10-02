import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { StudentAuthProvider, useStudentAuth } from './contexts/StudentAuthContext';
import { FiltersProvider } from './contexts/FiltersContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { CashInHandProvider } from './contexts/CashInHandContext';
import { Layout } from './components/layout/Layout';
import { pageLoaders, preloadCommonRoutes } from './routePreload';
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
const CircularDetail = lazy(() =>
  import('./pages/student-portal/CircularDetail').then((m) => ({ default: m.CircularDetail }))
);
const StudentMessages = lazy(pageLoaders.studentMessages);
const Dashboard = lazy(pageLoaders.dashboard);
const Students = lazy(pageLoaders.students);
const WPStudents = lazy(pageLoaders.wpStudents);
const Admissions = lazy(pageLoaders.admissions);
const EnrollStudent = lazy(pageLoaders.enroll);
const Settings = lazy(pageLoaders.settings);
const CollectFee = lazy(pageLoaders.collectFee);
const FeeRegister = lazy(pageLoaders.feeRegister);
const FeeReportsPage = lazy(pageLoaders.feeReports);
const CashBook = lazy(pageLoaders.cashBook);
const Messaging = lazy(pageLoaders.messaging);
const Inquiries = lazy(pageLoaders.inquiries);
const StudentReports = lazy(pageLoaders.studentReports);
const Results = lazy(pageLoaders.results);
const AnsLetters = lazy(pageLoaders.ansLetters);

function AppRoutes() {
  const { user, role, loading } = useAuth();
  const { isStudentSession, loading: studentLoading } = useStudentAuth();

  useEffect(() => {
    if (user) preloadCommonRoutes(role === 'admin');
  }, [user, role]);

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
            <Route path="/portal/circular" element={<CircularDetail />} />
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
    <CashInHandProvider>
    <Layout>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/enroll" element={<EnrollStudent />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="/students" element={<Students />} />
          <Route path="/wp-students" element={<WPStudents />} />
          <Route path="/student-reports" element={<StudentReports />} />
          <Route path="/results" element={<Results />} />
          <Route path="/ans-letters" element={<AnsLetters />} />
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
            path="/cash-book"
            element={isAdmin ? <CashBook /> : <Navigate to="/dashboard" replace />}
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
    </CashInHandProvider>
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
