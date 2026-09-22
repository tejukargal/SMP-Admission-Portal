import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { TextModelPicker } from '../components/common/TextModelPicker';
import { useTextModelChoice } from '../hooks/useTextModelChoice';
import { formatIsoDate, formatIsoDateTime, daysAgo } from '../utils/formatDates';
import {
  getDtekSources, saveDtekSources, getPublishedDtekNews, fetchDtekNews, publishDtekNews,
  DEFAULT_DTEK_SOURCES, EMPTY_DTEK_CIRCULAR, DTEK_CATEGORIES,
  type DtekCircular, type DtekCategory, type PendingDtekNews, type DtekNewsRecord,
} from '../services/dtekNewsService';

const TEXTAREA_CLASS =
  'block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors resize-y';

const CATEGORY_OPTIONS = DTEK_CATEGORIES.map((c) => ({ value: c, label: c }));

/** Published digests go stale quietly — the department circulates constantly,
 *  so an old one is misleading rather than merely dated. */
const STALE_AFTER_DAYS = 14;

export function DtekNewsPanel() {
  const [sources, setSources] = useState<string[]>(DEFAULT_DTEK_SOURCES);
  const [sourcesDirty, setSourcesDirty] = useState(false);
  const [savingSources, setSavingSources] = useState(false);
  const [published, setPublished] = useState<DtekNewsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingDtekNews | null>(null);
  const [fetching, setFetching] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [showPublished, setShowPublished] = useState(false);
  const dtekAi = useTextModelChoice('dtek');

  useEffect(() => {
    Promise.all([getDtekSources(), getPublishedDtekNews()])
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

  function validSources(): string[] {
    return sources.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  }

  async function handleSaveSources() {
    const urls = validSources();
    if (urls.length === 0) {
      setError('Add at least one source starting with http:// or https://');
      return;
    }
    setError('');
    setSavingSources(true);
    try {
      await saveDtekSources(urls);
      setSources(urls);
      setSourcesDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the sources. Please try again.');
    } finally {
      setSavingSources(false);
    }
  }

  async function handleFetch() {
    const urls = validSources();
    if (urls.length === 0) {
      setError('Add at least one source starting with http:// or https://');
      return;
    }
    setError('');
    setFetching(true);
    try {
      setPending(await fetchDtekNews(urls));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch the circulars. Please try again.');
    } finally {
      setFetching(false);
    }
  }

  async function handlePublish() {
    if (!pending) return;
    const circulars = pending.circulars.filter((c) => c.title.trim());
    if (circulars.length === 0) {
      setError('At least one circular with a title is required.');
      return;
    }
    setError('');
    setPublishing(true);
    try {
      setPublished(await publishDtekNews({ ...pending, circulars }));
      setPending(null);
      setShowPublished(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish. Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  function updatePending<K extends keyof PendingDtekNews>(key: K, value: PendingDtekNews[K]) {
    setPending((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateCircular(index: number, next: DtekCircular) {
    setPending((prev) => (prev ? { ...prev, circulars: prev.circulars.map((c, i) => (i === index ? next : c)) } : prev));
  }

  function removeCircular(index: number) {
    setPending((prev) => (prev ? { ...prev, circulars: prev.circulars.filter((_, i) => i !== index) } : prev));
  }

  function addCircular() {
    setPending((prev) => (prev ? { ...prev, circulars: [...prev.circulars, { ...EMPTY_DTEK_CIRCULAR }] } : prev));
  }

  const publishedAge = published ? daysAgo(published.publishedAt) : null;

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">DTEK News</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            A date-wise digest of the latest Department of Technical Education circulars, read by the AI from the sources
            below and shown on the Dashboard. Fetch the latest, check every date and reference number against the
            circular itself, then Publish — it stays until you publish again.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 px-6 py-5">Loading…</p>
        ) : (
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              {published ? (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(publishedAge ?? 0) > STALE_AFTER_DAYS ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  Published {formatIsoDateTime(published.publishedAt)}
                  {publishedAge !== null && publishedAge > 0 ? ` (${publishedAge} day${publishedAge === 1 ? '' : 's'} ago)` : ' (today)'}
                  {' · '}{published.circulars.length} circular{published.circulars.length === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  Not published yet — the Dashboard shows no DTEK section
                </span>
              )}
              {pending && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Unpublished digest</span>
              )}
            </div>

            {/* Sources */}
            <div className="space-y-2">
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
              <p className="text-[11px] text-gray-400">
                The departmental-circulars listing page matters most — the AI opens it and then follows each circular
                link, including PDFs. Only pages on the department&apos;s own domain are read.
              </p>
            </div>

            {/* Pending (editable) digest */}
            {pending && (
              <div className="space-y-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Fetched {formatIsoDateTime(pending.fetchedAt)} — check every date and reference number before publishing
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
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Circulars ({pending.circulars.length})</p>
                  <Button type="button" variant="secondary" size="sm" onClick={addCircular}>Add circular</Button>
                </div>
                <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
                  {pending.circulars.map((circular, i) => (
                    <CircularEditor
                      key={i}
                      circular={circular}
                      index={i}
                      onChange={(next) => updateCircular(i, next)}
                      onRemove={() => removeCircular(i)}
                    />
                  ))}
                </div>
                {pending.circulars.length === 0 && (
                  <p className="text-xs text-gray-500">All circulars removed — fetch again or discard.</p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            <TextModelPicker
              grounded
              provider={dtekAi.provider}
              model={dtekAi.model}
              onChange={dtekAi.setChoice}
              disabled={dtekAi.loading || fetching}
            />

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
              <p className="text-xs text-gray-400">
                Reading the circulars listing and each circular PDF — this usually takes two to four minutes.
              </p>
            )}
            <p className="text-[11px] text-gray-400">
              If fetching fails with a tools/model error, pick a different provider or model above — not every model can
              read live web pages. Government circular dates are the easiest thing for an AI to get wrong, so read each
              one against its source before publishing.
            </p>

            {/* Currently published (read-only) */}
            {published && (
              <div>
                <button
                  type="button"
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                  onClick={() => setShowPublished((v) => !v)}
                >
                  {showPublished ? '▾' : '▸'} Show what&apos;s currently published
                </button>
                {showPublished && (
                  // Scrolls in place: with a full digest this list runs to a
                  // dozen circulars and would otherwise bury the Fetch and
                  // Publish buttons far up the page.
                  <div className="mt-3 space-y-3 max-h-96 overflow-y-auto pr-1 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                    {published.overviewEn && <p className="text-sm text-gray-700">{published.overviewEn}</p>}
                    {published.circulars.map((c, i) => (
                      <CircularView key={i} circular={c} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CircularEditor({ circular, index, onChange, onRemove }: {
  circular: DtekCircular;
  index: number;
  onChange: (next: DtekCircular) => void;
  onRemove: () => void;
}) {
  function set<K extends keyof DtekCircular>(key: K, value: DtekCircular[K]) {
    onChange({ ...circular, [key]: value });
  }

  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Circular {index + 1}</span>
        <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Date (YYYY-MM-DD)"
          value={circular.date ?? ''}
          // Blank means the circular carried no readable printed date, which the
          // Cloud Function stores as null rather than inventing one.
          onChange={(e) => set('date', e.target.value.trim() || null)}
          placeholder="2026-09-18"
        />
        <Input
          label="Date in words"
          value={circular.dateText}
          onChange={(e) => set('dateText', e.target.value)}
          placeholder="18 September 2026"
        />
      </div>

      <Input
        label="Reference number"
        value={circular.referenceNo}
        onChange={(e) => set('referenceNo', e.target.value)}
        placeholder="e.g. TEC 45 TPE 2026"
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Title (English)</label>
        <textarea className={TEXTAREA_CLASS} rows={2} value={circular.title} onChange={(e) => set('title', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Title (Kannada)</label>
        <textarea className={TEXTAREA_CLASS} rows={2} value={circular.titleKn} onChange={(e) => set('titleKn', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Category"
          value={circular.category}
          onChange={(e) => set('category', e.target.value as DtekCategory)}
          options={CATEGORY_OPTIONS}
        />
        <Input
          label="Affects"
          value={circular.affects}
          onChange={(e) => set('affects', e.target.value)}
          placeholder="All polytechnic principals"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Summary (English)</label>
        <textarea className={TEXTAREA_CLASS} rows={3} value={circular.summary} onChange={(e) => set('summary', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Summary (Kannada)</label>
        <textarea className={TEXTAREA_CLASS} rows={3} value={circular.summaryKn} onChange={(e) => set('summaryKn', e.target.value)} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Highlights (one per line)</label>
        <textarea
          className={TEXTAREA_CLASS}
          rows={4}
          value={circular.highlights.join('\n')}
          onChange={(e) => set('highlights', e.target.value.split('\n').map((h) => h.trim()).filter(Boolean))}
          placeholder={'Exam fee last date 30 Sep 2026\nLate fee ₹500 thereafter'}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={circular.actionRequired}
          onChange={(e) => set('actionRequired', e.target.checked)}
          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400"
        />
        Action needed from the college
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Action by (YYYY-MM-DD)"
          value={circular.actionBy ?? ''}
          onChange={(e) => set('actionBy', e.target.value.trim() || null)}
          placeholder="2026-09-30"
        />
        <Input
          label="Deadline in words"
          value={circular.actionByText}
          onChange={(e) => set('actionByText', e.target.value)}
          placeholder="Returns due 30 September 2026"
        />
      </div>

      <Input label="Link" value={circular.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
    </div>
  );
}

function CircularView({ circular }: { circular: DtekCircular }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {circular.category}
        </span>
        <span className="text-[11px] text-gray-400">
          {circular.date ? formatIsoDate(circular.date) : circular.dateText || 'Undated'}
        </span>
        {circular.referenceNo && <span className="text-[11px] text-gray-400">· {circular.referenceNo}</span>}
        {circular.actionRequired && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {circular.actionBy ? `Action by ${formatIsoDate(circular.actionBy)}` : 'Action needed'}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-gray-800 mt-1.5">{circular.title}</p>
      {circular.summary && <p className="text-xs text-gray-600 mt-1">{circular.summary}</p>}
      {circular.summaryKn && <p className="text-xs text-gray-500 mt-1">{circular.summaryKn}</p>}
      {circular.highlights.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {circular.highlights.map((h, i) => (
            <li key={i} className="text-xs text-gray-600 flex gap-1.5">
              <span className="text-emerald-500">•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
