import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Persistence,
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  onIdTokenChanged,
  setPersistence,
  signInAnonymously
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { useAuth } from '../firebase/context';
import {
  bindGuestToCustomerSession,
  subscribeToCustomerSession
} from '../services/sessionService';
import { getShopByPublicCode } from '../services/shopService';
import { getAllShops } from '../services/adminService';
import { CustomerSession, Shop } from '../types';

export type CustomerSessionPhase =
  | 'authenticating'
  | 'verifying_context'
  | 'ready'
  | 'expired'
  | 'blocked'
  | 'not_found'
  | 'error';

export interface PersistedCustomerSessionRecord {
  sessionId: string;
  shopId: string;
  shopPublicCode: string;
  sessionToken: string;
  clientAuthToken: string;
  guestUid: string;
  isAnonymous: boolean;
  customerName: string;
  expiresAt: string;
  validatedAt: string;
}

export interface UseCustomerSessionOptions {
  expectedShopId?: string | null;
  expectedShopCode?: string | null;
}

export interface SessionShopVerificationChecks {
  hasMatchingSessionId: boolean;
  hasValidSessionToken: boolean;
  hasShopContext: boolean;
  shopIdMatchesSession: boolean;
  expectedShopIdMatches: boolean;
  expectedShopCodeMatches: boolean;
  sessionActiveAndUnblocked: boolean;
  shopActive: boolean;
  ttlValid: boolean;
  guestAuthenticated: boolean;
}

export interface SessionShopVerificationResult {
  verified: boolean;
  failurePhase: CustomerSessionPhase | null;
  reason: string;
  normalizedToken: string | null;
  checks: SessionShopVerificationChecks;
}

export interface UseCustomerSessionResult {
  phase: CustomerSessionPhase;
  loading: boolean;
  isReady: boolean;
  isGuestAuthenticated: boolean;
  isAnonymousFirebaseUser: boolean;
  isTokenVerified: boolean;
  guestUid: string | null;
  sessionToken: string | null;
  firebaseUser: User | null;
  session: CustomerSession | null;
  shop: Shop | null;
  recoverableSession: PersistedCustomerSessionRecord | null;
  error: string | null;
  remainingTime: string;
  retry: () => void;
}

const TRACE_PREFIX = '[CustomerSession]';
const LOCAL_GUEST_UID_KEY = 'secureprint_fallback_guest_uid';
const LOCAL_GUEST_TOKEN_KEY = 'secureprint_fallback_guest_token';
const SESSION_REGISTRY_KEY = 'secureprint_session_registry_v2';
const ACTIVE_SESSION_POINTER_KEY = 'secureprint_active_session_v2';
const LEGACY_SHOP_SESSION_PREFIX = 'secureprint_sess_';

// In-memory caches guarantee zero session loss across SPA route transitions (/scan <-> /s/:id <-> /c/:id)
// even in browsers or sandboxed iframes that block localStorage / IndexedDB.
const memorySessionByShopId = new Map<string, PersistedCustomerSessionRecord>();
const memorySessionById = new Map<string, PersistedCustomerSessionRecord>();
const verifiedShopCache = new Map<string, Shop>();

let persistenceSetupPromise: Promise<string> | null = null;
let configuredPersistenceTier = 'uninitialized';
let inflightGuestAuthPromise: Promise<CustomerAnonymousAuthResult> | null = null;

export interface CustomerAnonymousAuthResult {
  uid: string;
  authToken: string;
  firebaseUser: User | null;
  isAnonymousFirebaseUser: boolean;
}

/**
 * Redacts sensitive Firebase ID tokens / fallback bearer strings before logging to the browser console.
 * Queue desk tokens (e.g. `#482731`) are logged separately via `sessionToken`.
 */
function maskAuthToken(rawToken?: string | null): string {
  if (!rawToken) return 'none';
  if (rawToken.startsWith('uid_')) {
    return `uid_ref(len=${rawToken.length})`;
  }
  if (rawToken.startsWith('gtok_')) {
    return `guest_fallback(len=${rawToken.length}, prefix=${rawToken.slice(0, 9)}...)`;
  }
  if (rawToken.startsWith('tok_')) {
    return `session_ref(len=${rawToken.length})`;
  }
  return `jwt(len=${rawToken.length}, prefix=${rawToken.slice(0, 6)}...)`;
}

function traceInfo(event: string, details: Record<string, unknown> = {}): void {
  console.info(`${TRACE_PREFIX} ${event}`, details);
}

function traceDebug(event: string, details: Record<string, unknown> = {}): void {
  console.debug(`${TRACE_PREFIX} ${event}`, details);
}

function traceWarn(event: string, details: Record<string, unknown> = {}): void {
  console.warn(`${TRACE_PREFIX} ${event}`, details);
}

function traceError(event: string, details: Record<string, unknown> = {}): void {
  console.error(`${TRACE_PREFIX} ${event}`, details);
}

function normalizeDeskToken(token?: string | null): string | null {
  const trimmed = token?.trim() || '';
  return trimmed.length > 0 ? trimmed : null;
}

function generateRandomHex(length = 24): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, length);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.slice(0, length);
}

function safeReadStorage(key: string): string | null {
  try {
    const fromSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    if (fromSession) return fromSession;
  } catch {
    // ignore storage access restrictions
  }
  try {
    const fromLocal = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (fromLocal) return fromLocal;
  } catch {
    // ignore storage access restrictions
  }
  return null;
}

function safeWriteStorage(key: string, value: string): { sessionSaved: boolean; localSaved: boolean } {
  let sessionSaved = false;
  let localSaved = false;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
      sessionSaved = true;
    }
  } catch {
    // ignore quota / security errors
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      localSaved = true;
    }
  } catch {
    // ignore quota / security errors
  }
  return { sessionSaved, localSaved };
}

function safeRemoveStorage(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function isFutureTimestamp(iso?: string): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

function readRegistryMap(): Record<string, PersistedCustomerSessionRecord> {
  const raw = safeReadStorage(SESSION_REGISTRY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, PersistedCustomerSessionRecord>;
    }
  } catch {
    traceWarn('storage:corrupted_registry_reset', { key: SESSION_REGISTRY_KEY });
  }
  return {};
}

function writeRegistryMap(registry: Record<string, PersistedCustomerSessionRecord>): void {
  safeWriteStorage(SESSION_REGISTRY_KEY, JSON.stringify(registry));
}

export function primeVerifiedShopCache(shop: Shop | null | undefined): void {
  if (!shop?.id) return;
  verifiedShopCache.set(shop.id, shop);
  traceDebug('shop:cache_primed', {
    shopId: shop.id,
    shopPublicCode: shop.publicCode || null,
    shopStatus: shop.status || 'active'
  });
}

/**
 * Verifies all invariants required for a customer session token to be validly associated
 * with a resolved shop counter context.
 */
