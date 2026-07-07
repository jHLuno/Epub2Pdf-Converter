import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { convertEpubToPdf } from './converter.js';
import { isEpubArchive, isEpubUpload, sanitizeBaseName } from './fileValidation.js';

const configuredMaxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 30);
const safeMaxFileSizeMb = Number.isFinite(configuredMaxFileSizeMb) ? Math.max(1, configuredMaxFileSizeMb) : 30;
const defaultMaxFileSizeBytes = safeMaxFileSizeMb * 1024 * 1024;
const uploadDir = path.join(os.tmpdir(), 'epub-to-pdf-uploads');
const genericConversionError = 'Conversion failed. Please try another EPUB file.';
const defaultPublicSiteUrl = 'https://epub2pdf.up.railway.app';
const schemaScriptHash = "'sha256-sUNvtRAv8xg37U1OV+aE4EfSFnnoVE7ohqlHqmtV0fo='";

function normalizePublicSiteUrl(siteUrl = process.env.PUBLIC_SITE_URL || defaultPublicSiteUrl) {
  try {
    const url = new URL(siteUrl);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return defaultPublicSiteUrl;
  }
}

async function removeWorkDir(workDir) {
  if (workDir) {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function removeUpload(uploadPath) {
  if (uploadPath) {
    await fs.rm(uploadPath, { force: true });
  }
}

function uploadSingleBook(maxFileSizeBytes) {
  const upload = multer({
    dest: uploadDir,
    limits: {
      fileSize: maxFileSizeBytes
    }
  });

  return (req, res) =>
    new Promise((resolve, reject) => {
      upload.single('book')(req, res, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
}

export function createApp({ convert = convertEpubToPdf, maxFileSizeBytes = defaultMaxFileSizeBytes } = {}) {
  const app = express();
  const publicDir = path.resolve(process.cwd(), 'public');
  const publicSiteUrl = normalizePublicSiteUrl();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' ${schemaScriptHash}; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *
Allow: /

Sitemap: ${publicSiteUrl}/sitemap.xml
`);
  });

  app.get('/sitemap.xml', (_req, res) => {
    const lastmod = new Date().toISOString().slice(0, 10);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${publicSiteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);
  });

  app.use(express.static(publicDir));

  app.post('/convert', async (req, res) => {
    let workDir;
    let uploadPath;

    try {
      await uploadSingleBook(maxFileSizeBytes)(req, res);
      uploadPath = req.file?.path;

      if (!req.file) {
        res.status(400).json({ error: 'Choose an EPUB file first.' });
        return;
      }

      if (!isEpubUpload(req.file)) {
        await removeUpload(uploadPath);
        res.status(400).json({ error: 'Only .epub files can be converted.' });
        return;
      }

      if (!(await isEpubArchive(uploadPath))) {
        await removeUpload(uploadPath);
        res.status(400).json({ error: 'Upload a valid EPUB archive.' });
        return;
      }

      workDir = await fs.mkdtemp(path.join(os.tmpdir(), `epub-to-pdf-${crypto.randomUUID()}-`));
      const baseName = sanitizeBaseName(req.file.originalname);
      const inputPath = path.join(workDir, `${baseName}.epub`);
      const outputPath = path.join(workDir, `${baseName}.pdf`);

      await fs.copyFile(uploadPath, inputPath);
      await convert(inputPath, outputPath);

      res.type('application/pdf');
      res.download(outputPath, `${baseName}.pdf`, (error) => {
        removeWorkDir(workDir).catch(() => {});
        removeUpload(uploadPath).catch(() => {});

        if (error && !res.headersSent) {
          res.status(500).json({ error: 'Could not send the converted PDF.' });
        }
      });
    } catch (error) {
      await removeUpload(uploadPath);
      await removeWorkDir(workDir);

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: `That EPUB is too large. The current limit is ${Math.floor(maxFileSizeBytes / 1024 / 1024)} MB.` });
        return;
      }

      console.error('EPUB conversion failed:', error);
      res.status(500).json({ error: genericConversionError });
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => {
    console.log(`EPUB to PDF converter running at http://localhost:${port}`);
  });
}
