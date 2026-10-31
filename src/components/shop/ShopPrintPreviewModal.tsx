import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Minimize2,
  Save,
  RotateCcw,
  Ruler,
  BookOpen
} from 'lucide-react';
import { PrintJob, PrintSettings, Shop, FileAttachment, JobStatus } from '../../types';
import { StatusBadge, TokenBadge } from '../common/Badge';
import { Button } from '../common/Button';
import { updateJobSettings, updateJobStatus } from '../../services/jobService';
import { resolveFileUrlCrossInstance } from '../../services/storageService';
import {
  normalizeFileUrl,
  isImageAttachment,
  isPdfAttachment,
  isTextAttachment,
  printDocumentFile,
  printMultipleDocumentFiles
} from '../../utils/printEngine';

export interface ShopPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: PrintJob;
  shop?: Shop | null;
  initialFileIndex?: number;
  onJobUpdated?: (updatedJob: PrintJob) => void;
}

type PaperSizeKey = 'A4' | 'A3' | 'Letter' | 'Legal';

const PAPER_SPECS: Record<
  PaperSizeKey,
  {
    label: string;
    dimensionsMm: string;
    widthInches: number;
    heightInches: number;
    portraitAspectClass: string;
    landscapeAspectClass: string;
  }
> = {
  A4: {
    label: 'A4',
    dimensionsMm: '210 × 297 mm',
    widthInches: 8.27,
    heightInches: 11.69,
    portraitAspectClass: 'aspect-[210/297]',
    landscapeAspectClass: 'aspect-[297/210]'
  },
  A3: {
    label: 'A3',
    dimensionsMm: '297 × 420 mm',
    widthInches: 11.69,
    heightInches: 16.54,
    portraitAspectClass: 'aspect-[297/420]',
    landscapeAspectClass: 'aspect-[420/297]'
  },
  Letter: {
    label: 'US Letter',
    dimensionsMm: '216 × 279 mm',
    widthInches: 8.5,
    heightInches: 11.0,
    portraitAspectClass: 'aspect-[216/279]',
    landscapeAspectClass: 'aspect-[279/216]'
  },
  Legal: {
    label: 'US Legal',
    dimensionsMm: '216 × 356 mm',
    widthInches: 8.5,
    heightInches: 14.0,
    portraitAspectClass: 'aspect-[216/356]',
    landscapeAspectClass: 'aspect-[356/216]'
  }
};

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200] as const;

const PORTRAIT_WIDTH_BY_ZOOM: Record<number, string> = {
  50: 'w-[250px]',
  75: 'w-[350px]',
  100: 'w-[450px]',
  125: 'w-[550px]',
  150: 'w-[650px]',
  175: 'w-[750px]',
  200: 'w-[850px]'
};

const LANDSCAPE_WIDTH_BY_ZOOM: Record<number, string> = {
  50: 'w-[340px]',
  75: 'w-[470px]',
  100: 'w-[600px]',
  125: 'w-[730px]',
  150: 'w-[860px]',
  175: 'w-[980px]',
  200: 'w-[1100px]'
};

function getAttachmentName(file: FileAttachment, index: number): string {
  return file.fileName || file.name || `Document ${index + 1}`;
}

function getAttachmentSize(file: FileAttachment): number {
  return file.fileSize ?? file.size ?? 0;
}

function getAttachmentType(file: FileAttachment): string {
  return file.fileType || file.type || '';
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildDefaultSettings(source?: PrintSettings): Required<Omit<PrintSettings, 'notes' | 'pageRange'>> & {
  notes: string;
  pageRange: string;
} {
  return {
    colorMode: source?.colorMode || 'BW',
    copies: Math.max(1, Number(source?.copies) || 1),
    isDoubleSided: Boolean(source?.isDoubleSided),
    paperSize: (source?.paperSize as PaperSizeKey) || 'A4',
    orientation: source?.orientation || 'portrait',
    margin: source?.margin || 'normal',
    fitMode: source?.fitMode || 'fit',
    duplexEdge: source?.duplexEdge || 'long',
    pageRange: source?.pageRange || '',
    notes: source?.notes || ''
  };
}

function parsePageRangeResult(rangeInput: string, totalPages: number): {
  valid: boolean;
  count: number;
  error?: string;
} {
  const trimmed = rangeInput.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return { valid: true, count: Math.max(1, totalPages) };
  }

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { valid: true, count: Math.max(1, totalPages) };
  }

  const selectedPages = new Set<number>();

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const pageNum = parseInt(part, 10);
      if (pageNum < 1) {
        return { valid: false, count: totalPages, error: 'Page numbers must start at 1.' };
      }
      if (totalPages > 0 && pageNum > totalPages) {
        return {
          valid: false,
          count: totalPages,
          error: `Page ${pageNum} exceeds document length (${totalPages} pages).`
        };
      }
      selectedPages.add(pageNum);
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (start < 1 || end < start) {
        return { valid: false, count: totalPages, error: `Invalid range "${part}".` };
      }
      if (totalPages > 0 && end > totalPages) {
        return {
          valid: false,
          count: totalPages,
          error: `Range "${part}" exceeds document length (${totalPages} pages).`
        };
      }
      for (let p = start; p <= end; p++) {
        selectedPages.add(p);
      }
    } else {
      return {
        valid: false,
        count: totalPages,
        error: 'Use comma-separated pages or ranges (e.g. 1-4, 6).'
      };
    }
  }

  return { valid: true, count: Math.max(1, selectedPages.size) };
}

