import path from 'node:path';
import fs from 'node:fs/promises';
import JSZip from 'jszip';

export function isEpubUpload(file) {
  if (!file || typeof file.originalname !== 'string') {
    return false;
  }

  return path.extname(file.originalname).toLowerCase() === '.epub';
}

export function sanitizeBaseName(fileName) {
  const parsed = path.parse(fileName || '');
  const safe = parsed.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return safe || 'converted-book';
}

export async function isEpubArchive(filePath) {
  try {
    const input = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(input);
    const mimetype = await zip.file('mimetype')?.async('string');
    return mimetype?.trim() === 'application/epub+zip';
  } catch {
    return false;
  }
}
