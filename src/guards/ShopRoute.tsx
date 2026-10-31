import React from 'react';
import { Navigate, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../firebase/context';
import { Skeleton } from '../components/common/EmptyState';

// Guard for routes only accessible to active shop owners
export const ShopRoute: React.FC = () => {
  const { user, shop, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  // Not logged in (or signed in only as an anonymous customer guest) and no counter session -> go to shop login
  if ((!user || user.isAnonymous) && !shop) {
    return <Navigate to="/shop/login" replace />;
  }

  // Signed in with Google/Email, but shop profile not created yet -> complete registration
  if (!shop) {
    return <Navigate to="/shop/register?from=google" replace />;
  }

  // If shop account is pending approval
  if (shop.status === 'pending') {
    return <Navigate to="/shop/pending-approval" replace />;
  }

  // If shop is blocked or suspended
  if (shop.status === 'blocked' || shop.status === 'suspended') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full p-8 rounded-2xl bg-white border border-rose-200 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Account {shop.status === 'blocked' ? 'Blocked' : 'Suspended'}</h2>
          <p className="text-sm text-slate-600 mb-6">
            Your shop account has been {shop.status}. Please contact SecurePrint platform administration for review.
          </p>
          <Link
            to="/contact"
            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 underline"
          >
            Contact Support
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

// Guard for admin-only portal
export const AdminRoute: React.FC = () => {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 p-6">
        <Skeleton className="h-32 w-64 bg-slate-800" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
};

// Guard for customer session
export const CustomerSessionRoute: React.FC = () => {
  const { activeCustomerSession } = useAuth();

  if (!activeCustomerSession) {
    return <Navigate to="/" replace />;
  }

  // Check visual expiration
  if (new Date(activeCustomerSession.expiresAt).getTime() <= Date.now() || activeCustomerSession.status === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-sm w-full p-6 rounded-2xl bg-white text-center shadow-md">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Session Expired</h3>
          <p className="text-sm text-slate-600 mb-4">
            This customer printing session has expired after 5 hours for your security and privacy.
          </p>
          <a href="/" className="inline-block px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