export const ShopPrintPreviewModal: React.FC<ShopPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  job,
  shop,
  initialFileIndex = 0,
  onJobUpdated
}) => {
  const files = job.files || [];
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [zoomIndex, setZoomIndex] = useState<number>(2); // 100%
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [showMarginGuides, setShowMarginGuides] = useState<boolean>(true);
  const [pdfViewMode, setPdfViewMode] = useState<'sheet' | 'reader'>('sheet');
  const [duplexFace, setDuplexFace] = useState<'front' | 'back'>('front');
  const [printScope, setPrintScope] = useState<'all' | 'current'>(files.length > 1 ? 'all' : 'current');

  const [savedSettings, setSavedSettings] = useState(() => buildDefaultSettings(job.settings));
  const [draftSettings, setDraftSettings] = useState(() => buildDefaultSettings(job.settings));
  const [currentStatus, setCurrentStatus] = useState<JobStatus>(job.status);

  const [verifiedReady, setVerifiedReady] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [isSpoolingPrint, setIsSpoolingPrint] = useState<boolean>(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Content inspection states
  const [detectedPagesMap, setDetectedPagesMap] = useState<Record<number, number>>({});
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState<boolean>(false);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [previewLoadError, setPreviewLoadError] = useState<boolean>(false);

  // Sync modal state when opened or when job prop updates
  useEffect(() => {
    if (!isOpen) return;
    const boundedIdx = Math.min(Math.max(0, initialFileIndex), Math.max(0, files.length - 1));
    setActiveFileIndex(boundedIdx);
    const normalized = buildDefaultSettings(job.settings);
    setSavedSettings(normalized);
    setDraftSettings(normalized);
    setCurrentStatus(job.status);
    setPrintScope(files.length > 1 ? 'all' : 'current');
    setRotation(0);
    setDuplexFace('front');
    setVerifiedReady(false);
    setFeedbackBanner(null);
  }, [isOpen, job.id, initialFileIndex]);

  useEffect(() => {
    setCurrentStatus(job.status);
  }, [job.status]);

  // Keyboard navigation & Escape handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.key === 'Escape' && !isSpoolingPrint && !isSavingSettings) {
        onClose();
        return;
      }

      if (isInput) return;

      if (e.key === 'ArrowLeft' && files.length > 1) {
        e.preventDefault();
        setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
      } else if (e.key === 'ArrowRight' && files.length > 1) {
        e.preventDefault();
        setActiveFileIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
      } else if ((e.key === '+' || e.key === '=') && zoomIndex < ZOOM_STEPS.length - 1) {
        e.preventDefault();
        setZoomIndex((z) => Math.min(ZOOM_STEPS.length - 1, z + 1));
      } else if (e.key === '-' && zoomIndex > 0) {
        e.preventDefault();
        setZoomIndex((z) => Math.max(0, z - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, files.length, zoomIndex, isSpoolingPrint, isSavingSettings, onClose]);

  const activeFile: FileAttachment | undefined = files[activeFileIndex];
  const activeFileName = activeFile ? getAttachmentName(activeFile, activeFileIndex) : 'No Document';
  const activeFileSize = activeFile ? getAttachmentSize(activeFile) : 0;
  const activeFileType = activeFile ? getAttachmentType(activeFile) : '';
  const rawActiveUrl = activeFile ? normalizeFileUrl(activeFile.downloadUrl) : '';
  const [resolvedActiveUrl, setResolvedActiveUrl] = useState<string>('');

  const activeFileUrl = resolvedActiveUrl || rawActiveUrl;
  const activeDownloadUrl = resolvedActiveUrl.startsWith('blob:')
    ? resolvedActiveUrl
    : activeFile
    ? normalizeFileUrl(activeFile.downloadUrl, true)
    : '';

  const isImage = activeFile ? isImageAttachment(rawActiveUrl, activeFileName, activeFileType) : false;
  const isPdf = activeFile && !isImage ? isPdfAttachment(rawActiveUrl, activeFileName, activeFileType) : false;
  const isText = activeFile && !isImage && !isPdf ? isTextAttachment(activeFileName, activeFileType) : false;

  // Resolve cross-instance URL & inspect active file (PDF page counting + Blob URL, or Text loading)
  useEffect(() => {
    if (!isOpen || !activeFile || !rawActiveUrl) return;

    setImageNaturalSize(null);
    setPreviewLoadError(false);
    setTextPreviewContent(null);
    setResolvedActiveUrl('');

    const controller = new AbortController();
    let createdObjectUrl: string | null = null;
    let cancelled = false;

    const runInspection = async () => {
      const resolvedUrl = await resolveFileUrlCrossInstance(
        rawActiveUrl,
        activeFile.storagePath,
        activeFileType
      );
      if (cancelled) return;
      setResolvedActiveUrl(resolvedUrl);

      if (isPdf) {
        setPdfLoading(true);
        setPdfBlobUrl(null);
        try {
          const res = await fetch(resolvedUrl, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();

          if (!activeFile.pages && !detectedPagesMap[activeFileIndex]) {
            try {
              const decoder = new TextDecoder('latin1');
              const rawPdfText = decoder.decode(buffer);
              const matches = rawPdfText.match(/\/Type\s*\/Page\b/g);
              if (matches && matches.length > 0 && !cancelled) {
                setDetectedPagesMap((prev) => ({ ...prev, [activeFileIndex]: matches.length }));
              }
            } catch {
              // Fallback to 1 page
            }
          }

          const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
          createdObjectUrl = URL.createObjectURL(pdfBlob);
          if (!cancelled) {
            setPdfBlobUrl(createdObjectUrl);
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError' && !cancelled) {
            setPdfBlobUrl(resolvedUrl);
          }
        } finally {
          if (!cancelled) {
            setPdfLoading(false);
          }
        }
      } else if (isText) {
        setTextLoading(true);
        try {
          const res = await fetch(resolvedUrl, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const txt = await res.text();
          if (!cancelled) {
            setTextPreviewContent(txt.slice(0, 120000));
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError' && !cancelled) {
            setPreviewLoadError(true);
          }
        } finally {
          if (!cancelled) {
            setTextLoading(false);
          }
        }
      } else {
        setPdfBlobUrl(null);
        setPdfLoading(false);
        setTextLoading(false);
      }
    };

    runInspection();

    return () => {
      cancelled = true;
      controller.abort();
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [isOpen, activeFileIndex, rawActiveUrl, isPdf, isText]);

  const activeFilePages = activeFile
    ? activeFile.pages || detectedPagesMap[activeFileIndex] || 1
    : 1;

  const totalScopeRawPages = useMemo(() => {
    if (files.length === 0) return 1;
    if (printScope === 'current') {
      return activeFilePages;
    }
    return files.reduce((sum, f, idx) => sum + (f.pages || detectedPagesMap[idx] || 1), 0);
  }, [files, printScope, activeFilePages, detectedPagesMap]);

  const pageRangeStatus = useMemo(
    () => parsePageRangeResult(draftSettings.pageRange, printScope === 'current' ? activeFilePages : 0),
    [draftSettings.pageRange, printScope, activeFilePages]
  );

  const effectivePagesPerSet = draftSettings.pageRange.trim()
    ? pageRangeStatus.count * (printScope === 'all' && files.length > 1 ? files.length : 1)
    : totalScopeRawPages;

  const physicalSheetsPerSet = draftSettings.isDoubleSided
    ? Math.ceil(effectivePagesPerSet / 2)
    : effectivePagesPerSet;
  const totalPhysicalSheets = physicalSheetsPerSet * draftSettings.copies;
  const totalPrintedSides = effectivePagesPerSet * draftSettings.copies;

  // Pricing calculation from shop settings
  const bwRate = shop?.settings?.bwRate ?? 2;
  const colorRate = shop?.settings?.colorRate ?? 10;
  const duplexDiscount = shop?.settings?.doubleSidedDiscount ?? 0;
  const baseUnitRate = draftSettings.colorMode === 'COLOR' ? colorRate : bwRate;
  const effectiveUnitRate = Math.max(
    0.5,
    draftSettings.isDoubleSided ? baseUnitRate - duplexDiscount : baseUnitRate
  );
  const estimatedCost = totalPrintedSides * effectiveUnitRate;

  const isSettingsDirty = useMemo(() => {
    return (
      draftSettings.colorMode !== savedSettings.colorMode ||
      draftSettings.copies !== savedSettings.copies ||
      draftSettings.isDoubleSided !== savedSettings.isDoubleSided ||
      draftSettings.paperSize !== savedSettings.paperSize ||
      draftSettings.orientation !== savedSettings.orientation ||
      draftSettings.margin !== savedSettings.margin ||
      draftSettings.fitMode !== savedSettings.fitMode ||
      draftSettings.duplexEdge !== savedSettings.duplexEdge ||
      draftSettings.pageRange.trim() !== savedSettings.pageRange.trim()
    );
  }, [draftSettings, savedSettings]);

  const paperSpec = PAPER_SPECS[(draftSettings.paperSize as PaperSizeKey) || 'A4'] || PAPER_SPECS.A4;
  const zoomPercent = ZOOM_STEPS[zoomIndex] || 100;

  // Compute effective image print DPI on selected paper size
  const effectiveImageDpi = useMemo(() => {
    if (!isImage || !imageNaturalSize) return null;
    const sheetWidthIn =
      draftSettings.orientation === 'landscape' ? paperSpec.heightInches : paperSpec.widthInches;
    const sheetHeightIn =
      draftSettings.orientation === 'landscape' ? paperSpec.widthInches : paperSpec.heightInches;
    const rotated = rotation === 90 || rotation === 270;
    const pxW = rotated ? imageNaturalSize.height : imageNaturalSize.width;
    const pxH = rotated ? imageNaturalSize.width : imageNaturalSize.height;
    const dpiX = pxW / sheetWidthIn;
    const dpiY = pxH / sheetHeightIn;
    return Math.round(Math.min(dpiX, dpiY));
  }, [isImage, imageNaturalSize, draftSettings.orientation, paperSpec, rotation]);

  if (!isOpen) return null;

  const buildPersistableSettings = (): PrintSettings => ({
    colorMode: draftSettings.colorMode,
    copies: Math.max(1, draftSettings.copies),
    isDoubleSided: draftSettings.isDoubleSided,
    paperSize: draftSettings.paperSize,
    orientation: draftSettings.orientation,
    margin: draftSettings.margin,
    fitMode: draftSettings.fitMode,
    duplexEdge: draftSettings.duplexEdge,
    pageRange: draftSettings.pageRange.trim() || undefined,
    notes: draftSettings.notes || undefined
  });

  const handleSaveSettingsOnly = async () => {
    if (!pageRangeStatus.valid) {
      setFeedbackBanner({
        type: 'error',
        text: pageRangeStatus.error || 'Fix the page range before saving settings.'
      });
      return;
    }

    setIsSavingSettings(true);
    setFeedbackBanner(null);
    try {
      const nextSettings = buildPersistableSettings();
      await updateJobSettings(job.id, nextSettings);
      const updatedNormalized = buildDefaultSettings(nextSettings);
      setSavedSettings(updatedNormalized);
      setDraftSettings(updatedNormalized);
      const updatedJob: PrintJob = {
        ...job,
        status: currentStatus,
        settings: nextSettings,
        updatedAt: new Date().toISOString()
      };
      onJobUpdated?.(updatedJob);
      setFeedbackBanner({
        type: 'success',
        text: 'Print settings saved to job record.'
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Could not save print settings.'
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleFinalizeAndPrint = async () => {
    if (files.length === 0) return;
    if (!pageRangeStatus.valid) {
      setFeedbackBanner({
        type: 'error',
        text: pageRangeStatus.error || 'Invalid page range format.'
      });
      return;
    }

    setIsSpoolingPrint(true);
    setFeedbackBanner(null);

    try {
      const nextSettings = buildPersistableSettings();
      await updateJobSettings(job.id, nextSettings);
      const updatedNormalized = buildDefaultSettings(nextSettings);
      setSavedSettings(updatedNormalized);

      const printOptions = {
        colorMode: nextSettings.colorMode,
        copies: nextSettings.copies,
        paperSize: nextSettings.paperSize,
        orientation: nextSettings.orientation,
        isDoubleSided: nextSettings.isDoubleSided,
        duplexEdge: nextSettings.duplexEdge,
        margin: nextSettings.margin,
        fitMode: nextSettings.fitMode,
        rotation,
        pageRange: nextSettings.pageRange
      };

      if (printScope === 'all' && files.length > 1) {
        const targets = files.map((f, idx) => ({
          url: f.downloadUrl,
          name: getAttachmentName(f, idx),
          type: getAttachmentType(f),
          storagePath: f.storagePath
        }));
        await printMultipleDocumentFiles(targets, printOptions);
      } else if (activeFile) {
        await printDocumentFile(
          activeFile.downloadUrl,
          activeFileName,
          printOptions,
          activeFileType,
          activeFile.storagePath
        );
      }

      let nextStatus: JobStatus = currentStatus;
      if (currentStatus === 'WAITING' || currentStatus === 'REVIEWING') {
        await updateJobStatus(job.id, 'PRINTING');
        nextStatus = 'PRINTING';
        setCurrentStatus('PRINTING');
      }

      const updatedJob: PrintJob = {
        ...job,
        status: nextStatus,
        settings: nextSettings,
        updatedAt: new Date().toISOString()
      };
      onJobUpdated?.(updatedJob);

      setFeedbackBanner({
        type: 'success',
        text:
          printScope === 'all' && files.length > 1
            ? `Spooled all ${files.length} documents with verified settings.`
            : `Spooled "${activeFileName}" to counter printer.`
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Failed to finalize and spool print job.'
      });
    } finally {
      setIsSpoolingPrint(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (currentStatus !== 'PRINTING') return;
    setIsMarkingComplete(true);
    setFeedbackBanner(null);
    try {
      await updateJobStatus(job.id, 'PRINTED');
      setCurrentStatus('PRINTED');
      const updatedJob: PrintJob = {
        ...job,
        status: 'PRINTED',
        settings: buildPersistableSettings(),
        updatedAt: new Date().toISOString()
      };
      onJobUpdated?.(updatedJob);
      setFeedbackBanner({
        type: 'success',
        text: 'Job marked as Printed and ready for customer pickup.'
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Could not mark job as completed.'
      });
    } finally {
      setIsMarkingComplete(false);
    }
  };

  // Tailwind layout helpers for calibrated sheet
  const sheetAspectClass =
    draftSettings.orientation === 'landscape'
      ? paperSpec.landscapeAspectClass
      : paperSpec.portraitAspectClass;

  const sheetWidthClass =
    draftSettings.orientation === 'landscape'
      ? LANDSCAPE_WIDTH_BY_ZOOM[zoomPercent] || 'w-[600px]'
      : PORTRAIT_WIDTH_BY_ZOOM[zoomPercent] || 'w-[450px]';

  const marginPaddingClass =
    draftSettings.margin === 'none'
      ? 'p-0'
      : draftSettings.margin === 'narrow'
      ? 'p-[3%]'
      : 'p-[6%]';

  const marginGuideInsetClass =
    draftSettings.margin === 'narrow' ? 'inset-[3%]' : 'inset-[6%]';

  const rotationClass =
    rotation === 90
      ? 'rotate-90'
      : rotation === 180
      ? 'rotate-180'
      : rotation === 270
      ? '-rotate-90'
      : 'rotate-0';

  const imageFitClass =
    draftSettings.fitMode === 'fill'
      ? 'w-full h-full object-cover'
      : draftSettings.fitMode === 'actual'
      ? 'max-w-none max-h-none object-none'
      : 'w-full h-full object-contain';

  const grayscaleFilterClass =
    draftSettings.colorMode === 'BW' ? 'grayscale contrast-125' : 'grayscale-0';

  // Duplex binding spine edge position
  const bindingEdgePosition = (() => {
    if (!draftSettings.isDoubleSided) return null;
    if (draftSettings.duplexEdge === 'short') {
      return duplexFace === 'front' ? 'top' : 'bottom';
    }
    return duplexFace === 'front' ? 'left' : 'right';
  })();

  const marginLabelText =
    draftSettings.margin === 'none'
      ? 'Borderless (0 mm)'
      : draftSettings.margin === 'narrow'
      ? 'Narrow (6.35 mm)'
      : 'Normal (12.7 mm)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-print-preview-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-7xl h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  id="shop-print-preview-title"
                  className="text-base font-bold text-slate-900 tracking-tight whitespace-nowrap"
                >
                  Print Preview & Job Verification
                </h2>
                <TokenBadge token={job.token} className="text-xs py-0.5 px-2 tabular-nums" />
                <StatusBadge status={currentStatus} />
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5 tabular-nums">
                {job.customerName || 'Walk-in Customer'} · {files.length}{' '}
                {files.length === 1 ? 'document' : 'documents'} · Inspect layout and confirm counter settings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeFile && activeDownloadUrl && (
              <a
                href={activeDownloadUrl}
                download={activeFileName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                title="Download original file"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Download File</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close print preview"
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Split Workspace */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT STAGE: Document Content & Calibrated Sheet */}
          <div className="lg:col-span-8 flex flex-col min-h-[380px] lg:min-h-0 bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-hidden">
            {/* Stage Toolbar */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Document Selector */}
              <div className="flex items-center gap-2 min-w-0">
                {files.length > 1 && (
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1))
                      }
                      className="p-1 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
                      title="Previous document (Left Arrow)"
                      aria-label="Previous document"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                      {activeFileIndex + 1} / {files.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveFileIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0))
                      }
                      className="p-1 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
                      title="Next document (Right Arrow)"
                      aria-label="Next document"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {files.length > 1 ? (
                  <select
                    aria-label="Select document to preview"
                    value={activeFileIndex}
                    onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                    className="max-w-[220px] sm:max-w-[280px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 truncate"
                  >
                    {files.map((f, idx) => (
                      <option key={idx} value={idx}>
                        {idx + 1}. {getAttachmentName(f, idx)} ({formatFileSize(getAttachmentSize(f))})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-slate-900 truncate max-w-[260px]">
                      {activeFileName}
                    </span>
                    <span className="text-slate-400 shrink-0 tabular-nums">
                      · {formatFileSize(activeFileSize)}
                    </span>
                  </div>
                )}
              </div>

              {/* Viewport & Inspection Controls */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* PDF Mode Switcher */}
                {isPdf && (
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPdfViewMode('sheet')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                        pdfViewMode === 'sheet'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Minimize2 className="w-3 h-3" />
                      <span>Paper Sheet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfViewMode('reader')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                        pdfViewMode === 'reader'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>All Pages</span>
                    </button>
                  </div>
                )}

                {/* Zoom Controls (applicable in sheet mode) */}
                {(!isPdf || pdfViewMode === 'sheet') && (
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
                    <button
                      type="button"
                      disabled={zoomIndex === 0}
                      onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
                      className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      title="Zoom out (-)"
                      aria-label="Zoom out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomIndex(2)}
                      className="px-2 py-1 text-xs font-mono font-semibold text-slate-700 hover:bg-slate-50 tabular-nums whitespace-nowrap"
                      title="Reset zoom to 100%"
                    >
                      {zoomPercent}%
                    </button>
                    <button
                      type="button"
                      disabled={zoomIndex === ZOOM_STEPS.length - 1}
                      onClick={() => setZoomIndex((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
                      className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      title="Zoom in (+)"
                      aria-label="Zoom in"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Rotate 90 deg for images */}
                {isImage && (
                  <button
                    type="button"
                    onClick={() =>
                      setRotation((prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      rotation !== 0
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Rotate image 90° clockwise"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{rotation}°</span>
                  </button>
                )}

                {/* Safe Margin Guide Toggle */}
                {(!isPdf || pdfViewMode === 'sheet') && (
                  <button
                    type="button"
                    onClick={() => setShowMarginGuides((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      showMarginGuides
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Toggle printable safe area guides"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Margins</span>
                  </button>
                )}

                {/* Duplex Front / Back Flip Simulator */}
                {draftSettings.isDoubleSided && (!isPdf || pdfViewMode === 'sheet') && (
                  <button
                    type="button"
                    onClick={() => setDuplexFace((f) => (f === 'front' ? 'back' : 'front'))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap shrink-0"
                    title="Inspect duplex front vs back binding edge"
                  >
                    {draftSettings.duplexEdge === 'short' ? (
                      <FlipVertical className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <FlipHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{duplexFace === 'front' ? 'Front Side' : 'Back Side'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Stage Viewport */}
            <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 flex items-center justify-center relative">
              {files.length === 0 || !activeFile ? (
                <div className="p-8 rounded-xl bg-white border border-slate-200 text-center space-y-2 max-w-sm">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800">No files attached to this job</p>
                  <p className="text-xs text-slate-500">
                    Ask the customer to upload their document via the counter QR session.
                  </p>
                </div>
              ) : isPdf && pdfViewMode === 'reader' ? (
                /* Full-Stage Multi-Page PDF Reader */
                <div
                  className={`w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-slate-300 bg-white shadow-sm relative ${grayscaleFilterClass}`}
                >
                  {pdfLoading ? (
                    <div className="w-full h-full flex items-center justify-center text-xs font-medium text-slate-500">
                      Loading multi-page PDF document...
                    </div>
                  ) : (
                    <iframe
                      src={`${pdfBlobUrl || activeFileUrl}#toolbar=1&navpanes=0&view=FitH`}
                      title={`Full PDF Preview - ${activeFileName}`}
                      className="w-full h-full border-0 bg-white"
                    />
                  )}
                </div>
              ) : (
                /* Calibrated Physical Paper Sheet Stage */
                <div className="my-auto flex flex-col items-center">
                  <div
                    className={`${sheetWidthClass} ${sheetAspectClass} bg-white shadow-xl ring-1 ring-slate-300 relative overflow-hidden transition-all duration-200 select-none flex items-center justify-center`}
                  >
                    {/* Duplex Binding Spine Markers */}
                    {bindingEdgePosition === 'left' && (
                      <div className="absolute inset-y-0 left-0 w-2 bg-slate-200/80 border-r border-slate-300 z-20 flex flex-col justify-evenly items-center pointer-events-none">
                        <span className="w-1 h-3 rounded-full bg-slate-400" />
                        <span className="w-1 h-3 rounded-full bg-slate-400" />
                        <span className="w-1 h-3 rounded-full bg-slate-400" />
                      </div>
                    )}
                    {bindingEdgePosition === 'right' && (
                      <div className="absolute inset-y-0 right-0 w-2 bg-slate-200/80 border-l border-slate-300 z-20 flex flex-col justify-evenly items-center pointer-events-none">
                        <span className="w-1 h-3 rounded-full bg-slate-400" />
                        <span className="w-1 h-3 rounded-full bg-slate-400" />
                        <span className="w-1 h-3 rounded-full bg-slate-400" />
                      </div>
                    )}
                    {bindingEdgePosition === 'top' && (
                      <div className="absolute inset-x-0 top-0 h-2 bg-slate-200/80 border-b border-slate-300 z-20 flex justify-evenly items-center pointer-events-none">
                        <span className="h-1 w-3 rounded-full bg-slate-400" />
                        <span className="h-1 w-3 rounded-full bg-slate-400" />
                        <span className="h-1 w-3 rounded-full bg-slate-400" />
                      </div>
                    )}
                    {bindingEdgePosition === 'bottom' && (
                      <div className="absolute inset-x-0 bottom-0 h-2 bg-slate-200/80 border-t border-slate-300 z-20 flex justify-evenly items-center pointer-events-none">
                        <span className="h-1 w-3 rounded-full bg-slate-400" />
                        <span className="h-1 w-3 rounded-full bg-slate-400" />
                        <span className="h-1 w-3 rounded-full bg-slate-400" />
                      </div>
                    )}

                    {/* Printable Safe Area Dashed Guide */}
                    {showMarginGuides && draftSettings.margin !== 'none' && (
                      <div
                        className={`absolute ${marginGuideInsetClass} border border-dashed border-emerald-500/70 pointer-events-none z-20`}
                      >
                        <span className="absolute top-1 right-1.5 text-[9px] font-mono text-emerald-700 bg-white/90 px-1 rounded">
                          Safe Printable Area
                        </span>
                      </div>
                    )}

                    {/* Sheet Inner Content */}
                    <div
                      className={`w-full h-full ${marginPaddingClass} flex items-center justify-center overflow-hidden ${grayscaleFilterClass}`}
                    >
                      {previewLoadError ? (
                        <div className="p-6 text-center space-y-2">
                          <AlertTriangle className="w-7 h-7 text-amber-500 mx-auto" />
                          <p className="text-xs font-semibold text-slate-800">
                            Preview could not be rendered inline
                          </p>
                          <a
                            href={activeDownloadUrl}
                            download={activeFileName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download File to Inspect</span>
                          </a>
                        </div>
                      ) : isImage ? (
                        <img
                          src={activeFileUrl}
                          alt={activeFileName}
                          referrerPolicy="no-referrer"
                          onLoad={(e) => {
                            const target = e.currentTarget;
                            if (target.naturalWidth && target.naturalHeight) {
                              setImageNaturalSize({
                                width: target.naturalWidth,
                                height: target.naturalHeight
                              });
                            }
                          }}
                          onError={() => setPreviewLoadError(true)}
                          className={`${imageFitClass} ${rotationClass} transition-transform duration-200`}
                        />
                      ) : isPdf ? (
                        pdfLoading ? (
                          <div className="text-xs text-slate-500 font-medium">
                            Rendering calibrated PDF sheet...
                          </div>
                        ) : (
                          <iframe
                            src={`${pdfBlobUrl || activeFileUrl}#toolbar=0&navpanes=0&scrollbar=1&view=Fit`}
                            title={`Sheet Preview - ${activeFileName}`}
                            className="w-full h-full border-0 bg-white"
                          />
                        )
                      ) : isText ? (
                        textLoading ? (
                          <div className="text-xs text-slate-500 font-medium">Loading text content...</div>
                        ) : (
                          <div className="w-full h-full overflow-auto text-left p-2 bg-white">
                            <pre className="text-[11px] leading-relaxed font-mono text-slate-800 whitespace-pre-wrap break-words">
                              {textPreviewContent || '(Empty document)'}
                            </pre>
                          </div>
                        )
                      ) : (
                        <div className="p-6 text-center space-y-3 max-w-xs">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center mx-auto font-bold text-xs uppercase">
                            {activeFileName.split('.').pop()?.slice(0, 4) || 'DOC'}
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-900 break-all">{activeFileName}</p>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Native Office / binary format ({formatFileSize(activeFileSize)}). Download to inspect formatting in desktop viewer if required.
                            </p>
                          </div>
                          {activeDownloadUrl && (
                            <a
                              href={activeDownloadUrl}
                              download={activeFileName}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Original</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Stage Telemetry Bar (Unboxed metadata separated by middots) */}
            <div className="px-4 py-2 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 shrink-0 tabular-nums">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="font-semibold text-slate-800">
                  {paperSpec.label} {draftSettings.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
                </span>
                <span className="text-slate-300">·</span>
                <span>{paperSpec.dimensionsMm}</span>
                <span className="text-slate-300">·</span>
                <span>{marginLabelText}</span>
                <span className="text-slate-300">·</span>
                <span>{draftSettings.colorMode === 'COLOR' ? 'Full Color' : 'Black & White'}</span>
                {draftSettings.pageRange.trim() && pageRangeStatus.valid && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-semibold text-emerald-700">
                      Pages {draftSettings.pageRange.trim()}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isPdf && (
                  <span className="text-slate-600">
                    <BookOpen className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                    {activeFilePages} {activeFilePages === 1 ? 'page' : 'pages'} detected
                  </span>
                )}
                {isImage && imageNaturalSize && (
                  <span
                    className={
                      effectiveImageDpi !== null && effectiveImageDpi < 120
                        ? 'text-amber-700 font-semibold flex items-center gap-1'
                        : 'text-slate-500'
                    }
                  >
                    {effectiveImageDpi !== null && effectiveImageDpi < 120 && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 inline" />
                    )}
                    {imageNaturalSize.width} × {imageNaturalSize.height} px
                    {effectiveImageDpi !== null ? ` · ~${effectiveImageDpi} DPI` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Settings Verification, Overrides & Finalize */}
          <div className="lg:col-span-4 flex flex-col min-h-0 bg-white overflow-y-auto">
            <div className="p-4 sm:p-5 space-y-4 flex-1">
              {/* Customer Instructions Notice */}
              {draftSettings.notes && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Customer Note
                  </div>
                  <p className="text-xs text-amber-950 leading-relaxed whitespace-pre-wrap">
                    "{draftSettings.notes}"
                  </p>
                </div>
              )}

              {/* Settings Header & Reset/Save Actions */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Print Configuration
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isSettingsDirty
                      ? 'Modified by staff — save or print to apply'
                      : 'Matches saved job specifications'}
                  </p>
                </div>

                {isSettingsDirty && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftSettings(savedSettings);
                        setFeedbackBanner(null);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                      title="Revert to saved settings"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSavingSettings}
                      onClick={handleSaveSettingsOnly}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      <span>{isSavingSettings ? 'Saving...' : 'Save'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Color Mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Color Output</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftSettings((s) => ({ ...s, colorMode: 'BW' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                      draftSettings.colorMode === 'BW'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Black & White
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftSettings((s) => ({ ...s, colorMode: 'COLOR' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                      draftSettings.colorMode === 'COLOR'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Full Color
                  </button>
                </div>
              </div>

              {/* Paper Size & Orientation */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="preview-paper-size" className="block text-xs font-semibold text-slate-700">
                    Paper Size
                  </label>
                  <select
                    id="preview-paper-size"
                    value={draftSettings.paperSize}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        paperSize: e.target.value as PaperSizeKey
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="A3">A3 (297 × 420 mm)</option>
                    <option value="Letter">Letter (8.5 × 11 in)</option>
                    <option value="Legal">Legal (8.5 × 14 in)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Orientation</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDraftSettings((s) => ({ ...s, orientation: 'portrait' }))}
                      className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                        draftSettings.orientation === 'portrait'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Portrait
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftSettings((s) => ({ ...s, orientation: 'landscape' }))}
                      className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                        draftSettings.orientation === 'landscape'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Landscape
                    </button>
                  </div>
                </div>
              </div>

              {/* Copies & Page Range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="preview-copies" className="block text-xs font-semibold text-slate-700">
                    Copies
                  </label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((s) => ({ ...s, copies: Math.max(1, s.copies - 1) }))
                      }
                      className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                      aria-label="Decrease copies"
                    >
                      −
                    </button>
                    <input
                      id="preview-copies"
                      type="number"
                      min={1}
                      max={999}
                      value={draftSettings.copies}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setDraftSettings((s) => ({
                          ...s,
                          copies: Number.isNaN(val) ? 1 : Math.min(999, Math.max(1, val))
                        }));
                      }}
                      className="w-full text-center text-xs font-bold text-slate-900 py-2 focus:outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((s) => ({ ...s, copies: Math.min(999, s.copies + 1) }))
                      }
                      className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                      aria-label="Increase copies"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="preview-page-range" className="block text-xs font-semibold text-slate-700">
                    Page Range
                  </label>
                  <input
                    id="preview-page-range"
                    type="text"
                    placeholder="All (e.g. 1-5, 8)"
                    value={draftSettings.pageRange}
                    onChange={(e) =>
                      setDraftSettings((s) => ({ ...s, pageRange: e.target.value }))
                    }
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none tabular-nums ${
                      !pageRangeStatus.valid
                        ? 'border-rose-400 focus:border-rose-500 bg-rose-50/40'
                        : 'border-slate-200 focus:border-emerald-600 bg-white'
                    }`}
                  />
                </div>
              </div>
              {!pageRangeStatus.valid && pageRangeStatus.error && (
                <p className="text-[11px] text-rose-600 font-medium -mt-2">{pageRangeStatus.error}</p>
              )}

              {/* Duplex (Sides) & Binding Edge */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Sides (Duplex)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftSettings((s) => ({ ...s, isDoubleSided: false }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                      !draftSettings.isDoubleSided
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    1-Sided (Single)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftSettings((s) => ({ ...s, isDoubleSided: true }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                      draftSettings.isDoubleSided
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    2-Sided (Duplex)
                  </button>
                </div>

                {draftSettings.isDoubleSided && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDraftSettings((s) => ({ ...s, duplexEdge: 'long' }))}
                      className={`py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        draftSettings.duplexEdge === 'long'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Flip on Long Edge
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftSettings((s) => ({ ...s, duplexEdge: 'short' }))}
                      className={`py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        draftSettings.duplexEdge === 'short'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Flip on Short Edge
                    </button>
                  </div>
                )}
              </div>

              {/* Margins & Content Scaling */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="preview-margin" className="block text-xs font-semibold text-slate-700">
                    Margins
                  </label>
                  <select
                    id="preview-margin"
                    value={draftSettings.margin}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        margin: e.target.value as 'normal' | 'narrow' | 'none'
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="normal">Normal (12.7 mm)</option>
                    <option value="narrow">Narrow (6.35 mm)</option>
                    <option value="none">Borderless (0 mm)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="preview-fit" className="block text-xs font-semibold text-slate-700">
                    Scale / Fit
                  </label>
                  <select
                    id="preview-fit"
                    value={draftSettings.fitMode}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        fitMode: e.target.value as 'fit' | 'fill' | 'actual'
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="fit">Fit to Printable Area</option>
                    <option value="fill">Fill Entire Sheet</option>
                    <option value="actual">Actual Size (100%)</option>
                  </select>
                </div>
              </div>

              {/* Live Hardware Spool & Counter Estimate */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs tabular-nums">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Printed Impressions:</span>
                  <span className="font-semibold text-slate-900">
                    {effectivePagesPerSet} {effectivePagesPerSet === 1 ? 'page' : 'pages'} ×{' '}
                    {draftSettings.copies} {draftSettings.copies === 1 ? 'copy' : 'copies'} ={' '}
                    {totalPrintedSides}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Physical {paperSpec.label} Sheets Required:</span>
                  <span className="font-semibold text-slate-900">
                    {totalPhysicalSheets} {totalPhysicalSheets === 1 ? 'sheet' : 'sheets'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="font-semibold text-slate-700">
                    Counter Estimate (₹{effectiveUnitRate.toFixed(2)}/page):
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700">
                    ₹{estimatedCost.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Sticky Finalize & Hardware Execution Footer */}
            <div className="p-4 border-t border-slate-200 bg-white space-y-3 shrink-0">
              {/* Multi-document scope toggle */}
              {files.length > 1 && (
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPrintScope('all')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                      printScope === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Files ({files.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintScope('current')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      printScope === 'current'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Current File Only
                  </button>
                </div>
              )}

              {/* Verification Lock */}
              {currentStatus !== 'PRINTED' && (
                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none text-xs">
                  <input
                    type="checkbox"
                    checked={verifiedReady}
                    onChange={(e) => setVerifiedReady(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-slate-700 leading-snug">
                    Verified document preview, loaded{' '}
                    <strong className="font-semibold text-slate-900">
                      {paperSpec.label} {draftSettings.orientation}
                    </strong>{' '}
                    tray, and{' '}
                    <strong className="font-semibold text-slate-900">
                      {draftSettings.colorMode === 'COLOR' ? 'Full Color' : 'B&W'}
                    </strong>{' '}
                    mode.
                  </span>
                </label>
              )}

              {/* Inline Feedback Banner */}
              {feedbackBanner && (
                <div
                  className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    feedbackBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  {feedbackBanner.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feedbackBanner.text}</span>
                </div>
              )}

              {/* Execution Action Buttons */}
              <div className="space-y-2">
                {currentStatus !== 'PRINTED' && (
                  <Button
                    variant="primary"
                    size="md"
                    isLoading={isSpoolingPrint}
                    disabled={
                      isSpoolingPrint ||
                      files.length === 0 ||
                      !verifiedReady ||
                      !pageRangeStatus.valid
                    }
                    onClick={handleFinalizeAndPrint}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                  >
                    <Printer className="w-4 h-4 mr-2 shrink-0" />
                    <span>
                      {currentStatus === 'PRINTING'
                        ? 'Re-Send Verified Job to Printer'
                        : printScope === 'all' && files.length > 1
                        ? `Finalize & Print All (${files.length} Files)`
                        : 'Finalize & Print Document'}
                    </span>
                  </Button>
                )}

                {currentStatus === 'PRINTING' && (
                  <Button
                    variant="outline"
                    size="md"
                    isLoading={isMarkingComplete}
                    disabled={isMarkingComplete}
                    onClick={handleMarkCompleted}
                    className="w-full py-2.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-bold whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
                    <span>Mark Job as Completed (Printed)</span>
                  </Button>
                )}

                {currentStatus === 'PRINTED' && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Job Completed — Ready for Customer Collection</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
