import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Printer, Shield, ArrowLeft } from 'lucide-react';

export const ShopAuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50 relative selection:bg-emerald-100">
      <div className="absolute top-6 left-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-600 text-white shadow-md mb-3">
          <Printer className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          SECURE<span className="text-emerald-600">PRINT</span>
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Partner Shop Management Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/50 rounded-2xl border border-slate-200/80">
          <Outlet />
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>End-to-End Ephemeral Encryption & Zero Storage Leak</span>
        </div>
      </div>
    </div>
  );
};
