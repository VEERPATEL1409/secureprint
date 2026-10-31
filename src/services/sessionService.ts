import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  Unsubscribe,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { removeUndefinedFields } from '../firebase/utils';
import { CustomerSession, ChatMessage, FileAttachment, PrintSettings } from '../types';
import { deleteStorageDocument } from './storageService';

export function generateToken(): string {
  const digits = Math.floor(100000 + Math.random() * 900000).toString();
  return `#${digits}`;
}

export async function createCustomerSession(params: {
  shopId: string;
  customerName: string;
  customerPhone?: string;
  shopPublicCode?: string;
  guestUid?: string;
  isAnonymous?: boolean;
}): Promise<CustomerSession> {
  const sessionId = `cs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 60 * 1000); // 5-hour TTL

  const sessionData: CustomerSession = {
    id: sessionId,
    shopId: params.shopId,
    shopPublicCode: params.shopPublicCode || '',
    token,
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone ? params.customerPhone.trim() : '',
    guestUid: params.guestUid,
    isAnonymous: params.isAnonymous ?? true,
    lastActiveAt: now.toISOString(),
    status: 'active',
    isBlocked: false,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const path = `customerSessions/${sessionId}`;
  try {
    const sessionRef = doc(db, 'customerSessions', sessionId);
    const cleaned = removeUndefinedFields(sessionData);
    await setDoc(sessionRef, {
      ...cleaned,
      serverCreatedAt: serverTimestamp(),
    });
    return sessionData;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bindGuestToCustomerSession(
  sessionId: string,
  guestUid: string,
  isAnonymous: boolean
): Promise<void> {
  const path = `customerSessions/${sessionId}`;
  try {
    const sessionRef = doc(db, 'customerSessions', sessionId);
    const payload = removeUndefinedFields({
      guestUid,
      isAnonymous,
      lastActiveAt: new Date().toISOString()
    });
    await updateDoc(sessionRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToCustomerSession(
  sessionId: string,
  onUpdate: (session: CustomerSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = `customerSessions/${sessionId}`;
  const sessionRef = doc(db, 'customerSessions', sessionId);

  return onSnapshot(
    sessionRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const data = snap.data() as CustomerSession;
      onUpdate({ id: snap.id, ...data });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (formattedErr) {
        if (onError && formattedErr instanceof Error) {
          onError(formattedErr);
        }
      }
    }
  );
}

export async function getSessionById(sessionId: string): Promise<CustomerSession | null> {
  const path = `customerSessions/${sessionId}`;
  try {
    const sessionRef = doc(db, 'customerSessions', sessionId);
    const snap = await getDoc(sessionRef);
    if (!snap.exists()) return null;

    const data = snap.data() as CustomerSession;

    // Ephemeral expiration check
    if (new Date(data.expiresAt).getTime() <= Date.now() && data.status === 'active') {
      await updateDoc(sessionRef, { status: 'expired' });
      data.status = 'expired';
    }

    return { id: snap.id, ...data };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getShopSessions(shopId: string): Promise<CustomerSession[]> {
  const path = 'customerSessions';
  try {
    const q = query(
      collection(db, 'customerSessions'),
      where('shopId', '==', shopId)
    );
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerSession));
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sessions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function blockCustomerSession(
  sessionId: string,
  reason: string,
  blockedBy: string
): Promise<void> {
  const path = `customerSessions/${sessionId}`;
  try {
    const sessionRef = doc(db, 'customerSessions', sessionId);
    await updateDoc(sessionRef, {
      isBlocked: true,
      status: 'blocked',
      blockReason: reason,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function unblockCustomerSession(sessionId: string): Promise<void> {
  const path = `customerSessions/${sessionId}`;
  try {
    const sessionRef = doc(db, 'customerSessions', sessionId);
    await updateDoc(sessionRef, {
      isBlocked: false,
      status: 'active',
      blockReason: deleteField(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Session Messages / Chat
export async function sendMessageToSession(
  sessionId: string,
  text: string,
  senderRole: 'customer' | 'shop',
  files?: FileAttachment[],
  printSettings?: PrintSettings
): Promise<ChatMessage> {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `customerSessions/${sessionId}/messages/${msgId}`;

  const message: ChatMessage = {
    id: msgId,
    sessionId,
    senderRole,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    files: files && files.length > 0 ? files : undefined,
    printSettings: printSettings || undefined
  };

  try {
    const msgRef = doc(db, 'customerSessions', sessionId, 'messages', msgId);
    const cleaned = removeUndefinedFields(message);
    await setDoc(msgRef, {
      ...cleaned,
      serverTimestamp: serverTimestamp()
    });
    return message;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Permanently delete message from both customer and shop sides (Delete for Everyone)
export async function deleteMessageForEveryone(
  sessionId: string,
  messageId: string,
  files?: FileAttachment[]
): Promise<void> {
  const path = `customerSessions/${sessionId}/messages/${messageId}`;
  try {
    // Delete any attached storage files
    if (files && files.length > 0) {
      for (const f of files) {
        if (f.storagePath) {
          await deleteStorageDocument(f.storagePath);
        }
      }
    }

    const msgRef = doc(db, 'customerSessions', sessionId, 'messages', messageId);
    await deleteDoc(msgRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Purge all customer session messages and attached files
export async function purgeCustomerSessionData(sessionId: string): Promise<void> {
  try {
    // 1. Delete all messages
    const msgsRef = collection(db, 'customerSessions', sessionId, 'messages');
    const msgSnaps = await getDocs(msgsRef);
    for (const d of msgSnaps.docs) {
      const data = d.data() as ChatMessage;
      if (data.files) {
        for (const f of data.files) {
          if (f.storagePath) await deleteStorageDocument(f.storagePath);
        }
      }
      await deleteDoc(d.ref);
    }

    // 2. Mark session as expired/cleared
    const sessRef = doc(db, 'customerSessions', sessionId);
    await updateDoc(sessRef, {
      status: 'expired',
      isCleared: true,
      clearedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error purging session data:', error);
  }
}

export function subscribeToSessionMessages(
  sessionId: string,
  onUpdate: (messages: ChatMessage[]) => void
): Unsubscribe {
  const path = `customerSessions/${sessionId}/messages`;
  const q = collection(db, 'customerSessions', sessionId, 'messages');

  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      onUpdate(msgs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
