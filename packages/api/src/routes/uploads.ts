import { FastifyPluginCallback } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppContext } from '../app';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
]);

export function uploadRoutes(_ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Register multipart plugin
    app.register(multipart, {
      limits: { fileSize: MAX_FILE_SIZE },
    });

    // Ensure upload dir exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    // Upload a file — returns a reference for use in chat messages
    app.post('/', async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      if (!ALLOWED_TYPES.has(file.mimetype)) {
        return reply.status(400).send({
          error: `Unsupported file type: ${file.mimetype}. Supported: images (PNG, JPEG, GIF, WebP), PDF, text, CSV, JSON, Excel.`,
        });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: 'File too large (max 10MB)' });
      }

      const fileId = crypto.randomUUID();
      const ext = path.extname(file.filename) || mimeToExt(file.mimetype);
      const storedName = `${fileId}${ext}`;
      const filePath = path.join(UPLOAD_DIR, storedName);

      fs.writeFileSync(filePath, buffer);

      const isImage = file.mimetype.startsWith('image/');

      return {
        id: fileId,
        filename: file.filename,
        mimeType: file.mimetype,
        size: buffer.length,
        type: isImage ? 'image' : 'file',
        uri: `/api/uploads/${storedName}`,
      };
    });

    // Serve uploaded files
    app.get<{ Params: { filename: string } }>('/:filename', async (request, reply) => {
      const filePath = path.join(UPLOAD_DIR, request.params.filename);
      // Prevent directory traversal
      if (!filePath.startsWith(UPLOAD_DIR)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File not found' });
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = extToMime(ext);
      return reply.type(contentType).send(fs.readFileSync(filePath));
    });

    done();
  };
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
    'application/pdf': '.pdf', 'text/plain': '.txt', 'text/csv': '.csv',
    'application/json': '.json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
  };
  return map[mime] || '.bin';
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
    '.json': 'application/json', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };
  return map[ext] || 'application/octet-stream';
}
