import React, { useEffect, useRef, useState, useCallback } from 'react';
import QRCode, { QRCodeErrorCorrectionLevel } from 'qrcode';
import { Printer, AlertCircle, RefreshCw } from 'lucide-react';

export type { QRCodeErrorCorrectionLevel };

export interface QRCodeGeneratorProps {
  /** The public URL or text to encode into the QR code */
  value: string;
  /** Dimension in pixels (width and height) */
  size?: number;
  /** Margin around the QR modules (quiet zone) */
  margin?: number;
  /** Error correction level: L (7%), M (15%), Q (25%), H (30%) */
  errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
  /** Color of dark modules (hex or css color) */
  darkColor?: string;
  /** Color of light background (hex or css color) */
  lightColor?: string;
  /** Additional container classes */
  className?: string;
  /** Center icon / brand overlay badge */
  showCenterBadge?: boolean;
  /** Center badge icon custom element */
  centerIcon?: React.ReactNode;
  /** Callback fired with the canvas Data URL after rendering */
  onGenerated?: (dataUrl: string) => void;
}

/**
 * Utility function to generate high-resolution PNG data URL
 */
export async function generateQRCodeDataUrl(
  text: string,
  options?: {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    darkColor?: string;
    lightColor?: string;
  }
): Promise<string> {
  const renderOpts: QRCode.QRCodeToDataURLOptionsOther = {
    width: options?.width || 1024,
    margin: options?.margin ?? 2,
    errorCorrectionLevel: (options?.errorCorrectionLevel || 'H') as QRCodeErrorCorrectionLevel,
    color: {
      dark: options?.darkColor || '#0f172a',
      light: options?.lightColor || '#ffffff',
    },
  };
  return QRCode.toDataURL(text, renderOpts);
}

/**
 * Utility function to generate raw SVG string
 */
export async function generateQRCodeSvg(
  text: string,
  options?: {
    margin?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    darkColor?: string;
    lightColor?: string;
  }
): Promise<string> {
  const stringOpts: QRCode.QRCodeToStringOptionsOther = {
    type: 'svg',
    margin: options?.margin ?? 2,
    errorCorrectionLevel: (options?.errorCorrectionLevel || 'H') as QRCodeErrorCorrectionLevel,
    color: {
      dark: options?.darkColor || '#0f172a',
      light: options?.lightColor || '#ffffff',
    },
  };
  return QRCode.toString(text, stringOpts);
}

/**
 * Utility function to trigger download of QR Code in PNG or SVG
 */
export interface DownloadQRResult {
  dataUrl?: string;
  svgString?: string;
  blob?: Blob;
}

export async function downloadQRCode(
  text: string,
  fileName: string = 'secureprint-qr',
  format: 'png' | 'svg' = 'png'
): Promise<DownloadQRResult> {
  try {
    if (format === 'svg') {
      const svgString = await generateQRCodeSvg(text);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.svg`;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {}
      }, 300);
      return { svgString, blob };
    } else {
      const dataUrl = await generateQRCodeDataUrl(text, { width: 1200, margin: 2 });
      
      // Also build blob for clipboard or direct saving
      let blob: Blob | undefined;
      try {
        const res = await fetch(dataUrl);
        blob = await res.blob();
      } catch {}

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName}.png`;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 300);
      return { dataUrl, blob };
    }
  } catch (err) {
    console.error('Error during QR code generation/download:', err);
    throw err;
  }
}

/**
 * Component to dynamically render shop QR code using the 'qrcode' library
 */
export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
  value,
  size = 220,
  margin = 1,
  errorCorrectionLevel = 'H',
  darkColor = '#0f172a',
  lightColor = '#ffffff',
  className = '',
  showCenterBadge = true,
  centerIcon,
  onGenerated,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(true);

  const renderQR = useCallback(async () => {
    if (!canvasRef.current || !value) return;

    setIsRendering(true);
    setError(null);

    try {
      const canvasOpts: QRCode.QRCodeRenderersOptions = {
        width: size,
        margin,
        errorCorrectionLevel: (errorCorrectionLevel || 'H') as QRCodeErrorCorrectionLevel,
        color: {
          dark: darkColor,
          light: lightColor,
        },
      };
      await QRCode.toCanvas(canvasRef.current, value, canvasOpts);

      if (onGenerated && canvasRef.current) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        onGenerated(dataUrl);
      }
    } catch (err: any) {
      console.error('Failed to render QR Code:', err);
      setError(err?.message || 'Could not generate QR code');
    } finally {
      setIsRendering(false);
    }
  }, [value, size, margin, errorCorrectionLevel, darkColor, lightColor, onGenerated]);

  useEffect(() => {
    renderQR();
  }, [renderQR]);

  const badgeSize = Math.max(28, Math.round(size * 0.16));

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-xl shadow-xs transition-opacity duration-200"
        style={{
          width: size,
          height: size,
          opacity: isRendering ? 0.4 : 1,
        }}
      />

      {/* Optional Center Brand/Logo Badge (safe when using Error Correction 'H' or 'Q') */}
      {showCenterBadge && !error && !isRendering && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="flex items-center justify-center bg-white rounded-xl shadow-md border border-slate-200"
            style={{
              width: badgeSize,
              height: badgeSize,
            }}
          >
            {centerIcon || (
              <Printer
                className="text-emerald-600"
                style={{
                  width: Math.round(badgeSize * 0.6),
                  height: Math.round(badgeSize * 0.6),
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Loading state indicator */}
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-2xs rounded-xl">
          <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mb-1" />
          <p className="text-[11px] text-rose-700 font-semibold leading-tight">
            Failed to generate QR
          </p>
          <button
            onClick={() => renderQR()}
            className="mt-2 px-2 py-1 bg-white border border-rose-300 rounded text-[10px] text-rose-800 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};
