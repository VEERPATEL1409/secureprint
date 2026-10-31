import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './firebase/context';

// Route Guards
import { ShopRoute, AdminRoute } from './guards/ShopRoute';

// Layouts
import { PublicLayout } from './layouts/PublicLayout';
import { ShopAuthLayout } from './layouts/ShopAuthLayout';
import { ShopDashboardLayout } from './layouts/ShopDashboardLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Public Pages
import { HomePage } from './pages/public/HomePage';
import { AboutPage, HowItWorksPage } from './pages/public/AboutPage';
import { PrivacyPage, TermsPage, ContactPage, CookiePolicyPage } from './pages/public/PrivacyPage';
import { SecurityPage } from './pages/public/SecurityPage';
import { FindShopPage } from './pages/public/FindShopPage';
import { FaqPage } from './pages/public/FaqPage';

// Customer Pages
import { ShopPublicLandingPage } from './pages/customer/ShopPublicLandingPage';
import { CustomerSessionAppPage } from './pages/customer/CustomerSessionAppPage';
import { CustomerQRScannerModal } from './components/customer/CustomerQRScannerModal';

// Shop Auth Pages
import { ShopRegisterPage } from './pages/shop/ShopRegisterPage';
import {
  ShopLoginPage,
  ShopForgotPasswordPage,
  ShopPendingApprovalPage
} from './pages/shop/ShopLoginPage';
import { ShopVerifyPage } from './pages/shop/ShopVerifyPage';

// Shop Dashboard Pages
import { ShopDashboardPage } from './pages/shop/ShopDashboardPage';
import { ShopQueuePage } from './pages/shop/ShopQueuePage';
import { ShopJobDetailPage } from './pages/shop/ShopJobDetailPage';
import {
  ShopCustomersPage,
  ShopHistoryPage,
  ShopBlockedPage
} from './pages/shop/ShopCustomersPage';
import { ShopQRPage } from './pages/shop/ShopQRPage';
import {
  ShopReportsPage,
  ShopSettingsPage,
  ShopProfilePage
} from './pages/shop/ShopReportsPage';

// Admin Pages
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminShopsPage } from './pages/admin/AdminShopsPage';
import { AdminShopDetailPage } from './pages/admin/AdminShopDetailPage';
import {
  AdminSessionsPage,
  AdminJobsPage,
  AdminAuditLogsPage,
  AdminSettingsPage
} from './pages/admin/AdminOtherPages';

const CustomerScanRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <CustomerQRScannerModal
      isOpen={true}
      standalonePage={true}
      onClose={() => navigate('/')}
    />
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/find-shop" element={<FindShopPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          </Route>

          <Route path="/scan" element={<CustomerScanRoute />} />
          <Route path="/s/:shopPublicId" element={<ShopPublicLandingPage />} />
          <Route path="/session/:sessionId" element={<CustomerSessionAppPage />} />
          <Route path="/c/:sessionId" element={<CustomerSessionAppPage />} />
          <Route path="/s" element={<Navigate to="/find-shop" replace />} />
          <Route path="/session" element={<Navigate to="/find-shop" replace />} />

          {/* =========================================================
              3. SHOP STAFF / COUNTER APPLICATION
              ========================================================= */}
          {/* Shop Authentication Routes */}
          <Route element={<ShopAuthLayout />}>
            <Route path="/shop/login" element={<ShopLoginPage />} />
            <Route path="/shop/register" element={<ShopRegisterPage />} />
            <Route path="/shop/forgot-password" element={<ShopForgotPasswordPage />} />
            <Route path="/shop/verify" element={<ShopVerifyPage />} />
            <Route path="/shop/pending-approval" element={<ShopPendingApprovalPage />} />
          </Route>

          {/* Shop Authenticated Portal (Protected by ShopRoute) */}
          <Route element={<ShopRoute />}>
            <Route element={<ShopDashboardLayout />}>
              <Route path="/shop" element={<Navigate to="/shop/dashboard" replace />} />
              <Route path="/shop/dashboard" element={<ShopDashboardPage />} />
              <Route path="/shop/queue" element={<ShopQueuePage />} />
              <Route path="/shop/jobs/:jobId" element={<ShopJobDetailPage />} />
              <Route path="/shop/customers" element={<ShopCustomersPage />} />
              <Route path="/shop/history" element={<ShopHistoryPage />} />
              <Route path="/shop/blocked" element={<ShopBlockedPage />} />
              <Route path="/shop/reports" element={<ShopReportsPage />} />
              <Route path="/shop/qr" element={<ShopQRPage />} />
              <Route path="/shop/settings" element={<ShopSettingsPage />} />
              <Route path="/shop/profile" element={<ShopProfilePage />} />
            </Route>
          </Route>

          {/* =========================================================
              4. ADMINISTRATIVE APPLICATION
              ========================================================= */}
          {/* Admin Login */}
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* Admin Portal (Protected by AdminRoute) */}
          <Route element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/shops" element={<AdminShopsPage />} />
              <Route path="/admin/shops/:shopId" element={<AdminShopDetailPage />} />
              <Route path="/admin/sessions" element={<AdminSessionsPage />} />
              <Route path="/admin/customers" element={<AdminSessionsPage />} />
              <Route path="/admin/jobs" element={<AdminJobsPage />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
              <Route path="/admin/logs" element={<AdminAuditLogsPage />} />
              <Route path="/admin/system" element={<AdminSettingsPage />} />
              <Route path="/admin/settings" element={<AdminSettingsPage />} />
            </Route>
          </Route>

          {/* 404 Catch-All Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
