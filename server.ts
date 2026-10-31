import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const UPLOADS_DIR = path.join('/tmp', 'secureprint_uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory file metadata registry
interface StoredFileMeta {
  fileId: string;
  originalName: string;
  sanitizedName: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
}

const fileRegistry = new Map<string, StoredFileMeta>();

async function startServer() {
  const app = express();

  // Allow cross-origin requests & iframe usage
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Body parser for JSON base64 payloads (up to 50MB)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), storedFiles: fileRegistry.size });
  });

  // API: Upload Document or Photo
  app.post('/api/upload', (req, res) => {
    try {
      const { fileName, fileType, fileData, shopId, sessionId } = req.body;

      if (!fileData || !fileName) {
        res.status(400).json({ error: 'fileName and fileData are required.' });
        return;
      }

      // Extract base64 payload (handles data:application/pdf;base64,.... or raw base64)
      const commaIdx = fileData.indexOf(',');
      const base64Str = commaIdx !== -1 ? fileData.slice(commaIdx + 1) : fileData;
      const fileBuffer = Buffer.from(base64Str, 'base64');

      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const requestedId =
        typeof req.body.fileId === 'string' && /^doc_[a-zA-Z0-9_]+$/.test(req.body.fileId)
          ? req.body.fileId
          : null;
      const fileId = requestedId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const savedFileName = `${fileId}_${sanitizedName}`;
      const targetPath = path.join(UPLOADS_DIR, savedFileName);

      fs.writeFileSync(targetPath, fileBuffer);

      const mimeType = fileType || 'application/octet-stream';
      const meta: StoredFileMeta = {
        fileId,
        originalName: fileName,
        sanitizedName,
        mimeType,
        size: fileBuffer.length,
        uploadedAt: Date.now()
      };
      fileRegistry.set(fileId, meta);

      // Construct URL (both relative and absolute)
      const downloadUrl = `/api/files/${fileId}`;

      res.status(200).json({
        fileId,
        fileName: meta.originalName,
        fileType: meta.mimeType,
        fileSize: meta.size,
        downloadUrl,
        storagePath: targetPath,
        shopId: shopId || '',
        sessionId: sessionId || ''
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process file upload.';
      console.error('Upload handler error:', err);
      res.status(500).json({ error: message });
    }
  });

  // API: Serve / Stream file for preview or print
  app.get('/api/files/:fileId', (req, res) => {
    try {
      const { fileId } = req.params;
      const meta = fileRegistry.get(fileId);

      // Find file on disk starting with fileId
      const files = fs.readdirSync(UPLOADS_DIR);
      const match = files.find(f => f.startsWith(fileId));

      if (!match) {
        res.status(404).send('File not found or expired.');
        return;
      }

      const filePath = path.join(UPLOADS_DIR, match);
      const stat = fs.statSync(filePath);
      const displayName = meta ? meta.originalName : match.replace(`${fileId}_`, '');
      const ext = path.extname(displayName).toLowerCase();
      const mimeByExt: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain; charset=utf-8',
        '.csv': 'text/csv; charset=utf-8',
        '.md': 'text/plain; charset=utf-8',
        '.log': 'text/plain; charset=utf-8',
        '.json': 'application/json',
      };
      const inferredMime = mimeByExt[ext] || 'application/octet-stream';
      const mimeType =
        meta && meta.mimeType && meta.mimeType !== 'application/octet-stream'
          ? meta.mimeType
          : inferredMime;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      // Inline preview unless download=true requested
      if (req.query.download === 'true') {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(displayName)}"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(displayName)}"`);
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err: unknown) {
      console.error('File serving error:', err);
      res.status(500).send('Error reading file.');
    }
  });

  // API: Delete file (Permanent delete from counter & storage)
  app.delete('/api/files/:fileId', (req, res) => {
    try {
      const { fileId } = req.params;
      fileRegistry.delete(fileId);

      const files = fs.readdirSync(UPLOADS_DIR);
      const matches = files.filter(f => f.startsWith(fileId));
      for (const m of matches) {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, m));
        } catch (e) {
          console.warn('Failed to delete file from disk:', e);
        }
      }

      res.json({ success: true, deletedFileId: fileId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete file.';
      res.status(500).json({ error: message });
    }
  });

  // Return JSON 404 for unknown API routes before SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Integration with Vite (dev) or static dist serving (production / npm start)
  const distPath = path.join(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event === 'start' && fs.existsSync(distIndexPath));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: false,
        watch: null,
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SecurePrint Full-Stack Server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
