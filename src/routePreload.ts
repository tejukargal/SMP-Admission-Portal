import type { ComponentType } from 'react';

type Loader = () => Promise<{ default: ComponentType }>;

// Single source of truth for the lazy page chunks. App.tsx feeds these to
// React.lazy(), and the Sidebar calls preloadRoute() on hover/focus — both share
// the same memoised import() promise, so a prefetch is never downloaded twice.
function once(load: Loader): Loader {
  let p: ReturnType<Loader> | null = null;
  return () => {
    if (!p) {
      p = load();
      p.catch(() => { p = null; }); // allow a retry after a failed chunk fetch
    }
    return p;
  };
}

export const pageLoaders = {
  dashboard: once(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard }))),
  students: once(() => import('./pages/Students').then((m) => ({ default: m.Students }))),
  wpStudents: once(() => import('./pages/WPStudents').then((m) => ({ default: m.WPStudents }))),
  admissions: once(() => import('./pages/Admissions').then((m) => ({ default: m.Admissions }))),
  enroll: once(() => import('./pages/EnrollStudent').then((m) => ({ default: m.EnrollStudent }))),
  settings: once(() => import('./pages/Settings').then((m) => ({ default: m.Settings }))),
  collectFee: once(() => import('./pages/CollectFee').then((m) => ({ default: m.CollectFee }))),
  feeRegister: once(() => import('./pages/FeeRegister').then((m) => ({ default: m.FeeRegister }))),
  feeReports: once(() =>
    import('./pages/FeeReportsPage').then((m) => ({ default: m.FeeReportsPage }))
  ),
  cashBook: once(() => import('./pages/CashBook').then((m) => ({ default: m.CashBook }))),
  messaging: once(() => import('./pages/Messaging').then((m) => ({ default: m.Messaging }))),
  studentMessages: once(() =>
    import('./pages/StudentMessages').then((m) => ({ default: m.StudentMessages }))
  ),
  inquiries: once(() => import('./pages/Inquiries').then((m) => ({ default: m.Inquiries }))),
  studentReports: once(() =>
    import('./pages/StudentReports').then((m) => ({ default: m.StudentReports }))
  ),
  results: once(() => import('./pages/Results').then((m) => ({ default: m.Results }))),
  ansLetters: once(() => import('./pages/AnsLetters').then((m) => ({ default: m.AnsLetters }))),
};

const routeToLoader: Record<string, Loader> = {
  '/dashboard': pageLoaders.dashboard,
  '/students': pageLoaders.students,
  '/wp-students': pageLoaders.wpStudents,
  '/admissions': pageLoaders.admissions,
  '/enroll': pageLoaders.enroll,
  '/settings': pageLoaders.settings,
  '/fees': pageLoaders.collectFee,
  '/fee-register': pageLoaders.feeRegister,
  '/fee-reports': pageLoaders.feeReports,
  '/cash-book': pageLoaders.cashBook,
  '/messaging': pageLoaders.messaging,
  '/student-messages': pageLoaders.studentMessages,
  '/inquiries': pageLoaders.inquiries,
  '/student-reports': pageLoaders.studentReports,
  '/results': pageLoaders.results,
  '/ans-letters': pageLoaders.ansLetters,
};

export function preloadRoute(path: string): void {
  // A failed prefetch must never surface — lazy() retries on real navigation.
  routeToLoader[path]?.().catch(() => {});
}

// After login, warm the most-used pages while the browser is idle.
export function preloadCommonRoutes(isAdmin: boolean): void {
  const paths = ['/dashboard', '/students', '/admissions', '/fee-register', '/enroll'];
  if (isAdmin) paths.push('/fees');
  const run = () => paths.forEach(preloadRoute);
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run);
  else setTimeout(run, 2000);
}
