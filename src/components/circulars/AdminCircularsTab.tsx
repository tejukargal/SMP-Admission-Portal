import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import type { Circular, StoredAttachment } from '../../types';
import {
  subscribeToCirculars, createCircular, updateCircular, deleteCircular,
  publishCircular, unpublishCircular, pinCircular, unpinCircular, expireCircular, restoreCircular,
  generateCircularBackground, setCircularBackground, type PendingBackground,
} from '../../services/circularService';
import { departmentMeta } from '../../utils/departments';
import { stripHtml, formatCircularDate } from '../../utils/htmlContent';
import { Button } from '../common/Button';
import { CardContextMenu } from '../common/CardContextMenu';
import { CardWatermark } from '../common/CardWatermark';
import { CircularForm, type CircularFormValues } from './CircularForm';
import { CircularModal } from './CircularModal';

interface AdminCircularsTabProps {
  user: User;
}

/** Admin circular management — list, compose, edit, publish/unpublish, delete,
 *  preview (exact student view). Rendered as the "Circulars" tab of the
 *  Student Messages page. */
export function AdminCircularsTab({ user }: AdminCircularsTabProps) {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Circular | null>(null);
  const [preview, setPreview] = useState<Circular | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Circular | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [expiringId, setExpiringId] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'expired'>('active');
  const [menu, setMenu] = useState<{ x: number; y: number; circular: Circular } | null>(null);
  const [bgTarget, setBgTarget] = useState<Circular | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToCirculars((all) => {
      setCirculars(all);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function handleCreate(values: CircularFormValues, files: File[], pendingBackground?: PendingBackground) {
    await createCircular({ ...values, createdBy: user.uid }, files, pendingBackground);
  }

  async function handleUpdate(
    values: CircularFormValues, newFiles: File[],
    kept: StoredAttachment[], removedPaths: string[],
    pendingBackground?: PendingBackground,
  ) {
    if (!editing) return;
    await updateCircular(editing.id, values, kept, newFiles, removedPaths, pendingBackground);
  }

  async function handleTogglePublish(c: Circular) {
    setTogglingId(c.id);
    try {
      if (c.archivedAt) await publishCircular(c.id);
      else await unpublishCircular(c.id);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTogglePin(c: Circular) {
    setPinningId(c.id);
    try {
      if (c.pinned) await unpinCircular(c.id);
      else await pinCircular(c.id);
    } finally {
      setPinningId(null);
    }
  }

  async function handleToggleExpired(c: Circular) {
    setExpiringId(c.id);
    try {
      if (c.expiredAt) await restoreCircular(c.id);
      else await expireCircular(c.id);
    } finally {
      setExpiringId(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteCircular(confirmDelete);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const activeCount = circulars.filter((c) => !c.expiredAt).length;
  const expiredCount = circulars.length - activeCount;
  const shown = [...circulars]
    .filter((c) => (view === 'expired' ? !!c.expiredAt : !c.expiredAt))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-500">
            Circulars are visible to <span className="font-semibold text-gray-700">all students</span> in the portal — department is a label/filter only.
          </p>
          <div className="flex items-center gap-1">
            {([['active', 'Active', activeCount], ['expired', 'Expired', expiredCount]] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${view === key ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
                <span className={`rounded-full text-[10px] px-1.5 ${view === key ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="self-start sm:self-auto">
          <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Circular
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-10">Loading…</div>
        ) : circulars.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-10">No circulars posted yet. Click "New Circular" to publish the first one.</div>
        ) : shown.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-10">
            {view === 'expired' ? 'No expired circulars. Use "Mark as Expired" on a circular to move it here.' : 'No active circulars — everything is under Expired.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {shown.map((c) => (
              <AdminCircularCard
                key={c.id}
                circular={c}
                onContextMenu={(x, y) => setMenu({ x, y, circular: c })}
              />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <CardContextMenu
          x={menu.x}
          y={menu.y}
          header={{ title: menu.circular.title, subtitle: menu.circular.department }}
          onClose={() => setMenu(null)}
          actions={[
            { label: 'Preview', onClick: () => setPreview(menu.circular) },
            { label: 'Edit', onClick: () => setEditing(menu.circular) },
            // Pinning an expired circular makes no sense (expiring also unpins).
            ...(menu.circular.expiredAt ? [] : [{
              label: menu.circular.pinned ? 'Unpin' : 'Pin to Top',
              variant: 'accent' as const,
              disabled: pinningId === menu.circular.id,
              onClick: () => void handleTogglePin(menu.circular),
            }]),
            {
              label: menu.circular.archivedAt ? 'Publish' : 'Unpublish',
              variant: 'accent',
              disabled: togglingId === menu.circular.id,
              onClick: () => void handleTogglePublish(menu.circular),
            },
            {
              label: menu.circular.expiredAt ? 'Restore to Active' : 'Mark as Expired',
              variant: 'accent',
              disabled: expiringId === menu.circular.id,
              onClick: () => void handleToggleExpired(menu.circular),
            },
            {
              label: menu.circular.backgroundImageUrl ? 'Regenerate Background' : 'Generate Background',
              variant: 'accent',
              onClick: () => setBgTarget(menu.circular),
            },
            { label: 'Delete', variant: 'danger', onClick: () => setConfirmDelete(menu.circular) },
          ]}
        />
      )}

      {showForm && (
        <CircularForm
          onSubmit={async (values, files, _kept, _removedPaths, pendingBackground) => {
            await handleCreate(values, files, pendingBackground);
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {editing && (
        <CircularForm
          initial={editing}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}

      {preview && <CircularModal circular={preview} onClose={() => setPreview(null)} />}

      {bgTarget && (
        <BackgroundGenerateModal circular={bgTarget} onClose={() => setBgTarget(null)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} aria-hidden="true" />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Delete Circular</h3>
            <p className="text-sm text-gray-600">
              Delete <span className="font-semibold text-red-600">"{confirmDelete.title}"</span>
              {(confirmDelete.attachments?.length ?? 0) > 0 && ` and its ${confirmDelete.attachments.length} attachment${confirmDelete.attachments.length !== 1 ? 's' : ''}`}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50">Cancel</button>
              <button onClick={() => void handleDelete()} disabled={deleting} className="px-3 py-1.5 text-xs rounded bg-red-500 text-white font-semibold hover:bg-red-600 cursor-pointer disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AdminCircularCardProps {
  circular: Circular;
  onContextMenu: (x: number, y: number) => void;
}

function AdminCircularCard({ circular: c, onContextMenu }: AdminCircularCardProps) {
  const meta = departmentMeta(c.department);
  const preview3 = stripHtml(c.body);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border shadow-sm p-2.5 border-l-[3px] select-none ${meta.borderL} ${c.pinned ? 'border-amber-300' : 'border-gray-100'} ${c.archivedAt ? 'bg-gray-100/80' : c.expiredAt ? 'bg-gray-50' : 'bg-white'}`}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
    >
      {c.backgroundImageUrl && (
        <>
          <img src={c.backgroundImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-white/80" />
        </>
      )}
      {c.archivedAt ? <CardWatermark label="Unpublished" /> : c.expiredAt ? <CardWatermark label="Expired" /> : null}
      <button
        type="button"
        aria-label="Options"
        className="absolute top-2 right-2 z-10 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onContextMenu(rect.right, rect.bottom + 4);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      <div className="relative z-10">
        <span className="flex items-center gap-1 flex-wrap min-w-0">
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${meta.pill}`}>{c.department}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${c.archivedAt ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'}`}>
            {c.archivedAt ? 'Unpublished' : 'Published'}
          </span>
          {c.expiredAt && (
            <span className="rounded-full bg-gray-200 text-gray-600 px-1.5 py-0.5 text-[9px] font-bold">Expired</span>
          )}
          {c.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3c-.6 0-1 .4-1 1v6.2l-2.5 2.5V6a1 1 0 0 0-2 0v6.7L8 15.2V17h8v-1.8l-2.5-2.5V6.9L16 4.7V13a1 1 0 0 0 2 0V4c0-.6-.4-1-1-1z"/><path d="M11 17v4a1 1 0 0 0 2 0v-4z"/></svg>
              Pinned
            </span>
          )}
          {(c.attachments?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              {c.attachments.length}
            </span>
          )}
        </span>
        <p className="text-[10px] text-gray-400 mt-1">
          {formatCircularDate(c.date)} · posted {new Date(c.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {c.updatedAt && ' · edited'}
        </p>
        <h4 className="text-sm font-bold text-gray-900 mt-1 line-clamp-1">{c.title}</h4>
        <p className={`text-xs font-semibold ${meta.text} mt-0.5 line-clamp-1`}>{c.subject}</p>
        {preview3 && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{preview3}</p>}
      </div>
    </div>
  );
}

interface BackgroundGenerateModalProps {
  circular: Circular;
  onClose: () => void;
}

/** Generate/Regenerate Background action from the admin list's context menu —
 *  generates immediately on open, previews the result, and only writes to
 *  Storage/Firestore (via setCircularBackground) once the admin accepts it. */
function BackgroundGenerateModal({ circular, onClose }: BackgroundGenerateModalProps) {
  const [generating, setGenerating] = useState(true);
  const [pending, setPending] = useState<PendingBackground | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const result = await generateCircularBackground({
        title: circular.title,
        subject: circular.subject,
        department: circular.department,
        bodySnippet: stripHtml(circular.body).trim().slice(0, 400),
      });
      setPending(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a background. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void generate(); }, []);

  async function handleAccept() {
    if (!pending) return;
    setSaving(true);
    try {
      await setCircularBackground(circular.id, pending);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the background. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">AI Background — {circular.title}</h3>

        <div className="w-full aspect-video rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
          {generating ? (
            <span className="text-xs text-gray-400">Generating…</span>
          ) : pending ? (
            <img
              src={`data:${pending.mimeType};base64,${pending.base64}`}
              alt="Generated background preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-gray-400">No preview yet.</span>
          )}
        </div>

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => void generate()}
            disabled={generating || saving}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Regenerate'}
          </button>
          <Button size="sm" loading={saving} disabled={!pending || generating} onClick={() => void handleAccept()}>
            Use this Background
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
