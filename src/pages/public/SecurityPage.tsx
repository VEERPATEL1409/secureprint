import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Clock,
  Trash2,
  FileCheck,
  CheckCircle2,
  ArrowRight,
  Printer,
  Ban,
  Server
} from 'lucide-react';
import { Button } from '../../components/common/Button';

export const SecurityPage: React.FC = () => {
  return (
    <div className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-16 text-left">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Zero-Trace Ephemeral Architecture</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          Privacy & Security by Design
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          How SecurePrint eliminates the data leak vulnerabilities inherent in traditional retail printing workflows.
        </p>
      </div>

      {/* Comparison: WhatsApp / Email vs SecurePrint */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Vulnerable Old Way */}
        <div className="p-8 rounded-3xl bg-rose-50/60 border border-rose-200/80 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-950">Traditional Print Shop Workflow</h3>
              <p className="text-xs text-rose-700 font-medium">WhatsApp, Email, or USB Drives</p>
            </div>
          </div>

          <ul className="space-y-3 text-xs text-rose-900/90 leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="font-bold text-rose-600 shrink-0">✕</span>
              <span><strong>Indefinite Storage:</strong> Sensitive files remain permanently saved in the shop operator’s WhatsApp gallery or Downloads folder.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-rose-600 shrink-0">✕</span>
              <span><strong>Phone Number Exposure:</strong> Customers must disclose their personal phone numbers to complete a simple print.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-rose-600 shrink-0">✕</span>
              <span><strong>USB Malware Risks:</strong> USB flash drives carry viruses between home laptops and unpatched retail counter computers.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-rose-600 shrink-0">✕</span>
              <span><strong>Zero Accountability:</strong> No record of when a file was printed, who accessed it, or whether it was deleted.</span>
            </li>
          </ul>
        </div>

        {/* SecurePrint Protocol */}
        <div className="p-8 rounded-3xl bg-emerald-50/60 border border-emerald-200/80 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">SecurePrint Protocol</h3>
              <p className="text-xs text-emerald-700 font-medium">Direct QR Scan & Auto-Purge</p>
            </div>
          </div>

          <ul className="space-y-3 text-xs text-slate-700 leading-relaxed">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>5-Hour Authoritative TTL:</strong> Every customer document is automatically pruned and permanently deleted within 5 hours.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>Anonymous Counter Tokens:</strong> Human-friendly 6-digit tokens (#482731) match customers without exchanging phone numbers.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>Immediate On-Demand Deletion:</strong> Customers can purge their files immediately after collecting prints.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>Multi-Tenant Role Isolation:</strong> Encrypted with hardened Firebase Security Rules forbidding cross-tenant data access.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* The 5-Hour Rule Deep Dive */}
      <div className="p-8 sm:p-10 rounded-3xl bg-slate-900 text-white space-y-8">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Clock className="w-4 h-4" />
            <span>Authoritative Lifecycle Enforcement</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            The 5-Hour Authoritative Guarantee
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Unlike other platforms where files linger forever, SecurePrint builds ephemeral state into the storage and database architecture.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800 text-xs text-slate-300">
          <div className="space-y-2">
            <div className="font-bold text-white text-sm flex items-center gap-1.5">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>1. Cryptographic Transit</span>
            </div>
            <p className="text-slate-400">
              Documents are transferred directly from the customer's mobile browser to encrypted cloud storage with TLS 1.3 encryption.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-white text-sm flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>2. Counter Processing</span>
            </div>
            <p className="text-slate-400">
              The shop operator verifies the customer's 6-digit token and prints the job. Double-printing is prevented by atomic transaction guards.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-white text-sm flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>3. Total Destruction</span>
            </div>
            <p className="text-slate-400">
              Once marked completed or after 5 hours, all file storage references, temporary files, and session states are permanently purged.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center space-y-4 pt-4">
        <h3 className="text-xl font-bold text-slate-900">Experience Private Printing at Your Local Counter</h3>
        <div className="flex justify-center gap-4">
          <Link to="/find-shop">
            <Button size="lg" variant="primary">
              <span>Find a Shop</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/shop/register">
            <Button size="lg" variant="outline">
              Register Shop
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
