import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Printer,
  Download,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  QrCode,
  Globe,
  Settings,
  Eye,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Share2,
  Smartphone,
  X,
  FileText
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../firebase/context';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { QRCodeGenerator, downloadQRCode, generateQRCodeDataUrl } from '../../components/shop/QRCodeGenerator';
import {
  getShopCustomerUrl,
  getPublicAppOrigin,
  setCustomAppOrigin,
  resetAppOrigin,
  isDevPreviewOrigin
} from '../../utils/appUrl';
import { printStandeeCard } from '../../utils/printEngine';

export const ShopQRPage: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();

  const [copied, setCopied] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [standeePrintModalOpen, setStandeePrintModalOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Desk URL configuration
  const [originSettingOpen, setOriginSettingOpen] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState<string>(getPublicAppOrigin());
  const [customOriginInput, setCustomOriginInput] = useState<string>(getPublicAppOrigin());

  const publicCode = shop?.publicCode || 'shop';
  const customerUrl = getShopCustomerUrl(publicCode);

  // Guarantee shop document exists in Firestore so external customer phones always resolve this exact shop
  useEffect(() => {
    if (!shop?.id || !shop?.publicCode) return;
    const ensureShopSynced = async () => {
      try {
        const shopRef = doc(db, 'shops', shop.id);
        const snap = await getDoc(shopRef);
        if (!snap.exists()) {
          await setDoc(shopRef, {
            ...shop,
            status: shop.status || 'active',
            isOpen: shop.isOpen ?? true,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Could not verify shop Firestore sync:', err);
      }
    };
    ensureShopSynced();
  }, [shop]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(customerUrl);
    setCopied(true);
    showToast('Customer link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyImageToClipboard = async () => {
    try {
      if (!qrDataUrl) {
        showToast('Generating QR code image...');
        return;
      }
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopiedImg(true);
      showToast('QR code image copied to clipboard!');
      setTimeout(() => setCopiedImg(false), 2500);
    } catch (err) {
      console.warn('Clipboard write image failed, falling back:', err);
      showToast('Please right-click the QR code image and select "Copy Image"');
    }
  };

  const handlePrintStandee = async () => {
    // Open standee print preview modal with guaranteed window.print() support
    setStandeePrintModalOpen(true);
  };

  const triggerDirectPrint = () => {
    try {
      window.print();
    } catch (e) {
      console.warn('Direct print failed:', e);
    }
  };

  const handleDownloadQR = async (format: 'png' | 'svg' = 'png') => {
    try {
      const fileName = `${publicCode}_qr_${format}`;
      // Generate guaranteed high-resolution data url
      if (!qrDataUrl) {
        const url = await generateQRCodeDataUrl(customerUrl, { width: 1200, margin: 2 });
        setQrDataUrl(url);
      }
      
      // Attempt native download
      await downloadQRCode(customerUrl, fileName, format);
      showToast(`QR Code (${format.toUpperCase()}) download triggered!`);
    } catch (err) {
      console.warn('Auto download error, opening save modal:', err);
    } finally {
      // Always open save modal so the user is 100% guaranteed to get their image
      setDownloadModalOpen(true);
    }
  };

  const handleSaveOrigin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customOriginInput.trim()) return;
    setCustomAppOrigin(customOriginInput.trim());
    setCurrentOrigin(getPublicAppOrigin());
    setOriginSettingOpen(false);
    showToast('Desk base URL updated successfully!');
  };

  const handleResetOrigin = () => {
    resetAppOrigin();
    setCurrentOrigin(getPublicAppOrigin());
    setCustomOriginInput(getPublicAppOrigin());
    setOriginSettingOpen(false);
    showToast('Reset to default application origin.');
  };

  return (
    <div className="space-y-8 text-left">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-950 border border-emerald-500/50 text-emerald-100 text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Print Stylesheet for Physical Standee */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-standee-card, #print-standee-card * {
            visibility: visible !important;
          }
          #print-standee-card {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 100% !important;
            max-width: 440px !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: 2px solid #000 !important;
            background: #fff !important;
            z-index: 99999 !important;
          }
        }
      `}</style>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <QrCode className="w-6 h-6 text-emerald-600" />
            <span>Counter Standee & QR Code</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Display this QR code at your xerox / print counter. Customers scan to upload files instantly without installing any app.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadQR('png')}
            className="gap-1.5 bg-white hover:bg-slate-50 border-slate-300 shadow-xs"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Download PNG QR</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadQR('svg')}
            className="gap-1.5 bg-white hover:bg-slate-50 border-slate-300 shadow-xs"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Download SVG</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="gap-1.5 bg-white hover:bg-slate-50 border-slate-300 shadow-xs"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied URL!' : 'Copy Link'}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handlePrintStandee}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print QR Standee</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Printable Standee Preview Card (Styled as physical acrylic table tent) */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div
            id="print-standee-card"
            className="w-full max-w-md bg-white border-2 border-slate-900 rounded-3xl p-8 text-center shadow-2xl space-y-6 print:m-0 print:shadow-none print:border-none"
          >
            {/* Top Brand */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <Printer className="w-5 h-5" />
              </div>
              <span className="font-black text-xl tracking-tight text-slate-900">
                SECURE<span className="text-emerald-600">PRINT</span>
              </span>
            </div>

            {/* Shop Details */}
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-slate-900">
                {shop?.name || 'Local Xerox & Prints'}
              </h3>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Official Digital Print Desk
              </p>
            </div>

            {/* High Resolution Dynamic Canvas QR Code */}
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 inline-block mx-auto shadow-xs relative group">
              <QRCodeGenerator
                value={customerUrl}
                size={248}
                margin={3}
                errorCorrectionLevel="H"
                darkColor="#000000"
                lightColor="#ffffff"
                showCenterBadge={true}
                onGenerated={(url) => setQrDataUrl(url)}
              />
            </div>

            {/* Instructional Steps */}
            <div className="space-y-2">
              <div className="text-base font-bold text-slate-900">
                Scan with Phone Camera to Print
              </div>
              <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                No app installation required. Scan QR code, upload documents, and share your 6-digit desk token.
              </p>
            </div>

            {/* Counter Code & Guarantee */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <div>
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Shop Desk Code</span>
                <span className="font-mono font-bold text-slate-900 text-base">{publicCode}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 justify-end">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>5-Hour Auto-Purge</span>
                </span>
                <span className="text-[10px] text-slate-400">Zero permanent data leaks</span>
              </div>
            </div>
          </div>

          {/* Quick Buttons Under Standee */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handlePrintStandee}
              className="text-xs text-slate-700 hover:text-emerald-700 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-600" />
              <span>Print A4 Table Tent</span>
            </button>
            <button
              onClick={() => setDownloadModalOpen(true)}
              className="text-xs text-slate-700 hover:text-emerald-700 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Save / Download QR</span>
            </button>
            <button
              onClick={() => setSimulatorOpen(true)}
              className="text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-2xs transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Simulate Customer Scan</span>
            </button>
          </div>
        </div>

        {/* Right: Quick Links, Testing & URL Configuration */}
        <div className="lg:col-span-5 space-y-6">
          {/* Customer Link Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Direct Customer Desk Link</h3>
              <button
                onClick={() => setOriginSettingOpen(true)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
                title="Configure Desk Domain"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Desk URL</span>
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Customers scan the table tent or open this public link directly on any smartphone (no login required):
            </p>
            {isDevPreviewOrigin() && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-medium">
                Public Shared URL active — external phones connect directly without developer sign-in.
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs text-emerald-700 break-all select-all flex items-center justify-between gap-2">
              <span className="font-semibold">{customerUrl}</span>
              <button
                type="button"
                onClick={copyToClipboard}
                className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 shrink-0"
                title="Copy customer URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={copyToClipboard} className="w-full">
                {copied ? 'Link Copied!' : 'Copy Link'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/s/${publicCode}`)}
                className="w-full gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open Customer View</span>
              </Button>
            </div>
          </div>

          {/* Quick How It Works for Counter Staff */}
          <div className="p-6 rounded-2xl bg-slate-900 text-white space-y-3">
            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Counter Operations Guide</span>
            </h3>
            <ul className="text-xs space-y-2 text-slate-300">
              <li>• <strong>Step 1:</strong> Print the standee and keep it in an acrylic table tent on your front desk.</li>
              <li>• <strong>Step 2:</strong> When a customer arrives with print files, have them point their phone camera at the QR code.</li>
              <li>• <strong>Step 3:</strong> They choose Color/B&W, copies, and send documents directly.</li>
              <li>• <strong>Step 4:</strong> Their documents and 6-digit token appear in your <strong>Queue</strong> instantly.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* URL Configuration Modal */}
      <Modal
        isOpen={originSettingOpen}
        onClose={() => setOriginSettingOpen(false)}
        title="Configure Customer Desk URL"
        maxWidth="md"
      >
        <form onSubmit={handleSaveOrigin} className="space-y-4 text-left">
          <p className="text-xs text-slate-600 leading-relaxed">
            By default, the QR code uses your current web address so that scanners connect directly:
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Base Origin / Domain URL</label>
            <input
              type="text"
              value={customOriginInput}
              onChange={(e) => setCustomOriginInput(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
              required
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 space-y-1 font-mono">
            <div>Resulting customer URL:</div>
            <div className="text-emerald-700 font-bold break-all">
              {customOriginInput.trim().replace(/\/+$/, '')}/s/{publicCode}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleResetOrigin}
              className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
            >
              Reset to Current Host
            </button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOriginSettingOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save & Update QR
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* QR Code Save & Download Modal (100% Reliable in all browsers/iframes) */}
      <Modal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        title="Download / Save Shop QR Code"
        maxWidth="sm"
      >
        <div className="space-y-4 text-center">
          <p className="text-xs text-slate-500">
            High-resolution QR code for <strong>{shop?.name || 'Counter'}</strong>. Use any of the options below:
          </p>

          {qrDataUrl && (
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 inline-block shadow-sm">
              <img src={qrDataUrl} alt="SecurePrint QR" className="w-56 h-56 mx-auto rounded-lg select-all" />
            </div>
          )}

          <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] text-slate-600 border border-slate-200">
            💡 <strong>Tip:</strong> You can also right-click (or long press on mobile) and select <strong>"Save Image As..."</strong>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <a
                href={qrDataUrl}
                download={`${publicCode}_qr.png`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </a>

              <button
                type="button"
                onClick={copyImageToClipboard}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-xs"
              >
                {copiedImg ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copiedImg ? 'Copied Image!' : 'Copy Image'}</span>
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setDownloadModalOpen(false)} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Standee Print Modal */}
      <Modal
        isOpen={standeePrintModalOpen}
        onClose={() => setStandeePrintModalOpen(false)}
        title="Print Counter Standee Table Tent"
        maxWidth="md"
      >
        <div className="space-y-5 text-center">
          <p className="text-xs text-slate-600">
            Your counter standee is formatted to print centered on standard A4 / Letter paper.
          </p>

          {/* Mini preview */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 max-w-xs mx-auto text-center space-y-3">
            <div className="font-extrabold text-sm text-slate-900">{shop?.name || 'Local Xerox & Prints'}</div>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR Preview" className="w-36 h-36 mx-auto rounded-lg border border-slate-200 shadow-xs" />
            )}
            <div className="font-mono text-xs text-emerald-700 font-bold">{publicCode}</div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStandeePrintModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={triggerDirectPrint}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6"
            >
              <Printer className="w-4 h-4" />
              <span>Print Table Tent Now</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Embedded Live Customer Simulator Modal */}
      {simulatorOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-md h-[92vh] bg-[#0c1317] rounded-3xl border border-slate-700 overflow-hidden flex flex-col shadow-2xl relative">
            <div className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Smartphone className="w-4 h-4" />
                <span>Customer Mobile Phone Simulator</span>
              </div>
              <button
                type="button"
                onClick={() => setSimulatorOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe
              src={`/s/${publicCode}`}
              title="Customer Phone Simulator"
              className="w-full flex-1 border-none bg-[#0c1317]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
