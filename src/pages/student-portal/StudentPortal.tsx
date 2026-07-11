import { useEffect, useState } from 'react';
import { useStudentAuth } from '../../contexts/StudentAuthContext';
import { PageSpinner } from '../../components/common/PageSpinner';
import { ProfileTab } from './ProfileTab';
import { FeeHistoryTab } from './FeeHistoryTab';
import { NoticesTab } from './NoticesTab';
import { noticeAppliesToMe } from './noticeUtils';
import { ContactTab } from './ContactTab';
import { NotificationModal } from './NotificationModal';
import { getGreeting } from '../../utils/greeting';
import {
  subscribeToNotices, fetchNoticeSeenState, markNoticesSeen,
  fetchMyNotifications, markNotificationsSeen,
} from '../../services/studentPortalService';
import type { Notice, StudentNotification } from '../../types';

type TabKey = 'profile' | 'fees' | 'notices' | 'contact';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'profile', label: 'Profile',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    key: 'fees', label: 'Fee History',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
  {
    key: 'notices', label: 'Notices',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  },
  {
    key: 'contact', label: 'Contact',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  },
];

function HeaderPill({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5">
      <span className="text-[8px] font-semibold uppercase tracking-wide text-emerald-500/80">{label}</span>
      <span className="text-[11px] font-black text-emerald-800 leading-none">{value}</span>
    </span>
  );
}

export function StudentPortal() {
  const { student, allRecords, regNumber, loading, logout } = useStudentAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const [unseenNotifications, setUnseenNotifications] = useState<StudentNotification[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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
          <button onClick={() => void logout()} className="text-sm font-semibold text-emerald-700 underline">
            Back to Student Login
          </button>
        </div>
      </div>
    );
  }

  const unreadNoticeCount = notices.filter((n) => !seenIds.has(n.id)).length;
  const firstName = student.studentNameSSLC.split(' ')[0];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 pt-2.5 pb-1.5">
          {/* Row 1: college name + greeting on the left, refresh/logout on the right — always same row */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600/90 leading-none">SMP Admissions</p>
              <h1 className="text-sm font-black text-gray-900 leading-tight mt-1 truncate">{getGreeting()}, {firstName}</h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh"
                aria-label="Refresh"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
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
                className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
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

        {/* Top tab row — desktop/tablet */}
        <div className="hidden md:flex max-w-3xl mx-auto px-4 gap-1 border-t border-gray-50">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === t.key
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.icon} {t.label}
              {t.key === 'notices' && unreadNoticeCount > 0 && (
                <span className="rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5">{unreadNoticeCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4" key={refreshKey}>
        {activeTab === 'profile' && <ProfileTab student={student} />}
        {activeTab === 'fees' && <FeeHistoryTab regNumber={regNumber} allRecords={allRecords} />}
        {activeTab === 'notices' && <NoticesTab notices={notices} loading={noticesLoading} />}
        {activeTab === 'contact' && <ContactTab student={student} />}
      </div>

      {/* Bottom tab bar — mobile */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors cursor-pointer ${
              activeTab === t.key ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            {t.icon}
            {t.label}
            {t.key === 'notices' && unreadNoticeCount > 0 && (
              <span className="absolute top-1 right-1/4 rounded-full bg-red-500 text-white text-[9px] leading-none px-1 py-0.5">{unreadNoticeCount}</span>
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
