import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { convertSimpleEpubToPdf } from '../src/simpleEpubPdf.js';

const execFileAsync = promisify(execFile);
const redPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAkElEQVR4nO3QQQ3AIADAQMAfUCQw' +
    'tLkRieQ0P7bP1u41T3A2gU0Cm4Q2CWwS2iSwSWCTwCahTQKbhDYJbBLYJLBBYJPQJoFNQpsENglsEtoksElgk8AmoU0Cm4Q2CWwS2CSwSWCT0CaBTUKbBDYJbBLYJLBJYJPQJoFNQpsENglsEtgksEloB7dTAtkXNq8xAAAAAElFTkSuQmCC',
  'base64'
);

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

async function makeRichEpub(filePath) {
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
        <dc:title>Русская книга</dc:title>
      </metadata>
      <manifest>
        <item id="chapter-one" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="red-image" href="images/red.png" media-type="image/png"/>
      </manifest>
      <spine>
        <itemref idref="chapter-one"/>
      </spine>
    </package>`
  );
  zip.file(
    'OPS/chapter1.xhtml',
    `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; }
          img { width: 180px; height: 180px; display: block; margin-top: 24px; }
        </style>
      </head>
      <body>
        <h1>Привет мир</h1>
        <p>Это тестовая русская глава с изображением.</p>
        <img alt="Red square" src="images/red.png">
      </body>
    </html>`
  );
  zip.file('OPS/images/red.png', redPng);

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
  }, 30000);

  it('rejects an invalid EPUB archive with a readable error', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'bad.epub');
    const outputPath = path.join(tmpRoot, 'bad.pdf');
    await fs.writeFile(inputPath, 'not a zip');

    await expect(convertSimpleEpubToPdf(inputPath, outputPath)).rejects.toThrow('Could not read EPUB');
  });

  it('preserves Cyrillic text in the generated PDF', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'russian.epub');
    const outputPath = path.join(tmpRoot, 'russian.pdf');
    await makeRichEpub(inputPath);

    await convertSimpleEpubToPdf(inputPath, outputPath);

    const { stdout } = await execFileAsync('pdftotext', [outputPath, '-']);
    expect(stdout).toContain('Привет мир');
    expect(stdout).toContain('Это тестовая русская глава');
  }, 30000);

  it('preserves raster images in the generated PDF', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'image.epub');
    const outputPath = path.join(tmpRoot, 'image.pdf');
    await makeRichEpub(inputPath);

    await convertSimpleEpubToPdf(inputPath, outputPath);

    const { stdout } = await execFileAsync('pdfimages', ['-list', outputPath]);
    const imageRows = stdout.split('\n').filter((line) => /^\s*\d+\s+\d+/.test(line));
    expect(imageRows.length).toBeGreaterThan(0);
  }, 30000);
});
