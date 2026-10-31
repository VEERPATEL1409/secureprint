/**
 * Print Engine for Shop Counter
 * Handles robust cross-browser printing for images, PDFs, and documents
 * without getting blocked by browser popup blockers.
 */

import { resolveFileUrlCrossInstance } from '../services/storageService';

export interface PrintOptions {
  colorMode?: 'BW' | 'COLOR';
  copies?: number;
  orientation?: 'portrait' | 'landscape';
  paperSize?: string;
  isDoubleSided?: boolean;
  duplexEdge?: 'long' | 'short';
  margin?: 'normal' | 'narrow' | 'none';
  fitMode?: 'fit' | 'fill' | 'actual';
  rotation?: number;
  pageRange?: string;
}

export function normalizeFileUrl(url: string, forDownload = false): string {
  if (!url) return '';
  let normalized = url.trim();
  const apiIndex = normalized.indexOf('/api/files/');
  if (apiIndex !== -1) {
    normalized = normalized.slice(apiIndex);
  }
  if (forDownload && normalized.startsWith('/api/files/')) {
    const sep = normalized.includes('?') ? '&' : '?';
    if (!normalized.includes('download=true')) {
      normalized = `${normalized}${sep}download=true`;
    }
  }
  return normalized;
}

function resolveMarginMm(margin?: 'normal' | 'narrow' | 'none'): string {
  if (margin === 'none') return '0mm';
  if (margin === 'narrow') return '6.35mm';
  return '12.7mm';
}

