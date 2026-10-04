import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import {
  getPublishedVersion, getPendingRelease, savePendingRelease, publishVersionNow, saveReleaseNotes, sendAppUpdateReminder,
  type PublishedVersion, type PendingRelease, type UpdateReminderResult,
} from '../services/appVersionService';
import { Button } from '../components/common/Button';

const DEFAULT_UPDATE_URL = 'https://play.google.com/store/apps/details?id=com.smpstudents.portal';

/** Settings › Student App › App Version: what the student app treats as the
 *  latest release, and the pending release that goes live once the Play
 *  Store confirms it. */
export function AppVersionPanel() {
  const [publishedVersion, setPublishedVersion] = useState<PublishedVersion | null>(null);
  const [pendingRelease, setPendingRelease] = useState<PendingRelease | null>(null);
  const [avLoading, setAvLoading] = useState(false);
  const [avVersionCode, setAvVersionCode] = useState('');
  const [avVersionName, setAvVersionName] = useState('');
  const [avUpdateUrl, setAvUpdateUrl] = useState(DEFAULT_UPDATE_URL);
  const [avSaving, setAvSaving] = useState(false);
  const [avPublishing, setAvPublishing] = useState(false);
  const [avSaveMsg, setAvSaveMsg] = useState('');
  const [avSaveError, setAvSaveError] = useState('');

  // Load the published + pending versions once when the section opens
  useEffect(() => {
    setAvLoading(true);
    Promise.all([getPublishedVersion(), getPendingRelease()])
      .then(([published, pending]) => {
        setPublishedVersion(published);
        setPendingRelease(pending);
        if (pending) {
          setAvVersionCode(String(pending.versionCode));
          setAvVersionName(pending.versionName);
          setAvUpdateUrl(pending.updateUrl);
        }
      })
      .catch(() => {})
      .finally(() => setAvLoading(false));
  }, []);

  function parseAvForm(): PendingRelease | null {
    const versionCode = Number(avVersionCode.trim());
    const versionName = avVersionName.trim();
    const updateUrl = avUpdateUrl.trim() || DEFAULT_UPDATE_URL;
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      setAvSaveError('Version code must be a positive whole number.');
      return null;
    }
    if (!versionName) {
      setAvSaveError('Version name is required (e.g. 1.0.15).');
      return null;
    }
    return { versionCode, versionName, updateUrl, createdAt: '' };
  }

  async function handleSavePendingRelease(e: FormEvent) {
    e.preventDefault();
    setAvSaveMsg('');
    setAvSaveError('');
    const parsed = parseAvForm();
    if (!parsed) return;
    setAvSaving(true);
    try {
      await savePendingRelease({ versionCode: parsed.versionCode, versionName: parsed.versionName, updateUrl: parsed.updateUrl });
      setPendingRelease({ ...parsed, createdAt: new Date().toISOString() });
      setAvSaveMsg('Pending release saved. It will go live automatically once Play Store confirms this version code is live in production.');
    } catch (err: unknown) {
      setAvSaveError(err instanceof Error ? err.message : 'Failed to save pending release.');
    } finally {
      setAvSaving(false);
    }
  }

  async function handlePublishNow() {
    setAvSaveMsg('');
    setAvSaveError('');
    const parsed = parseAvForm();
    if (!parsed) return;
    setAvPublishing(true);
    try {
      await publishVersionNow({ latestVersion: parsed.versionName, updateUrl: parsed.updateUrl });
      setPublishedVersion((prev) => ({ ...prev, latestVersion: parsed.versionName, updateUrl: parsed.updateUrl }));
      setPendingRelease(null);
      setAvSaveMsg('Published immediately — skipped the Play Store check.');
    } catch (err: unknown) {
      setAvSaveError(err instanceof Error ? err.message : 'Failed to publish.');
    } finally {
      setAvPublishing(false);
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <h3 className="text-base font-medium text-gray-800 mb-1">Currently Published</h3>
        <p className="text-sm text-gray-500 mb-4">
          What the student app currently sees as the latest available version.
        </p>
        {avLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : publishedVersion ? (
          <div className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2 space-y-1">
            <div><span className="font-medium">Version:</span> {publishedVersion.latestVersion}</div>
            <div className="break-all"><span className="font-medium">Update URL:</span> {publishedVersion.updateUrl}</div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nothing published yet.</p>
        )}
        {!avLoading && pendingRelease && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mt-3">
            Waiting on Play Store: version code {pendingRelease.versionCode} ({pendingRelease.versionName}) will
            publish automatically once it's confirmed live in the production track.
          </div>
        )}
      </div>

      {!avLoading && publishedVersion && (
        <UpdateReminderCard
          published={publishedVersion}
          onChange={(patch) => setPublishedVersion((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <h3 className="text-base font-medium text-gray-800 mb-1">Register a New Release</h3>
        <p className="text-sm text-gray-500 mb-4">
          After uploading a build to Play Console, enter its version code and version name here.
          A scheduled Cloud Function checks the Play Store production track every few hours and
          publishes it to the student app automatically once it's live — no need to remember to flip it yourself.
        </p>
        <form onSubmit={(e) => { void handleSavePendingRelease(e); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version Code</label>
            <input
              type="number"
              min={1}
              value={avVersionCode}
              onChange={(e: ChangeEvent<HTMLInputElement>) => { setAvVersionCode(e.target.value); setAvSaveMsg(''); setAvSaveError(''); }}
              placeholder="e.g. 15"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version Name</label>
            <input
              type="text"
              value={avVersionName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => { setAvVersionName(e.target.value); setAvSaveMsg(''); setAvSaveError(''); }}
              placeholder="e.g. 1.0.15"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Update URL</label>
            <input
              type="text"
              value={avUpdateUrl}
              onChange={(e: ChangeEvent<HTMLInputElement>) => { setAvUpdateUrl(e.target.value); setAvSaveMsg(''); setAvSaveError(''); }}
              placeholder={DEFAULT_UPDATE_URL}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {avSaveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{avSaveError}</p>
          )}
          {avSaveMsg && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">{avSaveMsg}</p>
          )}
          <div className="flex gap-3">
            <Button type="submit" loading={avSaving}>
              Save Pending Release
            </Button>
            <Button type="button" variant="secondary" loading={avPublishing} onClick={() => { void handlePublishNow(); }}>
              Publish Now (skip check)
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT_CLASS = 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

/** "Remind Students to Update": the What's new list shown on the app's update
 *  card, and an any-time push (kind 'update') to devices still on an older
 *  version than the published one. Tapping it opens the app on the update card. */
function UpdateReminderCard({ published, onChange }: {
  published: PublishedVersion;
  onChange: (patch: Partial<PublishedVersion>) => void;
}) {
  const [notes, setNotes] = useState(published.releaseNotes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMsg, setNotesMsg] = useState('');
  const [title, setTitle] = useState(`📲 Update available — v${published.latestVersion}`);
  const [body, setBody] = useState('Tap to see what\'s new and update the SMP Students Portal.');
  const [reach, setReach] = useState<UpdateReminderResult | null>(null);
  const [counting, setCounting] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<UpdateReminderResult | null>(null);
  const [error, setError] = useState('');

  const count = useCallback(() => {
    setCounting(true);
    sendAppUpdateReminder({ title: '', body: '', dryRun: true })
      .then(setReach)
      .catch(() => setReach(null))
      .finally(() => setCounting(false));
  }, []);
  // Recount whenever the published version changes (Publish Now above).
  useEffect(() => { count(); }, [count, published.latestVersion]);

  const notesDirty = notes.trim() !== (published.releaseNotes ?? '').trim();

  async function handleSaveNotes() {
    setNotesSaving(true);
    setNotesMsg('');
    setError('');
    try {
      await saveReleaseNotes(notes.trim());
      onChange({ releaseNotes: notes.trim() });
      setNotesMsg('Saved — students see this on the update card.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the notes.');
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setError('');
    setSent(null);
    try {
      // Unsaved notes would not reach the card — save them first.
      if (notesDirty) {
        await saveReleaseNotes(notes.trim());
        onChange({ releaseNotes: notes.trim() });
      }
      const r = await sendAppUpdateReminder({ title: title.trim(), body: body.trim() });
      setSent(r);
      onChange({ lastUpdateReminderAt: new Date().toISOString(), updateReminderCount: (published.updateReminderCount ?? 0) + 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the reminder.');
    } finally {
      setSending(false);
    }
  }

  const recent = published.lastUpdateReminderAt && Date.now() - Date.parse(published.lastUpdateReminderAt) < 6 * 3600_000;
  const nobody = !counting && reach !== null && reach.devices === 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4" style={{ animation: 'page-enter 0.2s ease-out both' }}>
      <div>
        <h3 className="text-base font-medium text-gray-800 mb-1">Remind Students to Update</h3>
        <p className="text-sm text-gray-500">
          Sends a push notification to every phone still on a version older than <span className="font-medium text-gray-700">{published.latestVersion}</span>.
          Tapping it opens the app on an update card with your What's new list and an Update button to the Play Store.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">What's new in {published.latestVersion}</label>
        <textarea
          value={notes}
          rows={4}
          onChange={(e) => { setNotes(e.target.value); setNotesMsg(''); }}
          placeholder={'One item per line, e.g.\nCirculars can now be pinned in your preferred order\nFaster loading on slow networks'}
          className={`${INPUT_CLASS} resize-y`}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" variant="secondary" size="sm" loading={notesSaving} disabled={!notesDirty} onClick={() => { void handleSaveNotes(); }}>
            Save What's new
          </Button>
          {notesMsg && <span className="text-xs text-green-700">{notesMsg}</span>}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Notification</label>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={INPUT_CLASS} />
        <textarea value={body} maxLength={200} rows={2} onChange={(e) => setBody(e.target.value)} placeholder="Message" className={`${INPUT_CLASS} resize-y`} />
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 flex gap-2.5 items-start">
          <span className="w-7 h-7 shrink-0 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm" aria-hidden="true">⬇</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-snug break-words">{title || 'Notification title'}</p>
            {body && <p className="text-xs text-gray-500 leading-snug break-words">{body}</p>}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        {counting ? 'Counting outdated devices…'
          : reach === null ? 'Could not count devices.'
          : nobody ? `Every registered phone is already on ${published.latestVersion} or newer.`
          : <><span className="font-medium text-gray-800">{reach.students}</span> student{reach.students === 1 ? '' : 's'} ({reach.devices} device{reach.devices === 1 ? '' : 's'}) on an older version · {reach.upToDate} already up to date.</>}
        {!counting && reach !== null && (
          <button type="button" onClick={count} className="ml-2 text-xs text-blue-600 hover:underline cursor-pointer">Refresh</button>
        )}
      </p>
      <p className="text-xs text-gray-400">Phones on app versions before 1.0.38 don't report their version, so they're always counted as outdated.</p>

      {published.lastUpdateReminderAt && (
        <p className={`text-xs ${recent ? 'text-amber-700' : 'text-gray-500'}`}>
          Last reminder: {formatWhen(published.lastUpdateReminderAt)} · sent {published.updateReminderCount ?? 1}×
          {recent && ' — sending too often makes students ignore notifications.'}
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>}
      {sent && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
          Reminder sent to {sent.students} student{sent.students === 1 ? '' : 's'} ({sent.devices} device{sent.devices === 1 ? '' : 's'}).
        </p>
      )}

      <Button type="button" loading={sending} disabled={!title.trim() || counting || nobody} onClick={() => { void handleSend(); }}>
        {counting ? 'Send Reminder' : `Send to ${reach?.students ?? 0} student${reach?.students === 1 ? '' : 's'}`}
      </Button>
    </div>
  );
}
