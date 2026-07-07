# EPUB to PDF

A small web app for converting one `.epub` file into one `.pdf` file.

## Requirements

- Node.js 18 or newer
- Optional: Calibre for higher-fidelity EPUB layout conversion

The app works without Calibre by using a built-in Chromium-based EPUB-to-PDF fallback. That fallback renders chapter HTML, CSS, images, SVG, and Unicode text before printing to PDF, so it handles Russian/Cyrillic text and normal EPUB graphics much better than a text-only converter. If Calibre is installed, the app still prefers Calibre's `ebook-convert` command because it can preserve complex EPUB layout more faithfully.

On macOS, installing Calibre in `/Applications` is enough for the app to find it. On Windows or Linux, make sure `ebook-convert` is on your `PATH`, or set `EBOOK_CONVERT_PATH` to the full command path.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`, choose or drop an EPUB file, and convert it.

## Development

```bash
npm test
npm run dev
```
