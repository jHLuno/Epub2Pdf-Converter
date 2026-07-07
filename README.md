# Epub2Pdf-Converter

A small web app for converting one `.epub` file into one `.pdf` file. Because a lot of converters don't work properly with some types of books. Check it here (https://epub2pdf.up.railway.app/)

## Requirements

- Node.js 18 or newer
- Optional: Calibre for higher-fidelity EPUB layout conversion

The app works without Calibre by using a built-in Chromium-based EPUB-to-PDF fallback. Reflowable EPUBs are rendered as normal PDF pages with selectable text where possible. Fixed-layout EPUBs, such as InDesign textbook exports, are rendered page-by-page as high-fidelity screenshots and assembled into a PDF so graphics, absolute positioning, and Cyrillic text stay visually intact. Those fixed-layout PDFs are larger and are not searchable until an OCR layer is added.

If Calibre is installed, the app still prefers Calibre's `ebook-convert` command because it can preserve some EPUBs more efficiently. If Calibre fails, the built-in renderer is used as a fallback.

On macOS, installing Calibre in `/Applications` is enough for the app to find it. On Windows or Linux, make sure `ebook-convert` is on your `PATH`, or set `EBOOK_CONVERT_PATH` to the full command path.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`, choose or drop an EPUB file, and convert it.

Uploads are stored temporarily on disk during conversion. The default upload limit is 30 MB. Set `MAX_FILE_SIZE_MB` to change it for your deployment.

## Development

```bash
npm test
npm run dev
```
