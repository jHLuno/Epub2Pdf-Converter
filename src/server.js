import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { runEbookConvert } from './converter.js';
import { isEpubUpload, sanitizeBaseName } from './fileValidation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

async function removeWorkDir(workDir) {
  await fs.rm(workDir, { recursive: true, force: true });
}

export function createApp({ convert = runEbookConvert } = {}) {
  const app = express();
  const publicDir = path.resolve(process.cwd(), 'public');

  app.use(express.static(publicDir));

  app.post('/convert', upload.single('book'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Choose an EPUB file first.' });
      return;
    }

    if (!isEpubUpload(req.file)) {
      res.status(400).json({ error: 'Only .epub files can be converted.' });
      return;
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `epub-to-pdf-${crypto.randomUUID()}-`));
    const baseName = sanitizeBaseName(req.file.originalname);
    const inputPath = path.join(workDir, `${baseName}.epub`);
    const outputPath = path.join(workDir, `${baseName}.pdf`);

    try {
      await fs.writeFile(inputPath, req.file.buffer);
      await convert(inputPath, outputPath);

      res.type('application/pdf');
      res.download(outputPath, `${baseName}.pdf`, (error) => {
        removeWorkDir(workDir).catch(() => {});

        if (error && !res.headersSent) {
          res.status(500).json({ error: 'Could not send the converted PDF.' });
        }
      });
    } catch (error) {
      await removeWorkDir(workDir);
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
