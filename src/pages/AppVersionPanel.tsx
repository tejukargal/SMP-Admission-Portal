import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { getPublishedVersion, getPendingRelease, savePendingRelease, publishVersionNow, type PublishedVersion, type PendingRelease } from '../services/appVersionService';
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
      setPublishedVersion({ latestVersion: parsed.versionName, updateUrl: parsed.updateUrl });
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
