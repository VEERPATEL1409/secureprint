import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { ExternalLink, AlertCircle, Sparkles } from 'lucide-react';
import { auth } from '../../firebase/config';
import { useAuth } from '../../firebase/context';
import { getUserFriendlyError } from '../../firebase/errors';
import { getShopByPublicCode, getShopForUser } from '../../services/shopService';
import { getAllShops } from '../../services/adminService';
import { Input, PasswordInput } from '../../components/common/Input';
import { Button } from '../../components/common/Button';

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

export const ShopLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { loginAsDemoShop, setAuthenticatedShop } = useAuth();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickDemoLogin = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      let activeShop = await getShopByPublicCode('patel-694');
      if (!activeShop) {
        const all = await getAllShops();
        activeShop = all.find(s => s.status === 'active') || all[0];
      }
      if (activeShop) {
        loginAsDemoShop(activeShop);
        navigate('/shop/dashboard');
      } else {
        setError('No active shop found. Please register a shop.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load demo counter.');
    } finally {
      setDemoLoading(false);
    }
  };

  const routeUserAfterAuth = async (uid: string, userEmail?: string | null) => {
    localStorage.removeItem('secureprint_demo_shop');

    // Look up shop profile by Firebase Auth UID or matching registered email
    const shopData = await getShopForUser(uid, userEmail);

    if (!shopData) {
      // Signed in via Google/Firebase, but hasn't created a shop profile yet -> direct to registration with Google pre-filled
      navigate('/shop/register?from=google', { replace: true });
      return;
    }

    // Hydrate AuthContext immediately to avoid guard redirect race conditions
    setAuthenticatedShop(shopData);

    if (shopData.status === 'pending') {
      navigate('/shop/pending-approval', { replace: true });
      return;
    }

    if (shopData.status === 'blocked' || shopData.status === 'suspended') {
      setError(`Your shop account is currently ${shopData.status}. Please contact platform support.`);
      return;
    }

    navigate('/shop/dashboard', { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await routeUserAfterAuth(userCred.user.uid, userCred.user.email);
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
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
      await routeUserAfterAuth(userCred.user.uid, userCred.user.email);
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const isOperationNotAllowed = Boolean(
    error && (
      error.includes('auth/operation-not-allowed') ||
      error.includes('Email/Password sign-in is disabled')
    )
  );

  const isUnauthorizedDomain = Boolean(
    error && error.includes('Authorized domains')
  );

  return (
    <div className="space-y-6 text-left">
      <div className="space-y-1">
        <h3 className="text-xl font-bold text-slate-900">Shop Sign In</h3>
        <p className="text-xs text-slate-500">
          Access your real-time counter print queue and desk settings.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>

          {isOperationNotAllowed && (
            <div className="mt-2 pt-2 border-t border-rose-200 text-slate-700 text-xs space-y-1.5">
              <p className="font-semibold text-rose-900">
                How to resolve in Firebase Console:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>
                  Open{' '}
                  <a
                    href="https://console.firebase.google.com/project/gen-lang-client-0750803143/authentication/providers"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 font-bold underline inline-flex items-center gap-0.5"
                  >
                    <span>Firebase Auth Sign-in method</span>
                    <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </li>
                <li>Click on <strong>Email/Password</strong></li>
                <li>Toggle <strong>Enable</strong> and click <strong>Save</strong></li>
              </ol>
              <p className="text-slate-500 text-[11px] pt-1">
                Or click <strong>"Continue with Google"</strong> below to sign in instantly!
              </p>
            </div>
          )}

          {isUnauthorizedDomain && (
            <div className="mt-2 pt-2 border-t border-rose-200 text-slate-700 text-xs space-y-1">
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0750803143/authentication/settings"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 font-bold underline inline-flex items-center gap-0.5"
              >
                <span>Open Firebase Auth Authorized Domains</span>
                <ExternalLink className="w-3 h-3 inline" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* 1-Click Quick Counter Desk Access */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleQuickDemoLogin}
          disabled={demoLoading || loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition-all shadow-md active:scale-98 disabled:opacity-60"
        >
          <Sparkles className="w-4 h-4 text-emerald-200" />
          <span>{demoLoading ? 'Opening Counter Desk...' : '⚡ Open Live Counter Desk (patel-694)'}</span>
        </button>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs disabled:opacity-60"
        >
          <GoogleIcon />
          <span>{googleLoading ? 'Signing in with Google...' : 'Continue with Google'}</span>
        </button>
      </div>

      <div className="relative flex items-center justify-center">
        <div className="border-t border-slate-200 w-full" />
        <span className="bg-white px-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold absolute">
          Or sign in with email
        </span>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          label="Email Address"
          type="email"
          required
          placeholder="shop@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordInput
          label="Password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          labelRight={
            <Link
              to="/shop/forgot-password"
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              Forgot Password?
            </Link>
          }
        />

        <Button type="submit" variant="primary" size="md" className="w-full mt-2" isLoading={loading}>
          Sign In to Shop Dashboard
        </Button>
      </form>

      <div className="text-center text-xs text-slate-500 pt-3 border-t border-slate-100 space-y-2">
        <div>
          Don't have a shop account?{' '}
          <Link to="/shop/register" className="font-semibold text-emerald-600 hover:text-emerald-700">
            Register Here
          </Link>
        </div>
        <div>
          <Link to="/admin/login" className="text-slate-400 hover:text-slate-600">
            Platform Administrator Portal
          </Link>
        </div>
      </div>
    </div>
  );
};

export const ShopForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="space-y-1">
        <h3 className="text-xl font-bold text-slate-900">Reset Shop Password</h3>
        <p className="text-xs text-slate-500">
          Enter your registered shop email to receive a password reset link.
        </p>
      </div>

      {submitted ? (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-3">
          <p className="font-semibold">Password reset email sent!</p>
          <p>Please check your inbox (and spam folder) for instructions to reset your password.</p>
          <Link to="/shop/login" className="inline-block font-bold text-emerald-700 underline mt-2">
            Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <Input
            label="Email Address"
            type="email"
            required
            placeholder="shop@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Button type="submit" variant="primary" size="md" className="w-full" isLoading={loading}>
            Send Reset Instructions
          </Button>

          <div className="text-center">
            <Link to="/shop/login" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
              Return to Login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
};

export const ShopPendingApprovalPage: React.FC = () => {
  const navigate = useNavigate();
  const { shop, refreshShop, logout } = useAuth();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (shop?.status === 'active') {
      navigate('/shop/dashboard', { replace: true });
    }
  }, [shop?.status, navigate]);

  const handleCheckStatus = async () => {
    setChecking(true);
    await refreshShop();
    setChecking(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/shop/login');
  };

  return (
    <div className="space-y-6 text-center">
      <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-xl font-bold">
        ⏳
      </div>
      <div className="space-y-1">
        <h3 className="text-xl font-bold text-slate-900">Registration Pending Approval</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Thank you for registering <span className="font-semibold text-slate-800">{shop?.name || 'your shop'}</span>. Platform administrators are reviewing your application.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left space-y-2">
        <div className="flex justify-between">
          <span className="text-slate-400">Account:</span>
          <span className="font-medium text-slate-800">{shop?.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Status:</span>
          <span className="font-bold text-amber-600 uppercase">Pending Review</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Assigned Code:</span>
          <span className="font-mono font-semibold text-slate-800">{shop?.publicCode}</span>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Button
          type="button"
          variant="outline"
          size="md"
          className="w-full"
          onClick={handleCheckStatus}
          isLoading={checking}
        >
          Check Approval Status
        </Button>
        <button
          onClick={handleLogout}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          Sign Out of Account
        </button>
      </div>
    </div>
  );
};
