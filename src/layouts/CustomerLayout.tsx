import React, { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Printer, ShieldCheck, X, Sparkles } from 'lucide-react';
import { useAuth } from '../firebase/context';
import { TokenBadge } from '../components/common/Badge';

export const CustomerLayout: React.FC = () => {
  const { activeCustomerSession } = useAuth();
  const [adDismissed, setAdDismissed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-start sm:p-4">
      {/* Full-screen mobile container, responsive constrained card on desktop */}
      <div className="w-full max-w-4xl bg-white min-h-screen sm:min-h-[92vh] sm:rounded-3xl shadow-xl sm:border border-slate-200/80 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 px-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-900 flex items-center justify-center font-bold shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white leading-tight">
                  SecurePrint Counter
                </h1>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Session
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Customer: <span className="text-slate-200 font-medium">{activeCustomerSession?.customerName || 'Guest'}</span>
              </p>
            </div>
          </div>

          {/* Prominent Token Display */}
          {activeCustomerSession?.token && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-slate-400">Desk Token:</span>
              <TokenBadge token={activeCustomerSession.token} className="text-xs sm:text-sm py-1 px-2.5" />
            </div>
          )}
        </header>

        {/* Ephemeral Privacy Bar */}
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-1.5 text-xs text-emerald-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">Ephemeral Session: Documents permanently destroyed in 5 hours</span>
          </div>
          <Link to="/privacy" target="_blank" className="text-[11px] text-emerald-700 underline font-semibold shrink-0 ml-2">
            Policy
          </Link>
        </div>

        {/* Body Layout: Chat/Uploader + Non-intrusive right promo (Desktop only) */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 flex flex-col overflow-y-auto bg-slate-50/50">
            <Outlet />
          </main>

          {/* Optional Right advertisement drawer on desktop */}
          {!adDismissed && (
            <aside className="hidden lg:flex w-72 bg-slate-50 border-l border-slate-200 p-4 flex-col justify-between shrink-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                  <span>Sponsored Notice</span>
                  <button
                    onClick={() => setAdDismissed(true)}
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                    title="Close advertisement"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white shadow-md space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-200 text-xs font-bold uppercase tracking-wide">
                    <Sparkles className="w-4 h-4" />
                    <span>Print Shop Partner</span>
                  </div>
                  <h4 className="text-sm font-bold leading-snug">
                    Need High-Volume Color or Binding?
                  </h4>
                  <p className="text-xs text-emerald-100/90 leading-relaxed">
                    Ask shop staff at the counter for spiral binding, lamination, and thesis bond paper options.
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 text-center border-t border-slate-200 pt-3">
                SecurePrint Network
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
