import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { removeUndefinedFields } from '../firebase/utils';
import { Shop } from '../types';

export async function createShopProfile(shopData: Omit<Shop, 'createdAt' | 'updatedAt'>): Promise<Shop> {
  const path = `shops/${shopData.id}`;
  try {
    const shopRef = doc(db, 'shops', shopData.id);
    const nowIso = new Date().toISOString();
    const cleaned = removeUndefinedFields(shopData);
    await setDoc(shopRef, {
      ...cleaned,
      createdAt: nowIso,
      updatedAt: nowIso,
      serverCreatedAt: serverTimestamp(),
    });
    return {
      ...shopData,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getShop(shopId: string): Promise<Shop | null> {
  const path = `shops/${shopId}`;
  try {
    const shopRef = doc(db, 'shops', shopId);
    const snap = await getDoc(shopRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Shop;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getShopForUser(uid: string, email?: string | null): Promise<Shop | null> {
  // 1. Primary lookup by Firebase Auth UID
  if (uid) {
    const byUid = await getShop(uid);
    if (byUid) return byUid;
  }

  // 2. Fallback lookup by registered email (case-normalized and raw)
  const trimmedEmail = (email || '').trim();
  if (!trimmedEmail) return null;

  const path = 'shops';
  try {
    const lowerEmail = trimmedEmail.toLowerCase();
    let q = query(collection(db, 'shops'), where('email', '==', lowerEmail));
    let snap = await getDocs(q);
    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as Shop;
    }

    if (trimmedEmail !== lowerEmail) {
      q = query(collection(db, 'shops'), where('email', '==', trimmedEmail));
      snap = await getDocs(q);
      if (!snap.empty) {
        const firstDoc = snap.docs[0];
        return { id: firstDoc.id, ...firstDoc.data() } as Shop;
      }
    }

    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
}

export async function getShopByPublicCode(publicCode: string): Promise<Shop | null> {
  const path = 'shops';
  try {
    const raw = (publicCode || '').trim();
    if (!raw) return null;

    // 1. Try lowercase
    let q = query(collection(db, 'shops'), where('publicCode', '==', raw.toLowerCase()));
    let snap = await getDocs(q);
    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as Shop;
    }

    // 2. Try exact raw string
    q = query(collection(db, 'shops'), where('publicCode', '==', raw));
    snap = await getDocs(q);
    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as Shop;
    }

    // 3. Try uppercase
    q = query(collection(db, 'shops'), where('publicCode', '==', raw.toUpperCase()));
    snap = await getDocs(q);
    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as Shop;
    }

    // 4. Fallback: Check if the string is the direct shop document ID
    const directDoc = await getDoc(doc(db, 'shops', raw));
    if (directDoc.exists()) {
      return { id: directDoc.id, ...directDoc.data() } as Shop;
    }

    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
}

export async function toggleShopStatus(shopId: string, isOpen: boolean): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const shopRef = doc(db, 'shops', shopId);
    await updateDoc(shopRef, {
      isOpen,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateShopProfile(shopId: string, updates: Partial<Shop>): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const shopRef = doc(db, 'shops', shopId);
    const cleaned = removeUndefinedFields(updates);
    await updateDoc(shopRef, {
      ...cleaned,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
