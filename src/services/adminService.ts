import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { removeUndefinedFields } from '../firebase/utils';
import { Shop, BlockedSession, AuditLog, SystemSettings, PrintJob, CustomerSession } from '../types';

export async function getAllShops(): Promise<Shop[]> {
  const path = 'shops';
  try {
    const q = query(collection(db, 'shops'));
    const snap = await getDocs(q);
    const shops = snap.docs.map(d => ({ id: d.id, ...d.data() } as Shop));
    shops.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return shops;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function setShopStatus(shopId: string, status: 'active' | 'suspended' | 'blocked' | 'pending' | 'rejected', adminId: string): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const shopRef = doc(db, 'shops', shopId);
    await updateDoc(shopRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    await logAuditEvent({
      action: `SHOP_STATUS_${status.toUpperCase()}`,
      performedBy: adminId,
      targetType: 'shop',
      targetId: shopId,
      details: `Shop ${shopId} status changed to ${status}`
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export const updateShopApproval = setShopStatus;

export async function getAllSessionsAdmin(maxLimit = 50): Promise<CustomerSession[]> {
  const path = 'customerSessions';
  try {
    const q = query(collection(db, 'customerSessions'), limit(maxLimit));
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerSession));
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sessions;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getAllJobsAdmin(maxLimit = 50): Promise<PrintJob[]> {
  const path = 'printJobs';
  try {
    const q = query(collection(db, 'printJobs'), limit(maxLimit));
    const snap = await getDocs(q);
    const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrintJob));
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return jobs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function blockSession(
  sessionId: string,
  shopId: string,
  reason: BlockedSession['reason'],
  blockedBy: string
): Promise<void> {
  const blockId = `blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `blockedSessions/${blockId}`;
  try {
    await setDoc(doc(db, 'blockedSessions', blockId), {
      id: blockId,
      sessionId,
      shopId,
      reason,
      blockedBy,
      active: true,
      createdAt: new Date().toISOString(),
      serverCreatedAt: serverTimestamp(),
    });

    // Update session status
    const sessionRef = doc(db, 'customerSessions', sessionId);
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      await updateDoc(sessionRef, { status: 'blocked' });
    }

    await logAuditEvent({
      action: 'SESSION_BLOCKED',
      performedBy: blockedBy,
      targetType: 'session',
      targetId: sessionId,
      details: `Session blocked due to: ${reason}`
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function unblockSession(blockId: string, unblockedBy: string): Promise<void> {
  const path = `blockedSessions/${blockId}`;
  try {
    const blockRef = doc(db, 'blockedSessions', blockId);
    await updateDoc(blockRef, { active: false });

    await logAuditEvent({
      action: 'SESSION_UNBLOCKED',
      performedBy: unblockedBy,
      targetType: 'session',
      targetId: blockId,
      details: 'Session block lifted'
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getShopBlockedSessions(shopId: string): Promise<BlockedSession[]> {
  const path = 'blockedSessions';
  try {
    const q = query(collection(db, 'blockedSessions'), where('shopId', '==', shopId));
    const snap = await getDocs(q);
    const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() } as BlockedSession));
    blocks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return blocks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getAllBlockedSessions(): Promise<BlockedSession[]> {
  const path = 'blockedSessions';
  try {
    const q = query(collection(db, 'blockedSessions'));
    const snap = await getDocs(q);
    const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() } as BlockedSession));
    blocks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return blocks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function logAuditEvent(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `auditLogs/${logId}`;
  try {
    const cleaned = removeUndefinedFields(entry);
    await setDoc(doc(db, 'auditLogs', logId), {
      ...cleaned,
      id: logId,
      timestamp: new Date().toISOString(),
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit log write error (non-fatal):', err);
  }
}

export async function getAuditLogs(maxLimit = 100): Promise<AuditLog[]> {
  const path = 'auditLogs';
  try {
    const q = query(collection(db, 'auditLogs'), limit(maxLimit));
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return logs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const defaultSettings: SystemSettings = {
    maxFileSizeMb: 50,
    maxFilesPerJob: 10,
    expirationHours: 5,
    allowedExtensions: '.pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx',
    maintenanceMode: false,
    bannerNotice: ''
  };

  try {
    const ref = doc(db, 'systemSettings', 'global');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...defaultSettings, ...snap.data() } as SystemSettings;
    }
    return defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export async function updateSystemSettings(settings: SystemSettings): Promise<void> {
  const path = 'systemSettings/global';
  try {
    const ref = doc(db, 'systemSettings', 'global');
    await setDoc(ref, settings, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
