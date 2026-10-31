import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  CameraOff,
  ShieldAlert,
  ImagePlus,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  QrCode,
  SwitchCamera,
  Flashlight
} from 'lucide-react';
import { extractShopPublicId, parseScannedShopTarget } from '../../utils/appUrl';
import { Button } from '../common/Button';

export interface CustomerQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  standalonePage?: boolean;
}

type CameraScannerStatus =
  | 'starting'
  | 'requesting_permission'
  | 'active'
  | 'permission_denied'
  | 'no_camera'
  | 'camera_busy'
  | 'unsupported';

interface ClassifiedCameraError {
  status: Exclude<CameraScannerStatus, 'starting' | 'requesting_permission' | 'active'>;
  title: string;
  description: string;
}

function classifyCameraError(err: unknown): ClassifiedCameraError {
  const errorName = err instanceof Error ? err.name : (err as { name?: string })?.name || '';
  const errorMessage =
    err instanceof Error ? err.message : String((err as { message?: string })?.message || '');

  if (
    errorName === 'NotAllowedError' ||
    errorName === 'PermissionDeniedError' ||
    errorName === 'PermissionDismissedError' ||
    errorName === 'SecurityError' ||
    /permission|denied|not allowed/i.test(errorMessage)
  ) {
    return {
      status: 'permission_denied',
      title: 'Camera Permission Needed',
      description:
        'Camera access was blocked or dismissed. Allow camera access in your browser site settings and tap Try Again, or scan from a QR photo below.'
    };
  }

  if (
    errorName === 'NotFoundError' ||
    errorName === 'DevicesNotFoundError' ||
    /device not found|requested device not found/i.test(errorMessage)
  ) {
    return {
      status: 'no_camera',
      title: 'No Camera Detected',
      description:
        'We could not find a camera on this device. Upload a photo or screenshot of the QR code, or enter the shop counter ID below.'
    };
  }

  if (
    errorName === 'NotReadableError' ||
    errorName === 'TrackStartError' ||
    /could not start video source|in use|hardware/i.test(errorMessage)
  ) {
    return {
      status: 'camera_busy',
      title: 'Camera Busy or Unavailable',
      description:
        'Your camera appears to be in use by another app or tab. Close other camera apps and tap Retry Camera, or scan a QR photo instead.'
    };
  }

  return {
    status: 'permission_denied',
    title: 'Unable to Start Camera',
    description:
      'Live camera preview could not be opened. Tap Try Again to request access, or use Scan QR Photo below.'
  };
}

function isConstraintOrDeviceFallbackError(err: unknown): boolean {
  const errorName = err instanceof Error ? err.name : (err as { name?: string })?.name || '';
  return (
    errorName === 'OverconstrainedError' ||
    errorName === 'ConstraintNotSatisfiedError' ||
    errorName === 'NotFoundError' ||
    errorName === 'DevicesNotFoundError' ||
    errorName === 'TypeError'
  );
}

function getInvalidQrFeedback(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (/^upi:\/\//i.test(trimmed)) {
    return 'That is a UPI payment QR code. Point your camera at the SecurePrint counter QR standee instead.';
  }
  if (/^wifi:/i.test(trimmed)) {
    return 'That is a Wi-Fi network QR code. Scan the SecurePrint shop counter QR code instead.';
  }
  return 'QR code detected, but it does not contain a valid SecurePrint shop ID.';
}

