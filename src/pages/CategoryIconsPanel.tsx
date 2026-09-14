import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import {
  CATEGORY_ICON_TABS, generateCategoryIcon, setCategoryIcon, getCategoryIcons,
  type CategoryIconKey, type PendingCategoryIcon, type CategoryIcons,
} from '../services/categoryIconService';

/** One category's row: shows the currently-saved icon (if any), a pending
 *  AI-generated preview once "Generate" is clicked, and a Save/Regenerate
 *  flow — mirrors TabHeaderBackgroundsPanel's row. */
function CategoryIconRow({
  iconKey, label, savedUrl, onSaved,
}: {
  iconKey: CategoryIconKey;
  label: string;
  savedUrl?: string;
  onSaved: (iconKey: CategoryIconKey, url: string) => void;
}) {
  const [pending, setPending] = useState<PendingCategoryIcon | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setError('');
    setGenerating(true);
    try {
      setPending(await generateCategoryIcon(iconKey));
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
      const url = await setCategoryIcon(iconKey, pending);
      onSaved(iconKey, url);
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the image. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const previewSrc = pending ? `data:${pending.mimeType};base64,${pending.base64}` : savedUrl;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white flex flex-col">
      {/* Full, uncropped preview (object-contain, not object-cover) — the actual
          tile on the student app crops this to fit via object-cover, but the admin
          needs to see the complete generated image to judge composition/color
          before deciding to save. */}
      <div className="h-72 shrink-0 bg-gray-50 border-b border-gray-100 overflow-hidden flex items-center justify-center">
        {previewSrc ? (
          <img src={previewSrc} alt={`${label} card background`} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-xs text-gray-400 text-center px-4">No image yet</span>
        )}
      </div>
      <div className="p-4 flex items-center gap-3">
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
    </div>
  );
}

/** Admin-only panel to generate and save the 4 AI category-icon images the
 *  student portal shows on its Home tab's Overview tiles and Recent Activity
 *  rows (Circulars, Notices, Fees, Certificates) — replacing the plain glyph
 *  icons there. Fixed set, generated once and revisited only when the admin
 *  wants a different look. */
export function CategoryIconsPanel() {
  const [saved, setSaved] = useState<CategoryIcons>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategoryIcons()
      .then(setSaved)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(iconKey: CategoryIconKey, url: string) {
    setSaved((prev) => ({ ...prev, [iconKey]: url }));
  }

  return (
    <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="max-w-4xl">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Category Icons</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              AI-generated illustrated background shown full-bleed on the student portal Home tab's
              Overview tile for each category, replacing the plain icon and flat color entirely.
              Generate a preview, then Save to publish it — students see the update the next time they
              open the app.
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-gray-500 px-6 py-5">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
              {CATEGORY_ICON_TABS.map((t) => (
                <CategoryIconRow key={t.key} iconKey={t.key} label={t.label} savedUrl={saved[t.key]} onSaved={handleSaved} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
