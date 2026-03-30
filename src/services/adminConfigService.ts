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
