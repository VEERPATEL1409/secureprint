import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Paperclip,
  Send,
  Trash2,
  Check,
  CheckCheck,
  Printer,
  FileText,
  Image as ImageIcon,
  MoreVertical,
  X,
  Eye,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Sliders,
  Download,
  Camera,
  QrCode,
  Lock
} from 'lucide-react';
import {
  subscribeToSessionMessages,
  sendMessageToSession,
  deleteMessageForEveryone,
  purgeCustomerSessionData
} from '../../services/sessionService';
import {
  createPrintJob,
  appendFilesToJob,
  subscribeToSessionJobs,
  deleteJobAndFiles,
  uploadCustomerFile
} from '../../services/jobService';
import {
  PrintJob,
  ChatMessage,
  FileAttachment,
  PrintSettings
} from '../../types';
import { StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { PrintPreviewModal } from '../../components/customer/PrintPreviewModal';
import { CustomerQRScannerModal } from '../../components/customer/CustomerQRScannerModal';
import { ResolvedImage, ResolvedDownloadLink } from '../../components/common/ResolvedAttachment';
import {
  clearPersistedCustomerSession,
  useCustomerSession
} from '../../hooks/useCustomerSession';

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
].join(',');

function progressWidthClass(pct: number): string {
  if (pct >= 100) return 'w-full';
  if (pct >= 90) return 'w-11/12';
  if (pct >= 80) return 'w-4/5';
  if (pct >= 75) return 'w-3/4';
  if (pct >= 66) return 'w-2/3';
  if (pct >= 50) return 'w-1/2';
  if (pct >= 33) return 'w-1/3';
  if (pct >= 25) return 'w-1/4';
  if (pct >= 15) return 'w-1/6';
  return 'w-1/12';
}

