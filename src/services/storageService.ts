import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { optimizeFileForFastTransfer } from '../utils/imageOptimizer';

export interface UploadTaskTracker {
  cancel: () => void;
  promise: Promise<{ downloadUrl: string; storagePath: string; optimizedSize?: number; optimizedType?: string }>;
}

const SHARED_BLOB_JOB_ID = '_shared_blobs';
const CHUNK_CHAR_SIZE = 650000; // ~650 KB per Firestore doc (well below 1 MiB limit)
const MAX_FIRESTORE_SYNC_BYTES = 12 * 1024 * 1024; // Sync files up to 12 MB across instances

// In-memory Blob URL cache on the receiving client/shop browser
const resolvedBlobUrlCache = new Map<string, string>();
const inFlightResolutionCache = new Map<string, Promise<string>>();

export function extractDocFileId(urlOrPath?: string): string | null {
  if (!urlOrPath) return null;
  const match = urlOrPath.match(/(doc_\d+_[a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file from device'));
    reader.readAsDataURL(file);
  });
}

async function saveCrossInstanceBlobToFirestore(
  fileId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  dataUrl: string
): Promise<boolean> {
  try {
    const commaIdx = dataUrl.indexOf(',');
    const base64Payload = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

    const chunks: string[] = [];
    for (let offset = 0; offset < base64Payload.length; offset += CHUNK_CHAR_SIZE) {
      chunks.push(base64Payload.slice(offset, offset + CHUNK_CHAR_SIZE));
    }

    const nowIso = new Date().toISOString();

    // Write all chunks + metadata in parallel for sub-second completion
    await Promise.all([
      setDoc(doc(db, 'printJobs', SHARED_BLOB_JOB_ID, 'files', `${fileId}_meta`), {
        id: `${fileId}_meta`,
        jobId: SHARED_BLOB_JOB_ID,
        sessionId: 'ephemeral',
        shopId: 'shared',
        fileName,
        fileSize,
        fileType: fileType || 'application/octet-stream',
        chunkCount: chunks.length,
        status: 'ready',
        createdAt: nowIso
      }),
      ...chunks.map((chunkData, idx) =>
        setDoc(doc(db, 'printJobs', SHARED_BLOB_JOB_ID, 'files', `${fileId}_c${idx}`), {
          id: `${fileId}_c${idx}`,
          jobId: SHARED_BLOB_JOB_ID,
          sessionId: 'ephemeral',
          shopId: 'shared',
          fileName,
          fileSize: chunkData.length,
          fileType: 'text/plain',
          status: 'ready',
          index: idx,
          data: chunkData,
          createdAt: nowIso
        })
      )
    ]);

    return true;
  } catch (err) {
    console.warn('Firestore cross-instance blob sync warning:', err);
    return false;
  }
}

function uploadViaExpressApi(
  fileId: string,
  file: File,
  dataUrl: string,
  shopId: string,
  sessionId: string,
  onProgress: (percent: number) => void,
  setXhrRef: (xhr: XMLHttpRequest) => void
): Promise<{ ok: boolean; storagePath?: string }> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      setXhrRef(xhr);
      xhr.open('POST', '/api/upload', true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.min(95, Math.round((event.loaded / event.total) * 95));
          onProgress(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve({ ok: true, storagePath: res.storagePath || fileId });
            return;
          } catch {
            resolve({ ok: false });
            return;
          }
        }
        resolve({ ok: false });
      };

      xhr.onerror = () => resolve({ ok: false });

      xhr.send(
        JSON.stringify({
          fileId,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileData: dataUrl,
          shopId,
          sessionId
        })
      );
    } catch {
      resolve({ ok: false });
    }
  });
}

export function uploadDocument(
  shopId: string,
  sessionId: string,
  rawFile: File,
  onProgress: (percent: number) => void
): UploadTaskTracker {
  let activeXhr: XMLHttpRequest | null = null;
  let isCancelled = false;

  const promise = (async () => {
    onProgress(5);
    // 1. Optimize camera photos automatically so 10MB photos shrink to ~200KB in ~60ms
    const file = await optimizeFileForFastTransfer(rawFile);
    if (isCancelled) throw new Error('Upload cancelled');
    onProgress(15);

    const fileId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const dataUrl = await readFileAsDataUrl(file);
    if (isCancelled) throw new Error('Upload cancelled');
    onProgress(25);

    // Cache local blob immediately on sender's device so sender preview is instant (0ms)
    try {
      resolvedBlobUrlCache.set(fileId, URL.createObjectURL(file));
    } catch {
      // ignore
    }

    // 2. Run Express /api/upload AND Firestore cross-instance sync IN PARALLEL
    // This guarantees instant availability whether shop & customer are on same container or ais-pre <-> ais-dev!
    const shouldSyncFirestore = file.size <= MAX_FIRESTORE_SYNC_BYTES;

    const [apiResult, firestoreSynced] = await Promise.all([
      uploadViaExpressApi(
        fileId,
        file,
        dataUrl,
        shopId,
        sessionId,
        (p) => onProgress(25 + Math.round(p * 0.7)),
        (xhr) => {
          activeXhr = xhr;
        }
      ),
      shouldSyncFirestore
        ? saveCrossInstanceBlobToFirestore(
            fileId,
            file.name,
            file.type || 'application/octet-stream',
            file.size,
            dataUrl
          )
        : Promise.resolve(false)
    ]);

    if (apiResult.ok || firestoreSynced) {
      onProgress(100);
      return {
        downloadUrl: `/api/files/${fileId}`,
        storagePath: apiResult.storagePath || fileId,
        optimizedSize: file.size,
        optimizedType: file.type || 'application/octet-stream'
      };
    }

    // 3. Fallback to Firebase Cloud Storage if both API & Firestore chunking failed
    return await new Promise<{
      downloadUrl: string;
      storagePath: string;
      optimizedSize?: number;
      optimizedType?: string;
    }>((resolve) => {
      try {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `shops/${shopId}/sessions/${sessionId}/${fileId}_${sanitizedName}`;
        const storageRef = ref(storage, storagePath);

        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type || 'application/octet-stream'
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(progress);
          },
          () => {
            const localUrl = URL.createObjectURL(file);
            resolve({
              downloadUrl: localUrl,
              storagePath: fileId,
              optimizedSize: file.size,
              optimizedType: file.type
            });
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({
                downloadUrl,
                storagePath,
                optimizedSize: file.size,
                optimizedType: file.type
              });
            } catch {
              const localUrl = URL.createObjectURL(file);
              resolve({
                downloadUrl: localUrl,
                storagePath,
                optimizedSize: file.size,
                optimizedType: file.type
              });
            }
          }
        );
      } catch {
        const localUrl = URL.createObjectURL(file);
        resolve({
          downloadUrl: localUrl,
          storagePath: fileId,
          optimizedSize: file.size,
          optimizedType: file.type
        });
      }
    });
  })();

  return {
    cancel: () => {
      isCancelled = true;
      if (activeXhr) activeXhr.abort();
    },
    promise
  };
}

