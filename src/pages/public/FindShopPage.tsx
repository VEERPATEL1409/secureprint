import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Printer,
  MapPin,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Store,
  QrCode
} from 'lucide-react';
import { getAllShops } from '../../services/adminService';
import { Shop } from '../../types';
import { Button } from '../../components/common/Button';
import { Skeleton, EmptyState } from '../../components/common/EmptyState';
import { CustomerQRScannerModal } from '../../components/customer/CustomerQRScannerModal';
import { parseScannedShopTarget } from '../../utils/appUrl';

export const FindShopPage: React.FC = () => {
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [directCode, setDirectCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    const loadShops = async () => {
      try {
        const loaded = await getAllShops();
        // Show active shops first
        setShops(loaded.filter(s => s.status === 'active'));
      } catch (err) {
        console.error('Failed to load shops:', err);
      } finally {
        setLoading(false);
      }
    };
    loadShops();
  }, []);

  const handleDirectCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseScannedShopTarget(directCode);
    if (target) {
      navigate(target);
    }
  };

  const filteredShops = shops.filter(shop => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      shop.name.toLowerCase().includes(q) ||
      shop.city.toLowerCase().includes(q) ||
      shop.state?.toLowerCase().includes(q) ||
      shop.publicCode.toLowerCase().includes(q) ||
      shop.address?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12 text-left">
      {/* Header Banner */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
          <Store className="w-4 h-4 text-emerald-600" />
          <span>Verified SecurePrint Retail Counters</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Find a Print Shop Near You
        </h1>
        <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
          Locate a registered Xerox or digital printing counter in your locality. Scan their counter QR code or enter their counter code to transmit your files securely.
        </p>
      </div>

      {/* Search & Direct Code Enter */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-7">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
            <input
              type="text"
              placeholder="Search by shop name, city (e.g. Ahmedabad, Mumbai), or locality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 text-sm rounded-2xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-3.5 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="md:col-span-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <form
            onSubmit={handleDirectCodeSubmit}
            className="flex-1 flex items-center gap-2 p-1.5 bg-slate-900 rounded-2xl border border-slate-800 shadow-md text-white"
          >
            <input
              type="text"
              placeholder="Desk code (e.g. apex-print)"
              value={directCode}
              onChange={(e) => setDirectCode(e.target.value)}
              className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none font-mono"
            />
            <Button type="submit" size="sm" variant="primary" className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold whitespace-nowrap shrink-0">
              <span>Open</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan QR</span>
          </button>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium tabular-nums">
          <span>Active Counters ({filteredShops.length})</span>
          <span>Zero-Trace Cloud Guarantee</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
        ) : filteredShops.length === 0 ? (
          <EmptyState
            title="No matching shops found"
            description={
              searchQuery
                ? `No active printing shops matching "${searchQuery}". Check the shop desk code or try another city.`
                : 'No registered shops active yet. If you manage a print counter, register your business today!'
            }
            actionText={searchQuery ? 'Clear Search' : 'Register Your Shop'}
            onAction={() => (searchQuery ? setSearchQuery('') : navigate('/shop/register'))}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredShops.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${s.isOpen ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${s.isOpen ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {s.isOpen ? 'Counter Open' : 'Closed'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">{s.name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{s.address ? `${s.address}, ` : ''}{s.city}, {s.state}</span>
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Counter Desk Code:</span>
                    <span className="font-mono font-bold text-emerald-700">{s.publicCode}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <Link
                    to={`/s/${s.publicCode}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-emerald-600 transition-colors shadow-xs"
                  >
                    <span>Connect & Print Here</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Privacy Guarantee Note */}
      <div className="p-6 rounded-3xl bg-emerald-950 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Zero Long-Term Storage Protocol</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            When you connect with any verified shop on SecurePrint, all documents are protected by strict 5-hour auto-purge lifetimes. No staff members can view or re-download your files once your print session completes.
          </p>
        </div>
        <Link to="/security" className="shrink-0 text-xs font-semibold text-emerald-300 underline hover:text-white">
          Review Security Architecture →
        </Link>
      </div>
      <CustomerQRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
};