export const CustomerQRScannerModal: React.FC<CustomerQRScannerModalProps> = ({
  isOpen,
  onClose,
  standalonePage = false
}) => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const requestIdRef = useRef<number>(0);
  const hasNavigatedRef = useRef<boolean>(false);
  const redirectTimerRef = useRef<number | null>(null);
  const errorClearTimerRef = useRef<number | null>(null);
  const lastInvalidValueRef = useRef<{ value: string; timestamp: number } | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<CameraScannerStatus>('starting');
  const [cameraErrorTitle, setCameraErrorTitle] = useState<string>('Camera Access Issue');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [canSwitchCamera, setCanSwitchCamera] = useState<boolean>(true);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [decodeMessage, setDecodeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [decodingImage, setDecodingImage] = useState<boolean>(false);

  const stopCamera = useCallback(() => {
    // Invalidate any in-flight getUserMedia or play() promises so late streams stop immediately
    requestIdRef.current += 1;

    if (scanLoopRef.current !== null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop errors
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setTorchActive(false);
    setTorchSupported(false);
  }, []);

  const handleDecodedValue = useCallback(
    (rawValue: string, source: 'live' | 'photo' | 'manual' = 'live') => {
      if (hasNavigatedRef.current) return;

      const shopPublicId = extractShopPublicId(rawValue);
      const targetRoute = shopPublicId
        ? `/s/${encodeURIComponent(shopPublicId)}`
        : parseScannedShopTarget(rawValue);

      if (!targetRoute) {
        const now = Date.now();
        if (
          source === 'live' &&
          lastInvalidValueRef.current &&
          lastInvalidValueRef.current.value === rawValue &&
          now - lastInvalidValueRef.current.timestamp < 3000
        ) {
          return;
        }
        lastInvalidValueRef.current = { value: rawValue, timestamp: now };

        setDecodeMessage({
          type: 'error',
          text:
            source === 'manual'
              ? 'Enter a valid shop counter ID (e.g. patel-694) or paste a valid SecurePrint shop link.'
              : getInvalidQrFeedback(rawValue)
        });

        if (source === 'live') {
          if (errorClearTimerRef.current !== null) {
            window.clearTimeout(errorClearTimerRef.current);
          }
          errorClearTimerRef.current = window.setTimeout(() => {
            setDecodeMessage((prev) => (prev?.type === 'error' ? null : prev));
          }, 3500);
        }
        return;
      }

      hasNavigatedRef.current = true;
      if (errorClearTimerRef.current !== null) {
        window.clearTimeout(errorClearTimerRef.current);
        errorClearTimerRef.current = null;
      }

      setDecodeMessage({
        type: 'success',
        text: shopPublicId
          ? `Shop "${shopPublicId}" recognized! Redirecting...`
          : 'Session recognized! Redirecting...'
      });

      stopCamera();

      redirectTimerRef.current = window.setTimeout(() => {
        if (standalonePage) {
          navigate(targetRoute, { replace: true });
        } else {
          onClose();
          navigate(targetRoute);
        }
      }, 150);
    },
    [navigate, onClose, standalonePage, stopCamera]
  );

  const startCamera = useCallback(
    async (preferredFacing: 'environment' | 'user') => {
      stopCamera();
      const currentRequestId = requestIdRef.current;

      setCameraError(null);
      setDecodeMessage(null);
      hasNavigatedRef.current = false;
      lastInvalidValueRef.current = null;

      // 1. Verify secure context (HTTPS or localhost) and MediaDevices API support
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setCameraStatus('unsupported');
        setCameraErrorTitle('HTTPS Required for Camera');
        setCameraError(
          'Browsers require a secure HTTPS connection for live camera access. Open the HTTPS app URL or scan from a QR photo below.'
        );
        return;
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setCameraStatus('unsupported');
        setCameraErrorTitle('Live Camera Not Supported');
        setCameraError(
          'Live camera scanning is unavailable in this browser. Tap "Scan QR Photo" below to snap or upload the QR image.'
        );
        return;
      }

      // 2. Check Permissions API state when available to show an immediate permission prompt cue
      let initialPermissionState: PermissionState | null = null;
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        try {
          const permStatus = await navigator.permissions.query({
            name: 'camera' as PermissionName
          });
          if (currentRequestId !== requestIdRef.current) return;
          initialPermissionState = permStatus.state;
        } catch {
          // Browsers like Firefox / older WebKit do not support 'camera' in permissions.query
        }
      }

      if (initialPermissionState === 'prompt') {
        setCameraStatus('requesting_permission');
      } else {
        setCameraStatus('starting');
      }

      // For browsers without permissions.query (e.g. iOS Safari), switch to the permission prompt
      // helper message if getUserMedia awaits user interaction for more than 300ms
      const promptHintTimer = window.setTimeout(() => {
        if (currentRequestId === requestIdRef.current) {
          setCameraStatus((prev) => (prev === 'starting' ? 'requesting_permission' : prev));
        }
      }, 300);

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
        } catch (primaryErr) {
          // Only fallback to generic video constraints if hardware/resolution constraints failed —
          // never re-trigger getUserMedia when the user denied permission or camera is locked!
          if (!isConstraintOrDeviceFallbackError(primaryErr)) {
            throw primaryErr;
          }
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
          });
        } finally {
          window.clearTimeout(promptHintTimer);
        }

        // If modal closed or a newer camera request started while awaiting permission, release immediately
        if (currentRequestId !== requestIdRef.current) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {
              // ignore
            }
          });
          return;
        }

        streamRef.current = stream;

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          // Detect hardware flashlight / torch capability
          if (typeof videoTrack.getCapabilities === 'function') {
            try {
              const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
                torch?: boolean;
              };
              setTorchSupported(Boolean(caps?.torch));
            } catch {
              setTorchSupported(false);
            }
          }

          // Handle OS revoking camera mid-session or unplugged USB camera
          videoTrack.onended = () => {
            if (currentRequestId !== requestIdRef.current || hasNavigatedRef.current) return;
            stopCamera();
            setCameraStatus('camera_busy');
            setCameraErrorTitle('Camera Disconnected');
            setCameraError(
              'The camera stream ended unexpectedly. Tap Retry Camera to reconnect or scan from a QR photo.'
            );
          };
        }

        // Check how many video input devices exist so desktop single-webcam setups stay clean
        if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (currentRequestId === requestIdRef.current) {
              const videoInputs = devices.filter((d) => d.kind === 'videoinput');
              const isMobileViewport =
                typeof window !== 'undefined' &&
                window.matchMedia?.('(pointer: coarse)').matches;
              setCanSwitchCamera(videoInputs.length > 1 || Boolean(isMobileViewport));
            }
          } catch {
            setCanSwitchCamera(true);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          try {
            await videoRef.current.play();
          } catch (playErr) {
            const playErrName =
              playErr instanceof Error ? playErr.name : (playErr as { name?: string })?.name;
            if (currentRequestId !== requestIdRef.current || playErrName === 'AbortError') {
              return;
            }
            throw playErr;
          }
        }

        if (currentRequestId !== requestIdRef.current) {
          stopCamera();
          return;
        }

        setCameraStatus('active');

        // Prepare optional native BarcodeDetector for fast hardware assist alongside jsQR
        let nativeDetector: { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } | null =
          null;
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const BarcodeDetectorCtor = (
              window as unknown as {
                BarcodeDetector: new (opts: { formats: string[] }) => {
                  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
                };
              }
            ).BarcodeDetector;
            nativeDetector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
          } catch {
            nativeDetector = null;
          }
        }

        let lastFrameTime = 0;
        let isProcessingFrame = false;

        const tick = async (timestamp: number) => {
          if (
            hasNavigatedRef.current ||
            !streamRef.current ||
            currentRequestId !== requestIdRef.current
          ) {
            return;
          }

          // Scan ~12 frames per second without overlapping async frame detections
          if (!isProcessingFrame && timestamp - lastFrameTime >= 80) {
            isProcessingFrame = true;
            lastFrameTime = timestamp;

            try {
              const video = videoRef.current;
              const canvas = canvasRef.current;

              if (video && canvas && video.readyState >= video.HAVE_ENOUGH_DATA) {
                const vw = video.videoWidth;
                const vh = video.videoHeight;

                if (vw > 0 && vh > 0) {
                  let detectedRaw: string | null = null;

                  // 1. Try native hardware BarcodeDetector first when supported
                  if (nativeDetector) {
                    try {
                      const barcodes = await nativeDetector.detect(video);
                      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                        detectedRaw = barcodes[0].rawValue;
                      }
                    } catch {
                      // Fall through to universal jsQR canvas decoder
                    }
                  }

                  // 2. Universal jsQR frame decoder (works across iOS Safari, Android, Firefox, Desktop)
                  if (!detectedRaw) {
                    const maxDim = 640;
                    const scale = Math.min(1, maxDim / Math.max(vw, vh));
                    const cw = Math.max(1, Math.floor(vw * scale));
                    const ch = Math.max(1, Math.floor(vh * scale));

                    if (canvas.width !== cw) canvas.width = cw;
                    if (canvas.height !== ch) canvas.height = ch;

                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (ctx) {
                      ctx.drawImage(video, 0, 0, cw, ch);
                      const imageData = ctx.getImageData(0, 0, cw, ch);
                      const qrResult = jsQR(imageData.data, cw, ch, {
                        inversionAttempts: 'attemptBoth'
                      });
                      if (qrResult && qrResult.data) {
                        detectedRaw = qrResult.data;
                      }
                    }
                  }

                  if (detectedRaw && currentRequestId === requestIdRef.current) {
                    handleDecodedValue(detectedRaw, 'live');
                    if (hasNavigatedRef.current) {
                      return;
                    }
                  }
                }
              }
            } finally {
              isProcessingFrame = false;
            }
          }

          if (!hasNavigatedRef.current && currentRequestId === requestIdRef.current) {
            scanLoopRef.current = requestAnimationFrame(tick);
          }
        };

        scanLoopRef.current = requestAnimationFrame(tick);
      } catch (err: unknown) {
        window.clearTimeout(promptHintTimer);
        if (currentRequestId !== requestIdRef.current) return;

        console.warn('QR Scanner camera access issue:', err);
        const classified = classifyCameraError(err);
        setCameraStatus(classified.status);
        setCameraErrorTitle(classified.title);
        setCameraError(classified.description);
      }
    },
    [handleDecodedValue, stopCamera]
  );

  // Start / stop camera when modal opens, closes, or switches lens
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera(facingMode);
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, startCamera, stopCamera]);

  // Listen to browser camera permission changes so granting permission in site settings auto-recovers
  useEffect(() => {
    if (!isOpen) return;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    let permissionStatus: PermissionStatus | null = null;
    let cancelled = false;

    const handlePermissionChange = () => {
      if (cancelled || !permissionStatus || hasNavigatedRef.current) return;
      if (permissionStatus.state === 'granted' && !streamRef.current) {
        startCamera(facingMode);
      } else if (permissionStatus.state === 'denied') {
        stopCamera();
        setCameraStatus('permission_denied');
        setCameraErrorTitle('Camera Permission Blocked');
        setCameraError(
          'Camera permission is blocked for this site. Enable camera access in your browser address bar settings and tap Try Again, or scan a QR photo below.'
        );
      }
    };

    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permissionStatus = status;
        permissionStatus.addEventListener('change', handlePermissionChange);
      })
      .catch(() => {
        // Ignore if 'camera' permission query is unsupported in this browser
      });

    return () => {
      cancelled = true;
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handlePermissionChange);
      }
    };
  }, [isOpen, facingMode, startCamera, stopCamera]);

  // Clean up pending timers on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
      if (errorClearTimerRef.current !== null) {
        window.clearTimeout(errorClearTimerRef.current);
      }
    };
  }, []);

  // Escape key handler for modal mode
  useEffect(() => {
    if (!isOpen || standalonePage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, standalonePage, onClose]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchActive;
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet]
      });
      setTorchActive(next);
    } catch {
      // Ignore if driver rejects torch toggle
    }
  };

  // Decode QR code from selected photo / screenshot / camera capture
  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setDecodingImage(true);
    setDecodeMessage(null);

    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not load selected image'));
        el.src = objectUrl;
      });

      let decodedText: string | null = null;

      // 1. Try native BarcodeDetector first on the full image if supported
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const BarcodeDetectorCtor = (
            window as unknown as {
              BarcodeDetector: new (opts: { formats: string[] }) => {
                detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
              };
            }
          ).BarcodeDetector;
          const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
          const results = await detector.detect(img);
          if (results && results.length > 0 && results[0].rawValue) {
            decodedText = results[0].rawValue;
          }
        } catch {
          // Fall through to multi-scale jsQR
        }
      }

      // 2. Multi-resolution jsQR fallback for screenshots & high-MP camera photos
      if (!decodedText) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');

        const candidateMaxSizes = [1200, 800, 500, 1600];
        const sourceWidth = img.naturalWidth || img.width;
        const sourceHeight = img.naturalHeight || img.height;

        for (const maxSide of candidateMaxSizes) {
          const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
          const w = Math.max(1, Math.round(sourceWidth * scale));
          const h = Math.max(1, Math.round(sourceHeight * scale));
          canvas.width = w;
          canvas.height = h;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          const imgData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) {
            decodedText = code.data;
            break;
          }
        }
      }

      if (decodedText) {
        handleDecodedValue(decodedText, 'photo');
      } else {
        setDecodeMessage({
          type: 'error',
          text: 'No QR code found in that image. Make sure the entire QR square is clear and well-lit.'
        });
      }
    } catch {
      setDecodeMessage({
        type: 'error',
        text: 'Could not read that image file. Try a clearer photo or enter the shop counter ID below.'
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
      setDecodingImage(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleDecodedValue(manualInput.trim(), 'manual');
  };

  if (!isOpen) return null;

  const isErrorState =
    cameraStatus === 'permission_denied' ||
    cameraStatus === 'no_camera' ||
    cameraStatus === 'camera_busy' ||
    cameraStatus === 'unsupported';

  const canRetryLiveCamera =
    cameraStatus === 'permission_denied' ||
    cameraStatus === 'camera_busy' ||
    cameraStatus === 'no_camera';

  const contentCard = (
    <div
      className="w-full max-w-md bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-2xl overflow-hidden text-left"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Offscreen decode canvas & photo file input */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileScan}
        className="hidden"
      />

      {/* Top Bar */}
      <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Scan Shop Counter QR</h2>
            <p className="text-[11px] text-slate-400">Point at counter standee or scan from photo</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close QR scanner"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Camera Viewfinder */}
      <div className="relative w-full aspect-square max-h-[320px] bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Viewfinder Reticle when active */}
        {cameraStatus === 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
            <div className="w-52 h-52 rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.52)] relative">
              <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
            </div>
            <p className="mt-3 text-[11px] font-medium text-slate-200 bg-slate-950/85 px-3 py-1 rounded-md">
              Align shop QR code inside frame
            </p>
          </div>
        )}

        {/* Camera Controls Overlay */}
        {cameraStatus === 'active' && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2.5 rounded-xl border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  torchActive
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-900/80 text-white border-slate-700 hover:bg-slate-800'
                }`}
                title="Toggle flashlight"
                aria-label="Toggle flashlight"
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}
            {canSwitchCamera && (
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                title="Switch camera"
                aria-label="Switch camera"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Starting / Requesting Permission State */}
        {(cameraStatus === 'starting' || cameraStatus === 'requesting_permission') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-slate-300 p-6 text-center bg-slate-950/95">
            <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 flex items-center justify-center">
              {cameraStatus === 'requesting_permission' ? (
                <Camera className="w-5 h-5 animate-pulse" />
              ) : (
                <RefreshCw className="w-5 h-5 animate-spin" />
              )}
            </div>
            <p className="text-xs font-semibold text-white">
              {cameraStatus === 'requesting_permission'
                ? 'Allow Camera Access'
                : 'Starting Camera Scanner...'}
            </p>
            {cameraStatus === 'requesting_permission' && (
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Tap &ldquo;Allow&rdquo; in your browser permission prompt to scan the shop counter QR code.
              </p>
            )}
          </div>
        )}

        {/* Camera Error / Recovery State */}
        {isErrorState && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-slate-950">
            <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 flex items-center justify-center">
              {cameraStatus === 'permission_denied' ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <CameraOff className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-xs font-bold text-white">{cameraErrorTitle}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{cameraError}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {canRetryLiveCamera && (
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {cameraStatus === 'permission_denied' ? 'Try Again' : 'Retry Camera'}
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <ImagePlus className="w-4 h-4 shrink-0" />
                <span>Scan QR Photo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Controls & Manual Fallback */}
      <div className="p-4 space-y-3 bg-slate-950">
        {decodeMessage && (
          <div
            role="status"
            aria-live="polite"
            className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              decodeMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                : 'bg-rose-950/80 border-rose-800 text-rose-200'
            }`}
          >
            {decodeMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{decodeMessage.text}</span>
          </div>
        )}

        {/* Scan QR from Gallery / Camera Snap Button */}
        <button
          type="button"
          disabled={decodingImage}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-slate-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <ImagePlus className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {decodingImage ? 'Reading QR Image...' : 'Scan QR from Gallery / Take Photo'}
          </span>
        </button>

        {/* Direct Counter Code or Link Input */}
        <form onSubmit={handleManualSubmit} className="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder="Or enter shop ID (e.g. patel-694)..."
            value={manualInput}
            onChange={(e) => {
              setManualInput(e.target.value);
              if (decodeMessage?.type === 'error') {
                setDecodeMessage(null);
              }
            }}
            className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={!manualInput.trim()}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold whitespace-nowrap shrink-0"
          >
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </form>
      </div>
    </div>
  );

  if (standalonePage) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        {contentCard}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scan Shop Counter QR Code"
      onClick={onClose}
    >
      {contentCard}
    </div>
  );
};
