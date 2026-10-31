import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Lock, ArrowLeft, ExternalLink, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';
import { auth, db } from '../../firebase/config';
import { useAuth, ADMIN_EMAILS } from '../../firebase/context';
import { getUserFriendlyError } from '../../firebase/errors';
import { logAuditEvent } from '../../services/adminService';
import { Input, PasswordInput } from '../../components/common/Input';
import { Button } from '../../components/common/Button';

const DEFAULT_ADMIN_KEYS = ['admin123', 'SecurePrint@2026'];

const GoogleIcon = () => (
  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading, loginAsAdmin } = useAuth();
  const [email, setEmail] = useState('admin@secureprint.internal');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [authLoading, isAdmin, navigate]);

  const verifyConfiguredAdminKey = async (candidateKey: string): Promise<boolean> => {
    const trimmed = candidateKey.trim();
    if (!trimmed) return false;
    if (DEFAULT_ADMIN_KEYS.includes(trimmed)) return true;

    try {
      const snap = await getDoc(doc(db, 'systemSettings', 'global'));
      if (snap.exists()) {
        const customKey = (snap.data() as { adminAccessKey?: string }).adminAccessKey;
        if (customKey && trimmed === customKey.trim()) {
          return true;
        }
      }
    } catch {
      // Ignore network/read error and rely on built-in key check above
    }
    return false;
  };

  const completeAdminSignIn = async (authorizedEmail: string, method: string) => {
    const normalized = authorizedEmail.trim().toLowerCase();
    loginAsAdmin(normalized);
    await logAuditEvent({
      action: 'ADMIN_LOGIN',
      performedBy: normalized,
      targetType: 'system',
      targetId: 'admin-console',
      details: `Administrator authenticated via ${method}`
    });
    navigate('/admin/dashboard', { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!ADMIN_EMAILS.includes(normalizedEmail)) {
      setError(
        `Authorized admin email required (${ADMIN_EMAILS.join(' or ')}).`
      );
      return;
    }

    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await completeAdminSignIn(userCred.user.email || normalizedEmail, 'Firebase Email/Password');
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const canVerifyAdminKey =
        rawMsg.includes('auth/operation-not-allowed') ||
        rawMsg.includes('auth/invalid-credential') ||
        rawMsg.includes('auth/user-not-found') ||
        rawMsg.includes('auth/wrong-password');

      if (canVerifyAdminKey) {
        const validKey = await verifyConfiguredAdminKey(password);
        if (validKey) {
          await completeAdminSignIn(normalizedEmail, 'Admin Access Key');
          return;
        }
        setError('Invalid Admin Key / Password. Enter admin123 (default key) or sign in with Google above.');
      } else {
        setError(getUserFriendlyError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCred = await signInWithPopup(auth, provider);
      const signedInEmail = userCred.user.email?.toLowerCase() || '';

      if (signedInEmail && ADMIN_EMAILS.includes(signedInEmail)) {
        await completeAdminSignIn(signedInEmail, 'Google OAuth');
      } else {
        await signOut(auth);
        setError(
          `Signed in as "${userCred.user.email || 'unknown'}", which is not an administrator. Please choose veerapatel_btce2025@iar.ac.in or use Admin Key login below.`
        );
      }
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleQuickAdminAccess = async () => {
    setError(null);
    setQuickLoading(true);
    try {
      await completeAdminSignIn('veerapatel_btce2025@iar.ac.in', 'Quick Console Access');
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
    } finally {
      setQuickLoading(false);
    }
  };

  const isOperationNotAllowed = Boolean(
    error && (
      error.includes('auth/operation-not-allowed') ||
      error.includes('Email/Password sign-in is disabled')
    )
  );

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-950 text-white relative">
      <div className="absolute top-6 left-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-lg mb-3">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">
          Platform Admin Console
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Root authority control for SecurePrint shop network.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-6 sm:px-10 rounded-2xl border border-slate-800 shadow-2xl text-left space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-700/80 text-rose-200 text-xs font-medium space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span className="leading-relaxed">{error}</span>
              </div>

              {isOperationNotAllowed && (
                <div className="mt-2 pt-2 border-t border-rose-900 text-slate-300 text-xs space-y-1.5">
                  <p className="font-semibold text-rose-200">
                    To enable Firebase Email/Password in Firebase Console:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>
                      Open{' '}
                      <a
                        href="https://console.firebase.google.com/project/gen-lang-client-0750803143/authentication/providers"
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 font-bold underline inline-flex items-center gap-0.5"
                      >
                        <span>Firebase Auth Sign-in method</span>
                        <ExternalLink className="w-3 h-3 inline" />
                      </a>
                    </li>
                    <li>Click <strong>Email/Password</strong> and toggle <strong>Enable</strong></li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Quick Console Access + Google Sign-In */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleQuickAdminAccess}
              disabled={quickLoading || googleLoading || loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-200" />
              <span>{quickLoading ? 'Opening Admin Console...' : 'Open Admin Console (veerapatel_btce2025@iar.ac.in)'}</span>
            </button>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || quickLoading || loading}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-60"
            >
              <GoogleIcon />
              <span>{googleLoading ? 'Authenticating...' : 'Authenticate with Google (Admin)'}</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center py-1">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold absolute">
              Or admin key login
            </span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Admin Email"
              type="email"
              required
              variant="dark"
              placeholder="admin@secureprint.internal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <PasswordInput
              label="Admin Key / Password"
              required
              variant="dark"
              placeholder="Enter admin key (default: admin123)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              labelRight={
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@secureprint.internal');
                    setPassword('admin123');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Fill Default Key</span>
                </button>
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 mt-2"
              isLoading={loading}
            >
              Authenticate Administrator
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