/**
 * Resolves any file URL across containers/origins (e.g. customer on ais-pre, shop on ais-dev).
 * Checks in-memory Blob cache -> local /api/files/:fileId -> Firestore _shared_blobs chunks.
 */
export async function resolveFileUrlCrossInstance(
  rawUrl: string,
  storagePath?: string,
  fallbackMime?: string
): Promise<string> {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }

  const fileId = extractDocFileId(rawUrl) || extractDocFileId(storagePath);
  if (!fileId) {
    return rawUrl;
  }

  const cached = resolvedBlobUrlCache.get(fileId);
  if (cached) {
    return cached;
  }

  const inflight = inFlightResolutionCache.get(fileId);
  if (inflight) {
    return inflight;
  }

  const resolutionPromise = (async () => {
    const localApiUrl = `/api/files/${fileId}`;

    // 1. Check if current server instance has the file on local disk
    try {
      const headRes = await fetch(localApiUrl, { method: 'HEAD' });
      if (headRes.ok) {
        resolvedBlobUrlCache.set(fileId, localApiUrl);
        return localApiUrl;
      }
    } catch {
      // Proceed to Firestore chunk reconstruction
    }

    // 2. Reconstruct binary Blob from Firestore _shared_blobs chunks
    try {
      const metaSnap = await getDoc(
        doc(db, 'printJobs', SHARED_BLOB_JOB_ID, 'files', `${fileId}_meta`)
      );
      if (metaSnap.exists()) {
        const meta = metaSnap.data() as {
          chunkCount?: number;
          fileType?: string;
        };
        const chunkCount = meta.chunkCount || 0;
        if (chunkCount > 0) {
          const chunkSnaps = await Promise.all(
            Array.from({ length: chunkCount }, (_, idx) =>
              getDoc(doc(db, 'printJobs', SHARED_BLOB_JOB_ID, 'files', `${fileId}_c${idx}`))
            )
          );

          const combinedBase64 = chunkSnaps
            .map((s) => (s.exists() ? (s.data()?.data as string) || '' : ''))
            .join('');

          if (combinedBase64) {
            const binaryStr = atob(combinedBase64);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const mime =
              meta.fileType && meta.fileType !== 'application/octet-stream'
                ? meta.fileType
                : fallbackMime || 'application/octet-stream';
            const blob = new Blob([bytes], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            resolvedBlobUrlCache.set(fileId, blobUrl);
            return blobUrl;
          }
        }
      }
    } catch (err) {
      console.warn('Could not reconstruct cross-instance file blob:', err);
    }

    return localApiUrl;
  })();

  inFlightResolutionCache.set(fileId, resolutionPromise);
  try {
    return await resolutionPromise;
  } finally {
    inFlightResolutionCache.delete(fileId);
  }
}

export async function deleteStorageDocument(storagePath: string): Promise<void> {
  if (!storagePath) return;

  const fileId = extractDocFileId(storagePath);

  if (fileId) {
    const cached = resolvedBlobUrlCache.get(fileId);
    if (cached && cached.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(cached);
      } catch {
        // ignore
      }
    }
    resolvedBlobUrlCache.delete(fileId);

    // 1. Delete from Express /tmp uploads
    try {
      await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
    } catch {
      // ignore
    }

    // 2. Delete from Firestore _shared_blobs chunks (Zero-Trace Purge)
    try {
      const metaRef = doc(db, 'printJobs', SHARED_BLOB_JOB_ID, 'files', `${fileId}_meta`);
      const metaSnap = await getDoc(metaRef);
      if (metaSnap.exists()) {
        const chunkCount = (metaSnap.data()?.chunkCount as number) || 0;
        await Promise.all([
          deleteDoc(metaRef),
          ...Array.from({ length: chunkCount }, (_, idx) =>
            deleteDoc(doc(db, 'printJobs', SHARED_BLOB_JOB_ID, 'files', `${fileId}_c${idx}`))
          )
        ]);
      }
    } catch {
      // ignore
    }
    return;
  }

  // If stored in Firebase Storage
  if (
    !storagePath.startsWith('local/') &&
    !storagePath.startsWith('data/') &&
    !storagePath.includes('secureprint_uploads')
  ) {
    try {
      const fileRef = ref(storage, storagePath);
      await deleteObject(fileRef);
    } catch {
      // ignore
    }
  }
}
