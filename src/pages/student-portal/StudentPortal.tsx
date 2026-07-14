import { useEffect, useState } from 'react';
import { useStudentAuth } from '../../contexts/StudentAuthContext';
import { PageSpinner } from '../../components/common/PageSpinner';
import { ProfileTab } from './ProfileTab';
import { FeeHistoryTab } from './FeeHistoryTab';
import { CertificatesTab } from './CertificatesTab';
import { NoticesTab } from './NoticesTab';
import { CircularsTab } from './CircularsTab';
import { noticeAppliesToMe } from './noticeUtils';
// Contact tab temporarily disabled — see TABS array and content render below. Re-enable by uncommenting this import and those spots.
// import { ContactTab } from './ContactTab';
import { NotificationModal } from './NotificationModal';
import { getGreeting } from '../../utils/greeting';
import { circularSeenKey } from '../../utils/htmlContent';
import {
  subscribeToNotices, fetchNoticeSeenState, markNoticesSeen,
  subscribeToCirculars, fetchCircularSeenState, markCircularsSeen,
  fetchMyNotifications, markNotificationsSeen,
} from '../../services/studentPortalService';
import type { Circular, Notice, StudentNotification } from '../../types';

type TabKey = 'profile' | 'fees' | 'certificates' | 'circulars' | 'notices' | 'contact';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'circulars', label: 'Circulars',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  {
    key: 'profile', label: 'Profile',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    key: 'fees', label: 'Fee History',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
  {
    key: 'certificates', label: 'Certificates',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/></svg>,
  },
  {
    key: 'notices', label: 'Notices',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  },
  // Contact tab temporarily disabled — uncomment to re-enable (see also the
  // content render branch and commented import above).
  // {
  //   key: 'contact', label: 'Contact',
  //   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  // },
];

// Per-tab accent classes. Tailwind 4 scans source text, so these must stay literal strings.
const ACCENT: Record<TabKey, { nav: string; pill: string }> = {
  profile: { nav: 'bg-indigo-100 text-indigo-600', pill: 'bg-indigo-50 text-indigo-700' },
  fees: { nav: 'bg-emerald-100 text-emerald-600', pill: 'bg-emerald-50 text-emerald-700' },
  certificates: { nav: 'bg-violet-100 text-violet-600', pill: 'bg-violet-50 text-violet-700' },
  circulars: { nav: 'bg-teal-100 text-teal-600', pill: 'bg-teal-50 text-teal-700' },
  notices: { nav: 'bg-amber-100 text-amber-700', pill: 'bg-amber-50 text-amber-700' },
  contact: { nav: 'bg-sky-100 text-sky-600', pill: 'bg-sky-50 text-sky-700' },
};

const NAV_TEXT: Record<TabKey, string> = {
  profile: 'text-indigo-600',
  fees: 'text-emerald-600',
  certificates: 'text-violet-600',
  circulars: 'text-teal-600',
  notices: 'text-amber-700',
  contact: 'text-sky-600',
};

function HeaderPill({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/70 border border-indigo-200/60 backdrop-blur-sm px-1.5 py-0.5">
      <span className="text-[8px] font-semibold uppercase tracking-wide text-indigo-400">{label}</span>
      <span className="text-[11px] font-black text-indigo-900 leading-none">{value}</span>
    </span>
  );
}

