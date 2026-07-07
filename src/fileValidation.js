import path from 'node:path';

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
