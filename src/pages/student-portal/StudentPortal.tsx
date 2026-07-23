import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
import { TabOnboarding } from './TabOnboarding';
import { getGreeting } from '../../utils/greeting';
import { circularSeenKey } from '../../utils/htmlContent';
import {
  subscribeToNotices, fetchNoticeSeenState, markNoticesSeen,
  subscribeToCirculars, fetchCircularSeenState, markCircularsSeen,
  fetchMyNotifications, markNotificationsSeen,
  fetchMyTotalDue, fetchHasRecentCertificate,
} from '../../services/studentPortalService';
import type { Circular, Notice, StudentNotification } from '../../types';

export type TabKey = 'profile' | 'fees' | 'certificates' | 'circulars' | 'notices' | 'contact';

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

export function StudentPortal() {
  const { student, allRecords, regNumber, loading, logout } = useStudentAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>(
    (location.state as { activeTab?: TabKey } | null)?.activeTab ?? 'circulars'
  );

  // "Welcome Back" until the student switches tabs for the first time, then
  // the time-of-day greeting (Good Morning/Afternoon/Evening/Night) takes over.
  // Compares against the previous tab (rather than an effect-ran-once flag)
  // because StrictMode double-invokes mount effects in dev, which would
  // otherwise consume the "skip once" flag before any real tab switch.
  const [greeting, setGreeting] = useState('Welcome Back');
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current !== activeTab) {
      setGreeting(getGreeting());
      prevTab.current = activeTab;
    }
  }, [activeTab]);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [circularsLoading, setCircularsLoading] = useState(true);
  const [circularSeenIds, setCircularSeenIds] = useState<Set<string>>(new Set());

  const [unseenNotifications, setUnseenNotifications] = useState<StudentNotification[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);

  const [feeDue, setFeeDue] = useState(0);
  const [hasNewCertificate, setHasNewCertificate] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);

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

  // Drives the Fee History / Certificates tab badges — a lightweight parallel
  // fetch, independent of whichever tab is actually open.
  useEffect(() => {
    if (!regNumber) return;
    fetchMyTotalDue(regNumber, allRecords).then(setFeeDue);
    fetchHasRecentCertificate(regNumber).then(setHasNewCertificate);
  }, [regNumber, allRecords, refreshKey]);

  function dismissOnboarding() {
    setShowOnboarding(false);
  }

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
    setShowOnboarding(true);
    setTimeout(() => setRefreshing(false), 500);
  }

  if (loading) return <PageSpinner fullScreen />;

  if (!student || !regNumber) {
    return (
      <div className="font-portal min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-gray-500 mb-3">We couldn't load your record. Please sign in again.</p>
          <button onClick={() => void logout()} className="text-sm font-semibold text-gray-900 underline">
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
    <div className="font-portal no-scrollbar h-screen overflow-y-auto bg-gray-50 pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-20">
        <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none">SMP Admissions - Students Portal</p>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mt-1.5 truncate">
                <span className="block">{greeting},</span>
                <span className="block">{firstName}</span>
              </h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh"
                aria-label="Refresh"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
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
                className="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
        </div>

        {/* Top tab row — desktop/tablet */}
        <div className="hidden md:block bg-white border-b border-gray-200 shadow-sm">
          <div className="flex max-w-3xl mx-auto px-4 gap-1 py-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors cursor-pointer ${
                  activeTab === t.key
                    ? 'bg-gray-900 text-white font-bold'
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
                {t.key === 'fees' && feeDue > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
                {t.key === 'certificates' && hasNewCertificate && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
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
        {activeTab === 'circulars' && (
          <CircularsTab circulars={circulars} loading={circularsLoading} seenIds={circularSeenIds} onShareApp={() => void handleShareApp()} />
        )}
        {activeTab === 'notices' && <NoticesTab notices={notices} loading={noticesLoading} />}
        {/* Contact tab temporarily disabled — uncomment to re-enable (see also TABS array and import above). */}
        {/* {activeTab === 'contact' && <ContactTab student={student} />} */}
      </div>

      {shareToast && (
        <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-gray-50 border border-gray-200 text-gray-800 text-xs font-medium px-3.5 py-2 rounded-full shadow-md whitespace-nowrap"
          style={{ animation: 'toast-in 0.2s ease-out' }}
        >
          <span className="text-gray-500 leading-none">✓</span>
          {shareToast}
        </div>
      )}

      {/* Bottom tab bar — mobile */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              activeTab === t.key ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className={`px-4 py-1 rounded-full transition-colors ${activeTab === t.key ? 'bg-gray-900 text-white animate-[nav-pop_0.2s_ease-out]' : ''}`}>
              {t.icon}
            </span>
            {t.label}
            {t.key === 'notices' && unreadNoticeCount > 0 && (
              <span className="absolute top-1 right-1/4 rounded-full bg-red-500 text-white text-[9px] leading-none px-1 py-0.5">{unreadNoticeCount}</span>
            )}
            {t.key === 'circulars' && unreadCircularCount > 0 && (
              <span className="absolute top-1 right-1/4 rounded-full bg-red-500 text-white text-[9px] leading-none px-1 py-0.5">{unreadCircularCount}</span>
            )}
            {t.key === 'fees' && feeDue > 0 && (
              <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-red-500" />
            )}
            {t.key === 'certificates' && hasNewCertificate && (
              <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>

      {showOnboarding && <TabOnboarding onDismiss={dismissOnboarding} />}

      {showNotifModal && (
        <NotificationModal notifications={unseenNotifications} onClose={handleCloseNotifModal} />
      )}
    </div>
  );
}
