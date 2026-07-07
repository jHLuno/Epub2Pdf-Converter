import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { isEpubArchive, isEpubUpload, sanitizeBaseName } from '../src/fileValidation.js';

describe('isEpubUpload', () => {
  it('accepts files with an epub extension', () => {
    expect(isEpubUpload({ originalname: 'Book.epub' })).toBe(true);
    expect(isEpubUpload({ originalname: 'Book.EPUB' })).toBe(true);
  });

  it('rejects missing files and non-epub files', () => {
    expect(isEpubUpload(undefined)).toBe(false);
    expect(isEpubUpload({ originalname: 'Book.pdf' })).toBe(false);
    expect(isEpubUpload({ originalname: 'Book.epub.pdf' })).toBe(false);
  });
});

describe('sanitizeBaseName', () => {
  it('creates a safe pdf base name from an uploaded file name', () => {
    expect(sanitizeBaseName('My Book!.epub')).toBe('My_Book');
    expect(sanitizeBaseName('../bad.epub')).toBe('bad');
    expect(sanitizeBaseName('***.epub')).toBe('converted-book');
  });
});

describe('isEpubArchive', () => {
  it('accepts zip archives with the EPUB mimetype file', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-validation-'));
    const fixture = path.join(tmpRoot, 'book.epub');
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<container />');
    await fs.writeFile(fixture, await zip.generateAsync({ type: 'nodebuffer' }));

    await expect(isEpubArchive(fixture)).resolves.toBe(true);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('rejects renamed non-EPUB files', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-validation-'));
    const fixture = path.join(tmpRoot, 'book.epub');
    await fs.writeFile(fixture, '%PDF-1.4\nnot an epub');

    await expect(isEpubArchive(fixture)).resolves.toBe(false);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
