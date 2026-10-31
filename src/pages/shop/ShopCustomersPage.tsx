import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  ShieldAlert,
  Clock,
  Ban,
  CheckCircle,
  FileText,
  History,
  Download
} from 'lucide-react';
import { useAuth } from '../../firebase/context';
import { getShopSessions, blockCustomerSession, unblockCustomerSession } from '../../services/sessionService';
import { getShopJobs } from '../../services/jobService';
import { CustomerSession, PrintJob } from '../../types';
import { TokenBadge, StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState, Skeleton } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/Modal';

// 1. SHOP CUSTOMERS PAGE
export const ShopCustomersPage: React.FC = () => {
  const { shop } = useAuth();
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Block Modal
  const [selectedSession, setSelectedSession] = useState<CustomerSession | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);

  useEffect(() => {
    if (!shop?.id) return;
    const fetch = async () => {
      try {
        const data = await getShopSessions(shop.id);
        setSessions(data);
      } catch (err) {
        console.error('Failed to load shop sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [shop?.id]);

  const handleBlockToggle = async () => {
    if (!selectedSession || !shop) return;
    setBlockLoading(true);
    try {
      if (selectedSession.isBlocked) {
        await unblockCustomerSession(selectedSession.id);
        setSessions(prev =>
          prev.map(s => s.id === selectedSession.id ? { ...s, isBlocked: false, status: 'active' } : s)
        );
      } else {
        await blockCustomerSession(selectedSession.id, 'Counter operator manual block', shop.id);
        setSessions(prev =>
          prev.map(s => s.id === selectedSession.id ? { ...s, isBlocked: true, status: 'blocked' } : s)
        );
      }
    } catch (err) {
      console.error('Error toggling block state:', err);
    } finally {
      setBlockLoading(false);
      setSelectedSession(null);
    }
  };

  const filteredSessions = sessions.filter(s =>
    s.token.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>Counter Customer Sessions</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active and past ephemeral sessions connected to your shop counter.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Filter by token or customer name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 font-mono"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredSessions.length === 0 ? (
        <EmptyState
          title="No customer sessions found"
          description="Customer sessions generated from scanning your counter QR code will appear here."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Token</th>
                  <th className="px-5 py-3">Customer Name</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Session Created</th>
                  <th className="px-5 py-3">TTL Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <TokenBadge token={s.token} className="text-xs py-0.5 px-2" />
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {s.customerName}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {s.customerPhone || 'Not provided'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      {s.isBlocked ? (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200">
                          Blocked
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedSession(s)}
                        className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
                          s.isBlocked
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                        }`}
                      >
                        {s.isBlocked ? 'Unblock' : 'Block'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedSession && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setSelectedSession(null)}
          onConfirm={handleBlockToggle}
          title={selectedSession.isBlocked ? 'Unblock Customer Session' : 'Block Customer Session'}
          message={`Are you sure you want to ${selectedSession.isBlocked ? 'unblock' : 'block'} token ${selectedSession.token}? Blocked sessions cannot submit new documents.`}
          confirmText={selectedSession.isBlocked ? 'Unblock' : 'Block'}
          isDestructive={!selectedSession.isBlocked}
          isLoading={blockLoading}
        />
      )}
    </div>
  );
};

// 2. SHOP HISTORY PAGE
export const ShopHistoryPage: React.FC = () => {
  const { shop } = useAuth();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!shop?.id) return;
    const fetch = async () => {
      try {
        const data = await getShopJobs(shop.id);
        setJobs(data);
      } catch (err) {
        console.error('Failed to load job history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [shop?.id]);

  const historyJobs = jobs.filter(j => j.status === 'PRINTED' || j.status === 'REJECTED' || j.status === 'EXPIRED');

  const filteredHistory = historyJobs.filter(j =>
    j.token.toLowerCase().includes(searchTerm.toLowerCase()) ||
    j.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    const headers = ['Token,Customer,Files,Status,Date'];
    const rows = filteredHistory.map(j =>
      `"${j.token}","${j.customerName}",${j.totalFiles},"${j.status}","${new Date(j.createdAt).toISOString()}"`
    );
    const blob = new Blob([[...headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SecurePrint_History_${shop?.publicCode || 'shop'}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-600" />
            <span>Job Execution History</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit log of fulfilled and completed print operations.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredHistory.length === 0} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search historical jobs by token or customer name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 font-mono"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredHistory.length === 0 ? (
        <EmptyState
          title="No history records"
          description="Fulfilled print jobs will be logged here for audit and reporting purposes."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Token</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Files</th>
                  <th className="px-5 py-3">Settings</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Completed Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <TokenBadge token={j.token} className="text-xs py-0.5 px-2" />
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {j.customerName}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {j.totalFiles} attached
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {j.settings?.colorMode || 'B&W'} • {j.settings?.copies || 1} copies
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-400">
                      {new Date(j.updatedAt).toLocaleString()}
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

// 3. SHOP BLOCKED SESSIONS PAGE
export const ShopBlockedPage: React.FC = () => {
  const { shop } = useAuth();
  const [blockedSessions, setBlockedSessions] = useState<CustomerSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shop?.id) return;
    const fetch = async () => {
      try {
        const data = await getShopSessions(shop.id);
        setBlockedSessions(data.filter(s => s.isBlocked || s.status === 'blocked'));
      } catch (err) {
        console.error('Failed to load blocked sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [shop?.id]);

  const handleUnblock = async (sessionId: string) => {
    try {
      await unblockCustomerSession(sessionId);
      setBlockedSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to unblock session:', err);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Ban className="w-6 h-6 text-rose-600" />
          <span>Blocked Counter Sessions</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Customers restricted from submitting files to your counter.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : blockedSessions.length === 0 ? (
        <EmptyState
          title="No blocked sessions"
          description="Your counter has no blocked customers or tokens."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blockedSessions.map((s) => (
            <div key={s.id} className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TokenBadge token={s.token} />
                  <span className="text-sm font-bold text-slate-900">{s.customerName}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Blocked reason: {s.blockReason || 'Manual counter block'}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleUnblock(s.id)}>
                Unblock
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
