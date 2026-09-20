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

export interface AiSettingsConfig {
  imageProvider: 'gemini' | 'openai' | 'replicate' | 'budgetpixel';
  geminiApiKey: string;
  openaiApiKey: string;
  replicateApiKey: string;
  budgetpixelApiKey: string;
  /** Gemini model for the Daily Briefing text (quote, note, highlights). Empty = the
   *  function's default (gemini-3.5-flash-lite). */
  geminiTextModel: string;
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

const AI_SETTINGS_DOC = doc(db, 'adminConfig', 'aiSettings');

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
    geminiTextModel: data.geminiTextModel ?? '',
    geminiImageModel: data.geminiImageModel ?? '',
    openaiImageModel: data.openaiImageModel ?? '',
    budgetpixelImageModel: data.budgetpixelImageModel ?? '',
    openaiImageQuality: data.openaiImageQuality ?? '',
  };
}

// This doc also holds anthropicApiKey/replicateImageModel fields managed outside
// this tab (via Firebase Console) — merge so saving here never wipes them out.
export async function saveAiSettingsConfig(config: AiSettingsConfig): Promise<void> {
  await setDoc(AI_SETTINGS_DOC, { ...config, updatedAt: new Date().toISOString() }, { merge: true });
}
