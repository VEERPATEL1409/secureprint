import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { auth } from '../../firebase/config';
import { useAuth } from '../../firebase/context';
import { createShopProfile, getShopForUser } from '../../services/shopService';
import { logAuditEvent } from '../../services/adminService';
import { getUserFriendlyError } from '../../firebase/errors';
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

export const ShopRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setAuthenticatedShop } = useAuth();
  const shopNameRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleUserUid, setGoogleUserUid] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    ownerName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    password: '',
    confirmPassword: '',
  });

  // Automatically hydrate Google account details when redirected from Google Sign-In or already authenticated
  useEffect(() => {
    if (manualOverride || googleUserUid) return;
    const activeUser = user && !user.isAnonymous ? user : (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null);
    if (!activeUser) return;

    const isGoogleProvider = activeUser.providerData.some((p) => p.providerId === 'google.com');
    const cameFromGoogle = searchParams.get('from') === 'google';
    if (!isGoogleProvider && !cameFromGoogle) return;

    let cancelled = false;
    (async () => {
      try {
        const existingShop = await getShopForUser(activeUser.uid, activeUser.email);
        if (cancelled) return;

        if (existingShop) {
          if (cameFromGoogle) {
            setAuthenticatedShop(existingShop);
            if (existingShop.status === 'pending') {
              navigate('/shop/pending-approval', { replace: true });
            } else if (existingShop.status === 'active') {
              navigate('/shop/dashboard', { replace: true });
            }
          }
          return;
        }

        setGoogleUserUid(activeUser.uid);
        setFormData((prev) => ({
          ...prev,
          email: activeUser.email || prev.email,
          ownerName: prev.ownerName || activeUser.displayName || '',
          phone: prev.phone || activeUser.phoneNumber?.replace(/^\+91/, '') || '',
          password: 'GOOGLE_AUTH_ACCOUNT',
          confirmPassword: 'GOOGLE_AUTH_ACCOUNT',
        }));
        setTimeout(() => shopNameRef.current?.focus(), 50);
      } catch (err) {
        console.warn('Auto Google prefill check warning:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, manualOverride, googleUserUid, searchParams, navigate, setAuthenticatedShop]);

  const generatePublicCode = (shopName: string): string => {
    const slug = shopName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 15);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `${slug || 'print'}-${randomSuffix}`;
  };

  const handleGooglePreFill = async () => {
    setError(null);
    setManualOverride(false);
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCred = await signInWithPopup(auth, provider);
      localStorage.removeItem('secureprint_demo_shop');

      const uid = userCred.user.uid;
      const existingShop = await getShopForUser(uid, userCred.user.email);

      if (existingShop) {
        setAuthenticatedShop(existingShop);
        if (existingShop.status === 'pending') {
          navigate('/shop/pending-approval', { replace: true });
          return;
        }
        if (existingShop.status === 'blocked' || existingShop.status === 'suspended') {
          setError(`A shop for ${userCred.user.email} is currently ${existingShop.status}. Please contact support.`);
          return;
        }
        navigate('/shop/dashboard', { replace: true });
        return;
      }

      setGoogleUserUid(uid);
      setFormData((prev) => ({
        ...prev,
        email: userCred.user.email || prev.email,
        ownerName: userCred.user.displayName || prev.ownerName,
        phone: prev.phone || userCred.user.phoneNumber?.replace(/^\+91/, '') || '',
        password: 'GOOGLE_AUTH_ACCOUNT',
        confirmPassword: 'GOOGLE_AUTH_ACCOUNT',
      }));
      setTimeout(() => shopNameRef.current?.focus(), 50);
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleUsePasswordInstead = async () => {
    setManualOverride(true);
    setGoogleUserUid(null);
    setError(null);
    try {
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        await signOut(auth);
      }
    } catch {
      // Ignore sign-out errors
    }
    setFormData((prev) => ({
      ...prev,
      password: '',
      confirmPassword: '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!googleUserUid) {
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    if (!/^\d{6}$/.test(formData.pincode.trim())) {
      setError('Please enter a valid 6-digit PIN code.');
      return;
    }

    setLoading(true);
    try {
      localStorage.removeItem('secureprint_demo_shop');
      let uid = googleUserUid;

      // 1. Create Firebase Auth account if not already signed in via Google
      if (!uid) {
        const userCred = await createUserWithEmailAndPassword(
          auth,
          formData.email.trim(),
          formData.password
        );
        uid = userCred.user.uid;
      }

      const publicCode = generatePublicCode(formData.name);

      // 2. Create Firestore profile with status: 'pending'
      const createdShop = await createShopProfile({
        id: uid,
        name: formData.name.trim(),
        ownerName: formData.ownerName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        gstin: formData.gstin ? formData.gstin.trim() : '',
        status: 'pending', // Strictly pending initially
        isOpen: true,
        publicCode,
      });

      setAuthenticatedShop(createdShop);

      // 3. Log audit event
      await logAuditEvent({
        action: 'SHOP_REGISTERED',
        performedBy: uid,
        targetType: 'shop',
        targetId: uid,
        details: `Shop ${formData.name} registered and placed into pending queue`
      });

      // 4. Navigate to pending approval screen
      navigate('/shop/pending-approval', { replace: true });
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
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
        <h3 className="text-xl font-bold text-slate-900">Register Printing Shop</h3>
        <p className="text-xs text-slate-500">
          Create a partner shop profile for your Xerox / print counter.
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
                Or click <strong>"Quick Register with Google"</strong> below to register instantly!
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

      {/* 1-Click Google Registration */}
      {!googleUserUid ? (
        <div>
          <button
            type="button"
            onClick={handleGooglePreFill}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs disabled:opacity-60"
          >
            <GoogleIcon />
            <span>{googleLoading ? 'Connecting Google Account...' : 'Quick Register with Google'}</span>
          </button>
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold absolute">
              Or register manually
            </span>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Google account connected: {formData.email}</p>
              <p className="text-emerald-700 mt-0.5">
                Fill in your shop details below and click <strong>Submit Registration</strong> to finish.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-6 pt-0.5">
            <button
              type="button"
              onClick={handleGooglePreFill}
              disabled={googleLoading || loading}
              className="text-emerald-800 hover:text-emerald-950 underline font-semibold"
            >
              Switch Google account
            </button>
            <span className="text-emerald-300">•</span>
            <button
              type="button"
              onClick={handleUsePasswordInstead}
              disabled={googleLoading || loading}
              className="text-slate-600 hover:text-slate-900 underline font-semibold"
            >
              Use email & password instead
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            ref={shopNameRef}
            label="Shop Name"
            required
            placeholder="e.g. Apex Xerox & Digital Prints"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Owner / Proprietor Name"
            required
            placeholder="e.g. Ramesh Patel"
            value={formData.ownerName}
            onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email Address"
            type="email"
            required
            placeholder="shop@example.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={Boolean(googleUserUid)}
          />
          <Input
            label="Phone Number"
            type="tel"
            required
            placeholder="10-digit mobile"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>

        <Input
          label="Shop Address"
          required
          placeholder="Shop 4, Market Complex, University Road"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="City"
            required
            placeholder="City"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
          <Input
            label="State"
            required
            placeholder="State"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          />
          <Input
            label="Pincode"
            required
            maxLength={6}
            placeholder="6 digits"
            value={formData.pincode}
            onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
          />
        </div>

        <Input
          label="GSTIN (Optional)"
          placeholder="e.g. 24AAAAA0000A1Z5"
          value={formData.gstin}
          onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
        />

        {!googleUserUid && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PasswordInput
              label="Password"
              required
              placeholder="At least 6 characters"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            <PasswordInput
              label="Confirm Password"
              required
              placeholder="Confirm password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            />
          </div>
        )}

        <Button type="submit" variant="primary" size="md" className="w-full mt-2" isLoading={loading}>
          Submit Registration for Approval
        </Button>
      </form>

      <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
        Already registered?{' '}
        <Link to="/shop/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
          Sign In Here
        </Link>
      </div>
    </div>
  );
};
