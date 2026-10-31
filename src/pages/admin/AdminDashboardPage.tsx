import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Store,
  Clock,
  Users,
  Layers,
  Ban,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  HardDrive,
  Trash2,
  BarChart3,
  TrendingUp,
  PieChart as PieIcon
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import {
  getAllShops,
  updateShopApproval,
  getAllSessionsAdmin,
  getAllJobsAdmin,
  getAuditLogs
} from '../../services/adminService';
import { Shop, CustomerSession, PrintJob, AuditLog } from '../../types';
import { StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Skeleton } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/Modal';

const STATUS_COLORS = {
  active: '#10b981', // emerald
  pending: '#f59e0b', // amber
  suspended: '#ef4444', // red
  blocked: '#64748b' // slate
};

export const AdminDashboardPage: React.FC = () => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Approval modal state
  const [selectedShop, setSelectedShop] = useState<{ shop: Shop; action: 'approve' | 'reject' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [loadedShops, loadedSessions, loadedJobs, loadedLogs] = await Promise.all([
          getAllShops(),
          getAllSessionsAdmin(),
          getAllJobsAdmin(),
          getAuditLogs(10)
        ]);
        setShops(loadedShops);
        setSessions(loadedSessions);
        setJobs(loadedJobs);
        setLogs(loadedLogs);
      } catch (err) {
        console.error('Failed to load admin overview:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 1. CARDS CALCULATIONS FROM REAL FIREBASE DATA
  const totalShops = shops.length;
  const activeShops = shops.filter(s => s.status === 'active').length;
  const pendingShops = shops.filter(s => s.status === 'pending');
  const pendingShopsCount = pendingShops.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayJobs = jobs.filter(j => new Date(j.createdAt).getTime() >= todayStart.getTime()).length;

  // Calculate live storage usage in MB across active jobs' files
  const totalBytes = jobs.reduce((acc, job) => {
    if (!job.files || !Array.isArray(job.files)) return acc;
    return acc + job.files.reduce((fileAcc, f) => fileAcc + (f.fileSize || 0), 0);
  }, 0);
  const storageUsageMB = (totalBytes / (1024 * 1024)).toFixed(2);

  // Expired files count (either job marked EXPIRED or TTL passed)
  const nowMs = Date.now();
  const expiredJobsCount = jobs.filter(
    j => j.status === 'EXPIRED' || (j.expiresAt && new Date(j.expiresAt).getTime() <= nowMs)
  ).length;

  // 2. CHART 1: JOBS BY DAY (LAST 7 DAYS)
  const last7DaysData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayLabel = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
    const dayStr = d.toISOString().split('T')[0];

    const count = jobs.filter(j => {
      const jDate = new Date(j.createdAt).toISOString().split('T')[0];
      return jDate === dayStr;
    }).length;

    return { day: dayLabel, jobs: count };
  });

  // 3. CHART 2: ACTIVE SHOPS BREAKDOWN
  const shopStatusData = [
    { name: 'Active', value: activeShops, color: STATUS_COLORS.active },
    { name: 'Pending', value: pendingShopsCount, color: STATUS_COLORS.pending },
    { name: 'Suspended/Blocked', value: shops.filter(s => s.status === 'suspended' || s.status === 'blocked').length, color: STATUS_COLORS.suspended }
  ].filter(item => item.value > 0);

  // Fallback if empty
  const statusChartData = shopStatusData.length > 0 ? shopStatusData : [{ name: 'No Data', value: 1, color: '#334155' }];

  // 4. CHART 3: PRINT VOLUME (Hourly or Cumulative pages/files)
  const hourlyVolumeData = [
    { hour: '9 AM', volume: 0 },
    { hour: '11 AM', volume: 0 },
    { hour: '1 PM', volume: 0 },
    { hour: '3 PM', volume: 0 },
    { hour: '5 PM', volume: 0 },
    { hour: '7 PM', volume: 0 },
    { hour: '9 PM', volume: 0 }
  ];

  jobs.forEach(job => {
    const jobDate = new Date(job.createdAt);
    const hour = jobDate.getHours();
    if (hour >= 8 && hour < 10) hourlyVolumeData[0].volume += job.totalFiles || 1;
    else if (hour >= 10 && hour < 12) hourlyVolumeData[1].volume += job.totalFiles || 1;
    else if (hour >= 12 && hour < 14) hourlyVolumeData[2].volume += job.totalFiles || 1;
    else if (hour >= 14 && hour < 16) hourlyVolumeData[3].volume += job.totalFiles || 1;
    else if (hour >= 16 && hour < 18) hourlyVolumeData[4].volume += job.totalFiles || 1;
    else if (hour >= 18 && hour < 20) hourlyVolumeData[5].volume += job.totalFiles || 1;
    else if (hour >= 20) hourlyVolumeData[6].volume += job.totalFiles || 1;
  });

  const handleApproveReject = async () => {
    if (!selectedShop) return;
    setActionLoading(true);
    try {
      const newStatus = selectedShop.action === 'approve' ? 'active' : 'suspended';
      await updateShopApproval(selectedShop.shop.id, newStatus, 'Platform Admin');

      // Update state
      setShops(prev =>
        prev.map(s => s.id === selectedShop.shop.id ? { ...s, status: newStatus } : s)
      );
      setSelectedShop(null);
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          <span>Platform Administration & Analytics</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Real-time metrics, telemetry, and retail shop oversight backed by Cloud Firestore.
        </p>
      </div>

      {/* 6 MANDATED METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 1. Total Shops */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
            <span>Total Shops</span>
            <Store className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {loading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : totalShops}
          </div>
          <p className="text-[10px] text-slate-500">Registered network</p>
        </div>

        {/* 2. Active Shops */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold uppercase">
            <span>Active Shops</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400">
            {loading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : activeShops}
          </div>
          <p className="text-[10px] text-emerald-500">Verified & live</p>
        </div>

        {/* 3. Pending Shops */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold uppercase">
            <span>Pending Shops</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400">
            {loading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : pendingShopsCount}
          </div>
          <p className="text-[10px] text-amber-500">Awaiting approval</p>
        </div>

        {/* 4. Today's Jobs */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-indigo-400 font-semibold uppercase">
            <span>Today's Jobs</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {loading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : todayJobs}
          </div>
          <p className="text-[10px] text-slate-500">Since 00:00 midnight</p>
        </div>

        {/* 5. Storage Usage */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-teal-400 font-semibold uppercase">
            <span>Storage Usage</span>
            <HardDrive className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-teal-400">
            {loading ? <Skeleton className="h-8 w-16 bg-slate-800" /> : `${storageUsageMB} MB`}
          </div>
          <p className="text-[10px] text-teal-500">Ephemeral footprint</p>
        </div>

        {/* 6. Expired Files */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-rose-400 font-semibold uppercase">
            <span>Expired Files</span>
            <Trash2 className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400">
            {loading ? <Skeleton className="h-8 w-12 bg-slate-800" /> : expiredJobsCount}
          </div>
          <p className="text-[10px] text-rose-500">5-hour pruned</p>
        </div>
      </div>

      {/* 3 MANDATED CHARTS: Jobs by Day | Active Shops | Print Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 1: Jobs by Day (7 Cols) */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span>Jobs by Day (Last 7 Days)</span>
            </h3>
            <span className="text-xs text-slate-400">Real Firebase query</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7DaysData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                />
                <Bar dataKey="jobs" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Active Shops Status Breakdown (3 Cols) */}
        <div className="lg:col-span-3 p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-emerald-400" />
              <span>Active Shops</span>
            </h3>
            <span className="text-xs text-slate-400">{shops.length} Total</span>
          </div>

          <div className="h-48 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Active
              </span>
              <span className="font-bold text-white">{activeShops}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Pending Review
              </span>
              <span className="font-bold text-white">{pendingShopsCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Suspended / Blocked
              </span>
              <span className="font-bold text-white">
                {shops.filter(s => s.status === 'suspended' || s.status === 'blocked').length}
              </span>
            </div>
          </div>
        </div>

        {/* Chart 3: Print Volume (3 Cols) */}
        <div className="lg:col-span-3 p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-400" />
              <span>Print Volume</span>
            </h3>
            <span className="text-xs text-teal-400">Hourly today</span>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyVolumeData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} stroke="#64748b" tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="volume" stroke="#14b8a6" fillOpacity={1} fill="url(#volGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="text-[11px] text-slate-400 text-center border-t border-slate-900 pt-2">
            Peak hours: 11:00 AM - 4:00 PM
          </div>
        </div>

      </div>

      {/* Pending Shop Verification Queue */}
      <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Pending Shop Verification Queue ({pendingShops.length})</span>
          </h3>
          <Link to="/admin/shops" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">
            Manage All Shops →
          </Link>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full bg-slate-900" />
        ) : pendingShops.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No shop registrations currently awaiting administrative review.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {pendingShops.map((s) => (
              <div key={s.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{s.name}</span>
                    <span className="font-mono text-[10px] text-emerald-400 px-1.5 py-0.5 rounded-sm bg-slate-900">
                      {s.publicCode}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-0.5">
                    {s.ownerName} • {s.email} • {s.city}, {s.state} ({s.pincode})
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/admin/shops/${s.id}`}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700"
                  >
                    View Details
                  </Link>
                  <Button
                    size="sm"
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => setSelectedShop({ shop: s, action: 'approve' })}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    <span>Approve</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setSelectedShop({ shop: s, action: 'reject' })}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    <span>Reject</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedShop && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setSelectedShop(null)}
          onConfirm={handleApproveReject}
          title={selectedShop.action === 'approve' ? 'Approve Printing Shop' : 'Reject Printing Shop'}
          message={`Are you sure you want to ${selectedShop.action} "${selectedShop.shop.name}"? ${
            selectedShop.action === 'approve'
              ? 'This will update Firestore status to active so the shop can take walk-in customer print jobs.'
              : 'The registration will be marked suspended in Firestore.'
          }`}
          confirmText={selectedShop.action === 'approve' ? 'Approve' : 'Reject'}
          isDestructive={selectedShop.action === 'reject'}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
};
