import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Eye, CheckCircle2, PauseCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { getAllShops, updateShopApproval } from '../../services/adminService';
import { Shop } from '../../types';
import { StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Skeleton } from '../../components/common/EmptyState';

export const AdminShopsPage: React.FC = () => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchShops = async () => {
    try {
      const loaded = await getAllShops();
      setShops(loaded);
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  const handleStatusChange = async (shopId: string, newStatus: 'active' | 'pending' | 'suspended' | 'blocked') => {
    setActionLoadingId(shopId);
    try {
      await updateShopApproval(shopId, newStatus, 'Platform Admin');
      setShops(prev => prev.map(s => s.id === shopId ? { ...s, status: newStatus } : s));
    } catch (err) {
      console.error('Failed to update shop status:', err);
      alert('Failed to update status in Firestore.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredShops = shops.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.publicCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Store className="w-6 h-6 text-indigo-400" />
            <span>Shop Network Directory</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit, approve, suspend, or reactivate registered printing shop counters across India.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => { setLoading(true); fetchShops(); }}
          className="border-slate-800 text-slate-300 hover:bg-slate-900"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          <span>Refresh List</span>
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by shop name, owner, city, or public code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active ({shops.filter(s => s.status === 'active').length})</option>
          <option value="pending">Pending ({shops.filter(s => s.status === 'pending').length})</option>
          <option value="suspended">Suspended ({shops.filter(s => s.status === 'suspended').length})</option>
          <option value="blocked">Blocked ({shops.filter(s => s.status === 'blocked').length})</option>
        </select>
      </div>

      {/* MANDATED TABLE: Shop | Owner | City | Status | Created | Actions */}
      {loading ? (
        <Skeleton className="h-64 w-full bg-slate-950" />
      ) : (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Shop</th>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredShops.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500 text-xs">
                      No shops found matching your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredShops.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-white text-sm">{s.name}</div>
                        <div className="font-mono text-[10px] text-emerald-400 mt-0.5">
                          Code: {s.publicCode}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        <div className="font-medium text-white">{s.ownerName}</div>
                        <div className="text-[11px] text-slate-500">{s.email}</div>
                        {s.phone && <div className="text-[10px] text-slate-500 font-mono">{s.phone}</div>}
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        <div>{s.city}</div>
                        <div className="text-[10px] text-slate-500">{s.state} {s.pincode ? `(${s.pincode})` : ''}</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-400 font-mono text-[11px]">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* 1. View */}
                          <Link
                            to={`/admin/shops/${s.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                            title="View shop details & job stats"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </Link>

                          {/* 2. Approve (if pending) */}
                          {s.status === 'pending' && (
                            <button
                              disabled={actionLoadingId === s.id}
                              onClick={() => handleStatusChange(s.id, 'active')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800 hover:bg-emerald-900 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          )}

                          {/* 3. Suspend (if active) */}
                          {s.status === 'active' && (
                            <button
                              disabled={actionLoadingId === s.id}
                              onClick={() => handleStatusChange(s.id, 'suspended')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-300 bg-amber-950/80 border border-amber-800 hover:bg-amber-900 transition-colors disabled:opacity-50"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>Suspend</span>
                            </button>
                          )}

                          {/* 4. Reactivate (if suspended or blocked) */}
                          {(s.status === 'suspended' || s.status === 'blocked') && (
                            <button
                              disabled={actionLoadingId === s.id}
                              onClick={() => handleStatusChange(s.id, 'active')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800 hover:bg-emerald-900 transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Reactivate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
