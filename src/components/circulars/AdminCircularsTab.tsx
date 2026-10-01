import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Circular, StoredAttachment } from '../../types';
import {
  subscribeToCirculars, createCircular, updateCircular, deleteCircular,
  publishCircular, unpublishCircular, pinCircular, unpinCircular, expireCircular, restoreCircular,
  generateCircularBackground, setCircularBackground, type PendingBackground,
} from '../../services/circularService';
import { departmentMeta } from '../../utils/departments';
import { stripHtml, formatCircularDate } from '../../utils/htmlContent';
import {
  HAIRLINE, BAND, CYAN_INK, MINT, CORAL, AMBER, MUTED, MsgIcon,
  PillButton, StatusPill, Segmented, KebabButton, EmptyState, MsgModal,
} from '../messages/messagesUi';
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
    <div className="flex-1 min-h-0 flex flex-col gap-2.5" style={{ animation: 'page-enter 0.2s ease-out' }}>
      <div className="shrink-0 rounded-2xl border bg-white px-2.5 py-2 flex flex-col sm:flex-row sm:items-center gap-2" style={{ borderColor: HAIRLINE }}>
        <Segmented<'active' | 'expired'>
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: 'Active', count: activeCount },
            { value: 'expired', label: 'Expired', count: expiredCount },
          ]}
        />
        <p className="flex-1 min-w-0 text-[12px] text-[#5B6371] sm:px-1">
          Circulars are visible to{' '}
          <span className="rounded-full px-2 py-[1px] font-medium" style={{ background: BAND, color: CYAN_INK }}>all students</span>
          {' '}in the portal — department is a label/filter only.
        </p>
        <PillButton onClick={() => setShowForm(true)} className="self-start sm:self-auto !px-4 !py-2">
          <MsgIcon name="plus" size={13} />
          New Circular
        </PillButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <EmptyState loading>Loading…</EmptyState>
        ) : circulars.length === 0 ? (
          <EmptyState>No circulars posted yet. Click "New Circular" to publish the first one.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState>
            {view === 'expired' ? 'No expired circulars. Use "Mark as Expired" on a circular to move it here.' : 'No active circulars — everything is under Expired.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-1">
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
        <MsgModal
          title="Delete Circular"
          icon={<MsgIcon name="trash" size={15} />}
          tone={CORAL}
          size="sm"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <PillButton tone="gray" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</PillButton>
            <PillButton tone="danger" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, Delete'}
            </PillButton>
          </>}
        >
            <p className="text-[13px] text-[#3F4654]">
              Delete <span className="font-semibold text-[#A5173A]">"{confirmDelete.title}"</span>
              {(confirmDelete.attachments?.length ?? 0) > 0 && ` and its ${confirmDelete.attachments.length} attachment${confirmDelete.attachments.length !== 1 ? 's' : ''}`}? This cannot be undone.
            </p>
        </MsgModal>
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
  const initials = c.department.slice(0, 2).toUpperCase();

  const muted = !!(c.archivedAt || c.expiredAt);
  return (
    <div
      className={`relative flex gap-2.5 overflow-hidden rounded-2xl border p-2 select-none transition-shadow hover:shadow-[0_6px_20px_rgba(14,106,133,0.08)] ${c.archivedAt ? 'bg-[#F4F6F8]' : c.expiredAt ? 'bg-[#F8FAFB]' : 'bg-white'}`}
      style={{
        borderColor: c.pinned ? `${AMBER}66` : HAIRLINE,
        boxShadow: c.pinned ? `0 0 0 2px ${AMBER}1A` : undefined,
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
    >
      {/* Background — 30% column, shown full (not masked) */}
      <div className={`w-[30%] shrink-0 relative rounded-xl overflow-hidden bg-gray-100 ${muted ? 'opacity-70 grayscale-[35%]' : ''}`}>
        {c.backgroundImageUrl ? (
          <img src={c.backgroundImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center ${meta.cardBg}`}>
            <span className={`text-base font-semibold ${meta.text} opacity-50`}>{initials}</span>
          </div>
        )}
      </div>

      {/* Message preview — 70% column */}
      <div className="flex-1 min-w-0 relative py-0.5">
        {c.archivedAt ? <CardWatermark label="Unpublished" /> : c.expiredAt ? <CardWatermark label="Expired" /> : null}
        <KebabButton onOpen={onContextMenu} className="absolute -top-0.5 -right-0.5" />
        <div className="relative z-10 pr-6">
          <span className="flex items-center gap-1 flex-wrap min-w-0">
            <span className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium ${meta.pill}`}>{c.department}</span>
            <StatusPill color={c.archivedAt ? MUTED : MINT}>{c.archivedAt ? 'Unpublished' : 'Published'}</StatusPill>
            {c.expiredAt && <StatusPill color={MUTED}>Expired</StatusPill>}
            {c.pinned && (
              <StatusPill color={AMBER} dot={false}>
                <MsgIcon name="pin" />
                Pinned
              </StatusPill>
            )}
            {(c.attachments?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[10px]" style={{ background: BAND, color: CYAN_INK }}>
                <MsgIcon name="clip" size={11} />
                {c.attachments.length}
              </span>
            )}
          </span>
          <h4 className="text-[13px] font-medium text-[#262B35] mt-1.5 leading-snug line-clamp-1">{c.title}</h4>
          <p className={`text-[10.5px] font-medium ${meta.text} mt-0.5 line-clamp-1`}>
            {c.subject} <span className="text-[#8A93A3] font-normal">· {formatCircularDate(c.date)}</span>
          </p>
          {preview3 && <p className="text-[11.5px] text-[#5B6371] mt-0.5 line-clamp-2 leading-snug">{preview3}</p>}
        </div>
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

  return (
    <MsgModal
      portal
      title={`AI Background — ${circular.title}`}
      icon={<MsgIcon name="image" size={15} />}
      size="md"
      onClose={onClose}
      footer={<>
        <PillButton tone="gray" onClick={onClose} disabled={saving}>
          Cancel
        </PillButton>
        <PillButton
          tone="cyan"
          onClick={() => void generate()}
          disabled={generating || saving}
        >
          <MsgIcon name="sparkle" size={12} />
          {generating ? 'Generating…' : 'Regenerate'}
        </PillButton>
        <PillButton loading={saving} disabled={!pending || generating} onClick={() => void handleAccept()}>
          Use this Background
        </PillButton>
      </>}
    >
        <div className="w-full aspect-video rounded-xl border flex items-center justify-center overflow-hidden" style={{ borderColor: HAIRLINE, background: '#F2FAFC' }}>
          {generating ? (
            <span className="flex flex-col items-center gap-2 text-[12px] text-[#8A93A3]">
              <span className="w-5 h-5 rounded-full border-2 border-[#CBE8F0] border-t-[#0891B2] animate-spin" />
              Generating…
            </span>
          ) : pending ? (
            <img
              src={`data:${pending.mimeType};base64,${pending.base64}`}
              alt="Generated background preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[12px] text-[#8A93A3]">No preview yet.</span>
          )}
        </div>

        {error && <p className="text-[12px] text-[#A5173A] font-medium">{error}</p>}
    </MsgModal>
  );
}