export function verifySessionShopAssociation(params: {
  requestedSessionId: string;
  session: CustomerSession | null | undefined;
  shop: Shop | null | undefined;
  guestUid?: string | null;
  clientAuthToken?: string | null;
  expectedShopId?: string | null;
  expectedShopCode?: string | null;
}): SessionShopVerificationResult {
  const {
    requestedSessionId,
    session,
    shop,
    guestUid,
    clientAuthToken,
    expectedShopId,
    expectedShopCode
  } = params;

  const cleanRequestedId = requestedSessionId.trim();
  const normalizedToken = normalizeDeskToken(session?.token);
  const normalizedExpectedShopId = expectedShopId?.trim() || null;
  const normalizedExpectedCode = expectedShopCode?.trim().toLowerCase() || null;

  const hasMatchingSessionId = Boolean(
    cleanRequestedId && session?.id && session.id === cleanRequestedId
  );
  const hasValidSessionToken = Boolean(normalizedToken);
  const hasShopContext = Boolean(session?.shopId && shop?.id);
  const shopIdMatchesSession = Boolean(
    session?.shopId && shop?.id && session.shopId === shop.id
  );
  const expectedShopIdMatches = Boolean(
    !normalizedExpectedShopId || (session?.shopId && session.shopId === normalizedExpectedShopId)
  );
  const expectedShopCodeMatches = Boolean(
    !normalizedExpectedCode ||
      (shop &&
        (shop.publicCode?.trim().toLowerCase() === normalizedExpectedCode ||
          shop.id.trim().toLowerCase() === normalizedExpectedCode ||
          (Boolean(session?.shopPublicCode) &&
            session!.shopPublicCode!.trim().toLowerCase() === normalizedExpectedCode)))
  );
  const sessionActiveAndUnblocked = Boolean(
    session && !session.isBlocked && session.status !== 'blocked'
  );
  const shopActive = Boolean(
    shop && shop.status !== 'blocked' && shop.status !== 'suspended'
  );
  const ttlValid = Boolean(
    session && session.status !== 'expired' && isFutureTimestamp(session.expiresAt)
  );
  const guestAuthenticated = Boolean(
    guestUid && guestUid.trim().length > 0 && clientAuthToken && clientAuthToken.trim().length > 0
  );

  const checks: SessionShopVerificationChecks = {
    hasMatchingSessionId,
    hasValidSessionToken,
    hasShopContext,
    shopIdMatchesSession,
    expectedShopIdMatches,
    expectedShopCodeMatches,
    sessionActiveAndUnblocked,
    shopActive,
    ttlValid,
    guestAuthenticated
  };

  if (!session) {
    return {
      verified: false,
      failurePhase: 'not_found',
      reason: 'session_missing',
      normalizedToken,
      checks
    };
  }

  if (!hasMatchingSessionId) {
    return {
      verified: false,
      failurePhase: 'error',
      reason: 'session_id_mismatch',
      normalizedToken,
      checks
    };
  }

  if (!hasValidSessionToken || !session.shopId) {
    return {
      verified: false,
      failurePhase: 'error',
      reason: 'incomplete_session_token_or_shop_id',
      normalizedToken,
      checks
    };
  }

  if (!sessionActiveAndUnblocked) {
    return {
      verified: false,
      failurePhase: 'blocked',
      reason: 'session_blocked_by_shop',
      normalizedToken,
      checks
    };
  }

  if (!ttlValid) {
    return {
      verified: false,
      failurePhase: 'expired',
      reason: 'session_ttl_expired',
      normalizedToken,
      checks
    };
  }

  if (!expectedShopIdMatches) {
    return {
      verified: false,
      failurePhase: 'error',
      reason: 'expected_shop_id_mismatch',
      normalizedToken,
      checks
    };
  }

  if (!shop || !shopIdMatchesSession) {
    return {
      verified: false,
      failurePhase: 'error',
      reason: 'shop_context_unverified_or_mismatched',
      normalizedToken,
      checks
    };
  }

  if (!shopActive) {
    return {
      verified: false,
      failurePhase: 'blocked',
      reason: 'shop_counter_unavailable',
      normalizedToken,
      checks
    };
  }

  if (!expectedShopCodeMatches) {
    return {
      verified: false,
      failurePhase: 'error',
      reason: 'expected_shop_code_mismatch',
      normalizedToken,
      checks
    };
  }

  if (!guestAuthenticated) {
    return {
      verified: false,
      failurePhase: 'authenticating',
      reason: 'guest_auth_not_ready',
      normalizedToken,
      checks
    };
  }

  return {
    verified: true,
    failurePhase: null,
    reason: 'verified',
    normalizedToken,
    checks
  };
}

/**
 * Persists a validated customer session record keyed by `shopId` and indexed by `sessionId`
 * across memory, sessionStorage, and localStorage so navigation between the QR scanner,
 * shop landing page, and chat window never drops session state.
 */
export function persistValidatedCustomerSession(record: PersistedCustomerSessionRecord): void {
  const normalizedToken = normalizeDeskToken(record.sessionToken);
  if (!record.sessionId || !record.shopId || !normalizedToken) {
    traceWarn('storage:persist_rejected_incomplete_record', {
      sessionId: record.sessionId || null,
      shopId: record.shopId || null,
      hasSessionToken: Boolean(normalizedToken)
    });
    return;
  }
  if (!isFutureTimestamp(record.expiresAt)) {
    traceWarn('storage:persist_rejected_expired_record', {
      sessionId: record.sessionId,
      shopId: record.shopId,
      sessionToken: normalizedToken,
      expiresAt: record.expiresAt
    });
    return;
  }

  const normalizedRecord: PersistedCustomerSessionRecord = {
    ...record,
    sessionToken: normalizedToken
  };

  memorySessionByShopId.set(normalizedRecord.shopId, normalizedRecord);
  memorySessionById.set(normalizedRecord.sessionId, normalizedRecord);

  const registry = readRegistryMap();
  // Prune any expired entries while saving
  for (const [key, entry] of Object.entries(registry)) {
    if (!entry || !isFutureTimestamp(entry.expiresAt)) {
      delete registry[key];
    }
  }
  registry[normalizedRecord.shopId] = normalizedRecord;
  writeRegistryMap(registry);

  const pointerWrite = safeWriteStorage(
    ACTIVE_SESSION_POINTER_KEY,
    JSON.stringify(normalizedRecord)
  );
  safeWriteStorage(
    `${LEGACY_SHOP_SESSION_PREFIX}${normalizedRecord.shopId}`,
    normalizedRecord.sessionId
  );

  traceDebug('storage:session_token_persisted', {
    sessionId: normalizedRecord.sessionId,
    sessionToken: normalizedRecord.sessionToken,
    shopId: normalizedRecord.shopId,
    shopPublicCode: normalizedRecord.shopPublicCode || null,
    guestUid: normalizedRecord.guestUid || null,
    isAnonymous: normalizedRecord.isAnonymous,
    clientAuthToken: maskAuthToken(normalizedRecord.clientAuthToken),
    persistedLayers: {
      memory: true,
      sessionStorage: pointerWrite.sessionSaved,
      localStorage: pointerWrite.localSaved
    }
  });
}

/**
 * Removes persisted session tokens for a specific `sessionId` and/or `shopId`.
 */
export function clearPersistedCustomerSession(params: {
  sessionId?: string | null;
  shopId?: string | null;
}): void {
  const { sessionId, shopId } = params;

  traceDebug('storage:clear_persisted_session', {
    sessionId: sessionId || null,
    shopId: shopId || null
  });

  if (sessionId) {
    const cached = memorySessionById.get(sessionId);
    memorySessionById.delete(sessionId);
    if (cached && (!shopId || cached.shopId === shopId)) {
      const currentForShop = memorySessionByShopId.get(cached.shopId);
      if (currentForShop?.sessionId === sessionId) {
        memorySessionByShopId.delete(cached.shopId);
      }
    }
  }

  if (shopId) {
    const shopEntry = memorySessionByShopId.get(shopId);
    if (!sessionId || shopEntry?.sessionId === sessionId) {
      memorySessionByShopId.delete(shopId);
      safeRemoveStorage(`${LEGACY_SHOP_SESSION_PREFIX}${shopId}`);
    }
  }

  const registry = readRegistryMap();
  let mutated = false;
  for (const [key, entry] of Object.entries(registry)) {
    const matchByShop = Boolean(shopId && key === shopId && (!sessionId || entry?.sessionId === sessionId));
    const matchBySession = Boolean(sessionId && entry?.sessionId === sessionId);
    if (matchByShop || matchBySession || !isFutureTimestamp(entry?.expiresAt)) {
      delete registry[key];
      if (entry?.shopId) {
        safeRemoveStorage(`${LEGACY_SHOP_SESSION_PREFIX}${entry.shopId}`);
      }
      mutated = true;
    }
  }
  if (mutated) {
    writeRegistryMap(registry);
  }

  const activeRaw = safeReadStorage(ACTIVE_SESSION_POINTER_KEY);
  if (activeRaw) {
    try {
      const active = JSON.parse(activeRaw) as PersistedCustomerSessionRecord;
      if (
        (sessionId && active.sessionId === sessionId) ||
        (shopId && active.shopId === shopId && !sessionId) ||
        !isFutureTimestamp(active.expiresAt)
      ) {
        safeRemoveStorage(ACTIVE_SESSION_POINTER_KEY);
      }
    } catch {
      safeRemoveStorage(ACTIVE_SESSION_POINTER_KEY);
    }
  }
}

/**
 * Retrieves and validates a persisted session record for a given `shopId` (and optional `shopPublicCode`).
 * Returns `null` and evicts stale storage if expired or mismatched against the shop ID.
 */
