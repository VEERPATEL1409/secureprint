import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Printer,
  ShieldCheck,
  Zap,
  Lock,
  Clock,
  ArrowRight,
  FileCheck,
  QrCode,
  CheckCircle2,
  Trash2,
  HelpCircle,
  Search
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { CustomerQRScannerModal } from '../../components/customer/CustomerQRScannerModal';
import { parseScannedShopTarget } from '../../utils/appUrl';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleSearchShop = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseScannedShopTarget(searchCode);
    if (target) {
      navigate(target);
    }
  };

  const faqs = [
    {
      q: 'Why should I use SecurePrint instead of WhatsApp or email?',
      a: 'When you share files via WhatsApp or email, your sensitive documents (resumes, Aadhaar cards, legal deeds) remain stored on the shop operator’s personal phone or computer indefinitely. SecurePrint automatically deletes documents from storage within 5 hours.'
    },
    {
      q: 'Do I need to install an app or create an account as a customer?',
      a: 'No! You simply scan the shop’s counter QR code with your smartphone camera. You receive an instant 6-digit desk token (e.g. #482731) and upload your file in your browser.'
    },
    {
      q: 'How does the print shop find my documents?',
      a: 'When you arrive at the counter, tell the staff your 6-digit token. The operator types your token into their live queue, previews the file, checks your print settings (Color/B&W, copies), and prints.'
    },
    {
      q: 'Can the shop print my documents after I leave?',
      a: 'No. All documents and sessions expire automatically within 5 hours. Furthermore, you can manually delete your documents immediately after the print status changes to "Printed".'
    }
  ];

  return (
    <div className="space-y-24 py-12 sm:py-16">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Zero Permanent Data Retention for Xerox & Print Shops</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
              Private document printing, <br className="hidden sm:inline" />
              <span className="text-emerald-600">made simple.</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl">
              Send your documents securely to your local printing shop without unnecessary long-term storage.
            </p>

            {/* Quick Public Code Search & Live QR Scanner */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 max-w-xl">
              <form
                onSubmit={handleSearchShop}
                className="flex-1 flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-300 shadow-xs focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500"
              >
                <div className="pl-3 text-slate-400">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  placeholder="Enter shop code (e.g., apex-print)..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  className="w-full text-sm text-slate-900 placeholder-slate-400 bg-transparent focus:outline-none"
                />
                <Button type="submit" size="sm" variant="primary" className="whitespace-nowrap shrink-0">
                  Open
                </Button>
              </form>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Scan Shop QR</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link to="/how-it-works">
                <Button size="lg" variant="primary">
                  <span>How It Works</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/shop/register">
                <Button size="lg" variant="secondary">
                  For Printing Shops
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200 text-left">
              <div>
                <div className="text-xl font-bold text-slate-900">5 Hours</div>
                <div className="text-xs text-slate-500">Authoritative Ephemeral TTL</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">#Token</div>
                <div className="text-xs text-slate-500">Human-friendly Desk Match</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">0 KB</div>
                <div className="text-xs text-slate-500">Residual Cloud Footprint</div>
              </div>
            </div>
          </div>

          {/* Original Product UI Visual Mockup */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-sm rounded-3xl bg-slate-900 p-4 shadow-2xl shadow-emerald-950/20 border border-slate-800">
              <div className="rounded-2xl bg-white p-5 space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                      <Printer className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Apex Xerox & Prints</div>
                      <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Counter Active
                      </div>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-slate-900 text-emerald-400 font-mono text-xs font-bold">
                    #482731
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">Govt_ID_Proof.pdf</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-sm font-semibold">100% Uploaded</span>
                  </div>
                  <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full w-full" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>1.4 MB • 2 Pages</span>
                    <span className="font-semibold text-slate-700">Color • 2 Copies • A4</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-indigo-900 font-medium">
                    <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Auto-destroying in 4h 48m</span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 uppercase">Secured</span>
                </div>

                <div className="pt-2 text-center">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Print Operator Desk View
                  </div>
                  <div className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm">
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Queue Synced</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="bg-white py-16 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-600">The Modern Privacy Hazard</h2>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Why traditional Xerox shop methods violate customer privacy
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="text-lg font-bold text-slate-900">WhatsApp & Phone Number Leaks</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Customers must exchange personal WhatsApp numbers with unfamiliar counter staff. Document downloads sit indefinitely in the shop phone gallery and WhatsApp backup history.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="text-lg font-bold text-slate-900">USB Drive Malware Transmission</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Plugging customer thumb drives into shop computers spreads worms, Trojans, and ransomware, resulting in damaged operator systems and corrupted customer flash drives.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Automated Document Purging</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Downloaded tax documents, contracts, and certificates accumulate in the shop PC’s "Downloads" folder, accessible to subsequent customers or unauthorized third parties.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
        <div className="max-w-2xl mx-auto space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-600">Streamlined Workflow</h2>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
            How SecurePrint Works in 3 Intuitive Steps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <QrCode className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">1. Scan Counter QR Code</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Customer scans the shop standee. No app installation or email signup required. A private session is generated with a unique 6-digit desk token.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">2. Upload & Configure Specs</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Customer selects PDF or images, configures B&W or Color, copies, and page range. File streams directly to secure cloud storage.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">3. Print & Immediate Purge</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              The shop reviews specs and triggers the browser print dialog. Files can be purged immediately by the customer or auto-cleared in 5 hours.
            </p>
          </div>
        </div>
      </section>

      {/* For Shops Section */}
      <section className="bg-slate-900 text-white py-16 rounded-3xl max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center text-left">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 text-xs font-semibold border border-emerald-800">
              <span>Business Advantage</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              Designed specifically for high-speed print counters
            </h2>
            <p className="text-slate-300 text-base leading-relaxed">
              No more waiting for customer Bluetooth transfers or sorting through WhatsApp spam. SecurePrint gives your desk a real-time live queue organized by 6-digit customer tokens.
            </p>
            <ul className="space-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Search queue instantly by desk token (e.g. #482731)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Precise customer print settings (Color, Copies, Paper format)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Instant OPEN / CLOSED toggle for counter crowd management</span>
              </li>
            </ul>
            <div className="pt-2">
              <Link to="/shop/register">
                <Button size="lg" variant="primary">
                  Register Your Printing Shop
                </Button>
              </Link>
            </div>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              <span>Real-Time Desk Queue</span>
            </h3>
            <div className="space-y-2 font-mono text-xs">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-emerald-400 font-bold">#482731</span> • <span className="text-white">Rahul Verma</span>
                </div>
                <span className="px-2 py-0.5 bg-amber-950 text-amber-300 rounded-md border border-amber-800">WAITING</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-emerald-400 font-bold">#891042</span> • <span className="text-white">Priya Patel</span>
                </div>
                <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded-md border border-indigo-800">PRINTING</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-between opacity-60">
                <div>
                  <span className="text-slate-400 font-bold">#310941</span> • <span className="text-slate-300">Ankit Mehta</span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded-md border border-emerald-800">PRINTED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-left">
        <div className="text-center space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-600">Common Questions</h2>
          <p className="text-3xl font-extrabold text-slate-900">Frequently Asked Questions</p>
        </div>

        <div className="space-y-4">
          {faqs.map((item, idx) => (
            <div key={idx} className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{item.q}</span>
              </h3>
              <p className="text-sm text-slate-600 pl-7 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="p-10 rounded-3xl bg-emerald-600 text-white space-y-4 shadow-xl shadow-emerald-700/20">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to upgrade your printing counter?
          </h2>
          <p className="text-emerald-100 max-w-xl mx-auto text-base">
            Join photocopy centers and print shops adopting privacy-first, zero-trace document workflows today.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <Link to="/shop/register">
              <Button size="lg" variant="secondary">
                Register Your Shop Now
              </Button>
            </Link>
            <Link to="/about">
              <button
                type="button"
                className="inline-flex items-center justify-center font-medium px-5 py-2.5 text-base rounded-lg gap-2.5 bg-black text-white border border-white/35 shadow-xs transition-colors duration-150 hover:bg-white/15 hover:text-white hover:border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-600 select-none whitespace-nowrap shrink-0"
              >
                Learn More
              </button>
            </Link>
          </div>
        </div>
      </section>
      <CustomerQRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
};
