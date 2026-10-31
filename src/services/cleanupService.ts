import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { CustomerSession, PrintJob } from '../types';
import { logAuditEvent } from './adminService';

export interface CleanupResult {
  expiredSessionsCount: number;
  expiredJobsCount: number;
  deletedFilesCount: number;
  timestamp: string;
}

/**
 * 5-Hour Session & File Expiration Cleanup Engine
 * Evaluates all sessions and jobs whose expiresAt is in the past.
 * Deletes associated storage files, purges or marks expired records,
 * and records an immutable audit trail.
 */
export async function run5HourExpirationCleanup(adminActor = 'system-ttl-cron'): Promise<CleanupResult> {
  const now = new Date().toISOString();
  let expiredSessionsCount = 0;
  let expiredJobsCount = 0;
  let deletedFilesCount = 0;

  try {
    // 1. Scan customerSessions where expiresAt <= now
    const sessionsRef = collection(db, 'customerSessions');
    const sessionSnap = await getDocs(sessionsRef);

    for (const sessionDoc of sessionSnap.docs) {
      const data = sessionDoc.data() as CustomerSession;
      const isExpired = data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now();

      if (isExpired && data.status !== 'expired') {
        // Mark session as expired or purge
        await updateDoc(doc(db, 'customerSessions', sessionDoc.id), {
          status: 'expired',
          updatedAt: now
        });
        expiredSessionsCount++;
      }
    }

    // 2. Scan printJobs where expiresAt <= now
    const jobsRef = collection(db, 'printJobs');
    const jobsSnap = await getDocs(jobsRef);

    for (const jobDoc of jobsSnap.docs) {
      const jobData = jobDoc.data() as PrintJob;
      const isExpired = jobData.expiresAt && new Date(jobData.expiresAt).getTime() <= Date.now();

      if (isExpired && jobData.status !== 'EXPIRED') {
        // Attempt file deletion from Storage if URLs present
        if (jobData.files && Array.isArray(jobData.files)) {
          for (const file of jobData.files) {
            try {
              if (file.downloadUrl) {
                const name = file.fileName || file.name || 'document';
                // Parse storage ref from URL if possible
                const fileRef = ref(storage, `jobs/${jobDoc.id}/${name}`);
                await deleteObject(fileRef).catch(() => {
                  // Storage object may already be purged
                });
                deletedFilesCount++;
              }
            } catch (storageErr) {
              console.warn('Storage purge warning for file:', file.fileName || file.name, storageErr);
            }
          }
        }

        // Update status to EXPIRED in Firestore
        await updateDoc(doc(db, 'printJobs', jobDoc.id), {
          status: 'EXPIRED',
          updatedAt: now
        });
        expiredJobsCount++;
      }
    }

    // 3. Log audit event
    if (expiredSessionsCount > 0 || expiredJobsCount > 0) {
      await logAuditEvent({
        action: 'TTL_5H_PURGE_COMPLETED',
        performedBy: adminActor,
        targetType: 'system',
        targetId: 'cron-cleanup',
        details: `Purged ${expiredSessionsCount} expired sessions, ${expiredJobsCount} jobs, and deleted ${deletedFilesCount} storage objects.`
      });
    }

    return {
      expiredSessionsCount,
      expiredJobsCount,
      deletedFilesCount,
      timestamp: now
    };
  } catch (error) {
    console.error('5-Hour Expiration cleanup error:', error);
    throw error;
  }
}