export function getPersistedSessionForShop(
  shopId: string,
  expectedShopCode?: string | null
): PersistedCustomerSessionRecord | null {
  if (!shopId) return null;
  const normalizedCode = expectedShopCode?.trim().toLowerCase() || null;

  const fromMemory = memorySessionByShopId.get(shopId);
  const registry = readRegistryMap();
  const candidate = fromMemory || registry[shopId] || null;

  if (!candidate) return null;

  const isExpired = !isFutureTimestamp(candidate.expiresAt);
  const shopIdMismatch = candidate.shopId !== shopId;
  const missingToken = !normalizeDeskToken(candidate.sessionToken) || !candidate.sessionId;
  const codeMismatch =
    Boolean(normalizedCode) &&
    Boolean(candidate.shopPublicCode) &&
    candidate.shopPublicCode.trim().toLowerCase() !== normalizedCode &&
    candidate.shopId.toLowerCase() !== normalizedCode;

  if (isExpired || shopIdMismatch || missingToken || codeMismatch) {
    traceWarn('storage:evicted_invalid_shop_session', {
      requestedShopId: shopId,
      expectedShopCode: normalizedCode,
      candidateSessionId: candidate.sessionId || null,
      candidateShopId: candidate.shopId || null,
      candidateToken: candidate.sessionToken || null,
      reasons: { isExpired, shopIdMismatch, missingToken, codeMismatch }
    });
    clearPersistedCustomerSession({ sessionId: candidate.sessionId, shopId });
    return null;
  }

  memorySessionByShopId.set(shopId, candidate);
  memorySessionById.set(candidate.sessionId, candidate);
  return candidate;
}

/**
 * Retrieves a persisted session record by `sessionId` and validates it against any
 * expected `shopId` or `shopPublicCode`.
 */
export function getPersistedSessionById(
  sessionId: string,
  expectedShopId?: string | null,
  expectedShopCode?: string | null
): PersistedCustomerSessionRecord | null {
  if (!sessionId) return null;

  let candidate: PersistedCustomerSessionRecord | null = memorySessionById.get(sessionId) || null;
  let source: 'memory' | 'active_pointer' | 'registry' = 'memory';

  if (!candidate) {
    const activeRaw = safeReadStorage(ACTIVE_SESSION_POINTER_KEY);
    if (activeRaw) {
      try {
        const parsed = JSON.parse(activeRaw) as PersistedCustomerSessionRecord;
        if (parsed?.sessionId === sessionId) {
          candidate = parsed;
          source = 'active_pointer';
        }
      } catch {
        // ignore
      }
    }
  }

  if (!candidate) {
    const registry = readRegistryMap();
    for (const entry of Object.values(registry)) {
      if (entry?.sessionId === sessionId) {
        candidate = entry;
        source = 'registry';
        break;
      }
    }
  }

  if (!candidate) return null;

  const isExpired = !isFutureTimestamp(candidate.expiresAt);
  const missingTokenOrShop = !normalizeDeskToken(candidate.sessionToken) || !candidate.shopId;
  if (isExpired || missingTokenOrShop) {
    traceWarn('storage:evicted_invalid_session_by_id', {
      sessionId,
      source,
      isExpired,
      missingTokenOrShop
    });
    clearPersistedCustomerSession({ sessionId });
    return null;
  }

  if (expectedShopId && candidate.shopId !== expectedShopId) {
    traceWarn('storage:persisted_session_shop_id_mismatch', {
      sessionId,
      persistedShopId: candidate.shopId,
      expectedShopId,
      sessionToken: candidate.sessionToken
    });
    return null;
  }

  const normalizedCode = expectedShopCode?.trim().toLowerCase() || null;
  if (
    normalizedCode &&
    candidate.shopPublicCode &&
    candidate.shopPublicCode.trim().toLowerCase() !== normalizedCode &&
    candidate.shopId.toLowerCase() !== normalizedCode
  ) {
    traceWarn('storage:persisted_session_shop_code_mismatch', {
      sessionId,
      persistedShopCode: candidate.shopPublicCode,
      persistedShopId: candidate.shopId,
      expectedShopCode: normalizedCode,
      sessionToken: candidate.sessionToken
    });
    return null;
  }

  memorySessionByShopId.set(candidate.shopId, candidate);
  memorySessionById.set(candidate.sessionId, candidate);
  return candidate;
}

function verifyPersistedShopTokenBinding(params: {
  sessionId: string;
  shopId: string;
  shopPublicCode?: string | null;
  expectedToken: string;
  expectedGuestUid: string;
}): boolean {
  const { sessionId, shopId, shopPublicCode, expectedToken, expectedGuestUid } = params;
  const normalizedExpectedToken = normalizeDeskToken(expectedToken);
  if (!normalizedExpectedToken) return false;

  const byShop = getPersistedSessionForShop(shopId, shopPublicCode);
  const byId = getPersistedSessionById(sessionId, shopId, shopPublicCode);

  const verified = Boolean(
    byShop &&
      byId &&
      byShop.sessionId === sessionId &&
      byShop.shopId === shopId &&
      byShop.sessionToken === normalizedExpectedToken &&
      byId.sessionId === sessionId &&
      byId.shopId === shopId &&
      byId.sessionToken === normalizedExpectedToken &&
      (!expectedGuestUid || byShop.guestUid === expectedGuestUid)
  );

  if (verified) {
    traceInfo('verify:token_shop_binding_confirmed', {
      sessionId,
      sessionToken: normalizedExpectedToken,
      shopId,
      shopPublicCode: shopPublicCode || byShop?.shopPublicCode || null,
      guestUid: expectedGuestUid || null
    });
  } else {
    traceError('verify:token_shop_binding_failed', {
      sessionId,
      expectedToken: normalizedExpectedToken,
      shopId,
      shopPublicCode: shopPublicCode || null,
      expectedGuestUid: expectedGuestUid || null,
      persistedByShopSessionId: byShop?.sessionId || null,
      persistedByShopToken: byShop?.sessionToken || null,
      persistedByIdShopId: byId?.shopId || null,
      persistedByIdToken: byId?.sessionToken || null
    });
  }

  return verified;
}

function findRecoverableSessionByContext(
  expectedShopId?: string | null,
  expectedShopCode?: string | null
): PersistedCustomerSessionRecord | null {
  if (expectedShopId) {
    const byId = getPersistedSessionForShop(expectedShopId, expectedShopCode);
    if (byId) return byId;
  }

  const normalizedCode = expectedShopCode?.trim().toLowerCase() || null;
  if (!normalizedCode) return null;

  for (const record of memorySessionByShopId.values()) {
    if (
      isFutureTimestamp(record.expiresAt) &&
      normalizeDeskToken(record.sessionToken) &&
      (record.shopPublicCode?.toLowerCase() === normalizedCode ||
        record.shopId.toLowerCase() === normalizedCode)
    ) {
      return record;
    }
  }

  const registry = readRegistryMap();
  for (const record of Object.values(registry)) {
    if (
      record &&
      isFutureTimestamp(record.expiresAt) &&
      normalizeDeskToken(record.sessionToken) &&
      (record.shopPublicCode?.toLowerCase() === normalizedCode ||
        record.shopId.toLowerCase() === normalizedCode)
    ) {
      memorySessionByShopId.set(record.shopId, record);
      memorySessionById.set(record.sessionId, record);
      return record;
    }
  }

  return null;
}

function getOrCreateFallbackGuestIdentity(): { uid: string; authToken: string; createdNew: boolean } {
  const existingUid = safeReadStorage(LOCAL_GUEST_UID_KEY);
  const existingToken = safeReadStorage(LOCAL_GUEST_TOKEN_KEY);

  const reusingExisting = Boolean(
    existingUid && existingUid.startsWith('guest_') && existingToken && existingToken.startsWith('gtok_')
  );

  const uid =
    existingUid && existingUid.startsWith('guest_')
      ? existingUid
      : `guest_${generateRandomHex(16)}`;
  const authToken =
    existingToken && existingToken.startsWith('gtok_')
      ? existingToken
      : `gtok_${generateRandomHex(24)}`;

  safeWriteStorage(LOCAL_GUEST_UID_KEY, uid);
  safeWriteStorage(LOCAL_GUEST_TOKEN_KEY, authToken);
  return { uid, authToken, createdNew: !reusingExisting };
}

