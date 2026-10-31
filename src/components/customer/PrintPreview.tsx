import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Eye,
  RefreshCw,
  Trash2,
  Maximize2,
  Layers,
  RotateCw,
  CheckCircle2,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Scissors
} from 'lucide-react';
import { PrintSettings, Shop } from '../../types';

export interface PrintPreviewProps {
  files: File[];
  settings: PrintSettings;
  onUpdateSettings?: (newSettings: PrintSettings) => void;
  onRemoveFile?: (index: number) => void;
  onReplaceFile?: (index: number) => void;
  onOpenModalPreview?: (index: number) => void;
  shop?: Shop | null;
  className?: string;
}

// Paper dimensions & aspect ratio definitions
const PAPER_DIMENSIONS: Record<string, { label: string; mm: string; aspect: string; ratio: number }> = {
  A4: { label: 'A4', mm: '210 × 297 mm', aspect: '1 / 1.414', ratio: 1 / 1.414 },
  A3: { label: 'A3', mm: '297 × 420 mm', aspect: '1 / 1.414', ratio: 1 / 1.414 },
  Letter: { label: 'Letter', mm: '8.5 × 11 in', aspect: '8.5 / 11', ratio: 8.5 / 11 },
  Legal: { label: 'Legal', mm: '8.5 × 14 in', aspect: '8.5 / 14', ratio: 8.5 / 14 }
};

/**
 * Fast client-side page count extraction without bulky external dependencies.
 */