function resolveObjectFitCss(fitMode?: 'fit' | 'fill' | 'actual'): string {
  if (fitMode === 'fill') {
    return 'width: 100%; height: 96vh; object-fit: cover;';
  }
  if (fitMode === 'actual') {
    return 'max-width: none; max-height: none; object-fit: none;';
  }
  return 'max-width: 100%; max-height: 96vh; object-fit: contain;';
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isImageAttachment(fileUrl: string, fileName: string, fileType?: string): boolean {
  if (fileType && fileType.toLowerCase().startsWith('image/')) return true;
  if (fileUrl.startsWith('data:image')) return true;
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(fileName);
}

export function isPdfAttachment(fileUrl: string, fileName: string, fileType?: string): boolean {
  if (fileType && fileType.toLowerCase().includes('pdf')) return true;
  if (fileUrl.startsWith('data:application/pdf')) return true;
  return /\.pdf$/i.test(fileName);
}

export function isTextAttachment(fileName: string, fileType?: string): boolean {
  if (fileType && (fileType.startsWith('text/') || fileType === 'application/json')) return true;
  return /\.(txt|csv|md|json|log)$/i.test(fileName);
}

export async function printDocumentFile(
  rawFileUrl: string,
  fileName: string,
  options?: PrintOptions,
  fileType?: string,
  storagePath?: string
): Promise<boolean> {
  const normalizedUrl = normalizeFileUrl(rawFileUrl);
  const fileUrl = await resolveFileUrlCrossInstance(normalizedUrl, storagePath, fileType);
  return new Promise((resolve) => {
    try {
      const isImage = isImageAttachment(normalizedUrl, fileName, fileType);
      const isText = !isImage && !isPdfAttachment(normalizedUrl, fileName, fileType) && isTextAttachment(fileName, fileType);
      const isBW = options?.colorMode === 'BW';
      const marginMm = resolveMarginMm(options?.margin);
      const fitCss = resolveObjectFitCss(options?.fitMode);
      const rotationDeg = options?.rotation || 0;
      const paperSize = options?.paperSize || 'A4';
      const orientation = options?.orientation || 'portrait';

      // Remove stale print frames older than previous run
      const existing = document.getElementById('secureprint-print-frame');
      if (existing) existing.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'secureprint-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      if (isImage) {
        const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
        if (!frameDoc) {
          fallbackDownload(fileUrl, fileName);
          resolve(true);
          return;
        }

        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Print - ${escapeHtml(fileName)}</title>
              <style>
                @page {
                  size: ${paperSize} ${orientation};
                  margin: ${marginMm};
                }
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 100%;
                  height: 100%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: white;
                  overflow: hidden;
                }
                img {
                  ${fitCss}
                  ${rotationDeg ? `transform: rotate(${rotationDeg}deg);` : ''}
                  ${isBW ? 'filter: grayscale(100%) contrast(120%); -webkit-filter: grayscale(100%) contrast(120%);' : ''}
                }
              </style>
            </head>
            <body>
              <img id="print-target" src="${fileUrl}" alt="${escapeHtml(fileName)}" />
            </body>
          </html>
        `;

        frameDoc.open();
        frameDoc.write(html);
        frameDoc.close();

        const img = frameDoc.getElementById('print-target') as HTMLImageElement;
        const trigger = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              resolve(true);
            } catch (err) {
              console.warn('Iframe print failed, triggering download fallback:', err);
              fallbackDownload(fileUrl, fileName);
              resolve(true);
            }
          }, 300);
        };

        if (img.complete) {
          trigger();
        } else {
          img.onload = trigger;
          img.onerror = () => {
            fallbackDownload(fileUrl, fileName);
            resolve(true);
          };
        }
      } else if (isText) {
        fetch(fileUrl)
          .then((res) => res.text())
          .then((textContent) => {
            const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
            if (!frameDoc) {
              fallbackDownload(fileUrl, fileName);
              resolve(true);
              return;
            }
            const html = `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8" />
                  <title>Print - ${escapeHtml(fileName)}</title>
                  <style>
                    @page {
                      size: ${paperSize} ${orientation};
                      margin: ${marginMm};
                    }
                    body {
                      margin: 0;
                      padding: 0;
                      background: white;
                      color: #0f172a;
                      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                      font-size: 11pt;
                      line-height: 1.5;
                      ${isBW ? 'filter: grayscale(100%);' : ''}
                    }
                    pre {
                      margin: 0;
                      white-space: pre-wrap;
                      word-break: break-word;
                    }
                  </style>
                </head>
                <body>
                  <pre>${escapeHtml(textContent)}</pre>
                </body>
              </html>
            `;
            frameDoc.open();
            frameDoc.write(html);
            frameDoc.close();
            setTimeout(() => {
              try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                resolve(true);
              } catch {
                fallbackDownload(fileUrl, fileName);
                resolve(true);
              }
            }, 250);
          })
          .catch(() => {
            fallbackDownload(fileUrl, fileName);
            resolve(true);
          });
      } else {
        // PDF or native browser-printable document
        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              resolve(true);
            } catch (err) {
              console.warn('PDF iframe print trigger issue, downloading fallback:', err);
              fallbackDownload(fileUrl, fileName);
              resolve(true);
            }
          }, 500);
        };
        iframe.src = fileUrl;
      }
    } catch (err) {
      console.error('Print engine error:', err);
      fallbackDownload(fileUrl, fileName);
      resolve(true);
    }
  });
}

export async function printMultipleDocumentFiles(
  files: Array<{ url: string; name: string; type?: string; storagePath?: string }>,
  options?: PrintOptions
): Promise<boolean> {
  if (!files || files.length === 0) return false;
  if (files.length === 1) {
    return printDocumentFile(files[0].url, files[0].name, options, files[0].type, files[0].storagePath);
  }

  const normalizedFiles = await Promise.all(
    files.map(async (f) => {
      const norm = normalizeFileUrl(f.url);
      const resolved = await resolveFileUrlCrossInstance(norm, f.storagePath, f.type);
      return {
        rawNorm: norm,
        url: resolved,
        name: f.name,
        type: f.type,
        storagePath: f.storagePath
      };
    })
  );

  const allImages = normalizedFiles.every((f) => isImageAttachment(f.rawNorm, f.name, f.type));

  if (allImages) {
    return new Promise((resolve) => {
      try {
        const existing = document.getElementById('secureprint-print-frame');
        if (existing) existing.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'secureprint-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);

        const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
        if (!frameDoc) {
          normalizedFiles.forEach((f) => fallbackDownload(f.url, f.name));
          resolve(true);
          return;
        }

        const isBW = options?.colorMode === 'BW';
        const marginMm = resolveMarginMm(options?.margin);
        const fitCss = resolveObjectFitCss(options?.fitMode);
        const rotationDeg = options?.rotation || 0;
        const paperSize = options?.paperSize || 'A4';
        const orientation = options?.orientation || 'portrait';

        const pagesHtml = normalizedFiles
          .map(
            (f, idx) => `
            <div class="sheet${idx < normalizedFiles.length - 1 ? ' page-break' : ''}">
              <img class="batch-img" src="${f.url}" alt="${escapeHtml(f.name)}" />
            </div>
          `
          )
          .join('');

        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Batch Print (${normalizedFiles.length} files)</title>
              <style>
                @page {
                  size: ${paperSize} ${orientation};
                  margin: ${marginMm};
                }
                html, body {
                  margin: 0;
                  padding: 0;
                  background: white;
                }
                .sheet {
                  width: 100%;
                  min-height: 95vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  overflow: hidden;
                }
                .page-break {
                  page-break-after: always;
                  break-after: page;
                }
                .batch-img {
                  ${fitCss}
                  ${rotationDeg ? `transform: rotate(${rotationDeg}deg);` : ''}
                  ${isBW ? 'filter: grayscale(100%) contrast(120%); -webkit-filter: grayscale(100%) contrast(120%);' : ''}
                }
              </style>
            </head>
            <body>${pagesHtml}</body>
          </html>
        `;

        frameDoc.open();
        frameDoc.write(html);
        frameDoc.close();

        const imgs = Array.from(frameDoc.querySelectorAll('.batch-img')) as HTMLImageElement[];
        let remaining = imgs.length;
        const checkDone = () => {
          remaining -= 1;
          if (remaining <= 0) {
            setTimeout(() => {
              try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                resolve(true);
              } catch {
                resolve(true);
              }
            }, 300);
          }
        };

        imgs.forEach((img) => {
          if (img.complete) {
            checkDone();
          } else {
            img.onload = checkDone;
            img.onerror = checkDone;
          }
        });
      } catch {
        resolve(false);
      }
    });
  }

  // Sequential spooling with separate non-colliding hidden iframes for PDFs/mixed files
  for (let i = 0; i < normalizedFiles.length; i++) {
    const f = normalizedFiles[i];
    await printDocumentFile(f.url, f.name, options, f.type);
  }
  return true;
}