async function ensureFirebaseAuthPersistence(): Promise<string> {
  if (persistenceSetupPromise) {
    return persistenceSetupPromise;
  }

  persistenceSetupPromise = (async (): Promise<string> => {
    // If a user is already hydrated on auth, avoid resetting persistence underneath them
    if (auth.currentUser) {
      configuredPersistenceTier = 'pre_hydrated_auth_instance';
      traceDebug('auth:persistence_skipped_existing_user', {
        uid: auth.currentUser.uid,
        isAnonymous: auth.currentUser.isAnonymous
      });
      return configuredPersistenceTier;
    }

    const candidates: Array<{ tier: string; persistence: Persistence }> = [
      { tier: 'browserLocalPersistence', persistence: browserLocalPersistence },
      { tier: 'browserSessionPersistence', persistence: browserSessionPersistence },
      { tier: 'inMemoryPersistence', persistence: inMemoryPersistence }
    ];

    for (const candidate of candidates) {
      try {
        await setPersistence(auth, candidate.persistence);
        configuredPersistenceTier = candidate.tier;
        traceInfo('auth:persistence_configured', { tier: candidate.tier });
        return candidate.tier;
      } catch (err) {
        traceWarn('auth:persistence_tier_rejected', {
          tier: candidate.tier,
          code: (err as { code?: string })?.code || 'unknown'
        });
      }
    }

    configuredPersistenceTier = 'default_unmodified';
    traceWarn('auth:persistence_all_tiers_rejected_using_default');
    return configuredPersistenceTier;
  })();

  return persistenceSetupPromise;
}

async function waitForHydratedFirebaseUser(timeoutMs = 3500): Promise<User | null> {
  const startedAt = Date.now();
  if (auth.currentUser) {
    traceDebug('auth:hydration_resolved', {
      source: 'immediate_current_user',
      durationMs: 0,
      hasUser: true,
      uid: auth.currentUser.uid,
      isAnonymous: auth.currentUser.isAnonymous
    });
    return auth.currentUser;
  }

  return new Promise<User | null>((resolve) => {
    let settled = false;
    const finish = (u: User | null, source: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      traceDebug('auth:hydration_resolved', {
        source,
        durationMs: Date.now() - startedAt,
        hasUser: Boolean(u),
        uid: u?.uid || null,
        isAnonymous: u?.isAnonymous ?? null
      });
      resolve(u);
    };

    const timer = window.setTimeout(() => {
      finish(auth.currentUser, 'timeout_guard');
    }, timeoutMs);

    const maybeAuthReady = (auth as unknown as { authStateReady?: () => Promise<void> })
      .authStateReady;
    if (typeof maybeAuthReady === 'function') {
      maybeAuthReady
        .call(auth)
        .then(() => finish(auth.currentUser, 'authStateReady'))
        .catch(() => finish(auth.currentUser, 'authStateReady_error_fallback'));
      return;
    }

    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        unsub();
        finish(u, 'onAuthStateChanged');
      },
      () => {
        unsub();
        finish(auth.currentUser, 'onAuthStateChanged_error_fallback');
      }
    );
  });
}

async function extractUserAuthToken(user: User): Promise<string> {
  try {
    return await user.getIdToken();
  } catch (err) {
    traceWarn('auth:id_token_fetch_fallback', {
      uid: user.uid,
      code: (err as { code?: string })?.code || 'unknown'
    });
    return `uid_${user.uid}`;
  }
}

function isRetryableAuthError(code: string): boolean {
  return (
    code === 'auth/network-request-failed' ||
    code === 'auth/internal-error' ||
    code === 'auth/too-many-requests' ||
    code === 'auth/web-storage-unsupported'
  );
}

/**
 * Ensures the current browser client is authenticated as a Firebase anonymous guest
 * with multi-storage persistence, single-flight deduplication, structured console tracing,
 * and exponential-backoff retries.
 */
export async function ensureCustomerAnonymousAuth(): Promise<CustomerAnonymousAuthResult> {
  if (inflightGuestAuthPromise) {
    traceDebug('auth:reuse_inflight_promise');
    return inflightGuestAuthPromise;
  }

  const startedAt = Date.now();
  traceInfo('auth:start', {
    hasCurrentUser: Boolean(auth.currentUser),
    currentUid: auth.currentUser?.uid || null,
    persistenceTier: configuredPersistenceTier
  });

  inflightGuestAuthPromise = (async (): Promise<CustomerAnonymousAuthResult> => {
    const persistenceTier = await ensureFirebaseAuthPersistence();
    const hydratedUser = await waitForHydratedFirebaseUser();

    // 1. Reuse existing anonymous Firebase user and refresh/read its token
    if (hydratedUser && hydratedUser.isAnonymous) {
      const authToken = await extractUserAuthToken(hydratedUser);
      traceInfo('auth:reused_anonymous_user', {
        uid: hydratedUser.uid,
        isAnonymousFirebaseUser: true,
        persistenceTier,
        clientAuthToken: maskAuthToken(authToken),
        durationMs: Date.now() - startedAt
      });
      return {
        uid: hydratedUser.uid,
        authToken,
        firebaseUser: hydratedUser,
        isAnonymousFirebaseUser: true
      };
    }

    // 2. Preserve existing authenticated user (e.g. shop owner testing customer route in another tab)
    if (hydratedUser && !hydratedUser.isAnonymous) {
      const authToken = await extractUserAuthToken(hydratedUser);
      traceInfo('auth:preserved_authenticated_user', {
        uid: hydratedUser.uid,
        isAnonymousFirebaseUser: false,
        persistenceTier,
        clientAuthToken: maskAuthToken(authToken),
        durationMs: Date.now() - startedAt
      });
      return {
        uid: hydratedUser.uid,
        authToken,
        firebaseUser: hydratedUser,
        isAnonymousFirebaseUser: false
      };
    }

    // 3. Sign in anonymously with retry & storage-fallback resilience
    const retryDelays = [350, 900];
    const maxAttempts = retryDelays.length + 1;
    let lastError: unknown = null;

    for (let attemptIdx = 0; attemptIdx <= retryDelays.length; attemptIdx++) {
      const attemptNumber = attemptIdx + 1;
      try {
        traceInfo('auth:sign_in_anonymously_attempt', {
          attempt: attemptNumber,
          maxAttempts,
          persistenceTier: configuredPersistenceTier
        });
        const credential = await signInAnonymously(auth);
        const authToken = await extractUserAuthToken(credential.user);
        traceInfo('auth:sign_in_anonymously_succeeded', {
          attempt: attemptNumber,
          uid: credential.user.uid,
          isAnonymousFirebaseUser: true,
          persistenceTier: configuredPersistenceTier,
          clientAuthToken: maskAuthToken(authToken),
          durationMs: Date.now() - startedAt
        });
        return {
          uid: credential.user.uid,
          authToken,
          firebaseUser: credential.user,
          isAnonymousFirebaseUser: true
        };
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: string })?.code || 'unknown';

        if (
          code === 'auth/operation-not-allowed' ||
          code === 'auth/admin-restricted-operation'
        ) {
          const fallback = getOrCreateFallbackGuestIdentity();
          traceWarn('auth:provider_disabled_using_fallback_guest_identity', {
            code,
            uid: fallback.uid,
            createdNewIdentity: fallback.createdNew,
            clientAuthToken: maskAuthToken(fallback.authToken)
          });
          return {
            uid: fallback.uid,
            authToken: fallback.authToken,
            firebaseUser: null,
            isAnonymousFirebaseUser: false
          };
        }

        if (code === 'auth/web-storage-unsupported') {
          try {
            await setPersistence(auth, inMemoryPersistence);
            configuredPersistenceTier = 'inMemoryPersistence';
            traceWarn('auth:fallback_to_in_memory_persistence', {
              attempt: attemptNumber
            });
          } catch {
            // ignore
          }
        }

        const willRetry = isRetryableAuthError(code) && attemptIdx < retryDelays.length;
        traceWarn('auth:sign_in_anonymously_failed', {
          attempt: attemptNumber,
          maxAttempts,
          code,
          willRetry,
          nextRetryDelayMs: willRetry ? retryDelays[attemptIdx] : null
        });

        if (!willRetry) {
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attemptIdx]));
      }
    }

    // Final resilience fallback if offline or transient network error prevented initial anonymous sign-in
    // while we still want the guest token persisted locally until online recovery re-binds Firebase Auth
    const lastCode = (lastError as { code?: string })?.code || 'unknown';
    if (lastCode === 'auth/network-request-failed') {
      const fallback = getOrCreateFallbackGuestIdentity();
      traceWarn('auth:offline_fallback_guest_identity', {
        code: lastCode,
        uid: fallback.uid,
        createdNewIdentity: fallback.createdNew,
        clientAuthToken: maskAuthToken(fallback.authToken)
      });
      return {
        uid: fallback.uid,
        authToken: fallback.authToken,
        firebaseUser: null,
        isAnonymousFirebaseUser: false
      };
    }

    traceError('auth:fatal_failure', {
      code: lastCode,
      durationMs: Date.now() - startedAt
    });
    throw lastError;
  })();

  try {
    return await inflightGuestAuthPromise;
  } finally {
    inflightGuestAuthPromise = null;
  }
}

