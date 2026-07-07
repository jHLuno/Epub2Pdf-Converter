import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { convertEpubToPdf } from './converter.js';
import { isEpubUpload, sanitizeBaseName } from './fileValidation.js';

const defaultMaxFileSizeBytes = 750 * 1024 * 1024;
const uploadDir = path.join(os.tmpdir(), 'epub-to-pdf-uploads');

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
      res.status(500).json({ error: error.message || 'Conversion failed.' });
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