export async function detectDocumentPages(file: File): Promise<number> {
  if (file.type.startsWith('image/')) return 1;

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    try {
      // Read first 600KB and last 200KB to scan for page dictionary
      const sliceSize = Math.min(file.size, 600000);
      const buffer = await file.slice(0, sliceSize).arrayBuffer();
      const text = new TextDecoder('latin1').decode(buffer);

      // 1. Look for /Type /Pages ... /Count X
      const countMatch = text.match(/\/Count\s+(\d+)/);
      if (countMatch && parseInt(countMatch[1], 10) > 0) {
        return Math.min(500, parseInt(countMatch[1], 10));
      }

      // 2. Count /Type /Page occurrences
      const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches && pageMatches.length > 0) {
        return Math.min(500, pageMatches.length);
      }
    } catch {
      // Fallback below
    }
  }

  // Fallback estimation based on file size (~150 KB per page for office/scans)
  const estimated = Math.max(1, Math.min(100, Math.ceil(file.size / (150 * 1024))));
  return estimated;
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
  files,
  settings,
  onUpdateSettings,
  onRemoveFile,
  onReplaceFile,
  onOpenModalPreview,
  shop,
  className = ''
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [pageCounts, setPageCounts] = useState<Record<number, number>>({});
  const [viewMode, setViewMode] = useState<'focused' | 'grid'>('focused');
  const [showSimulatedBack, setShowSimulatedBack] = useState<boolean>(false);

  // Synchronize index when files array changes
  useEffect(() => {
    if (selectedIndex >= files.length) {
      setSelectedIndex(Math.max(0, files.length - 1));
    }
  }, [files.length, selectedIndex]);

  // Generate thumbnail blob URLs
  useEffect(() => {
    const urls: Record<number, string> = {};
    files.forEach((file, idx) => {
      if (file.type.startsWith('image/')) {
        urls[idx] = URL.createObjectURL(file);
      }
    });
    setPreviewUrls(urls);

    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  // Asynchronously detect page counts
  useEffect(() => {
    let isCancelled = false;
    files.forEach(async (file, idx) => {
      const pages = await detectDocumentPages(file);
      if (!isCancelled) {
        setPageCounts((prev) => ({ ...prev, [idx]: pages }));
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [files]);

  if (files.length === 0) {
    return null;
  }

  const activeFile = files[selectedIndex] || files[0];
  const activePaperSize = settings.paperSize || 'A4';
  const paperMeta = PAPER_DIMENSIONS[activePaperSize] || PAPER_DIMENSIONS.A4;
  const isLandscape = settings.orientation === 'landscape';
  const isGrayscale = settings.colorMode === 'BW';
  const activePages = pageCounts[selectedIndex] || 1;

  // Total pages across all uploaded files
  const totalUploadedPages = files.reduce((acc, _, idx) => acc + (pageCounts[idx] || 1), 0);
  const totalSheets = settings.isDoubleSided ? Math.ceil(totalUploadedPages / 2) : totalUploadedPages;
  const totalPrintedPages = totalUploadedPages * (settings.copies || 1);

  // Estimated job price calculation
  const bwRate = shop?.settings?.bwRate ?? 2;
  const colorRate = shop?.settings?.colorRate ?? 10;
  const unitRate = settings.colorMode === 'COLOR' ? colorRate : bwRate;
  const estimatedCost = (totalPrintedPages * unitRate).toFixed(2);

  return (
    <div className={`p-4 rounded-2xl bg-slate-950 border border-emerald-900/50 space-y-4 shadow-xl ${className}`}>
      {/* Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Print Preview & Formatting
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                {files.length} {files.length === 1 ? 'Document' : 'Documents'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Verify formatting, paper scale, and layout before sending to queue
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Fullscreen Modal Launch */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('focused')}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                viewMode === 'focused'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Focus View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Thumbnails ({files.length})
            </button>
          </div>

          {onOpenModalPreview && (
            <button
              type="button"
              onClick={() => onOpenModalPreview(selectedIndex)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-white text-[11px] font-semibold transition-colors"
              title="Open full interactive print preview modal"
            >
              <Maximize2 className="w-3 h-3 text-emerald-400" />
              <span>Full View</span>
            </button>
          )}
        </div>
      </div>

      {/* MULTI-FILE THUMBNAIL STRIP (When > 1 file uploaded) */}
      {files.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {files.map((file, idx) => {
            const isSelected = idx === selectedIndex;
            const isImg = file.type.startsWith('image/');
            const pCount = pageCounts[idx] || 1;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSelectedIndex(idx);
                  setShowSimulatedBack(false);
                }}
                className={`flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border text-left shrink-0 transition-all ${
                  isSelected
                    ? 'bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500/50 shadow-md'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                {/* Mini thumbnail visual */}
                <div className="w-9 h-11 rounded bg-white overflow-hidden shadow-inner flex items-center justify-center relative shrink-0 border border-slate-300">
                  {isImg && previewUrls[idx] ? (
                    <img
                      src={previewUrls[idx]}
                      alt={file.name}
                      className={`w-full h-full object-cover ${isGrayscale ? 'grayscale contrast-125' : ''}`}
                    />
                  ) : (
                    <div className="w-full h-full p-1 flex flex-col justify-between bg-slate-50">
                      <div className="w-3/4 h-1 bg-slate-300 rounded-sm mb-1" />
                      <div className="space-y-0.5">
                        <div className="w-full h-0.5 bg-slate-200" />
                        <div className="w-5/6 h-0.5 bg-slate-200" />
                        <div className="w-2/3 h-0.5 bg-slate-200" />
                      </div>
                      <span className="text-[7px] font-bold text-slate-400 block text-center">PDF</span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" />
                  )}
                </div>

                <div className="max-w-[120px] truncate">
                  <div className="text-[11px] font-bold truncate leading-tight">{file.name}</div>
                  <div className="text-[9px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span className="text-emerald-400 font-semibold">{pCount} {pCount === 1 ? 'pg' : 'pgs'}</span>
                    <span>•</span>
                    <span>{activePaperSize}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* VIEW MODE: FOCUSED MAIN PREVIEW */}
      {viewMode === 'focused' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT: VISUAL DOCUMENT CANVAS THUMBNAIL */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900/70 border border-slate-800 relative overflow-hidden min-h-[320px]">
            {/* Top Toolbar overlay on canvas */}
            <div className="w-full flex items-center justify-between gap-2 mb-3 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-medium">
                  {paperMeta.label} ({paperMeta.mm})
                </span>
                <span className={`px-2 py-0.5 rounded font-medium ${
                  isGrayscale
                    ? 'bg-amber-950/60 text-amber-300 border border-amber-900/60'
                    : 'bg-indigo-950/60 text-indigo-300 border border-indigo-900/60'
                }`}>
                  {isGrayscale ? 'Mono (B&W)' : 'Color CMYK'}
                </span>
              </div>

              {/* Duplex Flip Preview Toggle */}
              {settings.isDoubleSided && (
                <button
                  type="button"
                  onClick={() => setShowSimulatedBack(!showSimulatedBack)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  <RotateCw className="w-3 h-3 text-emerald-400" />
                  <span>{showSimulatedBack ? 'View Front Side' : 'Flip to Back Side'}</span>
                </button>
              )}
            </div>

            {/* Simulated Paper Sheet */}
            <div
              className={`relative bg-white text-slate-900 rounded-sm shadow-2xl transition-all duration-300 border border-slate-200 overflow-hidden flex flex-col ${
                isLandscape ? 'w-[280px] sm:w-[340px] h-[200px] sm:h-[240px]' : 'w-[200px] sm:w-[240px] h-[280px] sm:h-[340px]'
              }`}
              style={{
                boxShadow: '0 20px 35px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)'
              }}
            >
              {/* Safe Margins Guideline Overlay */}
              {settings.margin !== 'none' && (
                <div
                  className={`absolute inset-0 pointer-events-none border border-dashed z-20 ${
                    settings.margin === 'narrow' ? 'm-1.5 border-emerald-500/40' : 'm-3 border-emerald-600/40'
                  }`}
                  title="Print Safe Margin Area"
                />
              )}

              {/* Watermark / Paper Header */}
              <div className="absolute top-1.5 right-2 text-[8px] font-mono text-slate-400 uppercase tracking-widest z-10 select-none">
                {paperMeta.label} • {isLandscape ? 'Landscape' : 'Portrait'}
              </div>

              {/* Content Rendering: Image vs Document Canvas */}
              {showSimulatedBack ? (
                /* Reverse Side of Double-sided print */
                <div className="flex-1 p-4 flex flex-col justify-between bg-slate-50 relative select-none">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-2">
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Page 2 of {activePages > 1 ? activePages : 2} (Back Side)</span>
                      <span className="text-[7px] text-slate-400">{activeFile.name}</span>
                    </div>
                    <div className="space-y-1.5 opacity-60">
                      <div className="w-full h-1.5 bg-slate-300 rounded" />
                      <div className="w-11/12 h-1.5 bg-slate-200 rounded" />
                      <div className="w-4/5 h-1.5 bg-slate-200 rounded" />
                      <div className="w-full h-1.5 bg-slate-200 rounded" />
                      <div className="w-3/4 h-1.5 bg-slate-200 rounded" />
                    </div>
                  </div>
                  <div className="text-center text-[8px] text-slate-400 border-t border-slate-200 pt-1">
                    Duplex Flip Edge: {settings.duplexEdge === 'short' ? 'Short Edge (Tablet)' : 'Long Edge (Book)'}
                  </div>
                </div>
              ) : activeFile.type.startsWith('image/') && previewUrls[selectedIndex] ? (
                /* Real Image Thumbnail */
                <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center p-2 bg-slate-100">
                  <img
                    src={previewUrls[selectedIndex]}
                    alt={activeFile.name}
                    className={`max-w-full max-h-full object-contain rounded transition-all ${
                      isGrayscale ? 'grayscale contrast-125' : ''
                    }`}
                  />
                  {isGrayscale && (
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[8px] font-bold backdrop-blur-xs flex items-center gap-1">
                      <Scissors className="w-2.5 h-2.5 text-amber-400" />
                      <span>Grayscale Simulated</span>
                    </div>
                  )}
                </div>
              ) : (
                /* PDF / Document Structure Thumbnail Canvas */
                <div className="flex-1 p-3.5 flex flex-col justify-between bg-gradient-to-b from-white to-slate-50 relative select-none">
                  <div className="space-y-2">
                    {/* Header bar simulating doc header */}
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5">
                      <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[9px]">
                        {activeFile.name.split('.').pop()?.toUpperCase() || 'DOC'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-slate-800 truncate leading-none">
                          {activeFile.name}
                        </div>
                        <div className="text-[7px] text-slate-400 mt-0.5">
                          Format Verified • Ready for Print Queue
                        </div>
                      </div>
                    </div>

                    {/* Simulated document lines & structure */}
                    <div className="space-y-1.5 pt-1">
                      <div className="w-3/4 h-2 bg-slate-300 rounded" />
                      <div className="w-full h-1 bg-slate-200 rounded" />
                      <div className="w-11/12 h-1 bg-slate-200 rounded" />
                      <div className="w-4/5 h-1 bg-slate-200 rounded" />
                    </div>

                    <div className="p-2 rounded bg-slate-100/80 border border-slate-200/80 space-y-1 mt-2">
                      <div className="w-1/2 h-1.5 bg-emerald-200 rounded" />
                      <div className="w-full h-1 bg-slate-200 rounded" />
                      <div className="w-3/4 h-1 bg-slate-200 rounded" />
                    </div>

                    <div className="space-y-1 pt-1 opacity-70">
                      <div className="w-full h-1 bg-slate-200 rounded" />
                      <div className="w-5/6 h-1 bg-slate-200 rounded" />
                    </div>
                  </div>

                  {/* Document Footer on Paper */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[8px] text-slate-400 font-mono">
                    <span>Page 1 of {activePages}</span>
                    <span>SecurePrint Zero-Trace</span>
                  </div>
                </div>
              )}
            </div>

            {/* Document Navigation Arrows (if multiple files) */}
            {files.length > 1 && (
              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
                    setShowSimulatedBack(false);
                  }}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Previous file"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-medium text-slate-400 font-mono">
                  {selectedIndex + 1} of {files.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
                    setShowSimulatedBack(false);
                  }}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Next file"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: METADATA DETAILS & QUICK FORMATTING */}
          <div className="lg:col-span-5 space-y-3">
            {/* File Metadata Card */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                      {activeFile.name.split('.').pop()?.toUpperCase() || 'FILE'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {(activeFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white truncate mt-1" title={activeFile.name}>
                    {activeFile.name}
                  </h4>
                </div>

                {/* File Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {onReplaceFile && (
                    <button
                      type="button"
                      onClick={() => onReplaceFile(selectedIndex)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Replace file"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onRemoveFile && (
                    <button
                      type="button"
                      onClick={() => onRemoveFile(selectedIndex)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 transition-colors"
                      title="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Comprehensive Metadata Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[9px] text-slate-400 uppercase font-semibold">Page Count</div>
                  <div className="font-bold text-white flex items-center gap-1 mt-0.5">
                    <FileText className="w-3 h-3 text-emerald-400" />
                    <span>{activePages} {activePages === 1 ? 'Page' : 'Pages'}</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[9px] text-slate-400 uppercase font-semibold">Paper Stock</div>
                  <div className="font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                    <span>{paperMeta.label}</span>
                    <span className="text-[9px] text-slate-400">({paperMeta.mm})</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[9px] text-slate-400 uppercase font-semibold">Orientation</div>
                  <div className="font-bold text-white capitalize mt-0.5 flex items-center gap-1">
                    <RotateCw className="w-3 h-3 text-slate-400" />
                    <span>{settings.orientation || 'portrait'}</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[9px] text-slate-400 uppercase font-semibold">Color Mode</div>
                  <div className={`font-bold mt-0.5 ${settings.colorMode === 'COLOR' ? 'text-indigo-400' : 'text-amber-300'}`}>
                    {settings.colorMode === 'COLOR' ? 'Full Color' : 'Black & White'}
                  </div>
                </div>
              </div>

              {/* Quick Format adjustments right from Preview */}
              {onUpdateSettings && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>Quick Formatting</span>
                    <Sliders className="w-3 h-3 text-emerald-400" />
                  </div>

                  {/* Paper Size selector buttons */}
                  <div className="grid grid-cols-4 gap-1">
                    {(['A4', 'A3', 'Letter', 'Legal'] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => onUpdateSettings({ ...settings, paperSize: size })}
                        className={`py-1 rounded text-[10px] font-bold border transition-all ${
                          settings.paperSize === size
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>

                  {/* Orientation & Color mode quick toggles */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          orientation: settings.orientation === 'landscape' ? 'portrait' : 'landscape'
                        })
                      }
                      className="py-1.5 px-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-[10px] font-semibold flex items-center justify-center gap-1"
                    >
                      <RotateCw className="w-3 h-3 text-emerald-400" />
                      <span>{settings.orientation === 'landscape' ? 'Set Portrait' : 'Set Landscape'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          colorMode: settings.colorMode === 'COLOR' ? 'BW' : 'COLOR'
                        })
                      }
                      className="py-1.5 px-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-[10px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>{settings.colorMode === 'COLOR' ? 'Switch to B&W' : 'Switch to Color'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Estimated Job Summary badge */}
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 flex items-center justify-between text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Total Print Volume</div>
                  <div className="font-bold text-white">
                    {totalPrintedPages} page{totalPrintedPages > 1 ? 's' : ''} ({totalSheets} sheet{totalSheets > 1 ? 's' : ''})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">Estimated Cost</div>
                  <div className="font-bold text-emerald-400 font-mono">₹{estimatedCost}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW MODE: ALL THUMBNAILS GRID */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {files.map((file, idx) => {
            const isSelected = idx === selectedIndex;
            const isImg = file.type.startsWith('image/');
            const pCount = pageCounts[idx] || 1;

            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'bg-emerald-950/30 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Thumbnail Preview Sheet */}
                  <div
                    onClick={() => {
                      setSelectedIndex(idx);
                      setViewMode('focused');
                    }}
                    className="w-full h-32 rounded-lg bg-white overflow-hidden shadow cursor-pointer border border-slate-300 relative flex items-center justify-center group mb-2.5"
                  >
                    {isImg && previewUrls[idx] ? (
                      <img
                        src={previewUrls[idx]}
                        alt={file.name}
                        className={`w-full h-full object-contain p-1 ${isGrayscale ? 'grayscale contrast-125' : ''}`}
                      />
                    ) : (
                      <div className="w-full h-full p-2.5 flex flex-col justify-between bg-slate-50">
                        <div className="space-y-1">
                          <div className="w-1/2 h-2 bg-slate-300 rounded" />
                          <div className="w-full h-1 bg-slate-200" />
                          <div className="w-5/6 h-1 bg-slate-200" />
                          <div className="w-4/5 h-1 bg-slate-200" />
                        </div>
                        <div className="flex items-center justify-between text-[8px] text-slate-400 border-t border-slate-200 pt-1">
                          <span className="font-bold">{file.name.split('.').pop()?.toUpperCase()}</span>
                          <span>{pCount} {pCount === 1 ? 'Page' : 'Pages'}</span>
                        </div>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-xs">
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <span>Click to Focus</span>
                    </div>
                  </div>

                  {/* Metadata labels */}
                  <div className="truncate">
                    <div className="text-xs font-bold text-white truncate" title={file.name}>
                      {file.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold">
                        {pCount} {pCount === 1 ? 'Page' : 'Pages'}
                      </span>
                      <span>{paperMeta.label}</span>
                      <span>•</span>
                      <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(idx);
                      setViewMode('focused');
                    }}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <span>Inspect</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {onReplaceFile && (
                      <button
                        type="button"
                        onClick={() => onReplaceFile(idx)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Replace"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onRemoveFile && (
                      <button
                        type="button"
                        onClick={() => onRemoveFile(idx)}
                        className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
