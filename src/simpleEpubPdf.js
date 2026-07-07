import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { parse } from 'node-html-parser';
import puppeteer from 'puppeteer';

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

function safeZipEntryPath(zipPath) {
  const normalized = path.posix.normalize(safeDecodeUri(zipPath));

  if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
    throw new Error('Could not read EPUB archive: unsafe file path.');
  }

  return normalized;
}

function resolveZipPath(fromFile, href) {
  const cleanHref = safeDecodeUri(href).split('#')[0];
  return safeZipEntryPath(path.posix.join(path.posix.dirname(fromFile), cleanHref));
}

function isExternalUrl(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value);
}

function fileUrlForZipPath(renderDir, zipPath) {
  return pathToFileURL(path.join(renderDir, ...safeZipEntryPath(zipPath).split('/'))).href;
}

async function readZipText(zip, filePath) {
  const file = zip.file(filePath);

  if (!file) {
    throw new Error(`Could not read EPUB file: missing ${filePath}.`);
  }

  return file.async('string');
}

async function extractZip(zip, renderDir) {
  const writes = [];

  zip.forEach((relativePath, entry) => {
    if (entry.dir) {
      return;
    }

    const safePath = safeZipEntryPath(relativePath);
    const outputPath = path.join(renderDir, ...safePath.split('/'));

    writes.push(
      entry.async('nodebuffer').then(async (buffer) => {
        await fsp.mkdir(path.dirname(outputPath), { recursive: true });
        await fsp.writeFile(outputPath, buffer);
      })
    );
  });

  await Promise.all(writes);
}

function isHtmlManifestItem(item) {
  const mediaType = item?.['media-type'] || '';
  const href = item?.href || '';
  return mediaType.includes('html') || /\.(xhtml|html?)$/i.test(href);
}

function extractTitle(packageDocument) {
  const metadata = packageDocument?.package?.metadata;
  const title = textValue(metadata?.['dc:title'] || metadata?.title);
  return normalizeWhitespace(title) || 'Converted EPUB';
}

async function readPackage(zip) {
  const containerXml = await readZipText(zip, 'META-INF/container.xml');
  const container = xmlParser.parse(containerXml);
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootfile?.['full-path'];

  if (!opfPath) {
    throw new Error('Could not read EPUB structure: missing package document.');
  }

  const safeOpfPath = safeZipEntryPath(opfPath);
  const opfXml = await readZipText(zip, safeOpfPath);
  const packageDocument = xmlParser.parse(opfXml);
  const manifestItems = asArray(packageDocument?.package?.manifest?.item);
  const spineItems = asArray(packageDocument?.package?.spine?.itemref);
  const itemById = new Map(manifestItems.map((item) => [item.id, item]));
  const spineHtmlItems = spineItems.map((itemref) => itemById.get(itemref.idref)).filter(isHtmlManifestItem);
  const readableItems = spineHtmlItems.length > 0 ? spineHtmlItems : manifestItems.filter(isHtmlManifestItem);

  if (readableItems.length === 0) {
    throw new Error('Could not read EPUB structure: no readable chapters found.');
  }

  return {
    title: extractTitle(packageDocument),
    chapters: readableItems.map((item) => resolveZipPath(safeOpfPath, item.href))
  };
}

function rewriteCssUrls(css, fromFile, renderDir) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, rawUrl) => {
    const trimmed = rawUrl.trim();

    if (!trimmed || isExternalUrl(trimmed)) {
      return match;
    }

    const resolved = resolveZipPath(fromFile, trimmed);
    return `url(${quote || '"'}${fileUrlForZipPath(renderDir, resolved)}${quote || '"'})`;
  });
}

function rewriteSrcset(srcset, fromFile, renderDir) {
  return srcset
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      const [url, ...descriptor] = trimmed.split(/\s+/);

      if (!url || isExternalUrl(url)) {
        return trimmed;
      }

      const resolved = resolveZipPath(fromFile, url);
      return [fileUrlForZipPath(renderDir, resolved), ...descriptor].join(' ');
    })
    .join(', ');
}

