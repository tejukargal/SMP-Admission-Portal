import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import {
  TAB_HEADER_TABS, generateTabHeaderBackground, setTabHeaderBackground, getTabHeaderBackgrounds,
  type TabHeaderKey, type PendingTabHeaderBackground, type TabHeaderBackgrounds,
} from '../services/tabHeaderService';

/** One tab's row: shows the currently-saved image (if any), a pending
 *  AI-generated preview once "Generate" is clicked, and a Save/Regenerate
 *  flow — mirrors the circular background generator in CircularForm. */
function TabHeaderRow({
  tabKey, label, savedUrl, onSaved,
}: {
  tabKey: TabHeaderKey;
  label: string;
  savedUrl?: string;
  onSaved: (tabKey: TabHeaderKey, url: string) => void;
}) {
  const [pending, setPending] = useState<PendingTabHeaderBackground | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setError('');
    setGenerating(true);
    try {
      setPending(await generateTabHeaderBackground(tabKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate an image. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!pending) return;
    setError('');
    setSaving(true);
    try {
      const url = await setTabHeaderBackground(tabKey, pending);
      onSaved(tabKey, url);
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the image. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const previewSrc = pending ? `data:${pending.mimeType};base64,${pending.base64}` : savedUrl;

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="w-32 h-20 shrink-0 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
        {previewSrc ? (
          <img src={previewSrc} alt={`${label} header background`} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-gray-400">No image yet</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {error && <p className="text-xs text-red-500 font-medium mt-1">{error}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={generating}
          onClick={() => void handleGenerate()}
        >
          {savedUrl || pending ? 'Regenerate' : 'Generate'}
        </Button>
        {pending && (
          <Button type="button" size="sm" loading={saving} onClick={() => void handleSave()}>
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

/** Admin-only panel to generate and save the 6 AI header-background images
 *  the student portal shows behind its per-tab header (Home, Circulars,
 *  Profile, Fee History, Certificates, Notices) — replacing the old static
 *  hex-pattern watermark there. Fixed set, generated once and revisited only
 *  when the admin wants a different look. */
export function TabHeaderBackgroundsPanel() {
  const [saved, setSaved] = useState<TabHeaderBackgrounds>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTabHeaderBackgrounds()
      .then(setSaved)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(tabKey: TabHeaderKey, url: string) {
    setSaved((prev) => ({ ...prev, [tabKey]: url }));
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Tab Header Backgrounds</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            AI-generated illustration shown behind the student portal's header for each tab.
            Generate a preview, then Save to publish it — students see the update the next time they open the app.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500 px-6 py-5">Loading…</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {TAB_HEADER_TABS.map((t) => (
              <TabHeaderRow key={t.key} tabKey={t.key} label={t.label} savedUrl={saved[t.key]} onSaved={handleSaved} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
