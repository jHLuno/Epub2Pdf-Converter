# EPUB to PDF Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive single-purpose web app that uploads one EPUB file, converts it on a Node.js server, and downloads the resulting PDF.

**Architecture:** Express serves static frontend files and exposes `POST /convert` for one-file conversion. Conversion logic lives in small modules so validation, converter discovery, and conversion command execution can be tested independently. Temporary upload/output files are isolated per request and cleaned up after the response.

**Tech Stack:** Node.js, Express, Multer, Vitest, Supertest, HTML, CSS, vanilla JavaScript, Calibre `ebook-convert`.

---

## File Structure

- Create `package.json`: scripts and dependencies.
- Create `src/fileValidation.js`: `.epub` upload validation.
- Create `src/converter.js`: find `ebook-convert` and run conversion.
- Create `src/server.js`: Express app, static hosting, upload endpoint, cleanup.
- Create `public/index.html`: single-page converter UI.
- Create `public/styles.css`: responsive layout and polished states.
- Create `public/app.js`: file selection, drag/drop, submit, download handling.
- Create `test/fileValidation.test.js`: validation tests.
- Create `test/converter.test.js`: converter discovery and command tests.
- Create `test/server.test.js`: endpoint behavior tests.
- Create `README.md`: install, run, and Calibre setup notes.

## Task 1: Project Baseline

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create package metadata**

```json
{
  "name": "epub-to-pdf",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize Node app"
```

## Task 2: File Validation

**Files:**
- Create: `src/fileValidation.js`
- Create: `test/fileValidation.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest';
import { isEpubUpload, sanitizeBaseName } from '../src/fileValidation.js';

describe('isEpubUpload', () => {
  it('accepts files with an epub extension', () => {
    expect(isEpubUpload({ originalname: 'Book.epub' })).toBe(true);
  });

  it('rejects missing files and non-epub files', () => {
    expect(isEpubUpload(undefined)).toBe(false);
    expect(isEpubUpload({ originalname: 'Book.pdf' })).toBe(false);
  });
});

describe('sanitizeBaseName', () => {
  it('creates a safe pdf base name from an uploaded file name', () => {
    expect(sanitizeBaseName('My Book!.epub')).toBe('My_Book');
    expect(sanitizeBaseName('../bad.epub')).toBe('bad');
    expect(sanitizeBaseName('***.epub')).toBe('converted-book');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/fileValidation.test.js`
Expected: FAIL because `src/fileValidation.js` does not exist.

- [ ] **Step 3: Implement validation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/fileValidation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fileValidation.js test/fileValidation.test.js
git commit -m "feat: add EPUB upload validation"
```

## Task 3: Converter Discovery And Execution

**Files:**
- Create: `src/converter.js`
- Create: `test/converter.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, expect, it, vi } from 'vitest';
import { findConverterCommand, runEbookConvert } from '../src/converter.js';

describe('findConverterCommand', () => {
  it('prefers an explicit converter path', () => {
    expect(findConverterCommand({ env: { EBOOK_CONVERT_PATH: '/tmp/ebook-convert' }, platform: 'linux' })).toBe('/tmp/ebook-convert');
  });

  it('uses the Calibre app path on macOS when no explicit path is set', () => {
    expect(findConverterCommand({ env: {}, platform: 'darwin' })).toBe('/Applications/calibre.app/Contents/MacOS/ebook-convert');
  });

  it('falls back to ebook-convert on other platforms', () => {
    expect(findConverterCommand({ env: {}, platform: 'win32' })).toBe('ebook-convert');
  });
});

