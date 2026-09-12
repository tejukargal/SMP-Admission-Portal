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
import {
  generateCircularBackground, type PendingBackground,
  generateCircularDraft, type CircularAiProvider, type CircularAiLanguage,
} from '../../services/circularService';

const AI_PROVIDER_KEY = 'smp-admissions:circular-ai-provider';
const AI_LANGUAGE_KEY = 'smp-admissions:circular-ai-language';

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
    pendingBackground?: PendingBackground,
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
  const [pendingBackground, setPendingBackground] = useState<PendingBackground | null>(null);
  const [generatingBackground, setGeneratingBackground] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  const [brief, setBrief] = useState('');
  const [keyDates, setKeyDates] = useState('');
  const [aiProvider, setAiProvider] = useState<CircularAiProvider>(
    () => (localStorage.getItem(AI_PROVIDER_KEY) as CircularAiProvider) || 'claude',
  );
  const [aiLanguage, setAiLanguage] = useState<CircularAiLanguage>(
    () => (localStorage.getItem(AI_LANGUAGE_KEY) as CircularAiLanguage) || 'english',
  );
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  // RichTextEditor only seeds its contentEditable HTML from `value` once, on
  // mount — bumping this key forces a clean remount so an AI-generated body
  // actually shows up in the editor, not just in the `body` state.
  const [bodySeedVersion, setBodySeedVersion] = useState(0);
  const [aiSeedBody, setAiSeedBody] = useState<string | null>(null);

  const valid = title.trim() !== '' && date !== '' && subject.trim() !== '' && stripHtml(body).trim() !== '';
  const canGenerateBackground = title.trim() !== '' && department.trim() !== '';

  function handleProviderChange(next: CircularAiProvider) {
    setAiProvider(next);
    localStorage.setItem(AI_PROVIDER_KEY, next);
  }

  function handleLanguageChange(next: CircularAiLanguage) {
    setAiLanguage(next);
    localStorage.setItem(AI_LANGUAGE_KEY, next);
  }

  async function runCompose() {
    setComposeError(null);
    setComposing(true);
    try {
      const draft = await generateCircularDraft({
        brief: brief.trim(),
        keyDates: keyDates.trim() || undefined,
        provider: aiProvider,
        language: aiLanguage,
      });
      setTitle(draft.title);
      setSubject(draft.subject);
      if (draft.department) setDepartment(draft.department as Department);
      setAiSeedBody(draft.bodyHtml);
      setBodySeedVersion((v) => v + 1);
      setBody(draft.bodyHtml);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Could not generate a draft. Please try again.');
    } finally {
      setComposing(false);
    }
  }

  function handleGenerateDraftClick() {
    const hasExistingContent = title.trim() !== '' || subject.trim() !== '' || stripHtml(body).trim() !== '';
    if (hasExistingContent) {
      setConfirmOverwrite(true);
      return;
    }
    void runCompose();
  }

  async function handleGenerateBackground() {
    setBackgroundError(null);
    setGeneratingBackground(true);
    try {
      const result = await generateCircularBackground({
        title: title.trim(),
        subject: subject.trim(),
        department,
        bodySnippet: stripHtml(body).trim().slice(0, 400),
      });
      setPendingBackground(result);
    } catch (e) {
      setBackgroundError(e instanceof Error ? e.message : 'Could not generate a background. Please try again.');
    } finally {
      setGeneratingBackground(false);
    }
  }

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
        pendingBackground ?? undefined,
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
          <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Compose with AI</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="e.g. Announce that 3rd semester admission last date is extended, with a late fine after a cutoff date"
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors resize-y"
            />
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">Add key dates/deadlines (optional)</summary>
              <textarea
                value={keyDates}
                onChange={(e) => setKeyDates(e.target.value)}
                rows={2}
                placeholder="e.g. Last date: 20 August 2026. Rs.500 fine after 15 August 2026."
                className="mt-1.5 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors resize-y"
              />
            </details>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={aiProvider}
                onChange={(e) => handleProviderChange(e.target.value as CircularAiProvider)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
              </select>
              <select
                value={aiLanguage}
                onChange={(e) => handleLanguageChange(e.target.value as CircularAiLanguage)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="english">English</option>
                <option value="kannada">Kannada</option>
                <option value="both">Both</option>
              </select>
              <button
                type="button"
                onClick={handleGenerateDraftClick}
                disabled={composing || brief.trim() === ''}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                {composing ? 'Generating…' : 'Generate Draft'}
              </button>
            </div>
            {confirmOverwrite && (
              <div className="flex items-center gap-2 flex-wrap text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span>This will replace your current Title, Subject and Body.</span>
                <button
                  type="button"
                  onClick={() => { setConfirmOverwrite(false); void runCompose(); }}
                  className="font-semibold underline cursor-pointer"
                >
                  Continue
                </button>
                <button type="button" onClick={() => setConfirmOverwrite(false)} className="text-gray-500 underline cursor-pointer">
                  Cancel
                </button>
              </div>
            )}
            {composeError && <p className="text-xs text-red-500 font-medium">{composeError}</p>}
          </div>

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
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">AI Background</label>
            {pendingBackground ? (
              <div className="flex items-center gap-3">
                <img
                  src={`data:${pendingBackground.mimeType};base64,${pendingBackground.base64}`}
                  alt="Generated background preview"
                  className="w-32 h-20 object-cover rounded-lg border border-gray-200"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGenerateBackground()}
                    disabled={generatingBackground}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    {generatingBackground ? 'Regenerating…' : 'Regenerate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingBackground(null)}
                    disabled={generatingBackground}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : initial?.backgroundImageUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={initial.backgroundImageUrl}
                  alt="Current background"
                  className="w-32 h-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => void handleGenerateBackground()}
                  disabled={generatingBackground || !canGenerateBackground}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                >
                  {generatingBackground ? 'Generating…' : 'Regenerate'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleGenerateBackground()}
                disabled={generatingBackground || !canGenerateBackground}
                className="self-start px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                {generatingBackground ? 'Generating…' : 'Generate Background'}
              </button>
            )}
            {!canGenerateBackground && !generatingBackground && (
              <p className="text-[11px] text-gray-400">Add a title and department first.</p>
            )}
            {backgroundError && <p className="text-xs text-red-500 font-medium">{backgroundError}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Body</label>
            <RichTextEditor
              key={bodySeedVersion}
              value={aiSeedBody ?? initial?.body ?? ''}
              onChange={setBody}
              placeholder="Write the circular content…"
            />
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
