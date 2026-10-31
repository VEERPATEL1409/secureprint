import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Printer,
  ArrowLeft,
  Clock,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Send,
  FileText,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Check,
  Lock,
  ZoomIn,
  ZoomOut,
  RotateCw,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';
import { useAuth } from '../../firebase/context';
import { getJobById, updateJobStatus, deleteJobAndFiles } from '../../services/jobService';
import {
  subscribeToSessionMessages,
  sendMessageToSession,
  deleteMessageForEveryone,
  getSessionById
} from '../../services/sessionService';
import { resolveFileUrlCrossInstance } from '../../services/storageService';
import { PrintJob, CustomerSession, ChatMessage, JobStatus } from '../../types';
import { TokenBadge, StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Skeleton } from '../../components/common/EmptyState';
import { ResolvedImage, ResolvedDownloadLink } from '../../components/common/ResolvedAttachment';
import { ShopPrintPreviewModal } from '../../components/shop/ShopPrintPreviewModal';
import {
  printDocumentFile,
  printMultipleDocumentFiles,
  isImageAttachment,
  normalizeFileUrl
} from '../../utils/printEngine';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const ZOOM_SCALE_CLASS: Record<number, string> = {
  0.5: 'scale-50',
  0.75: 'scale-75',
  1: 'scale-100',
  1.25: 'scale-125',
  1.5: 'scale-150',
  2: 'scale-200'
};

const ROTATE_CLASS: Record<number, string> = {
  0: 'rotate-0',
  90: 'rotate-90',
  180: 'rotate-180',
  270: '-rotate-90'
};

