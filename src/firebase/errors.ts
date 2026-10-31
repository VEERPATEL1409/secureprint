import { auth } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getUserFriendlyError(error: unknown): string {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    return 'Access denied. You do not have permission to view or modify this record.';
  }
  if (message.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is disabled in your Firebase console. Please sign in using "Continue with Google" or enable "Email/Password" in Firebase Console > Authentication > Sign-in method.';
  }
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password') || message.includes('auth/user-not-found')) {
    return 'Invalid email or password. Please verify your credentials.';
  }
  if (message.includes('auth/email-already-in-use')) {
    return 'An account with this email address already exists.';
  }
  if (message.includes('auth/weak-password')) {
    return 'Password should be at least 6 characters long.';
  }
  if (message.includes('auth/account-exists-with-different-credential')) {
    return 'An account already exists with this email using a different sign-in method.';
  }
  if (message.includes('auth/unauthorized-domain')) {
    const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Google Sign-In is not yet authorized for "${domain}". Add "${domain}" in Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  if (message.includes('auth/popup-blocked')) {
    return 'Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.';
  }
  if (message.includes('auth/popup-closed-by-user') || message.includes('auth/cancelled-popup-request')) {
    return 'Google Sign-In popup was closed before completing sign-in. Please try again.';
  }
  if (message.includes('not-found')) {
    return 'The requested document or session was not found.';
  }
  if (message.includes('the client is offline')) {
    return 'You appear to be offline. Please check your network connection.';
  }
  return message.length > 100 ? 'An error occurred during this operation. Please retry.' : message;
}
