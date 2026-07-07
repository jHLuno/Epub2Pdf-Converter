import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { convertSimpleEpubToPdf } from '../src/simpleEpubPdf.js';

let tmpRoot;

afterEach(async () => {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  }
});

async function makeMinimalEpub(filePath) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`
  );
  zip.file(
    'OPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Tiny Test Book</dc:title>
      </metadata>
      <manifest>
        <item id="chapter-one" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="chapter-two" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="chapter-one"/>
        <itemref idref="chapter-two"/>
      </spine>
    </package>`
  );
  zip.file(
    'OPS/chapter1.xhtml',
    `<!doctype html><html><body><h1>Chapter One</h1><p>Hello from an EPUB file.</p></body></html>`
  );
  zip.file(
    'OPS/chapter2.xhtml',
    `<!doctype html><html><body><h2>Chapter Two</h2><p>This text should land in the PDF.</p></body></html>`
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
}

describe('convertSimpleEpubToPdf', () => {
  it('creates a PDF from a minimal EPUB', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'book.epub');
    const outputPath = path.join(tmpRoot, 'book.pdf');
    await makeMinimalEpub(inputPath);

    await convertSimpleEpubToPdf(inputPath, outputPath);

    const pdf = await fs.readFile(outputPath);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('rejects an invalid EPUB archive with a readable error', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'bad.epub');
    const outputPath = path.join(tmpRoot, 'bad.pdf');
    await fs.writeFile(inputPath, 'not a zip');

    await expect(convertSimpleEpubToPdf(inputPath, outputPath)).rejects.toThrow('Could not read EPUB');
  });
});
