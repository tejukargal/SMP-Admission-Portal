import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Circular, StoredAttachment } from '../../types';
import {
  subscribeToCirculars, createCircular, updateCircular, deleteCircular,
  publishCircular, unpublishCircular, pinCircular, unpinCircular,
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
  const [menu, setMenu] = useState<{ x: number; y: number; circular: Circular } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToCirculars((all) => {
      setCirculars(all);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function handleCreate(values: CircularFormValues, files: File[]) {
    await createCircular({ ...values, createdBy: user.uid }, files);
  }

  async function handleUpdate(
    values: CircularFormValues, newFiles: File[],
    kept: StoredAttachment[], removedPaths: string[],
  ) {
    if (!editing) return;
    await updateCircular(editing.id, values, kept, newFiles, removedPaths);
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

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-gray-500">
          Circulars are visible to <span className="font-semibold text-gray-700">all students</span> in the portal — department is a label/filter only.
        </p>
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
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {[...circulars].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map((c) => (
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
            {
              label: menu.circular.pinned ? 'Unpin' : 'Pin to Top',
              variant: 'accent',
              disabled: pinningId === menu.circular.id,
              onClick: () => void handleTogglePin(menu.circular),
            },
            {
              label: menu.circular.archivedAt ? 'Publish' : 'Unpublish',
              variant: 'accent',
              disabled: togglingId === menu.circular.id,
              onClick: () => void handleTogglePublish(menu.circular),
            },
            { label: 'Delete', variant: 'danger', onClick: () => setConfirmDelete(menu.circular) },
          ]}
        />
      )}

      {showForm && (
        <CircularForm
          onSubmit={async (values, files) => { await handleCreate(values, files); }}
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
      className={`relative overflow-hidden rounded-xl border shadow-sm p-2.5 border-l-[3px] select-none ${meta.borderL} ${c.pinned ? 'border-amber-300' : 'border-gray-100'} ${c.archivedAt ? 'bg-gray-100/80' : 'bg-white'}`}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
    >
      {c.archivedAt && <CardWatermark label="Unpublished" />}
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
