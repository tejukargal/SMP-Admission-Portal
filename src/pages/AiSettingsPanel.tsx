import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import {
  getAiSettingsConfig, saveAiSettingsConfig, type AiSettingsConfig, type ModelOption,
  GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS, OPENAI_IMAGE_QUALITIES, BUDGETPIXEL_IMAGE_MODELS,
} from '../services/adminConfigService';
import { optimizeStoredImages, type OptimizeStoredImagesResult } from '../services/imageOptimizationService';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';

/** Settings › Student App › AI Settings: which provider draws the AI images,
 *  its API keys, the Gemini text model behind the Daily Briefing, and the
 *  one-off stored-image optimisation. */
export function AiSettingsPanel() {
  const [aiProvider, setAiProvider] = useState<AiSettingsConfig['imageProvider']>('gemini');
  const [aiGeminiKey, setAiGeminiKey] = useState('');
  const [aiOpenaiKey, setAiOpenaiKey] = useState('');
  const [aiReplicateKey, setAiReplicateKey] = useState('');
  const [aiBudgetpixelKey, setAiBudgetpixelKey] = useState('');
  const [aiGeminiTextModel, setAiGeminiTextModel] = useState('');
  const [aiGeminiImageModel, setAiGeminiImageModel] = useState('');
  const [aiOpenaiImageModel, setAiOpenaiImageModel] = useState('');
  const [aiBudgetpixelImageModel, setAiBudgetpixelImageModel] = useState('');
  const [aiOpenaiImageQuality, setAiOpenaiImageQuality] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaveMsg, setAiSaveMsg] = useState('');
  const [aiSaveError, setAiSaveError] = useState('');
  const [imgOptRunning, setImgOptRunning] = useState(false);
  const [imgOptResult, setImgOptResult] = useState<OptimizeStoredImagesResult | null>(null);
  const [imgOptError, setImgOptError] = useState('');

  // Load the saved provider/keys once when the section opens
  useEffect(() => {
    setAiLoading(true);
    getAiSettingsConfig()
      .then((cfg) => {
        if (cfg) {
          setAiProvider(cfg.imageProvider);
          setAiGeminiKey(cfg.geminiApiKey);
          setAiOpenaiKey(cfg.openaiApiKey);
          setAiReplicateKey(cfg.replicateApiKey);
          setAiBudgetpixelKey(cfg.budgetpixelApiKey);
          setAiGeminiTextModel(cfg.geminiTextModel);
          setAiGeminiImageModel(cfg.geminiImageModel);
          setAiOpenaiImageModel(cfg.openaiImageModel);
          setAiBudgetpixelImageModel(cfg.budgetpixelImageModel);
          setAiOpenaiImageQuality(cfg.openaiImageQuality);
        }
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, []);

  async function handleSaveAiSettings(e: FormEvent) {
    e.preventDefault();
    setAiSaveMsg('');
    setAiSaveError('');
    if (aiProvider === 'openai' && !aiOpenaiKey.trim()) {
      setAiSaveError('OpenAI API key is required when OpenAI is selected.');
      return;
    }
    if (aiProvider === 'gemini' && !aiGeminiKey.trim()) {
      setAiSaveError('Gemini API key is required when Gemini is selected.');
      return;
    }
    if (aiProvider === 'replicate' && !aiReplicateKey.trim()) {
      setAiSaveError('Replicate API key is required when Replicate is selected.');
      return;
    }
    if (aiProvider === 'budgetpixel' && !aiBudgetpixelKey.trim()) {
      setAiSaveError('BudgetPixel API key is required when BudgetPixel is selected.');
      return;
    }
    setAiSaving(true);
    try {
      await saveAiSettingsConfig({
        imageProvider: aiProvider,
        geminiApiKey: aiGeminiKey.trim(),
        openaiApiKey: aiOpenaiKey.trim(),
        replicateApiKey: aiReplicateKey.trim(),
        budgetpixelApiKey: aiBudgetpixelKey.trim(),
        geminiTextModel: aiGeminiTextModel.trim(),
        geminiImageModel: aiGeminiImageModel,
        openaiImageModel: aiOpenaiImageModel,
        budgetpixelImageModel: aiBudgetpixelImageModel,
        openaiImageQuality: aiOpenaiImageQuality,
      });
      setAiSaveMsg('AI settings saved.');
    } catch (err: unknown) {
      setAiSaveError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setAiSaving(false);
    }
  }

  // The model select for the currently chosen provider (Replicate has none —
  // its model stays managed in the Firebase Console). An empty saved value
  // shows the first option, which is exactly the Cloud Function's fallback.
  const imageModelPicker: { options: ModelOption[]; value: string; set: (v: string) => void } | null =
    aiProvider === 'gemini' ? { options: GEMINI_IMAGE_MODELS, value: aiGeminiImageModel, set: setAiGeminiImageModel }
    : aiProvider === 'openai' ? { options: OPENAI_IMAGE_MODELS, value: aiOpenaiImageModel, set: setAiOpenaiImageModel }
    : aiProvider === 'budgetpixel' ? { options: BUDGETPIXEL_IMAGE_MODELS, value: aiBudgetpixelImageModel, set: setAiBudgetpixelImageModel }
    : null;

  async function handleOptimizeStoredImages() {
    setImgOptRunning(true);
    setImgOptResult(null);
    setImgOptError('');
    try {
      setImgOptResult(await optimizeStoredImages());
    } catch (err: unknown) {
      setImgOptError(err instanceof Error ? err.message : 'Optimisation failed.');
    } finally {
      setImgOptRunning(false);
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <h3 className="text-base font-medium text-gray-800 mb-1">Background Image Generation</h3>
        <p className="text-sm text-gray-500 mb-4">
          Choose which AI provider generates circular, tab-header, and daily-quote background
          images, and store its API key. Keys are stored securely in Firestore and never
          exposed to students.
        </p>
        {aiLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <form onSubmit={(e) => { void handleSaveAiSettings(e); }} className="space-y-4">
            <Select
              label="Image Provider"
              value={aiProvider}
              onChange={(e) => { setAiProvider(e.target.value as AiSettingsConfig['imageProvider']); setAiSaveMsg(''); setAiSaveError(''); }}
              options={[
                { value: 'gemini', label: 'Google Gemini' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'replicate', label: 'Replicate (FLUX.2 Klein 4B)' },
                { value: 'budgetpixel', label: 'BudgetPixel' },
              ]}
            />
            {imageModelPicker && (
              <div>
                <Select
                  label="Image Model"
                  value={imageModelPicker.value || imageModelPicker.options[0].value}
                  onChange={(e) => { imageModelPicker.set(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                  options={imageModelPicker.options}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Prices are per generated image at the provider&apos;s published rate (approximate). The first
                  option is what runs when nothing has been saved. Retired models (gemini-2.5-flash-image,
                  gpt-image-1) are deliberately not listed.
                </p>
              </div>
            )}
            {aiProvider === 'openai' && (
              <div>
                <Select
                  label="OpenAI Image Quality"
                  value={aiOpenaiImageQuality || 'high'}
                  onChange={(e) => { setAiOpenaiImageQuality(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                  options={OPENAI_IMAGE_QUALITIES}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Quality is the biggest cost lever on OpenAI — Low is usually plenty for these flat pastel
                  illustrations.
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gemini API Key
              </label>
              <input
                type="password"
                value={aiGeminiKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setAiGeminiKey(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                placeholder="Paste your Gemini API key"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={aiOpenaiKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setAiOpenaiKey(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                placeholder="Paste your OpenAI API key"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Replicate API Key
              </label>
              <input
                type="password"
                value={aiReplicateKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setAiReplicateKey(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                placeholder="Paste your Replicate API key"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                BudgetPixel API Key
              </label>
              <input
                type="password"
                value={aiBudgetpixelKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setAiBudgetpixelKey(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                placeholder="Paste your BudgetPixel API key"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gemini Text Model
              </label>
              <input
                type="text"
                value={aiGeminiTextModel}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setAiGeminiTextModel(e.target.value); setAiSaveMsg(''); setAiSaveError(''); }}
                placeholder="gemini-3.5-flash-lite (default)"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Writes the Daily Briefing quote, note and highlights (always Gemini, whichever image provider is
                selected). Leave blank for the default; a larger model such as gemini-3.5-flash gives more careful
                highlights at a higher per-call cost.
              </p>
            </div>
            {aiSaveError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{aiSaveError}</p>
            )}
            {aiSaveMsg && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">{aiSaveMsg}</p>
            )}
            <Button type="submit" loading={aiSaving}>
              Save AI Settings
            </Button>
          </form>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <h3 className="text-base font-medium text-gray-800 mb-1">Image Optimisation</h3>
        <p className="text-sm text-gray-500 mb-4">
          Newly generated images are automatically downscaled and saved as WebP. Run this once
          to convert the images that were stored before that (tab headers, category icons and
          every circular background) — they are multi-megabyte PNGs that make the student app
          show blank backdrops for several seconds after login. Safe to run again; images that
          are already WebP are skipped.
        </p>
        <Button type="button" loading={imgOptRunning} onClick={() => { void handleOptimizeStoredImages(); }}>
          {imgOptRunning ? 'Optimising… (this can take a few minutes)' : 'Optimise stored images'}
        </Button>
        {imgOptError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{imgOptError}</p>
        )}
        {imgOptResult && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              Converted {imgOptResult.converted.length}, skipped {imgOptResult.skipped.length}, failed {imgOptResult.failed.length}.
              {imgOptResult.converted.length > 0 && (() => {
                const before = imgOptResult.converted.reduce((n, c) => n + c.bytesBefore, 0);
                const after = imgOptResult.converted.reduce((n, c) => n + c.bytesAfter, 0);
                return ` ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB.`;
              })()}
            </p>
            {imgOptResult.failed.length > 0 && (
              <ul className="text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 space-y-1">
                {imgOptResult.failed.map((f) => (
                  <li key={f.label}><span className="font-medium">{f.label}</span>: {f.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
