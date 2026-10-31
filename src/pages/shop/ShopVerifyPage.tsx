import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Printer, Mail, CheckCircle2, ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../firebase/context';
import { Button } from '../../components/common/Button';

export const ShopVerifyPage: React.FC = () => {
  const { user, refreshShopData, shop } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    setChecking(true);
    setMessage(null);
    try {
      await refreshShopData();
      if (shop?.status === 'active') {
        navigate('/shop/dashboard');
      } else if (shop?.status === 'pending') {
        navigate('/shop/pending-approval');
      } else {
        setMessage('Status verified. You may proceed to your dashboard.');
      }
    } catch (err) {
      console.error(err);
      setMessage('Could not verify status. Please retry.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
      <div className="w-full max-w-md bg-slate-950 rounded-3xl border border-slate-800 p-8 shadow-2xl space-y-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-950 border border-emerald-800/60 text-emerald-400 flex items-center justify-center mx-auto">
          <Mail className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold tracking-tight">Verify Shop Credentials</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Please verify your email address and business status to operate your SecurePrint counter.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span>Registered Account:</span>
            <span className="font-bold text-white font-mono">{user?.email || 'shop@example.com'}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Shop Approval Status:</span>
            <span className="font-bold text-amber-400 uppercase">{shop?.status || 'Pending Review'}</span>
          </div>
        </div>

        {message && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-xs text-emerald-300">
            {message}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Button
            size="md"
            variant="primary"
            onClick={handleCheckStatus}
            isLoading={checking}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            <span>Check Approval & Continue</span>
          </Button>

          <Link
            to="/shop/pending-approval"
            className="block text-xs text-slate-400 hover:text-white"
          >
            Go to Approval Status Page →
          </Link>
        </div>
      </div>
    </div>
  );
};