export const ShopJobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { shop } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<PrintJob | null>(null);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    url: string;
    type: string;
    storagePath?: string;
    index?: number;
  } | null>(null);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string>('');

  const [zoomIndex, setZoomIndex] = useState<number>(2);
  const [previewRotate, setPreviewRotate] = useState<number>(0);
  const [simulateBW, setSimulateBW] = useState<boolean>(false);
  const [isPrintingFile, setIsPrintingFile] = useState<boolean>(false);

  const [printPreviewModalOpen, setPrintPreviewModalOpen] = useState<boolean>(false);
  const [printPreviewFileIndex, setPrintPreviewFileIndex] = useState<number>(0);

  const [confirmedSettings, setConfirmedSettings] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteJobModalOpen, setDeleteJobModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previewZoom = ZOOM_STEPS[zoomIndex] ?? 1;

  useEffect(() => {
    if (!jobId || !shop?.id) return;

    let unsubMessages: (() => void) | undefined;

    const loadJob = async () => {
      try {
        const j = await getJobById(jobId);
        if (!j || j.shopId !== shop.id) {
          navigate('/shop/queue');
          return;
        }
        setJob(j);

        if (j.files && j.files.length > 0) {
          setPreviewFile({
            name: j.files[0].fileName || (j.files[0] as any).name,
            url: j.files[0].downloadUrl,
            type: j.files[0].fileType || (j.files[0] as any).type || 'application/pdf',
            storagePath: j.files[0].storagePath,
            index: 0
          });
        }

        const sess = await getSessionById(j.sessionId);
        setSession(sess);

        unsubMessages = subscribeToSessionMessages(j.sessionId, (msgs) => {
          setMessages(msgs);
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      } catch (err) {
        console.error('Failed to load job details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadJob();

    return () => {
      if (unsubMessages) unsubMessages();
    };
  }, [jobId, shop?.id, navigate]);

  useEffect(() => {
    if (!previewFile?.url) {
      setResolvedPreviewUrl('');
      return;
    }
    let active = true;
    const norm = normalizeFileUrl(previewFile.url);
    setResolvedPreviewUrl(norm);
    resolveFileUrlCrossInstance(norm, previewFile.storagePath, previewFile.type).then((resolved) => {
      if (active && resolved) {
        setResolvedPreviewUrl(resolved);
      }
    });
    return () => {
      active = false;
    };
  }, [previewFile?.url, previewFile?.storagePath, previewFile?.type]);

  const openPrintPreviewAt = (idx = 0) => {
    setPrintPreviewFileIndex(idx);
    setPrintPreviewModalOpen(true);
  };

  const handlePrintFile = async (
    url: string,
    fileName?: string,
    fileType?: string,
    storagePath?: string
  ) => {
    if (!url) return;
    setIsPrintingFile(true);
    try {
      await printDocumentFile(
        url,
        fileName || previewFile?.name || 'document',
        {
          colorMode: job?.settings?.colorMode,
          copies: job?.settings?.copies,
          paperSize: job?.settings?.paperSize,
          orientation: job?.settings?.orientation,
          isDoubleSided: job?.settings?.isDoubleSided,
          duplexEdge: job?.settings?.duplexEdge,
          margin: job?.settings?.margin,
          fitMode: job?.settings?.fitMode,
          pageRange: job?.settings?.pageRange
        },
        fileType || previewFile?.type,
        storagePath || previewFile?.storagePath
      );
      if (job && (job.status === 'WAITING' || job.status === 'REVIEWING')) {
        await updateJobStatus(job.id, 'PRINTING');
        setJob(prev => prev ? { ...prev, status: 'PRINTING' } : null);
      }
    } catch (err) {
      console.error('Print error:', err);
    } finally {
      setIsPrintingFile(false);
    }
  };

  const handlePrintAllFiles = async () => {
    if (!job || !job.files || job.files.length === 0) return;
    setIsPrintingFile(true);
    try {
      await printMultipleDocumentFiles(
        job.files.map((file) => ({
          url: file.downloadUrl,
          name: file.fileName || (file as any).name || 'document',
          type: file.fileType || (file as any).type,
          storagePath: file.storagePath
        })),
        {
          colorMode: job.settings?.colorMode,
          copies: job.settings?.copies,
          paperSize: job.settings?.paperSize,
          orientation: job.settings?.orientation,
          isDoubleSided: job.settings?.isDoubleSided,
          duplexEdge: job.settings?.duplexEdge,
          margin: job.settings?.margin,
          fitMode: job.settings?.fitMode,
          pageRange: job.settings?.pageRange
        }
      );
      if (job.status === 'WAITING' || job.status === 'REVIEWING') {
        await updateJobStatus(job.id, 'PRINTING');
        setJob(prev => prev ? { ...prev, status: 'PRINTING' } : null);
      }
    } catch (err) {
      console.error('Print all error:', err);
    } finally {
      setIsPrintingFile(false);
    }
  };

  const handleStatusChange = async (newStatus: JobStatus, reason?: string) => {
    if (!job || actionLoading) return;
    setActionLoading(true);
    setErrorMessage(null);

    try {
      await updateJobStatus(job.id, newStatus, reason);
      setJob(prev => prev ? { ...prev, status: newStatus, rejectionReason: reason || prev.rejectionReason } : null);
      if (rejectModalOpen) setRejectModalOpen(false);

      // Trigger automatic hardware print if moving to PRINTING
      if (newStatus === 'PRINTING' && previewFile?.url) {
        handlePrintFile(previewFile.url, previewFile.name);
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      setErrorMessage(err.message || 'Failed to update job status. Another operator may have modified this job.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job || !newMessage.trim()) return;

    try {
      await sendMessageToSession(job.sessionId, newMessage.trim(), 'shop');
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleDeleteMessage = async (messageId: string, files?: any[]) => {
    if (!job) return;
    try {
      await deleteMessageForEveryone(job.sessionId, messageId, files);
    } catch (err) {
      console.error('Failed to delete message for everyone:', err);
      setErrorMessage('Could not delete message.');
    }
  };

  const handleDeleteJobPermanently = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      await deleteJobAndFiles(job.id);
      navigate('/shop/queue');
    } catch (err) {
      console.error('Failed to delete job:', err);
      setErrorMessage('Failed to permanently delete job and files.');
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 text-left">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="h-96 lg:col-span-3" />
          <Skeleton className="h-96 lg:col-span-5" />
          <Skeleton className="h-96 lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <h3 className="text-base font-bold text-slate-800">Job not found</h3>
        <Link to="/shop/queue" className="mt-4 inline-block text-emerald-600 font-semibold text-sm">
          Return to Queue
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/shop/queue')}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Back to queue"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <TokenBadge token={job.token} className="text-lg py-1 px-3" />
              <h2 className="text-xl font-extrabold text-slate-900">
                {job.customerName || 'Walk-in Customer'}
              </h2>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Received {new Date(job.createdAt).toLocaleString()}</span>
              <span>•</span>
              <span className="text-emerald-700 font-medium">
                Auto-purging in {Math.max(0, Math.round((new Date(job.expiresAt).getTime() - Date.now()) / (1000 * 60)))}m
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {job.files && job.files.length > 0 && (
            <button
              type="button"
              onClick={() => openPrintPreviewAt(previewFile?.index ?? 0)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Eye className="w-4 h-4" />
              <span>Print Preview & Verify</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDeleteJobModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title="Permanently delete job and all documents from both shop and customer sides"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Delete for Everyone</span>
          </button>

          {errorMessage && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3-COLUMN LAYOUT AS MANDATED (LEFT, CENTER, RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ============================================================
            COLUMN 1 (LEFT): CUSTOMER INFO, TOKEN, STATUS, CHAT
            ============================================================ */}
        <div className="lg:col-span-3 space-y-5">
          {/* Customer & Session Info */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Desk Session</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">{job.customerName}</div>
              {session?.phone && (
                <div className="text-xs text-slate-500 font-mono mt-0.5">{session.phone}</div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Token Match:</span>
                <TokenBadge token={job.token} className="py-0.5 px-2 text-xs" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Queue Status:</span>
                <StatusBadge status={job.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Files Attached:</span>
                <span className="font-bold text-slate-800">{job.files.length} document(s)</span>
              </div>
            </div>
          </div>

          {/* Real-time Desk Chat with Customer */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col h-[400px]">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-3 shrink-0">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Customer Chat
              </h4>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {messages.length === 0 ? (
                <div className="text-center text-slate-400 py-16 italic">
                  No messages exchanged with customer.
                </div>
              ) : (
                messages.map((m) => {
                  const isShop = m.senderRole === 'shop';
                  const hasFiles = m.files && m.files.length > 0;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isShop ? 'items-end' : 'items-start'} group relative`}
                    >
                      <div
                        className={`max-w-[92%] p-2.5 rounded-xl text-xs relative ${
                          isShop
                            ? 'bg-slate-900 text-white rounded-br-xs'
                            : 'bg-emerald-50 text-emerald-950 border border-emerald-100 rounded-bl-xs'
                        }`}
                      >
                        {hasFiles && (
                          <div className="space-y-1.5 mb-2">
                            {m.files!.map((f, fIdx) => {
                              const fName = f.fileName || f.name || 'document';
                              const fType = f.fileType || f.type || 'application/pdf';
                              const isImg = isImageAttachment(f.downloadUrl, fName, fType);
                              return (
                                <div
                                  key={fIdx}
                                  className={`p-2 rounded-lg border flex flex-col gap-1.5 ${
                                    isShop ? 'bg-slate-800 border-slate-700' : 'bg-white border-emerald-200'
                                  }`}
                                >
                                  {isImg && (
                                    <div
                                      onClick={() =>
                                        setPreviewFile({
                                          name: fName,
                                          url: f.downloadUrl,
                                          type: fType,
                                          storagePath: f.storagePath
                                        })
                                      }
                                      className="w-full h-24 rounded-md overflow-hidden bg-slate-100 cursor-pointer"
                                    >
                                      <ResolvedImage
                                        src={f.downloadUrl}
                                        storagePath={f.storagePath}
                                        mimeType={fType}
                                        alt={fName}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                      <span className="font-bold truncate text-[11px]">{fName}</span>
                                    </div>
                                    <span className="text-[9px] opacity-70 shrink-0 tabular-nums">
                                      {((f.fileSize || f.size || 0) / 1024).toFixed(0)} KB
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 pt-1 border-t border-slate-100/20">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewFile({
                                          name: fName,
                                          url: f.downloadUrl,
                                          type: fType,
                                          storagePath: f.storagePath
                                        })
                                      }
                                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 whitespace-nowrap shrink-0"
                                      title="Preview in center canvas"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Preview</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handlePrintFile(f.downloadUrl, fName, fType, f.storagePath)}
                                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1 whitespace-nowrap shrink-0"
                                      title="Print this document immediately"
                                    >
                                      <Printer className="w-3 h-3" />
                                      <span>Print</span>
                                    </button>

                                    <ResolvedDownloadLink
                                      href={f.downloadUrl}
                                      storagePath={f.storagePath}
                                      mimeType={fType}
                                      fileName={fName}
                                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 hover:bg-slate-300 flex items-center gap-1 whitespace-nowrap shrink-0"
                                      title="Download attachment to disk"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Save</span>
                                    </ResolvedDownloadLink>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 px-1">
                        <span className="text-[10px] text-slate-400">
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {/* Delete for everyone icon */}
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id, m.files)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-0.5"
                          title="Delete message for everyone"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2 shrink-0">
              <input
                type="text"
                placeholder="Reply to customer..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
              />
              <Button type="submit" size="sm" variant="primary" disabled={!newMessage.trim()}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </div>

        {/* ============================================================
            COLUMN 2 (CENTER): FILE LIST, PREVIEW, FILE DETAILS
            ============================================================ */}
        <div className="lg:col-span-5 space-y-5">
          {/* File List */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Uploaded Documents ({job.files.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">Click to preview</span>
            </div>

            <div className="space-y-2">
              {job.files.map((file, idx) => {
                const fileName = file.fileName || (file as any).name || `File ${idx + 1}`;
                const fileType = file.fileType || (file as any).type || '';
                const isSelected = previewFile?.url === file.downloadUrl;
                return (
                  <div
                    key={idx}
                    onClick={() =>
                      setPreviewFile({
                        name: fileName,
                        url: file.downloadUrl,
                        type: fileType,
                        storagePath: file.storagePath,
                        index: idx
                      })
                    }
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {fileType.includes('pdf') || fileName.endsWith('.pdf')
                          ? 'PDF'
                          : isImageAttachment(file.downloadUrl, fileName, fileType)
                          ? 'IMG'
                          : 'DOC'}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-slate-900 truncate">{fileName}</div>
                        <div className="text-[10px] text-slate-500 tabular-nums">
                          {((file.fileSize || 0) / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openPrintPreviewAt(idx)}
                        className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        title="Open calibrated Print Preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintFile(file.downloadUrl, fileName, fileType, file.storagePath)}
                        className="py-1 px-2 text-xs whitespace-nowrap shrink-0"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1" />
                        <span>Print</span>
                      </Button>
                      <ResolvedDownloadLink
                        href={file.downloadUrl}
                        storagePath={file.storagePath}
                        mimeType={fileType}
                        fileName={fileName}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-200 shrink-0"
                        title="Download file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </ResolvedDownloadLink>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Document Preview Box */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold text-slate-800 truncate max-w-[180px]">
                {previewFile?.name || 'No document selected'}
              </span>

              {previewFile && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setZoomIndex((prev) => Math.max(0, prev - 1))}
                    className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-slate-500 w-9 text-center tabular-nums">
                    {Math.round(previewZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomIndex((prev) => Math.min(ZOOM_STEPS.length - 1, prev + 1))}
                    className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewRotate((prev) => (prev + 90) % 360)}
                    className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 ml-0.5"
                    title="Rotate 90 degrees"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimulateBW((prev) => !prev)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                      simulateBW ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                    title="Toggle Black & White Preview Simulation"
                  >
                    {simulateBW ? 'B&W On' : 'Simulate B&W'}
                  </button>

                  <button
                    type="button"
                    onClick={() => openPrintPreviewAt(previewFile.index ?? 0)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    title="Open full calibrated sheet Print Preview"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sheet Preview</span>
                  </button>
                </div>
              )}
            </div>

            <div className="w-full h-[400px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
              {previewFile && resolvedPreviewUrl ? (
                isImageAttachment(previewFile.url, previewFile.name, previewFile.type) ? (
                  <div className="w-full h-full flex items-center justify-center overflow-auto p-3">
                    <img
                      src={resolvedPreviewUrl}
                      alt={previewFile.name}
                      className={`max-h-full max-w-full object-contain shadow-lg transition-transform duration-200 ${
                        ZOOM_SCALE_CLASS[previewZoom] || 'scale-100'
                      } ${ROTATE_CLASS[previewRotate] || 'rotate-0'} ${
                        simulateBW || job.settings?.colorMode === 'BW' ? 'grayscale contrast-125' : ''
                      }`}
                    />
                  </div>
                ) : (
                  <iframe
                    src={`${resolvedPreviewUrl}#toolbar=0`}
                    title="PDF Document Preview"
                    className={`w-full h-full border-none bg-white ${
                      simulateBW || job.settings?.colorMode === 'BW' ? 'grayscale' : ''
                    }`}
                  />
                )
              ) : (
                <div className="text-xs text-slate-400">Select a document above to preview</div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================
            COLUMN 3 (RIGHT): PRINT SETTINGS, CONFIRMATION, PRINT BUTTON
            ============================================================ */}
        <div className="lg:col-span-4 space-y-5">
          {/* Print Specifications */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Print Specifications
              </h3>
              {job.files && job.files.length > 0 && (
                <button
                  type="button"
                  onClick={() => openPrintPreviewAt(previewFile?.index ?? 0)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Edit & Verify</span>
                </button>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Color Mode:</span>
                <span className={`font-bold ${job.settings?.colorMode === 'COLOR' ? 'text-amber-600' : 'text-slate-900'}`}>
                  {job.settings?.colorMode === 'COLOR' ? 'Full Color' : 'Black & White'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Copies:</span>
                <span className="font-bold text-slate-900 tabular-nums">{job.settings?.copies || 1}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Duplex (Double-Sided):</span>
                <span className="font-bold text-slate-900">
                  {job.settings?.isDoubleSided
                    ? `2-Sided (${job.settings?.duplexEdge === 'short' ? 'Short Edge' : 'Long Edge'})`
                    : '1-Sided (Single)'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Paper Format:</span>
                <span className="font-bold text-slate-900">
                  {job.settings?.paperSize || 'A4'} • {job.settings?.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Page Range:</span>
                <span className="font-bold text-slate-900">{job.settings?.pageRange || 'All Pages'}</span>
              </div>

              {job.settings?.notes && (
                <div className="pt-2">
                  <span className="text-slate-500 block mb-1 font-medium">Customer Instructions:</span>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-medium leading-relaxed">
                    "{job.settings.notes}"
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Verification Checkbox & Action Button */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Counter Execution
            </h3>

            {/* Strict Double-Print Prevention Lock */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={confirmedSettings}
                onChange={(e) => setConfirmedSettings(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-slate-700 leading-snug">
                I have loaded correct paper ({job.settings?.paperSize || 'A4'}) and verified print specifications.
              </span>
            </label>

            {/* ACTION PIPELINE */}
            <div className="space-y-2">
              {job.files && job.files.length > 0 && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => openPrintPreviewAt(previewFile?.index ?? 0)}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold"
                >
                  <Eye className="w-4 h-4 mr-2 text-emerald-400" />
                  <span>Open Calibrated Print Preview</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="md"
                onClick={handlePrintAllFiles}
                isLoading={isPrintingFile}
                className="w-full py-2.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-bold"
              >
                <Printer className="w-4 h-4 mr-2 text-emerald-600" />
                <span>Print All Documents ({job.files.length})</span>
              </Button>

              {job.status === 'WAITING' && (
                <Button
                  variant="primary"
                  size="md"
                  isLoading={actionLoading}
                  disabled={actionLoading}
                  onClick={() => handleStatusChange('REVIEWING')}
                  className="w-full py-3 font-bold"
                >
                  Start Reviewing
                </Button>
              )}

              {job.status === 'REVIEWING' && (
                <Button
                  variant="primary"
                  size="md"
                  isLoading={actionLoading}
                  disabled={actionLoading || !confirmedSettings}
                  onClick={() => handleStatusChange('PRINTING')}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-md shadow-emerald-600/20"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  <span>Print Job (Send to Hardware)</span>
                </Button>
              )}

              {job.status === 'PRINTING' && (
                <Button
                  variant="primary"
                  size="md"
                  isLoading={actionLoading}
                  disabled={actionLoading}
                  onClick={() => handleStatusChange('PRINTED')}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  <span>Mark as Completed & Printed</span>
                </Button>
              )}

              {job.status === 'PRINTED' && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Job Printed & Ready for Customer Collection</span>
                </div>
              )}

              {/* Reject Action if not yet final */}
              {job.status !== 'REJECTED' && job.status !== 'PRINTED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectModalOpen(true)}
                  className="w-full text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  <span>Reject Print Job</span>
                </Button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Print Job"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Please provide a reason to notify the customer why this print job cannot be processed:
          </p>
          <textarea
            rows={3}
            placeholder="e.g. Paper out of stock, unreadable file, or unsupported page size..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={actionLoading}
              onClick={() => handleStatusChange('REJECTED', rejectReason)}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Job & Documents for Everyone Modal */}
      <Modal
        isOpen={deleteJobModalOpen}
        onClose={() => setDeleteJobModalOpen(false)}
        title="Permanently Delete Job from Both Sides"
        maxWidth="sm"
      >
        <div className="space-y-4 text-left">
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-700">
              <AlertTriangle className="w-4 h-4" />
              <span>Permanent Deletion Warning</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              This will permanently delete this job, its files, and associated attachments from storage and queues on both your screen and the customer’s phone.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteJobModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={actionLoading}
              onClick={handleDeleteJobPermanently}
            >
              Delete from Both Sides
            </Button>
          </div>
        </div>
      </Modal>

      <ShopPrintPreviewModal
        isOpen={printPreviewModalOpen}
        onClose={() => setPrintPreviewModalOpen(false)}
        job={job}
        shop={shop}
        initialFileIndex={printPreviewFileIndex}
        onJobUpdated={(updatedJob) => setJob(updatedJob)}
      />
    </div>
  );
};
