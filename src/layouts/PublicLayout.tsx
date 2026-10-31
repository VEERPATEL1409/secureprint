import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Printer, ArrowRight, Lock, QrCode } from 'lucide-react';
import { useAuth } from '../firebase/context';
import { CustomerQRScannerModal } from '../components/customer/CustomerQRScannerModal';

export const PublicLayout: React.FC = () => {
  const location = useLocation();
  const { user, shop, isAdmin } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const hasPortalAccount = Boolean((user && !user.isAnonymous) || shop);

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'How It Works', path: '/how-it-works' },
    { label: 'For Shops', path: '/about' },
    { label: 'Privacy & Security', path: '/privacy' },
    { label: 'Contact', path: '/contact' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Banner Notice if any */}
      <div className="bg-slate-900 text-slate-300 text-xs py-1.5 px-4 text-center flex items-center justify-center gap-2 border-b border-slate-800">
        <Lock className="w-3.5 h-3.5 text-emerald-400" />
        <span>End-to-end ephemeral document handling. No USB drives, no WhatsApp leaks. Files automatically expire in 5 hours.</span>
      </div>

      {/* Main Public Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs group-hover:bg-emerald-700 transition-colors">
              <Printer className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight text-slate-900 leading-tight">
                SECURE<span className="text-emerald-600">PRINT</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-none">
                Zero-Trace Print
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'text-emerald-700 bg-emerald-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4 text-emerald-600" />
              <span>Scan QR</span>
            </button>
            {hasPortalAccount ? (
              <Link
                to={isAdmin ? '/admin/dashboard' : '/shop/dashboard'}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs whitespace-nowrap shrink-0"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/shop/login"
                  className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                >
                  Shop Login
                </Link>
                <Link
                  to="/shop/register"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs whitespace-nowrap shrink-0"
                >
                  Register Shop
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Printer className="w-4 h-4" />
                </div>
                <span className="font-bold text-base text-slate-900">
                  SECURE<span className="text-emerald-600">PRINT</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Privacy-first document transmission protocol for photocopy centers, Xerox shops, and digital print retailers.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero permanent customer data retention</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Platform</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link to="/how-it-works" className="hover:text-emerald-600">How It Works</Link></li>
                <li><Link to="/about" className="hover:text-emerald-600">For Printing Shops</Link></li>
                <li><Link to="/shop/register" className="hover:text-emerald-600">Register Shop</Link></li>
                <li><Link to="/shop/login" className="hover:text-emerald-600">Shop Portal</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Security & Legal</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link to="/privacy" className="hover:text-emerald-600">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-emerald-600">Terms of Service</Link></li>
                <li><Link to="/contact" className="hover:text-emerald-600">Contact Support</Link></li>
                <li><Link to="/admin/login" className="hover:text-emerald-600 text-xs text-slate-400">Admin Gateway</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Ephemeral Assurance</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                All customer documents and chat messages are encrypted in transit and authoritatively destroyed from storage within 5 hours of transmission.
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
                Designed for retail print counters across India.
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
            <p>&copy; {new Date().getFullYear()} SecurePrint Technologies. All rights reserved.</p>
            <p className="flex items-center gap-1">
              <span>Encrypted with Cloud Firestore & Firebase Security</span>
            </p>
          </div>
        </div>
      </footer>

      <CustomerQRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
};
