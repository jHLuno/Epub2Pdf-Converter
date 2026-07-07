import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { parse } from 'node-html-parser';
import PDFDocument from 'pdfkit';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  textNodeName: '#text',
  trimValues: true
});

function asArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return textValue(value[0]);
  }

  if (value && typeof value === 'object') {
    return textValue(value['#text']);
  }

  return '';
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function safeDecodeUri(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function resolveZipPath(fromFile, href) {
  const cleanHref = safeDecodeUri(href).split('#')[0];
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), cleanHref));
}

async function readZipText(zip, filePath) {
  const file = zip.file(filePath);

  if (!file) {
    throw new Error(`Could not read EPUB file: missing ${filePath}.`);
  }

  return file.async('string');
}

function isHtmlManifestItem(item) {
  const mediaType = item['media-type'] || '';
  const href = item.href || '';
  return mediaType.includes('html') || /\.(xhtml|html?)$/i.test(href);
}

function extractTitle(packageDocument) {
  const metadata = packageDocument?.package?.metadata;
  const title = textValue(metadata?.['dc:title'] || metadata?.title);
  return normalizeWhitespace(title) || 'Converted EPUB';
}

async function readChapters(zip) {
  const containerXml = await readZipText(zip, 'META-INF/container.xml');
  const container = xmlParser.parse(containerXml);
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootfile?.['full-path'];

  if (!opfPath) {
    throw new Error('Could not read EPUB structure: missing package document.');
  }

  const opfXml = await readZipText(zip, opfPath);
  const packageDocument = xmlParser.parse(opfXml);
  const manifestItems = asArray(packageDocument?.package?.manifest?.item);
  const spineItems = asArray(packageDocument?.package?.spine?.itemref);
  const itemById = new Map(manifestItems.map((item) => [item.id, item]));
  const spineHtmlItems = spineItems.map((itemref) => itemById.get(itemref.idref)).filter((item) => item && isHtmlManifestItem(item));
  const readableItems = spineHtmlItems.length > 0 ? spineHtmlItems : manifestItems.filter(isHtmlManifestItem);

  if (readableItems.length === 0) {
    throw new Error('Could not read EPUB structure: no readable chapters found.');
  }

  const chapters = [];

  for (const item of readableItems) {
    const chapterPath = resolveZipPath(opfPath, item.href);
    const html = await readZipText(zip, chapterPath);
    const paragraphs = htmlToParagraphs(html);

    if (paragraphs.length > 0) {
      chapters.push({ path: chapterPath, paragraphs });
    }
  }

  return {
    title: extractTitle(packageDocument),
    chapters
  };
}

function htmlToParagraphs(html) {
  const root = parse(html, {
    blockTextElements: {
      script: false,
      style: false,
      pre: true
    },
    comment: false
  });

  for (const node of root.querySelectorAll('script, style, nav')) {
    node.remove();
  }

  const blockNodes = root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote');
  const paragraphs = blockNodes.map((node) => normalizeWhitespace(node.textContent)).filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  const fallback = normalizeWhitespace(root.textContent);
  return fallback ? [fallback] : [];
}

async function writePdf({ title, chapters }, outputPath) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 54,
      compress: false,
      info: {
        Title: title
      }
    });
    const output = fs.createWriteStream(outputPath);
    let settled = false;

    function settle(callback, value) {
      if (settled) {
        return;
      }

      settled = true;
      callback(value);
    }

    output.on('finish', () => settle(resolve));
    output.on('error', (error) => settle(reject, error));
    doc.on('error', (error) => settle(reject, error));

    doc.pipe(output);
    doc.font('Times-Bold').fontSize(22).text(title, { lineGap: 4 });
    doc.moveDown(1);

    const readableChapters = chapters.filter((chapter) => chapter.paragraphs.length > 0);

    if (readableChapters.length === 0) {
      doc.font('Times-Roman').fontSize(11).text('This EPUB did not contain readable text.');
      doc.end();
      return;
    }

    readableChapters.forEach((chapter, chapterIndex) => {
      if (chapterIndex > 0) {
        doc.addPage();
      }

      chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
        const isLikelyHeading = paragraphIndex === 0 && paragraph.length < 120;
        doc.font(isLikelyHeading ? 'Times-Bold' : 'Times-Roman').fontSize(isLikelyHeading ? 16 : 11);
        doc.text(paragraph, { lineGap: 2, paragraphGap: 8 });
        doc.moveDown(isLikelyHeading ? 0.7 : 0.35);
      });
    });

    doc.end();
  });
}

export async function convertSimpleEpubToPdf(inputPath, outputPath) {
  let zip;

  try {
    const input = await fsp.readFile(inputPath);
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new Error('Could not read EPUB archive.');
  }

  const content = await readChapters(zip);
  await writePdf(content, outputPath);
}
