import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { convertSimpleEpubToPdf, renderTimeoutMs } from '../src/simpleEpubPdf.js';

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

async function makeExternalAssetEpub(filePath, assetUrl) {
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
        <dc:title>External Asset Test</dc:title>
      </metadata>
      <manifest>
        <item id="chapter-one" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="chapter-one"/>
      </spine>
    </package>`
  );
  zip.file(
    'OPS/chapter1.xhtml',
    `<!doctype html><html><body><h1>External Asset</h1><p>This chapter should still convert.</p><img src="${assetUrl}"></body></html>`
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
}

async function makeFixedLayoutEpub(filePath) {
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
        <dc:title>Fixed Layout Test</dc:title>
        <meta property="rendition:layout">pre-paginated</meta>
      </metadata>
      <manifest>
        <item id="page-one" href="page1.xhtml" media-type="application/xhtml+xml"/>
        <item id="page-two" href="page2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="page-one"/>
        <itemref idref="page-two"/>
      </spine>
    </package>`
  );
  zip.file(
    'OPS/page1.xhtml',
    `<!doctype html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=420,height=600"></head>
      <body style="width:420px;height:600px;margin:0">
        <span style="position:absolute;left:20px;top:20px;font-size:32px">PAGE ONE ONLY</span>
      </body>
    </html>`
  );
  zip.file(
    'OPS/page2.xhtml',
    `<!doctype html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=420,height=600"></head>
      <body style="width:420px;height:600px;margin:0">
        <span style="position:absolute;left:20px;top:20px;font-size:32px">PAGE TWO ONLY</span>
      </body>
    </html>`
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
}

async function withHangingServer(callback) {
  const sockets = new Set();
  const server = http.createServer((_req, _res) => {});

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}/hanging-image.png`);
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }

    await new Promise((resolve) => server.close(resolve));
  }
}

describe('convertSimpleEpubToPdf', () => {
  it('allows large EPUB render jobs to run longer than Puppeteer defaults', () => {
    expect(renderTimeoutMs).toBeGreaterThan(30_000);
  });

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

  it('does not hang on external EPUB assets that never respond', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'external.epub');
    const outputPath = path.join(tmpRoot, 'external.pdf');

    await withHangingServer(async (assetUrl) => {
      await makeExternalAssetEpub(inputPath, assetUrl);
      await convertSimpleEpubToPdf(inputPath, outputPath);
    });

    const { stdout } = await execFileAsync('pdftotext', [outputPath, '-']);
    expect(stdout).toContain('This chapter should still convert.');
  }, 12000);

  it('keeps fixed-layout absolute-positioned pages separate', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-epub-test-'));
    const inputPath = path.join(tmpRoot, 'fixed.epub');
    const outputPath = path.join(tmpRoot, 'fixed.pdf');
    await makeFixedLayoutEpub(inputPath);

    await convertSimpleEpubToPdf(inputPath, outputPath);

    const { stdout } = await execFileAsync('pdftotext', [outputPath, '-']);
    const pages = stdout.split('\f');
    expect(pages[0]).toContain('PAGE ONE ONLY');
    expect(pages[0]).not.toContain('PAGE TWO ONLY');
    expect(pages[1]).toContain('PAGE TWO ONLY');

    const { stdout: info } = await execFileAsync('pdfinfo', [outputPath]);
    expect(info).toMatch(/Page size:\s+315(?:\.\d+)? x 450(?:\.\d+)? pts/);
  }, 30000);
});
