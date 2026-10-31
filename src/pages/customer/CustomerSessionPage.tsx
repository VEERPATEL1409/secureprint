import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  UploadCloud,
  FileText,
  Clock,
  Printer,
  Trash2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  Sparkles,
  ShieldCheck,
  X
} from 'lucide-react';
import { getShopByPublicCode } from '../../services/shopService';
import {
  createCustomerSession,
  getSessionById,
  subscribeToSessionMessages,
  sendMessageToSession
} from '../../services/sessionService';
import {
  uploadCustomerFile,
  createPrintJob,
  subscribeToSessionJobs,
  deleteJobAndFiles
} from '../../services/jobService';
import { Shop, CustomerSession, PrintJob, ChatMessage, FileAttachment, PrintSettings } from '../../types';
import { TokenBadge, StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal, ConfirmModal } from '../../components/common/Modal';
import { Skeleton } from '../../components/common/EmptyState';

export const CustomerSessionPage: React.FC = () => {
  const { shopCode } = useParams<{ shopCode: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Nickname entry modal for new walk-ins
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Upload state
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Print Settings
  const [settings, setSettings] = useState<PrintSettings>({
    colorMode: 'BW',
    copies: 1,
    isDoubleSided: false,
    paperSize: 'A4',
    pageRange: 'All',
    notes: '',
  });

  // Chat
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Time remaining countdown
  const [timeLeft, setTimeLeft] = useState<string>('5h 00m');

  // Load shop and restore existing local session
  useEffect(() => {
    if (!shopCode) return;

    const init = async () => {
      try {
        const foundShop = await getShopByPublicCode(shopCode);
        if (!foundShop) {
          setError('Invalid or unregistered shop code.');
          setLoading(false);
          return;
        }
        setShop(foundShop);

        // Check localStorage for existing session at this shop
        const savedSessionId = localStorage.getItem(`secureprint_sess_${foundShop.id}`);
        if (savedSessionId) {
          const existingSession = await getSessionById(savedSessionId);
          if (
            existingSession &&
            existingSession.status !== 'expired' &&
            new Date(existingSession.expiresAt).getTime() > Date.now()
          ) {
            setSession(existingSession);
            setLoading(false);
            return;
          }
        }

        // Prompt user for name
        setNameModalOpen(true);
        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize session:', err);
        setError('Error connecting to shop counter.');
        setLoading(false);
      }
    };

    init();
  }, [shopCode]);

  // Subscribe to session jobs and messages when session is ready
  useEffect(() => {
    if (!session?.id) return;

    const unsubJobs = subscribeToSessionJobs(session.id, (loadedJobs) => {
      setJobs(loadedJobs);
    });

    const unsubMessages = subscribeToSessionMessages(session.id, (loadedMsgs) => {
      setMessages(loadedMsgs);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    // Countdown interval
    const interval = setInterval(() => {
      const remainingMs = new Date(session.expiresAt).getTime() - Date.now();
      if (remainingMs <= 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
      } else {
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes < 10 ? '0' : ''}${minutes}m`);
      }
    }, 10000);

    return () => {
      unsubJobs();
      unsubMessages();
      clearInterval(interval);
    };
  }, [session?.id, session?.expiresAt]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !customerName.trim()) return;

    setLoading(true);
    try {
      const newSession = await createCustomerSession({
        shopId: shop.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
      });

      localStorage.setItem(`secureprint_sess_${shop.id}`, newSession.id);
      setSession(newSession);
      setNameModalOpen(false);
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Could not establish customer session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setStagedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitPrintJob = async () => {
    if (!shop || !session || stagedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(10);

    try {
      // 1. Upload files to Cloud Storage
      const uploadedAttachments: FileAttachment[] = [];

      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        const res = await uploadCustomerFile(shop.id, session.id, file);
        uploadedAttachments.push({
          name: file.name,
          size: file.size,
          type: file.type,
          storagePath: res.storagePath,
          downloadUrl: res.downloadUrl,
          pages: 1, // Default fallback
        });
        setUploadProgress(Math.round(((i + 1) / stagedFiles.length) * 80) + 10);
      }

      // 2. Create Job in Firestore
      await createPrintJob({
        shopId: shop.id,
        sessionId: session.id,
        token: session.token,
        customerName: session.customerName,
        files: uploadedAttachments,
        settings,
      });

      // Clear staged files
      setStagedFiles([]);
      setUploadProgress(null);
    } catch (err) {
      console.error('Job submission failed:', err);
      alert('Failed to upload documents. Please check file size and connection.');
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !chatInput.trim()) return;

    try {
      await sendMessageToSession(session.id, chatInput.trim(), 'customer');
      setChatInput('');
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete these documents immediately?')) return;
    try {
      await deleteJobAndFiles(jobId);
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Skeleton className="h-10 w-48 mx-auto" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full p-8 rounded-2xl bg-white border border-rose-200 text-center shadow-sm space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">Shop Not Found</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || 'This print shop QR code is invalid or no longer active.'}
          </p>
          <Link to="/" className="inline-block px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold">
            Return to SecurePrint Home
          </Link>
        </div>
      </div>
    );
  }

  const latestJob = jobs[0];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center sm:p-4 text-left">
      <div className="w-full max-w-2xl bg-white min-h-screen sm:min-h-[92vh] sm:rounded-3xl shadow-xl sm:border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Shop Counter Banner */}
        <header className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-900 flex items-center justify-center font-bold">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">
                {shop.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Desk Online
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Code: {shop.publicCode}
                </span>
              </div>
            </div>
          </div>

          {session && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Your Desk Token</span>
              <TokenBadge token={session.token} className="text-sm py-0.5 px-2.5" />
            </div>
          )}
        </header>

        {/* Ephemeral Privacy Bar */}
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Ephemeral Session: Auto-deleting in {timeLeft}</span>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Zero Footprint</span>
        </div>

        {/* Body Content */}
        <div className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto">
          {/* Active Job Status Stepper if a job has been submitted */}
          {latestJob && (
            <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Live Job Status</span>
                  <div className="text-base font-bold text-white flex items-center gap-2">
                    <TokenBadge token={latestJob.token} className="text-xs py-0.5 px-2" />
                    <span>Status: {latestJob.status}</span>
                  </div>
                </div>
                <StatusBadge status={latestJob.status} />
              </div>

              {/* Progress Stepper Visual */}
              <div className="grid grid-cols-4 gap-1 pt-2">
                {[
                  { status: 'WAITING', label: '1. In Queue' },
                  { status: 'REVIEWING', label: '2. Reviewing' },
                  { status: 'PRINTING', label: '3. Printing' },
                  { status: 'PRINTED', label: '4. Done' },
                ].map((step, idx) => {
                  const statuses = ['WAITING', 'REVIEWING', 'PRINTING', 'PRINTED'];
                  const currentIndex = statuses.indexOf(latestJob.status);
                  const stepIndex = statuses.indexOf(step.status);
                  const isDone = stepIndex <= currentIndex;

                  return (
                    <div key={idx} className="text-center space-y-1">
                      <div
                        className={`h-1.5 rounded-full ${
                          isDone ? 'bg-emerald-400' : 'bg-slate-700'
                        }`}
                      />
                      <span className={`text-[10px] font-medium block truncate ${
                        isDone ? 'text-emerald-300' : 'text-slate-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {latestJob.status === 'PRINTED' && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl flex items-center justify-between text-xs text-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Your document is printed! Collect at the counter.</span>
                  </div>
                  <button
                    onClick={() => handleDeleteJob(latestJob.id)}
                    className="p-1 text-xs text-rose-300 hover:text-white underline font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Purge File Now</span>
                  </button>
                </div>
              )}

              {latestJob.status === 'REJECTED' && (
                <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Job was rejected by shop operator</span>
                  </div>
                  <p className="text-rose-300">
                    Reason: {latestJob.rejectionReason || 'Contact counter staff'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Document Upload & Print Settings Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-600" />
                <span>Upload Documents to Print</span>
              </h3>
              <span className="text-[11px] text-slate-400">PDF, JPG, PNG (Max 50MB)</span>
            </div>

            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept=".pdf,image/png,image/jpeg,image/webp"
              className="hidden"
            />

            {/* Drag & Drop Clickable Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/30 transition-all cursor-pointer text-center space-y-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-white shadow-xs text-emerald-600 border border-slate-200 flex items-center justify-center mx-auto">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-800">
                Tap to select documents from your device
              </div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Documents are encrypted during transfer and auto-purged in 5 hours.
              </p>
            </div>

            {/* Staged Files List */}
            {stagedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Files Ready for Submission ({stagedFiles.length})
                </div>
                <div className="space-y-1.5">
                  {stagedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate">{file.name}</span>
                        <span className="text-slate-400 shrink-0">
                          ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                      <button
                        onClick={() => removeStagedFile(idx)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Print Settings Controls */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Counter Print Options
              </h4>

              <div className="grid grid-cols-2 gap-3">
                {/* Color Mode */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Color Mode</label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, colorMode: 'BW' })}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all ${
                        settings.colorMode === 'BW' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      B & W
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, colorMode: 'COLOR' })}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all ${
                        settings.colorMode === 'COLOR' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Color
                    </button>
                  </div>
                </div>

                {/* Copies */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Copies</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings.copies}
                    onChange={(e) => setSettings({ ...settings, copies: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Duplex */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Print Sides</label>
                  <select
                    value={settings.isDoubleSided ? 'true' : 'false'}
                    onChange={(e) => setSettings({ ...settings, isDoubleSided: e.target.value === 'true' })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 bg-white"
                  >
                    <option value="false">Single-sided (1 Side)</option>
                    <option value="true">Double-sided (Duplex)</option>
                  </select>
                </div>

                {/* Paper Size */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Paper Size</label>
                  <select
                    value={settings.paperSize}
                    onChange={(e) => setSettings({ ...settings, paperSize: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 bg-white"
                  >
                    <option value="A4">A4 (Standard)</option>
                    <option value="A3">A3 (Large)</option>
                    <option value="Legal">Legal (Documents)</option>
                  </select>
                </div>
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Special Instructions (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Pages 1 to 5 only, staple on top left..."
                  value={settings.notes}
                  onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Submit Job Button */}
            <div className="pt-2">
              <Button
                size="lg"
                variant="primary"
                onClick={handleSubmitPrintJob}
                disabled={stagedFiles.length === 0 || uploading}
                isLoading={uploading}
                className="w-full font-bold shadow-md"
              >
                <Printer className="w-5 h-5 mr-2" />
                <span>
                  {uploading
                    ? `Uploading Files (${uploadProgress}%)...`
                    : stagedFiles.length > 0
                    ? `Send ${stagedFiles.length} ${stagedFiles.length === 1 ? 'File' : 'Files'} to Shop Desk`
                    : 'Select Files to Print'}
                </span>
              </Button>
            </div>
          </div>

          {/* Desk Operator Live Chat */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col h-72">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Desk Operator Chat
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {messages.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-xs">
                  Ask the counter staff questions or clarify specifications here.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderRole === 'customer';
                  return (
                    <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[85%] p-2 rounded-xl ${
                          isMe
                            ? 'bg-emerald-600 text-white rounded-br-xs'
                            : 'bg-slate-100 text-slate-900 rounded-bl-xs'
                        }`}
                      >
                        <p>{m.text}</p>
                      </div>
                      <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2">
              <input
                type="text"
                placeholder="Message counter operator..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
              />
              <Button type="submit" size="sm" variant="primary" disabled={!chatInput.trim()}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Initial Nickname Modal for Walk-in Customers */}
      <Modal
        isOpen={nameModalOpen}
        onClose={() => {}} // Non-closable without entering name
        title="Start Private Print Session"
        maxWidth="sm"
      >
        <form onSubmit={handleStartSession} className="space-y-4">
          <div className="text-xs text-slate-600 leading-relaxed">
            Welcome to <span className="font-bold text-slate-900">{shop.name}</span>. Enter your name or nickname to receive your 6-digit desk token.
          </div>

          <Input
            label="Your Name or Nickname"
            required
            autoFocus
            placeholder="e.g. Rahul, Sneha, Alex"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <Input
            label="Mobile Number (Optional)"
            type="tel"
            placeholder="Only if needed for billing"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />

          <Button type="submit" variant="primary" size="md" className="w-full font-bold">
            Get My Desk Token & Print
          </Button>

          <p className="text-[11px] text-slate-400 text-center">
            Zero permanent storage. Documents automatically purge after 5 hours.
          </p>
        </form>
      </Modal>
    </div>
  );
};