function computeRemainingTime(expiresAt?: string): { expired: boolean; label: string } {
  if (!expiresAt) {
    return { expired: false, label: '5h 00m' };
  }
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { expired: true, label: 'Expired' };
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return {
    expired: false,
    label: `${hours}h ${mins < 10 ? '0' : ''}${mins}m`
  };
}

async function resolveSessionShopContext(sess: CustomerSession): Promise<Shop | null> {
  if (!sess.shopId) {
    traceWarn('shop:resolve_aborted_missing_shop_id', { sessionId: sess.id });
    return null;
  }

  // 0. Check warm verified shop cache strictly matching sess.shopId
  const cachedShop = verifiedShopCache.get(sess.shopId);
  if (cachedShop && cachedShop.id === sess.shopId) {
    traceDebug('shop:resolved_from_warm_cache', {
      sessionId: sess.id,
      shopId: cachedShop.id,
      shopPublicCode: cachedShop.publicCode || null
    });
    return cachedShop;
  }

  // 1. Direct lookup by authoritative shopId
  const shopSnap = await getDoc(doc(db, 'shops', sess.shopId));
  if (shopSnap.exists()) {
    const resolved = { id: shopSnap.id, ...shopSnap.data() } as Shop;
    verifiedShopCache.set(resolved.id, resolved);
    traceInfo('shop:resolved_by_firestore_id', {
      sessionId: sess.id,
      shopId: resolved.id,
      shopPublicCode: resolved.publicCode || null
    });
    return resolved;
  }

  // 2. Secondary lookup by session's recorded shopPublicCode — MUST match sess.shopId
  if (sess.shopPublicCode) {
    const byCode = await getShopByPublicCode(sess.shopPublicCode);
    if (byCode && byCode.id === sess.shopId) {
      verifiedShopCache.set(byCode.id, byCode);
      traceInfo('shop:resolved_by_public_code', {
        sessionId: sess.id,
        shopId: byCode.id,
        shopPublicCode: byCode.publicCode
      });
      return byCode;
    }
  }

  // 3. Directory match restricted strictly to sess.shopId
  const allShops = await getAllShops();
  const matched = allShops.find((s) => s.id === sess.shopId) || null;
  if (matched) {
    verifiedShopCache.set(matched.id, matched);
    traceInfo('shop:resolved_by_directory_scan', {
      sessionId: sess.id,
      shopId: matched.id,
      shopPublicCode: matched.publicCode || null
    });
  } else {
    traceWarn('shop:resolution_failed', {
      sessionId: sess.id,
      requestedShopId: sess.shopId,
      recordedShopPublicCode: sess.shopPublicCode || null
    });
  }

  return matched;
}

/**
 * Custom hook managing resilient Firebase anonymous guest authentication,
 * multi-tier session token persistence, console lifecycle tracing, and strict
 * shop ID state verification across QR scanner and customer chat navigations.
 */
