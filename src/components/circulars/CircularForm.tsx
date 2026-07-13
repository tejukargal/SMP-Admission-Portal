import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Circular, Department, StoredAttachment } from '../../types';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '../../utils/departments';
import { stripHtml } from '../../utils/htmlContent';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { RichTextEditor } from './RichTextEditor';
import { AttachmentDropzone } from './AttachmentDropzone';

export interface CircularFormValues {
  title: string;
  date: string;
  subject: string;
  department: Department;
  body: string;
}

interface CircularFormProps {
  /** When set, the form is in edit mode and pre-filled from this circular. */
  initial?: Circular;
  onSubmit: (
    values: CircularFormValues,
    newFiles: File[],
    keptAttachments: StoredAttachment[],
    removedPaths: string[],
  ) => Promise<void>;
  onClose: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add/Edit circular overlay — Title, Date, Department, Subject, rich-text
 *  Body and Firebase Storage attachments. SMP Connect's "Add New Circular". */
export function CircularForm({ initial, onSubmit, onClose }: CircularFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [department, setDepartment] = useState<Department>(initial?.department ?? 'All');
  const [body, setBody] = useState(initial?.body ?? '');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [kept, setKept] = useState<StoredAttachment[]>(initial?.attachments ?? []);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim() !== '' && date !== '' && subject.trim() !== '' && stripHtml(body).trim() !== '';

  async function handleSubmit() {
    if (!valid) {
      setError('Title, Date, Subject and Body are required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(
        { title: title.trim(), date, subject: subject.trim(), department, body },
        newFiles, kept, removedPaths,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save circular. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/40" style={{ animation: 'backdrop-enter 0.18s ease-out' }} onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.22s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-bold text-gray-900">{initial ? 'Edit Circular' : 'New Circular'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3.5">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diploma Exam Time Table — June 2026" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors"
              />
            </div>
            <Select
              label="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              options={DEPARTMENT_ORDER.map((d) => ({ value: d, label: d === DEPARTMENTS[d].name ? d : `${d} — ${DEPARTMENTS[d].name}` }))}
            />
          </div>
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="One-line subject of the circular" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Body</label>
            <RichTextEditor value={initial?.body ?? ''} onChange={setBody} placeholder="Write the circular content…" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Attachments</label>
            <AttachmentDropzone
              files={newFiles}
              onAdd={(files) => setNewFiles((prev) => [...prev, ...files])}
              onRemove={(i) => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
              existing={kept}
              onRemoveExisting={(i) => {
                setRemovedPaths((prev) => [...prev, kept[i].storagePath]);
                setKept((prev) => prev.filter((_, idx) => idx !== i));
              }}
            />
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-gray-100 shrink-0">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50">Cancel</button>
          <Button size="sm" loading={saving} disabled={!valid} onClick={() => void handleSubmit()}>
            {initial ? 'Save Changes' : 'Publish Circular'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
