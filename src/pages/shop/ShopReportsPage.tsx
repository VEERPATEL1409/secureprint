import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Printer, FileText, CheckCircle, IndianRupee } from 'lucide-react';
import { useAuth } from '../../firebase/context';
import { getShopJobs } from '../../services/jobService';
import { updateShopProfile } from '../../services/shopService';
import { PrintJob } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Skeleton } from '../../components/common/EmptyState';

// 1. SHOP REPORTS PAGE
export const ShopReportsPage: React.FC = () => {
  const { shop } = useAuth();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shop?.id) return;
    const fetch = async () => {
      try {
        const data = await getShopJobs(shop.id);
        setJobs(data);
      } catch (err) {
        console.error('Failed to load jobs for reports:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [shop?.id]);

  const totalCompleted = jobs.filter(j => j.status === 'PRINTED').length;
  const totalWaiting = jobs.filter(j => j.status === 'WAITING').length;
  const totalRejected = jobs.filter(j => j.status === 'REJECTED').length;
  const colorJobs = jobs.filter(j => j.settings?.colorMode === 'COLOR').length;
  const bwJobs = jobs.filter(j => j.settings?.colorMode !== 'COLOR').length;

  // Approximate revenue calculation based on settings
  const estRevenue = (bwJobs * 3) + (colorJobs * 10);

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-600" />
          <span>Operational Reports & Analytics</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time print volumes and performance statistics.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Lifetime Jobs</span>
            <div className="text-3xl font-extrabold text-slate-900">{jobs.length}</div>
            <p className="text-[11px] text-slate-400">All submissions</p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase">Completed Prints</span>
            <div className="text-3xl font-extrabold text-emerald-600">{totalCompleted}</div>
            <p className="text-[11px] text-emerald-700">Successfully handed over</p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase">Color vs B&W</span>
            <div className="text-3xl font-extrabold text-indigo-600">{colorJobs} / {bwJobs}</div>
            <p className="text-[11px] text-indigo-700">Color / Black & White jobs</p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase">Est. Revenue Volume</span>
            <div className="text-3xl font-extrabold text-slate-900">₹{estRevenue}</div>
            <p className="text-[11px] text-slate-400">Based on standard counter rates</p>
          </div>
        </div>
      )}

      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Print Queue Health Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-slate-500 font-medium">Pending Waiting</div>
            <div className="text-xl font-bold text-amber-600 mt-1">{totalWaiting}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-slate-500 font-medium">Successfully Printed</div>
            <div className="text-xl font-bold text-emerald-600 mt-1">{totalCompleted}</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-slate-500 font-medium">Rejected / Cancelled</div>
            <div className="text-xl font-bold text-rose-600 mt-1">{totalRejected}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. SHOP SETTINGS PAGE
export const ShopSettingsPage: React.FC = () => {
  const { shop, refreshShop } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [settings, setSettings] = useState({
    bwRate: '3',
    colorRate: '10',
    doubleSidedDiscount: '1',
    autoAcceptJobs: true,
    soundAlerts: true,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.id) return;
    setLoading(true);
    setSuccess(false);

    try {
      // Save settings to shop document in Firestore
      await updateShopProfile(shop.id, {
        settings: {
          bwRate: Number(settings.bwRate),
          colorRate: Number(settings.colorRate),
          doubleSidedDiscount: Number(settings.doubleSidedDiscount),
          autoAcceptJobs: settings.autoAcceptJobs,
          soundAlerts: settings.soundAlerts,
        }
      } as any);
      await refreshShop();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update shop settings:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Shop Counter Settings
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure default counter pricing and notifications.
        </p>
      </div>

      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          Settings saved successfully!
        </div>
      )}

      <form onSubmit={handleSave} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
          Page Pricing (₹ INR)
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Black & White Rate (per page)"
            type="number"
            value={settings.bwRate}
            onChange={(e) => setSettings({ ...settings, bwRate: e.target.value })}
          />
          <Input
            label="Color Print Rate (per page)"
            type="number"
            value={settings.colorRate}
            onChange={(e) => setSettings({ ...settings, colorRate: e.target.value })}
          />
        </div>

        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2 pt-2">
          Desk Notifications
        </h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.soundAlerts}
              onChange={(e) => setSettings({ ...settings, soundAlerts: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
            />
            <span className="text-sm text-slate-700">Play alert sound when customer submits a new document</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoAcceptJobs}
              onChange={(e) => setSettings({ ...settings, autoAcceptJobs: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
            />
            <span className="text-sm text-slate-700">Automatically acknowledge incoming jobs to customers</span>
          </label>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="primary" size="md" isLoading={loading}>
            Save Preferences
          </Button>
        </div>
      </form>
    </div>
  );
};

// 3. SHOP PROFILE PAGE
export const ShopProfilePage: React.FC = () => {
  const { shop, refreshShop } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: shop?.name || '',
    ownerName: shop?.ownerName || '',
    phone: shop?.phone || '',
    address: shop?.address || '',
    city: shop?.city || '',
    state: shop?.state || '',
    pincode: shop?.pincode || '',
    gstin: shop?.gstin || '',
  });

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop?.id) return;
    setLoading(true);
    setSuccess(false);

    try {
      await updateShopProfile(shop.id, {
        name: formData.name.trim(),
        ownerName: formData.ownerName.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        gstin: formData.gstin ? formData.gstin.trim() : undefined,
      });
      await refreshShop();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update shop profile:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Shop Business Profile
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Public information shown on customer standees and desk tokens.
        </p>
      </div>

      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          Profile updated successfully!
        </div>
      )}

      <form onSubmit={handleUpdate} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Shop Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Proprietor Name"
            required
            value={formData.ownerName}
            onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email Address"
            disabled
            value={shop?.email || ''}
            helperText="Contact admin to change registered login email"
          />
          <Input
            label="Mobile Phone"
            required
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>

        <Input
          label="Physical Address"
          required
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="City"
            required
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
          <Input
            label="State"
            required
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          />
          <Input
            label="PIN Code"
            required
            maxLength={6}
            value={formData.pincode}
            onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
          />
        </div>

        <Input
          label="GSTIN (Optional)"
          value={formData.gstin}
          onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
        />

        <div className="pt-2">
          <Button type="submit" variant="primary" size="md" isLoading={loading}>
            Save Profile Changes
          </Button>
        </div>
      </form>
    </div>
  );
};
