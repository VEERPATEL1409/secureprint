import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Printer,
  LayoutDashboard,
  Layers,
  Users,
  History,
  ShieldAlert,
  BarChart3,
  QrCode,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  Power,
  Bell,
  Search,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../firebase/context';
import { toggleShopStatus } from '../services/shopService';
import { DatabaseStatusBadge } from '../components/common/DatabaseStatusBadge';

export const ShopDashboardLayout: React.FC = () => {
  const { shop, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const navItems = [
    { label: 'Dashboard', path: '/shop/dashboard', icon: LayoutDashboard },
    { label: 'Print Queue', path: '/shop/queue', icon: Layers },
    { label: 'Customers', path: '/shop/customers', icon: Users },
    { label: 'History', path: '/shop/history', icon: History },
    { label: 'Blocked Sessions', path: '/shop/blocked', icon: ShieldAlert },
    { label: 'Reports', path: '/shop/reports', icon: BarChart3 },
    { label: 'QR Code', path: '/shop/qr', icon: QrCode },
    { label: 'Settings', path: '/shop/settings', icon: Settings },
  ];

  const handleToggleStatus = async () => {
    if (!shop || isTogglingStatus) return;
    setIsTogglingStatus(true);
    try {
      await toggleShopStatus(shop.id, !shop.isOpen);
    } catch (err) {
      console.error('Failed to toggle shop status:', err);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/shop/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Left Sidebar & Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
          <Link to="/shop/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-900 flex items-center justify-center font-bold">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white block leading-tight">
                SECURE<span className="text-emerald-400">PRINT</span>
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400/80 block">
                Shop Portal
              </span>
            </div>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || (item.path !== '/shop/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Bottom Section: Shop Status & Account */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          {/* Shop Status Switch */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${shop?.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {shop?.isOpen ? 'Shop OPEN' : 'Shop CLOSED'}
                </span>
              </div>
              <button
                onClick={handleToggleStatus}
                disabled={isTogglingStatus}
                className={`p-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                  shop?.isOpen
                    ? 'bg-rose-950/80 text-rose-300 hover:bg-rose-900'
                    : 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900'
                }`}
                title="Toggle open or closed state for incoming customer sessions"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{shop?.isOpen ? 'Close' : 'Open'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Link
              to="/shop/profile"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <User className="w-3.5 h-3.5" />
              <span>Profile</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
                {shop?.name || 'Shop Portal'}
              </h1>
              <p className="text-xs text-slate-500">
                Counter Code: <span className="font-mono font-semibold text-slate-700">{shop?.publicCode}</span>
              </p>
            </div>
          </div>

          {/* Quick Actions & Live Badge */}
          <div className="flex items-center gap-3">
            <DatabaseStatusBadge variant="light" showDetails />

            <Link
              to={`/s/${shop?.publicCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200"
            >
              <span>Customer View</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            <Link
              to="/shop/queue"
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 relative"
              title="Print Queue"
            >
              <Bell className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
