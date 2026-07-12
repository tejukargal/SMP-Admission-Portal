import { useEffect, useState } from 'react';
import type { Student, StudentMessage, StudentMessageCategory } from '../../types';
import { fetchMyMessages, submitMyMessage } from '../../services/studentPortalService';
import { Button } from '../../components/common/Button';

const CATEGORY_OPTIONS: { value: StudentMessageCategory; label: string }[] = [
  { value: 'name-correction', label: 'Name Correction' },
  { value: 'profile-update', label: 'Profile / Details Update' },
  { value: 'other', label: 'Other' },
];

export function ContactTab({ student }: { student: Student }) {
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<StudentMessageCategory>('name-correction');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  function reload() {
    setLoading(true);
    fetchMyMessages(student.regNumber)
      .then(setMessages)
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, [student.regNumber]);

  async function handleSubmit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setSubmitMsg('');
    try {
      await submitMyMessage(student.regNumber, student.studentNameSSLC, category, message.trim());
      setMessage('');
      setSubmitMsg('Message sent to admin.');
      reload();
    } catch {
      setSubmitMsg('Failed to send. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-500 text-white shadow-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </span>
          <h4 className="text-sm font-bold text-gray-900">Send a Message to Admin</h4>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as StudentMessageCategory)}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
            >
              {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Describe what needs to be corrected or changed…"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 resize-none"
            />
          </div>
          {submitMsg && <p className="text-xs text-emerald-600 font-medium">{submitMsg}</p>}
          <Button onClick={() => void handleSubmit()} loading={submitting} disabled={!message.trim()} className="w-full">
            Send Message
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-5 h-5 rounded-md bg-sky-100 text-sky-600 flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 6 12 12 16 14"/><circle cx="12" cy="12" r="10"/></svg>
          </span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Your Past Messages</h4>
        </div>
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-6">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6">No messages sent yet.</div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {CATEGORY_OPTIONS.find((o) => o.value === m.category)?.label ?? m.category}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {m.status === 'resolved' ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.message}</p>
                {m.adminReply && (
                  <div className="mt-2 bg-sky-50/60 rounded-lg p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-600 mb-0.5">Admin Reply</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.adminReply}</p>
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-2">
                  {new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
