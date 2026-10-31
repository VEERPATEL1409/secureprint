import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  LayoutDashboard,
  Store,
  Users,
  Layers,
  Ban,
  BarChart,
  Sliders,
  FileText,
  LogOut,
  Menu,
  X,
  Lock
} from 'lucide-react';
import { useAuth } from '../firebase/context';
import { DatabaseStatusBadge } from '../components/common/DatabaseStatusBadge';

export const AdminLayout: React.FC = () => {
  const { user, adminEmail, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const adminNav = [
    { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Shop Approvals', path: '/admin/shops', icon: Store },
    { label: 'Customer Sessions', path: '/admin/customers', icon: Users },
    { label: 'Print Jobs', path: '/admin/jobs', icon: Layers },
    { label: 'Blocked Sessions', path: '/admin/blocked', icon: Ban },
    { label: 'System Reports', path: '/admin/reports', icon: BarChart },
    { label: 'Platform Config', path: '/admin/settings', icon: Sliders },
    { label: 'Audit Logs', path: '/admin/audit-logs', icon: FileText },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Admin Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-950 border-r border-slate-800 text-slate-200 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-white block">
                SECURE<span className="text-indigo-400">ADMIN</span>
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-indigo-400/80 block">
                Platform Console
              </span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-800">
          <div className="px-3 py-2 text-xs text-slate-400 truncate">
            Admin: {adminEmail || user?.email || 'admin@secureprint.internal'}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/40 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Admin Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Content */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-bold text-white uppercase tracking-wider">
              Control Panel
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <DatabaseStatusBadge variant="dark" showDetails />
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
              Root Authority
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
