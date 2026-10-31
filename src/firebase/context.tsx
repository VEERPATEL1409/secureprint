import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './config';
import { getShopForUser } from '../services/shopService';
import { Shop, CustomerSession, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  shop: Shop | null;
  role: UserRole | 'guest';
  isAdmin: boolean;
  adminEmail: string | null;
  isAnonymous: boolean;
  loading: boolean;
  activeCustomerSession: CustomerSession | null;
  setActiveCustomerSession: (session: CustomerSession | null) => void;
  setAuthenticatedShop: (shopData: Shop | null) => void;
  logout: () => Promise<void>;
  loginAsDemoShop: (shopData: Shop) => void;
  loginAsAdmin: (email: string) => void;
  refreshShop: () => Promise<void>;
  refreshShopData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Admin email configured in deployment
export const ADMIN_EMAILS = [
  'veerapatel_btce2025@iar.ac.in',
  'admin@secureprint.internal'
];

const ADMIN_SESSION_STORAGE_KEY = 'secureprint_admin_session';

function getStoredAdminEmail(): string | null {
  try {
    const saved = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (saved && ADMIN_EMAILS.includes(saved.toLowerCase())) {
      return saved.toLowerCase();
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [adminSessionEmail, setAdminSessionEmail] = useState<string | null>(() => getStoredAdminEmail());
  const [role, setRole] = useState<UserRole | 'guest'>(() => (getStoredAdminEmail() ? 'admin' : 'guest'));
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(getStoredAdminEmail()));
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCustomerSession, setActiveCustomerSession] = useState<CustomerSession | null>(() => {
    const saved = localStorage.getItem('secureprint_customer_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Sync activeCustomerSession with localStorage
  const updateCustomerSession = (session: CustomerSession | null) => {
    setActiveCustomerSession(session);
    if (session) {
      localStorage.setItem('secureprint_customer_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('secureprint_customer_session');
    }
  };

  const setAuthenticatedShop = (shopData: Shop | null) => {
    localStorage.removeItem('secureprint_demo_shop');
    setShop(shopData);
    if (shopData) {
      setRole('shop');
    }
  };

  const fetchShop = async (uid: string, email?: string | null) => {
    try {
      const found = await getShopForUser(uid, email);
      if (found) {
        setShop(found);
        setRole('shop');
      } else {
        setShop(null);
      }
    } catch (err) {
      console.error('Error fetching shop profile:', err);
    }
  };

  useEffect(() => {
    let unsubShop: (() => void) | null = null;
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubShop) {
        unsubShop();
        unsubShop = null;
      }

      const storedAdmin = getStoredAdminEmail();
      setUser(currentUser);

      if (currentUser) {
        if (currentUser.isAnonymous) {
          if (storedAdmin) {
            setAdminSessionEmail(storedAdmin);
            setIsAdmin(true);
            setRole('admin');
          } else {
            setIsAdmin(false);
          }

          const savedDemoShop = localStorage.getItem('secureprint_demo_shop');
          if (savedDemoShop) {
            try {
              const parsed = JSON.parse(savedDemoShop);
              setShop(parsed);
              if (!storedAdmin) setRole('shop');
            } catch {
              setShop(null);
              if (!storedAdmin) setRole('customer');
            }
          } else {
            setShop(null);
            if (!storedAdmin) setRole('customer');
          }
          setLoading(false);
          return;
        }

        // Real Firebase Auth user (Google or Email/Password): clear demo shop override
        localStorage.removeItem('secureprint_demo_shop');

        // Check Admin privileges from Firebase Auth email or active admin session
        const normalizedUserEmail = currentUser.email?.toLowerCase() || null;
        const isFirebaseAdmin = Boolean(
          normalizedUserEmail && ADMIN_EMAILS.includes(normalizedUserEmail)
        );
        const effectiveAdminEmail = isFirebaseAdmin ? normalizedUserEmail : storedAdmin;
        const isUserAdmin = Boolean(effectiveAdminEmail);

        if (isFirebaseAdmin && normalizedUserEmail) {
          localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, normalizedUserEmail);
        }

        setAdminSessionEmail(effectiveAdminEmail);
        setIsAdmin(isUserAdmin);

        if (isUserAdmin) {
          setRole('admin');
        }

        // Resolve shop by UID or matching email, then subscribe to live updates
        let targetShopDocId = currentUser.uid;
        try {
          const matchedShop = await getShopForUser(currentUser.uid, currentUser.email);
          if (cancelled) return;
          if (matchedShop) {
            targetShopDocId = matchedShop.id;
            setShop(matchedShop);
            if (!isUserAdmin) {
              setRole('shop');
            }
          }
        } catch (err) {
          console.warn('Initial shop lookup warning:', err);
        }

        const shopRef = doc(db, 'shops', targetShopDocId);
        unsubShop = onSnapshot(shopRef, (snap) => {
          if (snap.exists()) {
            setShop({ id: snap.id, ...snap.data() } as Shop);
            if (!isUserAdmin) {
              setRole('shop');
            }
          } else {
            setShop(null);
            if (!isUserAdmin) {
              setRole('guest');
            }
          }
          setLoading(false);
        }, (error) => {
          console.warn('Shop profile snapshot error:', error);
          setLoading(false);
        });
      } else {
        const savedShop = localStorage.getItem('secureprint_demo_shop');
        if (savedShop) {
          try {
            const parsed = JSON.parse(savedShop);
            setShop(parsed);
            if (!storedAdmin) setRole('shop');
          } catch {
            setShop(null);
            if (!storedAdmin) setRole('guest');
          }
        } else {
          setShop(null);
          if (!storedAdmin) setRole('guest');
        }

        if (storedAdmin) {
          setAdminSessionEmail(storedAdmin);
          setIsAdmin(true);
          setRole('admin');
        } else {
          setAdminSessionEmail(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (unsubShop) unsubShop();
    };
  }, []);

  const loginAsDemoShop = (shopData: Shop) => {
    setShop(shopData);
    setRole('shop');
    localStorage.setItem('secureprint_demo_shop', JSON.stringify(shopData));
  };

  const loginAsAdmin = (email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!ADMIN_EMAILS.includes(normalized)) return;
    localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, normalized);
    setAdminSessionEmail(normalized);
    setIsAdmin(true);
    setRole('admin');
  };

  const logout = async () => {
    localStorage.removeItem('secureprint_demo_shop');
    localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    if (user) {
      await signOut(auth);
    }
    setShop(null);
    setAdminSessionEmail(null);
    setRole('guest');
    setIsAdmin(false);
  };

  const refreshShop = async () => {
    if (user && !user.isAnonymous) {
      await fetchShop(user.uid, user.email);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        shop,
        role,
        isAdmin,
        adminEmail: (user && !user.isAnonymous && user.email) ? user.email : adminSessionEmail,
        isAnonymous: Boolean(user?.isAnonymous),
        loading,
        activeCustomerSession,
        setActiveCustomerSession: updateCustomerSession,
        setAuthenticatedShop,
        logout,
        loginAsDemoShop,
        loginAsAdmin,
        refreshShop,
        refreshShopData: refreshShop
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
