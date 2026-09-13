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
}

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
  };
}

// This doc also holds anthropicApiKey/geminiTextModel/geminiImageModel/openaiImageModel/
// replicateImageModel/budgetpixelImageModel fields managed outside this tab (via Firebase
// Console) — merge so saving here never wipes them out.
export async function saveAiSettingsConfig(config: AiSettingsConfig): Promise<void> {
  await setDoc(AI_SETTINGS_DOC, { ...config, updatedAt: new Date().toISOString() }, { merge: true });
}
