import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import {
  getLatestDailyQuote, generateDailyQuotePreview, saveDailyQuote, previewStudentBriefing,
  getScholarshipSources, saveScholarshipSources, getPublishedScholarshipUpdates, fetchScholarshipUpdates, publishScholarshipUpdates,
  DEFAULT_SCHOLARSHIP_SOURCES,
  type DailyQuoteRecord, type PendingDailyQuote, type StudentBriefingPreview,
  type ScholarshipScheme, type ScholarshipStatus, type ScholarshipNewsItem, type PendingScholarshipUpdates, type ScholarshipUpdatesRecord,
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

const STATUS_LABEL: Record<ScholarshipStatus, string> = {
  open: 'Open',
  'closing-soon': 'Closing soon',
  closed: 'Closed',
  upcoming: 'Upcoming',
  unknown: 'Unknown',
};

const STATUS_CLASS: Record<ScholarshipStatus, string> = {
  open: 'bg-emerald-50 text-emerald-700',
  'closing-soon': 'bg-amber-50 text-amber-700',
  closed: 'bg-gray-100 text-gray-500',
  upcoming: 'bg-blue-50 text-blue-700',
  unknown: 'bg-gray-100 text-gray-600',
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** One scheme's editable block inside the pending (unpublished) summary. */
function SchemeEditor({
  scheme, index, onChange, onRemove,
}: {
  scheme: ScholarshipScheme;
  index: number;
  onChange: (next: ScholarshipScheme) => void;
  onRemove: () => void;
}) {
  function set<K extends keyof ScholarshipScheme>(key: K, value: ScholarshipScheme[K]) {
    onChange({ ...scheme, [key]: value });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Scheme {index + 1}</p>
        <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={onRemove}>
          Remove
        </button>
      </div>
      <Input label="Scheme name" value={scheme.name} onChange={(e) => set('name', e.target.value)} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input label="Portal" value={scheme.portal} onChange={(e) => set('portal', e.target.value)} placeholder="SSP / NSP" />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</label>
          <select
            className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
            value={scheme.status}
            onChange={(e) => set('status', e.target.value as ScholarshipStatus)}
          >
            {(Object.keys(STATUS_LABEL) as ScholarshipStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <Input
          label="Closing date (firm)"
          type="date"
          value={scheme.applyBy ?? ''}
          onChange={(e) => set('applyBy', e.target.value || null)}
        />
      </div>
      <p className="text-[11px] text-gray-400 -mt-1">
        A firm closing date drives the status automatically on publish and puts a reminder in every student's briefing
        from 14 days before it. Leave it empty when no date has been announced.
      </p>
      <Input label="Closing date (in words)" value={scheme.applyByText} onChange={(e) => set('applyByText', e.target.value)} />
      <Input label="Apply / details link" value={scheme.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Who can apply</label>
        <textarea className={TEXTAREA_CLASS} rows={2} value={scheme.eligibility} onChange={(e) => set('eligibility', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Documents needed (one per line)</label>
        <textarea
          className={TEXTAREA_CLASS}
          rows={Math.min(8, Math.max(3, scheme.documents.length + 1))}
          value={scheme.documents.join('\n')}
          onChange={(e) => set('documents', e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">How to apply</label>
        <textarea className={TEXTAREA_CLASS} rows={2} value={scheme.howToApply} onChange={(e) => set('howToApply', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</label>
        <textarea className={TEXTAREA_CLASS} rows={2} value={scheme.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Kannada summary</label>
        <textarea className={TEXTAREA_CLASS} rows={2} value={scheme.summaryKn} onChange={(e) => set('summaryKn', e.target.value)} />
      </div>
      {scheme.sources.length > 0 && (
        <p className="text-[11px] text-gray-500 break-all">
          <span className="font-semibold">Sources:</span>{' '}
          {scheme.sources.map((u, i) => (
            <span key={u}>
              {i > 0 && ' · '}
              <a href={u} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{u}</a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

const EMPTY_NEWS_ITEM: ScholarshipNewsItem = { date: null, dateText: '', title: '', titleKn: '', portal: '', url: '' };

/** One announcement's editable row inside the pending summary. */
function NewsEditor({
  item, index, onChange, onRemove,
}: {
  item: ScholarshipNewsItem;
  index: number;
  onChange: (next: ScholarshipNewsItem) => void;
  onRemove: () => void;
}) {
  function set<K extends keyof ScholarshipNewsItem>(key: K, value: ScholarshipNewsItem[K]) {
    onChange({ ...item, [key]: value });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">News {index + 1}</p>
        <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={onRemove}>
          Remove
        </button>
      </div>
      <Input label="Announcement (English)" value={item.title} onChange={(e) => set('title', e.target.value)} />
      <Input label="Announcement (Kannada)" value={item.titleKn} onChange={(e) => set('titleKn', e.target.value)} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input label="Date" type="date" value={item.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
        <Input label="Date (in words)" value={item.dateText} onChange={(e) => set('dateText', e.target.value)} placeholder="28 September 2026" />
        <Input label="Portal" value={item.portal} onChange={(e) => set('portal', e.target.value)} placeholder="SSP / NSP" />
      </div>
      <Input label="Link" value={item.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
    </div>
  );
}

/** Read-only rendering of the published announcements. */
function NewsView({ items }: { items: ScholarshipNewsItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3 space-y-2">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Latest news</p>
      <ul className="space-y-1.5">
        {items.map((n, i) => (
          <li key={i} className="text-sm text-gray-700">
            <span className="font-semibold text-gray-800">{n.dateText}</span>
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 ml-2">{n.portal}</span>
            <span className="block">{n.title}</span>
            {n.titleKn && <span className="block text-gray-600">{n.titleKn}</span>}
            {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-all">{n.url}</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Read-only rendering of one scheme, used for the currently published set. */
function SchemeView({ scheme }: { scheme: ScholarshipScheme }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-gray-800">{scheme.name}</p>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{scheme.portal}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[scheme.status]}`}>{STATUS_LABEL[scheme.status]}</span>
      </div>
      <p className="text-sm text-gray-700"><span className="font-semibold">Apply by:</span> {scheme.applyByText}</p>
      {scheme.eligibility && <p className="text-sm text-gray-700"><span className="font-semibold">Who can apply:</span> {scheme.eligibility}</p>}
      {scheme.documents.length > 0 && (
        <div className="text-sm text-gray-700">
          <span className="font-semibold">Documents:</span>
          <ul className="list-disc pl-5">
            {scheme.documents.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
      {scheme.howToApply && <p className="text-sm text-gray-700"><span className="font-semibold">How to apply:</span> {scheme.howToApply}</p>}
      {scheme.notes && <p className="text-sm text-gray-700"><span className="font-semibold">Notes:</span> {scheme.notes}</p>}
      {scheme.summaryKn && <p className="text-sm text-gray-600">{scheme.summaryKn}</p>}
      {scheme.url && (
        <a href={scheme.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-all">{scheme.url}</a>
      )}
    </div>
  );
}

/** Scholarship summary for the Daily Briefing: the admin keeps a list of
 *  source portals, asks Gemini (with web access) for a structured summary of
 *  closing dates / eligibility / documents, edits it, and publishes it.
 *  Students see the published summary inside their briefing and get a
 *  reminder point when a closing date is within two weeks. Never refreshed
 *  automatically — same rule as the quote. */
function ScholarshipsCard() {
  const [sources, setSources] = useState<string[]>(DEFAULT_SCHOLARSHIP_SOURCES);
  const [sourcesDirty, setSourcesDirty] = useState(false);
  const [savingSources, setSavingSources] = useState(false);
  const [published, setPublished] = useState<ScholarshipUpdatesRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingScholarshipUpdates | null>(null);
  const [fetching, setFetching] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [showPublished, setShowPublished] = useState(false);

  useEffect(() => {
    Promise.all([getScholarshipSources(), getPublishedScholarshipUpdates()])
      .then(([urls, current]) => {
        setSources(urls);
        setPublished(current);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateSource(index: number, value: string) {
    setSources((prev) => prev.map((u, i) => (i === index ? value : u)));
    setSourcesDirty(true);
  }

  function removeSource(index: number) {
    setSources((prev) => prev.filter((_, i) => i !== index));
    setSourcesDirty(true);
  }

  function addSource() {
    setSources((prev) => [...prev, '']);
    setSourcesDirty(true);
  }

  function cleanSources(): string[] {
    return sources.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  }

  async function handleSaveSources() {
    const urls = cleanSources();
    if (urls.length === 0) {
      setError('Add at least one source URL starting with http:// or https://.');
      return;
    }
    setError('');
    setSavingSources(true);
    try {
      await saveScholarshipSources(urls);
      setSources(urls);
      setSourcesDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the sources.');
    } finally {
      setSavingSources(false);
    }
  }

  async function handleFetch() {
    const urls = cleanSources();
    if (urls.length === 0) {
      setError('Add at least one source URL starting with http:// or https://.');
      return;
    }
    setError('');
    setFetching(true);
    try {
      setPending(await fetchScholarshipUpdates(urls));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch the scholarship summary. Please try again.');
    } finally {
      setFetching(false);
    }
  }

  async function handlePublish() {
    if (!pending) return;
    if (pending.schemes.length === 0 || pending.schemes.some((s) => !s.name.trim())) {
      setError('Every scheme needs a name, and at least one scheme is required.');
      return;
    }
    setError('');
    setPublishing(true);
    try {
      setPublished(await publishScholarshipUpdates({ ...pending, news: pending.news.filter((n) => n.title.trim()) }));
      setPending(null);
      setShowPublished(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish. Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  function updatePending<K extends keyof PendingScholarshipUpdates>(key: K, value: PendingScholarshipUpdates[K]) {
    setPending((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateScheme(index: number, next: ScholarshipScheme) {
    setPending((prev) => (prev ? { ...prev, schemes: prev.schemes.map((s, i) => (i === index ? next : s)) } : prev));
  }

  function removeScheme(index: number) {
    setPending((prev) => (prev ? { ...prev, schemes: prev.schemes.filter((_, i) => i !== index) } : prev));
  }

  function updateNews(index: number, next: ScholarshipNewsItem) {
    setPending((prev) => (prev ? { ...prev, news: prev.news.map((n, i) => (i === index ? next : n)) } : prev));
  }

  function removeNews(index: number) {
    setPending((prev) => (prev ? { ...prev, news: prev.news.filter((_, i) => i !== index) } : prev));
  }

  function addNews() {
    setPending((prev) => (prev ? { ...prev, news: [...prev.news, { ...EMPTY_NEWS_ITEM }] } : prev));
  }

  const publishedAge = published ? daysAgo(published.publishedAt) : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Scholarship Updates</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          A summary of scholarship closing dates, eligibility and documents, read by the AI from the portals below and
          shown on every student's Daily Briefing. Fetch the latest, check and edit it, then Publish — it stays until you
          publish again, so refresh it whenever a portal announces new dates.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 px-6 py-5">Loading…</p>
      ) : (
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            {published ? (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(publishedAge ?? 0) > 21 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                Published {formatDateTime(published.publishedAt)}
                {publishedAge !== null && publishedAge > 0 ? ` (${publishedAge} day${publishedAge === 1 ? '' : 's'} ago)` : ' (today)'}
                {' · '}{published.schemes.length} scheme{published.schemes.length === 1 ? '' : 's'}
                {' · '}{(published.news ?? []).length} news
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                Not published yet — students see no scholarship section
              </span>
            )}
            {pending && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Unpublished summary</span>
            )}
          </div>

          {/* Sources */}
          <div className="space-y-2 max-w-xl">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Source websites</p>
            {sources.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="url"
                  value={u}
                  onChange={(e) => updateSource(i, e.target.value)}
                  placeholder="https://…"
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                />
                <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700 shrink-0" onClick={() => removeSource(i)}>
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="secondary" size="sm" onClick={addSource}>Add source</Button>
              {sourcesDirty && (
                <Button type="button" size="sm" loading={savingSources} onClick={() => void handleSaveSources()}>Save sources</Button>
              )}
            </div>
          </div>

          {/* Pending (editable) summary */}
          {pending && (
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Fetched {formatDateTime(pending.fetchedAt)} — check every date against the portal before publishing
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Overview (English)</label>
                <textarea className={TEXTAREA_CLASS} rows={2} value={pending.overviewEn} onChange={(e) => updatePending('overviewEn', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Overview (Kannada)</label>
                <textarea className={TEXTAREA_CLASS} rows={2} value={pending.overviewKn} onChange={(e) => updatePending('overviewKn', e.target.value)} />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Latest news ({pending.news.length})</p>
                <Button type="button" variant="secondary" size="sm" onClick={addNews}>Add news item</Button>
              </div>
              {pending.news.map((item, i) => (
                <NewsEditor key={i} item={item} index={i} onChange={(next) => updateNews(i, next)} onRemove={() => removeNews(i)} />
              ))}

              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider pt-1">Schemes ({pending.schemes.length})</p>
              {pending.schemes.map((scheme, i) => (
                <SchemeEditor
                  key={i}
                  scheme={scheme}
                  index={i}
                  onChange={(next) => updateScheme(i, next)}
                  onRemove={() => removeScheme(i)}
                />
              ))}
              {pending.schemes.length === 0 && (
                <p className="text-xs text-gray-500">All schemes removed — fetch again or discard.</p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={fetching}
              disabled={fetching || publishing}
              onClick={() => void handleFetch()}
            >
              {pending || published ? 'Fetch latest again' : 'Fetch latest'}
            </Button>
            {pending && (
              <Button type="button" size="sm" loading={publishing} disabled={fetching} onClick={() => void handlePublish()}>
                Publish
              </Button>
            )}
            {pending && (
              <Button type="button" variant="secondary" size="sm" disabled={fetching || publishing} onClick={() => { setPending(null); setError(''); }}>
                Discard
              </Button>
            )}
          </div>
          {fetching && (
            <p className="text-xs text-gray-400">Reading the portals and their latest notices — this can take a minute or two.</p>
          )}
          <p className="text-[11px] text-gray-400">
            Uses the Gemini text model from AI Settings with web access. If fetching fails with a tools/model error, pick a
            model that supports Google Search grounding there. A newly published summary shows in the app immediately; the
            reminder point in a student's highlights appears from their next daily generation.
          </p>

          {/* Currently published (read-only) */}
          {published && (
            <div>
              <button
                type="button"
                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                onClick={() => setShowPublished((v) => !v)}
              >
                {showPublished ? '▾ Hide' : '▸ Show'} what students currently see
              </button>
              {showPublished && (
                <div className="mt-3 space-y-3">
                  {published.overviewEn && <p className="text-sm text-gray-700">{published.overviewEn}</p>}
                  {published.overviewKn && <p className="text-sm text-gray-600">{published.overviewKn}</p>}
                  <NewsView items={published.news ?? []} />
                  {published.schemes.map((s, i) => <SchemeView key={i} scheme={s} />)}
                </div>
              )}
            </div>
          )}
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
          notices, circulars, certificates and any scholarship deadline within two weeks. Read-only — it does not change
          what the student sees.
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
 *  today's shared quote and the scholarship summary are generated and
 *  published from here, and any student's personalized briefing can be
 *  previewed to check accuracy. */
export function DailyBriefingPanel() {
  return (
    <div className="max-w-2xl space-y-4">
      <QuoteCard />
      <ScholarshipsCard />
      <StudentPreviewCard />
    </div>
  );
}
