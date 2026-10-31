import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  Printer,
  CheckCircle2,
  Users,
  Search,
  ArrowRight,
  Sparkles,
  QrCode,
  Layers,
  FileText,
  Eye
} from 'lucide-react';
import { useAuth } from '../../firebase/context';
import { subscribeToShopJobs } from '../../services/jobService';
import { PrintJob } from '../../types';
import { StatusBadge, TokenBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState, Skeleton } from '../../components/common/EmptyState';
import { HourlyPrintJobsChart } from '../../components/dashboard/HourlyPrintJobsChart';
import { ShopPrintPreviewModal } from '../../components/shop/ShopPrintPreviewModal';

export const ShopDashboardPage: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchToken, setSearchToken] = useState('');
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);

  const activePreviewJob = jobs.find((j) => j.id === previewJobId) || null;

  useEffect(() => {
    if (!shop?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToShopJobs(shop.id, (loadedJobs) => {
      setJobs(loadedJobs);
      setLoading(false);
    });
    return () => unsub();
  }, [shop?.id]);

  // Derived Realtime Metrics from Firebase
  const waitingJobs = jobs.filter(j => j.status === 'WAITING');
  const printingJobs = jobs.filter(j => j.status === 'PRINTING' || j.status === 'REVIEWING');
  const completedToday = jobs.filter(j => {
    if (j.status !== 'PRINTED') return false;
    const jobDate = new Date(j.updatedAt).toDateString();
    return jobDate === new Date().toDateString();
  });
  const activeSessionsCount = jobs.filter(j => ['WAITING', 'REVIEWING', 'PRINTING'].includes(j.status)).length;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchToken.trim()) {
      navigate(`/shop/queue?search=${encodeURIComponent(searchToken.trim())}`);
    }
  };

  return (
    <div className="space-y-8 text-left">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Welcome back, {shop?.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time desk telemetry and incoming customer queue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/shop/qr">
            <Button variant="outline" size="sm" className="gap-1.5">
              <QrCode className="w-4 h-4" />
              <span>Counter QR</span>
            </Button>
          </Link>
          <Link to="/shop/queue">
            <Button variant="primary" size="sm" className="gap-1.5">
              <Layers className="w-4 h-4" />
              <span>Live Queue ({waitingJobs.length})</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Realtime Metric Cards from Firebase */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Waiting Jobs</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {loading ? <Skeleton className="h-9 w-16" /> : waitingJobs.length}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Action required at counter</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Printing Now</span>
            <Printer className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {loading ? <Skeleton className="h-9 w-16" /> : printingJobs.length}
          </div>
          <p className="text-[11px] text-indigo-700 font-medium">In active physical spool</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Completed Today</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {loading ? <Skeleton className="h-9 w-16" /> : completedToday.length}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium">Successfully printed</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Active Sessions</span>
            <Users className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
            {loading ? <Skeleton className="h-9 w-16" /> : activeSessionsCount}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">Ephemeral customer sessions</p>
        </div>
      </div>

      {/* Hourly Print Jobs Chart Widget */}
      <HourlyPrintJobsChart jobs={jobs} loading={loading} />

      {/* Desk Token Instant Search */}
      <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-left w-full sm:w-auto">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-400" />
            <span>Customer Token Quick Lookup</span>
          </h3>
          <p className="text-xs text-slate-400">
            Ask customer for their 6-digit desk token (e.g. #482731) to open files instantly.
          </p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-80">
          <input
            type="text"
            placeholder="Type #token or name..."
            value={searchToken}
            onChange={(e) => setSearchToken(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <Button type="submit" size="sm" variant="primary">
            Find
          </Button>
        </form>
      </div>

      {/* Live Print Queue Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Live Print Queue</span>
          </h3>
          <Link to="/shop/queue" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 tabular-nums">
            <span>View Full Queue ({jobs.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No print jobs in queue"
            description="When customers scan your counter QR code and submit documents, their jobs appear here in real-time."
            actionText="View Shop QR Code"
            onAction={() => navigate('/shop/qr')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.slice(0, 6).map((job) => (
              <div
                key={job.id}
                onClick={() => navigate(`/shop/jobs/${job.id}`)}
                className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer space-y-3"
              >
                <div className="flex items-center justify-between">
                  <TokenBadge token={job.token} />
                  <StatusBadge status={job.status} />
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 truncate">
                    {job.customerName || 'Walk-in Customer'}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 tabular-nums">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{job.totalFiles} {job.totalFiles === 1 ? 'file' : 'files'} attached</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="tabular-nums">
                    {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {job.files && job.files.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewJobId(job.id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        title="Open calibrated Print Preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Print Preview</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/shop/jobs/${job.id}`)}
                      className="font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activePreviewJob && (
        <ShopPrintPreviewModal
          isOpen={Boolean(activePreviewJob)}
          onClose={() => setPreviewJobId(null)}
          job={activePreviewJob}
          shop={shop}
          onJobUpdated={(updatedJob) =>
            setJobs((prev) => prev.map((item) => (item.id === updatedJob.id ? updatedJob : item)))
          }
        />
      )}
    </div>
  );
};