function rewriteElementUrls(root, chapterPath, renderDir) {
  for (const node of root.querySelectorAll('*')) {
    for (const attribute of ['src', 'poster', 'href', 'xlink:href']) {
      const value = node.getAttribute(attribute);

      if (!value || isExternalUrl(value)) {
        continue;
      }

      const isStylesheetLink = attribute === 'href' && node.tagName?.toLowerCase() === 'link';
      const isAnchor = attribute === 'href' && node.tagName?.toLowerCase() === 'a';

      if (isAnchor || isStylesheetLink) {
        continue;
      }

      node.setAttribute(attribute, fileUrlForZipPath(renderDir, resolveZipPath(chapterPath, value)));
    }

    const srcset = node.getAttribute('srcset');
    if (srcset) {
      node.setAttribute('srcset', rewriteSrcset(srcset, chapterPath, renderDir));
    }

    const style = node.getAttribute('style');
    if (style) {
      node.setAttribute('style', rewriteCssUrls(style, chapterPath, renderDir));
    }
  }
}

function collectChapterStyles(root, chapterPath, renderDir) {
  const styles = [];

  for (const link of root.querySelectorAll('link')) {
    const rel = link.getAttribute('rel') || '';
    const href = link.getAttribute('href');

    if (!href || !rel.toLowerCase().includes('stylesheet') || isExternalUrl(href)) {
      continue;
    }

    styles.push(`<link rel="stylesheet" href="${fileUrlForZipPath(renderDir, resolveZipPath(chapterPath, href))}">`);
  }

  for (const style of root.querySelectorAll('style')) {
    styles.push(`<style>${rewriteCssUrls(style.innerHTML, chapterPath, renderDir)}</style>`);
  }

  return styles;
}

async function buildPrintableHtml({ title, chapters }, zip, renderDir) {
  const styleBlocks = [];
  const sections = [];

  for (const chapterPath of chapters) {
    const html = await readZipText(zip, chapterPath);
    const root = parse(html, {
      blockTextElements: {
        script: false,
        style: true,
        pre: true
      },
      comment: false
    });

    for (const node of root.querySelectorAll('script')) {
      node.remove();
    }

    styleBlocks.push(...collectChapterStyles(root, chapterPath, renderDir));
    rewriteElementUrls(root, chapterPath, renderDir);

    const body = root.querySelector('body') || root;
    const bodyStyle = body.getAttribute?.('style');
    const sectionStyle = bodyStyle ? ` style="${rewriteCssUrls(bodyStyle, chapterPath, renderDir)}"` : '';
    sections.push(`<section class="epub-chapter"${sectionStyle}>${body.innerHTML}</section>`);
  }

  const escapedTitle = title.replace(/[&<>"']/g, (char) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[char];
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapedTitle}</title>
    <style>
      @page { margin: 18mm 16mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        color: #111;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Arial, sans-serif;
        font-size: 12pt;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      img, svg, video, canvas {
        max-width: 100%;
        height: auto;
      }
      table {
        max-width: 100%;
        border-collapse: collapse;
      }
      pre {
        white-space: pre-wrap;
      }
      .epub-chapter {
        break-after: page;
      }
      .epub-chapter:last-child {
        break-after: auto;
      }
    </style>
    ${styleBlocks.join('\n')}
  </head>
  <body>
    ${sections.join('\n')}
  </body>
</html>`;
}

async function printHtmlToPdf(htmlPath, outputPath) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security']
  });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0.45in',
        right: '0.45in',
        bottom: '0.45in',
        left: '0.45in'
      }
    });
  } finally {
    await browser.close();
  }
}

export async function convertSimpleEpubToPdf(inputPath, outputPath) {
  let zip;

  try {
    const input = await fsp.readFile(inputPath);
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new Error('Could not read EPUB archive.');
  }

  const renderDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'epub-render-'));

  try {
    await extractZip(zip, renderDir);
    const content = await readPackage(zip);
    const html = await buildPrintableHtml(content, zip, renderDir);
    const htmlPath = path.join(renderDir, 'combined.html');
    await fsp.writeFile(htmlPath, html);
    await printHtmlToPdf(htmlPath, outputPath);
  } finally {
    await fsp.rm(renderDir, { recursive: true, force: true });
  }
}
