// Notice creation with Firebase Storage attachments. Kept in its own module so
// noticeService.ts stays untouched — createNoticeWithAttachments behaves
// identically to noticeService.createNotice when `files` is empty.
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadAttachment } from './circularService';
import type { Notice, StoredAttachment } from '../types';

export async function createNoticeWithAttachments(
  data: Omit<Notice, 'id' | 'createdAt' | 'attachments'>,
  files: File[],
): Promise<void> {
  const ref = doc(collection(db, 'notices'));
  const attachments: StoredAttachment[] = [];
  for (const file of files) {
    attachments.push(await uploadAttachment(`noticeAttachments/${ref.id}`, file));
  }
  const payload: Record<string, unknown> = { ...data, createdAt: new Date().toISOString() };
  if (attachments.length > 0) payload.attachments = attachments;
  await setDoc(ref, payload);
}
