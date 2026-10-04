import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Circular, Department, StoredAttachment } from '../../types';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '../../utils/departments';
import { stripHtml } from '../../utils/htmlContent';
import { circularStatus, addDaysIST, todayIST, isoToLocalInput } from '../../utils/circularStatus';
import {
  CYAN, CYAN_INK, HAIRLINE, BAND, MsgIcon, BTN_GRAY, BTN_CYAN, TEXT_INPUT, FIELD_OVERRIDE, SELECT_PILL,
  PillButton, FieldLabel,
} from '../messages/messagesUi';
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

export interface CircularFormResult {
  values: CircularFormValues;
  newFiles: File[];
  keptAttachments: StoredAttachment[];
  removedPaths: string[];
  pendingBackground?: PendingBackground;
  /** Duplicate: the source circular's background, reused when none was generated. */
  existingBackgroundUrl?: string;
  /** New circulars only — true = Save as Draft (or Schedule, with publishAt). */
  draft: boolean;
  /** ISO. New: set when scheduled. Edit (Draft/Scheduled only): null clears the schedule. */
  publishAt?: string | null;
  expiresOn: string | null;
  notify: boolean;
}

interface CircularFormProps {
  /** When set, the form is in edit mode and pre-filled from this circular. */
  initial?: Circular;
  /** When set (and no `initial`), a new circular pre-filled from this one — no attachments. */
  duplicateFrom?: Circular;
  onSubmit: (result: CircularFormResult) => Promise<void>;
  onClose: () => void;
}

const VALID_FOR = [7, 15, 30] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add/Edit circular overlay — Title, Date, Department, Subject, rich-text
 *  Body and Firebase Storage attachments. SMP Connect's "Add New Circular". */
