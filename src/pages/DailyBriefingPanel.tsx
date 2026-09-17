import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import {
  getLatestDailyQuote, generateDailyQuotePreview, saveDailyQuote, previewStudentBriefing,
  type DailyQuoteRecord, type PendingDailyQuote, type StudentBriefingPreview,
} from '../services/dailyBriefingAdminService';

const TEXTAREA_CLASS =
  'block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors resize-y';

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Today's shared quote: shows what students currently see (the latest saved
 *  quote, which may be from an earlier day), then a Generate → edit → Save
 *  flow — mirrors TabHeaderBackgroundsPanel, with editable text fields since
 *  the quote itself is AI-written and the admin should be able to correct
 *  wording or attribution before publishing. */
function QuoteCard() {
  const [saved, setSaved] = useState<DailyQuoteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingDailyQuote | null>(null);
  const [generating, setGenerating] = useState<'all' | 'image' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getLatestDailyQuote()
      .then(setSaved)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setError('');
    setGenerating('all');
    try {
      setPending(await generateDailyQuotePreview());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a quote. Please try again.');
    } finally {
      setGenerating(null);
    }
  }

  // Keeps the (possibly edited) text and only asks for another picture.
  async function handleNewImage() {
    if (!pending) return;
    setError('');
    setGenerating('image');
    try {
      const fresh = await generateDailyQuotePreview(pending.scene);
      setPending({ ...pending, imageBase64: fresh.imageBase64, mimeType: fresh.mimeType });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate an image. Please try again.');
    } finally {
      setGenerating(null);
    }
  }

  async function handleSave() {
    if (!pending) return;
    if (!pending.quoteEn.trim() || !pending.quoteAuthor.trim()) {
      setError('Quote text and author are required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      setSaved(await saveDailyQuote({ ...pending, date: todayIST() }));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the quote. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function updatePending<K extends keyof PendingDailyQuote>(key: K, value: PendingDailyQuote[K]) {
    setPending((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const previewSrc = pending ? `data:${pending.mimeType};base64,${pending.imageBase64}` : saved?.backgroundImageUrl;
  const savedIsToday = saved?.date === todayIST();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Today's Quote</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          The shared quote of the day on every student's Daily Briefing screen. Generate a preview, edit the text if
          needed, then Save to publish it — students keep seeing the last saved quote until you save a new one.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 px-6 py-5">Loading…</p>
      ) : (
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2">
            {saved ? (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${savedIsToday ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {savedIsToday ? 'Saved for today' : `Last saved ${formatDate(saved.date)} — students still see this`}
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                No quote saved yet — students see a built-in default
              </span>
            )}
            {pending && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Unsaved preview</span>
            )}
          </div>

          <div className="w-full max-w-md aspect-video rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
            {previewSrc ? (
              <img src={previewSrc} alt="Quote background" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] text-gray-400">No image yet</span>
            )}
          </div>

          {pending ? (
            <div className="space-y-3 max-w-md">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Quote (English)</label>
                <textarea
                  className={TEXTAREA_CLASS}
                  rows={2}
                  value={pending.quoteEn}
                  onChange={(e) => updatePending('quoteEn', e.target.value)}
                />
              </div>
              <Input
                label="Author"
                value={pending.quoteAuthor}
                onChange={(e) => updatePending('quoteAuthor', e.target.value)}
                placeholder='e.g. A. P. J. Abdul Kalam, or "Daily Briefing" for an original line'
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Quote (Kannada)</label>
                <textarea
                  className={TEXTAREA_CLASS}
                  rows={2}
                  value={pending.quoteKn}
                  onChange={(e) => updatePending('quoteKn', e.target.value)}
                />
              </div>
              <Input label="Theme" value={pending.theme} onChange={(e) => updatePending('theme', e.target.value)} />
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-500">Image scene:</span> {pending.scene}
              </p>
            </div>
          ) : saved ? (
            <div className="max-w-md">
              <p className="text-sm text-gray-800 italic">“{saved.quoteEn}”</p>
              {saved.quoteKn && <p className="text-sm text-gray-600 mt-1">{saved.quoteKn}</p>}
              <p className="text-xs text-gray-500 mt-1">— {saved.quoteAuthor}{saved.theme ? ` · ${saved.theme}` : ''}</p>
            </div>
          ) : null}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={generating === 'all'}
              disabled={generating !== null || saving}
              onClick={() => void handleGenerate()}
            >
              {saved || pending ? 'Generate new quote' : 'Generate'}
            </Button>
            {pending && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={generating === 'image'}
                disabled={generating !== null || saving}
                onClick={() => void handleNewImage()}
              >
                New image only
              </Button>
            )}
            {pending && (
              <Button type="button" size="sm" loading={saving} disabled={generating !== null} onClick={() => void handleSave()}>
                Save for today
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Read-only tester: generates the personalized note + highlights for any
 *  reg number exactly as the student app would, without touching that
 *  student's cached briefing, and shows the data block the AI was given so
 *  each highlight can be checked against its source. */
function StudentPreviewCard() {
  const [regNumber, setRegNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<StudentBriefingPreview | null>(null);
  const [showData, setShowData] = useState(false);

  async function handlePreview() {
    const reg = regNumber.trim();
    if (!reg) {
      setError('Enter a registration number.');
      return;
    }
    setError('');
    setLoading(true);
    setShowData(false);
    try {
      setPreview(await previewStudentBriefing(reg));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a preview. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Preview a Student's Briefing</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          See the personalized note and highlights a student would get today, generated from their live fees, results,
          notices, circulars and certificates. Read-only — it does not change what the student sees.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        <form
          className="flex items-end gap-2 max-w-md"
          onSubmit={(e) => { e.preventDefault(); void handlePreview(); }}
        >
          <div className="flex-1">
            <Input
              label="Registration number"
              value={regNumber}
              uppercase
              onChange={(e) => setRegNumber(e.target.value)}
              placeholder="e.g. 123CS22001"
            />
          </div>
          <Button type="submit" size="sm" loading={loading} className="mb-0.5">
            Preview
          </Button>
        </form>

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        {preview && (
          <div className="space-y-4 max-w-2xl">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-gray-800">{preview.greeting}</p>
              <p className="text-sm text-gray-700">{preview.messageEn}</p>
              <p className="text-sm text-gray-600">{preview.messageKn}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Highlights ({preview.points.length})</p>
              <ul className="space-y-1.5">
                {preview.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-emerald-600 shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <button
                type="button"
                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                onClick={() => setShowData((v) => !v)}
              >
                {showData ? '▾ Hide' : '▸ Show'} data given to the AI
              </button>
              {showData && (
                <pre className="mt-2 text-[11px] leading-relaxed text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 whitespace-pre-wrap overflow-auto max-h-96">
                  {preview.dataBlock}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Admin-only panel that replaces the old scheduled quote generation:
 *  today's shared quote is generated and published from here, and any
 *  student's personalized briefing can be previewed to check accuracy. */
export function DailyBriefingPanel() {
  return (
    <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="max-w-2xl space-y-4">
        <QuoteCard />
        <StudentPreviewCard />
      </div>
    </div>
  );
}
