import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  ArrowUpDown,
  FileText,
  Clock,
  Layers,
  ArrowRight,
  Printer,
  Download,
  Eye
} from 'lucide-react';
import { useAuth } from '../../firebase/context';
import { subscribeToShopJobs, updateJobStatus } from '../../services/jobService';
import { PrintJob } from '../../types';
import { TokenBadge, StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState, Skeleton } from '../../components/common/EmptyState';
import { ResolvedDownloadLink } from '../../components/common/ResolvedAttachment';
import { ShopPrintPreviewModal } from '../../components/shop/ShopPrintPreviewModal';
import { printMultipleDocumentFiles } from '../../utils/printEngine';

export const ShopQueuePage: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

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

  // Sync searchTerm with URL query param if present
  useEffect(() => {
    const q = searchParams.get('search');
    if (q) setSearchTerm(q);
  }, [searchParams]);

  // Filtered and Sorted Jobs
  const filteredJobs = jobs
    .filter((job) => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'ACTIVE' && !['WAITING', 'REVIEWING', 'PRINTING'].includes(job.status)) {
          return false;
        } else if (statusFilter !== 'ACTIVE' && job.status !== statusFilter) {
          return false;
        }
      }

      // Search Token or Customer Name
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const tokenMatch = job.token.toLowerCase().includes(query);
        const nameMatch = job.customerName.toLowerCase().includes(query);
        if (!tokenMatch && !nameMatch) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

  const filterTabs = [
    { id: 'ALL', label: 'All Jobs' },
    { id: 'WAITING', label: 'Waiting' },
    { id: 'REVIEWING', label: 'Reviewing' },
    { id: 'PRINTING', label: 'Printing' },
    { id: 'PRINTED', label: 'Completed' },
    { id: 'REJECTED', label: 'Rejected' },
    { id: 'EXPIRED', label: 'Expired' },
  ];

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-600" />
            <span>Counter Print Queue</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time customer print requests submitted via your shop's counter QR code.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'))}
            className="gap-1.5"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by 6-digit token (e.g. #482731) or customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {filterTabs.map((tab) => {
            const active = statusFilter === tab.id;
            const count = tab.id === 'ALL'
              ? jobs.length
              : jobs.filter(j => j.status === tab.id).length;

            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${active ? 'bg-slate-800 text-emerald-400' : 'bg-slate-200 text-slate-700'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Queue List */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          title="No matching print jobs"
          description={
            searchTerm
              ? `No print jobs found matching "${searchTerm}". Check the token with the customer.`
              : 'The print queue is currently empty. Jobs will appear immediately when customers submit files.'
          }
          actionText={searchTerm ? 'Clear Search' : undefined}
          onAction={() => setSearchTerm('')}
        />
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              onClick={() => navigate(`/shop/jobs/${job.id}`)}
              className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start sm:items-center gap-4">
                <TokenBadge token={job.token} className="text-base py-1.5 px-3" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-slate-900">
                      {job.customerName || 'Walk-in Customer'}
                    </h4>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{job.totalFiles} {job.totalFiles === 1 ? 'file' : 'files'}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Received {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    <span className="text-slate-400">
                      Expires in {Math.max(0, Math.round((new Date(job.expiresAt).getTime() - Date.now()) / (1000 * 60)))}m
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0" onClick={(e) => e.stopPropagation()}>
                {job.files && job.files.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewJobId(job.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors whitespace-nowrap shrink-0"
                      title="Open Print Preview & Verify Settings"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Print Preview</span>
                    </button>
                    <ResolvedDownloadLink
                      href={job.files[0].downloadUrl}
                      storagePath={job.files[0].storagePath}
                      mimeType={job.files[0].fileType}
                      fileName={job.files[0].fileName || `job_${job.token}_doc`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold whitespace-nowrap shrink-0"
                      title="Download file"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Save</span>
                    </ResolvedDownloadLink>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await printMultipleDocumentFiles(
                          job.files.map((file) => ({
                            url: file.downloadUrl,
                            name: file.fileName || (file as any).name || 'document',
                            type: file.fileType || (file as any).type,
                            storagePath: file.storagePath
                          })),
                          {
                            colorMode: job.settings?.colorMode,
                            copies: job.settings?.copies,
                            paperSize: job.settings?.paperSize,
                            orientation: job.settings?.orientation,
                            isDoubleSided: job.settings?.isDoubleSided,
                            duplexEdge: job.settings?.duplexEdge,
                            margin: job.settings?.margin,
                            fitMode: job.settings?.fitMode,
                            pageRange: job.settings?.pageRange
                          }
                        );
                        if (job.status === 'WAITING' || job.status === 'REVIEWING') {
                          await updateJobStatus(job.id, 'PRINTING');
                        }
                      }}
                      className="gap-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Print</span>
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate(`/shop/jobs/${job.id}`)} className="gap-1.5 whitespace-nowrap shrink-0">
                  <span>Open Job</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
