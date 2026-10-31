import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  Unsubscribe,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { removeUndefinedFields } from '../firebase/utils';
import { PrintJob, JobStatus, FileAttachment, PrintSettings } from '../types';
import { uploadDocument, deleteStorageDocument } from './storageService';

// Allowed state transitions
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  WAITING: ['REVIEWING', 'PRINTING', 'REJECTED', 'EXPIRED', 'DELETED_BY_CUSTOMER'],
  REVIEWING: ['PRINTING', 'WAITING', 'REJECTED', 'EXPIRED', 'DELETED_BY_CUSTOMER'],
  PRINTING: ['PRINTED', 'REJECTED', 'DELETED_BY_CUSTOMER'],
  PRINTED: [],
  REJECTED: [],
  EXPIRED: [],
  DELETED_BY_CUSTOMER: []
};

export async function createPrintJob(params: {
  shopId: string;
  sessionId: string;
  token: string;
  customerName: string;
  files: FileAttachment[];
  settings?: PrintSettings;
}): Promise<PrintJob> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 60 * 1000); // 5-hour TTL

  const jobData: PrintJob = {
    id: jobId,
    shopId: params.shopId,
    sessionId: params.sessionId,
    token: params.token,
    customerName: params.customerName,
    status: 'WAITING',
    totalFiles: params.files.length,
    files: params.files,
    settings: params.settings,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const path = `printJobs/${jobId}`;
  try {
    const jobRef = doc(db, 'printJobs', jobId);
    const cleaned = removeUndefinedFields(jobData);
    await setDoc(jobRef, {
      ...cleaned,
      serverCreatedAt: serverTimestamp(),
    });
    return jobData;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function appendFilesToJob(
  jobId: string,
  newFiles: FileAttachment[],
  settings?: PrintSettings
): Promise<void> {
  const path = `printJobs/${jobId}`;
  try {
    const jobRef = doc(db, 'printJobs', jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists()) return;
    const existing = snap.data() as PrintJob;
    const combinedFiles = [...(existing.files || []), ...newFiles];
    await updateDoc(jobRef, {
      files: combinedFiles,
      totalFiles: combinedFiles.length,
      ...(settings ? { settings } : {}),
      status: 'WAITING',
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getJobById(jobId: string): Promise<PrintJob | null> {
  const path = `printJobs/${jobId}`;
  try {
    const jobRef = doc(db, 'printJobs', jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as PrintJob;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getShopJobs(shopId: string): Promise<PrintJob[]> {
  const path = 'printJobs';
  try {
    const q = query(
      collection(db, 'printJobs'),
      where('shopId', '==', shopId)
    );
    const snap = await getDocs(q);
    const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrintJob));
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return jobs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeToShopJobs(
  shopId: string,
  onUpdate: (jobs: PrintJob[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = 'printJobs';
  const q = query(
    collection(db, 'printJobs'),
    where('shopId', '==', shopId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrintJob));
      jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(jobs);
    },
    (error) => {
      console.error('Snapshot error on printJobs:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToSessionJobs(
  sessionId: string,
  onUpdate: (jobs: PrintJob[]) => void
): Unsubscribe {
  const path = 'printJobs';
  const q = query(
    collection(db, 'printJobs'),
    where('sessionId', '==', sessionId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrintJob));
      jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(jobs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function updateJobStatus(
  jobId: string,
  newStatus: JobStatus,
  rejectionReason?: string
): Promise<void> {
  const path = `printJobs/${jobId}`;
  try {
    const jobRef = doc(db, 'printJobs', jobId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(jobRef);
      if (!snap.exists()) throw new Error('Job not found');

      const currentJob = snap.data() as PrintJob;
      const allowed = VALID_TRANSITIONS[currentJob.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new Error(`Invalid state transition from ${currentJob.status} to ${newStatus}. This job may have already been updated by another operator.`);
      }

      // If transition is to PRINTING, ensure it's not already PRINTING or PRINTED
      if (newStatus === 'PRINTING' && currentJob.status === 'PRINTING') {
        throw new Error('This job is already actively printing on another counter station.');
      }

      const updates: Partial<PrintJob> = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      if (rejectionReason) {
        updates.rejectionReason = rejectionReason;
      }

      transaction.update(jobRef, updates);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateJobSettings(
  jobId: string,
  settings: PrintSettings
): Promise<PrintSettings> {
  const path = `printJobs/${jobId}`;
  try {
    const jobRef = doc(db, 'printJobs', jobId);
    const cleanedSettings = removeUndefinedFields(settings);
    await updateDoc(jobRef, {
      settings: cleanedSettings,
      updatedAt: new Date().toISOString()
    });
    return cleanedSettings;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteJobAndFiles(jobId: string): Promise<void> {
  const path = `printJobs/${jobId}`;
  try {
    const jobRef = doc(db, 'printJobs', jobId);
    const snap = await getDoc(jobRef);
    if (snap.exists()) {
      const job = snap.data() as PrintJob;
      // Delete any storage files
      if (job.files && Array.isArray(job.files)) {
        for (const file of job.files) {
          if (file.storagePath) {
            await deleteStorageDocument(file.storagePath);
          }
        }
      }
      await deleteDoc(jobRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function uploadCustomerFile(
  shopId: string,
  sessionId: string,
  file: File,
  onProgress: (p: number) => void = () => {}
): Promise<{
  downloadUrl: string;
  storagePath: string;
  optimizedSize?: number;
  optimizedType?: string;
}> {
  const tracker = uploadDocument(shopId, sessionId, file, onProgress);
  return await tracker.promise;
}