export function useCustomerSession(
  sessionId: string | undefined,
  options?: UseCustomerSessionOptions
): UseCustomerSessionResult {
  const { activeCustomerSession, setActiveCustomerSession } = useAuth();
  const cleanInitialSessionId = sessionId?.trim() || '';
  const expectedShopId = options?.expectedShopId?.trim() || null;
  const expectedShopCode = options?.expectedShopCode?.trim().toLowerCase() || null;

  // Check warm persisted record on mount and verify full token-to-shop association invariants
  const initialPersisted = cleanInitialSessionId
    ? getPersistedSessionById(cleanInitialSessionId, expectedShopId, expectedShopCode)
    : null;
  const initialWarmShop = initialPersisted
    ? verifiedShopCache.get(initialPersisted.shopId) || null
    : null;
  const initialWarmSession =
    initialPersisted &&
    activeCustomerSession &&
    activeCustomerSession.id === cleanInitialSessionId &&
    activeCustomerSession.shopId === initialPersisted.shopId &&
    normalizeDeskToken(activeCustomerSession.token) === normalizeDeskToken(initialPersisted.sessionToken) &&
    isFutureTimestamp(activeCustomerSession.expiresAt)
      ? activeCustomerSession
      : null;

  const warmBootVerification = cleanInitialSessionId
    ? verifySessionShopAssociation({
        requestedSessionId: cleanInitialSessionId,
        session: initialWarmSession,
        shop: initialWarmShop,
        guestUid: auth.currentUser?.uid || initialPersisted?.guestUid || null,
        clientAuthToken: initialPersisted?.clientAuthToken || null,
        expectedShopId,
        expectedShopCode
      })
    : null;

  const canWarmBootReady = Boolean(
    auth.currentUser &&
      initialPersisted &&
      initialWarmShop &&
      initialWarmSession &&
      warmBootVerification?.verified
  );

  const [phase, setPhase] = useState<CustomerSessionPhase>(
    canWarmBootReady ? 'ready' : 'authenticating'
  );
  const [isGuestAuthenticated, setIsGuestAuthenticated] = useState<boolean>(
    Boolean(auth.currentUser && initialPersisted)
  );
  const [isAnonymousFirebaseUser, setIsAnonymousFirebaseUser] = useState<boolean>(
    Boolean(auth.currentUser?.isAnonymous)
  );
  const [isTokenVerified, setIsTokenVerified] = useState<boolean>(canWarmBootReady);
  const [guestUid, setGuestUid] = useState<string | null>(
    auth.currentUser?.uid || initialPersisted?.guestUid || null
  );
  const [sessionToken, setSessionToken] = useState<string | null>(
    canWarmBootReady ? warmBootVerification?.normalizedToken || null : initialPersisted?.sessionToken || null
  );
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [session, setSession] = useState<CustomerSession | null>(
    canWarmBootReady ? initialWarmSession : null
  );
  const [shop, setShop] = useState<Shop | null>(canWarmBootReady ? initialWarmShop : null);
  const [recoverableSession, setRecoverableSession] =
    useState<PersistedCustomerSessionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<string>(() =>
    computeRemainingTime(initialWarmSession?.expiresAt || initialPersisted?.expiresAt).label
  );
  const [attempt, setAttempt] = useState<number>(0);

  const phaseRef = useRef<CustomerSessionPhase>(phase);
  const sessionRef = useRef<CustomerSession | null>(session);
  const shopRef = useRef<Shop | null>(shop);
  const sessionTokenRef = useRef<string | null>(sessionToken);
  const authResultRef = useRef<CustomerAnonymousAuthResult | null>(null);
  const boundSessionRef = useRef<string | null>(null);
  const resolvedShopRef = useRef<Shop | null>(canWarmBootReady ? initialWarmShop : null);
  const subRetryCountRef = useRef<number>(0);

  // Trace phase transitions with current session token & shop context
  useEffect(() => {
    const prevPhase = phaseRef.current;
    phaseRef.current = phase;
    if (prevPhase !== phase) {
      traceInfo('phase:transition', {
        from: prevPhase,
        to: phase,
        sessionId: sessionId?.trim() || null,
        sessionToken: sessionTokenRef.current,
        shopId: shopRef.current?.id || sessionRef.current?.shopId || null,
        isTokenVerified
      });
    }
  }, [phase, sessionId, isTokenVerified]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    shopRef.current = shop;
  }, [shop]);

  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  const retry = useCallback(() => {
    traceInfo('session:manual_retry_requested', {
      sessionId: sessionId?.trim() || null,
      currentPhase: phaseRef.current
    });
    boundSessionRef.current = null;
    resolvedShopRef.current = null;
    subRetryCountRef.current = 0;
    setError(null);
    if (phaseRef.current !== 'ready') {
      setIsTokenVerified(false);
      setPhase('authenticating');
    }
    setAttempt((prev) => prev + 1);
  }, [sessionId]);

  // Watchdog: keep anonymous Firebase ID token fresh & silently recover if auth drops during QR/camera transitions
  useEffect(() => {
    let cancelled = false;

    const unsubToken = onIdTokenChanged(auth, async (currentUser) => {
      if (cancelled) return;

      if (currentUser) {
        const freshAuthToken = await extractUserAuthToken(currentUser);
        if (cancelled) return;

        setFirebaseUser(currentUser);
        setGuestUid(currentUser.uid);
        setIsAnonymousFirebaseUser(currentUser.isAnonymous);
        setIsGuestAuthenticated(true);

        authResultRef.current = {
          uid: currentUser.uid,
          authToken: freshAuthToken,
          firebaseUser: currentUser,
          isAnonymousFirebaseUser: currentUser.isAnonymous
        };

        // Keep persisted session record's auth token synchronized with verified shop context
        const currentSess = sessionRef.current;
        const currentShop = shopRef.current;
        const canSyncPersistedToken = Boolean(
          currentSess &&
            currentShop &&
            currentSess.shopId === currentShop.id &&
            normalizeDeskToken(currentSess.token)
        );

        traceDebug('auth:id_token_changed', {
          uid: currentUser.uid,
          isAnonymous: currentUser.isAnonymous,
          clientAuthToken: maskAuthToken(freshAuthToken),
          sessionId: currentSess?.id || sessionId || null,
          syncedShopId: canSyncPersistedToken ? currentShop!.id : null,
          sessionToken: canSyncPersistedToken ? currentSess!.token : null
        });

        if (canSyncPersistedToken && currentSess && currentShop) {
          persistValidatedCustomerSession({
            sessionId: currentSess.id,
            shopId: currentShop.id,
            shopPublicCode: currentShop.publicCode || currentSess.shopPublicCode || '',
            sessionToken: currentSess.token,
            clientAuthToken: freshAuthToken,
            guestUid: currentUser.uid,
            isAnonymous: currentUser.isAnonymous,
            customerName: currentSess.customerName,
            expiresAt: currentSess.expiresAt,
            validatedAt: new Date().toISOString()
          });
        }
        return;
      }

      // If Firebase Auth lost its user mid-navigation, re-authenticate silently without tearing down chat
      if (sessionId) {
        traceWarn('auth:user_dropped_recovering', { sessionId });
        try {
          const recovered = await ensureCustomerAnonymousAuth();
          if (cancelled) return;
          authResultRef.current = recovered;
          setGuestUid(recovered.uid);
          setFirebaseUser(recovered.firebaseUser);
          setIsAnonymousFirebaseUser(recovered.isAnonymousFirebaseUser);
          setIsGuestAuthenticated(true);
          traceInfo('auth:user_recovered', {
            sessionId,
            uid: recovered.uid,
            isAnonymousFirebaseUser: recovered.isAnonymousFirebaseUser,
            clientAuthToken: maskAuthToken(recovered.authToken)
          });
        } catch (recoverErr) {
          traceWarn('auth:silent_recovery_deferred', {
            sessionId,
            code: (recoverErr as { code?: string })?.code || 'unknown'
          });
        }
      }
    });

    return () => {
      cancelled = true;
      unsubToken();
    };
  }, [sessionId]);

  // Recover automatically when device returns online or returns from camera / background tab
  useEffect(() => {
    const handleRecovery = () => {
      if (document.visibilityState === 'hidden') return;
      if (phaseRef.current === 'error') {
        traceInfo('auth:lifecycle_recovery_triggered', {
          reason: 'phase_error_recovery',
          sessionId: sessionId || null
        });
        retry();
        return;
      }
      if (!auth.currentUser && sessionId) {
        traceInfo('auth:lifecycle_recovery_triggered', {
          reason: 'missing_current_user_on_resume',
          sessionId
        });
        ensureCustomerAnonymousAuth().catch(() => {});
      }
    };

    window.addEventListener('online', handleRecovery);
    document.addEventListener('visibilitychange', handleRecovery);
    return () => {
      window.removeEventListener('online', handleRecovery);
      document.removeEventListener('visibilitychange', handleRecovery);
    };
  }, [retry, sessionId]);

  useEffect(() => {
    const cleanSessionId = sessionId?.trim() || '';

    // Log explicit initialization state audit whenever sessionId or expected shop context initializes/changes
    const persistedAtInit = cleanSessionId
      ? getPersistedSessionById(cleanSessionId, expectedShopId, expectedShopCode)
      : null;

    traceInfo('init:state_audit', {
      sessionId: cleanSessionId || null,
      expectedShopId,
      expectedShopCode,
      attempt,
      hasAuthCurrentUser: Boolean(auth.currentUser),
      currentAuthUid: auth.currentUser?.uid || null,
      isAnonymousAuthUser: auth.currentUser?.isAnonymous ?? null,
      hasPersistedRecord: Boolean(persistedAtInit),
      persistedShopId: persistedAtInit?.shopId || null,
      persistedShopPublicCode: persistedAtInit?.shopPublicCode || null,
      persistedSessionToken: persistedAtInit?.sessionToken || null,
      warmShopCached: persistedAtInit ? verifiedShopCache.has(persistedAtInit.shopId) : false
    });

    if (!cleanSessionId) {
      const candidate = findRecoverableSessionByContext(expectedShopId, expectedShopCode);
      traceWarn('init:missing_session_id', {
        expectedShopId,
        expectedShopCode,
        recoverableSessionId: candidate?.sessionId || null,
        recoverableSessionToken: candidate?.sessionToken || null
      });
      setRecoverableSession(candidate);
      setIsTokenVerified(false);
      setSessionToken(null);
      setPhase('not_found');
      setError('Invalid customer session link. Please scan the shop counter QR code.');
      return;
    }

    let isMounted = true;
    let unsubSession: (() => void) | null = null;
    let reconnectTimer: number | null = null;

    // Reset verified state if switching between distinct session IDs
    if (sessionRef.current && sessionRef.current.id !== cleanSessionId) {
      traceInfo('init:switching_session_context', {
        previousSessionId: sessionRef.current.id,
        nextSessionId: cleanSessionId
      });
      resolvedShopRef.current = null;
      setIsTokenVerified(false);
      setSession(null);
      setShop(null);
      setSessionToken(null);
    }

    const resetUnverifiedState = (
      nextPhase: CustomerSessionPhase,
      errMsg: string,
      optionsOverride?: {
        keepSession?: CustomerSession | null;
        keepShop?: Shop | null;
        recoverable?: PersistedCustomerSessionRecord | null;
      }
    ) => {
      setIsTokenVerified(false);
      setSessionToken(null);
      setSession(optionsOverride?.keepSession ?? null);
      setShop(optionsOverride?.keepShop ?? null);
      if (!optionsOverride?.keepShop) {
        resolvedShopRef.current = null;
      }
      if (optionsOverride && 'recoverable' in optionsOverride) {
        setRecoverableSession(optionsOverride.recoverable ?? null);
      }
      setActiveCustomerSession(null);
      setPhase(nextPhase);
      setError(errMsg);
    };

    const attachSubscription = (authResult: CustomerAnonymousAuthResult) => {
      if (!isMounted) return;
      if (unsubSession) {
        unsubSession();
        unsubSession = null;
      }

      traceDebug('subscription:attaching', {
        sessionId: cleanSessionId,
        guestUid: authResult.uid,
        isAnonymousFirebaseUser: authResult.isAnonymousFirebaseUser
      });

      unsubSession = subscribeToCustomerSession(
        cleanSessionId,
        async (liveSession) => {
          if (!isMounted) return;
          subRetryCountRef.current = 0;

          if (!liveSession) {
            clearPersistedCustomerSession({ sessionId: cleanSessionId });
            const fallback = findRecoverableSessionByContext(expectedShopId, expectedShopCode);
            const recoverable =
              fallback && fallback.sessionId !== cleanSessionId ? fallback : null;
            traceWarn('verify:session_not_found_in_firestore', {
              sessionId: cleanSessionId,
              expectedShopId,
              expectedShopCode,
              recoverableSessionId: recoverable?.sessionId || null
            });
            resetUnverifiedState(
              'not_found',
              'Session expired or not found. Please scan the counter QR code again.',
              { recoverable }
            );
            return;
          }

          const normalizedLiveToken = normalizeDeskToken(liveSession.token);

          // 1. Validate session token & shopId presence
          if (!normalizedLiveToken || !liveSession.shopId) {
            traceError('verify:incomplete_session_metadata', {
              sessionId: liveSession.id,
              hasToken: Boolean(normalizedLiveToken),
              hasShopId: Boolean(liveSession.shopId)
            });
            clearPersistedCustomerSession({ sessionId: cleanSessionId });
            resetUnverifiedState(
              'error',
              'Session token metadata is incomplete. Please scan the shop QR code again.'
            );
            return;
          }

          // 2. Check if blocked by counter staff
          if (liveSession.isBlocked || liveSession.status === 'blocked') {
            traceWarn('verify:session_blocked', {
              sessionId: liveSession.id,
              sessionToken: normalizedLiveToken,
              shopId: liveSession.shopId,
              blockReason: liveSession.blockReason || null
            });
            clearPersistedCustomerSession({
              sessionId: liveSession.id,
              shopId: liveSession.shopId
            });
            resetUnverifiedState(
              'blocked',
              liveSession.blockReason ||
                'This customer session has been restricted by the shop counter.',
              { keepSession: liveSession }
            );
            return;
          }

          // 3. Check 5-hour ephemeral TTL
          const ttl = computeRemainingTime(liveSession.expiresAt);
          setRemainingTime(ttl.label);
          if (liveSession.status === 'expired' || ttl.expired) {
            traceWarn('verify:session_expired', {
              sessionId: liveSession.id,
              sessionToken: normalizedLiveToken,
              shopId: liveSession.shopId,
              expiresAt: liveSession.expiresAt
            });
            if (liveSession.status === 'active') {
              updateDoc(doc(db, 'customerSessions', liveSession.id), {
                status: 'expired'
              }).catch(() => {});
            }
            clearPersistedCustomerSession({
              sessionId: liveSession.id,
              shopId: liveSession.shopId
            });
            const fallback = findRecoverableSessionByContext(expectedShopId, expectedShopCode);
            resetUnverifiedState(
              'expired',
              'This printing session has expired under the 5-hour auto-purge policy.',
              {
                keepSession: { ...liveSession, status: 'expired' },
                recoverable: fallback && fallback.sessionId !== liveSession.id ? fallback : null
              }
            );
            return;
          }

          // 4. Validate against expectedShopId if provided in navigation context
          if (expectedShopId && liveSession.shopId !== expectedShopId) {
            traceError('verify:expected_shop_id_mismatch', {
              sessionId: liveSession.id,
              sessionToken: normalizedLiveToken,
              sessionShopId: liveSession.shopId,
              expectedShopId
            });
            const fallback = findRecoverableSessionByContext(expectedShopId, expectedShopCode);
            resetUnverifiedState(
              'error',
              'This session token belongs to a different print shop counter. Scan this counter’s QR code to continue.',
              {
                recoverable: fallback && fallback.sessionId !== liveSession.id ? fallback : null
              }
            );
            return;
          }

          // 5. Audit & evict any stale local cache entry if stored shopId or token disagrees with Firestore
          const existingPersisted = getPersistedSessionById(liveSession.id);
          if (
            existingPersisted &&
            (existingPersisted.shopId !== liveSession.shopId ||
              normalizeDeskToken(existingPersisted.sessionToken) !== normalizedLiveToken)
          ) {
            traceWarn('verify:evicting_mismatched_cached_token', {
              sessionId: liveSession.id,
              cachedShopId: existingPersisted.shopId,
              authoritativeShopId: liveSession.shopId,
              cachedToken: existingPersisted.sessionToken,
              authoritativeToken: normalizedLiveToken
            });
            clearPersistedCustomerSession({
              sessionId: liveSession.id,
              shopId: existingPersisted.shopId
            });
          }

          try {
            // 6. Resolve and strictly validate shop context against liveSession.shopId
            let currentShop = resolvedShopRef.current;
            if (!currentShop || currentShop.id !== liveSession.shopId) {
              currentShop = await resolveSessionShopContext(liveSession);
              if (!isMounted) return;

              if (!currentShop || currentShop.id !== liveSession.shopId) {
                traceError('verify:shop_context_unverified', {
                  sessionId: liveSession.id,
                  sessionToken: normalizedLiveToken,
                  sessionShopId: liveSession.shopId,
                  resolvedShopId: currentShop?.id || null
                });
                resetUnverifiedState(
                  'error',
                  'The print shop associated with this session could not be verified.',
                  { keepSession: liveSession }
                );
                return;
              }

              if (currentShop.status === 'blocked' || currentShop.status === 'suspended') {
                traceWarn('verify:shop_counter_suspended_or_blocked', {
                  sessionId: liveSession.id,
                  sessionToken: normalizedLiveToken,
                  shopId: currentShop.id,
                  shopStatus: currentShop.status
                });
                clearPersistedCustomerSession({
                  sessionId: liveSession.id,
                  shopId: currentShop.id
                });
                resolvedShopRef.current = currentShop;
                resetUnverifiedState(
                  'blocked',
                  'This print counter is currently unavailable.',
                  { keepSession: liveSession, keepShop: currentShop }
                );
                return;
              }

              resolvedShopRef.current = currentShop;
              setShop(currentShop);
            }

            // 7. Run full multi-invariant state verification across session token, shop context, and guest auth
            const activeAuth = authResultRef.current || authResult;
            const verification = verifySessionShopAssociation({
              requestedSessionId: cleanSessionId,
              session: liveSession,
              shop: currentShop,
              guestUid: activeAuth.uid,
              clientAuthToken: activeAuth.authToken,
              expectedShopId,
              expectedShopCode
            });

            if (!verification.verified || !verification.normalizedToken) {
              traceError('verify:association_check_failed', {
                sessionId: liveSession.id,
                sessionToken: normalizedLiveToken,
                shopId: currentShop.id,
                shopPublicCode: currentShop.publicCode || null,
                expectedShopId,
                expectedShopCode,
                reason: verification.reason,
                checks: verification.checks
              });
              const fallback = findRecoverableSessionByContext(expectedShopId, expectedShopCode);
              resetUnverifiedState(
                verification.failurePhase || 'error',
                verification.reason === 'expected_shop_code_mismatch'
                  ? 'This session belongs to a different print shop counter. Please scan this counter’s QR code.'
                  : 'Unable to verify customer session association with this shop counter.',
                {
                  recoverable: fallback && fallback.sessionId !== liveSession.id ? fallback : null
                }
              );
              return;
            }

            // 8. Bind or reconcile anonymous guest UID on the Firestore session document
            const shouldBindGuestUid =
              boundSessionRef.current !== liveSession.id &&
              Boolean(activeAuth.uid) &&
              (!liveSession.guestUid ||
                (normalizeDeskToken(existingPersisted?.sessionToken) === verification.normalizedToken &&
                  existingPersisted?.shopId === currentShop.id &&
                  liveSession.guestUid !== activeAuth.uid));

            if (shouldBindGuestUid) {
              boundSessionRef.current = liveSession.id;
              traceInfo('verify:binding_guest_uid_to_session', {
                sessionId: liveSession.id,
                sessionToken: verification.normalizedToken,
                shopId: currentShop.id,
                previousGuestUid: liveSession.guestUid || null,
                guestUid: activeAuth.uid,
                isAnonymousFirebaseUser: activeAuth.isAnonymousFirebaseUser
              });
              bindGuestToCustomerSession(
                liveSession.id,
                activeAuth.uid,
                activeAuth.isAnonymousFirebaseUser
              )
                .then(() => {
                  traceDebug('verify:guest_uid_bound_in_firestore', {
                    sessionId: liveSession.id,
                    sessionToken: verification.normalizedToken,
                    shopId: currentShop!.id,
                    guestUid: activeAuth.uid
                  });
                })
                .catch((bindErr) => {
                  traceWarn('verify:guest_uid_bind_failed', {
                    sessionId: liveSession.id,
                    shopId: currentShop!.id,
                    guestUid: activeAuth.uid,
                    error: bindErr instanceof Error ? bindErr.message : String(bindErr)
                  });
                });
            }

            // 9. Persist validated session token + shopId record across all storage layers & verify roundtrip
            const effectiveShopCode =
              currentShop.publicCode || liveSession.shopPublicCode || '';
            const validatedRecord: PersistedCustomerSessionRecord = {
              sessionId: liveSession.id,
              shopId: currentShop.id,
              shopPublicCode: effectiveShopCode,
              sessionToken: verification.normalizedToken,
              clientAuthToken: activeAuth.authToken,
              guestUid: activeAuth.uid,
              isAnonymous: activeAuth.isAnonymousFirebaseUser,
              customerName: liveSession.customerName,
              expiresAt: liveSession.expiresAt,
              validatedAt: new Date().toISOString()
            };
            persistValidatedCustomerSession(validatedRecord);

            const roundtripVerified = verifyPersistedShopTokenBinding({
              sessionId: liveSession.id,
              shopId: currentShop.id,
              shopPublicCode: effectiveShopCode,
              expectedToken: verification.normalizedToken,
              expectedGuestUid: activeAuth.uid
            });

            const normalizedLiveSession: CustomerSession =
              liveSession.token === verification.normalizedToken
                ? liveSession
                : { ...liveSession, token: verification.normalizedToken };

            setRecoverableSession(null);
            setIsTokenVerified(roundtripVerified && verification.verified);
            setSessionToken(verification.normalizedToken);
            setSession(normalizedLiveSession);
            setShop(currentShop);
            setActiveCustomerSession(normalizedLiveSession);
            setPhase('ready');
            setError(null);

            traceInfo('init:session_ready_and_verified', {
              sessionId: normalizedLiveSession.id,
              sessionToken: verification.normalizedToken,
              shopId: currentShop.id,
              shopName: currentShop.name,
              shopPublicCode: effectiveShopCode || null,
              guestUid: activeAuth.uid,
              isAnonymousFirebaseUser: activeAuth.isAnonymousFirebaseUser,
              clientAuthToken: maskAuthToken(activeAuth.authToken),
              roundtripVerified,
              remainingTime: ttl.label
            });
          } catch (shopErr) {
            traceError('verify:shop_context_exception', {
              sessionId: liveSession.id,
              sessionToken: normalizedLiveToken,
              shopId: liveSession.shopId,
              error: shopErr instanceof Error ? shopErr.message : String(shopErr)
            });
            if (isMounted && phaseRef.current !== 'ready') {
              setIsTokenVerified(false);
              setPhase('error');
              setError('Unable to verify print shop counter context. Please retry.');
            }
          }
        },
        (subError) => {
          if (!isMounted) return;
          traceWarn('subscription:interrupted', {
            sessionId: cleanSessionId,
            retryAttempt: subRetryCountRef.current + 1,
            error: subError.message
          });

          // Automatic silent reconnect with backoff before surfacing a fatal error
          if (subRetryCountRef.current < 3) {
            const delayMs = 900 * Math.pow(2, subRetryCountRef.current);
            subRetryCountRef.current += 1;
            reconnectTimer = window.setTimeout(async () => {
              if (!isMounted) return;
              try {
                traceInfo('subscription:reconnecting', {
                  sessionId: cleanSessionId,
                  attempt: subRetryCountRef.current,
                  delayMs
                });
                const refreshedAuth = await ensureCustomerAnonymousAuth();
                if (!isMounted) return;
                authResultRef.current = refreshedAuth;
                attachSubscription(refreshedAuth);
              } catch (reauthErr) {
                traceError('subscription:reconnect_auth_failed', {
                  sessionId: cleanSessionId,
                  error: reauthErr instanceof Error ? reauthErr.message : String(reauthErr)
                });
                if (isMounted && phaseRef.current !== 'ready') {
                  setIsTokenVerified(false);
                  setPhase('error');
                  setError('Failed to connect to your secure guest session.');
                }
              }
            }, delayMs);
            return;
          }

          setIsTokenVerified(false);
          setPhase('error');
          setError('Connection to your guest printing session was interrupted. Tap Retry to reconnect.');
        }
      );
    };

    const initializeGuestSession = async () => {
      const currentWarmCheck = verifySessionShopAssociation({
        requestedSessionId: cleanSessionId,
        session: sessionRef.current,
        shop: shopRef.current,
        guestUid: auth.currentUser?.uid || null,
        clientAuthToken: authResultRef.current?.authToken || persistedAtInit?.clientAuthToken || null,
        expectedShopId,
        expectedShopCode
      });
      const hasWarmReadySession = phaseRef.current === 'ready' && currentWarmCheck.verified;

      traceInfo('init:guest_session_boot', {
        sessionId: cleanSessionId,
        hasWarmReadySession,
        warmReason: currentWarmCheck.reason,
        expectedShopId,
        expectedShopCode
      });

      if (!hasWarmReadySession) {
        setIsTokenVerified(false);
        setPhase('authenticating');
      }
      setError(null);

      try {
        const authResult = await ensureCustomerAnonymousAuth();
        if (!isMounted) return;

        authResultRef.current = authResult;
        setGuestUid(authResult.uid);
        setFirebaseUser(authResult.firebaseUser);
        setIsAnonymousFirebaseUser(authResult.isAnonymousFirebaseUser);
        setIsGuestAuthenticated(true);

        traceInfo('init:guest_auth_verified', {
          sessionId: cleanSessionId,
          guestUid: authResult.uid,
          isAnonymousFirebaseUser: authResult.isAnonymousFirebaseUser,
          clientAuthToken: maskAuthToken(authResult.authToken),
          transitioningToContextVerification: !hasWarmReadySession
        });

        if (!hasWarmReadySession) {
          setPhase('verifying_context');
        }

        attachSubscription(authResult);
      } catch (err) {
        traceError('init:guest_auth_failed', {
          sessionId: cleanSessionId,
          error: err instanceof Error ? err.message : String(err)
        });
        if (!isMounted) return;
        if (!hasWarmReadySession) {
          setIsTokenVerified(false);
          setPhase('error');
          setError('Unable to establish a guest printing session. Check your connection and retry.');
        }
      }
    };

    initializeGuestSession();

    return () => {
      isMounted = false;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (unsubSession) {
        unsubSession();
      }
    };
  }, [sessionId, expectedShopId, expectedShopCode, attempt]);

  // Keep 5-hour countdown fresh while session is active
  useEffect(() => {
    if (!session?.expiresAt || phase !== 'ready') return;

    const tick = () => {
      const ttl = computeRemainingTime(session.expiresAt);
      setRemainingTime(ttl.label);
      if (ttl.expired) {
        traceWarn('session:ttl_expired_during_active_view', {
          sessionId: session.id,
          sessionToken: session.token,
          shopId: session.shopId,
          expiresAt: session.expiresAt
        });
        clearPersistedCustomerSession({
          sessionId: session.id,
          shopId: session.shopId
        });
        setIsTokenVerified(false);
        setSessionToken(null);
        setPhase('expired');
        setError('This printing session has expired under the 5-hour auto-purge policy.');
      }
    };

    tick();
    const timer = setInterval(tick, 10000);
    return () => clearInterval(timer);
  }, [session?.id, session?.shopId, session?.token, session?.expiresAt, phase]);

  const loading = phase === 'authenticating' || phase === 'verifying_context';
  const isReady =
    phase === 'ready' &&
    isGuestAuthenticated &&
    isTokenVerified &&
    Boolean(session) &&
    Boolean(shop) &&
    Boolean(sessionToken) &&
    normalizeDeskToken(session?.token) === sessionToken &&
    session?.shopId === shop?.id;

  return {
    phase,
    loading,
    isReady,
    isGuestAuthenticated,
    isAnonymousFirebaseUser,
    isTokenVerified,
    guestUid,
    sessionToken,
    firebaseUser,
    session,
    shop,
    recoverableSession,
    error,
    remainingTime,
    retry
  };
}
