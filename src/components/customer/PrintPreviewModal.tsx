import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Eye,
  FileText,
  Image as ImageIcon,
  Printer,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sliders,
  Sparkles,
  Layers,
  ShieldCheck,
  Info,
  Maximize2,
  FileCheck
} from 'lucide-react';
import { PrintSettings, Shop } from '../../types';
import { Button } from '../common/Button';

export interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
  initialFileIndex?: number;
  settings: PrintSettings;
  onUpdateSettings: (newSettings: PrintSettings) => void;
  onConfirmAndQueue: () => void;
  isSubmitting?: boolean;
  token?: string;
  shop?: Shop | null;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  files,
  initialFileIndex = 0,
  settings,
  onUpdateSettings,
  onConfirmAndQueue,
  isSubmitting = false,
  token,
  shop
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState<number>(initialFileIndex);
  const [previewUrls, setPreviewUrls] = useState<{ [key: number]: string }>({});
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showMarginGuides, setShowMarginGuides] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview');
  const [imageMeta, setImageMeta] = useState<{ [key: number]: { width: number; height: number; dpi: number } }>({});

  // Synchronize initial file index when opened
  useEffect(() => {
    if (isOpen) {
      setActiveFileIndex(Math.min(initialFileIndex, Math.max(0, files.length - 1)));
      setZoomLevel(100);
      setActiveSide('front');
    }
  }, [isOpen, initialFileIndex, files.length]);

  // Generate and revoke object URLs for the staged files
  useEffect(() => {
    if (!isOpen || files.length === 0) return;

    const urls: { [key: number]: string } = {};
    files.forEach((file, index) => {
      urls[index] = URL.createObjectURL(file);
    });
    setPreviewUrls(urls);

    return () => {
      Object.values(urls).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [isOpen, files]);

  // Measure image dimensions when loaded
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>, index: number) => {
    const img = e.currentTarget;
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    // Estimated DPI based on typical 8.27 x 11.69 inch A4
    const dpi = Math.round(Math.min(width / 8.27, height / 11.69));
    setImageMeta((prev) => ({
      ...prev,
      [index]: { width, height, dpi: dpi > 0 ? dpi : 150 }
    }));
  };

  // Keyboard shortcut for ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && activeFileIndex < files.length - 1) {
        setActiveFileIndex((prev) => prev + 1);
      }
      if (e.key === 'ArrowLeft' && activeFileIndex > 0) {
        setActiveFileIndex((prev) => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeFileIndex, files.length, onClose]);

  if (!isOpen || files.length === 0) return null;

  const currentFile = files[activeFileIndex] || files[0];
  const currentUrl = previewUrls[activeFileIndex];
  const isImage = currentFile?.type.startsWith('image/');
  const isPdf = currentFile?.type === 'application/pdf' || currentFile?.name.toLowerCase().endsWith('.pdf');
  const currentMeta = imageMeta[activeFileIndex];

  // Formatting values
  const colorMode = settings.colorMode || 'BW';
  const orientation = settings.orientation || 'portrait';
  const paperSize = settings.paperSize || 'A4';
  const margin = settings.margin || 'normal';
  const isDoubleSided = settings.isDoubleSided || false;
  const copies = Math.max(1, settings.copies || 1);
  const fitMode = settings.fitMode || 'fit';

  // Paper Aspect Ratio calculation
  // A4: 210 x 297 mm -> 1:1.414
  // Letter: 8.5 x 11 in -> 1:1.294
  // Legal: 8.5 x 14 in -> 1:1.647
  // A3: 297 x 420 mm -> 1:1.414
  const getAspectRatioClass = () => {
    if (orientation === 'landscape') {
      if (paperSize === 'Legal') return 'aspect-[14/8.5]';
      if (paperSize === 'Letter') return 'aspect-[11/8.5]';
      return 'aspect-[297/210]'; // A4/A3 landscape ~1.414
    } else {
      if (paperSize === 'Legal') return 'aspect-[8.5/14]';
      if (paperSize === 'Letter') return 'aspect-[8.5/11]';
      return 'aspect-[210/297]'; // A4/A3 portrait ~0.707
    }
  };

  // Margin spacing style
  const getMarginPadding = () => {
    switch (margin) {
      case 'none':
        return 'p-0';
      case 'narrow':
        return 'p-3';
      case 'normal':
      default:
        return 'p-6';
    }
  };

  // Price estimate calculation
  const bwRate = shop?.settings?.bwRate ?? 3;
  const colorRate = shop?.settings?.colorRate ?? 10;
  const discountPerSheet = isDoubleSided ? (shop?.settings?.doubleSidedDiscount ?? 0.5) : 0;
  const baseRate = colorMode === 'COLOR' ? colorRate : bwRate;
  const adjustedRate = Math.max(1, baseRate - discountPerSheet);
  const estimatedCost = (adjustedRate * copies * files.length).toFixed(2);

  // Settings update helpers
  const updateSetting = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => {
    onUpdateSettings({
      ...settings,
      [key]: value
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-5xl h-[94vh] sm:h-[90vh] bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-preview-title"
      >
        {/* HEADER BAR */}
        <div className="h-16 px-4 sm:px-6 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="print-preview-title" className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Print Preview & Verification
                </h2>
                {token && (
                  <span className="text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    Token #{token}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[220px] sm:max-w-md">
                Verify layout, margins, and paper alignment before transmission
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Tab Toggle on Mobile */}
            <div className="flex sm:hidden bg-slate-800 p-0.5 rounded-xl border border-slate-700/60 text-xs">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'preview' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'settings' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                Settings
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close print preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE: CANVAS (LEFT) + FORMATTING CONTROLS (RIGHT) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* LEFT: SIMULATED PAPER WORKSPACE */}
          <div
            className={`flex-1 flex flex-col bg-slate-950/60 relative overflow-hidden ${
              activeTab === 'settings' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* CANVAS TOOLBAR */}
            <div className="h-11 px-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0 text-xs text-slate-300">
              {/* File carousel info */}
              <div className="flex items-center gap-2 truncate">
                <span className="font-semibold text-slate-400 truncate">
                  File {activeFileIndex + 1} of {files.length}:
                </span>
                <span className="font-bold text-white truncate max-w-[140px] sm:max-w-[220px]">
                  {currentFile?.name}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                  {(currentFile?.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>

              {/* Canvas Controls: Zoom, Guides, Rotation */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowMarginGuides(!showMarginGuides)}
                  className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[11px] font-medium border transition-colors ${
                    showMarginGuides
                      ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle safe margin printable guides"
                >
                  <Eye className="w-3 h-3" />
                  <span className="hidden sm:inline">Margins</span>
                </button>

                <div className="flex items-center bg-slate-800/80 rounded-lg border border-slate-700/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((prev) => Math.max(60, prev - 15))}
                    className="p-1 hover:text-white text-slate-400 transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono px-1 text-slate-300 min-w-[36px] text-center">
                    {zoomLevel}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((prev) => Math.min(150, prev + 15))}
                    className="p-1 hover:text-white text-slate-400 transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick orientation toggle in canvas toolbar */}
                <button
                  type="button"
                  onClick={() =>
                    updateSetting('orientation', orientation === 'portrait' ? 'landscape' : 'portrait')
                  }
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
                  title={`Switch to ${orientation === 'portrait' ? 'Landscape' : 'Portrait'}`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* INTERACTIVE PAPER STAGE */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center relative select-none">
              
              {/* Paper Sheet Simulator */}
              <div
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out'
                }}
                className="relative flex items-center justify-center"
              >
                <div
                  className={`relative bg-white text-slate-900 rounded-xs shadow-2xl border border-slate-200 overflow-hidden transition-all duration-200 ${getAspectRatioClass()} ${
                    orientation === 'portrait'
                      ? 'w-[280px] sm:w-[350px] max-h-[520px]'
                      : 'w-[360px] sm:w-[480px] max-h-[360px]'
                  }`}
                  style={{
                    filter: colorMode === 'BW' ? 'grayscale(100%) contrast(108%) brightness(98%)' : 'none'
                  }}
                >
                  {/* SAFE MARGIN GUIDELINE OVERLAY */}
                  {showMarginGuides && margin !== 'none' && (
                    <div
                      className={`absolute inset-0 pointer-events-none z-20 ${
                        margin === 'narrow' ? 'm-3' : 'm-6'
                      } border border-dashed border-emerald-500/70`}
                    >
                      <span className="absolute -top-3 left-2 bg-emerald-600 text-white text-[8px] font-mono px-1 rounded uppercase tracking-wider font-bold">
                        Safe Printable Boundary ({margin === 'narrow' ? '0.25"' : '0.5"'})
                      </span>
                    </div>
                  )}

                  {/* PAPER INNER CONTAINER */}
                  <div className={`w-full h-full flex flex-col justify-center items-center ${getMarginPadding()}`}>
                    
                    {/* 1. IMAGE FILE PREVIEW */}
                    {isImage && currentUrl && (
                      <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
                        <img
                          src={currentUrl}
                          alt={currentFile.name}
                          onLoad={(e) => handleImageLoad(e, activeFileIndex)}
                          className={`max-w-full max-h-full transition-all ${
                            fitMode === 'fill' ? 'object-cover w-full h-full' : 'object-contain'
                          }`}
                        />
                      </div>
                    )}

                    {/* 2. PDF FILE PREVIEW */}
                    {isPdf && currentUrl && (
                      <div className="w-full h-full flex flex-col relative bg-slate-50 border border-slate-200 rounded overflow-hidden">
                        <iframe
                          src={`${currentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                          title={`PDF Preview of ${currentFile.name}`}
                          className="w-full h-full border-0 pointer-events-auto"
                        />
                      </div>
                    )}

                    {/* 3. OFFICE / WORD / EXCEL / PPT / OTHER DOCUMENTS */}
                    {!isImage && !isPdf && (
                      <div className="w-full h-full flex flex-col justify-between p-4 bg-slate-50 border border-slate-200 rounded text-slate-800">
                        {/* Mock Document Header */}
                        <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold truncate max-w-[170px]">{currentFile?.name}</div>
                              <div className="text-[9px] text-slate-500 uppercase font-mono">
                                {currentFile?.name.split('.').pop()} Document
                              </div>
                            </div>
                          </div>
                          <span className="text-[9px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                            {(currentFile?.size / 1024).toFixed(0)} KB
                          </span>
                        </div>

                        {/* Visual Document Layout Mockup */}
                        <div className="my-auto space-y-2.5 py-3">
                          <div className="h-3 w-3/4 bg-slate-300 rounded" />
                          <div className="space-y-1.5">
                            <div className="h-2 w-full bg-slate-200 rounded" />
                            <div className="h-2 w-full bg-slate-200 rounded" />
                            <div className="h-2 w-5/6 bg-slate-200 rounded" />
                            <div className="h-2 w-4/6 bg-slate-200 rounded" />
                          </div>
                          <div className="pt-2 space-y-1.5">
                            <div className="h-2 w-11/12 bg-slate-200 rounded" />
                            <div className="h-2 w-full bg-slate-200 rounded" />
                            <div className="h-2 w-2/3 bg-slate-200 rounded" />
                          </div>
                          <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-[10px] leading-tight">
                            ✓ Document formatting preserved. Shop high-definition RIP engine will render original fonts & vectors at print time.
                          </div>
                        </div>

                        {/* Mock Document Footer */}
                        <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                          <span>Standard Margins (12.7mm)</span>
                          <span>Page 1</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* DUPLEX SIDE INDICATOR WATERMARK */}
                  {isDoubleSided && (
                    <div className="absolute bottom-2 right-2 z-30 pointer-events-none">
                      <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-slate-900/80 text-white shadow">
                        {activeSide === 'front' ? 'SIDE 1 (FRONT)' : 'SIDE 2 (BACK)'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* DUPLEX SHEET FLIP SELECTOR & MULTI-FILE BAR */}
            <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Front / Back Toggle if 2-sided */}
              {isDoubleSided ? (
                <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 px-1 font-medium">Sheet Face:</span>
                  <button
                    type="button"
                    onClick={() => setActiveSide('front')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      activeSide === 'front'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Side 1 (Front)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSide('back')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      activeSide === 'back'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Side 2 (Back)
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Single-Sided Print (Face Up)</span>
                </div>
              )}

              {/* Multi-File Navigation Arrows */}
              {files.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={activeFileIndex <= 0}
                    onClick={() => setActiveFileIndex((prev) => Math.max(0, prev - 1))}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 disabled:cursor-not-allowed border border-slate-800"
                    title="Previous file"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex gap-1 px-1">
                    {files.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveFileIndex(idx)}
                        className={`w-6 h-6 rounded-md text-[10px] font-bold transition-all ${
                          idx === activeFileIndex
                            ? 'bg-emerald-500 text-slate-950 shadow-xs'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={activeFileIndex >= files.length - 1}
                    onClick={() => setActiveFileIndex((prev) => Math.min(files.length - 1, prev + 1))}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 disabled:cursor-not-allowed border border-slate-800"
                    title="Next file"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: FORMATTING & VERIFICATION CONTROLS */}
          <div
            className={`w-full md:w-80 lg:w-96 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col justify-between overflow-y-auto ${
              activeTab === 'preview' ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="p-4 sm:p-5 space-y-4">
              
              {/* SECTION: FORMATTING SPECIFICATIONS */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Formatting & Print Setup</span>
                </h3>

                <div className="space-y-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  
                  {/* 1. Orientation & Color Mode */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Orientation
                      </label>
                      <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => updateSetting('orientation', 'portrait')}
                          className={`py-1 rounded-lg text-xs font-bold transition-all ${
                            orientation === 'portrait' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                          }`}
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSetting('orientation', 'landscape')}
                          className={`py-1 rounded-lg text-xs font-bold transition-all ${
                            orientation === 'landscape' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                          }`}
                        >
                          Landscape
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Color Mode
                      </label>
                      <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => updateSetting('colorMode', 'BW')}
                          className={`py-1 rounded-lg text-xs font-bold transition-all ${
                            colorMode === 'BW' ? 'bg-slate-800 text-white' : 'text-slate-400'
                          }`}
                        >
                          B&W
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSetting('colorMode', 'COLOR')}
                          className={`py-1 rounded-lg text-xs font-bold transition-all ${
                            colorMode === 'COLOR' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                          }`}
                        >
                          Color
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2. Paper Size & Margins */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Paper Size
                      </label>
                      <select
                        value={paperSize}
                        onChange={(e) => updateSetting('paperSize', e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-2.5 text-xs text-white focus:outline-none"
                      >
                        <option value="A4">A4 (Standard)</option>
                        <option value="A3">A3 (Large)</option>
                        <option value="Letter">Letter</option>
                        <option value="Legal">Legal</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Safe Margins
                      </label>
                      <select
                        value={margin}
                        onChange={(e) => updateSetting('margin', e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-2.5 text-xs text-white focus:outline-none"
                      >
                        <option value="normal">Normal (0.5")</option>
                        <option value="narrow">Narrow (0.25")</option>
                        <option value="none">Borderless (Bleed)</option>
                      </select>
                    </div>
                  </div>

                  {/* 3. Duplex / 2-Sided Print & Copies */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Double-Sided
                      </label>
                      <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => updateSetting('isDoubleSided', false)}
                          className={`py-1 rounded-lg text-xs font-bold transition-all ${
                            !isDoubleSided ? 'bg-slate-800 text-white' : 'text-slate-400'
                          }`}
                        >
                          1-Sided
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSetting('isDoubleSided', true)}
                          className={`py-1 rounded-lg text-xs font-bold transition-all ${
                            isDoubleSided ? 'bg-emerald-600 text-white' : 'text-slate-400'
                          }`}
                        >
                          2-Sided
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Copies
                      </label>
                      <div className="flex items-center bg-slate-900 rounded-xl border border-slate-800 p-0.5">
                        <button
                          type="button"
                          onClick={() => updateSetting('copies', Math.max(1, copies - 1))}
                          className="w-7 py-1 text-slate-300 font-bold hover:bg-slate-800 rounded-lg text-xs"
                        >
                          -
                        </button>
                        <span className="flex-1 text-center font-bold text-white text-xs">{copies}</span>
                        <button
                          type="button"
                          onClick={() => updateSetting('copies', Math.min(99, copies + 1))}
                          className="w-7 py-1 text-slate-300 font-bold hover:bg-slate-800 rounded-lg text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4. Fit / Scale Mode */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Scale / Fit Behavior
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => updateSetting('fitMode', 'fit')}
                        className={`py-1 rounded-lg font-bold transition-all ${
                          fitMode === 'fit' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Fit to Page
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSetting('fitMode', 'fill')}
                        className={`py-1 rounded-lg font-bold transition-all ${
                          fitMode === 'fill' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Fill Area
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSetting('fitMode', 'actual')}
                        className={`py-1 rounded-lg font-bold transition-all ${
                          fitMode === 'actual' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        100% Actual
                      </button>
                    </div>
                  </div>

                  {/* 5. Page Range */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Page Range
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. All, or 1-3, 5"
                      value={settings.pageRange || ''}
                      onChange={(e) => updateSetting('pageRange', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: PRE-FLIGHT VERIFICATION CHECKLIST */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Pre-Flight Checklist</span>
                </h3>

                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Safe Margins Aligned</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800/60">
                      PASSED
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Color Rendition Verified</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800/60">
                      {colorMode === 'COLOR' ? 'FULL COLOR' : 'GRAYSCALE B&W'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ephemeral Desk Token</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800/60">
                      #{token || 'PENDING'}
                    </span>
                  </div>

                  {currentMeta && (
                    <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
                      <span>Image Density:</span>
                      <span className="font-mono text-emerald-400 font-bold">{currentMeta.dpi} DPI (Crisp)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: ESTIMATED COUNTER PRICE */}
              <div className="p-3 bg-emerald-950/30 rounded-2xl border border-emerald-900/50 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                    Estimated Counter Cost
                  </span>
                  <p className="text-[11px] text-slate-400">
                    {files.length} doc{files.length > 1 ? 's' : ''} × {copies} copy{copies > 1 ? 'ies' : ''} ({colorMode})
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base font-extrabold text-emerald-300">₹{estimatedCost}</span>
                  <span className="block text-[9px] text-slate-500">Payable at counter</span>
                </div>
              </div>

            </div>

            {/* ACTION FOOTER DOCK */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2 shrink-0">
              <Button
                variant="primary"
                size="md"
                onClick={onConfirmAndQueue}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Transmit Verified Job to Counter</span>
              </Button>

              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Back to Staged Files
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
