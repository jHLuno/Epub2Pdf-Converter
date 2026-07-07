import { describe, expect, it } from 'vitest';
import { isEpubUpload, sanitizeBaseName } from '../src/fileValidation.js';

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
