import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Printer,
  ShieldCheck,
  ArrowRight,
  Clock,
  Sparkles,
  MapPin,
  AlertCircle,
  QrCode
} from 'lucide-react';
import { getShopByPublicCode } from '../../services/shopService';
import { getAllShops } from '../../services/adminService';
import { createCustomerSession, getSessionById } from '../../services/sessionService';
import {
  ensureCustomerAnonymousAuth,
  getPersistedSessionForShop,
  persistValidatedCustomerSession,
  clearPersistedCustomerSession,
  primeVerifiedShopCache
} from '../../hooks/useCustomerSession';
import { useAuth } from '../../firebase/context';
import { CustomerSession, Shop } from '../../types';
import { Button } from '../../components/common/Button';
import { Skeleton } from '../../components/common/EmptyState';
import { CustomerQRScannerModal } from '../../components/customer/CustomerQRScannerModal';

export const ShopPublicLandingPage: React.FC = () => {
  const { publicCode, shopPublicId } = useParams<{ publicCode?: string; shopPublicId?: string }>();
  const code = publicCode || shopPublicId;
  const navigate = useNavigate();
  const { setActiveCustomerSession } = useAuth();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Name entry form
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [verifiedExistingSession, setVerifiedExistingSession] = useState<CustomerSession | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('Invalid shop link or QR code.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setVerifiedExistingSession(null);

      try {
        const cleanCode = decodeURIComponent(code).trim();
        let found = await getShopByPublicCode(cleanCode);

        // Case-insensitive directory match if exact query didn't hit
        if (!found) {
          const all = await getAllShops();
          const targetLower = cleanCode.toLowerCase();
          found =
            all.find(
              (s) =>
                s.publicCode?.toLowerCase() === targetLower ||
                s.id?.toLowerCase() === targetLower
            ) || null;

          // Only fall back to default active shop if generic placeholder 'shop' was used
          if (!found && (targetLower === 'shop' || targetLower === 'counter')) {
            found = all.find((s) => s.status === 'active') || all[0] || null;
          }
        }

        if (cancelled) return;

        if (!found) {
          setError(
            `Shop counter "${cleanCode}" was not found. Scan the counter QR code again or search active shops.`
          );
          setLoading(false);
          return;
        }

        primeVerifiedShopCache(found);
        setShop(found);

        // Ensure guest auth is hydrated early and verify any persisted session token against this exact shop ID
        const guestAuth = await ensureCustomerAnonymousAuth().catch(() => null);
        if (cancelled) return;

        const persistedRecord = getPersistedSessionForShop(found.id, found.publicCode);
        let legacySessionId: string | null = null;
        if (!persistedRecord) {
          try {
            legacySessionId = localStorage.getItem(`secureprint_sess_${found.id}`);
          } catch {
            legacySessionId = null;
          }
        }

        const candidateSessionId = persistedRecord?.sessionId || legacySessionId;
        if (candidateSessionId) {
          try {
            const liveSess = await getSessionById(candidateSessionId);
            if (!cancelled) {
              const isValidForThisShop =
                Boolean(liveSess) &&
                liveSess!.shopId === found.id &&
                liveSess!.status === 'active' &&
                !liveSess!.isBlocked &&
                Boolean(liveSess!.token) &&
                new Date(liveSess!.expiresAt).getTime() > Date.now();

              if (isValidForThisShop && liveSess) {
                persistValidatedCustomerSession({
                  sessionId: liveSess.id,
                  shopId: found.id,
                  shopPublicCode: found.publicCode,
                  sessionToken: liveSess.token,
                  clientAuthToken:
                    guestAuth?.authToken || persistedRecord?.clientAuthToken || `tok_${liveSess.id}`,
                  guestUid: guestAuth?.uid || liveSess.guestUid || persistedRecord?.guestUid || '',
                  isAnonymous: guestAuth?.isAnonymousFirebaseUser ?? true,
                  customerName: liveSess.customerName,
                  expiresAt: liveSess.expiresAt,
                  validatedAt: new Date().toISOString()
                });
                setActiveCustomerSession(liveSess);
                setVerifiedExistingSession(liveSess);
              } else {
                clearPersistedCustomerSession({
                  sessionId: candidateSessionId,
                  shopId: found.id
                });
                setVerifiedExistingSession(null);
              }
            }
          } catch {
            // If offline transiently, trust validated non-expired persisted record for this exact shopId
            if (!cancelled && persistedRecord && persistedRecord.shopId === found.id) {
              setVerifiedExistingSession({
                id: persistedRecord.sessionId,
                shopId: found.id,
                shopPublicCode: found.publicCode,
                token: persistedRecord.sessionToken,
                customerName: persistedRecord.customerName,
                guestUid: persistedRecord.guestUid,
                isAnonymous: persistedRecord.isAnonymous,
                status: 'active',
                createdAt: persistedRecord.validatedAt,
                expiresAt: persistedRecord.expiresAt
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load shop:', err);
        if (!cancelled) {
          setError('Could not connect to this print counter.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const navigateToChatSession = (targetSession: CustomerSession, targetShop: Shop) => {
    const params = new URLSearchParams({
      shop: targetShop.publicCode,
      shopId: targetShop.id
    });
    navigate(`/c/${encodeURIComponent(targetSession.id)}?${params.toString()}`);
  };

  const handleResumeExistingSession = () => {
    if (!verifiedExistingSession || !shop) return;
    primeVerifiedShopCache(shop);
    setActiveCustomerSession(verifiedExistingSession);
    navigateToChatSession(verifiedExistingSession, shop);
  };

  const handleStartPrinting = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!shop || creating) return;

    setCreating(true);
    try {
      const guestAuth = await ensureCustomerAnonymousAuth();
      const finalName = displayName.trim() || `Customer #${Math.floor(1000 + Math.random() * 9000)}`;

      const session = await createCustomerSession({
        shopId: shop.id,
        customerName: finalName,
        customerPhone: phone.trim() || undefined,
        shopPublicCode: shop.publicCode,
        guestUid: guestAuth.uid,
        isAnonymous: guestAuth.isAnonymousFirebaseUser
      });

      primeVerifiedShopCache(shop);
      persistValidatedCustomerSession({
        sessionId: session.id,
        shopId: shop.id,
        shopPublicCode: shop.publicCode,
        sessionToken: session.token,
        clientAuthToken: guestAuth.authToken,
        guestUid: guestAuth.uid,
        isAnonymous: guestAuth.isAnonymousFirebaseUser,
        customerName: session.customerName,
        expiresAt: session.expiresAt,
        validatedAt: new Date().toISOString()
      });
      setActiveCustomerSession(session);

      navigateToChatSession(session, shop);
    } catch (err) {
      console.error('Failed to create customer session:', err);
      setError('Unable to initialize printing session. Please retry.');
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-8 bg-slate-950 rounded-3xl border border-slate-800 space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-2xl mx-auto bg-slate-800" />
          <Skeleton className="h-6 w-48 mx-auto bg-slate-800" />
          <Skeleton className="h-4 w-32 mx-auto bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 bg-slate-950 rounded-3xl border border-slate-800 space-y-6 text-center text-white">
          <div className="w-12 h-12 rounded-2xl bg-rose-950 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Counter Not Available</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error || 'This printing counter could not be found.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold whitespace-nowrap"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan Counter QR</span>
            </button>
            <Link
              to="/find-shop"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold whitespace-nowrap"
            >
              <span>Browse Shops</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <CustomerQRScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-md flex flex-col items-center space-y-6 text-center">
        <div className="flex items-center justify-between w-full px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-emerald-500/20">
              <Printer className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">
              SECURE<span className="text-emerald-400">PRINT</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Scan QR</span>
          </button>
        </div>

        {/* Counter Station Card */}
        <div className="w-full bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6 text-left">
          {/* Shop Header & Open Status */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 block font-semibold">
                Official Digital Print Desk
              </span>
              <h1 className="text-2xl font-extrabold text-white tracking-tight truncate">
                {shop.name}
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">
                  {shop.address ? `${shop.address}, ` : ''}
                  {shop.city}, {shop.state}
                </span>
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 text-xs font-semibold pt-1">
              <span
                className={`w-2 h-2 rounded-full ${shop.isOpen ? 'bg-emerald-400' : 'bg-rose-500'}`}
              />
              <span className={shop.isOpen ? 'text-emerald-400' : 'text-rose-400'}>
                {shop.isOpen ? 'Open' : 'Closed'}
              </span>
            </div>
          </div>

          {/* Prompt Form or Start / Resume Controls */}
          {!namePromptOpen ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Privacy-Protected WhatsApp Print Desk</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  No app download needed. Chat like WhatsApp, send your PDF or photos, choose print copies, and permanently delete your files anytime from both sides.
                </p>
              </div>

              {verifiedExistingSession ? (
                <div className="space-y-3">
                  <Button
                    size="lg"
                    variant="primary"
                    onClick={handleResumeExistingSession}
                    className="w-full py-3.5 text-base font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 gap-2 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Continue Active Session ({verifiedExistingSession.token})</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </Button>

                  {shop.isOpen && (
                    <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                      <button
                        type="button"
                        onClick={() => handleStartPrinting()}
                        disabled={creating}
                        className="font-semibold text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                      >
                        {creating ? 'Starting new session...' : 'Start a new session instead'}
                      </button>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => setNamePromptOpen(true)}
                        className="font-semibold text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                      >
                        Set custom name
                      </button>
                    </div>
                  )}
                </div>
              ) : shop.isOpen ? (
                <div className="space-y-2.5">
                  <Button
                    size="lg"
                    variant="primary"
                    onClick={() => handleStartPrinting()}
                    isLoading={creating}
                    className="w-full py-3.5 text-base font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 gap-2 whitespace-nowrap"
                  >
                    <span>Open WhatsApp Print Window</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => setNamePromptOpen(true)}
                    className="w-full text-center text-xs font-semibold text-slate-400 hover:text-white py-1 transition-colors"
                  >
                    Set custom name / mobile number before joining
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 text-center text-xs text-rose-300 space-y-1">
                  <div className="font-bold">Counter Currently Closed</div>
                  <p className="text-rose-400/80">
                    Please check with counter staff to open print reception.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleStartPrinting} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Your Display Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Rahul S., Priya, or Guest"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400">
                  Staff will call this name at the counter with your prints.
                </p>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Mobile Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="Optional, for SMS/pickup alert"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setNamePromptOpen(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={creating}
                  disabled={!displayName.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold whitespace-nowrap"
                >
                  <span>Enter Print Session</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </form>
          )}

          {/* Ephemeral Guarantee Footer */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Counter Code: {shop.publicCode}</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Clock className="w-3.5 h-3.5" />
              <span>5-Hour Auto-Purge</span>
            </span>
          </div>
        </div>
      </div>

      <CustomerQRScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} />
    </div>
  );
};