describe('runEbookConvert', () => {
  it('resolves when ebook-convert exits successfully', async () => {
    const spawn = vi.fn(() => ({
      stderr: { on: vi.fn() },
      on(event, callback) {
        if (event === 'close') callback(0);
      }
    }));

    await expect(runEbookConvert('/in.epub', '/out.pdf', { spawn, command: 'ebook-convert' })).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith('ebook-convert', ['/in.epub', '/out.pdf'], { stdio: ['ignore', 'ignore', 'pipe'] });
  });

  it('rejects with setup guidance when the command is missing', async () => {
    const spawn = vi.fn(() => {
      const handlers = {};
      return {
        stderr: { on: vi.fn() },
        on(event, callback) {
          handlers[event] = callback;
          if (event === 'error') callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        }
      };
    });

    await expect(runEbookConvert('/in.epub', '/out.pdf', { spawn, command: 'missing' })).rejects.toThrow('Install Calibre');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/converter.test.js`
Expected: FAIL because `src/converter.js` does not exist.

- [ ] **Step 3: Implement converter module**

```js
import { spawn as defaultSpawn } from 'node:child_process';

export function findConverterCommand({ env = process.env, platform = process.platform } = {}) {
  if (env.EBOOK_CONVERT_PATH) {
    return env.EBOOK_CONVERT_PATH;
  }

  if (platform === 'darwin') {
    return '/Applications/calibre.app/Contents/MacOS/ebook-convert';
  }

  return 'ebook-convert';
}

export function runEbookConvert(inputPath, outputPath, { spawn = defaultSpawn, command = findConverterCommand() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [inputPath, outputPath], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';
    let settled = false;

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;

      if (error.code === 'ENOENT') {
        reject(new Error('Install Calibre and make sure ebook-convert is available, or set EBOOK_CONVERT_PATH.'));
        return;
      }

      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ebook-convert exited with code ${code}`));
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/converter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/converter.js test/converter.test.js
git commit -m "feat: add Calibre conversion runner"
```

## Task 4: Express Conversion Endpoint

**Files:**
- Create: `src/server.js`
- Create: `test/server.test.js`

- [ ] **Step 1: Write failing endpoint tests**

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server.js';

let tmpRoot;

afterEach(async () => {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  }
});

async function makeFixture(name, content = 'fixture') {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-test-'));
  const filePath = path.join(tmpRoot, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('POST /convert', () => {
  it('rejects requests without a file', async () => {
    const app = createApp({ convert: vi.fn() });
    const response = await request(app).post('/convert');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Choose an EPUB');
  });

  it('rejects non-epub uploads', async () => {
    const fixture = await makeFixture('book.txt');
    const app = createApp({ convert: vi.fn() });
    const response = await request(app).post('/convert').attach('book', fixture);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('.epub');
  });

  it('returns a pdf attachment after conversion', async () => {
    const fixture = await makeFixture('book.epub');
    const convert = vi.fn(async (_input, output) => {
      await fs.writeFile(output, '%PDF-1.4\n');
    });
    const app = createApp({ convert });

    const response = await request(app).post('/convert').attach('book', fixture);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('book.pdf');
    expect(response.body.toString()).toContain('%PDF-1.4');
    expect(convert).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/server.test.js`
Expected: FAIL because `src/server.js` does not exist.

- [ ] **Step 3: Implement Express app**

```js
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
      res.download(outputPath, `${baseName}.pdf`, async (error) => {
        await fs.rm(workDir, { recursive: true, force: true });
        if (error && !res.headersSent) {
          res.status(500).json({ error: 'Could not send the converted PDF.' });
        }
      });
    } catch (error) {
      await fs.rm(workDir, { recursive: true, force: true });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/server.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "feat: add conversion endpoint"
```

## Task 5: Responsive Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] **Step 1: Create single-page UI**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>EPUB to PDF</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="shell">
      <section class="converter" aria-labelledby="title">
        <div class="intro">
          <p class="eyebrow">EPUB to PDF</p>
          <h1 id="title">Convert an EPUB into a PDF.</h1>
        </div>

        <form id="convertForm" class="panel">
          <input id="fileInput" class="file-input" name="book" type="file" accept=".epub,application/epub+zip">
          <label id="dropZone" class="drop-zone" for="fileInput">
            <span class="drop-icon" aria-hidden="true">PDF</span>
            <span class="drop-title">Drop your EPUB here</span>
            <span class="drop-copy">or tap to choose a file</span>
          </label>

          <div class="file-row">
            <span id="fileName" class="file-name">No file selected</span>
            <button id="clearButton" class="text-button" type="button" hidden>Clear</button>
          </div>

          <button id="convertButton" class="primary-button" type="submit" disabled>Convert to PDF</button>
          <p id="status" class="status" role="status" aria-live="polite"></p>
        </form>
      </section>
    </main>
    <script src="/app.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 2: Add responsive CSS**

```css
:root {
  color-scheme: light;
  --ink: #171717;
  --muted: #66615a;
  --line: #d7d0c6;
  --paper: #fbfaf7;
  --panel: #ffffff;
  --accent: #0f766e;
  --accent-dark: #0b554f;
  --danger: #b42318;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  color: var(--ink);
  background:
    linear-gradient(90deg, rgba(23, 23, 23, 0.04) 1px, transparent 1px),
    linear-gradient(180deg, rgba(23, 23, 23, 0.04) 1px, transparent 1px),
    var(--paper);
  background-size: 34px 34px;
}

button,
input {
  font: inherit;
}

.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
}

.converter {
  width: min(100%, 720px);
}

.intro {
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--accent-dark);
  font: 700 0.78rem/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 11ch;
  font-size: clamp(2.8rem, 9vw, 6.5rem);
  line-height: 0.9;
  letter-spacing: 0;
}

.panel {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 80px rgba(23, 23, 23, 0.1);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.drop-zone {
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 24px;
  border: 2px dashed var(--line);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
}

.drop-zone.is-dragging,
.drop-zone:hover {
  border-color: var(--accent);
  background: rgba(15, 118, 110, 0.07);
  transform: translateY(-1px);
}

.drop-icon {
  display: grid;
  place-items: center;
  width: 70px;
  height: 82px;
  margin-bottom: 18px;
  border: 2px solid var(--ink);
  border-radius: 5px;
  font: 800 1rem/1 ui-sans-serif, system-ui, sans-serif;
  color: var(--accent-dark);
}

.drop-title {
  display: block;
  font-size: 1.45rem;
  font-weight: 700;
}

.drop-copy,
.file-name,
.status {
  color: var(--muted);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
}

.file-name {
  overflow-wrap: anywhere;
}

.text-button {
  border: 0;
  background: transparent;
  color: var(--accent-dark);
  cursor: pointer;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
}

.primary-button {
  min-height: 52px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: 800 1rem/1 ui-sans-serif, system-ui, sans-serif;
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.status {
  min-height: 24px;
  margin: 0;
}

.status.is-error {
  color: var(--danger);
}

@media (max-width: 560px) {
  .shell {
    align-items: start;
    padding: 18px;
  }

  h1 {
    max-width: 9ch;
  }

  .panel {
    padding: 14px;
  }

  .drop-zone {
    min-height: 190px;
  }
}
```

- [ ] **Step 3: Add browser upload behavior**

```js
const form = document.querySelector('#convertForm');
const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const fileName = document.querySelector('#fileName');
const clearButton = document.querySelector('#clearButton');
const convertButton = document.querySelector('#convertButton');
const statusText = document.querySelector('#status');

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle('is-error', isError);
}

function setFile(file) {
  if (!file) {
    fileName.textContent = 'No file selected';
    clearButton.hidden = true;
    convertButton.disabled = true;
    setStatus('');
    return;
  }

  fileName.textContent = file.name;
  clearButton.hidden = false;
  convertButton.disabled = false;
  setStatus('Ready to convert.');
}

function selectedFile() {
  return fileInput.files?.[0];
}

fileInput.addEventListener('change', () => {
  setFile(selectedFile());
});

clearButton.addEventListener('click', () => {
  fileInput.value = '';
  setFile(null);
});

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
}

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  setFile(file);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = selectedFile();
  if (!file) {
    setStatus('Choose an EPUB file first.', true);
    return;
  }

  if (!file.name.toLowerCase().endsWith('.epub')) {
    setStatus('Only .epub files can be converted.', true);
    return;
  }

  convertButton.disabled = true;
  setStatus('Converting...');

  const body = new FormData();
  body.append('book', file);

  try {
    const response = await fetch('/convert', {
      method: 'POST',
      body
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Conversion failed.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name.replace(/\.epub$/i, '.pdf');
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('PDF downloaded.');
  } catch (error) {
    setStatus(error.message || 'Conversion failed.', true);
  } finally {
    convertButton.disabled = false;
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: add converter interface"
```

## Task 6: Documentation And Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add README**

```md
# EPUB to PDF

A small web app for converting one `.epub` file into one `.pdf` file.

## Requirements

- Node.js 18 or newer
- Calibre, including the `ebook-convert` command

On macOS, installing Calibre in `/Applications` is enough for the app to find it. On Windows or Linux, make sure `ebook-convert` is on your `PATH`, or set `EBOOK_CONVERT_PATH` to the full command path.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`, choose an EPUB file, and convert it.

## Development

```bash
npm test
npm run dev
```
```

- [ ] **Step 2: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Start server**

Run: `npm start`
Expected: server prints `EPUB to PDF converter running at http://localhost:3000`.

- [ ] **Step 4: Confirm local page response**

Run: `curl -I http://localhost:3000`
Expected: HTTP 200 response with `Content-Type: text/html`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add run instructions"
```

## Self-Review

- Spec coverage: Tasks cover the one-page UI, upload/manual picker, drag-and-drop, mobile responsiveness, backend conversion endpoint, Calibre command usage, validation, error handling, tests, and run documentation.
- Placeholder scan: The plan contains no placeholder markers or unspecified implementation steps.
- Type consistency: `isEpubUpload`, `sanitizeBaseName`, `findConverterCommand`, `runEbookConvert`, and `createApp` names match across tests and implementation steps.
