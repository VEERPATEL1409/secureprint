import React, { useEffect, useState } from 'react';
import {
  Users,
  Layers,
  Ban,
  BarChart,
  FileText,
  Sliders,
  ShieldCheck,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  HardDrive
} from 'lucide-react';
import {
  getAllSessionsAdmin,
  getAllJobsAdmin,
  getAuditLogs,
  getAllShops
} from '../../services/adminService';
import { run5HourExpirationCleanup, CleanupResult } from '../../services/cleanupService';
import { CustomerSession, PrintJob, AuditLog, Shop } from '../../types';
import { TokenBadge, StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Skeleton, EmptyState } from '../../components/common/EmptyState';

// 1. ADMIN CUSTOMER SESSIONS & FILES PAGE (/admin/sessions)
export const AdminSessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);

  const fetchAll = async () => {
    try {
      const [loadedSessions, loadedJobs, loadedShops] = await Promise.all([
        getAllSessionsAdmin(),
        getAllJobsAdmin(),
        getAllShops()
      ]);
      setSessions(loadedSessions);
      setJobs(loadedJobs);
      setShops(loadedShops);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleRunCleanup = async () => {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const res = await run5HourExpirationCleanup('admin-dashboard-manual');
      setCleanupResult(res);
      await fetchAll();
    } catch (err) {
      console.error('Cleanup execution failed:', err);
      alert('Failed to complete 5-hour TTL cleanup.');
    } finally {
      setCleaning(false);
    }
  };

  const getShopName = (shopId: string) => {
    const shop = shops.find(s => s.id === shopId);
    return shop ? `${shop.name} (${shop.publicCode})` : shopId.substring(0, 8);
  };

  const getFilesCount = (sessionId: string) => {
    const sessionJobs = jobs.filter(j => j.sessionId === sessionId);
    return sessionJobs.reduce((acc, j) => acc + (j.files?.length || j.totalFiles || 0), 0);
  };

  const getRemainingTime = (expiresAt: string) => {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m left`;
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            <span>Active Customer Sessions & Files</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time inspection of active customer kiosk sessions and file lifetimes across all shops.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAll}
            className="border-slate-800 text-slate-300 hover:bg-slate-900"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            variant="danger"
            isLoading={cleaning}
            onClick={handleRunCleanup}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            <span>Run 5h TTL Cleanup Sweep</span>
          </Button>
        </div>
      </div>

      {cleanupResult && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>5-Hour TTL Sweep Completed Successfully</span>
          </div>
          <p className="text-emerald-200/80">
            Purged {cleanupResult.expiredSessionsCount} expired sessions, flagged {cleanupResult.expiredJobsCount} jobs, and removed {cleanupResult.deletedFilesCount} ephemeral storage files.
          </p>
        </div>
      )}

      {/* MANDATED TABLE: Session ID | Shop | Created | Expires In | Files Count | Status */}
      {loading ? (
        <Skeleton className="h-64 w-full bg-slate-950" />
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
          No customer sessions currently active on the network.
        </div>
      ) : (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Session ID / Token</th>
                  <th className="px-5 py-3">Shop</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Expires In</th>
                  <th className="px-5 py-3">Files Count</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {sessions.map((s) => {
                  const remaining = getRemainingTime(s.expiresAt);
                  const isExpired = remaining === 'Expired';
                  const filesCount = getFilesCount(s.id);

                  return (
                    <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <TokenBadge token={s.token} className="text-xs py-0.5 px-2" />
                          <span className="font-mono text-[10px] text-slate-500">{s.id.substring(0, 8)}...</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{s.customerName}</div>
                      </td>
                      <td className="px-5 py-3.5 text-white font-medium">
                        {getShopName(s.shopId)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`font-mono font-bold text-xs ${isExpired ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {remaining}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-300 font-bold">
                        {filesCount} file(s)
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          s.status === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// 2. ADMIN AUDIT LOGS PAGE (/admin/logs)
export const AdminJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const loaded = await getAllJobsAdmin();
        setJobs(loaded);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Layers className="w-6 h-6 text-indigo-400" />
          <span>Global Print Operations</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Audit stream of print operations processed across all registered shops.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full bg-slate-950" />
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
          No print jobs recorded.
        </div>
      ) : (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Token</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Files</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <TokenBadge token={j.token} className="text-xs py-0.5 px-2" />
                  </td>
                  <td className="px-5 py-3.5 font-bold text-white">{j.customerName}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-medium">{j.totalFiles || j.files?.length || 1} file(s)</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">{new Date(j.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AdminAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = async () => {
    try {
      const loaded = await getAuditLogs(100);
      setLogs(loaded);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadgeClass = (action: string) => {
    if (action.includes('APPROV') || action.includes('ACTIVE')) return 'bg-emerald-950 text-emerald-400 border-emerald-800';
    if (action.includes('SUSPEND') || action.includes('BLOCK')) return 'bg-rose-950 text-rose-400 border-rose-800';
    if (action.includes('PURGE') || action.includes('DELETE')) return 'bg-amber-950 text-amber-400 border-amber-800';
    return 'bg-indigo-950 text-indigo-400 border-indigo-800';
  };

  const filteredLogs = logs.filter(l =>
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-400" />
            <span>Platform Security Audit Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable records of shop approvals, suspensions, 5-hour file deletions, and admin governance actions.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => { setLoading(true); fetchLogs(); }}
          className="border-slate-800 text-slate-300 hover:bg-slate-900"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          <span>Refresh Logs</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
        <input
          type="text"
          placeholder="Filter logs by action, admin actor, or details..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full bg-slate-950" />
      ) : filteredLogs.length === 0 ? (
        <div className="p-12 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
          No audit entries recorded yet.
        </div>
      ) : (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Event Action</th>
                  <th className="px-5 py-3">Performed By</th>
                  <th className="px-5 py-3">Target Reference</th>
                  <th className="px-5 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadgeClass(l.action)}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-300">
                      {l.performedBy}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">
                      {l.targetType}: {l.targetId?.substring(0, 10)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 max-w-xs">
                      {l.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// 3. ADMIN SETTINGS & SYSTEM GOVERNANCE PAGE (/admin/system)
export const AdminSettingsPage: React.FC = () => {
  return (
    <div className="max-w-3xl space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Sliders className="w-6 h-6 text-indigo-400" />
          <span>System Governance & Policies</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Core architectural policies governing ephemeral retention, multi-tenant boundaries, and compliance.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs text-slate-300 shadow-xl">
        <div className="flex items-center justify-between py-3 border-b border-slate-800">
          <div>
            <div className="font-bold text-white text-sm">Strict 5-Hour Retention TTL</div>
            <div className="text-slate-400">Files and session tokens automatically expire and purge after 5 hours</div>
          </div>
          <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-800">
            300 Minutes (5h)
          </span>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-slate-800">
          <div>
            <div className="font-bold text-white text-sm">Multi-Role Security Model</div>
            <div className="text-slate-400">Public, Customer, Shop Counter, and Administrative apps completely partitioned</div>
          </div>
          <span className="font-mono text-indigo-400 font-bold bg-indigo-950/60 px-3 py-1 rounded-lg border border-indigo-800">
            Active
          </span>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-slate-800">
          <div>
            <div className="font-bold text-white text-sm">Double-Print Prevention Lock</div>
            <div className="text-slate-400">Atomic Firestore transaction ensures only 1 counter station prints a job</div>
          </div>
          <span className="font-mono text-teal-400 font-bold bg-teal-950/60 px-3 py-1 rounded-lg border border-teal-800">
            Atomic Lock Active
          </span>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <div className="font-bold text-white text-sm">Shop Counter Verification Protocol</div>
            <div className="text-slate-400">New shops enter 'pending' state and cannot accept prints until Admin review</div>
          </div>
          <span className="font-mono text-amber-400 font-bold bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-800">
            Manual Admin Review
          </span>
        </div>
      </div>
    </div>
  );
};