export function StudentPortal() {
  const { student, allRecords, regNumber, loading, logout } = useStudentAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('circulars');

  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [circularsLoading, setCircularsLoading] = useState(true);
  const [circularSeenIds, setCircularSeenIds] = useState<Set<string>>(new Set());

  const [unseenNotifications, setUnseenNotifications] = useState<StudentNotification[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [shareToast, setShareToast] = useState('');
  useEffect(() => {
    if (!shareToast) return;
    const t = setTimeout(() => setShareToast(''), 2500);
    return () => clearTimeout(t);
  }, [shareToast]);

  async function handleShareApp() {
    const url = `${window.location.origin}/student-login`;
    const shareData = {
      title: 'SMP Admissions Student Portal',
      text: 'Check your circulars, fee history, notices & certificates on the SMP Admissions Student Portal!',
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast('Portal link copied to clipboard!');
    } catch {
      setShareToast('Could not copy the link — please copy it from the address bar.');
    }
  }

  // Live notice subscription — notices posted while the student is logged in appear immediately.
  useEffect(() => {
    if (!student) return;
    const unsubscribe = subscribeToNotices((all) => {
      setNotices(all.filter((n) => noticeAppliesToMe(n, student)));
      setNoticesLoading(false);
    });
    return unsubscribe;
  }, [student]);

  useEffect(() => {
    if (!regNumber) return;
    fetchNoticeSeenState(regNumber).then((state) => {
      setSeenIds(new Set(state?.seenNoticeIds ?? []));
    });
  }, [regNumber, refreshKey]);

  // Live circular subscription — circulars are visible to all students;
  // unpublished (archivedAt) circulars are filtered out here.
  useEffect(() => {
    if (!student) return;
    const unsubscribe = subscribeToCirculars((all) => {
      setCirculars(all.filter((c) => !c.archivedAt));
      setCircularsLoading(false);
    });
    return unsubscribe;
  }, [student]);

  useEffect(() => {
    if (!regNumber) return;
    fetchCircularSeenState(regNumber).then((state) => {
      setCircularSeenIds(new Set(state?.seenCircularIds ?? []));
    });
  }, [regNumber, refreshKey]);

  // Viewing the Circulars tab marks everything currently loaded as seen — clears the unread badge.
  // Seen state is keyed by id+updatedAt (see circularSeenKey), so editing a
  // circular later makes it reappear as unread/"New" automatically.
  useEffect(() => {
    if (activeTab !== 'circulars' || !regNumber || circulars.length === 0) return;
    const unseen = circulars.filter((c) => !circularSeenIds.has(circularSeenKey(c))).map((c) => circularSeenKey(c));
    if (unseen.length === 0) return;
    setCircularSeenIds((prev) => new Set([...prev, ...unseen]));
    void markCircularsSeen(regNumber, unseen, [...circularSeenIds]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, circulars, regNumber]);

  function loadNotifications() {
    if (!regNumber) return;
    fetchMyNotifications(regNumber).then((all) => {
      const unseen = all.filter((n) => !n.seen);
      if (unseen.length > 0) {
        setUnseenNotifications(unseen);
        setShowNotifModal(true);
      }
    });
  }

  useEffect(() => {
    if (!student || !regNumber) return;
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, regNumber]);

  // Viewing the Notices tab marks everything currently loaded as seen — clears the unread badge.
  // Students cannot dismiss/hide notices themselves; only admin can clear a notice for students.
  useEffect(() => {
    if (activeTab !== 'notices' || !regNumber || notices.length === 0) return;
    const unseen = notices.filter((n) => !seenIds.has(n.id)).map((n) => n.id);
    if (unseen.length === 0) return;
    setSeenIds((prev) => new Set([...prev, ...unseen]));
    void markNoticesSeen(regNumber, unseen, [...seenIds]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, notices, regNumber]);

  function handleCloseNotifModal() {
    setShowNotifModal(false);
    void markNotificationsSeen(unseenNotifications.map((n) => n.id));
  }

  function handleRefresh() {
    setRefreshing(true);
    loadNotifications();
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 500);
  }

  if (loading) return <PageSpinner fullScreen />;

  if (!student || !regNumber) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-gray-500 mb-3">We couldn't load your record. Please sign in again.</p>
          <button onClick={() => void logout()} className="text-sm font-semibold text-indigo-700 underline">
            Back to Student Login
          </button>
        </div>
      </div>
    );
  }

  const unreadNoticeCount = notices.filter((n) => !seenIds.has(n.id)).length;
  const unreadCircularCount = circulars.filter((c) => !circularSeenIds.has(circularSeenKey(c))).length;
  const firstName = student.studentNameSSLC.split(' ')[0];

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-20">
        <div className="bg-gradient-to-br from-indigo-100 via-violet-100 to-purple-100 border-b border-violet-200/60">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
          {/* Row 1: college name + greeting on the left, refresh/logout on the right — always same row */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 leading-none">SMP Admissions</p>
              <h1 className="text-base font-black text-gray-800 leading-tight mt-1 truncate">{getGreeting()}, {firstName}</h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh"
                aria-label="Refresh"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-violet-300/60 bg-white/60 text-violet-600 hover:bg-white transition-colors disabled:opacity-50"
              >
                <svg
                  width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  className={refreshing ? 'animate-spin' : undefined}
                >
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
              <button
                onClick={() => void logout()}
                className="shrink-0 rounded-full border border-violet-300/60 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-violet-600 hover:bg-white transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>

          {/* Row 2: compact detail pills — fits within two lines on any width */}
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <HeaderPill label="Reg No" value={student.regNumber} />
            <HeaderPill label="Course" value={student.course} />
            <HeaderPill label="Year" value={student.year} />
            <HeaderPill label="Adm Type" value={student.admType} />
            <HeaderPill label="Adm Cat" value={student.admCat} />
          </div>
        </div>
        </div>

        {/* Top tab row — desktop/tablet */}
        <div className="hidden md:block bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
          <div className="flex max-w-3xl mx-auto px-4 gap-1 py-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors cursor-pointer ${
                  activeTab === t.key
                    ? `${ACCENT[t.key].pill} font-bold`
                    : 'font-semibold text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t.icon} {t.label}
                {t.key === 'notices' && unreadNoticeCount > 0 && (
                  <span className="rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5">{unreadNoticeCount}</span>
                )}
                {t.key === 'circulars' && unreadCircularCount > 0 && (
                  <span className="rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5">{unreadCircularCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4 animate-[content-enter_0.25s_ease-out]" key={refreshKey}>
        {activeTab === 'profile' && <ProfileTab student={student} />}
        {activeTab === 'fees' && <FeeHistoryTab regNumber={regNumber} allRecords={allRecords} />}
        {activeTab === 'certificates' && <CertificatesTab regNumber={regNumber} />}
        {activeTab === 'circulars' && <CircularsTab circulars={circulars} loading={circularsLoading} seenIds={circularSeenIds} />}
        {activeTab === 'notices' && <NoticesTab notices={notices} loading={noticesLoading} />}
        {/* Contact tab temporarily disabled — uncomment to re-enable (see also TABS array and import above). */}
        {/* {activeTab === 'contact' && <ContactTab student={student} />} */}
      </div>

      {/* Share app link footer */}
      <div className="max-w-3xl mx-auto px-4 pb-4">
        <button
          type="button"
          onClick={() => void handleShareApp()}
          className="w-full sm:w-auto sm:mx-auto flex items-center justify-center gap-2 rounded-full border-2 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 text-sm font-semibold transition-colors cursor-pointer group"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          Share this app link to friends
        </button>
      </div>

      {shareToast && (
        <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium px-3.5 py-2 rounded-full shadow-md whitespace-nowrap"
          style={{ animation: 'toast-in 0.2s ease-out' }}
        >
          <span className="text-indigo-500 leading-none">✓</span>
          {shareToast}
        </div>
      )}

      {/* Bottom tab bar — mobile */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              activeTab === t.key ? NAV_TEXT[t.key] : 'text-gray-400'
            }`}
          >
            <span className={`px-4 py-1 rounded-full transition-colors ${activeTab === t.key ? `${ACCENT[t.key].nav} animate-[nav-pop_0.2s_ease-out]` : ''}`}>
              {t.icon}
            </span>
            {t.label}
            {t.key === 'notices' && unreadNoticeCount > 0 && (
              <span className="absolute top-1 right-1/4 rounded-full bg-red-500 text-white text-[9px] leading-none px-1 py-0.5">{unreadNoticeCount}</span>
            )}
            {t.key === 'circulars' && unreadCircularCount > 0 && (
              <span className="absolute top-1 right-1/4 rounded-full bg-red-500 text-white text-[9px] leading-none px-1 py-0.5">{unreadCircularCount}</span>
            )}
          </button>
        ))}
      </div>

      {showNotifModal && (
        <NotificationModal notifications={unseenNotifications} onClose={handleCloseNotifModal} />
      )}
    </div>
  );
}