function fallbackDownload(fileUrl: string, fileName?: string) {
  try {
    const a = document.createElement('a');
    a.href = normalizeFileUrl(fileUrl, true);
    if (fileName) {
      a.download = fileName;
    }
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
    }, 500);
  } catch (e) {
    console.warn('Fallback download anchor trigger error:', e);
  }
}

export interface StandeePrintData {
  shopName: string;
  publicCode: string;
  customerUrl: string;
  qrDataUrl: string;
}

export function printStandeeCard(data: StandeePrintData): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const existing = document.getElementById('secureprint-standee-frame');
      if (existing) existing.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'secureprint-standee-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc) {
        window.print();
        resolve(true);
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>QR Standee - ${data.shopName}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 15mm;
              }
              * {
                box-sizing: border-box;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              }
              body {
                margin: 0;
                padding: 0;
                background: white;
                color: #0f172a;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 90vh;
              }
              .standee-card {
                width: 100%;
                max-width: 440px;
                border: 3px solid #0f172a;
                border-radius: 28px;
                padding: 36px 28px;
                text-align: center;
                background: #ffffff;
                box-shadow: none;
              }
              .brand-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: #059669;
                color: white;
                padding: 6px 16px;
                border-radius: 9999px;
                font-size: 13px;
                font-weight: 800;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                margin-bottom: 16px;
              }
              .shop-title {
                font-size: 26px;
                font-weight: 900;
                color: #0f172a;
                margin: 0 0 4px 0;
                letter-spacing: -0.5px;
              }
              .subtitle {
                font-size: 12px;
                font-weight: 700;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                margin: 0 0 24px 0;
              }
              .qr-box {
                background: #f8fafc;
                border: 2px dashed #cbd5e1;
                border-radius: 20px;
                padding: 16px;
                display: inline-block;
                margin: 0 auto 20px auto;
              }
              .qr-img {
                width: 240px;
                height: 240px;
                display: block;
                border-radius: 12px;
              }
              .action-title {
                font-size: 18px;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 8px 0;
              }
              .instruction {
                font-size: 12px;
                color: #475569;
                line-height: 1.5;
                margin: 0 auto 24px auto;
                max-width: 320px;
              }
              .steps {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                background: #f1f5f9;
                padding: 12px;
                border-radius: 14px;
                margin-bottom: 20px;
                text-align: left;
                font-size: 11px;
                color: #334155;
              }
              .step-item {
                flex: 1;
              }
              .step-num {
                font-weight: 800;
                color: #059669;
                display: block;
                margin-bottom: 2px;
              }
              .footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top: 1px solid #e2e8f0;
                padding-top: 16px;
                font-size: 11px;
                color: #64748b;
              }
              .code-label {
                font-size: 9px;
                text-transform: uppercase;
                color: #94a3b8;
                display: block;
              }
              .code-value {
                font-family: monospace;
                font-weight: 800;
                font-size: 14px;
                color: #0f172a;
              }
              .privacy-badge {
                color: #047857;
                font-weight: 700;
              }
            </style>
          </head>
          <body>
            <div class="standee-card">
              <div class="brand-badge">SecurePrint Digital Desk</div>
              <h1 class="shop-title">${data.shopName}</h1>
              <div class="subtitle">Official Xerox & Print Counter</div>

              <div class="qr-box">
                <img id="qr-target" class="qr-img" src="${data.qrDataUrl}" alt="Scan to Print QR" />
              </div>

              <div class="action-title">Scan with Phone Camera to Print</div>
              <p class="instruction">
                No app install required. Open camera, scan QR code, upload documents, and share your 6-digit token.
              </p>

              <div class="steps">
                <div class="step-item">
                  <span class="step-num">STEP 1</span>
                  Scan QR code
                </div>
                <div class="step-item">
                  <span class="step-num">STEP 2</span>
                  Upload & chat
                </div>
                <div class="step-item">
                  <span class="step-num">STEP 3</span>
                  Collect print
                </div>
              </div>

              <div class="footer">
                <div style="text-align: left;">
                  <span class="code-label">Shop Counter Code</span>
                  <span class="code-value">${data.publicCode}</span>
                </div>
                <div style="text-align: right;">
                  <span class="privacy-badge">🔒 5-Hour Auto-Purge</span>
                  <div style="font-size: 9px; color: #94a3b8;">Zero Data Leaks</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      const img = frameDoc.getElementById('qr-target') as HTMLImageElement;
      const trigger = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (err) {
            console.warn('Iframe print error:', err);
            window.print();
            resolve(true);
          }
        }, 300);
      };

      if (img.complete) {
        trigger();
      } else {
        img.onload = trigger;
        img.onerror = () => {
          window.print();
          resolve(true);
        };
      }
    } catch (err) {
      console.error('Standee print error:', err);
      window.print();
      resolve(true);
    }
  });
}