export const CustomerSessionAppPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    phase,
    loading,
    isReady,
    isAnonymousFirebaseUser,
    guestUid,
    session,
    shop,
    recoverableSession,
    error,
    remainingTime,
    retry
  } = useCustomerSession(sessionId, {
    expectedShopId: searchParams.get('shopId'),
    expectedShopCode: searchParams.get('shop')
  });

  // Live session jobs & chat (subscribed strictly AFTER guest auth & shop context are ready)
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File staging & upload progress
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Attach menu, QR scanner & options menu state
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'message' | 'all';
    messageId?: string;
    files?: FileAttachment[];
    jobId?: string;
  }>({ isOpen: false, type: 'message' });

  // Print settings
  const [settings, setSettings] = useState<PrintSettings>({
    colorMode: 'BW',
    copies: 1,
    isDoubleSided: false,
    paperSize: 'A4',
    orientation: 'portrait',
    margin: 'normal',
    fitMode: 'fit',
    pageRange: 'All',
    notes: ''
  });

  // Print Preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  // In-app toast notification (no window.alert)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Subscribe to live jobs and messages ONLY after anonymous guest auth & shop context are verified
  useEffect(() => {
    if (!isReady || !sessionId || !session || !shop) {
      setJobs([]);
      setMessages([]);
      return;
    }

    const unsubJobs = subscribeToSessionJobs(sessionId, (loadedJobs) => {
      setJobs(loadedJobs);
    });

    const unsubMessages = subscribeToSessionMessages(sessionId, (loadedMsgs) => {
      setMessages(loadedMsgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    return () => {
      unsubJobs();
      unsubMessages();
    };
  }, [isReady, sessionId, session?.id, shop?.id]);

  // Handle files selected (reset input value afterwards so selecting same photo again works)
  const handleFilesSelected = (files: FileList | null, inputEl?: HTMLInputElement | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setStagedFiles((prev) => [...prev, ...newFiles]);
    setAttachMenuOpen(false);
    if (inputEl) {
      inputEl.value = '';
    }
  };

  const handleRemoveStagedFile = (idx: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Primary action: Send Message and/or Attached Files (Fast Parallel Upload)
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!session || sending) return;
    const targetShopId = shop?.id || session.shopId;
    if (!targetShopId) return;

    const textToSend = chatInput.trim();
    const filesSnapshot = [...stagedFiles];
    const hasFiles = filesSnapshot.length > 0;

    if (!textToSend && !hasFiles) return;

    setSending(true);
    setChatInput('');

    try {
      let uploadedAttachments: FileAttachment[] = [];

      // Upload all staged photos/documents IN PARALLEL for instant counter delivery
      if (hasFiles) {
        setUploadProgress(5);
        const perFileProgress = new Array<number>(filesSnapshot.length).fill(0);

        uploadedAttachments = await Promise.all(
          filesSnapshot.map(async (file, i) => {
            const result = await uploadCustomerFile(
              targetShopId,
              session.id,
              file,
              (filePct) => {
                perFileProgress[i] = filePct;
                const avg = Math.round(
                  perFileProgress.reduce((acc, v) => acc + v, 0) / filesSnapshot.length
                );
                setUploadProgress(Math.max(5, avg));
              }
            );

            const finalSize = result.optimizedSize ?? file.size;
            const finalType = result.optimizedType || file.type || 'application/octet-stream';

            return {
              id: `file_${Date.now()}_${i}`,
              name: file.name,
              size: finalSize,
              type: finalType,
              fileName: file.name,
              fileSize: finalSize,
              fileType: finalType,
              downloadUrl: result.downloadUrl,
              storagePath: result.storagePath,
              uploadedAt: new Date().toISOString()
            };
          })
        );

        setUploadProgress(100);

        // Update shop queue + chat stream in parallel so counter receives job in real-time immediately
        const effectiveSettings: PrintSettings = {
          ...settings,
          ...(textToSend ? { notes: textToSend } : {})
        };

        await Promise.all([
          jobs.length > 0
            ? appendFilesToJob(jobs[0].id, uploadedAttachments, effectiveSettings)
            : createPrintJob({
                shopId: targetShopId,
                sessionId: session.id,
                token: session.token,
                customerName: session.customerName,
                files: uploadedAttachments,
                settings: effectiveSettings
              }),
          sendMessageToSession(
            session.id,
            textToSend ||
              `Shared ${uploadedAttachments.length} ${
                uploadedAttachments.length === 1 ? 'file' : 'files'
              } for printing (${settings.colorMode === 'COLOR' ? 'Color' : 'B&W'}, ${
                settings.copies
              } ${settings.copies === 1 ? 'copy' : 'copies'})`,
            'customer',
            uploadedAttachments,
            effectiveSettings
          )
        ]);

        setStagedFiles([]);
        setUploadProgress(null);
        showToast('Sent to shop counter!', 'success');
      } else {
        // Plain text message
        if (jobs.length === 0) {
          // Initialize active job queue entry so counter sees customer token immediately
          await createPrintJob({
            shopId: targetShopId,
            sessionId: session.id,
            token: session.token,
            customerName: session.customerName,
            files: [],
            settings: { ...settings, notes: textToSend }
          });
        }

        await sendMessageToSession(session.id, textToSend, 'customer');
      }
    } catch (err: any) {
      console.error('Failed to send message/file:', err);
      showToast(err?.message || 'Failed to send. Please try again.', 'error');
      setChatInput(textToSend); // restore on error
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  // Delete message for everyone (Permanent delete from both sides)
  const confirmDeleteForEveryone = async () => {
    if (!session) return;
    const { type, messageId, files } = deleteModal;

    try {
      if (type === 'all') {
        // Purge entire session
        await purgeCustomerSessionData(session.id);
        // Also delete any existing jobs
        for (const job of jobs) {
          await deleteJobAndFiles(job.id);
        }
        clearPersistedCustomerSession({
          sessionId: session.id,
          shopId: shop?.id || session.shopId
        });
        showToast('All messages and files permanently deleted from both sides.', 'success');
        setTimeout(() => {
          navigate(`/s/${encodeURIComponent(shop?.publicCode || '')}`);
        }, 1500);
        return;
      }

      if (messageId) {
        // 1. Delete message from session
        await deleteMessageForEveryone(session.id, messageId, files);

        // 2. If message had files or created a job, delete matching job from queue
        if (files && files.length > 0) {
          const matchingJob = jobs.find((j) =>
            j.files?.some((jf) => files.some((mf) => mf.fileName === jf.fileName || mf.name === jf.name))
          );
          if (matchingJob) {
            await deleteJobAndFiles(matchingJob.id);
          }
        }
        showToast('Message and file deleted for everyone.', 'success');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Could not delete message. Please retry.', 'error');
    } finally {
      setDeleteModal({ isOpen: false, type: 'message' });
    }
  };

  // Open Preview Modal
  const handleOpenPrintPreview = (index = 0) => {
    setPreviewFiles(stagedFiles);
    setPreviewIndex(index);
    setIsPreviewOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1317] flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-6 bg-[#111b21] rounded-2xl border border-[#222e35] text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 flex items-center justify-center mx-auto text-[#25D366]">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#e9edef]">
              {phase === 'authenticating'
                ? 'Authenticating Guest Session...'
                : 'Verifying Print Shop Counter...'}
            </h3>
            <p className="text-xs text-[#8696a0]">
              {phase === 'authenticating'
                ? 'Creating isolated zero-trace guest identity'
                : 'Matching session token with shop counter'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isReady || error || !session || !shop) {
    return (
      <div className="min-h-screen bg-[#0c1317] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 bg-[#111b21] rounded-2xl border border-[#222e35] text-center text-white space-y-5">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            {phase === 'blocked' ? <Lock className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#e9edef]">
              {phase === 'expired'
                ? 'Session Expired'
                : phase === 'blocked'
                ? 'Session Restricted'
                : 'Session Not Available'}
            </h2>
            <p className="text-xs text-[#8696a0] leading-relaxed">
              {error || 'Please scan the shop counter QR code to start a new guest printing session.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5">
            {recoverableSession && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/c/${encodeURIComponent(recoverableSession.sessionId)}?shop=${encodeURIComponent(
                      recoverableSession.shopPublicCode
                    )}&shopId=${encodeURIComponent(recoverableSession.shopId)}`,
                    { replace: true }
                  )
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#00a884] hover:bg-[#02906f] text-white text-xs font-bold whitespace-nowrap shrink-0"
              >
                <span>Resume Session ({recoverableSession.sessionToken})</span>
              </button>
            )}
            {phase === 'error' && (
              <button
                type="button"
                onClick={retry}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl border border-[#374248] hover:bg-[#182229] text-[#e9edef] text-xs font-bold whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Connection</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#00a884] hover:bg-[#02906f] text-white text-xs font-bold whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan Shop QR Code</span>
            </button>
            <Link
              to="/find-shop"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl border border-[#374248] hover:bg-[#182229] text-[#aebac1] text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <span>Find Shop</span>
            </Link>
          </div>
        </div>
        <CustomerQRScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c1317] flex flex-col justify-between items-center sm:py-2 selection:bg-[#00a884] selection:text-white font-sans">
      {/* Hidden file inputs for Documents and Photos */}
      <input
        type="file"
        ref={docInputRef}
        onChange={(e) => handleFilesSelected(e.target.files, e.currentTarget)}
        multiple
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
      />
      <input
        type="file"
        ref={photoInputRef}
        onChange={(e) => handleFilesSelected(e.target.files, e.currentTarget)}
        multiple
        accept="image/*"
        className="hidden"
      />

      {/* Main WhatsApp Window Container */}
      <div className="w-full max-w-xl h-screen sm:h-[96vh] sm:rounded-2xl bg-[#0b141a] flex flex-col overflow-hidden shadow-2xl border border-[#222e35] relative">
        {/* Floating Toast Notification */}
        {toast && (
          <div className="absolute top-4 left-4 right-4 z-50 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 border ${
                toast.type === 'error'
                  ? 'bg-rose-950/90 text-rose-200 border-rose-800'
                  : toast.type === 'success'
                  ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700'
                  : 'bg-slate-900/90 text-slate-200 border-slate-700'
              }`}
            >
              {toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : toast.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
        
        {/* ========================================================
            WHATSAPP TOP APP BAR (Green Header with Shop & Token)
            ======================================================== */}
        <header className="h-16 bg-[#202c33] border-b border-[#2a3942] px-3 py-2 flex items-center justify-between shrink-0 z-30 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to={shop ? `/s/${encodeURIComponent(shop.publicCode)}` : '/'}
              className="p-1.5 rounded-full hover:bg-[#374248] text-[#aebac1] hover:text-white transition-colors"
              title="Back to Counter"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            {/* Shop Avatar */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#128c7e] text-white flex items-center justify-center font-bold text-base shadow-sm">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <span className="w-3 h-3 rounded-full bg-[#25D366] border-2 border-[#202c33] absolute bottom-0 right-0" />
            </div>

            {/* Shop Title & Online Status */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-semibold text-[#e9edef] truncate tracking-tight">
                  {shop?.name || 'Counter Print Desk'}
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] shrink-0" />
              </div>
              <p className="text-[11px] text-[#25D366] flex items-center gap-1 font-medium truncate">
                <span>online • Desk #{session.token}</span>
              </p>
            </div>
          </div>

          {/* Right Header Icons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Counter Token Badge */}
            <div className="px-2.5 py-1 rounded-full bg-[#111b21] border border-[#00a884]/40 flex items-center gap-1.5 shadow-inner">
              <span className="text-[10px] text-[#8696a0] font-mono">TOKEN</span>
              <span className="text-xs font-black text-[#25D366] font-mono tracking-wider">{session.token}</span>
            </div>

            {/* Menu Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                className="p-2 rounded-full hover:bg-[#374248] text-[#aebac1] hover:text-white transition-colors"
                title="Options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {headerMenuOpen && (
                <div className="absolute right-0 top-12 w-64 bg-[#233138] rounded-xl shadow-2xl border border-[#374248] py-2 z-50 text-xs text-[#e9edef] animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-[#374248]/60">
                    <div className="font-semibold">{session.customerName}</div>
                    <div className="text-[10px] text-[#8696a0] tabular-nums">
                      {isAnonymousFirebaseUser ? 'Verified Guest' : 'Guest Session'} • Auto-purges in {remainingTime}
                    </div>
                    {guestUid && (
                      <div className="text-[9px] text-[#8696a0]/80 font-mono truncate mt-0.5">
                        ID: {guestUid.slice(0, 12)}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setSettingsDrawerOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 text-[#e9edef]"
                  >
                    <Sliders className="w-4 h-4 text-[#00a884]" />
                    <span>Print Preferences</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setScannerOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 text-[#e9edef]"
                  >
                    <QrCode className="w-4 h-4 text-[#00a884]" />
                    <span>Scan Counter QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setDeleteModal({ isOpen: true, type: 'all' });
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 text-rose-400 font-medium"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Delete All Data (Both Sides)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Live Active Job Status Bar (If Customer Has Queued Jobs) */}
        {jobs.length > 0 && (
          <div className="bg-[#182229] border-b border-[#222e35] px-3 py-2 flex items-center justify-between text-xs text-[#8696a0] shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className={`w-2 h-2 rounded-full ${
                jobs[0].status === 'PRINTED' ? 'bg-[#25D366]' :
                jobs[0].status === 'PRINTING' ? 'bg-amber-400' :
                'bg-sky-400'
              }`} />
              <span className="text-[#e9edef] font-medium text-xs truncate">
                Job {jobs[0].token}: {jobs[0].status === 'WAITING' ? 'Waiting in Queue' : jobs[0].status === 'PRINTING' ? 'Printing on Counter Printer...' : jobs[0].status === 'PRINTED' ? 'Ready for Pickup!' : jobs[0].status}
              </span>
            </div>
            <StatusBadge status={jobs[0].status} />
          </div>
        )}

        {/* ========================================================
            WHATSAPP CHAT STREAM CANVAS
            ======================================================== */}
        <div
          className="flex-1 overflow-y-auto p-3 space-y-3 relative bg-[#0b141a] bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:20px_20px]"
          onClick={() => {
            if (attachMenuOpen) setAttachMenuOpen(false);
            if (headerMenuOpen) setHeaderMenuOpen(false);
          }}
        >
          {/* Security & End-to-End Encryption Banner (WhatsApp Style) */}
          <div className="flex justify-center my-2">
            <div className="max-w-[85%] bg-[#182229] border border-[#222e35] rounded-lg px-3 py-2 text-center text-[11px] text-[#ffd279] shadow-xs flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#ffd279] shrink-0" />
              <span>
                Messages and files in this counter session are private. Deleting removes files permanently from both customer and shop counter.
              </span>
            </div>
          </div>

          {/* Date Stamp */}
          <div className="flex justify-center my-1">
            <span className="bg-[#182229] text-[#8696a0] text-[10px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider shadow-2xs">
              Today
            </span>
          </div>

          {/* Empty Conversation Welcome */}
          {messages.length === 0 && (
            <div className="text-center py-10 space-y-3 max-w-xs mx-auto">
              <div className="w-14 h-14 rounded-full bg-[#1f2c34] text-[#00a884] flex items-center justify-center mx-auto shadow-inner">
                <Paperclip className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#e9edef]">Ready to Print!</h4>
                <p className="text-xs text-[#8696a0] leading-relaxed">
                  Tap the attachment clip <span className="text-[#00a884] font-bold">📎</span> below to attach PDFs or photos, or message the shopkeeper directly.
                </p>
              </div>
            </div>
          )}

          {/* Messages Stream */}
          {messages.map((m) => {
            const isCustomer = m.senderRole === 'customer';
            const hasFiles = m.files && m.files.length > 0;

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'} group`}
              >
                {/* Message Bubble Container */}
                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-2.5 shadow-md relative transition-all ${
                    isCustomer
                      ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-xs'
                      : 'bg-[#202c33] text-[#e9edef] rounded-tl-xs border border-[#2a3942]'
                  }`}
                >
                  {/* Sender label for shop */}
                  {!isCustomer && (
                    <div className="text-[10px] font-bold text-[#00a884] mb-1 flex items-center gap-1">
                      <span>{shop?.name || 'Counter Operator'}</span>
                    </div>
                  )}

                  {/* Attached Files Card (WhatsApp Document Bubble) */}
                  {hasFiles && (
                    <div className="space-y-2 mb-2">
                      {m.files!.map((file, fIdx) => {
                        const fileName = file.fileName || file.name;
                        const isImg = file.type?.includes('image') || fileName.match(/\.(jpg|jpeg|png|webp)$/i);
                        const fileSizeMb = (file.fileSize || file.size || 0) / (1024 * 1024);

                        return (
                          <div
                            key={fIdx}
                            className="bg-[#0b141a]/60 rounded-xl p-2.5 border border-black/20 flex flex-col gap-2"
                          >
                            {/* File Preview Thumbnail / Icon */}
                            {isImg ? (
                              <div className="w-full h-36 rounded-lg overflow-hidden bg-black/40 flex items-center justify-center">
                                <ResolvedImage
                                  src={file.downloadUrl}
                                  storagePath={file.storagePath}
                                  mimeType={file.fileType || file.type}
                                  alt={fileName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : null}

                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                                  {fileName.split('.').pop() || 'DOC'}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate">
                                    {fileName}
                                  </div>
                                  <div className="text-[10px] text-[#8696a0]">
                                    {fileSizeMb < 0.1 ? `${((file.fileSize || file.size || 0) / 1024).toFixed(0)} KB` : `${fileSizeMb.toFixed(2)} MB`}
                                  </div>
                                </div>
                              </div>

                              <ResolvedDownloadLink
                                href={file.downloadUrl}
                                storagePath={file.storagePath}
                                mimeType={file.fileType || file.type}
                                fileName={fileName}
                                className="p-1.5 rounded-lg bg-[#222e35] hover:bg-[#323f46] text-[#aebac1] hover:text-white shrink-0"
                                title="Download / View"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </ResolvedDownloadLink>
                            </div>

                            {/* Print specifications badge if attached */}
                            {m.printSettings && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10 text-[10px] text-[#aebac1]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${m.printSettings.colorMode === 'COLOR' ? 'bg-amber-400 text-black' : 'bg-white/20 text-white'}`}>
                                  {m.printSettings.colorMode === 'COLOR' ? 'Color' : 'B&W'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white">
                                  {m.printSettings.copies} {m.printSettings.copies === 1 ? 'Copy' : 'Copies'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white">
                                  {m.printSettings.isDoubleSided ? '2-Sided' : '1-Sided'}
                                </span>
                                {m.printSettings.pageRange && m.printSettings.pageRange !== 'All' && (
                                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-white">
                                    Pages: {m.printSettings.pageRange}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Message Text */}
                  {m.text && (
                    <p className="text-xs leading-relaxed break-words whitespace-pre-wrap text-[#e9edef] pr-8">
                      {m.text}
                    </p>
                  )}

                  {/* Message Meta (Time & Double Check) */}
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-[#8696a0] select-none">
                    <span>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isCustomer && (
                      <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                    )}
                  </div>

                  {/* Delete for Everyone Quick Action Button (Hover or Always Accessible) */}
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteModal({
                        isOpen: true,
                        type: 'message',
                        messageId: m.id,
                        files: m.files
                      })
                    }
                    className="absolute top-1.5 right-1.5 p-1 rounded-full text-white/50 hover:text-rose-400 hover:bg-black/20 transition-colors"
                    title="Delete for Everyone (Dono Taraf Se Delete Karein)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* ========================================================
            STAGED ATTACHMENT TRAY & PRINT PREFERENCES DOCK
            ======================================================== */}
        {stagedFiles.length > 0 && (
          <div className="bg-[#182229] border-t border-[#222e35] p-3 space-y-3 animate-in slide-in-from-bottom-2 duration-150 z-20">
            {/* Header of Staged Files */}
            <div className="flex items-center justify-between text-xs text-[#e9edef]">
              <span className="font-bold flex items-center gap-1.5 text-[#25D366]">
                <Paperclip className="w-3.5 h-3.5" />
                <span>{stagedFiles.length} Document(s) Ready to Send</span>
              </span>
              <button
                type="button"
                onClick={() => setStagedFiles([])}
                className="text-[11px] text-[#8696a0] hover:text-rose-400 font-semibold"
              >
                Clear all
              </button>
            </div>

            {/* Thumbnail Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {stagedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="bg-[#111b21] rounded-xl p-2 border border-[#2a3942] flex items-center gap-2 shrink-0 max-w-[190px]"
                >
                  <div className="w-7 h-7 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                    {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-white truncate">{file.name}</div>
                    <div className="text-[9px] text-[#8696a0]">{(file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStagedFile(idx)}
                    className="text-[#8696a0] hover:text-rose-400 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Quick Print Specifications Bar */}
            <div className="grid grid-cols-3 gap-2 bg-[#111b21] p-2 rounded-xl border border-[#2a3942] text-xs">
              {/* Color Mode Toggle */}
              <div>
                <span className="text-[9px] text-[#8696a0] font-bold block mb-1">COLOR</span>
                <div className="grid grid-cols-2 gap-1 bg-[#202c33] p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, colorMode: 'BW' })}
                    className={`py-1 rounded text-[11px] font-bold ${settings.colorMode === 'BW' ? 'bg-[#00a884] text-white' : 'text-[#8696a0]'}`}
                  >
                    B&W
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, colorMode: 'COLOR' })}
                    className={`py-1 rounded text-[11px] font-bold ${settings.colorMode === 'COLOR' ? 'bg-amber-400 text-black' : 'text-[#8696a0]'}`}
                  >
                    Color
                  </button>
                </div>
              </div>

              {/* Copies Stepper */}
              <div>
                <span className="text-[9px] text-[#8696a0] font-bold block mb-1">COPIES</span>
                <div className="flex items-center justify-between bg-[#202c33] p-0.5 rounded-lg text-white font-bold">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, copies: Math.max(1, settings.copies - 1) })}
                    className="w-6 py-0.5 text-[#8696a0] hover:text-white"
                  >
                    -
                  </button>
                  <span className="text-xs">{settings.copies}</span>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, copies: settings.copies + 1 })}
                    className="w-6 py-0.5 text-[#8696a0] hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Sides (Duplex) */}
              <div>
                <span className="text-[9px] text-[#8696a0] font-bold block mb-1">SIDES</span>
                <div className="grid grid-cols-2 gap-1 bg-[#202c33] p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isDoubleSided: false })}
                    className={`py-1 rounded text-[11px] font-bold ${!settings.isDoubleSided ? 'bg-[#00a884] text-white' : 'text-[#8696a0]'}`}
                  >
                    1-Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isDoubleSided: true })}
                    className={`py-1 rounded text-[11px] font-bold ${settings.isDoubleSided ? 'bg-[#00a884] text-white' : 'text-[#8696a0]'}`}
                  >
                    2-Side
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Preview Verification Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => handleOpenPrintPreview(0)}
                className="text-xs text-[#00a884] hover:underline font-semibold flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Verify Print Formatting & Pages</span>
              </button>
            </div>

            {/* Upload Progress Bar if uploading */}
            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[#8696a0] tabular-nums">
                  <span>Uploading documents to counter...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#111b21] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-[#25D366] transition-all duration-200 ${progressWidthClass(
                      uploadProgress
                    )}`}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            WHATSAPP BOTTOM CHAT DOCK (Input + Paperclip + Send)
            ======================================================== */}
        <div className="p-2.5 bg-[#202c33] border-t border-[#2a3942] relative z-30">
          
          {/* Paperclip Popup Menu (WhatsApp Style) */}
          {attachMenuOpen && (
            <div className="absolute left-3 bottom-16 bg-[#233138] rounded-2xl p-3 shadow-2xl border border-[#374248] grid grid-cols-3 gap-3 w-72 animate-in zoom-in-95 duration-150 z-50">
              {/* Document Option */}
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-[#182229] text-[#e9edef] transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-medium">Document</span>
              </button>

              {/* Gallery / Photos */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-[#182229] text-[#e9edef] transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-medium">Photos</span>
              </button>

              {/* Print Preferences */}
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  setSettingsDrawerOpen(true);
                }}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-[#182229] text-[#e9edef] transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-md">
                  <Sliders className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-medium">Settings</span>
              </button>
            </div>
          )}

          {/* Form with Paperclip, Text Input, and Round Green Send Button */}
          <form onSubmit={handleSend} className="flex items-center gap-2">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              className={`p-2.5 rounded-full transition-colors shrink-0 ${
                attachMenuOpen || stagedFiles.length > 0
                  ? 'bg-[#00a884] text-white'
                  : 'text-[#8696a0] hover:text-white hover:bg-[#374248]'
              }`}
              title="Attach Document or Photo"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* 1-Tap Quick Photo / Camera Button */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="p-2.5 rounded-full text-[#25D366] hover:text-white hover:bg-[#374248] transition-colors shrink-0"
              title="Quick Send Photos"
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Chat Input Field */}
            <div className="flex-1 bg-[#2a3942] rounded-xl px-3.5 py-2 flex items-center gap-2">
              <input
                type="text"
                placeholder={
                  stagedFiles.length > 0
                    ? 'Add instructions for print (optional)...'
                    : 'Type message or tap camera to send photos...'
                }
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="w-full bg-transparent text-sm text-[#e9edef] placeholder-[#8696a0] focus:outline-none"
              />
            </div>

            {/* WhatsApp Signature Green Send Button */}
            <button
              type="submit"
              disabled={(!chatInput.trim() && stagedFiles.length === 0) || sending}
              className={`w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0 transition-all shadow-md ${
                (!chatInput.trim() && stagedFiles.length === 0) || sending
                  ? 'bg-[#374248] text-[#8696a0] opacity-50 cursor-not-allowed'
                  : 'bg-[#00a884] hover:bg-[#02906f] active:scale-95 text-white'
              }`}
              title="Send to Counter"
            >
              {sending ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5 ml-0.5" />
              )}
            </button>
          </form>
        </div>

      </div>

      {/* ========================================================
          DELETE FOR EVERYONE CONFIRMATION MODAL
          ======================================================== */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#222e35] rounded-2xl p-5 border border-[#374248] text-center space-y-4 text-[#e9edef] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                {deleteModal.type === 'all'
                  ? 'Delete All Data from Both Sides?'
                  : 'Delete for Everyone?'}
              </h3>
              <p className="text-xs text-[#8696a0] leading-relaxed">
                {deleteModal.type === 'all'
                  ? 'This will permanently remove all your messages and uploaded documents from both your screen and the shopkeeper’s computer.'
                  : 'This message and attached file will be permanently deleted from both your chat and the shop counter queue.'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, type: 'message' })}
                className="flex-1 py-2.5 rounded-xl bg-[#111b21] hover:bg-[#182229] text-xs font-semibold text-[#8696a0] border border-[#374248]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteForEveryone}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-900/30"
              >
                Delete for Everyone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PRINT PREFERENCES DRAWER / MODAL
          ======================================================== */}
      {settingsDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#222e35] rounded-t-3xl sm:rounded-2xl p-5 border border-[#374248] space-y-4 text-[#e9edef] shadow-2xl animate-in slide-in-from-bottom duration-150">
            <div className="flex items-center justify-between border-b border-[#374248] pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#00a884]" />
                <h3 className="text-sm font-bold text-white">Print Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsDrawerOpen(false)}
                className="text-[#8696a0] hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Color Mode */}
              <div>
                <label className="text-[11px] font-bold text-[#8696a0] uppercase block mb-1">
                  Color Mode
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#111b21] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, colorMode: 'BW' })}
                    className={`py-2 rounded-lg font-bold ${
                      settings.colorMode === 'BW' ? 'bg-[#00a884] text-white' : 'text-[#8696a0]'
                    }`}
                  >
                    Black & White (₹2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, colorMode: 'COLOR' })}
                    className={`py-2 rounded-lg font-bold ${
                      settings.colorMode === 'COLOR' ? 'bg-amber-400 text-black' : 'text-[#8696a0]'
                    }`}
                  >
                    Full Color (₹10)
                  </button>
                </div>
              </div>

              {/* Number of Copies */}
              <div>
                <label className="text-[11px] font-bold text-[#8696a0] uppercase block mb-1">
                  Number of Copies
                </label>
                <div className="flex items-center justify-between bg-[#111b21] p-2 rounded-xl text-white font-bold border border-[#374248]">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, copies: Math.max(1, settings.copies - 1) })}
                    className="w-10 py-1 bg-[#202c33] hover:bg-[#323f46] rounded-lg text-lg"
                  >
                    -
                  </button>
                  <span className="text-base">{settings.copies}</span>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, copies: settings.copies + 1 })}
                    className="w-10 py-1 bg-[#202c33] hover:bg-[#323f46] rounded-lg text-lg"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Duplex (Single or Double Sided) */}
              <div>
                <label className="text-[11px] font-bold text-[#8696a0] uppercase block mb-1">
                  Paper Sides
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#111b21] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isDoubleSided: false })}
                    className={`py-2 rounded-lg font-bold ${
                      !settings.isDoubleSided ? 'bg-[#00a884] text-white' : 'text-[#8696a0]'
                    }`}
                  >
                    Single Sided (1-Side)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isDoubleSided: true })}
                    className={`py-2 rounded-lg font-bold ${
                      settings.isDoubleSided ? 'bg-[#00a884] text-white' : 'text-[#8696a0]'
                    }`}
                  >
                    Double Sided (2-Side)
                  </button>
                </div>
              </div>

              {/* Page Range */}
              <div>
                <label className="text-[11px] font-bold text-[#8696a0] uppercase block mb-1">
                  Page Range
                </label>
                <input
                  type="text"
                  placeholder="All (e.g. 1-5, 8)"
                  value={settings.pageRange || ''}
                  onChange={(e) => setSettings({ ...settings, pageRange: e.target.value })}
                  className="w-full bg-[#111b21] border border-[#374248] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a884]"
                />
              </div>

              {/* Special Instructions */}
              <div>
                <label className="text-[11px] font-bold text-[#8696a0] uppercase block mb-1">
                  Special Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Staple top left, spiral binding"
                  value={settings.notes || ''}
                  onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
                  className="w-full bg-[#111b21] border border-[#374248] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a884]"
                />
              </div>
            </div>

            <Button
              size="md"
              variant="primary"
              onClick={() => setSettingsDrawerOpen(false)}
              className="w-full py-2.5 bg-[#00a884] hover:bg-[#02906f] text-white font-bold"
            >
              Save Preferences
            </Button>
          </div>
        </div>
      )}

      {/* Print Preview & Formatting Verification Modal */}
      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        files={previewFiles}
        initialFileIndex={previewIndex}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings(newSettings)}
        onConfirmAndQueue={() => {
          setIsPreviewOpen(false);
          handleSend();
        }}
        isSubmitting={sending}
        token={session?.token}
        shop={shop}
      />

      {/* In-Chat Counter QR Scanner Modal */}
      <CustomerQRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
};
