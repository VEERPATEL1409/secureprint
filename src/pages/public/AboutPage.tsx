import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Printer, CheckCircle, Users, Sparkles, Building2 } from 'lucide-react';
import { Button } from '../../components/common/Button';

export const AboutPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16 text-left">
      <div className="space-y-4">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Enterprise Privacy</span>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
          About SecurePrint Platform
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed max-w-3xl">
          SecurePrint was created to solve one of the most widespread, overlooked data privacy hazards in modern retail: the unencrypted, permanent storage of personal documents at local photocopy and Xerox shops.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Our Mission</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            To provide an ephemeral, zero-trace transmission channel that protects customers from identity theft while giving print shop operators a faster, clutter-free counter management tool.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">For Printing Businesses</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Counter operators waste an average of 3 to 5 minutes per customer waiting for WhatsApp messages, managing spam, or ejecting infected USB drives. SecurePrint replaces that chaos with structured 6-digit tokens.
          </p>
        </div>
      </div>

      <div className="p-8 rounded-3xl bg-slate-900 text-white space-y-6">
        <h2 className="text-2xl font-bold">Key Architectural Invariants</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-slate-300">
          <div>
            <div className="font-bold text-white mb-1">5-Hour Hard TTL</div>
            <p className="text-xs text-slate-400">Server-enforced file purging. Visual countdowns on client with automated Cloud Storage deletion.</p>
          </div>
          <div>
            <div className="font-bold text-white mb-1">No Customer Logins</div>
            <p className="text-xs text-slate-400">Instant scan-and-print onboarding. No passwords, credentials, or personal email storage.</p>
          </div>
          <div>
            <div className="font-bold text-white mb-1">Zero USB Malwares</div>
            <p className="text-xs text-slate-400">100% web-based sandboxed transmission preventing flash drive malware infestation.</p>
          </div>
        </div>
        <div className="pt-2">
          <Link to="/shop/register">
            <Button size="md" variant="primary">
              Register Shop
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export const HowItWorksPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16 text-left">
      <div className="space-y-4">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">User Guide</span>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
          How SecurePrint Operates
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed max-w-3xl">
          A seamless flow connecting walk-in customers and print desk operators through ephemeral sessions and real-time live queues.
        </p>
      </div>

      <div className="space-y-8">
        <div className="flex items-start gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
            1
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">QR Code Scan at Print Shop Counter</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Upon walking into a registered print shop, the customer scans the shop’s unique counter QR code with any smartphone camera. This opens a mobile-optimized session directly in their browser without downloading any apps.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
            2
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Receive 6-Digit Desk Token & Upload</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              The customer enters a display nickname and receives a 6-digit desk token (such as #482731). They upload their PDF or image files, configure their desired print settings (Color vs B&W, copies, page range), and hit Send.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
            3
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Operator Previews & Executes Print</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              The shop operator types or clicks the customer’s token on their live dashboard queue. They preview the file in high-fidelity, confirm the customer’s specified settings, and trigger the print dialog.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
            4
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Automatic 5-Hour Deletion Guarantee</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              The customer can immediately delete their document once it is printed. Otherwise, server-side Cloud functions authoritatively purge the file and session data after 5 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
