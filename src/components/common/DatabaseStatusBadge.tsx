import React, { useEffect, useState } from 'react';
import { Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { testConnection } from '../../firebase/config';

interface DatabaseStatusBadgeProps {
  variant?: 'dark' | 'light';
  showDetails?: boolean;
}

export const DatabaseStatusBadge: React.FC<DatabaseStatusBadgeProps> = ({
  variant = 'dark',
  showDetails = false
}) => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [latency, setLatency] = useState<number | null>(null);

  const checkDb = async () => {
    setStatus('checking');
    const start = performance.now();
    try {
      const ok = await testConnection();
      const elapsed = Math.round(performance.now() - start);
      setLatency(elapsed);
      setStatus(ok ? 'connected' : 'error');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    checkDb();
    // Periodically re-check connection every 60 seconds
    const timer = setInterval(checkDb, 60000);
    return () => clearInterval(timer);
  }, []);

  const isDark = variant === 'dark';

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono transition-all ${
        isDark
          ? 'bg-slate-900/90 border border-slate-800 text-slate-300'
          : 'bg-white border border-slate-200 text-slate-700 shadow-2xs'
      }`}
      title={`Firestore Database: ai-studio-secureprint-511f3047-d8c7-4d95-9053-b8eff8f343e9 ${
        latency ? `(${latency}ms)` : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {status === 'connected' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              status === 'connected'
                ? 'bg-emerald-500'
                : status === 'checking'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
        </span>
        <Database className="w-3 h-3 text-slate-400" />
      </div>

      <span className="font-semibold text-[11px]">
        {status === 'connected' ? (
          <span className="text-emerald-400 font-medium">DB Active</span>
        ) : status === 'checking' ? (
          <span className="text-amber-400 font-medium">Connecting...</span>
        ) : (
          <span className="text-rose-400 font-medium">DB Offline</span>
        )}
      </span>

      {showDetails && latency !== null && status === 'connected' && (
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          {latency}ms
        </span>
      )}

      <button
        onClick={(e) => {
          e.preventDefault();
          checkDb();
        }}
        className="text-slate-500 hover:text-slate-300 transition-colors ml-0.5"
        title="Refresh database connectivity check"
      >
        <RefreshCw className={`w-2.5 h-2.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
