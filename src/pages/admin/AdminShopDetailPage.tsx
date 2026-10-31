import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Store,
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  Ban,
  MapPin,
  Mail,
  Phone,
  Calendar,
  ExternalLink,
  Layers,
  FileText,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { updateShopApproval } from '../../services/adminService';
import { Shop, PrintJob } from '../../types';
import { StatusBadge, TokenBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Skeleton } from '../../components/common/EmptyState';

export const AdminShopDetailPage: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();

  const [shop, setShop] = useState<Shop | null>(null);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!shopId) return;

    const fetchShopAndJobs = async () => {
      try {
        const shopSnap = await getDoc(doc(db, 'shops', shopId));
        if (!shopSnap.exists()) {
          setLoading(false);
          return;
        }
        const shopData = { id: shopSnap.id, ...shopSnap.data() } as Shop;
        setShop(shopData);

        // Fetch recent jobs for this shop
        const q = query(
          collection(db, 'printJobs'),
          where('shopId', '==', shopId),
          limit(20)
        );
        const jobSnaps = await getDocs(q);
        const loadedJobs: PrintJob[] = [];
        jobSnaps.forEach(doc => {
          loadedJobs.push({ id: doc.id, ...doc.data() } as PrintJob);
        });
        setJobs(loadedJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch (err) {
        console.error('Failed to load shop details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchShopAndJobs();
  }, [shopId]);

  const handleStatusChange = async (newStatus: 'active' | 'pending' | 'suspended' | 'blocked') => {
    if (!shop) return;
    setActionLoading(true);
    try {
      await updateShopApproval(shop.id, newStatus, 'Platform Admin');
      setShop(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (err) {
      console.error('Failed to update shop status:', err);
      alert('Failed to update shop status.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 text-left">
        <Skeleton className="h-8 w-48 bg-slate-900" />
        <Skeleton className="h-64 w-full bg-slate-950" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400">
        <h3 className="text-base font-bold text-white">Shop not found</h3>
        <button
          onClick={() => navigate('/admin/shops')}
          className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-white hover:bg-slate-700"
        >
          Return to Shop Directory
        </button>
      </div>
    );
  }

  const kioskUrl = `${window.location.origin}/s/${shop.publicCode}`;

  return (
    <div className="space-y-6 text-left">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/shops')}
            className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-extrabold text-white">{shop.name}</h2>
              <StatusBadge status={shop.status} />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Public Code: <span className="font-mono text-emerald-400 font-bold">{shop.publicCode}</span>
            </p>
          </div>
        </div>

        {/* Status Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {shop.status !== 'active' && (
            <Button
              size="sm"
              variant="primary"
              isLoading={actionLoading}
              onClick={() => handleStatusChange('active')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              <span>{shop.status === 'pending' ? 'Approve Shop' : 'Reactivate Shop'}</span>
            </Button>
          )}

          {shop.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              isLoading={actionLoading}
              onClick={() => handleStatusChange('suspended')}
              className="border-amber-800/80 text-amber-400 hover:bg-amber-950/60"
            >
              <PauseCircle className="w-3.5 h-3.5 mr-1" />
              <span>Suspend Shop</span>
            </Button>
          )}

          {shop.status !== 'blocked' && (
            <Button
              size="sm"
              variant="danger"
              isLoading={actionLoading}
              onClick={() => handleStatusChange('blocked')}
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              <span>Block Shop</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Shop Details Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
              Registration Dossier
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">Owner / Operator</span>
                <span className="font-semibold text-white text-sm">{shop.ownerName}</span>
              </div>

              <div>
                <span className="text-slate-500 block">Contact Email</span>
                <span className="font-mono text-slate-300">{shop.email}</span>
              </div>

              {shop.phone && (
                <div>
                  <span className="text-slate-500 block">Phone Number</span>
                  <span className="font-mono text-slate-300">{shop.phone}</span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block">Physical Address</span>
                <span className="text-slate-300">{shop.address || 'Standard Xerox Counter'}</span>
                <div className="text-slate-400 mt-0.5">
                  {shop.city}, {shop.state} {shop.pincode ? `(${shop.pincode})` : ''}
                </div>
              </div>

              {shop.gstin && (
                <div>
                  <span className="text-slate-500 block">GSTIN / Tax ID</span>
                  <span className="font-mono text-indigo-300">{shop.gstin}</span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block">Customer Kiosk Link</span>
                <a
                  href={kioskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
                >
                  <span className="truncate">{kioskUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Real-time Shop Jobs Activity */}
        <div className="lg:col-span-8 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Recent Jobs Processed at Counter ({jobs.length})</span>
              </h3>
              <span className="text-xs text-slate-500">Auto-purged after 5 hours</span>
            </div>

            {jobs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No active print jobs found for this counter station.
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <TokenBadge token={j.token} />
                      <div>
                        <span className="font-bold text-white">{j.customerName}</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {j.files?.length || 1} file(s) • {j.settings?.copies || 1} copies • {j.settings?.colorMode || 'B&W'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={j.status} />
                      <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                        {new Date(j.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