export function CircularForm({ initial, duplicateFrom, onSubmit, onClose }: CircularFormProps) {
  const source = initial ?? duplicateFrom;
  const [title, setTitle] = useState(initial?.title ?? (duplicateFrom ? `Copy of ${duplicateFrom.title}` : ''));
  const [date, setDate] = useState(initial?.date ?? today());
  const [subject, setSubject] = useState(source?.subject ?? '');
  const [department, setDepartment] = useState<Department>(source?.department ?? 'All');
  const [body, setBody] = useState(source?.body ?? '');
  // Publishing — when (new, or an edited Draft/Scheduled), valid-until, push choice.
  const initialStatus = initial ? circularStatus(initial) : null;
  const canSchedule = !initial || initialStatus === 'draft' || initialStatus === 'scheduled';
  const [when, setWhen] = useState<'now' | 'schedule'>(initial?.publishAt ? 'schedule' : 'now');
  const [publishAtLocal, setPublishAtLocal] = useState(initial?.publishAt ? isoToLocalInput(initial.publishAt) : '');
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? '');
  const [notify, setNotify] = useState(initial?.notify ?? true);
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

  async function handleSubmit(asDraft: boolean) {
    if (!valid) {
      setError('Title, Date, Subject and Body are required.');
      return;
    }
    const scheduling = canSchedule && when === 'schedule';
    let publishAtIso: string | null = null;
    if (scheduling) {
      const t = publishAtLocal ? new Date(publishAtLocal) : null;
      if (!t || Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) {
        setError('Pick a publish date & time in the future, or choose "Publish now".');
        return;
      }
      publishAtIso = t.toISOString();
    }
    if (expiresOn && expiresOn < todayIST()) {
      setError('"Valid until" cannot be in the past.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        values: { title: title.trim(), date, subject: subject.trim(), department, body },
        newFiles, keptAttachments: kept, removedPaths,
        pendingBackground: pendingBackground ?? undefined,
        existingBackgroundUrl: !initial ? duplicateFrom?.backgroundImageUrl : undefined,
        draft: asDraft || scheduling,
        // New: only when scheduled. Edit: only for Drafts/Scheduled (null clears).
        publishAt: initial ? (canSchedule ? publishAtIso : undefined) : (publishAtIso ?? undefined),
        expiresOn: expiresOn || null,
        notify,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save circular. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[#0B2530]/40" style={{ animation: 'backdrop-enter 0.18s ease-out' }} onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-2xl border w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ borderColor: HAIRLINE, boxShadow: '0 24px 60px -12px rgba(14,106,133,0.35)', animation: 'modal-enter 0.22s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b shrink-0" style={{ borderColor: BAND, background: 'linear-gradient(180deg, #F5FBFD 0%, #FFFFFF 100%)' }}>
          <span className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${CYAN}14`, color: CYAN, boxShadow: `inset 0 0 0 1px ${CYAN}26` }}>
            <MsgIcon name="megaphone" size={15} />
          </span>
          <h3 className="flex-1 min-w-0 text-[14.5px] font-medium truncate" style={{ color: CYAN_INK }}>{initial ? 'Edit Circular' : 'New Circular'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A93A3] hover:bg-[#0891B2]/10 hover:text-[#0E6A85] transition-colors cursor-pointer" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3.5">
          <div className="flex flex-col gap-2 rounded-2xl border p-3" style={{ borderColor: HAIRLINE, background: 'linear-gradient(160deg, #F2FAFC 0%, #FAFDFE 100%)' }}>
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: CYAN_INK }}><MsgIcon name="sparkle" size={13} />Compose with AI</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="e.g. Announce that 3rd semester admission last date is extended, with a late fine after a cutoff date"
              className={`${TEXT_INPUT} !bg-white resize-y`}
            />
            <details className="text-xs">
              <summary className="cursor-pointer text-[#5B6371] hover:text-[#0E6A85] select-none">Add key dates/deadlines (optional)</summary>
              <textarea
                value={keyDates}
                onChange={(e) => setKeyDates(e.target.value)}
                rows={2}
                placeholder="e.g. Last date: 20 August 2026. Rs.500 fine after 15 August 2026."
                className={`${TEXT_INPUT} !bg-white mt-1.5 resize-y`}
              />
            </details>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={aiProvider}
                onChange={(e) => handleProviderChange(e.target.value as CircularAiProvider)}
                className={SELECT_PILL}
              >
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
              </select>
              <select
                value={aiLanguage}
                onChange={(e) => handleLanguageChange(e.target.value as CircularAiLanguage)}
                className={SELECT_PILL}
              >
                <option value="english">English</option>
                <option value="kannada">Kannada</option>
                <option value="both">Both</option>
              </select>
              <button
                type="button"
                onClick={handleGenerateDraftClick}
                disabled={composing || brief.trim() === ''}
                className={BTN_CYAN}
              >
                <MsgIcon name="sparkle" size={12} />
                {composing ? 'Generating…' : 'Generate Draft'}
              </button>
            </div>
            {confirmOverwrite && (
              <div className="flex items-center gap-2 flex-wrap text-[12px] text-[#9A5B00] bg-[#D97706]/[0.07] border border-[#D97706]/30 rounded-xl px-3 py-2">
                <span>This will replace your current Title, Subject and Body.</span>
                <button
                  type="button"
                  onClick={() => { setConfirmOverwrite(false); void runCompose(); }}
                  className="font-semibold underline cursor-pointer"
                >
                  Continue
                </button>
                <button type="button" onClick={() => setConfirmOverwrite(false)} className="text-[#5B6371] underline cursor-pointer">
                  Cancel
                </button>
              </div>
            )}
            {composeError && <p className="text-[12px] text-[#A5173A] font-medium">{composeError}</p>}
          </div>

          <div><FieldLabel>Title</FieldLabel><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diploma Exam Time Table — June 2026" className={FIELD_OVERRIDE} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col">
              <FieldLabel>Date</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={TEXT_INPUT}
              />
            </div>
            <div><FieldLabel>Department</FieldLabel><Select
              className={`${FIELD_OVERRIDE} cursor-pointer`}
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              options={DEPARTMENT_ORDER.map((d) => ({ value: d, label: d === DEPARTMENTS[d].name ? d : `${d} — ${DEPARTMENTS[d].name}` }))}
            /></div>
          </div>
          <div><FieldLabel>Subject</FieldLabel><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="One-line subject of the circular" className={FIELD_OVERRIDE} /></div>

          <div className="flex flex-col">
            <FieldLabel>AI Background</FieldLabel>
            {pendingBackground ? (
              <div className="flex items-center gap-3">
                <img
                  src={`data:${pendingBackground.mimeType};base64,${pendingBackground.base64}`}
                  alt="Generated background preview"
                  className="w-32 h-20 object-cover rounded-xl border border-[#CBE8F0]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGenerateBackground()}
                    disabled={generatingBackground}
                    className={BTN_GRAY}
                  >
                    {generatingBackground ? 'Regenerating…' : 'Regenerate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingBackground(null)}
                    disabled={generatingBackground}
                    className={BTN_GRAY}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : source?.backgroundImageUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={source.backgroundImageUrl}
                  alt="Current background"
                  className="w-32 h-20 object-cover rounded-xl border border-[#CBE8F0]"
                />
                <button
                  type="button"
                  onClick={() => void handleGenerateBackground()}
                  disabled={generatingBackground || !canGenerateBackground}
                  className={BTN_GRAY}
                >
                  {generatingBackground ? 'Generating…' : 'Regenerate'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleGenerateBackground()}
                disabled={generatingBackground || !canGenerateBackground}
                className={`${BTN_CYAN} self-start`}
              >
                {generatingBackground ? 'Generating…' : 'Generate Background'}
              </button>
            )}
            {!canGenerateBackground && !generatingBackground && (
              <p className="mt-1 text-[11px] text-[#8A93A3]">Add a title and department first.</p>
            )}
            {backgroundError && <p className="mt-1 text-[12px] text-[#A5173A] font-medium">{backgroundError}</p>}
          </div>

          <div className="flex flex-col">
            <FieldLabel>Body</FieldLabel>
            <RichTextEditor
              key={bodySeedVersion}
              value={aiSeedBody ?? source?.body ?? ''}
              onChange={setBody}
              placeholder="Write the circular content…"
            />
          </div>
          <div className="flex flex-col">
            <FieldLabel>Attachments</FieldLabel>
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
          {duplicateFrom && (duplicateFrom.attachments?.length ?? 0) > 0 && (
            <p className="-mt-2 text-[11px] text-[#8A93A3]">Attachments are not copied when duplicating — add them again above if needed.</p>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border p-3" style={{ borderColor: HAIRLINE, background: '#FAFDFE' }}>
            <span className="text-[11.5px] font-medium" style={{ color: CYAN_INK }}>Publishing</span>

            {canSchedule && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel hint={initial ? '(stays hidden from students until then)' : undefined}>When should students see it?</FieldLabel>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center rounded-full border p-0.5 bg-[#F2FAFC]" style={{ borderColor: HAIRLINE }}>
                    {(['now', 'schedule'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWhen(w)}
                        className={`px-3 py-1 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer ${when === w ? 'bg-[#0891B2] text-white shadow-[0_2px_6px_rgba(8,145,178,0.25)]' : 'text-[#5B6371] hover:text-[#0E6A85]'}`}
                      >
                        {w === 'now' ? (initial ? 'Keep as draft' : 'Publish now') : 'Schedule for later'}
                      </button>
                    ))}
                  </div>
                  {when === 'schedule' && (
                    <input
                      type="datetime-local"
                      value={publishAtLocal}
                      min={isoToLocalInput(new Date().toISOString())}
                      onChange={(e) => setPublishAtLocal(e.target.value)}
                      className={`${TEXT_INPUT} !w-auto`}
                    />
                  )}
                </div>
                {when === 'schedule' && (
                  <p className="text-[11px] text-[#8A93A3]">Goes live automatically within 15 minutes of this time.</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <FieldLabel hint="(optional — moves to Expired automatically the day after)">Valid until</FieldLabel>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={expiresOn}
                  min={todayIST()}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className={`${TEXT_INPUT} !w-auto`}
                />
                {VALID_FOR.map((n) => (
                  <button key={n} type="button" onClick={() => setExpiresOn(addDaysIST(n))} className={BTN_GRAY}>+{n} days</button>
                ))}
                {expiresOn && (
                  <button type="button" onClick={() => setExpiresOn('')} className="text-[11.5px] text-[#5B6371] underline cursor-pointer">No expiry</button>
                )}
              </div>
            </div>

            {canSchedule && (
              <label className="inline-flex items-center gap-2 text-[12px] text-[#3F4654] cursor-pointer select-none">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 accent-[#0891B2] cursor-pointer" />
                Send a push notification to all students when it goes live
              </label>
            )}
          </div>

          {error && <p className="text-[12px] text-[#A5173A] font-medium">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t shrink-0 bg-[#FAFDFE]" style={{ borderColor: BAND }}>
          <button onClick={onClose} disabled={saving} className={BTN_GRAY}>Cancel</button>
          {!initial && (
            <button onClick={() => void handleSubmit(true)} disabled={saving || !valid} className={BTN_GRAY}>Save as Draft</button>
          )}
          <PillButton loading={saving} disabled={!valid} onClick={() => void handleSubmit(false)}>
            {initial ? 'Save Changes' : when === 'schedule' ? 'Schedule' : 'Publish Now'}
          </PillButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
