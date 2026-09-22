import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface MessagingConfig {
  fast2smsApiKey: string;
  senderId: string;
}

const CONFIG_DOC = doc(db, 'adminConfig', 'messaging');

export async function getMessagingConfig(): Promise<MessagingConfig | null> {
  const snap = await getDoc(CONFIG_DOC);
  if (!snap.exists()) return null;
  return snap.data() as MessagingConfig;
}

export async function saveMessagingConfig(config: MessagingConfig): Promise<void> {
  await setDoc(CONFIG_DOC, { ...config, updatedAt: new Date().toISOString() });
}

/** Providers that can generate text. BudgetPixel is deliberately absent — it is a
 *  credit-metered image service with no LLM endpoint. */
export type TextProvider = 'gemini' | 'claude' | 'openai';

export const TEXT_PROVIDERS: TextProvider[] = ['gemini', 'claude', 'openai'];

/** The features that pick their own text provider/model. Each maps to a
 *  `{feature}Provider` / `{feature}Model` pair on the aiSettings doc. */
export type TextFeature = 'quote' | 'scholarship' | 'briefing' | 'dtek';

export interface AiSettingsConfig {
  imageProvider: 'gemini' | 'openai' | 'replicate' | 'budgetpixel';
  geminiApiKey: string;
  openaiApiKey: string;
  replicateApiKey: string;
  budgetpixelApiKey: string;
  anthropicApiKey: string;
  /** Gemini model for circular/notice AI drafting (runDraftModel). Empty = the
   *  function's default (gemini-3.5-flash-lite). The Daily Briefing features no
   *  longer read this — they each carry their own provider/model pair below. */
  geminiTextModel: string;
  /** Per-feature text provider + model. Empty = the Cloud Function's fallback,
   *  which is the first entry of the matching *_TEXT_MODELS list. */
  quoteProvider: string;
  quoteModel: string;
  scholarshipProvider: string;
  scholarshipModel: string;
  briefingProvider: string;
  briefingModel: string;
  dtekProvider: string;
  dtekModel: string;
  /** Image model per provider — the Cloud Functions read these and fall back to
   *  the first entry of the matching *_IMAGE_MODELS list below when empty. */
  geminiImageModel: string;
  openaiImageModel: string;
  budgetpixelImageModel: string;
  /** OpenAI only: `low` | `medium` | `high`. The single biggest cost lever there —
   *  `high` is roughly 5–25× the price of `low`. Empty = the function's default (high). */
  openaiImageQuality: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

// Curated per-provider image models (max three each): the cheapest options that
// still hold quality for the flat-vector illustration style every prompt asks
// for. Prices are the providers' published rates as of Sep 2026 — treat them as
// approximate. First entry = the Cloud Function's fallback when nothing is saved.
//
// Deliberately excluded: `gemini-2.5-flash-image` (shut down 2026-10-02),
// `gpt-image-1` (deprecated 2026-10-23), Imagen 4 (different API than the
// Gemini generateContent call the functions use).
export const GEMINI_IMAGE_MODELS: ModelOption[] = [
  { value: 'gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite Image — ~$0.034 / image (cheapest)' },
  { value: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image (Nano Banana 2) — ~$0.067 / image' },
  { value: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image (Nano Banana Pro) — ~$0.134 / image (premium)' },
];

export const OPENAI_IMAGE_MODELS: ModelOption[] = [
  { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini — ~$0.005–0.036 / image by quality (cheapest)' },
  { value: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare — ~$0.015 / image at medium (fast, everyday)' },
  { value: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst — most capable (premium)' },
];

export const OPENAI_IMAGE_QUALITIES: ModelOption[] = [
  { value: 'low', label: 'Low — cheapest, fine for flat pastel illustrations' },
  { value: 'medium', label: 'Medium — balanced' },
  { value: 'high', label: 'High — best detail, 5–25× the cost of Low (current default)' },
];

// BudgetPixel meters in credits (1,000 credits ≈ $1 on a credit pack).
export const BUDGETPIXEL_IMAGE_MODELS: ModelOption[] = [
  { value: 'nano-banana-2-lite', label: 'Nano Banana 2 Lite — 40 credits (~$0.04) / image' },
  { value: 'flux-2-klein', label: 'FLUX 2 Klein — 10 credits (~$0.01) / image (cheapest; in Pro/Ultra daily free pool)' },
  { value: 'seedream-5.0-lite', label: 'SeeDream 5.0 Lite — strong at layout/typography (check cost via the API before relying on it)' },
];

// Curated text models, same rule as the image lists: first entry is exactly the
// Cloud Function's fallback when nothing is saved. Prices are the providers'
// published per-million-token rates as of Sep 2026 — treat them as approximate.
export const GEMINI_TEXT_MODELS: ModelOption[] = [
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite — cheapest, fine for short JSON (default)' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — more careful, better at web research' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro — strongest reasoning (preview, premium)' },
];

export const CLAUDE_TEXT_MODELS: ModelOption[] = [
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 — $2 / $10 per Mtok (balanced; drives circular drafting)' },
  { value: 'claude-opus-5', label: 'Claude Opus 5 — $5 / $25 per Mtok (best reasoning, premium)' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — $1 / $5 per Mtok (cheapest)' },
];

export const OPENAI_TEXT_MODELS: ModelOption[] = [
  { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — $0.20 / $1.20 per Mtok (cheapest)' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — $2 / $12 per Mtok (balanced)' },
  { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — $5 / $30 per Mtok (premium)' },
];

export function textModelsFor(provider: TextProvider): ModelOption[] {
  return provider === 'claude' ? CLAUDE_TEXT_MODELS
    : provider === 'openai' ? OPENAI_TEXT_MODELS
    : GEMINI_TEXT_MODELS;
}

const AI_SETTINGS_DOC = doc(db, 'adminConfig', 'aiSettings');

function asTextProvider(value: unknown, fallback: TextProvider = 'gemini'): TextProvider {
  return TEXT_PROVIDERS.includes(value as TextProvider) ? (value as TextProvider) : fallback;
}

const IMAGE_PROVIDERS: AiSettingsConfig['imageProvider'][] = ['gemini', 'openai', 'replicate', 'budgetpixel'];

export async function getAiSettingsConfig(): Promise<AiSettingsConfig | null> {
  const snap = await getDoc(AI_SETTINGS_DOC);
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<AiSettingsConfig>;
  const provider: AiSettingsConfig['imageProvider'] =
    data.imageProvider && IMAGE_PROVIDERS.includes(data.imageProvider) ? data.imageProvider : 'gemini';
  return {
    imageProvider: provider,
    geminiApiKey: data.geminiApiKey ?? '',
    openaiApiKey: data.openaiApiKey ?? '',
    replicateApiKey: data.replicateApiKey ?? '',
    budgetpixelApiKey: data.budgetpixelApiKey ?? '',
    anthropicApiKey: data.anthropicApiKey ?? '',
    geminiTextModel: data.geminiTextModel ?? '',
    quoteProvider: asTextProvider(data.quoteProvider),
    quoteModel: data.quoteModel ?? '',
    scholarshipProvider: asTextProvider(data.scholarshipProvider),
    scholarshipModel: data.scholarshipModel ?? '',
    briefingProvider: asTextProvider(data.briefingProvider),
    briefingModel: data.briefingModel ?? '',
    dtekProvider: asTextProvider(data.dtekProvider),
    dtekModel: data.dtekModel ?? '',
    geminiImageModel: data.geminiImageModel ?? '',
    openaiImageModel: data.openaiImageModel ?? '',
    budgetpixelImageModel: data.budgetpixelImageModel ?? '',
    openaiImageQuality: data.openaiImageQuality ?? '',
  };
}

// Partial + merge: this doc also holds a Console-managed replicateImageModel and
// the per-feature text choices written by saveAiTextChoice, and the AI Settings
// panel owns only a subset of it — saving there must never wipe out the rest.
export async function saveAiSettingsConfig(config: Partial<AiSettingsConfig>): Promise<void> {
  await setDoc(AI_SETTINGS_DOC, { ...config, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Writes just one feature's provider/model pair. The Daily Briefing and DTEK
 *  News cards save on change rather than behind a form button, so they must not
 *  round-trip (and risk clobbering) the rest of the doc. */
export async function saveAiTextChoice(
  feature: TextFeature,
  provider: TextProvider,
  model: string,
): Promise<void> {
  await setDoc(
    AI_SETTINGS_DOC,
    { [`${feature}Provider`]: provider, [`${feature}Model`]: model, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}
