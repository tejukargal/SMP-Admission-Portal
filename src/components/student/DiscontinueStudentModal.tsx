import { useState } from 'react';
import { Modal } from '../common/Modal';
import { markStudentDiscontinued } from '../../services/studentService';
import { createStudentNotification } from '../../services/studentNotificationService';
import type { Student } from '../../types';

const todayIso = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local date

/** Marks a confirmed student who left as Discontinued (seat cancelled, fee history kept).
 *  Also used on already-cancelled students to record the date / reason. */
export function DiscontinueStudentModal({ student, userId, onClose, onSaved }: {
  student: Student | null;
  userId?: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [date, setDate] = useState(() => student?.discontinuedDate?.slice(0, 10) || todayIso());
  const [reason, setReason] = useState(() => student?.discontinuedReason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!student) return null;
  const alreadyCancelled = student.admissionStatus?.trim() === 'CANCELLED';

  async function save() {
    if (!student) return;
    if (!date) { setError('Choose the date the student left.'); return; }
    setSaving(true);
    setError('');
    try {
      await markStudentDiscontinued(student.id, { date, reason });
      if (!alreadyCancelled && userId && student.regNumber) {
        void createStudentNotification({
          studentId: student.id,
          regNumber: student.regNumber,
          type: 'status-changed',
          title: 'Admission Status Updated',
          message: 'Your admission status was changed to CANCELLED (discontinued).',
          createdBy: userId,
        });
      }
      onSaved(alreadyCancelled
        ? `Discontinued details saved for ${student.studentNameSSLC}.`
        : `${student.studentNameSSLC} marked Discontinued — moved to Admissions › Cancelled › Discontinued. Fee history is kept; issue a refund there if needed.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-xl border border-[#CFE3F2] bg-[#F3F9FD] px-3 py-2 text-sm font-medium text-[#262B35] placeholder:text-[#A9B0BB] placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0B7BC0] focus:ring-2 focus:ring-[#0B7BC0]/20 transition-colors';

  return (
    <Modal
      open
      title={alreadyCancelled ? 'Discontinued details' : 'Mark as Discontinued'}
      message={
        <div className="space-y-3">
          <p>
            {alreadyCancelled
              ? <>Record when and why <span className="font-semibold text-gray-900">{student.studentNameSSLC}</span> left.</>
              : <>
                  <span className="font-semibold text-gray-900">{student.studentNameSSLC}</span> ({student.course} · {student.year}) left after admission.
                  Their seat will be cancelled and they will leave the student roll; fee receipts are kept for reports and refunds.
                </>}
          </p>
          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-[#5B6371] mb-1">Left on</span>
            <input type="date" className={field} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-[#5B6371] mb-1">Reason (optional)</span>
            <input
              type="text"
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value.toUpperCase())}
              placeholder="e.g. JOINED ENGINEERING, PERSONAL REASONS"
            />
          </label>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
      }
      confirmLabel={alreadyCancelled ? 'Save' : 'Mark Discontinued'}
      variant={alreadyCancelled ? 'primary' : 'danger'}
      loading={saving}
      onConfirm={() => void save()}
      onCancel={() => { if (!saving) onClose(); }}
    />
  );
}
